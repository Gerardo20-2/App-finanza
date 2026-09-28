/* WeeklyBurn — service worker.
 *
 * El estado financiero ya es offline-first porque vive en IndexedDB; este
 * worker sólo se encarga de que el shell de la app (HTML, JS, CSS, iconos)
 * también esté disponible sin red.
 */

const VERSION = 'v2';
const SHELL_CACHE = `weeklyburn-shell-${VERSION}`;
const RUNTIME_CACHE = `weeklyburn-runtime-${VERSION}`;

/**
 * Raíz de la app: `https://host/` en local o `https://usuario.github.io/repo/`
 * en GitHub Pages. Todas las rutas del shell se resuelven contra ella para que
 * el mismo archivo sirva en ambos despliegues.
 */
const SCOPE = self.registration.scope;
const scoped = (path) => new URL(path, SCOPE).href;

/**
 * Las rutas van con y sin `/` final: el export estático usa `history/` y
 * `next start` usa `history`. La variante que no existe se descarta abajo.
 */
const SHELL_ASSETS = [
  '',
  'index.html',
  'history/',
  'history',
  'analytics/',
  'analytics',
  'settings/',
  'settings',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-icon.png',
].map(scoped);

/**
 * Cachea una por una (`addAll` es atómico: una ruta fallida tiraría toda la
 * instalación) y descarta respuestas redirigidas: Safari y Chrome se niegan a
 * servir una redirección cacheada como respuesta de navegación.
 */
async function precache(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response.ok && !response.redirected) await cache.put(url, response);
  } catch {
    /* Sin red durante la instalación: se cachea en el primer uso. */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL_ASSETS.map((url) => precache(cache, url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/** Los bundles de Next llevan hash en el nombre: son inmutables. */
function isImmutableAsset(url) {
  return url.pathname.includes('/_next/static/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: red primero para traer el HTML fresco, caché como red de
  // seguridad y, en el peor caso, el shell de la raíz.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          return (
            cached ??
            (await caches.match(scoped(''))) ??
            (await caches.match(scoped('index.html'))) ??
            Response.error()
          );
        }),
    );
    return;
  }

  // Assets con hash: caché primero, nunca cambian bajo la misma URL.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Resto: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());

      return cached ?? network;
    }),
  );
});
