// Art: Neeff's illustrations live in art/. This file maps what each surprise
// looks like and where the path on the map runs.

var ART = (function () {
  function img(name, cls) {
    return '<img class="' + (cls || '') + '" src="art/items/' + name + '.png" alt="">';
  }

  // How each kind of surprise looks: on the map, while waiting, and opening.
  var LOOK = {
    letter: { pin: 'envelope', waiting: 'envelope', sealed: 'envelope', open: 'envelope-open' },
    place: { pin: 'compass', waiting: 'compass', sealed: 'chest', open: 'chest-open' },
    gift: { pin: 'gift', waiting: 'gift', sealed: 'chest', open: 'chest-open' },
  };
  function look(type) { return LOOK[type] || LOOK.letter; }

  // The path on art/map.jpg (852×1846), from the dock at the bottom up to the
  // castle. The first surprise waits by the boat; later ones climb the hill.
  var MAP_W = 852, MAP_H = 1846;
  var PATH = [
    [560, 1480], [470, 1390], [440, 1320], [455, 1265], [540, 1225], [645, 1180], [670, 1140],
    [600, 1105], [480, 1070], [370, 1040], [330, 1000], [390, 950], [450, 890], [540, 850],
    [590, 790], [575, 700], [480, 615], [380, 560], [365, 515], [440, 470], [480, 420], [470, 370], [400, 320],
  ];
  var lengths = [0];
  for (var i = 1; i < PATH.length; i++) {
    var dx = PATH[i][0] - PATH[i - 1][0], dy = PATH[i][1] - PATH[i - 1][1];
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  function along(t) {
    var target = t * lengths[lengths.length - 1];
    for (var i = 1; i < PATH.length; i++) {
      if (lengths[i] >= target) {
        var f = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
        return { x: PATH[i - 1][0] + f * (PATH[i][0] - PATH[i - 1][0]), y: PATH[i - 1][1] + f * (PATH[i][1] - PATH[i - 1][1]) };
      }
    }
    var last = PATH[PATH.length - 1];
    return { x: last[0], y: last[1] };
  }
  // Pin positions as percentages of the map, evenly spaced along the path.
  // A short list keeps a steady stride instead of stretching to the castle.
  function pins(n) {
    var step = 1 / Math.max(n - 1, 7), out = [];
    for (var i = 0; i < n; i++) {
      var p = along(Math.min(i * step, 1));
      out.push({ left: (p.x / MAP_W) * 100, top: (p.y / MAP_H) * 100 });
    }
    return out;
  }

  // Small crescent for screens without a painting (the secret word, offline).
  function moon(size) {
    return '<svg viewBox="0 0 120 120" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<defs><radialGradient id="mg" cx="40%" cy="40%"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#e9b955"/></radialGradient>' +
      '<mask id="mm"><rect width="120" height="120" fill="#fff"/><circle cx="80" cy="46" r="44" fill="#000"/></mask></defs>' +
      '<circle cx="60" cy="60" r="56" fill="#ffe7a0" opacity=".12"/>' +
      '<circle cx="56" cy="62" r="46" fill="url(#mg)" mask="url(#mm)"/></svg>';
  }

  return { img: img, look: look, pins: pins, moon: moon, MAP_W: MAP_W, MAP_H: MAP_H };
})();
