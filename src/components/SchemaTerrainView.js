import { surfaceDefs, markerDefs, surfaceMarkings, surfaceOf, ArrowShape, PlotShape, flechesDecalees, cadreDe, fondUrl } from './SchemaTerrainEditor'

// Rendu lecture seule du schéma d'un bloc terrain (même format de données et
// mêmes formes que SchemaTerrainEditor), pour l'affichage côté client.
// `consigne` : afficher la ligne de consigne de course sous le dessin (pas dans les vignettes)
export default function SchemaTerrainView({ value, style, consigne: avecConsigne = true }) {
  const schema = value || { surface: 'gazon', plots: [], arrows: [], zones: [] }
  const surface = surfaceOf(schema)
  const { x0, y0, t, e } = cadreDe(schema)
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
