const test = require('node:test');
const assert = require('node:assert/strict');
const { generateRivers } = require('../src/engine/hydrology');

// Baut eine Heightmap, die gleichmäßig von Norden (hoch) nach Süden (Meer)
// abfällt, damit Flüsse einen eindeutigen, vorhersagbaren Weg zur Küste haben.
function buildSlopeHeightmap(width, height) {
  const heightmap = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      heightmap[y * width + x] = 1 - y / (height - 1);
    }
  }
  return heightmap;
}

test('generierte Flüsse erreichen die Küste (Höhe unterhalb des Meeresspiegels)', () => {
  const width = 20;
  const height = 20;
  const seaLevel = 0.4;
  const heightmap = buildSlopeHeightmap(width, height);
  const moisture = new Float32Array(width * height).fill(0.9);

  const rivers = generateRivers({ heightmap, moisture, width, height, seaLevel, riverCount: 5, seed: 7 });

  assert.ok(rivers.length > 0, 'es sollte mindestens ein Fluss generiert werden');

  for (const river of rivers) {
    const [lastX, lastY] = river[river.length - 1];
    const lastHeight = heightmap[lastY * width + lastX];
    assert.ok(lastHeight < seaLevel, `Fluss sollte an der Küste enden, letzte Höhe war ${lastHeight}`);
  }
});

test('generateRivers ist deterministisch bei gleichem Seed', () => {
  const width = 16;
  const height = 16;
  const heightmap = buildSlopeHeightmap(width, height);
  const moisture = new Float32Array(width * height).fill(0.9);
  const options = { heightmap, moisture, width, height, seaLevel: 0.4, riverCount: 4, seed: 'fixed-seed' };

  const a = generateRivers(options);
  const b = generateRivers(options);
  assert.deepEqual(a, b);
});
