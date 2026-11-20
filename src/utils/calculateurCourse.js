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
