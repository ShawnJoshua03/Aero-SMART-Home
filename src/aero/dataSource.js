// Data-source contract for Aero. Anything passed to createTools() must provide:
//   listPatients()            -> [{ id, name }]
//   getChanges(patientId)     -> [{ title, detail, severity: 'info'|'watch'|'alert' }]
//   getAnomalies(patientId)   -> [{ metric, when, value, baseline, note }]
//   getTrend(patientId, metric) -> { metric, unit, points: [{ date, value }], sparse: boolean }
//   getBodyReports(patientId) -> [{ region, date, intensity, note }]
//   getAdherence(patientId)   -> { daysAnswered, daysExpected, missedRecent: number }
// All methods may be sync or async. Later, a real source built on the data adapter
// replaces stubSource; nothing else in src/aero needs to change.

const STUB_PATIENTS = [
  { id: 'demo-1', name: 'Demo Patient A' },
  { id: 'demo-2', name: 'Demo Patient B' },
];

const stubSource = {
  isStub: true,
  listPatients: () => STUB_PATIENTS,
  getChanges: (id) => (id === 'demo-1'
    ? [
      { title: 'Breathlessness up', detail: 'Score 6 this week versus 3 the week before.', severity: 'watch' },
      { title: 'Rescue inhaler use rising', detail: '4 uses in 2 days.', severity: 'alert' },
    ]
    : [{ title: 'Stable', detail: 'No notable change since last visit.', severity: 'info' }]),
  getAnomalies: (id) => (id === 'demo-1'
    ? [{ metric: 'rescue_inhaler_uses', when: 'yesterday', value: 4, baseline: 1, note: 'Well above this patient\'s usual.' }]
    : []),
  getTrend: (id, metric) => ({
    metric,
    unit: 'score',
    sparse: true,
    points: [{ date: '2000-01-01', value: 3 }, { date: '2000-01-08', value: id === 'demo-1' ? 6 : 3 }],
  }),
  getBodyReports: () => [],
  getAdherence: () => ({ daysAnswered: 5, daysExpected: 7, missedRecent: 2 }),
};

module.exports = { stubSource };
