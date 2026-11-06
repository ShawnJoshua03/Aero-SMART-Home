(async () => {
  'use strict';
  const ids = ['adherence-heatmap', 'trigger-bubbles', 'night-moon', 'change-ticker', 'air-quality'];
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script);
  });
  const errors = [];
  window.addEventListener('error', e => { if (e.message) errors.push(e.message); });
  document.addEventListener('securitypolicyviolation', e => errors.push(`CSP: ${e.violatedDirective}`));
  try {
    try { await load('../registry.js'); } catch { await load('registry-stub.js'); }
    // Capture registrations without assuming the production registry's lookup API.
    const widgets = [];
    const register = window.Widgets.register.bind(window.Widgets);
    window.Widgets.register = widget => { widgets.push(widget); return register(widget); };
    for (const id of ids) await load(`../${id}.js`);
    const gallery = document.querySelector('#gallery');
    const events = [];
    const supplied = { lastVisit: '2026-10-24', baseline: { breathlessness: 2 }, entries: [
      { patientId: 'preview', date: '2026-10-21', controllerTaken: true, triggers: ['pollen', 'dust'], nightWaking: 0, breathlessness: 2, rescueInhalerUses: 0 },
      { patientId: 'preview', date: '2026-10-22', controllerTaken: false, triggers: ['pollen'], nightWaking: 1, breathlessness: 3, rescueInhalerUses: 1 },
      { patientId: 'preview', date: '2026-10-25', controllerTaken: true, triggers: ['exercise'], nightWaking: 2, breathlessness: 7, rescueInhalerUses: 3 },
      { patientId: 'someone-else', date: '2026-10-26', controllerTaken: true, triggers: ['must not appear'], nightWaking: 8, breathlessness: 10 }
    ] };
    const renders = [];
    const onChange = change => { events.push(change); document.querySelector('#events').textContent = JSON.stringify(change); };
    widgets.forEach(widget => {
      const row = document.createElement('section'); row.className = 'dev-row';
      const title = document.createElement('h2'); title.textContent = widget.id;
      const grid = document.createElement('div'); grid.className = 'dev-grid';
      ['S', 'M', 'L'].forEach(size => {
        const section = document.createElement('section');
        const caption = document.createElement('p'); caption.className = 'dev-size'; caption.textContent = `${size} / ${size === 'S' ? 'compact' : size === 'M' ? 'standard' : 'expanded'}`;
        const frame = document.createElement('div'); frame.className = 'dev-frame';
        const el = document.createElement('div'); frame.append(el); section.append(caption, frame); grid.append(section);
        renders.push({ widget, el, size });
      });
      row.append(title, grid); gallery.append(row);
    });
    function renderAll() {
      const value = document.querySelector('#scenario').value;
      renders.forEach(({ widget, el, size }) => widget.render(el, { patientId: 'preview', size, onChange, data: value === 'sample' ? undefined : value === 'supplied' ? supplied : { entries: [] } }));
    }
    document.querySelector('#scenario').addEventListener('change', renderAll);
    document.querySelector('#rerender').addEventListener('click', renderAll);
    window.addEventListener('pagehide', () => renders.forEach(({ el }) => el.__cleanup?.()));
    renderAll();
    document.querySelector('#checks').textContent = 'Five widgets · three sizes · local scripts and styles only';
    if (new URLSearchParams(location.search).has('test')) {
      const assertions = [];
      const assert = (condition, label) => { if (!condition) throw new Error(label); assertions.push(label); };
      assert(widgets.length === 5 && renders.length === 15, 'Five registrations; S/M/L render');
      const first = id => renders.find(r => r.widget.id === id).el;
      const ah = first('adherence-heatmap');
      assert(ah.querySelector('.ah-streak strong').textContent === '10', 'Adherence streak calculation');
      ah.querySelector('.ah-day').click();
      assert(ah.querySelector('[aria-pressed=true]'), 'Calendar day selection');
      const tb = first('trigger-bubbles');
      tb.querySelector('.tb-bubble').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assert(events.at(-1).filter.trigger === 'pollen', 'Trigger emits filter event');
      tb.querySelector('.tb-reset').click();
      assert(events.at(-1).filter.trigger === null, 'Trigger clears filter');
      const nm = first('night-moon');
      const scrub = nm.querySelector('input'); scrub.value = '0'; scrub.dispatchEvent(new Event('input'));
      assert(nm.querySelector('[aria-pressed=true]').dataset.index === '0', 'Night scrub selects first date');
      nm.querySelector('.nm-next').click();
      assert(nm.querySelector('.nm-prev').disabled === false, 'Night pagination');
      const ct = first('change-ticker'); ct.querySelector('.ct-chip').click();
      assert(events.at(-1).type === 'highlight' && ct.querySelector('.ct-chip[aria-pressed=true]'), 'Ticker highlights and emits metric');
      const wasPaused = ct.querySelector('.ct-pause').getAttribute('aria-pressed');
      ct.querySelector('.ct-pause').click();
      assert(ct.querySelector('.ct-pause').getAttribute('aria-pressed') !== wasPaused, 'Ticker manual pause');
      const aq = first('air-quality'); aq.querySelector('.aq-toggle').click();
      assert(aq.querySelector('.aq-overlay') && aq.querySelector('.aq-mock').textContent === 'MOCK', 'Pollen overlay and mock label');
      assert(aq.querySelectorAll('.aq-flagged').length === 2, 'Mock pollen highlights two next-day spikes in compact strip');
      document.querySelector('#scenario').value = 'supplied'; renderAll();
      assert(first('adherence-heatmap').querySelectorAll('.ah-day.ah-empty').length === 2, 'Calendar fills missing dates');
      assert(!first('trigger-bubbles').textContent.includes('Must not appear'), 'Patient isolation');
      assert(first('night-moon').querySelectorAll('.nm-unknown').length === 2, 'Night timeline preserves no-entry days');
      assert(first('air-quality').querySelectorAll('.aq-day').length === 5, 'Pollen aligns to patient calendar');
      document.querySelector('#scenario').value = 'empty'; renderAll();
      assert(first('adherence-heatmap').querySelectorAll('.ah-day').length === 0 && first('air-quality').querySelectorAll('.aq-day').length === 0, 'Empty data does not become sample data');
      document.querySelector('#scenario').value = 'sample'; renderAll(); renderAll();
      assert(first('trigger-bubbles').querySelectorAll('svg').length === 1 && first('change-ticker').querySelectorAll('.ct-track').length === 1, 'Repeat renders replace owned content');
      assert(typeof first('trigger-bubbles').__cleanup === 'function' && typeof first('change-ticker').__cleanup === 'function', 'Animation cleanup hooks provided');
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      // Exercise actual animation lifecycle, not just presence of cleanup properties.
      const cloud = first('trigger-bubbles');
      const bubble = cloud.querySelector('.tb-bubble');
      const initialPosition = bubble.getAttribute('transform');
      await wait(2200);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const ticker = first('change-ticker');
      const viewport = ticker.querySelector('.ct-viewport');
      if (reduced) {
        assert(bubble.getAttribute('transform') === initialPosition && viewport.scrollLeft === 0, 'Reduced motion stops automatic drift and scrolling');
      } else {
        assert(bubble.getAttribute('transform') !== initialPosition, 'Bubble physics advances');
        assert(viewport.scrollLeft > 0, 'Ticker advances automatically');
        ticker.dispatchEvent(new Event('pointerenter'));
        const pausedPosition = viewport.scrollLeft;
        await wait(150);
        assert(viewport.scrollLeft === pausedPosition, 'Ticker pauses on hover');
        ticker.dispatchEvent(new Event('pointerleave'));
      }
      renders.forEach(({ el }) => el.__cleanup?.());
      const stoppedPosition = bubble.getAttribute('transform');
      const stoppedScroll = viewport.scrollLeft;
      await wait(150);
      assert(bubble.getAttribute('transform') === stoppedPosition && viewport.scrollLeft === stoppedScroll, 'Cleanup stops animation frames');
      renderAll();
      assert(!errors.length, `No runtime or CSP errors: ${errors.join(', ')}`);
      document.querySelector('#checks').textContent = `PASS: ${assertions.length} checks — ${assertions.join('; ')}`;
      document.body.dataset.testResult = 'pass';
    }
  } catch (error) {
    document.querySelector('#checks').textContent = `FAIL: ${error.message}`;
    document.body.dataset.testResult = 'fail';
    console.error(error);
  }
})();
