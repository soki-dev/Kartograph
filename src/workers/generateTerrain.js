const { parentPort, workerData } = require('worker_threads');
const { generateHeightmap, generateMoistureMap } = require('../engine/noiseGenerator');
const { classifyBiomes } = require('../engine/biomeClassifier');
const { generateRivers } = require('../engine/hydrology');

function report(payload) {
  parentPort.postMessage({ type: 'progress', payload });
}

function run() {
  const {
    seed,
    seaLevel = 0.4,
    octaves = 6,
    persistence = 0.5,
    scale = 1,
    islandFalloff = 0.35,
    riverCount = 12,
    importedHeightmap = null
  } = workerData;

  // Hybrid-Kern: Ist eine importierte Heightmap vorhanden (z. B. aus einem
  // echten Höhendaten-Bild), wird deren Auflösung übernommen und der
  // Noise-Generierungsschritt übersprungen – Feuchtigkeit, Biome und Flüsse
  // laufen danach über exakt dieselbe Pipeline wie bei prozeduraler Erzeugung.
  const width = importedHeightmap ? importedHeightmap.width : workerData.width;
  const height = importedHeightmap ? importedHeightmap.height : workerData.height;

  report({ step: 'heightmap', percent: 10 });
  const heightmap = importedHeightmap
    ? Float32Array.from(importedHeightmap.heightmap)
    : generateHeightmap({ width, height, seed, octaves, persistence, scale, islandFalloff });

  report({ step: 'moisture', percent: 40 });
  const moisture = generateMoistureMap({ width, height, seed, scale });

  report({ step: 'biomes', percent: 65 });
  const { biomes } = classifyBiomes({ heightmap, moisture, width, height, seaLevel });

  report({ step: 'rivers', percent: 85 });
  const rivers = generateRivers({ heightmap, moisture, width, height, seaLevel, riverCount, seed });

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
      rivers
    }
  });
}

run();
