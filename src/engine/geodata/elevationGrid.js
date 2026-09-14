/**
 * Bilineares Resampling eines Hoehen-Rasters von (srcWidth x srcHeight) auf
 * (destWidth x destHeight). Eingabe/Ausgabe sind flache, zeilenweise Arrays.
 */
function resampleGrid(values, srcWidth, srcHeight, destWidth, destHeight) {
  const out = new Float32Array(destWidth * destHeight);

  for (let dy = 0; dy < destHeight; dy++) {
    const sy = (dy / (destHeight - 1 || 1)) * (srcHeight - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcHeight - 1, y0 + 1);
    const fy = sy - y0;

    for (let dx = 0; dx < destWidth; dx++) {
      const sx = (dx / (destWidth - 1 || 1)) * (srcWidth - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const fx = sx - x0;

      const v00 = values[y0 * srcWidth + x0];
      const v10 = values[y0 * srcWidth + x1];
      const v01 = values[y1 * srcWidth + x0];
      const v11 = values[y1 * srcWidth + x1];

      const top = v00 + (v10 - v00) * fx;
      const bottom = v01 + (v11 - v01) * fx;
      out[dy * destWidth + dx] = top + (bottom - top) * fy;
    }
  }

  return out;
}

/**
 * Normalisiert echte Hoehenwerte (Meter) auf [0, 1] wie es die bestehende
 * Biom-/Rendering-Pipeline erwartet (siehe noiseGenerator.js), UND berechnet
 * dabei den normalisierten Meeresspiegel (0 m echte Hoehe -> Position in
 * [0,1]) statt eines willkuerlichen Default-Werts. So liegt die Kuestenlinie
 * einer echten Region an der tatsaechlich richtigen Stelle.
 */
function normalizeElevation(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  const heightmap = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    heightmap[i] = Math.min(1, Math.max(0, (values[i] - min) / range));
  }

  const seaLevel = Math.min(1, Math.max(0, (0 - min) / range));

  return { heightmap, seaLevel, min, max };
}

module.exports = { resampleGrid, normalizeElevation };
