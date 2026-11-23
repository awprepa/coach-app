import { surfaceDefs, markerDefs, surfaceMarkings, surfaceOf, ArrowShape, PlotShape, flechesDecalees, cadreDe, fondUrl, PLOT_R } from './SchemaTerrainEditor'
import { arrondiDemi, metresFleche } from '../utils/courseVmi'

// Étiquettes de distance qui ne chevauchent rien : sur la flèche si la place est
// libre, sinon écartées vers l'extérieur du parcours (loin du centre des plots).
function placerEtiquettes(schema, surface, e, decales, cadre) {
  const arrows = schema.arrows || [], plots = schema.plots || []
  const H = 2.9 * e
  const seg = a => {
    if (!decales.has(a.id)) return a
    const l = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1, nx = -(a.y2 - a.y1) / l, ny = (a.x2 - a.x1) / l, d = 1.1 * e
    return { ...a, x1: a.x1 + nx * d, y1: a.y1 + ny * d, x2: a.x2 + nx * d, y2: a.y2 + ny * d }
  }
  const segs = arrows.map(seg)
  const cx = plots.reduce((t, p) => t + p.x, 0) / (plots.length || 1), cy = plots.reduce((t, p) => t + p.y, 0) / (plots.length || 1)
  const libelles = plots.map(p => {
    const t = [(p.label || '').trim(), p.sol ? 'sol' : ''].filter(Boolean).join(' · ')
    return t ? { x: p.x, y: p.y - PLOT_R * e * 0.7 - 1.5 * e, w: t.length * 1.05 * e, h: 2.2 * e } : null
  }).filter(Boolean)
  const places = []
  const chevauche = (r1, r2) => Math.abs(r1.x - r2.x) * 2 < r1.w + r2.w && Math.abs(r1.y - r2.y) * 2 < r1.h + r2.h
  const libre = (r, propre) => {
    if (r.x - r.w / 2 < cadre.x0 || r.x + r.w / 2 > cadre.x0 + cadre.t || r.y - r.h / 2 < cadre.y0 || r.y + r.h / 2 > cadre.y0 + cadre.t) return false
    const marge = { ...r, w: r.w + 0.8 * e, h: r.h + 0.8 * e }
    for (const s of segs) {
      if (s.id === propre) continue
      const l = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), n = Math.max(2, Math.ceil(l / (0.4 * e)))
      for (let i = 0; i <= n; i++) {
        const px = s.x1 + (s.x2 - s.x1) * i / n, py = s.y1 + (s.y2 - s.y1) * i / n
        if (Math.abs(px - r.x) * 2 < marge.w && Math.abs(py - r.y) * 2 < marge.h) return false
      }
    }
    if (plots.some(p => chevauche(marge, { x: p.x, y: p.y, w: 3.4 * PLOT_R * e, h: 2 * PLOT_R * e }))) return false
    return !libelles.some(o => chevauche(marge, o)) && !places.some(o => chevauche(marge, o))
  }
  const pos = {}
  segs.forEach(s => {
    const brute = arrows.find(a => a.id === s.id)
    const m = arrondiDemi(metresFleche(brute, surface))
    if (brute.masquerDistance || m < 0.5) return
    const w = (`${String(m).replace('.', ',')} m`.length * 1.15 + 1.8) * e
    const l = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1
    const nx = -(s.y2 - s.y1) / l, ny = (s.x2 - s.x1) / l
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2
    const dehors = ((mx - cx) * nx + (my - cy) * ny) >= 0 ? 1 : -1
    const d0 = Math.abs(nx) * w / 2 + Math.abs(ny) * H / 2 + 1.2 * e
    const essais = [{ x: mx, y: my }]
    for (let k = 0; k < 4; k++) for (const c of [dehors, -dehors]) essais.push({ x: mx + c * nx * (d0 + k * 1.6 * e), y: my + c * ny * (d0 + k * 1.6 * e) })
    const choix = essais.find(q => libre({ ...q, w, h: H }, s.id)) || essais[1]
    places.push({ ...choix, w, h: H })
    pos[s.id] = choix
  })
  return pos
}

// Rendu lecture seule du schéma d'un bloc terrain (même format de données et
// mêmes formes que SchemaTerrainEditor), pour l'affichage côté client.
// `consigne` : afficher la ligne de consigne de course sous le dessin (pas dans les vignettes)
// `zoom` : sur le terrain de rugby, cadre resserré autour des plots et des flèches
// quand l'exercice est petit (toute la largeur du terrain reste visible).
// `coteMin` : zoom maximal (côté visible minimal, en unités ; 68 = toute la largeur du terrain)
// `etiquettesLibres` : distances placées pour ne chevaucher ni flèches, ni plots, ni autres distances
export default function SchemaTerrainView({ value, style, consigne: avecConsigne = true, zoom = false, coteMin = 68, etiquettesLibres = false }) {
  const schema = value || { surface: 'gazon', plots: [], arrows: [], zones: [] }
  const surface = surfaceOf(schema)
  let { x0, y0, t, e } = cadreDe(schema)
  const pts = [...(schema.plots || []).map(p => [p.x, p.y]), ...(schema.arrows || []).flatMap(a => [[a.x1, a.y1], [a.x2, a.y2]])]
  if (zoom && surface === 'gazon' && pts.length) {
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
    // largeur du terrain (lignes de touche et repères 22 / 40 / 50) toujours visible
    const cote = Math.min(100, Math.max(coteMin, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.4 + 10))
    const borne = v => Math.min(100 - cote, Math.max(0, v))
    x0 = borne(50 - cote / 2)
    y0 = borne((Math.min(...ys) + Math.max(...ys) - cote) / 2)
    // plots et textes grossissent un peu avec le zoom, sans devenir énormes
    t = cote; e = Math.sqrt(cote / 100)
  }
  const decales = flechesDecalees(schema.arrows || [], e)
  const positions = etiquettesLibres ? placerEtiquettes(schema, surface, e, decales, { x0, y0, t }) : {}

  // Consigne de course (si le schéma a été réglé à la VMI)
  const c = schema.course || {}
  const nb = v => String(v).replace('.', ',')
  const consigne = c.effort ? [
    `${c.reps ? `${c.reps} × ` : ''}${nb(c.effort)} s d\u2019effort à ${nb(c.intensite || 100)} % de VMI`,
    c.recup ? `récup ${nb(c.recup)} s` : null,
    c.vmi ? `VMI ${nb(c.vmi)} km/h` : null,
  ].filter(Boolean).join(' · ') : null

  return (
    <div>
    <svg viewBox={`${x0} ${y0} ${t} ${t}`} style={{ width: '100%', display: 'block', borderRadius: 10, ...style }}>
      <defs dangerouslySetInnerHTML={{ __html: surfaceDefs(e) + markerDefs((schema.arrows || []).map(a => a.color)) }} />
      <rect x={x0} y={y0} width={t} height={t} fill={fondUrl(surface, e)} />
      <g dangerouslySetInnerHTML={{ __html: surfaceMarkings(surface) }} />

      {(schema.zones || []).map(z => (
        <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} fill={z.color} fillOpacity={0.22} stroke={z.color} strokeWidth={0.6 * e} />
      ))}

      {(schema.arrows || []).map(a => <g key={a.id}><ArrowShape a={a} surface={surface} decale={decales.has(a.id)} plots={schema.plots || []} e={e} labelPos={positions[a.id]} /></g>)}

      {(schema.plots || []).map(p => <g key={p.id}><PlotShape p={p} e={e} /></g>)}
    </svg>
    {avecConsigne && consigne && <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: '#333333', lineHeight: 1.4 }}>{consigne}</p>}
    </div>
  )
}
