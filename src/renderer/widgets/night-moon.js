(() => {
  'use strict';

  function adaptData(ctx) {
    const rows = ctx.data == null ? Array.from({ length: 21 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, 17 + i)).toISOString().slice(0, 10),
      nightWaking: i % 8 === 3 ? null : i % 5 === 0 ? 3 : i % 3 === 0 ? 1 : 0
    })) : (Array.isArray(ctx.data) ? ctx.data : ctx.data.entries || ctx.data.responses || []).filter(r => !r.patientId || !ctx.patientId || r.patientId === ctx.patientId);
    const byDate = new Map();
    rows.forEach(r => {
      const date = String(r.date || r.timestamp || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return;
      const value = r.nightWaking ?? r.nightWakings ?? r.answers?.nightWaking;
      const waking = value === true || value === 'yes' ? 1 : value === false || value === 'no' ? 0 : typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
      byDate.set(date, { date, waking });
    });
    const dates = [...byDate.keys()].sort();
    if (!dates.length) return [];
    const end = Date.parse(dates.at(-1));
    const start = Math.max(Date.parse(dates[0]), end - 89 * 86400000);
    return Array.from({ length: Math.round((end - start) / 86400000) + 1 }, (_, i) => {
      const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
      return byDate.get(date) || { date, waking: null };
    });
  }

  window.Widgets.register({
    id: 'night-moon', title: 'After dark', sizes: ['S', 'M', 'L'],
    render(el, ctx) {
      el.__cleanup?.(); el.replaceChildren();
      el.classList.add('night-moon'); el.dataset.size = ctx.size || 'M';
      const nights = adaptData(ctx);
      const known = nights.filter(n => n.waking !== null);
      const quiet = known.filter(n => n.waking === 0).length;
      el.innerHTML = `<div class="nm-heading"><div><h3>After dark</h3><p>Each moon holds a night.</p></div><svg class="nm-stars" viewBox="0 0 80 50" aria-hidden="true"><path d="M16 5v12M10 11h12M58 24v18M49 33h18M40 9v6M37 12h6"/><circle cx="7" cy="38" r="1.6"/><circle cx="72" cy="9" r="1.5"/></svg></div><div class="nm-summary"><strong>${quiet}<span> / ${known.length}</span></strong><span>reported nights without waking</span></div><div class="nm-controls"><button type="button" class="nm-prev" aria-label="Earlier nights">← Earlier</button><span class="nm-range"></span><button type="button" class="nm-next" aria-label="Later nights">Later →</button></div><div class="nm-strip" role="group" aria-label="Night waking timeline"></div><p class="nm-detail" aria-live="polite"></p><label class="nm-scrub-label">Move through nights<input class="nm-scrub" type="range" min="0" step="1" aria-label="Inspect a night"/></label><p class="nm-key">Full: no waking · crescent: waking · outline: no entry</p><p class="nm-note">Symbols show reported waking, not lunar phases.</p>`;
      const strip = el.querySelector('.nm-strip');
      const detail = el.querySelector('.nm-detail');
      const scrub = el.querySelector('.nm-scrub');
      const prev = el.querySelector('.nm-prev');
      const next = el.querySelector('.nm-next');
      const pageSize = ctx.size === 'S' ? 7 : ctx.size === 'L' ? 14 : 10;
      let end = nights.length;
      let selected = nights.length - 1;
      const format = n => new Date(`${n.date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
      const describe = n => `${format(n)} · ${n.waking === null ? 'No entry' : n.waking === 0 ? 'No waking reported' : `${n.waking} waking${n.waking === 1 ? '' : 's'} reported`}`;
      function inspect(index) {
        selected = index;
        scrub.value = index;
        scrub.setAttribute('aria-valuetext', describe(nights[index]));
        detail.textContent = describe(nights[index]);
        strip.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.index) === selected)));
      }
      function draw() {
        strip.replaceChildren();
        const start = Math.max(0, end - pageSize);
        nights.slice(start, end).forEach((night, i) => {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'nm-night'; button.dataset.index = start + i;
          const phase = night.waking === null ? '<circle class="nm-unknown" cx="20" cy="20" r="15"/><text x="20" y="25">?</text>' : night.waking === 0 ? '<circle class="nm-rest" cx="20" cy="20" r="15"/>' : `<circle class="nm-shadow" cx="20" cy="20" r="15"/><path class="nm-waking" d="M20 5a15 15 0 1 0 0 30C${night.waking > 1 ? 4 : 13} 28 ${night.waking > 1 ? 4 : 13} 12 20 5Z"/>`;
          button.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true">${phase}</svg><span>${Number(night.date.slice(-2))}</span>`;
          button.title = describe(night); button.setAttribute('aria-label', describe(night));
          button.addEventListener('pointerenter', () => { detail.textContent = describe(night); });
          button.addEventListener('pointerleave', () => { detail.textContent = describe(nights[selected]); });
          button.addEventListener('focus', () => inspect(start + i));
          button.addEventListener('click', () => inspect(start + i));
          strip.append(button);
        });
        el.querySelector('.nm-range').textContent = `${format(nights[start])} – ${format(nights[end - 1])}`;
        prev.disabled = start === 0; next.disabled = end === nights.length;
        inspect(Math.min(end - 1, Math.max(start, selected)));
      }
      scrub.max = Math.max(0, nights.length - 1);
      scrub.disabled = !nights.length;
      if (!nights.length) { detail.textContent = 'No night entries in this period.'; prev.disabled = next.disabled = true; return; }
      prev.addEventListener('click', () => { end = Math.max(pageSize, end - pageSize); draw(); });
      next.addEventListener('click', () => { end = Math.min(nights.length, end + pageSize); draw(); });
      scrub.addEventListener('input', () => {
        selected = Number(scrub.value);
        if (selected < end - pageSize || selected >= end) { end = Math.min(nights.length, Math.max(pageSize, selected + 1)); draw(); }
        inspect(selected);
      });
      draw();
    }
  });
})();
