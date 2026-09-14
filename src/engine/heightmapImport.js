const fs = require('fs');
const { PNG } = require('pngjs');

/**
 * Lädt ein Graustufen-PNG als Heightmap. Dient als v1-Einstieg für "echte
 * Geodaten": ein aus einer echten DEM-Quelle exportiertes Höhenbild kann so
 * genauso importiert werden wie ein von Hand gemaltes Höhenbild – die Karte
 * arbeitet danach mit derselben Heightmap-Pipeline wie bei prozeduraler
 * Generierung (siehe mapProject.js / noiseGenerator.js).
 */
function loadHeightmapImage(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on('error', reject)
      .on('parsed', function onParsed() {
        const { width, height, data } = this;
        const heightmap = new Float32Array(width * height);

        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < width * height; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
          heightmap[i] = luminance;
          if (luminance < min) min = luminance;
          if (luminance > max) max = luminance;
        }

        const range = max - min || 1;
        for (let i = 0; i < heightmap.length; i++) {
          heightmap[i] = (heightmap[i] - min) / range;
        }

        resolve({ width, height, heightmap: Array.from(heightmap) });
      });
  });
}

module.exports = { loadHeightmapImage };
