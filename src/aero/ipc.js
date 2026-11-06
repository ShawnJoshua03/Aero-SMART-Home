// Registers Aero's IPC handlers. Keys never leave the main process.
const fs = require('node:fs');
const path = require('node:path');
const { createTools } = require('./tools');
const { createAero } = require('./llm');
const { createSpeaker } = require('./cartesia');
const { stubSource } = require('./dataSource');

// Minimal .env reader (KEY=VALUE lines) so we need no extra dependency.
function loadEnvFile(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env is fine */ }
}

const EMOTIONS = { happy: 'happy', calm: 'calm', curious: 'curious', concerned: 'sympathetic', alert: 'serious' };
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const clean =(value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

function registerAero(ipcMain, trustedSender, { source = stubSource, root = path.join(__dirname, '..', '..') } = {}) {
  loadEnvFile(path.join(root, '.env'));
  const aero = createAero({
    tools: createTools(source),
    apiKey: process.env.ANTHROPIC_API_KEY,
    describePatient: async (id) => {
      const patient = (await source.listPatients()).find((p) => p.id === id);
      return patient ? `${patient.name} (id ${id}; use the name, never the id)` : id;
    },
  });
  const speaker = createSpeaker({ apiKey: process.env.CARTESIA_API_KEY, voiceId: process.env.CARTESIA_VOICE_ID });
  const guard = (fn) => async (event, ...args) => {
    trustedSender(event);
    try { return { ok: true, ...(await fn(...args)) }; } catch (error) { return { ok: false, error: String(error.message || error) }; }
  };

  ipcMain.handle('aero:status', guard(() => ({
    chat: Boolean(process.env.ANTHROPIC_API_KEY),
    voice: Boolean(process.env.CARTESIA_API_KEY && process.env.CARTESIA_VOICE_ID),
    stub: Boolean(source.isStub),
  })));
  ipcMain.handle('aero:greet', guard(async (patientId) => aero.greet(clean(patientId, 100))));
  ipcMain.handle('aero:ask', guard(async (patientId, history, text) => {
    const turns = (Array.isArray(history) ? history : []).slice(-10)
      .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant'))
      .map((turn) => ({ role: turn.role, content: clean(turn.content, 2000) }));
    return aero.ask(clean(patientId, 100), turns, clean(text, 1000));
  }));
  ipcMain.handle('aero:listen', guard(async (audio, mimeType) => {
    if (!(audio instanceof Uint8Array) || audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
      throw new Error('That recording was empty or too long.');
    }
    const type = typeof mimeType === 'string' && /^audio\/[a-z0-9.+-]+$/i.test(mimeType.split(';')[0]) ? mimeType.split(';')[0] : 'audio/webm';
    return { text: await speaker.transcribe(audio, { mimeType: type }) };
  }));
  ipcMain.handle('aero:speak', guard(async (text, mood) => ({ audio: new Uint8Array(await speaker.speak(clean(text, 1000), { emotion: EMOTIONS[mood] })) })));
}

module.exports = { registerAero, loadEnvFile };
