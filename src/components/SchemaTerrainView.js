import { surfaceDefs, markerDefs, surfaceMarkings, surfaceOf, ArrowShape, PlotShape, flechesDecalees, cadreDe, fondUrl } from './SchemaTerrainEditor'

// Rendu lecture seule du schéma d'un bloc terrain (même format de données et
// mêmes formes que SchemaTerrainEditor), pour l'affichage côté client.
// `consigne` : afficher la ligne de consigne de course sous le dessin (pas dans les vignettes)
// `zoom` : sur le terrain de rugby, cadre resserré autour des plots et des flèches
// quand l'exercice est petit (toute la largeur du terrain reste visible).
export default function SchemaTerrainView({ value, style, consigne: avecConsigne = true, zoom = false }) {
  const schema = value || { surface: 'gazon', plots: [], arrows: [], zones: [] }
  const surface = surfaceOf(schema)
  let { x0, y0, t, e } = cadreDe(schema)
  const pts = [...(schema.plots || []).map(p => [p.x, p.y]), ...(schema.arrows || []).flatMap(a => [[a.x1, a.y1], [a.x2, a.y2]])]
  if (zoom && surface === 'gazon' && pts.length) {
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
    // largeur du terrain (lignes de touche et repères 22 / 40 / 50) toujours visible
    const cote = Math.min(100, Math.max(68, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.4 + 10))
    const borne = v => Math.min(100 - cote, Math.max(0, v))
    x0 = borne(50 - cote / 2)
    y0 = borne((Math.min(...ys) + Math.max(...ys) - cote) / 2)
    // plots et textes grossissent un peu avec le zoom, sans devenir énormes
    t = cote; e = Math.sqrt(cote / 100)
  }
  const decales = flechesDecalees(schema.arrows || [], e)

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

      {(schema.arrows || []).map(a => <g key={a.id}><ArrowShape a={a} surface={surface} decale={decales.has(a.id)} plots={schema.plots || []} e={e} /></g>)}

      {(schema.plots || []).map(p => <g key={p.id}><PlotShape p={p} e={e} /></g>)}
    </svg>
    {avecConsigne && consigne && <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: '#333333', lineHeight: 1.4 }}>{consigne}</p>}
    </div>
  )
}
