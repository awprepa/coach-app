import React from 'react'
import { TYPES } from './constants'

export function clipLabel(e) {
  if (!e) return ''
  if (e.type === 'match') return e.adversaire || 'Match'
  if (e.type === 'entrainement') return e.style || e.titre || 'Entraînement'
  return e.titre || (TYPES[e.type]?.label) || 'Évènement'
}
export function formatPopDate(dateISO) {
  if (!dateISO) return ''
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Parse durée libre → minutes (ex: "30 min", "1h30", "45", "5'")
export function parseDurMin(s) {
  if (!s) return null
  const str = String(s).toLowerCase().trim()
  const hm = str.match(/(\d+)\s*h\s*(\d*)/)
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2] || 0)
  const m = str.match(/(\d+)\s*m/)
  if (m) return parseInt(m[1])
  const apos = str.match(/^(\d+)\s*['′']/)
  if (apos) return parseInt(apos[1])
  const n = str.match(/^(\d+)$/)
  if (n) return parseInt(n[1])
  return null
}

/* ── Helpers séquences (SeanceModal + WeekZoomModal) ── */
export function formatSeqDur(sec) {
  if (!sec) return '?'
  const m = Math.floor(sec/60), s = sec%60
  if (m === 0) return `${s}''`
  if (s === 0) return `${m}'`
  return `${m}'${String(s).padStart(2,'0')}`
}
export function calcJeuEffectif(seqs) {
  const total = (seqs||[]).filter(s=>s.type==='jeu').reduce((acc,s)=>acc+(s.duree_sec||0),0)
  return formatSeqDur(total)
}
export function calcDureeBloc(seqs) {
  const total = (seqs||[]).reduce((acc,s)=>acc+(s.duree_sec||0),0)
  return formatSeqDur(total)
}
