const { app } = require('electron');
const assert = require('node:assert/strict');
app.setPath('userData', process.argv[2]);
const stage = process.argv[3];
const timeout = setTimeout(() => { console.error('Electron verification timed out'); app.exit(1); }, 25000);
app.on('browser-window-created', (_event, win) => {
  const errors = [];
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  win.webContents.once('did-finish-load', async () => {
    try {
      const security = win.webContents.getLastWebPreferences();
      assert.equal(security.contextIsolation, true);
      assert.equal(security.nodeIntegration, false);
      assert.equal(security.sandbox, true);
      const result = await win.webContents.executeJavaScript(`(${verifyRenderer.toString()})(${JSON.stringify(stage)})`);
      assert.deepEqual(errors, []);
      console.log(`${stage}: ${result}`);
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});
require('../src/main');

async function verifyRenderer(stage) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const until = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Timed out waiting for renderer/save');
  };
  const cards = () => [...document.querySelectorAll('.widget-card')];
  const saved = () => until(() => document.getElementById('save-status').textContent === 'Layout saved');
  await until(() => !document.getElementById('patient-select').disabled);
  check(Object.keys(window.api).sort().join(',') === 'getData,getPrefs,savePrefs', 'Bridge surface must be exact');
  check(typeof window.require === 'undefined', 'Renderer must have no Node require');
  check(document.querySelector('[http-equiv="Content-Security-Policy"]').content === "default-src 'self'", 'CSP changed');
  const data = await window.api.getData();
  check(data.patients.length === 6 && data.entries.length === 245, 'IPC data shape');
  if (stage === 'restart') {
    check(cards().length === 1 && cards()[0].classList.contains('size-L'), 'Restart did not preserve card size/removal');
    check(cards()[0].dataset.instanceId !== 'hello-1', 'Restart did not preserve reordered/new card');
    check(document.getElementById('patient-select').value === 'patient-002', 'Restart patient selection');
    check(cards()[0].textContent.includes('35 daily check-ins'), 'Restart patient context');
    return 'persisted size, order, removal, and patient restored in a new process';
  }
  check(cards().length === 1, 'First-run defaults');
  // Exercise the actual HTML5 DragEvent/DataTransfer handlers in Chromium.
  // This covers event wiring; it does not claim a native pointer-gesture test.
  const drag = (source, target) => {
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    check(dataTransfer.types.includes('application/x-smart-home-widget'), 'Missing drag payload');
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
  };
  drag(document.querySelector('.palette-item'), document.querySelector('.drop-zone'));
  check(cards().length === 2, 'Tray drop must add a card');
  const addedId = cards()[1].dataset.instanceId;
  drag(cards()[1].querySelector('.drag-handle'), cards()[0]);
  check(cards()[0].dataset.instanceId === addedId, 'Card drop must reorder');
  for (const size of ['S', 'M', 'L']) {
    const select = cards()[0].querySelector('select');
    select.value = size;
    select.dispatchEvent(new Event('change'));
    check(cards()[0].classList.contains(`size-${size}`), `Resize ${size}`);
  }
  cards()[1].querySelector('button[aria-label^="Remove"]').click();
  check(cards().length === 1, 'Remove card');
  const patient = document.getElementById('patient-select');
  patient.value = 'patient-002';
  patient.dispatchEvent(new Event('change'));
  check(cards()[0].textContent.includes('Hello, Jordan.'), 'Widgets rerender on patient switch');
  await saved();
  const prefs = await window.api.getPrefs();
  const layout = prefs.clinicians[prefs.activeClinicianId].layout;
  check(layout.widgets[0].instanceId === addedId && layout.widgets[0].size === 'L', 'IPC persisted layout');
  return 'isolated bridge, mock data, HTML5 drag handlers, S/M/L, remove, and patient changes passed';
}
