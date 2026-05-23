import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'

const DEFAULT = {
  accent:   '#333333',
  accent2:  '#e4f816',
  logoUrl:  null,
  clubName: null,
  loaded:   false,
}

const ClientThemeContext = createContext(DEFAULT)

// ── Utilitaires palette ─────────────────────────────────────────────────────

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
}

/** Assombrit une couleur (amount entre 0 et 1) */
function darken(hex, amount = 0.25) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount))
}

/** Mélange avec du blanc pour obtenir un tint très léger */
function lighten(hex, factor = 0.92) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(
    r * (1 - factor) + 255 * factor,
    g * (1 - factor) + 255 * factor,
    b * (1 - factor) + 255 * factor,
  )
}

/** Blanc ou noir selon la luminance du fond */
function textOn(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.45 ? '#111111' : '#ffffff'
}

/**
 * Rend une couleur lisible en tant que TEXTE sur fond blanc/clair.
 * Si la couleur est trop claire (luminance > 0.5), on l'assombrit fortement.
 */
function readableOnLight(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5 ? darken(hex, 0.55) : hex
}

/**
 * Rend une couleur lisible en tant que TEXTE sur fond sombre.
 * Si la couleur est trop sombre (luminance < 0.4), on l'éclaircit fortement.
 */
function readableOnDark(hex) {
  const { r, g, b } = hexToRgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum < 0.4 ? lighten(hex, 0.6) : hex
}

/** Applique la palette complète sur :root */
function applyPalette(primary, secondary) {
  const dark     = darken(primary, 0.28)
  const muted    = lighten(primary, 0.93)   // fond très légèrement teinté
  const onPrim   = textOn(primary)
  const onSec    = textOn(secondary)

  // Le dégradé du header va toujours de primary vers secondary
  // (c'était le comportement original : #333333 → #1f2937)
  const headerBg = `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`

  // Nav : fond uni légèrement assombri
  const navBg = darken(primary, 0.15)

  // Barre décorative (bottom-nav active, titres de section) — la secondaire pure
  const stripe = secondary

  // Versions "lisibles" des couleurs club selon le fond
  const accentFg   = readableOnLight(primary)    // texte accent sur fond blanc
  const accent2Fg  = readableOnLight(secondary)  // texte secondaire sur fond blanc
  const accentFgDk = readableOnDark(primary)     // texte accent sur fond sombre

  const vars = {
    '--accent':         primary,
    '--accent2':        secondary,
    '--accent-dark':    dark,
    '--accent-muted':   muted,
    '--accent-nav':     navBg,
    '--accent-text':    onPrim,
    '--accent-text2':   onSec,
    '--header-bg':      headerBg,
    '--accent-stripe':  stripe,
    '--accent-fg':      accentFg,     // accent lisible sur fond blanc
    '--accent2-fg':     accent2Fg,    // secondaire lisible sur fond blanc
    '--accent-fg-dark': accentFgDk,   // accent lisible sur fond sombre
  }

  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v)
  }

  // Barre système mobile
  const metaTheme = document.querySelector('meta[name="theme-color"]')
  if (metaTheme) metaTheme.setAttribute('content', primary)
}

// ───────────────────────────────────────────────────────────────────────────

export function ClientThemeProvider({ children }) {
  const [theme, setTheme] = useState(DEFAULT)

  useEffect(() => { loadTheme() }, [])

  async function loadTheme() {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user
      if (!user) {
        applyPalette(DEFAULT.accent, DEFAULT.accent2)
        setTheme(t => ({ ...t, loaded: true }))
        return
      }

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
        const { data: byEmail } = await supabase
          .from('clients')
          .select('id')
          .eq('email', user.email)
          .maybeSingle()
        client = byEmail
      }

      if (!client?.id) {
        applyPalette(DEFAULT.accent, DEFAULT.accent2)
        setTheme(t => ({ ...t, loaded: true }))
        return
      }

      // ── Trouver son groupe (.limit(1) pour éviter l'erreur si multi-groupes) ─
      const { data: membres } = await supabase
        .from('groupe_membres')
        .select('groupe_id')
        .eq('client_id', client.id)
        .limit(1)

      const groupeId = membres?.[0]?.groupe_id
      if (!groupeId) {
        applyPalette(DEFAULT.accent, DEFAULT.accent2)
        setTheme(t => ({ ...t, loaded: true }))
        return
      }

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

      applyPalette(accent, accent2)

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
