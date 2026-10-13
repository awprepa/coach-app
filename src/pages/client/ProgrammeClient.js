import AppLogo from '../../components/AppLogo'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'
import Icon from '../../components/Icon'
import T from '../../theme/tokens'

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
  const [canCreate, setCanCreate] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data: prog, error } = await supabase
      .from('programmes')
      .select('*')
      .eq('id', id)
      .single()
    if (error) { console.error(error); setLoading(false); return }

    setProgramme(prog)

    const dateDebut = prog.date_debut || prog.created_at
    const semaine = dateDebut ? getSemaineActuelle(dateDebut, prog.semaines) : 1
    setSemaineActuelle(semaine)

    const { data: seancesData, error: errSeances } = await supabase
      .from('seances')
      .select('id, nom, ordre, exercices(charges(semaine)), rpe_seances(semaine, rpe_reel)')
      .eq('programme_id', id)
      .order('ordre', { ascending: true })
    if (errSeances) { console.error(errSeances); setLoading(false); return }

    setSeances(seancesData)

    const renseignees = {}
    seancesData.forEach(s => {
      const aCharge = s.exercices.some(ex => ex.charges.some(c => c.semaine === semaine))
      const aRpe = s.rpe_seances.some(r => r.semaine === semaine && r.rpe_reel != null)
      renseignees[s.id] = aCharge || aRpe
    })
    setSeancesRenseignees(renseignees)

    // Séances ponctuelles = événements 'client' qui ont des exercices liés
    // (le join !inner ne renvoie que ceux ayant au moins un exercice).
    const { data: libres } = await supabase
      .from('evenements')
      .select('*, seances_libres_exercices!inner(id)')
      .eq('client_id', prog.client_id)
      .eq('source', 'client')
      .order('date', { ascending: false })
      .limit(30)
    // Dédoublonnage (le join peut renvoyer une ligne par exercice)
    const uniqLibres = []
    const seen = new Set()
    for (const ev of (libres || [])) {
      if (seen.has(ev.id)) continue
      seen.add(ev.id)
      uniqLibres.push(ev)
    }
    setSeancesLibres(uniqLibres)

    // Vérif accès : membre d'un groupe ou case cochée par le coach.
    // On laisse la RLS restreindre groupe_membres au client courant
    // (policy: client_id = current_client_id()) → pas de dépendance à un ID.
    const [{ data: gm }, { data: cl }] = await Promise.all([
      supabase.from('groupe_membres').select('groupe_id').limit(1),
      supabase.from('clients').select('peut_creer_seances').eq('id', prog.client_id).maybeSingle(),
    ])
    setCanCreate((gm || []).length > 0 || (cl?.peut_creer_seances === true))

    setLoading(false)
  }

  async function supprimerSeanceLibre(evId) {
    await supabase.from('evenements').delete().eq('id', evId)
    setSeancesLibres(prev => prev.filter(e => e.id !== evId))
  }

  if (loading) return <PageLoading />

  if (!programme) return (
    <div style={styles.centered}>
      <p style={{ color: T.color.muted }}>Cycle introuvable.</p>
    </div>
  )

  const progression = seances.length > 0
    ? Math.round((Object.values(seancesRenseignees).filter(Boolean).length / seances.length) * 100)
    : 0

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <button onClick={() => navigate('/client/accueil')} style={styles.backBtn} aria-label="Retour à l'accueil">
            <Icon name="chevron-right" size={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={styles.headerSmall}>Mon programme</p>
            <h1 style={styles.title}>{programme.nom}</h1>
          </div>
          <AppLogo size={32} />
        </div>
        <div style={styles.headerMeta}>
          <span>{programme.semaines} semaines</span>
          {semaineActuelle && <span style={styles.badge}>Semaine {semaineActuelle} en cours</span>}
        </div>
      </header>

      <div style={styles.content}>
        {/* Barre de progression */}
        {seances.length > 0 && semaineActuelle && (
          <section style={T.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: T.space.sm }}>
              <span style={T.label}>Progression semaine {semaineActuelle}</span>
              <span style={{ ...T.num, fontSize: T.size.xl, fontWeight: 700 }}>{progression} %</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${progression}%` }} />
            </div>
          </section>
        )}

        {/* Séances */}
        <section>
          <div style={styles.sectionHeader}>
            <h2 style={T.label}>Séances</h2>
            <span style={styles.sectionCount}>{seances.length} séance{seances.length > 1 ? 's' : ''}</span>
          </div>

          {seances.length === 0 ? (
            <div style={styles.emptyCard}>Aucune séance pour l'instant.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: T.space.sm }}>
              {seances.map((seance, i) => {
                const renseignee = seancesRenseignees[seance.id]
                return (
                  <button key={seance.id} onClick={() => navigate(`/client/seance/${seance.id}`)} style={styles.card}>
                    <span style={styles.jourBadge}>
                      <span style={styles.jourLabel}>Jour</span>
                      <span style={styles.jourNum}>{i + 1}</span>
                    </span>
                    <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <span style={styles.cardTitle}>{seance.nom}</span>
                      {semaineActuelle && (
                        <span style={{ ...styles.cardSub, color: renseignee ? T.color.success : T.color.warning }}>
                          <Icon name={renseignee ? 'check' : 'clock'} size={14} />
                          {renseignee ? 'Renseignée' : 'À compléter'}
                        </span>
                      )}
                    </span>
                    <Icon name="chevron-right" size={18} style={{ color: T.color.muted }} />
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Séances ponctuelles ───────────────────────────────────────────── */}
        {(seancesLibres.length > 0 || canCreate) && (
          <section>
            {seancesLibres.length > 0 && (
              <>
                <div style={styles.sectionHeader}>
                  <h2 style={T.label}>Séances libres</h2>
                  <span style={styles.sectionCount}>{seancesLibres.length} séance{seancesLibres.length > 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: T.space.sm, marginBottom: T.space.sm }}>
                  {seancesLibres.map(ev => {
                    const d = new Date(ev.date + 'T12:00:00')
                    const monthLabel = d.toLocaleString('fr-FR', { month: 'short' }).replace('.', '')
                    const dayNum = d.getDate()
                    return (
                      <div key={ev.id} style={{ ...styles.card, cursor: 'default', padding: 0 }}>
                        <button onClick={() => navigate(`/client/seance-ponctuelle/${ev.id}`)} style={styles.libreMain}>
                          <span style={styles.jourBadge}>
                            <span style={styles.jourLabel}>{monthLabel}</span>
                            <span style={styles.jourNum}>{dayNum}</span>
                          </span>
                          <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <span style={styles.cardTitle}>{ev.titre}</span>
                            <span style={{ ...styles.cardSub, color: T.color.muted }}>Séance libre</span>
                          </span>
                          <Icon name="chevron-right" size={18} style={{ color: T.color.muted }} />
                        </button>
                        <button
                          onClick={() => supprimerSeanceLibre(ev.id)}
                          aria-label={`Supprimer la séance libre ${ev.titre}`}
                          style={styles.deleteBtn}
                        ><Icon name="trash" size={18} /></button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {canCreate && (
              <button
                onClick={() => navigate('/client/seance-ponctuelle/nouveau', { state: { clientId: programme.client_id } })}
                style={T.btnSecondary}
              >
                <Icon name="plus" size={18} /> Créer une séance
              </button>
            )}
          </section>
        )}

        {/* Bouton progression */}
        <button
          onClick={() => navigate('/client/progression')}
          style={{ ...T.btnPrimary, background: 'var(--chip-bg)', color: 'var(--chip-text)', marginTop: T.space.sm }}>
          <Icon name="trend" size={18} /> Voir ma progression
        </button>

      </div>
      <ClientBottomNav />
    </div>
  )
}

const styles = {
  page:        { minHeight: '100vh', background: T.color.page, fontFamily: T.font.body, color: T.color.ink, paddingBottom: 110 },
  centered:    { minHeight: '100vh', background: T.color.page, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.font.body },
  header:      { background: T.color.headerBg, color: T.color.onDark, padding: '12px 16px 18px', position: 'sticky', top: 0, zIndex: 40 },
  headerInner: { maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', gap: T.space.md },
  headerSmall: { margin: 0, fontSize: T.size.sm, color: T.color.onDarkMuted },
  headerMeta:  { maxWidth: 480, margin: '10px auto 0', display: 'flex', alignItems: 'center', gap: T.space.md, fontSize: T.size.md, color: T.color.onDarkMuted },
  backBtn:     { width: T.touch, height: T.touch, borderRadius: T.radius.control, background: 'rgb(255 255 255 / .09)', border: 'none', color: T.color.onDark, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 },
  content:     { padding: T.space.lg, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: T.space.lg },
  title:       { fontFamily: T.font.display, fontSize: T.size.xxl, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em', color: T.color.onDark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge:       { background: 'var(--accent)', color: 'var(--accent-text)', padding: '3px 10px', borderRadius: T.radius.pill, fontSize: T.size.xs, fontWeight: 700 },
  progressBar: { height: 8, background: T.color.soft, borderRadius: T.radius.pill, overflow: 'hidden' },
  progressFill:{ height: '100%', background: 'var(--chip-bg)', borderRadius: T.radius.pill, transition: 'width 0.4s ease' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.space.sm, padding: '0 4px' },
  sectionCount:  { color: T.color.muted, fontSize: T.size.sm },
  emptyCard:   { ...T.card, textAlign: 'center', color: T.color.muted, fontSize: T.size.md },
  card:        { ...T.card, width: '100%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: T.space.md, fontFamily: T.font.body, minHeight: 72 },
  libreMain:   { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: T.space.md, padding: T.space.lg, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font.body, color: T.color.ink },
  deleteBtn:   { width: T.touch, height: T.touch, marginRight: T.space.sm, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: T.color.muted, cursor: 'pointer', borderRadius: T.radius.control, flexShrink: 0 },
  jourBadge:   { background: T.color.soft, borderRadius: T.radius.control, width: 48, height: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  jourLabel:   { fontSize: T.size.xs, fontWeight: 600, color: T.color.muted, lineHeight: 1.1 },
  jourNum:     { ...T.num, fontSize: T.size.xl, fontWeight: 700, color: T.color.ink, lineHeight: 1.1 },
  cardTitle:   { display: 'block', fontWeight: 600, fontSize: T.size.lg, color: T.color.ink, margin: '0 0 2px' },
  cardSub:     { display: 'flex', alignItems: 'center', gap: 4, fontSize: T.size.sm, fontWeight: 600, margin: 0 },
}
