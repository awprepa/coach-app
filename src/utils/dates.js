// Date du jour (ou d'une date donnée) au format AAAA-MM-JJ, en heure LOCALE.
// Ne jamais utiliser toISOString().slice(0, 10) pour ça : c'est l'heure UTC,
// qui en France donne encore la veille entre minuit et 2 h (et décale d'un
// jour toute date construite à minuit local).
export function isoLocal(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
