const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { saveProject, loadProject } = require('../src/engine/mapProject');

test('.kmap Save/Load-Rundtrip erhält alle Kartendaten', async () => {
  const project = {
    width: 4,
    height: 4,
    seed: 'roundtrip-seed',
    seaLevel: 0.4,
    mode: 'generated',
    stylePreset: 'fantasy',
    layers: [{ key: 'terrain', visible: true, opacity: 1 }],
    rivers: [[[0, 0], [1, 1], [2, 2]]],
    roads: [{ points: [[0, 3], [3, 3]], source: 'osm' }],
    buildings: [{ points: [[1, 1], [1, 2], [2, 2], [2, 1]] }],
    places: [{ x: 2, y: 3, name: 'Testdorf' }],
    regions: [{ id: 'r1', name: 'Testreich', color: '#ff0000', points: [[0, 0], [3, 0], [3, 3], [0, 3]] }],
    scale: { metersPerCell: 1234 },
    symbols: [{ id: 's1', type: 'mountain', x: 2, y: 2, rotation: 0, scale: 1 }],
    labels: [{ id: 'l1', text: 'Testgebirge', x: 2, y: 1, fontSize: 14 }],
    heightmap: Array.from({ length: 16 }, (_, i) => i / 15),
    biomes: Array.from({ length: 16 }, (_, i) => i % 9),
    moisture: Array.from({ length: 16 }, (_, i) => (15 - i) / 15)
  };

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kartograph-test-'));
  const filePath = path.join(tmpDir, 'test.kmap');

  try {
    await saveProject(filePath, project);
    const loaded = await loadProject(filePath);

    assert.equal(loaded.width, project.width);
    assert.equal(loaded.height, project.height);
    assert.equal(loaded.seed, project.seed);
    assert.equal(loaded.mode, project.mode);
    assert.deepEqual(loaded.layers, project.layers);
    assert.deepEqual(loaded.rivers, project.rivers);
    assert.deepEqual(loaded.roads, project.roads);
    assert.deepEqual(loaded.buildings, project.buildings);
    assert.deepEqual(loaded.places, project.places);
    assert.deepEqual(loaded.regions, project.regions);
    assert.deepEqual(loaded.scale, project.scale);
    assert.deepEqual(loaded.symbols, project.symbols);
    assert.deepEqual(loaded.labels, project.labels);

    for (let i = 0; i < project.heightmap.length; i++) {
      assert.ok(Math.abs(loaded.heightmap[i] - project.heightmap[i]) < 1e-6);
    }
    assert.deepEqual(loaded.biomes, project.biomes);
    for (let i = 0; i < project.moisture.length; i++) {
      assert.ok(Math.abs(loaded.moisture[i] - project.moisture[i]) < 1e-6);
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
