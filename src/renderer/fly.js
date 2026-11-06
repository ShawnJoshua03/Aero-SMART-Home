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
    const mine = doc.appointments.filter((a) => a.patientId === patientId);
    const upcoming = mine.filter((a) => a.status === 'upcoming').sort((a, b) => a.start.localeCompare(b.start));
    const past = mine.filter((a) => a.status !== 'upcoming').sort((a, b) => b.start.localeCompare(a.start));
    page.replaceChildren();
    const head = el('div', 'fly-head');
    head.append(el('h2', null, 'Appointments'));
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
    modalBody.append(snapshot(appt));
    const label = el('label', 'sr-only', 'Visit notes');
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
    const sinceLabel = prevAppt ? `the last visit (${S.shortDate(sinceT)})` : 'the first check-in';
    const recent = rs.slice(-14), prior = rs.slice(-28, -14);
    const week = rs.slice(-7);
    const weekdayShort = (t) => new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const weekLabel = (r) => weekdayShort(r.t);
    const avg = (rows, id) => S.mean(rows.map((r) => S.num(r.a[id])).filter((x) => x != null));
    const count = (rows, id) => rows.filter((r) => S.yes(r.a[id])).length;
    const calendarWeek = [];
    for (let t = last.t - 6 * DAY; t <= last.t; t += DAY) calendarWeek.push(t);
    const byT = new Map(rs.map((r) => [r.t, r]));
    const weekRange = `${S.shortDate(calendarWeek[0])} to ${S.shortDate(last.t)}`;
    const out = {};

    // Anomalies
    const an = S.anomalies(rs.filter((r) => S.num(r.a[Q.breathless]) != null), Q.breathless);
    const flagged = an.days.filter((r) => r.t > sinceT);
    const eps = S.episodes(flagged);
    out.anomaly = {
      label: 'Anomalies', tone: flagged.length ? 'attention' : 'calm',
      headline: flagged.length ? plural(flagged.length, 'unusual breathlessness day') : 'No unusual breathlessness',
      sub: `since ${sinceLabel}`,
      figure: { type: 'bars', title: 'Breathlessness, last 7 days', max: 10, line: { value: an.cut, label: 'alert ' + plain(an.cut) },
        items: week.map((r) => ({ label: weekLabel(r), value: S.num(r.a[Q.breathless]) || 0, hot: r.a[Q.breathless] > an.cut })) },
      details: flagged.length
        ? [`${plural(flagged.length, 'day')} since ${sinceLabel} scored well above what is normal for this patient, grouped into ${plural(eps.length, 'episode')}.`]
            .concat(eps.slice().reverse().map((e) => `${e.start === e.end ? S.shortDate(e.start) : S.shortDate(e.start) + ' to ' + S.shortDate(e.end)}: breathlessness peaked at ${e.peak} over ${plural(e.count, 'day')}.`))
            .concat([`The alert line for this patient is ${plain(an.cut)}: their own average plus two standard deviations. A score above it is flagged even if it would look ordinary for someone else.`, 'The model that sets this line is mocked in the prototype.'])
        : [`No day since ${sinceLabel} rose above this patient's alert line of ${plain(an.cut)}.`, 'The line is their own average plus two standard deviations, so it adapts to how this patient usually feels.', 'The model that sets this line is mocked in the prototype.'],
    };

    // Trend
    const dBreath = prior.length ? avg(recent, Q.breathless) - avg(prior, Q.breathless) : null;
    const verdict = dBreath == null ? 'Not enough history' : dBreath > 0.5 ? 'Worsening' : dBreath < -0.5 ? 'Improving' : 'Steady';
    const dAct = prior.length ? avg(recent, Q.activity) - avg(prior, Q.activity) : null;
    out.worsening = {
      label: 'Trend', tone: verdict === 'Worsening' ? 'attention' : 'calm',
      headline: dBreath == null ? 'Not enough history' : dBreath > 0.5 ? 'Breathlessness increased' : dBreath < -0.5 ? 'Breathlessness decreased' : 'Breathlessness steady',
      sub: dBreath == null ? '' : `breathlessness ${plain(avg(recent, Q.breathless))} vs ${plain(avg(prior, Q.breathless))} the 14 days before`,
      figure: { type: 'bars', title: 'Breathlessness, last 7 days', max: 10,
        line: prior.length ? { value: avg(prior, Q.breathless), label: 'prev avg ' + plain(avg(prior, Q.breathless)) } : null,
        items: week.map((r) => ({ label: weekLabel(r), value: S.num(r.a[Q.breathless]) || 0, hot: false })) },
      details: prior.length ? [
        `Overall the picture is ${verdict.toLowerCase()}: breathlessness averaged ${plain(avg(recent, Q.breathless))} over the last 14 days, against ${plain(avg(prior, Q.breathless))} in the 14 days before (a change of ${plain(dBreath)}).`,
        `Activity limitation moved from ${plain(avg(prior, Q.activity))} to ${plain(avg(recent, Q.activity))} (${dAct > 0 ? 'more' : 'less'} limited).`,
        `The rescue inhaler was used on ${count(recent, Q.rescue)} of the last 14 days, compared with ${count(prior, Q.rescue)} of the 14 before.`,
        `Night waking happened on ${count(recent, Q.night)} nights, compared with ${count(prior, Q.night)} before.`,
      ] : ['There are fewer than 28 days of check-ins, so a two-week comparison is not possible yet.'],
    };

    // Check-in gaps
    const expected = Math.max(0, Math.round((last.t - sinceT) / DAY));
    const have = new Set(since.map((r) => r.t));
    const missing = [];
    for (let t = sinceT + DAY; t <= last.t; t += DAY) if (!have.has(t)) missing.push(t);
    out['adherence-gap'] = {
      label: 'Check-in gaps', tone: missing.length ? 'attention' : 'calm',
      headline: missing.length ? plural(missing.length, 'missed check-in') : 'Checked in every day',
      sub: `${since.length} of ${expected} days reported since ${sinceLabel}`,
      figure: { type: 'dots', title: 'Check-ins (filled = reported)',
        items: calendarWeek.map((t) => ({ label: weekdayShort(t), on: byT.has(t), title: S.shortDate(t) })) },
      details: missing.length
        ? [`The patient reported on ${since.length} of ${expected} days since ${sinceLabel} and skipped ${plural(missing.length, 'day')}.`, `Missing: ${missing.slice(0, 8).map((t) => S.shortDate(t)).join(', ')}${missing.length > 8 ? ' and more' : ''}.`, 'A missing day is not proof that medication was missed; it only means no report arrived.']
        : [`The patient checked in on all ${expected} days since ${sinceLabel}.`, 'Complete reporting means the other numbers in this deck can be trusted as a full picture of the period.'],
    };

    // Last visit
    out['last-visit'] = {
      label: 'Last visit', tone: 'calm',
      headline: prevAppt ? 'Last seen ' + S.shortDate(dateOnly(prevAppt.start)) : 'No earlier visit',
      sub: prevAppt ? `${prevAppt.type} · ${prevAppt.clinician}` : '',
      details: [prevAppt ? (prevAppt.notes && prevAppt.notes.trim() ? prevAppt.notes : 'No notes were left for this visit.') : 'No earlier visit on record.'],
    };

    // Symptoms
    const weekTally = {};
    week.forEach((r) => S.symptomList(r).forEach((x) => { weekTally[x] = (weekTally[x] || 0) + 1; }));
    const tally = {};
    since.forEach((r) => S.symptomList(r).forEach((x) => { tally[x] = (tally[x] || 0) + 1; }));
    const names = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    const figNames = names.slice(0, 4);
    out.symptoms = {
      label: 'Symptoms', tone: 'calm',
      headline: names[0] ? names[0] + ' was most common' : 'No symptoms reported', sub: names[0] ? `${tally[names[0]]} of ${since.length} days since ${sinceLabel}` : '',
      figure: figNames.length ? { type: 'heat', title: 'Symptoms, last 7 days',
        days: week.map(weekLabel), rows: figNames.map((n) => ({ name: n, cells: week.map((r) => S.symptomList(r).includes(n)) })) } : null,
      details: names.length
        ? [`${names[0]} was the most common symptom: ${plural(tally[names[0]], 'day')} of ${since.length} since ${sinceLabel}.`].concat(names.slice(1, 5).map((n) => `${n} followed on ${plural(tally[n], 'day')} (${Math.round(100 * tally[n] / since.length)}%).`))
            .concat([`In the last week the most reported was ${Object.keys(weekTally).sort((a, b) => weekTally[b] - weekTally[a])[0] || 'nothing'}.`])
        : ['No symptoms were reported since the last visit.'],
    };

    // Night waking / rescue inhaler
    const eventCard = (id, key, label, noun, sentence, headlineNone, headlineSome) => {
      const n = count(since, id), before = count(prior, id);
      out[key] = {
        label, tone: n > since.length * 0.4 ? 'attention' : 'calm',
        headline: n === 0 ? headlineNone : headlineSome(n), sub: `${noun} since ${sinceLabel}`,
        figure: { type: 'dots', title: `${label} (filled = yes)`,
          items: calendarWeek.map((t) => ({ label: weekdayShort(t), on: byT.has(t) && S.yes(byT.get(t).a[id]), title: S.shortDate(t) })) },
        details: [`${sentence} on ${plural(n, 'day')} of ${since.length} since ${sinceLabel}, which is ${Math.round(100 * n / Math.max(1, since.length))}% of days.`,
          `Over the last 14 days it happened ${count(recent, id)} times, compared with ${before} in the 14 days before.`,
          `In the last week: ${count(week, id)} of ${week.length} days.`],
      };
    };
    eventCard(Q.night, 'night_waking', 'Night waking', 'nights woken', 'Asthma woke the patient', 'No night waking', (n) => 'Woke up on ' + plural(n, 'night'));
    eventCard(Q.rescue, 'rescue_inhaler', 'Rescue inhaler', 'days used', 'The rescue inhaler was used', 'No rescue inhaler use', (n) => 'Rescue inhaler used on ' + plural(n, 'day'));

    // Activity limit
    const aSince = avg(since, Q.activity);
    const aBefore = avg(rs.filter((r) => r.t <= sinceT).slice(-since.length || -14), Q.activity);
    out.activity_limit = {
      label: 'Activity limit', tone: 'calm',
      headline: aBefore == null || Number.isNaN(aBefore) ? 'Activity limit ' + plain(aSince) : aSince - aBefore > 0.5 ? 'Activity limit increased' : aSince - aBefore < -0.5 ? 'Activity limit decreased' : 'Activity limit unchanged', sub: `average since ${sinceLabel} (0 to 10)`,
      figure: { type: 'bars', title: 'Activity limit, last 7 days', max: 10,
        items: week.map((r) => ({ label: weekLabel(r), value: S.num(r.a[Q.activity]) || 0, hot: false })) },
      details: [`Activity limitation averaged ${plain(aSince)} out of 10 since ${sinceLabel}; in the same number of days before that visit it averaged ${plain(aBefore)}.`,
        `Over the last 14 days it averaged ${plain(avg(recent, Q.activity))}, and ${plain(avg(prior, Q.activity))} in the 14 days before that.`,
        'Higher numbers mean asthma limited the patient\'s usual activities more.'],
    };

    // Weekday pattern
    const weekly = Array.from({ length: 7 }, () => []);
    rs.slice(-56).forEach((r) => { const v = S.num(r.a[Q.breathless]); if (v != null) weekly[new Date(r.t).getUTCDay()].push(v); });
    const names7 = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const means = weekly.map((v) => S.mean(v));
    const valid = means.map((m, i) => ({ m, i })).filter((x) => x.m != null);
    if (valid.length) {
      const hi = valid.reduce((a, b) => (b.m > a.m ? b : a)), lo = valid.reduce((a, b) => (b.m < a.m ? b : a));
      out.pattern = {
        label: 'Pattern', tone: 'calm',
        headline: `Breathlessness peaks on ${names7[hi.i]}s`, sub: 'average breathlessness by weekday, last 8 weeks',
        figure: { type: 'bars', title: 'Breathlessness by weekday', max: 10,
          items: means.map((m, i) => ({ label: names7[i].slice(0, 3), value: m == null ? 0 : m, hot: i === hi.i })) },
        details: [`Breathlessness is highest on ${names7[hi.i]}s (average ${plain(hi.m)}) and lowest on ${names7[lo.i]}s (average ${plain(lo.m)}).`,
          'This uses the last 8 weeks of check-ins and may reflect routine, such as school or work days, rather than anything clinical.',
          valid.map((x) => `${names7[x.i].slice(0, 3)} ${plain(x.m)}`).join(' · ')],
      };
    }
    return out;
  }

  // Small figures for the back of a flashcard (last week of data).
  function figure(fig) {
    const wrap = el('figure', 'fig');
    if (fig.type === 'bars') {
      const NS = 'http://www.w3.org/2000/svg';
      const W = 340, H = 220, top = 24, bottom = 28, n = fig.items.length;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('class', 'fig-svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', fig.title);
      const slot = W / n, bw = slot * 0.6, plot = H - top - bottom;
      const yOf = (v) => top + plot * (1 - Math.min(v, fig.max) / fig.max);
      const mk = (tag, attrs, text) => { const node = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v)); if (text != null) node.textContent = text; return node; };
      svg.append(mk('line', { x1: 0, x2: W, y1: top + plot, y2: top + plot, class: 'fig-axis' }));
      fig.items.forEach((item, i) => {
        const x = i * slot + (slot - bw) / 2, y = yOf(item.value);
        svg.append(mk('rect', { x, y, width: bw, height: Math.max(2, top + plot - y), rx: 5, class: 'fig-bar' + (item.hot ? ' hot' : '') }));
        svg.append(mk('text', { x: x + bw / 2, y: y - 5, class: 'fig-val', 'text-anchor': 'middle' }, plain(item.value, Number.isInteger(item.value) ? 0 : 1)));
        svg.append(mk('text', { x: x + bw / 2, y: H - 8, class: 'fig-label', 'text-anchor': 'middle' }, item.label));
      });
      if (fig.line) {
        const y = yOf(fig.line.value);
        svg.append(mk('line', { x1: 0, x2: W, y1: y, y2: y, class: 'fig-line' }));
        svg.append(mk('text', { x: W, y: y - 4, class: 'fig-line-label', 'text-anchor': 'end' }, fig.line.label));
      }
      wrap.append(svg);
    } else if (fig.type === 'dots') {
      const row = el('div', 'fig-dots');
      fig.items.forEach((item) => {
        const cell = el('div', 'fig-dot-cell');
        const dot = el('span', 'fig-dot' + (item.on ? ' on' : ''));
        dot.title = item.title + (item.on ? ': yes' : ': no');
        cell.append(dot, el('span', 'fig-label', item.label));
        row.append(cell);
      });
      wrap.append(row);
    } else if (fig.type === 'heat') {
      const grid = el('div', 'fig-heat');
      grid.style.gridTemplateColumns = `minmax(70px, auto) repeat(${fig.days.length}, minmax(0, 1fr))`;
      fig.rows.forEach((row) => {
        grid.append(el('span', 'fig-heat-name', row.name));
        row.cells.forEach((on) => grid.append(el('span', 'fig-heat-cell' + (on ? ' on' : ''))));
      });
      grid.append(el('span'));
      fig.days.forEach((d) => { const label = el('span', 'fig-label', d.slice(0, 2)); label.title = d; grid.append(label); });
      wrap.append(grid);
    }
    wrap.prepend(el('figcaption', 'fig-title', fig.title));
    return wrap;
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
      front.replaceChildren(el('p', 'flash-kind', c.label), el('p', 'flash-headline', c.headline));
      const ul = el('ul', 'flash-details');
      c.details.forEach((line) => ul.append(el('li', null, line)));
      back.replaceChildren(el('p', 'flash-kind', c.label), ...(c.figure ? [figure(c.figure)] : [ul]));
      back.classList.toggle('has-figure', Boolean(c.figure));
      back.setAttribute('aria-label', c.details.join(' '));
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
