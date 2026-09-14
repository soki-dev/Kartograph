/**
 * Wandelt eine Overpass-API-Antwort (abgefragt mit "out geom;", sodass jedes
 * "way"-Element seine Knoten-Koordinaten direkt unter .geometry mitbringt,
 * ohne Node-IDs separat auflösen zu muessen) in die in Kartograph verwendeten
 * einfachen Vektorformen um: Straßen, Flüsse, Gebäude-Umrisse, Ortsnamen.
 *
 * @param {object} overpassResponse - Rohantwort der Overpass API.
 * @param {(lat: number, lon: number) => [number, number]} project - Projektionsfunktion (siehe projection.js).
 */
function parseOverpassResponse(overpassResponse, project) {
  const roads = [];
  const rivers = [];
  const buildings = [];
  const places = [];

  const elements = overpassResponse?.elements || [];

  for (const el of elements) {
    const tags = el.tags || {};

    if (el.type === 'node' && tags.place) {
      const [x, y] = project(el.lat, el.lon);
      places.push({ x, y, name: tags.name || tags['name:de'] || tags['name:en'] || '' });
      continue;
    }

    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length > 1) {
      const points = el.geometry
        .filter((p) => typeof p?.lat === 'number' && typeof p?.lon === 'number')
        .map((p) => project(p.lat, p.lon));
      if (points.length < 2) continue;

      if (tags.highway) {
        roads.push({ points, source: 'osm' });
      } else if (tags.waterway) {
        rivers.push(points);
      } else if (tags.building) {
        buildings.push({ points });
      }
    }
  }

  return { roads, rivers, buildings, places };
}

/**
 * Baut die Overpass-QL-Abfrage fuer eine Bounding-Box. "out geom;" liefert
 * die Koordinaten direkt am Way mit, siehe parseOverpassResponse.
 */
function buildOverpassQuery({ north, south, east, west }) {
  const bbox = `${south},${west},${north},${east}`;
  return `
    [out:json][timeout:25];
    (
      way["highway"](${bbox});
      way["waterway"](${bbox});
      way["building"](${bbox});
      node["place"](${bbox});
    );
    out geom;
  `.trim();
}

module.exports = { parseOverpassResponse, buildOverpassQuery };
