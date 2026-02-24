const RADARR_URL = process.env.RADARR_URL;
const RADARR_API_KEY = process.env.RADARR_API_KEY;

async function radarrFetch(endpoint, options = {}) {
  const url = `${RADARR_URL}/api/v3${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'X-Api-Key': RADARR_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Radarr ${endpoint}: ${resp.status} ${text}`);
  }
  return resp.json();
}

// Cache for library status
let movieCache = { data: null, updatedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getMovies() {
  if (movieCache.data && Date.now() - movieCache.updatedAt < CACHE_TTL) {
    return movieCache.data;
  }
  const movies = await radarrFetch('/movie');
  // Index by tmdbId for fast lookup
  const indexed = {};
  for (const m of movies) {
    indexed[m.tmdbId] = {
      id: m.id,
      tmdbId: m.tmdbId,
      hasFile: m.hasFile,
      monitored: m.monitored,
    };
  }
  movieCache = { data: indexed, updatedAt: Date.now() };
  return indexed;
}

async function addMovie(tmdbId, qualityProfileId, rootFolderPath) {
  const lookup = await radarrFetch(`/movie/lookup/tmdb?tmdbId=${tmdbId}`);
  const movie = {
    ...lookup,
    qualityProfileId,
    rootFolderPath,
    monitored: true,
    minimumAvailability: 'released',
    addOptions: { searchForMovie: true },
  };
  const result = await radarrFetch('/movie', {
    method: 'POST',
    body: JSON.stringify(movie),
  });
  // Invalidate cache
  movieCache = { data: null, updatedAt: 0 };
  return result;
}

async function getQualityProfiles() {
  return radarrFetch('/qualityprofile');
}

async function getRootFolders() {
  return radarrFetch('/rootfolder');
}

async function testConnection() {
  try {
    await radarrFetch('/system/status');
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

module.exports = { getMovies, addMovie, getQualityProfiles, getRootFolders, testConnection };
