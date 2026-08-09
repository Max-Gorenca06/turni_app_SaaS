const CACHE_NAME = 'turni-boschetto-v22';
const urlsToCache = [
  './',
  './index.html',
  './style_v2.css',
  './script.js',
  './manifest.json',
  './richiesta_assenze.html',
  './app_dipendente.html',
  './app_dipendente.js'
];

// Installazione: salva i file e FORZA l'attivazione immediata
self.addEventListener('install', event => {
  self.skipWaiting(); // <--- LA MAGIA 1: Non aspettare nella sala d'attesa, entra subito in azione!
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('File salvati in cache v3!');
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercettazione: usa i file salvati o scaricali (solo richieste GET dello stesso origin)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  // Ignora le richieste a Supabase o altri domini esterni per evitare problemi di CORS o di rete
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      }).catch(() => {
        return fetch(event.request);
      })
  );
});

// Pulizia: elimina le vecchie versioni e PRENDI IL CONTROLLO
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim()); // <--- LA MAGIA 2: Prendi immediatamente il controllo della pagina aperta
  
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Elimino vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// --- PUSH NOTIFICATIONS ---
self.addEventListener('push', event => {
  let data = { title: 'Nuovo Avviso', body: 'Controlla l\'app per le novità sui tuoi turni.', url: '/' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './manifest-icon-192.maskable.png', // Se hai l'icona
    badge: './manifest-icon-192.maskable.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/app_dipendente.html' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const urlToOpen = event.notification.data.url;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('app_dipendente.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
