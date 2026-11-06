const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');

const MAX_NOTES = 5000;
const MAX_NOTE_LINE = 1500;

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
    // Appends a dated line to the patient's most recent past appointment. Today's visit counts as that one,
    // so notes taken now land on the latest completed appointment. Existing notes are kept, never replaced.
    appendToLatestPast(patientId, text, now = new Date()) {
      const line = typeof text === 'string' ? text.trim() : '';
      if (typeof patientId !== 'string' || !line || line.length > MAX_NOTE_LINE) return Promise.reject(new Error('Invalid visit note'));
      const operation = pending.then(async () => {
        const doc = await readFile();
        const appointment = doc.appointments
          .filter((item) => item.patientId === patientId && item.status !== 'upcoming')
          .sort((a, b) => b.start.localeCompare(a.start))[0];
        if (!appointment) throw new Error('This patient has no past appointment to add notes to');
        const day = new Date(now).toLocaleDateString('en-CA');
        const existing = (appointment.notes || '').trimEnd();
        const next = `${existing ? `${existing}\n\n` : ''}[${day}] ${line}`;
        if (next.length > MAX_NOTES) throw new Error('That appointment\'s notes are full');
        appointment.notes = next;
        appointment.notesUpdatedAt = new Date(now).toISOString();
        await fs.writeFile(`${filename}.tmp`, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        await fs.rename(`${filename}.tmp`, filename);
        return { doc, appointment: { id: appointment.id, start: appointment.start } };
      });
      pending = operation.catch(() => {});
      return operation;
    },
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

module.exports = { createAppointmentStore, MAX_NOTES, MAX_NOTE_LINE };
