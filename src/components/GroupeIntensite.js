import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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

const DIM_META = [
  { key: 'cardio',  label: 'Cardio',  col: '#0ea5e9' },
  { key: 'jambes',  label: 'Jambes',  col: '#8b5cf6' },
  { key: 'contact', label: 'Contact', col: '#ef4444' },
]

export default function GroupeIntensite({ groupeId, accent = '#333333' }) {
  const [sessions, setSessions] = useState([])   // [{ evId, date, titre, moyenne, cardio, jambes, contact, notes:[] }]
  const [mode, setMode]         = useState('moyenne') // 'moyenne' | 'separe'
  const [selected, setSelected] = useState(null) // evId
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // Séances terrain du groupe
      const { data: evs } = await supabase
        .from('groupe_evenements')
        .select('id, titre, date, type')
        .eq('groupe_id', groupeId)
        .eq('type', 'entrainement')
        .order('date', { ascending: true })
      if (!evs?.length) { setSessions([]); setLoading(false); return }

      // Notes RPE + noms des joueurs
      const { data: notes } = await supabase
        .from('groupe_seance_rpe')
        .select('evenement_id, rpe_cardio, rpe_jambes, rpe_contact, commentaire, clients(prenom, nom)')
        .in('evenement_id', evs.map(e => e.id))

      const byEv = {}
      for (const n of (notes || [])) {
        if (!byEv[n.evenement_id]) byEv[n.evenement_id] = []
        byEv[n.evenement_id].push(n)
      }

      const rows = evs
        .map(ev => {
          const ns = byEv[ev.id] || []
          if (!ns.length) return null // pas encore de note → pas de point
          const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
          const cardio  = avg(ns.map(n => n.rpe_cardio).filter(v => v != null))
          const jambes  = avg(ns.map(n => n.rpe_jambes).filter(v => v != null))
          const contact = avg(ns.map(n => n.rpe_contact).filter(v => v != null))
          const perPlayer = ns.map(n => avg([n.rpe_cardio, n.rpe_jambes, n.rpe_contact].filter(v => v != null)))
          const moyenne = avg(perPlayer.filter(v => v != null))
          const r1 = x => x == null ? null : Math.round(x * 10) / 10
          return {
            evId: ev.id, date: ev.date, titre: ev.titre || 'Entraînement',
            moyenne: r1(moyenne), cardio: r1(cardio), jambes: r1(jambes), contact: r1(contact),
            nbNotes: ns.length, notes: ns,
          }
        })
        .filter(Boolean)

      setSessions(rows)
      setLoading(false)
    }
    load()
  }, [groupeId])

  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const selectedSession = sessions.find(s => s.evId === selected)

  if (loading) return <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.5rem 0' }}>Chargement…</p>

  if (!sessions.length) return (
    <div style={{ background: 'white', borderRadius: 14, padding: '1.5rem', textAlign: 'center', border: '1px solid #f3f4f6' }}>
      <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
        Aucune note d'intensité pour l'instant.<br />Les notes des joueurs apparaîtront ici après leurs entraînements terrain.
      </p>
    </div>
  )

  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '1rem', border: '1px solid #f3f4f6' }}>
      {/* Bascule moyenne / séparé */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem' }}>
        {[{ k: 'moyenne', l: 'Moyenne' }, { k: 'separe', l: '3 dimensions' }].map(t => (
          <button key={t.k} onClick={() => setMode(t.k)}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${mode === t.k ? accent : '#e5e7eb'}`,
              background: mode === t.k ? accent : 'white',
              color: mode === t.k ? '#fff' : '#6b7280',
            }}>
            {t.l}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={sessions} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
          onClick={e => { const p = e?.activePayload?.[0]?.payload; if (p) setSelected(p.evId) }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.titre || ''}
            formatter={(v, name) => [v, name]}
            contentStyle={{ fontSize: '0.75rem', borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          {mode === 'moyenne' ? (
            <Line type="monotone" dataKey="moyenne" name="Intensité moy." stroke={accent} strokeWidth={2.5}
              dot={{ r: 4, fill: accent }} activeDot={{ r: 6 }} />
          ) : (
            DIM_META.map(d => (
              <Line key={d.key} type="monotone" dataKey={d.key} name={d.label} stroke={d.col} strokeWidth={2}
                dot={{ r: 3, fill: d.col }} activeDot={{ r: 5 }} />
            ))
          )}
        </LineChart>
      </ResponsiveContainer>

      <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0.4rem 0 0', textAlign: 'center' }}>
        Touche un entraînement pour voir le détail des joueurs
      </p>

      {/* Détail d'une séance sélectionnée */}
      {selectedSession && (
        <div style={{ marginTop: '0.9rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: '#1a1a1a' }}>{selectedSession.titre}</p>
              <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>
                {fmtDate(selectedSession.date)} · {selectedSession.nbNotes} joueur{selectedSession.nbNotes > 1 ? 's' : ''} · moyenne {selectedSession.moyenne}/10
              </p>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {selectedSession.notes.map((n, i) => {
              const nom = `${n.clients?.prenom || ''} ${n.clients?.nom || ''}`.trim() || 'Joueur'
              return (
                <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '0.6rem 0.7rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.83rem', color: '#374151' }}>{nom}</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {DIM_META.map(d => {
                        const val = n[`rpe_${d.key}`]
                        return (
                          <span key={d.key} title={d.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: noteColor(val) + '1a', color: noteColor(val), borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 800 }}>
                            {d.label[0]} {val ?? '—'}
                          </span>
                        )
                      })}
                    </div>
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
        </div>
      )}
    </div>
  )
}
