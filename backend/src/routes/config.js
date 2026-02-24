const { Router } = require('express');
const { getProviders } = require('../services/tmdb');
const radarr = require('../services/radarr');
const sonarr = require('../services/sonarr');
const router = Router();

// GET /api/config — connection status + available services
router.get('/', async (req, res) => {
  try {
    const [radarrStatus, sonarrStatus] = await Promise.all([
      radarr.testConnection(),
      sonarr.testConnection(),
    ]);
    res.json({
      providers: getProviders(),
      radarr: radarrStatus,
      sonarr: sonarrStatus,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config/profiles — quality profiles + root folders
router.get('/profiles', async (req, res) => {
  try {
    const [radarrProfiles, radarrFolders, sonarrProfiles, sonarrFolders] = await Promise.all([
      radarr.getQualityProfiles(),
      radarr.getRootFolders(),
      sonarr.getQualityProfiles(),
      sonarr.getRootFolders(),
    ]);
    res.json({
      radarr: {
        qualityProfiles: radarrProfiles.map(p => ({ id: p.id, name: p.name })),
        rootFolders: radarrFolders.map(f => ({ id: f.id, path: f.path })),
      },
      sonarr: {
        qualityProfiles: sonarrProfiles.map(p => ({ id: p.id, name: p.name })),
        rootFolders: sonarrFolders.map(f => ({ id: f.id, path: f.path })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
