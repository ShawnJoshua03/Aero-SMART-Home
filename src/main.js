const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { createPreferenceStore } = require('./preferences');
const { normalizeData } = require('./data');
const { createAppointmentStore } = require('./appointments');
const { registerAero } = require('./aero/ipc');
const { createRealSource } = require('./aero/realSource');

const dataDirectory = path.join(__dirname, '..', 'data');
const pagePath = path.join(__dirname, 'renderer', 'index.html');
const pageURL = pathToFileURL(pagePath).href;

function trustedSender(event) {
  if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== pageURL) {
    throw new Error('Untrusted IPC sender');
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 390,
    height: 844,
    minWidth: 320,
    minHeight: 568,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(pagePath);
}

app.whenReady().then(async () => {
  const readData = async () =>
    normalizeData(JSON.parse(await fs.readFile(path.join(dataDirectory, 'responses.json'), 'utf8')));
  const store = createPreferenceStore(path.join(app.getPath('userData'), 'preferences.json'),
    path.join(dataDirectory, 'preferences.json'));
  await store.initialize((await readData()).patients.map((patient) => patient.id));
  const appointments = createAppointmentStore(path.join(app.getPath('userData'), 'appointments.json'),
    path.join(dataDirectory, 'appointments.json'));
  await appointments.initialize();
  ipcMain.handle('getAppointments', (event) => { trustedSender(event); return appointments.read(); });
  ipcMain.handle('saveAppointmentNotes', (event, id, notes) => { trustedSender(event); return appointments.saveNotes(id, notes); });
  ipcMain.handle('getData', (event) => { trustedSender(event); return readData(); });
  ipcMain.handle('getPrefs', (event) => { trustedSender(event); return store.read(); });
  ipcMain.handle('savePrefs', (event, layout) => { trustedSender(event); return store.save(layout); });
  // Microphone is allowed only for our own page (Aero push-to-talk).
  const allowMic = (webContents, permission) => permission === 'media' && webContents.getURL() === pageURL;
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(allowMic(webContents, permission)));
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => Boolean(webContents) && allowMic(webContents, permission));
  registerAero(ipcMain, trustedSender, {
    source: createRealSource(readData),
    notes: { add: (patientId, text) => appointments.appendToLatestPast(patientId, text) },
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => { console.error('Unable to start application:', error); app.quit(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
