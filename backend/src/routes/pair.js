const { Router } = require('express');
const crypto = require('crypto');
const { getApiKey } = require('../middleware/auth');

const router = Router();

let activeCode = null;

function generateCode() {
  const code = String(crypto.randomInt(100000, 999999));
  activeCode = { code, expiresAt: Date.now() + 5 * 60 * 1000 };
  console.log(`Pairing code generated: ${code} (expires in 5 minutes)`);
  return activeCode;
}

function isValid(code) {
  return activeCode && activeCode.code === code && Date.now() < activeCode.expiresAt;
}

// Generate a new pairing code
router.post('/generate', (req, res) => {
  const result = generateCode();
  res.json({ code: result.code, expiresAt: new Date(result.expiresAt).toISOString() });
});

// Validate a pairing code and return the API key
router.post('/validate', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });
  if (!isValid(String(code))) return res.status(403).json({ error: 'Invalid or expired code' });
  activeCode = null; // single-use
  res.json({ apiKey: getApiKey() });
});

// Web page to display/generate pairing code
router.get('/', (req, res) => {
  if (!activeCode || Date.now() >= activeCode.expiresAt) {
    generateCode();
  }
  const remaining = Math.max(0, Math.ceil((activeCode.expiresAt - Date.now()) / 1000));
  res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Popularr Pairing</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #1a1a2e; color: #fff;
    display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { text-align: center; padding: 3rem; }
  .code { font-size: 4rem; font-weight: bold; letter-spacing: 0.5rem; margin: 1.5rem 0;
    background: #16213e; padding: 1rem 2rem; border-radius: 1rem; font-family: monospace; }
  .expire { color: #888; font-size: 0.9rem; }
  h1 { font-weight: 300; font-size: 1.5rem; color: #ccc; }
  .refresh { margin-top: 1.5rem; }
  .refresh a { color: #4cc9f0; text-decoration: none; }
</style></head>
<body><div class="card">
  <h1>Enter this code on your Apple TV</h1>
  <div class="code">${activeCode.code}</div>
  <div class="expire">Expires in ${remaining} seconds</div>
  <div class="refresh"><a href="/pair">Refresh</a></div>
</div></body></html>`);
});

module.exports = router;
module.exports.generateCode = generateCode;
