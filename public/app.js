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
  productImages: {}
};

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
  appState.datasheets = data.datasheets || [];
  appState.tenders = data.tenders || [];
  appState.aiFeedbackRules = data.aiFeedbackRules || [];
  appState.competitorPrices = data.competitorPrices || [];
  appState.marketFactors = data.marketFactors || [];

  renderUserSwitcher();
  renderAllCounts();
  populateFactoryDropdowns();
  renderDatasheetModule();
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

function updateDatasheetPreview() {
  const product = getSelectedProduct();
  if (!product) return;

  const factory = appState.factories.find(f => f.Id === product.FactoryId) || appState.factories[0];

  // Factory Header
  document.getElementById('dsFactoryHeaderName').textContent = factory ? factory.Name.toUpperCase() : 'MATRIX MAIN INDUSTRIAL PLANT';
  document.getElementById('dsFactoryHeaderSub').textContent = factory
    ? `${factory.Certifications || 'ISO 9001'} • ${factory.City ? factory.City + ', ' : ''}${factory.Country}`
    : 'ISO 9001 • Certified Industrial Manufacturing Facility • Amman, Jordan';

  // Submittal Meta
  document.getElementById('previewDocCode').textContent = document.getElementById('dsDocCode').value || 'DS-MTX-2026-001';
  document.getElementById('previewSKU').textContent = product.SKU;
  document.getElementById('previewRev').textContent = product.Revision || 'Rev 2026.1';
  document.getElementById('previewDate').textContent = new Date().toISOString().slice(0, 10);

  // Title Banner
  document.getElementById('previewCategory').textContent = product.Category;
  document.getElementById('previewProductName').textContent = product.Name;
  document.getElementById('previewSummary').textContent = product.Summary || '';

  // Meta strip
  document.getElementById('previewFactoryOrigin').textContent = factory ? `${factory.Name} (${factory.Country})` : 'Matrix Main Plant';
  document.getElementById('previewWarranty').textContent = `${product.WarrantyMonths || 36} Months Factory Warranty`;
  document.getElementById('previewCompliance').textContent = product.ComplianceStandards || 'ISO 9001, CE, RoHS, JSMO';

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
}

// Unique Layout Renderer for Each Product Type
function renderProductUniqueLayout(product) {
  const container = document.getElementById('previewUniqueLayout');
  if (!container) return;

  const cat = product.Category || '';
  const specs = product.Specifications || {};
  const features = Array.isArray(product.Features) && product.Features.length
    ? product.Features
    : ['Manufactured under ISO 9001 quality management', 'Tested for 24h continuous operation', 'Local Jordan SLA & spare parts support'];

  let layoutHtml = '';

  if (cat === 'Personal Computers' || cat === 'SFF Desktops' || cat === 'Mini PCs') {
    layoutHtml = `
      <div class="ds-highlight-grid-4">
        <div class="ds-highlight-card">
          <div class="ds-highlight-label">Processor / CPU</div>
          <div class="ds-highlight-val">${specs['Processor'] || 'Intel Core / AMD'}</div>
        </div>
        <div class="ds-highlight-card">
          <div class="ds-highlight-label">System Memory</div>
          <div class="ds-highlight-val">${specs['Memory (RAM)'] || 'DDR5 / DDR4 RAM'}</div>
        </div>
        <div class="ds-highlight-card">
          <div class="ds-highlight-label">Storage Drive</div>
          <div class="ds-highlight-val">${specs['Storage Drive'] || specs['Storage'] || 'M.2 NVMe SSD'}</div>
        </div>
        <div class="ds-highlight-card">
          <div class="ds-highlight-label">Form Factor</div>
          <div class="ds-highlight-val">${specs['Form Factor'] || specs['Form Factor & Chassis'] || cat}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Hardware Architecture & Technical Schedule</span>
        <span style="font-size:0.68rem; font-weight:400; color:#64748b;">Enterprise Specification</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Key Enterprise Features</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else if (cat === 'Workstations' || cat === 'Gaming PCs & Peripherals') {
    layoutHtml = `
      <div class="ds-highlight-grid-3">
        <div class="ds-highlight-card" style="border-left-color:#7c3aed;">
          <div class="ds-highlight-label">Performance Processor</div>
          <div class="ds-highlight-val">${specs['Processor'] || specs['Processors'] || 'Intel Xeon / AMD Threadripper'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#7c3aed;">
          <div class="ds-highlight-label">Pro Graphics (GPU)</div>
          <div class="ds-highlight-val">${specs['Graphics'] || specs['Graphics Cards'] || 'NVIDIA RTX / Quadro'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#7c3aed;">
          <div class="ds-highlight-label">Memory & Storage</div>
          <div class="ds-highlight-val">${specs['Memory (RAM)'] || 'High-Speed ECC / DDR5'}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Workstation Engineering Ratings</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Reliability & Thermal Standards</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else if (cat === 'Laptops') {
    layoutHtml = `
      <div class="ds-highlight-grid-4">
        <div class="ds-highlight-card" style="border-left-color:#0284c7;">
          <div class="ds-highlight-label">Display Panel</div>
          <div class="ds-highlight-val">${specs['Display Panel'] || 'IPS Anti-Glare'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#0284c7;">
          <div class="ds-highlight-label">Core Engine</div>
          <div class="ds-highlight-val">${specs['Processor'] || 'Intel Core Ultra'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#0284c7;">
          <div class="ds-highlight-label">Memory & Storage</div>
          <div class="ds-highlight-val">${specs['Memory (RAM)'] || 'DDR5'} / ${specs['Storage'] || 'NVMe'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#0284c7;">
          <div class="ds-highlight-label">Battery & Weight</div>
          <div class="ds-highlight-val">${specs['Weight & Battery'] || 'Long-Life USB-C PD'}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Mobility & Technical Specifications</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Security & Build Highlights</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else if (cat === 'Monitors') {
    layoutHtml = `
      <div class="ds-highlight-grid-4">
        <div class="ds-highlight-card" style="border-left-color:#059669;">
          <div class="ds-highlight-label">Panel Size & Type</div>
          <div class="ds-highlight-val">${specs['Panel Size & Type'] || 'IPS Panel'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#059669;">
          <div class="ds-highlight-label">Resolution & Refresh</div>
          <div class="ds-highlight-val">${specs['Resolution & Refresh'] || '100Hz - 240Hz'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#059669;">
          <div class="ds-highlight-label">Color Gamut</div>
          <div class="ds-highlight-val">${specs['Color Coverage'] || '99% sRGB'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#059669;">
          <div class="ds-highlight-label">Eye Protection</div>
          <div class="ds-highlight-val">${specs['Eye Care Technology'] || 'TÜV Low Blue Light'}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Optical & Display Characteristics</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Ergonomics & Hub Connectivity</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else if (cat === 'Interactive Touch Screens') {
    layoutHtml = `
      <div class="ds-highlight-grid-3">
        <div class="ds-highlight-card" style="border-left-color:#ea580c;">
          <div class="ds-highlight-label">Touch Precision</div>
          <div class="ds-highlight-val">${specs['Touch Technology'] || '40-Point Touch'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#ea580c;">
          <div class="ds-highlight-label">Dual Operating System</div>
          <div class="ds-highlight-val">${specs['Dual OS Architecture'] || 'Android + Windows OPS'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#ea580c;">
          <div class="ds-highlight-label">Camera & Audio</div>
          <div class="ds-highlight-val">${specs['AI Collaboration Camera'] || '4K ePTZ & 8-Mic Array'}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Interactive Panel Specifications</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Collaboration & Smart Software</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else if (cat === 'UPS & Power Systems') {
    layoutHtml = `
      <div class="ds-highlight-grid-4">
        <div class="ds-highlight-card" style="border-left-color:#dc2626;">
          <div class="ds-highlight-label">Topology</div>
          <div class="ds-highlight-val">${specs['Topology'] || 'True Online Double-Conversion'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#dc2626;">
          <div class="ds-highlight-label">Transfer Time</div>
          <div class="ds-highlight-val">${specs['Transfer Time'] || '0 ms (Zero Interruption)'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#dc2626;">
          <div class="ds-highlight-label">Power Factor</div>
          <div class="ds-highlight-val">${specs['Power Factor & THDi'] || 'PF 1.0 (Unity)'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#dc2626;">
          <div class="ds-highlight-label">Efficiency</div>
          <div class="ds-highlight-val">${specs['System Efficiency'] || 'Up to 96%'}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Electrical Input / Output Ratings</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Power Protection & Telemetry</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else if (cat === 'CCTV & Surveillance') {
    layoutHtml = `
      <div class="ds-highlight-grid-4">
        <div class="ds-highlight-card" style="border-left-color:#4f46e5;">
          <div class="ds-highlight-label">Sensor & Resolution</div>
          <div class="ds-highlight-val">${specs['Image Sensor & Resolution'] || '4MP / 5MP / 4K 8MP'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#4f46e5;">
          <div class="ds-highlight-label">Smart Night Vision</div>
          <div class="ds-highlight-val">${specs['Night Vision'] || 'Dual-Light Smart IR 50m'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#4f46e5;">
          <div class="ds-highlight-label">AI Edge Analytics</div>
          <div class="ds-highlight-val">${specs['AI Edge Analytics'] || 'Human & Vehicle Detection'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#4f46e5;">
          <div class="ds-highlight-label">Protection Enclosure</div>
          <div class="ds-highlight-val">${specs['Housing & Protection'] || 'IP67 & IK10 Vandal'}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Optical & Video Analytics Schedule</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Compression & Compliance</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else if (cat === 'Charge Carts & Accessories') {
    layoutHtml = `
      <div class="ds-highlight-grid-3">
        <div class="ds-highlight-card" style="border-left-color:#0891b2;">
          <div class="ds-highlight-label">Device Capacity</div>
          <div class="ds-highlight-val">${specs['Device Capacity'] || '36 Devices'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#0891b2;">
          <div class="ds-highlight-label">Smart Power Delivery</div>
          <div class="ds-highlight-val">${specs['USB-C Power Output'] || '65W USB-C PD'}</div>
        </div>
        <div class="ds-highlight-card" style="border-left-color:#0891b2;">
          <div class="ds-highlight-label">Chassis & Security</div>
          <div class="ds-highlight-val">${specs['Chassis & Security'] || 'Cold-Rolled SPCC Steel'}</div>
        </div>
      </div>

      <div class="ds-section-title">
        <span>Electrical & Mobility Specifications</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Safety & Cable Routing</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  } else {
    layoutHtml = `
      <div class="ds-section-title">
        <span>Technical Schedule & Guaranteed Ratings</span>
      </div>
      ${renderSpecTable(specs)}

      <div class="ds-section-title" style="margin-top:0.75rem;">
        <span>Design & Engineering Features</span>
      </div>
      <div class="ds-feature-pills">
        ${features.map(f => `<span class="ds-pill">• ${f}</span>`).join('')}
      </div>
    `;
  }

  container.innerHTML = layoutHtml;
}

function renderSpecTable(specs) {
  const rows = Object.entries(specs).map(([k, v]) => `
    <tr>
      <th>${k}</th>
      <td class="mono">${v}</td>
    </tr>
  `).join('');

  return `
    <table class="ds-spec-table">
      <thead>
        <tr>
          <th>Characteristic / Parameter</th>
          <th>Guaranteed Factory Value</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><th>Standard Rating</th><td>Per Factory Technical Schedule</td></tr>'}</tbody>
    </table>
  `;
}

function renderDatasheetHistory() {
  const box = document.getElementById('datasheetHistoryList');
  if (!box) return;
  if (!appState.datasheets.length) {
    box.innerHTML = `<div style="color:var(--text-muted);">No submittals logged.</div>`;
    return;
  }
  box.innerHTML = appState.datasheets.slice(0, 5).map(d => {
    const p = appState.products.find(x => x.Id === d.ProductId);
    return `<div style="display:flex; justify-content:space-between; padding:0.35rem 0.55rem; background:var(--bg-subtle); border:1px solid var(--border-subtle); border-radius:4px;">
      <span class="mono"><strong>${d.DocumentCode}</strong> (${p ? p.Name : 'Product'})</span>
      <span style="color:var(--text-secondary);">${d.GeneratedAt ? d.GeneratedAt.slice(0, 10) : 'Submittal'}</span>
    </div>`;
  }).join('');
}


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

function bindEvents() {
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
  const dsCatFilter = document.getElementById('dsCategoryFilter');
  if (dsCatFilter) {
    dsCatFilter.addEventListener('change', renderDatasheetModule);
  }

  ['dsProductSelect', 'dsCustomClient', 'dsCustomProject', 'dsDocCode', 'dsAccentColor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateDatasheetPreview);
  });

  document.getElementById('btnAddSpecRow').addEventListener('click', async () => {
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

  document.getElementById('btnGeneratePDF').addEventListener('click', async () => {
    const prod = getSelectedProduct();
    if (prod) {
      const res = await fetch('/api/datasheets/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ProductId: prod.Id,
          DocumentCode: document.getElementById('dsDocCode').value,
          Version: prod.Revision,
          CustomProjectName: document.getElementById('dsCustomProject').value,
          CustomClientName: document.getElementById('dsCustomClient').value,
          GeneratedBy: appState.activeUser ? appState.activeUser.FullName : 'User'
        })
      });
      const entry = await res.json();
      appState.datasheets.unshift(entry);
      renderDatasheetHistory();
    }
    window.print();
  });

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
