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
}

// excludeKeywords : variantes qui ne sont pas comparables au mouvement de référence
// (charge non standard — ex. haltères, où le poids saisi est celui d'un seul haltère
// et ne correspond pas à la charge totale à la barre) → exclues du calcul de rang.
export const BENCHMARK_EXERCISES = [
  // 'couché'/'couche' seuls (pas besoin de "développé" devant) pour survivre aux
  // fautes de frappe fréquentes ("dévelloppé", "developer"…) sur ce mot précis.
  { key: 'developpe_couche',   label: 'Développé couché',   keywords: ['couché', 'couche', 'bench'], excludeKeywords: ['haltère', 'haltere', 'dumbbell', '(h)'] },
  { key: 'squat',              label: 'Squat',               keywords: ['squat'], excludeKeywords: ['haltère', 'haltere', 'dumbbell', '(h)'] },
  { key: 'souleve_de_terre',   label: 'Soulevé de terre',    keywords: ['soulevé de terre', 'souleve de terre', 'deadlift', 'sdt'], excludeKeywords: ['haltère', 'haltere', 'dumbbell', '(h)'] },
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
