/**
 * Recherche dans la base libre free-exercise-db (yuhonas, domaine public)
 * ~800 exercices, images JPG (start + end position), sans clé API, sans limite.
 * JSON mis en cache dans window._freeExDB après le premier chargement.
 */

const BASE_IMG = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
const JSON_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'

export async function searchFreeExDB(translatedQuery) {
  try {
    // Chargement unique + cache mémoire
    if (!window._freeExDB) {
      const res = await fetch(JSON_URL)
      if (!res.ok) throw new Error('Impossible de charger la base libre')
      window._freeExDB = await res.json()
    }

    const words = translatedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    if (!words.length) return []

    const scored = window._freeExDB
      .filter(ex => words.some(w => ex.name.toLowerCase().includes(w)))
      .map(ex => {
        const nWords = ex.name.toLowerCase().split(/\s+/)
        const inter = words.filter(w => nWords.some(nw => nw.includes(w))).length
        const union = new Set([...words, ...nWords]).size
        return { ...ex, _score: union ? inter / union : 0 }
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 9)

    return scored.map(ex => ({
      id: ex.id,
      name: ex.name,
      imageUrl: ex.images?.[0] ? BASE_IMG + ex.images[0] : null,
      gifUrl: null,   // pas de GIF — JPG statique
      _source: 'freedb',
    }))
  } catch {
    return []
  }
}
