(function () {
  var day = 86400000;
  var responses = [
    { daysAgo: 12, breathing: 2, region: "chest", intensity: 1, note: "Mild tightness" },
    { daysAgo: 9, breathing: 3, region: "throat", intensity: 2, note: "Scratchy after exercise" },
    { daysAgo: 6, breathing: 2, region: "nose_sinus", intensity: 3, note: "Seasonal congestion" },
    { daysAgo: 3, breathing: 5, region: "lung_left", intensity: 4, note: "Worse in the evening" },
    { daysAgo: 1, breathing: 7, region: "chest", intensity: 7, note: "More frequent tightness" },
    { daysAgo: 0, breathing: 6, region: "lung_right", intensity: 6, note: "Recent report" }
  ].map(function (item) {
    return {
      patientId: "demo",
      timestamp: new Date(Date.now() - item.daysAgo * day).toISOString(),
      breathlessness: item.breathing,
      bodyReports: [{
        region: item.region,
        intensity: item.intensity,
        note: item.note
      }]
    };
  });
  var data = { responses: responses };
  var grid = document.querySelector(".widget-grid");

  window.Widgets.all().forEach(function (definition) {
    definition.sizes.forEach(function (size) {
      var article = document.createElement("article");
      article.className = "widget-tile";
      article.setAttribute("data-widget-size", size);

      var heading = document.createElement("h2");
      heading.textContent = definition.title + " · " + size;
      var host = document.createElement("div");
      host.className = "widget-host";
      article.append(heading, host);
      grid.appendChild(article);
      definition.render(host, {
        data: data,
        patientId: "demo",
        size: size,
        onChange: function () {}
      });
    });
  });
}());
