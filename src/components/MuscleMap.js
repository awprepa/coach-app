import { useState } from 'react'
import { MUSCLES } from '../data/muscleData'

// Colors
const COLOR_PRIMARY   = '#dc2626'
const COLOR_SECONDARY = '#f97316'
const COLOR_INACTIVE  = '#e5e7eb'
const COLOR_BODY      = '#e5e7eb'

// Which muscles appear on front / back
const FRONT_MUSCLES = Object.entries(MUSCLES)
  .filter(([, v]) => v.view === 'front' || v.view === 'both')
  .map(([k]) => k)

const BACK_MUSCLES = Object.entries(MUSCLES)
  .filter(([, v]) => v.view === 'back' || v.view === 'both')
  .map(([k]) => k)

function getMuscleColor(key, primary, secondary, interactive) {
  if (primary.includes(key)) return { fill: COLOR_PRIMARY, opacity: 0.85 }
  if (secondary.includes(key)) return { fill: COLOR_SECONDARY, opacity: 0.75 }
  return { fill: COLOR_INACTIVE, opacity: interactive ? 0.4 : 0 }
}

// SVG body silhouette paths (shared between front and back)
function BodySilhouette() {
  return (
    <>
      <circle cx="50" cy="16" r="12" fill={COLOR_BODY} />
      <rect x="44" y="27" width="12" height="10" rx="3" fill={COLOR_BODY} />
      <path d="M 28,37 Q 14,42 13,60 L 12,125 Q 14,133 24,136 L 26,162 L 74,162 L 76,136 Q 86,133 88,125 L 87,60 Q 86,42 72,37 Z" fill={COLOR_BODY} />
      <ellipse cx="10" cy="78" rx="6" ry="20" fill={COLOR_BODY} />
      <ellipse cx="7" cy="115" rx="5" ry="16" fill={COLOR_BODY} />
      <ellipse cx="90" cy="78" rx="6" ry="20" fill={COLOR_BODY} />
      <ellipse cx="93" cy="115" rx="5" ry="16" fill={COLOR_BODY} />
      <ellipse cx="36" cy="186" rx="16" ry="26" fill={COLOR_BODY} />
      <ellipse cx="64" cy="186" rx="16" ry="26" fill={COLOR_BODY} />
      <ellipse cx="34" cy="234" rx="11" ry="20" fill={COLOR_BODY} />
      <ellipse cx="66" cy="234" rx="11" ry="20" fill={COLOR_BODY} />
    </>
  )
}

function FrontMuscles({ primary, secondary, interactive, onClickMuscle }) {
  const muscleList = [
    { key: 'pectoraux',  shapes: [
      { type: 'ellipse', cx: 36, cy: 58, rx: 11, ry: 9 },
      { type: 'ellipse', cx: 64, cy: 58, rx: 11, ry: 9 },
    ]},
    { key: 'epaules', shapes: [
      { type: 'ellipse', cx: 20, cy: 47, rx: 8, ry: 8 },
      { type: 'ellipse', cx: 80, cy: 47, rx: 8, ry: 8 },
    ]},
    { key: 'biceps', shapes: [
      { type: 'ellipse', cx: 10, cy: 74, rx: 5, ry: 13 },
      { type: 'ellipse', cx: 90, cy: 74, rx: 5, ry: 13 },
    ]},
    { key: 'avant_bras', shapes: [
      { type: 'ellipse', cx: 7,  cy: 112, rx: 4, ry: 10 },
      { type: 'ellipse', cx: 93, cy: 112, rx: 4, ry: 10 },
    ]},
    { key: 'abdominaux', shapes: [
      { type: 'rect', x: 41, y: 72, width: 18, height: 30, rx: 5 },
    ]},
    { key: 'obliques', shapes: [
      { type: 'ellipse', cx: 29, cy: 88, rx: 7, ry: 17 },
      { type: 'ellipse', cx: 71, cy: 88, rx: 7, ry: 17 },
    ]},
    { key: 'quadriceps', shapes: [
      { type: 'ellipse', cx: 36, cy: 186, rx: 14, ry: 24 },
      { type: 'ellipse', cx: 64, cy: 186, rx: 14, ry: 24 },
    ]},
    { key: 'mollets', shapes: [
      { type: 'ellipse', cx: 34, cy: 236, rx: 8, ry: 14 },
      { type: 'ellipse', cx: 66, cy: 236, rx: 8, ry: 14 },
    ]},
  ]

  return (
    <>
      {muscleList.filter(m => FRONT_MUSCLES.includes(m.key)).map(m => {
        const { fill, opacity } = getMuscleColor(m.key, primary, secondary, interactive)
        const cursor = interactive ? 'pointer' : 'default'
        return m.shapes.map((s, si) => {
          if (s.type === 'ellipse') {
            return (
              <ellipse key={`${m.key}-${si}`}
                cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry}
                fill={fill} opacity={opacity}
                style={{ cursor }}
                onClick={() => interactive && onClickMuscle(m.key)}
              />
            )
          }
          return (
            <rect key={`${m.key}-${si}`}
              x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx}
              fill={fill} opacity={opacity}
              style={{ cursor }}
              onClick={() => interactive && onClickMuscle(m.key)}
            />
          )
        })
      })}
    </>
  )
}

function BackMuscles({ primary, secondary, interactive, onClickMuscle }) {
  const muscleList = [
    { key: 'trapezes', shapes: [
      { type: 'path', d: 'M 28,38 L 50,52 L 72,38 L 68,62 L 50,68 L 32,62 Z' },
    ]},
    { key: 'epaules', shapes: [
      { type: 'ellipse', cx: 20, cy: 47, rx: 8, ry: 8 },
      { type: 'ellipse', cx: 80, cy: 47, rx: 8, ry: 8 },
    ]},
    { key: 'dorsaux', shapes: [
      { type: 'ellipse', cx: 31, cy: 97, rx: 13, ry: 28 },
      { type: 'ellipse', cx: 69, cy: 97, rx: 13, ry: 28 },
    ]},
    { key: 'triceps', shapes: [
      { type: 'ellipse', cx: 10, cy: 82, rx: 5, ry: 16 },
      { type: 'ellipse', cx: 90, cy: 82, rx: 5, ry: 16 },
    ]},
    { key: 'lombaires', shapes: [
      { type: 'ellipse', cx: 50, cy: 133, rx: 14, ry: 12 },
    ]},
    { key: 'fessiers', shapes: [
      { type: 'ellipse', cx: 35, cy: 168, rx: 18, ry: 15 },
      { type: 'ellipse', cx: 65, cy: 168, rx: 18, ry: 15 },
    ]},
    { key: 'ischio_jambiers', shapes: [
      { type: 'ellipse', cx: 36, cy: 198, rx: 14, ry: 22 },
      { type: 'ellipse', cx: 64, cy: 198, rx: 14, ry: 22 },
    ]},
    { key: 'mollets', shapes: [
      { type: 'ellipse', cx: 34, cy: 234, rx: 10, ry: 18 },
      { type: 'ellipse', cx: 66, cy: 234, rx: 10, ry: 18 },
    ]},
  ]

  return (
    <>
      {muscleList.filter(m => BACK_MUSCLES.includes(m.key)).map(m => {
        const { fill, opacity } = getMuscleColor(m.key, primary, secondary, interactive)
        const cursor = interactive ? 'pointer' : 'default'
        return m.shapes.map((s, si) => {
          if (s.type === 'ellipse') {
            return (
              <ellipse key={`${m.key}-${si}`}
                cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry}
                fill={fill} opacity={opacity}
                style={{ cursor }}
                onClick={() => interactive && onClickMuscle(m.key)}
              />
            )
          }
          if (s.type === 'path') {
            return (
              <path key={`${m.key}-${si}`}
                d={s.d}
                fill={fill} opacity={opacity}
                style={{ cursor }}
                onClick={() => interactive && onClickMuscle(m.key)}
              />
            )
          }
          return null
        })
      })}
    </>
  )
}

export default function MuscleMap({
  primary = [],
  secondary = [],
  interactive = false,
  onChange = null,
  size = 160,
}) {
  const [showBack, setShowBack] = useState(false)
  // Internal state for interactive mode
  const [intPrimary, setIntPrimary] = useState(primary)
  const [intSecondary, setIntSecondary] = useState(secondary)

  // Use internal state when interactive, props when not
  const displayPrimary   = interactive ? intPrimary   : primary
  const displaySecondary = interactive ? intSecondary : secondary

  function handleClickMuscle(key) {
    if (!interactive) return
    let newPrimary   = [...intPrimary]
    let newSecondary = [...intSecondary]

    if (newPrimary.includes(key)) {
      // primary → secondary
      newPrimary = newPrimary.filter(k => k !== key)
      newSecondary = [...newSecondary.filter(k => k !== key), key]
    } else if (newSecondary.includes(key)) {
      // secondary → inactive
      newSecondary = newSecondary.filter(k => k !== key)
    } else {
      // inactive → primary
      newPrimary = [...newPrimary, key]
    }

    setIntPrimary(newPrimary)
    setIntSecondary(newSecondary)
    if (onChange) onChange({ primary: newPrimary, secondary: newSecondary })
  }

  const btnBase = {
    border: 'none',
    borderRadius: '999px',
    padding: '0.2rem 0.7rem',
    fontSize: '0.7rem',
    fontWeight: '700',
    cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
      <svg
        viewBox="0 0 100 270"
        width={size}
        height={size * 270 / 100}
        style={{ display: 'block' }}
      >
        <BodySilhouette />
        {showBack
          ? <BackMuscles  primary={displayPrimary} secondary={displaySecondary} interactive={interactive} onClickMuscle={handleClickMuscle} />
          : <FrontMuscles primary={displayPrimary} secondary={displaySecondary} interactive={interactive} onClickMuscle={handleClickMuscle} />
        }
      </svg>

      {/* Toggle avant / arrière */}
      <div style={{ display: 'flex', gap: '0.3rem' }}>
        <button
          style={{ ...btnBase, background: !showBack ? '#333333' : '#f3f4f6', color: !showBack ? 'var(--accent)' : '#374151' }}
          onClick={() => setShowBack(false)}
        >Avant</button>
        <button
          style={{ ...btnBase, background: showBack ? '#333333' : '#f3f4f6', color: showBack ? 'var(--accent)' : '#374151' }}
          onClick={() => setShowBack(true)}
        >Arrière</button>
      </div>

      {/* Légende */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.65rem', color: '#6b7280', fontWeight: '600' }}>
        <span><span style={{ color: COLOR_PRIMARY, fontSize: '0.75rem' }}>●</span> Primaire</span>
        <span><span style={{ color: COLOR_SECONDARY, fontSize: '0.75rem' }}>●</span> Secondaire</span>
      </div>
    </div>
  )
}
