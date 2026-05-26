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
    if (name === 'schedule') renderSchedule();
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

  // Real voice dictation via the browser's Speech Recognition API.
  let micOn = false;
  let recognition = null;
  function toggleMic() {
    const mic = document.getElementById('aiMic');
    const input = document.getElementById('aiInput');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const restPlaceholder = 'e.g. Today we did drywall, and tomorrow we need to mud and tape.';
    if (!SR) {
      toast('Voice input isn’t supported on this browser — please type instead');
      return;
    }
    if (micOn) { if (recognition) recognition.stop(); return; }
    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    const base = input.value.trim() ? input.value.trim() + ' ' : '';
    recognition.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      input.value = base + said;
    };
    recognition.onerror = () => {
      micOn = false;
      mic.classList.remove('listening');
      input.placeholder = restPlaceholder;
    };
    recognition.onend = () => {
      micOn = false;
      mic.classList.remove('listening');
      input.placeholder = restPlaceholder;
    };
    recognition.start();
    micOn = true;
    mic.classList.add('listening');
    input.placeholder = 'Listening… tap the mic again to stop.';
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

  /* ---------- Housecall Pro — real import (admin-only, server-verified) ---------- */
  function openHCPImport() {
    const phone = document.querySelector('.phone-screen');
    if (!phone) return;
    const overlay = document.createElement('div');
    overlay.id = 'hcpOverlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(4px);z-index:100;display:flex;align-items:flex-end;animation:fadein .15s ease;';
    overlay.innerHTML = '<div style="background:white;width:100%;border-radius:24px 24px 0 0;padding:18px;max-height:80%;overflow-y:auto;">'
      + '<div style="width:40px;height:4px;background:#CBD5E1;border-radius:999px;margin:0 auto 14px;"></div>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
      +   '<div style="width:32px;height:32px;border-radius:8px;background:#0F172A;color:white;font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;">HCP</div>'
      +   '<div style="flex:1;">'
      +     '<div style="font-size:14px;font-weight:800;">Housecall Pro</div>'
      +     '<div style="font-size:11px;color:var(--text-3);" id="hcpStatus">Loading…</div>'
      +   '</div>'
      +   '<div style="background:#DCFCE7;color:#065F46;font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;">LIVE</div>'
      + '</div>'
      + '<input type="text" id="hcpSearch" placeholder="Search customers…" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;font-size:13px;font-family:inherit;margin-bottom:12px;background:var(--surface-2);box-sizing:border-box;" />'
      + '<div id="hcpList"></div>'
      + '<button onclick="closeHCP()" style="margin-top:14px;width:100%;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:700;color:var(--text);cursor:pointer;">Cancel</button>'
      + '</div>';
    phone.appendChild(overlay);
    const search = document.getElementById('hcpSearch');
    if (search) {
      let t = null;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => loadHCPCustomers(search.value), 400);
      });
    }
    loadHCPCustomers('');
  }

  function loadHCPCustomers(q) {
    const list = document.getElementById('hcpList');
    const status = document.getElementById('hcpStatus');
    if (!list) return;
    if (status) status.textContent = 'Loading…';
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px;">Loading customers…</div>';

    const finishUnauth = () => {
      list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-2);font-size:13px;line-height:1.5;">Sign in as admin to load Housecall Pro customers.</div>';
      if (status) status.textContent = 'Not signed in';
    };

    const c = initSupabase();
    if (!c) { finishUnauth(); return; }
    c.auth.getSession().then(({ data }) => {
      if (!data || !data.session) { finishUnauth(); return; }
      const token = data.session.access_token;
      return fetch('https://mold-docs-ai-proxy.onrender.com/hcp/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ q: q || '', page: 1 })
      }).then((r) => r.json().then((d) => ({ ok: r.ok, d: d })))
        .then(({ ok, d }) => {
          if (!ok) {
            const msg = (d && d.error) ? d.error : 'Failed to load customers';
            list.innerHTML = '<div style="padding:24px;text-align:center;color:#B91C1C;font-size:12px;">' + escapeHtml(msg) + '</div>';
            if (status) status.textContent = 'Error';
            return;
          }
          const customers = (d && d.customers) || [];
          if (status) status.textContent = customers.length + ' customer' + (customers.length === 1 ? '' : 's');
          if (!customers.length) {
            list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px;">No customers found.</div>';
            return;
          }
          list.innerHTML = customers.map((cu) => hcpCustomerRow(
            cu.name || 'Unnamed',
            cu.address || 'No address on file',
            cu.phone || '',
            cu.email || '',
            cu.name || '',
            cu.address || ''
          )).join('');
        });
    }).catch(() => {
      list.innerHTML = '<div style="padding:24px;text-align:center;color:#B91C1C;font-size:12px;">Network error</div>';
      if (status) status.textContent = 'Error';
    });
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

  // Sends the note to the AI proxy; falls back to the on-device keyword
  // parser if the proxy is unreachable (offline, asleep, or erroring).
  function aiParse() {
    const btn = document.getElementById('aiGo');
    const input = document.getElementById('aiInput');
    const raw = input.value.trim();
    if (!raw) {
      input.focus();
      return;
    }
    const AI_PROXY_URL = 'https://mold-docs-ai-proxy.onrender.com';
    const doneBtn = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Generate timeline entries';

    btn.classList.add('thinking');
    btn.innerHTML = '<svg id="aiGoIcon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Thinking…';
    btn.disabled = true;

    const finish = (entries) => {
      renderPreview(entries, raw);
      btn.classList.remove('thinking');
      btn.innerHTML = doneBtn;
      btn.disabled = false;
    };

    fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: raw })
    })
      .then((r) => r.json())
      .then((data) => {
        const entries = (data && data.entries ? data.entries : [])
          .map((e) => ({
            when: e.when || 'Today',
            status: e.status || 'done',
            label: e.what || e.label || '',
            phase: e.phase || 'Note',
            source: e.notes || ''
          }))
          .filter((e) => e.label);
        finish(entries.length ? entries : parseUpdateText(raw));
      })
      .catch(() => {
        finish(parseUpdateText(raw));
      });
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
    checkSession();
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
    signOut();
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
      const allocations = [{ projectId: seg ? seg.projectId : '', amount: 0 }];
      MoldDocsStore.addPhoto({ kind: 'receipt', blob: file, ts: Date.now(), gps: gps, total: 0, allocations: allocations })
        .then((saved) => { renderReceipts(); toast('✓ Receipt saved — reading total…'); scanReceipt(saved.id, true); });
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

  function addReceiptAlloc(id) {
    receipts((list) => {
      const r = list.find((x) => x.id === id);
      if (!r) return;
      if (!r.allocations) r.allocations = [];
      r.allocations.push({ projectId: '', amount: 0 });
      MoldDocsStore.addPhoto(r).then(() => renderReceipts());
    });
  }

  function setReceiptAllocJob(id, idx, projectId) {
    receipts((list) => {
      const r = list.find((x) => x.id === id);
      if (!r || !r.allocations || !r.allocations[idx]) return;
      r.allocations[idx].projectId = projectId;
      MoldDocsStore.addPhoto(r).then(() => renderReceipts());
    });
  }

  function setReceiptAllocAmount(id, idx, value) {
    receipts((list) => {
      const r = list.find((x) => x.id === id);
      if (!r || !r.allocations || !r.allocations[idx]) return;
      r.allocations[idx].amount = Number(value) || 0;
      MoldDocsStore.addPhoto(r).then(() => renderReceipts());
    });
  }

  function removeReceiptAlloc(id, idx) {
    receipts((list) => {
      const r = list.find((x) => x.id === id);
      if (!r || !r.allocations) return;
      r.allocations.splice(idx, 1);
      if (!r.allocations.length) r.allocations.push({ projectId: '', amount: 0 });
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
        const dateLabel = new Date(r.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const allocs = (r.allocations && r.allocations.length) ? r.allocations : [{ projectId: '', amount: 0 }];
        const total = Number(r.total) || 0;
        const allocated = allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
        const allocRows = allocs.map((a, idx) => {
          const opts = '<option value="">Choose job…</option>'
            + projects.map((p) => '<option value="' + p.id + '"' + (a.projectId === p.id ? ' selected' : '') + '>'
              + escapeHtml(p.client) + '</option>').join('');
          return '<div class="rc-alloc">'
            + '<select onchange="setReceiptAllocJob(\'' + r.id + '\',' + idx + ',this.value)">' + opts + '</select>'
            + '<span>$</span><input type="number" inputmode="decimal" value="' + (a.amount || '') + '" placeholder="0" onchange="setReceiptAllocAmount(\'' + r.id + '\',' + idx + ',this.value)" />'
            + '<button onclick="removeReceiptAlloc(\'' + r.id + '\',' + idx + ')" title="Remove">✕</button>'
            + '</div>';
        }).join('');
        const balOk = total > 0 && Math.abs(total - allocated) < 0.005;
        return '<div class="rc-row">'
          + '<div class="rc-top">'
          +   '<div class="rc-thumb" onclick="openReceiptImg(\'' + r.id + '\')" style="background-image:url(' + url + ')"></div>'
          +   '<div class="rc-headline"><div class="rc-date">' + dateLabel + ' · receipt</div>'
          +     '<div class="rc-line"><span>Total $</span><input type="number" inputmode="decimal" value="' + (r.total || '') + '" placeholder="0.00" onchange="setReceiptTotal(\'' + r.id + '\',this.value)" /></div></div>'
          +   '<button class="rc-del" onclick="deleteReceipt(\'' + r.id + '\')">✕</button>'
          + '</div>'
          + allocRows
          + '<div class="rc-actions">'
          +   '<button class="rc-add" onclick="addReceiptAlloc(\'' + r.id + '\')">+ Split to another job</button>'
          +   '<span class="rc-bal ' + (balOk ? 'ok' : '') + '">$' + allocated.toFixed(2) + ' of $' + total.toFixed(2) + '</span>'
          + '</div>'
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

  /* ============================================================
     SCHEDULE — real current-week strip + the app's own jobs
     listed as appointments. Driven by local project data only.
     ============================================================ */

  function renderSchedule() {
    const strip = document.getElementById('calStrip');
    const now = new Date();
    if (strip) {
      const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const monday = new Date(now);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      let html = '';
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const isToday = d.toDateString() === now.toDateString();
        html += '<div class="cal-day' + (isToday ? ' today' : '') + '">'
          + '<div class="dow">' + dows[i] + '</div>'
          + '<div class="num">' + d.getDate() + '</div>'
          + (isToday ? '<div class="dot"></div>' : '')
          + '</div>';
      }
      strip.innerHTML = html;
    }

    const dateEl = document.getElementById('schedDate');
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    const list = document.getElementById('scheduleList');
    if (!list) return;
    const projects = MoldDocsStore.getProjects().filter((p) => p.statusClass !== 'complete');
    if (!projects.length) {
      list.innerHTML = '<div class="photos-empty"><div class="big">📅</div>'
        + 'No jobs scheduled.<br/>Tap the + above to add one.</div>';
      return;
    }
    list.innerHTML = projects.map((p) => {
      const cls = p.statusClass === 'urgent' ? ' amber'
        : (p.statusClass === 'scheduled' ? ' blue' : '');
      return '<div class="schedule-item' + cls + '" onclick="openProject(\'' + p.id + '\')">'
        + '<div class="time">' + escapeHtml(p.time || p.dayInfo || p.type || 'Scheduled') + '</div>'
        + '<div class="title">' + escapeHtml(p.client || 'Untitled job')
        +   (p.type ? ' — ' + escapeHtml(p.type) : '') + '</div>'
        + '<div class="sub">📍 ' + escapeHtml(p.address || 'No address') + '</div>'
        + '</div>';
    }).join('');
  }

  /* ============================================================
     AI RECEIPT SCANNING — read the total off a receipt photo.
     Downscales the image on-device, sends it to the proxy's
     /scan endpoint, and fills in the receipt total.
     ============================================================ */

  function downscaleImage(blob, maxDim, cb) {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (Math.max(w, h) > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try {
        cb(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
      } catch (e) {
        cb(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  function scanReceipt(id, showToast) {
    receipts((list) => {
      const r = list.find((x) => x.id === id);
      if (!r || !r.blob) return;
      downscaleImage(r.blob, 1300, (b64) => {
        if (!b64) {
          if (showToast) toast('Couldn’t read the photo — enter the total manually');
          return;
        }
        fetch('https://mold-docs-ai-proxy.onrender.com/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: b64, mediaType: 'image/jpeg' })
        })
          .then((res) => res.json())
          .then((data) => {
            const total = (data && Number(data.total)) ? Number(data.total) : 0;
            if (total > 0) {
              receipts((l2) => {
                const r2 = l2.find((x) => x.id === id);
                if (!r2) return;
                r2.total = total;
                if (r2.allocations && r2.allocations.length === 1) r2.allocations[0].amount = total;
                MoldDocsStore.addPhoto(r2).then(() => {
                  renderReceipts();
                  if (showToast) toast('✓ Total read: $' + total.toFixed(2));
                });
              });
            } else if (showToast) {
              toast('Couldn’t read a total — enter it manually');
            }
          })
          .catch(() => {
            if (showToast) toast('Scan unavailable — enter the total manually');
          });
      });
    });
  }

  /* ============================================================
     ADMIN LOGIN — real authentication via Supabase.
     The publishable key is safe in client code; sessions are
     signed server-side. Not logged in = technician view, so the
     app stays usable even if Supabase ever stumbles.
     ============================================================ */

  const SUPABASE_URL = 'https://rfryouolgkqhsmmezzts.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_xYBkhsXmX0uugMSXCj_XDQ_0jMQJIxg';
  let supabaseClient = null;

  function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (typeof supabase === 'undefined' || !supabase.createClient) return null;
    try { supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (e) {}
    return supabaseClient;
  }

  function checkSession() {
    const c = initSupabase();
    if (!c) return;
    c.auth.getSession().then(({ data }) => {
      if (data && data.session) {
        MoldDocsStore.setRole('admin');
        applyRoleVisibility();
      }
    }).catch(() => {});
  }

  function openLogin() {
    const ov = document.getElementById('loginOverlay');
    if (ov) ov.style.display = 'flex';
    const err = document.getElementById('loginErr');
    if (err) err.textContent = '';
    const emailEl = document.getElementById('loginEmail');
    if (emailEl) setTimeout(() => emailEl.focus(), 50);
  }

  function closeLogin() {
    const ov = document.getElementById('loginOverlay');
    if (ov) ov.style.display = 'none';
  }

  function submitLogin() {
    const emailEl = document.getElementById('loginEmail');
    const passEl = document.getElementById('loginPass');
    const err = document.getElementById('loginErr');
    const email = ((emailEl && emailEl.value) || '').trim();
    const pass = (passEl && passEl.value) || '';
    if (!email || !pass) {
      if (err) err.textContent = 'Enter your email and password.';
      return;
    }
    const c = initSupabase();
    if (!c) {
      if (err) err.textContent = 'Auth is still loading — try again in a moment.';
      return;
    }
    if (err) err.textContent = 'Signing in…';
    c.auth.signInWithPassword({ email: email, password: pass }).then(({ data, error }) => {
      if (error) {
        if (err) err.textContent = (error.message || 'Sign-in failed').slice(0, 200);
        return;
      }
      if (passEl) passEl.value = '';
      closeLogin();
      MoldDocsStore.setRole('admin');
      applyRoleVisibility();
      goto('dashboard');
    }).catch(() => {
      if (err) err.textContent = 'Sign-in error — try again.';
    });
  }

  function signOut() {
    const c = initSupabase();
    const finish = () => {
      MoldDocsStore.setRole('technician');
      applyRoleVisibility();
      goto('splash');
    };
    if (c) {
      c.auth.signOut().then(finish).catch(finish);
    } else {
      finish();
    }
  }
