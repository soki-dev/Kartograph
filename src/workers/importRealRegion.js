const { parentPort, workerData } = require('worker_threads');
const { createProjection, metersPerCell } = require('../engine/geodata/projection');
const { buildOverpassQuery, parseOverpassResponse } = require('../engine/geodata/osmParser');
const { resampleGrid, normalizeElevation } = require('../engine/geodata/elevationGrid');
const { generateMoistureMap } = require('../engine/noiseGenerator');
const { classifyBiomes } = require('../engine/biomeClassifier');
const { generateRivers } = require('../engine/hydrology');

const ELEVATION_GRID_SIZE = 32;
const ELEVATION_BATCH_SIZE = 100;
const ELEVATION_TIMEOUT_MS = 12000;
const OVERPASS_TIMEOUT_MS = 30000;
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'Kartograph/0.1 (Kartografie-Desktop-App)';

function report(payload) {
  parentPort.postMessage({ type: 'progress', payload });
}

// Wichtig: das Timeout muss auch das Einlesen des Antwort-Bodys abdecken,
// nicht nur den Verbindungsaufbau – ein langsamer/überlasteter öffentlicher
// Server kann Header schnell schicken und dann beim Streamen des Bodys
// haengen bleiben. Daher wird res.json() hier INNERHALB des per AbortSignal
// begrenzten Fensters aufgerufen, nicht erst nach dem Zurückgeben von res.
async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Zwei kostenlose, kein-API-Key-Anbieter als Fallback-Kette: die frei
// gehosteten Instanzen sind gelegentlich langsam/nicht erreichbar (siehe
// Plan-Dokument), daher pro Batch Timeout + Retry + Anbieterwechsel statt
// eines potenziell endlos haengenden fetch()-Aufrufs.
async function fetchBatchOpenElevation(batch) {
  const data = await fetchJsonWithTimeout(
    'https://api.open-elevation.com/api/v1/lookup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, Accept: '*/*' },
      body: JSON.stringify({ locations: batch.map((p) => ({ latitude: p.lat, longitude: p.lon })) })
    },
    ELEVATION_TIMEOUT_MS
  );
  return data.results.map((r) => r.elevation);
}

async function fetchBatchOpenTopoData(batch) {
  const locations = batch.map((p) => `${p.lat},${p.lon}`).join('|');
  const data = await fetchJsonWithTimeout(
    `https://api.opentopodata.org/v1/srtm90m?locations=${encodeURIComponent(locations)}`,
    { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' } },
    ELEVATION_TIMEOUT_MS
  );
  return data.results.map((r) => r.elevation ?? 0);
}

async function fetchElevationBatch(batch) {
  const providers = [fetchBatchOpenElevation, fetchBatchOpenTopoData];
  let lastError;
  for (const provider of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await provider(batch);
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw new Error(
    `Höhendaten-Dienste aktuell nicht erreichbar (${lastError?.message || 'unbekannter Fehler'}). Bitte später erneut versuchen.`
  );
}

// Fragt ein ELEVATION_GRID_SIZE x ELEVATION_GRID_SIZE-Raster an echten
// Hoehendaten ueber die Bounding-Box ab (gebatcht).
async function fetchElevationGrid(bounds) {
  const { north, south, east, west } = bounds;
  const locations = [];
  for (let row = 0; row < ELEVATION_GRID_SIZE; row++) {
    const lat = north - (row / (ELEVATION_GRID_SIZE - 1)) * (north - south);
    for (let col = 0; col < ELEVATION_GRID_SIZE; col++) {
      const lon = west + (col / (ELEVATION_GRID_SIZE - 1)) * (east - west);
      locations.push({ lat, lon });
    }
  }

  const values = new Array(locations.length).fill(0);
  for (let i = 0; i < locations.length; i += ELEVATION_BATCH_SIZE) {
    const batch = locations.slice(i, i + ELEVATION_BATCH_SIZE);
    const elevations = await fetchElevationBatch(batch);
    elevations.forEach((v, idx) => {
      values[i + idx] = v;
    });
    report({ step: 'elevation', percent: 5 + Math.round((i / locations.length) * 35) });
  }

  return values;
}

async function fetchOsmData(bounds) {
  const query = buildOverpassQuery(bounds);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchJsonWithTimeout(
        OVERPASS_API,
        {
          method: 'POST',
          // overpass-api.de beantwortet Anfragen ohne User-Agent mit 406
          // Not Acceptable statt mit den eigentlichen Daten.
          headers: { 'Content-Type': 'text/plain', 'User-Agent': USER_AGENT, Accept: '*/*' },
          body: query
        },
        OVERPASS_TIMEOUT_MS
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`OSM-Abfrage (Overpass) fehlgeschlagen: ${lastError?.message || 'unbekannter Fehler'}`);
}

async function run() {
  const { bounds, width, height } = workerData;
  const seed = `${bounds.north.toFixed(4)},${bounds.west.toFixed(4)}`;

  report({ step: 'elevation', percent: 5 });
  const rawElevation = await fetchElevationGrid(bounds);
  const resampled = resampleGrid(rawElevation, ELEVATION_GRID_SIZE, ELEVATION_GRID_SIZE, width, height);
  const { heightmap, seaLevel } = normalizeElevation(resampled);

  report({ step: 'osm', percent: 45 });
  const overpassResponse = await fetchOsmData(bounds);
  const projection = createProjection({ ...bounds, width, height });
  const { roads, rivers: osmRivers, buildings, places } = parseOverpassResponse(overpassResponse, projection.toLocal);

  report({ step: 'biomes', percent: 75 });
  const moisture = generateMoistureMap({ width, height, seed });
  const { biomes } = classifyBiomes({ heightmap, moisture, width, height, seaLevel });

  report({ step: 'rivers', percent: 90 });
  // Echte Flüsse aus OSM bevorzugen; nur wenn OSM in dieser Region keine
  // liefert (z. B. sehr trockene Gegend), prozedural welche generieren.
  const rivers =
    osmRivers.length > 0 ? osmRivers : generateRivers({ heightmap, moisture, width, height, seaLevel, riverCount: 6, seed });

  report({ step: 'done', percent: 100 });

  parentPort.postMessage({
    type: 'done',
    payload: {
      width,
      height,
      seed,
      seaLevel,
      heightmap: Array.from(heightmap),
      moisture: Array.from(moisture),
      biomes,
      rivers,
      roads,
      buildings,
      places,
      scale: { metersPerCell: metersPerCell({ ...bounds, width, height }) },
      bounds
    }
  });
}

run().catch((err) => {
  parentPort.postMessage({ type: 'error', payload: { message: err.message } });
});
