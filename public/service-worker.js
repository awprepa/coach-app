// ── AWprepa Service Worker v30 ────────────────────────────────────────────────
// Stratégies :
//   • Shell JS/CSS/images  → cache-first (servi instantanément hors-ligne)
//   • Pages HTML (SPA)     → network-first + fallback vers /  (navigation offline)
//   • API Supabase GET     → stale-while-revalidate : renvoie le cache
//     IMMÉDIATEMENT (navigation instantanée même en mauvaise connexion) puis
//     rafraîchit en arrière-plan. Les écritures (non-GET) restent réseau direct.
// v15 : lectures local-first (stale-while-revalidate) + invalidation ciblée du
//       cache API après une écriture réussie (message INVALIDATE_API_CACHE).

const CACHE_SHELL   = 'aw-shell-v30'
const CACHE_API     = 'aw-api-v30'
const CACHE_PAGES   = 'aw-pages-v30'

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
  const KEEP = ['aw-shell-v30', 'aw-api-v30', 'aw-pages-v30']
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

  // 1. API Supabase → stale-while-revalidate (cache immédiat + refresh en fond)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(staleWhileRevalidate(event, CACHE_API))
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

/** Stale-while-revalidate : renvoie le cache IMMÉDIATEMENT s'il existe, puis
 *  rafraîchit en arrière-plan pour la prochaine fois. Si pas de cache, on
 *  attend le réseau (premier chargement), avec fallback offline. */
async function staleWhileRevalidate(event, cacheName) {
  const request  = event.request
  const cache    = await caches.open(cacheName)
  const cacheKey = request.url

  const cached      = await cache.match(cacheKey)
  const cachedClone = cached ? cached.clone() : null

  const fetchAndUpdate = fetch(request)
    .then(async res => {
      if (res && res.ok) {
        // Si les données ont changé depuis le cache → prévient la page ouverte
        // pour qu'elle se rafraîchisse d'elle-même (Phase 3).
        if (cachedClone) {
          try {
            const [fresh, old] = await Promise.all([res.clone().text(), cachedClone.text()])
            if (fresh !== old) notifyDataRefreshed(cacheKey)
          } catch (_) {}
        }
        cache.put(cacheKey, res.clone())
      }
      return res
    })
    .catch(() => null)

  if (cached) {
    // Révalidation en fond, maintenue en vie même si la page a déjà sa réponse
    event.waitUntil(fetchAndUpdate)
    return cached
  }

  // Pas encore de cache pour cette requête → on attend le réseau
  const net = await fetchAndUpdate
  return net || new Response(JSON.stringify({ error: 'offline' }), {
    status: 503, headers: { 'Content-Type': 'application/json' },
  })
}

/** Prévient toutes les fenêtres ouvertes qu'une donnée a été rafraîchie */
async function notifyDataRefreshed(url) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  list.forEach(c => c.postMessage({ type: 'AW_DATA_REFRESHED', url }))
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

// ── Invalidation ciblée du cache API après une écriture ──────────────────────
// Après une mutation réussie, le client demande de purger les lectures en
// cache de la table concernée pour que la prochaine lecture soit fraîche
// (évite de voir sa propre modif « disparaître » une seconde avec le SWR).
self.addEventListener('message', event => {
  const data = event.data || {}
  if (data.type === 'INVALIDATE_API_CACHE' && data.table) {
    event.waitUntil(
      caches.open(CACHE_API).then(async cache => {
        const keys = await cache.keys()
        await Promise.all(keys.map(req =>
          req.url.includes('/rest/v1/' + data.table) ? cache.delete(req) : null
        ))
      })
    )
  }
})

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
