const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3850;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DB_STORE_PATH = path.join(__dirname, 'database', 'local_store.json');
const SEED_PATH = path.join(__dirname, 'database', 'seed_data.json');
const SSMS_SCHEMA_PATH = path.join(__dirname, 'database', 'ssms_schema.sql');

// Initialize persistent store from seed_data.json if local_store.json doesn't exist
function loadStore() {
  try {
    if (!fs.existsSync(DB_STORE_PATH)) {
      const seed = fs.readFileSync(SEED_PATH, 'utf-8');
      fs.writeFileSync(DB_STORE_PATH, seed, 'utf-8');
      return JSON.parse(seed);
    }
    return JSON.parse(fs.readFileSync(DB_STORE_PATH, 'utf-8'));
  } catch (err) {
    console.error('Error loading store:', err);
    return JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  }
}

function saveStore(data) {
  fs.writeFileSync(DB_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

let sqlPool = null;
let sqlConnectionState = {
  connected: false,
  mode: 'Local SQL Mirror + SSMS Ready (Click "Connect / Sync SSMS" in SQL Settings)',
  lastAttempt: null,
  error: null
};

async function tryConnectMSSQL(customConfig) {
  const store = loadStore();
  const cfg = customConfig || store.dbConfig || {};
  sqlConnectionState.lastAttempt = new Date().toISOString();

  try {
    const mssqlConfig = {
      user: cfg.user || 'sa',
      password: cfg.password || '',
      server: (cfg.server || 'localhost').split('\\')[0],
      database: cfg.database || 'MatrixFactoryDB',
      port: Number(cfg.port) || 1433,
      options: {
        encrypt: Boolean(cfg.encrypt),
        trustServerCertificate: true,
        instanceName: (cfg.server && cfg.server.includes('\\')) ? cfg.server.split('\\')[1] : undefined
      },
      connectionTimeout: 3500
    };

    if (sqlPool) {
      await sqlPool.close();
    }
    sqlPool = await sql.connect(mssqlConfig);
    sqlConnectionState = {
      connected: true,
      mode: `Connected Live to MS SQL Server (${cfg.server} -> ${cfg.database})`,
      lastAttempt: new Date().toISOString(),
      error: null
    };
    return { success: true, state: sqlConnectionState };
  } catch (err) {
    sqlPool = null;
    sqlConnectionState = {
      connected: false,
      mode: 'Hybrid SSMS Mode (Auto-persisted locally & ready for SSMS SQL Server execution)',
      lastAttempt: new Date().toISOString(),
      error: err.message
    };
    return { success: false, state: sqlConnectionState, error: err.message };
  }
}

// Generate complete T-SQL Script including Schema + Current Live Data for SSMS
function generateFullSSMSScript(store) {
  const baseSchema = fs.existsSync(SSMS_SCHEMA_PATH)
    ? fs.readFileSync(SSMS_SCHEMA_PATH, 'utf-8')
    : '-- Schema file missing';

  const esc = (val) => {
    if (val === null || val === undefined) return 'NULL';
    return `N'${String(val).replace(/'/g, "''")}'`;
  };

  let dataInserts = `\n\n-- =============================================================================\n`;
  dataInserts += `-- LIVE APPLICATION DATA SYNC FOR MICROSOFT SQL SERVER MANAGEMENT STUDIO (SSMS)\n`;
  dataInserts += `-- Generated At: ${new Date().toISOString()}\n`;
  dataInserts += `-- =============================================================================\n\n`;
  dataInserts += `USE [MatrixFactoryDB];\nGO\n\n`;

  // Factories
  dataInserts += `-- Sync Factories\n`;
  for (const f of store.factories) {
    dataInserts += `IF NOT EXISTS (SELECT 1 FROM dbo.Factories WHERE Name = ${esc(f.Name)})\n`;
    dataInserts += `INSERT INTO dbo.Factories (Name, Code, Specialization, Capabilities, Certifications, Country, City, Address, Website, Rating, Status, Notes)\n`;
    dataInserts += `VALUES (${esc(f.Name)}, ${esc(f.Code)}, ${esc(f.Specialization)}, ${esc(f.Capabilities)}, ${esc(f.Certifications)}, ${esc(f.Country)}, ${esc(f.City)}, ${esc(f.Address)}, ${esc(f.Website)}, ${Number(f.Rating) || 5}, ${esc(f.Status)}, ${esc(f.Notes)});\n\n`;
  }

  // Contacts
  dataInserts += `-- Sync Shared Contacts\n`;
  for (const c of store.contacts) {
    dataInserts += `IF NOT EXISTS (SELECT 1 FROM dbo.Contacts WHERE FullName = ${esc(c.FullName)} AND Phone = ${esc(c.Phone)})\n`;
    dataInserts += `INSERT INTO dbo.Contacts (FactoryId, FullName, JobTitle, Department, CompanyName, Email, Phone, MobilePhone, WhatsApp, VisibilityLevel, Source, Tags, Notes)\n`;
    dataInserts += `VALUES (${c.FactoryId ? Number(c.FactoryId) : 'NULL'}, ${esc(c.FullName)}, ${esc(c.JobTitle)}, ${esc(c.Department)}, ${esc(c.CompanyName)}, ${esc(c.Email)}, ${esc(c.Phone)}, ${esc(c.MobilePhone)}, ${esc(c.WhatsApp)}, ${esc(c.VisibilityLevel)}, ${esc(c.Source)}, ${esc(c.Tags)}, ${esc(c.Notes)});\n\n`;
  }

  // Products
  dataInserts += `-- Sync Products & Datasheet Specs\n`;
  for (const p of store.products) {
    const specJson = JSON.stringify(p.Specifications || {});
    const featJson = JSON.stringify(p.Features || []);
    dataInserts += `IF NOT EXISTS (SELECT 1 FROM dbo.Products WHERE SKU = ${esc(p.SKU)})\n`;
    dataInserts += `INSERT INTO dbo.Products (FactoryId, SKU, Name, Series, Category, Summary, SpecificationsJSON, FeaturesJSON, ComplianceStandards, BaseFactoryCost, Currency, WarrantyMonths, Revision)\n`;
    dataInserts += `VALUES (${p.FactoryId ? Number(p.FactoryId) : 'NULL'}, ${esc(p.SKU)}, ${esc(p.Name)}, ${esc(p.Series)}, ${esc(p.Category)}, ${esc(p.Summary)}, ${esc(specJson)}, ${esc(featJson)}, ${esc(p.ComplianceStandards)}, ${Number(p.BaseFactoryCost) || 0}, ${esc(p.Currency || 'USD')}, ${Number(p.WarrantyMonths) || 24}, ${esc(p.Revision || 'Rev 1.0')});\n\n`;
  }

  // AI Feedback Rules
  dataInserts += `-- Sync AI Tender Feedback Rules\n`;
  for (const r of store.aiFeedbackRules) {
    dataInserts += `IF NOT EXISTS (SELECT 1 FROM dbo.AIFeedbackRules WHERE PatternOrTopic = ${esc(r.PatternOrTopic)})\n`;
    dataInserts += `INSERT INTO dbo.AIFeedbackRules (PatternOrTopic, Category, LearnedAction, Reason, TimesApplied, CreatedByUserName)\n`;
    dataInserts += `VALUES (${esc(r.PatternOrTopic)}, ${esc(r.Category)}, ${esc(r.LearnedAction)}, ${esc(r.Reason)}, ${Number(r.TimesApplied) || 1}, ${esc(r.CreatedByUserName)});\n\n`;
  }

  // Competitor Prices
  dataInserts += `-- Sync Historical Competitor Prices\n`;
  for (const cp of store.competitorPrices) {
    dataInserts += `IF NOT EXISTS (SELECT 1 FROM dbo.CompetitorPrices WHERE TenderReference = ${esc(cp.TenderReference)} AND CompetitorName = ${esc(cp.CompetitorName)} AND ItemDescription = ${esc(cp.ItemDescription)})\n`;
    dataInserts += `INSERT INTO dbo.CompetitorPrices (TenderReference, TenderClient, ItemCategory, ItemDescription, NormalizedSpecs, CompetitorName, FactoryOrigin, QuotedUnitPrice, OurQuotedUnitPrice, Currency, WasWinningBid, BidDate)\n`;
    dataInserts += `VALUES (${esc(cp.TenderReference)}, ${esc(cp.TenderClient)}, ${esc(cp.ItemCategory)}, ${esc(cp.ItemDescription)}, ${esc(cp.NormalizedSpecs)}, ${esc(cp.CompetitorName)}, ${esc(cp.FactoryOrigin)}, ${Number(cp.QuotedUnitPrice) || 0}, ${Number(cp.OurQuotedUnitPrice) || 0}, ${esc(cp.Currency || 'USD')}, ${cp.WasWinningBid ? 1 : 0}, ${esc(cp.BidDate || '2025-01-01')});\n\n`;
  }

  // Market Factors
  dataInserts += `-- Sync Market Factors (Inflation, Shipping, Customs, Raw Materials)\n`;
  for (const mf of store.marketFactors) {
    dataInserts += `IF NOT EXISTS (SELECT 1 FROM dbo.MarketFactors WHERE FactorCode = ${esc(mf.FactorCode)})\n`;
    dataInserts += `INSERT INTO dbo.MarketFactors (FactorCode, FactorName, Category, PercentageRate, Description)\n`;
    dataInserts += `VALUES (${esc(mf.FactorCode)}, ${esc(mf.FactorName)}, ${esc(mf.Category)}, ${Number(mf.PercentageRate) || 0}, ${esc(mf.Description)});\n\n`;
  }

  dataInserts += `GO\n`;
  return baseSchema + dataInserts;
}

// =============================================================================
// API ROUTES
// =============================================================================

// Get full bootstrap state
app.get('/api/bootstrap', (req, res) => {
  const store = loadStore();
  res.json({
    ...store,
    sqlConnectionState
  });
});

// Reset to factory seed data
app.post('/api/reset-seed', (req, res) => {
  const seed = fs.readFileSync(SEED_PATH, 'utf-8');
  fs.writeFileSync(DB_STORE_PATH, seed, 'utf-8');
  res.json({ success: true, store: JSON.parse(seed) });
});

// -----------------------------------------------------------------------------
// 1. FACTORIES DIRECTORY API
// -----------------------------------------------------------------------------
app.post('/api/factories', (req, res) => {
  const store = loadStore();
  const newFactory = {
    Id: store.factories.length ? Math.max(...store.factories.map(f => f.Id)) + 1 : 1,
    Name: req.body.Name || 'Unnamed Factory',
    Code: req.body.Code || `FAC-${Date.now().toString().slice(-4)}`,
    Specialization: req.body.Specialization || '',
    Capabilities: req.body.Capabilities || '',
    Certifications: req.body.Certifications || '',
    Country: req.body.Country || 'Saudi Arabia',
    City: req.body.City || '',
    Address: req.body.Address || '',
    Website: req.body.Website || '',
    Rating: Number(req.body.Rating) || 5,
    Status: req.body.Status || 'Active Partner',
    Notes: req.body.Notes || ''
  };
  store.factories.unshift(newFactory);
  saveStore(store);
  res.json(newFactory);
});

app.put('/api/factories/:id', (req, res) => {
  const store = loadStore();
  const id = Number(req.params.id);
  const idx = store.factories.findIndex(f => f.Id === id);
  if (idx === -1) return res.status(404).json({ error: 'Factory not found' });
  store.factories[idx] = { ...store.factories[idx], ...req.body, Id: id };
  saveStore(store);
  res.json(store.factories[idx]);
});

app.delete('/api/factories/:id', (req, res) => {
  const store = loadStore();
  const id = Number(req.params.id);
  store.factories = store.factories.filter(f => f.Id !== id);
  saveStore(store);
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 2. SHARED CONTACTS & PHONE VCARD (.VCF) IMPORT/EXPORT API
// -----------------------------------------------------------------------------
app.post('/api/contacts', (req, res) => {
  const store = loadStore();
  const newContact = {
    Id: store.contacts.length ? Math.max(...store.contacts.map(c => c.Id)) + 1 : 1,
    FactoryId: req.body.FactoryId ? Number(req.body.FactoryId) : null,
    FullName: req.body.FullName || 'Unnamed Contact',
    JobTitle: req.body.JobTitle || '',
    Department: req.body.Department || '',
    CompanyName: req.body.CompanyName || '',
    Email: req.body.Email || '',
    Phone: req.body.Phone || '',
    MobilePhone: req.body.MobilePhone || '',
    WhatsApp: req.body.WhatsApp || req.body.MobilePhone || req.body.Phone || '',
    VisibilityLevel: req.body.VisibilityLevel || 'Public',
    Source: req.body.Source || 'Manual',
    Tags: req.body.Tags || '',
    Notes: req.body.Notes || ''
  };
  store.contacts.unshift(newContact);
  saveStore(store);
  res.json(newContact);
});

app.post('/api/contacts/bulk-import', (req, res) => {
  const store = loadStore();
  const incoming = Array.isArray(req.body.contacts) ? req.body.contacts : [];
  let maxId = store.contacts.length ? Math.max(...store.contacts.map(c => c.Id)) : 0;
  const added = [];

  for (const item of incoming) {
    maxId += 1;
    const contact = {
      Id: maxId,
      FactoryId: item.FactoryId ? Number(item.FactoryId) : null,
      FullName: item.FullName || 'Phone Contact',
      JobTitle: item.JobTitle || '',
      Department: item.Department || '',
      CompanyName: item.CompanyName || '',
      Email: item.Email || '',
      Phone: item.Phone || item.MobilePhone || '',
      MobilePhone: item.MobilePhone || item.Phone || '',
      WhatsApp: (item.MobilePhone || item.Phone || '').replace(/\s+/g, ''),
      VisibilityLevel: item.VisibilityLevel || 'Public',
      Source: item.Source || 'Phone_vCard_Import',
      Tags: item.Tags || 'Phone Import',
      Notes: item.Notes || 'Imported from mobile phone contact file'
    };
    store.contacts.unshift(contact);
    added.push(contact);
  }
  saveStore(store);
  res.json({ addedCount: added.length, contacts: added });
});

app.delete('/api/contacts/:id', (req, res) => {
  const store = loadStore();
  const id = Number(req.params.id);
  store.contacts = store.contacts.filter(c => c.Id !== id);
  saveStore(store);
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 3. PRODUCTS & DATASHEET PDF GENERATOR API
// -----------------------------------------------------------------------------
app.post('/api/products', (req, res) => {
  const store = loadStore();
  const newProduct = {
    Id: store.products.length ? Math.max(...store.products.map(p => p.Id)) + 1 : 1,
    FactoryId: req.body.FactoryId ? Number(req.body.FactoryId) : 1,
    SKU: req.body.SKU || `MTX-PRD-${Date.now().toString().slice(-4)}`,
    Name: req.body.Name || 'New Matrix Product',
    Series: req.body.Series || 'Matrix Industrial Series',
    Category: req.body.Category || 'Industrial Equipment',
    Summary: req.body.Summary || '',
    Specifications: req.body.Specifications || {},
    Features: Array.isArray(req.body.Features) ? req.body.Features : [],
    ComplianceStandards: req.body.ComplianceStandards || 'ISO 9001, IEC, SASO',
    BaseFactoryCost: Number(req.body.BaseFactoryCost) || 0,
    Currency: req.body.Currency || 'USD',
    WarrantyMonths: Number(req.body.WarrantyMonths) || 24,
    Revision: req.body.Revision || 'Rev 1.0'
  };
  store.products.unshift(newProduct);
  saveStore(store);
  res.json(newProduct);
});

app.put('/api/products/:id', (req, res) => {
  const store = loadStore();
  const id = Number(req.params.id);
  const idx = store.products.findIndex(p => p.Id === id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });
  store.products[idx] = { ...store.products[idx], ...req.body, Id: id };
  saveStore(store);
  res.json(store.products[idx]);
});

app.post('/api/datasheets/log', (req, res) => {
  const store = loadStore();
  const entry = {
    Id: store.datasheets.length ? Math.max(...store.datasheets.map(d => d.Id)) + 1 : 1,
    ProductId: Number(req.body.ProductId) || 1,
    DocumentCode: req.body.DocumentCode || `DS-MTX-${Date.now().toString().slice(-5)}`,
    Version: req.body.Version || 'Rev 1.0',
    TemplateStyle: req.body.TemplateStyle || 'Matrix Industrial Blue',
    CustomProjectName: req.body.CustomProjectName || '',
    CustomClientName: req.body.CustomClientName || '',
    GeneratedBy: req.body.GeneratedBy || 'Mohammed Al-Mansoor',
    GeneratedAt: new Date().toISOString()
  };
  store.datasheets.unshift(entry);
  saveStore(store);
  res.json(entry);
});

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// 3.5 TENDER TRACKER & PIPELINE CRUD API
// -----------------------------------------------------------------------------
app.get('/api/tenders', (req, res) => {
  const store = loadStore();
  res.json(store.tenders || []);
});

app.post('/api/tenders', (req, res) => {
  const store = loadStore();
  const newTender = {
    Id: store.tenders.length ? Math.max(...store.tenders.map(t => t.Id)) + 1 : 1,
    ReferenceNumber: req.body.ReferenceNumber || `TND-2026-${Math.floor(100 + Math.random() * 900)}`,
    Title: req.body.Title || 'Untitled Tender',
    ClientName: req.body.ClientName || 'Unspecified Client',
    Country: req.body.Country || 'Jordan',
    FileName: req.body.FileName || '',
    SubmissionDeadline: req.body.SubmissionDeadline || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    Status: req.body.Status || 'Drafting',
    Currency: req.body.Currency || 'USD',
    TotalEstimatedValue: Number(req.body.TotalEstimatedValue) || 0,
    BidBond: req.body.BidBond || '5% Bank Guarantee',
    AssignedLead: req.body.AssignedLead || 'Mohammed',
    Notes: req.body.Notes || '',
    Extractions: []
  };
  store.tenders.unshift(newTender);
  saveStore(store);
  res.json(newTender);
});

app.put('/api/tenders/:id', (req, res) => {
  const store = loadStore();
  const id = Number(req.params.id);
  const idx = store.tenders.findIndex(t => t.Id === id);
  if (idx === -1) return res.status(404).json({ error: 'Tender not found' });
  store.tenders[idx] = { ...store.tenders[idx], ...req.body, Id: id };
  saveStore(store);
  res.json(store.tenders[idx]);
});

app.delete('/api/tenders/:id', (req, res) => {
  const store = loadStore();
  const id = Number(req.params.id);
  store.tenders = store.tenders.filter(t => t.Id !== id);
  saveStore(store);
  res.json({ success: true });
});

// 4. AI TENDER ANALYZER & FEEDBACK LEARNING ENGINE (Placeholder + Rule Learner)
// -----------------------------------------------------------------------------
app.post('/api/tenders/analyze', (req, res) => {
  const store = loadStore();
  const { title, clientName, referenceNumber, rawText, customQuestion } = req.body;

  // Use stored AI feedback rules to classify extracted items as Important or NotNeeded
  const importantRules = store.aiFeedbackRules.filter(r => r.LearnedAction === 'FlagImportant');
  const ignoreRules = store.aiFeedbackRules.filter(r => r.LearnedAction === 'FlagNotNeeded');

  const lines = (rawText || '')
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 18);

  const generatedExtractions = [];
  let extId = Date.now();

  if (lines.length > 0) {
    lines.slice(0, 10).forEach((line, index) => {
      const lower = line.toLowerCase();
      let category = 'Technical Spec';
      let importance = 'Normal';
      let note = 'Extracted by Matrix AI Tender Parser (Placeholder Mode)';

      if (lower.includes('penalty') || lower.includes('liquidated') || lower.includes('bond') || lower.includes('delay') || lower.includes('warranty')) {
        category = 'Penalty / LD';
        importance = 'Important';
        note = 'Auto-flagged IMPORTANT based on learned rule: Financial & LD clauses impact margin.';
      } else if (lower.includes('kv') || lower.includes('ka') || lower.includes('ip54') || lower.includes('ip65') || lower.includes('ss316') || lower.includes('iec') || lower.includes('copper') || lower.includes('form 4') || lower.includes('pump') || lower.includes('transformer')) {
        category = 'Technical Spec';
        importance = 'Important';
        note = 'Auto-flagged IMPORTANT based on learned rule: Core electrical/mechanical rating.';
      } else if (lower.includes('parking') || lower.includes('cafeteria') || lower.includes('stationery') || lower.includes('visitor') || lower.includes('uniform')) {
        category = 'General Boilerplate';
        importance = 'NotNeeded';
        note = 'Auto-flagged NOT NEEDED based on learned rule: Administrative site boilerplate.';
      }

      // Check custom user-trained rules
      for (const rule of importantRules) {
        const keywords = rule.PatternOrTopic.toLowerCase().split(/[\s,&/]+/).filter(k => k.length > 3);
        if (keywords.some(k => lower.includes(k))) {
          importance = 'Important';
          note = `Matched Learned Rule #${rule.Id}: "${rule.PatternOrTopic}"`;
        }
      }
      for (const rule of ignoreRules) {
        const keywords = rule.PatternOrTopic.toLowerCase().split(/[\s,&/]+/).filter(k => k.length > 3);
        if (keywords.some(k => lower.includes(k))) {
          importance = 'NotNeeded';
          note = `Suppressed by Learned Rule #${rule.Id}: "${rule.PatternOrTopic}"`;
        }
      }

      generatedExtractions.push({
        Id: extId + index,
        Category: category,
        RequirementTitle: line.length > 68 ? line.slice(0, 68) + '...' : line,
        ExtractedDetail: line,
        PageReference: `Parsed Clause #${index + 1}`,
        AIConfidence: 88 + (index % 11),
        ImportanceFlag: importance,
        UserFeedbackNote: note,
        VerifiedByUser: false
      });
    });
  } else {
    generatedExtractions.push(
      {
        Id: extId + 1,
        Category: 'Technical Spec',
        RequirementTitle: 'Mandatory IEC / ISO Type Test & Material Compliance',
        ExtractedDetail: 'All offered equipment must include OEM routine & type test certificates and comply with tropicalized 55°C ambient derating.',
        PageReference: 'Section 3.1, Page 22',
        AIConfidence: 95,
        ImportanceFlag: 'Important',
        UserFeedbackNote: 'Flagged by AI Placeholder Engine using 4 active learning rules.',
        VerifiedByUser: false
      },
      {
        Id: extId + 2,
        Category: 'Commercial & LD',
        RequirementTitle: 'Delivery Schedule & Liquidated Damages Cap',
        ExtractedDetail: 'Delivery required within 16 weeks DDP Project Site. Delay penalty of 1% per week up to 10% maximum.',
        PageReference: 'Section 1.8, Page 11',
        AIConfidence: 93,
        ImportanceFlag: 'Important',
        UserFeedbackNote: 'Matched Learned Rule: Penalty / LD & Delivery Risk.',
        VerifiedByUser: false
      }
    );
  }

  const newTender = {
    Id: store.tenders.length ? Math.max(...store.tenders.map(t => t.Id)) + 1 : 1,
    ReferenceNumber: referenceNumber || `TND-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    Title: title || 'New Uploaded Tender Package',
    ClientName: clientName || 'Industrial Project Client',
    Country: 'Saudi Arabia',
    FileName: req.body.fileName || 'Uploaded_Tender_Spec.pdf',
    SubmissionDeadline: new Date(Date.now() + 21 * 86400000).toISOString(),
    Status: 'Analyzing',
    Currency: 'USD',
    TotalEstimatedValue: 0,
    CustomQuestionAnswer: customQuestion
      ? `[AI Placeholder Answer for "${customQuestion}"]: Based on the tender clauses and your ${store.aiFeedbackRules.length} trained company preferences, the critical compliance items are 55°C ambient rating, Form 4b / SS316 material specs, and a 10% max LD cap. Recommended factory match: Matrix Main Industrial Plant (Plant 01).`
      : null,
    Extractions: generatedExtractions
  };

  store.tenders.unshift(newTender);
  saveStore(store);
  res.json(newTender);
});

// -----------------------------------------------------------------------------
// 4.5 COMPETITOR & OEM BRAND EQUIVALENT MATCHER API
// -----------------------------------------------------------------------------
app.post('/api/tenders/find-equivalents', (req, res) => {
  const store = loadStore();
  const { tenderId, rawText, companies } = req.body;

  let textToAnalyze = rawText || '';
  if (!textToAnalyze && tenderId) {
    const t = store.tenders.find(x => x.Id === Number(tenderId));
    if (t) {
      textToAnalyze = (t.Title || '') + '\n' + (t.Extractions || []).map(e => e.RequirementTitle + ': ' + e.ExtractedDetail).join('\n');
    }
  }

  // Parse requested companies
  let requestedBrands = [];
  if (Array.isArray(companies)) {
    requestedBrands = companies.map(c => c.trim()).filter(Boolean);
  } else if (typeof companies === 'string' && companies.trim().length > 0) {
    requestedBrands = companies.split(/[,;&/\n]+/).map(c => c.trim()).filter(Boolean);
  }

  if (!requestedBrands.length) {
    requestedBrands = ['HP', 'Dell', 'Lenovo', 'Schneider Electric'];
  }

  const lowerText = (textToAnalyze || '').toLowerCase();
  const db = JSON.parse(fs.readFileSync('./database/competitor_equivalents.json', 'utf8'));

  // Detect which equipment categories are mentioned in the tender
  const detectedCategories = [];

  const hasPC = lowerText.includes('desktop') || lowerText.includes('computer') || lowerText.includes('tower') || lowerText.includes('pc') || lowerText.includes('q-series') || lowerText.includes('sff') || lowerText.includes('optiplex') || lowerText.includes('elitedesk') || lowerText.includes('thinkcentre') || lowerText.includes('core i5') || lowerText.includes('core i7');
  const hasWorkstation = lowerText.includes('workstation') || lowerText.includes('xeon') || lowerText.includes('threadripper') || lowerText.includes('precision') || lowerText.includes('thinkstation') || lowerText.includes('rtx 4000') || lowerText.includes('rtx a2000');
  const hasLaptop = lowerText.includes('laptop') || lowerText.includes('notebook') || lowerText.includes('techbook') || lowerText.includes('latitude') || lowerText.includes('probook') || lowerText.includes('elitebook') || lowerText.includes('thinkpad');
  const hasMonitor = lowerText.includes('monitor') || (lowerText.includes('screen') && (lowerText.includes('ips') || lowerText.includes('qhd') || lowerText.includes('fhd') || lowerText.includes('24') || lowerText.includes('27') || lowerText.includes('32') || lowerText.includes('ultrasharp')));
  const hasSmartScreen = lowerText.includes('interactive') || lowerText.includes('touch screen') || lowerText.includes('smart board') || lowerText.includes('flat panel') || lowerText.includes('promethean') || lowerText.includes('viewboard') || lowerText.includes('ops') || lowerText.includes('75') || lowerText.includes('86') || lowerText.includes('65');
  const hasUPS = lowerText.includes('ups') || lowerText.includes('double conversion') || lowerText.includes('online ups') || lowerText.includes('kva') || lowerText.includes('3-phase') || lowerText.includes('power system') || lowerText.includes('apc') || lowerText.includes('schneider') || lowerText.includes('vertiv') || lowerText.includes('eaton');
  const hasCCTV = lowerText.includes('cctv') || lowerText.includes('camera') || lowerText.includes('surveillance') || lowerText.includes('nvr') || lowerText.includes('hikvision') || lowerText.includes('dahua') || lowerText.includes('ip camera');
  const hasChargeCart = lowerText.includes('charge cart') || lowerText.includes('charging cart') || lowerText.includes('cart 36') || lowerText.includes('aver') || lowerText.includes('bretford');

  if (hasPC) detectedCategories.push('Personal Computers');
  if (hasWorkstation) detectedCategories.push('Workstations');
  if (hasLaptop) detectedCategories.push('Laptops');
  if (hasMonitor) detectedCategories.push('Monitors');
  if (hasSmartScreen) detectedCategories.push('Interactive Touch Screens');
  if (hasUPS) detectedCategories.push('UPS & Power Systems');
  if (hasCCTV) detectedCategories.push('CCTV & Surveillance');
  if (hasChargeCart) detectedCategories.push('Charge Carts & Accessories');

  // Fallback: If nothing specific matched, provide top 3 representative categories
  if (!detectedCategories.length) {
    detectedCategories.push('Personal Computers', 'UPS & Power Systems', 'Interactive Touch Screens');
  }

  const results = detectedCategories.map(cat => {
    const dbEntry = db[cat];
    if (!dbEntry) return null;

    const brandMatches = requestedBrands.map(inputBrand => {
      const brandKey = inputBrand.toLowerCase().replace(/[^a-z0-9]/g, '');
      let found = null;

      for (const [k, v] of Object.entries(dbEntry.brands)) {
        if (brandKey.includes(k) || k.includes(brandKey)) {
          found = v;
          break;
        }
      }

      if (!found) {
        if ((cat === 'UPS & Power Systems' || cat === 'CCTV & Surveillance') && (brandKey.includes('hp') || brandKey.includes('dell') || brandKey.includes('lenovo'))) {
          return {
            brand: inputBrand.toUpperCase(),
            modelName: `No Direct ${cat} Series`,
            matchedSpecs: `${inputBrand} does not manufacture industrial/enterprise ${cat}. Recommended partner match: ${cat === 'UPS & Power Systems' ? 'Schneider Electric (APC) / Vertiv' : 'Hikvision / Dahua'}.`,
            matchRating: "No Direct Product Line",
            marketPriceEst: "N/A",
            competitiveEdge: `Major bidding win: Competitors bidding ${inputBrand} must 3rd-party outsource this package at high margin markups. Matrix / SajayaTech manufactures this directly.`
          };
        } else if (cat === 'Personal Computers' && (brandKey.includes('schneider') || brandKey.includes('apc') || brandKey.includes('vertiv') || brandKey.includes('hikvision') || brandKey.includes('dahua'))) {
          return {
            brand: inputBrand.toUpperCase(),
            modelName: `No PC Product Line`,
            matchedSpecs: `${inputBrand} specializes in infrastructure/security, not personal computers.`,
            matchRating: "No Direct Product Line",
            marketPriceEst: "N/A",
            competitiveEdge: "Matrix offers comprehensive single-vendor submittal covering both IT compute and power/security infrastructure."
          };
        }

        return {
          brand: inputBrand.toUpperCase(),
          modelName: `${inputBrand} Commercial Enterprise Series (${cat})`,
          matchedSpecs: `Standard commercial enterprise equivalent matching tender specification clauses for ${cat}.`,
          matchRating: "Equivalent Specification",
          marketPriceEst: `Estimated ${cat === 'Personal Computers' ? '$650 USD' : cat === 'Monitors' ? '$280 USD' : '$1,800 USD'}`,
          competitiveEdge: `Matrix provides direct local factory backing, Jordan SLA warranty, and significant margin advantage over ${inputBrand}.`
        };
      }

      return found;
    });

    return {
      category: cat,
      ourModel: dbEntry.ourModel,
      competitors: brandMatches
    };
  }).filter(Boolean);

  res.json({
    requestedCompanies: requestedBrands,
    detectedCategoriesCount: detectedCategories.length,
    results
  });
});

// Flag an extraction as Important or NotNeeded and train the AI rule table
app.post('/api/tenders/:tenderId/extractions/:extId/feedback', (req, res) => {
  const store = loadStore();
  const tenderId = Number(req.params.tenderId);
  const extId = Number(req.params.extId);
  const { importanceFlag, reason, userName } = req.body;

  const tender = store.tenders.find(t => t.Id === tenderId);
  if (!tender) return res.status(404).json({ error: 'Tender not found' });

  const ext = (tender.Extractions || []).find(e => e.Id === extId);
  if (!ext) return res.status(404).json({ error: 'Extraction not found' });

  ext.ImportanceFlag = importanceFlag;
  ext.VerifiedByUser = true;
  if (reason) ext.UserFeedbackNote = reason;

  // Add or increment AI Feedback Rule so future tenders learn from this decision
  const learnedAction = importanceFlag === 'NotNeeded' ? 'FlagNotNeeded' : 'FlagImportant';
  const existingRule = store.aiFeedbackRules.find(
    r => r.PatternOrTopic.toLowerCase() === ext.RequirementTitle.toLowerCase()
  );

  if (existingRule) {
    existingRule.LearnedAction = learnedAction;
    existingRule.TimesApplied += 1;
    if (reason) existingRule.Reason = reason;
  } else {
    store.aiFeedbackRules.unshift({
      Id: store.aiFeedbackRules.length ? Math.max(...store.aiFeedbackRules.map(r => r.Id)) + 1 : 1,
      PatternOrTopic: ext.RequirementTitle,
      Category: ext.Category,
      LearnedAction: learnedAction,
      Reason: reason || `Trained by user flagging "${ext.RequirementTitle}" as ${importanceFlag}`,
      TimesApplied: 1,
      CreatedByUserName: userName || 'Mohammed Al-Mansoor',
      CreatedAt: new Date().toISOString()
    });
  }

  saveStore(store);
  res.json({ tender, aiFeedbackRules: store.aiFeedbackRules });
});

// -----------------------------------------------------------------------------
// 5. AI SMART PRICING & HISTORICAL COMPETITOR BID ESTIMATOR API
// -----------------------------------------------------------------------------
app.post('/api/pricing/estimate', (req, res) => {
  const store = loadStore();
  const {
    itemCategory,
    itemDescription,
    baseFactoryCost,
    quantity,
    yearsSinceHistorical = 1,
    inflationRate,
    shippingRate,
    customsTaxRate,
    materialEscalationRate,
    targetMarginPercent = 18
  } = req.body;

  // Match historical competitor bids by category or spec keywords
  const matchedCompetitors = store.competitorPrices.filter(cp => {
    if (itemCategory && cp.ItemCategory === itemCategory) return true;
    const descWords = (itemDescription || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return descWords.some(w => cp.ItemDescription.toLowerCase().includes(w) || cp.NormalizedSpecs.toLowerCase().includes(w));
  });

  const competitorsPool = matchedCompetitors.length > 0 ? matchedCompetitors : store.competitorPrices;
  const rawAvgCompetitor = competitorsPool.reduce((sum, c) => sum + Number(c.QuotedUnitPrice), 0) / competitorsPool.length;
  const lowestHistoricalCompetitor = Math.min(...competitorsPool.map(c => Number(c.QuotedUnitPrice)));
  const highestHistoricalCompetitor = Math.max(...competitorsPool.map(c => Number(c.QuotedUnitPrice)));

  const inf = (inflationRate !== undefined && inflationRate !== null ? Number(inflationRate) : 4.2) * Number(yearsSinceHistorical || 1);
  const shp = (shippingRate !== undefined && shippingRate !== null ? Number(shippingRate) : 6.5);
  const tax = (customsTaxRate !== undefined && customsTaxRate !== null ? Number(customsTaxRate) : 5.0);
  const mat = (materialEscalationRate !== undefined && materialEscalationRate !== null ? Number(materialEscalationRate) : 7.8);

  const totalMarketMultiplier = 1 + (inf + shp + tax + mat) / 100;

  // Adjusted competitor benchmark in today's market
  const adjustedAvgCompetitorPrice = Math.round(rawAvgCompetitor * totalMarketMultiplier);
  const adjustedLowestCompetitorPrice = Math.round(lowestHistoricalCompetitor * totalMarketMultiplier);

  // Our landed cost = Base Factory Cost * (1 + shipping + tax + material escalation)
  const landedCostMultiplier = 1 + (shp + tax + mat) / 100;
  const unitCostInput = Number(baseFactoryCost) > 0 ? Number(baseFactoryCost) : Math.round(rawAvgCompetitor * 0.72);
  const estimatedLandedUnitCost = Math.round(unitCostInput * landedCostMultiplier);

  // 3 AI Pricing Tiers:
  // 1. Aggressive Win Price: Undercuts adjusted lowest competitor by ~2.5%, while maintaining at least 8% floor margin over landed cost
  const minSafePrice = Math.round(estimatedLandedUnitCost * 1.08);
  const aggressiveUnitPrice = Math.max(minSafePrice, Math.round(adjustedLowestCompetitorPrice * 0.975));

  // 2. Balanced Recommended Price: Blends our target margin price with adjusted competitor average
  const targetMarginPrice = Math.round(estimatedLandedUnitCost * (1 + Number(targetMarginPercent) / 100));
  const balancedUnitPrice = Math.round((targetMarginPrice * 0.55) + (adjustedAvgCompetitorPrice * 0.45));

  // 3. Premium / Safe Ceiling Price: Full risk buffer + high spec compliance premium
  const premiumUnitPrice = Math.round(Math.max(balancedUnitPrice * 1.09, highestHistoricalCompetitor * totalMarketMultiplier));

  const qty = Math.max(1, Number(quantity) || 1);

  res.json({
    itemDescription: itemDescription || 'Configured Tender Line Item',
    itemCategory: itemCategory || 'General Industrial',
    quantity: qty,
    matchedCompetitorBids: competitorsPool,
    breakdown: {
      baseFactoryCost: unitCostInput,
      inflationPercent: Number(inf.toFixed(2)),
      shippingPercent: Number(shp.toFixed(2)),
      customsTaxPercent: Number(tax.toFixed(2)),
      materialEscalationPercent: Number(mat.toFixed(2)),
      totalMarketAdjustmentPercent: Number(((totalMarketMultiplier - 1) * 100).toFixed(2)),
      estimatedLandedUnitCost,
      historicalAvgCompetitorPrice: Math.round(rawAvgCompetitor),
      adjustedMarketCompetitorAvg: adjustedAvgCompetitorPrice,
      adjustedMarketCompetitorLow: adjustedLowestCompetitorPrice
    },
    recommendations: {
      aggressive: {
        unitPrice: aggressiveUnitPrice,
        totalPrice: aggressiveUnitPrice * qty,
        estimatedMarginPercent: Number((((aggressiveUnitPrice - estimatedLandedUnitCost) / aggressiveUnitPrice) * 100).toFixed(1)),
        winProbability: '86% (High — Undercuts adjusted competitor floor)'
      },
      balanced: {
        unitPrice: balancedUnitPrice,
        totalPrice: balancedUnitPrice * qty,
        estimatedMarginPercent: Number((((balancedUnitPrice - estimatedLandedUnitCost) / balancedUnitPrice) * 100).toFixed(1)),
        winProbability: '68% (Optimal Margin vs. Historical Competitor Range)'
      },
      premium: {
        unitPrice: premiumUnitPrice,
        totalPrice: premiumUnitPrice * qty,
        estimatedMarginPercent: Number((((premiumUnitPrice - estimatedLandedUnitCost) / premiumUnitPrice) * 100).toFixed(1)),
        winProbability: '39% (Use when Matrix holds exclusive spec advantage)'
      }
    }
  });
});

// Add new historical competitor bid record
app.post('/api/pricing/competitors', (req, res) => {
  const store = loadStore();
  const newBid = {
    Id: store.competitorPrices.length ? Math.max(...store.competitorPrices.map(c => c.Id)) + 1 : 1,
    TenderReference: req.body.TenderReference || 'TND-HIST-2026',
    TenderClient: req.body.TenderClient || '',
    ItemCategory: req.body.ItemCategory || 'LV Switchgear & MCC',
    ItemDescription: req.body.ItemDescription || '',
    NormalizedSpecs: req.body.NormalizedSpecs || '',
    CompetitorName: req.body.CompetitorName || '',
    FactoryOrigin: req.body.FactoryOrigin || '',
    QuotedUnitPrice: Number(req.body.QuotedUnitPrice) || 0,
    OurQuotedUnitPrice: Number(req.body.OurQuotedUnitPrice) || 0,
    Currency: req.body.Currency || 'USD',
    WasWinningBid: Boolean(req.body.WasWinningBid),
    BidDate: req.body.BidDate || new Date().toISOString().slice(0, 10)
  };
  store.competitorPrices.unshift(newBid);
  saveStore(store);
  res.json(newBid);
});

// Update Market Factors (Inflation, Shipping, Customs, Raw Material Index)
app.put('/api/pricing/market-factors', (req, res) => {
  const store = loadStore();
  if (Array.isArray(req.body.marketFactors)) {
    store.marketFactors = req.body.marketFactors;
    saveStore(store);
  }
  res.json(store.marketFactors);
});

// -----------------------------------------------------------------------------
// 6. MS SQL SERVER (SSMS) CONNECTION & EXPORT SCRIPT API
// -----------------------------------------------------------------------------
app.post('/api/sql/connect', async (req, res) => {
  const store = loadStore();
  if (req.body.dbConfig) {
    store.dbConfig = { ...store.dbConfig, ...req.body.dbConfig };
    saveStore(store);
  }
  const result = await tryConnectMSSQL(store.dbConfig);
  res.json(result);
});

app.get('/api/sql/ssms-script', (req, res) => {
  const store = loadStore();
  const script = generateFullSSMSScript(store);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="MatrixFactoryDB_SSMS_FullSync.sql"');
  res.send(script);
});

app.listen(PORT, () => {
  console.log(`Matrix Datasheet & AI Tender System running at http://localhost:${PORT}`);
});
