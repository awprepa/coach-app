import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

function getSemaineActuelle(dateDebut, totalSemaines) {
  const debut = new Date(dateDebut)
  const aujourd_hui = new Date()
  const diffJours = Math.floor((aujourd_hui - debut) / (1000 * 60 * 60 * 24))
  const semaine = Math.ceil((diffJours + 1) / 7)
  return Math.min(Math.max(semaine, 1), totalSemaines)
}

export default function ProgrammeClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [programme, setProgramme] = useState(null)
  const [seances, setSeances] = useState([])
  const [semaineActuelle, setSemaineActuelle] = useState(null)
  const [seancesRenseignees, setSeancesRenseignees] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: prog, error } = await supabase
      .from('programmes')
      .select('*, clients(date_debut)')
      .eq('id', id)
      .single()
    if (error) { console.log(error); setLoading(false); return }

    setProgramme(prog)

    const dateDebut = prog.clients?.date_debut
    const semaine = dateDebut ? getSemaineActuelle(dateDebut, prog.semaines) : 1
    setSemaineActuelle(semaine)

    const { data: seancesData, error: errSeances } = await supabase
      .from('seances')
      .select('id, nom, ordre, exercices(charges(semaine)), rpe_seances(semaine)')
      .eq('programme_id', id)
      .order('ordre', { ascending: true })
    if (errSeances) { console.log(errSeances); setLoading(false); return }

    setSeances(seancesData)

    const renseignees = {}
    seancesData.forEach(s => {
      const aCharge = s.exercices.some(ex => ex.charges.some(c => c.semaine === semaine))
      const aRpe = s.rpe_seances.some(r => r.semaine === semaine)
      renseignees[s.id] = aCharge || aRpe
    })
    setSeancesRenseignees(renseignees)
    setLoading(false)
  }

  if (loading) return (
    <div style={styles.centered}>
      <p style={{ color: '#888' }}>Chargement...</p>
    </div>
  )

  if (!programme) return (
    <div style={styles.centered}>
      <p style={{ color: '#888' }}>Cycle introuvable.</p>
    </div>
  )

  const progression = seances.length > 0
    ? Math.round((Object.values(seancesRenseignees).filter(Boolean).length / seances.length) * 100)
    : 0

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => navigate('/client/accueil')} style={styles.backBtn}>
          ‹
        </button>
        <span style={styles.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <div style={{ width: 32 }} />
      </div>

      <div style={styles.content}>
        {/* Titre programme */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={styles.title}>{programme.nom}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <span style={styles.meta}>{programme.semaines} sem.</span>
            {semaineActuelle && (
              <span style={styles.badge}>S{semaineActuelle} en cours</span>
            )}
          </div>
        </div>

        {/* Barre de progression */}
        {seances.length > 0 && semaineActuelle && (
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={styles.sectionTitle}>Progression semaine {semaineActuelle}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#111827' }}>{progression}%</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${progression}%` }} />
            </div>
          </div>
        )}

        {/* Séances */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Séances</span>
          <span style={styles.sectionCount}>{seances.length} séance{seances.length > 1 ? 's' : ''}</span>
        </div>

        {seances.length === 0 ? (
          <div style={styles.emptyCard}>Aucune séance pour l'instant.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {seances.map((seance, i) => {
              const renseignee = seancesRenseignees[seance.id]
              return (
                <div
                  key={seance.id}
                  onClick={() => navigate(`/client/seance/${seance.id}`)}
                  style={styles.card}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={styles.jourBadge}>
                      <span style={styles.jourLabel}>JOUR</span>
                      <span style={styles.jourNum}>{i + 1}</span>
                    </div>
                    <div>
                      <p style={styles.cardTitle}>{seance.nom}</p>
                      {semaineActuelle && (
                        <p style={{
                          ...styles.cardSub,
                          color: renseignee ? '#16a34a' : '#f59e0b'
                        }}>
                          {renseignee ? '✓ Renseignée' : 'À compléter'}
                        </p>
                      )}
                    </div>
                  </div>
                  <span style={styles.chevron}>›</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  centered: {
    minHeight: '100vh',
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    padding: '1.25rem 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '1.5rem',
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  logo: {
    color: 'white',
    fontWeight: '800',
    fontSize: '1.1rem',
    letterSpacing: '-0.5px',
  },
  content: {
    padding: '1.5rem',
    maxWidth: '480px',
    margin: '0 auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '800',
    color: '#111827',
    margin: 0,
  },
  meta: {
    color: '#9ca3af',
    fontSize: '0.85rem',
  },
  badge: {
    background: '#111827',
    color: '#e4f816',
    padding: '0.2rem 0.65rem',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: '700',
  },
  progressBar: {
    height: '6px',
    background: '#e5e7eb',
    borderRadius: '999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#e4f816',
    borderRadius: '999px',
    transition: 'width 0.4s ease',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  sectionCount: {
    color: '#9ca3af',
    fontSize: '0.8rem',
  },
  emptyCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '2rem',
    textAlign: 'center',
    color: '#9ca3af',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  card: {
    background: 'white',
    borderRadius: '14px',
    padding: '1rem 1.25rem',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jourBadge: {
    background: '#111827',
    borderRadius: '10px',
    padding: '0.3rem 0.55rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: '40px',
  },
  jourLabel: {
    fontSize: '0.5rem',
    fontWeight: '800',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    lineHeight: 1.2,
  },
  jourNum: {
    fontSize: '0.95rem',
    fontWeight: '800',
    color: '#e4f816',
    lineHeight: 1.2,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: '0.95rem',
    color: '#111827',
    margin: '0 0 0.15rem',
  },
  cardSub: {
    fontSize: '0.75rem',
    fontWeight: '600',
    margin: 0,
  },
  chevron: {
    color: '#d1d5db',
    fontSize: '1.5rem',
    lineHeight: 1,
  },
}
