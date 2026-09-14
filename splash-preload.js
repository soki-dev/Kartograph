const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splash', {
  onProgress: (callback) => {
    ipcRenderer.on('splash:progress', (_event, payload) => callback(payload));
  }
});
