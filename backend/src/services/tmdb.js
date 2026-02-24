const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE = 'https://api.themoviedb.org/3';

const PROVIDERS = {
  netflix:   { id: 8,    name: 'Netflix',      color: '#E50914' },
  amazon:    { id: 9,    name: 'Prime Video',   color: '#00A8E1' },
  disney:    { id: 337,  name: 'Disney+',       color: '#113CCF' },
  hbo:       { id: 1899, name: 'Max',           color: '#741DFF' },
  apple:     { id: 350,  name: 'Apple TV+',     color: '#A2AAAD' },
  hulu:      { id: 15,   name: 'Hulu',          color: '#1CE783' },
  peacock:   { id: 386,  name: 'Peacock',       color: '#FFD700' },
  paramount: { id: 2616, name: 'Paramount+',    color: '#0064FF' },
};

const NETFLIX_TSV = 'https://www.netflix.com/tudum/top10/data/all-weeks-global.tsv';

let cache = { data: null, updatedAt: 0 };
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Provider ID reverse lookup
const PROVIDER_ID_TO_KEY = {};
for (const [key, prov] of Object.entries(PROVIDERS)) {
  PROVIDER_ID_TO_KEY[prov.id] = key;
}

const { mergeTrending, getCumulativeTrending } = require('./db');

async function tmdbFetch(endpoint, params = {}) {
  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`TMDB ${endpoint}: ${resp.status}`);
  return resp.json();
}

// Fetch Netflix's real top 10 titles and resolve to TMDB IDs
async function fetchNetflixTop10() {
  const titles = [];
  try {
    const resp = await fetch(NETFLIX_TSV);
    if (!resp.ok) throw new Error(`Netflix TSV: ${resp.status}`);
    const text = await resp.text();
    const lines = text.split('\n');

    // Find the most recent week (first data line has the latest date)
    const latestWeek = lines[1]?.split('\t')[0];
    if (!latestWeek) return titles;

    // Extract all titles from the latest week (all categories)
    const seen = new Set();
    for (const line of lines.slice(1)) {
      const cols = line.split('\t');
      if (cols[0] !== latestWeek) break; // only latest week
      const showTitle = cols[3];
      if (showTitle && !seen.has(showTitle)) {
        seen.add(showTitle);
        const category = cols[1];
        const rank = parseInt(cols[2], 10);
        const mediaType = category.startsWith('Film') ? 'movie' : 'tv';
        titles.push({ title: showTitle, rank, mediaType });
      }
    }
    console.log(`Netflix Top 10: fetched ${titles.length} titles for week ${latestWeek}`);
  } catch (err) {
    console.warn('Failed to fetch Netflix Top 10:', err.message);
  }
  return titles;
}

// Search TMDB for a title and return a formatted item
async function searchTmdb(title, mediaType) {
  try {
    const data = await tmdbFetch(`/search/${mediaType}`, { query: title });
    const item = (data.results || [])[0];
    if (!item) return null;
    return {
      tmdbId: item.id,
      mediaType,
      title: item.title || item.name,
      year: (item.release_date || item.first_air_date || '').split('-')[0],
      overview: item.overview,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      rating: item.vote_average,
      popularity: item.popularity,
      genreIds: item.genre_ids,
    };
  } catch {
    return null;
  }
}

// Backfill a provider with discover results if it has < threshold items
async function discoverForProvider(providerId, mediaType, existingIds, limit) {
  const items = [];
  const seen = new Set(existingIds);
  for (let page = 1; page <= 3 && items.length < limit; page++) {
    try {
      const data = await tmdbFetch(`/discover/${mediaType}`, {
        with_watch_providers: String(providerId),
        watch_region: 'US',
        sort_by: 'popularity.desc',
        page: String(page),
      });
      for (const item of (data.results || [])) {
        if (!seen.has(item.id) && items.length < limit) {
          seen.add(item.id);
          items.push({
            tmdbId: item.id,
            mediaType,
            title: item.title || item.name,
            year: (item.release_date || item.first_air_date || '').split('-')[0],
            overview: item.overview,
            posterPath: item.poster_path,
            backdropPath: item.backdrop_path,
            rating: item.vote_average,
            popularity: item.popularity,
            genreIds: item.genre_ids,
          });
        }
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.warn(`Discover fallback failed: provider ${providerId}, ${mediaType} page ${page}:`, err.message);
    }
  }
  return items;
}

async function fetchTrending() {
  if (cache.data && Date.now() - cache.updatedAt < CACHE_TTL) return cache.data;

  console.log('Fetching trending content...');

  // Step 1: Fetch TMDB trending (multiple pages for deeper catalog)
  const trendingItems = []; // ordered by trending rank
  for (const mediaType of ['movie', 'tv']) {
    for (let page = 1; page <= 5; page++) {
      try {
        const data = await tmdbFetch(`/trending/${mediaType}/week`, { page: String(page) });
        for (const item of (data.results || [])) {
          trendingItems.push({
            tmdbId: item.id,
            mediaType: item.media_type || mediaType,
            title: item.title || item.name,
            year: (item.release_date || item.first_air_date || '').split('-')[0],
            overview: item.overview,
            posterPath: item.poster_path,
            backdropPath: item.backdrop_path,
            rating: item.vote_average,
            popularity: item.popularity,
            genreIds: item.genre_ids,
            trendingRank: trendingItems.length,
          });
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.warn(`Trending fetch failed: ${mediaType} page ${page}:`, err.message);
      }
    }
  }

  console.log(`Fetched ${trendingItems.length} trending items, looking up providers...`);

  // Step 2: Look up watch providers for each trending item
  for (const item of trendingItems) {
    try {
      const data = await tmdbFetch(`/${item.mediaType}/${item.tmdbId}/watch/providers`);
      const us = data.results?.US;
      if (us) {
        item.providerIds = new Set();
        for (const p of (us.flatrate || [])) item.providerIds.add(p.provider_id);
        for (const p of (us.ads || [])) item.providerIds.add(p.provider_id);
      }
      await new Promise(r => setTimeout(r, 100));
    } catch {
      // skip — item won't appear in any provider row
    }
  }

  // Step 3: Bucket into providers, split by media type
  const BACKFILL_THRESHOLD = 15;
  const results = {};
  for (const [key, prov] of Object.entries(PROVIDERS)) {
    const movies = [];
    const shows = [];
    const seenMovies = new Set();
    const seenShows = new Set();
    for (const item of trendingItems) {
      if (!item.providerIds?.has(prov.id)) continue;
      if (item.mediaType === 'movie' && !seenMovies.has(item.tmdbId)) {
        seenMovies.add(item.tmdbId);
        const cleaned = {
          tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title,
          year: item.year, overview: item.overview, posterPath: item.posterPath,
          backdropPath: item.backdropPath, rating: item.rating,
          popularity: item.popularity, genreIds: item.genreIds,
        };
        movies.push(cleaned);
      } else if (item.mediaType === 'tv' && !seenShows.has(item.tmdbId)) {
        seenShows.add(item.tmdbId);
        const cleaned = {
          tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title,
          year: item.year, overview: item.overview, posterPath: item.posterPath,
          backdropPath: item.backdropPath, rating: item.rating,
          popularity: item.popularity, genreIds: item.genreIds,
        };
        shows.push(cleaned);
      }
    }
    results[key] = { ...prov, key, movies: movies.slice(0, 40), shows: shows.slice(0, 40) };
  }

  // Step 3b: Backfill small providers with discover
  for (const [key, prov] of Object.entries(results)) {
    if (prov.movies.length < BACKFILL_THRESHOLD) {
      const existingIds = prov.movies.map(m => m.tmdbId);
      const extra = await discoverForProvider(PROVIDERS[key].id, 'movie', existingIds, 40 - prov.movies.length);
      prov.movies = [...prov.movies, ...extra].slice(0, 40);
      if (extra.length > 0) console.log(`${prov.name}: backfilled ${extra.length} movies via discover`);
    }
    if (prov.shows.length < BACKFILL_THRESHOLD) {
      const existingIds = prov.shows.map(s => s.tmdbId);
      const extra = await discoverForProvider(PROVIDERS[key].id, 'tv', existingIds, 40 - prov.shows.length);
      prov.shows = [...prov.shows, ...extra].slice(0, 40);
      if (extra.length > 0) console.log(`${prov.name}: backfilled ${extra.length} shows via discover`);
    }
  }

  // Step 4: Netflix real top 10 — boost to front of movies or shows
  const netflixTop10 = await fetchNetflixTop10();
  if (netflixTop10.length > 0) {
    const boostedMovieIds = new Set();
    const boostedShowIds = new Set();
    const boostedMovies = [];
    const boostedShows = [];

    for (const entry of netflixTop10) {
      const item = await searchTmdb(entry.title, entry.mediaType);
      if (!item) { await new Promise(r => setTimeout(r, 150)); continue; }
      if (entry.mediaType === 'movie' && !boostedMovieIds.has(item.tmdbId)) {
        boostedMovieIds.add(item.tmdbId);
        boostedMovies.push(item);
      } else if (entry.mediaType === 'tv' && !boostedShowIds.has(item.tmdbId)) {
        boostedShowIds.add(item.tmdbId);
        boostedShows.push(item);
      }
      await new Promise(r => setTimeout(r, 150));
    }

    if (boostedMovies.length > 0) {
      const existing = results.netflix.movies.filter(i => !boostedMovieIds.has(i.tmdbId));
      results.netflix.movies = [...boostedMovies, ...existing].slice(0, 40);
      console.log(`Netflix: boosted ${boostedMovies.length} real top 10 movies to front`);
    }
    if (boostedShows.length > 0) {
      const existing = results.netflix.shows.filter(i => !boostedShowIds.has(i.tmdbId));
      results.netflix.shows = [...boostedShows, ...existing].slice(0, 40);
      console.log(`Netflix: boosted ${boostedShows.length} real top 10 shows to front`);
    }
  }

  for (const [key, prov] of Object.entries(results)) {
    console.log(`${prov.name}: ${prov.movies.length} movies, ${prov.shows.length} shows`);
  }

  // Persist to SQLite and get cumulative 4-week view
  try {
    mergeTrending(results);
    const cumulative = getCumulativeTrending(PROVIDERS);
    console.log('Cumulative trending updated from SQLite');
    cache = { data: cumulative, updatedAt: Date.now() };
    return cumulative;
  } catch (err) {
    console.warn('SQLite cumulative trending failed, using fresh data:', err.message);
    cache = { data: results, updatedAt: Date.now() };
    return results;
  }
}

let allTimeCache = { data: null, updatedAt: 0 };
const ALL_TIME_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function fetchAllTime() {
  if (allTimeCache.data && Date.now() - allTimeCache.updatedAt < ALL_TIME_CACHE_TTL) return allTimeCache.data;

  console.log('Fetching all-time popular content...');

  const results = {};
  for (const [key, prov] of Object.entries(PROVIDERS)) {
    const movies = [];
    const shows = [];
    const seenMovies = new Set();
    const seenShows = new Set();

    // Fetch popular movies for this provider
    for (let page = 1; page <= 3 && movies.length < 40; page++) {
      try {
        const data = await tmdbFetch('/discover/movie', {
          with_watch_providers: String(prov.id),
          watch_region: 'US',
          sort_by: 'popularity.desc',
          page: String(page),
        });
        for (const item of (data.results || [])) {
          if (!seenMovies.has(item.id) && movies.length < 40) {
            seenMovies.add(item.id);
            movies.push({
              tmdbId: item.id, mediaType: 'movie', title: item.title,
              year: (item.release_date || '').split('-')[0], overview: item.overview,
              posterPath: item.poster_path, backdropPath: item.backdrop_path,
              rating: item.vote_average, popularity: item.popularity, genreIds: item.genre_ids,
            });
          }
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.warn(`All-time movies failed: ${prov.name} page ${page}:`, err.message);
      }
    }

    // Fetch popular shows for this provider
    for (let page = 1; page <= 3 && shows.length < 40; page++) {
      try {
        const data = await tmdbFetch('/discover/tv', {
          with_watch_providers: String(prov.id),
          watch_region: 'US',
          sort_by: 'popularity.desc',
          page: String(page),
        });
        for (const item of (data.results || [])) {
          if (!seenShows.has(item.id) && shows.length < 40) {
            seenShows.add(item.id);
            shows.push({
              tmdbId: item.id, mediaType: 'tv', title: item.name,
              year: (item.first_air_date || '').split('-')[0], overview: item.overview,
              posterPath: item.poster_path, backdropPath: item.backdrop_path,
              rating: item.vote_average, popularity: item.popularity, genreIds: item.genre_ids,
            });
          }
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.warn(`All-time shows failed: ${prov.name} page ${page}:`, err.message);
      }
    }

    results[key] = { ...prov, key, movies, shows };
    console.log(`${prov.name} (all-time): ${movies.length} movies, ${shows.length} shows`);
  }

  allTimeCache = { data: results, updatedAt: Date.now() };
  return results;
}

async function fetchDetail(mediaType, tmdbId) {
  const data = await tmdbFetch(`/${mediaType}/${tmdbId}`, {
    append_to_response: 'credits,external_ids,videos',
  });

  return {
    tmdbId: data.id,
    mediaType,
    title: data.title || data.name,
    year: (data.release_date || data.first_air_date || '').split('-')[0],
    overview: data.overview,
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    rating: data.vote_average,
    runtime: data.runtime || (data.episode_run_time && data.episode_run_time[0]),
    genres: (data.genres || []).map(g => g.name),
    status: data.status,
    tagline: data.tagline,
    tvdbId: data.external_ids?.tvdb_id || null,
    imdbId: data.external_ids?.imdb_id || null,
    cast: (data.credits?.cast || []).slice(0, 10).map(c => ({
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
    })),
    trailerKey: (data.videos?.results || [])
      .find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key || null,
    numberOfSeasons: data.number_of_seasons || null,
  };
}

function getProviders() { return PROVIDERS; }

module.exports = { fetchTrending, fetchAllTime, fetchDetail, tmdbFetch, getProviders };
