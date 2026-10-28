import { useState, useCallback } from 'react'
import { supabase } from '../supabase'

// useState qui garde sa dernière valeur en mémoire quand on quitte la page :
// en revenant sur un onglet, la page s'affiche aussitôt avec ses dernières
// données (au lieu d'un écran de chargement) pendant qu'elle se met à jour.
// Mémoire vidée à chaque changement de compte.

const memoire = new Map()
let compte = null
supabase.auth.onAuthStateChange((_e, session) => {
  const id = session?.user?.id || null
  if (id !== compte) { memoire.clear(); compte = id }
})

export default function useEtatMemorise(cle, initial) {
  const [valeur, setValeur] = useState(() => (memoire.has(cle) ? memoire.get(cle) : initial))
  const set = useCallback(v => {
    setValeur(prec => {
      const suivante = typeof v === 'function' ? v(prec) : v
      memoire.set(cle, suivante)
      return suivante
    })
  }, [cle])
  return [valeur, set]
}
