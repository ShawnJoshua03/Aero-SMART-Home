(() => {
  'use strict';

  // Schema boundary: all patient/data access and standalone samples live here.
  function adaptData(ctx) {
    let rows = ctx.data == null ? Array.from({ length: 35 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, 3 + i)).toISOString().slice(0, 10),
      controllerTaken: i > 27 || (i % 9 !== 2 && i % 7 !== 3) ? true : i % 9 === 2 ? null : false
    })) : Array.isArray(ctx.data) ? ctx.data : ctx.data.entries || ctx.data.responses || [];
    rows = rows.filter(r => !r.patientId || !ctx.patientId || r.patientId === ctx.patientId);
    const byDate = new Map();
    rows.forEach(r => {
      const date = String(r.date || r.timestamp || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return;
      const value = r.controllerTaken ?? r.controllerMedicationTaken ?? r.answers?.controllerTaken;
      byDate.set(date, { date, taken: value === true || value === 'yes' ? true : value === false || value === 'no' ? false : null });
    });
    const keys = [...byDate.keys()].sort();
    if (!keys.length) return [];
    const end = Date.parse(keys.at(-1));
    const start = Math.max(Date.parse(keys[0]), end - 89 * 86400000);
    return Array.from({ length: Math.round((end - start) / 86400000) + 1 }, (_, i) => {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
      return byDate.get(date) || { date, taken: null };
    });
  }

  window.Widgets.register({
    id: 'adherence-heatmap', title: 'Controller rhythm', sizes: ['S', 'M', 'L'],
    render(el, ctx) {
      el.__cleanup?.();
      el.replaceChildren();
      el.classList.add('adherence-heatmap');
      el.dataset.size = ctx.size || 'M';
      const days = adaptData(ctx);
      let streak = 0;
      for (let i = days.length - 1; i >= 0 && days[i].taken === true; i--) streak++;
      el.innerHTML = `<div class="ah-heading"><div><h3>Controller rhythm</h3><p>One day, one small step.</p></div><svg class="ah-pill" viewBox="0 0 56 64" aria-hidden="true"><g transform="rotate(32 28 32)"><rect class="ah-pill-outline" x="15" y="8" width="26" height="48" rx="13"/><path class="ah-pill-half" d="M15 32h26v11a13 13 0 0 1-26 0Z"/><path class="ah-pill-shine" d="M22 26v-6q0-5 5-5"/></g><path class="ah-spark" d="M46 6v8m-4-4h8M7 46v8m-4-4h8"/></svg></div><div class="ah-streak"><strong>${streak}</strong><span>day${streak === 1 ? '' : 's'} in the current streak<small>Through the last displayed day</small></span></div><div class="ah-range"></div><div class="ah-weekdays" aria-hidden="true"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="ah-grid" role="group" aria-label="Controller medication calendar"></div><p class="ah-detail" aria-live="polite"></p><div class="ah-legend"><span class="ah-key ah-taken">Taken</span><span class="ah-key ah-missed">Missed</span><span class="ah-key ah-empty">No entry</span></div>`;
      const grid = el.querySelector('.ah-grid');
      const detail = el.querySelector('.ah-detail');
      const range = el.querySelector('.ah-range');
      if (!days.length) {
        detail.textContent = 'No controller entries in this period.';
        return;
      }
      const visible = days.slice(-(ctx.size === 'S' ? 28 : ctx.size === 'L' ? 84 : 42));
      const format = date => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      range.textContent = `${format(visible[0].date)} – ${format(visible.at(-1).date)}`;
      const offset = (new Date(`${visible[0].date}T12:00:00Z`).getUTCDay() + 6) % 7;
      for (let i = 0; i < offset; i++) grid.append(document.createElement('span'));
      let selected = null;
      const describe = d => `${format(d.date)} · ${d.taken === true ? 'Controller taken' : d.taken === false ? 'Controller missed' : 'No entry recorded'}`;
      const resting = 'Hover or select a day to inspect.';
      detail.textContent = resting;
      visible.forEach(day => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `ah-day ${day.taken === true ? 'ah-taken' : day.taken === false ? 'ah-missed' : 'ah-empty'}`;
        button.textContent = Number(day.date.slice(-2));
        button.title = describe(day);
        button.setAttribute('aria-label', describe(day));
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('pointerenter', () => { detail.textContent = describe(day); });
        button.addEventListener('focus', () => { detail.textContent = describe(day); });
        button.addEventListener('pointerleave', () => { detail.textContent = selected ? describe(selected) : resting; });
        button.addEventListener('click', () => {
          selected = selected === day ? null : day;
          grid.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button && !!selected)));
          detail.textContent = selected ? describe(selected) : resting;
        });
        grid.append(button);
      });
    }
  });
})();
