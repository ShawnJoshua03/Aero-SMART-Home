const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createPreferenceStore } = require('../src/preferences');
const survey = require('../data/survey.json');
const data = require('../data/responses.json');

test('mock cohort has valid question answers, regions, baseline bands, and planted signals', () => {
  assert.equal(data.patients.length, 6);
  assert.equal(data.entries.length, 245);
  const regions = new Set(survey.bodyDiagram.regions.map(region => region.id));
  const ids = new Set();
  for (const entry of data.entries) {
    assert(!ids.has(entry.id)); ids.add(entry.id);
    assert(data.patients.some(patient => patient.id === entry.patientId));
    assert.equal(entry.surveyId, survey.id);
    assert(!Number.isNaN(Date.parse(entry.timestamp)));
    for (const question of survey.questions) {
      const value = entry.answers[question.id];
      if (!question.required && value === undefined) continue;
      if (['slider', 'number'].includes(question.type)) assert(value >= question.min && value <= question.max);
      if (question.type === 'radio') assert(question.options.some(option => option.value === value));
      if (question.type === 'multiple_choice') assert(value.every(v => question.options.some(option => option.value === v)));
    }
    for (const report of entry.bodyReports) {
      assert(regions.has(report.region));
      assert(report.intensity >= 0 && report.intensity <= 10);
      assert(!Number.isNaN(Date.parse(report.timestamp)));
    }
  }
  const entriesFor = pattern => data.entries.filter(e => e.patientId === data.patients.find(p => p.demoPattern === pattern).id);
  const mean = entries => entries.reduce((sum, e) => sum + e.answers.breathlessness, 0) / entries.length;
  const worsening = entriesFor('worsening');
  assert(mean(worsening.slice(-7)) > mean(worsening.slice(0, 14)) + 3);
  assert.equal(entriesFor('adherence_gap').length, 35);
  assert(entriesFor('adherence_gap').some(e => !e.answers.controller_taken));
  assert.equal(entriesFor('sudden_spike').filter(e => e.answers.breathlessness >= 8).length, 1);
  assert(Math.abs(mean(entriesFor('stable').slice(-7)) - mean(entriesFor('stable').slice(0, 14))) < 0.2);
  for (const patient of data.patients) {
    for (const [id, stats] of Object.entries(patient.baseline.stats)) {
      const baseline = data.entries.filter(e => e.patientId === patient.id && e.date <= patient.baseline.end && e.date >= patient.baseline.start);
      const actualMean = baseline.reduce((sum, e) => sum + Number(e.answers[id]), 0) / baseline.length;
      assert.equal(stats.n, baseline.length);
      assert(Math.abs(stats.mean - actualMean) < 0.001);
      assert(stats.bandLow <= stats.mean && stats.mean <= stats.bandHigh);
    }
  }
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
