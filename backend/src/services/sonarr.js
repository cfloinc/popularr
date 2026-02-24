const SONARR_URL = process.env.SONARR_URL;
const SONARR_API_KEY = process.env.SONARR_API_KEY;

async function sonarrFetch(endpoint, options = {}) {
  const url = `${SONARR_URL}/api/v3${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'X-Api-Key': SONARR_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sonarr ${endpoint}: ${resp.status} ${text}`);
  }
  return resp.json();
}

// Cache for library status
let seriesCache = { data: null, updatedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000;

async function getSeries() {
  if (seriesCache.data && Date.now() - seriesCache.updatedAt < CACHE_TTL) {
    return seriesCache.data;
  }
  const series = await sonarrFetch('/series');
  // Index by tvdbId for fast lookup
  const indexed = {};
  for (const s of series) {
    const stats = s.statistics || {};
    indexed[s.tvdbId] = {
      id: s.id,
      tvdbId: s.tvdbId,
      monitored: s.monitored,
      percentComplete: stats.percentOfEpisodes || 0,
      episodeFileCount: stats.episodeFileCount || 0,
      totalEpisodeCount: stats.totalEpisodeCount || 0,
    };
  }
  seriesCache = { data: indexed, updatedAt: Date.now() };
  return indexed;
}

async function addSeries(tvdbId, qualityProfileId, rootFolderPath, seasons = 'all') {
  const results = await sonarrFetch(`/series/lookup?term=tvdb:${tvdbId}`);
  if (!results.length) throw new Error(`No series found for TVDB ID ${tvdbId}`);
  const lookup = results[0];

  // Determine which seasons to monitor based on selection
  const realSeasons = lookup.seasons.filter(s => s.seasonNumber > 0);
  const latestSeasonNum = realSeasons.length > 0
    ? Math.max(...realSeasons.map(s => s.seasonNumber))
    : null;

  const series = {
    ...lookup,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    seasonFolder: true,
    seasons: lookup.seasons.map(s => {
      if (s.seasonNumber === 0) return { ...s, monitored: false };
      if (seasons === 'latest') return { ...s, monitored: s.seasonNumber === latestSeasonNum };
      if (seasons === 'first') return { ...s, monitored: s.seasonNumber === 1 };
      return { ...s, monitored: true }; // 'all'
    }),
    addOptions: {
      ignoreEpisodesWithFiles: false,
      ignoreEpisodesWithoutFiles: false,
      searchForMissingEpisodes: true,
    },
  };
  const result = await sonarrFetch('/series', {
    method: 'POST',
    body: JSON.stringify(series),
  });
  seriesCache = { data: null, updatedAt: 0 };
  return result;
}

async function getQualityProfiles() {
  return sonarrFetch('/qualityprofile');
}

async function getRootFolders() {
  return sonarrFetch('/rootfolder');
}

async function testConnection() {
  try {
    await sonarrFetch('/system/status');
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

module.exports = { getSeries, addSeries, getQualityProfiles, getRootFolders, testConnection };
