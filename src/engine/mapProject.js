const fs = require('fs/promises');
const JSZip = require('jszip');

const MANIFEST_VERSION = 1;

/**
 * Speichert ein Kartenprojekt als .kmap-Container (ZIP). Raster (Heightmap,
 * Biome, Feuchtigkeit) liegen als kompakte Binärdaten vor, alles andere
 * (Metadaten, Flüsse, Symbole, Beschriftungen, Ebenen-Konfiguration) als
 * lesbares JSON im Manifest.
 */
async function saveProject(filePath, project) {
  const zip = new JSZip();

  const manifest = {
    version: MANIFEST_VERSION,
    width: project.width,
    height: project.height,
    seed: project.seed,
    seaLevel: project.seaLevel,
    mode: project.mode,
    stylePreset: project.stylePreset,
    layers: project.layers || [],
    rivers: project.rivers || [],
    symbols: project.symbols || [],
    labels: project.labels || []
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('heightmap.raw', Buffer.from(Float32Array.from(project.heightmap).buffer));
  zip.file('biomes.raw', Buffer.from(Uint8Array.from(project.biomes).buffer));
  if (project.moisture) {
    zip.file('moisture.raw', Buffer.from(Float32Array.from(project.moisture).buffer));
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(filePath, buffer);
}

async function loadProject(filePath) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const manifestRaw = await zip.file('manifest.json').async('string');
  const manifest = JSON.parse(manifestRaw);

  const heightmapBuffer = await zip.file('heightmap.raw').async('nodebuffer');
  const biomesBuffer = await zip.file('biomes.raw').async('nodebuffer');
  const moistureEntry = zip.file('moisture.raw');
  const moistureBuffer = moistureEntry ? await moistureEntry.async('nodebuffer') : null;

  return {
    ...manifest,
    heightmap: Array.from(new Float32Array(heightmapBuffer.buffer, heightmapBuffer.byteOffset, heightmapBuffer.length / 4)),
    biomes: Array.from(new Uint8Array(biomesBuffer.buffer, biomesBuffer.byteOffset, biomesBuffer.length)),
    moisture: moistureBuffer
      ? Array.from(new Float32Array(moistureBuffer.buffer, moistureBuffer.byteOffset, moistureBuffer.length / 4))
      : null
  };
}

module.exports = { saveProject, loadProject, MANIFEST_VERSION };
