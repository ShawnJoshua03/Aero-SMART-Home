(() => {
  // Anomalies page: only things that need immediate attention. Charts are the shared widgets, re-rendered with the Data canvas.
  const page = document.getElementById('page-anomalies');
  const cards = [{ widgetId: 'anomaly-breathlessness', fill: 'plum' }];
  let cleanups = [];

  function render() {
    const { data, patientId } = window.Canvas.context();
    if (!data) return;
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch (error) { console.error(error); } });
    const patient = data.patients.find((p) => p.id === patientId);
    page.replaceChildren();
    const head = document.createElement('div');
    head.className = 'anomaly-head';
    const title = document.createElement('h2');
    title.textContent = 'Needs attention';
    const sub = document.createElement('p');
    sub.className = 'muted';
    sub.textContent = (patient ? patient.name + ': ' : '') + 'flagged against their own baseline.';
    head.append(title, sub);
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
      card.append(recal, body);
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
})();
