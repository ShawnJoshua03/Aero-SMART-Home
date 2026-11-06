const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { createPreferenceStore } = require('./preferences');
const { normalizeData } = require('./data');

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
  ipcMain.handle('getData', (event) => { trustedSender(event); return readData(); });
  ipcMain.handle('getPrefs', (event) => { trustedSender(event); return store.read(); });
  ipcMain.handle('savePrefs', (event, layout) => { trustedSender(event); return store.save(layout); });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => { console.error('Unable to start application:', error); app.quit(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
