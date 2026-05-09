const CACHE_NAME = 'awprepa-v1'
const urlsToCache = ['/']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})

self.addEventListener('push', event => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.titre || 'AWPrepa', {
      body: data.corps || '',
      icon: '/logo192.png',
      badge: '/logo192.png',
      data: { lien: data.lien || '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const lien = event.notification.data?.lien || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(lien)
          return
        }
      }
      return clients.openWindow(lien)
    })
  )
})
