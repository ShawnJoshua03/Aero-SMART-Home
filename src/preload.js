const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('getData'),
  getPrefs: () => ipcRenderer.invoke('getPrefs'),
  savePrefs: (layout) => ipcRenderer.invoke('savePrefs', layout),
});
