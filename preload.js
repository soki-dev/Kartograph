const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('kartograph', {
  generateTerrain: (options) => ipcRenderer.invoke('terrain:generate', options),
  onTerrainProgress: (cb) => on('terrain:progress', cb),
  classifyBiomes: (payload) => ipcRenderer.invoke('terrain:classifyBiomes', payload),

  pickHeightmapImage: () => ipcRenderer.invoke('heightmap:pickImage'),

  saveProject: (filePath, project) => ipcRenderer.invoke('project:save', { filePath, project }),
  openProject: () => ipcRenderer.invoke('project:open'),
  openProjectPath: (filePath) => ipcRenderer.invoke('project:openPath', filePath),
  listRecentProjects: () => ipcRenderer.invoke('project:listRecent'),

  exportPng: (pngBuffer, suggestedName) => ipcRenderer.invoke('export:png', { pngBuffer, suggestedName }),

  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  onUpdateStatus: (cb) => on('update:status', cb)
});
