(() => {
  'use strict';

  function adaptData(ctx) {
    const sample = ctx.data == null;
    const source = sample ? {} : ctx.data;
    const rows = sample ? Array.from({ length: 28 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10),
      breathlessness: i < 14 ? 2 + i % 2 : 4 + i % 3,
      rescueInhalerUses: i < 14 ? i % 2 : 2 + i % 2,
      nightWaking: i < 14 ? 0 : i % 3 === 0,
      controllerTaken: i < 14 ? true : i % 4 !== 0
    })) : (Array.isArray(source) ? source : source.entries || source.responses || []).filter(r => !r.patientId || !ctx.patientId || r.patientId === ctx.patientId);
    const numeric = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    const binary = v => v === true || v === 'yes' ? 1 : v === false || v === 'no' ? 0 : numeric(v);
    const days = rows.map(r => ({
      date: String(r.date || r.timestamp || '').slice(0, 10),
      breath: numeric(r.breathlessness ?? r.answers?.breathlessness),
      rescue: numeric(r.rescueInhalerUses ?? r.rescueUses ?? r.answers?.rescueInhalerUses),
      waking: binary(r.nightWaking ?? r.nightWakings ?? r.answers?.nightWaking),
      taken: [0, 1].includes(binary(r.controllerTaken ?? r.controllerMedicationTaken ?? r.answers?.controllerTaken)) ? binary(r.controllerTaken ?? r.controllerMedicationTaken ?? r.answers?.controllerTaken) : null
    })).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number.isFinite(Date.parse(d.date))).sort((a, b) => a.date.localeCompare(b.date));
    const patient = source.patients?.find?.(p => p.id === ctx.patientId);
    const visit = sample ? '2026-10-24' : patient?.lastVisit || source.lastVisit || null;
    const baselineSource = patient?.baseline || source.baselines?.[ctx.patientId] || source.baseline || {};
    return { days, visit: visit ? String(visit).slice(0, 10) : null, baseline: numeric(sample ? 2.4 : baselineSource.breathlessness) };
  }

  window.Widgets.register({
    id: 'change-ticker', title: 'Since last visit', sizes: ['S', 'M', 'L'],
    render(el, ctx) {
      el.__cleanup?.(); el.replaceChildren();
      el.classList.add('change-ticker'); el.dataset.size = ctx.size || 'M';
      const { days, visit, baseline } = adaptData(ctx);
      const split = Math.floor(days.length / 2);
      const before = visit ? days.filter(d => d.date < visit) : days.slice(0, split);
      const after = visit ? days.filter(d => d.date >= visit) : days.slice(split);
      const mean = (set, field) => { const values = set.map(d => d[field]).filter(v => v !== null); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };
      const chips = [];
      const metrics = [
        { field: 'breath', label: 'Breathlessness', unit: 'points', scale: 1, positive: false },
        { field: 'rescue', label: 'Rescue use', unit: '/ day', scale: 1, positive: false },
        { field: 'waking', label: 'Night waking', unit: '/ night', scale: 1, positive: false },
        { field: 'taken', label: 'Controller taken', unit: 'pp', scale: 100, positive: true }
      ];
      metrics.forEach(m => {
        const a = mean(before, m.field), b = mean(after, m.field);
        if (a === null || b === null) return;
        const delta = (b - a) * m.scale;
        const stable = Math.abs(delta) < .05;
        chips.push({ id: m.field, label: m.label, change: `${stable ? '→' : delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(m.scale === 100 ? 0 : 1)} ${m.unit}`, tone: stable ? 'steady' : (delta > 0) === m.positive ? 'improved' : 'attention', rank: Math.abs(delta) / (m.scale === 100 ? 10 : 1), detail: `${m.label}: ${ (a * m.scale).toFixed(1)} before → ${(b * m.scale).toFixed(1)} after${m.scale === 100 ? '% of reported days (pp = percentage points)' : ` ${m.unit}`}. Missing answers excluded.` });
      });
      if (baseline !== null) {
        const spikes = after.filter(d => d.breath !== null && d.breath >= baseline + 3);
        if (spikes.length) chips.push({ id: 'breath-spike', label: 'Above usual', change: `! ${spikes.length} symptom spike${spikes.length === 1 ? '' : 's'}`, tone: 'attention', rank: 6, detail: `${spikes.length} day(s) at least 3 breathlessness points above the supplied baseline of ${baseline}. Illustrative rule; not a clinical alert.` });
      }
      chips.sort((a, b) => b.rank - a.rank);
      el.innerHTML = '<div class="ct-heading"><h3>Since last visit</h3><span class="ct-live" aria-hidden="true"></span></div><p class="ct-period"></p><div class="ct-viewport" tabindex="0" role="region" aria-label="Changes; scroll horizontally to browse"><div class="ct-track"></div></div><div class="ct-controls"><button type="button" class="ct-back" aria-label="Previous changes">←</button><button type="button" class="ct-pause">Pause motion</button><button type="button" class="ct-forward" aria-label="Next changes">→</button></div><p class="ct-detail" aria-live="polite">Select a change to see the comparison.</p><p class="ct-footnote">Descriptive mock trends · no clinical thresholds</p>';
      if (!visit) el.querySelector('h3').textContent = 'Changes in this period';
      el.querySelector('.ct-period').textContent = visit ? `Comparing entries before and from ${visit}` : 'Visit date unavailable · comparing first and second halves';
      const viewport = el.querySelector('.ct-viewport');
      const track = el.querySelector('.ct-track');
      const detail = el.querySelector('.ct-detail');
      let active = null;
      chips.forEach(chip => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = `ct-chip ct-${chip.tone}`; button.setAttribute('aria-pressed', 'false');
        const label = document.createElement('span'); label.textContent = chip.label;
        const value = document.createElement('strong'); value.textContent = chip.change;
        const state = document.createElement('small'); state.textContent = chip.tone === 'improved' ? 'Improving' : chip.tone === 'attention' ? 'Worth a look' : 'Steady';
        button.append(label, value, state);
        button.addEventListener('click', () => {
          active = active === chip.id ? null : chip.id;
          track.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button && !!active)));
          detail.textContent = active ? chip.detail : 'Select a change to see the comparison.';
          ctx.onChange?.({ widgetId: 'change-ticker', type: 'highlight', metric: active, patientId: ctx.patientId });
        });
        track.append(button);
      });
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      let paused = reduced.matches, hover = false, focus = false, frame = 0, disposed = false, previous = 0, direction = 1;
      let holdUntil = performance.now() + 1200;
      let scrollRemainder = 0;
      const pause = el.querySelector('.ct-pause');
      function updatePause() { pause.textContent = paused ? 'Resume motion' : 'Pause motion'; pause.setAttribute('aria-pressed', String(paused)); }
      pause.addEventListener('click', () => { paused = !paused; updatePause(); });
      el.addEventListener('pointerenter', onEnter); el.addEventListener('pointerleave', onLeave);
      el.addEventListener('focusin', onFocus); el.addEventListener('focusout', onBlur);
      function onEnter() { hover = true; }
      function onLeave() { hover = false; }
      function onFocus() { focus = true; }
      function onBlur(e) { focus = el.contains(e.relatedTarget); }
      const manual = amount => { viewport.scrollLeft += amount; holdUntil = performance.now() + 2500; };
      el.querySelector('.ct-back').addEventListener('click', () => manual(-180));
      el.querySelector('.ct-forward').addEventListener('click', () => manual(180));
      viewport.addEventListener('keydown', e => {
        if (e.target === viewport && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); manual(e.key === 'ArrowLeft' ? -180 : 180); }
      });
      function animate(time) {
        if (disposed) return;
        const dt = Math.min(50, time - previous || 16); previous = time;
        if (!paused && !hover && !focus && !document.hidden && time > holdUntil) {
          const max = viewport.scrollWidth - viewport.clientWidth;
          if (max > 0) {
            // Accumulate subpixel motion: scrollLeft can round on some displays.
            scrollRemainder += dt * .025;
            const pixels = Math.floor(scrollRemainder);
            scrollRemainder -= pixels;
            viewport.scrollLeft += direction * pixels;
            if (viewport.scrollLeft >= max - 1 || viewport.scrollLeft <= 0) { direction *= -1; holdUntil = time + 1500; }
          }
        }
        frame = requestAnimationFrame(animate);
      }
      function motionChanged() { paused = reduced.matches; updatePause(); }
      reduced.addEventListener('change', motionChanged);
      updatePause();
      if (chips.length) frame = requestAnimationFrame(animate);
      else { detail.textContent = 'Not enough comparable entries yet. Add data on both sides of the comparison.'; el.querySelectorAll('.ct-controls button').forEach(b => { b.disabled = true; }); }
      el.__cleanup = () => {
        disposed = true; cancelAnimationFrame(frame); reduced.removeEventListener('change', motionChanged);
        el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave); el.removeEventListener('focusin', onFocus); el.removeEventListener('focusout', onBlur);
      };
    }
  });
})();
