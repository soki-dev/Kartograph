const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyBiomes, BIOME_BY_KEY } = require('../src/engine/biomeClassifier');

test('Zellen unterhalb des Meeresspiegels werden als Ozean klassifiziert', () => {
  const { biomes } = classifyBiomes({
    heightmap: [0.1, 0.9],
    moisture: [0.5, 0.5],
    width: 2,
    height: 1,
    seaLevel: 0.4
  });
  assert.equal(biomes[0], BIOME_BY_KEY.ocean.id);
});

test('sehr hohe Zellen werden als Schnee klassifiziert', () => {
  const { biomes } = classifyBiomes({
    heightmap: [0.98],
    moisture: [0.5],
    width: 1,
    height: 1,
    seaLevel: 0.4
  });
  assert.equal(biomes[0], BIOME_BY_KEY.snow.id);
});

test('trockenes Flachland wird als Wüste klassifiziert', () => {
  const { biomes } = classifyBiomes({
    heightmap: [0.5],
    moisture: [0.1],
    width: 1,
    height: 1,
    seaLevel: 0.4
  });
  assert.equal(biomes[0], BIOME_BY_KEY.desert.id);
});

test('feuchtes Flachland wird als Sumpf klassifiziert', () => {
  const { biomes } = classifyBiomes({
    heightmap: [0.5],
    moisture: [0.9],
    width: 1,
    height: 1,
    seaLevel: 0.4
  });
  assert.equal(biomes[0], BIOME_BY_KEY.swamp.id);
});
