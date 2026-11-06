const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAppointmentStore, MAX_NOTES } = require('../src/appointments');
const { createTools } = require('../src/aero/tools');
const { createAero } = require('../src/aero/llm');
const { stubSource } = require('../src/aero/dataSource');

const seed = {
  appointments: [
    { id: 'old', patientId: 'p1', start: '2026-09-01T09:00', status: 'past', notes: 'Earlier visit.' },
    { id: 'recent-empty', patientId: 'p1', start: '2026-10-15T09:00', status: 'past', notes: '' },
    { id: 'recent', patientId: 'p1', start: '2026-10-29T10:00', status: 'past', notes: 'Settled after a flare.' },
    { id: 'next', patientId: 'p1', start: '2026-11-13T09:30', status: 'upcoming', notes: '' },
    { id: 'other-patient', patientId: 'p2', start: '2026-11-01T09:00', status: 'past', notes: '' },
  ],
};

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-home-notes-'));
  const defaults = path.join(dir, 'defaults.json');
  await fs.writeFile(defaults, JSON.stringify(seed));
  const store = createAppointmentStore(path.join(dir, 'appointments.json'), defaults);
  await store.initialize();
  return store;
}

test('a dictated note is appended to the most recent past appointment', async () => {
  const store = await makeStore();
  const result = await store.appendToLatestPast('p1', '  Inhaler technique much better.  ', new Date('2026-11-06T15:00:00'));
  assert.equal(result.appointment.id, 'recent');
  const doc = await store.read();
  const recent = doc.appointments.find((a) => a.id === 'recent');
  assert.equal(recent.notes, 'Settled after a flare.\n\n[2026-11-06] Inhaler technique much better.');
  assert.ok(recent.notesUpdatedAt);
  // nothing else changed: not the upcoming visit, older visits, or another patient
  for (const id of ['old', 'recent-empty', 'next', 'other-patient']) {
    assert.equal(doc.appointments.find((a) => a.id === id).notes, seed.appointments.find((a) => a.id === id).notes);
  }
});

test('a second note adds to the first instead of replacing it', async () => {
  const store = await makeStore();
  await store.appendToLatestPast('p1', 'First.', new Date('2026-11-06T09:00:00'));
  await store.appendToLatestPast('p1', 'Second.', new Date('2026-11-06T09:05:00'));
  const recent = (await store.read()).appointments.find((a) => a.id === 'recent');
  assert.match(recent.notes, /Settled after a flare\.\n\n\[2026-11-06\] First\.\n\n\[2026-11-06\] Second\.$/);
});

test('notes start cleanly when the appointment had none, and bad input is rejected', async () => {
  const store = await makeStore();
  const result = await store.appendToLatestPast('p2', 'Seen today.', new Date('2026-11-06T09:00:00'));
  assert.equal(result.appointment.id, 'other-patient');
  assert.equal((await store.read()).appointments.find((a) => a.id === 'other-patient').notes, '[2026-11-06] Seen today.');
  await assert.rejects(store.appendToLatestPast('p1', '   '), /Invalid visit note/);
  await assert.rejects(store.appendToLatestPast('p1', 'x'.repeat(1501)), /Invalid visit note/);
  await assert.rejects(store.appendToLatestPast('nobody', 'hello'), /no past appointment/);
  await assert.rejects(store.appendToLatestPast('p1', 'y'.repeat(1400).repeat(4)), /Invalid visit note/);
  assert.ok(MAX_NOTES >= 5000);
});

test('a patient with only an upcoming appointment gets an error, not a silent save', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-home-notes-'));
  const defaults = path.join(dir, 'defaults.json');
  await fs.writeFile(defaults, JSON.stringify({ appointments: [{ id: 'n', patientId: 'p9', start: '2026-12-01T09:00', status: 'upcoming', notes: '' }] }));
  const store = createAppointmentStore(path.join(dir, 'a.json'), defaults);
  await store.initialize();
  await assert.rejects(store.appendToLatestPast('p9', 'Seen today.'), /no past appointment/);
});

test('the note tool exists only when a writer is provided', async () => {
  assert.ok(!createTools(stubSource).definitions.some((d) => d.name === 'add_visit_note'));
  const calls = [];
  const notes = { add: async (id, text) => { calls.push([id, text]); return { appointment: { id: 'a', start: '2026-10-29T10:00' } }; } };
  const tools = createTools(stubSource, { notes });
  assert.ok(tools.definitions.some((d) => d.name === 'add_visit_note'));
  const out = await tools.run('add_visit_note', 'p1', { note: 'Doing well.' });
  assert.deepEqual(calls, [['p1', 'Doing well.']]);
  assert.equal(out.changed, 'appointments');
  assert.equal(out.data.appointmentDate, '2026-10-29');
  const failing = createTools(stubSource, { notes: { add: async () => { throw new Error('disk full'); } } });
  const bad = await failing.run('add_visit_note', 'p1', { note: 'x' });
  assert.equal(bad.error, 'disk full');
  assert.equal(bad.changed, undefined);
});

test('Aero reports that appointments changed only when a note was actually saved', async () => {
  const notes = { add: async () => ({ appointment: { id: 'a', start: '2026-10-29T10:00' } }) };
  const script = (final) => [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'add_visit_note', input: { note: 'Doing well.' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: final }] },
  ];
  const run = async (writer, replies) => {
    const queue = [...replies];
    const fetchImpl = async () => ({ ok: true, json: async () => queue.shift() });
    return createAero({ tools: createTools(stubSource, { notes: writer }), apiKey: 'k', fetchImpl }).ask('p1', [], 'notes for today: doing well');
  };
  const saved = await run(notes, script('[mood: calm] Saved on your Oct 29 visit.'));
  assert.deepEqual(saved, { text: 'Saved on your Oct 29 visit.', mood: 'calm', changed: ['appointments'] });
  const failed = await run({ add: async () => { throw new Error('nope'); } }, script('[mood: concerned] I could not save that.'));
  assert.equal(failed.changed, undefined);
});
