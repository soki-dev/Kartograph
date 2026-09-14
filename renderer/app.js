import { MapRenderer } from './canvas/MapRenderer.js';
import { MapState } from './state/MapState.js';
import { ToolManager } from './canvas/tools/index.js';
import { HistoryStack } from './canvas/historyStack.js';
import { BIOMES } from '../src/engine/biomeClassifier.js';
import { initTheme, setTheme, getTheme } from './theme.js';
import { applyI18n, setLocale, getLocale, t } from './i18n.js';

const TOOLS = ['terrainBrush', 'biomeBrush', 'waterTool', 'symbolTool', 'labelTool', 'eraser'];
const SYMBOL_TYPES = ['mountain', 'hill', 'forest', 'city', 'compass'];

let mapState;
let mapRenderer;
let historyStack;
let toolManager;
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

function refreshWindowTitle() {
  const name = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : t('status.noMap');
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
        stylePreset: 'fantasy'
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
  if (!hasMap) return;
  const result = await window.kartograph.saveProject(forceDialog ? null : currentFilePath, mapState.toProjectObject());
  if (result.canceled) return;
  currentFilePath = result.filePath;
  mapState.dirty = false;
  setStatus(t('status.saved'));
  refreshWindowTitle();
  refreshRecentProjects();
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

  window.addEventListener('beforeunload', (e) => {
    if (mapState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
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

  historyStack = new HistoryStack(onHistoryChange);
  toolManager = new ToolManager({ mapState, mapRenderer, historyStack, promptText: showTextPrompt });

  mapRenderer.setPointerHandler((mx, my, phase) => {
    if (!hasMap) return;
    toolManager.handlePointer(mx, my, phase);
  });

  wireToolSidebar();
  wireUndoRedo();
  wireNewMapDialog();
  wireToolbar();
  wireLocaleAndTheme();
  wireUpdates();
  wireStatusCoords();
  refreshRecentProjects();

  refreshHistoryButtons();
  setStatus(t('status.noMap'));

  // Debug-Zugriff über die DevTools-Konsole (F12), z. B. window.__kartograph.mapState.
  // historyStack bewusst NICHT direkt referenziert: es wird bei jeder neuen Karte
  // durch eine frische Instanz ersetzt (siehe loadProjectIntoState) – aktuell ist
  // immer nur toolManager.historyStack.
  window.__kartograph = { mapState, mapRenderer, toolManager };
}

main().catch((err) => {
  console.error('Kartograph konnte nicht gestartet werden:', err);
  setStatus('Fehler beim Start – siehe Konsole.');
});
