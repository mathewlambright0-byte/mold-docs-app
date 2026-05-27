/* ============================================================
   Mold Docs — AI + HCP Proxy
   Routes:
     GET  /                       -> health check
     POST /                       -> turn a field note into timeline entries (AI)
     POST /scan                   -> read the total off a receipt photo (AI)
     POST /hcp/customers          -> list Housecall Pro customers (Supabase-auth-gated)
     POST /intake/process         -> turn a free-form lead note into an HCP
                                     customer + scheduled job in one shot.
                                     (Supabase-auth-gated, uses the write key.)

   Secrets live ONLY here, as environment variables. Never in
   the app, the browser, or the repo.

   Required env vars:
     ANTHROPIC_API_KEY     for the AI features
     HCP_API_KEY           Housecall Pro READ-ONLY key (customer picker)
     HCP_API_KEY_WRITE     Housecall Pro FULL-ACCESS key (creates customers
                           and jobs from /intake/process; admin-gated)

   Optional:
     ANTHROPIC_MODEL, ALLOWED_ORIGIN,
     SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
   ============================================================ */

const http = require('http');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://mold-docs-app.onrender.com';
const PORT = process.env.PORT || 10000;

const HCP_API_KEY = process.env.HCP_API_KEY || '';
const HCP_API_KEY_WRITE = process.env.HCP_API_KEY_WRITE || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rfryouolgkqhsmmezzts.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
  || 'sb_publishable_xYBkhsXmX0uugMSXCj_XDQ_0jMQJIxg';

const TIMELINE_PROMPT = [
  "You convert a mold-remediation technician's spoken or typed field note",
  'into structured job-timeline entries.',
  'Return ONLY a JSON array — no prose, no markdown code fences.',
  'Each element: {"when": string, "what": string, "notes": string,',
  '"status": "done" | "active" | "upcoming", "phase": string}.',
  '- "what": a short, clean, professional title (e.g. "Drywall installed").',
  '- "when": a short human label inferred from the note ("Today", "Tomorrow", "Fri").',
  '- "status": "done" for completed work, "active" for in-progress, "upcoming" for planned.',
  '- "phase": one of Inspection, Setup, Demo, Treatment, Drying, Reconstruction, Clearance, Note.',
  '- "notes": any useful detail from the note, cleaned up; "" if none.',
  '- Split work already done from work planned for later into separate entries.',
  '- Fix grammar; keep every field brief and professional.'
].join('\n');

const RECEIPT_PROMPT = [
  'You read a photo of a store receipt for a mold-remediation business.',
  'Return ONLY a JSON object — no prose, no markdown code fences.',
  'Shape: {"total": number, "store": string, "date": string}.',
  '- "total": the final amount actually paid, as a plain number (no $ sign, no commas).',
  '  Use the grand total / amount due, not a subtotal. 0 if it is not legible.',
  '- "store": the store name (e.g. "The Home Depot"). "" if not legible.',
  '- "date": the purchase date shown on the receipt (e.g. "May 24, 2026"). "" if not legible.'
].join('\n');

// Build the intake prompt with today's date so Claude can resolve relative
// phrases ("Friday", "tomorrow", "next Mon") into real ISO datetimes.
function buildIntakePrompt(now) {
  const today = now.toISOString().slice(0, 10);          // 2026-05-27
  const tz = 'America/Los_Angeles';                       // Mold Docs HQ
  return [
    'You convert a free-form lead note from a mold-remediation business owner',
    'into a structured customer + scheduled-job payload for Housecall Pro.',
    'Return ONLY a JSON object — no prose, no markdown code fences.',
    '',
    'Today is ' + today + '. The business timezone is ' + tz + '.',
    'Resolve all relative dates ("today", "tomorrow", "Friday", "next Tue") to',
    'real ISO 8601 datetimes IN UTC (Z suffix). If a date is mentioned without',
    'a year, pick the nearest upcoming occurrence. Default appointment length',
    'is 2 hours unless the note says otherwise.',
    '',
    'Shape:',
    '{',
    '  "customer": {',
    '    "first_name": string,',
    '    "last_name": string,',
    '    "email": string,           // "" if not given',
    '    "mobile_number": string,    // digits only, 10 digits if US, "" if not given',
    '    "lead_source": string,      // e.g. "Phone call", "Referral", "" if unclear',
    '    "address": {',
    '      "street": string,         // includes unit/apt if mentioned',
    '      "city": string,',
    '      "state": string,          // 2-letter code',
    '      "zip": string             // 5 digits',
    '    }',
    '  },',
    '  "job": {',
    '    "description": string,      // short, e.g. "Basement mold remediation"',
    '    "notes": string,            // longer detail captured from the note, "" if none',
    '    "scheduled_start": string,  // ISO 8601 UTC, e.g. "2026-05-29T21:00:00Z"',
    '    "scheduled_end": string,    // ISO 8601 UTC, start + duration',
    '    "arrival_window_minutes": number  // 0 unless caller asked for a window',
    '  }',
    '}',
    '',
    'If a field is genuinely not in the note, use "" (or 0 for arrival_window_minutes).',
    'Never invent phone numbers, emails, or addresses. Never guess a year.',
    'If no appointment time is mentioned, set scheduled_start and scheduled_end to "".'
  ].join('\n');
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(''));
  });
}

function extractJson(text, open, close) {
  if (!text) return null;
  const s = text.indexOf(open);
  const e = text.lastIndexOf(close);
  if (s === -1 || e === -1 || e < s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch (x) {
    return null;
  }
}

function callAnthropic(payload) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  }).then((r) => r.json().then((data) => ({ ok: r.ok, data })));
}

// Verify the caller is a signed-in Supabase user by asking Supabase to
// validate their access token. Returns the user object or null.
async function verifySupabaseUser(req) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + m[1]
      }
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data && data.id ? data : null;
  } catch (e) {
    return null;
  }
}

function normalizeCustomer(c) {
  if (!c || typeof c !== 'object') return null;
  const first = c.first_name || c.firstName || '';
  const last = c.last_name || c.lastName || '';
  const company = c.company || '';
  const fullName = [first, last].filter(Boolean).join(' ').trim() || company;
  const addrs = Array.isArray(c.addresses) ? c.addresses : [];
  const a = addrs[0] || {};
  const address = [a.street, a.street_line_2, a.city, a.state, a.zip].filter(Boolean).join(', ');
  return {
    id: c.id || '',
    name: fullName,
    first_name: first,
    last_name: last,
    company: company,
    email: c.email || '',
    phone: c.mobile_number || c.mobileNumber || c.home_number || c.homeNumber || c.work_number || '',
    address: address
  };
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const path = (req.url || '/').split('?')[0];

  // Health check
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mold Docs proxy is running.');
    return;
  }

  try {
    /* ---- POST /hcp/customers : list Housecall Pro customers ---- */
    if (req.method === 'POST' && path === '/hcp/customers') {
      if (!HCP_API_KEY) { sendJson(res, 500, { error: 'Server is missing HCP_API_KEY.' }); return; }
      const user = await verifySupabaseUser(req);
      if (!user) { sendJson(res, 401, { error: 'Sign in as admin first.' }); return; }

      const body = await readBody(req, 20000);
      let q = '';
      let page = 1;
      try {
        const p = JSON.parse(body || '{}');
        q = String(p.q || '');
        page = Math.max(1, Number(p.page) || 1);
      } catch (e) {}

      const url = 'https://api.housecallpro.com/customers?page=' + page + '&page_size=50'
        + (q ? '&q=' + encodeURIComponent(q) : '');
      const r = await fetch(url, {
        headers: {
          Authorization: 'Token ' + HCP_API_KEY,
          Accept: 'application/json'
        }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { sendJson(res, r.status, { error: 'Housecall Pro error', detail: data }); return; }

      const list = Array.isArray(data.customers) ? data.customers
        : (Array.isArray(data) ? data : []);
      const customers = list.map(normalizeCustomer).filter(Boolean);
      sendJson(res, 200, { customers: customers });
      return;
    }

    /* ---- POST /scan : read a receipt photo ---- */
    if (req.method === 'POST' && path === '/scan') {
      if (!API_KEY) { sendJson(res, 500, { error: 'Server is missing ANTHROPIC_API_KEY.' }); return; }
      const body = await readBody(req, 9000000);
      let imageBase64 = '';
      let mediaType = 'image/jpeg';
      try {
        const p = JSON.parse(body || '{}');
        imageBase64 = String(p.imageBase64 || '');
        if (p.mediaType) mediaType = String(p.mediaType);
      } catch (e) {}
      if (!imageBase64) { sendJson(res, 400, { error: 'No image provided.' }); return; }

      const { ok, data } = await callAnthropic({
        model: MODEL,
        max_tokens: 300,
        system: RECEIPT_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Read this receipt and return the JSON.' }
          ]
        }]
      });
      if (!ok) { sendJson(res, 502, { error: 'AI request failed.', detail: data }); return; }
      const out = (data.content && data.content[0] && data.content[0].text) || '';
      const parsed = extractJson(out, '{', '}') || {};
      sendJson(res, 200, {
        total: Number(parsed.total) || 0,
        store: String(parsed.store || ''),
        date: String(parsed.date || '')
      });
      return;
    }

    /* ---- POST /intake/process : free-form lead note -> HCP customer + job ---- */
    if (req.method === 'POST' && path === '/intake/process') {
      if (!API_KEY)           { sendJson(res, 500, { error: 'Server is missing ANTHROPIC_API_KEY.' }); return; }
      if (!HCP_API_KEY_WRITE) { sendJson(res, 500, { error: 'Server is missing HCP_API_KEY_WRITE.' }); return; }
      const user = await verifySupabaseUser(req);
      if (!user) { sendJson(res, 401, { error: 'Sign in as admin first.' }); return; }

      const body = await readBody(req, 50000);
      let text = '';
      try { text = String((JSON.parse(body || '{}').text) || '').slice(0, 8000); } catch (e) {}
      if (!text.trim()) { sendJson(res, 400, { error: 'No lead text provided.' }); return; }

      // Step 1: Claude extracts the structured payload.
      const intakePrompt = buildIntakePrompt(new Date());
      const { ok, data } = await callAnthropic({
        model: MODEL,
        max_tokens: 1024,
        system: intakePrompt,
        messages: [{ role: 'user', content: text }]
      });
      if (!ok) { sendJson(res, 502, { error: 'AI extraction failed.', detail: data }); return; }
      const out = (data.content && data.content[0] && data.content[0].text) || '';
      const parsed = extractJson(out, '{', '}');
      if (!parsed || !parsed.customer || !parsed.job) {
        sendJson(res, 502, { error: 'AI returned an unparseable payload.', raw: out.slice(0, 500) });
        return;
      }

      const c = parsed.customer || {};
      const ca = c.address || {};
      const j = parsed.job || {};

      // Step 2: create the HCP customer.
      const customerBody = {
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        email: c.email || '',
        mobile_number: (c.mobile_number || '').replace(/\D/g, ''),
        lead_source: c.lead_source || '',
        notes: j.notes || '',
        addresses: (ca.street || ca.city || ca.zip)
          ? [{ street: ca.street || '', city: ca.city || '', state: ca.state || '', zip: ca.zip || '' }]
          : []
      };
      const custResp = await fetch('https://api.housecallpro.com/customers', {
        method: 'POST',
        headers: {
          Authorization: 'Token ' + HCP_API_KEY_WRITE,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(customerBody)
      });
      const custData = await custResp.json().catch(() => ({}));
      if (!custResp.ok) {
        sendJson(res, 502, { error: 'HCP customer create failed.', detail: custData, extracted: parsed });
        return;
      }
      const customerId = custData.id;
      const addressId = (custData.addresses && custData.addresses[0] && custData.addresses[0].id) || '';

      // Step 3: if a time was extracted, create the scheduled job.
      let jobData = null;
      if (j.scheduled_start && j.scheduled_end && addressId) {
        const jobBody = {
          customer_id: customerId,
          address_id: addressId,
          description: j.description || '',
          schedule: {
            scheduled_start: j.scheduled_start,
            scheduled_end: j.scheduled_end,
            arrival_window: Number(j.arrival_window_minutes) || 0
          }
        };
        const jobResp = await fetch('https://api.housecallpro.com/jobs', {
          method: 'POST',
          headers: {
            Authorization: 'Token ' + HCP_API_KEY_WRITE,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(jobBody)
        });
        jobData = await jobResp.json().catch(() => ({}));
        if (!jobResp.ok) {
          // Customer was created but job failed — return both so the user knows
          // to either retry the job, or delete the orphan customer.
          sendJson(res, 502, {
            error: 'HCP job create failed.',
            detail: jobData,
            customer: custData,
            extracted: parsed
          });
          return;
        }
      }

      sendJson(res, 200, {
        ok: true,
        extracted: parsed,
        customer: { id: customerId, address_id: addressId, raw: custData },
        job: jobData
      });
      return;
    }

    /* ---- POST / : turn a field note into timeline entries ---- */
    if (req.method === 'POST' && path === '/') {
      if (!API_KEY) { sendJson(res, 500, { error: 'Server is missing ANTHROPIC_API_KEY.' }); return; }
      const body = await readBody(req, 20000);
      let text = '';
      try { text = String((JSON.parse(body || '{}').text) || '').slice(0, 4000); } catch (e) {}
      if (!text.trim()) { sendJson(res, 400, { error: 'No text provided.' }); return; }

      const { ok, data } = await callAnthropic({
        model: MODEL,
        max_tokens: 1024,
        system: TIMELINE_PROMPT,
        messages: [{ role: 'user', content: text }]
      });
      if (!ok) { sendJson(res, 502, { error: 'AI request failed.', detail: data }); return; }
      const out = (data.content && data.content[0] && data.content[0].text) || '';
      const arr = extractJson(out, '[', ']');
      sendJson(res, 200, { entries: Array.isArray(arr) ? arr : [] });
      return;
    }

    res.writeHead(405);
    res.end();
  } catch (e) {
    sendJson(res, 502, { error: 'Proxy error.', detail: String(e) });
  }
});

server.listen(PORT, () => {
  console.log('Mold Docs proxy listening on port ' + PORT);
});
