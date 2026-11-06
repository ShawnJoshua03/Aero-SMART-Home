const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');

const MAX_NOTES = 5000;

// Appointments live in a writable JSON file seeded once from data/appointments.json.
// Only the notes of an existing appointment can change.
function createAppointmentStore(filename, defaults) {
  let pending = Promise.resolve();
  const readFile = async () => JSON.parse(await fs.readFile(filename, 'utf8'));
  return {
    async initialize() {
      await fs.mkdir(path.dirname(filename), { recursive: true });
      try { await fs.copyFile(defaults, filename, constants.COPYFILE_EXCL); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    },
    async read() { await pending; return readFile(); },
    saveNotes(id, notes) {
      if (typeof id !== 'string' || typeof notes !== 'string' || notes.length > MAX_NOTES) return Promise.reject(new Error('Invalid appointment notes'));
      const operation = pending.then(async () => {
        const doc = await readFile();
        const appointment = doc.appointments.find((item) => item.id === id);
        if (!appointment) throw new Error('Unknown appointment');
        appointment.notes = notes;
        appointment.notesUpdatedAt = new Date().toISOString();
        await fs.writeFile(`${filename}.tmp`, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        await fs.rename(`${filename}.tmp`, filename);
        return doc;
      });
      pending = operation.catch(() => {});
      return operation;
    },
  };
}

module.exports = { createAppointmentStore, MAX_NOTES };
