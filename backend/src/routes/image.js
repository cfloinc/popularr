const { Router } = require('express');
const router = Router();

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const SIZE_MAP = {
  poster: 'w500',
  backdrop: 'w1280',
  profile: 'w185',
};

// GET /api/image/:type/:path (no auth — images need to load freely in app)
router.get('/:type/*', async (req, res) => {
  const { type } = req.params;
  const imagePath = '/' + req.params[0]; // e.g., /abc123.jpg
  const size = SIZE_MAP[type] || 'w500';

  try {
    const resp = await fetch(`${TMDB_IMAGE_BASE}/${size}${imagePath}`);
    if (!resp.ok) return res.status(resp.status).end();

    res.set('Content-Type', resp.headers.get('content-type'));
    res.set('Cache-Control', 'public, max-age=86400'); // 24-hour cache
    const buffer = await resp.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
