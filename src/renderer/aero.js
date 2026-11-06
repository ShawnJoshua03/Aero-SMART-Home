// Aero: a small crane fixed at the bottom-right.
//   Press and hold him to talk, let go and he answers (aloud, and in a bubble above him).
//   Tap him to show or hide his last message.
//   He never speaks or greets on his own; he only answers when asked.
// Talks to the main process through window.api.aero only.
(function () {
  const IMAGES = {
    idle: 'assets/aero/aero-calm-animated.svg',
    listening: 'assets/aero/aero-peek-animated.svg',
    thinking: 'assets/aero/aero-thinking-animated.svg',
    speaking: 'assets/aero/aero-talk-animated.svg',
    greeting: 'assets/aero/aero-wave-animated.svg',
    happy: 'assets/aero/aero-happy-animated.svg',
    alert: 'assets/aero/aero-alert-animated.svg',
    sad: 'assets/aero/aero-sad-animated.svg',
    sleepy: 'assets/aero/aero-sleepy-animated.svg',
  };
  // Mood tag from the model -> pose held for a few seconds after a reply.
  const MOOD_POSE = { calm: 'idle', happy: 'happy', curious: 'listening', concerned: 'sad', alert: 'alert' };

  const api = window.api && window.api.aero;
  if (!api) return;

  const WALKER_W = 84;
  const HOLD_MS = 280;          // press longer than this and it is "hold to talk"; shorter is a tap
  const MAX_LISTEN_MS = 30000;  // safety stop if the button is somehow never released
  const MIN_CLIP_BYTES = 2000;  // shorter recordings are treated as accidental

  const state = {
    history: [], patientId: null, busy: false, status: null,
    ctx: null, source: null, speakToken: 0, pose: 'idle', bubbleTimer: null, poseTimer: null,
    lastText: '',
  };

  const root = document.createElement('aside');
  root.className = 'aero';
  root.setAttribute('aria-label', 'Aero assistant');
  root.innerHTML = `
    <div class="aero-bubble" role="status" aria-live="polite" hidden></div>
    <button class="aero-body" type="button" aria-label="Aero. Hold to talk, tap to show or hide the last message."><img alt="" class="aero-face" width="${WALKER_W}"></button>`;
  document.body.appendChild(root);

  const bubble = root.querySelector('.aero-bubble');
  const body = root.querySelector('.aero-body');
  const face = root.querySelector('.aero-face');

  // ---------- pose and bubble ----------
  function setMood(mood) {
    clearTimeout(state.poseTimer);
    state.pose = mood;
    face.src = IMAGES[mood] || IMAGES.idle;
    root.dataset.mood = mood;
  }
  function holdPose(mood, ms) {
    setMood(mood);
    state.poseTimer = setTimeout(() => { if (state.pose === mood) setMood('idle'); }, ms);
  }
  // kind: 'aero' (his words), 'you' (what the doctor said), 'note' (status). ms: auto-hide after this long.
  function showBubble(text, kind = 'aero', ms = 0) {
    clearTimeout(state.bubbleTimer);
    if (kind === 'aero') state.lastText = text;
    bubble.textContent = text;
    bubble.dataset.kind = kind;
    bubble.hidden = !text;
    if (text && ms) state.bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
  }
  const readTime = (text) => Math.min(20000, 5000 + text.length * 60);

  // ---------- speech out (sentence by sentence; the next sentence is fetched while one plays) ----------
  function sentences(text) {
    const parts = text.match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g) || [text];
    const out = [];
    for (const part of parts) {
      const piece = part.trim();
      if (!piece) continue;
      if (out.length && out[out.length - 1].length < 28) out[out.length - 1] += ` ${piece}`; else out.push(piece);
    }
    return out;
  }
  async function play(audioBytes) {
    state.ctx = state.ctx || new AudioContext();
    const buffer = await state.ctx.decodeAudioData(audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength));
    const source = state.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(state.ctx.destination);
    state.source = source;
    return new Promise((resolve) => { source.onended = resolve; source.start(); });
  }
  function stopSpeaking() {
    state.speakToken += 1;
    if (state.source) { try { state.source.stop(); } catch { /* already stopped */ } state.source = null; }
  }
  async function say(text, mood, opening) {
    const token = (state.speakToken += 1);
    const pose = MOOD_POSE[mood] || 'idle';
    if (!state.status || !state.status.voice) {
      showBubble(text, 'aero', readTime(text));
      holdPose(opening ? 'greeting' : pose, 4000);
      return;
    }
    const chunks = sentences(text);
    let next = api.speak(chunks[0], mood);
    for (let i = 0; i < chunks.length; i += 1) {
      const spoken = await next;
      if (token !== state.speakToken) return;
      if (i + 1 < chunks.length) next = api.speak(chunks[i + 1], mood);
      if (i === 0) showBubble(text, 'aero');   // the whole reply appears as he starts talking
      if (!spoken.ok) { await new Promise((r) => setTimeout(r, 1200 + chunks[i].length * 40)); continue; }
      setMood(i === 0 && opening ? 'greeting' : 'speaking');
      try { await play(spoken.audio); } catch { /* audio failure is non-fatal */ }
      if (token !== state.speakToken) return;
    }
    showBubble(text, 'aero', 9000);
    holdPose(pose, 3500);
  }

  // ---------- talking to the model ----------
  async function run(job) {
    if (state.busy) return null;
    state.busy = true;
    setMood('thinking');
    showBubble('Hm, let me look…', 'note');
    try {
      const result = await job();
      if (result.ok) return result;
      showBubble(result.error, 'note', 8000);
    } catch {
      showBubble('Something went wrong reaching Aero.', 'note', 8000);
    } finally {
      state.busy = false;
      if (state.pose === 'thinking') setMood('idle');
    }
    return null;
  }
  async function ask(question) {
    stopSpeaking();
    if (!state.patientId) { showBubble('Pick a patient first and I\'ll take a look.', 'note', 6000); return; }
    const reply = await run(() => api.ask(state.patientId, state.history, question));
    if (reply) {
      state.history.push({ role: 'user', content: question }, { role: 'assistant', content: reply.text });
      await say(reply.text, reply.mood, false);
    }
  }

  // ---------- which patient is selected (the page's custom picker marks the chosen option aria-selected) ----------
  function currentPatient() {
    const chosen = document.querySelector('#patient-menu [role="option"][aria-selected="true"]');
    return (chosen && chosen.dataset.patientId) || null;
  }
  function onPatientChange() {
    const next = currentPatient();
    if (!next || next === state.patientId) return;
    // He never speaks on his own: switching patient just clears the old conversation and message.
    state.patientId = next;
    state.history = [];
    state.lastText = '';
    stopSpeaking();
    clearTimeout(state.bubbleTimer);
    bubble.hidden = true;
    if (state.pose !== 'listening' && state.pose !== 'thinking') setMood('idle');
  }
  function watchPatients() {
    const menu = document.getElementById('patient-menu');
    if (!menu) { showBubble('I can\'t find the patient picker on this page.', 'note', 8000); return; }
    new MutationObserver(onPatientChange).observe(menu, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
    onPatientChange();
  }

  // ---------- speech in: hold to record, release to send ----------
  const rec = { media: null, stream: null, chunks: [], active: false, starting: false, releaseEarly: false, maxTimer: null, warm: null };

  // Open the mic the moment he is pressed, so it is ready by the time the press counts as a hold and no words are clipped.
  function warmMic() {
    if (rec.warm || rec.active || rec.starting || state.busy || !state.status || !state.status.chat || !state.status.voice) return;
    rec.warm = navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  }
  function dropWarm() {
    const warm = rec.warm;
    rec.warm = null;
    if (warm) warm.then((stream) => stream && stream.getTracks().forEach((track) => track.stop()));
  }

  async function startListening() {
    if (rec.active || rec.starting || state.busy) { dropWarm(); return; }
    rec.starting = true;
    rec.releaseEarly = false;
    try {
      stopSpeaking();
      const warm = rec.warm;
      rec.warm = null;
      rec.stream = (warm && await warm) || await navigator.mediaDevices.getUserMedia({ audio: true });
      rec.chunks = [];
      rec.media = new MediaRecorder(rec.stream);
      rec.media.ondataavailable = (event) => { if (event.data.size) rec.chunks.push(event.data); };
      rec.media.onstop = finishListening;
      rec.media.start();
      rec.active = true;
      rec.maxTimer = setTimeout(stopListening, MAX_LISTEN_MS);
      setMood('listening');
      showBubble('Listening…', 'note');
      if (rec.releaseEarly) stopListening();   // they let go while the mic was still starting up
    } catch {
      showBubble('I couldn\'t use the microphone. Check that one is connected and allowed.', 'note', 8000);
      releaseStream();
    } finally {
      rec.starting = false;
    }
  }
  function stopListening() {
    if (rec.active && rec.media.state === 'recording') rec.media.stop();
  }
  function releaseStream() {
    clearTimeout(rec.maxTimer);
    if (rec.stream) rec.stream.getTracks().forEach((track) => track.stop());
    rec.stream = null;
    rec.active = false;
  }
  async function finishListening() {
    const mimeType = rec.media.mimeType || 'audio/webm';
    const blob = new Blob(rec.chunks, { type: mimeType });
    releaseStream();
    if (blob.size < MIN_CLIP_BYTES) { setMood('idle'); showBubble('I didn\'t catch that. Hold me a little longer while you talk.', 'note', 5000); return; }
    setMood('thinking');
    showBubble('Hm, let me look…', 'note');
    const heard = await api.listen(new Uint8Array(await blob.arrayBuffer()), mimeType);
    if (!heard.ok) { setMood('idle'); showBubble(heard.error, 'note', 8000); return; }
    if (!heard.text) { setMood('idle'); showBubble('I didn\'t catch that. Hold me and try again.', 'note', 5000); return; }
    showBubble(`“${heard.text}”`, 'you');
    await ask(heard.text);
  }

  // ---------- pressing Aero: tap = show/hide his last message, hold = talk ----------
  const press = { down: false, timer: null, holding: false };

  function onPress() {
    if (press.down) return;
    press.down = true;
    press.holding = false;
    warmMic();
    press.timer = setTimeout(() => {
      press.holding = true;
      if (!state.status || !state.status.chat) { showBubble('I\'m asleep. Add ANTHROPIC_API_KEY (and the Cartesia keys for voice) to the .env file and restart.', 'note', 10000); return; }
      if (!state.status.voice) { showBubble('Voice is off (no Cartesia key), so I can\'t listen.', 'note', 6000); return; }
      startListening();
    }, HOLD_MS);
  }
  function onRelease() {
    if (!press.down) return;
    press.down = false;
    clearTimeout(press.timer);
    if (press.holding) {
      if (rec.starting) rec.releaseEarly = true; else stopListening();
      return;
    }
    dropWarm();       // it was only a tap, so let the mic go again
    toggleBubble();
  }
  function toggleBubble() {
    clearTimeout(state.bubbleTimer);
    if (!bubble.hidden) { bubble.hidden = true; return; }
    const asleep = !state.status || !state.status.chat;
    const text = state.lastText || (asleep ? 'I\'m asleep. Add the API keys to .env and restart.' : 'Hold me and ask about this patient.');
    bubble.textContent = text;
    bubble.dataset.kind = state.lastText ? 'aero' : 'note';
    bubble.hidden = false;   // stays until the next tap
  }

  body.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    body.setPointerCapture(event.pointerId);
    onPress();
  });
  body.addEventListener('pointerup', onRelease);
  body.addEventListener('pointercancel', onRelease);
  body.addEventListener('contextmenu', (event) => event.preventDefault());
  // Keyboard: hold Space or Enter on him, same as holding with the mouse.
  body.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); onPress(); }
  });
  body.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onRelease(); }
  });

  (async function start() {
    setMood('idle');
    const status = await api.status();
    state.status = status.ok ? status : { chat: false, voice: false, stub: true };
    if (!state.status.chat) {
      setMood('sleepy');
      showBubble('I\'m asleep. Add ANTHROPIC_API_KEY (and the Cartesia keys for voice) to the .env file and restart.', 'note', 12000);
      return;
    }
    if (!state.status.voice) showBubble('Voice is off (no Cartesia key). I\'ll still show updates as text.', 'note', 8000);
    // The patient list loads asynchronously; the observer picks up the first selection once it is there.
    watchPatients();
  }());
}());
