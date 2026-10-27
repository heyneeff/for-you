// para ti — the app she opens. Talks to the backend, which only releases a
// surprise once its time has come. Kept to ES2017 (no ?. or ??) for older iPhones.

(function () {
  var API = window.FOR_YOU.api;
  var app = document.getElementById('app');
  var tabs = document.getElementById('tabs');
  var sheet = document.getElementById('sheet');
  var state = { items: [], skew: 0, loaded: false };
  var timers = [];

  var WHAT = { letter: 'A letter for you', place: 'A special place', gift: 'A little something for you' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------------------------------------------------------------- utils --
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getKey() { try { return localStorage.getItem('fy_key') || ''; } catch (e) { return ''; } }
  function setKey(k) { try { localStorage.setItem('fy_key', k); } catch (e) {} }
  function now() { return Date.now() + state.skew; }
  function clearTimers() { timers.forEach(clearInterval); timers = []; }
  function fmtDate(iso) {
    var d = new Date(iso);
    var h = d.getHours(), m = d.getMinutes();
    var t = (h % 12 || 12) + (m ? ':' + (m < 10 ? '0' : '') + m : '') + (h < 12 ? 'am' : 'pm');
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ' · ' + t;
  }
  function isStandalone() {
    return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function mediaUrl(kind, id) { return API + '/api/' + kind + '/' + id + '?k=' + encodeURIComponent(getKey()); }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'x-key': getKey() };
    var body = opts.body;
    if (body && !(body instanceof Blob)) { headers['content-type'] = 'application/json'; body = JSON.stringify(body); }
    if (body instanceof Blob) headers['content-type'] = body.type || 'audio/mp4';
    return fetch(API + path, { method: opts.method || 'GET', headers: headers, body: body })
      .then(function (r) {
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      });
  }

  function loadItems() {
    return api('/api/items').then(function (res) {
      if (res.status === 401) { setKey(''); entered = false; go('#/'); throw new Error('locked out'); }
      state.items = res.data.items || [];
      state.skew = Date.parse(res.data.now) - Date.now();
      state.loaded = true;
      return state.items;
    });
  }

  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  // --------------------------------------------------------------- router --
  var entered = false;
  var backTo = '#/'; // where ‹ goes from a surprise: the map, a list, or the room
  function render() {
    clearTimers();
    closeSheet();
    stopAudio();
    window.scrollTo(0, 0);
    var h = location.hash || '#/';
    if (!entered || !getKey()) return h === '#/word' ? whisper() : splash();
    var m;
    if (h === '#/' || h === '#/home') return home();
    if ((m = h.match(/^#\/item\/([\w-]+)$/))) return itemScreen(m[1]);
    backTo = h;
    if (h === '#/room') return roomScreen();
    if ((m = h.match(/^#\/list\/(letter|place|gift)$/))) return listScreen(m[1]);
    if (h === '#/more') return moreScreen();
    return home();
  }
  window.addEventListener('hashchange', render);

  function setTab(name) {
    tabs.hidden = !name;
    var bs = tabs.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].className = bs[i].getAttribute('data-tab') === name ? 'on' : '';
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var t = b.getAttribute('data-tab');
    go(t === 'home' ? '#/' : t === 'more' ? '#/more' : t === 'room' ? '#/room' : '#/list/' + t);
  });

  // --------------------------------------------------------------- splash --
  function splash() {
    setTab(null);
    app.innerHTML =
      '<div class="screen full splash"><img class="splash-art fade-in" src="art/splash.jpg" alt="">' +
      '<div class="enter"><button class="ribbon-btn" id="enter">ENTER</button></div></div>';
    document.getElementById('enter').onclick = function () {
      if (getKey()) { entered = true; go('#/'); } else go('#/word');
    };
  }

  function whisper() {
    setTab(null);
    app.innerHTML =
      '<div class="screen full whisper">' + ART.moon(80) +
      '<h2>Whisper the secret word</h2><p>the one I told you</p>' +
      '<input id="word" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<button class="ribbon-btn" id="go">OPEN</button><div class="err" id="err"></div></div>';
    var input = document.getElementById('word');
    var submit = function () {
      var w = input.value.trim();
      if (!w) return;
      setKey(w);
      api('/api/hello').then(function (r) {
        if (r.status === 200) { entered = true; go('#/'); }
        else { setKey(''); document.getElementById('err').textContent = 'Not quite… try again ♥'; }
      }).catch(function () { setKey(''); document.getElementById('err').textContent = 'No connection. Try again in a moment.'; });
    };
    document.getElementById('go').onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
  }

  // ----------------------------------------------------------------- home --
  function greeting() {
    var h = new Date().getHours();
    return h < 5 ? 'Sweet dreams' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function home() {
    setTab('home');
    app.innerHTML = '<div class="screen home"><div class="home-head"><h1>' + greeting() + '</h1></div></div>';
    loadItems().then(function (items) {
      var spots = ART.pins(items.length);
      var next = items.filter(function (i) { return !i.unlocked; })[0];
      var ready = items.filter(function (i) { return i.unlocked && !i.opened; });
      var sub = ready.length ? 'Something is waiting for you ♥' : next ? 'Something is on its way…' : items.length ? 'Every surprise so far, all yours' : 'The path is ready ♥';
      var pins = items.map(function (it, i) {
        var cls = it.unlocked ? (it.opened ? 'pin' : 'pin ready') : 'pin locked';
        return '<a class="' + cls + '" id="pin-' + it.id + '" href="#/item/' + it.id + '" style="left:' + spots[i].left + '%;top:' + spots[i].top + '%">' +
          ART.img(ART.look(it.type).pin) + '<span class="lbl">' + (it.unlocked ? esc(it.title) : fmtDate(it.unlockAt)) + '</span></a>';
      }).join('');
      app.innerHTML =
        '<div class="screen home">' +
        '<div class="home-head fade-in"><h1>' + greeting() + '</h1><div class="hh">♥</div><div class="sub">' + sub + '</div></div>' +
        '<div class="map"><img class="map-art" src="art/map.jpg" alt="">' + pins + '</div>' +
        '</div>' + banners();
      wireBanners();
      // Start the view on what matters now: the one waiting, else the next one.
      var focus = ready[0] || next || items[items.length - 1];
      var mapImg = app.querySelector('.map-art');
      var scrollToFocus = function () {
        var el = focus ? document.getElementById('pin-' + focus.id) : null;
        var y = el ? el.getBoundingClientRect().top + window.pageYOffset - window.innerHeight * 0.55 : document.body.scrollHeight;
        window.scrollTo(0, Math.max(0, y));
      };
      if (mapImg.complete) scrollToFocus(); else mapImg.onload = scrollToFocus;
      // When the next one is due, refresh so its pin wakes up.
      if (next) {
        timers.push(setInterval(function () { if (Date.parse(next.unlockAt) <= now()) home(); }, 1000));
      }
    }).catch(offline);
  }

  function offline(err) {
    if (String(err && err.message) === 'locked out') return;
    app.innerHTML = '<div class="screen full whisper">' + ART.moon(70) + '<h2>The stars are out of reach</h2><p>Check your connection and try again.</p>' +
      '<button class="ribbon-btn small" onclick="location.reload()">TRY AGAIN</button></div>';
  }

  // ------------------------------------------------- notifications banner --
  function dismissed(k) { try { return localStorage.getItem('fy_dismiss_' + k) === '1'; } catch (e) { return false; } }
  function banners() {
    var out = '';
    if (isIOS() && !isStandalone() && !dismissed('a2hs')) {
      out = '<div class="banner" data-k="a2hs">' + ART.img('bell', 'banner-ic') + '<b>Keep me close</b><br>Tap the Share button below, then <i>Add to Home Screen</i>, so the little bells can ring when something opens. <button class="link-btn" data-x>later</button></div>';
    } else if (canPush() && Notification.permission === 'default' && !dismissed('bells')) {
      out = '<div class="banner" data-k="bells">' + ART.img('bell', 'banner-ic') + '<b>Little bells</b><br>Want a gentle ring when a surprise opens?<br><button class="ribbon-btn small" data-bells>YES PLEASE</button> <button class="link-btn" data-x>later</button></div>';
    }
    return out ? '<div class="banners">' + out + '</div>' : '';
  }
  function wireBanners() {
    var b = document.querySelector('.banners');
    if (!b) return;
    b.onclick = function (e) {
      var t = e.target;
      if (t.hasAttribute('data-x')) {
        try { localStorage.setItem('fy_dismiss_' + t.closest('.banner').getAttribute('data-k'), '1'); } catch (er) {}
        b.parentNode.removeChild(b);
      } else if (t.hasAttribute('data-bells')) {
        enableBells().then(function (msg) { b.innerHTML = '<div class="banner">' + msg + '</div>'; setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 3500); });
      }
    };
  }

  function canPush() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

  function b64ToBytes(s) {
    var raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function enableBells() {
    if (!canPush()) return Promise.resolve('This phone can’t ring the bells yet, but every surprise will still be here waiting ♥');
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return 'No bells then. Come visit whenever you like ♥';
      return Promise.all([navigator.serviceWorker.ready, api('/api/vapid')]).then(function (r) {
        return r[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(r[1].data.key) });
      }).then(function (sub) {
        return api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
      }).then(function () { return 'The bells are on ✨'; });
    }).catch(function () { return 'The bells got tangled. Try again from the More tab.'; });
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

  // ----------------------------------------------------------- item screen --
  function itemScreen(id) {
    setTab(null);
    app.innerHTML = '<div class="screen full wood"><a class="back" href="#/">‹</a></div>';
    var teaserP = state.loaded ? Promise.resolve(state.items) : loadItems();
    teaserP.then(function (items) {
      var t = items.filter(function (i) { return i.id === id; })[0];
      if (!t) return go('#/');
      if (Date.parse(t.unlockAt) > now()) return lockedScreen(t);
      if (!t.opened) return sealedScreen(t);
      return fetchAndReveal(t);
    }).catch(offline);
  }

  function lockedScreen(t) {
    app.innerHTML =
      '<div class="screen full nook"><a class="back" href="#/">‹</a><div class="item-wrap fade-in">' +
      '<div class="hero">' + ART.img(ART.look(t.type).waiting) + '</div>' +
      '<div class="card"><h2>' + esc(WHAT[t.type] || t.title).toUpperCase() + '</h2>' +
      '<div class="opens">⟶ Opens in ⟵</div><div class="count" id="count"></div></div>' +
      noteButton() + '</div></div>';
    wireNote(t.id);
    var el = document.getElementById('count');
    var tick = function () {
      var ms = Date.parse(t.unlockAt) - now();
      if (ms <= 0) { t.unlocked = true; state.loaded = false; return sealedScreen(t); }
      var s = Math.floor(ms / 1000);
      var parts = [[Math.floor(s / 86400), 'DAYS'], [Math.floor(s / 3600) % 24, 'HOURS'], [Math.floor(s / 60) % 60, 'MIN'], [s % 60, 'SEC']];
      el.innerHTML = parts.map(function (p) {
        return '<div class="u"><span class="n">' + (p[0] < 10 ? '0' : '') + p[0] + '</span><span class="l">' + p[1] + '</span></div>';
      }).join('');
    };
    tick();
    timers.push(setInterval(tick, 1000));
  }

  // Unlocked but never opened: she breaks the seal herself.
  function sealedScreen(t) {
    clearTimers();
    var lk = ART.look(t.type);
    app.innerHTML =
      '<div class="screen full nook"><a class="back" href="#/">‹</a><div class="item-wrap fade-in">' +
      '<div class="hero tappable kind-' + t.type + '" id="open">' + ART.img(lk.open, 'opened') +
      (t.type === 'letter' ? ART.img('parchment', 'rising') : '<span class="sparkles"><i></i><i></i><i></i><i></i><i></i></span>') +
      ART.img(lk.sealed, 'closed') + (t.type === 'letter' ? ART.img('seal-heart', 'pop') : '') + '</div>' +
      '<div class="tap-hint">' + (t.type === 'letter' ? 'Tap the seal to open' : 'Tap to open') + ' ♥</div></div></div>';
    document.getElementById('open').onclick = function () {
      if (/opening/.test(this.className)) return;
      this.className += ' opening';
      app.firstChild.className += ' unveil';
      var hint = app.querySelector('.tap-hint');
      if (hint) hint.style.visibility = 'hidden';
      setTimeout(function () { fetchAndReveal(t); }, 2300);
    };
  }

  function fetchAndReveal(t) {
    api('/api/items/' + t.id).then(function (res) {
      if (res.status === 403) return lockedScreen(t);
      if (res.status !== 200) return go('#/');
      t.opened = true;
      var item = res.data;
      if (item.type === 'place') return placeView(item);
      if (item.type === 'gift') return giftView(item);
      return letterView(item);
    }).catch(offline);
  }

  function photoHtml(item) {
    if (!item.hasPhoto) return '';
    return '<div class="polaroid"><img src="' + mediaUrl('photo', item.id) + '" alt=""></div>';
  }

  // ------------------------------------------------------------ voice note --
  var currentAudio = null;
  function stopAudio() { if (currentAudio) { currentAudio.pause(); currentAudio = null; } }

  function voiceHtml(item) {
    if (!item.hasAudio) return '';
    return '<div class="voice" id="voice"><button class="voice-play" id="vplay" aria-label="Play">' + ART.img('seal-heart') +
      '<span class="vp-icon" id="vicon">▶</span></button><div class="voice-tx"><div class="voice-t">a voice note for you</div>' +
      '<div class="voice-bar"><span id="vbar"></span></div></div></div>';
  }
  function wireVoice(item) {
    if (!item.hasAudio) return;
    var audio = new Audio();
    audio.preload = 'none';
    audio.src = mediaUrl('audio', item.id);
    currentAudio = audio;
    var icon = document.getElementById('vicon'), bar = document.getElementById('vbar');
    document.getElementById('vplay').onclick = function () {
      if (audio.paused) audio.play().catch(function () { icon.textContent = '!'; }); else audio.pause();
    };
    audio.onplay = function () { icon.textContent = '❚❚'; };
    audio.onpause = audio.onended = function () { icon.textContent = '▶'; };
    audio.ontimeupdate = function () { if (audio.duration) bar.style.width = (audio.currentTime / audio.duration) * 100 + '%'; };
  }

  // ------------------------------------------------------------- reveals --
  function noteButton() {
    return '<div class="actions"><button class="ribbon-btn small" id="note">LEAVE A LITTLE NOTE ♥</button></div>';
  }
  function wireNote(id) { var b = document.getElementById('note'); if (b) b.onclick = function () { noteSheet(id); }; }

  function letterView(item) {
    app.innerHTML =
      '<div class="screen full wood"><a class="back" href="#/">‹</a><div class="item-wrap">' +
      '<div class="letter fade-in"><div class="title">' + esc(item.title) + '</div>' + voiceHtml(item) +
      '<div class="body">' + esc(item.body) + '</div>' + photoHtml(item) +
      (item.signoff ? '<div class="signoff">' + esc(item.signoff) + '</div>' : '') +
      '<div class="seal-end">' + ART.img('seal-heart') + '</div></div>' + noteButton() + '</div></div>';
    wireNote(item.id);
    wireVoice(item);
  }

  function placeView(item) {
    var p = item.place || {};
    var maps = p.url || ('https://maps.apple.com/?q=' + encodeURIComponent((p.name || '') + ' ' + (p.address || '')));
    app.innerHTML =
      '<div class="screen full night"><a class="back" href="#/">‹</a>' +
      '<div class="adventure fade-in"><div class="scroll-banner">TODAY’S ADVENTURE</div>' +
      '<div class="card" style="margin-top:16px"><h2>' + esc(item.title).toUpperCase() + '</h2>' + voiceHtml(item) +
      (item.body ? '<div class="opens">' + esc(item.body) + '</div>' : '') + photoHtml(item) +
      (p.name ? '<div class="place-name">' + esc(p.name) + '</div>' : '') +
      (p.address ? '<div class="place-addr">' + esc(p.address) + '</div>' : '') + '</div>' +
      '<div class="actions"><a class="ribbon-btn small" href="' + esc(maps) + '" target="_blank" rel="noopener">OPEN IN MAPS</a></div>' +
      noteButton() + '</div></div>';
    wireNote(item.id);
    wireVoice(item);
  }

  function giftView(item) {
    var g = item.gift || {};
    app.innerHTML =
      '<div class="screen full wood"><a class="back" href="#/">‹</a><div class="item-wrap fade-in">' +
      '<div class="card"><h2>' + esc(item.title).toUpperCase() + '</h2>' + voiceHtml(item) +
      (item.body ? '<div class="gift-msg">' + esc(item.body) + '</div>' : '') + photoHtml(item) +
      (g.code ? '<div class="code" id="code">' + esc(g.code) + '</div><div class="code-hint">tap to copy</div>' : '') +
      '</div>' +
      (g.url ? '<div class="actions"><a class="ribbon-btn small" href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc((g.label || 'Open your gift').toUpperCase()) + '</a></div>' : '') +
      noteButton() + '</div></div>';
    wireNote(item.id);
    wireVoice(item);
    var c = document.getElementById('code');
    if (c) c.onclick = function () {
      if (navigator.clipboard) navigator.clipboard.writeText(g.code).then(function () { c.textContent = 'copied ♥'; setTimeout(function () { c.textContent = g.code; }, 1500); });
    };
  }

  // ----------------------------------------------------------------- room --
  // The fortune-teller's nook, kept as her keepsake room: everything she has
  // opened stays here, and whatever comes next waits on the cushion.
  function roomScreen() {
    setTab('room');
    app.innerHTML = '<div class="screen room-screen"></div>';
    loadItems().then(function (items) {
      var kept = items.filter(function (i) { return i.opened; });
      var count = {}, looks = {};
      kept.forEach(function (i) { count[i.type] = (count[i.type] || 0) + 1; looks[i.id] = ART.keepsake(i, count[i.type] - 1); });
      var next = items.filter(function (i) { return !i.opened; })[0];
      var shown = kept.slice(-ART.SPOTS.length), extra = kept.slice(0, kept.length - shown.length);
      var sub = !kept.length ? 'Everything you open will be kept here ♥'
        : 'Tap anything to open it again';
      var things = shown.map(function (it, i) {
        return '<a class="keep" href="#/item/' + it.id + '" style="' + ART.place(ART.SPOTS[i]) + '" aria-label="' + esc(it.title) + '">' +
          ART.img(looks[it.id]) + '</a>';
      }).join('');
      var waiting = next ? '<a class="keep cushion' + (next.unlocked ? ' ready' : '') + '" href="#/item/' + next.id + '" style="' + ART.place(ART.CUSHION) + '">' +
        '<span class="lbl">' + (next.unlocked ? 'ready for you ♥' : fmtDate(next.unlockAt)) + '</span>' + ART.img(ART.look(next.type).waiting) + '</a>' : '';
      app.innerHTML =
        '<div class="screen room-screen">' +
        '<div class="home-head fade-in"><h1>Keepsakes</h1><div class="hh">♥</div><div class="sub">' + sub + '</div></div>' +
        '<div class="room"><img class="room-art" src="art/nook.jpg" alt="">' + waiting + things + '</div>' +
        (extra.length ? '<div class="list-screen room-more"><h1>KEPT EARLIER</h1>' + extra.reverse().map(function (i) {
          return '<a class="row" href="#/item/' + i.id + '"><span class="ic">' + ART.img(looks[i.id]) + '</span>' +
            '<span class="tx"><div class="t">' + esc(i.title) + '</div><div class="d">' + fmtDate(i.unlockAt) + '</div></span><span class="chev">›</span></a>';
        }).join('') + '</div>' : '') +
        '</div>';
    }).catch(offline);
  }

  // ---------------------------------------------------------------- lists --
  function listScreen(type) {
    setTab(type);
    var title = { letter: 'Letters', place: 'Places', gift: 'Gifts' }[type];
    var which = sessionStorage.getItem('fy_seg') || 'upcoming';
    function draw() {
      var items = state.items.filter(function (i) { return i.type === type; });
      var shown = items.filter(function (i) { return which === 'upcoming' ? !i.unlocked : i.unlocked; });
      if (which === 'revealed') shown.reverse();
      app.innerHTML =
        '<div class="screen list-screen fade-in"><h1>' + title.toUpperCase() + '</h1>' +
        '<div class="seg"><button data-s="upcoming" class="' + (which === 'upcoming' ? 'on' : '') + '">UPCOMING</button>' +
        '<button data-s="revealed" class="' + (which === 'revealed' ? 'on' : '') + '">REVEALED</button></div>' +
        (shown.length ? shown.map(function (i) {
          return '<a class="row" href="#/item/' + i.id + '"><span class="ic' + (i.unlocked ? '' : ' dim') + '">' + ART.img(ART.look(i.type).pin) + '</span>' +
            '<span class="tx"><div class="t">' + esc(i.title) + '</div><div class="d">' +
            (i.unlocked ? (i.opened ? 'opened' : 'ready for you ♥') : fmtDate(i.unlockAt)) + '</div></span><span class="chev">›</span></a>';
        }).join('') : '<div class="list-empty">' + (which === 'upcoming' ? 'Nothing waiting… yet ♥' : 'Nothing revealed yet') + '</div>') +
        '</div>';
      app.querySelector('.seg').onclick = function (e) {
        var s = e.target.getAttribute('data-s');
        if (s) { which = s; sessionStorage.setItem('fy_seg', s); draw(); }
      };
    }
    loadItems().then(draw).catch(offline);
  }

  function moreScreen() {
    setTab('more');
    var bells = !canPush() ? (isIOS() && !isStandalone()
      ? 'Add me to your Home Screen first (Share → Add to Home Screen), then open me from there.'
      : 'This phone can’t ring the bells, but every surprise will still be here waiting.')
      : Notification.permission === 'granted' ? 'The bells are on ✨ <button class="link-btn" id="bells">ring them again</button>'
      : '<button class="ribbon-btn small" id="bells">TURN ON THE LITTLE BELLS</button>';
    app.innerHTML =
      '<div class="screen list-screen more fade-in"><h1>MORE</h1>' +
      '<div class="box">' + ART.img('bell', 'box-ic') + '<b class="sc">Little bells</b><p>' + bells + '</p></div>' +
      '<div class="box">' + ART.img('feather', 'box-ic') + '<b class="sc">A note for him</b><p>Anything on your heart, any time. Written or out loud.</p><button class="ribbon-btn small" id="note">WRITE A NOTE ♥</button></div>' +
      '<div class="box" style="text-align:center"><button class="link-btn" id="splash">back to the beginning</button></div></div>';
    var b = document.getElementById('bells');
    if (b) b.onclick = function () { enableBells().then(function (msg) { b.parentNode.innerHTML = msg; }); };
    document.getElementById('note').onclick = function () { noteSheet(null); };
    document.getElementById('splash').onclick = function () { entered = false; go('#/'); };
  }

  // ----------------------------------------------------------- note sheet --
  // A little note back to him: written, or recorded out loud.
  function canRecord() { return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  function noteSheet(itemId) {
    sheet.innerHTML = '<div class="panel"><h3>A LITTLE NOTE ♥</h3><textarea id="nt" placeholder="write anything…"></textarea>' +
      (canRecord() ? '<div class="rec"><button class="rec-btn" id="rec">🎙 or say it out loud</button><span id="rect"></span></div>' : '') +
      '<div class="rec"><label class="rec-btn">📷 add a photo<input id="np" type="file" accept="image/*" hidden></label><div id="npv"></div></div>' +
      '<div class="row-btns"><button class="link-btn" id="nc">cancel</button><button class="ribbon-btn small" id="ns">SEND</button></div></div>';
    sheet.hidden = false;
    var recorded = null, recorder = null, stream = null, started = 0, clock = null, photo = null;
    var stopStream = function () { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; };
    var cancel = function () { if (recorder && recorder.state !== 'inactive') recorder.stop(); stopStream(); clearInterval(clock); closeSheet(); };
    document.getElementById('nc').onclick = cancel;
    sheet.onclick = function (e) { if (e.target === sheet) cancel(); };

    var recBtn = document.getElementById('rec');
    if (recBtn) recBtn.onclick = function () {
      var label = document.getElementById('rect');
      if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s;
        var type = MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
        recorder = type ? new MediaRecorder(s, { mimeType: type }) : new MediaRecorder(s);
        var chunks = [];
        recorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = function () {
          stopStream();
          clearInterval(clock);
          recorded = new Blob(chunks, { type: recorder.mimeType || type || 'audio/mp4' });
          recBtn.textContent = '🎙 record again';
          label.innerHTML = '<audio controls src="' + URL.createObjectURL(recorded) + '"></audio>';
        };
        recorder.start();
        started = Date.now();
        recBtn.textContent = '■ stop';
        clock = setInterval(function () { label.textContent = ' ' + Math.floor((Date.now() - started) / 1000) + 's'; }, 250);
      }).catch(function () { label.textContent = ' (no microphone access)'; });
    };

    document.getElementById('np').onchange = function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var prev = document.getElementById('npv');
      prev.textContent = ' …';
      shrinkPhoto(f).then(function (b) {
        photo = b;
        prev.innerHTML = '<img class="np-thumb" src="' + URL.createObjectURL(b) + '" alt="">';
      });
    };

    document.getElementById('ns').onclick = function () {
      var text = document.getElementById('nt').value.trim();
      if (!text && !recorded && !photo) return;
      var q = itemId ? '?itemId=' + itemId : '';
      var sends = [];
      if (text) sends.push(api('/api/notes', { method: 'POST', body: { itemId: itemId, text: text } }));
      if (recorded) sends.push(api('/api/notes/voice' + q, { method: 'POST', body: recorded }));
      if (photo) sends.push(api('/api/notes/photo' + q, { method: 'POST', body: photo }));
      this.disabled = true;
      Promise.all(sends).then(function (rs) {
        var ok = rs.every(function (r) { return r.status === 200; });
        var stamp = ['stamp-tent', 'stamp-wheel', 'stamp-horse'][Math.floor(Math.random() * 3)];
        sheet.querySelector('.panel').innerHTML = ok
          ? ART.img(stamp, 'sent-stamp') + '<h3>SENT ♥</h3><p style="font-style:italic">Stamped and on its way.</p>'
          : '<h3>Hmm</h3><p>It didn’t send. Try again?</p>';
        setTimeout(closeSheet, 1800);
      }).catch(function () { sheet.querySelector('.panel').innerHTML = '<h3>Hmm</h3><p>No connection. Try again?</p>'; setTimeout(closeSheet, 1800); });
    };
  }
  function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }

  // Phone photos are huge (and sometimes HEIC): redraw as a JPEG no wider than
  // 2000px so it uploads fast and opens anywhere. Falls back to the original.
  function shrinkPhoto(file) {
    return new Promise(function (resolve) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { resolve(file); };
      img.src = url;
    });
  }

  // Coming back to the app after a while: refresh what's ready.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && entered) { state.loaded = false; if ((location.hash || '#/') === '#/') render(); }
  });

  // Opened from a notification → skip the splash, straight to the map.
  if (/[?&]from=bell/.test(location.search) && getKey()) entered = true;
  render();
})();
