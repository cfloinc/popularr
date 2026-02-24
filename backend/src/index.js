const express = require('express');
const path = require('path');
const { authMiddleware, getApiKey } = require('./middleware/auth');

const app = express();
app.use(express.json());

// Serve static web UI
app.use(express.static(path.join(__dirname, '..', 'public')));

// Web login (validates WEB_PASSWORD, returns API key)
app.post('/api/web/login', (req, res) => {
  const webPassword = process.env.WEB_PASSWORD;
  if (!webPassword) {
    return res.json({ apiKey: getApiKey() });
  }
  const { password } = req.body;
  if (!password || password !== webPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.json({ apiKey: getApiKey() });
});

// Public routes (no auth)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/image', require('./routes/image'));
app.use('/api/pair', require('./routes/pair'));
app.use('/pair', require('./routes/pair'));

// Protected routes
app.use('/api', authMiddleware);
app.use('/api/trending', require('./routes/trending'));
app.use('/api/detail', require('./routes/detail'));
app.use('/api/config', require('./routes/config'));
app.use('/api', require('./routes/library'));

// Health check (no auth)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 7879;
app.listen(PORT, () => {
  console.log(`Popularr backend listening on port ${PORT}`);
  console.log(`API Key: ${getApiKey()}`);
});
