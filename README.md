# Popularr

Browse what's trending across 8 major streaming services — from your Apple TV or any web browser — and add titles to your Sonarr/Radarr library with one tap.

**Popularr** is a self-hosted media discovery platform: a lightweight Docker backend with a built-in web interface, paired with an optional native tvOS app. It pulls trending content from TMDB, shows it in a Netflix-style UI grouped by streaming service, and lets you send titles straight to your *arr stack.

## How It Works

1. **Backend** fetches trending content from TMDB for Netflix, Prime Video, Disney+, Max, Apple TV+, Hulu, Peacock, and Paramount+
2. **Web UI** or **tvOS app** displays content in horizontal rows by service with poster cards
3. Tap a title to see details — cast, rating, overview, trailer
4. One tap to add to **Radarr** (movies) or **Sonarr** (TV shows)
5. Status badges show what's already in your library

## Quick Start

### 1. Deploy the Backend

```yaml
# docker-compose.yaml
services:
  popularr:
    image: popularr/popularr:latest
    container_name: popularr
    ports:
      - "7879:7879"
    environment:
      - TMDB_API_KEY=your_tmdb_api_key
      - SONARR_URL=http://sonarr:8989
      - SONARR_API_KEY=your_sonarr_api_key
      - RADARR_URL=http://radarr:7878
      - RADARR_API_KEY=your_radarr_api_key
      - WEB_PASSWORD=your_password          # optional
    volumes:
      - popularr-data:/data
    restart: unless-stopped

volumes:
  popularr-data:
```

```bash
docker compose up -d
```

The backend generates an API key on first run. Find it in the logs:

```bash
docker logs popularr 2>&1 | grep "API Key"
```

### 2. Open the Web Interface

Visit `http://your-server:7879` in any browser. If you set `WEB_PASSWORD`, you'll be prompted to log in.

### 3. (Optional) Install the tvOS App

Download **Popularr** from the App Store on your Apple TV, enter your server URL and the pairing code shown at `http://your-server:7879/pair`.

### 4. Get a TMDB API Key

Popularr uses [TMDB](https://www.themoviedb.org/) for trending data. Get a free API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TMDB_API_KEY` | Yes | — | Your TMDB API key |
| `SONARR_URL` | Yes | — | Sonarr base URL (e.g., `http://sonarr:8989`) |
| `SONARR_API_KEY` | Yes | — | Sonarr API key |
| `RADARR_URL` | Yes | — | Radarr base URL (e.g., `http://radarr:7878`) |
| `RADARR_API_KEY` | Yes | — | Radarr API key |
| `WEB_PASSWORD` | No | — | Password for the web interface (open access if unset) |
| `PORT` | No | `7879` | Backend port |
| `DATA_DIR` | No | `/data` | Persistent data directory |

## API Reference

All endpoints except `/health` and `/api/image/*` require a Bearer token:

```
Authorization: Bearer <api-key>
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/auth` | Validate API key |
| `GET` | `/api/trending` | Trending content across all services |
| `GET` | `/api/trending/:service` | Trending for one service |
| `GET` | `/api/detail/:mediaType/:tmdbId` | Detailed metadata for a title |
| `GET` | `/api/status` | Library status from Sonarr/Radarr |
| `POST` | `/api/add` | Add a title to Sonarr or Radarr |
| `GET` | `/api/config` | Connection status and provider info |
| `GET` | `/api/config/profiles` | Quality profiles and root folders |
| `GET` | `/api/image/:type/:path` | Proxied TMDB image (no auth) |

### Streaming Services

| Service | Key |
|---------|-----|
| Netflix | `netflix` |
| Prime Video | `amazon` |
| Disney+ | `disney` |
| Max | `hbo` |
| Apple TV+ | `apple` |
| Hulu | `hulu` |
| Peacock | `peacock` |
| Paramount+ | `paramount` |

## Tech Stack

- **Backend:** Node.js 18, Express 4.x
- **tvOS App:** Swift, SwiftUI, tvOS 17+
- **Data Source:** TMDB API
- **Integration:** Sonarr v3/v4, Radarr v3

## Requirements

- Docker (for the backend)
- TMDB API key (free)
- Sonarr and/or Radarr instance
- Apple TV with tvOS 17+

## Building from Source

```bash
cd backend
npm install
TMDB_API_KEY=... SONARR_URL=... SONARR_API_KEY=... RADARR_URL=... RADARR_API_KEY=... npm run dev
```

## Attribution

This product uses the [TMDB API](https://www.themoviedb.org/) but is not endorsed or certified by TMDB.

## License

[MIT](LICENSE)
