import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// ── Couleurs par type de donnée ───────────────────────────────────────────────
const DATA_COLORS = {
  series:    '#fb923c',   // orange
  reps:      '#34d399',   // vert
  tempo:     '#94a3b8',   // gris bleu (secondaire)
  recup:     '#38bdf8',   // bleu ciel
  intensite: '#a78bfa',   // violet
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

function ValChip({ children, color }) {
  if (!children || children === '—') return <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>—</span>
  return (
    <span style={{
      display: 'inline-block',
      background: color + '18',
      color,
      border: `1px solid ${color}35`,
      borderRadius: 8,
      padding: '0.25rem 0.6rem',
      fontSize: '1.05rem',
      fontWeight: '800',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  )
}

export default function SeanceProjection() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [club, setClub] = useState(null)   // { nom, couleur, logo_url }
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: exs }] = await Promise.all([
      supabase
        .from('seances')
        .select('*, programmes(id, nom, client_id, clients(id, categorie_id, categories(id, nom, couleur, logo_url)))')
        .eq('id', id)
        .single(),
      supabase.from('exercices').select('*').eq('seance_id', id).order('ordre', { ascending: true }),
    ])
    setSeance(s)
    setExercices(exs || [])

    // Extraire le club si disponible
    const cat = s?.programmes?.clients?.categories
    if (cat) setClub({ nom: cat.nom, couleur: cat.couleur, logo_url: cat.logo_url })

    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'sans-serif' }}>Chargement...</p>
    </div>
  )
  if (!seance) return null

  // Couleur accent : couleur du club ou fallback jaune-vert
  const ACCENT = club?.couleur || '#e4f816'
  // Contraste du texte sur fond accent (blanc si couleur sombre, noir si claire)
  const accentTextDark = isLightColor(ACCENT) ? '#1a1a1a' : 'white'

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

  const COLS = '110px 1fr 90px 120px 100px 110px 150px'

  return (
    <div style={{ ...P.page, background: club ? `linear-gradient(160deg, #0d1117 0%, ${ACCENT}12 100%)` : '#0d1117' }}>

      {/* ── Bande de couleur club en haut ── */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, zIndex: 10 }} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.75rem', paddingTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>

          {/* Logo du club */}
          {club?.logo_url && (
            <img
              src={club.logo_url}
              alt={club.nom}
              style={{ width: 72, height: 72, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}
            />
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
            <h1 style={{ fontSize: '3rem', fontWeight: '900', color: 'white', margin: 0, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{seance.nom}</h1>
          </div>
        </div>
        <button onClick={() => navigate(-1)} style={P.closeBtn}>✕ Fermer</button>
      </div>

      {/* ── Échauffement ── */}
      {echauffement.length > 0 && (
        <div style={{ marginBottom: '2.75rem' }}>
          <SectionLabel accent={ACCENT}>Échauffement</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {warmGroups.map((g, gi) => {
              if (!g.groupe) {
                return g.items.map((l, i) => (
                  <div key={l.id || `${gi}-${i}`} style={{ ...P.warmRow, borderLeft: `3px solid ${ACCENT}55` }}>
                    <span style={{ flex: 1, fontSize: '1.25rem', fontWeight: '700', color: 'white' }}>{l.nom}</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: '800', color: ACCENT, minWidth: 100, textAlign: 'right' }}>{l.reps}</span>
                  </div>
                ))
              }
              return (() => {
                const tours = g.items[0]?.tours
                return (
                  <div key={gi} style={{ display: 'flex', alignItems: 'stretch', border: `1.5px solid ${ACCENT}30`, borderLeft: `3px solid ${ACCENT}`, borderRadius: '0 14px 14px 0', background: ACCENT + '06' }}>
                    <div style={{ flex: 1 }}>
                      {g.items.map((l, i) => (
                        <div key={l.id || i} style={{ ...P.warmRow, borderRadius: 0, borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
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
          {[
            { label: 'Code',        color: ACCENT },
            { label: 'Exercice',    color: 'rgba(255,255,255,0.22)' },
            { label: 'Séries',      color: DATA_COLORS.series },
            { label: 'Répétitions', color: DATA_COLORS.reps },
            { label: 'Tempo',       color: DATA_COLORS.tempo },
            { label: 'Récup.',      color: DATA_COLORS.recup },
            { label: 'Intensité',   color: DATA_COLORS.intensite },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontSize: '0.58rem', fontWeight: '900', color, textTransform: 'uppercase', letterSpacing: '0.14em', textAlign: 'center', display: 'block' }}>{label}</span>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {groups.map((g, gi) => {
            const isSuperset = g.items.length > 1
            return (
              <div key={gi} style={{
                background: isSuperset ? ACCENT + '07' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isSuperset ? ACCENT + '28' : 'rgba(255,255,255,0.07)'}`,
                borderLeft: isSuperset ? `3px solid ${ACCENT}` : `3px solid rgba(255,255,255,0.08)`,
                borderRadius: '0 16px 16px 0',
                overflow: 'hidden',
              }}>
                {isSuperset && (
                  <div style={{ background: ACCENT + '12', padding: '0.3rem 1.5rem', borderBottom: `1px solid ${ACCENT}20` }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: '900', color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                      Superset · {g.letter}
                    </span>
                  </div>
                )}
                {g.items.map((ex, i) => (
                  <div key={ex.id} style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: '1rem',
                    padding: '1rem 1.5rem', alignItems: 'center',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}>
                    {/* Code */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{
                        background: ACCENT,
                        color: accentTextDark,
                        padding: '0.25rem 0.7rem',
                        borderRadius: 8,
                        fontSize: '1rem',
                        fontWeight: '900',
                        display: 'inline-block',
                        letterSpacing: '0.04em',
                      }}>{ex.code}</span>
                    </div>

                    {/* Nom exercice */}
                    <span style={{ fontSize: '1.3rem', fontWeight: '700', color: 'white', letterSpacing: '-0.01em' }}>{ex.nom}</span>

                    {/* Séries */}
                    <div style={{ textAlign: 'center' }}>
                      <ValChip color={DATA_COLORS.series}>{ex.series ? `${ex.series}×` : null}</ValChip>
                    </div>

                    {/* Répétitions */}
                    <div style={{ textAlign: 'center' }}>
                      <ValChip color={DATA_COLORS.reps}>{ex.repetitions || null}</ValChip>
                    </div>

                    {/* Tempo */}
                    <div style={{ textAlign: 'center' }}>
                      <ValChip color={DATA_COLORS.tempo}>{ex.tempo || null}</ValChip>
                    </div>

                    {/* Récupération */}
                    <div style={{ textAlign: 'center' }}>
                      <ValChip color={DATA_COLORS.recup}>{ex.recuperation || null}</ValChip>
                    </div>

                    {/* Intensité */}
                    <div style={{ textAlign: 'center' }}>
                      <ValChip color={DATA_COLORS.intensite}>
                        {ex.type_intensite ? `${ex.type_intensite}${ex.valeur_intensite ? ' · ' + ex.valeur_intensite : ''}` : null}
                      </ValChip>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Footer club ── */}
      {club && (
        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: `1px solid ${ACCENT}20`, display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: 0.5 }}>
          {club.logo_url && <img src={club.logo_url} alt={club.nom} style={{ width: 24, height: 24, objectFit: 'contain' }} />}
          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{club.nom}</span>
        </div>
      )}
    </div>
  )
}

// Détecte si une couleur hex est claire (pour choisir noir ou blanc en texte)
function isLightColor(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  // Luminosité perceptuelle (formule WCAG)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160
}

const P = {
  page:    { minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '3rem 4rem', boxSizing: 'border-box' },
  closeBtn:{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', borderRadius: 10, padding: '0.55rem 1.1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', fontFamily: 'inherit', flexShrink: 0 },
  warmRow: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem 1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: 10 },
}
