/* ============================================================
   Mold Docs — AI Proxy
   A tiny server that turns a technician's field note into
   structured job-timeline entries via the Anthropic API.

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

const SYSTEM_PROMPT = [
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Pull the JSON array out of the model's reply, tolerating stray text/fences.
function extractEntries(text) {
  if (!text) return [];
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

const server = http.createServer((req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Mold Docs AI proxy is running.');
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 20000) req.destroy();
  });
  req.on('end', async () => {
    if (!API_KEY) {
      sendJson(res, 500, { error: 'Server is missing ANTHROPIC_API_KEY.' });
      return;
    }
    let text = '';
    try { text = String((JSON.parse(body || '{}').text) || '').slice(0, 4000); } catch (e) {}
    if (!text.trim()) {
      sendJson(res, 400, { error: 'No text provided.' });
      return;
    }
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }]
        })
      });
      const data = await r.json();
      if (!r.ok) {
        sendJson(res, 502, { error: 'AI request failed.', detail: data });
        return;
      }
      const out = (data.content && data.content[0] && data.content[0].text) || '';
      sendJson(res, 200, { entries: extractEntries(out) });
    } catch (e) {
      sendJson(res, 502, { error: 'Proxy error.', detail: String(e) });
    }
  });
});

server.listen(PORT, () => {
  console.log('Mold Docs AI proxy listening on port ' + PORT);
});
