const { Router } = require('express');
const { fetchTrending, fetchAllTime } = require('../services/tmdb');
const router = Router();

// GET /api/trending — all services
// Optional query: ?mode=alltime (default: trending)
router.get('/', async (req, res) => {
  try {
    const mode = req.query.mode;
    const data = mode === 'alltime' ? await fetchAllTime() : await fetchTrending();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trending/:service — one service
router.get('/:service', async (req, res) => {
  try {
    const mode = req.query.mode;
    const data = mode === 'alltime' ? await fetchAllTime() : await fetchTrending();
    const service = data[req.params.service];
    if (!service) return res.status(404).json({ error: 'Unknown service' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
