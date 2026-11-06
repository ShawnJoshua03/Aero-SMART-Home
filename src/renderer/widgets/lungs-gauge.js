(function () {
  function adaptData(ctx) {
    function sampleResponses() {
      var values = [2, 2, 3, 2, 4, 5, 6];
      var now = Date.now();
      return values.map(function (value, index) {
        return {
          timestamp: new Date(now - (values.length - index - 1) * 86400000).toISOString(),
          breathlessness: value
        };
      });
    }

    function asArray(value) {
      if (Array.isArray(value)) return value;
      if (value && Array.isArray(value.items)) return value.items;
      return [];
    }

    function scoreFrom(value) {
      if (value && typeof value === "object") {
        value = value.value != null ? value.value : value.score != null ? value.score : value.intensity;
      }
      var number = Number(value);
      return Number.isFinite(number) ? Math.max(0, Math.min(10, number)) : null;
    }

    var source = ctx && ctx.data;
    var records = Array.isArray(source) ? source :
      asArray(source && (source.responses || source.entries || source.submissions));
    if (!source) records = sampleResponses();

    var breathing = [];
    var now = Date.now();
    records.forEach(function (record, index) {
      if (!record || typeof record !== "object") return;
      var recordPatient = record.patientId || record.patient_id ||
        (record.patient && (record.patient.id || record.patient));
      if (ctx && ctx.patientId != null && recordPatient != null &&
          String(recordPatient) !== String(ctx.patientId)) return;

      var value = record.breathlessness != null ? record.breathlessness :
        record.breathlessnessScore != null ? record.breathlessnessScore :
        record.breathlessness_score != null ? record.breathlessness_score :
        record.dyspnea != null ? record.dyspnea : record.breathing;
      if (value == null && record.answers && typeof record.answers === "object") {
        var key = Object.keys(record.answers).find(function (name) {
          return /breath|dyspn/i.test(name);
        });
        if (key) value = record.answers[key];
      }
      var score = scoreFrom(value);
      if (score == null) return;

      var date = record.timestamp || record.createdAt || record.created_at || record.date;
      var timestamp = date ? new Date(date).getTime() : now - (records.length - index) * 86400000;
      breathing.push({
        value: score,
        timestamp: Number.isFinite(timestamp) ? timestamp : now
      });
    });

    breathing.sort(function (a, b) { return a.timestamp - b.timestamp; });
    return { breathing: breathing };
  }

  function render(el, ctx) {
    if (typeof el.__cleanup === "function") el.__cleanup();
    var history = adaptData(ctx).breathing;
    el.setAttribute("data-widget-size", ctx && ctx.size ? ctx.size : "M");
    var latest = history.length ? history[history.length - 1] : null;
    var score = latest ? latest.value : 0;
    var severity = Math.round(score);
    var recent = history.slice(-7);

    function formatDate(timestamp) {
      return new Date(timestamp).toLocaleDateString(undefined, {
        month: "short", day: "numeric"
      });
    }

    el.innerHTML =
      '<section class="lungs-widget severity-' + severity + '" data-severity="' + severity + '" aria-label="Breathlessness gauge">' +
        '<div class="lungs-heading"><div><h2>Breathing</h2>' +
          '<p>Breathlessness · 0 to 10</p></div>' +
          '<span class="lungs-updated">' + (latest ? formatDate(latest.timestamp) : "No recent reading") + '</span></div>' +
        '<div class="lungs-main">' +
          '<div class="lungs-visual" tabindex="0" role="img" aria-label="Animated lungs, severity ' + severity + ' out of 10">' +
            '<svg class="lungs-art" viewBox="0 0 300 260" aria-hidden="true">' +
              '<path class="lung-trachea" d="M150 31v76m0-14-28 29m28-29 28 29m-28-29v41m-28-12-16 20m16-20-2 26m58-26 16 20m-16-20 2 26m-30-14-19 23m19-23 19 23" />' +
              '<path class="lung-shape lung-left" d="M143 102c-20-8-45-2-59 21-15 25-19 76-5 104 8 17 25 21 42 13 20-9 29-34 29-67v-56c0-7-2-12-7-15z" />' +
              '<path class="lung-shape lung-right" d="M157 102c20-8 45-2 59 21 15 25 19 76 5 104-8 17-25 21-42 13-20-9-29-34-29-67v-56c0-7 2-12 7-15z" />' +
              '<path class="lung-branch" d="M143 119v38m-5-26-22 20m22-9-18 27m35-50v38m5-26 22 20m-22-9 18 27" />' +
            '</svg>' +
            '<div class="lungs-hover" aria-hidden="true">' +
              '<strong>Last 7 readings</strong>' +
              '<ol class="lungs-history"></ol>' +
            '</div>' +
          '</div>' +
          '<div class="lungs-readout"><strong class="lungs-score">' + (latest ? score : "—") + '</strong>' +
            '<span>out of 10</span>' +
            '<p class="lungs-status">' + (latest ? "Reported breathlessness" : "Awaiting a report") + '</p></div>' +
        '</div>' +
        '<p class="lungs-footnote">The breathing rhythm reflects the latest reported score.</p>' +
      '</section>';

    var list = el.querySelector(".lungs-history");
    if (recent.length) {
      recent.slice().reverse().forEach(function (reading) {
        var item = document.createElement("li");
        var date = document.createElement("time");
        date.dateTime = new Date(reading.timestamp).toISOString();
        date.textContent = formatDate(reading.timestamp);
        var value = document.createElement("strong");
        value.textContent = reading.value + " / 10";
        item.append(date, value);
        list.appendChild(item);
      });
    } else {
      var empty = document.createElement("li");
      empty.textContent = "No readings yet";
      list.appendChild(empty);
    }

    el.__cleanup = function () {
      delete el.__setReports;
    };
  }

  window.Widgets.register({
    id: "lungs-gauge",
    title: "Breathing gauge",
    sizes: ["S", "M", "L"],
    render: render
  });
}());
