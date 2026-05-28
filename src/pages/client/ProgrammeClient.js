import AppLogo from '../../components/AppLogo'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'

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

  // Séances ponctuelles
  const [seancesLibres, setSeancesLibres] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [formTitre, setFormTitre] = useState('')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: prog, error } = await supabase
      .from('programmes')
      .select('*')
      .eq('id', id)
      .single()
    if (error) { console.log(error); setLoading(false); return }

    setProgramme(prog)

    const dateDebut = prog.date_debut || prog.created_at
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

    // Séances libres ajoutées par le client (source='client_ponctuelle' uniquement,
    // pour ne pas afficher les simples événements calendrier)
    const { data: libres } = await supabase
      .from('evenements')
      .select('*')
      .eq('client_id', prog.client_id)
      .eq('source', 'client_ponctuelle')
      .order('date', { ascending: false })
      .limit(30)
    setSeancesLibres(libres || [])

    setLoading(false)
  }

  async function ajouterSeanceLibre() {
    if (!formTitre.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('evenements').insert([{
      client_id: programme.client_id,
      date: formDate,
      type: 'seance',
      titre: formTitre.trim(),
      description: formNotes.trim() || null,
      source: 'client_ponctuelle',
    }]).select().single()
    if (!error && data) {
      setSeancesLibres(prev => [data, ...prev])
      setFormTitre('')
      setFormNotes('')
      setFormDate(new Date().toISOString().slice(0, 10))
      setShowForm(false)
      navigate(`/client/seance-ponctuelle/${data.id}`)
    }
    setSaving(false)
  }

  async function supprimerSeanceLibre(evId) {
    await supabase.from('evenements').delete().eq('id', evId)
    setSeancesLibres(prev => prev.filter(e => e.id !== evId))
  }

  if (loading) return <PageLoading />

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
        <AppLogo size={36} />
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
              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#333333' }}>{progression}%</span>
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
                        <p style={{ ...styles.cardSub, color: renseignee ? '#16a34a' : '#f59e0b' }}>
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

        {/* ── Séances ponctuelles ───────────────────────────────────────────── */}
        <div style={{ marginTop: '2rem' }}>

          {/* Séances libres déjà ajoutées */}
          {seancesLibres.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {seancesLibres.map(ev => {
                const dateLabel = new Date(ev.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                return (
                  <div key={ev.id} style={{ ...styles.libreCard, cursor: 'pointer' }}
                    onClick={() => navigate(`/client/seance-ponctuelle/${ev.id}`)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: '700', fontSize: '0.88rem', color: '#374151' }}>{ev.titre}</p>
                      <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>{dateLabel}</p>
                      {ev.description && (
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.4 }}>{ev.description}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      <span style={{ color: '#d1d5db', fontSize: '1.2rem' }}>›</span>
                      <button
                        onClick={e => { e.stopPropagation(); supprimerSeanceLibre(ev.id) }}
                        style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 0' }}
                      >✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Bouton discret + formulaire inline */}
          {!showForm ? (
            <button onClick={() => setShowForm(true)} style={styles.addBtn}>
              + Ajouter une séance ponctuelle
            </button>
          ) : (
            <div style={styles.formCard}>
              <p style={{ margin: '0 0 0.875rem', fontWeight: '700', fontSize: '0.82rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nouvelle séance</p>
              <input
                type="text"
                placeholder="Nom de la séance *"
                value={formTitre}
                onChange={e => setFormTitre(e.target.value)}
                style={styles.input}
                autoFocus
              />
              <div style={{ marginTop: '0.5rem', overflow: 'hidden', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fafafa' }}>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: 'none', outline: 'none', fontSize: '0.88rem', color: '#333', background: 'transparent', WebkitAppearance: 'none', appearance: 'none', minWidth: 0 }}
                />
              </div>
              <textarea
                placeholder="Notes (optionnel)"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
                style={{ ...styles.input, marginTop: '0.5rem', resize: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button
                  onClick={ajouterSeanceLibre}
                  disabled={!formTitre.trim() || saving}
                  style={{ ...styles.submitBtn, opacity: (!formTitre.trim() || saving) ? 0.5 : 1 }}
                >{saving ? '…' : 'Enregistrer'}</button>
                <button
                  onClick={() => { setShowForm(false); setFormTitre(''); setFormNotes('') }}
                  style={styles.cancelBtn}
                >Annuler</button>
              </div>
            </div>
          )}
        </div>

        {/* Bouton progression */}
        <button
          onClick={() => navigate('/client/progression')}
          style={{ width: '100%', padding: '0.85rem', background: 'var(--chip-bg)', color: 'var(--chip-text)',
                   border: 'none', borderRadius: 14, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
          📈 Voir ma progression
        </button>

      </div>
      <ClientBottomNav />
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#efefef',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    paddingBottom: 110,
  },
  centered: {
    minHeight: '100vh',
    background: '#efefef',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    background: 'var(--header-bg)',
    padding: '0.6rem 1.5rem',
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
    color: '#333333',
    margin: 0,
  },
  meta: {
    color: '#9ca3af',
    fontSize: '0.85rem',
  },
  badge: {
    background: 'var(--chip-bg)',
    color: 'var(--chip-text)',
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
    background: 'var(--chip-bg)',
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
    background: 'var(--chip-bg)',
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
    color: 'var(--chip-text)',
    opacity: 0.65,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    lineHeight: 1.2,
  },
  jourNum: {
    fontSize: '0.95rem',
    fontWeight: '800',
    color: 'var(--chip-text)',
    lineHeight: 1.2,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: '0.95rem',
    color: '#333333',
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
  libreCard: {
    background: 'white',
    borderRadius: 12,
    border: '1.5px dashed #e5e7eb',
    padding: '0.7rem 0.875rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
  },
  addBtn: {
    background: 'none',
    border: '1.5px dashed #d1d5db',
    borderRadius: 12,
    padding: '0.75rem 1rem',
    width: '100%',
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '0.82rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  formCard: {
    background: 'white',
    borderRadius: 14,
    padding: '1rem 1.25rem',
    border: '1.5px solid #e5e7eb',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.6rem 0.75rem',
    border: '1.5px solid #e5e7eb',
    borderRadius: 9,
    fontSize: '0.88rem',
    color: '#333',
    outline: 'none',
    background: '#fafafa',
  },
  submitBtn: {
    flex: 1,
    background: 'var(--chip-bg)',
    color: 'var(--chip-text)',
    border: 'none',
    borderRadius: 9,
    padding: '0.65rem',
    fontWeight: '800',
    fontSize: '0.88rem',
    cursor: 'pointer',
  },
  cancelBtn: {
    background: 'none',
    border: '1.5px solid #e5e7eb',
    borderRadius: 9,
    padding: '0.65rem 1rem',
    fontWeight: '600',
    fontSize: '0.85rem',
    color: '#9ca3af',
    cursor: 'pointer',
  },
}
