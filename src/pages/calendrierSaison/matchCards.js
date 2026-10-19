// Cartes de match FFR : M1 (carte compacte à partager) et M2 (carte du jour de
// match dans le résumé de semaine). Fond noir, date dans la couleur du club.

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const NUIT = '#161616', NUIT2 = '#232323'

// Raccourcit les noms d'équipes trop longs (affichage seulement : les données
// synchronisées et le classement gardent le nom complet).
const ABREV = [
  [/\bUnion Athl[ée]tique\b/gi, 'UA'], [/\bUnion Sportive\b/gi, 'US'], [/\b[EÉ]toile Sportive\b/gi, 'ES'],
  [/\bAssociation Sportive\b/gi, 'AS'], [/\bSporting Club\b/gi, 'SC'], [/\bStade Olympique\b/gi, 'SO'],
  [/\bRacing Club\b/gi, 'RC'], [/\bRugby Club\b/gi, 'RC'], [/\bAcad[ée]mie\b/gi, 'Acad.'], [/\bEntente\b/gi, 'Ent.'],
]
export function nomCourt(nom, max = 20) {
  if (!nom) return ''
  let n = nom.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim()
  if (n.length <= max) return n
  n = n.replace(/\s+[MU]\d{2}$/i, '')        // catégorie en fin de nom (M16, U18…)
  if (n.length <= max) return n
  n = n.replace(/\s+Rugby$/i, '')             // « Rugby » final
  if (n.length <= max) return n
  for (const [re, ab] of ABREV) { n = n.replace(re, ab); if (n.length <= max) return n }
  return n                                    // sinon : deux lignes au maximum sur la carte
}

// Les logos du site FFR passent par notre relais (api/ffr-logo.js) pour pouvoir
// figurer dans les images exportées.
export function logoSrc(url) {
  if (!url) return null
  return url.includes('monclubhouse.ffr.fr') ? `/api/ffr-logo?u=${encodeURIComponent(url)}` : url
}

const JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.']
const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']

// Toutes les infos d'affichage d'un match FFR. `notreNom` : nom de notre équipe
// (le plus fréquent dans les matchs du groupe), utile quand la FFR ne précise
// pas domicile / extérieur.
export function infosMatch(m, groupe, notreNom) {
  let dom = m.est_domicile
  if (dom == null && notreNom) {
    if (m.equipe_dom === notreNom) dom = true
    else if (m.equipe_ext === notreNom) dom = false
  }
  const notreLogo = groupe?.logo_url || null
  const domicile = { nom: m.equipe_dom, logo: logoSrc(dom === true ? (notreLogo || m.logo_dom) : m.logo_dom) }
  const exterieur = { nom: m.equipe_ext, logo: logoSrc(dom === false ? (notreLogo || m.logo_ext) : m.logo_ext) }
  const joue = m.score_dom != null && m.score_ext != null
  const nous = dom === true ? m.score_dom : dom === false ? m.score_ext : null
  const eux  = dom === true ? m.score_ext : dom === false ? m.score_dom : null
  const resultat = !joue || nous == null ? null : nous > eux ? 'Victoire' : nous < eux ? 'Défaite' : 'Match nul'
  const [y, mo, d] = (m.date_match || '').split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  return {
    domicile, exterieur, joue, resultat,
    lieu: dom === true ? 'À domicile' : dom === false ? 'À l’extérieur' : null,
    jour: JOURS[dt.getDay()], num: d, mois: MOIS[mo - 1],
    heure: m.heure ? String(m.heure).slice(0, 5) : null,
  }
}

function Logo({ src, nom, size, img }) {
  const init = (nom || '?').split(/[\s/-]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.2), background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {src
        ? <img src={src} alt="" crossOrigin="anonymous" style={{ width: img, height: img, objectFit: 'contain', display: 'block' }} />
        : <span style={{ fontSize: size > 50 ? 18 : 13, fontWeight: 900, color: '#333', fontFamily: FONT }}>{init}</span>}
    </div>
  )
}

function DateBox({ info, couleur, compact }) {
  return (
    <div style={{ background: couleur, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: compact ? '10px 0' : 0 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{info.jour}</span>
      <span style={{ fontSize: compact ? 28 : 34, fontWeight: 900, lineHeight: 1 }}>{info.num}</span>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{info.mois}</span>
    </div>
  )
}

const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }

// M1 — carte compacte à partager (une équipe par ligne, score à droite)
export function MatchCardShare({ m, groupe, notreNom, competition, journee }) {
  const info = infosMatch(m, groupe, notreNom)
  const couleur = groupe?.couleur || '#333333'
  const ligne = (eq, pts, autre) => (
    <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) 46px', gap: 10, alignItems: 'center' }}>
      <Logo src={eq.logo} nom={eq.nom} size={38} img={31} />
      <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, ...clamp2 }}>{nomCourt(eq.nom)}</span>
      <span style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: info.joue && pts < autre ? 'rgba(255,255,255,.45)' : '#fff' }}>
        {info.joue ? pts : ''}
      </span>
    </div>
  )
  const titre = [competition, journee ? `Journée ${journee}` : null].filter(Boolean).join(' · ')
  return (
    <div style={{ width: 380, display: 'grid', gridTemplateColumns: '78px 1fr', borderRadius: 14, overflow: 'hidden', color: '#fff', fontFamily: FONT, background: NUIT }}>
      <DateBox info={info} couleur={couleur} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {titre && <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.62)' }}>{titre}</span>}
        {ligne(info.domicile, m.score_dom, m.score_ext)}
        {ligne(info.exterieur, m.score_ext, m.score_dom)}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,.14)', paddingTop: 9 }}>
          {info.joue
            ? <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{info.resultat || 'Terminé'}</span>
            : <span style={{ fontSize: 24, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{info.heure || 'Heure à venir'}</span>}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.72)' }}>{info.lieu || ''}</span>
        </div>
      </div>
    </div>
  )
}

// M2 — carte du jour de match dans le résumé de semaine (logos face à face,
// coup d'envoi ou score en grand dessous)
export function MatchCardWeek({ m, groupe, notreNom, competition, journee }) {
  const info = infosMatch(m, groupe, notreNom)
  const couleur = groupe?.couleur || '#333333'
  const cote = eq => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', minWidth: 0 }}>
      <Logo src={eq.logo} nom={eq.nom} size={72} img={58} />
      <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2, ...clamp2 }}>{nomCourt(eq.nom)}</span>
    </div>
  )
  return (
    <div style={{ width: '100%', background: NUIT, color: '#fff', borderRadius: 16, overflow: 'hidden', fontFamily: FONT }}>
      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr' }}>
        <DateBox info={info} couleur={couleur} compact />
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, background: NUIT2 }}>
          <b style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,.75)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{competition || 'Match'}</b>
          {journee && <span style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', fontWeight: 600 }}>Journée {journee}</span>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'start', gap: 4, padding: '22px 10px 20px' }}>
        {cote(info.domicile)}
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.55)', paddingTop: 26 }}>contre</span>
        {cote(info.exterieur)}
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,.14)', padding: '14px 12px 18px', textAlign: 'center' }}>
        <small style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {info.joue ? (info.resultat || 'Score final') : 'Coup d’envoi'}
        </small>
        <b style={{ display: 'block', fontSize: 34, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginTop: 2 }}>
          {info.joue ? `${m.score_dom} – ${m.score_ext}` : (info.heure || 'À venir')}
        </b>
        {info.lieu && <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.72)', marginTop: 2 }}>{info.lieu}</span>}
      </div>
    </div>
  )
}
