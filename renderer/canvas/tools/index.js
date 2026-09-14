// Erzeugt eine Bearbeitungs-Session für ein Rasterfeld (Heightmap oder Biome):
// merkt sich pro Zelle nur den allerersten "vorher"-Wert, damit am Ende des
// Pinselstrichs ein einziges Undo/Redo-Command für den ganzen Strich entsteht.
function createRasterEditSession(array) {
  const before = new Map();
  return {
    touch(idx, newValue) {
      if (!before.has(idx)) before.set(idx, array[idx]);
      array[idx] = newValue;
    },
    hasChanges() {
      return before.size > 0;
    },
    toCommand() {
      const after = new Map(Array.from(before.keys(), (idx) => [idx, array[idx]]));
      return {
        do() {
          for (const [idx, v] of after) array[idx] = v;
        },
        undo() {
          for (const [idx, v] of before) array[idx] = v;
        }
      };
    }
  };
}

function circleCells(mapState, cx, cy, radius) {
  const cells = [];
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const x = Math.round(cx) + dx;
      const y = Math.round(cy) + dy;
      if (!mapState.inBounds(x, y)) continue;
      cells.push({ x, y, falloff: 1 - dist / radius });
    }
  }
  return cells;
}

/**
 * Verwaltet den aktiven Zeichen-/Bearbeitungsmodus und übersetzt
 * Zeiger-Ereignisse (von MapRenderer.setPointerHandler) in Änderungen am
 * MapState. Jedes Werkzeug ist bewusst eine einfache Funktion statt einer
 * eigenen Klassenhierarchie – die Werkzeuge teilen sich zu wenig Verhalten,
 * um eine gemeinsame Basisklasse zu rechtfertigen.
 */
export class ToolManager {
  constructor({ mapState, mapRenderer, historyStack, promptText, promptRegion, onMeasure }) {
    this.mapState = mapState;
    this.mapRenderer = mapRenderer;
    this.historyStack = historyStack;
    // Electron unterstützt window.prompt() nicht ("is and will not be
    // supported") – die Beschriftungs-/Regions-Eingabe kommt daher von außen
    // (ein eigener HTML-Dialog in app.js), damit dieses Modul UI-agnostisch bleibt.
    this.promptText = promptText || (async () => null);
    this.promptRegion = promptRegion || (async () => null);
    this.onMeasure = onMeasure || (() => {});
    this.activeTool = 'terrainBrush';
    this.options = {
      brushRadius: 8,
      brushMode: 'raise',
      biomeId: 0,
      symbolType: 'mountain'
    };
    this._session = null;
    this._waterPath = null;
    this._roadPath = null;
    this._regionPoints = null;
    this._rulerStart = null;
  }

  setActiveTool(tool) {
    this.activeTool = tool;
    this._session = null;
    this._waterPath = null;
    this._roadPath = null;
    this._regionPoints = null;
    this._rulerStart = null;
    this.mapRenderer.clearOverlay();
  }

  // Bricht ein mehrschrittiges Werkzeug (Region zeichnen) ab, z. B. bei Escape.
  cancelActiveDrawing() {
    this._regionPoints = null;
    this._rulerStart = null;
    this.mapRenderer.clearOverlay();
  }

  setOption(key, value) {
    this.options[key] = value;
  }

  handlePointer(mx, my, phase) {
    switch (this.activeTool) {
      case 'terrainBrush':
        return this._handleTerrainBrush(mx, my, phase);
      case 'biomeBrush':
        return this._handleBiomeBrush(mx, my, phase);
      case 'waterTool':
        return this._handleWaterTool(mx, my, phase);
      case 'roadTool':
        return this._handleRoadTool(mx, my, phase);
      case 'regionTool':
        return this._handleRegionTool(mx, my, phase);
      case 'rulerTool':
        return this._handleRulerTool(mx, my, phase);
      case 'symbolTool':
        return this._handleSymbolTool(mx, my, phase);
      case 'labelTool':
        return this._handleLabelTool(mx, my, phase);
      case 'eraser':
        return this._handleEraser(mx, my, phase);
      default:
        return null;
    }
  }

  // --- Terrain-Pinsel: Höhe anheben/absenken/glätten ---
  _handleTerrainBrush(mx, my, phase) {
    const { mapState } = this;
    if (phase === 'start') this._session = createRasterEditSession(mapState.heightmap);
    if (!this._session) return;

    const { brushRadius, brushMode } = this.options;
    const strength = brushMode === 'lower' ? -0.035 : 0.035;
    const cells = circleCells(mapState, mx, my, brushRadius);

    for (const { x, y, falloff } of cells) {
      const idx = mapState.index(x, y);
      if (brushMode === 'smooth') {
        const neighborAvg = averageNeighbors(mapState, x, y);
        const current = mapState.heightmap[idx];
        this._session.touch(idx, current + (neighborAvg - current) * 0.4 * falloff);
      } else {
        const current = mapState.heightmap[idx];
        this._session.touch(idx, Math.min(1, Math.max(0, current + strength * falloff)));
      }
    }

    this.mapRenderer.redrawTerrain();

    if (phase === 'end') this._commitSession();
  }

  // --- Biom-Pinsel: Biom-Fläche übermalen ---
  _handleBiomeBrush(mx, my, phase) {
    const { mapState } = this;
    if (phase === 'start') this._session = createRasterEditSession(mapState.biomes);
    if (!this._session) return;

    const cells = circleCells(mapState, mx, my, this.options.brushRadius);
    for (const { x, y } of cells) {
      this._session.touch(mapState.index(x, y), this.options.biomeId);
    }

    this.mapRenderer.redrawTerrain();

    if (phase === 'end') this._commitSession();
  }

  _commitSession() {
    if (this._session && this._session.hasChanges()) {
      const command = this._session.toCommand();
      this.historyStack.push(command);
    }
    this._session = null;
  }

  // --- Wasser-Werkzeug: manuelle Flusslinie zeichnen ---
  _handleWaterTool(mx, my, phase) {
    const point = [Math.round(mx), Math.round(my)];
    if (phase === 'start') {
      this._waterPath = [point];
    } else if (phase === 'move' && this._waterPath) {
      const last = this._waterPath[this._waterPath.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 1.5) this._waterPath.push(point);
    } else if (phase === 'end' && this._waterPath) {
      if (this._waterPath.length > 1) {
        const path = this._waterPath;
        this.mapState.addRiver(path);
        this.historyStack.push({
          do: () => this.mapState.addRiver(path),
          undo: () => {
            this.mapState.rivers = this.mapState.rivers.filter((p) => p !== path);
          }
        });
      }
      this._waterPath = null;
    }
    this.mapRenderer.redrawRivers();
  }

  // --- Straßen-Werkzeug: manuelle Straße zeichnen (wie Wasser, andere Ebene/Optik) ---
  _handleRoadTool(mx, my, phase) {
    const point = [Math.round(mx), Math.round(my)];
    if (phase === 'start') {
      this._roadPath = [point];
    } else if (phase === 'move' && this._roadPath) {
      const last = this._roadPath[this._roadPath.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 1.5) this._roadPath.push(point);
    } else if (phase === 'end' && this._roadPath) {
      if (this._roadPath.length > 1) {
        const road = { points: this._roadPath, source: 'user' };
        this.mapState.roads.push(road);
        this.historyStack.push({
          do: () => {
            if (!this.mapState.roads.includes(road)) this.mapState.roads.push(road);
          },
          undo: () => {
            this.mapState.roads = this.mapState.roads.filter((r) => r !== road);
          }
        });
      }
      this._roadPath = null;
    }
    this.mapRenderer.redrawRoads();
  }

  // --- Grenzen-Werkzeug: Klick für Eckpunkte, Klick nahe am Startpunkt schließt das Polygon ---
  _handleRegionTool(mx, my, phase) {
    if (phase !== 'start') return;
    const point = [Math.round(mx), Math.round(my)];
    if (!this._regionPoints) this._regionPoints = [];

    if (this._regionPoints.length >= 3) {
      const [fx, fy] = this._regionPoints[0];
      const closeThreshold = Math.max(4, 10 / this.mapRenderer.world.scale.x);
      if (Math.hypot(point[0] - fx, point[1] - fy) <= closeThreshold) {
        this._finishRegion();
        return;
      }
    }

    this._regionPoints.push(point);
    this.mapRenderer.redrawRegionPreview(this._regionPoints);
  }

  async _finishRegion() {
    const points = this._regionPoints;
    this._regionPoints = null;
    this.mapRenderer.clearOverlay();

    const result = await this.promptRegion();
    if (!result) return;

    const region = { id: `reg-${Date.now().toString(36)}`, name: result.name, color: result.color, points };
    this.mapState.regions.push(region);
    this.historyStack.push({
      do: () => {
        if (!this.mapState.regions.includes(region)) this.mapState.regions.push(region);
      },
      undo: () => {
        this.mapState.regions = this.mapState.regions.filter((r) => r !== region);
      }
    });
    this.mapRenderer.redrawRegions();
  }

  // --- Lineal: Distanz zwischen zwei Punkten in realen Einheiten anzeigen ---
  _handleRulerTool(mx, my, phase) {
    const point = [mx, my];
    if (phase === 'start') {
      this._rulerStart = point;
    } else if (phase === 'move' && this._rulerStart) {
      this.mapRenderer.redrawRulerPreview(this._rulerStart, point);
      this._reportRulerDistance(this._rulerStart, point);
    } else if (phase === 'end' && this._rulerStart) {
      this.mapRenderer.redrawRulerPreview(this._rulerStart, point);
      this._reportRulerDistance(this._rulerStart, point);
      this._rulerStart = null;
    }
  }

  _reportRulerDistance(a, b) {
    const cellDistance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const meters = cellDistance * (this.mapState.scale?.metersPerCell || 1000);
    this.onMeasure(formatDistance(meters));
  }

  // --- Symbol-Stempel: Icon platzieren ---
  _handleSymbolTool(mx, my, phase) {
    if (phase !== 'start') return;
    const symbol = this.mapState.addSymbol(this.options.symbolType, mx, my);
    this.historyStack.push({
      do: () => {
        if (!this.mapState.symbols.includes(symbol)) this.mapState.symbols.push(symbol);
      },
      undo: () => {
        this.mapState.symbols = this.mapState.symbols.filter((s) => s !== symbol);
      }
    });
    this.mapRenderer.redrawSymbols();
  }

  // --- Beschriftungs-Werkzeug ---
  async _handleLabelTool(mx, my, phase) {
    if (phase !== 'start') return;
    const text = await this.promptText('Beschriftungstext');
    if (!text) return;
    const label = this.mapState.addLabel(text, mx, my);
    this.historyStack.push({
      do: () => {
        if (!this.mapState.labels.includes(label)) this.mapState.labels.push(label);
      },
      undo: () => {
        this.mapState.labels = this.mapState.labels.filter((l) => l !== label);
      }
    });
    this.mapRenderer.redrawLabels();
  }

  // --- Radierer: nächstgelegenes Symbol, Label oder Flusssegment entfernen ---
  _handleEraser(mx, my, phase) {
    if (phase !== 'start') return;
    const radius = this.options.brushRadius;

    const nearSymbol = this.mapState.symbols
      .map((s) => ({ s, dist: Math.hypot(s.x - mx, s.y - my) }))
      .filter((e) => e.dist <= radius)
      .sort((a, b) => a.dist - b.dist)[0];

    const nearLabel = this.mapState.labels
      .map((l) => ({ l, dist: Math.hypot(l.x - mx, l.y - my) }))
      .filter((e) => e.dist <= radius)
      .sort((a, b) => a.dist - b.dist)[0];

    const nearRiver = this.mapState.rivers.find((path) =>
      path.some(([px, py]) => Math.hypot(px - mx, py - my) <= radius)
    );

    const nearRoad = this.mapState.roads.find((road) =>
      road.points.some(([px, py]) => Math.hypot(px - mx, py - my) <= radius)
    );

    const nearRegion = this.mapState.regions.find((region) =>
      region.points.some(([px, py]) => Math.hypot(px - mx, py - my) <= radius)
    );

    if (nearSymbol) {
      const symbol = nearSymbol.s;
      this.mapState.symbols = this.mapState.symbols.filter((s) => s !== symbol);
      this.historyStack.push({
        do: () => {
          this.mapState.symbols = this.mapState.symbols.filter((s) => s !== symbol);
        },
        undo: () => this.mapState.symbols.push(symbol)
      });
      this.mapRenderer.redrawSymbols();
    } else if (nearLabel) {
      const label = nearLabel.l;
      this.mapState.labels = this.mapState.labels.filter((l) => l !== label);
      this.historyStack.push({
        do: () => {
          this.mapState.labels = this.mapState.labels.filter((l) => l !== label);
        },
        undo: () => this.mapState.labels.push(label)
      });
      this.mapRenderer.redrawLabels();
    } else if (nearRiver) {
      this.mapState.rivers = this.mapState.rivers.filter((p) => p !== nearRiver);
      this.historyStack.push({
        do: () => {
          this.mapState.rivers = this.mapState.rivers.filter((p) => p !== nearRiver);
        },
        undo: () => this.mapState.rivers.push(nearRiver)
      });
      this.mapRenderer.redrawRivers();
    } else if (nearRoad) {
      this.mapState.roads = this.mapState.roads.filter((r) => r !== nearRoad);
      this.historyStack.push({
        do: () => {
          this.mapState.roads = this.mapState.roads.filter((r) => r !== nearRoad);
        },
        undo: () => this.mapState.roads.push(nearRoad)
      });
      this.mapRenderer.redrawRoads();
    } else if (nearRegion) {
      this.mapState.regions = this.mapState.regions.filter((r) => r !== nearRegion);
      this.historyStack.push({
        do: () => {
          this.mapState.regions = this.mapState.regions.filter((r) => r !== nearRegion);
        },
        undo: () => this.mapState.regions.push(nearRegion)
      });
      this.mapRenderer.redrawRegions();
    }
  }
}

function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
  return `${Math.round(meters)} m`;
}

function averageNeighbors(mapState, x, y) {
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!mapState.inBounds(nx, ny)) continue;
      sum += mapState.heightmap[mapState.index(nx, ny)];
      count++;
    }
  }
  return count ? sum / count : mapState.getHeight(x, y);
}
