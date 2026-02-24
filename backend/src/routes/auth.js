const { Router } = require('express');
const { getApiKey } = require('../middleware/auth');
const router = Router();

router.get('/', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false });
  }
  const token = header.slice(7);
  res.json({ valid: token === getApiKey() });
});

module.exports = router;
