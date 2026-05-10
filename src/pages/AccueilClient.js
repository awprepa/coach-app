import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Calendrier from '../components/Calendrier'
import ClientBottomNav from '../components/ClientBottomNav'
import ClientProfileMenu from '../components/ClientProfileMenu'
import { sendNotif, getCoachId } from '../notifs'
import { usePush } from '../hooks/usePush'

function isCycleTermine(prog) {
  if (!prog.date_debut) return false
  const fin = new Date(prog.date_debut + 'T00:00:00')
  fin.setDate(fin.getDate() + prog.semaines * 7)
  return fin < new Date()
}

function getWeekBounds() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const QUESTIONS = [
  { key: 'sommeil',  label: 'Sommeil',  emoji: '🌙', desc: ['Très mauvais', 'Mauvais', 'Bien', 'Excellent'] },
  { key: 'fatigue',  label: 'Fatigue',  emoji: '⚡', desc: ['Épuisé', 'Fatigué', 'En forme', 'Top'] },
  { key: 'douleurs', label: 'Douleurs', emoji: '🤕', desc: ['Intenses', 'Présentes', 'Légères', 'Aucune'] },
  { key: 'stress',   label: 'Stress',   emoji: '🧘', desc: ['Très stressé', 'Stressé', 'Calme', 'Serein'] },
]
const COLORS = ['#ef4444', '#f97316', '#84cc16', '#22c55e']

function InstallGuide({ onDone }) {
  const ua = navigator.userAgent || ''
  const isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const isAndroid = /Android/.test(ua)
  const isInApp   = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches

  if (isInApp) { onDone(); return null }

  return (
    <div style={W.overlay}>
      <div style={W.card}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📲</div>
          <p style={W.subtitle}>Bienvenue sur AWprepa</p>
          <h2 style={W.title}>Installe l'application</h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.5rem', lineHeight: 1.5 }}>
            Suis les étapes ci-dessous pour installer l'application sur ton téléphone.
          </p>
        </div>

        {isIOS && (
          <div style={I.steps}>
            <div style={I.step}>
              <span style={I.num}>1</span>
              <span style={I.text}>Appuie sur le bouton <strong>Partager</strong> en bas de Safari <span style={{ fontSize: '1.1rem' }}>⬆</span></span>
            </div>
            <div style={I.step}>
              <span style={I.num}>2</span>
              <span style={I.text}>Fais défiler et sélectionne <strong>"Sur l'écran d'accueil"</strong></span>
            </div>
            <div style={I.step}>
              <span style={I.num}>3</span>
              <span style={I.text}>Appuie sur <strong>Ajouter</strong> en haut à droite</span>
            </div>
          </div>
        )}

        {isAndroid && (
          <div style={I.steps}>
            <div style={I.step}>
              <span style={I.num}>1</span>
              <span style={I.text}>Appuie sur le menu <strong>⋮</strong> en haut à droite de Chrome</span>
            </div>
            <div style={I.step}>
              <span style={I.num}>2</span>
              <span style={I.text}>Sélectionne <strong>"Ajouter à l'écran d'accueil"</strong></span>
            </div>
            <div style={I.step}>
              <span style={I.num}>3</span>
              <span style={I.text}>Confirme en appuyant sur <strong>Ajouter</strong></span>
            </div>
          </div>
        )}

        {!isIOS && !isAndroid && (
          <div style={I.steps}>
            <div style={I.step}>
              <span style={I.num}>📱</span>
              <span style={I.text}>Sur ton téléphone, ouvre ce site dans <strong>Safari</strong> (iPhone) ou <strong>Chrome</strong> (Android) pour l'installer.</span>
            </div>
          </div>
        )}

        <button onClick={onDone} style={{ ...W.submitBtn, background: '#333333', color: '#e4f816', cursor: 'pointer', marginTop: '1.25rem' }}>
          Compris, on y va !
        </button>
        <button onClick={onDone} style={{ width: '100%', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.82rem', cursor: 'pointer', marginTop: '0.5rem', padding: '0.25rem' }}>
          Plus tard
        </button>
      </div>
    </div>
  )
}

const I = {
  steps: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  step:  { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#f9fafb', borderRadius: 12, padding: '0.75rem' },
  num:   { width: 24, height: 24, borderRadius: '50%', background: '#333333', color: '#e4f816', fontSize: '0.72rem', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  text:  { fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 },
}

function WellnessOverlay({ clientId, clientName, onDone }) {
  const [vals, setVals]     = useState({ sommeil: 0, fatigue: 0, douleurs: 0, stress: 0 })
  const [poids, setPoids]   = useState('')
  const [saving, setSaving] = useState(false)
  const allFilled = Object.values(vals).every(v => v > 0)

  async function submit() {
    if (!allFilled) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const payload = { client_id: clientId, date: today, ...vals }
    if (poids !== '' && !isNaN(parseFloat(poids))) payload.poids = parseFloat(poids)
    await supabase.from('wellness').upsert(payload, { onConflict: 'client_id,date' })
    // Notifier le coach
    try {
      const coachId = await getCoachId()
      await sendNotif(coachId, {
        titre: 'Nouveau wellness renseigné',
        corps: `${clientName || 'Un client'} a renseigné son bilan du jour`,
        type: 'wellness',
        lien: '/',
      })
    } catch (e) {
      console.error('sendNotif error:', e)
    }
    setSaving(false)
    onDone()
  }

  return (
    <div style={W.overlay}>
      <div style={W.card}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={W.subtitle}>Bilan du jour</p>
          <h2 style={W.title}>Comment tu vas ?</h2>
        </div>
        {QUESTIONS.map(q => (
          <div key={q.key} style={{ marginBottom: '1.1rem' }}>
            <p style={W.qLabel}>{q.emoji} {q.label}</p>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[1, 2, 3, 4].map(n => {
                const active = vals[q.key] === n
                return (
                  <button key={n} onClick={() => setVals(v => ({ ...v, [q.key]: n }))}
                    style={{ ...W.qBtn, background: active ? COLORS[n - 1] : 'white', border: `2px solid ${active ? COLORS[n - 1] : '#e5e7eb'}`, color: active ? 'white' : '#6b7280' }}>
                    <span style={{ fontSize: '1rem', fontWeight: '900' }}>{n}</span>
                    <span style={{ fontSize: '0.48rem', fontWeight: '600', lineHeight: 1.3, textAlign: 'center' }}>{q.desc[n - 1]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {/* Poids (optionnel) */}
        <div style={{ marginBottom: '1.1rem' }}>
          <p style={W.qLabel}>⚖️ Poids <span style={{ fontWeight: '400', color: '#9ca3af', fontSize: '0.75rem' }}>(optionnel)</span></p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="number" placeholder="ex : 75.5" value={poids}
              onChange={e => setPoids(e.target.value)}
              style={{ flex: 1, padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '1rem', fontWeight: '700', outline: 'none', textAlign: 'center' }}
            />
            <span style={{ fontWeight: '700', color: '#9ca3af', fontSize: '0.9rem' }}>kg</span>
          </div>
        </div>
        <button onClick={submit} disabled={!allFilled || saving}
          style={{ ...W.submitBtn, background: allFilled ? '#333333' : '#e5e7eb', color: allFilled ? '#e4f816' : '#9ca3af', cursor: allFilled ? 'pointer' : 'default' }}>
          {saving ? 'Envoi...' : 'Valider mon bilan'}
        </button>
      </div>
    </div>
  )
}

const W = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' },
  card:      { background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 380 },
  subtitle:  { fontSize: '0.68rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.3rem' },
  title:     { fontSize: '1.4rem', fontWeight: '800', color: '#333333', margin: 0 },
  qLabel:    { fontSize: '0.85rem', fontWeight: '700', color: '#374151', margin: '0 0 0.45rem' },
  qBtn:      { flex: 1, padding: '0.5rem 0', borderRadius: 10, fontWeight: '700', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  submitBtn: { width: '100%', padding: '0.875rem', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: '700', marginTop: '0.75rem' },
}

export default function AccueilClient() {
  const navigate = useNavigate()
  const { permission, subscribed, requestAndSubscribe } = usePush()
  const [client, setClient]               = useState(null)
  const [programmes, setProgrammes]       = useState([])
  const [seances, setSeances]             = useState([])
  const [prochaineSeance, setProchaineSeance] = useState(null)
  const [weekEvents, setWeekEvents]       = useState([])
  const [showPastCycles, setShowPastCycles] = useState(false)
  const [showWellness, setShowWellness]   = useState(false)
  const [showInstall, setShowInstall]     = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [loading, setLoading]             = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchClientData() }, [])

  async function fetchClientData() {
    try {
      const { data } = await supabase.auth.getSession()
      const user = data?.session?.user
      if (!user) return

      // Chercher par user_id d'abord
      let { data: clientData } = await supabase
        .from('clients').select('*').eq('user_id', user.id).maybeSingle()

      // Fallback : chercher par email et renseigner user_id si manquant
      if (!clientData && user.email) {
        const { data: byEmail } = await supabase
          .from('clients').select('*').eq('email', user.email).maybeSingle()
        if (byEmail) {
          // Renseigne user_id pour les prochaines fois
          await supabase.from('clients').update({ user_id: user.id }).eq('id', byEmail.id)
          clientData = { ...byEmail, user_id: user.id }
        }
      }

      if (!clientData) return
      setClient(clientData)

      const { data: progs } = await supabase
        .from('programmes').select('*').eq('client_id', clientData.id).order('created_at', { ascending: false })
      setProgrammes(progs || [])

      if (progs && progs.length > 0) {
        const active = progs.filter(p => !isCycleTermine(p))
        if (active.length > 0) {
          const { data: sd } = await supabase
            .from('seances').select('id, nom, ordre').in('programme_id', active.map(p => p.id)).order('ordre', { ascending: true })
          setSeances(sd || [])
        }
      }

      const today = new Date().toISOString().slice(0, 10)

      const { data: evs } = await supabase
        .from('evenements').select('*').eq('client_id', clientData.id)
        .gte('date', today).order('date', { ascending: true }).limit(1)
      setProchaineSeance(evs?.[0] || null)

      const { start, end } = getWeekBounds()
      const { data: wevs } = await supabase
        .from('evenements').select('*').eq('client_id', clientData.id)
        .gte('date', start).lte('date', end).order('date', { ascending: true })
      setWeekEvents(wevs || [])

      // Guide installation : afficher une seule fois
      const isInApp = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches
      if (!isInApp && !localStorage.getItem('awprepa_install_seen')) {
        setShowInstall(true)
      }

      // Wellness : afficher si ≥ 7h et pas encore soumis aujourd'hui
      if (new Date().getHours() >= 7) {
        const { data: w } = await supabase
          .from('wellness').select('id').eq('client_id', clientData.id).eq('date', today).maybeSingle()
        if (!w) setShowWellness(true)
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

  if (loading) return <div style={styles.centered}><p style={{ color: '#888' }}>Chargement...</p></div>
  if (!client)  return <div style={styles.centered}><p style={{ color: '#888' }}>Aucun profil trouvé.</p></div>

  const initiales = `${client.prenom?.[0] || ''}${client.nom?.[0] || ''}`.toUpperCase()
  const todayStr  = new Date().toISOString().slice(0, 10)

  return (
    <div style={styles.page}>
      {showInstall && (
        <InstallGuide onDone={() => { localStorage.setItem('awprepa_install_seen', '1'); setShowInstall(false) }} />
      )}
      {!showInstall && showWellness && (
        <WellnessOverlay
          clientId={client.id}
          clientName={`${client.prenom} ${client.nom}`}
          onDone={() => setShowWellness(false)}
        />
      )}

      <div style={styles.header}>
        <span style={styles.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <div style={styles.avatar} onClick={() => setShowProfileMenu(v => !v)}>{initiales}</div>
      </div>
      {showProfileMenu && <ClientProfileMenu client={client} onClose={() => setShowProfileMenu(false)} />}

      <div style={styles.content}>
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={styles.label}>Bonjour,</p>
          <h1 style={styles.title}>{client.prenom} 👋</h1>
          {client.objectif && <p style={styles.subtitle}>{client.objectif}</p>}
        </div>

        {(permission === 'default' || (permission === 'granted' && !subscribed)) && (
          <button onClick={requestAndSubscribe} style={styles.pushBtn}>
            🔔 Activer les notifications push
          </button>
        )}

        {prochaineSeance && (
          <div
            onClick={() => prochaineSeance.seance_id && navigate(`/client/seance/${prochaineSeance.seance_id}`)}
            style={{ ...styles.nextCard, cursor: prochaineSeance.seance_id ? 'pointer' : 'default' }}
          >
            <p style={styles.nextLabel}>Prochain événement</p>
            <p style={styles.nextTitle}>{prochaineSeance.titre}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={styles.nextDate}>
                {new Date(prochaineSeance.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {prochaineSeance.seance_id && (
                <span style={{ color: '#e4f816', fontSize: '0.78rem', fontWeight: '700' }}>Ouvrir →</span>
              )}
            </div>
          </div>
        )}

        {/* Planning de la semaine */}
        {weekEvents.length > 0 && (
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Cette semaine</span>
              <span style={styles.sectionCount}>{weekEvents.length} séance{weekEvents.length > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {weekEvents.map(ev => {
                const d       = new Date(ev.date + 'T00:00:00')
                const isToday = ev.date === todayStr
                const isPast  = ev.date < todayStr
                return (
                  <div key={ev.id} style={{ ...styles.weekRow, background: isToday ? '#333333' : 'white', opacity: isPast && !isToday ? 0.55 : 1 }}>
                    <div style={{ ...styles.weekDay, background: isToday ? 'rgba(228,248,22,0.15)' : '#f3f4f6', color: isToday ? '#e4f816' : '#6b7280' }}>
                      <span style={{ fontSize: '0.58rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>{JOURS[d.getDay()]}</span>
                      <span style={{ fontSize: '1rem', fontWeight: '900', lineHeight: 1 }}>{d.getDate()}</span>
                    </div>
                    <span style={{ fontWeight: '700', fontSize: '0.9rem', color: isToday ? 'white' : '#333333', flex: 1 }}>{ev.titre}</span>
                    {isToday && <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#e4f816', background: 'rgba(228,248,22,0.15)', padding: '0.2rem 0.55rem', borderRadius: 999 }}>Aujourd'hui</span>}
                    {isPast && !isToday && <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: '600' }}>Passé</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Raccourcis */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <div onClick={() => navigate('/client/tests')}
            style={{ flex: 1, background: 'white', borderRadius: 14, padding: '1rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🏋️</span>
            <div>
              <p style={{ fontWeight: '700', fontSize: '0.88rem', color: '#333333', margin: '0 0 0.1rem' }}>Tests physiques</p>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>Mes résultats</p>
            </div>
            <span style={{ marginLeft: 'auto', color: '#d1d5db', fontSize: '1.2rem' }}>›</span>
          </div>
        </div>

        {/* Mes cycles */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Mes cycles</span>
          <span style={styles.sectionCount}>{programmes.length} cycle{programmes.length > 1 ? 's' : ''}</span>
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
                      <div key={prog.id} onClick={() => navigate(`/client/programme/${prog.id}`)}
                        style={{ ...styles.card, borderLeft: `4px solid ${termine ? '#d1d5db' : index === 0 ? '#e4f816' : '#e5e7eb'}`, opacity: termine ? 0.6 : 1 }}>
                        <div>
                          <p style={styles.cardTitle}>{prog.nom}</p>
                          <p style={styles.cardSub}>{prog.semaines} semaines{termine && <span style={{ marginLeft: '0.4rem', color: '#9ca3af' }}>· Terminé</span>}</p>
                        </div>
                        <span style={styles.chevron}>›</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {termines.length > 0 && (
                <button onClick={() => setShowPastCycles(v => !v)}
                  style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem 0', fontWeight: '600', textAlign: 'left' }}>
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

        <button onClick={handleLogout} style={styles.logoutBtn}>Se déconnecter</button>
      </div>
      <ClientBottomNav />
    </div>
  )
}

const styles = {
  page:        { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  centered:    { minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo:        { color: 'white', fontWeight: '800', fontSize: '1.25rem', letterSpacing: '-0.5px' },
  avatar:      { width: 38, height: 38, borderRadius: '50%', background: '#e4f816', color: '#333333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.85rem' },
  content:     { padding: '1.5rem', maxWidth: '480px', margin: '0 auto' },
  label:       { color: '#888', fontSize: '0.875rem', margin: '0 0 0.2rem' },
  title:       { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle:    { color: '#6b7280', fontSize: '0.875rem', marginTop: '0.4rem' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle:  { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' },
  sectionCount:  { color: '#9ca3af', fontSize: '0.8rem' },
  emptyCard:   { background: 'white', borderRadius: 16, padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  card:        { background: 'white', borderRadius: 14, padding: '1.1rem 1.25rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle:   { fontWeight: '700', fontSize: '0.95rem', color: '#333333', margin: '0 0 0.2rem' },
  cardSub:     { color: '#9ca3af', fontSize: '0.8rem', margin: 0 },
  chevron:     { color: '#d1d5db', fontSize: '1.5rem', lineHeight: 1 },
  logoutBtn:   { marginTop: '2.5rem', width: '100%', padding: '0.875rem', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 12, color: '#9ca3af', fontSize: '0.875rem', cursor: 'pointer' },
  nextCard:    { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #e4f816' },
  nextLabel:   { fontSize: '0.7rem', fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.35rem' },
  nextTitle:   { fontSize: '1.1rem', fontWeight: '800', color: '#e4f816', margin: '0 0 0.2rem' },
  nextDate:    { fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', margin: 0 },
  calendarCard:{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  pushBtn:     { width: '100%', padding: '0.75rem 1rem', marginBottom: '1.25rem', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.875rem', fontWeight: '600', color: '#374151', cursor: 'pointer', textAlign: 'left' },
  weekRow:     { display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: 12, padding: '0.65rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  weekDay:     { width: 40, height: 40, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}
