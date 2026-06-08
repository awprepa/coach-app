/**
 * Moteur de correspondance automatique exercice ↔ bibliothèque
 *
 * Gère :
 *  - abréviations courantes (H/B/KB/DB/BB…)
 *  - différenciateurs critiques (couché ≠ incliné ≠ décliné, haltères ≠ barre…)
 *  - tolérance aux fautes d'orthographe / accents / espaces
 */

// ── Abréviations → forme canonique ───────────────────────────────────────
const ABBREV_RULES = [
  // Haltères
  [/\(h\)/gi,           'haltere'],
  [/\bh\b/g,            'haltere'],   // "squat h" → "squat haltere"
  [/halter[eèé]?s?\b/gi,'haltere'],
  [/dumbbells?\b/gi,    'haltere'],
  [/\bdb\b/gi,          'haltere'],
  // Barre
  [/\(b\)/gi,           'barre'],
  [/\bb\b/g,            'barre'],     // "squat b" → "squat barre"
  [/barbells?\b/gi,     'barre'],
  [/\bbb\b/gi,          'barre'],
  [/\bsb\b/gi,          'barre'],     // "smith barre"
  // Kettlebell
  [/kettlebells?\b/gi,  'kettlebell'],
  [/\bkb\b/gi,          'kettlebell'],
  // Câble / poulie
  [/cables?\b/gi,       'cable'],
  [/poulies?\b/gi,      'cable'],
  // Unilatéral
  [/unilateral\b/gi,    'unilateral'],
  [/\buni\b/gi,         'unilateral'],
  // Bilatéral
  [/bilateral\b/gi,     'bilateral'],
  // Prise
  [/prise large/gi,     'large'],
  [/prise serr[eé]e?/gi,'serre'],
  [/prise neutre?/gi,   'neutre'],
  [/prise supine?/gi,   'supination'],
  [/prise prono?/gi,    'pronation'],
]

// ── Groupes de différenciateurs mutuellement exclusifs ───────────────────
// Si deux noms ont des valeurs DIFFÉRENTES dans un même groupe → conflit = score 0
const DIFFERENTIATOR_GROUPS = [
  // Position du buste
  ['couche', 'incline', 'decline', 'decline'],
  // Matériel
  ['haltere', 'barre', 'cable', 'machine', 'kettlebell', 'smith'],
  // Côté
  ['unilateral', 'bilateral'],
]

// ── Mots "bruit" à ignorer pour le calcul de similarité ─────────────────
const STOP_WORDS = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'a', 'au', 'aux', 'et', 'en', 'sur', 'avec'])

// ── Normalisation ─────────────────────────────────────────────────────────
function normalize(str) {
  if (!str) return ''

  let s = str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // supprime accents
    .replace(/[''`]/g, '')
    .replace(/[-_/]/g, ' ')

  // Appliquer les règles d'abréviation
  for (const [pattern, replacement] of ABBREV_RULES) {
    s = s.replace(pattern, ` ${replacement} `)
  }

  return s.replace(/\s+/g, ' ').trim()
}

// ── Détection des différenciateurs présents dans un nom normalisé ─────────
function getDiffs(normalized) {
  const result = {}
  for (const group of DIFFERENTIATOR_GROUPS) {
    for (const term of group) {
      // Cherche le terme comme mot entier
      if (new RegExp(`\\b${term}\\b`).test(normalized)) {
        result[group[0]] = term  // clé = premier terme du groupe
        break
      }
    }
  }
  return result
}

// ── Conflit entre deux ensembles de différenciateurs ─────────────────────
// Conflit = même groupe, valeurs différentes
function hasDifferentiatorConflict(diffsA, diffsB) {
  for (const key of Object.keys(diffsA)) {
    if (diffsB[key] && diffsB[key] !== diffsA[key]) return true
  }
  return false
}

// ── Score de similarité mots ──────────────────────────────────────────────
function wordSimilarity(a, b) {
  const wordsA = a.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w))
  const wordsB = b.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w))
  if (!wordsA.length || !wordsB.length) return 0

  const setA = new Set(wordsA)
  const setB = new Set(wordsB)
  const inter = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return inter / union  // Jaccard
}

// ── Distance de Levenshtein normalisée (pour tolérance typos) ────────────
function levenshteinSimilarity(a, b) {
  const m = a.length, n = b.length
  if (!m || !n) return 0
  if (Math.abs(m - n) > Math.max(m, n) * 0.4) return 0  // trop différents

  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((_, j) => j === 0 ? i : 0))
  for (let j = 1; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return 1 - dp[m][n] / Math.max(m, n)
}

// ── Fonction principale de matching ──────────────────────────────────────
/**
 * Trouve le meilleur exercice de bibliothèque correspondant à `nom`.
 *
 * @param {string}   nom          Nom de l'exercice à matcher
 * @param {Array}    bibliotheque Liste des exercices bibliothèque { id, nom, ... }
 * @param {number}   threshold    Score minimum pour accepter (défaut 0.72)
 * @returns {{ match: object, score: number } | null}
 */
export function findBiblioMatch(nom, bibliotheque, threshold = 0.72) {
  if (!nom?.trim() || !bibliotheque?.length) return null

  // Correspondance exacte en priorité (insensible à la casse + espaces)
  const nomExact = nom.toLowerCase().trim()
  const exact = bibliotheque.find(ex => ex.nom.toLowerCase().trim() === nomExact)
  if (exact) return { match: exact, score: 1.0 }

  const normNom  = normalize(nom)
  const diffsNom = getDiffs(normNom)

  let bestMatch = null
  let bestScore = 0

  for (const ex of bibliotheque) {
    const normEx  = normalize(ex.nom)
    const diffsEx = getDiffs(normEx)

    // ── Conflit sur un différenciateur → score 0, on passe ──────────────
    if (hasDifferentiatorConflict(diffsNom, diffsEx)) continue

    let score = 0

    if (normNom === normEx) {
      // Correspondance exacte après normalisation
      score = 1.0
    } else if (normNom.includes(normEx) || normEx.includes(normNom)) {
      // L'un contient l'autre (ex: "squat" ↔ "squat barre")
      const shorter = Math.min(normNom.length, normEx.length)
      const longer  = Math.max(normNom.length, normEx.length)
      score = 0.75 + 0.15 * (shorter / longer)
    } else {
      // Combinaison similarité mots + Levenshtein
      const wScore = wordSimilarity(normNom, normEx)
      const lScore = levenshteinSimilarity(normNom, normEx)
      score = Math.max(wScore, lScore * 0.85)
    }

    // Bonus si les différenciateurs présents concordent (même matériel, même position)
    const commonDiffs = Object.keys(diffsNom).filter(k => diffsEx[k] === diffsNom[k]).length
    if (commonDiffs > 0) score = Math.min(1, score + 0.05 * commonDiffs)

    if (score > bestScore) {
      bestScore = score
      bestMatch = ex
    }
  }

  return bestScore >= threshold ? { match: bestMatch, score: bestScore } : null
}

/**
 * Auto-lie un exercice à la bibliothèque si un match est trouvé.
 * Retourne l'id de bibliothèque ou null.
 */
export function autoLinkBiblio(nom, bibliotheque) {
  const result = findBiblioMatch(nom, bibliotheque)
  return result ? result.match.id : null
}
