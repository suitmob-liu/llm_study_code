var CACHE = 'notes-v1';
var SHELL = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', function(e) {
    e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(SHELL); }));
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(caches.keys().then(function(names) {
        return Promise.all(names.filter(function(n) { return n !== CACHE; }).map(function(n) { return caches.delete(n); }));
    }));
    self.clients.claim();
});

self.addEventListener('fetch', function(e) {
    var url = new URL(e.request.url);
    // API: network first, cache fallback
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(e.request).then(function(res) {
                if (res.ok && e.request.method === 'GET') {
                    var clone = res.clone();
                    caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
                }
                return res;
            }).catch(function() {
                return caches.match(e.request);
            })
        );
        return;
    }
    // Static: cache first, network fallback
    e.respondWith(
        caches.match(e.request).then(function(r) {
            return r || fetch(e.request).then(function(res) {
                if (res.ok) {
                    var clone = res.clone();
                    caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
                }
                return res;
            });
        })
    );
});
