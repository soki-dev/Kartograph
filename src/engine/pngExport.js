const fs = require('fs/promises');

/**
 * Schreibt einen bereits im Renderer (Canvas.toBlob/toDataURL) erzeugten
 * PNG-Buffer auf die Platte. Die eigentliche Rasterung übernimmt PixiJS im
 * Renderer-Prozess, main.js kümmert sich nur um den Dateidialog + I/O.
 */
async function exportMapPng(filePath, pngBuffer) {
  const buffer = Buffer.isBuffer(pngBuffer) ? pngBuffer : Buffer.from(pngBuffer);
  await fs.writeFile(filePath, buffer);
}

module.exports = { exportMapPng };
