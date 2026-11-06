// Aero data source backed by the team's normalized data (see src/data.js).
// Generic by question type: slider = numeric metric, radio Yes/No = binary, mcq = categories, text = notes.
// "Now" is the latest entry in the data, so demo data from the past still reads as current.
// Anomaly/change flags are simple statistics, not a trained model (the ML piece stays mocked per CLAUDE.md).

const DAY = 864e5;
const MIN_FOR_BASELINE = 8;   // fewer entries than this: no baseline, flagged sparse
const WINDOW_DAYS = 7;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  const m = mean(xs);
  return xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0;
};
const round = (n) => (n === null ? null : Math.round(n * 10) / 10);
const norm = (s) => String(s).toLowerCase().replace(/[_-]+/g, ' ').trim();
const isYesNo = (q) => q.type === 'radio' && q.options?.length === 2
  && q.options.map((o) => o.toLowerCase()).sort().join() === 'no,yes';

function createRealSource(getData) {
  async function load(patientId) {
    const data = await getData();
    const patient = data.patients.find((p) => p.id === patientId);
    if (!patient) throw new Error(`Unknown patient: ${patientId}`);
    const entries = data.entries.filter((e) => e.patientId === patientId);
    const surveys = new Map(data.surveys.map((s) => [s.id, s]));
    const questions = new Map();
    for (const e of entries) for (const q of surveys.get(e.surveyId)?.questions ?? []) questions.set(q.id, q);
    const now = Date.parse(data.entries.at(-1)?.date ?? entries.at(-1)?.date ?? new Date().toISOString().slice(0, 10));
    return { patient, entries, questions: [...questions.values()], now };
  }

  const inWindow = (entries, now, fromDaysAgo, toDaysAgo) => entries.filter((e) => {
    const age = Math.round((now - Date.parse(e.date)) / DAY);
    return age >= fromDaysAgo && age < toDaysAgo;
  });
  const series = (entries, q) => entries
    .filter((e) => typeof e.answers[q.id] === 'number')
    .map((e) => ({ date: e.date, value: e.answers[q.id] }));
  const yesCount = (entries, q) => entries.filter((e) => e.answers[q.id] === 'Yes').length;

  function resolveQuestion(questions, metric) {
    const m = norm(metric);
    return questions.find((q) => norm(q.id) === m)
      || questions.find((q) => norm(q.id).includes(m) || m.includes(norm(q.id)))
      || questions.find((q) => norm(q.prompt).includes(m));
  }

  return {
    isStub: false,

    async listPatients() {
      return (await getData()).patients.map((p) => ({ id: p.id, name: p.name }));
    },

    async getChanges(patientId) {
      const { entries, questions, now } = await load(patientId);
      if (!entries.length) return [{ title: 'No check-ins yet', detail: 'This patient has not answered any questionnaire.', severity: 'info' }];
      const recent = inWindow(entries, now, 0, WINDOW_DAYS);
      const prior = inWindow(entries, now, WINDOW_DAYS, WINDOW_DAYS * 2);
      const out = [];
      if (!prior.length) out.push({ title: 'Not enough history', detail: `Only ${entries.length} check-in(s); no earlier week to compare with.`, severity: 'info' });
      for (const q of questions) {
        if (q.type === 'slider' && recent.length && prior.length) {
          const a = mean(series(recent, q).map((p) => p.value));
          const b = mean(series(prior, q).map((p) => p.value));
          if (a === null || b === null) continue;
          const range = (q.max ?? 10) - (q.min ?? 0);
          const delta = a - b;
          if (Math.abs(delta) >= range * 0.1) {
            out.push({
              title: `${q.id.replace(/_/g, ' ')} ${delta > 0 ? 'up' : 'down'}`,
              detail: `Average ${round(a)} this week versus ${round(b)} the week before (scale ${q.min ?? 0} to ${q.max ?? 10}).`,
              severity: Math.abs(delta) >= range * 0.2 ? 'watch' : 'info',
            });
          }
        } else if (isYesNo(q) && recent.length && prior.length) {
          const a = yesCount(recent, q);
          const b = yesCount(prior, q);
          if (Math.abs(a - b) >= 2) {
            out.push({
              title: `${q.id.replace(/_/g, ' ')} ${a > b ? 'more often' : 'less often'}`,
              detail: `"Yes" on ${a} of ${recent.length} days this week versus ${b} of ${prior.length} the week before.`,
              severity: a > b ? 'watch' : 'info',
            });
          }
        } else if (q.type === 'mcq' && recent.length) {
          const seen = (es) => new Set(es.flatMap((e) => e.answers[q.id] ?? []));
          const fresh = [...seen(recent)].filter((v) => v !== 'None' && !seen(prior).has(v));
          if (prior.length && fresh.length) out.push({ title: `New ${q.id.replace(/_/g, ' ')}`, detail: `${fresh.join(', ')} reported this week and not the week before.`, severity: 'watch' });
        }
      }
      const lastNote = [...entries].reverse().find((e) => typeof e.answers.note === 'string' && e.answers.note.trim());
      if (lastNote) out.push({ title: 'Latest patient note', detail: `${lastNote.date}: "${lastNote.answers.note.trim().slice(0, 200)}"`, severity: 'info' });
      out.push({ title: 'Last check-in', detail: entries.at(-1).date, severity: 'info' });
      const rank = { alert: 0, watch: 1, info: 2 };
      return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
    },

    async getAnomalies(patientId) {
      const { entries, questions, now } = await load(patientId);
      if (entries.length < MIN_FOR_BASELINE) return [];
      const recent = inWindow(entries, now, 0, 3);
      const baseline = entries.filter((e) => !recent.includes(e));
      const out = [];
      for (const q of questions) {
        if (q.type === 'slider') {
          const base = series(baseline, q).map((p) => p.value);
          const mu = mean(base);
          const sigma = Math.max(sd(base), 0.5);
          for (const point of series(recent, q)) {
            if (Math.abs(point.value - mu) >= 2 * sigma && Math.abs(point.value - mu) >= 2) {
              out.push({ metric: q.id, when: point.date, value: point.value, baseline: round(mu), note: `${round(Math.abs(point.value - mu) / sigma)} standard deviations from this patient's own usual.` });
            }
          }
        } else if (isYesNo(q) && recent.length) {
          const baseRate = yesCount(baseline, q) / baseline.length;
          const recentRate = yesCount(recent, q) / recent.length;
          if (recentRate - baseRate >= 0.5) {
            out.push({ metric: q.id, when: `last ${recent.length} days`, value: `${yesCount(recent, q)} of ${recent.length} Yes`, baseline: `${Math.round(baseRate * 100)}% Yes`, note: 'Much more often than this patient usually reports.' });
          }
        }
      }
      return out;
    },

    async getTrend(patientId, metric) {
      const { entries, questions } = await load(patientId);
      const q = resolveQuestion(questions, metric);
      if (!q) return { metric, error: `No tracked metric matches "${metric}".`, available: questions.map((x) => x.id) };
      const sparse = entries.length < MIN_FOR_BASELINE;
      if (q.type === 'slider') {
        const points = series(entries, q).slice(-30);
        return { metric: q.id, prompt: q.prompt, unit: `scale ${q.min ?? 0} to ${q.max ?? 10}`, points, average: round(mean(points.map((p) => p.value))), sparse };
      }
      const points = entries.slice(-30).map((e) => ({ date: e.date, value: e.answers[q.id] ?? null }));
      return { metric: q.id, prompt: q.prompt, unit: q.type, points, sparse };
    },

    async getBodyReports(patientId) {
      const { entries } = await load(patientId);
      return entries
        .filter((e) => Array.isArray(e.answers.body_regions) && e.answers.body_regions.length)
        .reverse()
        .map((e) => ({ region: e.answers.body_regions.join(', '), date: e.date, intensity: e.answers.body_intensity ?? null, note: e.answers.body_note ?? null }));
    },

    async getAdherence(patientId) {
      const { entries, now } = await load(patientId);
      if (!entries.length) return { daysAnswered: 0, daysExpected: 0, missedRecent: 0 };
      const days = new Set(entries.map((e) => e.date));
      const last14 = [...Array(14).keys()].filter((i) => days.has(new Date(now - i * DAY).toISOString().slice(0, 10))).length;
      const sinceLast = Math.round((now - Date.parse(entries.at(-1).date)) / DAY);
      return { daysAnswered: last14, daysExpected: 14, missedRecent: 14 - last14, daysSinceLastCheckin: sinceLast };
    },
  };
}

module.exports = { createRealSource };
