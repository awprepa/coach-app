// Standards de force par ratio (charge soulevée / poids de corps), inspirés des
// tables communément utilisées dans le milieu force/musculation (type Strength Level).
// Pas de source officielle unique — ce sont des repères, pas des vérités absolues.
// Seuil = ratio à partir duquel le rang est atteint. En dessous du premier seuil : "Débutant".
// Chaque table a 5 seuils, pour les 5 rangs au-dessus de "Débutant" (Novice → Exceptionnel).

export const RANKS = ['Débutant', 'Novice', 'Intermédiaire', 'Avancé', 'Élite', 'Exceptionnel']

const STANDARDS = {
  developpe_couche: {
    homme: [0.5, 0.75, 1.0, 1.5, 1.75],
    femme: [0.25, 0.5, 0.75, 1.0, 1.25],
  },
  squat: {
    homme: [0.75, 1.0, 1.5, 2.0, 2.5],
    femme: [0.5, 0.75, 1.25, 1.75, 2.0],
  },
  souleve_de_terre: {
    homme: [1.0, 1.25, 1.75, 2.25, 2.75],
    femme: [0.75, 1.0, 1.5, 2.0, 2.25],
  },
  front_squat: {
    homme: [0.65, 0.85, 1.25, 1.7, 2.1],
    femme: [0.4, 0.6, 1.05, 1.5, 1.7],
  },
  developpe_militaire: {
    homme: [0.35, 0.55, 0.8, 1.05, 1.3],
    femme: [0.2, 0.3, 0.45, 0.6, 0.75],
  },
  rowing: {
    homme: [0.5, 0.75, 1.0, 1.35, 1.6],
    femme: [0.25, 0.4, 0.6, 0.85, 1.05],
  },
  hip_thrust: {
    homme: [1.0, 1.5, 2.25, 3.0, 3.5],
    femme: [1.0, 1.5, 2.0, 2.75, 3.25],
  },
}

// excludeKeywords : variantes qui ne sont pas comparables au mouvement de référence
// (charge non standard — ex. haltères, où le poids saisi est celui d'un seul haltère
// et ne correspond pas à la charge totale à la barre) → exclues du calcul de rang.
const DEFAULT_EXCLUDE = ['haltère', 'haltere', 'dumbbell', '(h)', 'smith']

export const BENCHMARK_EXERCISES = [
  { key: 'developpe_couche',    label: 'Développé couché',   keywords: ['développé couché', 'developpe couche', 'bench'], excludeKeywords: DEFAULT_EXCLUDE },
  { key: 'squat',                label: 'Squat',               keywords: ['squat'], excludeKeywords: [...DEFAULT_EXCLUDE, 'front', 'gobelet', 'goblet', 'box', 'zercher'] },
  { key: 'souleve_de_terre',    label: 'Soulevé de terre',    keywords: ['soulevé de terre', 'souleve de terre', 'deadlift', 'sdt'], excludeKeywords: [...DEFAULT_EXCLUDE, 'jambes tendues', 'roumain'] },
  { key: 'front_squat',          label: 'Front Squat',         keywords: ['front squat'], excludeKeywords: DEFAULT_EXCLUDE },
  { key: 'developpe_militaire', label: 'Développé militaire', keywords: ['développé militaire', 'developpe militaire', 'dev militaire', 'overhead', 'ohp'], excludeKeywords: DEFAULT_EXCLUDE },
  { key: 'rowing',               label: 'Rowing barre',        keywords: ['rowing', 'pendlay'], excludeKeywords: [...DEFAULT_EXCLUDE, 'unilat'] },
  { key: 'hip_thrust',           label: 'Hip Thrust',          keywords: ['hip thrust'], excludeKeywords: [...DEFAULT_EXCLUDE, 'unilat'] },
]

// Retrouve la clé de standard pour un nom d'exercice libre, ou null si non reconnu.
export function matchBenchmarkExercise(nom) {
  const n = (nom || '').toLowerCase()
  const found = BENCHMARK_EXERCISES.find(ex =>
    ex.keywords.some(k => n.includes(k)) && !(ex.excludeKeywords || []).some(k => n.includes(k))
  )
  return found ? found.key : null
}

// Calcule le rang atteint pour un 1RM donné, + ce qu'il reste à soulever pour le rang suivant.
// Retourne null si les données nécessaires (poids de corps, sexe, exercice reconnu) manquent.
export function computeRank(exerciseKey, oneRM, bodyweightKg, sexe) {
  if (!exerciseKey || !oneRM || !bodyweightKg || !sexe) return null
  const table = STANDARDS[exerciseKey]?.[sexe]
  if (!table) return null

  const ratio = oneRM / bodyweightKg
  let rankIndex = 0 // 0 = Débutant
  for (let i = 0; i < table.length; i++) {
    if (ratio >= table[i]) rankIndex = i + 1
  }

  const rank = RANKS[rankIndex]
  const isMax = rankIndex >= table.length // déjà au-delà du dernier seuil (Exceptionnel)
  const nextThresholdKg = isMax ? null : Math.round(table[rankIndex] * bodyweightKg * 2) / 2
  const kgToNextRank = isMax ? null : Math.round((nextThresholdKg - oneRM) * 2) / 2

  return {
    rank,
    rankIndex,
    ratio,
    nextRank: isMax ? null : RANKS[rankIndex + 1],
    nextThresholdKg,
    kgToNextRank,
    isMax,
  }
}

// Barème complet : à partir de combien de kg chaque rang commence, pour ce poids de corps.
export function getBareme(exerciseKey, bodyweightKg, sexe) {
  const table = STANDARDS[exerciseKey]?.[sexe]
  if (!table || !bodyweightKg) return null
  return RANKS.slice(1).map((rank, i) => ({
    rank,
    kg: Math.round(table[i] * bodyweightKg * 2) / 2,
  }))
}

// Percentile approximatif dans la population générale des pratiquants de force,
// par interpolation entre les paliers (repères communément admis pour ce type de
// barème : Novice ≈ 20e percentile, Intermédiaire ≈ 50e, Avancé ≈ 80e, Élite ≈ 95e,
// Exceptionnel ≈ 99e). Retourne une fourchette [bas, haut] plutôt qu'un chiffre unique.
const PERCENTILE_ANCHORS = [0, 20, 50, 80, 95, 99]

export function estimatePercentile(exerciseKey, oneRM, bodyweightKg, sexe) {
  if (!exerciseKey || !oneRM || !bodyweightKg || !sexe) return null
  const table = STANDARDS[exerciseKey]?.[sexe]
  if (!table) return null
  const ratio = oneRM / bodyweightKg

  let pct
  if (ratio <= table[0]) {
    pct = (ratio / table[0]) * PERCENTILE_ANCHORS[1]
  } else if (ratio >= table[4]) {
    // Au-delà d'Exceptionnel : on approche asymptotiquement 99.9
    const over = (ratio - table[4]) / table[4]
    pct = Math.min(99.9, 99 + over * 3)
  } else {
    let i = 0
    while (i < table.length - 1 && ratio >= table[i + 1]) i++
    const lo = table[i], hi = table[i + 1]
    const pLo = PERCENTILE_ANCHORS[i + 1], pHi = PERCENTILE_ANCHORS[i + 2]
    pct = pLo + ((ratio - lo) / (hi - lo)) * (pHi - pLo)
  }

  const low = Math.max(0.1, Math.round((pct - 4) * 10) / 10)
  const high = Math.min(99.9, Math.round((pct + 4) * 10) / 10)

  // Top N sur une population donnée (proportion au-delà de ce percentile)
  const topOf = population => Math.max(1, Math.round(population * (1 - pct / 100)))

  return {
    pct: Math.round(pct * 10) / 10,
    low,
    high,
    topEurope: topOf(700_000_000),
    topMonde: topOf(8_000_000_000),
  }
}
