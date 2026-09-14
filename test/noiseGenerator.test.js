const test = require('node:test');
const assert = require('node:assert/strict');
const { generateHeightmap, generateMoistureMap } = require('../src/engine/noiseGenerator');

test('generateHeightmap ist deterministisch bei gleichem Seed', () => {
  const options = { width: 32, height: 32, seed: 'kartograph-test' };
  const a = generateHeightmap(options);
  const b = generateHeightmap(options);
  assert.deepEqual(Array.from(a), Array.from(b));
});

test('generateHeightmap liefert Werte im Bereich [0, 1]', () => {
  const heightmap = generateHeightmap({ width: 24, height: 24, seed: 42 });
  for (const value of heightmap) {
    assert.ok(value >= 0 && value <= 1, `Wert außerhalb [0,1]: ${value}`);
  }
});

test('unterschiedliche Seeds erzeugen unterschiedliche Heightmaps', () => {
  const a = generateHeightmap({ width: 16, height: 16, seed: 1 });
  const b = generateHeightmap({ width: 16, height: 16, seed: 2 });
  assert.notDeepEqual(Array.from(a), Array.from(b));
});

test('generateMoistureMap ist deterministisch und im Bereich [0, 1]', () => {
  const options = { width: 20, height: 20, seed: 'moisture-seed' };
  const a = generateMoistureMap(options);
  const b = generateMoistureMap(options);
  assert.deepEqual(Array.from(a), Array.from(b));
  for (const value of a) {
    assert.ok(value >= 0 && value <= 1);
  }
});
