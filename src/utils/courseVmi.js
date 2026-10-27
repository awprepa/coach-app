// Calcul des distances d'un exercice de course à partir de la VMI du joueur.
//
// Principe : on garde les proportions du schéma et on cherche le facteur k
// tel que le temps de course + le temps perdu (changements de direction,
// passages au sol) = temps d'effort prévu, à la vitesse cible
// (VMI × % d'intensité). Course arrière et pas chassés se courent moins vite.

// Échelle des dessins : unités du schéma (100 × 100) par mètre réel.
// Terrain de rugby : 120 m de long dessinés sur 96 unités (0,8 u/m).
export const ECHELLE = { gazon: 0.8, salle: 2.5, vierge: 2 }
export const echelleDe = surface => ECHELLE[surface] || ECHELLE.gazon

// Valeurs par défaut validées par Arthur le 20/10/2026 (modifiables par exercice)
export const REGLAGES_DEFAUT = {
  cdd180: 1,      // s perdues pour un demi-tour
  cdd90: 0.5,     // s perdues pour un virage à 90°
  cdd45: 0.2,     // s perdues pour un virage à 45°
  sol: 1.5,       // s perdues pour un passage au sol
  arriere: 60,    // % de la vitesse en course arrière
  chasses: 70,    // % de la vitesse en pas chassés
}

export const DEPLACEMENTS = { avant: 'Course avant', arriere: 'Course arrière', chasses: 'Pas chassés' }

const PROCHE = 1.5 // unités : deux extrémités plus proches que ça sont reliées

const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay)

// Longueur réelle (m) d'une flèche
export function metresFleche(a, surface) {
  return dist(a.x1, a.y1, a.x2, a.y2) / echelleDe(surface)
}
export const arrondiDemi = m => Math.round(m * 2) / 2

// Temps perdu pour un changement de direction d'angle `deg` (0 = tout droit,
// 180 = demi-tour), par interpolation entre 45°, 90° et 180°. Sous 20°, rien.
export function perteVirage(deg, r = REGLAGES_DEFAUT) {
  if (deg < 20) return 0
  const pts = [[20, 0], [45, r.cdd45], [90, r.cdd90], [180, r.cdd180]]
  for (let i = 1; i < pts.length; i++) {
    const [d0, v0] = pts[i - 1], [d1, v1] = pts[i]
    if (deg <= d1) return v0 + (v1 - v0) * (deg - d0) / (d1 - d0)
  }
  return r.cdd180
}

// Analyse du parcours : changements de direction, passages au sol, temps perdu
export function analyser(schema) {
  const r = { ...REGLAGES_DEFAUT, ...(schema.course?.reglages || {}) }
  const arrows = schema.arrows || []
  const plots = schema.plots || []
  // Le parcours suit l'ordre de tracé des flèches : un virage compte quand une
  // flèche part de l'endroit où arrive la précédente.
  const virages = []
  arrows.forEach((a, i) => {
    const b = arrows[i + 1]
    if (!b || dist(a.x2, a.y2, b.x1, b.y1) > PROCHE) return
    const u = [a.x2 - a.x1, a.y2 - a.y1], v = [b.x2 - b.x1, b.y2 - b.y1]
    const nu = Math.hypot(...u) || 1, nv = Math.hypot(...v) || 1
    const cos = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))
    const deg = Math.acos(cos) * 180 / Math.PI
    const perte = perteVirage(deg, r)
    if (perte > 0) virages.push({ deg: Math.round(deg), perte })
  })
  // Passage au sol : à chaque arrivée sur le plot, ou au départ s'il n'y a pas d'arrivée
  let nbSol = 0
  plots.filter(p => p.sol).forEach(p => {
    const arrivees = arrows.filter(a => dist(a.x2, a.y2, p.x, p.y) <= PROCHE).length
    const departs = arrows.filter(a => dist(a.x1, a.y1, p.x, p.y) <= PROCHE).length
    nbSol += arrivees || (departs ? 1 : 0)
  })
  const perteVirages = virages.reduce((s, v) => s + v.perte, 0)
  const perteSol = nbSol * r.sol
  return { reglages: r, virages, nbSol, perteVirages, perteSol, perteTotale: perteVirages + perteSol }
}

const facteurVitesse = (a, r) => a.mode === 'arriere' ? r.arriere / 100 : a.mode === 'chasses' ? r.chasses / 100 : 1

// Facteur d'échelle à appliquer au schéma pour la VMI donnée.
// Renvoie { k, ... } ou { erreur } si le calcul est impossible.
export function calculer(schema, { vmi, effort, intensite }) {
  const arrows = schema.arrows || []
  if (!arrows.length) return { erreur: 'Trace au moins une flèche pour le parcours.' }
  if (!(vmi > 0)) return { erreur: 'Renseigne la VMI du joueur.' }
  if (!(effort > 0)) return { erreur: 'Renseigne le temps d’effort.' }
  const pct = intensite > 0 ? intensite : 100
  const an = analyser(schema)
  const v = (vmi / 3.6) * (pct / 100) // m/s
  const tempsCourse = effort - an.perteTotale
  if (tempsCourse <= 0) return { erreur: 'Le temps perdu dépasse le temps d’effort.', ...an }
  // Temps pour parcourir le schéma tel qu'il est dessiné (en mètres réels)
  const tActuel = arrows.reduce((s, a) => s + metresFleche(a, schema.surface) / (v * facteurVitesse(a, an.reglages)), 0)
  const k = tempsCourse / tActuel
  const metres = arrows.map(a => metresFleche(a, schema.surface) * k)
  return { k, vitesse: v, tempsCourse, distanceTotale: metres.reduce((s, m) => s + m, 0), ...an }
}

// Applique le facteur k au dessin, autour du point de départ du parcours.
export function mettreAEchelle(schema, k) {
  const a0 = schema.arrows?.[0]
  if (!a0) return schema
  const ox = a0.x1, oy = a0.y1
  const sx = x => ox + (x - ox) * k, sy = y => oy + (y - oy) * k
  return {
    ...schema,
    plots: (schema.plots || []).map(p => ({ ...p, x: sx(p.x), y: sy(p.y) })),
    arrows: (schema.arrows || []).map(a => ({ ...a, x1: sx(a.x1), y1: sy(a.y1), x2: sx(a.x2), y2: sy(a.y2) })),
    zones: (schema.zones || []).map(z => ({ ...z, x: sx(z.x), y: sy(z.y), w: z.w * k, h: z.h * k })),
  }
}

// Vrai si un élément sort du dessin (0–100, ou le cadre dézoomé d'une surface vierge)
export function deborde(schema, { x0 = 0, y0 = 0, t = 100 } = {}) {
  const hx = v => v < x0 || v > x0 + t, hy = v => v < y0 || v > y0 + t
  return (schema.plots || []).some(p => hx(p.x) || hy(p.y))
    || (schema.arrows || []).some(a => hx(a.x1) || hy(a.y1) || hx(a.x2) || hy(a.y2))
    || (schema.zones || []).some(z => hx(z.x) || hy(z.y) || hx(z.x + z.w) || hy(z.y + z.h))
}
