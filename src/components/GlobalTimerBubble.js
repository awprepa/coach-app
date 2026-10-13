import { useNavigate } from 'react-router-dom'
import { useTimer } from '../context/TimerContext'
import Icon from './Icon'
import T from '../theme/tokens'

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
      role="timer" aria-live="off"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 130px)',
        right: 12,
        zIndex: 999,
        background: isDone ? T.color.success : T.color.anthracite,
        borderRadius: 999,
        padding: '4px 4px 4px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: T.shadow.float,
        cursor: seanceId ? 'pointer' : 'default',
        userSelect: 'none',
        fontFamily: T.font.body,
      }}
    >
      {/* Texte */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: isDone ? T.color.card : T.color.onDarkMuted,
          lineHeight: 1, marginBottom: 2,
        }}>
          {isDone ? 'Récup terminée' : 'Récup'}
        </div>
        <div style={{
          fontFamily: T.font.display, fontVariantNumeric: 'tabular-nums',
          fontSize: T.size.xxl, fontWeight: 700, lineHeight: 1,
          color: isDone ? T.color.card : T.color.signal,
        }}>
          {isDone ? 'Go' : fmt(timerSecs)}
        </div>
      </div>

      {/* Barre de progression */}
      {!isDone && (
        <div style={{
          width: 42, height: 4,
          background: 'rgb(255 255 255 / .15)',
          borderRadius: 999, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', background: T.color.signal,
            borderRadius: 999,
            width: `${pct}%`,
            transition: 'width 0.5s linear',
          }} />
        </div>
      )}

      {/* Bouton fermer */}
      <button
        onClick={e => { e.stopPropagation(); stopTimer() }}
        aria-label="Arrêter le minuteur"
        style={{
          background: 'rgb(255 255 255 / .12)',
          border: 'none', color: T.color.onDark,
          width: 40, height: 40, borderRadius: '50%',
          cursor: 'pointer',
          display: 'grid', placeItems: 'center',
          flexShrink: 0,
        }}
      ><Icon name="x" size={16} /></button>
    </div>
  )
}
