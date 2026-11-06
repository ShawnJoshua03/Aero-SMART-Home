(() => {
  // Fly page: appointment cards. An upcoming appointment opens a flashcard deck (pre-flight summary);
  // a past appointment opens its notes. Both open in a modal.
  const page = document.getElementById('page-fly');
  const modal = document.getElementById('fly-modal');
  const dialog = document.getElementById('fly-modal-dialog');
  const modalBody = document.getElementById('fly-modal-body');
  const modalTag = document.getElementById('fly-modal-tag');
  const modalTitle = document.getElementById('fly-modal-title');
  const closeButton = document.getElementById('fly-modal-close');
  const FILLS = ['plum', 'blue', 'green', 'teal'];
  const PAST_FILLS = ['blue', 'green', 'teal'];
  const stats = () => window.SurveyStats;

  let doc = null, prefs = null, loading = false, returnFocus = null, keyHandler = null;

  // ---- helpers ----
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  const when = (start) => new Date(start);
  const dayLabel = (start) => when(start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = (start) => when(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fullLabel = (start) => `${when(start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${timeLabel(start)}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const dateOnly = (start) => Date.parse(start.slice(0, 10));
  const plain = (n, d = 1) => (n == null || Number.isNaN(n) ? '–' : n.toFixed(d));

  async function load() {
    if (loading) return;
    loading = true;
    try {
      [doc, prefs] = await Promise.all([window.api.getAppointments(), window.api.getPrefs()]);
      render();
    } catch (error) {
      console.error(error);
      page.replaceChildren(el('p', 'muted', 'Appointments could not be loaded.'));
    } finally { loading = false; }
  }

  // ---- page ----
  function render() {
    const { data, patientId } = window.Canvas.context();
    if (!data) return;
    if (!doc) { load(); return; }
    const patient = data.patients.find((p) => p.id === patientId);
    const mine = doc.appointments.filter((a) => a.patientId === patientId);
    const upcoming = mine.filter((a) => a.status === 'upcoming').sort((a, b) => a.start.localeCompare(b.start));
    const past = mine.filter((a) => a.status !== 'upcoming').sort((a, b) => b.start.localeCompare(a.start));
    page.replaceChildren();
    const head = el('div', 'fly-head');
    head.append(el('h2', null, 'Appointments'), el('p', 'muted', `${patient ? patient.name + ': ' : ''}${upcoming.length} upcoming, ${past.length} past`));
    const list = el('div', 'fly-list');
    if (!mine.length) list.append(el('p', 'muted', 'No appointments for this patient.'));
    upcoming.forEach((appt) => list.append(card(appt, true, 0)));
    past.forEach((appt, i) => list.append(card(appt, false, i)));
    page.append(head, list);
  }

  function card(appt, isUpcoming, index) {
    const node = el('article', `fly-card ${isUpcoming ? 'is-upcoming fill-plum' : 'fill-' + PAST_FILLS[index % PAST_FILLS.length]}`);
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `${isUpcoming ? 'Upcoming' : 'Past'} appointment, ${dayLabel(appt.start)}. ${isUpcoming ? 'Open flashcards' : 'Open notes'}`);
    node.append(el('p', 'fly-tag', isUpcoming ? 'Upcoming appointment' : 'Past appointment'));
    node.append(el('h3', 'fly-date', dayLabel(appt.start)));
    node.append(el('p', 'fly-when', `${timeLabel(appt.start)} · ${appt.type}`));
    node.append(el('p', 'fly-who', appt.clinician));
    if (isUpcoming) {
      node.append(el('p', 'fly-preview', 'Flashcards ready: anomalies, recent history and patterns.'));
    } else if (appt.notes && appt.notes.trim()) {
      node.append(el('p', 'fly-preview', appt.notes));
    } else {
      node.append(el('p', 'fly-preview fly-missing', 'No notes yet. Open to add notes.'));
    }
    const open = () => openModal(appt, isUpcoming, node);
    node.addEventListener('click', open);
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    return node;
  }

  // ---- modal shell ----
  function openModal(appt, isUpcoming, from) {
    returnFocus = from;
    modalBody.replaceChildren();
    dialog.className = 'card-modal-dialog fly-dialog ' + (isUpcoming ? 'fly-upcoming' : 'fly-past');
    modalTag.textContent = isUpcoming ? 'Upcoming appointment' : 'Past appointment';
    modalTitle.textContent = fullLabel(appt.start);
    modalBody.append(el('p', 'fly-meta', `${appt.type} · ${appt.clinician}`));
    modal.hidden = false;
    document.body.classList.add('modal-open');
    if (isUpcoming) buildDeck(appt); else buildNotes(appt);
    closeButton.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    modalBody.replaceChildren();
    keyHandler = null;
    returnFocus?.focus();
  }
  closeButton.addEventListener('click', closeModal);
  document.getElementById('fly-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (modal.hidden) return;
    if (event.key === 'Escape') closeModal();
    else keyHandler?.(event);
  });

  // ---- past appointment: where things stood, plus notes ----
  function snapshot(appt) {
    const { data, patientId } = window.Canvas.context();
    const S = stats();
    const upto = dateOnly(appt.start);
    const all = S.rows({ data, patientId }).filter((r) => r.t <= upto);
    const recent = all.slice(-14);
    const grid = el('div', 'fly-tiles');
    const add = (label, value, note) => {
      const tile = el('div', 'fly-tile');
      tile.append(el('span', 'fly-tile-label', label), el('strong', 'fly-tile-value', value), el('span', 'fly-tile-note', note));
      grid.append(tile);
    };
    if (!recent.length) { grid.append(el('p', 'muted', 'No check-ins before this visit.')); return grid; }
    const breath = recent.map((r) => S.num(r.a[S.Q.breathless])).filter((x) => x != null);
    const an = S.anomalies(all, S.Q.breathless);
    const unusual = an.days.filter((r) => recent.includes(r)).length;
    add('Avg breathlessness', plain(S.mean(breath)), `${recent.length} days before`);
    add('Peak', String(Math.max(...breath)), 'highest score');
    add('Rescue inhaler', `${recent.filter((r) => S.yes(r.a[S.Q.rescue])).length}/${recent.length}`, 'days used');
    add('Unusual days', String(unusual), 'above personal baseline');
    return grid;
  }

  function buildNotes(appt) {
    modalBody.append(el('h3', 'fly-section', 'Where things stood'), el('p', 'fly-hint', 'The 14 days of check-ins before this visit.'), snapshot(appt));
    modalBody.append(el('h3', 'fly-section', 'Visit notes'));
    const label = el('label', 'fly-hint', 'Notes stay with this appointment and appear in the next visit\'s flashcards.');
    label.htmlFor = 'fly-notes';
    const area = document.createElement('textarea');
    area.id = 'fly-notes';
    area.className = 'fly-notes';
    area.rows = 6;
    area.maxLength = 5000;
    area.value = appt.notes || '';
    area.placeholder = 'What happened at this visit? Changes to the plan, follow-up, things to watch.';
    const row = el('div', 'fly-notes-row');
    const save = el('button', 'fly-save', 'Save notes');
    save.type = 'button';
    const status = el('span', 'fly-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    if (appt.notesUpdatedAt) status.textContent = 'Last saved ' + new Date(appt.notesUpdatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    save.addEventListener('click', async () => {
      save.disabled = true;
      status.textContent = 'Saving…';
      try {
        doc = await window.api.saveAppointmentNotes(appt.id, area.value);
        const saved = doc.appointments.find((a) => a.id === appt.id);
        appt.notes = saved.notes;
        appt.notesUpdatedAt = saved.notesUpdatedAt;
        status.textContent = 'Saved';
        render();
      } catch (error) {
        console.error(error);
        status.textContent = 'Could not save. Your text is still here.';
      } finally { save.disabled = false; }
    });
    row.append(save, status);
    modalBody.append(label, area, row);
  }

  // ---- upcoming appointment: flashcard deck ----
  function setting(name) {
    const clinician = prefs?.clinicians?.[prefs.activeClinicianId];
    if (!clinician) return undefined;
    const { data, patientId } = window.Canvas.context();
    const layers = [clinician.patients?.[patientId], clinician.surveys?.[data.survey?.id], clinician.general];
    for (const layer of layers) if (layer && layer[name] !== undefined) return layer[name];
    return undefined;
  }

  function cards(appt) {
    const { data, patientId } = window.Canvas.context();
    const S = stats();
    const Q = S.Q, DAY = S.DAY;
    const rs = S.rows({ data, patientId });
    if (!rs.length) return {};
    const last = rs[rs.length - 1];
    const prevAppt = doc.appointments.filter((a) => a.patientId === patientId && a.status !== 'upcoming' && a.start < appt.start).sort((a, b) => b.start.localeCompare(a.start))[0];
    const sinceT = prevAppt ? dateOnly(prevAppt.start) : rs[0].t - DAY;
    const since = rs.filter((r) => r.t > sinceT);
    const sinceLabel = prevAppt ? `last visit (${S.shortDate(sinceT)})` : 'the first check-in';
    const recent = rs.slice(-14), prior = rs.slice(-28, -14);
    const avg = (rows, id) => S.mean(rows.map((r) => S.num(r.a[id])).filter((x) => x != null));
    const count = (rows, id) => rows.filter((r) => S.yes(r.a[id])).length;
    const out = {};

    const an = S.anomalies(rs.filter((r) => S.num(r.a[Q.breathless]) != null), Q.breathless);
    const flagged = an.days.filter((r) => r.t > sinceT);
    const eps = S.episodes(flagged);
    out.anomaly = {
      label: 'Anomalies', tone: flagged.length ? 'attention' : 'calm',
      headline: flagged.length ? plural(flagged.length, 'unusual day') : 'Nothing unusual',
      sub: `since ${sinceLabel}`,
      details: eps.length
        ? eps.slice().reverse().map((e) => `${e.start === e.end ? S.shortDate(e.start) : S.shortDate(e.start) + ' to ' + S.shortDate(e.end)}: peak ${e.peak}, ${plural(e.count, 'day')}`)
            .concat([`Flagged above ${plain(an.cut)} (this patient's mean + 2 SD; mock model).`])
        : ['Every score stayed inside this patient\'s normal range.'],
    };

    const dBreath = prior.length ? avg(recent, Q.breathless) - avg(prior, Q.breathless) : null;
    const verdict = dBreath == null ? 'Not enough history' : dBreath > 0.5 ? 'Worsening' : dBreath < -0.5 ? 'Improving' : 'Steady';
    out.worsening = {
      label: 'Trend', tone: verdict === 'Worsening' ? 'attention' : 'calm',
      headline: verdict,
      sub: dBreath == null ? '' : `breathlessness ${plain(avg(recent, Q.breathless))} vs ${plain(avg(prior, Q.breathless))} the 14 days before`,
      details: prior.length ? [
        `Breathlessness: ${plain(avg(recent, Q.breathless))} (last 14 days) vs ${plain(avg(prior, Q.breathless))} (14 days before).`,
        `Activity limit: ${plain(avg(recent, Q.activity))} vs ${plain(avg(prior, Q.activity))}.`,
        `Rescue inhaler days: ${count(recent, Q.rescue)} vs ${count(prior, Q.rescue)}.`,
        `Night waking: ${count(recent, Q.night)} vs ${count(prior, Q.night)} nights.`,
      ] : ['Fewer than 28 days of check-ins so far.'],
    };

    const expected = Math.max(0, Math.round((last.t - sinceT) / DAY));
    const have = new Set(since.map((r) => r.t));
    const missing = [];
    for (let t = sinceT + DAY; t <= last.t; t += DAY) if (!have.has(t)) missing.push(t);
    out['adherence-gap'] = {
      label: 'Check-in gaps', tone: missing.length ? 'attention' : 'calm',
      headline: missing.length ? plural(missing.length, 'missed check-in') : 'No gaps',
      sub: `${since.length} of ${expected} days reported since ${sinceLabel}`,
      details: missing.length ? [`Missing: ${missing.slice(0, 8).map((t) => S.shortDate(t)).join(', ')}${missing.length > 8 ? '…' : ''}`, 'A missing day is not proof that medication was missed.'] : ['The patient checked in every day since the last visit.'],
    };

    out['last-visit'] = {
      label: 'Last visit', tone: 'calm',
      headline: prevAppt ? S.shortDate(dateOnly(prevAppt.start)) : 'No earlier visit',
      sub: prevAppt ? `${prevAppt.type} · ${prevAppt.clinician}` : '',
      details: prevAppt ? [prevAppt.notes && prevAppt.notes.trim() ? prevAppt.notes : 'No notes were left for this visit.'] : ['This is the first appointment on record.'],
    };

    const tally = {};
    since.forEach((r) => S.symptomList(r).forEach((x) => { tally[x] = (tally[x] || 0) + 1; }));
    const names = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    out.symptoms = {
      label: 'Symptoms', tone: 'calm',
      headline: names[0] || 'None reported', sub: names[0] ? `${tally[names[0]]} of ${since.length} days since ${sinceLabel}` : '',
      details: names.length ? names.slice(0, 5).map((n) => `${n}: ${plural(tally[n], 'day')}`) : ['No symptoms were reported.'],
    };

    const eventCard = (id, label, noun) => {
      const n = count(since, id), before = count(prior, id);
      out[id === Q.night ? 'night_waking' : 'rescue_inhaler'] = {
        label, tone: n > since.length * 0.4 ? 'attention' : 'calm',
        headline: `${n} of ${since.length}`, sub: `${noun} since ${sinceLabel}`,
        details: [`${Math.round(100 * n / Math.max(1, since.length))}% of days since the last visit.`, `Last 14 days: ${count(recent, id)}. The 14 before: ${before}.`],
      };
    };
    eventCard(Q.night, 'Night waking', 'nights woken');
    eventCard(Q.rescue, 'Rescue inhaler', 'days used');

    const aSince = avg(since, Q.activity), aBefore = avg(rs.filter((r) => r.t <= sinceT).slice(-since.length || -14), Q.activity);
    out.activity_limit = {
      label: 'Activity limit', tone: 'calm',
      headline: plain(aSince), sub: `average since ${sinceLabel} (0 to 10)`,
      details: [`Before the last visit it averaged ${plain(aBefore)}.`, `Last 14 days: ${plain(avg(recent, Q.activity))}.`],
    };

    const weekly = Array.from({ length: 7 }, () => []);
    rs.slice(-56).forEach((r) => { const v = S.num(r.a[Q.breathless]); if (v != null) weekly[new Date(r.t).getUTCDay()].push(v); });
    const names7 = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const means = weekly.map((v) => S.mean(v));
    const valid = means.map((m, i) => ({ m, i })).filter((x) => x.m != null);
    if (valid.length) {
      const hi = valid.reduce((a, b) => (b.m > a.m ? b : a)), lo = valid.reduce((a, b) => (b.m < a.m ? b : a));
      out.pattern = {
        label: 'Pattern', tone: 'calm',
        headline: `${names7[hi.i]}s run highest`, sub: `average breathlessness by weekday, last 8 weeks`,
        details: [`Highest: ${names7[hi.i]} (${plain(hi.m)}). Lowest: ${names7[lo.i]} (${plain(lo.m)}).`].concat(valid.map((x) => `${names7[x.i]}: ${plain(x.m)}`)),
      };
    }
    return out;
  }

  function deckOrder(available) {
    const kindOfField = { activity_limit: 'activity_limit', night_waking: 'night_waking', rescue_inhaler: 'rescue_inhaler', symptoms: 'symptoms', breathlessness: 'worsening' };
    const first = setting('flashcardsFirst') || [];
    const priority = (setting('priorityFields') || []).map((f) => kindOfField[f]).filter(Boolean);
    const rest = ['last-visit', 'pattern', 'adherence-gap', 'worsening', 'rescue_inhaler', 'night_waking', 'activity_limit', 'symptoms'];
    // Anomalies always make the deck: they are the reason for a pre-visit summary.
    const ordered = [...new Set([...first, 'anomaly', ...priority, ...rest])].filter((k) => available[k]);
    return ordered.slice(0, setting('maxFlashcards') || 6);
  }

  function buildDeck(appt) {
    const available = cards(appt);
    const order = deckOrder(available);
    const clinician = prefs?.clinicians?.[prefs.activeClinicianId];
    modalBody.append(el('p', 'fly-hint', `${clinician ? 'Ordered by ' + clinician.name + '\'s preferences. ' : ''}Tap a card to flip it.`));
    if (!order.length) { modalBody.append(el('p', 'muted', 'No check-ins to summarise yet.')); return; }
    let index = 0, flipped = false;
    const stage = el('div', 'deck');
    const flash = el('div', 'flash');
    flash.tabIndex = 0;
    flash.setAttribute('role', 'button');
    const inner = el('div', 'flash-inner');
    const front = el('div', 'flash-face flash-front');
    const back = el('div', 'flash-face flash-back');
    inner.append(front, back);
    flash.append(inner);
    const nav = el('div', 'deck-nav');
    const prev = el('button', 'deck-step', '←');
    prev.type = 'button'; prev.setAttribute('aria-label', 'Previous card');
    const next = el('button', 'deck-step', '→');
    next.type = 'button'; next.setAttribute('aria-label', 'Next card');
    const count = el('span', 'deck-count');
    count.setAttribute('aria-live', 'polite');
    const dots = el('div', 'deck-dots');
    order.forEach((_, i) => { const d = el('i'); d.dataset.i = String(i); dots.append(d); });
    nav.append(prev, count, next);

    function draw() {
      const c = available[order[index]];
      flash.className = `flash fill-${FILLS[index % FILLS.length]} tone-${c.tone}`;
      flash.setAttribute('aria-label', `${c.label}: ${c.headline}. ${flipped ? 'Showing details.' : 'Press to flip.'}`);
      front.replaceChildren(el('p', 'flash-kind', c.label), el('p', 'flash-headline', c.headline), el('p', 'flash-sub', c.sub), el('p', 'flash-flip', 'Tap to flip'));
      const ul = el('ul', 'flash-details');
      c.details.forEach((line) => ul.append(el('li', null, line)));
      back.replaceChildren(el('p', 'flash-kind', c.label), ul);
      inner.classList.toggle('is-flipped', flipped);
      front.setAttribute('aria-hidden', String(flipped));
      back.setAttribute('aria-hidden', String(!flipped));
      count.textContent = `${index + 1} / ${order.length}`;
      prev.disabled = index === 0;
      next.disabled = index === order.length - 1;
      dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('is-on', i === index));
    }
    const go = (delta) => { const to = index + delta; if (to < 0 || to >= order.length) return; index = to; flipped = false; draw(); };
    flash.addEventListener('click', () => { flipped = !flipped; draw(); });
    flash.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flipped = !flipped; draw(); } });
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    keyHandler = (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    };
    stage.append(flash, nav, dots);
    modalBody.append(stage);
    draw();
  }

  window.addEventListener('canvas:rendered', render);
})();
