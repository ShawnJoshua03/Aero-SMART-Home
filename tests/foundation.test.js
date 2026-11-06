const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createPreferenceStore } = require('../src/preferences');
const { normalizeData } = require('../src/data');
const raw = require('../data/responses.json');

test('dataset is one asthma survey, one patient, 100 valid records with planted anomalies', () => {
  assert.equal(raw.surveys.length, 1);
  assert.equal(raw.patients.length, 1);
  assert.equal(raw.responses.length, 100);
  const survey = raw.surveys[0];
  const ids = new Set();
  for (const r of raw.responses) {
    assert(!ids.has(r.id)); ids.add(r.id);
    assert.equal(r.patientId, raw.patients[0].id);
    assert.equal(r.surveyId, survey.id);
    assert(!Number.isNaN(Date.parse(r.submittedAt)));
    for (const q of survey.questions) {
      const v = r.answers[q.id];
      if (q.type === 'slider') assert(v >= q.min && v <= q.max, q.id);
      if (q.type === 'radio') assert(q.options.includes(v), q.id);
      if (q.type === 'mcq') assert(v.every(x => q.options.includes(x)), q.id);
    }
  }
  const b = raw.responses.map(r => r.answers.breathlessness);
  assert(b.filter(x => x >= 8).length >= 5, 'spikes present');
  assert(b.filter(x => x <= 3).length >= 50, 'baseline present');
});

test('normalizeData produces the renderer shape', () => {
  const d = normalizeData(raw);
  assert.equal(d.survey.id, 'asthma-daily');
  assert.equal(d.entries.length, 100);
  assert(d.entries.every((e, i) => i === 0 || d.entries[i - 1].timestamp <= e.timestamp));
  assert.equal(d.entries[0].date, d.period.start);
  assert.equal(d.period.expectedDays, 100);
});

test('preferences seed once, serialize rapid saves, survive restart, and reject invalid changes', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-home-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'preferences.json');
  const defaults = path.resolve(__dirname, '../data/preferences.json');
  const store = createPreferenceStore(filename, defaults);
  await store.initialize();
  const prefs = await store.read();
  const layout = prefs.clinicians[prefs.activeClinicianId].layout;
  await Promise.all(['S', 'M', 'L'].map(size => store.save({ ...layout, widgets: [{ ...layout.widgets[0], size }] })));
  const restarted = createPreferenceStore(filename, defaults);
  await restarted.initialize();
  assert.equal((await restarted.read()).clinicians[prefs.activeClinicianId].layout.widgets[0].size, 'L');
  assert.throws(() => store.save({ ...layout, widgets: [{ ...layout.widgets[0], size: 'XL' }] }));
  assert.throws(() => store.save({ ...layout, widgets: [layout.widgets[0], layout.widgets[0]] }));
  await store.save({ ...layout, widgets: [] });
  assert.deepEqual((await restarted.read()).clinicians[prefs.activeClinicianId].layout.widgets, []);
});

test('registry validates extensions and protects registration metadata', async () => {
  const window = { dispatchEvent() {} };
  vm.runInNewContext(await fs.readFile(path.resolve(__dirname, '../src/renderer/widgets/registry.js'), 'utf8'), { window, Event });
  const sizes = ['S', 'M', 'L'];
  const widget = { id: 'test', title: 'Test', sizes, render() {} };
  window.Widgets.register(widget);
  sizes.pop();
  assert.equal(window.Widgets.get('test').sizes.length, 3);
  window.Widgets.list().pop();
  assert.equal(window.Widgets.list().length, 1);
  assert.throws(() => window.Widgets.register(widget));
  assert.throws(() => window.Widgets.register({ ...widget, id: 'bad', sizes: ['XL'] }));
  assert.equal(window.Widgets.get('missing'), undefined);
});
