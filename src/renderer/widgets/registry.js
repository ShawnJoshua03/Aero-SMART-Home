(() => {
  const widgets = new Map();
  window.Widgets = Object.freeze({
    register({ id, title, sizes, render }) {
      if (typeof id !== 'string' || !id.trim() || typeof title !== 'string' || !title.trim() ||
          !Array.isArray(sizes) || !sizes.length || sizes.some(size => !['S', 'M', 'L'].includes(size)) ||
          new Set(sizes).size !== sizes.length || typeof render !== 'function') {
        throw new TypeError('A widget requires id, title, sizes (S/M/L), and render(el, ctx).');
      }
      if (widgets.has(id)) throw new Error(`Widget already registered: ${id}`);
      widgets.set(id, Object.freeze({ id, title, sizes: Object.freeze([...sizes]), render }));
      window.dispatchEvent(new Event('widgets:registered'));
    },
    list: () => [...widgets.values()],
    get: (id) => widgets.get(id),
  });
})();
