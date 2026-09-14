const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOverpassResponse, buildOverpassQuery } = require('../src/engine/geodata/osmParser');

const identityProject = (lat, lon) => [lon, lat];

test('buildOverpassQuery enthaelt die Bounding-Box', () => {
  const query = buildOverpassQuery({ north: 50, south: 49, east: 9, west: 8 });
  assert.ok(query.includes('49,8,50,9'));
  assert.ok(query.includes('highway'));
  assert.ok(query.includes('waterway'));
  assert.ok(query.includes('building'));
});

test('parseOverpassResponse kategorisiert Straßen, Flüsse, Gebäude und Orte', () => {
  const response = {
    elements: [
      {
        type: 'way',
        tags: { highway: 'primary' },
        geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }]
      },
      {
        type: 'way',
        tags: { waterway: 'river' },
        geometry: [{ lat: 3, lon: 3 }, { lat: 4, lon: 4 }]
      },
      {
        type: 'way',
        tags: { building: 'yes' },
        geometry: [{ lat: 5, lon: 5 }, { lat: 5, lon: 6 }, { lat: 6, lon: 6 }, { lat: 6, lon: 5 }]
      },
      {
        type: 'node',
        lat: 7,
        lon: 7,
        tags: { place: 'town', name: 'Testdorf' }
      },
      {
        // Way ohne relevante Tags soll ignoriert werden
        type: 'way',
        tags: { landuse: 'forest' },
        geometry: [{ lat: 8, lon: 8 }, { lat: 9, lon: 9 }]
      }
    ]
  };

  const result = parseOverpassResponse(response, identityProject);

  assert.equal(result.roads.length, 1);
  assert.equal(result.roads[0].source, 'osm');
  assert.deepEqual(result.roads[0].points, [[1, 1], [2, 2]]);

  assert.equal(result.rivers.length, 1);
  assert.deepEqual(result.rivers[0], [[3, 3], [4, 4]]);

  assert.equal(result.buildings.length, 1);
  assert.equal(result.buildings[0].points.length, 4);

  assert.equal(result.places.length, 1);
  assert.equal(result.places[0].name, 'Testdorf');
  assert.deepEqual([result.places[0].x, result.places[0].y], [7, 7]);
});

test('parseOverpassResponse ignoriert Ways mit weniger als 2 Punkten', () => {
  const response = {
    elements: [{ type: 'way', tags: { highway: 'path' }, geometry: [{ lat: 1, lon: 1 }] }]
  };
  const result = parseOverpassResponse(response, identityProject);
  assert.equal(result.roads.length, 0);
});

test('parseOverpassResponse geht mit leerer Antwort um', () => {
  const result = parseOverpassResponse({}, identityProject);
  assert.deepEqual(result, { roads: [], rivers: [], buildings: [], places: [] });
});
