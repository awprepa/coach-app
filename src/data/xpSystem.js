// ─── Système de niveaux / XP ────────────────────────────────────────────────
//
// Deux niveaux distincts des rangs de force (Fer→Champion, basés sur le 1RM) :
// ceux-ci mesurent l'effort cumulé dans le temps, pas la force actuelle.
//
// XP par série = répétitions × (poids de la série ÷ poids de référence) × 10
// Le poids de référence est CONFIRMÉ (pas juste le record instantané) : un
// nouveau record ne devient la référence qu'après avoir été refait lors d'une
// 2e séance différente. Entre-temps, les séries à ce nouveau poids rapportent
// un bonus (ratio > 100%) car comparées à l'ancienne référence, plus basse.
// Pour les exercices au poids du corps (pompes, tractions non lestées), le
// "poids" de la série est remplacé par le poids de corps du client s'il est
// nul ou absent.

const XP_BASE = 10
const RATIO_CAP = 1.5 // évite qu'une série aberrante (erreur de saisie) ne génère un pic d'XP

/** Calcule l'XP total généré par l'historique complet d'un exercice.
 *  allSets : [{ date, poids, reps }], dans n'importe quel ordre.
 *  bodyweightKg : utilisé comme poids de série par défaut si poids est 0/absent
 *  (exercices au poids du corps). */
export function computeExerciseXp(allSets, bodyweightKg) {
  if (!allSets?.length) return 0

  const effectiveSets = allSets.map(s => ({
    ...s,
    poids: s.poids > 0 ? s.poids : (bodyweightKg || 0),
  })).filter(s => s.poids > 0 && s.reps > 0)
  if (!effectiveSets.length) return 0

  // Regroupe par séance (date)
  const byDate = {}
  effectiveSets.forEach(s => {
    ;(byDate[s.date] ||= []).push(s)
  })
  const dates = Object.keys(byDate).sort()

  let confirmedRef = null
  let pendingWeight = null
  let pendingCount = 0
  let totalXp = 0

  dates.forEach(date => {
    const setsThisDate = byDate[date]
    const sessionMax = Math.max(...setsThisDate.map(s => s.poids))
    if (confirmedRef === null) confirmedRef = sessionMax // toute première séance = référence initiale

    // XP de cette séance, calculé avec la référence CONFIRMÉE avant mise à jour
    setsThisDate.forEach(s => {
      const ratio = Math.min(RATIO_CAP, s.poids / confirmedRef)
      totalXp += s.reps * ratio * XP_BASE
    })

    // Mise à jour de la référence après coup (ne s'applique qu'aux séances suivantes)
    if (sessionMax > confirmedRef) {
      if (pendingWeight !== null && sessionMax >= pendingWeight) {
        pendingCount++
      } else {
        pendingWeight = sessionMax
        pendingCount = 1
      }
      if (pendingCount >= 2) {
        confirmedRef = pendingWeight
        pendingWeight = null
        pendingCount = 0
      }
    }
  })

  return Math.round(totalXp)
}

/** XP nécessaire pour passer du niveau `level` à `level + 1`. */
function xpStep(level) {
  return Math.round(40 * Math.pow(level, 1.4))
}

/** Convertit un total d'XP en {level, xpIntoLevel, xpForNextLevel}. */
export function levelFromXp(totalXp) {
  let level = 1
  let xp = Math.max(0, totalXp || 0)
  while (true) {
    const need = xpStep(level)
    if (xp < need) return { level, xp: Math.round(xp), xpForNextLevel: need, totalXp: Math.round(totalXp || 0) }
    xp -= need
    level++
  }
}
