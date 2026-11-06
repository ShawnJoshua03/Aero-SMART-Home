(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var DAY = 864e5;
  var Q = { breathless: 'breathlessness', night: 'night_waking', rescue: 'rescue_inhaler', symptoms: 'symptoms', activity: 'activity_limit', day: 'day_symptoms' };

  // ---- data helpers (all driven by survey answers, one patient at a time) ----
  function rows(ctx) {
    return ctx.data.entries.filter(function (e) {
      return e.patientId === ctx.patientId && (!ctx.data.survey || e.surveyId === ctx.data.survey.id);
    }).map(function (e) {
      return { date: e.date, t: Date.parse(e.date), a: e.answers };
    }).sort(function (a, b) { return a.t - b.t; });
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function yes(v) { return v === 'Yes' || v === true; }
  function mean(xs) { return xs.length ? xs.reduce(function (s, x) { return s + x; }, 0) / xs.length : null; }
  function sd(xs) { var m = mean(xs); return m == null ? 0 : Math.sqrt(mean(xs.map(function (x) { return (x - m) * (x - m); }))); }
  function fmt(v, d) { return v == null ? '–' : v.toFixed(d == null ? 1 : d); }
  function pct(n, total) { return total ? Math.round(100 * n / total) : 0; }
  function shortDate(t) { return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
  function symptomList(r) {
    var s = r.a[Q.symptoms];
    return Array.isArray(s) ? s.filter(function (x) { return x !== 'None'; }) : [];
  }
  function label(ctx, id, fallback) {
    var q = ctx.data.survey && ctx.data.survey.questions.find(function (x) { return x.id === id; });
    return q ? q.prompt : fallback;
  }
  // Mock "calibration": a day is unusual when it is >2 SD above this patient's own mean.
  function anomalies(rs, id) {
    var xs = rs.map(function (r) { return num(r.a[id]); }).filter(function (x) { return x != null; });
    var cut = mean(xs) + 2 * sd(xs);
    return { cut: cut, days: rs.filter(function (r) { return num(r.a[id]) != null && r.a[id] > cut; }) };
  }
  function rolling(rs, fn, win) { // rolling value over a window of calendar days
    return rs.map(function (r) {
      var inWin = rs.filter(function (o) { return o.t <= r.t && o.t > r.t - win * DAY; });
      return { t: r.t, y: fn(inWin) };
    });
  }
  function slopePerWeek(points) {
    if (points.length < 2) return null;
    var mx = mean(points.map(function (p) { return p.t / DAY; })), my = mean(points.map(function (p) { return p.y; }));
    var top = 0, den = 0;
    points.forEach(function (p) { var dx = p.t / DAY - mx; top += dx * (p.y - my); den += dx * dx; });
    return den ? 7 * top / den : null;
  }

  // ---- DOM helpers ----
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function s(tag, attrs, text) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text != null) el.textContent = text;
    return el;
  }
  function shell(el, title, sub) {
    var root = h('div', 'sw');
    root.append(h('p', 'sw-eyebrow', title));
    if (sub) root.append(h('p', 'sw-sub', sub));
    el.append(root);
    return root;
  }
  function empty(root) { root.append(h('p', 'sw-sub', 'No check-ins recorded for this patient yet.')); }
  function tileGrid(tiles) {
    var grid = h('div', 'sw-tiles');
    tiles.forEach(function (t) {
      var tile = h('div', 'sw-tile');
      tile.append(h('span', 'sw-tile-label', t[0]), h('strong', 'sw-tile-value', t[1]), h('span', 'sw-tile-note', t[2]));
      grid.append(tile);
    });
    return grid;
  }

  // Time chart. series: [{name, cls, points:[{t,y}]}]; marks: [{t,y,title}]
  function lineChart(root, opts) {
    var big = !!root.closest('.card-modal-dialog');
    // In the modal the viewBox matches the real pixel width, so text and strokes keep true size.
    // Wide cards (browser layout) are measured too, so they are not just a scaled-up phone chart.
    var measured = Math.round(root.clientWidth);
    var px = big || measured > 640;
    var W = px ? Math.max(300, measured) : 600;
    var H = big ? Math.round(Math.min(window.innerHeight * 0.55, Math.max(260, W * 0.55))) : px ? Math.round(Math.min(320, Math.max(210, W * 0.3))) : 210;
    var L = px ? 40 : 34, R = 12, T = 14, B = px ? 32 : 26;
    var steps = px && W > 520 ? 8 : 4;
    var all = [].concat.apply([], opts.series.map(function (x) { return x.points; }));
    var tMin = Math.min.apply(null, all.map(function (p) { return p.t; }));
    var tMax = Math.max.apply(null, all.map(function (p) { return p.t; }));
    var yMax = opts.yMax;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'sw-chart', role: 'img', 'aria-label': opts.aria });
    var X = function (t) { return ChartSvg.scale(t, [tMin, tMax === tMin ? tMin + 1 : tMax], [L, W - R]); };
    var Y = function (y) { return ChartSvg.scale(y, [0, yMax], [H - B, T]); };
    ChartSvg.ticks(0, yMax, 4).filter(function (v) { return v <= yMax; }).forEach(function (v) {
      svg.append(s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'sw-grid' }));
      svg.append(s('text', { x: L - 6, y: Y(v) + 4, class: 'sw-tick', 'text-anchor': 'end' }, String(v)));
    });
    for (var i = 0; i <= steps; i++) {
      var t = tMin + (tMax - tMin) * i / steps;
      svg.append(s('text', { x: X(t), y: H - 10, class: 'sw-tick', 'text-anchor': i === 0 ? 'start' : i === steps ? 'end' : 'middle' }, shortDate(t)));
    }
    (opts.bands || []).forEach(function (b) {
      var x0 = X(b.t0), x1 = X(b.t1);
      svg.append(s('rect', { x: x0, y: T, width: Math.max(6, x1 - x0), height: H - B - T, rx: 3, class: 'sw-band' }));
    });
    if (opts.threshold != null && opts.threshold < yMax) {
      svg.append(s('line', { x1: L, x2: W - R, y1: Y(opts.threshold), y2: Y(opts.threshold), class: 'sw-threshold' }));
    }
    opts.series.forEach(function (ser) {
      var pts = ser.points.map(function (p) { return { x: X(p.t), y: Y(p.y) }; });
      var line = s('path', { d: ChartSvg.path(pts), class: 'sw-line ' + ser.cls });
      line.append(s('title', {}, ser.name));
      svg.append(line);
    });
    (opts.marks || []).forEach(function (m) {
      var c = s('circle', { cx: X(m.t), cy: Y(m.y), r: m.hot ? 5.5 : 4.5, class: 'sw-mark' + (m.hot ? ' sw-mark-hot' : '') });
      c.append(s('title', {}, m.title));
      svg.append(c);
    });
    root.append(svg);
    var lg = h('div', 'sw-legend');
    opts.legend.forEach(function (l) {
      var item = h('span', 'sw-key');
      item.append(h('i', 'sw-swatch ' + l.cls), document.createTextNode(l.name));
      lg.append(item);
    });
    root.append(lg);
  }

  // ---- 1. Number of check-ins ----
  window.Widgets.register({
    id: 'checkin-count', title: 'Check-ins', sizes: ['S', 'M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var root = shell(el, 'Check-ins recorded');
      if (!rs.length) return empty(root);
      var span = Math.round((rs[rs.length - 1].t - rs[0].t) / DAY) + 1;
      root.append(h('p', 'sw-big', String(rs.length)));
      root.append(h('p', 'sw-sub', shortDate(rs[0].t) + ' – ' + shortDate(rs[rs.length - 1].t) + ' · ' + span + ' days'));
      if (ctx.size !== 'S') root.append(h('p', 'sw-sub', pct(rs.length, span) + '% of days reported'));
    },
  });

  // ---- 2. Breathlessness over time ----
  window.Widgets.register({
    id: 'breathlessness-trend', title: 'Breathlessness over time', sizes: ['M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx).filter(function (r) { return num(r.a[Q.breathless]) != null; });
      var root = shell(el, 'Breathlessness over time', label(ctx, Q.breathless, 'Daily breathlessness') + ' (0–10)');
      if (!rs.length) return empty(root);
      var an = anomalies(rs, Q.breathless);
      lineChart(root, {
        aria: 'Daily breathlessness, 0 to 10, with unusual days marked', yMax: 10, threshold: an.cut,
        series: [
          { name: 'Daily score', cls: 'sw-main', points: rs.map(function (r) { return { t: r.t, y: r.a[Q.breathless] }; }) },
          { name: '7-day average', cls: 'sw-soft', points: rolling(rs, function (w) { return mean(w.map(function (r) { return r.a[Q.breathless]; })); }, 7) },
        ],
        marks: an.days.map(function (r) { return { t: r.t, y: r.a[Q.breathless], title: shortDate(r.t) + ': ' + r.a[Q.breathless] + ' (unusual for this patient)' }; }),
        legend: [{ name: 'Daily', cls: 'sw-main' }, { name: '7-day average', cls: 'sw-soft' }, { name: 'Unusual day (above ' + fmt(an.cut) + ')', cls: 'sw-dot' }],
      });
      root.append(h('p', 'sw-sub', an.days.length + ' unusual day' + (an.days.length === 1 ? '' : 's') + " versus this patient's own baseline (mock rule: mean + 2 SD)."));
    },
  });

  // ---- 3. Night waking + rescue inhaler frequency ----
  window.Widgets.register({
    id: 'night-rescue-trend', title: 'Night waking & rescue inhaler', sizes: ['M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var root = shell(el, 'Night waking & rescue inhaler', 'Days with each event in the previous 7 days (0–7)');
      if (!rs.length) return empty(root);
      var count = function (id) { return function (w) { return w.filter(function (r) { return yes(r.a[id]); }).length; }; };
      lineChart(root, {
        aria: 'Rolling seven-day count of night waking and rescue inhaler use', yMax: 7,
        series: [
          { name: 'Night waking', cls: 'sw-main', points: rolling(rs, count(Q.night), 7) },
          { name: 'Rescue inhaler', cls: 'sw-alt', points: rolling(rs, count(Q.rescue), 7) },
        ],
        legend: [{ name: 'Night waking', cls: 'sw-main' }, { name: 'Rescue inhaler', cls: 'sw-alt' }],
      });
    },
  });

  function symptomBars(root, rs) {
    var tally = {};
    rs.forEach(function (r) { symptomList(r).forEach(function (x) { tally[x] = (tally[x] || 0) + 1; }); });
    var names = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; });
    var max = Math.max.apply(null, names.map(function (n) { return tally[n]; }).concat(1));
    var list = h('div', 'sw-bars');
    names.forEach(function (n) {
      var row = h('div', 'sw-bar-row');
      var track = h('div', 'sw-bar-track');
      var fill = h('div', 'sw-bar-fill');
      fill.style.width = (100 * tally[n] / max) + '%';
      track.append(fill);
      row.append(h('span', 'sw-bar-name', n), track, h('span', 'sw-bar-count', tally[n] + ' · ' + pct(tally[n], rs.length) + '%'));
      list.append(row);
    });
    root.append(list);
  }

  // ---- 4. KPIs: shared computation, full board, and one-KPI-per-card widget ----
  function computeKpis(rs) {
    var br = rs.map(function (r) { return num(r.a[Q.breathless]); }).filter(function (x) { return x != null; });
    var peakRow = rs.reduce(function (best, r) { return num(r.a[Q.breathless]) != null && (!best || r.a[Q.breathless] > best.a[Q.breathless]) ? r : best; }, null);
    var tally = {};
    rs.forEach(function (r) { symptomList(r).forEach(function (x) { tally[x] = (tally[x] || 0) + 1; }); });
    var top = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0];
    var days = function (id) { return rs.filter(function (r) { return yes(r.a[id]); }).length; };
    var an = anomalies(rs, Q.breathless);
    var recent = rs.slice(-7).map(function (r) { return num(r.a[Q.breathless]); }).filter(function (x) { return x != null; });
    var act = rs.map(function (r) { return num(r.a[Q.activity]); }).filter(function (x) { return x != null; });
    return [
      { id: 'checkins', label: 'Check-ins', value: String(rs.length), note: 'daily reports' },
      { id: 'avg-breathlessness', label: 'Avg breathlessness', value: fmt(mean(br)), note: 'last 7 days: ' + fmt(mean(recent)) },
      { id: 'peak-breathlessness', label: 'Peak breathlessness', value: peakRow ? String(peakRow.a[Q.breathless]) : '–', note: peakRow ? shortDate(peakRow.t) : '' },
      { id: 'top-symptom', label: 'Top symptom', value: top || 'None', note: top ? tally[top] + ' days (' + pct(tally[top], rs.length) + '%)' : '' },
      { id: 'rescue-days', label: 'Rescue inhaler days', value: pct(days(Q.rescue), rs.length) + '%', note: days(Q.rescue) + ' of ' + rs.length },
      { id: 'night-waking', label: 'Night waking', value: pct(days(Q.night), rs.length) + '%', note: days(Q.night) + ' nights' },
      { id: 'symptom-days', label: '3+ symptom days', value: pct(days(Q.day), rs.length) + '%', note: days(Q.day) + ' days' },
      { id: 'unusual-days', label: 'Unusual days', value: String(an.days.length), note: 'above personal baseline' },
      { id: 'avg-activity-limit', label: 'Avg activity limit', value: fmt(mean(act)), note: 'scale 0–10' },
    ];
  }

  window.Widgets.register({
    id: 'kpi-board', title: 'Key figures', sizes: ['S', 'M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var root = shell(el, 'Key figures');
      if (!rs.length) return empty(root);
      var tiles = computeKpis(rs).slice(0, 8).map(function (k) { return [k.label, k.value, k.note]; });
      root.append(tileGrid(ctx.size === 'S' ? tiles.slice(0, 4) : tiles));
    },
  });

  var KPI_CONTEXT = { 'avg-breathlessness': 1, 'peak-breathlessness': 1, 'unusual-days': 1 };
  window.Widgets.register({
    id: 'kpi', title: 'KPI card', sizes: ['S', 'M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var kpis = computeKpis(rs);
      var chosen = ctx.config && ctx.config.metric;
      var metric = kpis.some(function (k) { return k.id === chosen; }) ? chosen : 'checkins';
      var big = ctx.size === 'L';
      function draw() {
        el.replaceChildren();
        var k = kpis.find(function (x) { return x.id === metric; });
        var root = shell(el, 'KPI');
        root.classList.add('sw-kpi');
        if (!rs.length) return empty(root);
        root.append(h('p', 'sw-kpi-label', k.label), h('p', 'sw-kpi-value', k.value), h('p', 'sw-sub', k.note));
        var pick = document.createElement('select');
        pick.className = 'sw-kpi-select';
        pick.setAttribute('aria-label', 'Variable shown on this KPI card');
        kpis.forEach(function (o) { pick.add(new Option(o.label, o.id)); });
        pick.value = metric;
        pick.addEventListener('change', function () {
          metric = pick.value;
          ctx.onChange({ metric: metric });
          draw();
        });
        root.append(pick);
        if (big && KPI_CONTEXT[metric]) {
          var an = anomalies(rs.filter(function (r) { return num(r.a[Q.breathless]) != null; }), Q.breathless);
          lineChart(root, {
            aria: 'Daily breathlessness', yMax: 10, threshold: an.cut,
            series: [{ name: 'Daily score', cls: 'sw-main', points: rs.map(function (r) { return { t: r.t, y: r.a[Q.breathless] }; }) }],
            marks: an.days.map(function (r) { return { t: r.t, y: r.a[Q.breathless], title: shortDate(r.t) + ': ' + r.a[Q.breathless] }; }),
            legend: [{ name: 'Daily breathlessness', cls: 'sw-main' }, { name: 'Unusual day', cls: 'sw-dot' }],
          });
        } else if (big && metric === 'top-symptom') {
          symptomBars(root, rs);
        }
      }
      draw();
    },
  });

  // ---- Anomalies: breathlessness chart with flagged episodes highlighted ----
  function episodes(days) { // merge consecutive unusual days into episodes
    var out = [];
    days.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r.t - last.end <= 1.5 * DAY) {
        last.end = r.t; last.count += 1;
        if (r.a[Q.breathless] > last.peak) { last.peak = r.a[Q.breathless]; last.peakT = r.t; }
      } else out.push({ start: r.t, end: r.t, count: 1, peak: r.a[Q.breathless], peakT: r.t });
    });
    return out;
  }
  window.Widgets.register({
    id: 'anomaly-breathlessness', title: 'Breathlessness anomalies', sizes: ['M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx).filter(function (r) { return num(r.a[Q.breathless]) != null; });
      var root = shell(el, 'Breathlessness anomalies', 'Days well above this patient\'s own baseline (mean + 2 SD)');
      if (!rs.length) return empty(root);
      var an = anomalies(rs, Q.breathless);
      var eps = episodes(an.days);
      lineChart(root, {
        aria: 'Daily breathlessness with anomalous episodes highlighted', yMax: 10, threshold: an.cut,
        bands: eps.map(function (e) { return { t0: e.start - 0.5 * DAY, t1: e.end + 0.5 * DAY }; }),
        series: [{ name: 'Daily score', cls: 'sw-main', points: rs.map(function (r) { return { t: r.t, y: r.a[Q.breathless] }; }) }],
        marks: an.days.map(function (r) { return { t: r.t, y: r.a[Q.breathless], hot: true, title: shortDate(r.t) + ': ' + r.a[Q.breathless] + ' (anomaly)' }; }),
        legend: [{ name: 'Daily breathlessness', cls: 'sw-main' }, { name: 'Anomaly', cls: 'sw-dot' }, { name: 'Threshold ' + fmt(an.cut), cls: 'sw-soft' }],
      });
      var lastT = rs[rs.length - 1].t;
      var list = h('ul', 'sw-episodes');
      eps.slice().reverse().forEach(function (e) {
        var ago = Math.round((lastT - e.end) / DAY);
        var li = h('li', 'sw-episode');
        li.append(h('strong', null, e.start === e.end ? shortDate(e.start) : shortDate(e.start) + ' – ' + shortDate(e.end)),
          h('span', null, 'peak ' + e.peak + ' · ' + e.count + ' day' + (e.count === 1 ? '' : 's') + ' · ' + (ago === 0 ? 'latest check-in' : ago + ' days before latest check-in')));
        list.append(li);
      });
      if (!eps.length) list.append(h('li', 'sw-episode', 'No anomalies flagged.'));
      root.append(list);
    },
  });

  // ---- 5. Symptom frequency distribution ----
  window.Widgets.register({
    id: 'symptom-frequency', title: 'Symptom frequency', sizes: ['S', 'M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var root = shell(el, 'Symptom frequency', 'Days each symptom was reported');
      if (!rs.length) return empty(root);
      symptomBars(root, rs);
    },
  });

  // ---- 6. What symptoms occur when ----
  window.Widgets.register({
    id: 'symptom-timing', title: 'Symptoms by week', sizes: ['M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var root = shell(el, 'What symptoms occur when', 'Days per week each symptom was reported');
      if (!rs.length) return empty(root);
      var t0 = rs[0].t, weeks = Math.floor((rs[rs.length - 1].t - t0) / (7 * DAY)) + 1;
      var totals = {}, grid = {};
      rs.forEach(function (r) {
        var w = Math.floor((r.t - t0) / (7 * DAY));
        symptomList(r).forEach(function (x) {
          totals[x] = (totals[x] || 0) + 1;
          grid[x] = grid[x] || [];
          grid[x][w] = (grid[x][w] || 0) + 1;
        });
      });
      var order = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
      var map = h('div', 'sw-heat');
      map.style.gridTemplateColumns = 'minmax(70px, auto) repeat(' + weeks + ', minmax(0, 1fr))';
      order.forEach(function (n) {
        map.append(h('span', 'sw-heat-name', n));
        for (var w = 0; w < weeks; w++) {
          var c = grid[n][w] || 0;
          var cell = h('span', 'sw-cell');
          cell.style.setProperty('--level', String(c / 7));
          cell.title = n + ' · week of ' + shortDate(t0 + w * 7 * DAY) + ': ' + c + ' day' + (c === 1 ? '' : 's');
          map.append(cell);
        }
      });
      map.append(h('span', 'sw-heat-name'));
      for (var w2 = 0; w2 < weeks; w2++) map.append(h('span', 'sw-week', w2 % 4 === 0 ? shortDate(t0 + w2 * 7 * DAY) : ''));
      root.append(map);
      root.append(h('p', 'sw-sub', 'Darker cells mean more days that week. Each column is 7 days from ' + shortDate(t0) + '.'));
    },
  });

  // ---- 7. Activity limitation over time ----
  window.Widgets.register({
    id: 'activity-limit-trend', title: 'Activity limitation', sizes: ['M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx).filter(function (r) { return num(r.a[Q.activity]) != null; });
      var root = shell(el, 'Activity limitation over time', label(ctx, Q.activity, 'Activity limit') + ' (0–10)');
      if (!rs.length) return empty(root);
      var pts = rs.map(function (r) { return { t: r.t, y: r.a[Q.activity] }; });
      lineChart(root, {
        aria: 'Daily activity limitation, 0 to 10, with 7-day average', yMax: 10,
        series: [
          { name: 'Daily score', cls: 'sw-main', points: pts },
          { name: '7-day average', cls: 'sw-soft', points: rolling(rs, function (w) { return mean(w.map(function (r) { return r.a[Q.activity]; })); }, 7) },
        ],
        legend: [{ name: 'Daily', cls: 'sw-main' }, { name: '7-day average', cls: 'sw-soft' }],
      });
      var rate = slopePerWeek(pts.slice(-28));
      var last7 = mean(pts.slice(-7).map(function (p) { return p.y; }));
      var prev7 = mean(pts.slice(-14, -7).map(function (p) { return p.y; }));
      var delta = last7 != null && prev7 != null ? last7 - prev7 : null;
      root.append(tileGrid([
        ['Rate of change', rate == null ? '–' : (rate > 0 ? '+' : '') + fmt(rate, 2) + ' / week', 'trend over last 28 days'],
        ['Last 7 days', fmt(last7), delta == null ? '' : (delta > 0 ? '+' : '') + fmt(delta) + ' vs prior week'],
      ]));
    },
  });
  // Shared helpers for pages that build their own summaries (Fly).
  window.SurveyStats = { rows: rows, anomalies: anomalies, episodes: episodes, mean: mean, num: num, yes: yes, symptomList: symptomList, shortDate: shortDate, DAY: DAY, Q: Q };
}());
