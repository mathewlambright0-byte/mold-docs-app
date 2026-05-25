/* ============================================================
   Mold Docs — AI Proxy
   A tiny server the Mold Docs app calls for AI features:
     POST /        -> turn a field note into timeline entries
     POST /scan    -> read the total off a receipt photo

   The API key lives ONLY here, as an environment variable on
   the server — never in the app, never in the browser, never
   committed to the repo.

   Required env var:  ANTHROPIC_API_KEY
   Optional:          ANTHROPIC_MODEL, ALLOWED_ORIGIN
   ============================================================ */

const http = require('http');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://mold-docs-app.onrender.com';
const PORT = process.env.PORT || 10000;

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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

// Pull a JSON value out of the model's reply, tolerating stray text/fences.
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

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mold Docs AI proxy is running.');
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  if (!API_KEY) { sendJson(res, 500, { error: 'Server is missing ANTHROPIC_API_KEY.' }); return; }

  const path = (req.url || '/').split('?')[0];

  try {
    /* ---- POST /scan : read a receipt photo ---- */
    if (path === '/scan') {
      const body = await readBody(req, 9000000); // ~9 MB ceiling for images
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

    /* ---- POST / : turn a field note into timeline entries ---- */
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
  } catch (e) {
    sendJson(res, 502, { error: 'Proxy error.', detail: String(e) });
  }
});

server.listen(PORT, () => {
  console.log('Mold Docs AI proxy listening on port ' + PORT);
});
