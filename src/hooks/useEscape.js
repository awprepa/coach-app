import { useEffect } from 'react'

// Ferme une fenêtre modale avec la touche Échap.
export default function useEscape(onEscape) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onEscape() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onEscape])
}
