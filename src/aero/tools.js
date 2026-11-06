// Aero's tools: thin, pure wrappers over a data source (see dataSource.js).
// definitions are in Anthropic tool format; run() executes one by name.

const definitions = [
  {
    name: 'get_changes',
    description: 'What changed for this patient since the last visit, most important first.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_anomalies',
    description: 'Readings unusual for this patient compared with their own baseline.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_trend',
    description: 'Time series for one tracked metric (for example breathlessness, rescue_inhaler_uses).',
    input_schema: {
      type: 'object',
      properties: { metric: { type: 'string', description: 'Metric id or plain-language name.' } },
      required: ['metric'],
    },
  },
  {
    name: 'get_body_reports',
    description: 'Body-diagram pain or discomfort reports, newest first.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_adherence',
    description: 'How many expected check-ins the patient completed, and recent gaps.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

const noteDefinition = {
  name: 'add_visit_note',
  description: 'Save a note the clinician just dictated onto this patient\'s most recent past appointment (today\'s visit counts as that one). Only call it when the clinician\'s own latest message asks you to take or add a note.',
  input_schema: {
    type: 'object',
    properties: { note: { type: 'string', description: 'The clinician\'s note, in their own words, lightly tidied. Add no facts of your own.' } },
    required: ['note'],
  },
};

// options.notes (optional): { add(patientId, text) -> { appointment: { id, start } } }. Without it Aero is read-only.
function createTools(source, { notes } = {}) {
  const handlers = {
    get_changes: (id) => source.getChanges(id),
    get_anomalies: (id) => source.getAnomalies(id),
    get_trend: (id, args) => source.getTrend(id, String(args.metric || '')),
    get_body_reports: (id) => source.getBodyReports(id),
    get_adherence: (id) => source.getAdherence(id),
  };
  if (notes) {
    handlers.add_visit_note = async (id, args) => {
      const saved = await notes.add(id, String(args.note || ''));
      return { saved: true, appointmentDate: saved.appointment.start.slice(0, 10) };
    };
  }
  const changes = { add_visit_note: 'appointments' };

  async function run(name, patientId, args = {}) {
    const handler = handlers[name];
    if (!handler) return { error: `Unknown tool: ${name}` };
    try {
      const result = await handler(patientId, args);
      return { data: result, ...(changes[name] ? { changed: changes[name] } : {}), ...(source.isStub ? { note: 'Placeholder data, not a real patient.' } : {}) };
    } catch (error) {
      return { error: String(error.message || error) };
    }
  }

  return { definitions: notes ? [...definitions, noteDefinition] : definitions, run };
}

module.exports = { createTools, definitions };
