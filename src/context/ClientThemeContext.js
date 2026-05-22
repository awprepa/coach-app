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
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user
      if (!user) { setTheme(t => ({ ...t, loaded: true })); return }

      // ── Trouver le client (user_id en priorité, email en fallback) ──────────
      let client = null

      const { data: byUserId } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (byUserId?.id) {
        client = byUserId
      } else {
        // fallback par email
        const { data: byEmail } = await supabase
          .from('clients')
          .select('id')
          .eq('email', user.email)
          .maybeSingle()
        client = byEmail
      }

      if (!client?.id) { setTheme(t => ({ ...t, loaded: true })); return }

      // ── Trouver son groupe (.limit(1) pour éviter l'erreur si multi-groupes) ─
      const { data: membres } = await supabase
        .from('groupe_membres')
        .select('groupe_id')
        .eq('client_id', client.id)
        .limit(1)

      const groupeId = membres?.[0]?.groupe_id
      if (!groupeId) { setTheme(t => ({ ...t, loaded: true })); return }

      // ── Charger les couleurs et logo du groupe ───────────────────────────────
      const { data: groupe, error: groupeErr } = await supabase
        .from('groupes')
        .select('nom, couleur, couleur_secondaire, logo_url')
        .eq('id', groupeId)
        .single()

      if (groupeErr || !groupe) {
        console.warn('[ClientTheme] groupe introuvable :', groupeErr)
        setTheme(t => ({ ...t, loaded: true }))
        return
      }

      const accent  = groupe.couleur            || DEFAULT.accent
      const accent2 = groupe.couleur_secondaire || DEFAULT.accent2

      // ── Appliquer les CSS variables sur :root ────────────────────────────────
      document.documentElement.style.setProperty('--accent',  accent)
      document.documentElement.style.setProperty('--accent2', accent2)

      // Couleur barre système mobile
      const metaTheme = document.querySelector('meta[name="theme-color"]')
      if (metaTheme) metaTheme.setAttribute('content', accent)

      setTheme({
        accent,
        accent2,
        logoUrl:  groupe.logo_url || null,
        clubName: groupe.nom      || null,
        loaded:   true,
      })
    } catch (e) {
      console.error('[ClientTheme] erreur chargement thème :', e)
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
