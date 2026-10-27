// Keeps the app shell and art on the phone, and rings the little bells.
// Surprises themselves are never cached here: they always come from the server.
var CACHE = 'para-ti-v6';
var SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'art.js', 'config.js', 'art/room.jpg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Same-origin files: network first so updates land, cache when offline.
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request); }));
});

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(data.title || 'para ti', {
    body: data.body || 'A new surprise is ready ✨',
    icon: 'art/icon-192.png',
    badge: 'art/icon-192.png',
    data: { url: './?from=bell' },
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) return list[i].navigate('./?from=bell').then(function (c) { return c && c.focus(); });
    return self.clients.openWindow('./?from=bell');
  }));
});
