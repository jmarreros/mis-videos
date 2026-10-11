// Service worker mínimo: cachea sólo los assets compilados (/build/) y ofrece
// una página offline simple. Las páginas, la API y los videos siempre van a la red.
const CACHE = 'mis-videos-v1';
const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin === self.location.origin && url.pathname.startsWith(BASE + 'build/')) {
        event.respondWith(
            caches.match(request).then(
                (hit) =>
                    hit ||
                    fetch(request).then((res) => {
                        if (res.ok) {
                            const copy = res.clone();
                            caches.open(CACHE).then((c) => c.put(request, copy));
                        }
                        return res;
                    }),
            ),
        );
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(
                () =>
                    new Response(
                        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><body style="background:#0c0c0f;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h1>Sin conexión</h1><p>Mis Videos necesita internet. Vuelve a intentarlo.</p></div>',
                        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
                    ),
            ),
        );
    }
});
