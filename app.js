  function goto(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.querySelector('[data-screen="' + name + '"]');
    if (el) el.classList.add('active');
    document.querySelectorAll('.legend button').forEach(b => b.classList.toggle('active', b.dataset.go === name));
    // scroll to top of phone body
    const body = el && el.querySelector('.screen-body');
    if (body) body.scrollTop = 0;
    // start/stop the live camera as we enter/leave the camera screen
    if (name === 'camera') startCamera();
    else stopCamera();
    // refresh data-driven screens as we land on them
    if (name === 'project') renderProjectDetail();
    if (name === 'dashboard') { renderDashboard(); renderDayStatus(); }
    if (name === 'admin') renderAdminScreen();
    if (name === 'timesheet') renderTimesheet();
    if (name === 'receipts') renderReceipts();
  }
  document.querySelectorAll('.legend button').forEach(b => {
    b.addEventListener('click', () => goto(b.dataset.go));
  });

  function setProjectTab(btn, tab) {
    btn.parentElement.querySelectorAll('.tabbtn').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('[data-ptab]').forEach(p => p.style.display = (p.dataset.ptab === tab ? 'block' : 'none'));
    if (tab === 'photos') renderPhotos();
  }

  /* ---------------- AI Assist: parse natural language into timeline entries ---------------- */

  // Mock dictation — toggles a "listening" state and drops a sample phrase in.
  let micOn = false;
  function toggleMic() {
    const mic = document.getElementById('aiMic');
    const input = document.getElementById('aiInput');
    micOn = !micOn;
    mic.classList.toggle('listening', micOn);
    if (micOn) {
      input.placeholder = "Listening…  (this is a mockup — real app uses device dictation)";
      setTimeout(() => {
        if (!micOn) return;
        input.value = "Today we did drywall in the master bath, and tomorrow we need to mud and tape.";
        micOn = false;
        mic.classList.remove('listening');
        input.placeholder = "e.g. Today we did drywall, and tomorrow we need to mud and tape.";
      }, 2200);
    } else {
      input.placeholder = "e.g. Today we did drywall, and tomorrow we need to mud and tape.";
    }
  }

  function useSuggestion(text) {
    const input = document.getElementById('aiInput');
    input.value = text;
    input.focus();
  }

  // Tiny client-side parser. Real version would call an LLM with a structured-output schema.
  // Returns: [{ status: 'done'|'active'|'upcoming', when: 'May 13', action: 'Drywall installed', phase: 'Demo' }, ...]
  function parseUpdateText(raw) {
    if (!raw || !raw.trim()) return [];
    // Today is May 13, 2026 per project context.
    const today = new Date(2026, 4, 13);
    const fmt = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // Phase / action vocabulary. Keyword → ({label, phase})
    const VOCAB = [
      { kw: ['drywall', 'sheetrock'],            label: 'Drywall installed',          phase: 'Reconstruction' },
      { kw: ['mud', 'tape', 'mudding', 'taping'],label: 'Drywall mud & tape',         phase: 'Reconstruction' },
      { kw: ['paint', 'painting', 'primer'],     label: 'Painting',                   phase: 'Reconstruction' },
      { kw: ['demo', 'tear out', 'tear-out', 'removed'], label: 'Demo & material removal', phase: 'Demo' },
      { kw: ['containment', 'plastic', 'barrier'], label: 'Containment built',        phase: 'Setup' },
      { kw: ['antimicrobial', 'treatment', 'concrobium'], label: 'Antimicrobial treatment', phase: 'Treatment' },
      { kw: ['hepa', 'vacuum', 'scrub'],          label: 'HEPA vacuum / air scrub',   phase: 'Treatment' },
      { kw: ['dry', 'drying', 'dehumidif'],       label: 'Drying with dehumidifiers', phase: 'Drying' },
      { kw: ['clearance', 'air sample', 're-test'], label: 'Clearance test',           phase: 'Clearance' },
      { kw: ['inspection', 'walk-through', 'walkthrough', 'estimate'], label: 'Inspection / walk-through', phase: 'Inspection' },
      { kw: ['moisture reading', 'moisture'],    label: 'Moisture reading taken',     phase: 'Inspection' },
      { kw: ['subfloor'],                        label: 'Subfloor work',              phase: 'Demo' },
      { kw: ['report', 'cleared', 'certificate'], label: 'Final report sent',         phase: 'Clearance' },
      { kw: ['seal', 'sealing'],                 label: 'Sealing surfaces',           phase: 'Treatment' },
    ];

    // Split into clauses on punctuation or conjunctions like ", and"
    const clauses = raw
      .replace(/\s+/g, ' ')
      .split(/[.!?]|,?\s+(?:and|then|after that|afterwards|next)\s+/i)
      .map(c => c.trim())
      .filter(Boolean);

    const out = [];
    for (const clause of clauses) {
      const low = clause.toLowerCase();

      // Determine timing
      let when, status;
      if (/\btomorrow\b/.test(low))        { const d = new Date(today); d.setDate(d.getDate()+1); when = fmt(d); status = 'upcoming'; }
      else if (/\byesterday\b/.test(low))  { const d = new Date(today); d.setDate(d.getDate()-1); when = fmt(d); status = 'done'; }
      else if (/\b(today|this morning|this afternoon|this evening|tonight)\b/.test(low)) { when = fmt(today) + ' · Today'; status = 'done'; }
      else if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(low)) {
        const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const m = low.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
        const target = days.indexOf(m[1]);
        const d = new Date(today);
        const diff = (target - d.getDay() + 7) % 7 || 7; // next occurrence
        d.setDate(d.getDate() + diff);
        when = fmt(d);
        status = 'upcoming';
      }
      else if (/\b(need to|will|going to|gonna|have to|plan to|scheduled|next)\b/.test(low)) {
        const d = new Date(today); d.setDate(d.getDate()+1); when = fmt(d);
        status = 'upcoming';
      }
      else {
        when = fmt(today) + ' · Today';
        status = 'done';
      }

      // Determine action
      const matched = [];
      for (const v of VOCAB) {
        if (v.kw.some(k => low.includes(k))) matched.push(v);
      }

      if (matched.length === 0) {
        // No vocab hit — still log the clause verbatim
        out.push({ when, status, label: clause.charAt(0).toUpperCase() + clause.slice(1), phase: 'Note', source: clause });
      } else {
        // De-dupe by phase+label
        const seen = new Set();
        for (const m of matched) {
          const key = m.phase + '|' + m.label;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ when, status, label: m.label, phase: m.phase, source: clause });
        }
      }
    }
    return out;
  }

  function renderPreview(entries, originalText) {
    const slot = document.getElementById('aiPreview');
    if (!entries.length) {
      slot.innerHTML = '<div class="ai-preview"><div class="ph-head"><span class="badge-ai">AI</span><span class="ph-title">No timeline events detected</span></div><div style="font-size:12px;color:var(--text-2);">Try mentioning what you did today or what\'s scheduled next — e.g. "did drywall today, mudding tomorrow."</div></div>';
      return;
    }
    let html = '<div class="ai-preview"><div class="ph-head"><span class="badge-ai">AI Preview</span><span class="ph-title">' + entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies') + ' detected</span><span class="ph-sub">Edit, then add</span></div>';
    entries.forEach((e, i) => {
      html += '\n<div class="ai-entry ' + e.status + '" data-i="' + i + '">'
        + '<div class="entry-dot"></div>'
        + '<div class="entry-body">'
        +   '<div class="entry-when">' + e.when + '</div>'
        +   '<div class="entry-what" contenteditable="true">' + escapeHtml(e.label) + '</div>'
        +   '<div class="entry-meta">'
        +     '<span class="mini-chip ' + (e.status === 'done' ? 'on' : '') + '" onclick="setEntryStatus(' + i + ',\'done\')">Done</span>'
        +     '<span class="mini-chip ' + (e.status === 'active' ? 'on' : '') + '" onclick="setEntryStatus(' + i + ',\'active\')">In progress</span>'
        +     '<span class="mini-chip ' + (e.status === 'upcoming' ? 'on' : '') + '" onclick="setEntryStatus(' + i + ',\'upcoming\')">Upcoming</span>'
        +     '<span class="mini-chip" style="background:var(--brand-light);color:var(--brand);border-color:var(--brand-light);">' + escapeHtml(e.phase) + '</span>'
        +   '</div>'
        + '</div>'
        + '<button class="x-btn" onclick="dropEntry(' + i + ')" title="Remove">✕</button>'
        + '</div>';
    });
    html += '<div class="ai-preview-actions">'
      + '<button class="pa-btn" onclick="discardPreview()">Discard</button>'
      + '<button class="pa-btn primary" onclick="commitPreview()">Add to timeline</button>'
      + '</div>'
      + '</div>';
    slot.innerHTML = html;
    aiState.entries = entries;
  }

  const aiState = { entries: [] };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  function setEntryStatus(i, status) {
    aiState.entries[i].status = status;
    renderPreview(aiState.entries);
  }
  function dropEntry(i) {
    aiState.entries.splice(i, 1);
    renderPreview(aiState.entries);
  }
  function discardPreview() {
    aiState.entries = [];
    document.getElementById('aiPreview').innerHTML = '';
    document.getElementById('aiInput').value = '';
  }

  function commitPreview() {
    // Read current labels from contenteditable
    const nodes = document.querySelectorAll('#aiPreview .ai-entry');
    nodes.forEach((n, i) => {
      const t = n.querySelector('.entry-what').innerText.trim();
      if (t) aiState.entries[i].label = t;
    });
    const pid = MoldDocsStore.getCurrentProjectId();
    const base = Date.now();
    const n = aiState.entries.length;
    aiState.entries.forEach((e, i) => {
      MoldDocsStore.addTimelineEntry({
        projectId: pid,
        when: e.when,
        what: e.label,
        notes: (e.phase ? e.phase + ' · ' : '') + '✨ Added via Ask the Doc',
        status: e.status,
        ts: base + i
      });
    });
    renderTimeline();
    const slot = document.getElementById('aiPreview');
    if (slot) {
      slot.innerHTML = '<div style="background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:600;margin-bottom:14px;text-align:center;">✓ '
        + n + ' entr' + (n === 1 ? 'y' : 'ies') + ' added to timeline</div>';
      setTimeout(() => { if (slot) slot.innerHTML = ''; }, 2800);
    }
    aiState.entries = [];
    const input = document.getElementById('aiInput');
    if (input) input.value = '';
  }

  /* ---------- Materials screen: i18n, voice, list state ---------- */
  let matLang = 'es';
  const itemDB = {
    drywall:    { es: 'Pliego de drywall ½"', en: 'Drywall sheet ½"',     sw: 'sw-drywall',    icon: '🧱', unit: 'pieza', unit_en: 'sheet' },
    mud:        { es: 'Mud (cubeta 5-gal)',   en: 'Joint compound (5-gal)',sw: 'sw-mud',        icon: '🪣', unit: 'cubeta', unit_en: 'bucket' },
    tape:       { es: 'Cinta para drywall',   en: 'Drywall tape',          sw: 'sw-tape',       icon: '📏', unit: 'rollo', unit_en: 'roll' },
    plastic:    { es: 'Plástico 6mil',         en: 'Plastic sheeting 6mil', sw: 'sw-plastic',    icon: '🎞', unit: 'rollo', unit_en: 'roll' },
    duct:       { es: 'Cinta adhesiva',        en: 'Duct tape',             sw: 'sw-duct',       icon: '⊙', unit: 'rollo', unit_en: 'roll' },
    bags:       { es: 'Bolsas de contratista', en: 'Contractor bags',       sw: 'sw-bags',       icon: '🗑', unit: 'caja', unit_en: 'box' },
    mask:       { es: 'Mascarillas N95',        en: 'N95 respirators',      sw: 'sw-mask',       icon: '😷', unit: 'caja', unit_en: 'box' },
    suit:       { es: 'Trajes Tyvek',           en: 'Tyvek suits',           sw: 'sw-suit',       icon: '👤', unit: 'pieza', unit_en: 'each' },
    gloves:     { es: 'Guantes de nitrilo',     en: 'Nitrile gloves',        sw: 'sw-gloves',     icon: '🧤', unit: 'caja', unit_en: 'box' },
    concrobium: { es: 'Concrobium (1-gal)',     en: 'Concrobium (1-gal)',    sw: 'sw-concrobium', icon: '🧪', unit: 'galón', unit_en: 'gallon' },
    bucket:     { es: 'Cubeta de 5 galones',    en: '5-gallon bucket',       sw: 'sw-bucket',     icon: '🪣', unit: 'pieza', unit_en: 'each' },
    screws:     { es: 'Tornillos drywall',      en: 'Drywall screws',        sw: 'sw-screws',     icon: '🔩', unit: 'caja', unit_en: 'box' },
  };
  const matList = {};  // { key: qty }

  function setMatLang(btn, lang) {
    matLang = lang;
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('[data-es]').forEach(el => {
      el.textContent = (lang === 'en') ? el.dataset.en : el.dataset.es;
    });
  }

  function bumpItem(card, delta) {
    const key = card.dataset.key;
    matList[key] = Math.max(0, (matList[key] || 0) + delta);
    const badge = card.querySelector('.qty-badge');
    if (matList[key] > 0) {
      card.classList.add('has-qty');
      badge.textContent = matList[key];
    } else {
      card.classList.remove('has-qty');
      delete matList[key];
    }
    renderMatList();
  }

  function renderMatList() {
    const wrap = document.getElementById('yourList');
    const keys = Object.keys(matList);
    // persist the list so it survives a reload
    if (typeof MoldDocsStore !== 'undefined') MoldDocsStore.kvSet('matlist', matList);
    document.getElementById('listCount').textContent = keys.length ? '· ' + keys.length + (matLang==='en'? ' items' : ' artículos') : '';
    if (!keys.length) {
      wrap.innerHTML = '<div style="text-align:center;color:var(--text-3);font-size:12px;padding:18px 8px;">' +
        (matLang==='en' ? 'Tap items above to add materials' : 'Toca arriba para agregar materiales') + '</div>';
      return;
    }
    let html = '';
    keys.forEach(k => {
      const it = itemDB[k];
      const n = matList[k];
      const unit = (matLang==='en' ? it.unit_en : it.unit);
      html += '<div class="row">'
        + '<div class="sw-mini ' + it.sw + '">' + it.icon + '</div>'
        + '<div class="label-block">'
        +   '<div class="l-es">' + (matLang==='en' ? it.en : it.es) + '</div>'
        +   '<div class="l-en">' + n + ' ' + unit + (n>1 && matLang==='en' ? 's' : '') + '</div>'
        + '</div>'
        + '<div class="qty-controls">'
        +   '<button onclick="bumpItemByKey(\'' + k + '\',-1)">−</button>'
        +   '<span class="qty-num">' + n + '</span>'
        +   '<button onclick="bumpItemByKey(\'' + k + '\',1)">+</button>'
        + '</div>'
        + '</div>';
    });
    wrap.innerHTML = html;
  }
  function bumpItemByKey(key, delta) {
    const card = document.querySelector('.cat-item[data-key="' + key + '"]');
    if (card) bumpItem(card, delta);
  }
  function clearList() {
    Object.keys(matList).forEach(k => delete matList[k]);
    document.querySelectorAll('.cat-item').forEach(c => {
      c.classList.remove('has-qty');
      const b = c.querySelector('.qty-badge'); if (b) b.textContent = '';
    });
    document.getElementById('voiceResult').innerHTML = '';
    renderMatList();
  }

  function sendList() {
    const keys = Object.keys(matList);
    if (!keys.length) {
      alert(matLang==='en' ? 'List is empty. Tap items first.' : 'La lista está vacía. Toca los artículos primero.');
      return;
    }
    const lines = keys.map(k => '• ' + matList[k] + 'x ' + itemDB[k].en).join('\n');
    alert((matLang==='en' ? '📩 Sent to Mathew via SMS:\n\n' : '📩 Enviado a Mathew por SMS:\n\n') +
          'HOME DEPOT — Henderson Residence\n' + lines + '\n\n— Mold Docs app');
  }

  /* Voice / dictation mock */
  let matMicOn = false;
  const sampleQuotes = [
    {
      es: "Necesitamos cinco pliegos de drywall, dos cubetas de mud, un rollo de tape, y una caja de tornillos.",
      en: "We need five sheets of drywall, two buckets of mud, a roll of tape, and a box of screws.",
      items: { drywall: 5, mud: 2, tape: 1, screws: 1 }
    },
    {
      es: "Trae tres mascarillas N95, dos trajes Tyvek, y guantes de nitrilo.",
      en: "Bring three N95 masks, two Tyvek suits, and nitrile gloves.",
      items: { mask: 3, suit: 2, gloves: 1 }
    },
    {
      es: "Concrobium, plástico de 6mil, y cinta adhesiva por favor.",
      en: "Concrobium, 6mil plastic, and duct tape please.",
      items: { concrobium: 1, plastic: 1, duct: 1 }
    }
  ];
  let quoteIndex = 0;

  function matMicToggle() {
    const mic = document.getElementById('bigMic');
    matMicOn = !matMicOn;
    mic.classList.toggle('listening', matMicOn);
    if (matMicOn) {
      // simulate listening then processing
      setTimeout(() => {
        if (!matMicOn) return;
        matMicOn = false;
        mic.classList.remove('listening');
        processVoiceInput(sampleQuotes[quoteIndex % sampleQuotes.length]);
        quoteIndex++;
      }, 2200);
    }
  }

  function processVoiceInput(sample) {
    const slot = document.getElementById('voiceResult');
    const heard = matLang==='en' ? 'I heard' : 'Yo escuché';
    const detected = matLang==='en' ? 'Detected items' : 'Artículos detectados';
    let parsedRows = '';
    Object.keys(sample.items).forEach(k => {
      const it = itemDB[k];
      const n = sample.items[k];
      parsedRows += '<div class="parsed-row"><span class="check">✓</span><div class="sw-mini ' + it.sw + '" style="width:24px;height:24px;font-size:12px;">' + it.icon + '</div><span><b>' + n + '×</b> ' + (matLang==='en' ? it.en : it.es) + '</span></div>';
    });
    slot.innerHTML =
      '<div class="voice-result">' +
        '<div class="heard">' + heard + '</div>' +
        '<div class="quote">"' + (matLang==='en' ? sample.en : sample.es) + '"</div>' +
        '<div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;font-weight:700;margin-bottom:6px;">' + detected + '</div>' +
        '<div class="parsed-list">' + parsedRows + '</div>' +
        '<div class="actions">' +
          '<button onclick="document.getElementById(\'voiceResult\').innerHTML=\'\'">' + (matLang==='en' ? 'Discard' : 'Descartar') + '</button>' +
          '<button class="primary" onclick=\'addVoiceItems(' + JSON.stringify(sample.items) + ')\'>' + (matLang==='en' ? 'Add to list' : 'Agregar a lista') + '</button>' +
        '</div>' +
      '</div>';
  }

  function addVoiceItems(items) {
    Object.keys(items).forEach(k => {
      matList[k] = (matList[k] || 0) + items[k];
      const card = document.querySelector('.cat-item[data-key="' + k + '"]');
      if (card) {
        card.classList.add('has-qty');
        card.querySelector('.qty-badge').textContent = matList[k];
      }
    });
    document.getElementById('voiceResult').innerHTML = '';
    renderMatList();
  }

  /* ---------- Housecall Pro mock import ---------- */
  function openHCPImport() {
    const phone = document.querySelector('.phone-screen');
    if (!phone) return;
    const overlay = document.createElement('div');
    overlay.id = 'hcpOverlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:flex-end;animation:fadein .15s ease;';
    overlay.innerHTML = `
      <div style="background:white;width:100%;border-radius:24px 24px 0 0;padding:18px;max-height:80%;overflow-y:auto;">
        <div style="width:40px;height:4px;background:#CBD5E1;border-radius:999px;margin:0 auto 14px;"></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="width:32px;height:32px;border-radius:8px;background:#0F172A;color:white;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;">HCP</div>
          <div style="flex:1;">
            <div style="font-size:14px;font-weight:800;">Housecall Pro</div>
            <div style="font-size:11px;color:var(--text-3);">Showing 4 recent customers · synced 2 min ago</div>
          </div>
          <div style="background:#DCFCE7;color:#065F46;font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;">LIVE</div>
        </div>
        <input type="text" placeholder="Search customers, addresses, job IDs…" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:inherit;margin-bottom:12px;background:var(--surface-2);" />
        <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Open Jobs</div>
        ${hcpCustomerRow('Margaret Cole','912 Sunset Ridge Rd, Asheville','(828) 555-0193','Job #4421 · Inspection scheduled May 16','Margaret Cole','9128 Sunset Ridge')}
        ${hcpCustomerRow('Tomas &amp; Aimee Vargas','58 Cedar Hollow Pkwy','(828) 555-0224','Job #4419 · Estimate sent','Tomas Vargas','58 Cedar Hollow Pkwy')}
        ${hcpCustomerRow('Bluewater Property Mgmt','11 Bluewater Blvd, Unit 204','(828) 555-0177','Job #4415 · Awaiting approval','Bluewater Mgmt','11 Bluewater Blvd')}
        <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;margin:14px 0 8px;">Recent Customers</div>
        ${hcpCustomerRow('Henderson, Sarah','1847 Oak Ridge Dr','(828) 555-0142','3 prior jobs · last May 11','Sarah Henderson','1847 Oak Ridge Dr')}
        <button onclick="closeHCP()" style="margin-top:14px;width:100%;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:700;color:var(--text);cursor:pointer;">Cancel</button>
        <div style="text-align:center;font-size:10px;color:var(--text-3);margin-top:12px;">Two-way sync · changes here update Housecall Pro</div>
      </div>
    `;
    phone.appendChild(overlay);
  }
  function hcpCustomerRow(name, addr, phone, sub, importName, importAddr) {
    return `
      <div onclick="hcpPick('${importName.replace(/'/g,"\\'")}', '${importAddr.replace(/'/g,"\\'")}', '${phone}')"
           style="background:white;border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#0EA5E9,#1E40AF);color:white;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:12px;">
          ${name.replace(/&amp;/g,'&').split(/[ ,]/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;">${name}</div>
          <div style="font-size:11px;color:var(--text-2);margin-top:1px;">${addr} · ${phone}</div>
          <div style="font-size:10px;color:var(--brand);font-weight:600;margin-top:3px;">${sub}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
  }
  function hcpPick(name, addr, phone) {
    closeHCP();
    const inputs = document.querySelectorAll('[data-screen="newproject"] .form-field input');
    if (inputs[0]) inputs[0].value = name;
    if (inputs[1]) inputs[1].value = phone;
    if (inputs[2]) inputs[2].value = addr;
    // Tiny success toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#065F46;color:white;font-size:12px;font-weight:700;padding:10px 14px;border-radius:10px;z-index:200;box-shadow:0 8px 20px rgba(0,0,0,.3);animation:fadein .15s ease;';
    toast.innerHTML = '✓ Imported from Housecall Pro';
    document.querySelector('.phone-screen').appendChild(toast);
    setTimeout(()=> toast.remove(), 2200);
  }
  function closeHCP() {
    const o = document.getElementById('hcpOverlay');
    if (o) o.remove();
  }

  function aiParse() {
    const btn = document.getElementById('aiGo');
    const input = document.getElementById('aiInput');
    const raw = input.value.trim();
    if (!raw) {
      input.focus();
      return;
    }
    btn.classList.add('thinking');
    btn.innerHTML = '<svg id="aiGoIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Thinking…';
    btn.disabled = true;
    setTimeout(() => {
      const entries = parseUpdateText(raw);
      renderPreview(entries, raw);
      btn.classList.remove('thinking');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Generate timeline entries';
      btn.disabled = false;
    }, 650);
  }

  /* ============================================================
     CAMERA + PHOTOS — real capture, saved to the on-device store
     ============================================================ */

  const camState = {
    stream: null,
    facing: 'environment',
    tag: 'Treatment',
    gps: null,
    starting: false,
    previewUrl: null
  };

  function startCamera() {
    const video = document.getElementById('camVideo');
    if (!video) return;
    requestGps();
    if (camState.stream || camState.starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      video.style.display = 'none';   // fall back to native file capture
      return;
    }
    camState.starting = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: camState.facing }, audio: false })
      .then(stream => {
        camState.starting = false;
        // if we navigated away while waiting, drop the stream
        const stillOnCamera = document.querySelector('[data-screen="camera"].active');
        if (!stillOnCamera) { stream.getTracks().forEach(t => t.stop()); return; }
        camState.stream = stream;
        video.srcObject = stream;
        video.style.display = '';
        video.play().catch(() => {});
      })
      .catch(err => {
        camState.starting = false;
        video.style.display = 'none';   // permission denied / no camera -> file fallback
        console.warn('Live camera unavailable, using file capture fallback:', err);
      });
  }

  function stopCamera() {
    if (camState.stream) {
      camState.stream.getTracks().forEach(t => t.stop());
      camState.stream = null;
    }
    const video = document.getElementById('camVideo');
    if (video) video.srcObject = null;
  }

  function flipCamera() {
    camState.facing = (camState.facing === 'environment') ? 'user' : 'environment';
    stopCamera();
    startCamera();
  }

  function requestGps() {
    updateGpsStamp();
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { camState.gps = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateGpsStamp(); },
      () => { updateGpsStamp(); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  function fmtGps(g) {
    if (!g) return null;
    return Math.abs(g.lat).toFixed(4) + '° ' + (g.lat >= 0 ? 'N' : 'S')
      + ', ' + Math.abs(g.lng).toFixed(4) + '° ' + (g.lng >= 0 ? 'E' : 'W');
  }

  function updateGpsStamp() {
    const el = document.getElementById('gpsStamp');
    if (!el) return;
    const now = new Date();
    const when = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      + ' · ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    el.innerHTML = '<b>GPS:</b> ' + (fmtGps(camState.gps) || 'unavailable')
      + '<br/><b>When:</b> ' + when
      + '<br/><b>Tag:</b> ' + escapeHtml(camState.tag);
  }

  function selectCamTag(el) {
    el.parentElement.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    camState.tag = el.textContent.trim();
    updateGpsStamp();
  }

  function capturePhoto() {
    const video = document.getElementById('camVideo');
    if (camState.stream && video && video.videoWidth) {
      const canvas = document.getElementById('camCanvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(blob => { if (blob) savePhoto(blob); }, 'image/jpeg', 0.9);
      flashShutter();
    } else {
      // no live preview — use the device's native camera via the file input
      const f = document.getElementById('camFile');
      if (f) f.click();
    }
  }

  function onCamFile(e) {
    const file = e.target.files && e.target.files[0];
    if (file) savePhoto(file);
    e.target.value = '';
  }

  function savePhoto(blob) {
    updateGpsStamp();
    MoldDocsStore.addPhoto({ blob: blob, tag: camState.tag, ts: Date.now(), gps: camState.gps, projectId: MoldDocsStore.getCurrentProjectId() })
      .then(saved => {
        const prev = document.getElementById('camPreview');
        if (prev) {
          if (camState.previewUrl) URL.revokeObjectURL(camState.previewUrl);
          camState.previewUrl = URL.createObjectURL(saved.blob);
          prev.style.backgroundImage = 'url(' + camState.previewUrl + ')';
        }
        toast('✓ Photo saved · ' + saved.tag);
        renderPhotos();
      })
      .catch(err => {
        console.error('Failed to save photo:', err);
        toast('Could not save photo');
      });
  }

  function flashShutter() {
    const vp = document.querySelector('.camera-viewport');
    if (!vp) return;
    const f = document.createElement('div');
    f.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:.85;z-index:5;transition:opacity .35s ease;pointer-events:none;';
    vp.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = '0'; });
    setTimeout(() => f.remove(), 420);
  }

  function toast(msg) {
    const host = document.querySelector('.phone-screen');
    if (!host) return;
    const t = document.createElement('div');
    t.style.cssText = 'position:absolute;top:80px;left:50%;transform:translateX(-50%);background:#065F46;color:#fff;font-size:12px;font-weight:700;padding:10px 14px;border-radius:10px;z-index:300;box-shadow:0 8px 20px rgba(0,0,0,.3);max-width:82%;text-align:center;';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  function photoTile(p, url) {
    return '<div class="photo" onclick="openPhoto(\'' + p.id + '\')" style="background-image:url(' + url + ')">'
      + '<div class="tag">' + escapeHtml(p.tag || 'Photo') + '</div></div>';
  }

  function renderPhotos() {
    if (typeof MoldDocsStore === 'undefined') return;
    MoldDocsStore.allPhotos().then(allPhotos => {
      // show photos for the current project (older photos without a
      // project tag are shown everywhere so nothing gets lost)
      const pid = MoldDocsStore.getCurrentProjectId();
      const photos = allPhotos.filter(p => p.kind !== 'receipt' && (!p.projectId || p.projectId === pid));
      // release object URLs from the previous render
      (renderPhotos._urls || []).forEach(u => URL.revokeObjectURL(u));
      renderPhotos._urls = [];
      const mkUrl = (blob) => { const u = URL.createObjectURL(blob); renderPhotos._urls.push(u); return u; };

      const grid = document.getElementById('photoGrid');
      if (grid) {
        if (!photos.length) {
          grid.innerHTML = '<div class="photos-empty"><div class="big">📷</div>'
            + 'No photos yet.<br/>Tap <b>+ Capture</b> to document this job.</div>';
        } else {
          const groups = {};
          const order = [];
          photos.forEach(p => {
            const key = new Date(p.ts).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            if (!groups[key]) { groups[key] = []; order.push(key); }
            groups[key].push(p);
          });
          let html = '';
          order.forEach(key => {
            html += '<div class="photo-day">' + escapeHtml(key) + '</div><div class="photo-grid">';
            groups[key].forEach(p => { html += photoTile(p, mkUrl(p.blob)); });
            html += '</div>';
          });
          grid.innerHTML = html;
        }
      }

      const recent = document.getElementById('recentPhotoGrid');
      if (recent) {
        if (!photos.length) {
          recent.innerHTML = '<div style="grid-column:1/-1;font-size:12px;color:var(--text-3);padding:6px 0;">'
            + 'No photos yet — captures appear here.</div>';
        } else {
          recent.innerHTML = photos.slice(0, 4).map(p => photoTile(p, mkUrl(p.blob))).join('');
        }
      }
    }).catch(err => console.warn('renderPhotos failed:', err));
  }

  function openPhotosTab() {
    goto('project');
    let photosBtn = null;
    document.querySelectorAll('[data-screen="project"] .tabbtn').forEach(t => {
      if (t.textContent.trim().toLowerCase() === 'photos') photosBtn = t;
    });
    if (photosBtn) setProjectTab(photosBtn, 'photos');
    else renderPhotos();
  }

  function openPhoto(id) {
    MoldDocsStore.allPhotos().then(photos => {
      const p = photos.find(x => x.id === id);
      if (!p) return;
      const url = URL.createObjectURL(p.blob);
      const host = document.querySelector('.phone-screen');
      if (!host) return;
      const ov = document.createElement('div');
      ov.style.cssText = 'position:absolute;inset:0;background:rgba(8,12,20,.94);z-index:400;display:flex;flex-direction:column;';
      const when = new Date(p.ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const gpsLine = fmtGps(p.gps) || 'No GPS recorded';
      ov.innerHTML =
        '<div style="flex:1;background:#000 center/contain no-repeat;background-image:url(' + url + ');"></div>'
        + '<div style="padding:14px 16px;color:#fff;">'
        +   '<div style="font-size:14px;font-weight:800;">' + escapeHtml(p.tag || 'Photo') + '</div>'
        +   '<div style="font-size:11px;opacity:.7;margin-top:3px;">' + when + ' &nbsp;·&nbsp; 📍 ' + gpsLine + '</div>'
        +   '<div style="display:flex;gap:8px;margin-top:13px;">'
        +     '<button id="lbClose" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-weight:700;font-size:13px;cursor:pointer;">Close</button>'
        +     '<button id="lbDel" style="flex:1;padding:11px;border-radius:10px;border:1px solid rgba(248,113,113,.4);background:rgba(248,113,113,.16);color:#FCA5A5;font-weight:700;font-size:13px;cursor:pointer;">Delete</button>'
        +   '</div>'
        + '</div>';
      host.appendChild(ov);
      const close = () => { URL.revokeObjectURL(url); ov.remove(); };
      ov.querySelector('#lbClose').onclick = close;
      ov.querySelector('#lbDel').onclick = () => {
        MoldDocsStore.deletePhoto(id).then(() => { close(); toast('Photo deleted'); renderPhotos(); });
      };
    });
  }

  /* ============================================================
     PROJECTS + TIMELINE — data-driven screens, saved on-device
     ============================================================ */

  function $set(id, text) {
    const e = document.getElementById(id);
    if (e) e.textContent = text;
  }

  function seedData() {
    if (MoldDocsStore.getProjects().length > 0) return;   // already has data
    const projects = [
      { id: 'seed-henderson', client: 'Henderson Residence', address: '1847 Oak Ridge Dr, Asheville, NC',
        phone: '(828) 555-0142', type: 'Remediation', area: 'Master Bath + Adj. Closet',
        status: 'In Progress', statusClass: 'active', progress: 65, time: '9:00 AM', dayInfo: 'Day 3 of 5',
        started: 'Mon, May 11',
        notes: 'Containment built · HEPA filtration installed · Remediation 65% complete. On track for clearance Friday.',
        createdAt: Date.now() },
      { id: 'seed-patel', client: 'Patel Property — Basement', address: '22 Birchwood Ln, Hendersonville',
        phone: '', type: 'Remediation', area: 'Basement', status: 'Urgent', statusClass: 'urgent',
        progress: 25, time: '11:30 AM', dayInfo: 'Day 1 of 4', started: 'Tue, May 12', notes: '',
        createdAt: Date.now() },
      { id: 'seed-riverbend', client: 'Riverbend Office Park', address: '3401 Riverbend Rd, Suite B',
        phone: '', type: 'Inspection', area: 'Suite B', status: 'Scheduled', statusClass: 'scheduled',
        progress: 0, time: '2:30 PM', dayInfo: 'Initial Inspection', started: '', notes: '',
        createdAt: Date.now() }
    ];
    MoldDocsStore.saveProjects(projects);
    const tl = [
      { when: 'Mon, May 11 · 8:30 AM', what: 'Initial Inspection Complete', status: 'done',
        notes: 'Visible mold in master bath. Moisture reading 84%. 6 photos taken. Estimate provided.' },
      { when: 'Mon, May 11 · 2:00 PM', what: 'Containment Built', status: 'done',
        notes: 'Plastic barriers up. Negative air machine running. Tagged ENTRY ZONE.' },
      { when: 'Tue, May 12 · 9:00 AM', what: 'Demo & Material Removal', status: 'done',
        notes: 'Drywall, vanity, and 8 sq ft of subfloor removed. Bagged & double-sealed for disposal.' },
      { when: 'Wed, May 13 · Today', what: 'Antimicrobial Treatment In Progress', status: 'active',
        notes: 'Applying Concrobium to studs and subfloor. HEPA vacuuming after.' },
      { when: 'Thu, May 14', what: 'Drying & Air Scrubbing', status: 'upcoming',
        notes: '24h drying with dehumidifiers. Air sample for clearance test.' },
      { when: 'Fri, May 15', what: 'Clearance Test & Final Report', status: 'upcoming',
        notes: 'Third-party clearance. Final report and certificate sent to client.' }
    ];
    const base = Date.now() - 600000;
    tl.forEach((e, i) => MoldDocsStore.addTimelineEntry(
      Object.assign({ projectId: 'seed-henderson', ts: base + i * 1000 }, e)));
    if (!MoldDocsStore.getCurrentProjectId()) MoldDocsStore.setCurrentProjectId('seed-henderson');
  }

  function jobCardHtml(p, photoCount) {
    const parts = [];
    if (p.time) parts.push('🕐 ' + escapeHtml(p.time));
    parts.push('📷 ' + photoCount + ' photo' + (photoCount === 1 ? '' : 's'));
    if (p.dayInfo) parts.push(escapeHtml(p.dayInfo));
    const metaHtml = parts.map((m, i) => (i ? '<span class="divider"></span>' : '') + '<span>' + m + '</span>').join('');
    const prog = (typeof p.progress === 'number') ? p.progress : 0;
    return '<div class="job-card" onclick="openProject(\'' + p.id + '\')">'
      + '<div class="row1"><div>'
      +   '<div class="client">' + escapeHtml(p.client || 'Untitled job') + '</div>'
      +   '<div class="address">📍 ' + escapeHtml(p.address || 'No address') + '</div>'
      + '</div><span class="status-pill ' + escapeHtml(p.statusClass || 'scheduled') + '">'
      +   escapeHtml(p.status || 'Scheduled') + '</span></div>'
      + '<div class="progress-row"><div class="progress-bar"><div class="fill" style="width:' + prog + '%"></div></div>'
      +   '<span class="pct">' + prog + '%</span></div>'
      + '<div class="job-meta">' + metaHtml + '</div>'
      + '</div>';
  }

  function renderDashboard() {
    const list = document.getElementById('jobList');
    if (!list) return;
    const projects = MoldDocsStore.getProjects().filter(p => p.statusClass !== 'complete');
    const draw = (photos) => {
      if (!projects.length) {
        list.innerHTML = '<div class="photos-empty"><div class="big">🗂️</div>'
          + 'No active jobs.<br/>Tap the + on the Schedule screen to create one.</div>';
        return;
      }
      list.innerHTML = projects.map(p => {
        const count = photos.filter(ph => ph.projectId === p.id).length;
        return jobCardHtml(p, count);
      }).join('');
    };
    MoldDocsStore.allPhotos().then(draw).catch(() => draw([]));
  }

  function openProject(id) {
    MoldDocsStore.setCurrentProjectId(id);
    goto('project');
  }

  function renderProjectDetail() {
    const id = MoldDocsStore.getCurrentProjectId();
    const p = id ? MoldDocsStore.getProject(id) : null;
    if (p) {
      $set('pdName', p.client || 'Untitled job');
      $set('pdAddr', '📍 ' + (p.address || 'No address'));
      const meta = document.getElementById('pdMeta');
      if (meta) {
        const chips = [];
        if (p.status) chips.push(p.status);
        if (p.dayInfo) chips.push(p.dayInfo);
        chips.push((p.progress || 0) + '% Complete');
        meta.innerHTML = chips.map(c => '<span class="chip">' + escapeHtml(c) + '</span>').join('');
      }
      const prog = p.progress || 0;
      const fill = document.getElementById('pdProgressFill');
      if (fill) fill.style.width = prog + '%';
      $set('pdProgressPct', prog + '%');
      $set('pdProgressNote', p.notes || 'No progress notes yet.');
      $set('pdType', p.type || '—');
      $set('pdArea', p.area || '—');
      $set('pdPhone', p.phone || '—');
      $set('pdStarted', p.started || '—');
    }
    renderTimeline();
    renderPhotos();
    renderJobCheckin();
    renderJobCost();
  }

  function tlItemHtml(e) {
    return '<div class="tl-item ' + escapeHtml(e.status || 'done') + '">'
      + '<div class="dot"></div>'
      + '<div class="when">' + escapeHtml(e.when || '') + '</div>'
      + '<div class="what">' + escapeHtml(e.what || '') + '</div>'
      + (e.notes ? '<div class="notes">' + escapeHtml(e.notes) + '</div>' : '')
      + '</div>';
  }

  function renderTimeline() {
    const list = document.getElementById('timelineList');
    if (!list) return;
    const pid = MoldDocsStore.getCurrentProjectId();
    const entries = pid ? MoldDocsStore.timelineForProject(pid) : [];
    if (!entries.length) {
      list.innerHTML = '<div class="photos-empty"><div class="big">🗒️</div>'
        + 'No timeline entries yet.<br/>Use “Ask the Doc” above to log progress.</div>';
      return;
    }
    list.innerHTML = entries.map(tlItemHtml).join('');
  }

  function createJob() {
    const val = (id) => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    const name = val('njName');
    if (!name) {
      const e = document.getElementById('njName');
      if (e) e.focus();
      toast('Enter a client name first');
      return;
    }
    const type = val('njType') || 'Remediation';
    const project = MoldDocsStore.addProject({
      client: name,
      address: val('njAddress'),
      phone: val('njPhone'),
      type: type,
      area: val('njArea'),
      duration: val('njDuration'),
      started: val('njStart'),
      notes: val('njNotes'),
      status: 'Scheduled',
      statusClass: 'scheduled',
      progress: 0,
      time: '',
      dayInfo: type
    });
    MoldDocsStore.setCurrentProjectId(project.id);
    ['njName', 'njPhone', 'njAddress', 'njArea', 'njNotes'].forEach(id => {
      const e = document.getElementById(id);
      if (e) e.value = '';
    });
    toast('✓ Job created — ' + name);
    renderDashboard();
    goto('project');
  }

  function restoreMaterials() {
    if (typeof MoldDocsStore === 'undefined') return;
    const saved = MoldDocsStore.kvGet('matlist', null);
    if (!saved || typeof saved !== 'object') return;
    Object.keys(saved).forEach(k => {
      const qty = saved[k];
      if (qty > 0) {
        matList[k] = qty;
        const card = document.querySelector('.cat-item[data-key="' + k + '"]');
        if (card) {
          card.classList.add('has-qty');
          const badge = card.querySelector('.qty-badge');
          if (badge) badge.textContent = qty;
        }
      }
    });
    renderMatList();
  }

  /* ---------- First-load init ---------- */
  function initApp() {
    if (typeof MoldDocsStore === 'undefined') {
      console.warn('MoldDocsStore not loaded — data features disabled.');
      return;
    }
    seedData();
    restoreMaterials();
    renderDashboard();
    renderPhotos();
    renderDayStatus();
    applyRoleVisibility();
  }
  initApp();

  /* ============================================================
     ROLES & FEATURE ACCESS — client-side gating for a staged
     rollout. Not hard security; real enforcement comes with a
     backend login later.
     ============================================================ */

  const FEATURE_LABELS = {
    checkin: 'Job Check-In',
    timesheet: 'Timesheet',
    receipts: 'Receipts',
    jobcost: 'Job Cost (COGs)'
  };

  function enterAs(role) {
    MoldDocsStore.setRole(role);
    applyRoleVisibility();
    goto('dashboard');
  }

  function canSee(feature) {
    if (MoldDocsStore.getRole() === 'admin') return true;
    return MoldDocsStore.getFeatureAccess()[feature] === 'everyone';
  }

  // Show/hide anything tagged data-feature="X" or data-admin-only by role.
  function applyRoleVisibility() {
    if (typeof MoldDocsStore === 'undefined') return;
    document.querySelectorAll('[data-feature]').forEach(el => {
      el.style.display = canSee(el.dataset.feature) ? '' : 'none';
    });
    const isAdmin = MoldDocsStore.getRole() === 'admin';
    document.querySelectorAll('[data-admin-only]').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  }

  function renderAdminScreen() {
    if (typeof MoldDocsStore === 'undefined') return;
    const isAdmin = MoldDocsStore.getRole() === 'admin';
    $set('adminRoleLabel', isAdmin ? 'Admin' : 'Technician');
    const adminBox = document.getElementById('adminOnlyBox');
    if (adminBox) adminBox.style.display = isAdmin ? 'block' : 'none';
    const techNote = document.getElementById('techNote');
    if (techNote) techNote.style.display = isAdmin ? 'none' : 'block';
    if (!isAdmin) return;

    const rateInput = document.getElementById('laborRateInput');
    if (rateInput) rateInput.value = MoldDocsStore.getLaborRate();

    const list = document.getElementById('featureAccessList');
    if (!list) return;
    const access = MoldDocsStore.getFeatureAccess();
    list.innerHTML = Object.keys(FEATURE_LABELS).map(f => {
      const lvl = access[f] || 'admin';
      return '<div class="fa-row">'
        + '<div class="fa-name">' + escapeHtml(FEATURE_LABELS[f]) + '</div>'
        + '<div class="fa-toggle">'
        +   '<button class="fa-opt ' + (lvl === 'admin' ? 'on' : '') + '" onclick="setFeature(\'' + f + '\',\'admin\')">Admin only</button>'
        +   '<button class="fa-opt ' + (lvl === 'everyone' ? 'on' : '') + '" onclick="setFeature(\'' + f + '\',\'everyone\')">Everyone</button>'
        + '</div></div>';
    }).join('');
  }

  function setFeature(feature, level) {
    MoldDocsStore.setFeatureLevel(feature, level);
    renderAdminScreen();
    applyRoleVisibility();
    toast(FEATURE_LABELS[feature] + ' → ' + (level === 'everyone' ? 'Everyone' : 'Admin only'));
  }

  function saveLaborRate() {
    const input = document.getElementById('laborRateInput');
    if (input) {
      MoldDocsStore.setLaborRate(input.value);
      toast('Labor rate saved');
    }
  }

  function switchRole() {
    goto('splash');
  }

  /* ============================================================
     CHECK-IN & TIMESHEET — daily shift + per-job time, GPS-stamped.
     Location is captured silently; the tech never touches it.
     ============================================================ */

  function getLocation(cb) {
    if (!navigator.geolocation) { cb(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => cb({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => cb(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  function fmtDur(ms) {
    if (!ms || ms < 0) ms = 0;
    const mins = Math.round(ms / 60000);
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  }
  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  /* ---- daily shift ---- */
  function shifts() { return MoldDocsStore.kvGet('shifts', []); }
  function saveShifts(a) { MoldDocsStore.kvSet('shifts', a); }
  function openShift() { return shifts().find((s) => !s.outTs) || null; }

  function startDay() {
    if (openShift()) return;
    toast('Getting location…');
    getLocation((gps) => {
      const a = shifts();
      a.push({ id: 'sh_' + Date.now(), inTs: Date.now(), inGps: gps, outTs: null, outGps: null });
      saveShifts(a);
      renderDayStatus();
      toast('✓ Checked in for the day');
    });
  }

  function endDay() {
    const s = openShift();
    if (!s) return;
    if (openSegment()) jobCheckOut(true);   // close any open job too
    getLocation((gps) => {
      const a = shifts();
      const rec = a.find((x) => x.id === s.id);
      if (rec) { rec.outTs = Date.now(); rec.outGps = gps; }
      saveShifts(a);
      renderDayStatus();
      toast('✓ Day ended');
    });
  }

  /* ---- per-job time segments ---- */
  function segments() { return MoldDocsStore.kvGet('jobsegments', []); }
  function saveSegments(a) { MoldDocsStore.kvSet('jobsegments', a); }
  function openSegment() { return segments().find((s) => !s.outTs) || null; }

  function jobCheckIn() {
    const pid = MoldDocsStore.getCurrentProjectId();
    if (!pid) { toast('Open a job first'); return; }
    if (openSegment()) { toast('Check out of your current job first'); return; }
    toast('Getting location…');
    getLocation((gps) => {
      const a = segments();
      a.push({ id: 'seg_' + Date.now(), projectId: pid, inTs: Date.now(), inGps: gps, outTs: null });
      saveSegments(a);
      renderJobCheckin();
      toast('✓ Checked in to job');
    });
  }

  function jobCheckOut(silent) {
    const s = openSegment();
    if (!s) { if (!silent) toast('Not checked into a job'); return; }
    getLocation((gps) => {
      const a = segments();
      const rec = a.find((x) => x.id === s.id);
      if (rec) { rec.outTs = Date.now(); rec.outGps = gps; }
      saveSegments(a);
      renderJobCheckin();
      if (!silent) toast('✓ Checked out of job');
    });
  }

  /* ---- render: dashboard day-status card ---- */
  function renderDayStatus() {
    const box = document.getElementById('dayStatusCard');
    if (!box) return;
    const s = openShift();
    if (s) {
      box.innerHTML = '<div style="background:#065F46;color:#fff;border-radius:14px;padding:14px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">'
        +   '<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.85;font-weight:700;">On the clock</div>'
        +   '<div style="font-size:15px;font-weight:800;margin-top:2px;">Since ' + fmtClock(s.inTs) + '</div></div>'
        +   '<button onclick="endDay()" style="background:#fff;color:#065F46;border:none;border-radius:10px;padding:10px 14px;font-weight:800;font-size:13px;cursor:pointer;flex-shrink:0;">End Day</button>'
        + '</div>'
        + '<div style="margin-top:8px;"><span onclick="goto(\'timesheet\')" data-feature="timesheet" style="color:#A7F3D0;font-weight:700;font-size:12px;cursor:pointer;">View timesheet →</span></div>'
        + '</div>';
    } else {
      box.innerHTML = '<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">'
        + '<div><div style="font-size:13px;font-weight:800;">Not checked in</div>'
        +   '<div style="font-size:11px;color:var(--text-3);margin-top:1px;">Start your day to track hours</div></div>'
        + '<button onclick="startDay()" style="background:var(--brand);color:#fff;border:none;border-radius:10px;padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;flex-shrink:0;">Start Day</button>'
        + '</div>';
    }
    applyRoleVisibility();
  }

  /* ---- render: project check-in box ---- */
  function renderJobCheckin() {
    const box = document.getElementById('jobCheckinBox');
    if (!box) return;
    const pid = MoldDocsStore.getCurrentProjectId();
    const seg = openSegment();
    if (seg && seg.projectId === pid) {
      box.innerHTML = '<div style="background:#065F46;color:#fff;border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">'
        + '<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.85;font-weight:700;">On this job</div>'
        +   '<div style="font-size:14px;font-weight:800;margin-top:2px;">Since ' + fmtClock(seg.inTs) + '</div></div>'
        + '<button onclick="jobCheckOut()" style="background:#fff;color:#065F46;border:none;border-radius:10px;padding:9px 13px;font-weight:800;font-size:13px;cursor:pointer;flex-shrink:0;">Check Out</button>'
        + '</div>';
    } else if (seg) {
      box.innerHTML = '<div style="background:#FEF3C7;border:1px solid #FDE68A;color:#92400E;border-radius:14px;padding:12px 14px;font-size:12px;font-weight:600;">'
        + 'You’re checked into another job — check out there first.</div>';
    } else {
      box.innerHTML = '<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">'
        + '<div style="font-size:13px;font-weight:800;">Not on this job</div>'
        + '<button onclick="jobCheckIn()" style="background:var(--brand);color:#fff;border:none;border-radius:10px;padding:9px 14px;font-weight:800;font-size:13px;cursor:pointer;flex-shrink:0;">Check In</button>'
        + '</div>';
    }
    applyRoleVisibility();
  }

  /* ---- render: timesheet ---- */
  function renderTimesheet() {
    const allShifts = shifts().slice().sort((a, b) => b.inTs - a.inTs);
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    let weekMs = 0;

    const dayRows = allShifts.map((s) => {
      const end = s.outTs || Date.now();
      const dur = end - s.inTs;
      if (s.inTs >= weekStart.getTime()) weekMs += dur;
      const dateLabel = new Date(s.inTs).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const open = !s.outTs;
      return '<div class="ts-row"><div>'
        + '<div class="ts-date">' + dateLabel + (open ? ' · on the clock' : '') + '</div>'
        + '<div class="ts-sub">' + fmtClock(s.inTs) + ' – ' + (open ? 'now' : fmtClock(s.outTs)) + '</div>'
        + '</div><div class="ts-hrs">' + fmtDur(dur) + '</div></div>';
    }).join('');

    $set('tsWeekTotal', fmtDur(weekMs));
    const dayList = document.getElementById('tsDayList');
    if (dayList) dayList.innerHTML = dayRows || '<div class="photos-empty">No shifts logged yet.</div>';

    const byJob = {};
    segments().forEach((s) => {
      const end = s.outTs || Date.now();
      byJob[s.projectId] = (byJob[s.projectId] || 0) + (end - s.inTs);
    });
    const jobList = document.getElementById('tsJobList');
    if (jobList) {
      const keys = Object.keys(byJob);
      jobList.innerHTML = keys.length
        ? keys.map((pid) => {
            const p = MoldDocsStore.getProject(pid);
            return '<div class="ts-row"><div class="ts-date">' + escapeHtml(p ? p.client : 'Unknown job')
              + '</div><div class="ts-hrs">' + fmtDur(byJob[pid]) + '</div></div>';
          }).join('')
        : '<div class="photos-empty">No job time logged yet.</div>';
    }
  }

  /* ============================================================
     RECEIPTS — snap a receipt, stamp date/GPS, assign to a job.
     Stored in the photo store with kind:'receipt'.
     ============================================================ */

  function receiptCapture() {
    const f = document.getElementById('receiptFile');
    if (f) f.click();
  }

  function onReceiptFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    toast('Saving receipt…');
    getLocation((gps) => {
      const seg = openSegment();
      const allocations = seg ? [{ projectId: seg.projectId, amount: 0 }] : [];
      MoldDocsStore.addPhoto({ kind: 'receipt', blob: file, ts: Date.now(), gps: gps, total: 0, allocations: allocations })
        .then(() => { renderReceipts(); toast('✓ Receipt saved'); });
    });
  }

  function receipts(cb) {
    MoldDocsStore.allPhotos().then((all) => cb(all.filter((p) => p.kind === 'receipt')));
  }

  function setReceiptTotal(id, value) {
    const total = Number(value) || 0;
    receipts((list) => {
      const r = list.find((x) => x.id === id);
      if (!r) return;
      r.total = total;
      if (r.allocations && r.allocations.length === 1) r.allocations[0].amount = total;
      MoldDocsStore.addPhoto(r).then(() => renderReceipts());
    });
  }

  function setReceiptJob(id, projectId) {
    receipts((list) => {
      const r = list.find((x) => x.id === id);
      if (!r) return;
      r.allocations = projectId ? [{ projectId: projectId, amount: r.total || 0 }] : [];
      MoldDocsStore.addPhoto(r).then(() => renderReceipts());
    });
  }

  function deleteReceipt(id) {
    MoldDocsStore.deletePhoto(id).then(() => { renderReceipts(); toast('Receipt deleted'); });
  }

  function renderReceipts() {
    const list = document.getElementById('receiptList');
    if (!list) return;
    receipts((items) => {
      (renderReceipts._urls || []).forEach((u) => URL.revokeObjectURL(u));
      renderReceipts._urls = [];
      if (!items.length) {
        list.innerHTML = '<div class="photos-empty"><div class="big">🧾</div>'
          + 'No receipts yet.<br/>Tap “Add Receipt” after a supply run.</div>';
        return;
      }
      items.sort((a, b) => b.ts - a.ts);
      const projects = MoldDocsStore.getProjects();
      list.innerHTML = items.map((r) => {
        const url = URL.createObjectURL(r.blob);
        renderReceipts._urls.push(url);
        const assigned = (r.allocations && r.allocations[0]) ? r.allocations[0].projectId : '';
        const opts = '<option value="">Unassigned</option>'
          + projects.map((p) => '<option value="' + p.id + '"' + (assigned === p.id ? ' selected' : '') + '>'
            + escapeHtml(p.client) + '</option>').join('');
        const dateLabel = new Date(r.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return '<div class="rc-row">'
          + '<div class="rc-thumb" onclick="openReceiptImg(\'' + r.id + '\')" style="background-image:url(' + url + ')"></div>'
          + '<div class="rc-body">'
          +   '<div class="rc-date">' + dateLabel + '</div>'
          +   '<div class="rc-line"><span>$</span><input type="number" inputmode="decimal" value="' + (r.total || '') + '" placeholder="0.00" onchange="setReceiptTotal(\'' + r.id + '\',this.value)" /></div>'
          +   '<select onchange="setReceiptJob(\'' + r.id + '\',this.value)">' + opts + '</select>'
          + '</div>'
          + '<button class="rc-del" onclick="deleteReceipt(\'' + r.id + '\')">✕</button>'
          + '</div>';
      }).join('');
    });
  }

  function openReceiptImg(id) {
    receipts((items) => {
      const r = items.find((x) => x.id === id);
      if (!r) return;
      const url = URL.createObjectURL(r.blob);
      const host = document.querySelector('.phone-screen');
      if (!host) return;
      const ov = document.createElement('div');
      ov.style.cssText = 'position:absolute;inset:0;background:rgba(8,12,20,.94);z-index:400;display:flex;flex-direction:column;';
      ov.innerHTML = '<div style="flex:1;background:#000 center/contain no-repeat;background-image:url(' + url + ');"></div>'
        + '<div style="padding:14px;"><button id="rcClose" style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-weight:700;font-size:13px;cursor:pointer;">Close</button></div>';
      host.appendChild(ov);
      ov.querySelector('#rcClose').onclick = () => { URL.revokeObjectURL(url); ov.remove(); };
    });
  }

  /* receiptsForProject(pid, cb) -> total dollars allocated to a project */
  function receiptsForProject(pid, cb) {
    receipts((items) => {
      let sum = 0;
      items.forEach((r) => {
        (r.allocations || []).forEach((a) => { if (a.projectId === pid) sum += Number(a.amount) || 0; });
      });
      cb(sum);
    });
  }

  /* ============================================================
     JOB COST / COGS — labor (timesheet) + materials (receipts) +
     manual other costs, vs. the job price -> margin.
     ============================================================ */

  function jobLaborMs(pid) {
    let ms = 0;
    segments().forEach((s) => {
      if (s.projectId === pid) ms += (s.outTs || Date.now()) - s.inTs;
    });
    return ms;
  }

  function costRow(label, value, sub) {
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;">'
      + '<span style="font-size:13px;color:var(--text-2);">' + escapeHtml(label)
      + (sub ? ' <span style="font-size:11px;color:var(--text-3);">' + escapeHtml(sub) + '</span>' : '')
      + '</span><span style="font-size:13px;font-weight:700;">' + value + '</span></div>';
  }

  function renderJobCost() {
    const box = document.getElementById('jobCostBox');
    if (!box) return;
    const pid = MoldDocsStore.getCurrentProjectId();
    const p = pid ? MoldDocsStore.getProject(pid) : null;
    if (!p) { box.innerHTML = ''; return; }
    const rate = MoldDocsStore.getLaborRate();
    const laborMs = jobLaborMs(pid);
    const laborCost = (laborMs / 3600000) * rate;
    const other = p.otherCosts || [];
    const otherTotal = other.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const money = (n) => '$' + (Number(n) || 0).toFixed(2);

    receiptsForProject(pid, (matCost) => {
      const totalCost = laborCost + matCost + otherTotal;
      const price = Number(p.price) || 0;
      const margin = price - totalCost;
      const marginPct = price > 0 ? Math.round((margin / price) * 100) : 0;

      let html = '<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px;">';
      html += costRow('Labor', money(laborCost), fmtDur(laborMs) + ' × ' + money(rate) + '/hr');
      html += costRow('Materials', money(matCost), 'from receipts');
      other.forEach((l, i) => {
        html += '<div style="display:flex;gap:6px;align-items:center;padding:5px 0;">'
          + '<input value="' + escapeHtml(l.label || '') + '" placeholder="Equipment, disposal, sub…" onchange="updateOtherCost(' + i + ',\'label\',this.value)" style="flex:1;min-width:0;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;" />'
          + '<span style="font-size:13px;font-weight:700;">$</span>'
          + '<input type="number" inputmode="decimal" value="' + (l.amount || '') + '" onchange="updateOtherCost(' + i + ',\'amount\',this.value)" style="width:64px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;" />'
          + '<button onclick="removeOtherCost(' + i + ')" style="border:none;background:none;color:var(--text-3);font-size:14px;cursor:pointer;">✕</button>'
          + '</div>';
      });
      html += '<div style="text-align:center;margin:6px 0 10px;"><button onclick="addOtherCost()" style="border:1px dashed var(--border);background:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;color:var(--brand);cursor:pointer;">+ Add other cost</button></div>';

      html += '<div style="border-top:1px solid var(--border);padding-top:8px;">';
      html += costRow('Total Cost', money(totalCost), '');
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">'
        + '<span style="font-size:13px;color:var(--text-2);">Job Price</span>'
        + '<span style="font-weight:700;">$<input type="number" inputmode="decimal" value="' + (p.price || '') + '" placeholder="0.00" onchange="setJobPrice(this.value)" style="width:88px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-weight:700;font-family:inherit;text-align:right;" /></span>'
        + '</div>';
      const marginColor = margin >= 0 ? '#065F46' : '#B91C1C';
      html += '<div style="display:flex;justify-content:space-between;padding:8px 0 2px;border-top:1px solid var(--border);margin-top:4px;">'
        + '<span style="font-size:14px;font-weight:800;">Margin</span>'
        + '<span style="font-size:14px;font-weight:800;color:' + marginColor + ';">' + money(margin)
        + (price > 0 ? ' · ' + marginPct + '%' : '') + '</span></div>';
      html += '</div></div>';
      box.innerHTML = html;
    });
  }

  function addOtherCost() {
    const pid = MoldDocsStore.getCurrentProjectId();
    const p = pid ? MoldDocsStore.getProject(pid) : null;
    if (!p) return;
    const other = p.otherCosts || [];
    other.push({ label: '', amount: 0 });
    MoldDocsStore.updateProject(pid, { otherCosts: other });
    renderJobCost();
  }

  function updateOtherCost(i, field, value) {
    const pid = MoldDocsStore.getCurrentProjectId();
    const p = pid ? MoldDocsStore.getProject(pid) : null;
    if (!p) return;
    const other = p.otherCosts || [];
    if (!other[i]) return;
    other[i][field] = (field === 'amount') ? (Number(value) || 0) : value;
    MoldDocsStore.updateProject(pid, { otherCosts: other });
    renderJobCost();
  }

  function removeOtherCost(i) {
    const pid = MoldDocsStore.getCurrentProjectId();
    const p = pid ? MoldDocsStore.getProject(pid) : null;
    if (!p) return;
    const other = p.otherCosts || [];
    other.splice(i, 1);
    MoldDocsStore.updateProject(pid, { otherCosts: other });
    renderJobCost();
  }

  function setJobPrice(value) {
    const pid = MoldDocsStore.getCurrentProjectId();
    if (pid) MoldDocsStore.updateProject(pid, { price: Number(value) || 0 });
    renderJobCost();
  }
