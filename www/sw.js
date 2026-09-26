// ============================================================================
// GANADERO AD PWA: SERVICE WORKER v3.8.0 (UNIVERSAL SCOPE & OFFLINE CACHE)
// ============================================================================

const CACHE_NAME = 'ganadero-ad-v3.8.0-pwa-final';
const CORE_FILES = [
  '/',
  '/index.html',
  '/bundle.js',
  '/manifest.webmanifest',
  '/icon.svg',
  '/frontend/public/manifest.webmanifest',
  '/frontend/public/icon.svg',
  '/frontend/src/styles.css'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const f of CORE_FILES) {
        try {
          await cache.add(f);
        } catch (err) {
          // Si algún recurso falla, continuar para no abortar el SW
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Peticiones a Supabase Cloud van directo a la red sin pasar por cache del SW
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // 2. Para navegación (HTML) y scripts principales (bundle.js), aplicar Network-First
  const esNavegacionOScript =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.js');

  if (esNavegacionOScript) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            const rootCached = await caches.match('/');
            if (rootCached) return rootCached;
            const indexCached = await caches.match('/index.html');
            if (indexCached) return indexCached;
            const relIndex = await caches.match('./index.html');
            if (relIndex) return relIndex;
          }
          return null;
        })
    );
    return;
  }

  // 3. Para activos estáticos (iconos, fuentes, hojas de estilo), Cache-First con actualización de fondo
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        fetch(event.request)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
