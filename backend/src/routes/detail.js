const { Router } = require('express');
const { fetchDetail } = require('../services/tmdb');
const router = Router();

// GET /api/detail/:mediaType/:tmdbId
router.get('/:mediaType/:tmdbId', async (req, res) => {
  const { mediaType, tmdbId } = req.params;
  if (!['movie', 'tv'].includes(mediaType)) {
    return res.status(400).json({ error: 'mediaType must be movie or tv' });
  }
  try {
    const detail = await fetchDetail(mediaType, parseInt(tmdbId));
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
