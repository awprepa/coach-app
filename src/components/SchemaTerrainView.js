import { surfaceDefs, markerDefs, surfaceMarkings, surfaceOf, ArrowShape, PlotShape } from './SchemaTerrainEditor'

// Rendu lecture seule du schéma d'un bloc terrain (même format de données et
// mêmes formes que SchemaTerrainEditor), pour l'affichage côté client.
export default function SchemaTerrainView({ value, style }) {
  const schema = value || { surface: 'gazon', plots: [], arrows: [], zones: [] }
  const surface = surfaceOf(schema)

  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', display: 'block', borderRadius: 10, ...style }}>
      <defs dangerouslySetInnerHTML={{ __html: surfaceDefs() + markerDefs((schema.arrows || []).map(a => a.color)) }} />
      <rect x="0" y="0" width="100" height="100" fill={`url(#surf-${surface})`} />
      <g dangerouslySetInnerHTML={{ __html: surfaceMarkings(surface) }} />

      {(schema.zones || []).map(z => (
        <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} fill={z.color} fillOpacity={0.22} stroke={z.color} strokeWidth={0.6} />
      ))}

      {(schema.arrows || []).map(a => <g key={a.id}><ArrowShape a={a} /></g>)}

      {(schema.plots || []).map(p => <g key={p.id}><PlotShape p={p} /></g>)}
    </svg>
  )
}
