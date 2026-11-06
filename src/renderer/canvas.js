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

  // Clicking a card opens it enlarged in a modal. The widget is rendered afresh at size L;
  // nothing it does in the modal is persisted.
  let modalCleanup = null, modalReturn = null;
  function closeModal() {
    const modal = document.getElementById('card-modal');
    if (modal.hidden) return;
    if (modalCleanup) { try { modalCleanup(); } catch (error) { console.error(error); } modalCleanup = null; }
    document.getElementById('card-modal-body').replaceChildren();
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    modalReturn?.focus();
  }
  function openModal(item, card, widget) {
    const modal = document.getElementById('card-modal');
    const dialog = document.getElementById('card-modal-dialog');
    const body = document.getElementById('card-modal-body');
    dialog.style.setProperty('--widget-fill', getComputedStyle(card).getPropertyValue('--widget-fill'));
    dialog.dataset.instanceId = item.instanceId;
    document.getElementById('card-modal-title').textContent = widget.title;
    body.replaceChildren();
    modalReturn = card.querySelector('.widget-body');
    modal.hidden = false; // visible before render so charts can measure their width
    document.body.classList.add('modal-open');
    try {
      const cleanup = widget.render(body, { data, patientId: layout.patientId, size: 'L', config: structuredClone(item.config ?? {}), onChange() {} });
      if (typeof cleanup === 'function') modalCleanup = cleanup;
    } catch (error) {
      console.error(error);
      body.textContent = 'This widget could not render.';
    }
    document.getElementById('card-modal-close').focus();
  }

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
    closeModal();
    cleanups.splice(0).forEach(cleanup => { try { cleanup(); } catch (error) { console.error(error); } });
    grid.replaceChildren();
    let rail = null; // consecutive KPI cards are grouped in one vertical stack
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
      if (item.widgetId === 'kpi') {
        if (!rail) {
          rail = document.createElement('div');
          rail.className = 'kpi-rail';
          rail.setAttribute('role', 'group');
          rail.setAttribute('aria-label', 'KPI cards');
          grid.append(rail);
        }
        rail.append(card);
      } else {
        rail = null;
        grid.append(card);
      }
      if (widget) {
        body.tabIndex = 0;
        body.title = 'Click to enlarge';
        const open = () => openModal(item, card, widget);
        body.addEventListener('click', (event) => { if (!event.target.closest('button, a, input, select, textarea, label, summary')) open(); });
        body.addEventListener('keydown', (event) => { if (event.target === body && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } });
      }
      if (!widget) { body.textContent = 'This widget is not registered. Its saved place is preserved.'; return; }
      try {
        const cleanup = widget.render(body, {
          data, patientId: layout.patientId, size: item.size, config: item.config ?? {},
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
      const button = document.getElementById('patient-button');
      const menu = document.getElementById('patient-menu');
      const setMenu = (open) => {
        menu.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
      };
      const showPatient = () => {
        document.getElementById('patient-name').textContent = data.patients.find(p => p.id === layout.patientId)?.name ?? 'No patient';
        menu.querySelectorAll('[role=option]').forEach(item => item.setAttribute('aria-selected', String(item.dataset.patientId === layout.patientId)));
      };
      data.patients.forEach(patient => {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.tabIndex = 0;
        item.dataset.patientId = patient.id;
        item.textContent = patient.name;
        const choose = () => { setMenu(false); button.focus(); if (layout.patientId !== patient.id) { layout.patientId = patient.id; showPatient(); changed(); } };
        item.addEventListener('click', choose);
        item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
        menu.append(item);
      });
      showPatient();
      button.disabled = false;
      button.addEventListener('click', () => setMenu(menu.hidden));
      document.addEventListener('click', (event) => { if (!event.target.closest('.patient-picker')) setMenu(false); });
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !menu.hidden) { setMenu(false); button.focus(); } });
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
      // Re-measure charts when the window is resized (phone <-> browser layouts).
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (document.getElementById('card-modal').hidden) renderGrid(); }, 250);
      });
      document.getElementById('card-modal-close').addEventListener('click', closeModal);
      document.getElementById('card-modal-backdrop').addEventListener('click', closeModal);
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
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
