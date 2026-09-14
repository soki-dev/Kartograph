const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');

const { saveProject, loadProject } = require('./src/engine/mapProject');
const { classifyBiomes } = require('./src/engine/biomeClassifier');
const { loadHeightmapImage } = require('./src/engine/heightmapImport');
const { exportMapPng } = require('./src/engine/pngExport');

let mainWindow;
let recentProjects = [];
let allowClose = false;

const RECENT_PROJECTS_PATH = path.join(app.getPath('userData'), 'recent-projects.json');

function loadRecentProjects() {
  try {
    recentProjects = JSON.parse(fs.readFileSync(RECENT_PROJECTS_PATH, 'utf8'));
  } catch {
    recentProjects = [];
  }
}

function pushRecentProject(filePath) {
  recentProjects = [filePath, ...recentProjects.filter((p) => p !== filePath)].slice(0, 10);
  try {
    fs.mkdirSync(path.dirname(RECENT_PROJECTS_PATH), { recursive: true });
    fs.writeFileSync(RECENT_PROJECTS_PATH, JSON.stringify(recentProjects, null, 2));
  } catch {
    // Nicht kritisch, Recent-Liste ist nur ein Komfortfeature.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#1b1d22',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  Menu.setApplicationMenu(null);

  // Schließen (Klick auf "X", Alt+F4) erst nach Rückfrage im Renderer
  // zulassen, falls die Karte ungespeicherte Änderungen hat.
  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    mainWindow.webContents.send('app:closeRequested');
  });
}

app.whenReady().then(() => {
  loadRecentProjects();
  createWindow();

  // Startet 3s nach dem Laden automatisch einen (stillen) Update-Check, damit
  // der App-Start dadurch nicht verzögert wird.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- Terrain-Generierung (Worker-Thread, Fortschritt per Event) ---

ipcMain.handle('terrain:generate', async (event, options) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'src', 'workers', 'generateTerrain.js'), {
      workerData: options
    });

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        event.sender.send('terrain:progress', msg.payload);
      } else if (msg.type === 'done') {
        resolve(msg.payload);
        worker.terminate();
      }
    });
    worker.on('error', (err) => {
      reject(err);
      worker.terminate();
    });
  });
});

// --- Weltkarte: Ortssuche & echter Regions-Import (Worker-Thread) ---

ipcMain.handle('geodata:searchPlace', async (_event, query) => {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Kartograph/0.1 (Kartografie-Desktop-App)' } });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen: HTTP ${res.status}`);
  const results = await res.json();
  return results.map((r) => ({
    displayName: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    // Nominatim liefert [south, north, west, east] als Strings.
    boundingBox: Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null
  }));
});

ipcMain.handle('geodata:importRegion', async (event, options) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'src', 'workers', 'importRealRegion.js'), {
      workerData: options
    });

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        event.sender.send('terrain:progress', msg.payload);
      } else if (msg.type === 'done') {
        resolve(msg.payload);
        worker.terminate();
      } else if (msg.type === 'error') {
        reject(new Error(msg.payload.message));
        worker.terminate();
      }
    });
    worker.on('error', (err) => {
      reject(err);
      worker.terminate();
    });
  });
});

ipcMain.handle('terrain:classifyBiomes', async (_event, { heightmap, moisture, width, height, seaLevel }) => {
  return classifyBiomes({
    heightmap: Float32Array.from(heightmap),
    moisture: Float32Array.from(moisture),
    width,
    height,
    seaLevel
  });
});

// --- Heightmap-Import (Graustufenbild) ---

ipcMain.handle('heightmap:pickImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Höhendaten-Bild importieren',
    filters: [{ name: 'Graustufen-Höhenbild (PNG)', extensions: ['png'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return loadHeightmapImage(result.filePaths[0]);
});

// --- Projektverwaltung (.kmap) ---

ipcMain.handle('project:save', async (_event, { filePath, project }) => {
  let targetPath = filePath;
  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Karte speichern',
      defaultPath: 'Unbenannte Karte.kmap',
      filters: [{ name: 'Kartograph-Karte', extensions: ['kmap'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    targetPath = result.filePath;
  }
  await saveProject(targetPath, project);
  pushRecentProject(targetPath);
  return { canceled: false, filePath: targetPath };
});

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Karte öffnen',
    filters: [{ name: 'Kartograph-Karte', extensions: ['kmap'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const project = await loadProject(filePath);
  pushRecentProject(filePath);
  return { filePath, project };
});

ipcMain.handle('project:openPath', async (_event, filePath) => {
  const project = await loadProject(filePath);
  pushRecentProject(filePath);
  return { filePath, project };
});

ipcMain.handle('project:listRecent', () => recentProjects);

// --- Fenster schließen (nach Rückfrage im Renderer, siehe createWindow) ---

ipcMain.on('app:confirmClose', () => {
  allowClose = true;
  if (mainWindow) mainWindow.close();
});

// --- Export ---

ipcMain.handle('export:png', async (_event, { pngBuffer, suggestedName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Karte als PNG exportieren',
    defaultPath: suggestedName || 'Karte.png',
    filters: [{ name: 'PNG-Bild', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await exportMapPng(result.filePath, pngBuffer);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('export:pdf', async (_event, { pdfBuffer, suggestedName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Karte als PDF exportieren',
    defaultPath: suggestedName || 'Karte.pdf',
    filters: [{ name: 'PDF-Dokument', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.promises.writeFile(result.filePath, Buffer.from(pdfBuffer));
  return { canceled: false, filePath: result.filePath };
});

// --- Auto-Update ---
// Lädt nichts automatisch herunter, prüft nur und informiert die UI – die
// eigentliche Installation läuft weiterhin über den vom Nutzer heruntergeladenen
// Installer (wie bei Purgo/Neox Shield), kein stilles Selbst-Update.
autoUpdater.autoDownload = false;

ipcMain.handle('update:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version || null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update:status', { status: 'available', version: info.version });
});
autoUpdater.on('update-not-available', () => {
  if (mainWindow) mainWindow.webContents.send('update:status', { status: 'not-available' });
});
autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('update:status', { status: 'error', error: err.message });
});
