// Standards de force par ratio (charge soulevée / poids de corps), inspirés des
// tables communément utilisées dans le milieu force/musculation (type Strength Level).
// Pas de source officielle unique — ce sont des repères, pas des vérités absolues.
// Seuil = ratio à partir duquel le rang est atteint. En dessous du premier seuil : "Fer".
// Chaque table a 6 seuils, pour les 6 rangs au-dessus de "Fer" (Bronze → Champion).

export const RANKS = ['Fer', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Champion']

// Records du monde raw (sans équipement de soutien) vérifiés au 24/08/2026 :
// Hommes — développé couché 355 kg (Julius Maddox), squat 490,5 kg (Devonte
// Lewis), soulevé de terre 492,5 kg (Colton Engelbrecht).
// Femmes — développé couché 207,5 kg (April Mathis), squat 318 kg (Sonita
// Muluh), soulevé de terre 297,5 kg (Samantha Rice).
// Ces records progressent régulièrement (record homme squat/deadlift battus
// courant 2026) — à revérifier périodiquement. Pas de record pour les
// exercices d'accessoire (rowing, hip thrust, dips, tractions, développé
// militaire...) où il n'existe pas de circuit de compétition standardisé.
export const WORLD_RECORDS = {
  developpe_couche:  { homme: 355,   femme: 207.5 },
  squat:              { homme: 490.5, femme: 318 },
  souleve_de_terre:  { homme: 492.5, femme: 297.5 },
}

export function getWorldRecord(exerciseKey, sexe) {
  return WORLD_RECORDS[exerciseKey]?.[sexe] ?? null
}

const STANDARDS = {
  developpe_couche: {
    homme: [0.5, 0.75, 1.0, 1.5, 1.625, 1.75],
    femme: [0.25, 0.5, 0.75, 1.0, 1.125, 1.25],
  },
  squat: {
    homme: [0.75, 1.0, 1.5, 2.0, 2.25, 2.5],
    femme: [0.5, 0.75, 1.25, 1.75, 1.875, 2.0],
  },
  souleve_de_terre: {
    homme: [1.0, 1.25, 1.75, 2.25, 2.5, 2.75],
    femme: [0.75, 1.0, 1.5, 2.0, 2.125, 2.25],
  },
  front_squat: {
    homme: [0.65, 0.85, 1.25, 1.7, 1.9, 2.1],
    femme: [0.4, 0.6, 1.05, 1.5, 1.6, 1.7],
  },
  developpe_militaire: {
    homme: [0.35, 0.55, 0.8, 1.05, 1.175, 1.3],
    femme: [0.2, 0.3, 0.45, 0.6, 0.675, 0.75],
  },
  rowing: {
    homme: [0.5, 0.75, 1.0, 1.35, 1.475, 1.6],
    femme: [0.25, 0.4, 0.6, 0.85, 0.95, 1.05],
  },
  hip_thrust: {
    homme: [1.0, 1.5, 2.25, 3.0, 3.25, 3.5],
    femme: [1.0, 1.5, 2.0, 2.75, 3.0, 3.25],
  },
  // Dips et tractions lestées : ici le "poids" ne compte QUE la charge ajoutée
  // (le lest), pas le poids de corps — contrairement au squat/bench où le poids
  // saisi est la charge totale. Le ratio est donc charge ajoutée / poids de corps,
  // avec des seuils bien plus bas (0 = tractions/dips au poids de corps, sans rien
  // ajouté = encore "Fer").
  dips: {
    homme: [0.15, 0.35, 0.6, 0.75, 0.9, 1.15],
    femme: [0.05, 0.15, 0.3, 0.4, 0.5, 0.65],
  },
  tractions_lestees: {
    homme: [0.1, 0.25, 0.45, 0.6, 0.75, 1.0],
    femme: [0.03, 0.1, 0.2, 0.3, 0.4, 0.55],
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
  { key: 'dips',                  label: 'Dips lestés',         keywords: ['dips', 'dip'], excludeKeywords: [] },
  { key: 'tractions_lestees',    label: 'Tractions lestées',   keywords: ['traction', 'pull-up', 'pull up', 'chin'], excludeKeywords: ['scapulaire'] },
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
  let rankIndex = 0 // 0 = Fer
  for (let i = 0; i < table.length; i++) {
    if (ratio >= table[i]) rankIndex = i + 1
  }

  const rank = RANKS[rankIndex]
  const isMax = rankIndex >= table.length // déjà au-delà du dernier seuil (Champion)
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

// ─── Percentile de population ──────────────────────────────────────────────
//
// Modèle : le ratio charge/poids-de-corps est supposé suivre une loi normale
// dans la population des pratiquants (hypothèse standard en science du sport
// pour ce type de distribution de performance). On calibre μ et σ à partir de
// deux points déjà définis dans le barème lui-même (pas de constante arbitraire
// ajoutée) : μ = seuil "Argent" (défini comme le 50e percentile, le
// pratiquant moyen) et σ déduit du seuil "Diamant" placé au 97.5e percentile
// (z = 1.96, convention statistique standard pour "97.5%"). Le percentile de
// n'importe quel ratio se calcule ensuite avec la fonction de répartition
// normale (Φ), pas par interpolation à la main entre des paliers choisis au jugé.
function erf(x) {
  // Approximation Abramowitz & Stegun 7.1.26 (erreur max ~1.5e-7)
  const sign = x < 0 ? -1 : 1
  x = Math.abs(x)
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return sign * y
}
function normalCDF(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

// Population réelle (estimations 2025) — Europe : ONU/Eurostat ; Monde : ONU.
const POPULATION_EUROPE = 745_000_000
const POPULATION_MONDE  = 8_200_000_000
const Z_ELITE = 1.959963984540054 // z tel que Φ(z) = 0.975

export function estimatePercentile(exerciseKey, oneRM, bodyweightKg, sexe) {
  if (!exerciseKey || !oneRM || !bodyweightKg || !sexe) return null
  const table = STANDARDS[exerciseKey]?.[sexe]
  if (!table) return null
  const ratio = oneRM / bodyweightKg

  const mu = table[1]                       // seuil Argent = moyenne (50e percentile)
  const sigma = (table[4] - mu) / Z_ELITE    // seuil Diamant = 97.5e percentile
  const z = (ratio - mu) / sigma
  const pct = Math.min(99.97, Math.max(0.03, normalCDF(z) * 100))

  // Marge d'incertitude du modèle (±1 point), pour donner une fourchette
  // plutôt qu'un chiffre unique à la décimale près.
  const low = Math.max(0.03, Math.round((pct - 1) * 10) / 10)
  const high = Math.min(99.97, Math.round((pct + 1) * 10) / 10)

  const topOf = population => Math.max(1, Math.round(population * (1 - pct / 100)))

  return {
    pct: Math.round(pct * 10) / 10,
    low,
    high,
    topEurope: topOf(POPULATION_EUROPE),
    topMonde: topOf(POPULATION_MONDE),
  }
}
