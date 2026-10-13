// Jetons de design AWprepa, direction « Ligne de touche » (voir DESIGN.md).
// Trois couches : primitifs (valeurs brutes) → sémantiques (rôle) → composants.
// S'utilisent dans les objets de styles inline : `import T from '../theme/tokens'`.
// Les couleurs de club (--header-bg, --accent, --chip-bg…) restent des variables
// CSS gérées par ClientThemeContext : on les référence, on ne les remplace pas.

// ── 1. Primitifs ─────────────────────────────────────────────────────────────
const P = {
  yellow500: '#e4f816',
  yellow900: '#5c6300',
  black:     '#141414',
  gray950:   '#1c1d1f',
  gray600:   '#55595f',
  gray100:   '#efefeb',
  gray150:   '#e3e3de',
  gray50:    '#f4f4f1',
  white:     '#ffffff',
  green700:  '#13753a',
  red700:    '#b42318',
  amber700:  '#a15c00',
}

// ── 2. Sémantiques ───────────────────────────────────────────────────────────
const color = {
  signal:     P.yellow500,   // actif, sélectionné, texte des boutons principaux
  signalInk:  P.yellow900,   // rare texte d'accent sur fond clair
  ink:        P.black,       // texte principal, bouton principal
  anthracite: P.gray950,     // surfaces sombres
  muted:      P.gray600,     // texte secondaire (7:1 sur blanc)
  page:       P.gray50,
  card:       P.white,
  soft:       P.gray100,
  line:       P.gray150,
  success:    P.green700,
  danger:     P.red700,
  warning:    P.amber700,
  onDark:      '#f4f4f1',
  onDarkMuted: '#b5b8bd',
  // Couleurs de club (surchargées par ClientThemeContext)
  headerBg:   'var(--header-bg)',
  headerText: 'var(--header-text)',
}

const font = {
  display: '"Archivo Narrow", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  body:    '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

// Tailles en px : athlète 12/14/16/20/28/40, coach 12/13/14/18/24
const size = { xs: 12, sm: 13, md: 14, base: 15, lg: 16, xl: 20, xxl: 24, h1: 28, hero: 40 }

const radius = { control: 10, card: 16, pill: 999 }
const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
const shadow = {
  card:  '0 1px 2px rgb(20 20 20 / .07)',
  float: '0 10px 30px rgb(20 20 20 / .14)',
}
const touch = 44

// ── 3. Composants ────────────────────────────────────────────────────────────
const card = {
  background: color.card, borderRadius: radius.card, padding: space.lg,
  boxShadow: shadow.card,
}
const label = {
  fontFamily: font.body, fontSize: size.sm, fontWeight: 600, color: color.muted, margin: 0,
}
const btnPrimary = {
  height: 52, width: '100%', border: 'none', borderRadius: radius.control,
  background: color.ink, color: color.signal,
  fontFamily: font.body, fontSize: size.lg, fontWeight: 700,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer',
}
const btnSecondary = {
  minHeight: touch, width: '100%', borderRadius: radius.control,
  background: 'transparent', color: color.ink, border: `1.5px solid ${color.line}`,
  fontFamily: font.body, fontSize: size.base, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
}
const num = { fontFamily: font.display, fontVariantNumeric: 'tabular-nums' }

const T = { P, color, font, size, radius, space, shadow, touch, card, label, btnPrimary, btnSecondary, num }
export default T
