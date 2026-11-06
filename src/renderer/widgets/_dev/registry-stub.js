(function () {
  var entries = {};
  window.Widgets = {
    register: function (definition) {
      entries[definition.id] = definition;
    },
    get: function (id) {
      return entries[id];
    },
    all: function () {
      return Object.keys(entries).map(function (id) { return entries[id]; });
    }
  };
}());
