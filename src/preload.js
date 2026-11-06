const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getData: () => ipcRenderer.invoke('getData'),
  getPrefs: () => ipcRenderer.invoke('getPrefs'),
  savePrefs: (layout) => ipcRenderer.invoke('savePrefs', layout),
  getAppointments: () => ipcRenderer.invoke('getAppointments'),
  saveAppointmentNotes: (id, notes) => ipcRenderer.invoke('saveAppointmentNotes', id, notes),
  aero: {
    status: () => ipcRenderer.invoke('aero:status'),
    greet: (patientId) => ipcRenderer.invoke('aero:greet', patientId),
    ask: (patientId, history, text) => ipcRenderer.invoke('aero:ask', patientId, history, text),
    speak: (text, mood) => ipcRenderer.invoke('aero:speak', text, mood),
    listen: (audio, mimeType) => ipcRenderer.invoke('aero:listen', audio, mimeType),
  },
});
