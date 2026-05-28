// ── AWprepa Service Worker v11 ────────────────────────────────────────────────
// Stratégies :
//   • Shell JS/CSS/images  → cache-first (servi instantanément hors-ligne)
//   • Pages HTML (SPA)     → network-first + fallback vers /  (navigation offline)
//   • API Supabase GET     → network-first (données fraîches), fallback cache si hors-ligne
//   • API Supabase POST/PATCH/DELETE → réseau uniquement (mutations)
// IMPORTANT : stale-while-revalidate supprimé pour Supabase — il causait l'affichage
// de données obsolètes (wellness "non rempli", charges perdues) au retour dans l'app.

const CACHE_SHELL   = 'aw-shell-v11'
const CACHE_API     = 'aw-api-v11'
const CACHE_PAGES   = 'aw-pages-v11'

// ── Install : précache le shell de l'app ─────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(async cache => {
      // Récupère la page principale et capture tous les assets (JS, CSS) qu'elle référence
      const res  = await fetch('/', { credentials: 'same-origin' })
      const html = await res.clone().text()
      await cache.put('/', res)

      // Extrait les URLs de scripts et styles depuis le HTML
      const assetUrls = []
      const re = /(?:src|href)="(\/static\/[^"]+)"/g
      let m
      while ((m = re.exec(html)) !== null) assetUrls.push(m[1])

      // Met en cache chaque asset en parallèle (erreurs silencieuses)
      await Promise.allSettled(assetUrls.map(url => cache.add(url)))
    })
  )
  self.skipWaiting()
})

// ── Activate : purge les anciens caches ──────────────────────────────────────
self.addEventListener('activate', event => {
  const KEEP = [CACHE_SHELL, CACHE_API, CACHE_PAGES]
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
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
