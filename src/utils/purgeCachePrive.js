// À la déconnexion : supprime les réponses d'API mises en cache par le service
// worker (stale-while-revalidate), pour qu'un téléphone partagé ne montre pas
// les données du compte précédent au suivant.
export async function purgerCachePrive() {
  try {
    if (!('caches' in window)) return
    const noms = await caches.keys()
    await Promise.all(noms.filter(n => n.startsWith('aw-api-')).map(n => caches.delete(n)))
  } catch (e) { console.error('[purgerCachePrive]', e) }
}
