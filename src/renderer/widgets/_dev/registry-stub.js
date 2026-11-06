(function () {
  var items = {};
  window.Widgets = {
    register: function (widget) { items[widget.id] = widget; },
    getAll: function () { return Object.keys(items).map(function (id) { return items[id]; }); }
  };
}());
