// Biom-Katalog: Reihenfolge der Einträge = Biom-ID im klassifizierten Raster.
const BIOMES = [
  { id: 0, key: 'ocean', color: '#1c4966' },
  { id: 1, key: 'beach', color: '#d9c48f' },
  { id: 2, key: 'desert', color: '#dcc27a' },
  { id: 3, key: 'plains', color: '#a3c95a' },
  { id: 4, key: 'forest', color: '#4f8a4a' },
  { id: 5, key: 'swamp', color: '#5c6b47' },
  { id: 6, key: 'hills', color: '#8a9a5b' },
  { id: 7, key: 'mountains', color: '#8b8378' },
  { id: 8, key: 'snow', color: '#f0f4f7' }
];

const BIOME_BY_KEY = Object.fromEntries(BIOMES.map((b) => [b.key, b]));

/**
 * Klassifiziert jedes Raster-Feld anhand von Höhe und Feuchtigkeit in ein
 * Biom. Reine Funktion, unabhängig von GUI/Worker, damit sie sowohl im
 * Generierungs-Worker als auch nach manuellen Höhenänderungen (Re-Klassifikation
 * einzelner Zellen) wiederverwendet werden kann.
 */
function classifyBiomes({ heightmap, moisture, width, height, seaLevel = 0.4 }) {
  const biomes = new Uint8Array(width * height);
  const mountainLevel = seaLevel + (1 - seaLevel) * 0.65;
  const snowLevel = seaLevel + (1 - seaLevel) * 0.85;
  const beachBand = 0.03;

  for (let i = 0; i < heightmap.length; i++) {
    const h = heightmap[i];
    const m = moisture[i];

    if (h < seaLevel) {
      biomes[i] = BIOME_BY_KEY.ocean.id;
    } else if (h < seaLevel + beachBand) {
      biomes[i] = BIOME_BY_KEY.beach.id;
    } else if (h >= snowLevel) {
      biomes[i] = BIOME_BY_KEY.snow.id;
    } else if (h >= mountainLevel) {
      biomes[i] = BIOME_BY_KEY.mountains.id;
    } else if (h >= mountainLevel - 0.12) {
      biomes[i] = BIOME_BY_KEY.hills.id;
    } else if (m < 0.25) {
      biomes[i] = BIOME_BY_KEY.desert.id;
    } else if (m < 0.55) {
      biomes[i] = BIOME_BY_KEY.plains.id;
    } else if (m < 0.8) {
      biomes[i] = BIOME_BY_KEY.forest.id;
    } else {
      biomes[i] = BIOME_BY_KEY.swamp.id;
    }
  }

  return { biomes: Array.from(biomes), width, height };
}

module.exports = { classifyBiomes, BIOMES, BIOME_BY_KEY };
