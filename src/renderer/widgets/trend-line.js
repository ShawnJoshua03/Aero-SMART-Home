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
          controllerTaken: i % 9 !== 2,
          triggers: []
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
    var metrics = { breathlessness: [], rescueUses: [], nightWaking: [], controllerTaken: [] };
    var fallback = sampleData();
    var data = ctx && ctx.data;
    var patientId = ctx && ctx.patientId != null ? String(ctx.patientId) : '';
    var root = data;

    function norm(value) {
      return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
      if (node.patients && typeof node.patients === 'object' && patientId) return node.patients[patientId] || null;
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
            if (wanted.some(function (name) { return label.indexOf(name) >= 0 || name.indexOf(label) >= 0; })) {
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
    function baselineSource(node, depth) {
      if (!node || typeof node !== 'object' || depth > 3) return null;
      var keys = Object.keys(node);
      for (var i = 0; i < keys.length; i += 1) {
        var key = norm(keys[i]);
        if (key.indexOf('baseline') >= 0 || key.indexOf('calibration') >= 0) return node[keys[i]];
      }
      for (var j = 0; j < keys.length; j += 1) {
        var found = baselineSource(node[keys[j]], depth + 1);
        if (found) return found;
      }
      return null;
    }
    function baselineStats(source, aliasesForMetric) {
      if (!source || typeof source !== 'object') return null;
      var containers = [source];
      ['metrics', 'stats', 'values'].forEach(function (key) {
        if (source[key] && typeof source[key] === 'object') containers.push(source[key]);
      });
      var wanted = aliasesForMetric.map(norm);
      for (var i = 0; i < containers.length; i += 1) {
        var container = containers[i];
        var keys = Object.keys(container);
        for (var j = 0; j < keys.length; j += 1) {
          var keyName = norm(keys[j]);
          if (!wanted.some(function (name) { return keyName === name || keyName.indexOf(name) >= 0 || name.indexOf(keyName) >= 0; })) continue;
          var item = container[keys[j]];
          if (!item || typeof item !== 'object') continue;
          var mean = numeric(item.mean != null ? item.mean : item.average != null ? item.average : item.avg);
          var sd = numeric(item.sd != null ? item.sd : item.std != null ? item.std :
            item.stdDev != null ? item.stdDev : item.standardDeviation != null ? item.standardDeviation : item.sigma);
          if (mean != null) return { mean: mean, sd: sd };
        }
      }
      return null;
    }

    var selectedPatient = findPatient(data);
    if (selectedPatient) root = selectedPatient;
    var rows = data == null ? fallback : locateRows(root, 0);
    if (!rows && Array.isArray(root)) rows = root;
    if (!rows && data == null) rows = fallback;
    var normalized = (rows || []).filter(function (row) {
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

    if (data == null) normalized = fallback.map(function (row) {
      return { date: row.date, raw: row, breathlessness: row.breathlessness, rescueUses: row.rescueUses,
        nightWaking: row.nightWaking ? 1 : 0, controllerTaken: row.controllerTaken ? 1 : 0 };
    });

    Object.keys(metrics).forEach(function (key) {
      metrics[key] = normalized.filter(function (row) { return Number.isFinite(row[key]); })
        .map(function (row) { return { date: row.date, value: row[key], raw: row.raw }; });
    });

    var baselines = {};
    Object.keys(metrics).forEach(function (key) {
      var values = metrics[key].map(function (point) { return point.value; });
      var mean = values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : 0;
      var variance = values.length ? values.reduce(function (sum, value) { return sum + Math.pow(value - mean, 2); }, 0) / values.length : 0;
      baselines[key] = { mean: mean, sd: Math.sqrt(variance) };
    });
    var suppliedBaseline = baselineSource(selectedPatient || data, 0);
    if (suppliedBaseline) {
      Object.keys(metrics).forEach(function (key) {
        var supplied = baselineStats(suppliedBaseline, aliases[key]);
        if (supplied) {
          baselines[key] = {
            mean: supplied.mean,
            sd: supplied.sd == null ? baselines[key].sd : supplied.sd
          };
        }
      });
    }

    return { metrics: metrics, baselines: baselines, patientId: patientId, records: normalized };
  }

  var metricInfo = {
    breathlessness: { label: 'Breathlessness', unit: '/10', min: 0 },
    rescueUses: { label: 'Rescue inhaler uses', unit: 'uses', min: 0 },
    nightWaking: { label: 'Night wakings', unit: 'nights', min: 0 },
    controllerTaken: { label: 'Controller taken', unit: 'days', min: 0 }
  };

  function render(el, ctx) {
    if (typeof el.__cleanup === 'function') el.__cleanup();
    el.__cleanup = null;
    el.replaceChildren();

    var data = adaptData(ctx);
    var size = ctx && ctx.size || 'M';
    var activeMetric = 'breathlessness';
    var points = data.metrics[activeMetric].slice();
    var width = 760;
    var height = 300;
    var margin = { top: 16, right: 18, bottom: 34, left: 52 };
    var plotWidth = width - margin.left - margin.right;
    var plotHeight = height - margin.top - margin.bottom;
    var stage;
    var tooltip;
    var currentY;
    var currentX;

    el.className = 'trend-widget is-' + size;
    el.innerHTML =
      '<div class="trend-head"><div><h3 class="trend-title">Patient trend</h3>' +
      '<div class="trend-subtitle">Calibrated to this patient’s pattern</div></div>' +
      '<label><span class="trend-subtitle">Metric </span><select class="trend-select" aria-label="Trend metric">' +
      Object.keys(metricInfo).map(function (key) {
        return '<option value="' + key + '">' + metricInfo[key].label + '</option>';
      }).join('') + '</select></label></div>' +
      '<div class="trend-stage"></div><div class="trend-tooltip" aria-live="polite">Move over the chart to inspect a day.</div>' +
      '<div class="trend-foot">Shaded band: patient mean ± 1.5 SD. Pulsing points fall outside the band.</div>';
    stage = el.querySelector('.trend-stage');
    tooltip = el.querySelector('.trend-tooltip');
    var select = el.querySelector('.trend-select');

    function currentSeries() {
      return points.filter(function (point) { return Number.isFinite(point.value); });
    }
    function draw() {
      var series = currentSeries();
      var info = metricInfo[activeMetric];
      var base = data.baselines[activeMetric] || { mean: 0, sd: 0 };
      var lowBand = base.mean - base.sd * 1.5;
      var highBand = base.mean + base.sd * 1.5;
      var values = series.map(function (point) { return point.value; }).concat([lowBand, highBand]);
      var min = Math.max(info.min, Math.min.apply(Math, values));
      var max = Math.max.apply(Math, values);
      if (activeMetric === 'breathlessness') max = Math.max(10, max);
      else max = Math.max(max, 1);
      var yTicks = window.ChartSvg.ticks(min, max, 4);
      if (yTicks.length < 2) yTicks = [min, max];
      var domainMin = Math.min(min, yTicks[0]);
      var domainMax = Math.max(max, yTicks[yTicks.length - 1]);
      if (domainMin === domainMax) domainMax = domainMin + 1;
      var start = series.length ? new Date(series[0].date).getTime() : 0;
      var end = series.length ? new Date(series[series.length - 1].date).getTime() : start + 1;
      if (end === start) end = start + 1;
      var x = function (date) {
        return window.ChartSvg.scale(new Date(date).getTime(), [start, end], [margin.left, margin.left + plotWidth]);
      };
      var y = function (value) {
        return window.ChartSvg.scale(value, [domainMin, domainMax], [margin.top + plotHeight, margin.top]);
      };
      currentX = x;
      currentY = y;
      var pathPoints = series.map(function (point) { return { x: x(point.date), y: y(point.value) }; });
      var path = window.ChartSvg.path(pathPoints);
      var areaPath = pathPoints.length > 1 ?
        'M' + pathPoints[0].x + ',' + (margin.top + plotHeight) + ' L' +
          pathPoints.map(function (point) { return point.x + ',' + point.y; }).join(' L') +
          ' L' + pathPoints[pathPoints.length - 1].x + ',' + (margin.top + plotHeight) + ' Z' : '';
      var grid = yTicks.map(function (tick) {
        var py = y(tick);
        return '<line class="trend-grid" x1="' + margin.left + '" y1="' + py + '" x2="' + (width - margin.right) + '" y2="' + py + '"/>' +
          '<text class="trend-axis" x="' + (margin.left - 10) + '" y="' + (py + 4) + '" text-anchor="end">' + Number(tick.toFixed(1)) + '</text>';
      }).join('');
      var bandY = y(Math.min(highBand, domainMax));
      var bandBottom = y(Math.max(lowBand, domainMin));
      var anomalies = series.map(function (point) {
        if (point.value >= lowBand && point.value <= highBand) return '';
        return '<circle class="trend-anomaly" cx="' + x(point.date) + '" cy="' + y(point.value) + '" r="8"><title>' +
          point.date.slice(0, 10) + ': ' + point.value + '</title></circle>';
      }).join('');
      var xLabels = series.length ? [series[0], series[Math.floor((series.length - 1) / 2)], series[series.length - 1]]
        .filter(function (point, index, list) { return list.indexOf(point) === index; }).map(function (point, index, list) {
          var anchor = index === 0 ? 'start' : index === list.length - 1 ? 'end' : 'middle';
          return '<text class="trend-axis" x="' + x(point.date) + '" y="' + (height - 7) + '" text-anchor="' + anchor + '">' +
            point.date.slice(5, 10) + '</text>';
        }).join('') : '';

      stage.innerHTML = '<svg class="trend-svg" viewBox="0 0 ' + width + ' ' + height +
        '" preserveAspectRatio="none" role="img" aria-label="' + info.label + ' over time">' +
        grid + '<rect class="trend-band" x="' + margin.left + '" y="' + bandY + '" width="' + plotWidth +
        '" height="' + Math.max(0, bandBottom - bandY) + '"/>' +
        '<path class="trend-area" d="' + areaPath + '"/><path class="trend-line" d="' + path + '"/>' + anomalies +
        '<line class="trend-crosshair" x1="' + margin.left + '" y1="' + margin.top + '" x2="' + margin.left +
        '" y2="' + (margin.top + plotHeight) + '"/><circle class="trend-point" cx="' + margin.left +
        '" cy="' + (margin.top + plotHeight) + '" r="0"/>' + xLabels + '</svg>';
    }

    select.addEventListener('change', function () {
      activeMetric = select.value;
      points = data.metrics[activeMetric].slice();
      draw();
      tooltip.textContent = 'Move over the chart to inspect a day.';
    });
    stage.addEventListener('pointermove', function (event) {
      var svg = stage.querySelector('.trend-svg');
      var series = currentSeries();
      if (!svg || !series.length) return;
      var bounds = svg.getBoundingClientRect();
      var chartX = margin.left + ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * width;
      var ratio = Math.max(0, Math.min(1, (chartX - margin.left) / plotWidth));
      var targetTime = (new Date(series[0].date).getTime()) +
        ratio * (new Date(series[series.length - 1].date).getTime() - new Date(series[0].date).getTime());
      var nearest = series.reduce(function (best, point) {
        return Math.abs(new Date(point.date).getTime() - targetTime) < Math.abs(new Date(best.date).getTime() - targetTime) ? point : best;
      }, series[0]);
      var px = window.ChartSvg.scale(new Date(nearest.date).getTime(),
        [new Date(series[0].date).getTime(), new Date(series[series.length - 1].date).getTime()],
        [margin.left, margin.left + plotWidth]);
      var crosshair = svg.querySelector('.trend-crosshair');
      var marker = svg.querySelector('.trend-point');
      crosshair.setAttribute('x1', px);
      crosshair.setAttribute('x2', px);
      crosshair.classList.add('is-visible');
      marker.setAttribute('cx', px);
      marker.setAttribute('cy', currentY(nearest.value));
      marker.setAttribute('r', '8');
      tooltip.textContent = nearest.date.slice(0, 10) + ' · ' + infoText(activeMetric, nearest.value);
    });
    stage.addEventListener('pointerleave', function () {
      var svg = stage.querySelector('.trend-svg');
      if (svg) {
        svg.querySelector('.trend-crosshair').classList.remove('is-visible');
        svg.querySelector('.trend-point').setAttribute('r', '0');
      }
    });

    function appendLivePoint() {
      var series = currentSeries();
      if (!series.length) return;
      var last = series[series.length - 1];
      var base = data.baselines[activeMetric] || { mean: last.value, sd: 0.5 };
      var wiggle = (Math.random() - 0.5) * Math.max(base.sd, 0.5);
      var value = Math.max(metricInfo[activeMetric].min, last.value + wiggle);
      if (activeMetric === 'breathlessness') value = Math.min(10, value);
      if (activeMetric !== 'breathlessness') value = Math.round(value);
      var next = { date: new Date().toISOString(), value: value, raw: null };
      points = series.concat([next]).slice(-36);
      data.metrics[activeMetric] = points;
      draw();
      tooltip.textContent = 'A new mock reading has arrived.';
    }

    function infoText(key, value) {
      if (key === 'breathlessness') return value.toFixed(1) + ' /10';
      if (key === 'controllerTaken') return value ? 'taken' : 'missed';
      if (key === 'nightWaking') return value ? 'waking reported' : 'no waking';
      return value + ' uses';
    }

    draw();
    var timer = window.setInterval(appendLivePoint, 8000);
    el.__cleanup = function () { window.clearInterval(timer); };
  }

  window.Widgets.register({
    id: 'trend-line',
    title: 'Patient trend',
    sizes: ['S', 'M', 'L'],
    render: render
  });
}());
