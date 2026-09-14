import { MapRenderer } from './canvas/MapRenderer.js';
import { MapState } from './state/MapState.js';
import { ToolManager } from './canvas/tools/index.js';
import { HistoryStack } from './canvas/historyStack.js';
import { BIOMES } from '../src/engine/biomeClassifier.js';
import { haversineDistance } from '../src/engine/geodata/projection.js';
import { initTheme, setTheme, getTheme } from './theme.js';
import { applyI18n, setLocale, getLocale, t } from './i18n.js';
import { WorldMapView } from './worldmap/WorldMapView.js';
import { buildPrintPdf } from './print/buildPrintPdf.js';

const TOOLS = ['terrainBrush', 'biomeBrush', 'waterTool', 'symbolTool', 'labelTool', 'eraser'];
const SYMBOL_TYPES = ['mountain', 'hill', 'forest', 'city', 'compass'];

let mapState;
let mapRenderer;
let historyStack;
let toolManager;
let worldMapView;
let currentFilePath = null;
let pickedHeightmap = null;
let hasMap = false;

const el = (id) => document.getElementById(id);

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function toast(message, variant = 'info') {
  const container = el('toast-container');
  const node = document.createElement('div');
  node.className = variant === 'error' ? 'toast toast-error' : 'toast';
  node.textContent = message;
  container.appendChild(node);
  setTimeout(() => node.remove(), 6000);
}

function setStatus(text) {
  el('status-text').textContent = text;
}

// Findet zu einer rohen Meterzahl den nächsten "runden" Wert (1/2/5 × 10^n),
// wie es klassische Kartenmaßstabsbalken tun, statt krummer Zahlen.
function computeScaleBar(metersPerPixel, targetPixelWidth = 90) {
  const rawMeters = metersPerPixel * targetPixelWidth;
  if (!Number.isFinite(rawMeters) || rawMeters <= 0) return null;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMeters)));
  const residual = rawMeters / magnitude;
  const niceResidual = residual < 1.5 ? 1 : residual < 3.5 ? 2 : residual < 7.5 ? 5 : 10;
  const niceMeters = niceResidual * magnitude;
  const pixels = niceMeters / metersPerPixel;
  const label = niceMeters >= 1000 ? `${niceMeters / 1000} km` : `${Math.round(niceMeters)} m`;
  return { pixels, label };
}

function updateScaleBar() {
  if (!hasMap) return;
  const metersPerPixel = mapState.scale.metersPerCell / mapRenderer.world.scale.x;
  const bar = computeScaleBar(metersPerPixel);
  if (!bar) return;
  el('scale-bar').querySelector('.scale-bar-line').style.width = `${bar.pixels}px`;
  el('scale-bar-label').textContent = bar.label;
}

function refreshWindowTitle() {
  if (!hasMap) {
    document.title = `${t('app.title')} — ${t('status.noMap')}`;
    return;
  }
  const name = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : t('status.untitled');
  document.title = `${t('app.title')} — ${name}${mapState.dirty ? ' *' : ''}`;
}

// --- Werkzeug-Optionen-Panel ---

function renderToolOptions(tool) {
  const container = el('tool-options');
  container.innerHTML = '';

  const radiusRow = (labelKey, min, max, value, onInput) => {
    const row = document.createElement('div');
    row.className = 'option-row';
    const label = document.createElement('label');
    label.textContent = t(labelKey);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener('input', () => onInput(Number(input.value)));
    row.append(label, input);
    return row;
  };

  const buttonGroup = (labelKey, options, activeValue, onSelect) => {
    const row = document.createElement('div');
    row.className = 'option-row';
    const label = document.createElement('label');
    label.textContent = t(labelKey);
    const group = document.createElement('div');
    group.className = 'btn-group';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.textContent = t(opt.labelKey);
      btn.classList.toggle('active', opt.value === activeValue);
      btn.addEventListener('click', () => {
        onSelect(opt.value);
        renderToolOptions(tool);
      });
      group.appendChild(btn);
    }
    row.append(label, group);
    return row;
  };

  const selectRow = (labelKey, options, activeValue, onSelect) => {
    const row = document.createElement('div');
    row.className = 'option-row';
    const label = document.createElement('label');
    label.textContent = t(labelKey);
    const select = document.createElement('select');
    for (const opt of options) {
      const optionEl = document.createElement('option');
      optionEl.value = String(opt.value);
      optionEl.textContent = t(opt.labelKey);
      optionEl.selected = opt.value === activeValue;
      select.appendChild(optionEl);
    }
    select.addEventListener('change', () => onSelect(select.value));
    row.append(label, select);
    return row;
  };

  if (tool === 'terrainBrush' || tool === 'eraser') {
    container.appendChild(
      radiusRow('option.brushRadius', 2, 60, toolManager.options.brushRadius, (v) => toolManager.setOption('brushRadius', v))
    );
  }

  if (tool === 'terrainBrush') {
    container.appendChild(
      buttonGroup(
        'option.brushMode',
        [
          { value: 'raise', labelKey: 'option.brushMode.raise' },
          { value: 'lower', labelKey: 'option.brushMode.lower' },
          { value: 'smooth', labelKey: 'option.brushMode.smooth' }
        ],
        toolManager.options.brushMode,
        (v) => toolManager.setOption('brushMode', v)
      )
    );
  }

  if (tool === 'biomeBrush') {
    container.appendChild(
      radiusRow('option.brushRadius', 2, 60, toolManager.options.brushRadius, (v) => toolManager.setOption('brushRadius', v))
    );
    container.appendChild(
      selectRow(
        'option.biome',
        BIOMES.map((b) => ({ value: b.id, labelKey: `biome_${b.key}` })),
        toolManager.options.biomeId,
        (v) => toolManager.setOption('biomeId', Number(v))
      )
    );
  }

  if (tool === 'symbolTool') {
    container.appendChild(
      selectRow(
        'option.symbolType',
        SYMBOL_TYPES.map((s) => ({ value: s, labelKey: `symbol.${s}` })),
        toolManager.options.symbolType,
        (v) => toolManager.setOption('symbolType', v)
      )
    );
  }
}

// --- Ebenen-Panel ---

function renderLayersList() {
  const list = el('layers-list');
  list.innerHTML = '';
  for (const layer of mapState.layers) {
    const li = document.createElement('li');
    li.className = 'layer-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = layer.visible;
    checkbox.addEventListener('change', () => {
      mapState.setLayerVisible(layer.key, checkbox.checked);
      mapRenderer.applyLayerVisibility();
    });

    const label = document.createElement('span');
    label.textContent = t(`layer.${layer.key}`);

    const opacity = document.createElement('input');
    opacity.type = 'range';
    opacity.min = '0';
    opacity.max = '1';
    opacity.step = '0.05';
    opacity.value = String(layer.opacity);
    opacity.addEventListener('input', () => {
      mapState.setLayerOpacity(layer.key, Number(opacity.value));
      mapRenderer.applyLayerVisibility();
    });

    li.append(checkbox, label, opacity);
    list.appendChild(li);
  }
}

// --- Werkzeugleiste (links) ---

function setActiveToolButton(tool) {
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
}

function wireToolSidebar() {
  el('tools-sidebar').addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-btn');
    if (!btn) return;
    const tool = btn.dataset.tool;
    toolManager.setActiveTool(tool);
    setActiveToolButton(tool);
    renderToolOptions(tool);
  });
  setActiveToolButton(toolManager.activeTool);
  renderToolOptions(toolManager.activeTool);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toolManager.cancelActiveDrawing();
  });
}

// --- Undo/Redo ---

// Nur die Button-Zustände auffrischen, ohne die Karte als "geändert" zu
// markieren – wird u. a. direkt nach dem Laden/Generieren einer Karte
// aufgerufen, wo noch nichts bearbeitet wurde.
function refreshHistoryButtons() {
  el('btn-undo').disabled = !historyStack.canUndo();
  el('btn-redo').disabled = !historyStack.canRedo();
}

// Callback für den HistoryStack: wird nur bei echten push()/undo()/redo()
// ausgelöst, daher hier zusätzlich "dirty" markieren.
function onHistoryChange() {
  refreshHistoryButtons();
  mapState.markDirty();
  refreshWindowTitle();
}

function wireUndoRedo() {
  el('btn-undo').addEventListener('click', () => {
    if (historyStack.undo()) mapRenderer.redrawAll();
  });
  el('btn-redo').addEventListener('click', () => {
    if (historyStack.redo()) mapRenderer.redrawAll();
  });
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (historyStack.undo()) mapRenderer.redrawAll();
    } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
      e.preventDefault();
      if (historyStack.redo()) mapRenderer.redrawAll();
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveMap(false);
    }
  });
}

// --- Kartenaufbau nach Generierung/Import/Laden ---

function loadProjectIntoState(project) {
  mapState.reset(project);
  historyStack = new HistoryStack(onHistoryChange);
  toolManager.historyStack = historyStack;
  mapRenderer.fitToView();
  mapRenderer.redrawAll();
  hasMap = true;
  el('canvas-placeholder').hidden = true;
  el('scale-bar').hidden = false;
  renderLayersList();
  refreshHistoryButtons();
  el('status-seed').textContent = `Seed: ${mapState.seed}`;
  setStatus(t('status.ready'));
  refreshWindowTitle();
}

// --- Generischer Text-Eingabedialog (Ersatz für window.prompt(), das
// Electron nicht unterstützt: "prompt() is and will not be supported.") ---

function showTextPrompt(title) {
  return new Promise((resolve) => {
    const dialog = el('text-prompt-dialog');
    const input = el('text-prompt-input');
    el('text-prompt-title').textContent = title;
    input.value = '';
    dialog.hidden = false;
    input.focus();

    const cleanup = (result) => {
      dialog.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      resolve(result);
    };
    const onOk = () => cleanup(input.value.trim() || null);
    const onCancel = () => cleanup(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    };

    const okBtn = el('text-prompt-ok');
    const cancelBtn = el('text-prompt-cancel');
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
  });
}

// --- Regions-Dialog (Name + Farbe für politische Grenzen) ---

const REGION_COLORS = ['#aa3355', '#3f7ea6', '#4a8f5c', '#c98a2b', '#7a5aa6', '#b5533c', '#4a4a5c', '#2f8f8a'];

function showRegionPromptDialog() {
  return new Promise((resolve) => {
    const dialog = el('region-prompt-dialog');
    const input = el('region-prompt-input');
    const colorsContainer = el('region-prompt-colors');
    input.value = '';
    colorsContainer.innerHTML = '';

    let selectedColor = REGION_COLORS[0];
    const swatches = REGION_COLORS.map((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.background = color;
      swatch.classList.toggle('selected', color === selectedColor);
      swatch.addEventListener('click', () => {
        selectedColor = color;
        swatches.forEach((s) => s.classList.toggle('selected', s === swatch));
      });
      colorsContainer.appendChild(swatch);
      return swatch;
    });

    dialog.hidden = false;
    input.focus();

    const cleanup = (result) => {
      dialog.hidden = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      resolve(result);
    };
    const onOk = () => {
      const name = input.value.trim();
      cleanup(name ? { name, color: selectedColor } : null);
    };
    const onCancel = () => cleanup(null);
    const onKeydown = (e) => {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    };

    const okBtn = el('region-prompt-ok');
    const cancelBtn = el('region-prompt-cancel');
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
  });
}

// --- Schließen-Bestätigung (ungespeicherte Änderungen) ---

function showCloseConfirmDialog() {
  return new Promise((resolve) => {
    const dialog = el('close-confirm-dialog');
    dialog.hidden = false;

    const saveBtn = el('close-confirm-save');
    const discardBtn = el('close-confirm-discard');
    const cancelBtn = el('close-confirm-cancel');

    const cleanup = (result) => {
      dialog.hidden = true;
      saveBtn.removeEventListener('click', onSave);
      discardBtn.removeEventListener('click', onDiscard);
      cancelBtn.removeEventListener('click', onCancel);
      window.removeEventListener('keydown', onKeydown);
      resolve(result);
    };
    const onSave = () => cleanup('save');
    const onDiscard = () => cleanup('discard');
    const onCancel = () => cleanup('cancel');
    const onKeydown = (e) => {
      if (e.key === 'Escape') onCancel();
    };

    saveBtn.addEventListener('click', onSave);
    discardBtn.addEventListener('click', onDiscard);
    cancelBtn.addEventListener('click', onCancel);
    window.addEventListener('keydown', onKeydown);
  });
}

function wireCloseConfirmation() {
  window.kartograph.onCloseRequested(async () => {
    if (!hasMap || !mapState.dirty) {
      window.kartograph.confirmClose();
      return;
    }

    const choice = await showCloseConfirmDialog();
    if (choice === 'cancel') return;
    if (choice === 'save') {
      const saved = await saveMap(false);
      if (!saved) return; // Speichern-Dialog wurde abgebrochen -> Fenster bleibt offen
    }
    window.kartograph.confirmClose();
  });
}

// --- Weltkarte: Ortssuche & echter Regions-Import ---

function wireWorldMap() {
  worldMapView = new WorldMapView({
    onWarnLargeRegion: () => toast(t('worldmap.largeRegion'), 'error')
  });

  el('btn-worldmap').addEventListener('click', () => worldMapView.open());
  el('worldmap-close-btn').addEventListener('click', () => worldMapView.close());

  const doSearch = async () => {
    const query = el('worldmap-search-input').value.trim();
    if (!query) return;
    const results = await window.kartograph.searchPlace(query);
    worldMapView.showSearchResults(results);
  };
  el('worldmap-search-btn').addEventListener('click', doSearch);
  el('worldmap-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  el('worldmap-import-btn').addEventListener('click', async () => {
    const bounds = worldMapView.getSelectionBounds();
    if (!bounds) return;

    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    const latMid = (north + south) / 2;
    const widthMeters = haversineDistance(latMid, west, latMid, east);
    const heightMeters = haversineDistance(north, west, south, west);

    const width = Number(el('worldmap-width').value);
    const height = Math.min(2048, Math.max(64, Math.round(width * (heightMeters / widthMeters))));

    const progress = el('worldmap-progress');
    const progressFill = progress.querySelector('.progress-fill');
    progress.hidden = false;
    progressFill.style.width = '0%';
    el('worldmap-import-btn').disabled = true;

    const unsubscribe = window.kartograph.onTerrainProgress(({ percent }) => {
      progressFill.style.width = `${percent}%`;
    });

    try {
      const payload = await window.kartograph.importRegion({ bounds: { north, south, east, west }, width, height });
      currentFilePath = null;
      loadProjectIntoState({ ...payload, mode: 'imported-real-region', stylePreset: 'realistic' });
      worldMapView.clearSelection();
      worldMapView.close();
    } catch (err) {
      toast(t('worldmap.importFailed', { error: err.message }), 'error');
    } finally {
      unsubscribe();
      progress.hidden = true;
      el('worldmap-import-btn').disabled = false;
    }
  });
}

// --- Neue-Karte-Dialog ---

function wireNewMapDialog() {
  const dialog = el('new-map-dialog');
  const modeSelect = el('nm-mode');
  const importRow = el('nm-import-row');
  const progress = el('nm-progress');
  const progressFill = progress.querySelector('.progress-fill');

  el('nm-seed').value = randomSeed();
  el('nm-random-seed').addEventListener('click', () => {
    el('nm-seed').value = randomSeed();
  });

  el('btn-new').addEventListener('click', () => {
    pickedHeightmap = null;
    el('nm-import-status').textContent = '';
    dialog.hidden = false;
  });
  el('nm-cancel').addEventListener('click', () => {
    dialog.hidden = true;
  });

  modeSelect.addEventListener('change', () => {
    const isImport = modeSelect.value === 'imported-heightmap';
    importRow.hidden = !isImport;
    el('nm-width').disabled = isImport;
    el('nm-height').disabled = isImport;
  });

  el('nm-pick-image').addEventListener('click', async () => {
    const result = await window.kartograph.pickHeightmapImage();
    if (!result) return;
    pickedHeightmap = result;
    el('nm-import-status').textContent = `${result.width}×${result.height}px`;
  });

  el('nm-generate').addEventListener('click', async () => {
    const mode = modeSelect.value;
    if (mode === 'imported-heightmap' && !pickedHeightmap) return;

    const seed = el('nm-seed').value || randomSeed();
    const seaLevel = Number(el('nm-sea-level').value);
    const width = Number(el('nm-width').value);
    const height = Number(el('nm-height').value);

    progress.hidden = false;
    progressFill.style.width = '0%';
    el('nm-generate').disabled = true;
    setStatus(t('status.generating'));

    const unsubscribe = window.kartograph.onTerrainProgress(({ percent }) => {
      progressFill.style.width = `${percent}%`;
    });

    try {
      const payload = await window.kartograph.generateTerrain({
        width,
        height,
        seed,
        seaLevel,
        importedHeightmap: mode === 'imported-heightmap' ? pickedHeightmap : null
      });

      currentFilePath = null;
      loadProjectIntoState({
        ...payload,
        mode,
        stylePreset: 'fantasy',
        scale: { metersPerCell: Number(el('nm-meters-per-cell').value) || 1000 }
      });
      dialog.hidden = true;
    } finally {
      unsubscribe();
      progress.hidden = true;
      el('nm-generate').disabled = false;
    }
  });
}

// --- Speichern / Öffnen / Export ---

async function saveMap(forceDialog) {
  if (!hasMap) return false;
  const result = await window.kartograph.saveProject(forceDialog ? null : currentFilePath, mapState.toProjectObject());
  if (result.canceled) return false;
  currentFilePath = result.filePath;
  mapState.dirty = false;
  setStatus(t('status.saved'));
  refreshWindowTitle();
  refreshRecentProjects();
  return true;
}

async function openMap() {
  const result = await window.kartograph.openProject();
  if (!result) return;
  currentFilePath = result.filePath;
  loadProjectIntoState(result.project);
  refreshRecentProjects();
}

async function openMapPath(filePath) {
  const result = await window.kartograph.openProjectPath(filePath);
  if (!result) return;
  currentFilePath = result.filePath;
  loadProjectIntoState(result.project);
}

async function exportPng() {
  if (!hasMap) return;
  const buffer = await mapRenderer.exportPngBuffer(2);
  const suggestedName = (currentFilePath ? currentFilePath.split(/[\\/]/).pop().replace(/\.kmap$/i, '') : 'Karte') + '.png';
  const result = await window.kartograph.exportPng(buffer, suggestedName);
  if (!result.canceled) setStatus(t('status.exported'));
}

function wirePrintDialog() {
  const dialog = el('print-dialog');

  el('btn-export-pdf').addEventListener('click', () => {
    if (!hasMap) return;
    el('print-title').value = currentFilePath ? currentFilePath.split(/[\\/]/).pop().replace(/\.kmap$/i, '') : t('status.untitled');
    dialog.hidden = false;
  });
  el('print-cancel').addEventListener('click', () => {
    dialog.hidden = true;
  });

  el('print-export').addEventListener('click', async () => {
    const btn = el('print-export');
    btn.disabled = true;
    try {
      const pngBuffer = await mapRenderer.exportPngBuffer(2);
      const pdfBytes = await buildPrintPdf({
        pngBuffer,
        title: el('print-title').value.trim(),
        pageSize: el('print-page-size').value,
        orientation: el('print-orientation').value,
        includeLegend: el('print-include-legend').checked,
        mapState,
        locale: getLocale()
      });
      const suggestedName = (el('print-title').value.trim() || 'Karte') + '.pdf';
      const result = await window.kartograph.exportPdf(pdfBytes, suggestedName);
      if (!result.canceled) {
        setStatus(t('status.exportedPdf'));
        dialog.hidden = true;
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function refreshRecentProjects() {
  const recent = await window.kartograph.listRecentProjects();
  const select = el('recent-select');
  if (!select) return;
  select.innerHTML = '<option value="">…</option>';
  for (const filePath of recent) {
    const opt = document.createElement('option');
    opt.value = filePath;
    opt.textContent = filePath.split(/[\\/]/).pop();
    select.appendChild(opt);
  }
}

function wireToolbar() {
  el('btn-open').addEventListener('click', openMap);
  el('recent-select').addEventListener('change', () => {
    const filePath = el('recent-select').value;
    if (filePath) openMapPath(filePath);
  });
  el('btn-save').addEventListener('click', () => saveMap(false));
  el('btn-save-as').addEventListener('click', () => saveMap(true));
  el('btn-export-png').addEventListener('click', exportPng);
}

// --- Sprache & Theme ---

function wireLocaleAndTheme() {
  const localeSelect = el('locale-select');
  localeSelect.value = getLocale();
  localeSelect.addEventListener('change', () => {
    setLocale(localeSelect.value);
    renderToolOptions(toolManager.activeTool);
    renderLayersList();
    refreshWindowTitle();
  });

  const themeSelect = el('theme-select');
  themeSelect.value = getTheme();
  themeSelect.addEventListener('change', () => setTheme(themeSelect.value));
}

// --- Auto-Update ---
// Prüft nur und zeigt einen Toast, lädt nichts automatisch herunter/installiert
// nichts (siehe main.js) — Installation bleibt weiterhin ein manueller Schritt.

function wireUpdates() {
  // Der automatische Check beim Start soll nur bei einem echten Fund auffallen;
  // "keine Updates"/Fehler werden nur bei manuellem Klick als Toast gezeigt.
  let manualCheck = false;

  el('btn-check-update').addEventListener('click', async () => {
    const btn = el('btn-check-update');
    btn.disabled = true;
    manualCheck = true;
    try {
      const result = await window.kartograph.checkForUpdate();
      if (!result.ok) toast(t('update.error', { error: result.error }), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  window.kartograph.onUpdateStatus((status) => {
    if (status.status === 'available') {
      toast(t('update.available', { version: status.version }));
    } else if (status.status === 'not-available' && manualCheck) {
      toast(t('update.notAvailable'));
    } else if (status.status === 'error' && manualCheck) {
      toast(t('update.error', { error: status.error }), 'error');
    }
    manualCheck = false;
  });
}

// --- Statusleiste: Mauskoordinaten ---

function wireStatusCoords() {
  mapRenderer.app.canvas.addEventListener('mousemove', (e) => {
    if (!hasMap) return;
    const { x, y } = mapRenderer.screenToMap(e.clientX, e.clientY);
    if (x >= 0 && y >= 0 && x < mapState.width && y < mapState.height) {
      el('status-coords').textContent = `${Math.floor(x)}, ${Math.floor(y)}`;
    } else {
      el('status-coords').textContent = '';
    }
  });
}

// --- Bootstrap ---

async function main() {
  initTheme();
  applyI18n();

  mapState = new MapState();
  mapRenderer = new MapRenderer(el('canvas-mount'), mapState);
  await mapRenderer.init();
  mapRenderer.app.ticker.add(updateScaleBar);

  historyStack = new HistoryStack(onHistoryChange);
  toolManager = new ToolManager({
    mapState,
    mapRenderer,
    historyStack,
    promptText: showTextPrompt,
    promptRegion: showRegionPromptDialog,
    onMeasure: (distance) => {
      el('status-measure').textContent = t('status.rulerResult', { distance });
    }
  });

  mapRenderer.setPointerHandler((mx, my, phase) => {
    if (!hasMap) return;
    toolManager.handlePointer(mx, my, phase);
  });

  wireToolSidebar();
  wireUndoRedo();
  wireNewMapDialog();
  wireToolbar();
  wirePrintDialog();
  wireLocaleAndTheme();
  wireUpdates();
  wireCloseConfirmation();
  wireWorldMap();
  wireStatusCoords();
  refreshRecentProjects();

  refreshHistoryButtons();
  setStatus(t('status.noMap'));

  // Debug-Zugriff über die DevTools-Konsole (F12), z. B. window.__kartograph.mapState.
  // historyStack bewusst NICHT direkt referenziert: es wird bei jeder neuen Karte
  // durch eine frische Instanz ersetzt (siehe loadProjectIntoState) – aktuell ist
  // immer nur toolManager.historyStack.
  window.__kartograph = { mapState, mapRenderer, toolManager, worldMapView, buildPrintPdf, computeScaleBar };
}

main().catch((err) => {
  console.error('Kartograph konnte nicht gestartet werden:', err);
  setStatus('Fehler beim Start – siehe Konsole.');
});
