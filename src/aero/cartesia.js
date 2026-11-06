// Cartesia text-to-speech. Runs in the main process only. Returns WAV bytes.
// Endpoint, version and model are from memory: verify against Cartesia's docs.

const TTS_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_VERSION = '2025-04-16';
const DEFAULT_MODEL = 'sonic-3';
const STT_URL = 'https://api.cartesia.ai/stt';
const STT_MODEL = 'ink-whisper';

// Cartesia streams WAV with "unknown length" (0xFFFFFFFF) sizes, which browsers can refuse to decode.
// Rewrite the RIFF and data chunk sizes from the real byte count.
function fixWavSizes(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return buf;
  const out = Buffer.from(buf);
  out.writeUInt32LE(out.length - 8, 4);
  const dataAt = out.indexOf('data', 12, 'ascii');
  if (dataAt > 0) out.writeUInt32LE(out.length - (dataAt + 8), dataAt + 4);
  return out;
}

function createSpeaker({ apiKey, voiceId, fetchImpl = fetch, model = DEFAULT_MODEL }) {
  async function speak(text, { emotion } = {}) {
    if (!apiKey || !voiceId) throw new Error('Voice is not configured (CARTESIA_API_KEY and CARTESIA_VOICE_ID).');
    const response = await fetchImpl(TTS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-API-Key': apiKey,
        'Cartesia-Version': CARTESIA_VERSION,
      },
      body: JSON.stringify({
        model_id: model,
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        generation_config: { speed: 1.05, ...(emotion ? { emotion } : {}) },
        output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
      }),
    });
    if (!response.ok) throw new Error(`Voice request failed (${response.status}).`);
    return fixWavSizes(Buffer.from(await response.arrayBuffer()));
  }
  // audio: Buffer/Uint8Array of a short recording (webm/wav/ogg...). Returns the transcript text.
  async function transcribe(audio, { mimeType = 'audio/webm', language = 'en' } = {}) {
    if (!apiKey) throw new Error('Voice is not configured (CARTESIA_API_KEY).');
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), 'speech.webm');
    form.append('model', STT_MODEL);
    form.append('language', language);
    const response = await fetchImpl(STT_URL, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Cartesia-Version': CARTESIA_VERSION },
      body: form,
    });
    if (!response.ok) throw new Error(`Listening failed (${response.status}).`);
    const result = await response.json();
    return String(result.text || '').trim();
  }

  return { speak, transcribe };
}

module.exports = { createSpeaker, fixWavSizes };
