// Regenerates the screenshots used in README.md (docs/images/).
// Run:  env -u ELECTRON_RUN_AS_NODE npx electron scripts/capture-readme-shots.js
// Uses a throwaway profile, so it shows the seeded demo data and never touches your saved layout or notes.
// The two Aero shots make real model calls if ANTHROPIC_API_KEY is set (and save a note into the throwaway
// profile only); otherwise they are skipped.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const out = path.join(__dirname, '..', 'docs', 'images');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'readme-shots-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1.5');   // sharper than 1x, and still fits a laptop screen
require('../src/main');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  await sleep(2500);
  const win = BrowserWindow.getAllWindows()[0];
  win.show();
  win.webContents.setAudioMuted(true);
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.webContents.insertCSS('::-webkit-scrollbar { display: none; }');

  // Waits until a selector exists in the page, so captures do not race the first render.
  const waitFor = async (selector, ms = 15000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${selector}`);
  };
  const shot = async (name) => {
    await sleep(700);
    fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    console.log('saved', name);
  };
  const page = async (name) => { await js(`document.querySelector('.dock-item[data-page="${name}"]').click()`); await sleep(900); };
  const closeModal = async () => { await js(`document.getElementById('fly-modal-close').click()`); await sleep(400); };
  // Aero is hidden in shots where he would cover content; only the Aero shots show him.
  let hideAero = null;
  const aero = async (visible) => {
    if (visible && hideAero) { await win.webContents.removeInsertedCSS(hideAero); hideAero = null; }
    if (!visible && !hideAero) hideAero = await win.webContents.insertCSS('.aero { display: none !important; }');
  };
  const say = (text, face) => js(`(() => {
    const bubble = document.querySelector('.aero-bubble');
    bubble.textContent = ${JSON.stringify(text)};
    bubble.dataset.kind = 'aero';
    bubble.hidden = false;
    document.querySelector('.aero-face').src = 'assets/aero/${face}';
  })()`);

  await aero(false);
  await page('fly');
  await waitFor('.fly-card');
  await shot('fly');

  // Pre-visit flashcards for the upcoming appointment.
  await js(`document.querySelector('.fly-card.is-upcoming').click()`);
  await sleep(900);
  await shot('fly-flashcards');
  await closeModal();

  await page('anomalies');
  await waitFor('#page-anomalies svg');
  await shot('anomalies');

  await page('data');
  await waitFor('#page-data svg');
  await js(`document.querySelector('#page-data svg').scrollIntoView({ block: 'center' })`);
  await shot('data');

  // Aero answers a question, then takes a note that lands on the latest past appointment.
  await page('fly');
  await aero(true);
  try {
    const answer = await js(`window.api.aero.ask('pt-a1', [], 'What changed for her?')`);
    if (!answer.ok) throw new Error(answer.error);
    await say(answer.text, 'aero-talk-animated.svg');
    await shot('aero-answer');
    console.log('Aero said:', answer.text);

    const note = await js(`window.api.aero.ask('pt-a1', [], 'Notes for today: inhaler technique looks much better and she has not woken at night this week.')`);
    if (!note.ok) throw new Error(note.error);
    await say(note.text, 'aero-happy-animated.svg');
    await shot('aero-note');
    console.log('Aero said:', note.text);

    await aero(false);
    await js(`window.dispatchEvent(new CustomEvent('appointments-changed'))`);
    await sleep(900);
    await waitFor('.fly-card:not(.is-upcoming)');
    await js(`document.querySelector('.fly-card:not(.is-upcoming)').click()`);
    await sleep(900);
    await js(`(() => { const area = document.getElementById('fly-notes'); area.scrollTop = area.scrollHeight; })()`);
    await shot('fly-notes');
  } catch (error) { console.log('Aero shots skipped:', error.message); }
  app.exit(0);
});
