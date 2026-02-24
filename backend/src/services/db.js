const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = path.join(DATA_DIR, 'popularr.db');
const RETENTION_DAYS = 28;

let db = null;

function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS trending_items (
      tmdb_id       INTEGER NOT NULL,
      media_type    TEXT NOT NULL,
      provider      TEXT NOT NULL,
      title         TEXT,
      year          TEXT,
      overview      TEXT,
      poster_path   TEXT,
      backdrop_path TEXT,
      rating        REAL,
      popularity    REAL,
      genre_ids     TEXT,
      first_seen    TEXT NOT NULL,
      last_seen     TEXT NOT NULL,
      PRIMARY KEY (tmdb_id, media_type, provider)
    );
  `);
  return db;
}

function mergeTrending(results) {
  const d = getDb();
  const today = new Date().toISOString().split('T')[0];

  const upsert = d.prepare(`
    INSERT INTO trending_items (tmdb_id, media_type, provider, title, year, overview, poster_path, backdrop_path, rating, popularity, genre_ids, first_seen, last_seen)
    VALUES (@tmdbId, @mediaType, @provider, @title, @year, @overview, @posterPath, @backdropPath, @rating, @popularity, @genreIds, @today, @today)
    ON CONFLICT (tmdb_id, media_type, provider) DO UPDATE SET
      title = @title,
      year = @year,
      overview = @overview,
      poster_path = @posterPath,
      backdrop_path = @backdropPath,
      rating = @rating,
      popularity = @popularity,
      genre_ids = @genreIds,
      last_seen = @today
  `);

  const insertMany = d.transaction((providerKey, items) => {
    for (const item of items) {
      upsert.run({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        provider: providerKey,
        title: item.title,
        year: item.year,
        overview: item.overview || '',
        posterPath: item.posterPath || '',
        backdropPath: item.backdropPath || '',
        rating: item.rating || 0,
        popularity: item.popularity || 0,
        genreIds: JSON.stringify(item.genreIds || []),
        today,
      });
    }
  });

  for (const [providerKey, prov] of Object.entries(results)) {
    const allItems = [...(prov.movies || []), ...(prov.shows || [])];
    if (allItems.length > 0) {
      insertMany(providerKey, allItems);
    }
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  d.prepare('DELETE FROM trending_items WHERE last_seen < ?').run(cutoff);
}

function getCumulativeTrending(providers) {
  const d = getDb();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const results = {};
  for (const [key, prov] of Object.entries(providers)) {
    const rows = d.prepare(`
      SELECT * FROM trending_items
      WHERE provider = ? AND last_seen >= ?
      ORDER BY
        CASE WHEN last_seen = ? THEN 0 ELSE 1 END,
        popularity DESC
    `).all(key, cutoff, today);

    const movies = [];
    const shows = [];
    for (const row of rows) {
      const item = {
        tmdbId: row.tmdb_id,
        mediaType: row.media_type,
        title: row.title,
        year: row.year,
        overview: row.overview,
        posterPath: row.poster_path || null,
        backdropPath: row.backdrop_path || null,
        rating: row.rating,
        popularity: row.popularity,
        genreIds: JSON.parse(row.genre_ids || '[]'),
      };
      if (row.media_type === 'movie' && movies.length < 40) {
        movies.push(item);
      } else if (row.media_type === 'tv' && shows.length < 40) {
        shows.push(item);
      }
    }
    results[key] = { ...prov, key, movies, shows };
  }
  return results;
}

module.exports = { getDb, mergeTrending, getCumulativeTrending };
