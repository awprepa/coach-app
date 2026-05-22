import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const DEFAULT = {
  accent:   '#e4f816',
  accent2:  '#6b7280',
  logoUrl:  null,
  clubName: null,
  loaded:   false,
}

const ClientThemeContext = createContext(DEFAULT)

export function ClientThemeProvider({ children }) {
  const [theme, setTheme] = useState(DEFAULT)

  useEffect(() => { loadTheme() }, [])

  async function loadTheme() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { setTheme(t => ({ ...t, loaded: true })); return }

      // Récupérer le client
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!client?.id) { setTheme(t => ({ ...t, loaded: true })); return }

      // Trouver son groupe
      const { data: membre } = await supabase
        .from('groupe_membres')
        .select('groupe_id')
        .eq('client_id', client.id)
        .maybeSingle()

      if (!membre?.groupe_id) { setTheme(t => ({ ...t, loaded: true })); return }

      // Charger les couleurs et logo du groupe
      const { data: groupe } = await supabase
        .from('groupes')
        .select('nom, couleur, couleur_secondaire, logo_url')
        .eq('id', membre.groupe_id)
        .single()

      if (!groupe) { setTheme(t => ({ ...t, loaded: true })); return }

      const accent  = groupe.couleur            || DEFAULT.accent
      const accent2 = groupe.couleur_secondaire || DEFAULT.accent2

      // Appliquer les CSS variables sur :root → tout l'app les hérite
      document.documentElement.style.setProperty('--accent',  accent)
      document.documentElement.style.setProperty('--accent2', accent2)

      // Couleur de la barre système mobile
      const metaTheme = document.querySelector('meta[name="theme-color"]')
      if (metaTheme) metaTheme.setAttribute('content', accent)

      setTheme({
        accent,
        accent2,
        logoUrl:  groupe.logo_url || null,
        clubName: groupe.nom      || null,
        loaded:   true,
      })
    } catch {
      setTheme(t => ({ ...t, loaded: true }))
    }
  }

  return (
    <ClientThemeContext.Provider value={theme}>
      {children}
    </ClientThemeContext.Provider>
  )
}

export function useClientTheme() {
  return useContext(ClientThemeContext)
}
