import { REGLAGES_DEFAUT, repereIntensite, arrondiDemi } from './courseVmi'

// Calculateur de course intermittente (page publique /calculateur et
// /client/calculateur). Même principe que les intermittents de l'appli
// (utils/intermittents.js) : à la vitesse cible (VMI ou VMA × % d'intensité),
// on retire du temps d'effort le temps perdu dans les changements de direction
// et les passages au sol (valeurs validées par Arthur le 20/10/2026), puis on
// en déduit la distance à courir.

export const FORMATS_COURSE = [
  { nom: '30-30', effort: 30, recup: 30 },
  { nom: '15-15', effort: 15, recup: 15 },
  { nom: '10-20', effort: 10, recup: 20 },
  { nom: '30-15', effort: 30, recup: 15 },
  { nom: '45-15', effort: 45, recup: 15 },
  { nom: '20-20', effort: 20, recup: 20 },
]

// Intensité conseillée selon la référence :
// - VMI (vitesse finale du 30-15 IFT) : fourchettes de Buchheit selon la durée de l'effort
// - VMA : le 30-30 classique se court à 100 % de VMA (Billat) ; pas de fourchette automatique
export function intensiteConseillee(reference, effort) {
  if (reference === 'vmi') return repereIntensite(effort)
  return effort > 0 ? { min: 100, max: 100, conseil: 100 } : null
}

export function calculerCourse({ vitesseRef, intensite, effort, demiTours = 0, virages90 = 0, virages45 = 0, sol = 0, reglages = REGLAGES_DEFAUT }) {
  if (!(vitesseRef > 0)) return { erreur: 'Renseigne ta vitesse (en km/h).' }
  if (!(effort > 0)) return { erreur: 'Renseigne le temps d’effort.' }
  const pct = intensite > 0 ? intensite : 100
  const vitesse = (vitesseRef / 3.6) * (pct / 100) // m/s
  const perteDemiTours = demiTours * reglages.cdd180
  const perteVirages = virages90 * reglages.cdd90 + virages45 * reglages.cdd45
  const perteSol = sol * reglages.sol
  const perte = perteDemiTours + perteVirages + perteSol
  const tempsCourse = effort - perte
  if (tempsCourse <= 0) return { erreur: 'Trop de changements de direction ou de passages au sol pour ce temps d’effort.', perte }
  const distance = vitesse * tempsCourse
  const distanceDroite = vitesse * effort // même effort sans rien qui ralentit
  // Navette simple (que des demi-tours) : on sait où poser les plots
  const navette = virages90 === 0 && virages45 === 0
  const ligne = navette ? distance / (demiTours + 1) : null
  return {
    vitesse, vitesseKmh: vitesse * 3.6, perte, perteDemiTours, perteVirages, perteSol, tempsCourse,
    distance: arrondiDemi(distance), distanceDroite: arrondiDemi(distanceDroite),
    navette, ligne: ligne != null ? arrondiDemi(ligne) : null, trajets: demiTours + 1,
  }
}

// Volume et durée de la séance
export function calculerSeance({ distance, effort, recup, reps, series, recupSeriesMin }) {
  const r = reps > 0 ? reps : 0
  const s = series > 0 ? series : 1
  const volume = Math.round(distance * r * s)
  const dureeSec = s * r * (effort + recup) + Math.max(0, s - 1) * (recupSeriesMin || 0) * 60
  return { volume, dureeMin: Math.round(dureeSec / 60), repsTotal: r * s }
}

export { REGLAGES_DEFAUT }

// Schéma du parcours sur un terrain de rugby (même format que les schémas de
// l'appli, affiché avec SchemaTerrainView) : trajets de même longueur, dans
// l'ordre demi-tours, virages à 90°, virages à 45° (les virages alternent
// gauche / droite pour rester compacts). Passages au sol : aux plots de
// changement de direction, puis à l'arrivée, puis au départ.
// Terrain de rugby : 0,8 unité de dessin par mètre (courseVmi.ECHELLE.gazon), 70 m × 120 m.
// Parcours trop grand pour le terrain : surface vierge (2 unités par mètre), dézoomée
// juste assez (mêmes tailles que l'éditeur de schémas).
const TERRAIN = { large: 66, long: 116 } // m utilisables (petite marge sous les lignes)
const TAILLES_VIERGE = [100, 150, 200, 300, 400, 600]
export function genererParcours({ distance, demiTours = 0, virages90 = 0, virages45 = 0, sol = 0 }) {
  const virages = [...Array(demiTours).fill(180), ...Array(virages90).fill(90), ...Array(virages45).fill(45)]
  const n = virages.length + 1
  const L = distance / n
  let cap = -90, x = 0, y = 0, cote = 1
  const pts = [[0, 0]]
  for (let i = 0; i < n; i++) {
    x += L * Math.cos(cap * Math.PI / 180); y += L * Math.sin(cap * Math.PI / 180)
    pts.push([x, y])
    const v = virages[i]
    if (v === 180) cap += 180
    else if (v) { cap += cote * v; cote = -cote }
  }
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
  const larg = Math.max(...xs) - Math.min(...xs), haut = Math.max(...ys) - Math.min(...ys)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const surTerrain = larg <= TERRAIN.large && haut <= TERRAIN.long
  const k = surTerrain ? 0.8 : 2
  const taille = surTerrain ? null : (TAILLES_VIERGE.find(t => Math.max(larg, haut) * k + 12 * t / 100 <= t) || 600)
  const P = pts.map(([a, b]) => ({ x: 50 + (a - cx) * k, y: 50 + (b - cy) * k }))
  // Un plot par emplacement (en navette, on repasse aux mêmes plots)
  const plots = []
  const plotEn = (q, couleur, label) => {
    let p = plots.find(o => Math.hypot(o.x - q.x, o.y - q.y) < 0.5)
    if (!p) { p = { id: `p${plots.length}`, x: q.x, y: q.y, color: couleur, label: '' }; plots.push(p) }
    if (label && !p.label.includes(label)) p.label = p.label ? `${p.label} · ${label}` : label
    return p
  }
  plotEn(P[0], '#f2c94c', 'Départ')
  P.slice(1, -1).forEach(q => plotEn(q, '#2f80ed', ''))
  plotEn(P[P.length - 1], '#eb5757', 'Arrivée')
  const ordreSol = [...P.slice(1, -1), P[P.length - 1], P[0]]
  for (let i = 0; i < Math.min(sol, ordreSol.length); i++) plotEn(ordreSol[i]).sol = true
  const arrows = P.slice(0, -1).map((a, i) => ({ id: `a${i}`, x1: a.x, y1: a.y, x2: P[i + 1].x, y2: P[i + 1].y, color: '#1a1d21', style: 'plein', mode: 'avant' }))
  const schema = surTerrain
    ? { surface: 'gazon', plots, arrows, zones: [] }
    : { surface: 'vierge', ...(taille > 100 ? { taille } : {}), plots, arrows, zones: [] }
  return { schema, surTerrain, trajet: arrondiDemi(L), trajets: n }
}

// Difficulté de la séance : modèle de fatigue simulé répétition par répétition
// (« réserve » anaérobie D′ qui se vide à chaque effort au-dessus d'une vitesse
// critique et se recharge pendant la récupération, comme le W′bal de Skiba).
// Calé sur 2 études d'intermittents en récupération passive, en % de VMA :
//   - 15-15 à 120 % de VMA : épuisement après 745 s (Dupont et al., Can J Appl Physiol 2004) ;
//   - 15-15 : la vitesse tenable « sans fin » est d'environ 106 % de VMA (Dupont, Blondel, Billat, Berthoin 1999).
// Résultat du calage : vitesse critique 77 % de VMA, réserve = 7 min à 100 % de VMA en continu
// (Billat : 4 à 11 min), recharge avec une constante de 325 s (Skiba : environ 360 s au repos).
// VMI -> VMA : VMA ≈ VMI / 1,15 (30-15 IFT 18,7 km/h contre 16,3 km/h sur tapis, JSSM).
// Changements de direction et passages au sol : le temps perdu compte comme de l'effort
// (correction de Buchheit), plus un surcoût de 50 % pour les relances (estimation AWprepa).
// Niveau = part de la réserve vidée au pire moment de la séance (la perception de l'effort
// augmente avec la part du temps limite écoulée) ; réserve vide = séance impossible.
const VITESSE_CRITIQUE = 0.77
const RESERVE = (1 - VITESSE_CRITIQUE) * 420 // en « VMA × s »
const RECHARGE_S = 325
const VMI_SUR_VMA = 1.15
const SURCOUT_RELANCE = 0.5

export const NIVEAUX_DIFFICULTE = ['Légère', 'Modérée', 'Difficile', 'Très difficile', 'Impossible']

export function evaluerSeance({ reference, intensite, effort, recup, reps, series, recupSeriesMin, perte = 0 }) {
  if (!(intensite > 0) || !(effort > 0) || !(reps > 0)) return null
  const v = (intensite / 100) * (reference === 'vmi' ? VMI_SUR_VMA : 1) // en fraction de VMA
  const depense = Math.max(0, (v - VITESSE_CRITIQUE) * effort + SURCOUT_RELANCE * v * Math.min(perte, effort))
  const recharge = t => 1 - Math.exp(-Math.max(0, t) / RECHARGE_S)
  let reserve = RESERVE, mini = RESERVE, n = 0
  const nbSeries = Math.max(1, Math.round(series) || 1)
  for (let s = 0; s < nbSeries; s++) {
    for (let r = 0; r < reps; r++) {
      reserve -= depense; n++
      if (reserve < 0) return { niveau: 4, libelle: NIVEAUX_DIFFICULTE[4], repetitionEpuisement: n, part: 1 }
      mini = Math.min(mini, reserve)
      reserve += (RESERVE - reserve) * recharge(recup)
    }
    reserve += (RESERVE - reserve) * recharge((recupSeriesMin || 0) * 60)
  }
  const part = 1 - mini / RESERVE
  const niveau = part < 0.35 ? 0 : part < 0.55 ? 1 : part < 0.75 ? 2 : 3
  return { niveau, libelle: NIVEAUX_DIFFICULTE[niveau], part }
}
