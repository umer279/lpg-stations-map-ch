# LPG Stations Map – Switzerland

An interactive map of LPG (GPL / autogas) filling stations in Switzerland, built on OpenStreetMap data.

- All Swiss stations tagged `amenity=fuel` + `fuel:lpg=yes`, fetched from the [Overpass API](https://overpass-api.de/)
- Clustered markers (Leaflet + Leaflet.markercluster) with name, address, opening hours, phone and website
- Search a town or address (via [Nominatim](https://nominatim.org/)) to list the closest stations
- "Stations near me" using browser geolocation
- Results cached for 24 hours, with a fallback to the last good data if Overpass is unavailable

## Tech stack

- **Frontend:** TypeScript + Leaflet, bundled with esbuild (`public/app.ts` → `public/app.js`)
- **Backend:** Express (local) / Vercel Serverless Function (production), both using the same caching and Overpass code in `src/`

## Project structure

```
api/stations.ts     Vercel serverless function for GET /api/stations
src/server.ts       Express server for local development / self-hosting
src/cache.ts        24h cache (memory + disk) with stale fallback
src/overpass.ts     Overpass query, retries across mirrors, normalisation
src/types.ts        Shared types (also used by the frontend)
public/             Static frontend (index.html, styles.css, app.ts)
vercel.json         Vercel build / function config
```

## Running locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev          # Express API + esbuild watcher on http://localhost:3000
```

Production build without Vercel:

```bash
npm run build
npm start            # serves on $PORT (default 3000)
```

Type-check everything with `npm run typecheck`.

## Deploying to Vercel

No environment variables are needed.

1. Import this repository in the [Vercel dashboard](https://vercel.com/new) and keep the settings from `vercel.json` (or run `npx vercel` from the project root).
2. Vercel runs `npm run web:build`, serves `public/` as static files, and deploys `api/stations.ts` as a serverless function.

Caching on Vercel: function instances are short-lived, so the API response is sent with `Cache-Control: s-maxage=86400, stale-while-revalidate=604800` and Vercel's CDN keeps it for 24 hours. `GET /api/stations?refresh=1` bypasses the cache and forces a new Overpass query.

## Data & attribution

Station data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL). If a station is missing or wrong, you can fix it on OpenStreetMap and the map will pick up the change on the next refresh.
