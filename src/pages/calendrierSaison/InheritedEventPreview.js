import React from 'react'
import { TYPES } from './constants'

/* ── Aperçu en lecture seule d'un évènement (utilisé pour les évènements
     hérités d'un groupe parent, cliqués depuis la grille principale — pas de
     dépendance aux helpers internes de WeekZoomModal, volontairement simple). */
export function InheritedEventPreview({ evt, blocs, onClose }) {
  const titre = evt.type === 'entrainement' ? (evt.style || evt.titre || 'Entraînement')
    : evt.type === 'muscu' ? (evt.titre || 'Musculation')
    : (evt.titre || TYPES[evt.type]?.label || 'Séance')

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 120 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '8vh', left: '50%', transform: 'translateX(-50%)', width: 'min(520px, 94vw)', maxHeight: '82vh', zIndex: 121, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 28px 90px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {TYPES[evt.type]?.label || evt.type} · groupe principal
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titre}</div>
          </div>
          {evt.heure && <span style={{ fontSize: '.85rem', fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.15)', borderRadius: 7, padding: '4px 10px', flexShrink: 0 }}>{String(evt.heure).slice(0, 5)}</span>}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', borderRadius: 8, width: 30, height: 30, fontSize: '1.1rem', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>×</button>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto' }}>
          {(blocs || []).length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '.85rem', textAlign: 'center', margin: 0 }}>Aucun détail pour cet évènement.</p>
          ) : blocs.map((bloc, i) => (
            <div key={bloc.id || i} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: '.72rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 6px' }}>
                {bloc.nom || `Bloc ${i + 1}`}{bloc.duree ? ` · ${bloc.duree}` : ''}
              </p>
              {(bloc.exos || []).length === 0 ? (
                <p style={{ fontSize: '.8rem', color: '#6b7280', margin: 0 }}>—</p>
              ) : bloc.exos.map((ex, j) => (
                <div key={ex.id || j} style={{ fontSize: '.85rem', color: '#1f2937', padding: '4px 0', borderBottom: j < bloc.exos.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  {ex.nom}{ex.series ? ` — ${ex.series}×${ex.repetitions || ''}` : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
