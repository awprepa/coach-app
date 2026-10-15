import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// Couleur d'une note 0-10 (vert → rouge)
function noteColor(n) {
  if (n == null) return '#9ca3af'
  if (n <= 2) return '#22c55e'
  if (n <= 4) return '#84cc16'
  if (n <= 6) return '#eab308'
  if (n <= 8) return '#f97316'
  return '#ef4444'
}

const COUL_MATCH = '#2563eb'
const TENDANCE_N = 4 // moyenne glissante sur les 4 dernières séances

function InfoBulle({ active, payload, mode, dims = [] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const date = new Date(p.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.55rem 0.7rem', boxShadow: '0 6px 20px rgba(0,0,0,0.08)', fontSize: '0.76rem', minWidth: 150 }}>
      <p style={{ margin: 0, fontWeight: 800, color: '#1a1a1a' }}>{p.titre}</p>
      <p style={{ margin: '0.1rem 0 0.4rem', color: '#6b7280' }}>{date} · {p.nbNotes} note{p.nbNotes > 1 ? 's' : ''}</p>
      {mode === 'moyenne' ? (
        <>
          <p style={{ margin: 0, color: '#374151' }}>Intensité <strong style={{ color: '#1a1a1a' }}>{p.moyenne}/10</strong></p>
          {p.tendance != null && <p style={{ margin: '0.1rem 0 0', color: '#6b7280' }}>Tendance {p.tendance}/10</p>}
        </>
      ) : DIM_META.filter(d => dims.includes(d.key)).map(d => (
        <p key={d.key} style={{ margin: '0.1rem 0 0', color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 2, background: d.col, display: 'inline-block' }} />{d.label} <strong style={{ color: '#1a1a1a' }}>{p[d.key] ?? '–'}</strong>
        </p>
      ))}
    </div>
  )
}

const DIM_META = [
  // `court` sert aux badges : « Cardio » et « Contact » commencent tous deux par
  // un C, une initiale seule était ambiguë.
  { key: 'cardio',  label: 'Cardio',  court: 'Car', col: '#0ea5e9' },
  { key: 'jambes',  label: 'Jambes',  court: 'Jam', col: '#8b5cf6' },
  { key: 'contact', label: 'Contact', court: 'Con', col: '#ef4444' },
]

export default function GroupeIntensite({ groupeId, accent = '#333333' }) {
  const [sessions, setSessions] = useState([])   // [{ evId, date, titre, moyenne, cardio, jambes, contact, notes:[] }]
  const [mode, setMode]         = useState('moyenne') // 'moyenne' | 'separe'
  const [dims, setDims]         = useState(['cardio', 'jambes', 'contact']) // dimensions affichées en mode 3 dimensions
  const [tendanceOn, setTendanceOn] = useState(true)
  const [selected, setSelected] = useState(null) // evId
  const [membres, setMembres]   = useState([])   // pour savoir qui n'a pas répondu
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // Séances terrain du groupe
      const { data: evs } = await supabase
        .from('groupe_evenements')
        .select('id, titre, date, type, adversaire')
        .eq('groupe_id', groupeId)
        .in('type', ['entrainement', 'match'])
        .order('date', { ascending: true })
      if (!evs?.length) { setSessions([]); setLoading(false); return }

      // Notes RPE + noms des joueurs. client_id sert à repérer qui n'a pas répondu.
      const [{ data: notes }, { data: mbs }] = await Promise.all([
        supabase
          .from('groupe_seance_rpe')
          .select('evenement_id, client_id, rpe_cardio, rpe_jambes, rpe_contact, absent, commentaire, clients(prenom, nom)')
          .in('evenement_id', evs.map(e => e.id)),
        supabase
          .from('groupe_membres')
          .select('client_id, clients(prenom, nom)')
          .eq('groupe_id', groupeId),
      ])
      setMembres((mbs || []).map(m => ({ id: m.client_id, ...(m.clients || {}) })))

      const byEv = {}
      for (const n of (notes || [])) {
        if (!byEv[n.evenement_id]) byEv[n.evenement_id] = []
        byEv[n.evenement_id].push(n)
      }

      const rows = evs
        .map(ev => {
          const ns = byEv[ev.id] || []
          if (!ns.length) return null // pas encore de note → pas de point
          // Les absents ne comptent pas dans les moyennes d'intensité.
          const presents = ns.filter(n => !n.absent)
          const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
          const cardio  = avg(presents.map(n => n.rpe_cardio).filter(v => v != null))
          const jambes  = avg(presents.map(n => n.rpe_jambes).filter(v => v != null))
          const contact = avg(presents.map(n => n.rpe_contact).filter(v => v != null))
          const perPlayer = presents.map(n => avg([n.rpe_cardio, n.rpe_jambes, n.rpe_contact].filter(v => v != null)))
          const moyenne = avg(perPlayer.filter(v => v != null))
          const r1 = x => x == null ? null : Math.round(x * 10) / 10
          return {
            evId: ev.id, date: ev.date, type: ev.type, titre: ev.titre || (ev.type === 'match' ? (ev.adversaire ? `Match contre ${ev.adversaire}` : 'Match') : 'Entraînement'),
            moyenne: r1(moyenne), cardio: r1(cardio), jambes: r1(jambes), contact: r1(contact),
            nbNotes: presents.length, nbAbsents: ns.length - presents.length, notes: ns,
          }
        })
        .filter(Boolean)

      // Tendance : moyenne des TENDANCE_N dernières séances notées
      const glissante = (i, cle) => {
        const fen = rows.slice(Math.max(0, i - TENDANCE_N + 1), i + 1).map(x => x[cle]).filter(v => v != null)
        return fen.length >= 2 ? Math.round((fen.reduce((a, b) => a + b, 0) / fen.length) * 10) / 10 : null
      }
      rows.forEach((r, i) => {
        r.tendance = glissante(i, 'moyenne')
        DIM_META.forEach(d => { r[`tendance_${d.key}`] = glissante(i, d.key) })
      })
      setSessions(rows)
      setLoading(false)
    }
    load()
  }, [groupeId])

  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const selectedSession = sessions.find(s => s.evId === selected)

  if (loading) return <p style={{ color: '#6b7280', fontSize: '0.85rem', padding: '0.5rem 0' }}>Chargement…</p>

  if (!sessions.length) return (
    <div style={{ background: 'white', borderRadius: 14, padding: '1.5rem', textAlign: 'center', border: '1px solid #f3f4f6' }}>
      <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
        Aucune note d'intensité pour l'instant.<br />Les notes des joueurs apparaîtront ici après leurs entraînements terrain.
      </p>
    </div>
  )

  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '1rem', border: '1px solid #f3f4f6' }}>
      {/* Bascule moyenne / séparé */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ k: 'moyenne', l: 'Moyenne' }, { k: 'separe', l: '3 dimensions' }].map(t => (
          <button key={t.k} onClick={() => setMode(t.k)}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${mode === t.k ? '#333333' : '#e5e7eb'}`,
              background: mode === t.k ? '#333333' : 'white',
              color: mode === t.k ? '#e4f816' : '#6b7280',
            }}>
            {t.l}
          </button>
        ))}
        <button onClick={() => setTendanceOn(v => !v)} aria-pressed={tendanceOn}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            border: '1.5px solid #e5e7eb', background: 'white', color: tendanceOn ? '#1a1a1a' : '#6b7280' }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${tendanceOn ? '#333333' : '#cbd5e1'}`, background: tendanceOn ? '#333333' : 'white', display: 'grid', placeItems: 'center' }}>
            {tendanceOn && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e4f816" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
          </span>
          Tendance
        </button>
      </div>
      {mode === 'separe' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {DIM_META.map(d => {
            const on = dims.includes(d.key)
            return (
              <button key={d.key} aria-pressed={on}
                onClick={() => setDims(prev => on ? (prev.length > 1 ? prev.filter(k => k !== d.key) : prev) : [...prev, d.key])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${on ? d.col : '#e5e7eb'}`, background: on ? d.col + '14' : 'white', color: on ? '#1a1a1a' : '#6b7280' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? d.col : '#cbd5e1' }} />{d.label}
              </button>
            )
          })}
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={sessions} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}
          onClick={e => { const p = e?.activePayload?.[0]?.payload; if (p) setSelected(p.evId) }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }} minTickGap={24} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<InfoBulle mode={mode} dims={dims} />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
          {mode === 'moyenne' ? (
            <>
              {tendanceOn && (
                <Line type="monotone" dataKey="tendance" name="Tendance" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4"
                  dot={false} activeDot={false} connectNulls isAnimationActive={false} />
              )}
              <Line type="linear" dataKey="moyenne" name="Intensité" stroke="#333333" strokeWidth={1.75} isAnimationActive={false}
                dot={props => {
                  const { cx, cy, payload, index } = props
                  if (cx == null || cy == null) return <g key={index} />
                  const sel = payload.evId === selected
                  if (payload.type === 'match') {
                    return <circle key={index} cx={cx} cy={cy} r={sel ? 5 : 3.5} fill="white" stroke={COUL_MATCH} strokeWidth={2} />
                  }
                  return <circle key={index} cx={cx} cy={cy} r={sel ? 4.5 : 2.5} fill={sel ? accent : '#333333'} stroke={sel ? 'white' : 'none'} strokeWidth={sel ? 1.5 : 0} />
                }}
                activeDot={{ r: 4.5, fill: '#333333', stroke: 'white', strokeWidth: 1.5 }} />
            </>
          ) : (
            DIM_META.filter(d => dims.includes(d.key)).flatMap(d => [
              <Line key={d.key} type="linear" dataKey={d.key} name={d.label} stroke={d.col} strokeWidth={1.75}
                dot={{ r: 2, fill: d.col, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />,
              tendanceOn && (
                <Line key={`t-${d.key}`} type="monotone" dataKey={`tendance_${d.key}`} name={`Tendance ${d.label}`} stroke={d.col}
                  strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
              ),
            ].filter(Boolean))
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Légende */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', margin: '0.35rem 0 0', fontSize: '0.72rem', color: '#6b7280', fontWeight: 600 }}>
        {mode === 'moyenne' ? (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#333333' }} />Entraînement</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', border: `2px solid ${COUL_MATCH}`, boxSizing: 'border-box' }} />Match</span>
            {tendanceOn && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, borderTop: '2px dashed #94a3b8' }} />Tendance ({TENDANCE_N} séances)</span>}
          </>
        ) : (
          <>
            {DIM_META.filter(d => dims.includes(d.key)).map(d => (
              <span key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 2, background: d.col }} />{d.label}</span>
            ))}
            {tendanceOn && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, borderTop: '2px dashed #94a3b8' }} />Tendance ({TENDANCE_N} séances)</span>}
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>Effort ressenti sur 10</span>
      </div>

      {/* Sélecteur d'entraînement — plus simple que viser un point du graphique */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0.7rem 0 0.2rem', scrollbarWidth: 'none' }}>
        {[...sessions].reverse().map(s => {
          const on = s.evId === selected
          return (
            <button key={s.evId} onClick={() => setSelected(s.evId)}
              style={{
                flexShrink: 0, cursor: 'pointer', borderRadius: 9, padding: '5px 10px',
                border: `1.5px solid ${on ? '#1a1a1a' : '#e5e7eb'}`,
                background: on ? '#1a1a1a' : 'white', color: on ? 'white' : '#374151',
                fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}>
              {fmtDate(s.date)}
              <span style={{ opacity: 0.65, fontWeight: 600 }}> · {s.nbNotes}{membres.length ? `/${membres.length}` : ''}</span>
            </button>
          )
        })}
      </div>

      {/* Détail d'une séance sélectionnée */}
      {selectedSession && (
        <div style={{ marginTop: '0.9rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: '#1a1a1a' }}>{selectedSession.titre}</p>
              <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#6b7280' }}>
                {fmtDate(selectedSession.date)} · {selectedSession.nbNotes} noté{selectedSession.nbNotes > 1 ? 's' : ''}
                {selectedSession.moyenne != null && ` · moyenne ${selectedSession.moyenne}/10`}
                {selectedSession.nbAbsents > 0 && ` · ${selectedSession.nbAbsents} absent${selectedSession.nbAbsents > 1 ? 's' : ''}`}
              </p>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {selectedSession.notes.map((n, i) => {
              const nom = `${n.clients?.prenom || ''} ${n.clients?.nom || ''}`.trim() || 'Joueur'
              return (
                <div key={i} style={{ background: n.absent ? '#fef2f2' : '#f9fafb', borderRadius: 10, padding: '0.6rem 0.7rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.83rem', color: n.absent ? '#b91c1c' : '#374151' }}>{nom}</span>
                    {n.absent ? (
                      <span style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 800 }}>Absent</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 5 }}>
                        {DIM_META.map(d => {
                          const val = n[`rpe_${d.key}`]
                          return (
                            <span key={d.key} title={d.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: noteColor(val) + '1a', color: noteColor(val), borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 800 }}>
                              {d.court} {val ?? '—'}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {n.commentaire && (
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.45, fontStyle: 'italic' }}>
                      « {n.commentaire} »
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Qui n'a pas répondu — utile pour relancer */}
          {(() => {
            const repondus = new Set(selectedSession.notes.map(n => n.client_id))
            const manquants = membres.filter(m => !repondus.has(m.id))
            if (!membres.length || !manquants.length) return null
            return (
              <div style={{ marginTop: '0.7rem', borderTop: '1px dashed #e5e7eb', paddingTop: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pas encore répondu ({manquants.length})
                </p>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
                  {manquants.map(m => `${m.prenom || ''} ${m.nom || ''}`.trim()).filter(Boolean).join(' · ')}
                </p>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
