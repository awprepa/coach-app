// Petites notes qualitatives par macro, affichées à côté des valeurs brutes
// (ex: "17g de lipides" ne dit rien à un joueur — "Riche" ou "Faible" si).

export function noteMatieresGrasses(g) {
  if (g == null) return null
  if (g < 3) return { label: 'Faible', color: '#16a34a' }
  if (g < 17.5) return { label: 'Modéré', color: '#ca8a04' }
  return { label: 'Riche', color: '#dc2626' }
}
export function noteProteines(g) {
  if (g == null) return null
  if (g < 5) return { label: 'Faible', color: '#9ca3af' }
  if (g < 15) return { label: 'Correct', color: '#ca8a04' }
  return { label: 'Riche', color: '#16a34a' }
}
export function noteGlucides(g) {
  if (g == null) return null
  if (g < 5) return { label: 'Faible', color: '#16a34a' }
  if (g < 22.5) return { label: 'Modéré', color: '#ca8a04' }
  return { label: 'Riche', color: '#dc2626' }
}
export function noteFibres(g) {
  if (g == null || g < 3) return null
  return { label: 'Bonne source', color: '#16a34a' }
}
