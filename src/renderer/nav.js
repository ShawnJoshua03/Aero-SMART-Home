(() => {
  // Bottom dock: switches between the Fly, Anomalies and Data pages. Pages other than Data are empty for now.
  const order = ['fly', 'anomalies', 'data'];
  const dock = document.getElementById('dock');
  const indicator = dock.querySelector('.dock-indicator');
  const items = [...dock.querySelectorAll('.dock-item')];
  const pages = Object.fromEntries(order.map((name) => [name, document.getElementById('page-' + name)]));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 'fly', timer; // Fly is the landing page

  function place(name) {
    const index = order.indexOf(name);
    indicator.style.transform = 'translateX(' + (index * 100) + '%)';
    items.forEach((item) => {
      const active = item.dataset.page === name;
      item.classList.toggle('is-active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
  }

  function show(name) {
    if (name === current) return;
    const forward = order.indexOf(name) > order.indexOf(current);
    const outgoing = pages[current], incoming = pages[name];
    current = name;
    place(name);
    clearTimeout(timer);
    order.forEach((other) => { if (pages[other] !== outgoing && pages[other] !== incoming) pages[other].hidden = true; });
    const enter = () => {
      outgoing.hidden = true;
      outgoing.classList.remove('is-leaving', 'to-left', 'to-right');
      incoming.hidden = false;
      incoming.classList.add('is-active');
      incoming.classList.remove('from-left', 'from-right');
      void incoming.offsetWidth;
      if (!reduced()) incoming.classList.add(forward ? 'from-right' : 'from-left');
      window.scrollTo({ top: 0 });
      window.dispatchEvent(new Event('resize')); // let charts re-measure after a hidden page is shown
    };
    outgoing.classList.remove('is-active');
    if (reduced()) { enter(); return; }
    outgoing.classList.add('is-leaving', forward ? 'to-left' : 'to-right');
    timer = setTimeout(enter, 140);
  }

  items.forEach((item) => item.addEventListener('click', () => show(item.dataset.page)));
  dock.addEventListener('keydown', (event) => {
    const i = items.findIndex((item) => item === document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    items[(i + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length].focus();
  });
  place(current);
})();
