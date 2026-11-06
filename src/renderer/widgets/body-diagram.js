(function () {
  function adaptData(ctx) {
    function sampleResponses() {
      var now = Date.now();
      var days = [
        { offset: 13, region: "chest", intensity: 2, note: "Mild tightness" },
        { offset: 10, region: "throat", intensity: 3, note: "Dry throat" },
        { offset: 7, region: "lung_right", intensity: 4, note: "After outdoor activity" },
        { offset: 4, region: "nose_sinus", intensity: 2, note: "Congestion" },
        { offset: 2, region: "chest", intensity: 5, note: "More noticeable at night" },
        { offset: 0, region: "lung_right", intensity: 6, note: "Recent report" }
      ];
      return days.map(function (item) {
        return {
          timestamp: new Date(now - item.offset * 86400000).toISOString(),
          bodyReports: [{
            region: item.region,
            intensity: item.intensity,
            note: item.note
          }]
        };
      });
    }

    function asArray(value) {
      if (Array.isArray(value)) return value;
      if (value && Array.isArray(value.items)) return value.items;
      if (value && Array.isArray(value.reports)) return value.reports;
      return [];
    }

    function numberFrom(value) {
      if (value && typeof value === "object") {
        value = value.intensity != null ? value.intensity :
          value.value != null ? value.value : value.score;
      }
      var number = Number(value);
      return Number.isFinite(number) ? Math.max(0, Math.min(10, number)) : 0;
    }

    function regionName(value) {
      return String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
    }

    function dateValue(record, fallback) {
      var value = record && (record.timestamp || record.createdAt || record.created_at || record.date);
      var parsed = value ? new Date(value).getTime() : NaN;
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    var source = ctx && ctx.data;
    var records = Array.isArray(source) ? source :
      asArray(source && (source.responses || source.entries || source.submissions));
    if (!source) records = sampleResponses();

    var reports = [];
    var now = Date.now();
    records.forEach(function (record, recordIndex) {
      if (!record || typeof record !== "object") return;
      var recordPatient = record.patientId || record.patient_id ||
        (record.patient && (record.patient.id || record.patient));
      if (ctx && ctx.patientId != null && recordPatient != null &&
          String(recordPatient) !== String(ctx.patientId)) return;

      var timestamp = dateValue(record, now - (records.length - recordIndex) * 86400000);
      var body = record.bodyReports || record.body_reports || record.bodyDiagram ||
        record.body_diagram || record.body || record.discomfort;
      var items = asArray(body);
      if (body && !Array.isArray(body) && !Array.isArray(body.items) &&
          !Array.isArray(body.reports) && body.region) items = [body];

      var answers = record.answers || record.responses;
      if (answers && !Array.isArray(answers) && typeof answers === "object") {
        Object.keys(answers).forEach(function (key) {
          var normalized = regionName(key);
          if (/^(nose_sinus|throat|chest|lung_left|lung_right)$/.test(normalized)) {
            var answer = answers[key];
            items.push(answer && typeof answer === "object" ?
              Object.assign({ region: normalized }, answer) :
              { region: normalized, intensity: answer });
          }
        });
      }

      items.forEach(function (item) {
        if (!item || typeof item !== "object") return;
        var region = regionName(item.region || item.bodyRegion || item.body_region || item.area);
        if (!/^(nose_sinus|throat|chest|lung_left|lung_right)$/.test(region)) return;
        reports.push({
          region: region,
          intensity: numberFrom(item),
          timestamp: dateValue(item, timestamp),
          note: String(item.note || item.comment || "")
        });
      });
    });

    reports.sort(function (a, b) { return a.timestamp - b.timestamp; });
    return { reports: reports };
  }

  var regions = [
    { id: "nose_sinus", label: "Nose & sinuses" },
    { id: "throat", label: "Throat" },
    { id: "chest", label: "Chest" },
    { id: "lung_left", label: "Left lung" },
    { id: "lung_right", label: "Right lung" }
  ];

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short", day: "numeric"
    });
  }

  function normalizeReports(list) {
    return (Array.isArray(list) ? list : []).reduce(function (result, item, index) {
      if (!item || typeof item !== "object") return result;
      var region = String(item.region || item.bodyRegion || item.body_region || item.area || "")
        .toLowerCase().replace(/[\s-]+/g, "_");
      if (!regions.some(function (entry) { return entry.id === region; })) return result;
      var intensity = Number(item.intensity != null ? item.intensity :
        item.value != null ? item.value : item.score);
      if (!Number.isFinite(intensity)) intensity = 0;
      var stamp = item.timestamp || item.createdAt || item.created_at || item.date;
      var parsed = stamp ? new Date(stamp).getTime() : Date.now() - (list.length - index) * 86400000;
      result.push({
        region: region,
        intensity: Math.max(0, Math.min(10, intensity)),
        timestamp: Number.isFinite(parsed) ? parsed : Date.now(),
        note: String(item.note || item.comment || "")
      });
      return result;
    }, []).sort(function (a, b) { return a.timestamp - b.timestamp; });
  }

  function makeSparkline(values) {
    if (!values.length) return "";
    var width = 168;
    var height = 40;
    var points = values.map(function (value, index) {
      var x = values.length === 1 ? width / 2 : index * width / (values.length - 1);
      var y = height - (value / 10) * (height - 4) - 2;
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 168 40");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Intensity history");
    var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", points);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "var(--blue)");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);
    return svg;
  }

  function render(el, ctx) {
    if (typeof el.__cleanup === "function") el.__cleanup();
    var state = {
      reports: adaptData(ctx).reports,
      index: 0,
      selectedRegion: "chest",
      playing: false,
      readOnly: false,
      timer: null
    };
    state.index = Math.max(0, state.reports.length - 1);
    el.setAttribute("data-widget-size", ctx && ctx.size ? ctx.size : "M");

    function stopPlayback() {
      if (state.timer) window.clearInterval(state.timer);
      state.timer = null;
      state.playing = false;
    }

    function currentTimestamp() {
      return state.reports[state.index] ? state.reports[state.index].timestamp : Date.now();
    }

    function reportsThroughNow() {
      var timestamp = currentTimestamp();
      return state.reports.filter(function (report) { return report.timestamp <= timestamp; });
    }

    function regionHistory(region) {
      return reportsThroughNow().filter(function (report) { return report.region === region; });
    }

    function updateView() {
      var visible = reportsThroughNow();
      var latestByRegion = {};
      visible.forEach(function (report) { latestByRegion[report.region] = report; });

      regions.forEach(function (region) {
        var shape = el.querySelector('[data-region="' + region.id + '"]');
        if (!shape) return;
        var report = latestByRegion[region.id];
        var level = report ? report.intensity : 0;
        var recent = state.reports.filter(function (item) {
          return item.region === region.id && item.timestamp <= currentTimestamp();
        });
        var rising = recent.length > 1 &&
          recent[recent.length - 1].intensity - recent[recent.length - 2].intensity >= 2;
        shape.setAttribute("fill", "color-mix(in srgb, var(--teal) " +
          (100 - level * 8) + "%, var(--plum) " + (level * 8) + "%)");
        shape.setAttribute("fill-opacity", report ? String(0.26 + level * 0.065) : "0.12");
        shape.classList.toggle("is-rising", Boolean(rising && report === recent[recent.length - 1]));
        shape.classList.toggle("is-selected", region.id === state.selectedRegion);
        shape.setAttribute("aria-pressed", region.id === state.selectedRegion ? "true" : "false");
        shape.setAttribute("aria-disabled", state.readOnly ? "true" : "false");
      });

      var slider = el.querySelector(".body-time-slider");
      var timeLabel = el.querySelector(".body-time-label");
      var playButton = el.querySelector(".body-play");
      if (slider) {
        slider.max = String(Math.max(0, state.reports.length - 1));
        slider.value = String(state.index);
        slider.disabled = state.readOnly || state.reports.length < 2;
      }
      if (timeLabel) {
        timeLabel.textContent = state.reports.length ?
          formatDate(currentTimestamp()) : "No reports yet";
      }
      if (playButton) {
        playButton.textContent = state.playing ? "Pause" : "Play";
        playButton.setAttribute("aria-label", state.playing ? "Pause timeline" : "Play timeline");
        playButton.disabled = state.readOnly || state.reports.length < 2;
      }
      updateDetails();
    }

    function updateDetails() {
      var region = regions.find(function (item) { return item.id === state.selectedRegion; }) || regions[2];
      var history = regionHistory(region.id);
      var title = el.querySelector(".body-detail-title");
      var current = el.querySelector(".body-detail-current");
      var sparkHost = el.querySelector(".body-sparkline");
      var list = el.querySelector(".body-history-list");
      var detailHint = el.querySelector(".body-detail-hint");
      if (!title || !current || !sparkHost || !list) return;

      title.textContent = region.label;
      current.textContent = history.length ?
        history[history.length - 1].intensity + " / 10 reported" :
        "No reports in this period";
      sparkHost.replaceChildren();
      var spark = makeSparkline(history.map(function (item) { return item.intensity; }));
      if (spark) sparkHost.appendChild(spark);
      list.replaceChildren();
      history.slice(-4).reverse().forEach(function (report) {
        var row = document.createElement("li");
        var date = document.createElement("time");
        date.dateTime = new Date(report.timestamp).toISOString();
        date.textContent = formatDate(report.timestamp);
        var value = document.createElement("strong");
        value.textContent = report.intensity + " / 10";
        row.append(date, value);
        if (report.note) {
          var note = document.createElement("span");
          note.textContent = report.note;
          row.appendChild(note);
        }
        list.appendChild(row);
      });
      if (detailHint) detailHint.textContent = state.readOnly ?
        "Report view" : "Select a region to review its history";
    }

    function paint() {
      stopPlayback();
      el.innerHTML =
        '<section class="body-widget" aria-label="Body discomfort report history">' +
          '<div class="body-widget-heading"><div><h2>Body map</h2>' +
            '<p>Where discomfort was reported</p></div>' +
          '</div>' +
          '<div class="body-widget-layout">' +
            '<div class="body-figure-wrap">' +
            '<svg class="body-figure" viewBox="0 0 320 500" role="group" aria-label="Front-facing body diagram with clickable report regions">' +
                '<path class="body-silhouette" d="M142 24c-24 0-40 20-40 45 0 20 9 35 23 43v18c-9 10-25 16-43 22-21 7-34 25-38 49l-12 66c-2 12 4 22 13 24 10 2 17-5 20-17l14-59 8 103-8 87c-1 13 6 22 16 22 11 0 16-8 17-19l10-81 9 0 10 81c1 11 7 19 17 19 11 0 17-9 16-22l-8-87 8-103 14 59c3 12 10 19 20 17 9-2 15-12 13-24l-12-66c-4-24-17-42-38-49-18-6-34-12-43-22v-18c14-8 23-23 23-43 0-25-16-45-40-45z" />' +
                '<path class="body-chest-base" d="M90 164c20-12 44-18 70-18s50 6 70 18l-7 111H97z" />' +
                '<g class="body-region-group">' +
                  '<circle class="body-region" data-region="nose_sinus" cx="160" cy="72" r="20" role="button" tabindex="0" aria-label="Nose and sinuses" />' +
                  '<path class="body-region" data-region="throat" d="M146 111h28l6 51h-40z" role="button" tabindex="0" aria-label="Throat" />' +
                  '<path class="body-region" data-region="chest" d="M106 168q54-28 108 0l-7 90q-47 19-94 0z" role="button" tabindex="0" aria-label="Chest" />' +
                  '<path class="body-region lung-region" data-region="lung_left" d="M151 172c-14 3-27 21-30 47-3 23 4 39 15 38 11-2 20-19 20-40v-43z" role="button" tabindex="0" aria-label="Left lung" />' +
                  '<path class="body-region lung-region" data-region="lung_right" d="M169 172c14 3 27 21 30 47 3 23-4 39-15 38-11-2-20-19-20-40v-43z" role="button" tabindex="0" aria-label="Right lung" />' +
                '</g>' +
                '<g class="bronchial-tree" aria-hidden="true">' +
                  '<path d="M160 163v27m0 0-13 12m13-12 13 12m-13-12v30m-13-18-9 14m9-14-1 22m27-22 9 14m-9-14 1 22m-14-12-10 15m10-15 10 15" />' +
                '</g>' +
                '<path class="body-feature" d="M153 75q7 5 14 0M160 88v9m-8 4q8 5 16 0M142 110h36" />' +
              '</svg>' +
              '<p class="body-figure-caption">' +
                (state.readOnly ? "Front view · report summary" : "Front view · select a highlighted region") +
              '</p>' +
            '</div>' +
            '<aside class="body-detail" aria-live="polite">' +
              '<div class="body-detail-top"><div><p class="body-detail-hint"></p>' +
                '<h3 class="body-detail-title"></h3></div>' +
                '<strong class="body-detail-current"></strong></div>' +
              '<div class="body-sparkline"></div>' +
              '<ol class="body-history-list"></ol>' +
            '</aside>' +
          '</div>' +
          '<div class="body-timeline">' +
            '<button class="body-play" type="button">Play</button>' +
            '<input class="body-time-slider" type="range" min="0" max="0" value="0" aria-label="Step through body report history">' +
            '<time class="body-time-label"></time>' +
          '</div>' +
        '</section>';

      var wrapper = el.firstElementChild;
      wrapper.addEventListener("click", function (event) {
        var region = event.target.closest("[data-region]");
        if (region && !state.readOnly) {
          state.selectedRegion = region.getAttribute("data-region");
          updateView();
          return;
        }
        if (event.target.closest(".body-play") && !state.readOnly) {
          if (state.playing) {
            stopPlayback();
            updateView();
          } else {
            state.playing = true;
            updateView();
            state.timer = window.setInterval(function () {
              state.index = (state.index + 1) % state.reports.length;
              updateView();
            }, 950);
          }
        }
      });
      wrapper.addEventListener("keydown", function (event) {
        var region = event.target.closest("[data-region]");
        if (region && !state.readOnly && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          region.dispatchEvent(new MouseEvent("click", { bubbles: true, view: window }));
        }
      });
      wrapper.addEventListener("input", function (event) {
        if (event.target.matches(".body-time-slider") && !state.readOnly) {
          stopPlayback();
          state.index = Number(event.target.value);
          updateView();
        }
      });
      updateView();
    }

    paint();
    el.__setReports = function (list) {
      stopPlayback();
      state.reports = normalizeReports(list);
      state.index = Math.max(0, state.reports.length - 1);
      state.readOnly = true;
      paint();
    };
    el.__cleanup = function () {
      stopPlayback();
      delete el.__setReports;
    };
  }

  window.Widgets.register({
    id: "body-diagram",
    title: "Body diagram",
    sizes: ["S", "M", "L"],
    render: render
  });
}());
