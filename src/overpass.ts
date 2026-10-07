import type { Station } from "./types.js";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** Overpass instances are often briefly overloaded, so cycle through them a few times. */
const ROUNDS = 3;
const RETRY_DELAY_MS = 5_000;

const QUERY = `
[out:json][timeout:60];
area["ISO3166-1"="CH"][admin_level=2]->.ch;
nwr["amenity"="fuel"]["fuel:lpg"="yes"](area.ch);
out center tags;
`;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function normalize(el: OverpassElement): Station | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return null;

  const t = el.tags ?? {};
  return {
    id: `${el.type}/${el.id}`,
    lat,
    lon,
    name: t.name,
    brand: t.brand,
    operator: t.operator,
    address: {
      street: t["addr:street"],
      housenumber: t["addr:housenumber"],
      postcode: t["addr:postcode"],
      city: t["addr:city"] ?? t["addr:place"],
    },
    openingHours: t.opening_hours,
    phone: t.phone ?? t["contact:phone"],
    website: t.website ?? t["contact:website"],
  };
}

async function query(url: string): Promise<Station[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "gpl-map/1.0 (LPG station map for Switzerland)",
    },
    body: new URLSearchParams({ data: QUERY }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);

  const json = (await res.json()) as { elements: OverpassElement[] };
  return json.elements
    .map(normalize)
    .filter((s): s is Station => s !== null);
}

export async function fetchStations(): Promise<Station[]> {
  let lastError: unknown;

  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * round));
    for (const url of ENDPOINTS) {
      try {
        return await query(url);
      } catch (err) {
        console.warn(`Overpass request failed (${url}):`, err instanceof Error ? err.message : err);
        lastError = err;
      }
    }
  }

  throw lastError;
}
