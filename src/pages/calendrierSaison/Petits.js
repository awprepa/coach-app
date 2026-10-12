import React from 'react'

/* ── Sous-composants ── */
export function Stat({ v, l, color }) {
  return <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: color || '#15181d' }}>{v}</span>
    <span style={{ fontSize: '0.64rem', color: '#9aa1ac', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{l}</span>
  </div>
}
export function Leg({ c, t }) {
  return <div style={{ fontSize: '0.64rem', color: '#5b626c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{t}
  </div>
}
