// Jetons de design AWprepa : thème d'origine de l'app (voir DESIGN.md).
// Trois couches : primitifs (valeurs brutes) → sémantiques (rôle) → composants.
// S'utilisent dans les objets de styles inline : `import T from '../theme/tokens'`.
// Les couleurs de club (--header-bg, --accent, --chip-bg…) restent des variables
// CSS gérées par ClientThemeContext : on les référence, on ne les remplace pas.

// ── 1. Primitifs ─────────────────────────────────────────────────────────────
const P = {
  yellow500: '#e4f816',
  yellow900: '#727a0b',
  black:     '#333333',
  gray950:   '#1a1a1a',
  gray600:   '#6b7280',
  gray100:   '#f3f4f6',
  gray150:   '#e5e7eb',
  gray50:    '#f5f5f5',
  white:     '#ffffff',
  green700:  '#16a34a',
  red700:    '#dc2626',
  amber700:  '#d97706',
}

// ── 2. Sémantiques ───────────────────────────────────────────────────────────
const color = {
  signal:     P.yellow500,   // actif, sélectionné, texte des boutons principaux
  signalInk:  P.yellow900,   // rare texte d'accent sur fond clair
  ink:        P.black,       // texte principal, bouton principal
  anthracite: P.gray950,     // surfaces sombres
  muted:      P.gray600,     // texte secondaire
  page:       P.gray50,
  card:       P.white,
  soft:       P.gray100,
  line:       P.gray150,
  success:    P.green700,
  danger:     P.red700,
  warning:    P.amber700,
  onDark:      '#ffffff',
  onDarkMuted: 'rgba(255,255,255,0.6)',
  // Couleurs de club (surchargées par ClientThemeContext)
  headerBg:   'var(--header-bg)',
  headerText: 'var(--header-text)',
}

const font = {
  display: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  body:    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

// Tailles en px : athlète 12/14/16/20/28/40, coach 12/13/14/18/24
const size = { xs: 12, sm: 13, md: 14, base: 15, lg: 16, xl: 20, xxl: 24, h1: 28, hero: 40 }

const radius = { control: 10, card: 16, pill: 999 }
const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
const shadow = {
  card:  '0 1px 3px rgba(0,0,0,0.06)',
  float: '0 10px 30px rgba(0,0,0,0.14)',
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
