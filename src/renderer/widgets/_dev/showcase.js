(function () {
  var root = document.getElementById('showcase');
  var sizes = ['S', 'M', 'L'];
  window.Widgets.getAll().forEach(function (widget) {
    var section = document.createElement('section');
    section.className = 'demo-widget';
    var heading = document.createElement('h2');
    heading.textContent = widget.title + ' · ' + widget.id;
    section.appendChild(heading);
    var grid = document.createElement('div');
    grid.className = 'demo-grid';
    sizes.forEach(function (size) {
      var frame = document.createElement('article');
      frame.className = 'demo-frame';
      var label = document.createElement('h3');
      label.textContent = size;
      var mount = document.createElement('div');
      mount.className = 'demo-mount';
      frame.appendChild(label);
      frame.appendChild(mount);
      grid.appendChild(frame);
      widget.render(mount, {
        data: undefined,
        patientId: 'demo-patient',
        size: size,
        onChange: function (selection) {
          var note = document.getElementById('selection');
          note.textContent = 'Selected day: ' + selection.date.slice(0, 10);
        }
      });
    });
    section.appendChild(grid);
    root.appendChild(section);
  });
}());
