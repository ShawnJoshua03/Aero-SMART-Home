// Aero: a small crane fixed at the bottom-right. Tap him to talk; what he says appears in a bubble above him.
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
    puff: 'assets/aero/aero-puff-animated.svg',
  };
  // Poses he picks from (never the same twice in a row) when you pick him up.
  const DRAG_POSES = ['puff', 'greeting', 'listening', 'alert'];
  // Mood tag from the model -> pose held for a few seconds after a reply.
  const MOOD_POSE = { calm: 'idle', happy: 'happy', curious: 'listening', concerned: 'sad', alert: 'alert' };

  const api = window.api && window.api.aero;
  if (!api) return;

  const WALKER_W = 84;
  const WALKER_H = Math.round(WALKER_W * 410 / 300);
  const MARGIN = 12;
  const DOCK_CLEARANCE = 96;   // the page's bottom dock is about 80px tall; start above it
  const DRAG_THRESHOLD = 6;     // px of movement before a press becomes a drag instead of a tap
  const POS_KEY = 'aero-position';
  const SILENCE_MS = 1400;      // stop listening after this much quiet once the doctor has spoken
  const NO_SPEECH_MS = 8000;    // give up if nothing is said
  const MAX_LISTEN_MS = 25000;
  const SPEECH_LEVEL = 0.02;    // RMS above this counts as speech

  const state = {
    history: [], patientId: null, muted: false, busy: false, status: null,
    ctx: null, source: null, speakToken: 0, pose: 'idle', bubbleTimer: null, poseTimer: null,
    dragging: false, lastDragPose: null, x: 0, y: 0,
  };

  const root = document.createElement('aside');
  root.className = 'aero';
  root.setAttribute('aria-label', 'Aero assistant');
  root.innerHTML = `
    <div class="aero-bubble" role="status" aria-live="polite" hidden></div>
    <button class="aero-mute" type="button" aria-pressed="false" aria-label="Mute Aero's voice">Mute</button>
    <button class="aero-body" type="button" aria-label="Talk to Aero"><img alt="" class="aero-face" width="${WALKER_W}"></button>`;
  document.body.appendChild(root);

  const bubble = root.querySelector('.aero-bubble');
  const body = root.querySelector('.aero-body');
  const face = root.querySelector('.aero-face');
  const mute = root.querySelector('.aero-mute');

  // ---------- pose and bubble ----------
  function setMood(mood, force) {
    if (state.dragging && !force) return;   // while he is being carried, only the drag animation shows
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
    bubble.textContent = text;
    bubble.dataset.kind = kind;
    bubble.hidden = !text;
    fitBubble();
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
    if (state.muted || !state.status || !state.status.voice) {
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
  async function greet() {
    if (!state.patientId || !state.status || !state.status.chat) return;
    state.history = [];
    const reply = await run(() => api.greet(state.patientId));
    if (reply) { state.history.push({ role: 'assistant', content: reply.text }); await say(reply.text, reply.mood, true); }
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
    state.patientId = next;
    stopSpeaking();
    greet();
  }
  function watchPatients() {
    const menu = document.getElementById('patient-menu');
    if (!menu) { showBubble('I can\'t find the patient picker on this page.', 'note', 8000); return; }
    new MutationObserver(onPatientChange).observe(menu, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
    onPatientChange();
  }

  // ---------- speech in: tap to start, tap again (or just stop talking) to send ----------
  const rec = { media: null, stream: null, chunks: [], active: false, starting: false, timers: [], ctx: null };
  function clearListenTimers() { rec.timers.forEach(clearInterval); rec.timers.forEach(clearTimeout); rec.timers = []; }

  async function startListening() {
    if (rec.active || rec.starting || state.busy) return;
    rec.starting = true;
    try {
      stopSpeaking();
      rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec.chunks = [];
      rec.media = new MediaRecorder(rec.stream);
      rec.media.ondataavailable = (event) => { if (event.data.size) rec.chunks.push(event.data); };
      rec.media.onstop = finishListening;
      rec.media.start();
      rec.active = true;
      setMood('listening');
      showBubble('Listening…', 'note');
      watchForSilence();
    } catch {
      showBubble('I couldn\'t use the microphone. Check that one is connected and allowed.', 'note', 8000);
      releaseStream();
    } finally {
      rec.starting = false;
    }
  }
  // Auto-stop once the doctor has spoken and then gone quiet.
  function watchForSilence() {
    rec.ctx = new AudioContext();
    const analyser = rec.ctx.createAnalyser();
    analyser.fftSize = 1024;
    rec.ctx.createMediaStreamSource(rec.stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();
    let lastSpeech = 0;
    rec.timers.push(setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
      const now = Date.now();
      if (rms > SPEECH_LEVEL) lastSpeech = now;
      if (lastSpeech && now - lastSpeech > SILENCE_MS) stopListening();
      else if (!lastSpeech && now - startedAt > NO_SPEECH_MS) stopListening(true);
      else if (now - startedAt > MAX_LISTEN_MS) stopListening();
    }, 100));
  }
  function stopListening(nothingHeard) {
    rec.nothingHeard = Boolean(nothingHeard);
    if (rec.active && rec.media.state === 'recording') rec.media.stop();
  }
  function releaseStream() {
    clearListenTimers();
    if (rec.ctx) { rec.ctx.close().catch(() => {}); rec.ctx = null; }
    if (rec.stream) rec.stream.getTracks().forEach((track) => track.stop());
    rec.stream = null;
    rec.active = false;
  }
  async function finishListening() {
    const mimeType = rec.media.mimeType || 'audio/webm';
    const blob = new Blob(rec.chunks, { type: mimeType });
    const nothing = rec.nothingHeard;
    releaseStream();
    if (nothing || blob.size < 2000) { setMood('idle'); showBubble('I didn\'t catch anything. Tap me and try again.', 'note', 5000); return; }
    setMood('thinking');
    showBubble('Hm, let me look…', 'note');
    const heard = await api.listen(new Uint8Array(await blob.arrayBuffer()), mimeType);
    if (!heard.ok) { setMood('idle'); showBubble(heard.error, 'note', 8000); return; }
    if (!heard.text) { setMood('idle'); showBubble('I didn\'t catch that. Tap me and try again.', 'note', 5000); return; }
    showBubble(`“${heard.text}”`, 'you');
    await ask(heard.text);
  }

  // ---------- placing and dragging him ----------
  function place(x, y) {
    state.x = Math.min(Math.max(MARGIN / 2, x), Math.max(MARGIN / 2, window.innerWidth - WALKER_W - MARGIN / 2));
    state.y = Math.min(Math.max(MARGIN / 2, y), Math.max(MARGIN / 2, window.innerHeight - WALKER_H - MARGIN / 2));
    root.style.left = `${state.x}px`;
    root.style.top = `${state.y}px`;
    root.classList.toggle('aero--left', state.x < 80);   // keep the mute chip on-screen
    fitBubble();
  }
  // Keep the bubble inside the window: slide it sideways if needed, flip below him if there is no room above.
  function fitBubble() {
    if (bubble.hidden) return;
    root.classList.remove('aero--top');
    bubble.style.translate = '';
    let r = bubble.getBoundingClientRect();
    if (r.top < 6) { root.classList.add('aero--top'); r = bubble.getBoundingClientRect(); }
    let dx = 0;
    if (r.left < 6) dx = 6 - r.left;
    else if (r.right > window.innerWidth - 6) dx = window.innerWidth - 6 - r.right;
    if (dx) bubble.style.translate = `${dx}px 0`;
  }
  const savePosition = () => { try { localStorage.setItem(POS_KEY, JSON.stringify({ x: state.x / window.innerWidth, y: state.y / window.innerHeight })); } catch { /* storage may be unavailable */ } };
  function initialPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { place(saved.x * window.innerWidth, saved.y * window.innerHeight); return; }
    } catch { /* ignore bad saved value */ }
    place(window.innerWidth - WALKER_W - MARGIN, window.innerHeight - WALKER_H - DOCK_CLEARANCE);
  }
  window.addEventListener('resize', () => place(state.x, state.y));

  const drag = { id: null, startX: 0, startY: 0, offX: 0, offY: 0, lastX: 0, moved: false, suppressClick: false };
  body.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    drag.id = event.pointerId;
    drag.startX = event.clientX; drag.startY = event.clientY;
    drag.offX = event.clientX - state.x; drag.offY = event.clientY - state.y;
    drag.lastX = event.clientX; drag.moved = false;
    body.setPointerCapture(event.pointerId);
  });
  body.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      state.dragging = true;
      root.classList.add('aero-dragging');
      // A different animation each time he is picked up.
      const choices = DRAG_POSES.filter((p) => p !== state.lastDragPose);
      state.lastDragPose = choices[Math.floor(Math.random() * choices.length)];
      clearTimeout(state.poseTimer);
      state.pose = 'dragging';
      face.src = IMAGES[state.lastDragPose];
      root.dataset.mood = 'dragging';
    }
    place(event.clientX - drag.offX, event.clientY - drag.offY);
    // Dangle: tilt against the direction of travel, like he is being carried by the head.
    const tilt = Math.max(-18, Math.min(18, (event.clientX - drag.lastX) * 2));
    face.style.rotate = `${-tilt}deg`;
    drag.lastX = event.clientX;
  });
  function endDrag(event) {
    if (event.pointerId !== drag.id) return;
    drag.id = null;
    if (!drag.moved) return;
    state.dragging = false;
    drag.suppressClick = true;
    setTimeout(() => { drag.suppressClick = false; }, 0);
    root.classList.remove('aero-dragging');
    face.style.rotate = '';
    savePosition();
    // Landing: a happy little hop, then back to whatever he was doing.
    root.classList.add('aero-landed');
    setTimeout(() => root.classList.remove('aero-landed'), 600);
    if (rec.active) setMood('listening', true);
    else holdPose('happy', 1800);
  }
  body.addEventListener('pointerup', endDrag);
  body.addEventListener('pointercancel', endDrag);

  // ---------- tapping Aero ----------
  body.addEventListener('click', () => {
    if (drag.suppressClick || !state.status) return;
    if (rec.active) { stopListening(); return; }
    if (state.busy) return;
    if (!state.status.chat) { showBubble('I\'m asleep. Add ANTHROPIC_API_KEY (and the Cartesia keys for voice) to the .env file and restart.', 'note', 10000); return; }
    if (!state.status.voice) { greet(); return; }   // no mic path without Cartesia: tap replays the update
    startListening();
  });
  mute.addEventListener('click', () => {
    state.muted = !state.muted;
    mute.setAttribute('aria-pressed', String(state.muted));
    mute.textContent = state.muted ? 'Unmute' : 'Mute';
    if (state.muted) { stopSpeaking(); if (state.pose === 'speaking') setMood('idle'); }
  });

  (async function start() {
    initialPosition();
    setMood('idle');
    const status = await api.status();
    state.status = status.ok ? status : { chat: false, voice: false, stub: true };
    if (!state.status.chat) {
      setMood('sleepy');
      showBubble('I\'m asleep. Add ANTHROPIC_API_KEY (and the Cartesia keys for voice) to the .env file and restart.', 'note', 12000);
      return;
    }
    if (!state.status.voice) showBubble('Voice is off (no Cartesia key). Tap me to hear the latest update as text.', 'note', 8000);
    // The patient list loads asynchronously; the observer picks up the first selection once it is there.
    watchPatients();
  }());
}());
