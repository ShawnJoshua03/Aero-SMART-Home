// Renders the README art (banner and pose sheet) from docs/art/*.html into docs/images/*.png.
// Run:  env -u ELECTRON_RUN_AS_NODE npx electron scripts/capture-readme-art.js
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const docs = path.join(__dirname, '..', 'docs');
fs.mkdirSync(path.join(docs, 'images'), { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'readme-art-')));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});   // keep running between pages; we exit explicitly

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jobs = [
  { page: 'banner', width: 1400, image: 'banner' },
  { page: 'poses', width: 1400, image: 'aero-poses' },
];

app.whenReady().then(async () => {
  for (const job of jobs) {
    const win = new BrowserWindow({ show: true, useContentSize: true, width: job.width, height: 480, frame: false });
    await win.loadFile(path.join(docs, 'art', `${job.page}.html`));
    await sleep(1500);                       // let the animated SVGs load and settle on a frame
    const height = Math.ceil(await win.webContents.executeJavaScript('document.body.getBoundingClientRect().height'));
    win.setContentSize(job.width, Math.max(height, 200));
    await sleep(500);
    // The window may not shrink below a minimum size, so crop to the page's real height.
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: job.width, height });
    fs.writeFileSync(path.join(docs, 'images', `${job.image}.png`), image.toPNG());
    console.log('saved', job.image, `${job.width}x${height}`);
    win.destroy();
  }
  app.exit(0);
});
