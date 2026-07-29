// Rendu SVG statique d'un schéma d'exercice (plots + segments) — utilisé pour
// les vignettes de bibliothèque et comme couche de base de l'éditeur.
// Coordonnées des plots normalisées en 0-100 (viewBox carré, s'adapte à tout conteneur).
export default function SchemaSVG({ donnees, showDistances = true, style }) {
  const plots = donnees?.plots || []
  const segments = donnees?.segments || []
  const rects = donnees?.rects || []

  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block', ...style }}>
      <rect x="0" y="0" width="100" height="100" fill="#f3f4e8" />
      {rects.map(r => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h}
          fill={r.rempli ? r.couleur : 'transparent'} fillOpacity={r.rempli ? 0.18 : 0}
          stroke={r.couleur} strokeWidth="0.7"
          strokeDasharray={r.style === 'pointille' ? '2.4,1.6' : undefined} />
      ))}
      {segments.map(seg => {
        const from = plots.find(p => p.id === seg.from)
        const to = plots.find(p => p.id === seg.to)
        if (!from || !to) return null
        const midX = (from.x + to.x) / 2
        const midY = (from.y + to.y) / 2
        return (
          <g key={seg.id}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke="#374151" strokeWidth="0.9"
              strokeDasharray={seg.style === 'pointille' ? '3,2' : undefined} />
            {showDistances && seg.distance_m != null && (
              <text x={midX} y={midY - 2.2} fontSize="3.4" fill="#1f2937" textAnchor="middle" fontWeight="700"
                style={{ paintOrder: 'stroke', stroke: '#f3f4e8', strokeWidth: 1.2 }}>
                {seg.distance_m}m
              </text>
            )}
          </g>
        )
      })}
      {plots.map(p => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r="2.2" fill={p.couleur || '#2563eb'} stroke="#fff" strokeWidth="0.5" />
          <text x={p.x} y={p.y - 3.4} fontSize="2.6" fill="#1f2937" textAnchor="middle" fontWeight="800"
            style={{ paintOrder: 'stroke', stroke: '#f3f4e8', strokeWidth: 1 }}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
