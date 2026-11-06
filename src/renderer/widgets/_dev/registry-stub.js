// Standalone preview only. Never replaces an existing application registry.
(() => {
  if (window.Widgets) return;
  const definitions = new Map();
  window.Widgets = {
    register(widget) {
      if (!widget.id || typeof widget.render !== 'function') throw new Error('Invalid widget contract');
      if (definitions.has(widget.id)) throw new Error(`Duplicate widget: ${widget.id}`);
      definitions.set(widget.id, widget);
    },
    get(id) { return definitions.get(id); },
    list() { return [...definitions.values()]; }
  };
})();
