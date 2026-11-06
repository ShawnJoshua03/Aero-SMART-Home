(() => {
  // Anomalies page: only things that need immediate attention. Charts are the shared widgets, re-rendered with the Data canvas.
  const page = document.getElementById('page-anomalies');
  const cards = [{ widgetId: 'anomaly-breathlessness', fill: 'plum' }, { widgetId: 'anomaly-rescue', fill: 'blue' }];
  let cleanups = [];
  let modalCleanup = null, modalReturn = null;
  const modal = document.getElementById('anomaly-modal');
  const modalBody = document.getElementById('anomaly-modal-body');

  // Phones show only the chart on the card; tapping opens everything (legend, summary, episodes) in a modal.
  function closeModal() {
    if (modal.hidden) return;
    if (modalCleanup) { try { modalCleanup(); } catch (error) { console.error(error); } modalCleanup = null; }
    modalBody.replaceChildren();
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    modalReturn?.focus();
  }
  function openModal(widget, ctx, from, fill) {
    modalReturn = from;
    document.getElementById('anomaly-modal-dialog').style.setProperty('--widget-fill', 'var(--fill-' + fill + ')');
    modalBody.replaceChildren();
    modal.hidden = false; // visible before rendering so the chart can measure its width
    document.body.classList.add('modal-open');
    try {
      const cleanup = widget.render(modalBody, { ...ctx, size: 'L', config: {}, onChange() {} });
      if (typeof cleanup === 'function') modalCleanup = cleanup;
    } catch (error) {
      console.error(error);
      modalBody.textContent = 'This chart could not render.';
    }
    // The modal title is the card's own summary heading.
    const heading = modalBody.querySelector('.sw-heading');
    document.getElementById('anomaly-modal-title').textContent = heading ? heading.textContent : widget.title;
    document.getElementById('anomaly-modal-close').focus();
  }
  document.getElementById('anomaly-modal-close').addEventListener('click', closeModal);
  document.getElementById('anomaly-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

  function render() {
    const { data, patientId } = window.Canvas.context();
    if (!data) return;
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch (error) { console.error(error); } });
    page.replaceChildren();
    const head = document.createElement('div');
    head.className = 'anomaly-head';
    const title = document.createElement('h2');
    title.textContent = 'Needs attention';
    head.append(title);
    const list = document.createElement('div');
    list.className = 'anomaly-list';
    cards.forEach(({ widgetId, fill }) => {
      const widget = window.Widgets.get(widgetId);
      if (!widget) return;
      const card = document.createElement('article');
      card.className = 'anomaly-card fill-' + fill;
      const recal = document.createElement('button');
      recal.type = 'button';
      recal.className = 'recalibrate';
      recal.textContent = 'Recalibrate';
      recal.title = 'Re-trains the anomaly model on this patient\'s recent data';
      // Intentionally does nothing yet; the demo explains that it re-trains the model.
      const body = document.createElement('div');
      body.className = 'anomaly-body';
      recal.addEventListener('click', (event) => event.stopPropagation());
      const hint = document.createElement('p');
      hint.className = 'anomaly-tap';
      hint.textContent = 'Tap for details';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', widget.title + ': open details');
      const open = () => openModal(widget, { data, patientId }, card, fill);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => { if (event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } });
      card.append(recal, body, hint);
      list.append(card);
      try {
        const cleanup = widget.render(body, { data, patientId, size: 'L', config: {}, onChange() {} });
        if (typeof cleanup === 'function') cleanups.push(cleanup);
      } catch (error) {
        console.error(error);
        body.textContent = 'This chart could not render.';
      }
    });
    page.append(head, list);
  }

  window.addEventListener('canvas:rendered', render);
  // The data can finish loading before this script runs, and the event only fires once. Draw now if it already has.
  if (window.Canvas?.context().data) render();
})();
