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
    var W = 600, H = 210, L = 34, R = 10, T = 12, B = 26;
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
    for (var i = 0; i < 5; i++) {
      var t = tMin + (tMax - tMin) * i / 4;
      svg.append(s('text', { x: X(t), y: H - 8, class: 'sw-tick', 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, shortDate(t)));
    }
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
      var c = s('circle', { cx: X(m.t), cy: Y(m.y), r: 4.5, class: 'sw-mark' });
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

  // ---- 4. KPI board ----
  window.Widgets.register({
    id: 'kpi-board', title: 'Key figures', sizes: ['S', 'M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var root = shell(el, 'Key figures');
      if (!rs.length) return empty(root);
      var br = rs.map(function (r) { return num(r.a[Q.breathless]); }).filter(function (x) { return x != null; });
      var peakRow = rs.reduce(function (best, r) { return num(r.a[Q.breathless]) != null && (!best || r.a[Q.breathless] > best.a[Q.breathless]) ? r : best; }, null);
      var tally = {};
      rs.forEach(function (r) { symptomList(r).forEach(function (x) { tally[x] = (tally[x] || 0) + 1; }); });
      var top = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0];
      var days = function (id) { return rs.filter(function (r) { return yes(r.a[id]); }).length; };
      var an = anomalies(rs, Q.breathless);
      var recent = rs.slice(-7).map(function (r) { return num(r.a[Q.breathless]); }).filter(function (x) { return x != null; });
      var tiles = [
        ['Check-ins', String(rs.length), 'daily reports'],
        ['Avg breathlessness', fmt(mean(br)), 'last 7 days: ' + fmt(mean(recent))],
        ['Peak breathlessness', peakRow ? String(peakRow.a[Q.breathless]) : '–', peakRow ? shortDate(peakRow.t) : ''],
        ['Top symptom', top || 'None', top ? tally[top] + ' days (' + pct(tally[top], rs.length) + '%)' : ''],
        ['Rescue inhaler days', pct(days(Q.rescue), rs.length) + '%', days(Q.rescue) + ' of ' + rs.length],
        ['Night waking', pct(days(Q.night), rs.length) + '%', days(Q.night) + ' nights'],
        ['3+ symptom days', pct(days(Q.day), rs.length) + '%', days(Q.day) + ' days'],
        ['Unusual days', String(an.days.length), 'above personal baseline'],
      ];
      root.append(tileGrid(ctx.size === 'S' ? tiles.slice(0, 4) : tiles));
    },
  });

  // ---- 5. Symptom frequency distribution ----
  window.Widgets.register({
    id: 'symptom-frequency', title: 'Symptom frequency', sizes: ['S', 'M', 'L'],
    render: function (el, ctx) {
      var rs = rows(ctx);
      var root = shell(el, 'Symptom frequency', 'Days each symptom was reported');
      if (!rs.length) return empty(root);
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
}());
