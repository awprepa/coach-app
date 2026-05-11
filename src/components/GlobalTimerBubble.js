import { useNavigate } from 'react-router-dom'
import { useTimer } from '../context/TimerContext'

function fmt(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function GlobalTimerBubble() {
  const { timerSecs, timerTotal, isRunning, isDone, seanceId, stopTimer } = useTimer()
  const navigate = useNavigate()

  if (!isRunning && !isDone) return null

  const pct = timerTotal > 0 ? (1 - timerSecs / timerTotal) * 100 : 100

  return (
    <div
      onClick={() => seanceId && navigate(`/client/seance/${seanceId}`)}
      style={{
        position: 'fixed',
        top: 16,
        right: 14,
        zIndex: 999,
        background: isDone ? '#14532d' : '#1a1a1a',
        borderRadius: 999,
        padding: '0.38rem 0.55rem 0.38rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
        border: `1.5px solid ${isDone ? '#22c55e' : 'rgba(228,248,22,0.35)'}`,
        cursor: seanceId ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {/* Texte */}
      <div>
        <div style={{
          fontSize: '0.52rem', fontWeight: 700,
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1,
          marginBottom: '0.1rem',
        }}>
          {isDone ? 'Terminée' : 'Récup'}
        </div>
        <div style={{
          fontSize: '1.2rem', fontWeight: 900, lineHeight: 1,
          color: isDone ? '#4ade80' : '#e4f816',
        }}>
          {isDone ? '✓ GO !' : fmt(timerSecs)}
        </div>
      </div>

      {/* Barre de progression */}
      {!isDone && (
        <div style={{
          width: 42, height: 4,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 999, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: '#e4f816',
            borderRadius: 999,
            width: `${pct}%`,
            transition: 'width 0.5s linear',
          }} />
        </div>
      )}

      {/* Bouton fermer */}
      <button
        onClick={e => { e.stopPropagation(); stopTimer() }}
        style={{
          background: 'rgba(255,255,255,0.12)',
          border: 'none', color: 'rgba(255,255,255,0.65)',
          width: 24, height: 24, borderRadius: '50%',
          fontSize: '0.65rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >✕</button>
    </div>
  )
}
