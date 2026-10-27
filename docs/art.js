// Art: Neeff's illustrations live in art/. This file maps what each surprise
// looks like and where it sits in the keepsake room.

var ART = (function () {
  function img(name, cls) {
    return '<img class="' + (cls || '') + '" src="art/items/' + name + '.png" alt="">';
  }

  // How each kind of surprise looks: in lists, while waiting, and opening.
  var LOOK = {
    letter: { pin: 'envelope', waiting: 'envelope', sealed: 'envelope', open: 'envelope-open' },
    place: { pin: 'compass', waiting: 'compass', sealed: 'chest', open: 'chest-open' },
    gift: { pin: 'gift', waiting: 'gift', sealed: 'chest', open: 'chest-open' },
  };
  function look(type) { return LOOK[type] || LOOK.letter; }

  // The keepsake room on art/room.jpg (1024×1536). Each spot is [x, floor y,
  // width as % of the painting]: the rug in front of the cushion fills first,
  // then the floor behind it, then the window sill, the side table and the
  // armchair. Whatever comes next waits on the cushion. Phones show roughly
  // x 100–800, so spots stay inside that.
  var ROOM_W = 1024, ROOM_H = 1536;
  var CUSHION = [455, 1010, 22];
  var SPOTS = [
    [560, 1270, 13], [720, 1250, 11], [400, 1225, 11], [480, 1355, 12], [680, 1355, 11], [800, 1135, 9],
    [310, 935, 8], [640, 925, 8],
    [590, 702, 6], [215, 714, 6], [812, 818, 7],
  ];
  function place(spot) {
    return 'left:' + (spot[0] / ROOM_W) * 100 + '%;top:' + (spot[1] / ROOM_H) * 100 + '%;width:' + spot[2] + '%;z-index:' + spot[1];
  }
  // Each opened surprise keeps its own little object: the nth letter she opened
  // always gets the nth letter keepsake, so they vary and never shuffle.
  var KEEPSAKE = {
    letter: ['envelope-open', 'scroll', 'bottle'],
    place: ['compass', 'polaroid', 'ticket'],
    gift: ['gift', 'gift-round', 'sack', 'jar', 'heart-charm', 'key', 'moon-charm'],
  };
  function keepsake(item, nth) {
    var list = KEEPSAKE[item.type] || KEEPSAKE.letter;
    return list[nth % list.length];
  }

  // Small crescent for screens without a painting (the secret word, offline).
  function moon(size) {
    return '<svg viewBox="0 0 120 120" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<defs><radialGradient id="mg" cx="40%" cy="40%"><stop offset="0" stop-color="#ffe9a8"/><stop offset="1" stop-color="#e9b955"/></radialGradient>' +
      '<mask id="mm"><rect width="120" height="120" fill="#fff"/><circle cx="80" cy="46" r="44" fill="#000"/></mask></defs>' +
      '<circle cx="60" cy="60" r="56" fill="#ffe7a0" opacity=".12"/>' +
      '<circle cx="56" cy="62" r="46" fill="url(#mg)" mask="url(#mm)"/></svg>';
  }

  return {
    img: img, look: look, moon: moon,
    place: place, keepsake: keepsake, CUSHION: CUSHION, SPOTS: SPOTS,
  };
})();
