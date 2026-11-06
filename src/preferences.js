const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');

function validateLayout(layout) {
  const text = JSON.stringify(layout);
  if (!text || text.length > 100000 || !layout || typeof layout.patientId !== 'string' ||
      !Array.isArray(layout.widgets) || layout.widgets.length > 100) {
    throw new Error('Invalid layout');
  }
  const ids = new Set();
  const widgets = layout.widgets.map((item) => {
    if (!item || typeof item.instanceId !== 'string' || !item.instanceId.length ||
        typeof item.widgetId !== 'string' || !item.widgetId.length ||
        !['S', 'M', 'L'].includes(item.size) || ids.has(item.instanceId) ||
        (item.config !== undefined && (!item.config || typeof item.config !== 'object' || Array.isArray(item.config)))) {
      throw new Error('Invalid widget layout');
    }
    ids.add(item.instanceId);
    return { instanceId: item.instanceId, widgetId: item.widgetId, size: item.size, config: item.config ?? {} };
  });
  return JSON.parse(JSON.stringify({ patientId: layout.patientId, widgets }));
}

function createPreferenceStore(filename, defaults) {
  let pending = Promise.resolve();
  const readFile = async () => JSON.parse(await fs.readFile(filename, 'utf8'));
  return {
    async initialize() {
      await fs.mkdir(path.dirname(filename), { recursive: true });
      try { await fs.copyFile(defaults, filename, constants.COPYFILE_EXCL); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    },
    async read() { await pending; return readFile(); },
    save(layout) {
      const clean = validateLayout(layout);
      const operation = pending.then(async () => {
        const prefs = await readFile();
        prefs.clinicians[prefs.activeClinicianId].layout = clean;
        // Serialize and atomically replace so rapid edits never leave half-written JSON.
        await fs.writeFile(`${filename}.tmp`, `${JSON.stringify(prefs, null, 2)}\n`, 'utf8');
        await fs.rename(`${filename}.tmp`, filename);
        return prefs;
      });
      pending = operation.catch(() => {});
      return operation;
    },
  };
}

module.exports = { createPreferenceStore, validateLayout };
