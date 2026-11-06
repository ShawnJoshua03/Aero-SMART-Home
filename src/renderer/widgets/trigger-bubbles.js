(() => {
  'use strict';

  function adaptData(ctx) {
    const labels = ['Pollen', 'Exercise', 'Dust', 'Cold air', 'Pets', 'Smoke'];
    const rows = ctx.data == null ? Array.from({ length: 35 }, (_, i) => ({ triggers: labels.filter((_, j) => i % (j + 2) === 0) }))
      : (Array.isArray(ctx.data) ? ctx.data : ctx.data.entries || ctx.data.responses || []).filter(r => !r.patientId || !ctx.patientId || r.patientId === ctx.patientId);
    const counts = new Map();
    rows.forEach(r => {
      const value = r.triggers ?? r.answers?.triggers;
      const triggers = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
      [...new Set(triggers.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim().toLowerCase()))].forEach(key => {
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    return [...counts].map(([id, count]) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), count })).sort((a, b) => b.count - a.count);
  }

  window.Widgets.register({
    id: 'trigger-bubbles', title: 'Trigger cloud', sizes: ['S', 'M', 'L'],
    render(el, ctx) {
      el.__cleanup?.();
      el.replaceChildren();
      el.classList.add('trigger-bubbles');
      el.dataset.size = ctx.size || 'M';
      const triggers = adaptData(ctx);
      el.innerHTML = '<div class="tb-heading"><h3>Trigger cloud</h3><button class="tb-reset" type="button">Clear filter</button></div><p>What keeps coming up?</p><svg class="tb-cloud" viewBox="0 0 400 270" role="group" aria-label="Reported triggers"></svg><p class="tb-detail" aria-live="polite">Hover for counts. Select a bubble to filter.</p><p class="tb-caption">Larger bubbles = more reports · multiple triggers per day</p><div class="tb-overflow"></div>';
      const svg = el.querySelector('svg');
      const detail = el.querySelector('.tb-detail');
      const reset = el.querySelector('.tb-reset');
      const ns = 'http://www.w3.org/2000/svg';
      const reduced = matchMedia('(prefers-reduced-motion: reduce)');
      const shown = triggers.slice(0, 8);
      let selected = null;
      let focused = null;
      let hovered = null;
      let disposed = false;
      let frame = 0;
      let last = 0;
      const max = shown[0]?.count || 1;
      const nodes = shown.map((trigger, i) => {
        const radius = Math.max(22, Math.sqrt(trigger.count / max) * 48);
        const group = document.createElementNS(ns, 'g');
        group.classList.add('tb-bubble', `tb-tone-${i % 4}`);
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.setAttribute('aria-pressed', 'false');
        group.setAttribute('aria-label', `${trigger.label}: ${trigger.count} reports. Filter by this trigger.`);
        const orb = document.createElementNS(ns, 'g');
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('r', radius);
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('y', '-3');
        label.textContent = trigger.label.length > 12 ? `${trigger.label.slice(0, 10)}…` : trigger.label;
        const count = document.createElementNS(ns, 'text');
        count.setAttribute('y', '14');
        count.classList.add('tb-count');
        count.textContent = trigger.count;
        const title = document.createElementNS(ns, 'title');
        title.textContent = `${trigger.label}: ${trigger.count} reports`;
        orb.append(circle, label, count, title);
        group.append(orb);
        svg.append(group);
        const node = { ...trigger, group, radius, x: 66 + (i % 4) * 89, y: 76 + Math.floor(i / 4) * 119, vx: Math.cos(i * 2.1) * .11, vy: Math.sin(i * 1.8 + .5) * .11 };
        const inspect = () => { detail.textContent = `${trigger.label} · ${trigger.count} reports${selected === trigger.id ? ' · filter active' : ''}`; };
        group.addEventListener('pointerenter', () => { hovered = node; inspect(); });
        group.addEventListener('pointerleave', () => { hovered = null; showSelection(); });
        group.addEventListener('focus', () => { focused = node; inspect(); });
        group.addEventListener('blur', () => { focused = null; showSelection(); });
        group.addEventListener('click', () => choose(trigger.id));
        group.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(trigger.id); }
          if (e.key === 'Escape') choose(null);
        });
        return node;
      });
      // Extra categories remain accessible even when the cloud is crowded.
      const extras = [];
      triggers.slice(8).forEach(trigger => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${trigger.label} (${trigger.count})`;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => choose(trigger.id));
        el.querySelector('.tb-overflow').append(button);
        extras.push({ id: trigger.id, group: button });
      });
      function showSelection() {
        const active = triggers.find(t => t.id === selected);
        detail.textContent = active ? `Filtering: ${active.label} · ${active.count} reports` : triggers.length ? 'Hover for counts. Select a bubble to filter.' : 'No triggers reported in this period.';
      }
      function choose(id) {
        selected = selected === id ? null : id;
        [...nodes, ...extras].forEach(n => n.group.setAttribute('aria-pressed', String(n.id === selected)));
        reset.disabled = !selected;
        showSelection();
        ctx.onChange?.({ widgetId: 'trigger-bubbles', type: 'filter', filter: { trigger: selected }, patientId: ctx.patientId });
      }
      reset.disabled = true;
      reset.addEventListener('click', () => choose(null));
      function paint() { nodes.forEach(n => n.group.setAttribute('transform', `translate(${n.x.toFixed(2)} ${n.y.toFixed(2)})`)); }
      function step(time) {
        if (disposed) return;
        const dt = Math.min(2, (time - last) / 16.67 || 1);
        last = time;
        if (!document.hidden) {
          nodes.forEach((a, i) => {
            if (a !== focused && a !== hovered) { a.x += a.vx * dt; a.y += a.vy * dt; }
            nodes.slice(i + 1).forEach(b => {
              const dx = b.x - a.x, dy = b.y - a.y;
              const distance = Math.hypot(dx, dy) || 1;
              const gap = a.radius + b.radius + 9;
              if (distance < gap) {
                const push = (gap - distance) * .035;
                if (a !== focused && a !== hovered) { a.x -= dx / distance * push; a.y -= dy / distance * push; }
                if (b !== focused && b !== hovered) { b.x += dx / distance * push; b.y += dy / distance * push; }
              }
            });
            const r = a.radius + 9;
            if (a.x < r || a.x > 400 - r) a.vx *= -1;
            if (a.y < r || a.y > 270 - r) a.vy *= -1;
            a.x = Math.min(400 - r, Math.max(r, a.x));
            a.y = Math.min(270 - r, Math.max(r, a.y));
          });
          paint();
        }
        frame = requestAnimationFrame(step);
      }
      const motionChanged = () => { cancelAnimationFrame(frame); last = 0; if (!reduced.matches && nodes.length) frame = requestAnimationFrame(step); };
      reduced.addEventListener('change', motionChanged);
      paint(); showSelection(); motionChanged();
      el.__cleanup = () => { disposed = true; cancelAnimationFrame(frame); reduced.removeEventListener('change', motionChanged); el.getAnimations({ subtree: true }).forEach(animation => animation.cancel()); };
    }
  });
})();
