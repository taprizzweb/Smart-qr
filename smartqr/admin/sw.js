// Smart QR Admin service worker: the app shell opens instantly and even offline.
// Server calls (Supabase) are never cached, so the numbers and shops are always live.
var CACHE = "sq-admin-v9";
var SHELL = ["./", "style.css", "app.js", "vendor/qrcode.js", "manifest.webmanifest", "/config.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;     // server calls and fonts go straight to the network

  if (req.mode === "navigate") {                                           // pages: fresh when online, cached shell when not
    e.respondWith(fetch(req).catch(function () { return caches.match("./"); }));
    return;
  }
  e.respondWith(                                                           // files: show cached now, refresh in the background
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
