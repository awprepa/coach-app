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

// Parcours construit dans l'ordre : trajets séparés par des changements de direction
// (virages[i] = { a: 180 | 90 | 45, s: 'g' | 'd' } entre le trajet i et le trajet i + 1).
// longueurs[i] : mètres choisis, ou vide = « auto » (les trajets auto se partagent
// ce qui reste de la distance). Si tous les trajets ont une longueur et que le
// parcours est plus court que la distance, il s'enchaîne : en boucle s'il revient
// au départ, sinon en repartant en sens inverse (demi-tour au bout).
const coutVirage = (a, reglages = REGLAGES_DEFAUT) => (a === 180 ? reglages.cdd180 : a === 90 ? reglages.cdd90 : a ? reglages.cdd45 : 0)

export function calculerParcours({ vitesseRef, intensite, effort, virages = [], longueurs = [], sols = [], reglages = REGLAGES_DEFAUT }) {
  if (!(vitesseRef > 0)) return { erreur: 'Renseigne ta vitesse (en km/h).' }
  if (!(effort > 0)) return { erreur: 'Renseigne le temps d’effort.' }
  const pct = intensite > 0 ? intensite : 100
  const vitesse = (vitesseRef / 3.6) * (pct / 100) // m/s
  const n = virages.length + 1
  const fixes = Array.from({ length: n }, (_, i) => (Number(longueurs[i]) > 0 ? Number(longueurs[i]) : null))
  const nbAuto = fixes.filter(l => l == null).length
  const perteVirages = virages.reduce((t, v) => t + coutVirage(v.a, reglages), 0)
  const auSol = i => (sols[i] ? reglages.sol : 0)
  const perteSol = Array.from({ length: n }, (_, i) => auSol(i)).reduce((t, v) => t + v, 0)
  const somme = fixes.reduce((t, l) => t + (l || 0), 0)

  if (nbAuto > 0) {
    const perte = perteVirages + perteSol
    const tempsCourse = effort - perte
    if (tempsCourse <= 0) return { erreur: 'Trop de changements de direction ou de passages au sol pour ce temps d’effort.', perte }
    const distance = vitesse * tempsCourse
    const reste = distance - somme
    if (reste <= 0) return { erreur: `Tes longueurs font déjà ${String(Math.round(somme * 10) / 10).replace('.', ',')} m, plus que les ${String(arrondiDemi(distance)).replace('.', ',')} m à courir. Raccourcis un trajet ou passe-le en auto.`, perte }
    const auto = reste / nbAuto
    return { vitesse, perte, distance: arrondiDemi(distance), longueurs: fixes.map(l => (l == null ? auto : l)), auto: fixes.map(l => l == null), boucle: null }
  }

  // Tous les trajets ont une longueur : on court le parcours jusqu'à la fin de l'effort
  const pts = tracer(fixes, virages)
  const fin = pts[pts.length - 1]
  const ferme = Math.hypot(fin[0], fin[1]) < 0.5
  let cap = 0
  virages.forEach(v => { cap += v.a === 180 ? 180 : (v.s === 'g' ? -1 : 1) * v.a })
  const ecart = ((cap % 360) + 360) % 360
  const angle = ecart > 180 ? 360 - ecart : ecart
  const jonction = ferme ? (angle < 1 ? 0 : angle <= 45 ? reglages.cdd45 : angle <= 90 ? reglages.cdd90 : reglages.cdd180) : reglages.cdd180
  let budget = effort, distance = 0, perte = 0, tours = 0
  for (let garde = 0; budget > 0 && garde < 500; garde++) {
    for (let i = 0; i < n && budget > 0; i++) {
      const t = fixes[i] / vitesse
      if (budget >= t) { budget -= t; distance += fixes[i] } else { distance += budget * vitesse; budget = 0 }
      const c = (i < n - 1 ? coutVirage(virages[i].a, reglages) : 0) + auSol(i)
      if (c > 0 && budget > 0) { const pris = Math.min(c, budget); budget -= pris; perte += pris }
    }
    if (budget > 0) { tours++; const pris = Math.min(jonction, budget); budget -= pris; perte += pris }
  }
  return {
    vitesse, perte, distance: arrondiDemi(distance), longueurs: fixes, auto: fixes.map(() => false),
    boucle: { longueur: somme, tours, reste: arrondiDemi(distance - tours * somme), ferme },
  }
}

// Points du parcours (en mètres) : départ vers le haut, virages vus par le coureur
function tracer(longueurs, virages) {
  let cap = -90, x = 0, y = 0
  const pts = [[0, 0]]
  longueurs.forEach((L, i) => {
    x += L * Math.cos(cap * Math.PI / 180); y += L * Math.sin(cap * Math.PI / 180)
    pts.push([x, y])
    const v = virages[i]
    if (v) cap += v.a === 180 ? 180 : (v.s === 'g' ? -1 : 1) * v.a
  })
  return pts
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
// l'appli, affiché avec SchemaTerrainView) : un passage du parcours, à l'échelle,
// dans l'ordre choisi. Passages au sol : au plot où ils sont placés.
// Terrain de rugby : 0,8 unité de dessin par mètre (courseVmi.ECHELLE.gazon), 70 m × 120 m.
// Parcours trop grand pour le terrain : surface vierge (2 unités par mètre), dézoomée
// juste assez (mêmes tailles que l'éditeur de schémas).
const TERRAIN = { large: 66, long: 116 } // m utilisables (petite marge sous les lignes)
const TAILLES_VIERGE = [100, 150, 200, 300, 400, 600]
// Couleurs des plots, dans l'ordre où on les rencontre (jaune = départ, sans étiquette)
export const COULEURS_PLOTS = ['#f2c94c', '#2f80ed', '#eb5757', '#27ae60', '#f2994a', '#9b51e0', '#56ccf2', '#e84393', '#1a1d21', '#ffffff']
export function genererParcours({ longueurs, virages = [], sols = [] }) {
  const pts = tracer(longueurs, virages)
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
  const larg = Math.max(...xs) - Math.min(...xs), haut = Math.max(...ys) - Math.min(...ys)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const surTerrain = larg <= TERRAIN.large && haut <= TERRAIN.long
  const k = surTerrain ? 0.8 : 2
  const taille = surTerrain ? null : (TAILLES_VIERGE.find(t => Math.max(larg, haut) * k + 12 * t / 100 <= t) || 600)
  const P = pts.map(([a, b]) => ({ x: 50 + (a - cx) * k, y: 50 + (b - cy) * k }))
  // Un plot par emplacement (en navette, on repasse aux mêmes plots), chacun de sa couleur :
  // le trajet se lit « du plot jaune au plot bleu »
  const plots = []
  const plotEn = q => {
    let p = plots.find(o => Math.hypot(o.x - q.x, o.y - q.y) < 0.5)
    if (!p) { p = { id: `p${plots.length}`, x: q.x, y: q.y, color: COULEURS_PLOTS[plots.length % COULEURS_PLOTS.length], label: '' }; plots.push(p) }
    return p
  }
  const parPoint = P.map(plotEn)
  sols.forEach((s, i) => { if (s && parPoint[i + 1]) parPoint[i + 1].sol = true })
  // Une seule distance écrite par paire de plots (aller et retour = même longueur)
  const paires = new Set()
  const arrows = P.slice(0, -1).map((a, i) => {
    const cle = [parPoint[i].id, parPoint[i + 1].id].sort().join('-')
    const deja = paires.has(cle); paires.add(cle)
    return { id: `a${i}`, x1: a.x, y1: a.y, x2: P[i + 1].x, y2: P[i + 1].y, color: '#1a1d21', style: 'plein', mode: 'avant', ...(deja ? { masquerDistance: true } : {}) }
  })
  const schema = surTerrain
    ? { surface: 'gazon', plots, arrows, zones: [] }
    : { surface: 'vierge', ...(taille > 100 ? { taille } : {}), plots, arrows, zones: [] }
  return { schema, surTerrain, couleurs: parPoint.map(p => p.color) }
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
