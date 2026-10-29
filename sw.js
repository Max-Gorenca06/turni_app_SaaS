const CACHE_NAME = 'turni-boschetto-v24';
const urlsToCache = [
  './',
  './index.html',
  './style_v2.css',
  './script.js',
  './manifest.json',
  './richiesta_assenze.html',
  './app_dipendente.html',
  './app_dipendente.js',
  './js/config.js'
];

// Installazione: salva i file e FORZA l'attivazione immediata
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercettazione: Network-First con fallback su cache per avere sempre il codice aggiornato
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

// Pulizia: elimina le vecchie versioni e PRENDI IL CONTROLLO
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());

  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// --- WEB PUSH NOTIFICATIONS ---
self.addEventListener('push', event => {
  let data = {
    title: 'TurniCloud',
    body: 'Controlla l\'app per le novità sui tuoi turni.',
    url: './app_dipendente.html'
  };

  if (event.data) {
    try {
      data = Object.assign(data, event.data.json());
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './manifest-icon-192.maskable.png',
    badge: './manifest-icon-192.maskable.png',
    vibrate: [150, 75, 150],
    tag: data.tag || 'turnicloud-push-' + Date.now(),
    data: { url: data.url || './app_dipendente.html' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Supporto per notifiche locali inviate dalla pagina via postMessage (es. via Supabase Realtime)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url, tag } = event.data;
    self.registration.showNotification(title || 'TurniCloud', {
      body: body || '',
      icon: './manifest-icon-192.maskable.png',
      badge: './manifest-icon-192.maskable.png',
      vibrate: [150, 75, 150],
      tag: tag || 'turnicloud-rt-' + Date.now(),
      data: { url: url || './app_dipendente.html' }
    });
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const urlToOpen = (event.notification.data && event.notification.data.url) || './app_dipendente.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ((client.url.includes('app_dipendente') || client.url.includes('index.html')) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
