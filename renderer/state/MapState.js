import { BIOME_BY_KEY } from '../../src/engine/biomeClassifier.js';

const DEFAULT_LAYERS = [
  { key: 'terrain', visible: true, opacity: 1 },
  { key: 'water', visible: true, opacity: 1 },
  { key: 'symbols', visible: true, opacity: 1 },
  { key: 'labels', visible: true, opacity: 1 },
  { key: 'grid', visible: false, opacity: 0.5 }
];

let nextEntityId = 1;
function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${(nextEntityId++).toString(36)}`;
}

/**
 * Zentraler In-Memory-Kartenzustand des Renderers. Hält dieselben Felder wie
 * das .kmap-Manifest (siehe src/engine/mapProject.js) und ist die einzige
 * Quelle der Wahrheit, auf die Canvas-Rendering, Werkzeuge und UI-Panels
 * gleichermaßen zugreifen.
 */
export class MapState {
  constructor() {
    this.listeners = new Set();
    this.reset({ width: 0, height: 0, seed: 0, seaLevel: 0.4, mode: 'generated', stylePreset: 'fantasy' });
  }

  reset(project) {
    this.width = project.width;
    this.height = project.height;
    this.seed = project.seed;
    this.seaLevel = project.seaLevel ?? 0.4;
    this.mode = project.mode || 'generated';
    this.stylePreset = project.stylePreset || 'fantasy';
    this.heightmap = project.heightmap ? Float32Array.from(project.heightmap) : new Float32Array(this.width * this.height);
    this.moisture = project.moisture ? Float32Array.from(project.moisture) : null;
    this.biomes = project.biomes
      ? Uint8Array.from(project.biomes)
      : new Uint8Array(this.width * this.height).fill(BIOME_BY_KEY.ocean.id);
    this.rivers = project.rivers ? project.rivers.map((r) => r.map((p) => [...p])) : [];
    this.symbols = project.symbols ? project.symbols.map((s) => ({ ...s })) : [];
    this.labels = project.labels ? project.labels.map((l) => ({ ...l })) : [];
    this.layers = project.layers ? project.layers.map((l) => ({ ...l })) : DEFAULT_LAYERS.map((l) => ({ ...l }));
    this.dirty = false;
    this.emit('reset');
  }

  toProjectObject() {
    return {
      width: this.width,
      height: this.height,
      seed: this.seed,
      seaLevel: this.seaLevel,
      mode: this.mode,
      stylePreset: this.stylePreset,
      heightmap: Array.from(this.heightmap),
      moisture: this.moisture ? Array.from(this.moisture) : null,
      biomes: Array.from(this.biomes),
      rivers: this.rivers,
      symbols: this.symbols,
      labels: this.labels,
      layers: this.layers
    };
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x, y) {
    return y * this.width + x;
  }

  getHeight(x, y) {
    return this.heightmap[this.index(x, y)];
  }

  setHeight(x, y, value) {
    if (!this.inBounds(x, y)) return;
    this.heightmap[this.index(x, y)] = Math.min(1, Math.max(0, value));
  }

  getBiome(x, y) {
    return this.biomes[this.index(x, y)];
  }

  setBiome(x, y, biomeId) {
    if (!this.inBounds(x, y)) return;
    this.biomes[this.index(x, y)] = biomeId;
  }

  addRiver(points) {
    this.rivers.push(points);
  }

  removeRiversNear(x, y, radius) {
    this.rivers = this.rivers.filter((path) => !path.some(([px, py]) => Math.hypot(px - x, py - y) <= radius));
  }

  addSymbol(type, x, y, rotation = 0, scale = 1) {
    const symbol = { id: makeId('sym'), type, x, y, rotation, scale };
    this.symbols.push(symbol);
    return symbol;
  }

  removeSymbolsNear(x, y, radius) {
    this.symbols = this.symbols.filter((s) => Math.hypot(s.x - x, s.y - y) > radius);
  }

  addLabel(text, x, y, fontSize = 16) {
    const label = { id: makeId('lbl'), text, x, y, fontSize };
    this.labels.push(label);
    return label;
  }

  removeLabel(id) {
    this.labels = this.labels.filter((l) => l.id !== id);
  }

  setLayerVisible(key, visible) {
    const layer = this.layers.find((l) => l.key === key);
    if (layer) layer.visible = visible;
  }

  setLayerOpacity(key, opacity) {
    const layer = this.layers.find((l) => l.key === key);
    if (layer) layer.opacity = opacity;
  }

  markDirty() {
    this.dirty = true;
    this.emit('change');
  }

  on(event, callback) {
    const entry = { event, callback };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  emit(event, payload) {
    for (const l of this.listeners) {
      if (l.event === event || l.event === '*') l.callback(payload, event);
    }
  }
}
