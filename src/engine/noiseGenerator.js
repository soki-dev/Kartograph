const { createNoise2D } = require('simplex-noise');

// Deterministischer PRNG (mulberry32), damit ein Seed reproduzierbare Karten liefert.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/**
 * Erzeugt eine Heightmap per Multi-Oktaven-Simplex-Noise, mit radialem
 * Falloff zur Kartenmitte (sorgt für Inseln/Kontinente statt Endlos-Rauschen
 * bis zum Kartenrand).
 */
function generateHeightmap({ width, height, seed, octaves = 6, persistence = 0.5, scale = 1, islandFalloff = 0.35 }) {
  const rng = mulberry32(hashSeed(seed));
  const noise2D = createNoise2D(rng);
  const heightmap = new Float32Array(width * height);

  const baseFrequency = 2.2 * scale;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let amplitude = 1;
      let frequency = baseFrequency;
      let sum = 0;
      let amplitudeSum = 0;

      for (let o = 0; o < octaves; o++) {
        const nx = (x / width) * frequency;
        const ny = (y / height) * frequency;
        sum += noise2D(nx, ny) * amplitude;
        amplitudeSum += amplitude;
        amplitude *= persistence;
        frequency *= 2;
      }

      let value = sum / amplitudeSum; // [-1, 1]

      if (islandFalloff > 0) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
        const falloff = Math.max(0, 1 - Math.pow(dist / (1 - islandFalloff), 2));
        value = value * 0.6 + (falloff * 2 - 1) * 0.4;
      }

      heightmap[y * width + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  // Auf [0, 1] normalisieren. Float32Array rundet beim Schreiben, daher am
  // Ende hart clampen statt dem Rechenergebnis blind zu vertrauen (sonst
  // können Werte hauchdünn außerhalb von [0, 1] landen).
  const range = max - min || 1;
  for (let i = 0; i < heightmap.length; i++) {
    heightmap[i] = Math.min(1, Math.max(0, (heightmap[i] - min) / range));
  }

  return heightmap;
}

/**
 * Feuchtigkeits-Layer, unabhängig vom Height-Seed (anderer Offset), für
 * Biom-Klassifikation und Flussgenerierung.
 */
function generateMoistureMap({ width, height, seed, octaves = 4, persistence = 0.55, scale = 1 }) {
  const rng = mulberry32(hashSeed(seed) ^ 0x9e3779b9);
  const noise2D = createNoise2D(rng);
  const moisture = new Float32Array(width * height);
  const baseFrequency = 3 * scale;

  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let amplitude = 1;
      let frequency = baseFrequency;
      let sum = 0;
      let amplitudeSum = 0;

      for (let o = 0; o < octaves; o++) {
        const nx = (x / width) * frequency;
        const ny = (y / height) * frequency;
        sum += noise2D(nx, ny) * amplitude;
        amplitudeSum += amplitude;
        amplitude *= persistence;
        frequency *= 2;
      }

      const value = sum / amplitudeSum;
      moisture[y * width + x] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  const range = max - min || 1;
  for (let i = 0; i < moisture.length; i++) {
    moisture[i] = Math.min(1, Math.max(0, (moisture[i] - min) / range));
  }

  return moisture;
}

module.exports = { generateHeightmap, generateMoistureMap, mulberry32, hashSeed };
