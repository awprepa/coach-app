import { useEffect, useRef } from 'react'

// Injecte une fois les keyframes @shimmer dans le document
let shimmerInjected = false
function injectShimmer() {
  if (shimmerInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes aw-shimmer {
      0%   { background-position: -400px 0 }
      100% { background-position: 400px 0 }
    }
    .aw-skeleton {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 800px 100%;
      animation: aw-shimmer 1.4s infinite linear;
      border-radius: 8px;
    }
  `
  document.head.appendChild(style)
  shimmerInjected = true
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style = {} }) {
  const ref = useRef(false)
  if (!ref.current) { injectShimmer(); ref.current = true }
  return (
    <div
      className="aw-skeleton"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
    />
  )
}

// Bloc skeleton complet pour la page Nutrition (carte sombre + sections repas)
export function NutritionSkeleton() {
  const ref = useRef(false)
  if (!ref.current) { injectShimmer(); ref.current = true }
  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Carte résumé */}
      <div style={{ background: '#1a1a1a', borderRadius: 20, padding: '18px 18px 16px' }}>
        <Skeleton width={80} height={48} borderRadius={10} style={{ background: 'rgba(255,255,255,0.08)', marginBottom: 14 }} />
        <Skeleton width="100%" height={6} borderRadius={999} style={{ background: 'rgba(255,255,255,0.08)', marginBottom: 16 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={20} height={20} borderRadius={4} style={{ background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
              <Skeleton width={28} height={10} borderRadius={4} style={{ background: 'rgba(255,255,255,0.08)' }} />
              <Skeleton width="100%" height={5} borderRadius={999} style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Sections repas */}
      {[1,2,3,4].map(i => (
        <div key={i} style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Skeleton width={24} height={24} borderRadius={4} />
              <Skeleton width={70} height={14} borderRadius={6} />
            </div>
            <Skeleton width={30} height={30} borderRadius={15} />
          </div>
        </div>
      ))}

      {/* Hydratation */}
      <div style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', borderRadius: 18, padding: '16px 16px 18px' }}>
        <Skeleton width={120} height={14} borderRadius={6} style={{ background: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
        <Skeleton width="100%" height={8} borderRadius={999} style={{ background: 'rgba(255,255,255,0.15)', marginBottom: 16 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Skeleton width={72} height={60} borderRadius={16} style={{ background: 'rgba(255,255,255,0.15)' }} />
          <Skeleton width="100%" height={60} borderRadius={12} style={{ background: 'rgba(255,255,255,0.1)' }} />
          <Skeleton width={72} height={60} borderRadius={16} style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
      </div>
    </div>
  )
}

// Spinner générique — remplace les "Chargement..." texte brut
export function PageLoading({ dark = false }) {
  const bg   = dark ? '#1a1a1a' : '#efefef'
  const ring = dark ? 'rgba(255,255,255,0.15)' : '#e5e7eb'
  const top  = dark ? 'rgba(255,255,255,0.7)'  : '#1a1a1a'
  return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: `3px solid ${ring}`, borderTopColor: top,
        animation: 'aw-spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes aw-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// Skeleton pour la page Accueil client
export function AccueilSkeleton() {
  const ref = useRef(false)
  if (!ref.current) { injectShimmer(); ref.current = true }
  return (
    <div style={{ minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#333 0%,#1f2937 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={100} height={22} borderRadius={6} style={{ background: 'rgba(255,255,255,0.12)' }} />
        <Skeleton width={38} height={38} borderRadius={19} style={{ background: 'rgba(255,255,255,0.12)' }} />
      </div>
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Titre */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width={80}  height={13} borderRadius={6} />
          <Skeleton width={160} height={28} borderRadius={8} />
        </div>
        {/* Carte prochaine séance */}
        <div style={{ background: '#1f2937', borderRadius: 16, padding: '1.25rem 1.5rem', borderLeft: '4px solid rgba(228,248,22,0.3)' }}>
          <Skeleton width={100} height={11} borderRadius={4} style={{ background: 'rgba(255,255,255,0.08)', marginBottom: 10 }} />
          <Skeleton width={180} height={20} borderRadius={6} style={{ background: 'rgba(255,255,255,0.12)', marginBottom: 8 }} />
          <Skeleton width={120} height={12} borderRadius={4} style={{ background: 'rgba(255,255,255,0.08)' }} />
        </div>
        {/* Section cycles */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <Skeleton width={70} height={12} borderRadius={4} />
            <Skeleton width={40} height={12} borderRadius={4} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2].map(i => (
              <div key={i} style={{ background: 'white', borderRadius: 14, padding: '1.1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton width={140} height={15} borderRadius={5} />
                  <Skeleton width={80}  height={11} borderRadius={4} />
                </div>
                <Skeleton width={16} height={24} borderRadius={4} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Skeleton
