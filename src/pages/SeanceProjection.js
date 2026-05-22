import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// Palette de couleurs pour les blocs A, B, C, D...
const BLOCK_COLORS = [
  '#3b82f6', // A — bleu
  '#10b981', // B — vert
  '#f59e0b', // C — orange
  '#a78bfa', // D — violet
  '#f43f5e', // E — rose-rouge
  '#06b6d4', // F — cyan
  '#fb923c', // G — orange clair
  '#84cc16', // H — vert lime
]

function blockColor(letter) {
  if (!letter) return '#6b7280'
  const idx = letter.toUpperCase().charCodeAt(0) - 65 // A=0, B=1...
  return BLOCK_COLORS[Math.max(0, idx) % BLOCK_COLORS.length]
}

function SectionLabel({ children, accent }) {
  const color = accent || '#e4f816'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0 0 1rem' }}>
      <span style={{ fontSize: '0.65rem', fontWeight: '900', color, textTransform: 'uppercase', letterSpacing: '0.16em', whiteSpace: 'nowrap' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: color + '30' }} />
    </div>
  )
}

export default function SeanceProjection() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [club, setClub] = useState(null)   // { nom, couleur, logo_url? }
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: exs }] = await Promise.all([
      supabase.from('seances').select('*, programmes(id, nom, client_id)').eq('id', id).single(),
      supabase.from('exercices').select('*').eq('seance_id', id).order('ordre', { ascending: true }),
    ])
    setSeance(s)
    setExercices(exs || [])

    // Charger le club (catégorie) si le programme a un client
    const clientId = s?.programmes?.client_id
    if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('categorie_id, categories(id, nom, couleur, logo_url)')
        .eq('id', clientId)
        .maybeSingle()
      const cat = client?.categories
      if (cat) setClub({ nom: cat.nom, couleur: cat.couleur, logo_url: cat.logo_url || null })
    }

    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'sans-serif' }}>Chargement...</p>
    </div>
  )
  if (!seance) return null

  const ACCENT = club?.couleur || '#e4f816'
  const accentIsLight = isLightColor(ACCENT)
  const accentText = accentIsLight ? '#1a1a1a' : 'white'

  const echauffement = seance.echauffement || []

  // Grouper les exercices par lettre (supersets)
  const groups = []
  exercices.forEach(ex => {
    const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
    const last = groups[groups.length - 1]
    if (letter && last?.letter === letter) last.items.push(ex)
    else groups.push({ letter, items: [ex] })
  })

  // Grouper l'échauffement
  const warmGroups = []
  echauffement.forEach(l => {
    const last = warmGroups[warmGroups.length - 1]
    if (l.groupe && last?.groupe === l.groupe) last.items.push(l)
    else warmGroups.push({ groupe: l.groupe, items: [l] })
  })

  const COLS = '110px 1fr 80px 120px 100px 110px 150px'

  return (
    <div style={{
      minHeight: '100vh',
      background: club ? `linear-gradient(160deg, #0d1117 0%, ${ACCENT}0d 100%)` : '#0d1117',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '3rem 4rem',
      boxSizing: 'border-box',
    }}>

      {/* Bande de couleur club en haut */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}55)`, zIndex: 10 }} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.75rem', paddingTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>

          {club?.logo_url && (
            <img src={club.logo_url} alt={club.nom}
              style={{ width: 70, height: 70, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.5))' }} />
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: '900', color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>
                {seance.programmes?.nom}
              </p>
              {club && (
                <span style={{ background: ACCENT + '22', color: ACCENT, border: `1px solid ${ACCENT}44`, borderRadius: 20, padding: '0.1rem 0.6rem', fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {club.nom}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: '3rem', fontWeight: '900', color: 'white', margin: 0, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
              {seance.nom}
            </h1>
          </div>
        </div>
        <button onClick={() => navigate(-1)} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.4)', borderRadius: 10, padding: '0.55rem 1.1rem',
          cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', fontFamily: 'inherit',
        }}>✕ Fermer</button>
      </div>

      {/* ── Échauffement ── */}
      {echauffement.length > 0 && (
        <div style={{ marginBottom: '2.75rem' }}>
          <SectionLabel accent={ACCENT}>Échauffement</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {warmGroups.map((g, gi) => {
              if (!g.groupe) {
                return g.items.map((l, i) => (
                  <div key={l.id || `${gi}-${i}`} style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '0.8rem 1.25rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderLeft: `3px solid ${ACCENT}55`,
                    borderRadius: '0 10px 10px 0',
                  }}>
                    <span style={{ flex: 1, fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{l.nom}</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: '800', color: ACCENT, minWidth: 100, textAlign: 'right' }}>{l.reps}</span>
                  </div>
                ))
              }
              return (() => {
                const tours = g.items[0]?.tours
                return (
                  <div key={gi} style={{
                    display: 'flex', alignItems: 'stretch',
                    border: `1.5px solid ${ACCENT}28`, borderLeft: `3px solid ${ACCENT}`,
                    borderRadius: '0 14px 14px 0', background: ACCENT + '06',
                  }}>
                    <div style={{ flex: 1 }}>
                      {g.items.map((l, i) => (
                        <div key={l.id || i} style={{
                          display: 'flex', alignItems: 'center', gap: '1rem',
                          padding: '0.8rem 1.25rem',
                          borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        }}>
                          <span style={{ flex: 1, fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{l.nom}</span>
                          <span style={{ fontSize: '1.15rem', fontWeight: '800', color: ACCENT, minWidth: 100, textAlign: 'right' }}>{l.reps}</span>
                        </div>
                      ))}
                    </div>
                    {tours && (
                      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '0.75rem', paddingRight: '1.25rem', flexShrink: 0 }}>
                        <div style={{ borderTop: `2px solid ${ACCENT}`, borderRight: `2px solid ${ACCENT}`, borderBottom: `2px solid ${ACCENT}`, borderRadius: '0 4px 4px 0', width: 8, alignSelf: 'stretch' }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: '900', color: ACCENT, paddingLeft: '0.5rem', whiteSpace: 'nowrap' }}>{tours} tours</span>
                      </div>
                    )}
                  </div>
                )
              })()
            })}
          </div>
        </div>
      )}

      {/* ── Programme principal ── */}
      <div>
        <SectionLabel accent={ACCENT}>Programme</SectionLabel>

        {/* En-têtes colonnes */}
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '1rem', padding: '0 1.5rem', marginBottom: '0.75rem' }}>
          {['Code', 'Exercice', 'Séries', 'Répétitions', 'Tempo', 'Récup.', 'Intensité'].map((label, i) => (
            <span key={label} style={{
              fontSize: '0.58rem', fontWeight: '900',
              color: i === 0 ? ACCENT : 'rgba(255,255,255,0.22)',
              textTransform: 'uppercase', letterSpacing: '0.14em',
              textAlign: i > 1 ? 'center' : 'left', display: 'block',
            }}>{label}</span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {groups.map((g, gi) => {
            const color = blockColor(g.letter)
            const isSuperset = g.items.length > 1

            return (
              <div key={gi} style={{
                background: color + '0c',
                border: `1px solid ${color}30`,
                borderLeft: `4px solid ${color}`,
                borderRadius: '0 16px 16px 0',
                overflow: 'hidden',
              }}>
                {/* En-tête bloc (superset) */}
                {isSuperset && (
                  <div style={{ background: color + '15', padding: '0.3rem 1.5rem', borderBottom: `1px solid ${color}20` }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: '900', color, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                      Superset · {g.letter}
                    </span>
                  </div>
                )}

                {g.items.map((ex, i) => (
                  <div key={ex.id} style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: '1rem',
                    padding: '1rem 1.5rem', alignItems: 'center',
                    borderTop: i > 0 ? `1px solid ${color}15` : 'none',
                  }}>
                    {/* Code */}
                    <div>
                      <span style={{
                        background: color,
                        color: isLightColor(color) ? '#1a1a1a' : 'white',
                        padding: '0.25rem 0.7rem', borderRadius: 8,
                        fontSize: '1rem', fontWeight: '900', display: 'inline-block',
                        letterSpacing: '0.04em',
                      }}>{ex.code}</span>
                    </div>

                    {/* Nom */}
                    <span style={{ fontSize: '1.3rem', fontWeight: '700', color: 'white', letterSpacing: '-0.01em' }}>{ex.nom}</span>

                    {/* Séries */}
                    <span style={{ fontSize: '1.15rem', fontWeight: '800', color: color, textAlign: 'center' }}>
                      {ex.series ? `${ex.series}×` : <span style={{ color: 'rgba(255,255,255,0.18)' }}>—</span>}
                    </span>

                    {/* Répétitions */}
                    <span style={{ fontSize: '1.15rem', fontWeight: '700', color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>
                      {ex.repetitions || <span style={{ color: 'rgba(255,255,255,0.18)' }}>—</span>}
                    </span>

                    {/* Tempo */}
                    <span style={{ fontSize: '1.05rem', fontWeight: '600', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                      {ex.tempo || <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>}
                    </span>

                    {/* Récupération */}
                    <span style={{ fontSize: '1.15rem', fontWeight: '700', color: '#60a5fa', textAlign: 'center' }}>
                      {ex.recuperation || <span style={{ color: 'rgba(255,255,255,0.18)' }}>—</span>}
                    </span>

                    {/* Intensité */}
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: ex.type_intensite ? '#a78bfa' : 'rgba(255,255,255,0.18)', textAlign: 'center' }}>
                      {ex.type_intensite ? `${ex.type_intensite}${ex.valeur_intensite ? ' · ' + ex.valeur_intensite : ''}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer club */}
      {club && (
        <div style={{ marginTop: '3rem', paddingTop: '1.25rem', borderTop: `1px solid ${ACCENT}20`, display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: 0.45 }}>
          {club.logo_url && <img src={club.logo_url} alt={club.nom} style={{ width: 22, height: 22, objectFit: 'contain' }} />}
          <span style={{ fontSize: '0.7rem', fontWeight: '800', color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.16em' }}>{club.nom}</span>
        </div>
      )}
    </div>
  )
}

function isLightColor(hex) {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160
  } catch { return false }
}
