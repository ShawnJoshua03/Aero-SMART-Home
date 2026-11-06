(function () {
  function scale(value, domain, range) {
    var span = domain[1] - domain[0] || 1;
    return range[0] + ((value - domain[0]) / span) * (range[1] - range[0]);
  }

  function path(points) {
    return points.map(function (point, index) {
      return (index ? 'L' : 'M') + point.x.toFixed(2) + ',' + point.y.toFixed(2);
    }).join(' ');
  }

  function ticks(min, max, count) {
    if (max < min) {
      var swap = max;
      max = min;
      min = swap;
    }

    var span = max - min;
    if (!span) span = Math.max(Math.abs(max) * 0.2, 1);
    var rough = span / Math.max(count, 1);
    var power = Math.pow(10, Math.floor(Math.log10(rough)));
    var fraction = rough / power;
    var step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
    var start = Math.floor(min / step) * step;
    var end = Math.ceil(max / step) * step;
    var result = [];

    for (var value = start; value <= end + step * 0.001; value += step) {
      result.push(Number(value.toPrecision(10)));
    }
    return result;
  }

  window.ChartSvg = { scale: scale, path: path, ticks: ticks };
}());
