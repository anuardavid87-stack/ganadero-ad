// ============================================================================
// GANADERO AD PWA: SERVICE WORKER v4.8.0 (OFFLINE FIELD MODE & FECHAS DD/MM/AAAA)
// ============================================================================

const CACHE_NAME = 'ganadero-ad-v4.8.0-fechas-dmy';
const CORE_FILES = [
  './',
  './index.html',
  './bundle.js',
  './bovitrack_bundle.js',
  './tailwind.min.css',
  './styles.css',
  './xlsx.full.min.js',
  './manifest.webmanifest',
  './icon.png',
  './icon-192.png',
  './icon.svg',
  './favicon.ico',
  './public/manifest.webmanifest',
  './public/icon.png',
  './public/icon-192.png',
  './public/icon.svg',
  './public/favicon.ico',
  './public/tailwind.min.css',
  './public/styles.css',
  './public/xlsx.full.min.js',
  './frontend/tailwind.min.css',
  './frontend/public/manifest.webmanifest',
  './frontend/public/icon.png',
  './frontend/public/icon-192.png',
  './frontend/public/icon.svg',
  './frontend/public/favicon.ico',
  './frontend/src/styles.css'
];

async function precacheCoreFiles() {
  const cache = await caches.open(CACHE_NAME);
  for (const f of CORE_FILES) {
    try {
      await cache.add(f);
    } catch (_err) {
      // Continuar aunque alguna ruta opcional no exista en ese despliegue
    }
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheCoreFiles());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event || !event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'WARM_OFFLINE_CACHE') {
    event.waitUntil(precacheCoreFiles());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Peticiones a Supabase Cloud o API serverless van directo a la red sin pasar por cache del SW
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Para navegación (HTML) y scripts principales (bundle.js), aplicar Network-First con respaldo Offline ignorando querystring (?v=...)
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
          const cachedExact = await caches.match(event.request);
          if (cachedExact) return cachedExact;
          const cachedIgnoreSearch = await caches.match(event.request, { ignoreSearch: true });
          if (cachedIgnoreSearch) return cachedIgnoreSearch;
          if (url.pathname.endsWith('bundle.js')) {
            const relBundle = await caches.match('./bundle.js') || await caches.match('/bundle.js');
            if (relBundle) return relBundle;
          }
          if (event.request.mode === 'navigate') {
            const rootCached = await caches.match('/');
            if (rootCached) return rootCached;
            const indexCached = await caches.match('/index.html');
            if (indexCached) return indexCached;
            const relIndex = await caches.match('./index.html');
            if (relIndex) return relIndex;
          }
          return new Response('Sin conexión a internet', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // 3. Para activos estáticos (iconos, fuentes, hojas de estilo), Cache-First con actualización de fondo
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
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
      return fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => {
          return new Response('', { status: 408, statusText: 'Offline' });
        });
    })
  );
});
