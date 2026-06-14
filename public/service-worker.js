// ── AWprepa Service Worker v14 ────────────────────────────────────────────────
// Stratégies :
//   • Shell JS/CSS/images  → cache-first (servi instantanément hors-ligne)
//   • Pages HTML (SPA)     → network-first + fallback vers /  (navigation offline)
//   • API Supabase GET     → network-first (données fraîches), fallback cache si hors-ligne
// v14 : pre-cache TOUS les chunks via asset-manifest.json pour navigation offline complète

const CACHE_SHELL   = 'aw-shell-v14'
const CACHE_API     = 'aw-api-v14'
const CACHE_PAGES   = 'aw-pages-v14'

// ── Install : précache l'intégralité du bundle via asset-manifest.json ────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(async cache => {
      // 1. Page principale
      const res = await fetch('/', { credentials: 'same-origin' })
      await cache.put('/', res.clone())

      // 2. Tous les assets listés dans asset-manifest.json (JS chunks, CSS, images)
      try {
        const manifestRes = await fetch('/asset-manifest.json')
        const manifest    = await manifestRes.json()
        // Le manifest a { files: { 'main.js': '/static/js/main.xxx.js', ... } }
        const urls = Object.values(manifest.files || manifest)
          .filter(u => typeof u === 'string' && u.startsWith('/'))
        await Promise.allSettled(urls.map(url =>
          fetch(url, { credentials: 'same-origin' })
            .then(r => r.ok ? cache.put(url, r) : null)
            .catch(() => null)
        ))
      } catch {}
    })
  )
  self.skipWaiting()
})

// ── Activate : purge les anciens caches + force rechargement des pages ouvertes ─
self.addEventListener('activate', event => {
  const KEEP = ['aw-shell-v14', 'aw-api-v14', 'aw-pages-v14']
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clientList => {
        // Force reload sur toutes les pages ouvertes — fonctionne même si le JS de la page est ancien
        clientList.forEach(client => {
          try { client.navigate(client.url) } catch (_) {}
        })
      })
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return   // mutations → réseau direct, pas de SW

  const url = new URL(request.url)

  // 1. API Supabase → network-first (toujours fraîches), fallback cache si hors-ligne
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirst(request, CACHE_API))
    return
  }

  // 2. Assets statiques (/static/js, /static/css, images, manifests) → cache-first
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/static/') ||
     url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?|ttf)$/))
  ) {
    event.respondWith(cacheFirst(request, CACHE_SHELL))
    return
  }

  // 3. Navigation SPA (HTML) → network-first, fallback vers / (offline shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_PAGES).then(c => c.put(request, clone))
          }
          return res
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match('/'))
        )
    )
    return
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Réseau d'abord → met en cache la réponse → si hors-ligne, fallback sur le cache.
 *  Garantit des données fraîches quand on est en ligne. */
async function networkFirst(request, cacheName) {
  const cache    = await caches.open(cacheName)
  const cacheKey = request.url
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(cacheKey, res.clone())
    return res
  } catch (_e) {
    const cached = await cache.match(cacheKey)
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })
  }
}

/** Renvoie depuis le cache ; en fond met à jour pour la prochaine fois */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

// ── Background Sync — charges offline ────────────────────────────────────────
// Quand la connexion revient (même app fermée sur Android/Chrome),
// le SW notifie toutes les fenêtres ouvertes pour qu'elles traitent leur file.
self.addEventListener('sync', event => {
  if (event.tag === 'sync-charges') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        list.forEach(client => client.postMessage({ type: 'PROCESS_CHARGE_QUEUE' }))
      })
    )
  }
})

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.titre || 'AWprepa', {
      body:  data.corps || '',
      icon:  '/logo192.png',
      badge: '/logo192.png',
      data:  { lien: data.lien || '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const lien    = event.notification.data?.lien || '/'
  const fullUrl = new URL(lien, self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(fullUrl)
          return
        }
      }
      return clients.openWindow(fullUrl)
    })
  )
})
