import { surfaceDefs, markerDefs, surfaceMarkings } from './SchemaTerrainEditor'

const PALETTE_WITH_BLACK = ['#f2c94c', '#eb5757', '#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#f5f7fa', '#1a1d21']
function markerIdFor(color) {
  const idx = PALETTE_WITH_BLACK.indexOf(color)
  return idx >= 0 ? idx : PALETTE_WITH_BLACK.length
}

// Rendu lecture seule du schéma d'un bloc terrain (même format de données que
// SchemaTerrainEditor), pour l'affichage côté client pendant la séance.
export default function SchemaTerrainView({ value, style }) {
  const schema = value || { surface: 'gazon', plots: [], arrows: [], zones: [] }

  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', display: 'block', borderRadius: 10, ...style }}>
      <defs dangerouslySetInnerHTML={{ __html: surfaceDefs() + markerDefs() }} />
      <rect x="0" y="0" width="100" height="100" fill={`url(#surf-${schema.surface})`} />
      <g dangerouslySetInnerHTML={{ __html: surfaceMarkings(schema.surface) }} />

      {(schema.zones || []).map(z => (
        <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} fill={z.color} fillOpacity={0.22} stroke={z.color} strokeWidth={0.6} />
      ))}

      {(schema.arrows || []).map(a => {
        const dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.hypot(dx, dy) || 1
        const nx = -dy / len, ny = dx / len
        const midX = (a.x1 + a.x2) / 2, midY = (a.y1 + a.y2) / 2
        const labelX = midX + nx * 4.6, labelY = midY + ny * 4.6
        return (
          <g key={a.id}>
            <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={0.55} strokeLinecap="round"
              strokeDasharray={a.style === 'pointille' ? '2,1.6' : undefined} markerEnd={`url(#arrow-${markerIdFor(a.color)})`} />
            {a.distance != null && (
              <>
                <rect x={labelX - 5} y={labelY - 2.1} width="10" height="4.2" rx="2.1" fill="#14161a" fillOpacity="0.82" />
                <text x={labelX} y={labelY + 0.9} fontSize="2.5" fontWeight="700" fill="#ffffff" textAnchor="middle">{a.distance} m</text>
              </>
            )}
          </g>
        )
      })}

      {(schema.plots || []).map(p => {
        const labelW = Math.max(7, (p.label || '').length * 2.3 + 2.4)
        return (
          <g key={p.id}>
            <circle cx={p.x} cy={p.y + 0.22} r="1.9" fill="rgba(0,0,0,0.28)" />
            <circle cx={p.x} cy={p.y} r="1.85" fill={p.color} stroke="rgba(0,0,0,0.18)" strokeWidth={0.32} />
            <rect x={p.x - labelW / 2} y={p.y - 6.3} width={labelW} height="3.7" rx="1.85" fill="#14161a" fillOpacity="0.82" />
            <text x={p.x} y={p.y - 3.75} fontSize="2.3" fontWeight="700" fill="#ffffff" textAnchor="middle">{p.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
