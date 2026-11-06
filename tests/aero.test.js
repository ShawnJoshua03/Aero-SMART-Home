const test = require('node:test');
const assert = require('node:assert/strict');
const { createTools } = require('../src/aero/tools');
const { stubSource } = require('../src/aero/dataSource');
const { createAero } = require('../src/aero/llm');
const { createSpeaker } = require('../src/aero/cartesia');

test('tools return patient-specific data and flag stub data', async () => {
  const tools = createTools(stubSource);
  const a = await tools.run('get_anomalies', 'demo-1');
  const b = await tools.run('get_anomalies', 'demo-2');
  assert.equal(a.data.length, 1);
  assert.equal(b.data.length, 0);
  assert.match(a.note, /Placeholder/);
  assert.ok((await tools.run('nope', 'demo-1')).error);
});

test('llm loop runs a tool then returns text', async () => {
  const replies = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_changes', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '[mood: concerned] Breathlessness is up.' }] },
  ];
  const seen = [];
  const fetchImpl = async (_url, init) => {
    seen.push(JSON.parse(init.body));
    return { ok: true, json: async () => replies.shift() };
  };
  const aero = createAero({ tools: createTools(stubSource), apiKey: 'k', fetchImpl });
  assert.deepEqual(await aero.greet('demo-1'), { text: 'Breathlessness is up.', mood: 'concerned' });
  const toolResult = seen[1].messages.at(-1).content[0];
  assert.equal(toolResult.type, 'tool_result');
  assert.match(toolResult.content, /Breathlessness up/);
});

test('llm refuses without a key; speaker refuses without config', async () => {
  const aero = createAero({ tools: createTools(stubSource), apiKey: '' });
  await assert.rejects(aero.ask('demo-1', [], 'hi'), /API key/);
  await assert.rejects(createSpeaker({}).speak('hi'), /not configured/);
});

test('speaker returns audio bytes', async () => {
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
  const audio = await createSpeaker({ apiKey: 'k', voiceId: 'v', fetchImpl }).speak('hi');
  assert.equal(audio.length, 3);
});

test('transcribe posts a file and returns text', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ text: ' what changed? ' }) }; };
  const text = await createSpeaker({ apiKey: 'k', fetchImpl }).transcribe(new Uint8Array([1, 2, 3]));
  assert.equal(text, 'what changed?');
  assert.match(seen.url, /\/stt$/);
  assert.ok(seen.init.body instanceof FormData);
  await assert.rejects(createSpeaker({}).transcribe(new Uint8Array([1])), /not configured/);
});

const { createRealSource } = require('../src/aero/realSource');

function fakeData(rows) {
  const survey = { id: 's', questions: [
    { id: 'breathlessness', type: 'slider', prompt: 'How breathless?', min: 0, max: 10 },
    { id: 'rescue_inhaler', type: 'radio', prompt: 'Rescue inhaler?', options: ['Yes', 'No'] },
  ] };
  const entries = rows.map(([date, b, r], i) => ({ id: String(i), patientId: 'p', surveyId: 's', date, timestamp: `${date}T08:00:00Z`, answers: { breathlessness: b, rescue_inhaler: r } }));
  return { survey, surveys: [survey], patients: [{ id: 'p', name: 'P' }], entries };
}
const days = (n, f) => Array.from({ length: n }, (_, i) => [new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), ...f(i)]);

test('real source flags a spike against the patient\'s own baseline', async () => {
  const rows = days(20, (i) => (i >= 18 ? [9, 'Yes'] : [2, 'No']));
  const source = createRealSource(async () => fakeData(rows));
  const anomalies = await source.getAnomalies('p');
  assert.ok(anomalies.some((a) => a.metric === 'breathlessness' && a.value === 9));
  assert.ok(anomalies.some((a) => a.metric === 'rescue_inhaler'));
  const changes = await source.getChanges('p');
  assert.ok(changes.some((c) => /breathlessness up/.test(c.title)));
});

test('real source stays quiet on stable data and sparse data', async () => {
  const stable = createRealSource(async () => fakeData(days(20, () => [3, 'No'])));
  assert.deepEqual(await stable.getAnomalies('p'), []);
  const sparse = createRealSource(async () => fakeData(days(3, () => [3, 'No'])));
  assert.deepEqual(await sparse.getAnomalies('p'), []);
  assert.equal((await sparse.getTrend('p', 'breathlessness')).sparse, true);
  await assert.rejects(sparse.getChanges('nobody'), /Unknown patient/);
  assert.ok((await stable.getTrend('p', 'nonsense')).error);
});

test('fixWavSizes replaces unknown-length WAV sizes', () => {
  const { fixWavSizes } = require('../src/aero/cartesia');
  const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([255, 255, 255, 255]), Buffer.from('WAVEfmt '), Buffer.alloc(20), Buffer.from('data'), Buffer.from([255, 255, 255, 255]), Buffer.alloc(100)]);
  const fixed = fixWavSizes(buf);
  assert.equal(fixed.readUInt32LE(4), buf.length - 8);
  assert.equal(fixed.readUInt32LE(fixed.indexOf('data') + 4), 100);
});

test('parseReply strips the mood tag and falls back to calm', () => {
  const { parseReply } = require('../src/aero/llm');
  assert.deepEqual(parseReply('[mood: happy] Nice!'), { text: 'Nice!', mood: 'happy' });
  assert.deepEqual(parseReply('No tag here.'), { text: 'No tag here.', mood: 'calm' });
  assert.deepEqual(parseReply('[mood: furious] Hm.'), { text: 'Hm.', mood: 'calm' });
});
