import type { Station, StationsResponse } from "../src/types";

const SWITZERLAND: L.LatLngTuple = [46.8, 8.23];
const NEAREST_COUNT = 10;

const map = L.map("map").setView(SWITZERLAND, 8);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const cluster = L.markerClusterGroup({ showCoverageOnHover: false });
map.addLayer(cluster);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $("status");
const nearestSection = $("nearest");
const nearestTitle = $("nearest-title");
const nearestList = $<HTMLOListElement>("nearest-list");
const searchForm = $<HTMLFormElement>("search");
const searchInput = $<HTMLInputElement>("search-input");
const locateBtn = $<HTMLButtonElement>("locate");

let stations: Station[] = [];
const markers = new Map<string, L.Marker>();
let originMarker: L.CircleMarker | null = null;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function title(s: Station): string {
  return s.name ?? s.brand ?? s.operator ?? "LPG station";
}

function addressLine(s: Station): string {
  const { street, housenumber, postcode, city } = s.address;
  const line1 = [street, housenumber].filter(Boolean).join(" ");
  const line2 = [postcode, city].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

function popupHtml(s: Station): string {
  const parts = [`<h3>${escapeHtml(title(s))}</h3>`];
  if (s.brand && s.brand !== title(s)) parts.push(`<p>${escapeHtml(s.brand)}</p>`);
  const addr = addressLine(s);
  if (addr) parts.push(`<p>${escapeHtml(addr)}</p>`);
  if (s.openingHours) parts.push(`<p>🕒 ${escapeHtml(s.openingHours)}</p>`);
  if (s.phone) parts.push(`<p>📞 <a href="tel:${escapeHtml(s.phone)}">${escapeHtml(s.phone)}</a></p>`);
  if (s.website && /^https?:\/\//.test(s.website)) {
    parts.push(`<p>🌐 <a href="${escapeHtml(s.website)}" target="_blank" rel="noopener">Website</a></p>`);
  }

  const dest = `${s.lat},${s.lon}`;
  parts.push(`<div class="nav">
    <a href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener">Google Maps</a>
    <a href="https://maps.apple.com/?daddr=${dest}" target="_blank" rel="noopener">Apple Maps</a>
    <a href="https://www.openstreetmap.org/${s.id}" target="_blank" rel="noopener">OSM</a>
  </div>`);
  return `<div class="popup">${parts.join("")}</div>`;
}

/** Great-circle distance in km. */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function focusStation(s: Station): void {
  const marker = markers.get(s.id);
  if (!marker) return;
  cluster.zoomToShowLayer(marker, () => marker.openPopup());
}

function showNearest(lat: number, lon: number, label: string): void {
  originMarker?.remove();
  originMarker = L.circleMarker([lat, lon], {
    radius: 9,
    color: "#ffffff",
    weight: 3,
    fillColor: "#2563eb",
    fillOpacity: 1,
  })
    .bindTooltip(label)
    .addTo(map);

  const nearest = stations
    .map((s) => ({ s, km: haversine(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, NEAREST_COUNT);

  nearestTitle.textContent = `Closest to ${label}`;
  nearestList.replaceChildren(
    ...nearest.map(({ s, km }) => {
      const li = document.createElement("li");
      const addr = addressLine(s);
      li.innerHTML = `<span>${escapeHtml(title(s))}${addr ? `<span class="sub">${escapeHtml(addr)}</span>` : ""}</span>
        <span class="dist">${km < 10 ? km.toFixed(1) : Math.round(km)} km</span>`;
      li.addEventListener("click", () => focusStation(s));
      return li;
    }),
  );
  nearestSection.hidden = false;

  // Fit the origin and the closest few stations in view.
  const bounds = L.latLngBounds([[lat, lon]]);
  nearest.slice(0, 3).forEach(({ s }) => bounds.extend([s.lat, s.lon]));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
}

async function loadStations(): Promise<void> {
  try {
    const res = await fetch("/api/stations");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as StationsResponse;
    stations = data.stations;

    for (const s of stations) {
      const marker = L.marker([s.lat, s.lon], { title: title(s) }).bindPopup(popupHtml(s));
      markers.set(s.id, marker);
    }
    cluster.addLayers([...markers.values()]);

    const updated = new Date(data.updatedAt).toLocaleString();
    statusEl.textContent = `${data.count} stations · updated ${updated}${data.stale ? " (cached, refresh failed)" : ""}`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Could not load stations. Please try again later.";
  }
}

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;

  const btn = searchForm.querySelector("button")!;
  btn.disabled = true;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ch&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const results = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (results.length === 0) {
      statusEl.textContent = `No place found for "${q}".`;
      return;
    }
    const { lat, lon, display_name } = results[0];
    showNearest(Number(lat), Number(lon), display_name.split(",")[0]);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Search failed. Please try again.";
  } finally {
    btn.disabled = false;
  }
});

locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    statusEl.textContent = "Geolocation is not supported by your browser.";
    return;
  }
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locateBtn.disabled = false;
      showNearest(pos.coords.latitude, pos.coords.longitude, "your location");
    },
    (err) => {
      locateBtn.disabled = false;
      statusEl.textContent = `Could not get your location: ${err.message}`;
    },
    { enableHighAccuracy: true, timeout: 10_000 },
  );
});

loadStations();
