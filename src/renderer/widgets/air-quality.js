(() => {
  'use strict';

  function adaptData(ctx) {
    const rows = ctx.data == null ? Array.from({ length: 28 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10),
      breathlessness: [2, 2, 3, 3, 7, 4, 2][i % 7]
    })) : (Array.isArray(ctx.data) ? ctx.data : ctx.data.entries || ctx.data.responses || []).filter(r => !r.patientId || !ctx.patientId || r.patientId === ctx.patientId);
    const baselineSource = ctx.data?.patients?.find?.(p => p.id === ctx.patientId)?.baseline || ctx.data?.baselines?.[ctx.patientId] || ctx.data?.baseline || {};
    const baseline = ctx.data == null ? 2.5 : baselineSource.breathlessness;
    const byDate = new Map();
    rows.forEach(r => {
      const date = String(r.date || r.timestamp || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return;
      const v = r.breathlessness ?? r.answers?.breathlessness;
      byDate.set(date, typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10 ? v : null);
    });
    const dates = [...byDate.keys()].sort();
    if (!dates.length) return { days: [], baseline: null };
    const end = Date.parse(dates.at(-1));
    const start = Math.max(Date.parse(dates[0]), end - 89 * 86400000);
    // Invented, deterministic daily pollen values, never measured air-quality data.
    const days = Array.from({ length: Math.round((end - start) / 86400000) + 1 }, (_, i) => {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
      const epochDay = Math.round(Date.parse(date) / 86400000);
      return { date, pollen: [2, 3, 6, 9, 7, 4, 2][((epochDay + 1) % 7 + 7) % 7], symptom: byDate.get(date) ?? null };
    });
    return { days, baseline: typeof baseline === 'number' && Number.isFinite(baseline) ? baseline : null };
  }

  window.Widgets.register({
    id: 'air-quality', title: 'Air & pollen', sizes: ['S', 'M', 'L'],
    render(el, ctx) {
      el.__cleanup?.(); el.replaceChildren();
      el.classList.add('air-quality'); el.dataset.size = ctx.size || 'M';
      const { days, baseline } = adaptData(ctx);
      const flags = new Set(days.filter((d, i) => i > 0 && days[i - 1].pollen >= 7 && d.symptom !== null && (baseline !== null ? d.symptom >= baseline + 3 : days[i - 1].symptom !== null && d.symptom >= days[i - 1].symptom + 3)).map(d => d.date));
      el.innerHTML = '<div class="aq-heading"><h3>Air & pollen</h3><span class="aq-mock">MOCK</span></div><p class="aq-subtitle">Invented pollen index · not a local forecast</p><div class="aq-summary"><svg viewBox="0 0 76 42" aria-hidden="true"><path class="aq-wind-one" d="M3 13h43q13 0 13-7t-11-1M12 23h48q13 0 13 7t-11 1"/><path class="aq-wind-two" d="M3 33h28q10 0 10 5M8 5h20"/></svg><span>Outside context,<br/>alongside symptoms.</span></div><button type="button" class="aq-toggle" aria-pressed="false">Show next-day symptom spikes</button><div class="aq-scale"><span>Pollen index</span><span>0–10 · high ≥7</span></div><svg class="aq-chart" viewBox="0 0 500 145" role="group" aria-label="Mock pollen by day"></svg><div class="aq-range"></div><p class="aq-detail" aria-live="polite"></p><p class="aq-explainer"></p><p class="aq-disclaimer">Illustrative overlap only; does not establish a cause.</p>';
      const chart = el.querySelector('.aq-chart');
      const detail = el.querySelector('.aq-detail');
      const toggle = el.querySelector('.aq-toggle');
      const ns = 'http://www.w3.org/2000/svg';
      let overlay = false;
      let selected = null;
      const visible = days.slice(-(ctx.size === 'S' ? 14 : ctx.size === 'L' ? 56 : 28));
      const visibleFlags = visible.filter(d => flags.has(d.date)).length;
      const format = d => new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      const describe = d => `${format(d)} · mock pollen ${d.pollen}/10 · breathlessness ${d.symptom === null ? 'not recorded' : `${d.symptom}/10`}${overlay && flags.has(d.date) ? ' · spike after high pollen' : ''}`;
      function resting() { detail.textContent = selected ? describe(selected) : overlay ? `${visibleFlags} highlighted day${visibleFlags === 1 ? '' : 's'} in this strip.` : 'Hover or select a bar to inspect the day.'; }
      el.querySelector('.aq-explainer').textContent = baseline !== null ? `Overlay: symptom score ≥3 above baseline (${baseline}), one day after mock pollen ≥7.` : 'Overlay: symptom score rises ≥3 from the previous day, one day after mock pollen ≥7. No baseline supplied.';
      if (!visible.length) { detail.textContent = 'No dated entries to align with mock pollen.'; toggle.disabled = true; return; }
      const threshold = document.createElementNS(ns, 'path');
      threshold.setAttribute('d', 'M0 49H500'); threshold.classList.add('aq-threshold'); chart.append(threshold);
      const step = 500 / visible.length;
      visible.forEach((day, i) => {
        const group = document.createElementNS(ns, 'g');
        group.classList.add('aq-day');
        if (flags.has(day.date)) group.classList.add('aq-flagged');
        group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button'); group.setAttribute('aria-pressed', 'false');
        group.setAttribute('aria-label', describe(day));
        const target = document.createElementNS(ns, 'rect');
        target.setAttribute('x', i * step); target.setAttribute('y', '6'); target.setAttribute('width', step); target.setAttribute('height', '132'); target.classList.add('aq-hit');
        const bar = document.createElementNS(ns, 'rect');
        bar.setAttribute('x', i * step + 2); bar.setAttribute('y', 126 - day.pollen * 11); bar.setAttribute('width', Math.max(3, step - 4)); bar.setAttribute('height', day.pollen * 11); bar.setAttribute('rx', '3');
        bar.classList.add('aq-bar', day.pollen >= 7 ? 'aq-high' : day.pollen >= 4 ? 'aq-medium' : 'aq-low');
        const marker = document.createElementNS(ns, 'path');
        const center = i * step + step / 2;
        marker.setAttribute('d', `M${center} 1l5 5-5 5-5-5Z`); marker.classList.add('aq-marker');
        const title = document.createElementNS(ns, 'title'); title.textContent = describe(day);
        group.append(target, bar, marker, title);
        group.addEventListener('pointerenter', () => { detail.textContent = describe(day); });
        group.addEventListener('pointerleave', resting);
        group.addEventListener('focus', () => { detail.textContent = describe(day); });
        const choose = () => {
          selected = selected === day ? null : day;
          chart.querySelectorAll('.aq-day').forEach(g => g.setAttribute('aria-pressed', String(g === group && !!selected)));
          resting();
        };
        group.addEventListener('click', choose);
        group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
        chart.append(group);
      });
      toggle.addEventListener('click', () => {
        overlay = !overlay; toggle.setAttribute('aria-pressed', String(overlay));
        chart.classList.toggle('aq-overlay', overlay);
        chart.querySelectorAll('.aq-day').forEach((g, i) => { g.setAttribute('aria-label', describe(visible[i])); g.querySelector('title').textContent = describe(visible[i]); });
        resting();
      });
      el.querySelector('.aq-range').textContent = `${format(visible[0])} – ${format(visible.at(-1))}`;
      resting();
    }
  });
})();
