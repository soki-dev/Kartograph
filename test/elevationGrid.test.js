const test = require('node:test');
const assert = require('node:assert/strict');
const { resampleGrid, normalizeElevation } = require('../src/engine/geodata/elevationGrid');

test('resampleGrid erhaelt die Eckwerte eines 2x2-Rasters beim Hochskalieren', () => {
  // Raster:
  // 0  10
  // 20 30
  const values = [0, 10, 20, 30];
  const out = resampleGrid(values, 2, 2, 3, 3);

  assert.equal(out[0], 0); // oben links
  assert.equal(out[2], 10); // oben rechts
  assert.equal(out[6], 20); // unten links
  assert.equal(out[8], 30); // unten rechts
  assert.equal(out[4], 15); // Mitte = Durchschnitt aller vier Ecken
});

test('resampleGrid liefert bei identischer Ziel- und Quellgroesse dieselben Werte', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out = resampleGrid(values, 3, 3, 3, 3);
  for (let i = 0; i < values.length; i++) {
    assert.ok(Math.abs(out[i] - values[i]) < 1e-9);
  }
});

test('normalizeElevation normalisiert auf [0,1] und berechnet den Meeresspiegel korrekt', () => {
  const values = [-100, 0, 400, 900]; // min=-100, max=900, range=1000
  const { heightmap, seaLevel, min, max } = normalizeElevation(values);

  assert.equal(min, -100);
  assert.equal(max, 900);
  assert.ok(Math.abs(heightmap[0] - 0) < 1e-9);
  assert.ok(Math.abs(heightmap[3] - 1) < 1e-9);
  assert.ok(Math.abs(seaLevel - 0.1) < 1e-9); // (0 - (-100)) / 1000 = 0.1

  for (const v of heightmap) {
    assert.ok(v >= 0 && v <= 1);
  }
});

test('normalizeElevation geht mit konstantem Raster um (keine Division durch 0)', () => {
  const { heightmap, seaLevel } = normalizeElevation([50, 50, 50]);
  assert.ok(heightmap.every((v) => v === 0));
  assert.ok(Number.isFinite(seaLevel));
});
