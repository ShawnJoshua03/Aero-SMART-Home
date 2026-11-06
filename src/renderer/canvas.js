(() => {
  const MIME = 'application/x-smart-home-widget';
  let data, layout, revision = 0, saveQueue = Promise.resolve();
  const cleanups = [];
  const grid = document.getElementById('canvas');
  const palette = document.getElementById('palette');
  const status = document.getElementById('save-status');
  const retry = document.getElementById('retry-save');

  function save() {
    const currentRevision = ++revision;
    const snapshot = structuredClone(layout);
    status.textContent = 'Saving…';
    retry.hidden = true;
    saveQueue = saveQueue.catch(() => {}).then(() => window.api.savePrefs(snapshot)).then(() => {
      if (currentRevision === revision) status.textContent = 'Layout saved';
    }).catch((error) => {
      console.error(error);
      if (currentRevision === revision) {
        status.textContent = 'Could not save. Your changes are still here.';
        retry.hidden = false;
      }
    });
  }

  function button(text, label, action) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text;
    el.setAttribute('aria-label', label);
    el.addEventListener('click', action);
    return el;
  }

  function changed() { renderGrid(); save(); }

  function add(widgetId, beforeId) {
    const widget = window.Widgets.get(widgetId);
    if (!widget || layout.widgets.length >= 100) return;
    const card = { instanceId: crypto.randomUUID(), widgetId, size: widget.sizes.includes('M') ? 'M' : widget.sizes[0], config: {} };
    const before = layout.widgets.findIndex(item => item.instanceId === beforeId);
    layout.widgets.splice(before < 0 ? layout.widgets.length : before, 0, card);
    changed();
  }

  function move(instanceId, beforeId) {
    if (instanceId === beforeId) return;
    const from = layout.widgets.findIndex(item => item.instanceId === instanceId);
    if (from < 0) return;
    const [card] = layout.widgets.splice(from, 1);
    const before = layout.widgets.findIndex(item => item.instanceId === beforeId);
    layout.widgets.splice(before < 0 ? layout.widgets.length : before, 0, card);
    changed();
  }

  function draggable(el, payload) {
    el.draggable = true;
    el.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(MIME, JSON.stringify(payload));
      // Supply a standard native drag flavor as well as the private app payload.
      event.dataTransfer.setData('text/plain', payload.widgetId ?? payload.instanceId);
      event.dataTransfer.effectAllowed = payload.widgetId ? 'copy' : 'move';
      grid.classList.add('drag-active');
      // Slide the tray away after the drag has begun so the whole canvas is a drop target.
      setTimeout(() => document.body.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', clearDrop);
  }

  function clearDrop() {
    document.body.classList.remove('dragging');
    grid.classList.remove('drag-active');
    grid.querySelectorAll('.drop-before').forEach(el => el.classList.remove('drop-before'));
  }

  function renderPalette() {
    palette.replaceChildren();
    window.Widgets.list().forEach(widget => {
      const item = document.createElement('div');
      item.className = 'palette-item';
      const title = document.createElement('strong');
      title.textContent = widget.title;
      const sizes = document.createElement('span');
      sizes.className = 'muted';
      sizes.textContent = widget.sizes.join(' / ');
      item.append(title, sizes, button('Add +', `Add ${widget.title}`, () => add(widget.id)));
      draggable(item, { widgetId: widget.id });
      palette.append(item);
    });
  }

  function renderGrid() {
    cleanups.splice(0).forEach(cleanup => { try { cleanup(); } catch (error) { console.error(error); } });
    grid.replaceChildren();
    layout.widgets.forEach((item, index) => {
      const widget = window.Widgets.get(item.widgetId);
      const card = document.createElement('article');
      card.className = `widget-card size-${item.size}`;
      card.dataset.instanceId = item.instanceId;
      const toolbar = document.createElement('div');
      toolbar.className = 'widget-toolbar';
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = `⠿ ${widget?.title ?? item.widgetId}`;
      handle.title = 'Drag to move';
      draggable(handle, { instanceId: item.instanceId });
      toolbar.append(handle);
      const sizes = document.createElement('select');
      sizes.setAttribute('aria-label', `Size of ${widget?.title ?? item.widgetId}`);
      [...new Set([...(widget?.sizes ?? ['S', 'M', 'L']), item.size])].forEach(size => sizes.add(new Option(size, size)));
      sizes.value = item.size;
      sizes.addEventListener('change', () => { item.size = sizes.value; changed(); });
      const earlier = button('←', 'Move widget earlier', () => move(item.instanceId, layout.widgets[index - 1]?.instanceId));
      earlier.disabled = index === 0;
      const later = button('→', 'Move widget later', () => move(item.instanceId, layout.widgets[index + 2]?.instanceId));
      later.disabled = index === layout.widgets.length - 1;
      toolbar.append(sizes, earlier, later, button('×', `Remove ${widget?.title ?? item.widgetId}`, () => {
        layout.widgets = layout.widgets.filter(other => other.instanceId !== item.instanceId);
        changed();
      }));
      const body = document.createElement('div');
      body.className = 'widget-body';
      card.append(toolbar, body);
      grid.append(card);
      if (!widget) { body.textContent = 'This widget is not registered. Its saved place is preserved.'; return; }
      try {
        const cleanup = widget.render(body, {
          data, patientId: layout.patientId, size: item.size,
          onChange(config) {
            // No argument requests persistence; a JSON object replaces instance settings.
            if (!layout.widgets.includes(item)) return;
            if (config !== undefined) {
              if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Widget config must be a JSON object');
              item.config = JSON.parse(JSON.stringify(config));
            }
            save();
          },
        });
        if (typeof cleanup === 'function') cleanups.push(cleanup);
      } catch (error) {
        console.error(error);
        body.textContent = 'This widget could not render. You can resize or remove it.';
      }
    });
    const drop = document.createElement('div');
    drop.className = 'drop-zone';
    drop.textContent = layout.widgets.length ? '+ Drop another widget here' : 'Your view starts here. Drop a widget or choose Add from the tray.';
    grid.append(drop);
  }

  window.Canvas = Object.freeze({
    async start() {
      const [loadedData, prefs] = await Promise.all([window.api.getData(), window.api.getPrefs()]);
      data = loadedData;
      layout = structuredClone(prefs.clinicians[prefs.activeClinicianId].layout);
      if (!data.patients.some(patient => patient.id === layout.patientId)) layout.patientId = data.patients[0]?.id;
      const selector = document.getElementById('patient-select');
      data.patients.forEach(patient => selector.add(new Option(patient.name, patient.id)));
      selector.value = layout.patientId;
      selector.disabled = false;
      selector.addEventListener('change', () => { layout.patientId = selector.value; changed(); });
      document.getElementById('period-label').textContent = `${data.period.start} — ${data.period.end} · ${data.period.expectedDays} days`;
      const setTray = (open) => {
        document.body.classList.toggle('tray-open', open);
        document.getElementById('tray-scrim').hidden = !open;
        document.getElementById('tray-toggle').setAttribute('aria-expanded', String(open));
        document.getElementById('tray-drawer').setAttribute('aria-hidden', String(!open));
        (open ? document.getElementById('tray-close') : document.getElementById('tray-toggle')).focus();
      };
      document.getElementById('tray-toggle').addEventListener('click', () => setTray(!document.body.classList.contains('tray-open')));
      document.getElementById('tray-close').addEventListener('click', () => setTray(false));
      document.getElementById('tray-scrim').addEventListener('click', () => setTray(false));
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.body.classList.contains('tray-open')) setTray(false); });
      retry.addEventListener('click', save);
      grid.addEventListener('dragover', (event) => {
        if (!event.dataTransfer.types.includes(MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
        clearDrop();
        grid.classList.add('drag-active');
        event.target.closest('.widget-card')?.classList.add('drop-before');
      });
      grid.addEventListener('drop', (event) => {
        event.preventDefault();
        clearDrop();
        try {
          const payload = JSON.parse(event.dataTransfer.getData(MIME));
          const beforeId = event.target.closest('.widget-card')?.dataset.instanceId;
          if (payload.widgetId) add(payload.widgetId, beforeId);
          else if (payload.instanceId) move(payload.instanceId, beforeId);
        } catch { /* Ignore non-widget drops. */ }
      });
      window.addEventListener('widgets:registered', () => { renderPalette(); renderGrid(); });
      renderPalette();
      renderGrid();
      status.textContent = 'Layout saved';
    },
  });
})();
