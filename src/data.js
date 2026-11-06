// Normalises data/responses.json ({ surveys, patients, responses }) into the shape the renderer uses:
// { survey, surveys, patients, entries, period }. Answers are passed through unchanged.
function normalizeData(raw) {
  const surveys = raw.surveys ?? [];
  const entries = (raw.responses ?? []).map((r) => ({
    id: r.id, patientId: r.patientId, surveyId: r.surveyId,
    date: r.submittedAt.slice(0, 10), timestamp: r.submittedAt, answers: r.answers,
  })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const dates = entries.map((e) => e.date);
  const start = dates[0] ?? null;
  const end = dates.at(-1) ?? null;
  const expectedDays = start ? Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1 : 0;
  return { survey: surveys[0] ?? null, surveys, patients: raw.patients ?? [], entries, period: { start, end, expectedDays } };
}
module.exports = { normalizeData };
