(function () {
  function adaptData(ctx) {
    function sampleData() {
      var rows = [];
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      for (var i = 34; i >= 0; i -= 1) {
        var date = new Date(today);
        date.setDate(date.getDate() - i);
        var drift = i < 10 ? (10 - i) * 0.34 : 0;
        rows.push({
          date: date.toISOString(),
          breathlessness: Math.max(0, Math.min(10, 2.4 + drift + Math.sin(i * 1.7) * 1.2)),
          rescueUses: Math.max(0, Math.round(1 + drift * 0.7 + Math.sin(i * 0.9))),
          nightWaking: i % 8 === 1 || (i < 9 && i % 3 === 0),
          controllerTaken: i % 9 !== 2
        });
      }
      return rows;
    }

    var aliases = {
      breathlessness: ['breathlessness', 'breathless', 'dyspnea', 'shortness of breath'],
      rescueUses: ['rescue uses', 'rescue inhaler uses', 'inhaler uses', 'rescue inhaler', 'rescue'],
      nightWaking: ['night waking', 'night time waking', 'night wakings', 'woke at night', 'night waking yes', 'night symptoms'],
      controllerTaken: ['controller taken', 'controller medication taken', 'controller', 'medication taken', 'adherence']
    };
    var fallback = sampleData();
    var source = ctx && ctx.data;
    var patientId = ctx && ctx.patientId != null ? String(ctx.patientId) : '';
    var root = source;

    function norm(value) {
      return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    function patientKey(row) {
      if (!row || typeof row !== 'object') return '';
      var patient = row.patient;
      return String(row.patientId || row.patient_id || row.subjectId ||
        (typeof patient === 'object' && patient ? patient.id || patient.patientId : patient) || '');
    }
    function findPatient(node) {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node.patients)) {
        for (var i = 0; i < node.patients.length; i += 1) {
          var candidate = node.patients[i];
          if (patientId && candidate && (patientKey(candidate) === patientId || String(candidate.id || '') === patientId)) return candidate;
        }
        return null;
      }
      if (node.patients && patientId) return node.patients[patientId] || null;
      if (patientId && node[patientId] && typeof node[patientId] === 'object') return node[patientId];
      return null;
    }
    function locateRows(node, depth) {
      if (!node || depth > 3) return null;
      if (Array.isArray(node)) return node;
      if (typeof node !== 'object') return null;
      var preferred = ['responses', 'records', 'entries', 'observations', 'submissions', 'logs', 'days'];
      for (var i = 0; i < preferred.length; i += 1) {
        if (Array.isArray(node[preferred[i]])) return node[preferred[i]];
      }
      var keys = Object.keys(node);
      for (var j = 0; j < keys.length; j += 1) {
        if (keys[j] === 'patients') continue;
        var found = locateRows(node[keys[j]], depth + 1);
        if (found) return found;
      }
      return null;
    }
    function valueOf(value) {
      if (value && typeof value === 'object') {
        return value.value != null ? value.value : value.answer != null ? value.answer :
          value.response != null ? value.response : value.text;
      }
      return value;
    }
    function fieldValue(row, names) {
      var containers = [row];
      ['answers', 'responses', 'values', 'metrics', 'data'].forEach(function (key) {
        if (row && row[key] != null) containers.push(row[key]);
      });
      var wanted = names.map(norm);
      for (var i = 0; i < containers.length; i += 1) {
        var container = containers[i];
        if (Array.isArray(container)) {
          for (var j = 0; j < container.length; j += 1) {
            var answer = container[j];
            var label = norm(answer && (answer.question || answer.label || answer.key || answer.name || answer.id));
            if (label && wanted.some(function (name) { return label.indexOf(name) >= 0 || name.indexOf(label) >= 0; })) {
              return valueOf(answer);
            }
          }
        } else if (container && typeof container === 'object') {
          var keys = Object.keys(container);
          for (var k = 0; k < keys.length; k += 1) {
            var keyName = norm(keys[k]);
            if (wanted.some(function (name) { return keyName === name || keyName.indexOf(name) >= 0 || name.indexOf(keyName) >= 0; })) {
              return valueOf(container[keys[k]]);
            }
          }
        }
      }
      return undefined;
    }
    function numeric(value) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value == null || value === '') return null;
      var text = String(value).toLowerCase().trim();
      if (/^(yes|true|taken|adherent|woke|present)$/.test(text)) return 1;
      if (/^(no|false|missed|not taken|none|absent)$/.test(text)) return 0;
      var parsed = Number.parseFloat(text);
      return Number.isFinite(parsed) ? parsed : null;
    }
    function dateValue(row) {
      var raw = row && (row.date || row.timestamp || row.createdAt || row.submittedAt || row.recordedAt || row.day);
      var parsed = raw ? new Date(raw) : null;
      return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }

    var selectedPatient = findPatient(source);
    if (selectedPatient) root = selectedPatient;
    var rows = source == null ? fallback : locateRows(root, 0);
    var records = (rows || []).filter(function (row) {
      return !patientId || !patientKey(row) || patientKey(row) === patientId;
    }).map(function (row) {
      var date = dateValue(row);
      if (!date) return null;
      var record = { date: date, raw: row };
      Object.keys(aliases).forEach(function (key) {
        record[key] = numeric(fieldValue(row, aliases[key]));
      });
      return record;
    }).filter(Boolean).sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    if (source == null) records = fallback.map(function (row) {
      return { date: row.date, raw: row, breathlessness: row.breathlessness, rescueUses: row.rescueUses,
        nightWaking: row.nightWaking ? 1 : 0, controllerTaken: row.controllerTaken ? 1 : 0 };
    });
    return { records: records, patientId: patientId };
  }

  var metricInfo = {
    breathlessness: { label: 'Breathlessness', unit: '/10', min: 0 },
    rescueUses: { label: 'Rescue uses / day', unit: 'uses', min: 0 },
    nightWaking: { label: 'Night waking', unit: 'yes / no', min: 0, max: 1 },
    controllerTaken: { label: 'Controller taken', unit: 'yes / no', min: 0, max: 1 }
  };
  var weekClasses = ['scatter-week-0', 'scatter-week-1', 'scatter-week-2', 'scatter-week-3'];

  function render(el, ctx) {
    if (typeof el.__cleanup === 'function') el.__cleanup();
    el.__cleanup = null;
    el.replaceChildren();

    var data = adaptData(ctx);
    var size = ctx && ctx.size || 'M';
    var xMetric = 'rescueUses';
    var yMetric = 'breathlessness';
    var showFit = true;
    var selectedDate = '';
    var width = 760;
    var height = 300;
    var margin = { top: 16, right: 20, bottom: 42, left: 54 };
    var plotWidth = width - margin.left - margin.right;
    var plotHeight = height - margin.top - margin.bottom;

    el.className = 'scatter-widget is-' + size;
    el.innerHTML =
      '<div class="scatter-head"><h3 class="scatter-title">Daily responses together</h3>' +
      '<label><span class="scatter-axis">X </span><select class="scatter-control scatter-x" aria-label="Horizontal metric"></select></label>' +
      '<label><span class="scatter-axis">Y </span><select class="scatter-control scatter-y" aria-label="Vertical metric"></select></label>' +
      '<label class="scatter-trend-toggle"><input class="scatter-fit-toggle" type="checkbox" checked /> Trend line</label></div>' +
      '<div class="scatter-stage"></div><div class="scatter-tooltip" aria-live="polite">Hover a point for its day; select it to focus the record.</div>' +
      '<div class="scatter-legend"></div>';
    var stage = el.querySelector('.scatter-stage');
    var tooltip = el.querySelector('.scatter-tooltip');
    var legend = el.querySelector('.scatter-legend');
    var xSelect = el.querySelector('.scatter-x');
    var ySelect = el.querySelector('.scatter-y');
    var fitToggle = el.querySelector('.scatter-fit-toggle');

    Object.keys(metricInfo).forEach(function (key) {
      [xSelect, ySelect].forEach(function (select) {
        var option = document.createElement('option');
        option.value = key;
        option.textContent = metricInfo[key].label;
        select.appendChild(option);
      });
    });
    xSelect.value = xMetric;
    ySelect.value = yMetric;

    function monday(date) {
      var value = new Date(date);
      value.setHours(0, 0, 0, 0);
      value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
      return value;
    }
    function series() {
      return data.records.filter(function (record) {
        return Number.isFinite(record[xMetric]) && Number.isFinite(record[yMetric]);
      });
    }
    function weekLabel(key) {
      return 'Week of ' + key.slice(5, 10);
    }
    function regression(points) {
      if (points.length < 2) return null;
      var meanX = points.reduce(function (sum, point) { return sum + point[xMetric]; }, 0) / points.length;
      var meanY = points.reduce(function (sum, point) { return sum + point[yMetric]; }, 0) / points.length;
      var numerator = points.reduce(function (sum, point) {
        return sum + (point[xMetric] - meanX) * (point[yMetric] - meanY);
      }, 0);
      var denominator = points.reduce(function (sum, point) { return sum + Math.pow(point[xMetric] - meanX, 2); }, 0);
      if (!denominator) return null;
      var slope = numerator / denominator;
      return { at: function (x) { return meanY + slope * (x - meanX); } };
    }
    function draw() {
      var rows = series();
      var xi = metricInfo[xMetric];
      var yi = metricInfo[yMetric];
      var xValues = rows.map(function (row) { return row[xMetric]; });
      var yValues = rows.map(function (row) { return row[yMetric]; });
      var xMin = xi.min;
      var xMax = Math.max(xi.max || 0, Math.max.apply(Math, xValues.concat([1])));
      var yMin = yi.min;
      var yMax = Math.max(yi.max || 0, Math.max.apply(Math, yValues.concat([1])));
      if (xMax === xMin) xMax += 1;
      if (yMax === yMin) yMax += 1;
      var xTicks = window.ChartSvg.ticks(xMin, xMax, 5);
      var yTicks = window.ChartSvg.ticks(yMin, yMax, 4);
      var sx = function (value) { return window.ChartSvg.scale(value, [xMin, xMax], [margin.left, margin.left + plotWidth]); };
      var sy = function (value) { return window.ChartSvg.scale(value, [yMin, yMax], [margin.top + plotHeight, margin.top]); };
      var weekKeys = [];
      var keysByDate = {};
      rows.forEach(function (row) {
        var key = monday(row.date).toISOString().slice(0, 10);
        keysByDate[row.date] = key;
        if (weekKeys.indexOf(key) < 0) weekKeys.push(key);
      });
      weekKeys.sort();
      var displayedWeeks = weekKeys.slice(-4);
      var grid = xTicks.map(function (tick) {
        var px = sx(tick);
        return '<line class="scatter-grid" x1="' + px + '" y1="' + margin.top + '" x2="' + px + '" y2="' + (margin.top + plotHeight) + '"/>' +
          '<text class="scatter-axis" x="' + px + '" y="' + (height - 13) + '" text-anchor="middle">' + Number(tick.toFixed(1)) + '</text>';
      }).join('') + yTicks.map(function (tick) {
        var py = sy(tick);
        return '<line class="scatter-grid" x1="' + margin.left + '" y1="' + py + '" x2="' + (margin.left + plotWidth) + '" y2="' + py + '"/>' +
          '<text class="scatter-axis" x="' + (margin.left - 10) + '" y="' + (py + 4) + '" text-anchor="end">' + Number(tick.toFixed(1)) + '</text>';
      }).join('');
      var points = rows.map(function (row, index) {
        var weekIndex = displayedWeeks.indexOf(keysByDate[row.date]);
        var weekClass = weekClasses[Math.max(0, weekIndex)];
        return '<circle class="scatter-point ' + weekClass + (row.date === selectedDate ? ' is-selected' : '') +
          (weekIndex < 0 ? ' is-dim' : '') + '" data-index="' + index + '" cx="' + sx(row[xMetric]) +
          '" cy="' + sy(row[yMetric]) + '" r="5"><title>' + row.date.slice(0, 10) + ': ' +
          xi.label + ' ' + row[xMetric] + ', ' + yi.label + ' ' + row[yMetric] + '</title></circle>';
      }).join('');
      var fit = showFit ? regression(rows) : null;
      var fitPath = fit ? '<path class="scatter-fit" d="M' + sx(xMin) + ',' + sy(fit.at(xMin)) +
        ' L' + sx(xMax) + ',' + sy(fit.at(xMax)) + '"/>' : '';
      var xLabel = '<text class="scatter-axis" x="' + (margin.left + plotWidth / 2) + '" y="' +
        (height - 1) + '" text-anchor="middle">' + xi.label + '</text>';
      stage.innerHTML = '<svg class="scatter-svg" viewBox="0 0 ' + width + ' ' + height +
        '" preserveAspectRatio="none" role="img" aria-label="Scatter plot of ' + xi.label + ' by ' + yi.label + '">' +
        grid + fitPath + points + xLabel + '</svg>';
      legend.innerHTML = displayedWeeks.map(function (key) {
        var index = weekKeys.indexOf(key);
        return '<span class="scatter-legend-item"><span class="scatter-legend-dot ' +
          weekClasses[index - Math.max(0, weekKeys.length - 4)] + '"></span>' + weekLabel(key) + '</span>';
      }).join('');
    }

    xSelect.addEventListener('change', function () { xMetric = xSelect.value; draw(); });
    ySelect.addEventListener('change', function () { yMetric = ySelect.value; draw(); });
    fitToggle.addEventListener('change', function () { showFit = fitToggle.checked; draw(); });
    stage.addEventListener('pointerover', function (event) {
      var circle = event.target.closest && event.target.closest('.scatter-point');
      if (!circle) return;
      var row = series()[Number(circle.getAttribute('data-index'))];
      if (!row) return;
      tooltip.textContent = row.date.slice(0, 10) + ' · ' + metricInfo[xMetric].label + ': ' + row[xMetric] +
        ' · ' + metricInfo[yMetric].label + ': ' + row[yMetric];
    });
    stage.addEventListener('click', function (event) {
      var circle = event.target.closest && event.target.closest('.scatter-point');
      if (!circle) return;
      var row = series()[Number(circle.getAttribute('data-index'))];
      if (!row) return;
      selectedDate = row.date;
      draw();
      tooltip.textContent = 'Selected ' + row.date.slice(0, 10) + '.';
      if (ctx && typeof ctx.onChange === 'function') {
        ctx.onChange({ widgetId: 'scatter', patientId: data.patientId, date: row.date, record: row.raw });
      }
    });
    draw();
    el.__cleanup = function () {};
  }

  window.Widgets.register({
    id: 'scatter',
    title: 'Metric comparison',
    sizes: ['S', 'M', 'L'],
    render: render
  });
}());
