import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Calendrier from '../components/Calendrier'

function isCycleTermine(prog) {
  if (!prog.date_debut) return false
  const fin = new Date(prog.date_debut + 'T00:00:00')
  fin.setDate(fin.getDate() + prog.semaines * 7)
  return fin < new Date()
}

export default function AccueilClient() {
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [programmes, setProgrammes] = useState([])
  const [seances, setSeances] = useState([])
  const [prochaineSeance, setProchaineSeance] = useState(null)
  const [showPastCycles, setShowPastCycles] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClientData()
  }, [])

  async function fetchClientData() {
    try {
      const { data } = await supabase.auth.getSession()
      const user = data?.session?.user
      if (!user) return

      const { data: clientData, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error) console.log(error)
      else {
        setClient(clientData)
        const { data: progs } = await supabase
          .from('programmes')
          .select('*')
          .eq('client_id', clientData.id)
          .order('created_at', { ascending: false })
        setProgrammes(progs || [])

        if (progs && progs.length > 0) {
          const activeProgs = progs.filter(p => !isCycleTermine(p))
          if (activeProgs.length > 0) {
            const { data: seancesData } = await supabase
              .from('seances')
              .select('id, nom, ordre')
              .in('programme_id', activeProgs.map(p => p.id))
              .order('ordre', { ascending: true })
            setSeances(seancesData || [])
          }
        }

        const today = new Date().toISOString().slice(0, 10)
        const { data: evs } = await supabase
          .from('evenements')
          .select('*')
          .eq('client_id', clientData.id)
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(1)
        setProchaineSeance(evs?.[0] || null)
      }
    } catch (e) {
      console.error('AccueilClient error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    try { await supabase.auth.signOut() } catch (e) { console.error(e) }
    navigate('/login')
  }

  if (loading) return (
    <div style={styles.centered}>
      <p style={{ color: '#888' }}>Chargement...</p>
    </div>
  )

  if (!client) return (
    <div style={styles.centered}>
      <p style={{ color: '#888' }}>Aucun profil trouvé.</p>
    </div>
  )

  const initiales = `${client.prenom?.[0] || ''}${client.nom?.[0] || ''}`.toUpperCase()

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <div style={styles.avatar}>{initiales}</div>
      </div>

      <div style={styles.content}>
        {/* Bienvenue */}
        <div style={{ marginBottom: '2rem' }}>
          <p style={styles.label}>Bonjour,</p>
          <h1 style={styles.title}>{client.prenom} 👋</h1>
          {client.objectif && (
            <p style={styles.subtitle}>{client.objectif}</p>
          )}
        </div>

        {/* Prochaine séance */}
        {prochaineSeance && (
          <div style={styles.nextCard}>
            <p style={styles.nextLabel}>Prochain événement</p>
            <p style={styles.nextTitle}>{prochaineSeance.titre}</p>
            <p style={styles.nextDate}>
              {new Date(prochaineSeance.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        )}

        {/* Programmes */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Mes cycles</span>
          <span style={styles.sectionCount}>
            {programmes.length} cycle{programmes.length > 1 ? 's' : ''}
          </span>
        </div>

        {(() => {
          const actifs   = programmes.filter(p => !isCycleTermine(p))
          const termines = programmes.filter(p => isCycleTermine(p))
          const visibles = showPastCycles ? programmes : actifs
          return (
            <>
              {visibles.length === 0 ? (
                <div style={styles.emptyCard}>Aucun cycle en cours.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {visibles.map((prog, index) => {
                    const termine = isCycleTermine(prog)
                    return (
                      <div
                        key={prog.id}
                        onClick={() => navigate(`/client/programme/${prog.id}`)}
                        style={{
                          ...styles.card,
                          borderLeft: `4px solid ${termine ? '#d1d5db' : index === 0 ? '#e4f816' : '#e5e7eb'}`,
                          opacity: termine ? 0.6 : 1,
                        }}
                      >
                        <div>
                          <p style={styles.cardTitle}>{prog.nom}</p>
                          <p style={styles.cardSub}>
                            {prog.semaines} semaines
                            {termine && <span style={{ marginLeft: '0.4rem', color: '#9ca3af' }}>· Terminé</span>}
                          </p>
                        </div>
                        <span style={styles.chevron}>›</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {termines.length > 0 && (
                <button
                  onClick={() => setShowPastCycles(v => !v)}
                  style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem 0', fontWeight: '600', textAlign: 'left' }}
                >
                  {showPastCycles ? '↑ Masquer les cycles passés' : `↓ Voir les cycles passés (${termines.length})`}
                </button>
              )}
            </>
          )
        })()}

        {/* Calendrier */}
        <div style={{ marginTop: '2rem' }}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Mon calendrier</span>
          </div>
          <div style={styles.calendarCard}>
            <Calendrier
              clientId={client.id}
              readOnly={false}
              programmeDebut={programmes[0]?.date_debut || client.date_debut}
              programmeSemaines={programmes[0]?.semaines || 8}
              seances={seances}
              onViewSeance={id => navigate(`/client/seance/${id}`)}
            />
          </div>
        </div>

        <button onClick={handleLogout} style={styles.logoutBtn}>
          Se déconnecter
        </button>
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
  logo: {
    color: 'white',
    fontWeight: '800',
    fontSize: '1.25rem',
    letterSpacing: '-0.5px',
  },
  avatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    background: '#e4f816',
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '0.85rem',
  },
  content: {
    padding: '1.5rem',
    maxWidth: '480px',
    margin: '0 auto',
  },
  label: {
    color: '#888',
    fontSize: '0.875rem',
    margin: '0 0 0.2rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#111827',
    margin: 0,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '0.875rem',
    marginTop: '0.4rem',
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
    padding: '1.1rem 1.25rem',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: '0.95rem',
    color: '#111827',
    margin: '0 0 0.2rem',
  },
  cardSub: {
    color: '#9ca3af',
    fontSize: '0.8rem',
    margin: 0,
  },
  chevron: {
    color: '#d1d5db',
    fontSize: '1.5rem',
    lineHeight: 1,
  },
  logoutBtn: {
    marginTop: '2.5rem',
    width: '100%',
    padding: '0.875rem',
    background: 'transparent',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    color: '#9ca3af',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  nextCard: {
    background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    borderRadius: '16px',
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
    borderLeft: '4px solid #e4f816',
  },
  nextLabel: {
    fontSize: '0.7rem',
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: '0 0 0.35rem',
  },
  nextTitle: {
    fontSize: '1.1rem',
    fontWeight: '800',
    color: '#e4f816',
    margin: '0 0 0.2rem',
  },
  nextDate: {
    fontSize: '0.82rem',
    color: 'rgba(255,255,255,0.6)',
    margin: 0,
  },
  calendarCard: {
    background: 'white',
    borderRadius: '16px',
    padding: '1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
}
