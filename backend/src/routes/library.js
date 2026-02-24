const { Router } = require('express');
const { fetchDetail } = require('../services/tmdb');
const radarr = require('../services/radarr');
const sonarr = require('../services/sonarr');
const router = Router();

// GET /api/status — library status for all trending items
router.get('/status', async (req, res) => {
  try {
    const [movies, series] = await Promise.all([
      radarr.getMovies(),
      sonarr.getSeries(),
    ]);
    res.json({ movies, series });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/add — add a title to Sonarr or Radarr
router.post('/add', async (req, res) => {
  const { tmdbId, mediaType, qualityProfileId, rootFolderPath, seasons } = req.body;

  if (!tmdbId || !mediaType) {
    return res.status(400).json({ error: 'tmdbId and mediaType are required' });
  }

  try {
    if (mediaType === 'movie') {
      const result = await radarr.addMovie(tmdbId, qualityProfileId, rootFolderPath);
      res.json({ success: true, id: result.id, title: result.title });
    } else if (mediaType === 'tv') {
      // Need TVDB ID — fetch from TMDB external_ids
      const detail = await fetchDetail('tv', tmdbId);
      if (!detail.tvdbId) {
        return res.status(400).json({ error: 'No TVDB ID found for this series' });
      }
      const result = await sonarr.addSeries(detail.tvdbId, qualityProfileId, rootFolderPath, seasons || 'all');
      res.json({ success: true, id: result.id, title: result.title });
    } else {
      res.status(400).json({ error: 'mediaType must be movie or tv' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
