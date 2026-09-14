// Unsere strikte CSP (script-src 'self', kein 'unsafe-eval') blockiert Pixis
// Standard-Codegen-Pfade für Uniform-/UBO-Sync; dieser Import ersetzt sie
// durch eval-freie Polyfills, bevor die Application erzeugt wird.
import 'pixi.js/unsafe-eval';
import { Application, Container, Sprite, Texture, Graphics, Text } from 'pixi.js';
import { renderTerrainRaster } from './hillshade.js';

const MIN_SCALE = 0.15;
const MAX_SCALE = 10;

const SYMBOL_DRAW = {
  mountain: (g) => {
    g.moveTo(0, -10).lineTo(8, 8).lineTo(-8, 8).closePath().fill(0x6b6459).stroke({ width: 1, color: 0x2c2a26 });
  },
  hill: (g) => {
    g.moveTo(-8, 6).quadraticCurveTo(0, -8, 8, 6).closePath().fill(0x7a8a4f).stroke({ width: 1, color: 0x3c4326 });
  },
  forest: (g) => {
    for (const [dx, dy] of [[-4, 2], [4, 2], [0, -4]]) {
      g.moveTo(dx, dy - 8).lineTo(dx + 5, dy + 4).lineTo(dx - 5, dy + 4).closePath();
    }
    g.fill(0x2f5e2c).stroke({ width: 1, color: 0x173413 });
  },
  city: (g) => {
    g.circle(0, 0, 6).fill(0xd8c27a).stroke({ width: 1.5, color: 0x4a3c1d });
  },
  compass: (g) => {
    g.moveTo(0, -14).lineTo(4, 0).lineTo(0, 14).lineTo(-4, 0).closePath().fill(0xe8e2d0).stroke({ width: 1, color: 0x2c2a26 });
  }
};

/**
 * Kapselt PixiJS: Terrain-Raster (Sprite aus einem Offscreen-Canvas), Flüsse,
 * Symbole, Beschriftungen und Gitter als eigene Ebenen in einem gemeinsamen
 * "world"-Container, der für Pan/Zoom verschoben/skaliert wird.
 */
export class MapRenderer {
  constructor(mountEl, mapState) {
    this.mountEl = mountEl;
    this.mapState = mapState;
    this.pointerHandler = null;
    this.isPanning = false;
    this.spaceHeld = false;
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      resizeTo: this.mountEl,
      backgroundColor: 0x14161a,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true
    });
    this.mountEl.appendChild(this.app.canvas);

    this.world = new Container();
    this.app.stage.addChild(this.world);

    this.terrainCanvas = document.createElement('canvas');
    this.terrainTexture = null;
    this.terrainSprite = new Sprite();
    this.world.addChild(this.terrainSprite);

    this.riversGraphics = new Graphics();
    this.world.addChild(this.riversGraphics);

    this.symbolsContainer = new Container();
    this.world.addChild(this.symbolsContainer);

    this.gridGraphics = new Graphics();
    this.world.addChild(this.gridGraphics);

    this.labelsContainer = new Container();
    this.world.addChild(this.labelsContainer);

    this._bindPointerEvents();
    window.addEventListener('resize', () => this._onResize());
  }

  // --- Koordinaten & Kamera ---

  screenToClient(clientX, clientY) {
    const rect = this.app.canvas.getBoundingClientRect();
    return { sx: clientX - rect.left, sy: clientY - rect.top };
  }

  screenToMap(clientX, clientY) {
    const { sx, sy } = this.screenToClient(clientX, clientY);
    return {
      x: (sx - this.world.position.x) / this.world.scale.x,
      y: (sy - this.world.position.y) / this.world.scale.y
    };
  }

  fitToView() {
    const { width, height } = this.mapState;
    if (!width || !height) return;
    const screen = this.app.screen;
    const scale = Math.min(screen.width / width, screen.height / height) * 0.92;
    this.world.scale.set(scale);
    this.world.position.set((screen.width - width * scale) / 2, (screen.height - height * scale) / 2);
  }

  zoomAt(clientX, clientY, factor) {
    const { sx, sy } = this.screenToClient(clientX, clientY);
    const before = this.screenToMap(clientX, clientY);
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.world.scale.x * factor));
    this.world.scale.set(newScale);
    this.world.position.set(sx - before.x * newScale, sy - before.y * newScale);
    this.redrawGrid(); // Linienstärke ist auf die aktuelle Skalierung normiert
  }

  // --- Eingabe ---

  setPointerHandler(handler) {
    this.pointerHandler = handler;
  }

  _bindPointerEvents() {
    const canvas = this.app.canvas;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') this.spaceHeld = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceHeld = false;
    });

    let panStart = null;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
      const wantsPan = e.button === 1 || e.button === 2 || (e.button === 0 && this.spaceHeld);
      if (wantsPan) {
        this.isPanning = true;
        panStart = { sx: e.clientX, sy: e.clientY, posX: this.world.position.x, posY: this.world.position.y };
      } else if (e.button === 0 && this.pointerHandler) {
        const map = this.screenToMap(e.clientX, e.clientY);
        this.pointerHandler(map.x, map.y, 'start', e);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning && panStart) {
        this.world.position.set(panStart.posX + (e.clientX - panStart.sx), panStart.posY + (e.clientY - panStart.sy));
      } else if (e.buttons === 1 && this.pointerHandler) {
        const map = this.screenToMap(e.clientX, e.clientY);
        this.pointerHandler(map.x, map.y, 'move', e);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        panStart = null;
      } else if (e.button === 0 && this.pointerHandler) {
        const map = this.screenToMap(e.clientX, e.clientY);
        this.pointerHandler(map.x, map.y, 'end', e);
      }
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.zoomAt(e.clientX, e.clientY, factor);
      },
      { passive: false }
    );
  }

  _onResize() {
    if (this.gridGraphics) this.redrawGrid();
  }

  // --- Rendering ---

  redrawTerrain() {
    const { width, height, heightmap, biomes, seaLevel } = this.mapState;
    if (!width || !height) return;

    if (this.terrainCanvas.width !== width || this.terrainCanvas.height !== height) {
      this.terrainCanvas.width = width;
      this.terrainCanvas.height = height;
    }

    const ctx = this.terrainCanvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(renderTerrainRaster({ width, height, heightmap, biomes, seaLevel }));
    ctx.putImageData(imageData, 0, 0);

    if (!this.terrainTexture) {
      this.terrainTexture = Texture.from(this.terrainCanvas);
      this.terrainSprite.texture = this.terrainTexture;
    } else {
      this.terrainTexture.source.update();
    }
  }

  redrawRivers() {
    const g = this.riversGraphics;
    g.clear();
    for (const path of this.mapState.rivers) {
      if (path.length < 2) continue;
      g.moveTo(path[0][0], path[0][1]);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i][0], path[i][1]);
      g.stroke({ width: 1.6, color: 0x3f7ea6, alpha: 0.9, cap: 'round', join: 'round' });
    }
  }

  redrawSymbols() {
    this.symbolsContainer.removeChildren();
    for (const symbol of this.mapState.symbols) {
      const g = new Graphics();
      const draw = SYMBOL_DRAW[symbol.type] || SYMBOL_DRAW.mountain;
      draw(g);
      g.position.set(symbol.x, symbol.y);
      g.rotation = symbol.rotation || 0;
      g.scale.set(symbol.scale || 1);
      this.symbolsContainer.addChild(g);
    }
  }

  redrawLabels() {
    this.labelsContainer.removeChildren();
    for (const label of this.mapState.labels) {
      const text = new Text({
        text: label.text,
        style: {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: label.fontSize || 16,
          fill: 0xf2ead9,
          stroke: { color: 0x1c1a16, width: 3 },
          fontStyle: 'italic'
        }
      });
      text.anchor.set(0.5);
      text.position.set(label.x, label.y);
      this.labelsContainer.addChild(text);
    }
  }

  redrawGrid() {
    const g = this.gridGraphics;
    g.clear();
    const { width, height } = this.mapState;
    if (!width || !height) return;
    const step = Math.max(4, Math.round(Math.min(width, height) / 20));
    for (let x = 0; x <= width; x += step) g.moveTo(x, 0).lineTo(x, height);
    for (let y = 0; y <= height; y += step) g.moveTo(0, y).lineTo(width, y);
    g.stroke({ width: 1 / this.world.scale.x, color: 0xffffff, alpha: 0.15 });
  }

  applyLayerVisibility() {
    const byKey = Object.fromEntries(this.mapState.layers.map((l) => [l.key, l]));
    const apply = (obj, key) => {
      const layer = byKey[key];
      if (!layer) return;
      obj.visible = layer.visible;
      obj.alpha = layer.opacity;
    };
    apply(this.terrainSprite, 'terrain');
    apply(this.riversGraphics, 'water');
    apply(this.symbolsContainer, 'symbols');
    apply(this.labelsContainer, 'labels');
    apply(this.gridGraphics, 'grid');
  }

  redrawAll() {
    this.redrawTerrain();
    this.redrawRivers();
    this.redrawSymbols();
    this.redrawLabels();
    this.redrawGrid();
    this.applyLayerVisibility();
  }

  async exportPngBuffer(resolution = 2) {
    const dataUrl = await this.app.renderer.extract.base64({ target: this.world, format: 'png', resolution });
    const res = await fetch(dataUrl);
    return new Uint8Array(await res.arrayBuffer());
  }
}
