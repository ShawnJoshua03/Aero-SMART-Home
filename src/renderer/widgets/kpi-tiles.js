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

  function mondayOf(date) {
    var value = new Date(date);
    value.setHours(0, 0, 0, 0);
    value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
    return value;
  }

  function render(el, ctx) {
    if (typeof el.__cleanup === 'function') el.__cleanup();
    el.__cleanup = null;
    el.replaceChildren();

    var data = adaptData(ctx);
    var size = ctx && ctx.size || 'M';
    var latest = data.records.length ? new Date(data.records[data.records.length - 1].date) : new Date();
    var weekStart = mondayOf(latest);
    var daysObserved = Math.floor((new Date(latest.getFullYear(), latest.getMonth(), latest.getDate()) - weekStart) / 86400000) + 1;
    var priorStart = new Date(weekStart);
    priorStart.setDate(priorStart.getDate() - 7);
    var currentEnd = new Date(weekStart);
    currentEnd.setDate(currentEnd.getDate() + daysObserved);
    var priorEnd = new Date(priorStart);
    priorEnd.setDate(priorEnd.getDate() + daysObserved);
    var current = data.records.filter(function (row) {
      var date = new Date(row.date);
      return date >= weekStart && date < currentEnd;
    });
    var previous = data.records.filter(function (row) {
      var date = new Date(row.date);
      return date >= priorStart && date < priorEnd;
    });

    function values(rows, key) {
      return rows.map(function (row) { return row[key]; }).filter(Number.isFinite);
    }
    function sum(rows, key) {
      var items = values(rows, key);
      return items.length ? items.reduce(function (total, value) { return total + value; }, 0) : null;
    }
    function average(rows, key) {
      var items = values(rows, key);
      return items.length ? items.reduce(function (total, value) { return total + value; }, 0) / items.length : null;
    }
    function adherence(rows) {
      var items = values(rows, 'controllerTaken');
      return items.length ? items.reduce(function (total, value) { return total + (value > 0 ? 1 : 0); }, 0) / items.length * 100 : null;
    }

    var metrics = [
      { key: 'breathlessness', label: "This week's average breathlessness", unit: '/10', value: average(current, 'breathlessness'),
        prior: average(previous, 'breathlessness'), series: values(data.records, 'breathlessness'), decimals: 1, highBad: true,
        detail: 'Mean of submitted breathlessness scores this week, compared with last week.' },
      { key: 'rescueUses', label: 'Rescue inhaler uses', unit: 'uses / week', value: sum(current, 'rescueUses'),
        prior: sum(previous, 'rescueUses'), series: values(data.records, 'rescueUses'), decimals: 0, highBad: true,
        detail: 'Total reported rescue inhaler uses this week, compared with last week.' },
      { key: 'nightWaking', label: 'Night wakings', unit: 'nights / week', value: sum(current, 'nightWaking'),
        prior: sum(previous, 'nightWaking'), series: values(data.records, 'nightWaking'), decimals: 0, highBad: true,
        detail: 'Nights with waking reported this week, compared with last week.' },
      { key: 'controllerTaken', label: 'Controller adherence', unit: '%', value: adherence(current),
        prior: adherence(previous), series: values(data.records, 'controllerTaken').map(function (value, index, list) {
          var start = Math.max(0, index - 6);
          var window = list.slice(start, index + 1);
          return window.length ? window.reduce(function (total, item) { return total + (item > 0 ? 1 : 0); }, 0) / window.length * 100 : 0;
        }), decimals: 0, highBad: false,
        detail: 'Share of submitted days when the controller medication was taken, compared with last week.' }
    ];

    function delta(metric) {
      if (metric.value == null || metric.prior == null) return { text: '— vs last week', state: 'is-neutral' };
      var difference = Number((metric.value - metric.prior).toFixed(metric.decimals));
      if (!difference) return { text: '0 · no change', state: 'is-neutral' };
      var magnitude = Math.abs(difference).toFixed(metric.decimals);
      var up = difference > 0;
      var worse = metric.highBad ? up : !up;
      return {
        text: (up ? '↑ ' : '↓ ') + magnitude + ' vs last week',
        state: worse ? 'is-negative' : 'is-positive'
      };
    }
    function spark(valuesList, key) {
      var width = 140;
      var height = 28;
      var list = valuesList.slice(-20);
      if (!list.length) return '<svg class="kpi-spark" viewBox="0 0 140 28" aria-hidden="true"></svg>';
      var max = Math.max.apply(Math, list);
      var min = Math.min.apply(Math, list);
      if (max === min) max = min + 1;
      var points = list.map(function (value, index) {
        return {
          x: list.length === 1 ? width / 2 : window.ChartSvg.scale(index, [0, list.length - 1], [1, width - 1]),
          y: window.ChartSvg.scale(value, [min, max], [height - 3, 3])
        };
      });
      var area = 'M' + points[0].x + ',' + (height - 1) + ' L' +
        points.map(function (point) { return point.x + ',' + point.y; }).join(' L') +
        ' L' + points[points.length - 1].x + ',' + (height - 1) + ' Z';
      return '<svg class="kpi-spark" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' +
        key + ' recent pattern"><path class="kpi-spark-area" d="' + area + '"/><path class="kpi-spark-path" d="' +
        window.ChartSvg.path(points) + '"/></svg>';
    }
    function format(value, decimals) {
      return value == null ? '—' : Number(value).toFixed(decimals);
    }

    el.className = 'kpi-widget is-' + size;
    el.innerHTML = '<div class="kpi-grid">' + metrics.map(function (metric, index) {
      var change = delta(metric);
      return '<button class="kpi-card" type="button" aria-pressed="false" aria-label="' + metric.label + ', ' +
        format(metric.value, metric.decimals) + ' ' + metric.unit + '. Click for detail.">' +
        '<span class="kpi-card-inner"><span class="kpi-face kpi-face-front">' +
        '<span class="kpi-label">' + metric.label + '</span><span class="kpi-value-row">' +
        '<span class="kpi-value" data-value="' + (metric.value == null ? '' : metric.value) + '" data-decimals="' + metric.decimals + '">0</span>' +
        '<span class="kpi-unit">' + metric.unit + '</span></span>' +
        '<span class="kpi-delta ' + change.state + '">' + change.text + '</span>' +
        spark(metric.series, metric.label) + '<span class="kpi-hint">Click to see detail</span>' +
        '</span><span class="kpi-face kpi-face-back" aria-hidden="true"><span class="kpi-detail-title">' +
        metric.label + '</span><span class="kpi-detail">' + metric.detail + '</span><span class="kpi-hint">Click to return</span>' +
        '</span></span></button>';
    }).join('') + '</div>';

    var frames = [];
    var cards = Array.prototype.slice.call(el.querySelectorAll('.kpi-card'));
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var flipped = card.classList.toggle('is-flipped');
        card.setAttribute('aria-pressed', String(flipped));
        card.querySelector('.kpi-face-back').setAttribute('aria-hidden', String(!flipped));
        card.querySelector('.kpi-face-front').setAttribute('aria-hidden', String(flipped));
      });
    });
    var nodes = Array.prototype.slice.call(el.querySelectorAll('.kpi-value'));
    var startTime = null;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function countFrame(time) {
      if (startTime == null) startTime = time;
      var progress = reduceMotion ? 1 : Math.min(1, (time - startTime) / 720);
      var eased = 1 - Math.pow(1 - progress, 3);
      nodes.forEach(function (node, index) {
        var metric = metrics[index];
        if (metric.value == null) {
          node.textContent = '—';
          return;
        }
        node.textContent = (metric.value * eased).toFixed(metric.decimals);
      });
      if (progress < 1) frames.push(window.requestAnimationFrame(countFrame));
    }
    if (window.requestAnimationFrame) frames.push(window.requestAnimationFrame(countFrame));
    else nodes.forEach(function (node, index) { node.textContent = format(metrics[index].value, metrics[index].decimals); });
    el.__cleanup = function () { frames.forEach(function (frame) { window.cancelAnimationFrame(frame); }); };
  }

  window.Widgets.register({
    id: 'kpi-tiles',
    title: 'Weekly indicators',
    sizes: ['S', 'M', 'L'],
    render: render
  });
}());
