import { BIOMES } from '../../src/engine/biomeClassifier.js';

const BIOME_COLORS = BIOMES.map((b) => hexToRgb(b.color));

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Rendert Heightmap + Biome-Raster in ein stilisiertes RGBA-Bild: statt
 * flacher Biom-Farben wird pro Pixel eine einfache Relief-Schummerung
 * (Steigung gegen eine feste Lichtquelle) aufmultipliziert und Ozeanflächen
 * bekommen eine Tiefenschattierung. Das ist der optische Kern-Unterschied zu
 * einem rohen Heightmap-Viewer.
 */
export function renderTerrainRaster({ width, height, heightmap, biomes, seaLevel }) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const lightX = -0.65;
  const lightY = -0.65;
  const strength = 3.2;

  const hAt = (x, y) => heightmap[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const biomeId = biomes[idx];
      const [r, g, b] = BIOME_COLORS[biomeId] || [255, 0, 255];
      const h = heightmap[idx];

      let shade;
      if (h < seaLevel) {
        const depth = Math.min(1, (seaLevel - h) / seaLevel);
        shade = 1.0 - depth * 0.55;
      } else {
        const dx = hAt(x + 1, y) - hAt(x - 1, y);
        const dy = hAt(x, y + 1) - hAt(x, y - 1);
        shade = 1 + (dx * lightX + dy * lightY) * strength;
        shade = Math.min(1.35, Math.max(0.65, shade));
      }

      const o = idx * 4;
      pixels[o] = r * shade;
      pixels[o + 1] = g * shade;
      pixels[o + 2] = b * shade;
      pixels[o + 3] = 255;
    }
  }

  return pixels;
}
