import { useEffect, useRef } from 'react'

/**
 * Rafraîchit automatiquement la page en cours quand le service worker détecte
 * que des données ont changé côté serveur (Phase 3 hors-ligne).
 *
 * Le SW envoie un message `AW_DATA_REFRESHED` → App.js le convertit en événement
 * window `aw:data-refreshed` → ce hook rappelle `refetch`.
 *
 * Débounce 400 ms : une même page charge souvent plusieurs tables, on évite
 * ainsi de relancer le fetch plusieurs fois d'affilée.
 *
 * @param {Function} refetch  fonction de rechargement des données de la page
 */
export function useAutoRefresh(refetch) {
  const ref = useRef(refetch)
  ref.current = refetch

  useEffect(() => {
    let timer = null
    const handler = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        try { ref.current?.() } catch (_) {}
      }, 400)
    }
    window.addEventListener('aw:data-refreshed', handler)
    return () => {
      window.removeEventListener('aw:data-refreshed', handler)
      clearTimeout(timer)
    }
  }, [])
}
