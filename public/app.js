// =============================================================================
// MATRIX INDUSTRIAL — ENTERPRISE FRONTEND CONTROLLER
// =============================================================================

let lastEquivalentsData = null;
let appState = {
  users: [],
  activeUser: null,
  factories: [],
  contacts: [],
  products: [],
  datasheets: [],
  tenders: [],
  aiFeedbackRules: [],
  competitorPrices: [],
  marketFactors: [],
  stagedPhoneContacts: [],
  productImages: {},
  originalProducts: []
};

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Mandatory Fallback for <dialog closedby="any"> per modern-web-guidance
function setupDialogLightDismissFallbacks() {
  const dialogs = document.querySelectorAll('dialog.app-dialog');
  dialogs.forEach(dialog => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (isDialogContent) return;
        dialog.close();
      });
    }
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const targetPanel = document.getElementById(tabId);
  if (targetPanel) targetPanel.classList.add('active');

  const targetBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  if (targetBtn) targetBtn.classList.add('active');
}

async function initApp() {
  setupDialogLightDismissFallbacks();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const res = await fetch('/api/bootstrap');
  const data = await res.json();

  appState.users = data.users || [];
  appState.activeUser = appState.users[0] || { FullName: 'Mohammed Al-Mansoor', Role: 'Admin', CanViewRestrictedContacts: true };
  appState.factories = data.factories || [];
  appState.contacts = data.contacts || [];
  appState.products = data.products || [];
  appState.originalProducts = JSON.parse(JSON.stringify(data.products || []));
  appState.datasheets = data.datasheets || [];
  appState.tenders = data.tenders || [];
  appState.aiFeedbackRules = data.aiFeedbackRules || [];
  appState.competitorPrices = data.competitorPrices || [];
  appState.marketFactors = data.marketFactors || [];

  renderUserSwitcher();
  renderAllCounts();
  populateFactoryDropdowns();
  renderDatasheetModule();
  renderDatasheetHistory();
  renderPreviousDatasheetsTable();
  renderTenderTrackerModule();
  renderContactsModule();
  renderTendersModule();
  renderFactoriesModule();
  renderPricingModule();
  bindEvents();
  runPricingEstimator();
}

function renderAllCounts() {
  document.getElementById('nav-count-products').textContent = appState.products.length;
  document.getElementById('nav-count-contacts').textContent = getAccessibleContacts().length;
  document.getElementById('nav-count-rules').textContent = appState.aiFeedbackRules.length;
  document.getElementById('nav-count-factories').textContent = appState.factories.length;
  const countTendersEl = document.getElementById('nav-count-tenders');
  if (countTendersEl) countTendersEl.textContent = appState.tenders.length;

  const countHistory = appState.datasheets.length;
  const countHistoryEl = document.getElementById('nav-count-history');
  if (countHistoryEl) countHistoryEl.textContent = countHistory;
  const headerHistoryBadge = document.getElementById('headerHistoryBadge');
  if (headerHistoryBadge) headerHistoryBadge.textContent = countHistory;
  const quickHistoryCount = document.getElementById('quickHistoryCount');
  if (quickHistoryCount) quickHistoryCount.textContent = countHistory;
}

// =============================================================================
// ROLE-BASED ACCESS CONTROL (RBAC) SWITCHER
// =============================================================================
function renderUserSwitcher() {
  const sel = document.getElementById('activeUserSelect');
  sel.innerHTML = appState.users.map(u =>
    `<option value="${u.Id}">${u.FullName} — ${u.Role}</option>`
  ).join('');

  sel.value = appState.activeUser.Id;
  updateRoleNote();

  sel.addEventListener('change', () => {
    const found = appState.users.find(u => u.Id === Number(sel.value));
    if (found) {
      appState.activeUser = found;
      updateRoleNote();
      renderContactsModule();
      renderAllCounts();
    }
  });
}

function updateRoleNote() {
  const u = appState.activeUser;
  const noteEl = document.getElementById('activeUserRoleNote');
  if (u.Role === 'Admin') {
    noteEl.textContent = 'Clearance: Full Access (Public, Restricted, AdminOnly)';
  } else if (u.Role === 'Manager') {
    noteEl.textContent = 'Clearance: Management (Public & Restricted Records)';
  } else {
    noteEl.textContent = 'Clearance: Standard (Public Records Only)';
  }
}

function getAccessibleContacts() {
  const role = appState.activeUser ? appState.activeUser.Role : 'Viewer';
  return appState.contacts.filter(c => {
    if (role === 'Admin') return true;
    if (role === 'Manager') return c.VisibilityLevel !== 'AdminOnly';
    return c.VisibilityLevel === 'Public';
  });
}

function populateFactoryDropdowns() {
  const optionsHtml = appState.factories.map(f =>
    `<option value="${f.Id}">${f.Name} (${f.Country})</option>`
  ).join('');

  const filterSel = document.getElementById('contactFactoryFilter');
  if (filterSel) {
    filterSel.innerHTML = `<option value="">All Plants & External Organizations</option>` + optionsHtml;
  }

  const importSel = document.getElementById('importDefaultFactory');
  if (importSel) {
    importSel.innerHTML = `<option value="">-- Unassigned / General --</option>` + optionsHtml;
  }

  const newContactSel = document.getElementById('newContactFactorySelect');
  if (newContactSel) {
    newContactSel.innerHTML = `<option value="">-- External / Client Organization --</option>` + optionsHtml;
  }

  const newProdSel = document.getElementById('newProductFactorySelect');
  if (newProdSel) {
    newProdSel.innerHTML = optionsHtml;
  }
}

// =============================================================================
// MODULE 1: PRODUCT PDF DATASHEET CREATOR
// =============================================================================
function renderDatasheetModule() {
  const catFilterEl = document.getElementById('dsCategoryFilter');
  const selectedCat = catFilterEl ? catFilterEl.value : 'ALL';
  const filteredProducts = selectedCat === 'ALL'
    ? appState.products
    : appState.products.filter(p => p.Category === selectedCat);

  const prodSelect = document.getElementById('dsProductSelect');
  prodSelect.innerHTML = filteredProducts.map(p =>
    `<option value="${p.Id}">${p.Name}</option>`
  ).join('');

  updateDatasheetPreview();
  renderDatasheetHistory();
}

function getSelectedProduct() {
  const prodId = Number(document.getElementById('dsProductSelect').value) || (appState.products[0] && appState.products[0].Id);
  return appState.products.find(p => p.Id === prodId) || appState.products[0];
}

function updateDatasheetPreview(syncEditor = true) {
  const product = getSelectedProduct();
  if (!product) return;

  const factory = appState.factories.find(f => f.Id === product.FactoryId) || appState.factories[0];

  // Factory / Brand Header
  const headerNameEl = document.getElementById('dsFactoryHeaderName');
  if (headerNameEl) {
    headerNameEl.textContent = factory ? factory.Name.toUpperCase() : 'MATRIX MAIN INDUSTRIAL PLANT';
  }
  const headerSubEl = document.getElementById('dsFactoryHeaderSub');
  if (headerSubEl && !headerSubEl.dataset.userEdited) {
    headerSubEl.textContent = 'Commercial & Enterprise Hardware Systems';
  }

  // Submittal Meta
  const docCodeVal = document.getElementById('dsDocCode')?.value || 'DS-MTX-2026-001';
  const skuVal = product.SKU || 'SAJAYA-B1Q';
  const revVal = product.Revision || 'Rev 2026.1';

  const previewDocCode = document.getElementById('previewDocCode');
  if (previewDocCode) previewDocCode.textContent = docCodeVal;
  const previewDocCodeP2 = document.getElementById('previewDocCodePage2');
  if (previewDocCodeP2) previewDocCodeP2.textContent = docCodeVal;

  const previewSKU = document.getElementById('previewSKU');
  if (previewSKU) previewSKU.textContent = skuVal;
  const previewSKUP2 = document.getElementById('previewSKUPage2');
  if (previewSKUP2) previewSKUP2.textContent = skuVal;

  const previewRev = document.getElementById('previewRev');
  if (previewRev) previewRev.textContent = revVal;

  const issueDateInput = document.getElementById('dsIssueDate');
  if (issueDateInput && !issueDateInput.value) {
    issueDateInput.value = new Date().toISOString().slice(0, 10);
  }
  const dateVal = issueDateInput?.value || new Date().toISOString().slice(0, 10);
  const previewDate = document.getElementById('previewDate');
  if (previewDate) previewDate.textContent = dateVal;
  const previewDateP2 = document.getElementById('previewDatePage2');
  if (previewDateP2) previewDateP2.textContent = dateVal;

  // Title Banner
  document.getElementById('previewCategory').textContent = product.Category;
  document.getElementById('previewProductName').textContent = product.Name;
  document.getElementById('previewSummary').textContent = product.Summary || '';

  const page2Sub = document.getElementById('previewPage2Sub');
  if (page2Sub) {
    page2Sub.textContent = `Comprehensive hardware parameters and engineering characteristics for ${product.Name} (${product.SKU}).`;
  }

  // Meta strip
  document.getElementById('previewFactoryOrigin').textContent = factory ? `${factory.Name} (${factory.Country})` : 'Matrix Main Plant';
  document.getElementById('previewWarranty').textContent = `${product.WarrantyMonths || 36} Months Factory Warranty`;
  document.getElementById('previewCompliance').textContent = product.ComplianceStandards || 'ISO 9001, CE, RoHS, JSMO';

  const previewAuth = document.getElementById('previewAuthority');
  if (previewAuth) {
    previewAuth.textContent = document.getElementById('dsCustomClient')?.value || 'Ministry of Digital Economy & Entrepreneurship';
  }

  const previewIssued = document.getElementById('previewIssuedBy');
  if (previewIssued) {
    previewIssued.textContent = document.getElementById('dsIssuedBy')?.value || (appState.activeUser ? appState.activeUser.FullName : 'Eng. Mohammed Al-Mansoor');
  }

  // Product Image (Req #8)
  const imgEl = document.getElementById('dsTopImage');
  const placeholderEl = document.getElementById('dsImagePlaceholder');
  const btnRemove = document.getElementById('btnRemoveImage');
  const statusText = document.getElementById('imageStatusText');
  const currentImg = appState.productImages[product.Id];

  if (currentImg) {
    imgEl.src = currentImg;
    imgEl.style.display = 'block';
    placeholderEl.style.display = 'none';
    if (btnRemove) btnRemove.style.display = 'inline-flex';
    if (statusText) statusText.textContent = 'Custom product photo active';
  } else {
    imgEl.removeAttribute('src');
    imgEl.style.display = 'none';
    placeholderEl.style.display = 'flex';
    if (btnRemove) btnRemove.style.display = 'none';
    if (statusText) statusText.textContent = 'No custom image loaded (placeholder shown)';
  }

  // Render Unique Category-Tailored Layout (Req #1)
  renderProductUniqueLayout(product);

  // Sync Left Panel Editor if requested
  if (syncEditor) {
    renderPreExistingFieldsEditor();
  }

  // Bind live in-place editing listeners
  bindDatasheetInPlaceEvents();
}

// Unique Layout Renderer for Each Product Type (Sajaya Reference Standard)
function renderProductUniqueLayout(product) {
  const container = document.getElementById('previewUniqueLayout');
  if (!container) return;

  const cat = product.Category || '';
  const specs = product.Specifications || {};
  const features = Array.isArray(product.Features) && product.Features.length
    ? product.Features
    : [
        'Intel® & Enterprise Multi-Threaded Processing Architecture',
        'PCIe Expansion & Industrial Hardware Component Reliability',
        'Built-in HD Audio & Multi-Display 4K Digital Connectivity',
        'Hardware TPM 2.0 Security & Windows 11 Enterprise Ready'
      ];

  // 1. Dynamic 4-Metric Grid in Hero Showcase (Sajaya 2x2 Grid)
  const metricsGrid = document.getElementById('dsKeyMetricsGrid');
  if (metricsGrid) {
    const m1 = specs['Processor'] || specs['Processors'] || specs['CPU'] || specs['Engine'] || '14th Gen Intel®';
    const m2 = specs['Memory (RAM)'] || specs['System Memory'] || specs['RAM'] || specs['Memory'] || 'Up to 64GB DDR5';
    const m3 = specs['Storage Drive'] || specs['Storage'] || specs['Primary Storage'] || specs['Drive'] || '512GB - 2TB NVMe';
    const m4 = specs['Security'] || specs['Form Factor'] || specs['Form Factor & Chassis'] || specs['Chassis'] || 'TPM 2.0 Cryptographic';

    metricsGrid.innerHTML = `
      <div class="metric-card">
        <div class="metric-label">Processor Engine</div>
        <div class="metric-value" contenteditable="true" spellcheck="false" data-spec-highlight="Processor">${escapeHtml(m1)}</div>
        <div class="metric-sub">Enterprise Architecture</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Memory Architecture</div>
        <div class="metric-value" contenteditable="true" spellcheck="false" data-spec-highlight="Memory (RAM)">${escapeHtml(m2)}</div>
        <div class="metric-sub">High-Bandwidth DDR5/4</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Storage Capacity</div>
        <div class="metric-value" contenteditable="true" spellcheck="false" data-spec-highlight="Storage Drive">${escapeHtml(m3)}</div>
        <div class="metric-sub">PCIe NVMe Solid-State</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Chassis & Security</div>
        <div class="metric-value" contenteditable="true" spellcheck="false">${escapeHtml(m4)}</div>
        <div class="metric-sub">Hardware Protected</div>
      </div>
    `;
  }

  // 2. Dynamic 4-Pillars Features Row (Sajaya Reference Standard)
  const featuresRow = document.getElementById('dsFeaturesRow');
  if (featuresRow) {
    const f1 = features[0] || 'Enterprise Computing Performance';
    const f2 = features[1] || 'Industrial Reliability & Thermal Design';
    const f3 = features[2] || 'Integrated HD Audio & Visual Interfaces';
    const f4 = features[3] || 'Hardware TPM 2.0 Security & Windows 11 Ready';

    featuresRow.innerHTML = `
      <div class="feature-box">
        <div class="feature-box-title">Enterprise Power</div>
        <div class="feature-box-desc" contenteditable="true" spellcheck="false">${escapeHtml(f1)}</div>
      </div>
      <div class="feature-box">
        <div class="feature-box-title">System Reliability</div>
        <div class="feature-box-desc" contenteditable="true" spellcheck="false">${escapeHtml(f2)}</div>
      </div>
      <div class="feature-box">
        <div class="feature-box-title">Multimedia & I/O</div>
        <div class="feature-box-desc" contenteditable="true" spellcheck="false">${escapeHtml(f3)}</div>
      </div>
      <div class="feature-box">
        <div class="feature-box-title">Enterprise Security</div>
        <div class="feature-box-desc" contenteditable="true" spellcheck="false">${escapeHtml(f4)}</div>
      </div>
    `;
  }

  // 3. Page 1 Quick Spec Summary Table
  const quickSpecsTable = document.getElementById('dsQuickSpecsTable');
  if (quickSpecsTable) {
    const q1 = specs['Processor'] || specs['Processors'] || specs['CPU'] || 'Intel® Core™ 14th Gen Series';
    const q2 = specs['Memory (RAM)'] || specs['System Memory'] || specs['RAM'] || 'Up to 64GB DDR5 Dual-Channel';
    const q3 = specs['Storage Drive'] || specs['Storage'] || 'M.2 PCIe NVMe Solid State Drive';
    const q4 = specs['Graphics'] || specs['Video Output'] || 'Integrated Intel® Graphics • HDMI Ultra HD';
    const q5 = specs['I/O Ports'] || specs['Ports'] || specs['Networking'] || 'Gigabit RJ-45 LAN • USB-C • USB 3.1 Type-A • Audio Combo Jack';

    quickSpecsTable.innerHTML = `
      <tbody>
        <tr>
          <td class="qs-col-label">CPU Options</td>
          <td class="qs-col-val" contenteditable="true" spellcheck="false" data-orig-key="Processor" data-col="val">${escapeHtml(q1)}</td>
        </tr>
        <tr>
          <td class="qs-col-label">System RAM</td>
          <td class="qs-col-val" contenteditable="true" spellcheck="false" data-orig-key="Memory (RAM)" data-col="val">${escapeHtml(q2)}</td>
        </tr>
        <tr>
          <td class="qs-col-label">Storage Drive</td>
          <td class="qs-col-val" contenteditable="true" spellcheck="false" data-orig-key="Storage Drive" data-col="val">${escapeHtml(q3)}</td>
        </tr>
        <tr>
          <td class="qs-col-label">Graphics & Video</td>
          <td class="qs-col-val" contenteditable="true" spellcheck="false">${escapeHtml(q4)}</td>
        </tr>
        <tr>
          <td class="qs-col-label">Networking & Ports</td>
          <td class="qs-col-val" contenteditable="true" spellcheck="false">${escapeHtml(q5)}</td>
        </tr>
      </tbody>
    `;
  }

  // 4. Technical Specifications Matrix Container (Page 2)
  container.innerHTML = `
    <div class="specs-matrix-container">
      <div class="specs-table-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>Full System Technical Specifications Matrix</span>
        <span style="font-size:8.5px; font-weight:500; color:var(--text-subtle); text-transform:none;">Guaranteed Engineering Ratings</span>
      </div>
      ${renderSpecTable(specs)}
    </div>
  `;
}

function renderSpecTable(specs) {
  const entries = Object.entries(specs || {});
  if (!entries.length) {
    return `
      <table class="specs-matrix-table ds-spec-table">
        <thead>
          <tr>
            <th style="width:28%;">Technical Characteristic / Subsystem</th>
            <th style="width:72%;">Factory Guaranteed Engineering Specification</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th class="specs-param-name" contenteditable="true" spellcheck="false" data-col="key">Standard Rating</th>
            <td class="specs-param-detail mono" contenteditable="true" spellcheck="false" data-col="val">Per Factory Technical Schedule</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  const rows = entries.map(([k, v]) => `
    <tr data-spec-key="${escapeAttr(k)}">
      <th class="specs-param-name" contenteditable="true" spellcheck="false" data-orig-key="${escapeAttr(k)}" data-col="key">${escapeHtml(k)}</th>
      <td class="specs-param-detail mono" contenteditable="true" spellcheck="false" data-orig-key="${escapeAttr(k)}" data-col="val">${escapeHtml(v)}</td>
    </tr>
  `).join('');

  return `
    <table class="specs-matrix-table ds-spec-table">
      <thead>
        <tr>
          <th style="width:28%;">Technical Characteristic / Subsystem</th>
          <th style="width:72%;">Factory Guaranteed Engineering Specification</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// -----------------------------------------------------------------------------
// PRE-EXISTING FIELDS & SPECIFICATIONS EDITOR
// -----------------------------------------------------------------------------
function renderPreExistingFieldsEditor(filterQuery = '') {
  const product = getSelectedProduct();
  if (!product) return;

  // Metadata inputs in left panel
  const nameInput = document.getElementById('dsEditName');
  const skuInput = document.getElementById('dsEditSKU');
  const revInput = document.getElementById('dsEditRevision');
  const summaryInput = document.getElementById('dsEditSummary');
  const warrantyInput = document.getElementById('dsEditWarranty');
  const complianceInput = document.getElementById('dsEditCompliance');

  if (nameInput) nameInput.value = product.Name || '';
  if (skuInput) skuInput.value = product.SKU || '';
  if (revInput) revInput.value = product.Revision || 'Rev 2026.1';
  if (summaryInput) summaryInput.value = product.Summary || '';
  if (warrantyInput) warrantyInput.value = product.WarrantyMonths || 36;
  if (complianceInput) complianceInput.value = product.ComplianceStandards || 'ISO 9001, CE, RoHS, JSMO';

  // Pre-existing Specification rows in left panel
  const listEl = document.getElementById('dsSpecsEditorList');
  if (!listEl) return;

  const specs = product.Specifications || {};
  let entries = Object.entries(specs);
  const countBadge = document.getElementById('dsFieldsCountBadge');
  if (countBadge) countBadge.textContent = entries.length;

  const q = (filterQuery || document.getElementById('dsSpecSearchInput')?.value || '').toLowerCase().trim();
  if (q) {
    entries = entries.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
  }

  if (entries.length === 0) {
    listEl.innerHTML = `<div style="font-size:0.75rem; color:var(--text-muted); padding:0.6rem 0; text-align:center;">${q ? 'No parameters match "' + escapeHtml(q) + '"' : 'No technical specifications defined. Add one below.'}</div>`;
    return;
  }

  listEl.innerHTML = entries.map(([k, v]) => `
    <div class="ds-spec-edit-row" data-orig-key="${escapeAttr(k)}">
      <input type="text" class="ds-input-key" data-orig-key="${escapeAttr(k)}" value="${escapeAttr(k)}" title="Parameter Name" />
      <input type="text" class="ds-input-val mono" data-orig-key="${escapeAttr(k)}" value="${escapeAttr(v)}" title="Parameter Value" />
      <button type="button" class="btn-del-spec" data-del-key="${escapeAttr(k)}" title="Delete parameter">✕</button>
    </div>
  `).join('');

  // Live input sync from left panel inputs to preview
  listEl.querySelectorAll('.ds-input-val').forEach(input => {
    input.addEventListener('input', (e) => {
      const origKey = e.target.dataset.origKey;
      const prod = getSelectedProduct();
      if (!prod || !prod.Specifications) return;
      prod.Specifications[origKey] = e.target.value;

      // Update cell in preview table
      const tr = document.querySelector(`.ds-spec-table tr[data-spec-key="${CSS.escape(origKey)}"]`);
      if (tr) {
        const td = tr.querySelector('td');
        if (td) td.textContent = e.target.value;
      }

      // Update highlight card if matching
      const hl = document.querySelector(`.ds-highlight-val[data-spec-highlight="${CSS.escape(origKey)}"]`);
      if (hl) hl.textContent = e.target.value;
    });
  });

  listEl.querySelectorAll('.ds-input-key').forEach(input => {
    input.addEventListener('change', (e) => {
      const oldKey = e.target.dataset.origKey;
      const newKey = e.target.value.trim();
      if (!newKey || oldKey === newKey) return;
      const prod = getSelectedProduct();
      if (!prod || !prod.Specifications) return;

      const val = prod.Specifications[oldKey];
      delete prod.Specifications[oldKey];
      prod.Specifications[newKey] = val;

      updateDatasheetPreview(false);
      renderPreExistingFieldsEditor();
    });
  });

  listEl.querySelectorAll('.btn-del-spec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const delKey = e.target.dataset.delKey;
      const prod = getSelectedProduct();
      if (!prod || !prod.Specifications) return;
      delete prod.Specifications[delKey];
      updateDatasheetPreview(false);
      renderPreExistingFieldsEditor();
    });
  });
}

// -----------------------------------------------------------------------------
// FULL MODAL SPECIFICATIONS CUSTOMIZER
// -----------------------------------------------------------------------------
function openProductSpecsModal() {
  const product = getSelectedProduct();
  if (!product) return;

  const subtitle = document.getElementById('dialogSpecsSubtitle');
  if (subtitle) subtitle.textContent = `Customizing specifications for ${product.Name} (${product.SKU})`;

  renderModalSpecsTable();
  const modal = document.getElementById('dialogProductSpecsEditor');
  if (modal) modal.showModal();
}

function renderModalSpecsTable() {
  const product = getSelectedProduct();
  if (!product) return;

  const tbody = document.getElementById('modalSpecsTableBody');
  if (!tbody) return;

  const q = (document.getElementById('modalSpecSearchInput')?.value || '').toLowerCase().trim();
  const specs = product.Specifications || {};
  let entries = Object.entries(specs);

  const countBadge = document.getElementById('modalSpecCountBadge');
  if (countBadge) countBadge.textContent = `${entries.length} Parameters`;

  if (q) {
    entries = entries.filter(([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
  }

  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:1.25rem; color:var(--text-muted);">${q ? 'No parameters match "' + escapeHtml(q) + '".' : 'No specifications defined.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(([k, v]) => `
    <tr style="border-bottom:1px solid var(--border-subtle);">
      <td style="padding:0.4rem 0.65rem;">
        <input type="text" class="modal-input-key" data-orig-key="${escapeAttr(k)}" value="${escapeAttr(k)}" style="width:100%; font-size:0.78rem;" />
      </td>
      <td style="padding:0.4rem 0.65rem;">
        <input type="text" class="modal-input-val mono" data-orig-key="${escapeAttr(k)}" value="${escapeAttr(v)}" style="width:100%; font-size:0.78rem;" />
      </td>
      <td style="padding:0.4rem; text-align:center;">
        <button type="button" class="btn btn-sm btn-danger modal-del-spec" data-del-key="${escapeAttr(k)}" style="padding:0.2rem 0.45rem; font-size:0.75rem;" title="Delete parameter">✕</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.modal-input-val').forEach(input => {
    input.addEventListener('input', (e) => {
      const origKey = e.target.dataset.origKey;
      product.Specifications[origKey] = e.target.value;
      updateDatasheetPreview(false);
      renderPreExistingFieldsEditor();
    });
  });

  tbody.querySelectorAll('.modal-input-key').forEach(input => {
    input.addEventListener('change', (e) => {
      const oldKey = e.target.dataset.origKey;
      const newKey = e.target.value.trim();
      if (!newKey || oldKey === newKey) return;
      const val = product.Specifications[oldKey];
      delete product.Specifications[oldKey];
      product.Specifications[newKey] = val;
      updateDatasheetPreview(false);
      renderPreExistingFieldsEditor();
      renderModalSpecsTable();
    });
  });

  tbody.querySelectorAll('.modal-del-spec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const delKey = e.target.dataset.delKey;
      delete product.Specifications[delKey];
      updateDatasheetPreview(false);
      renderPreExistingFieldsEditor();
      renderModalSpecsTable();
    });
  });
}

async function saveProductEdits() {
  const product = getSelectedProduct();
  if (!product) return;

  const statusEl = document.getElementById('dsEditSaveStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.background = '#eff6ff';
    statusEl.style.color = '#1e40af';
    statusEl.textContent = 'Saving changes to catalog database...';
  }

  try {
    const payload = {
      Name: product.Name,
      SKU: product.SKU,
      Revision: product.Revision || 'Rev 2026.1',
      Summary: product.Summary || '',
      WarrantyMonths: Number(product.WarrantyMonths) || 36,
      ComplianceStandards: product.ComplianceStandards || 'ISO 9001, CE, RoHS, JSMO',
      Specifications: product.Specifications || {}
    };

    const res = await fetch(`/api/products/${product.Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Database returned ' + res.status);
    const updated = await res.json();
    Object.assign(product, updated);

    if (Array.isArray(appState.originalProducts)) {
      const origIdx = appState.originalProducts.findIndex(p => p.Id === product.Id);
      if (origIdx !== -1) {
        appState.originalProducts[origIdx] = JSON.parse(JSON.stringify(updated));
      }
    }

    if (statusEl) {
      statusEl.style.background = '#dcfce7';
      statusEl.style.color = '#15803d';
      statusEl.textContent = '✓ Saved to Catalog SKU database!';
      setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    }

    const opt = document.querySelector(`#dsProductSelect option[value="${product.Id}"]`);
    if (opt) opt.textContent = product.Name;
  } catch (err) {
    console.error('Save product error:', err);
    if (statusEl) {
      statusEl.style.background = '#fee2e2';
      statusEl.style.color = '#b91c1c';
      statusEl.textContent = 'Error saving changes: ' + err.message;
    }
  }
}

async function revertProductEdits() {
  const product = getSelectedProduct();
  if (!product) return;

  const orig = (appState.originalProducts || []).find(p => p.Id === product.Id);
  if (!orig) {
    alert('No original catalog baseline found for this SKU.');
    return;
  }

  if (!confirm(`Restore original factory specifications for "${orig.Name}"? All custom edits to this SKU will be reset.`)) {
    return;
  }

  product.Name = orig.Name;
  product.SKU = orig.SKU;
  product.Revision = orig.Revision;
  product.Summary = orig.Summary;
  product.WarrantyMonths = orig.WarrantyMonths;
  product.ComplianceStandards = orig.ComplianceStandards;
  product.Specifications = JSON.parse(JSON.stringify(orig.Specifications || {}));

  updateDatasheetPreview(true);
  await saveProductEdits();

  const statusEl = document.getElementById('dsEditSaveStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.background = '#eff6ff';
    statusEl.style.color = '#1e40af';
    statusEl.textContent = '↺ Restored original catalog specifications!';
    setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
  }
}

// Direct seamless in-place text editing on the datasheet paper without box highlights
function bindDatasheetInPlaceEvents() {
  const dsPaper = document.getElementById('printableDatasheet');
  if (!dsPaper || dsPaper.dataset.directEventsBound) return;
  dsPaper.dataset.directEventsBound = 'true';

  // Live input handler across all directly editable text elements
  dsPaper.addEventListener('input', (e) => {
    const target = e.target;

    // 1. Table Value cell (td)
    const td = target.closest('td[data-col="val"]');
    if (td) {
      const origKey = td.dataset.origKey;
      const product = getSelectedProduct();
      if (product && product.Specifications && origKey) {
        product.Specifications[origKey] = td.innerText;

        // Sync to left panel input in background without shifting focus or adding boxes
        const leftInput = document.querySelector(`.ds-spec-edit-row[data-orig-key="${CSS.escape(origKey)}"] .ds-input-val`);
        if (leftInput && document.activeElement !== leftInput) {
          leftInput.value = td.innerText;
        }

        // Sync highlight / metric card if matching
        const hl = document.querySelector(`.ds-highlight-val[data-spec-highlight="${CSS.escape(origKey)}"], .metric-value[data-spec-highlight="${CSS.escape(origKey)}"]`);
        if (hl && hl !== td) {
          hl.innerText = td.innerText;
        }
      }
      return;
    }

    // 2. Table Key cell (th) - handled on blur to allow natural typing
    if (target.closest('th[data-col="key"]')) {
      return;
    }

    // 3. Highlight / Key Metric Cards
    const hlCard = target.closest('.ds-highlight-val[data-spec-highlight], .metric-value[data-spec-highlight]');
    if (hlCard) {
      const specKey = hlCard.dataset.specHighlight;
      const product = getSelectedProduct();
      if (product && product.Specifications && specKey) {
        product.Specifications[specKey] = hlCard.innerText;
        const matchingTd = document.querySelector(`.ds-spec-table td[data-orig-key="${CSS.escape(specKey)}"]`);
        if (matchingTd && matchingTd !== hlCard) matchingTd.innerText = hlCard.innerText;
        const leftInput = document.querySelector(`.ds-spec-edit-row[data-orig-key="${CSS.escape(specKey)}"] .ds-input-val`);
        if (leftInput && document.activeElement !== leftInput) leftInput.value = hlCard.innerText;
      }
      return;
    }

    // 4. Product Commercial Name
    if (target.id === 'previewProductName') {
      const product = getSelectedProduct();
      if (product) {
        product.Name = target.innerText;
        const nameInput = document.getElementById('dsEditName');
        if (nameInput && document.activeElement !== nameInput) nameInput.value = product.Name;
        const opt = document.querySelector(`#dsProductSelect option[value="${product.Id}"]`);
        if (opt) opt.textContent = product.Name;
      }
      return;
    }

    // 5. Product Technical Summary
    if (target.id === 'previewSummary') {
      const product = getSelectedProduct();
      if (product) {
        product.Summary = target.innerText;
        const sumInput = document.getElementById('dsEditSummary');
        if (sumInput && document.activeElement !== sumInput) sumInput.value = product.Summary;
      }
      return;
    }

    // 6. Document Tracking Code
    if (target.id === 'previewDocCode') {
      const el = document.getElementById('dsDocCode');
      if (el) el.value = target.innerText;
      const p2 = document.getElementById('previewDocCodePage2');
      if (p2) p2.textContent = target.innerText;
      return;
    }

    // 7. Model SKU Code
    if (target.id === 'previewSKU') {
      const product = getSelectedProduct();
      if (product) {
        product.SKU = target.innerText;
        const el = document.getElementById('dsEditSKU');
        if (el) el.value = product.SKU;
        const p2 = document.getElementById('previewSKUPage2');
        if (p2) p2.textContent = product.SKU;
      }
      return;
    }

    // 8. Revision Version
    if (target.id === 'previewRev') {
      const product = getSelectedProduct();
      if (product) {
        product.Revision = target.innerText;
        const el = document.getElementById('dsEditRevision');
        if (el) el.value = product.Revision;
      }
      return;
    }

    // 9. Submittal Authority
    if (target.id === 'previewAuthority') {
      const el = document.getElementById('dsCustomClient');
      if (el) el.value = target.innerText;
      return;
    }

    // 10. Submittal Issuer
    if (target.id === 'previewIssuedBy') {
      const el = document.getElementById('dsIssuedBy');
      if (el) el.value = target.innerText;
      return;
    }

    // 11. Applicable Standards
    if (target.id === 'previewCompliance') {
      const product = getSelectedProduct();
      if (product) {
        product.ComplianceStandards = target.innerText;
        const el = document.getElementById('dsEditCompliance');
        if (el) el.value = product.ComplianceStandards;
      }
      return;
    }
  });

  // Parameter Name (th) update when user finishes typing and leaves the cell
  dsPaper.addEventListener('focusout', (e) => {
    const th = e.target.closest('th[data-col="key"]');
    if (!th) return;

    const oldKey = th.dataset.origKey;
    const newKey = th.innerText.trim();
    if (!newKey || oldKey === newKey) return;

    const product = getSelectedProduct();
    if (product && product.Specifications) {
      const val = product.Specifications[oldKey];
      delete product.Specifications[oldKey];
      product.Specifications[newKey] = val;

      th.dataset.origKey = newKey;
      const tr = th.closest('tr');
      if (tr) {
        tr.dataset.specKey = newKey;
        const td = tr.querySelector('td[data-col="val"]');
        if (td) td.dataset.origKey = newKey;
      }

      // Update left editor in background
      renderPreExistingFieldsEditor();
    }
  });
}

function bindDatasheetSubtabs() {
  const btnSettings = document.getElementById('btnDsTabSettings');
  const btnFields = document.getElementById('btnDsTabFields');
  const panelSettings = document.getElementById('dsPanelSettings');
  const panelFields = document.getElementById('dsPanelFields');

  if (btnSettings && btnFields) {
    btnSettings.addEventListener('click', () => {
      btnSettings.classList.add('active');
      btnFields.classList.remove('active');
      if (panelSettings) panelSettings.style.display = 'flex';
      if (panelFields) panelFields.style.display = 'none';
    });

    btnFields.addEventListener('click', () => {
      btnFields.classList.add('active');
      btnSettings.classList.remove('active');
      if (panelFields) panelFields.style.display = 'flex';
      if (panelSettings) panelSettings.style.display = 'none';
      renderPreExistingFieldsEditor();
    });
  }
}

function bindLeftPanelFieldListeners() {
  const nameInput = document.getElementById('dsEditName');
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      const product = getSelectedProduct();
      if (!product) return;
      product.Name = e.target.value;
      const el = document.getElementById('previewProductName');
      if (el) el.textContent = product.Name;
      const opt = document.querySelector(`#dsProductSelect option[value="${product.Id}"]`);
      if (opt) opt.textContent = product.Name;
    });
  }

  const skuInput = document.getElementById('dsEditSKU');
  if (skuInput) {
    skuInput.addEventListener('input', (e) => {
      const product = getSelectedProduct();
      if (!product) return;
      product.SKU = e.target.value;
      const el = document.getElementById('previewSKU');
      if (el) el.textContent = product.SKU;
    });
  }

  const revInput = document.getElementById('dsEditRevision');
  if (revInput) {
    revInput.addEventListener('input', (e) => {
      const product = getSelectedProduct();
      if (!product) return;
      product.Revision = e.target.value;
      const el = document.getElementById('previewRev');
      if (el) el.textContent = product.Revision;
    });
  }

  const sumInput = document.getElementById('dsEditSummary');
  if (sumInput) {
    sumInput.addEventListener('input', (e) => {
      const product = getSelectedProduct();
      if (!product) return;
      product.Summary = e.target.value;
      const el = document.getElementById('previewSummary');
      if (el) el.textContent = product.Summary;
    });
  }

  const wInput = document.getElementById('dsEditWarranty');
  if (wInput) {
    wInput.addEventListener('input', (e) => {
      const product = getSelectedProduct();
      if (!product) return;
      product.WarrantyMonths = Number(e.target.value) || 36;
      const el = document.getElementById('previewWarranty');
      if (el) el.textContent = `${product.WarrantyMonths} Months Factory Warranty`;
    });
  }

  const compInput = document.getElementById('dsEditCompliance');
  if (compInput) {
    compInput.addEventListener('input', (e) => {
      const product = getSelectedProduct();
      if (!product) return;
      product.ComplianceStandards = e.target.value;
      const el = document.getElementById('previewCompliance');
      if (el) el.textContent = product.ComplianceStandards;
    });
  }
}

function renderDatasheetHistory() {
  const box = document.getElementById('datasheetHistoryList');
  if (!box) return;
  if (!appState.datasheets.length) {
    box.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem;">No submittals logged.</div>`;
    return;
  }
  box.innerHTML = appState.datasheets.slice(0, 4).map(d => {
    const p = appState.products.find(x => x.Id === d.ProductId);
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0.55rem; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:4px; cursor:pointer; transition:background-color 0.15s ease;" title="Click to load this submittal" onclick="window.loadPreviousDatasheet(${d.Id})">
        <span class="mono" style="font-size:0.75rem;"><strong>${escapeHtml(d.DocumentCode)}</strong> (${p ? escapeHtml(p.Name.slice(0, 18)) : 'Device'})</span>
        <span style="color:var(--text-secondary); font-size:0.7rem;">${d.GeneratedAt ? d.GeneratedAt.slice(0, 10) : 'Submittal'}</span>
      </div>
    `;
  }).join('');
}

// -----------------------------------------------------------------------------
// PREVIOUS DATASHEETS ARCHIVE & VIEW SWITCHER
// -----------------------------------------------------------------------------
function switchDsView(mode) {
  // mode: 'creator' or 'history'
  const workspaceEl = document.querySelector('.datasheet-workspace');
  const historyViewEl = document.getElementById('dsViewHistory');
  const btnModeCreator = document.getElementById('btnDsModeCreator');
  const btnModeHistory = document.getElementById('btnDsModeHistory');
  const btnNavCreateDs = document.getElementById('btnNavCreateDs');
  const btnNavHistoryDs = document.getElementById('btnNavHistoryDs');
  const creatorActions = document.getElementById('dsCreatorActionRow');
  const historyActions = document.getElementById('dsHistoryActionRow');
  const heading = document.getElementById('dsModuleHeading');
  const subheading = document.getElementById('dsModuleSubheading');

  switchTab('tab-datasheets');

  if (mode === 'history') {
    if (workspaceEl) workspaceEl.style.display = 'none';
    if (historyViewEl) historyViewEl.style.display = 'flex';

    if (btnModeCreator) {
      btnModeCreator.classList.remove('active');
      btnModeCreator.setAttribute('aria-selected', 'false');
    }
    if (btnModeHistory) {
      btnModeHistory.classList.add('active');
      btnModeHistory.setAttribute('aria-selected', 'true');
    }

    if (btnNavCreateDs) btnNavCreateDs.classList.remove('active');
    if (btnNavHistoryDs) btnNavHistoryDs.classList.add('active');

    if (creatorActions) creatorActions.style.display = 'none';
    if (historyActions) historyActions.style.display = 'flex';

    if (heading) heading.textContent = 'Issued Technical Datasheets Archive';
    if (subheading) subheading.textContent = 'Review, reload, or reprint previously generated official submittals with device names, issued authorities, and dates.';

    renderPreviousDatasheetsTable();
  } else {
    if (workspaceEl) workspaceEl.style.display = 'grid';
    if (historyViewEl) historyViewEl.style.display = 'none';

    if (btnModeCreator) {
      btnModeCreator.classList.add('active');
      btnModeCreator.setAttribute('aria-selected', 'true');
    }
    if (btnModeHistory) {
      btnModeHistory.classList.remove('active');
      btnModeHistory.setAttribute('aria-selected', 'false');
    }

    if (btnNavCreateDs) btnNavCreateDs.classList.add('active');
    if (btnNavHistoryDs) btnNavHistoryDs.classList.remove('active');

    if (creatorActions) creatorActions.style.display = 'flex';
    if (historyActions) historyActions.style.display = 'none';

    if (heading) heading.textContent = 'Product Technical Datasheet Generator';
    if (subheading) subheading.textContent = 'Configure product parameters, project submittal metadata, and export print-ready technical datasheets.';
  }
}

function renderPreviousDatasheetsTable() {
  const tbody = document.getElementById('dsHistoryTableBody');
  if (!tbody) return;

  const search = (document.getElementById('dsHistorySearch')?.value || '').toLowerCase().trim();
  const authFilter = document.getElementById('dsHistoryAuthorityFilter')?.value || 'ALL';

  // Populate authority filter dropdown options dynamically
  const authSelect = document.getElementById('dsHistoryAuthorityFilter');
  if (authSelect) {
    const authorities = [...new Set(appState.datasheets.map(d => d.CustomClientName).filter(Boolean))].sort();
    const currentVal = authSelect.value;
    authSelect.innerHTML = '<option value="ALL">All Authorities / Clients</option>' +
      authorities.map(a => `<option value="${escapeAttr(a)}">${escapeHtml(a)}</option>`).join('');
    if (authorities.includes(currentVal)) {
      authSelect.value = currentVal;
    }
  }

  // Calculate KPIs
  const totalSubmittals = appState.datasheets.length;
  const uniqueProductIds = new Set(appState.datasheets.map(d => d.ProductId));
  const uniqueAuthorities = new Set(appState.datasheets.map(d => d.CustomClientName).filter(Boolean));
  const latestEntry = appState.datasheets[0];

  const kpiTotalEl = document.getElementById('kpiHistoryTotal');
  if (kpiTotalEl) kpiTotalEl.textContent = totalSubmittals;
  const kpiDevicesEl = document.getElementById('kpiHistoryDevices');
  if (kpiDevicesEl) kpiDevicesEl.textContent = uniqueProductIds.size;
  const kpiAuthEl = document.getElementById('kpiHistoryAuthorities');
  if (kpiAuthEl) kpiAuthEl.textContent = uniqueAuthorities.size;
  const kpiLatestDateEl = document.getElementById('kpiHistoryLatestDate');
  if (kpiLatestDateEl) {
    kpiLatestDateEl.textContent = latestEntry && latestEntry.GeneratedAt ? latestEntry.GeneratedAt.slice(0, 10) : 'None';
  }
  const kpiLatestIssuerEl = document.getElementById('kpiHistoryLatestIssuer');
  if (kpiLatestIssuerEl) {
    kpiLatestIssuerEl.textContent = latestEntry ? (latestEntry.GeneratedBy || 'Engineering Team') : '-';
  }

  // Filter datasheets
  const filtered = appState.datasheets.filter(d => {
    const p = appState.products.find(x => x.Id === d.ProductId);
    const prodName = p ? p.Name : '';
    const prodSku = p ? p.SKU : '';
    const prodCat = p ? p.Category : '';
    const authority = d.CustomClientName || '';
    const project = d.CustomProjectName || '';
    const issuer = d.GeneratedBy || '';
    const docCode = d.DocumentCode || '';

    const matchesSearch = !search ||
      prodName.toLowerCase().includes(search) ||
      prodSku.toLowerCase().includes(search) ||
      prodCat.toLowerCase().includes(search) ||
      authority.toLowerCase().includes(search) ||
      project.toLowerCase().includes(search) ||
      issuer.toLowerCase().includes(search) ||
      docCode.toLowerCase().includes(search);

    const matchesAuth = authFilter === 'ALL' || authority === authFilter;

    return matchesSearch && matchesAuth;
  });

  const countBadge = document.getElementById('dsHistoryFilteredCount');
  if (countBadge) countBadge.textContent = filtered.length;

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:2rem 1rem; color:var(--text-muted);">
          <div style="font-size:0.9rem; font-weight:600; margin-bottom:0.35rem;">No previous datasheets found</div>
          <div style="font-size:0.78rem;">${search ? 'Try adjusting your search or authority filter.' : 'Generate your first product datasheet using the creator workspace.'}</div>
          <button type="button" class="btn btn-sm btn-primary" onclick="switchDsView('creator')" style="margin-top:0.75rem;">
            ➕ Go to Datasheet Creator
          </button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const p = appState.products.find(x => x.Id === d.ProductId);
    const devName = p ? p.Name : `Device Model #${d.ProductId}`;
    const devSku = p ? p.SKU : '';
    const devCat = p ? p.Category : 'Hardware';
    const authority = d.CustomClientName || 'Direct Official Submittal';
    const issuer = d.GeneratedBy || 'Engineering Team';
    const initial = issuer.trim().charAt(0).toUpperCase() || 'E';
    const dateStr = d.GeneratedAt ? d.GeneratedAt.slice(0, 10) : '2026-10-29';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--text-primary); font-size:0.88rem;">${escapeHtml(devName)}</div>
          <div style="display:flex; align-items:center; gap:0.4rem; margin-top:0.25rem; flex-wrap:wrap;">
            <span class="badge badge-blue" style="font-size:0.66rem;">${escapeHtml(devCat)}</span>
            ${devSku ? `<span class="mono" style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(devSku)}</span>` : ''}
            <span class="mono badge" style="font-size:0.66rem; background:#f1f5f9; color:#0369a1; border-color:#cbd5e1;">${escapeHtml(d.DocumentCode)}</span>
          </div>
        </td>
        <td>
          <div style="font-weight:600; color:var(--text-primary); font-size:0.83rem;">${escapeHtml(authority)}</div>
          ${d.CustomProjectName ? `<div style="font-size:0.74rem; color:var(--text-secondary); margin-top:0.15rem;">${escapeHtml(d.CustomProjectName)}</div>` : ''}
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:0.45rem;">
            <span class="user-avatar-chip">${escapeHtml(initial)}</span>
            <span style="font-weight:500; font-size:0.82rem; color:var(--text-primary);">${escapeHtml(issuer)}</span>
          </div>
        </td>
        <td>
          <div class="mono" style="font-size:0.82rem; font-weight:600; color:var(--text-primary);">${escapeHtml(dateStr)}</div>
          <div style="font-size:0.68rem; color:var(--text-muted);">${escapeHtml(d.Version || 'Rev 2026.1')}</div>
        </td>
        <td>
          <div class="action-row" style="justify-content:flex-end;">
            <button class="btn btn-sm btn-primary" type="button" title="Open this datasheet in creator" onclick="window.loadPreviousDatasheet(${d.Id})">
              👁️ View / Load
            </button>
            <button class="btn btn-sm" type="button" title="Print this datasheet" onclick="window.printPreviousDatasheet(${d.Id})">
              🖨️ Print
            </button>
            <button class="btn btn-sm btn-danger" type="button" title="Delete archive record" onclick="window.deletePreviousDatasheet(${d.Id})">
              ✕
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.loadPreviousDatasheet = function (id) {
  const d = appState.datasheets.find(x => x.Id === Number(id));
  if (!d) return;

  const product = appState.products.find(p => p.Id === d.ProductId);
  if (product) {
    const catSelect = document.getElementById('dsCategoryFilter');
    if (catSelect) {
      catSelect.value = 'ALL';
      renderDatasheetModule();
    }
    const prodSelect = document.getElementById('dsProductSelect');
    if (prodSelect) {
      prodSelect.value = product.Id;
    }
  }

  const docCodeInput = document.getElementById('dsDocCode');
  if (docCodeInput) docCodeInput.value = d.DocumentCode || 'DS-MTX-2026-001';

  const clientInput = document.getElementById('dsCustomClient');
  if (clientInput) clientInput.value = d.CustomClientName || '';

  const projectInput = document.getElementById('dsCustomProject');
  if (projectInput) projectInput.value = d.CustomProjectName || '';

  const issuerInput = document.getElementById('dsIssuedBy');
  if (issuerInput) issuerInput.value = d.GeneratedBy || '';

  const dateInput = document.getElementById('dsIssueDate');
  if (dateInput) dateInput.value = d.GeneratedAt ? d.GeneratedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

  updateDatasheetPreview(true);
  switchDsView('creator');

  // Flash confirmation message
  const statusEl = document.getElementById('dsEditSaveStatus');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.background = '#e0f2fe';
    statusEl.style.color = '#0369a1';
    statusEl.textContent = `✓ Loaded submittal "${d.DocumentCode}" for ${product ? product.Name : 'device'}`;
    setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 4000);
  }
};

window.printPreviousDatasheet = function (id) {
  window.loadPreviousDatasheet(id);
  setTimeout(() => window.print(), 350);
};

window.deletePreviousDatasheet = async function (id) {
  const d = appState.datasheets.find(x => x.Id === Number(id));
  const docCode = d ? d.DocumentCode : `ID #${id}`;
  if (!confirm(`Are you sure you want to remove archived submittal "${docCode}"?`)) return;

  try {
    await fetch(`/api/datasheets/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('Backend delete response:', err);
  }

  appState.datasheets = appState.datasheets.filter(x => x.Id !== Number(id));
  renderPreviousDatasheetsTable();
  renderDatasheetHistory();
  renderAllCounts();
};


// MODULE 2: SHARED CONTACTS & PHONE VCARD (.VCF) IMPORT/EXPORT
// =============================================================================
function renderContactsModule() {
  const accessible = getAccessibleContacts();
  document.getElementById('kpiTotalContacts').textContent = appState.contacts.length;
  document.getElementById('kpiVisibleContacts').textContent = accessible.length;
  document.getElementById('kpiRolePermissionLabel').textContent = `${appState.activeUser.FullName} (${appState.activeUser.Role})`;

  const search = (document.getElementById('contactSearchInput').value || '').toLowerCase().trim();
  const facFilter = document.getElementById('contactFactoryFilter').value;
  const visFilter = document.getElementById('contactVisibilityFilter').value;

  const filtered = accessible.filter(c => {
    if (facFilter && String(c.FactoryId) !== String(facFilter)) return false;
    if (visFilter && c.VisibilityLevel !== visFilter) return false;
    if (!search) return true;
    const hay = `${c.FullName} ${c.JobTitle} ${c.CompanyName} ${c.Email} ${c.Phone} ${c.MobilePhone} ${c.Tags} ${c.Notes}`.toLowerCase();
    return hay.includes(search);
  });

  const tbody = document.getElementById('contactsTableBody');
  tbody.innerHTML = filtered.map(c => {
    const fac = appState.factories.find(f => f.Id === Number(c.FactoryId));
    const visBadge = c.VisibilityLevel === 'AdminOnly'
      ? `<span class="badge badge-admin">AdminOnly</span>`
      : c.VisibilityLevel === 'Restricted'
      ? `<span class="badge badge-restricted">Restricted</span>`
      : `<span class="badge badge-public">Public</span>`;

    return `
      <tr>
        <th>
          <div style="font-size:0.84rem; font-weight:700; color:var(--text-primary);">${c.FullName}</div>
          <div style="font-size:0.7rem; color:var(--text-muted); font-weight:400;">Source: ${c.Source || 'Manual'}</div>
        </th>
        <td>
          <div style="font-weight:600; color:var(--text-primary);">${c.JobTitle || 'Representative'}</div>
          <div style="font-size:0.76rem; color:var(--accent-primary);">${fac ? fac.Name : (c.CompanyName || 'External Organization')}</div>
        </td>
        <td>
          <div class="mono"><strong>${c.Phone}</strong></div>
          ${c.MobilePhone && c.MobilePhone !== c.Phone ? `<div class="mono" style="font-size:0.74rem; color:var(--text-secondary);">Alt: ${c.MobilePhone}</div>` : ''}
          ${c.Email ? `<div style="font-size:0.76rem; color:var(--text-secondary);">${c.Email}</div>` : ''}
        </td>
        <td>
          <div style="margin-bottom:0.25rem;">
            ${(c.Tags || '').split(',').filter(Boolean).map(t => `<span class="badge badge-blue" style="margin-right:4px;">${t.trim()}</span>`).join('')}
          </div>
          <div style="font-size:0.76rem; color:var(--text-secondary); max-width:320px;">${c.Notes || ''}</div>
        </td>
        <td>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
            ${visBadge}
            <div class="action-row">
              <button class="btn btn-sm" type="button" onclick="downloadSingleContactVCard(${c.Id})">Export .vcf</button>
              <button class="btn btn-sm btn-danger" type="button" onclick="deleteContact(${c.Id})">Delete</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function parseVCardOrCSV(rawText, fileName = '') {
  const results = [];
  if (rawText.includes('BEGIN:VCARD')) {
    const cards = rawText.split(/END:VCARD/i);
    for (const block of cards) {
      if (!/BEGIN:VCARD/i.test(block)) continue;
      const lines = block.split(/\r?\n/);
      let fullName = '';
      let org = '';
      let title = '';
      let email = '';
      let phones = [];
      let note = '';

      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const keyPart = line.slice(0, idx).toUpperCase();
        const valPart = line.slice(idx + 1).trim();

        if (keyPart.startsWith('FN')) {
          fullName = valPart;
        } else if (!fullName && keyPart.startsWith('N')) {
          const parts = valPart.split(';').filter(Boolean);
          fullName = parts.reverse().join(' ').trim();
        } else if (keyPart.startsWith('ORG')) {
          org = valPart.replace(/;/g, ' ').trim();
        } else if (keyPart.startsWith('TITLE')) {
          title = valPart;
        } else if (keyPart.startsWith('TEL')) {
          phones.push(valPart);
        } else if (keyPart.startsWith('EMAIL')) {
          email = valPart;
        } else if (keyPart.startsWith('NOTE')) {
          note = valPart;
        }
      }

      if (fullName || phones.length) {
        results.push({
          FullName: fullName || 'Imported Contact',
          JobTitle: title || 'Contact',
          CompanyName: org || 'Mobile Import',
          Phone: phones[0] || '',
          MobilePhone: phones[1] || phones[0] || '',
          Email: email,
          Source: 'Phone_vCard_Import',
          Tags: 'vCard Import',
          Notes: note || `Imported from vCard (${fileName || 'vCard'})`
        });
      }
    }
  } else {
    const rows = rawText.split(/\r?\n/).filter(r => r.trim().length > 0);
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
      if (cols.length >= 2) {
        results.push({
          FullName: cols[0] || 'CSV Contact',
          CompanyName: cols[1] || '',
          JobTitle: cols[2] || '',
          Phone: cols[3] || cols[1] || '',
          MobilePhone: cols[3] || '',
          Email: cols[4] || '',
          Source: 'CSV_Import',
          Tags: 'CSV Import',
          Notes: cols[5] || 'Imported via CSV'
        });
      }
    }
  }
  return results;
}

function buildVCardString(contact) {
  const fac = appState.factories.find(f => f.Id === Number(contact.FactoryId));
  const company = fac ? fac.Name : (contact.CompanyName || 'Matrix Partner');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.FullName}`,
    `ORG:${company}`,
    `TITLE:${contact.JobTitle || ''}`,
    `TEL;TYPE=WORK,VOICE:${contact.Phone || ''}`,
    contact.MobilePhone ? `TEL;TYPE=CELL,VOICE:${contact.MobilePhone}` : '',
    contact.Email ? `EMAIL;TYPE=PREF,INTERNET:${contact.Email}` : '',
    `NOTE:${(contact.Notes || '').replace(/\r?\n/g, ' ')}`,
    'END:VCARD'
  ].filter(Boolean).join('\r\n');
}

window.downloadSingleContactVCard = function (contactId) {
  const c = appState.contacts.find(x => x.Id === Number(contactId));
  if (!c) return;
  const vcf = buildVCardString(c);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c.FullName.replace(/\s+/g, '_')}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
};

window.deleteContact = async function (contactId) {
  await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
  appState.contacts = appState.contacts.filter(c => c.Id !== Number(contactId));
  renderContactsModule();
  renderAllCounts();
};

// =============================================================================
// MODULE: TENDER PIPELINE & BIDDING TRACKER
// =============================================================================
function renderTenderTrackerModule() {
  const tableBody = document.getElementById('tenderTrackerTableBody');
  if (!tableBody) return;

  const search = (document.getElementById('tenderSearchInput')?.value || '').toLowerCase().trim();
  const stageFilter = document.getElementById('tenderStatusFilter')?.value || 'ALL';
  const clientFilter = document.getElementById('tenderClientFilter')?.value || 'ALL';

  // Populate client dropdown
  const clientDropdown = document.getElementById('tenderClientFilter');
  if (clientDropdown) {
    const clients = [...new Set(appState.tenders.map(t => t.ClientName).filter(Boolean))].sort();
    const currentVal = clientDropdown.value;
    clientDropdown.innerHTML = '<option value="ALL">All Clients / Authorities</option>' +
      clients.map(c => `<option value="${c}">${c}</option>`).join('');
    if (clients.includes(currentVal)) {
      clientDropdown.value = currentVal;
    }
  }

  // Filter tenders
  const filtered = appState.tenders.filter(t => {
    const matchesSearch = !search ||
      (t.ReferenceNumber || '').toLowerCase().includes(search) ||
      (t.Title || '').toLowerCase().includes(search) ||
      (t.ClientName || '').toLowerCase().includes(search) ||
      (t.AssignedLead || '').toLowerCase().includes(search);

    let matchesStage = true;
    if (stageFilter === 'ACTIVE') {
      matchesStage = ['Drafting', 'Analyzing', 'Under Pricing'].includes(t.Status);
    } else if (stageFilter !== 'ALL') {
      matchesStage = t.Status === stageFilter;
    }

    const matchesClient = clientFilter === 'ALL' || t.ClientName === clientFilter;

    return matchesSearch && matchesStage && matchesClient;
  });

  // Calculate KPIs
  const totalCount = appState.tenders.length;
  const activePipelineVal = appState.tenders
    .filter(t => ['Drafting', 'Analyzing', 'Under Pricing'].includes(t.Status))
    .reduce((sum, t) => sum + (Number(t.TotalEstimatedValue) || 0), 0);
  const submittedCount = appState.tenders.filter(t => t.Status === 'Submitted').length;
  const wonTenders = appState.tenders.filter(t => t.Status === 'Won');
  const wonVal = wonTenders.reduce((sum, t) => sum + (Number(t.TotalEstimatedValue) || 0), 0);
  const decidedCount = appState.tenders.filter(t => ['Won', 'Lost'].includes(t.Status)).length;
  const winRate = decidedCount > 0 ? Math.round((wonTenders.length / decidedCount) * 100) : 0;

  if (document.getElementById('kpiTotalTenders')) document.getElementById('kpiTotalTenders').textContent = totalCount;
  if (document.getElementById('kpiActivePipelineVal')) document.getElementById('kpiActivePipelineVal').textContent = '$' + activePipelineVal.toLocaleString();
  if (document.getElementById('kpiSubmittedTenders')) document.getElementById('kpiSubmittedTenders').textContent = submittedCount;
  if (document.getElementById('kpiWonContractsVal')) document.getElementById('kpiWonContractsVal').textContent = '$' + wonVal.toLocaleString();
  if (document.getElementById('kpiWinRateText')) document.getElementById('kpiWinRateText').textContent = `Win Rate: ${winRate}% (${wonTenders.length} Won / ${decidedCount} Decided)`;

  // Render Table
  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No tenders match the current filters. Click "+ Track New Tender" to add one.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered.map(t => {
    // Stage Badge Class
    let badgeClass = 'badge-drafting';
    if (t.Status === 'Under Pricing') badgeClass = 'badge-pricing';
    else if (t.Status === 'Analyzing') badgeClass = 'badge-analyzing';
    else if (t.Status === 'Submitted') badgeClass = 'badge-submitted';
    else if (t.Status === 'Won') badgeClass = 'badge-won';
    else if (t.Status === 'Lost') badgeClass = 'badge-lost';

    // Deadline badge & calculation
    const deadlineDate = t.SubmissionDeadline ? new Date(t.SubmissionDeadline) : null;
    let deadlineBadge = '';
    if (t.Status === 'Won') {
      deadlineBadge = '<span class="badge badge-won" style="margin-left:0.35rem;">Awarded</span>';
    } else if (t.Status === 'Lost') {
      deadlineBadge = '<span class="badge badge-lost" style="margin-left:0.35rem;">Closed</span>';
    } else if (deadlineDate && !isNaN(deadlineDate)) {
      const now = new Date();
      const diffDays = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        deadlineBadge = '<span class="badge badge-lost" style="margin-left:0.35rem;">Expired</span>';
      } else if (diffDays <= 7) {
        deadlineBadge = `<span class="badge badge-restricted" style="margin-left:0.35rem;">${diffDays}d left!</span>`;
      } else {
        deadlineBadge = `<span class="badge badge-blue" style="margin-left:0.35rem;">${diffDays}d left</span>`;
      }
    }

    const valFormatted = t.TotalEstimatedValue
      ? '$' + Number(t.TotalEstimatedValue).toLocaleString() + ' ' + (t.Currency || 'USD')
      : '<span style="color:#94a3b8;">Pending BOQ</span>';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#1e3a8a; font-family:'SFMono-Regular',Consolas,monospace;">${t.ReferenceNumber}</div>
          <div style="font-weight:600; color:#0f172a; margin-top:0.15rem; font-size:0.8rem;">${t.Title}</div>
          ${t.Notes ? `<div style="font-size:0.72rem; color:#64748b; margin-top:0.2rem;">${t.Notes}</div>` : ''}
        </td>
        <td>
          <div style="font-weight:600;">${t.ClientName}</div>
          <div style="font-size:0.72rem; color:#64748b;">${t.Country || 'Jordan'}${t.AssignedLead ? ' • Lead: ' + t.AssignedLead : ''}</div>
          ${t.BidBond ? `<div style="font-size:0.7rem; color:#0369a1; margin-top:0.2rem;">Bond: ${t.BidBond}</div>` : ''}
        </td>
        <td style="font-weight:700; font-family:'SFMono-Regular',Consolas,monospace;">
          ${valFormatted}
        </td>
        <td>
          <div>${t.SubmissionDeadline ? t.SubmissionDeadline.slice(0, 10) : 'TBD'}</div>
          ${deadlineBadge}
        </td>
        <td>
          <select class="badge ${badgeClass}" style="cursor:pointer; font-weight:700; border-radius:3px; padding:0.2rem 0.4rem;" onchange="window.updateTenderStage(${t.Id}, this.value)">
            <option value="Drafting" ${t.Status === 'Drafting' ? 'selected' : ''}>Drafting</option>
            <option value="Analyzing" ${t.Status === 'Analyzing' ? 'selected' : ''}>Analyzing</option>
            <option value="Under Pricing" ${t.Status === 'Under Pricing' ? 'selected' : ''}>Under Pricing</option>
            <option value="Submitted" ${t.Status === 'Submitted' ? 'selected' : ''}>Submitted</option>
            <option value="Won" ${t.Status === 'Won' ? 'selected' : ''}>Won (Awarded)</option>
            <option value="Lost" ${t.Status === 'Lost' ? 'selected' : ''}>Lost / Closed</option>
          </select>
        </td>
        <td>
          <div class="tender-quick-actions">
            <button class="btn btn-sm" type="button" title="Analyze specs in AI Analyzer" onclick="window.quickAnalyzeTender(${t.Id})">Analyze</button>
            <button class="btn btn-sm" type="button" title="Open in Price Estimator" onclick="switchTab('tab-pricing')">Price</button>
            <button class="btn btn-sm" type="button" title="Edit Tender" onclick="window.openEditTenderModal(${t.Id})">✎</button>
            <button class="btn btn-sm btn-danger" type="button" title="Delete Tender" onclick="window.deleteTender(${t.Id})">✕</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.updateTenderStage = async function (id, newStatus) {
  const tender = appState.tenders.find(t => t.Id === Number(id));
  if (!tender) return;
  tender.Status = newStatus;
  await fetch(`/api/tenders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Status: newStatus })
  });
  renderTenderTrackerModule();
};

window.openEditTenderModal = function (id) {
  const tender = appState.tenders.find(t => t.Id === Number(id));
  if (!tender) return;

  document.getElementById('dialogNewTenderTitle').textContent = `Edit Tender: ${tender.ReferenceNumber}`;
  document.getElementById('editTenderId').value = tender.Id;
  document.getElementById('newTenderRef').value = tender.ReferenceNumber;
  document.getElementById('newTenderClient').value = tender.ClientName;
  document.getElementById('newTenderTitle').value = tender.Title;
  document.getElementById('newTenderValue').value = tender.TotalEstimatedValue || '';
  document.getElementById('newTenderDeadline').value = tender.SubmissionDeadline ? tender.SubmissionDeadline.slice(0, 10) : '';
  document.getElementById('newTenderBidBond').value = tender.BidBond || '';
  document.getElementById('newTenderStage').value = tender.Status || 'Drafting';
  document.getElementById('newTenderLead').value = tender.AssignedLead || '';
  document.getElementById('newTenderCountry').value = tender.Country || 'Jordan';
  document.getElementById('newTenderNotes').value = tender.Notes || '';

  document.getElementById('dialogNewTender').showModal();
};

window.deleteTender = async function (id) {
  if (!confirm('Are you sure you want to remove this tender from the tracker?')) return;
  await fetch(`/api/tenders/${id}`, { method: 'DELETE' });
  appState.tenders = appState.tenders.filter(t => t.Id !== Number(id));
  renderTenderTrackerModule();
  renderAllCounts();
};

window.quickAnalyzeTender = function (id) {
  const tender = appState.tenders.find(t => t.Id === Number(id));
  if (!tender) return;
  switchTab('tab-tenders');
  const titleEl = document.getElementById('tenderInputTitle');
  const clientEl = document.getElementById('tenderInputClient');
  const refEl = document.getElementById('tenderInputRef');
  if (titleEl) titleEl.value = tender.Title;
  if (clientEl) clientEl.value = tender.ClientName;
  if (refEl) refEl.value = tender.ReferenceNumber;
};

window.exportTendersToCSV = function () {
  const headers = ['ID', 'Reference', 'Client', 'Country', 'Title', 'Estimated_Value_USD', 'Submission_Deadline', 'Status', 'Bid_Bond', 'Lead', 'Notes'];
  const rows = appState.tenders.map(t => [
    t.Id,
    `"${(t.ReferenceNumber || '').replace(/"/g, '""')}"`,
    `"${(t.ClientName || '').replace(/"/g, '""')}"`,
    `"${(t.Country || 'Jordan').replace(/"/g, '""')}"`,
    `"${(t.Title || '').replace(/"/g, '""')}"`,
    t.TotalEstimatedValue || 0,
    t.SubmissionDeadline ? t.SubmissionDeadline.slice(0, 10) : '',
    t.Status || 'Drafting',
    `"${(t.BidBond || '').replace(/"/g, '""')}"`,
    `"${(t.AssignedLead || '').replace(/"/g, '""')}"`,
    `"${(t.Notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Matrix_Tenders_Pipeline_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};


// MODULE 3: AI TENDER DOCUMENT ANALYZER & FEEDBACK LEARNING ENGINE
// =============================================================================
function renderTendersModule() {
  const tender = appState.tenders[0];
  const filterVal = document.getElementById('tenderFilterImportance').value || 'ALL';
  const container = document.getElementById('tenderExtractionsContainer');
  const answerBanner = document.getElementById('tenderCustomAnswerBanner');

  if (!tender) {
    container.innerHTML = `<div>No tender clauses loaded.</div>`;
    return;
  }

  document.getElementById('activeTenderHeaderTitle').textContent =
    `${tender.ReferenceNumber} — ${tender.Title}`;

  if (tender.CustomQuestionAnswer) {
    answerBanner.style.display = 'block';
    answerBanner.innerHTML = `<strong>Query Response:</strong> ${tender.CustomQuestionAnswer}`;
  } else {
    answerBanner.style.display = 'none';
  }

  const extractions = (tender.Extractions || []).filter(e => {
    if (filterVal === 'ALL') return true;
    return e.ImportanceFlag === filterVal;
  });

  container.innerHTML = extractions.map(ext => {
    const isImportant = ext.ImportanceFlag === 'Important';
    const isNotNeeded = ext.ImportanceFlag === 'NotNeeded';
    const leftBorder = isImportant ? '4px solid #059669' : isNotNeeded ? '4px solid #dc2626' : '4px solid #94a3b8';
    const badgeHtml = isImportant
      ? `<span class="badge badge-public">Important (${ext.AIConfidence}%)</span>`
      : isNotNeeded
      ? `<span class="badge badge-admin">Not Needed</span>`
      : `<span class="badge badge-blue">Standard</span>`;

    return `
      <div style="background:var(--bg-subtle); border:1px solid var(--border-color); border-left:${leftBorder}; border-radius:4px; padding:0.85rem; opacity:${isNotNeeded ? '0.65' : '1'};">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.35rem; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:0.45rem;">
            <span class="badge badge-blue">${ext.Category}</span>
            <strong style="font-size:0.84rem; color:var(--text-primary);">${ext.RequirementTitle}</strong>
          </div>
          ${badgeHtml}
        </div>
        <p style="font-size:0.8rem; color:var(--text-primary); margin-bottom:0.5rem;">${ext.ExtractedDetail}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; font-size:0.74rem; color:var(--text-secondary);">
          <div><strong>Ref:</strong> ${ext.PageReference || 'Clause'} | <em>${ext.UserFeedbackNote || ''}</em></div>
          <div class="action-row">
            <button class="btn btn-sm btn-success" type="button" onclick="flagTenderExtraction(${tender.Id}, ${ext.Id}, 'Important')">
              Mark Important
            </button>
            <button class="btn btn-sm btn-danger" type="button" onclick="flagTenderExtraction(${tender.Id}, ${ext.Id}, 'NotNeeded')">
              Mark Not Needed
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  renderAIRulesList();
}

function renderAIRulesList() {
  const box = document.getElementById('aiRulesListContainer');
  box.innerHTML = appState.aiFeedbackRules.map(rule => {
    const isImp = rule.LearnedAction === 'FlagImportant';
    return `
      <div style="padding:0.65rem 0.8rem; background:var(--bg-subtle); border:1px solid var(--border-color); border-left:3px solid ${isImp ? '#059669' : '#dc2626'}; border-radius:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
          <span class="badge ${isImp ? 'badge-public' : 'badge-admin'}">
            ${isImp ? 'Rule: Important' : 'Rule: Suppress / Not Needed'}
          </span>
          <span class="mono" style="font-size:0.7rem; color:var(--text-muted);">Matches: ${rule.TimesApplied}</span>
        </div>
        <div style="font-weight:700; font-size:0.8rem; color:var(--text-primary); margin-bottom:0.15rem;">${rule.PatternOrTopic}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">${rule.Reason || ''}</div>
      </div>
    `;
  }).join('');
}

window.flagTenderExtraction = async function (tenderId, extId, importanceFlag) {
  const res = await fetch(`/api/tenders/${tenderId}/extractions/${extId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      importanceFlag,
      userName: appState.activeUser ? appState.activeUser.FullName : 'Mohammed Al-Mansoor'
    })
  });
  const data = await res.json();
  if (data.tender) {
    const idx = appState.tenders.findIndex(t => t.Id === Number(tenderId));
    if (idx !== -1) appState.tenders[idx] = data.tender;
  }
  if (data.aiFeedbackRules) {
    appState.aiFeedbackRules = data.aiFeedbackRules;
  }
  renderTendersModule();
  renderAllCounts();
};

// =============================================================================
// MODULE 4: SAVED FACTORIES DIRECTORY
// =============================================================================
function renderFactoriesModule() {
  const q = (document.getElementById('factorySearchInput').value || '').toLowerCase().trim();
  const grid = document.getElementById('factoriesCardsGrid');

  const filtered = appState.factories.filter(f => {
    if (!q) return true;
    const hay = `${f.Name} ${f.Code} ${f.Specialization} ${f.Capabilities} ${f.Certifications} ${f.Country} ${f.City} ${f.Notes}`.toLowerCase();
    return hay.includes(q);
  });

  grid.innerHTML = filtered.map(f => {
    const linkedContacts = getAccessibleContacts().filter(c => Number(c.FactoryId) === Number(f.Id));
    const linkedProducts = appState.products.filter(p => Number(p.FactoryId) === Number(f.Id));

    return `
      <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:4px; padding:1rem; display:flex; flex-direction:column; gap:0.65rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; border-bottom:1px solid var(--border-subtle); padding-bottom:0.55rem;">
          <div>
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span class="badge ${f.Status === 'Our Factory' ? 'badge-public' : 'badge-blue'}">${f.Status}</span>
              <span class="mono" style="color:var(--text-muted);">${f.Code || 'FAC'}</span>
            </div>
            <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary); margin-top:0.3rem;">${f.Name}</h3>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${f.City ? f.City + ', ' : ''}${f.Country}</div>
          </div>
        </div>

        <div style="background:var(--bg-subtle); border:1px solid var(--border-subtle); padding:0.6rem; border-radius:4px; font-size:0.79rem;">
          <div style="font-weight:700; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.15rem;">Scope of Supply / What They Do</div>
          <div style="color:var(--text-primary);">${f.Specialization}</div>
        </div>

        <div style="font-size:0.77rem; color:var(--text-secondary);">
          <strong>Capabilities & Testing:</strong> ${f.Capabilities || 'Standard manufacturing & testing'}
        </div>

        <div style="font-size:0.76rem;">
          <strong>Certifications:</strong> <span style="color:var(--status-green-text); font-weight:600;">${f.Certifications || 'ISO 9001'}</span>
        </div>

        <div style="border-top:1px solid var(--border-subtle); padding-top:0.55rem; font-size:0.76rem;">
          <div style="font-weight:700; color:var(--text-secondary); margin-bottom:0.3rem;">Assigned Contacts (${linkedContacts.length})</div>
          ${linkedContacts.length
            ? linkedContacts.map(c => `
                <div style="display:flex; justify-content:space-between; padding:0.28rem 0.5rem; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:3px; margin-bottom:0.2rem;">
                  <span><strong>${c.FullName}</strong> — ${c.JobTitle || 'Contact'}</span>
                  <span class="mono">${c.Phone}</span>
                </div>
              `).join('')
            : `<div style="color:var(--text-muted);">No assigned contacts for current clearance level.</div>`
          }
        </div>

        <div style="font-size:0.74rem; color:var(--text-muted);">
          <strong>Catalog SKUs:</strong> <span class="mono">${linkedProducts.map(p => p.SKU).join(', ') || 'OEM Supply'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================================
// MODULE 5: AI SMART SELLING PRICE & HISTORICAL COMPETITOR ESTIMATOR
// =============================================================================
function renderPricingModule() {
  const tbody = document.getElementById('competitorPricesTableBody');
  tbody.innerHTML = appState.competitorPrices.map(cp => `
    <tr>
      <th>
        <div class="mono" style="font-weight:700;">${cp.TenderReference}</div>
        <div style="font-size:0.72rem; color:var(--text-secondary); font-weight:400;">${cp.BidDate} • ${cp.TenderClient || ''}</div>
      </th>
      <td>
        <div style="font-weight:600;">${cp.ItemDescription}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">Specs: ${cp.NormalizedSpecs || cp.ItemCategory}</div>
      </td>
      <td>
        <div style="font-weight:600;">${cp.CompetitorName}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">Origin: ${cp.FactoryOrigin || 'GCC / Europe'}</div>
      </td>
      <td>
        <div class="mono" style="font-size:0.88rem; font-weight:700; color:var(--text-primary);">$${Number(cp.QuotedUnitPrice).toLocaleString()}</div>
      </td>
      <td>
        <div class="mono" style="margin-bottom:0.2rem;">Matrix Bid: <strong>$${Number(cp.OurQuotedUnitPrice || 0).toLocaleString()}</strong></div>
        ${cp.WasWinningBid
          ? `<span class="badge badge-admin">Competitor Won</span>`
          : `<span class="badge badge-public">Matrix Competitive</span>`
        }
      </td>
    </tr>
  `).join('');
}

async function runPricingEstimator() {
  const payload = {
    itemCategory: document.getElementById('estCategory').value,
    itemDescription: document.getElementById('estDescription').value,
    baseFactoryCost: Number(document.getElementById('estBaseCost').value),
    quantity: Number(document.getElementById('estQuantity').value),
    inflationRate: Number(document.getElementById('estInflation').value),
    shippingRate: Number(document.getElementById('estShipping').value),
    customsTaxRate: Number(document.getElementById('estCustoms').value),
    materialEscalationRate: Number(document.getElementById('estMaterial').value),
    targetMarginPercent: Number(document.getElementById('estTargetMargin').value)
  };

  const res = await fetch('/api/pricing/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  const b = data.breakdown;
  document.getElementById('pricingSummaryBadge').textContent =
    `${data.matchedCompetitorBids.length} Historical Benchmarks Matched`;

  document.getElementById('pricingBreakdownBanner').innerHTML = `
    <strong>Landed Cost Calculation:</strong> Net Factory Cost (<span class="mono">$${b.baseFactoryCost.toLocaleString()}</span>)
    + Freight (${b.shippingPercent}%) + Customs/Tax (${b.customsTaxPercent}%) + Material Escalation (${b.materialEscalationPercent}%)
    = <strong>Estimated Landed Cost: <span class="mono">$${b.estimatedLandedUnitCost.toLocaleString()}</span> / unit</strong>.<br/>
    <strong>Market-Adjusted Competitor Benchmark:</strong> Historical Competitor Average (<span class="mono">$${b.historicalAvgCompetitorPrice.toLocaleString()}</span>) escalated by +${b.totalMarketAdjustmentPercent}% cumulative market factors =
    <strong><span class="mono">$${b.adjustedMarketCompetitorAvg.toLocaleString()}</span> / unit</strong>.
  `;

  const r = data.recommendations;
  document.getElementById('pricingTiersContainer').innerHTML = `
    <div class="tier-card">
      <span class="badge badge-public">Tier 1 — Aggressive Bid</span>
      <div class="tier-price">$${r.aggressive.unitPrice.toLocaleString()} <span style="font-size:0.75rem; font-weight:400;">/ unit</span></div>
      <div class="mono" style="font-size:0.78rem; color:var(--accent-primary); font-weight:700;">Extended (${data.quantity} units): $${r.aggressive.totalPrice.toLocaleString()}</div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.45rem;">
        Gross Margin: <strong>${r.aggressive.estimatedMarginPercent}%</strong><br/>
        Positioning: ${r.aggressive.winProbability}
      </div>
    </div>

    <div class="tier-card recommended">
      <span class="badge badge-blue">Tier 2 — Recommended Bid</span>
      <div class="tier-price">$${r.balanced.unitPrice.toLocaleString()} <span style="font-size:0.75rem; font-weight:400;">/ unit</span></div>
      <div class="mono" style="font-size:0.78rem; color:var(--accent-primary); font-weight:700;">Extended (${data.quantity} units): $${r.balanced.totalPrice.toLocaleString()}</div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.45rem;">
        Gross Margin: <strong>${r.balanced.estimatedMarginPercent}%</strong><br/>
        Positioning: ${r.balanced.winProbability}
      </div>
    </div>

    <div class="tier-card">
      <span class="badge badge-restricted">Tier 3 — Ceiling / Spec Buffer</span>
      <div class="tier-price">$${r.premium.unitPrice.toLocaleString()} <span style="font-size:0.75rem; font-weight:400;">/ unit</span></div>
      <div class="mono" style="font-size:0.78rem; color:var(--accent-primary); font-weight:700;">Extended (${data.quantity} units): $${r.premium.totalPrice.toLocaleString()}</div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.45rem;">
        Gross Margin: <strong>${r.premium.estimatedMarginPercent}%</strong><br/>
        Positioning: ${r.premium.winProbability}
      </div>
    </div>
  `;
}

// =============================================================================
// EVENT LISTENERS & FORM HANDLERS
// =============================================================================
// =============================================================================
// COMPETITOR & OEM BRAND EQUIVALENT MATCHER CONTROLLER
// =============================================================================
async function runCompetitorEquivalenceCheck(rawTextOverride, companiesOverride) {
  const container = document.getElementById('competitorEquivalentsContainer');
  const card = document.getElementById('competitorEquivalentsCard');
  if (card) card.style.display = 'block';
  if (container) {
    container.innerHTML = '<div style="padding:1.25rem; text-align:center; color:#1e3a8a; font-weight:600;"><span style="display:inline-block; width:8px; height:8px; background:#1e3a8a; border-radius:50%; margin-right:6px;"></span>Searching competitor OEM models & calculating specification match ratings...</div>';
  }

  const rawText = rawTextOverride !== undefined
    ? rawTextOverride
    : (document.getElementById('tenderRawTextInput')?.value || document.getElementById('activeTenderHeaderTitle')?.textContent || '');

  const companiesInput = companiesOverride !== undefined
    ? companiesOverride
    : (document.getElementById('tenderCompetitorInput')?.value || 'HP, Dell, Schneider Electric');

  try {
    const res = await fetch('/api/tenders/find-equivalents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        companies: companiesInput
      })
    });
    const data = await res.json();
    renderCompetitorEquivalents(data);
  } catch (err) {
    console.error('Failed to find competitor equivalents', err);
    if (container) container.innerHTML = '<div style="color:var(--status-red-text); padding:0.75rem;">Failed to retrieve competitor equivalents.</div>';
  }
}

function renderCompetitorEquivalents(data) {
  const card = document.getElementById('competitorEquivalentsCard');
  const container = document.getElementById('competitorEquivalentsContainer');
  if (!card || !container) return;

  if (!data || !data.results || !data.results.length) {
    card.style.display = 'block';
    container.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-muted);">No matching equipment categories detected. Enter clauses mentioning Desktops, Workstations, Laptops, Displays, UPS, or CCTV.</div>';
    return;
  }

  card.style.display = 'block';
  lastEquivalentsData = data;

  container.innerHTML = data.results.map(r => {
    const our = r.ourModel || {};
    const comps = r.competitors || [];

    return `
      <div class="equiv-category-card">
        <div class="equiv-cat-header">
          <div>
            <span class="equiv-cat-title">📦 ${r.category}</span>
            <span style="font-size:0.74rem; color:#64748b; margin-left:0.5rem;">Tender Scope Match</span>
          </div>
          <div class="equiv-our-badge">
            Our Model: <strong>${our.name || our.sku}</strong>
          </div>
        </div>

        <div style="padding: 0.65rem 0.85rem; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:0.75rem; color:#334155; display:flex; justify-content:space-between; align-items:center;">
          <div><strong>Matrix Factory Specification:</strong> ${our.specs || 'Enterprise Standard Model'}</div>
          <div style="color:#1e3a8a; font-weight:700; white-space:nowrap; margin-left:0.5rem;">Base Cost: ${our.baseCost || 0} USD</div>
        </div>

        <div class="equiv-grid">
          ${comps.map(c => {
            const isFullMatch = c.matchRating && c.matchRating.includes('100%');
            const isNoLine = c.matchRating && c.matchRating.includes('No Direct');
            const badgeClass = isFullMatch ? 'badge-won' : (isNoLine ? 'badge-restricted' : 'badge-blue');

            return `
              <div class="equiv-brand-card">
                <div>
                  <div class="equiv-brand-top">
                    <span class="equiv-brand-name">${c.brand}</span>
                    <span class="badge ${badgeClass}">${c.matchRating}</span>
                  </div>
                  <div class="equiv-model-name">${c.modelName}</div>
                  <div class="equiv-specs-text">
                    ${c.matchedSpecs}
                  </div>
                  <div style="font-size:0.72rem; font-weight:700; color:#0f172a; margin-top:0.25rem;">
                    Est. Market Quoted Price: <span style="font-family:'SFMono-Regular',Consolas,monospace; color:#1e3a8a;">${c.marketPriceEst}</span>
                  </div>
                </div>
                ${c.competitiveEdge ? `
                  <div class="equiv-edge-box">
                    <strong>Bidding Advantage:</strong> ${c.competitiveEdge}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function exportEquivalentsCSV() {
  if (!lastEquivalentsData || !lastEquivalentsData.results) {
    alert('Please run the equivalent models check first before exporting.');
    return;
  }
  const headers = ['Category', 'Our_Model_SKU', 'Our_Model_Name', 'Our_Specs', 'Our_Base_Cost_USD', 'Target_Brand', 'Competitor_Equivalent_Model', 'Match_Rating', 'Competitor_Specs', 'Est_Market_Price', 'Bidding_Strategy_Advantage'];
  const rows = [];

  for (const r of lastEquivalentsData.results) {
    const our = r.ourModel || {};
    for (const c of (r.competitors || [])) {
      rows.push([
        `"${r.category}"`,
        `"${our.sku || ''}"`,
        `"${our.name || ''}"`,
        `"${(our.specs || '').replace(/"/g, '""')}"`,
        our.baseCost || 0,
        `"${c.brand || ''}"`,
        `"${(c.modelName || '').replace(/"/g, '""')}"`,
        `"${c.matchRating || ''}"`,
        `"${(c.matchedSpecs || '').replace(/"/g, '""')}"`,
        `"${(c.marketPriceEst || '').replace(/"/g, '""')}"`,
        `"${(c.competitiveEdge || '').replace(/"/g, '""')}"`
      ]);
    }
  }

  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Matrix_Tender_Competitor_Equivalents_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function bindTenderTrackerAndCoreListeners() {
  // Datasheet Events
  const dsCatFilter = document.getElementById('dsCategoryFilter');
  if (dsCatFilter) {
    dsCatFilter.addEventListener('change', renderDatasheetModule);
  }

  const dsProductSelect = document.getElementById('dsProductSelect');
  if (dsProductSelect) {
    dsProductSelect.addEventListener('change', updateDatasheetPreview);
  }

  const dsDocCode = document.getElementById('dsDocCode');
  if (dsDocCode) {
    dsDocCode.addEventListener('input', () => {
      document.getElementById('previewDocCode').textContent = dsDocCode.value || 'DS-MTX-2026-001';
    });
  }

  // Product Image Controls (Req #8)
  const fileInput = document.getElementById('dsImageFileInput');
  const btnUpload = document.getElementById('btnUploadImage');
  const btnRemove = document.getElementById('btnRemoveImage');
  const btnApplyUrl = document.getElementById('btnApplyImageUrl');
  const urlInput = document.getElementById('dsImageUrlInput');

  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const prod = getSelectedProduct();
        if (prod) {
          appState.productImages[prod.Id] = loadEvt.target.result;
          updateDatasheetPreview();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnApplyUrl && urlInput) {
    btnApplyUrl.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) return;
      const prod = getSelectedProduct();
      if (prod) {
        appState.productImages[prod.Id] = url;
        urlInput.value = '';
        updateDatasheetPreview();
      }
    });
  }

  if (btnRemove) {
    btnRemove.addEventListener('click', () => {
      const prod = getSelectedProduct();
      if (prod) {
        delete appState.productImages[prod.Id];
        if (fileInput) fileInput.value = '';
        if (urlInput) urlInput.value = '';
        updateDatasheetPreview();
      }
    });
  }

  // Add Spec Row
  const btnAddSpec = document.getElementById('btnAddSpecRow');
  if (btnAddSpec) {
    btnAddSpec.addEventListener('click', async () => {
      const key = document.getElementById('newSpecKey').value.trim();
      const val = document.getElementById('newSpecVal').value.trim();
      if (!key || !val) return;
      const prod = getSelectedProduct();
      if (!prod) return;
      prod.Specifications = { ...(prod.Specifications || {}), [key]: val };
      await fetch(`/api/products/${prod.Id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Specifications: prod.Specifications })
      });
      document.getElementById('newSpecKey').value = '';
      document.getElementById('newSpecVal').value = '';
      updateDatasheetPreview();
    });
  }

  // Print PDF Datasheet
  const btnGenPdf = document.getElementById('btnGeneratePDF');
  if (btnGenPdf) {
    btnGenPdf.addEventListener('click', async () => {
      const prod = getSelectedProduct();
      if (prod) {
        const res = await fetch('/api/datasheets/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ProductId: prod.Id,
            DocumentCode: document.getElementById('dsDocCode').value,
            Version: prod.Revision || 'Rev 2026.1',
            GeneratedBy: appState.activeUser ? appState.activeUser.FullName : 'User'
          })
        });
        const entry = await res.json();
        appState.datasheets.unshift(entry);
        renderDatasheetHistory();
      }
      window.print();
    });
  }

  // ===========================================================================
  // TENDER TRACKER LISTENERS
  // ===========================================================================
  ['tenderSearchInput', 'tenderStatusFilter', 'tenderClientFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderTenderTrackerModule);
  });

  const btnOpenNewTender = document.getElementById('btnOpenNewTenderModal');
  if (btnOpenNewTender) {
    btnOpenNewTender.addEventListener('click', () => {
      document.getElementById('dialogNewTenderTitle').textContent = 'Track New Tender Opportunity';
      document.getElementById('editTenderId').value = '';
      document.getElementById('formNewTender').reset();
      document.getElementById('newTenderRef').value = `TND-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
      document.getElementById('newTenderDeadline').value = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
      document.getElementById('dialogNewTender').showModal();
    });
  }

  const btnExportCsv = document.getElementById('btnExportTendersCSV');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportTendersToCSV);
  }

  const formNewTender = document.getElementById('formNewTender');
  if (formNewTender) {
    formNewTender.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('editTenderId').value;
      const payload = {
        ReferenceNumber: document.getElementById('newTenderRef').value.trim(),
        ClientName: document.getElementById('newTenderClient').value.trim(),
        Title: document.getElementById('newTenderTitle').value.trim(),
        TotalEstimatedValue: Number(document.getElementById('newTenderValue').value) || 0,
        SubmissionDeadline: document.getElementById('newTenderDeadline').value,
        BidBond: document.getElementById('newTenderBidBond').value.trim(),
        Status: document.getElementById('newTenderStage').value,
        AssignedLead: document.getElementById('newTenderLead').value.trim(),
        Country: document.getElementById('newTenderCountry').value.trim() || 'Jordan',
        Notes: document.getElementById('newTenderNotes').value.trim()
      };

      if (editId) {
        const res = await fetch(`/api/tenders/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const updated = await res.json();
        const idx = appState.tenders.findIndex(t => t.Id === Number(editId));
        if (idx !== -1) appState.tenders[idx] = updated;
      } else {
        const res = await fetch('/api/tenders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const created = await res.json();
        appState.tenders.unshift(created);
      }

      document.getElementById('dialogNewTender').close();
      renderTenderTrackerModule();
      renderAllCounts();
    });
  }

  // ===========================================================================
  // CONTACTS & OTHER MODULE LISTENERS
  // ===========================================================================
  ['contactSearchInput', 'contactFactoryFilter', 'contactVisibilityFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderContactsModule);
  });

  const btnOpenPhoneImport = document.getElementById('btnOpenPhoneImportModal');
  if (btnOpenPhoneImport) {
    btnOpenPhoneImport.addEventListener('click', () => {
      document.getElementById('dialogPhoneImport').showModal();
    });
  }

  const btnOpenNewContact = document.getElementById('btnOpenNewContactModal');
  if (btnOpenNewContact) {
    btnOpenNewContact.addEventListener('click', () => {
      document.getElementById('dialogNewContact').showModal();
    });
  }

  const btnOpenNewFactory = document.getElementById('btnOpenNewFactoryModal');
  if (btnOpenNewFactory) {
    btnOpenNewFactory.addEventListener('click', () => {
      document.getElementById('dialogNewFactory').showModal();
    });
  }

  const btnOpenNewProduct = document.getElementById('btnOpenNewProductModal');
  if (btnOpenNewProduct) {
    btnOpenNewProduct.addEventListener('click', () => {
      document.getElementById('dialogNewProduct').showModal();
    });
  }

  const btnOpenNewCompBid = document.getElementById('btnOpenNewCompetitorBidModal');
  if (btnOpenNewCompBid) {
    btnOpenNewCompBid.addEventListener('click', () => {
      document.getElementById('dialogNewCompetitorBid').showModal();
    });
  }

  // Form Submissions
  const formContact = document.getElementById('formNewContact');
  if (formContact) {
    formContact.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        FullName: document.getElementById('newContactName').value,
        JobTitle: document.getElementById('newContactTitle').value,
        CompanyName: document.getElementById('newContactCompany').value,
        FactoryId: document.getElementById('newContactFactorySelect').value,
        Phone: document.getElementById('newContactPhone').value,
        MobilePhone: document.getElementById('newContactMobile').value,
        Email: document.getElementById('newContactEmail').value,
        VisibilityLevel: document.getElementById('newContactVisibility').value,
        Notes: document.getElementById('newContactNotes').value
      };
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const c = await res.json();
      appState.contacts.unshift(c);
      document.getElementById('dialogNewContact').close();
      renderContactsModule();
      renderAllCounts();
    });
  }

  const formFactory = document.getElementById('formNewFactory');
  if (formFactory) {
    formFactory.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        Name: document.getElementById('newFactoryName').value,
        Code: document.getElementById('newFactoryCode').value,
        Country: document.getElementById('newFactoryCountry').value,
        City: document.getElementById('newFactoryCity').value,
        Specialization: document.getElementById('newFactorySpecialization').value,
        Certifications: document.getElementById('newFactoryCertifications').value,
        Status: document.getElementById('newFactoryStatus').value,
        Website: document.getElementById('newFactoryWebsite').value
      };
      const res = await fetch('/api/factories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const f = await res.json();
      appState.factories.unshift(f);
      document.getElementById('dialogNewFactory').close();
      populateFactoryDropdowns();
      renderFactoriesModule();
      renderAllCounts();
    });
  }

  const formProduct = document.getElementById('formNewProduct');
  if (formProduct) {
    formProduct.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        FactoryId: document.getElementById('newProductFactorySelect').value,
        SKU: document.getElementById('newProductSKU').value,
        Name: document.getElementById('newProductName').value,
        Category: document.getElementById('newProductCategory').value,
        Series: document.getElementById('newProductSeries').value,
        BaseFactoryCost: document.getElementById('newProductCost').value,
        WarrantyMonths: document.getElementById('newProductWarranty').value,
        Summary: document.getElementById('newProductSummary').value
      };
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const p = await res.json();
      appState.products.unshift(p);
      document.getElementById('dialogNewProduct').close();
      renderDatasheetModule();
      renderAllCounts();
    });
  }

  const formComp = document.getElementById('formNewCompetitorBid');
  if (formComp) {
    formComp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        TenderReference: document.getElementById('newBidTenderRef').value,
        TenderClient: document.getElementById('newBidClient').value,
        ItemCategory: document.getElementById('newBidCategory').value,
        CompetitorName: document.getElementById('newBidCompetitor').value,
        FactoryOrigin: document.getElementById('newBidOrigin').value,
        QuotedUnitPrice: document.getElementById('newBidPrice').value,
        OurQuotedUnitPrice: document.getElementById('newBidOurPrice').value,
        WasWinningBid: document.getElementById('newBidWon').checked
      };
      const res = await fetch('/api/pricing/competitor-bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const b = await res.json();
      appState.competitorPrices.unshift(b);
      document.getElementById('dialogNewCompetitorBid').close();
      renderPricingModule();
      runPricingEstimator();
    });
  }

  // Tender Spec Analyzer Buttons
  const btnLoadSample = document.getElementById('btnLoadSampleTenderText');
  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', () => {
      document.getElementById('tenderInputTitle').value = 'Ministry of Education IT & Data Center Expansion';
      document.getElementById('tenderInputClient').value = 'Ministry of Education & Higher Research';
      document.getElementById('tenderInputRef').value = 'TND-MOE-2026-884';
      document.getElementById('tenderInputRaw').value = `3.1 All desktop personal computers shall be powered by Intel 14th Gen Core i7 or equivalent with Intel Q-Series enterprise chipset and minimum 16GB DDR5 5600MHz RAM.
3.2 Form factor must be tool-less desktop chassis with integrated TPM 2.0 cryptographic chip.
3.3 Supplier must offer online double conversion UPS 40kVA with 3-level IGBT inverter, unity power factor 1.0 and SNMP card.
3.4 Delay penalty shall be 0.1% per calendar day up to a maximum liquidated damages cap of 10%.
3.5 Vendor shall coordinate staff cafeteria access cards and site visitor security badges during commissioning.`;
    });
  }

  const btnAnalyze = document.getElementById('btnAnalyzeTender');
  if (btnAnalyze) {
    btnAnalyze.addEventListener('click', async () => {
      const payload = {
        title: document.getElementById('tenderInputTitle').value,
        clientName: document.getElementById('tenderInputClient').value,
        referenceNumber: document.getElementById('tenderInputRef').value,
        rawText: document.getElementById('tenderInputRaw').value,
        customQuestion: document.getElementById('tenderCustomQuestion').value
      };
      const res = await fetch('/api/tenders/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const t = await res.json();
      appState.tenders.unshift(t);
      renderTendersModule();
      renderTenderTrackerModule();
      renderAllCounts();
    });
  }

  const tenderFilterImportance = document.getElementById('tenderFilterImportance');
  if (tenderFilterImportance) {
    tenderFilterImportance.addEventListener('change', renderTendersModule);
  }

  // Phone vCard File Import Handlers
  const fileVcf = document.getElementById('phoneVcfFileInput');
  if (fileVcf) {
    fileVcf.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const parsed = parseVCardOrCSV(text, file.name);
      appState.stagedPhoneContacts = parsed;
      document.getElementById('phoneImportStagedCount').textContent = `Parsed ${parsed.length} contacts from ${file.name}`;
      const previewBox = document.getElementById('phoneImportPreviewList');
      if (previewBox) {
        previewBox.innerHTML = parsed.slice(0, 8).map(c => `
          <div style="display:flex; justify-content:space-between; padding:0.25rem 0.4rem; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:3px;">
            <span><strong>${c.FullName}</strong> (${c.CompanyName || 'No Org'})</span>
            <span class="mono" style="color:var(--text-secondary);">${c.Phone || c.MobilePhone || 'No Phone'}</span>
          </div>
        `).join('') + (parsed.length > 8 ? `<div style="font-size:0.7rem; color:var(--text-muted); text-align:center;">+ ${parsed.length - 8} more contacts in file</div>` : '');
      }
    });
  }

  const btnCommitImport = document.getElementById('btnCommitPhoneImport');
  if (btnCommitImport) {
    btnCommitImport.addEventListener('click', async () => {
      if (!appState.stagedPhoneContacts.length) return;
      const defFactory = document.getElementById('importDefaultFactory').value;
      const defVisibility = document.getElementById('importDefaultVisibility').value;
      const contactsToImport = appState.stagedPhoneContacts.map(c => ({
        ...c,
        FactoryId: defFactory ? Number(defFactory) : null,
        VisibilityLevel: defVisibility || 'Public'
      }));
      const res = await fetch('/api/contacts/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: contactsToImport })
      });
      const data = await res.json();
      appState.contacts = [...data.contacts, ...appState.contacts];
      appState.stagedPhoneContacts = [];
      document.getElementById('dialogPhoneImport').close();
      renderContactsModule();
      renderAllCounts();
    });
  }

  const btnExportAllVcf = document.getElementById('btnExportAllContactsVCF');
  if (btnExportAllVcf) {
    btnExportAllVcf.addEventListener('click', () => {
      const accessible = getAccessibleContacts();
      const combinedVcf = accessible.map(c => buildVCardString(c)).join('\r\n');
      const blob = new Blob([combinedVcf], { type: 'text/vcard;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Matrix_Corporate_Contacts_${new Date().toISOString().slice(0, 10)}.vcf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Pricing Estimator Inputs
  ['pricingCategorySelect', 'pricingBaseCostInput', 'pricingCompetitorAvg', 'pricingAggressiveness'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', runPricingEstimator);
  });
}


function parseVCardOrCSV(rawText, fileName = '') {
  const results = [];
  if (rawText.includes('BEGIN:VCARD')) {
    const cards = rawText.split(/END:VCARD/i);
    for (const block of cards) {
      if (!/BEGIN:VCARD/i.test(block)) continue;
      const lines = block.split(/\r?\n/);
      let fullName = '';
      let org = '';
      let title = '';
      let email = '';
      let phones = [];
      let note = '';

      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const keyPart = line.slice(0, idx).toUpperCase();
        const valPart = line.slice(idx + 1).trim();

        if (keyPart.startsWith('FN')) {
          fullName = valPart;
        } else if (!fullName && keyPart.startsWith('N')) {
          const parts = valPart.split(';').filter(Boolean);
          fullName = parts.reverse().join(' ').trim();
        } else if (keyPart.startsWith('ORG')) {
          org = valPart.replace(/;/g, ' ').trim();
        } else if (keyPart.startsWith('TITLE')) {
          title = valPart;
        } else if (keyPart.startsWith('TEL')) {
          phones.push(valPart);
        } else if (keyPart.startsWith('EMAIL')) {
          email = valPart;
        } else if (keyPart.startsWith('NOTE')) {
          note = valPart;
        }
      }

      if (fullName || phones.length) {
        results.push({
          FullName: fullName || 'Imported Contact',
          JobTitle: title || 'Contact',
          CompanyName: org || 'Mobile Import',
          Phone: phones[0] || '',
          MobilePhone: phones[1] || phones[0] || '',
          Email: email,
          Source: 'Phone_vCard_Import',
          Tags: 'vCard Import',
          Notes: note || `Imported from vCard (${fileName || 'vCard'})`
        });
      }
    }
  } else {
    const rows = rawText.split(/\r?\n/).filter(r => r.trim().length > 0);
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
      if (cols.length >= 2) {
        results.push({
          FullName: cols[0] || 'CSV Contact',
          CompanyName: cols[1] || '',
          JobTitle: cols[2] || '',
          Phone: cols[3] || cols[1] || '',
          MobilePhone: cols[3] || '',
          Email: cols[4] || '',
          Source: 'CSV_Import',
          Tags: 'CSV Import',
          Notes: cols[5] || 'Imported via CSV'
        });
      }
    }
  }
  return results;
}

function buildVCardString(contact) {
  const fac = appState.factories.find(f => f.Id === Number(contact.FactoryId));
  const company = fac ? fac.Name : (contact.CompanyName || 'Matrix Partner');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.FullName}`,
    `ORG:${company}`,
    `TITLE:${contact.JobTitle || ''}`,
    `TEL;TYPE=WORK,VOICE:${contact.Phone || ''}`,
    contact.MobilePhone ? `TEL;TYPE=CELL,VOICE:${contact.MobilePhone}` : '',
    contact.Email ? `EMAIL;TYPE=PREF,INTERNET:${contact.Email}` : '',
    `NOTE:${(contact.Notes || '').replace(/\r?\n/g, ' ')}`,
    'END:VCARD'
  ].filter(Boolean).join('\r\n');
}

window.downloadSingleContactVCard = function (contactId) {
  const c = appState.contacts.find(x => x.Id === Number(contactId));
  if (!c) return;
  const vcf = buildVCardString(c);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c.FullName.replace(/\s+/g, '_')}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
};

window.deleteContact = async function (contactId) {
  await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
  appState.contacts = appState.contacts.filter(c => c.Id !== Number(contactId));
  renderContactsModule();
  renderAllCounts();
};

// =============================================================================
// MODULE: TENDER PIPELINE & BIDDING TRACKER
// =============================================================================
function renderTenderTrackerModule() {
  const tableBody = document.getElementById('tenderTrackerTableBody');
  if (!tableBody) return;

  const search = (document.getElementById('tenderSearchInput')?.value || '').toLowerCase().trim();
  const stageFilter = document.getElementById('tenderStatusFilter')?.value || 'ALL';
  const clientFilter = document.getElementById('tenderClientFilter')?.value || 'ALL';

  // Populate client dropdown
  const clientDropdown = document.getElementById('tenderClientFilter');
  if (clientDropdown) {
    const clients = [...new Set(appState.tenders.map(t => t.ClientName).filter(Boolean))].sort();
    const currentVal = clientDropdown.value;
    clientDropdown.innerHTML = '<option value="ALL">All Clients / Authorities</option>' +
      clients.map(c => `<option value="${c}">${c}</option>`).join('');
    if (clients.includes(currentVal)) {
      clientDropdown.value = currentVal;
    }
  }

  // Filter tenders
  const filtered = appState.tenders.filter(t => {
    const matchesSearch = !search ||
      (t.ReferenceNumber || '').toLowerCase().includes(search) ||
      (t.Title || '').toLowerCase().includes(search) ||
      (t.ClientName || '').toLowerCase().includes(search) ||
      (t.AssignedLead || '').toLowerCase().includes(search);

    let matchesStage = true;
    if (stageFilter === 'ACTIVE') {
      matchesStage = ['Drafting', 'Analyzing', 'Under Pricing'].includes(t.Status);
    } else if (stageFilter !== 'ALL') {
      matchesStage = t.Status === stageFilter;
    }

    const matchesClient = clientFilter === 'ALL' || t.ClientName === clientFilter;

    return matchesSearch && matchesStage && matchesClient;
  });

  // Calculate KPIs
  const totalCount = appState.tenders.length;
  const activePipelineVal = appState.tenders
    .filter(t => ['Drafting', 'Analyzing', 'Under Pricing'].includes(t.Status))
    .reduce((sum, t) => sum + (Number(t.TotalEstimatedValue) || 0), 0);
  const submittedCount = appState.tenders.filter(t => t.Status === 'Submitted').length;
  const wonTenders = appState.tenders.filter(t => t.Status === 'Won');
  const wonVal = wonTenders.reduce((sum, t) => sum + (Number(t.TotalEstimatedValue) || 0), 0);
  const decidedCount = appState.tenders.filter(t => ['Won', 'Lost'].includes(t.Status)).length;
  const winRate = decidedCount > 0 ? Math.round((wonTenders.length / decidedCount) * 100) : 0;

  if (document.getElementById('kpiTotalTenders')) document.getElementById('kpiTotalTenders').textContent = totalCount;
  if (document.getElementById('kpiActivePipelineVal')) document.getElementById('kpiActivePipelineVal').textContent = '$' + activePipelineVal.toLocaleString();
  if (document.getElementById('kpiSubmittedTenders')) document.getElementById('kpiSubmittedTenders').textContent = submittedCount;
  if (document.getElementById('kpiWonContractsVal')) document.getElementById('kpiWonContractsVal').textContent = '$' + wonVal.toLocaleString();
  if (document.getElementById('kpiWinRateText')) document.getElementById('kpiWinRateText').textContent = `Win Rate: ${winRate}% (${wonTenders.length} Won / ${decidedCount} Decided)`;

  // Render Table
  if (!filtered.length) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No tenders match the current filters. Click "+ Track New Tender" to add one.</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered.map(t => {
    // Stage Badge Class
    let badgeClass = 'badge-drafting';
    if (t.Status === 'Under Pricing') badgeClass = 'badge-pricing';
    else if (t.Status === 'Analyzing') badgeClass = 'badge-analyzing';
    else if (t.Status === 'Submitted') badgeClass = 'badge-submitted';
    else if (t.Status === 'Won') badgeClass = 'badge-won';
    else if (t.Status === 'Lost') badgeClass = 'badge-lost';

    // Deadline badge & calculation
    const deadlineDate = t.SubmissionDeadline ? new Date(t.SubmissionDeadline) : null;
    let deadlineBadge = '';
    if (t.Status === 'Won') {
      deadlineBadge = '<span class="badge badge-won" style="margin-left:0.35rem;">Awarded</span>';
    } else if (t.Status === 'Lost') {
      deadlineBadge = '<span class="badge badge-lost" style="margin-left:0.35rem;">Closed</span>';
    } else if (deadlineDate && !isNaN(deadlineDate)) {
      const now = new Date();
      const diffDays = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        deadlineBadge = '<span class="badge badge-lost" style="margin-left:0.35rem;">Expired</span>';
      } else if (diffDays <= 7) {
        deadlineBadge = `<span class="badge badge-restricted" style="margin-left:0.35rem;">${diffDays}d left!</span>`;
      } else {
        deadlineBadge = `<span class="badge badge-blue" style="margin-left:0.35rem;">${diffDays}d left</span>`;
      }
    }

    const valFormatted = t.TotalEstimatedValue
      ? '$' + Number(t.TotalEstimatedValue).toLocaleString() + ' ' + (t.Currency || 'USD')
      : '<span style="color:#94a3b8;">Pending BOQ</span>';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#1e3a8a; font-family:'SFMono-Regular',Consolas,monospace;">${t.ReferenceNumber}</div>
          <div style="font-weight:600; color:#0f172a; margin-top:0.15rem; font-size:0.8rem;">${t.Title}</div>
          ${t.Notes ? `<div style="font-size:0.72rem; color:#64748b; margin-top:0.2rem;">${t.Notes}</div>` : ''}
        </td>
        <td>
          <div style="font-weight:600;">${t.ClientName}</div>
          <div style="font-size:0.72rem; color:#64748b;">${t.Country || 'Jordan'}${t.AssignedLead ? ' • Lead: ' + t.AssignedLead : ''}</div>
          ${t.BidBond ? `<div style="font-size:0.7rem; color:#0369a1; margin-top:0.2rem;">Bond: ${t.BidBond}</div>` : ''}
        </td>
        <td style="font-weight:700; font-family:'SFMono-Regular',Consolas,monospace;">
          ${valFormatted}
        </td>
        <td>
          <div>${t.SubmissionDeadline ? t.SubmissionDeadline.slice(0, 10) : 'TBD'}</div>
          ${deadlineBadge}
        </td>
        <td>
          <select class="badge ${badgeClass}" style="cursor:pointer; font-weight:700; border-radius:3px; padding:0.2rem 0.4rem;" onchange="window.updateTenderStage(${t.Id}, this.value)">
            <option value="Drafting" ${t.Status === 'Drafting' ? 'selected' : ''}>Drafting</option>
            <option value="Analyzing" ${t.Status === 'Analyzing' ? 'selected' : ''}>Analyzing</option>
            <option value="Under Pricing" ${t.Status === 'Under Pricing' ? 'selected' : ''}>Under Pricing</option>
            <option value="Submitted" ${t.Status === 'Submitted' ? 'selected' : ''}>Submitted</option>
            <option value="Won" ${t.Status === 'Won' ? 'selected' : ''}>Won (Awarded)</option>
            <option value="Lost" ${t.Status === 'Lost' ? 'selected' : ''}>Lost / Closed</option>
          </select>
        </td>
        <td>
          <div class="tender-quick-actions">
            <button class="btn btn-sm" type="button" title="Analyze specs in AI Analyzer" onclick="window.quickAnalyzeTender(${t.Id})">Analyze</button>
            <button class="btn btn-sm" type="button" title="Open in Price Estimator" onclick="switchTab('tab-pricing')">Price</button>
            <button class="btn btn-sm" type="button" title="Edit Tender" onclick="window.openEditTenderModal(${t.Id})">✎</button>
            <button class="btn btn-sm btn-danger" type="button" title="Delete Tender" onclick="window.deleteTender(${t.Id})">✕</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.updateTenderStage = async function (id, newStatus) {
  const tender = appState.tenders.find(t => t.Id === Number(id));
  if (!tender) return;
  tender.Status = newStatus;
  await fetch(`/api/tenders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Status: newStatus })
  });
  renderTenderTrackerModule();
};

window.openEditTenderModal = function (id) {
  const tender = appState.tenders.find(t => t.Id === Number(id));
  if (!tender) return;

  document.getElementById('dialogNewTenderTitle').textContent = `Edit Tender: ${tender.ReferenceNumber}`;
  document.getElementById('editTenderId').value = tender.Id;
  document.getElementById('newTenderRef').value = tender.ReferenceNumber;
  document.getElementById('newTenderClient').value = tender.ClientName;
  document.getElementById('newTenderTitle').value = tender.Title;
  document.getElementById('newTenderValue').value = tender.TotalEstimatedValue || '';
  document.getElementById('newTenderDeadline').value = tender.SubmissionDeadline ? tender.SubmissionDeadline.slice(0, 10) : '';
  document.getElementById('newTenderBidBond').value = tender.BidBond || '';
  document.getElementById('newTenderStage').value = tender.Status || 'Drafting';
  document.getElementById('newTenderLead').value = tender.AssignedLead || '';
  document.getElementById('newTenderCountry').value = tender.Country || 'Jordan';
  document.getElementById('newTenderNotes').value = tender.Notes || '';

  document.getElementById('dialogNewTender').showModal();
};

window.deleteTender = async function (id) {
  if (!confirm('Are you sure you want to remove this tender from the tracker?')) return;
  await fetch(`/api/tenders/${id}`, { method: 'DELETE' });
  appState.tenders = appState.tenders.filter(t => t.Id !== Number(id));
  renderTenderTrackerModule();
  renderAllCounts();
};

window.quickAnalyzeTender = function (id) {
  const tender = appState.tenders.find(t => t.Id === Number(id));
  if (!tender) return;
  switchTab('tab-tenders');
  const titleEl = document.getElementById('tenderInputTitle');
  const clientEl = document.getElementById('tenderInputClient');
  const refEl = document.getElementById('tenderInputRef');
  if (titleEl) titleEl.value = tender.Title;
  if (clientEl) clientEl.value = tender.ClientName;
  if (refEl) refEl.value = tender.ReferenceNumber;
};

window.exportTendersToCSV = function () {
  const headers = ['ID', 'Reference', 'Client', 'Country', 'Title', 'Estimated_Value_USD', 'Submission_Deadline', 'Status', 'Bid_Bond', 'Lead', 'Notes'];
  const rows = appState.tenders.map(t => [
    t.Id,
    `"${(t.ReferenceNumber || '').replace(/"/g, '""')}"`,
    `"${(t.ClientName || '').replace(/"/g, '""')}"`,
    `"${(t.Country || 'Jordan').replace(/"/g, '""')}"`,
    `"${(t.Title || '').replace(/"/g, '""')}"`,
    t.TotalEstimatedValue || 0,
    t.SubmissionDeadline ? t.SubmissionDeadline.slice(0, 10) : '',
    t.Status || 'Drafting',
    `"${(t.BidBond || '').replace(/"/g, '""')}"`,
    `"${(t.AssignedLead || '').replace(/"/g, '""')}"`,
    `"${(t.Notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Matrix_Tenders_Pipeline_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};


// MODULE 3: AI TENDER DOCUMENT ANALYZER & FEEDBACK LEARNING ENGINE
// =============================================================================
function renderTendersModule() {
  const tender = appState.tenders[0];
  const filterVal = document.getElementById('tenderFilterImportance').value || 'ALL';
  const container = document.getElementById('tenderExtractionsContainer');
  const answerBanner = document.getElementById('tenderCustomAnswerBanner');

  if (!tender) {
    container.innerHTML = `<div>No tender clauses loaded.</div>`;
    return;
  }

  document.getElementById('activeTenderHeaderTitle').textContent =
    `${tender.ReferenceNumber} — ${tender.Title}`;

  if (tender.CustomQuestionAnswer) {
    answerBanner.style.display = 'block';
    answerBanner.innerHTML = `<strong>Query Response:</strong> ${tender.CustomQuestionAnswer}`;
  } else {
    answerBanner.style.display = 'none';
  }

  const extractions = (tender.Extractions || []).filter(e => {
    if (filterVal === 'ALL') return true;
    return e.ImportanceFlag === filterVal;
  });

  container.innerHTML = extractions.map(ext => {
    const isImportant = ext.ImportanceFlag === 'Important';
    const isNotNeeded = ext.ImportanceFlag === 'NotNeeded';
    const leftBorder = isImportant ? '4px solid #059669' : isNotNeeded ? '4px solid #dc2626' : '4px solid #94a3b8';
    const badgeHtml = isImportant
      ? `<span class="badge badge-public">Important (${ext.AIConfidence}%)</span>`
      : isNotNeeded
      ? `<span class="badge badge-admin">Not Needed</span>`
      : `<span class="badge badge-blue">Standard</span>`;

    return `
      <div style="background:var(--bg-subtle); border:1px solid var(--border-color); border-left:${leftBorder}; border-radius:4px; padding:0.85rem; opacity:${isNotNeeded ? '0.65' : '1'};">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.35rem; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:0.45rem;">
            <span class="badge badge-blue">${ext.Category}</span>
            <strong style="font-size:0.84rem; color:var(--text-primary);">${ext.RequirementTitle}</strong>
          </div>
          ${badgeHtml}
        </div>
        <p style="font-size:0.8rem; color:var(--text-primary); margin-bottom:0.5rem;">${ext.ExtractedDetail}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; font-size:0.74rem; color:var(--text-secondary);">
          <div><strong>Ref:</strong> ${ext.PageReference || 'Clause'} | <em>${ext.UserFeedbackNote || ''}</em></div>
          <div class="action-row">
            <button class="btn btn-sm btn-success" type="button" onclick="flagTenderExtraction(${tender.Id}, ${ext.Id}, 'Important')">
              Mark Important
            </button>
            <button class="btn btn-sm btn-danger" type="button" onclick="flagTenderExtraction(${tender.Id}, ${ext.Id}, 'NotNeeded')">
              Mark Not Needed
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  renderAIRulesList();
}

function renderAIRulesList() {
  const box = document.getElementById('aiRulesListContainer');
  box.innerHTML = appState.aiFeedbackRules.map(rule => {
    const isImp = rule.LearnedAction === 'FlagImportant';
    return `
      <div style="padding:0.65rem 0.8rem; background:var(--bg-subtle); border:1px solid var(--border-color); border-left:3px solid ${isImp ? '#059669' : '#dc2626'}; border-radius:4px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
          <span class="badge ${isImp ? 'badge-public' : 'badge-admin'}">
            ${isImp ? 'Rule: Important' : 'Rule: Suppress / Not Needed'}
          </span>
          <span class="mono" style="font-size:0.7rem; color:var(--text-muted);">Matches: ${rule.TimesApplied}</span>
        </div>
        <div style="font-weight:700; font-size:0.8rem; color:var(--text-primary); margin-bottom:0.15rem;">${rule.PatternOrTopic}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">${rule.Reason || ''}</div>
      </div>
    `;
  }).join('');
}

window.flagTenderExtraction = async function (tenderId, extId, importanceFlag) {
  const res = await fetch(`/api/tenders/${tenderId}/extractions/${extId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      importanceFlag,
      userName: appState.activeUser ? appState.activeUser.FullName : 'Mohammed Al-Mansoor'
    })
  });
  const data = await res.json();
  if (data.tender) {
    const idx = appState.tenders.findIndex(t => t.Id === Number(tenderId));
    if (idx !== -1) appState.tenders[idx] = data.tender;
  }
  if (data.aiFeedbackRules) {
    appState.aiFeedbackRules = data.aiFeedbackRules;
  }
  renderTendersModule();
  renderAllCounts();
};

// =============================================================================
// MODULE 4: SAVED FACTORIES DIRECTORY
// =============================================================================
function renderFactoriesModule() {
  const q = (document.getElementById('factorySearchInput').value || '').toLowerCase().trim();
  const grid = document.getElementById('factoriesCardsGrid');

  const filtered = appState.factories.filter(f => {
    if (!q) return true;
    const hay = `${f.Name} ${f.Code} ${f.Specialization} ${f.Capabilities} ${f.Certifications} ${f.Country} ${f.City} ${f.Notes}`.toLowerCase();
    return hay.includes(q);
  });

  grid.innerHTML = filtered.map(f => {
    const linkedContacts = getAccessibleContacts().filter(c => Number(c.FactoryId) === Number(f.Id));
    const linkedProducts = appState.products.filter(p => Number(p.FactoryId) === Number(f.Id));

    return `
      <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:4px; padding:1rem; display:flex; flex-direction:column; gap:0.65rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; border-bottom:1px solid var(--border-subtle); padding-bottom:0.55rem;">
          <div>
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span class="badge ${f.Status === 'Our Factory' ? 'badge-public' : 'badge-blue'}">${f.Status}</span>
              <span class="mono" style="color:var(--text-muted);">${f.Code || 'FAC'}</span>
            </div>
            <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary); margin-top:0.3rem;">${f.Name}</h3>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${f.City ? f.City + ', ' : ''}${f.Country}</div>
          </div>
        </div>

        <div style="background:var(--bg-subtle); border:1px solid var(--border-subtle); padding:0.6rem; border-radius:4px; font-size:0.79rem;">
          <div style="font-weight:700; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.15rem;">Scope of Supply / What They Do</div>
          <div style="color:var(--text-primary);">${f.Specialization}</div>
        </div>

        <div style="font-size:0.77rem; color:var(--text-secondary);">
          <strong>Capabilities & Testing:</strong> ${f.Capabilities || 'Standard manufacturing & testing'}
        </div>

        <div style="font-size:0.76rem;">
          <strong>Certifications:</strong> <span style="color:var(--status-green-text); font-weight:600;">${f.Certifications || 'ISO 9001'}</span>
        </div>

        <div style="border-top:1px solid var(--border-subtle); padding-top:0.55rem; font-size:0.76rem;">
          <div style="font-weight:700; color:var(--text-secondary); margin-bottom:0.3rem;">Assigned Contacts (${linkedContacts.length})</div>
          ${linkedContacts.length
            ? linkedContacts.map(c => `
                <div style="display:flex; justify-content:space-between; padding:0.28rem 0.5rem; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:3px; margin-bottom:0.2rem;">
                  <span><strong>${c.FullName}</strong> — ${c.JobTitle || 'Contact'}</span>
                  <span class="mono">${c.Phone}</span>
                </div>
              `).join('')
            : `<div style="color:var(--text-muted);">No assigned contacts for current clearance level.</div>`
          }
        </div>

        <div style="font-size:0.74rem; color:var(--text-muted);">
          <strong>Catalog SKUs:</strong> <span class="mono">${linkedProducts.map(p => p.SKU).join(', ') || 'OEM Supply'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================================
// MODULE 5: AI SMART SELLING PRICE & HISTORICAL COMPETITOR ESTIMATOR
// =============================================================================
function renderPricingModule() {
  const tbody = document.getElementById('competitorPricesTableBody');
  tbody.innerHTML = appState.competitorPrices.map(cp => `
    <tr>
      <th>
        <div class="mono" style="font-weight:700;">${cp.TenderReference}</div>
        <div style="font-size:0.72rem; color:var(--text-secondary); font-weight:400;">${cp.BidDate} • ${cp.TenderClient || ''}</div>
      </th>
      <td>
        <div style="font-weight:600;">${cp.ItemDescription}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">Specs: ${cp.NormalizedSpecs || cp.ItemCategory}</div>
      </td>
      <td>
        <div style="font-weight:600;">${cp.CompetitorName}</div>
        <div style="font-size:0.74rem; color:var(--text-secondary);">Origin: ${cp.FactoryOrigin || 'GCC / Europe'}</div>
      </td>
      <td>
        <div class="mono" style="font-size:0.88rem; font-weight:700; color:var(--text-primary);">$${Number(cp.QuotedUnitPrice).toLocaleString()}</div>
      </td>
      <td>
        <div class="mono" style="margin-bottom:0.2rem;">Matrix Bid: <strong>$${Number(cp.OurQuotedUnitPrice || 0).toLocaleString()}</strong></div>
        ${cp.WasWinningBid
          ? `<span class="badge badge-admin">Competitor Won</span>`
          : `<span class="badge badge-public">Matrix Competitive</span>`
        }
      </td>
    </tr>
  `).join('');
}

async function runPricingEstimator() {
  const payload = {
    itemCategory: document.getElementById('estCategory').value,
    itemDescription: document.getElementById('estDescription').value,
    baseFactoryCost: Number(document.getElementById('estBaseCost').value),
    quantity: Number(document.getElementById('estQuantity').value),
    inflationRate: Number(document.getElementById('estInflation').value),
    shippingRate: Number(document.getElementById('estShipping').value),
    customsTaxRate: Number(document.getElementById('estCustoms').value),
    materialEscalationRate: Number(document.getElementById('estMaterial').value),
    targetMarginPercent: Number(document.getElementById('estTargetMargin').value)
  };

  const res = await fetch('/api/pricing/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();

  const b = data.breakdown;
  document.getElementById('pricingSummaryBadge').textContent =
    `${data.matchedCompetitorBids.length} Historical Benchmarks Matched`;

  document.getElementById('pricingBreakdownBanner').innerHTML = `
    <strong>Landed Cost Calculation:</strong> Net Factory Cost (<span class="mono">$${b.baseFactoryCost.toLocaleString()}</span>)
    + Freight (${b.shippingPercent}%) + Customs/Tax (${b.customsTaxPercent}%) + Material Escalation (${b.materialEscalationPercent}%)
    = <strong>Estimated Landed Cost: <span class="mono">$${b.estimatedLandedUnitCost.toLocaleString()}</span> / unit</strong>.<br/>
    <strong>Market-Adjusted Competitor Benchmark:</strong> Historical Competitor Average (<span class="mono">$${b.historicalAvgCompetitorPrice.toLocaleString()}</span>) escalated by +${b.totalMarketAdjustmentPercent}% cumulative market factors =
    <strong><span class="mono">$${b.adjustedMarketCompetitorAvg.toLocaleString()}</span> / unit</strong>.
  `;

  const r = data.recommendations;
  document.getElementById('pricingTiersContainer').innerHTML = `
    <div class="tier-card">
      <span class="badge badge-public">Tier 1 — Aggressive Bid</span>
      <div class="tier-price">$${r.aggressive.unitPrice.toLocaleString()} <span style="font-size:0.75rem; font-weight:400;">/ unit</span></div>
      <div class="mono" style="font-size:0.78rem; color:var(--accent-primary); font-weight:700;">Extended (${data.quantity} units): $${r.aggressive.totalPrice.toLocaleString()}</div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.45rem;">
        Gross Margin: <strong>${r.aggressive.estimatedMarginPercent}%</strong><br/>
        Positioning: ${r.aggressive.winProbability}
      </div>
    </div>

    <div class="tier-card recommended">
      <span class="badge badge-blue">Tier 2 — Recommended Bid</span>
      <div class="tier-price">$${r.balanced.unitPrice.toLocaleString()} <span style="font-size:0.75rem; font-weight:400;">/ unit</span></div>
      <div class="mono" style="font-size:0.78rem; color:var(--accent-primary); font-weight:700;">Extended (${data.quantity} units): $${r.balanced.totalPrice.toLocaleString()}</div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.45rem;">
        Gross Margin: <strong>${r.balanced.estimatedMarginPercent}%</strong><br/>
        Positioning: ${r.balanced.winProbability}
      </div>
    </div>

    <div class="tier-card">
      <span class="badge badge-restricted">Tier 3 — Ceiling / Spec Buffer</span>
      <div class="tier-price">$${r.premium.unitPrice.toLocaleString()} <span style="font-size:0.75rem; font-weight:400;">/ unit</span></div>
      <div class="mono" style="font-size:0.78rem; color:var(--accent-primary); font-weight:700;">Extended (${data.quantity} units): $${r.premium.totalPrice.toLocaleString()}</div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.45rem;">
        Gross Margin: <strong>${r.premium.estimatedMarginPercent}%</strong><br/>
        Positioning: ${r.premium.winProbability}
      </div>
    </div>
  `;
}

// =============================================================================
// EVENT LISTENERS & FORM HANDLERS
// =============================================================================
function bindEvents() {
  bindTenderTrackerAndCoreListeners();

  const dsCatFilter = document.getElementById('dsCategoryFilter');
  if (dsCatFilter) {
    dsCatFilter.addEventListener('change', renderDatasheetModule);
  }

  const dsProductSelect = document.getElementById('dsProductSelect');
  if (dsProductSelect) {
    dsProductSelect.addEventListener('change', () => updateDatasheetPreview(true));
  }

  ['dsCustomClient', 'dsCustomProject', 'dsDocCode', 'dsIssuedBy', 'dsIssueDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => updateDatasheetPreview(false));
  });

  // Subtabs & Field Editor Controls
  bindDatasheetSubtabs();
  bindLeftPanelFieldListeners();

  const btnToggleFields = document.getElementById('btnToggleFieldsEditor');
  if (btnToggleFields) {
    btnToggleFields.addEventListener('click', () => {
      const btnFields = document.getElementById('btnDsTabFields');
      const btnSettings = document.getElementById('btnDsTabSettings');
      if (btnFields && btnFields.classList.contains('active')) {
        btnSettings.click();
      } else if (btnFields) {
        btnFields.click();
      }
    });
  }

  const specSearch = document.getElementById('dsSpecSearchInput');
  if (specSearch) {
    specSearch.addEventListener('input', (e) => {
      renderPreExistingFieldsEditor(e.target.value);
    });
  }

  const btnOpenModal = document.getElementById('btnOpenSpecsModal');
  if (btnOpenModal) {
    btnOpenModal.addEventListener('click', openProductSpecsModal);
  }

  const modalSearch = document.getElementById('modalSpecSearchInput');
  if (modalSearch) {
    modalSearch.addEventListener('input', renderModalSpecsTable);
  }

  const btnModalAdd = document.getElementById('btnModalAddSpec');
  if (btnModalAdd) {
    btnModalAdd.addEventListener('click', () => {
      const kInput = document.getElementById('modalNewSpecKey');
      const vInput = document.getElementById('modalNewSpecVal');
      const k = kInput.value.trim();
      const v = vInput.value.trim();
      if (!k || !v) {
        alert('Please provide both Parameter Name and Value.');
        return;
      }
      const prod = getSelectedProduct();
      if (!prod) return;
      prod.Specifications = { ...(prod.Specifications || {}), [k]: v };
      kInput.value = '';
      vInput.value = '';
      updateDatasheetPreview(false);
      renderPreExistingFieldsEditor();
      renderModalSpecsTable();
    });
  }

  const btnModalSave = document.getElementById('btnModalSaveSpecs');
  if (btnModalSave) {
    btnModalSave.addEventListener('click', async () => {
      await saveProductEdits();
      document.getElementById('dialogProductSpecsEditor').close();
    });
  }

  const btnSaveEdits = document.getElementById('btnSaveProductEdits');
  if (btnSaveEdits) btnSaveEdits.addEventListener('click', saveProductEdits);

  const btnRevertEdits = document.getElementById('btnRevertProductEdits');
  if (btnRevertEdits) btnRevertEdits.addEventListener('click', revertProductEdits);

  // Add Spec Row button
  const btnAddSpec = document.getElementById('btnAddSpecRow');
  if (btnAddSpec) {
    btnAddSpec.addEventListener('click', async () => {
      const keyInput = document.getElementById('newSpecKey');
      const valInput = document.getElementById('newSpecVal');
      const key = keyInput.value.trim();
      const val = valInput.value.trim();
      if (!key || !val) {
        alert('Please enter both a Parameter Name and a Value.');
        return;
      }
      const prod = getSelectedProduct();
      if (!prod) return;
      prod.Specifications = { ...(prod.Specifications || {}), [key]: val };
      keyInput.value = '';
      valInput.value = '';
      updateDatasheetPreview(true);
      await saveProductEdits();
    });
  }

  // Product Image Controls
  const fileInput = document.getElementById('dsImageFileInput');
  const btnUpload = document.getElementById('btnUploadImage');
  const btnRemove = document.getElementById('btnRemoveImage');
  const btnApplyUrl = document.getElementById('btnApplyImageUrl');
  const urlInput = document.getElementById('dsImageUrlInput');

  if (btnUpload && fileInput) {
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const prod = getSelectedProduct();
        if (prod) {
          appState.productImages[prod.Id] = loadEvt.target.result;
          updateDatasheetPreview(false);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnRemove) {
    btnRemove.addEventListener('click', () => {
      const prod = getSelectedProduct();
      if (prod) {
        delete appState.productImages[prod.Id];
        updateDatasheetPreview(false);
      }
    });
  }

  if (btnApplyUrl && urlInput) {
    btnApplyUrl.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) return;
      const prod = getSelectedProduct();
      if (prod) {
        appState.productImages[prod.Id] = url;
        urlInput.value = '';
        updateDatasheetPreview(false);
      }
    });
  }

  document.getElementById('btnGeneratePDF').addEventListener('click', async () => {
    const prod = getSelectedProduct();
    if (prod) {
      const docCode = document.getElementById('dsDocCode')?.value || 'DS-MTX-2026-001';
      const customProject = document.getElementById('dsCustomProject')?.value || 'National IT & Data Infrastructure Submittal';
      const customClient = document.getElementById('dsCustomClient')?.value || 'Ministry of Digital Economy & Entrepreneurship';
      const issuedBy = document.getElementById('dsIssuedBy')?.value || (appState.activeUser ? appState.activeUser.FullName : 'Eng. Mohammed Al-Mansoor');
      const issueDate = document.getElementById('dsIssueDate')?.value || new Date().toISOString().slice(0, 10);

      try {
        const res = await fetch('/api/datasheets/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ProductId: prod.Id,
            DocumentCode: docCode,
            Version: prod.Revision || 'Rev 2026.1',
            CustomProjectName: customProject,
            CustomClientName: customClient,
            GeneratedBy: issuedBy,
            GeneratedAt: issueDate
          })
        });
        const entry = await res.json();
        appState.datasheets.unshift(entry);
        renderDatasheetHistory();
        renderPreviousDatasheetsTable();
        renderAllCounts();
      } catch (err) {
        console.error('Failed to log datasheet submittal:', err);
      }
    }
    window.print();
  });

  // Sidebar Datasheet Dropdown Toggle
  const dsNavWrapper = document.getElementById('dsNavWrapper');
  const btnDsNavDropdownToggle = document.getElementById('btnDsNavDropdownToggle');
  const navBtnDatasheets = document.getElementById('navBtnDatasheets');

  if (btnDsNavDropdownToggle && dsNavWrapper) {
    btnDsNavDropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dsNavWrapper.classList.toggle('open');
      const isOpen = dsNavWrapper.classList.contains('open');
      btnDsNavDropdownToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  if (navBtnDatasheets && dsNavWrapper) {
    navBtnDatasheets.addEventListener('click', (e) => {
      // If user clicks on the rightmost 50px of the button, toggle the dropdown
      const rect = navBtnDatasheets.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX > rect.width - 50) {
        e.stopPropagation();
        dsNavWrapper.classList.toggle('open');
        const isOpen = dsNavWrapper.classList.contains('open');
        if (btnDsNavDropdownToggle) btnDsNavDropdownToggle.setAttribute('aria-expanded', String(isOpen));
        return;
      }
      // Otherwise, open the creator view and show dropdown
      switchDsView('creator');
      dsNavWrapper.classList.add('open');
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (dsNavWrapper && !dsNavWrapper.contains(e.target)) {
      dsNavWrapper.classList.remove('open');
      if (btnDsNavDropdownToggle) btnDsNavDropdownToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Sidebar Submenu items
  const btnNavCreateDs = document.getElementById('btnNavCreateDs');
  if (btnNavCreateDs) {
    btnNavCreateDs.addEventListener('click', (e) => {
      e.stopPropagation();
      switchDsView('creator');
    });
  }

  const btnNavHistoryDs = document.getElementById('btnNavHistoryDs');
  if (btnNavHistoryDs) {
    btnNavHistoryDs.addEventListener('click', (e) => {
      e.stopPropagation();
      switchDsView('history');
    });
  }

  // Header Segmented Switcher buttons
  const btnDsModeCreator = document.getElementById('btnDsModeCreator');
  if (btnDsModeCreator) {
    btnDsModeCreator.addEventListener('click', () => switchDsView('creator'));
  }

  const btnDsModeHistory = document.getElementById('btnDsModeHistory');
  if (btnDsModeHistory) {
    btnDsModeHistory.addEventListener('click', () => switchDsView('history'));
  }

  const btnHistorySwitchToCreator = document.getElementById('btnHistorySwitchToCreator');
  if (btnHistorySwitchToCreator) {
    btnHistorySwitchToCreator.addEventListener('click', () => switchDsView('creator'));
  }

  const btnHistoryCreateNewSubmittal = document.getElementById('btnHistoryCreateNewSubmittal');
  if (btnHistoryCreateNewSubmittal) {
    btnHistoryCreateNewSubmittal.addEventListener('click', () => switchDsView('creator'));
  }

  const btnQuickOpenHistoryArchive = document.getElementById('btnQuickOpenHistoryArchive');
  if (btnQuickOpenHistoryArchive) {
    btnQuickOpenHistoryArchive.addEventListener('click', () => switchDsView('history'));
  }

  // Previous Datasheets Search & Filter
  const dsHistorySearch = document.getElementById('dsHistorySearch');
  if (dsHistorySearch) {
    dsHistorySearch.addEventListener('input', () => renderPreviousDatasheetsTable());
  }

  const dsHistoryAuthorityFilter = document.getElementById('dsHistoryAuthorityFilter');
  if (dsHistoryAuthorityFilter) {
    dsHistoryAuthorityFilter.addEventListener('change', () => renderPreviousDatasheetsTable());
  }

  ['contactSearchInput', 'contactFactoryFilter', 'contactVisibilityFilter'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderContactsModule);
  });

  document.getElementById('btnOpenPhoneImportModal').addEventListener('click', () => {
    document.getElementById('dialogPhoneImport').showModal();
  });
  document.getElementById('btnOpenNewContactModal').addEventListener('click', () => {
    document.getElementById('dialogNewContact').showModal();
  });
  document.getElementById('btnOpenNewFactoryModal').addEventListener('click', () => {
    document.getElementById('dialogNewFactory').showModal();
  });
  document.getElementById('btnOpenNewProductModal').addEventListener('click', () => {
    document.getElementById('dialogNewProduct').showModal();
  });
  document.getElementById('btnOpenNewCompetitorBidModal').addEventListener('click', () => {
    document.getElementById('dialogNewCompetitorBid').showModal();
  });

  document.getElementById('btnExportAllVCard').addEventListener('click', () => {
    const contacts = getAccessibleContacts();
    const allVcf = contacts.map(buildVCardString).join('\r\n');
    const blob = new Blob([allVcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Matrix_Contacts_${contacts.length}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('vcfFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    appState.stagedPhoneContacts = parseVCardOrCSV(text, file.name);
    renderStagedPhonePreview();
  });

  document.getElementById('btnLoadSampleVcf').addEventListener('click', () => {
    const sampleVcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Eng. Yasser Al-Dosari',
      'ORG:Saudi Electricity Project Tendering',
      'TITLE:Senior Substation Specifier',
      'TEL;TYPE=CELL:+966 55 801 4429',
      'EMAIL:y.aldosari@sec-projects.sa',
      'NOTE:Exported from iOS Contacts - Approves LV/MV Switchgear submittals',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Marco Rossi',
      'ORG:Milano Cast Resin Coils S.r.l',
      'TITLE:Export Sales Director',
      'TEL;TYPE=CELL:+39 02 9182 7731',
      'EMAIL:m.rossi@milanocoils.it',
      'NOTE:Exported from Android Contacts - Dry transformer windings supplier',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Eng. Sultan Al-Ghamdi',
      'ORG:National Water Transmission Co.',
      'TITLE:Pumping Stations Procurement Lead',
      'TEL;TYPE=CELL:+966 50 992 1184',
      'EMAIL:sultan.g@nwtc.sa',
      'NOTE:Exported from iOS Contacts - Key contact for split-case pump tenders',
      'END:VCARD'
    ].join('\r\n');

    appState.stagedPhoneContacts = parseVCardOrCSV(sampleVcf, 'AddressBook_Export.vcf');
    renderStagedPhonePreview();
  });

  document.getElementById('btnConfirmVcfImport').addEventListener('click', async () => {
    if (!appState.stagedPhoneContacts.length) return;
    const defaultFac = document.getElementById('importDefaultFactory').value;
    const defaultVis = document.getElementById('importDefaultVisibility').value;

    const prepared = appState.stagedPhoneContacts.map(c => ({
      ...c,
      FactoryId: defaultFac ? Number(defaultFac) : null,
      VisibilityLevel: defaultVis || 'Public'
    }));

    const res = await fetch('/api/contacts/bulk-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts: prepared })
    });
    const data = await res.json();
    if (data.contacts) {
      appState.contacts = [...data.contacts, ...appState.contacts];
      appState.stagedPhoneContacts = [];
      renderContactsModule();
      renderFactoriesModule();
      renderAllCounts();
      document.getElementById('dialogPhoneImport').close();
    }
  });

  document.getElementById('formNewContact').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const created = await res.json();
    appState.contacts.unshift(created);
    e.target.reset();
    document.getElementById('dialogNewContact').close();
    renderContactsModule();
    renderFactoriesModule();
    renderAllCounts();
  });

  document.getElementById('formNewFactory').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch('/api/factories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const created = await res.json();
    appState.factories.unshift(created);
    e.target.reset();
    document.getElementById('dialogNewFactory').close();
    populateFactoryDropdowns();
    renderFactoriesModule();
    renderAllCounts();
  });

  document.getElementById('formNewProduct').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.Specifications = {
      "Rated Operational Capacity": "Custom Factory Spec",
      "Ambient Temperature Rating": "-5°C to +55°C Heavy Duty",
      "Enclosure / Protection": "IP55 / IP65 Industrial Grade",
      "Quality Routine Test": "100% Factory Certified prior to dispatch"
    };
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const created = await res.json();
    appState.products.unshift(created);
    e.target.reset();
    document.getElementById('dialogNewProduct').close();
    renderDatasheetModule();
    renderFactoriesModule();
    renderAllCounts();
  });

  document.getElementById('formNewCompetitorBid').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.WasWinningBid = body.WasWinningBid === 'true';
    const res = await fetch('/api/pricing/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const created = await res.json();
    appState.competitorPrices.unshift(created);
    e.target.reset();
    document.getElementById('dialogNewCompetitorBid').close();
    renderPricingModule();
    runPricingEstimator();
  });

  document.getElementById('factorySearchInput').addEventListener('input', renderFactoriesModule);

  document.getElementById('tenderFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    document.getElementById('tenderRawTextInput').value = text.slice(0, 8000);
  });

  document.getElementById('btnLoadSampleTenderText').addEventListener('click', () => {
    document.getElementById('tenderTitleInput').value = 'Ministry & University IT Infrastructure, Interactive Screens & 40kVA UPS Tender';
    document.getElementById('tenderClientInput').value = 'Government Tenders Department (Jordan)';
    document.getElementById('tenderCustomQuestion').value = 'Identify matching SajayaTech PC/UPS/Interactive Screen SKUs, warranty terms, and non-essential clauses.';
    document.getElementById('tenderRawTextInput').value = [
      'ITEM 1 (DESKTOPS - QTY 450): Commercial Desktop PC with Intel 14th Gen Core i5/i7, Intel Q670/Q870 Enterprise Chipset, 16GB DDR5 RAM, 512GB NVMe SSD, Hardware TPM 2.0, and 3-Year Local Factory On-Site Warranty.',
      'ITEM 2 (MONITORS - QTY 450): 27-inch QHD (2560x1440) IPS Monitor, 100Hz refresh rate, 65W USB-C Power Delivery, and height-adjustable pivot stand with Zero-Bright-Dot warranty.',
      'ITEM 3 (INTERACTIVE BOARDS - QTY 15): 75-inch 4K UHD Interactive Flat Panel with 7H zero-gap bonded glass, 50-point IR touch, 48MP AI camera, 8-mic array, and Dual OS (Android 13 + Intel Core i7 Windows 11 Pro OPS module).',
      'ITEM 4 (ONLINE UPS - QTY 2): 40kVA 3-Phase In / 3-Phase Out True Online Double-Conversion UPS, 3-Level IGBT, Unity Output PF 1.0, 96.5% online efficiency, 0ms transfer, and SNMP network management card.',
      'COMMERCIAL CLAUSE 2.8: Bidders must provide a 5% Bid Bond, 10% Performance Bond, and Official Local Manufacturer OEM Authorization Letter. Delay penalty 0.1% per day up to 10%.',
      'ANNEX D-9: Delivery trucks must enter via Gate 3 between 09:00 and 13:00 and place empty cardboard boxes in the designated recycling zone.'
    ].join('\n\n');
  });

  document.getElementById('tenderFilterImportance').addEventListener('change', renderTendersModule);

  // Competitor Equivalence Checkers
  const btnCheckEquiv = document.getElementById('btnCheckEquivalentsDirect');
  if (btnCheckEquiv) {
    btnCheckEquiv.addEventListener('click', () => runCompetitorEquivalenceCheck());
  }

  const btnExportEquiv = document.getElementById('btnExportEquivalentsCSV');
  if (btnExportEquiv) {
    btnExportEquiv.addEventListener('click', exportEquivalentsCSV);
  }

  // Quick brand chip toggles
  document.querySelectorAll('.competitor-quick-chips .chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const brand = btn.dataset.brand;
      const compInput = document.getElementById('tenderCompetitorInput');
      if (!brand || !compInput) return;

      let currentBrands = compInput.value.split(/[,;&/]+/).map(b => b.trim()).filter(Boolean);
      const idx = currentBrands.findIndex(b => b.toLowerCase() === brand.toLowerCase());

      if (idx !== -1) {
        currentBrands.splice(idx, 1);
        btn.classList.remove('active');
      } else {
        currentBrands.push(brand);
        btn.classList.add('active');
      }

      compInput.value = currentBrands.join(', ');
    });
  });


  document.getElementById('tenderAnalyzeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/tenders/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.getElementById('tenderTitleInput').value,
        clientName: document.getElementById('tenderClientInput').value,
        rawText: document.getElementById('tenderRawTextInput').value,
        customQuestion: document.getElementById('tenderCustomQuestion').value
      })
    });
    const newTender = await res.json();
    appState.tenders.unshift(newTender);
    renderTendersModule();
  });

  document.getElementById('pricingEstimateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runPricingEstimator();
  });

  document.getElementById('estCategory').addEventListener('change', (e) => {
    const val = e.target.value;
    const defaults = {
      'Personal Computers (Desktops)': { desc: 'SajayaTech B1Q / S500 Desktop (Core i5/i7 14th Gen, Q-Chipset, 16GB DDR5, 512GB NVMe, TPM 2.0)', cost: 460, qty: 450 },
      'Small Form Factor (SFF) Desktops': { desc: 'Sajaya TechDesk B20S-I SFF (9.5L, Core i5/i7 14th Gen, 16GB DDR5, 512GB NVMe)', cost: 510, qty: 200 },
      'Mini PCs': { desc: 'Sajaya TechDesk B20M-I / B70M-I Mini PC (0.8L, Core i5/i7, 16GB DDR5, Triple/Quad 4K)', cost: 390, qty: 150 },
      'Workstations': { desc: 'Sajaya TechDesk W70T-I / W50T-I Workstation (Core i9 / Xeon, 64GB DDR5 ECC, RTX Ada)', cost: 1850, qty: 40 },
      'Laptops (TechBook)': { desc: 'Sajaya TechBook B20S-I / L500 15.6" QHD Laptop (Core i7, 16GB DDR5, 1TB SSD, TPM 2.0)', cost: 680, qty: 120 },
      'All-in-One PCs': { desc: 'Sajaya TechDesk A270 27" QHD All-in-One PC (Core i5/i7 14th Gen, 16GB DDR5, Pop-up IR Cam)', cost: 590, qty: 100 },
      'Monitors (Commercial & Gaming)': { desc: 'Sajaya TechView B27S 27" QHD 100Hz IPS Monitor (65W USB-C PD, Ergonomic Stand)', cost: 165, qty: 450 },
      'Interactive Touch Screens': { desc: 'Sajaya Smart I750 75" 4K Interactive Touch Board (Android 13 + Core i7 OPS PC, 48MP AI Cam)', cost: 1250, qty: 25 },
      'UPS & Power Systems (Sajaya Power)': { desc: 'Sajaya Power HP9336C 40kVA 3-Phase Online Double-Conversion UPS (PF 1.0, 96.5% Eff)', cost: 2850, qty: 4 },
      'CCTV & NVR Surveillance': { desc: 'Sajaya Vision D500 5MP IK10 AI Dome Camera + NVR32E 32-Ch 4K Enterprise NVR', cost: 220, qty: 50 },
      'Charge Carts & IT Accessories': { desc: 'Sajaya TechGears CHGCT36USBCPD-2E 36-Bay 65W USB-C PD Smart Mobile Charging Cart', cost: 640, qty: 15 }
    };
    if (defaults[val]) {
      document.getElementById('estDescription').value = defaults[val].desc;
      document.getElementById('estBaseCost').value = defaults[val].cost;
      document.getElementById('estQuantity').value = defaults[val].qty;
    }
    runPricingEstimator();
  });

  document.getElementById('sqlConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = document.getElementById('sqlTestResultBox');
    box.textContent = 'Testing connection to MS SQL Server...';
    const res = await fetch('/api/sql/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dbConfig: {
          server: document.getElementById('sqlServerInput').value,
          database: document.getElementById('sqlDatabaseInput').value,
          user: document.getElementById('sqlUserInput').value,
          password: document.getElementById('sqlPassInput').value
        }
      })
    });
    const result = await res.json();
    if (result.success) {
      box.innerHTML = `<strong>Connected:</strong> ${result.state.mode}`;
      document.getElementById('sqlStatusText').textContent = result.state.mode;
    } else {
      box.innerHTML = `<strong>Local Mirror Active:</strong> Direct TCP connection returned (${result.error}). All records remain persisted and compiled into the downloadable <strong>MatrixFactoryDB_SSMS_FullSync.sql</strong> script for SQL Server Management Studio.`;
    }
  });
}

function renderStagedPhonePreview() {
  const box = document.getElementById('vcfPreviewBox');
  if (!appState.stagedPhoneContacts.length) {
    box.innerHTML = 'No contacts parsed.';
    return;
  }
  box.innerHTML = `
    <div style="font-weight:700; color:var(--status-green-text); margin-bottom:0.45rem;">
      Staged ${appState.stagedPhoneContacts.length} Contacts Ready for Database Import:
    </div>
    ${appState.stagedPhoneContacts.map((c, idx) => `
      <div style="padding:0.35rem 0.5rem; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:3px; margin-bottom:0.25rem; display:flex; justify-content:space-between;">
        <span><strong>${idx + 1}. ${c.FullName}</strong> — ${c.JobTitle} (${c.CompanyName})</span>
        <span class="mono">${c.Phone}</span>
      </div>
    `).join('')}
  `;
}

document.addEventListener('DOMContentLoaded', initApp);
