const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjection, haversineDistance, metersPerCell } = require('../src/engine/geodata/projection');

const BOUNDS = { north: 50, south: 49, east: 9, west: 8, width: 512, height: 512 };

test('createProjection bildet die Ecken der Bounding-Box korrekt ab', () => {
  const { toLocal } = createProjection(BOUNDS);
  assert.deepEqual(toLocal(50, 8), [0, 0]);
  assert.deepEqual(toLocal(49, 9), [512, 512]);
});

test('toLatLon ist die Umkehrfunktion von toLocal', () => {
  const { toLocal, toLatLon } = createProjection(BOUNDS);
  const [x, y] = toLocal(49.3, 8.7);
  const back = toLatLon(x, y);
  assert.ok(Math.abs(back.lat - 49.3) < 1e-9);
  assert.ok(Math.abs(back.lon - 8.7) < 1e-9);
});

test('createProjection wirft bei ungueltiger Bounding-Box', () => {
  assert.throws(() => createProjection({ ...BOUNDS, north: 40 }));
  assert.throws(() => createProjection({ ...BOUNDS, east: 7 }));
});

test('haversineDistance liefert 0 fuer denselben Punkt', () => {
  assert.equal(haversineDistance(48, 8, 48, 8), 0);
});

test('haversineDistance: ein Breitengrad entspricht ungefaehr 111km', () => {
  const distance = haversineDistance(0, 0, 1, 0);
  assert.ok(Math.abs(distance - 111195) < 500, `war ${distance}`);
});

test('metersPerCell liefert einen plausiblen positiven Wert', () => {
  const value = metersPerCell(BOUNDS);
  assert.ok(value > 0);
  // ~111km Breite auf 512 Zellen -> grob 200m/Zelle
  assert.ok(value > 50 && value < 500, `war ${value}`);
});
