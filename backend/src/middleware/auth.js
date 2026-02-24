const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(process.env.DATA_DIR || '/data', 'api-key.txt');
let apiKey = null;

function getApiKey() {
  if (apiKey) return apiKey;
  try {
    apiKey = fs.readFileSync(KEY_FILE, 'utf-8').trim();
  } catch {
    apiKey = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, apiKey);
  }
  return apiKey;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }
  const token = header.slice(7);
  if (token !== getApiKey()) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
}

module.exports = { authMiddleware, getApiKey };
