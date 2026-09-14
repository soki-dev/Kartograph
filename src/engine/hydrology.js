const { mulberry32, hashSeed } = require('./noiseGenerator');

function neighborOffsets() {
  return [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];
}

/**
 * Erzeugt Flüsse per Steepest-Descent von feuchten Hochpunkten zur Küste
 * (bzw. bis kein tieferer Nachbar mehr existiert). Liefert eine Liste von
 * Polylinien in Rasterkoordinaten, geeignet zum Rendern als Vektorpfad und
 * zum späteren manuellen Andocken weiterer, handgezeichneter Flussabschnitte.
 */
function generateRivers({ heightmap, moisture, width, height, seaLevel = 0.4, riverCount = 12, seed = 0 }) {
  const rng = mulberry32(hashSeed(seed) ^ 0x5bd1e995);
  const offsets = neighborOffsets();
  const at = (x, y) => heightmap[y * width + x];

  // Quellpunkte: Land, ausreichend hoch, ausreichend feucht.
  const candidates = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const h = heightmap[idx];
      const m = moisture[idx];
      if (h > seaLevel + 0.25 && m > 0.45) {
        candidates.push({ x, y, score: h * 0.6 + m * 0.4 + rng() * 0.05 });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const rivers = [];
  const usedSources = new Set();
  const minSourceSpacing = Math.max(3, Math.floor(Math.min(width, height) / 20));

  for (const candidate of candidates) {
    if (rivers.length >= riverCount) break;

    let tooClose = false;
    for (const key of usedSources) {
      const [ux, uy] = key.split(',').map(Number);
      if (Math.abs(ux - candidate.x) < minSourceSpacing && Math.abs(uy - candidate.y) < minSourceSpacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const path = traceRiver(candidate.x, candidate.y);
    if (path.length > 4) {
      rivers.push(path);
      usedSources.add(`${candidate.x},${candidate.y}`);
    }
  }

  return rivers;

  function traceRiver(startX, startY) {
    const path = [[startX, startY]];
    let x = startX;
    let y = startY;
    const visited = new Set([`${x},${y}`]);
    const maxSteps = width + height;

    for (let step = 0; step < maxSteps; step++) {
      if (at(x, y) < seaLevel) break; // Küste erreicht.

      let bestX = x;
      let bestY = y;
      let bestHeight = at(x, y);

      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        const nh = at(nx, ny);
        if (nh < bestHeight) {
          bestHeight = nh;
          bestX = nx;
          bestY = ny;
        }
      }

      if (bestX === x && bestY === y) break; // Lokale Senke, kein tieferer Nachbar -> Ende (kleiner See).

      x = bestX;
      y = bestY;
      visited.add(`${x},${y}`);
      path.push([x, y]);
    }

    return path;
  }
}

module.exports = { generateRivers };
