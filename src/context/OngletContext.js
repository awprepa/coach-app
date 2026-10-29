import { createContext, useContext, useEffect, useRef } from 'react'

// Onglets client gardés ouverts en arrière-plan (voir OngletsClient dans App.js) :
// chaque onglet sait s'il est affiché. Hors onglets, toujours « affiché ».
export const OngletCtx = createContext(true)

export const useOngletActif = () => useContext(OngletCtx)

// Relance `fn` quand on revient sur l'onglet (données à jour, sans écran de chargement)
export function useAuRetourOnglet(fn) {
  const actif = useOngletActif()
  const ref = useRef(fn)
  ref.current = fn
  const avant = useRef(actif)
  useEffect(() => {
    if (actif && !avant.current) ref.current?.()
    avant.current = actif
  }, [actif])
}
