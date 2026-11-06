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
  await until(() => !document.getElementById('patient-button').disabled);
  check(Object.keys(window.api).sort().join(',') === 'aero,getAppointments,getData,getPrefs,saveAppointmentNotes,savePrefs', 'Bridge surface must be exact');
  check(typeof window.require === 'undefined', 'Renderer must have no Node require');
  check(document.querySelector('[http-equiv="Content-Security-Policy"]').content === "default-src 'self'", 'CSP changed');
  const data = await window.api.getData();
  check(data.patients.length === 1 && data.entries.length === 100 && data.survey.id === 'asthma-daily' && data.period.expectedDays > 0, 'IPC data shape');
  if (stage === 'restart') {
    check(cards().length === 9 && cards()[0].classList.contains('size-L'), 'Restart did not preserve card count/size');
    check(cards()[0].dataset.instanceId !== 'kpi-checkins', 'Restart did not preserve reordered/new card');
    return 'persisted size, order, and removal restored in a new process';
  }
  check(cards().length === 9, 'First-run defaults must be four KPI cards plus five charts');
  check(document.querySelectorAll('.kpi-rail > .widget-card').length === 4, 'KPI cards must sit in one vertical stack');
  const text = cards().map(card => card.querySelector('.widget-body').textContent).join('|');
  check(!/could not render|not registered|No check-ins/.test(text), 'A default widget failed to render');
  check(cards()[0].textContent.includes('100'), 'First KPI card must show 100 check-ins');
  check(document.querySelectorAll('.widget-body svg.sw-chart').length === 3, 'Three time-series charts expected');
  check(document.querySelectorAll('.sw-bar-row').length >= 3 && document.querySelectorAll('.sw-heat .sw-cell').length > 0, 'Symptom charts expected');
  check([...document.querySelectorAll('.sw-kpi-value')].map(e => e.textContent).join('|').includes('Coughing'), 'Top-symptom KPI card expected');
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
  const dockItems = [...document.querySelectorAll('.dock-item')];
  check(dockItems.map(item => item.dataset.page).join() === 'fly,anomalies,data', 'Dock must offer Fly, Anomalies, Data');
  check(document.getElementById('page-fly').classList.contains('is-active') && !document.getElementById('page-fly').hidden && document.getElementById('page-data').hidden, 'Fly is the default landing page');
  for (const name of ['fly', 'anomalies', 'data']) {
    dockItems.find(item => item.dataset.page === name).click();
    await until(() => !document.getElementById('page-' + name).hidden && ['fly', 'anomalies', 'data'].filter(other => other !== name).every(other => document.getElementById('page-' + other).hidden));
    check(dockItems.find(item => item.dataset.page === name).getAttribute('aria-current') === 'page', 'Dock marks the current page');
  }
  await until(() => document.querySelectorAll('#page-anomalies .sw-band').length > 0);
  check(document.querySelectorAll('#page-anomalies svg.sw-chart').length === 1 && document.querySelectorAll('#page-anomalies .sw-band').length > 0, 'Anomalies page needs a chart with highlighted bands: ' + document.querySelectorAll('#page-anomalies svg.sw-chart').length + '/' + document.querySelectorAll('#page-anomalies .sw-band').length + ' ' + document.getElementById('page-anomalies').innerHTML.length);
  check([...document.querySelectorAll('#page-anomalies button')].some(b => b.textContent === 'Recalibrate'), 'Recalibrate button expected');
  dockItems.find(item => item.dataset.page === 'fly').click();
  await until(() => document.querySelectorAll('.fly-card').length === 8);
  check(document.querySelectorAll('.fly-card.is-upcoming').length === 1 && document.querySelectorAll('.fly-card:not(.is-upcoming)').length === 7, 'Fly page needs 1 upcoming and 7 past cards');
  check([...document.querySelectorAll('.fly-tag')].filter(t => t.textContent === 'Past appointment').length === 7, 'Cards must say past/upcoming');
  document.querySelector('.fly-card.is-upcoming').click();
  await until(() => !document.getElementById('fly-modal').hidden && document.querySelector('.flash'));
  const kinds = [];
  for (let i = 0; i < 6; i++) {
    kinds.push(document.querySelector('.flash-kind').textContent);
    const next = document.querySelector('.deck-step[aria-label="Next card"]');
    if (next.disabled) break;
    next.click();
  }
  check(kinds.length === 6 && kinds[0] === 'Trend' && kinds.includes('Anomalies'), 'Deck follows preferences: ' + kinds.join());
  document.getElementById('fly-modal-close').click();
  check(document.getElementById('fly-modal').hidden, 'Flashcard modal closes');
  const emptyPast = [...document.querySelectorAll('.fly-card:not(.is-upcoming)')].find(c => c.querySelector('.fly-missing'));
  check(emptyPast, 'A past appointment starts without notes');
  emptyPast.click();
  await until(() => document.getElementById('fly-notes'));
  document.getElementById('fly-notes').value = 'Smoke test note';
  document.querySelector('.fly-save').click();
  await until(() => document.querySelector('.fly-status').textContent === 'Saved');
  document.getElementById('fly-modal-close').click();
  await until(() => !document.querySelector('.fly-missing'));
  dockItems.find(item => item.dataset.page === 'data').click();
  await until(() => !document.getElementById('page-data').hidden);
  drag(document.querySelector('.palette-item'), document.querySelector('.drop-zone'));
  check(cards().length === 10, 'Tray drop must add a card');
  const addedId = cards()[9].dataset.instanceId;
  drag(cards()[9].querySelector('.drag-handle'), cards()[0]);
  check(cards()[0].dataset.instanceId === addedId, 'Card drop must reorder');
  for (const size of ['S', 'M', 'L']) {
    const select = cards()[0].querySelector('select');
    select.value = size;
    select.dispatchEvent(new Event('change'));
    check(cards()[0].classList.contains(`size-${size}`), `Resize ${size}`);
  }
  cards()[1].querySelector('button[aria-label^="Remove"]').click();
  check(cards().length === 9, 'Remove card');
  await saved();
  const prefs = await window.api.getPrefs();
  const layout = prefs.clinicians[prefs.activeClinicianId].layout;
  check(layout.widgets[0].instanceId === addedId && layout.widgets[0].size === 'L', 'IPC persisted layout');
  return 'isolated bridge, mock data, HTML5 drag handlers, S/M/L, and remove passed';
}
