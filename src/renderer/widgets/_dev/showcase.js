(function () {
  var root = document.getElementById('showcase');
  var sizes = ['S', 'M', 'L'];
  var palettes = [
    { name: 'Plum', className: 'palette-plum' },
    { name: 'Blue', className: 'palette-blue' },
    { name: 'Green', className: 'palette-green' },
    { name: 'Teal', className: 'palette-teal' }
  ];
  window.Widgets.getAll().forEach(function (widget) {
    var section = document.createElement('section');
    section.className = 'demo-widget';
    var heading = document.createElement('h2');
    heading.textContent = widget.title + ' · ' + widget.id;
    section.appendChild(heading);
    sizes.forEach(function (size) {
      var sizeGroup = document.createElement('div');
      sizeGroup.className = 'demo-size';
      var sizeLabel = document.createElement('h3');
      sizeLabel.textContent = size + ' size';
      sizeGroup.appendChild(sizeLabel);
      var grid = document.createElement('div');
      grid.className = 'demo-grid';
      palettes.forEach(function (palette) {
        var frame = document.createElement('article');
        frame.className = 'demo-frame ' + palette.className;
        var label = document.createElement('h4');
        label.textContent = palette.name;
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
      sizeGroup.appendChild(grid);
      section.appendChild(sizeGroup);
    });
    root.appendChild(section);
  });
}());
