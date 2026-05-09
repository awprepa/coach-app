import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function newId() { return Math.random().toString(36).slice(2) }

function SectionLabel({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 0 1rem' }}>
      <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#e4f816', textTransform: 'uppercase', letterSpacing: '0.16em', whiteSpace: 'nowrap' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(228,248,22,0.18)' }} />
    </div>
  )
}

export default function SeanceProjection() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: exs }] = await Promise.all([
      supabase.from('seances').select('*, programmes(id, nom)').eq('id', id).single(),
      supabase.from('exercices').select('*').eq('seance_id', id).order('ordre', { ascending: true }),
    ])
    setSeance(s)
    setExercices(exs || [])
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'sans-serif', fontSize: '1rem' }}>Chargement...</p>
    </div>
  )
  if (!seance) return null

  const echauffement = seance.echauffement || []

  // Grouper les exercices par lettre (supersets)
  const groups = []
  exercices.forEach(ex => {
    const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
    const last = groups[groups.length - 1]
    if (letter && last?.letter === letter) last.items.push(ex)
    else groups.push({ letter, items: [ex] })
  })

  // Grouper l'échauffement par groupe
  const warmGroups = []
  echauffement.forEach(l => {
    const last = warmGroups[warmGroups.length - 1]
    if (l.groupe && last?.groupe === l.groupe) last.items.push(l)
    else warmGroups.push({ groupe: l.groupe, items: [l] })
  })

  const COLS = '100px 1fr 90px 110px 90px 100px 130px'

  return (
    <div style={P.page}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem' }}>
        <div>
          <p style={{ fontSize: '0.78rem', fontWeight: '800', color: '#e4f816', textTransform: 'uppercase', letterSpacing: '0.16em', margin: '0 0 0.5rem' }}>
            {seance.programmes?.nom}
          </p>
          <h1 style={{ fontSize: '3rem', fontWeight: '900', color: 'white', margin: 0, lineHeight: 1.05 }}>{seance.nom}</h1>
        </div>
        <button onClick={() => navigate(-1)} style={P.closeBtn}>✕ Fermer</button>
      </div>

      {/* ── Échauffement ── */}
      {echauffement.length > 0 && (
        <div style={{ marginBottom: '2.75rem' }}>
          <SectionLabel>Échauffement</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {warmGroups.map((g, gi) => {
              if (!g.groupe) {
                return g.items.map((l, i) => (
                  <div key={l.id || `${gi}-${i}`} style={P.warmRow}>
                    <span style={{ flex: 1, fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{l.nom}</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#e4f816', minWidth: 100, textAlign: 'right' }}>{l.reps}</span>
                  </div>
                ))
              }
              return (
                <div key={gi} style={{ border: '1.5px solid rgba(228,248,22,0.22)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ background: 'rgba(228,248,22,0.09)', padding: '0.35rem 1.25rem' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: '900', color: '#e4f816', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Bloc {g.groupe}{g.items[0]?.tours ? ` · ${g.items[0].tours} tours` : ''}</span>
                  </div>
                  {g.items.map((l, i) => (
                    <div key={l.id || i} style={{ ...P.warmRow, borderRadius: 0, borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                      <span style={{ flex: 1, fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{l.nom}</span>
                      <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#e4f816', minWidth: 100, textAlign: 'right' }}>{l.reps}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Programme principal ── */}
      <div>
        <SectionLabel>Programme</SectionLabel>

        {/* En-têtes colonnes */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '1rem', padding: '0 1.25rem', marginBottom: '0.6rem' }}>
          {['Code', 'Exercice', 'Séries', 'Répétitions', 'Tempo', 'Récup', 'Intensité'].map(h => (
            <span key={h} style={{ fontSize: '0.6rem', fontWeight: '800', color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{h}</span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {groups.map((g, gi) => {
            const isSuperset = g.items.length > 1
            return (
              <div key={gi} style={{
                background: isSuperset ? 'rgba(228,248,22,0.05)' : 'rgba(255,255,255,0.04)',
                border: `1.5px solid ${isSuperset ? 'rgba(228,248,22,0.2)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 14, overflow: 'hidden',
              }}>
                {isSuperset && (
                  <div style={{ background: 'rgba(228,248,22,0.1)', padding: '0.3rem 1.25rem' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: '900', color: '#e4f816', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Superset · {g.letter}</span>
                  </div>
                )}
                {g.items.map((ex, i) => (
                  <div key={ex.id} style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: '1rem',
                    padding: '1rem 1.25rem', alignItems: 'center',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}>
                    <div>
                      <span style={{ background: '#e4f816', color: '#111827', padding: '0.2rem 0.6rem', borderRadius: 7, fontSize: '0.95rem', fontWeight: '900', display: 'inline-block' }}>{ex.code}</span>
                    </div>
                    <span style={{ fontSize: '1.3rem', fontWeight: '700', color: 'white' }}>{ex.nom}</span>
                    <span style={P.val}>{ex.series ? `${ex.series}×` : '—'}</span>
                    <span style={P.val}>{ex.repetitions || '—'}</span>
                    <span style={{ ...P.val, color: 'rgba(255,255,255,0.5)' }}>{ex.tempo || '—'}</span>
                    <span style={{ ...P.val, color: '#60a5fa' }}>{ex.recuperation || '—'}</span>
                    <span style={{ ...P.val, fontSize: '1rem', color: ex.type_intensite ? '#a78bfa' : 'rgba(255,255,255,0.25)' }}>
                      {ex.type_intensite ? `${ex.type_intensite}${ex.valeur_intensite ? ' · ' + ex.valeur_intensite : ''}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const P = {
  page:     { minHeight: '100vh', background: '#111827', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '3rem 4rem', boxSizing: 'border-box' },
  closeBtn: { background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)', borderRadius: 10, padding: '0.55rem 1.1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', fontFamily: 'inherit', flexShrink: 0 },
  warmRow:  { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 1.25rem', background: 'rgba(255,255,255,0.04)', borderRadius: 12 },
  val:      { fontSize: '1.15rem', fontWeight: '700', color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
}
