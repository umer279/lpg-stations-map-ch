import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchStations } from "./overpass.js";
import type { Station, StationsResponse } from "./types.js";

// Vercel's filesystem is read-only apart from the temp dir.
const CACHE_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "lpg-stations.json")
  : path.resolve("data", "stations.json");
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  updatedAt: string;
  stations: Station[];
}

let memory: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

async function readDisk(): Promise<CacheEntry | null> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeDisk(entry: CacheEntry): Promise<void> {
  try {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(entry));
  } catch (err) {
    console.warn("Could not write station cache:", err instanceof Error ? err.message : err);
  }
}

async function refresh(): Promise<CacheEntry> {
  // Collapse concurrent refreshes into one Overpass request.
  inflight ??= (async () => {
    try {
      const stations = await fetchStations();
      const entry = { updatedAt: new Date().toISOString(), stations };
      await writeDisk(entry);
      memory = entry;
      return entry;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function toResponse(entry: CacheEntry, stale: boolean): StationsResponse {
  return {
    updatedAt: entry.updatedAt,
    stale,
    count: entry.stations.length,
    stations: entry.stations,
  };
}

export async function getStations(force = false): Promise<StationsResponse> {
  memory ??= await readDisk();

  const fresh =
    memory !== null && Date.now() - Date.parse(memory.updatedAt) < TTL_MS;
  if (memory && fresh && !force) return toResponse(memory, false);

  try {
    return toResponse(await refresh(), false);
  } catch (err) {
    // Overpass is down or rate-limiting us: fall back to whatever we have.
    if (memory) return toResponse(memory, true);
    throw err;
  }
}
