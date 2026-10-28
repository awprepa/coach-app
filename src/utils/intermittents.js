import { echelleDe, REGLAGES_DEFAUT, arrondiDemi, metresFleche } from './courseVmi'

// Intermittents prédéfinis (30-30, 15-15…) : à partir du format, du nombre de
// changements de direction (des demi-tours, en navette entre 2 plots), de
// l'intensité et de la VMI, calcule la distance d'une ligne et génère le schéma
// (plots, flèches, réglage de course) prêt pour SchemaTerrainEditor.

export const FORMATS = [
  { nom: '30-30', effort: 30, recup: 30 },
  { nom: '15-15', effort: 15, recup: 15 },
  { nom: '10-20', effort: 10, recup: 20 },
  { nom: '30-15', effort: 30, recup: 15 },
  { nom: '45-15', effort: 45, recup: 15 },
  { nom: '20-20', effort: 20, recup: 20 },
]

// Longueur jouable : terrain de rugby 120 m (en-buts compris) ; fond vierge,
// jusqu'au dézoom maximal (600 unités à 2 u/m, moins la marge)
const LONGUEUR_MAX = { gazon: 115, vierge: 270 }
const TAILLES_VIERGE = [100, 150, 200, 300, 400, 600]

// Effort / récup en secondes, écrit 15″/15″
export const formatIR = (effort, recup) => `${effort}″/${recup}″`
// Noms de blocs déjà créés (« 15-15 · 95 % VMI ») au même format
export const nomIR = nom => (nom || '').replace(/\b(\d+)-(\d+)\b/, '$1″/$2″')

// Deux couleurs de plots pour qu'on ne confonde pas le départ et le demi-tour
export const PLOTS = {
  depart: { color: '#f2c94c', nom: 'jaune' },
  demiTour: { color: '#2f80ed', nom: 'bleu' },
}

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// Distance d'une ligne de navette (m) et vérifications
export function calculerIntermittent({ effort, cdd, intensite, vmi, surface = 'gazon', reglages = REGLAGES_DEFAUT }) {
  if (!(effort > 0)) return { erreur: 'Renseigne le temps d’effort.' }
  if (!(vmi > 0)) return { erreur: 'Renseigne la VMI du joueur.' }
  const pct = intensite > 0 ? intensite : 100
  const vitesse = (vmi / 3.6) * (pct / 100) // m/s
  const tempsCourse = effort - cdd * (reglages.cdd180 ?? REGLAGES_DEFAUT.cdd180)
  if (tempsCourse <= 0) return { erreur: 'Trop de changements de direction pour ce temps d’effort.' }
  const total = vitesse * tempsCourse
  const ligne = total / (cdd + 1)
  const tropLong = ligne > LONGUEUR_MAX[surface]
  return { vitesse, total, ligne, tropLong }
}

export function libelleIntermittent({ effort, recup, cdd, intensite, reps, series, recupSeries }, ligne) {
  const m = v => String(arrondiDemi(v)).replace('.', ',')
  const navette = cdd > 0 ? `plots à ${m(ligne)} m, ${cdd + 1} trajets` : `ligne droite de ${m(ligne)} m`
  const total = ligne * (cdd + 1) * (reps || 0) * (series > 1 ? series : 1)
  return [
    `${series > 1 ? `${series} × ` : ''}${reps ? `${reps} × ` : ''}${formatIR(effort, recup)} à ${intensite} % VMI`,
    navette,
    total > 0 ? `${Math.round(total).toLocaleString('fr-FR')} m au total` : null,
    series > 1 && recupSeries ? `${recupSeries} min entre les séries` : null,
  ].filter(Boolean).join(' · ')
}

// Schéma : 2 plots, une flèche par ligne, sens alterné (demi-tours)
export function genererSchema({ effort, recup, cdd, intensite, vmi, reps, surface = 'gazon' }, ligne) {
  const e = echelleDe(surface)
  const L = ligne * e
  let taille
  let A, B
  if (surface === 'vierge') {
    // Dézoom juste suffisant pour que la navette tienne dans le dessin
    taille = TAILLES_VIERGE.find(t => L + 9 * t / 100 <= t) || TAILLES_VIERGE[TAILLES_VIERGE.length - 1]
    A = { x: 50 - L / 2, y: 50 }
    B = { x: 50 + L / 2, y: 50 }
  } else {
    // Dans la longueur du terrain, centrée sur la ligne médiane
    A = { x: 50, y: 50 + L / 2 }
    B = { x: 50, y: 50 - L / 2 }
  }
  const p1 = { id: uid('p'), x: A.x, y: A.y, color: PLOTS.depart.color, label: 'Départ' }
  const p2 = { id: uid('p'), x: B.x, y: B.y, color: PLOTS.demiTour.color, label: cdd > 0 ? 'Demi-tour' : 'Arrivée' }
  const arrows = Array.from({ length: cdd + 1 }, (_, i) => {
    const [d, f] = i % 2 === 0 ? [A, B] : [B, A]
    return { id: uid('a'), x1: d.x, y1: d.y, x2: f.x, y2: f.y, color: '#1a1d21', style: 'plein', mode: 'avant' }
  })
  return {
    surface: surface === 'vierge' ? 'vierge' : 'gazon',
    ...(taille && taille > 100 ? { taille } : {}),
    plots: [p1, p2],
    arrows,
    zones: [],
    course: { effort, intensite, reps: reps || null, recup, vmi },
  }
}

// Lecture côté joueur d'un bloc réglé à la VMI. Navette (2 plots) : distance
// recalculée avec la VMI du schéma, sinon celle du joueur, sinon mesurée sur
// le dessin. `tTrajet` : secondes de course par trajet (demi-tours déduits).
export function lireIntermittent(schema, vmiJoueur) {
  const c = schema?.course
  if (!(c?.effort > 0)) return null
  const arrows = schema.arrows || []
  const navette = (schema.plots || []).length === 2 && arrows.length > 0
  const cdd = navette ? arrows.length - 1 : 0
  const surface = schema.surface === 'vierge' ? 'vierge' : 'gazon'
  const vmi = c.vmi || vmiJoueur || null
  let ligne = null, vitesse = null
  if (navette && vmi) {
    const r = calculerIntermittent({ effort: c.effort, cdd, intensite: c.intensite, vmi, surface })
    if (!r.erreur) { ligne = r.ligne; vitesse = r.vitesse }
  }
  if (navette && ligne == null) ligne = metresFleche(arrows[0], surface)
  return {
    effort: c.effort, recup: c.recup || 0, reps: c.reps || 1, intensite: c.intensite || 100,
    navette, cdd, ligne, vitesse, vmi,
    total: ligne != null ? ligne * (cdd + 1) : null,
    tTrajet: (c.effort - cdd * REGLAGES_DEFAUT.cdd180) / (cdd + 1),
  }
}

// Instants (s depuis le début de l'effort) où le joueur passe chaque plot de demi-tour
export function passagesPlots({ cdd, tTrajet }) {
  return Array.from({ length: cdd }, (_, i) => (i + 1) * tTrajet + i * REGLAGES_DEFAUT.cdd180)
}
