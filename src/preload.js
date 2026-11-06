const { contextBridge } = require('electron');

// Expose safe APIs to the renderer here.
contextBridge.exposeInMainWorld('api', {
  versions: process.versions,
});
