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

  // The keepsake room on art/nook.jpg (852×1846). Each spot is [x, floor y,
  // width as % of the room]: the floor in front of the cushion fills first,
  // then behind it, then the ledge under the window. Whatever comes next
  // waits on the cushion.
  var ROOM_W = 852, ROOM_H = 1846;
  var CUSHION = [440, 1050, 30];
  var SPOTS = [
    [430, 1330, 19], [615, 1310, 18], [235, 1315, 16], [380, 1495, 18], [575, 1475, 19], [690, 1610, 15],
    [290, 925, 12], [590, 925, 12],
    [260, 592, 10], [372, 592, 10], [508, 592, 10], [620, 592, 10],
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
