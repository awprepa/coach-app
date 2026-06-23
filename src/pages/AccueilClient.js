import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Calendrier from '../components/Calendrier'
import AppLogo from '../components/AppLogo'
import { useClientTheme } from '../context/ClientThemeContext'
import ClientBottomNav from '../components/ClientBottomNav'
import ClientProfileMenu from '../components/ClientProfileMenu'
import ClientOnboarding from '../components/ClientOnboarding'
import APP_VERSION from '../version'
import usePageFade from '../hooks/usePageFade'
import { AccueilSkeleton } from '../components/Skeleton'

import { usePush } from '../hooks/usePush'
import { useNotifCtx } from '../context/NotifContext'
import ModaleContrat from '../components/ModaleContrat'
import ConfirmationOffre from '../components/ConfirmationOffre'
import { CURRENT_CGV_VERSION } from './CGV'

function isCycleTermine(prog) {
  if (!prog.date_debut) return false
  const fin = new Date(prog.date_debut + 'T00:00:00')
  fin.setDate(fin.getDate() + prog.semaines * 7)
  return fin < new Date()
}

function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getWeekBounds() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: dateToISO(monday), end: dateToISO(sunday) }
}

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export default function AccueilClient() {
  const navigate = useNavigate()
  const fadeStyle = usePageFade()
  const { permission, subscribed, requestAndSubscribe } = usePush()
  const [client, setClient]               = useState(null)
  const [avatarUrl, setAvatarUrl]         = useState(null)
  const [programmes, setProgrammes]       = useState([])
  const [seances, setSeances]             = useState([])
  const [prochaineSeance, setProchaineSeance] = useState(null)
  const [weekEvents, setWeekEvents]       = useState([])
  const [showPastCycles, setShowPastCycles] = useState(false)

  const [nutritionToday, setNutritionToday] = useState(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [loading, setLoading]             = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [contratAccepte, setContratAccepte] = useState(null) // null=vérif, true=ok, false=à signer
  const [offreConfirmee, setOffreConfirmee] = useState(null) // null=vérif, true=ok, false=à confirmer
  const [userId, setUserId] = useState(null)
  const { unread } = useNotifCtx()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchClientData() }, [])

  useEffect(() => {
    if (!client?.id) return
    loadNutritionToday(client.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id])

  async function loadNutritionToday(clientId) {
    const today = new Date().toISOString().slice(0, 10)
    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select('id, date_debut')
      .eq('client_id', clientId)
      .eq('statut', 'actif')
      .maybeSingle()
    if (!plan) { setNutritionToday(false); return }
    const diffDays = Math.floor((new Date(today + 'T00:00:00') - new Date(plan.date_debut + 'T00:00:00')) / 86400000)
    const dayNum = diffDays >= 0 ? (diffDays % 7) + 1 : null
    if (!dayNum) { setNutritionToday(false); return }
    const { data: planDay } = await supabase
      .from('nutrition_plan_days').select('id')
      .eq('plan_id', plan.id).eq('jour', dayNum).maybeSingle()
    const [mealsRes, logsRes] = await Promise.all([
      planDay
        ? supabase.from('nutrition_plan_meals').select('id, kcal').eq('day_id', planDay.id)
        : Promise.resolve({ data: [] }),
      supabase.from('nutrition_plan_logs').select('statut, meal_id, kcal')
        .eq('client_id', clientId).eq('date', today),
    ])
    const meals = mealsRes.data || []
    const logs  = logsRes.data || []
    const planLogs  = logs.filter(l => l.meal_id !== null)
    const extraLogs = logs.filter(l => l.meal_id === null)
    const kcalPrevu = meals.reduce((s, m) => s + (m.kcal || 0), 0)
    const kcalMange = planLogs.filter(l => l.statut === 'fait' || l.statut === 'hors_plan')
      .reduce((s, l) => s + (l.kcal || 0), 0)
      + extraLogs.reduce((s, l) => s + (l.kcal || 0), 0)
    const mealsDone  = planLogs.filter(l => l.statut === 'fait' || l.statut === 'hors_plan').length
    const mealsTotal = meals.length
    setNutritionToday({ kcalMange, kcalPrevu, mealsDone, mealsTotal })
  }


  // Re-fetch quand l'app revient au premier plan (PWA backgroundée puis rouverte)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') fetchClientData()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Temps réel — prochain événement + semaine en cours se mettent à jour instantanément
  // quand le coach ou le client ajoute / modifie / supprime depuis n'importe où
  useEffect(() => {
    if (!client?.id) return
    const today = new Date().toISOString().slice(0, 10)
    const { start, end } = getWeekBounds()
    const channel = supabase
      .channel(`accueil-events-${client.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'evenements',
        filter: `client_id=eq.${client.id}`,
      }, () => {
        // On re-fetch les deux listes à chaque changement
        supabase.from('evenements').select('*').eq('client_id', client.id)
          .gte('date', today).or('terminee.is.null,terminee.eq.false').order('date', { ascending: true }).limit(1)
          .then(({ data }) => setProchaineSeance(data?.[0] || null))
        supabase.from('evenements').select('*').eq('client_id', client.id)
          .gte('date', start).lte('date', end).order('date', { ascending: true })
          .then(({ data }) => setWeekEvents(data || []))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [client?.id])

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
      if (clientData.avatar_url) setAvatarUrl(clientData.avatar_url)
      setUserId(user.id)

      // Contrat + confirmation offre : seulement pour les clients payants
      const offrePayante = ['coaching', 'preparation_physique', 'essai'].includes(clientData.offre)

      if (!offrePayante) {
        // Essai ou offre non définie → aucun contrat requis
        setContratAccepte(true)
        setOffreConfirmee(true)
      } else {
        // Client payant → vérifier signature contrat
        const { data: contrat } = await supabase
          .from('acceptations_contrat')
          .select('id')
          .eq('client_id', clientData.id)
          .eq('version_contrat', CURRENT_CGV_VERSION)
          .limit(1)
          .maybeSingle()
        setContratAccepte(!!contrat)
        setOffreConfirmee(!!clientData.offre_confirmee_at)
      }

      const { data: progs } = await supabase
        .from('programmes').select('*').eq('client_id', clientData.id).order('created_at', { ascending: false })
      setProgrammes(progs || [])

      if (progs && progs.length > 0) {
        const vraisActifs = progs.filter(p => p.date_debut && !isCycleTermine(p))
        const progActif = vraisActifs.length > 0 ? vraisActifs[0] : progs.find(p => !p.date_debut)
        if (progActif) {
          const { data: sd } = await supabase
            .from('seances').select('id, nom, ordre').eq('programme_id', progActif.id).order('ordre', { ascending: true })
          setSeances(sd || [])
        }
      }

      const today = new Date().toISOString().slice(0, 10)

      const { data: evs } = await supabase
        .from('evenements').select('*').eq('client_id', clientData.id)
        .gte('date', today).or('terminee.is.null,terminee.eq.false').order('date', { ascending: true }).limit(1)

      // Chercher aussi le prochain match FFR (via groupe_membres)
      let prochaineSeanceData = evs?.[0] || null
      try {
        const { data: membres } = await supabase
          .from('groupe_membres').select('groupe_id').eq('client_id', clientData.id)
        if (membres?.length) {
          const gIds = membres.map(m => m.groupe_id)
          const { data: ffrMatch } = await supabase
            .from('matchs_ffr').select('*')
            .in('groupe_id', gIds)
            .gte('date_match', today)
            .order('date_match', { ascending: true })
            .limit(1)
          const ffr = ffrMatch?.[0]
          if (ffr && (!prochaineSeanceData || ffr.date_match <= prochaineSeanceData.date)) {
            prochaineSeanceData = { ...ffr, _isFFR: true, titre: `vs ${ffr.est_domicile ? ffr.equipe_ext : ffr.est_domicile === false ? ffr.equipe_dom : (ffr.equipe_ext || ffr.equipe_dom)}`, date: ffr.date_match }
          }
        }
      } catch (_) { /* pas bloquant */ }
      setProchaineSeance(prochaineSeanceData)

      const { start, end } = getWeekBounds()
      const { data: wevs } = await supabase
        .from('evenements').select('*').eq('client_id', clientData.id)
        .gte('date', start).lte('date', end).order('date', { ascending: true })
      setWeekEvents(wevs || [])


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

  async function handleDeleteAccount() {
    setDeletingAccount(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) throw error
      await supabase.auth.signOut()
      navigate('/login')
    } catch (e) {
      console.error('delete-account error:', e)
      alert('Une erreur est survenue. Contacte wehrey.arthur@gmail.com pour supprimer ton compte.')
      setDeletingAccount(false)
      setDeleteConfirm(false)
    }
  }

  if (loading || contratAccepte === null || offreConfirmee === null) return <AccueilSkeleton />
  if (!client)  return <div style={styles.centered}><p style={{ color: '#888' }}>Aucun profil trouvé.</p></div>

  const initiales = `${client.prenom?.[0] || ''}${client.nom?.[0] || ''}`.toUpperCase()
  const todayStr  = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ ...styles.page, ...fadeStyle }}>
      {/* Modale contrat — bloque l'accès tant que non signé */}
      {contratAccepte === false && (
        <ModaleContrat
          clientId={client.id}
          userId={userId}
          offre={client.offre}
          onAccepte={() => setContratAccepte(true)}
        />
      )}

      {/* Confirmation offre — après CGV, seulement pour les clients payants */}
      {contratAccepte === true && offreConfirmee === false && (
        <ConfirmationOffre
          client={client}
          onConfirme={() => setOffreConfirmee(true)}
        />
      )}

      <div style={styles.header}>
        <AppLogo size={28} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            onClick={() => navigate('/client/notifications')}
            style={{
              position: 'relative', width: 38, height: 38, borderRadius: 999,
              background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Notifications"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                background: '#ef4444', color: 'white',
                borderRadius: 999, fontSize: '0.6rem', fontWeight: '800',
                minWidth: 16, height: 16, padding: '0 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          <div style={styles.avatar} onClick={() => setShowProfileMenu(v => !v)}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : initiales}
          </div>
        </div>
      </div>
      {showProfileMenu && <ClientProfileMenu client={client} avatarUrl={avatarUrl} onClose={() => setShowProfileMenu(false)} />}

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
            onClick={() => prochaineSeance._isFFR ? navigate('/client/competition') : (prochaineSeance.seance_id && navigate(`/client/seance/${prochaineSeance.seance_id}`))}
            style={{ ...styles.nextCard, cursor: (prochaineSeance._isFFR || prochaineSeance.seance_id) ? 'pointer' : 'default' }}
          >
            <p style={styles.nextLabel}>Prochain événement</p>
            {prochaineSeance._isFFR ? (
              /* ── Match FFR : affichage avec logo ── */
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                {/* Logo adverse */}
                {(() => {
                  const logo = prochaineSeance.est_domicile ? prochaineSeance.logo_ext : prochaineSeance.est_domicile === false ? prochaineSeance.logo_dom : (prochaineSeance.logo_ext || prochaineSeance.logo_dom)
                  const adv = prochaineSeance.titre?.replace(/^vs /, '') || '?'
                  const initials = adv.split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  return (
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {logo ? <img src={logo} alt={adv} style={{ width: 36, height: 36, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} /> : null}
                      <div style={{ width:'100%', height:'100%', display: logo ? 'none' : 'flex', alignItems:'center', justifyContent:'center', fontSize:'.9rem', fontWeight:900, color:'var(--header-text)' }}>{initials}</div>
                    </div>
                  )
                })()}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ ...styles.nextTitle, marginBottom: 2 }}>{prochaineSeance.titre}</p>
                  {prochaineSeance.heure && <span style={{ fontSize: '0.72rem', color: 'var(--header-text)', opacity: 0.8, fontWeight: 700 }}>🕐 {prochaineSeance.heure}</span>}
                </div>
                <span style={{ background: '#e4f816', color: '#1a1a1a', borderRadius: 6, padding: '2px 8px', fontSize: '0.62rem', fontWeight: 800, flexShrink: 0 }}>
                  {prochaineSeance.est_domicile ? '🏠 Dom.' : prochaineSeance.est_domicile === false ? '✈️ Ext.' : 'Match'}
                </span>
              </div>
            ) : (
              <p style={styles.nextTitle}>{prochaineSeance.titre}</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={styles.nextDate}>
                {new Date(prochaineSeance.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {(prochaineSeance._isFFR || prochaineSeance.seance_id) && (
                <span style={{ color: 'var(--header-text)', opacity: 0.85, fontSize: '0.78rem', fontWeight: '700' }}>Voir →</span>
              )}
            </div>
          </div>
        )}

        {/* Widget nutrition aujourd'hui */}
        {nutritionToday && (
          <div onClick={() => navigate('/client/nutrition/plan')} style={styles.nutritionWidget}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={styles.sectionTitle}>Nutrition aujourd'hui</span>
              <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600 }}>
                {nutritionToday.mealsDone}/{nutritionToday.mealsTotal} repas
              </span>
            </div>
            {nutritionToday.kcalPrevu > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#6b7280', marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, color: '#1a1a1a' }}>{nutritionToday.kcalMange} kcal</span>
                  <span>/ {nutritionToday.kcalPrevu} kcal prescrits</span>
                </div>
                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${Math.min(100, Math.round(nutritionToday.kcalMange / nutritionToday.kcalPrevu * 100))}%`,
                    background: nutritionToday.kcalMange > nutritionToday.kcalPrevu * 1.05 ? '#ef4444' : '#16a34a',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </>
            )}
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
                  <div key={ev.id} style={{ ...styles.weekRow, background: isToday ? 'var(--chip-bg)' : 'white', opacity: isPast && !isToday ? 0.55 : 1 }}>
                    <div style={{ ...styles.weekDay, background: isToday ? 'rgba(255,255,255,0.12)' : '#f3f4f6', color: isToday ? 'var(--chip-text)' : '#6b7280' }}>
                      <span style={{ fontSize: '0.58rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>{JOURS[d.getDay()]}</span>
                      <span style={{ fontSize: '1rem', fontWeight: '900', lineHeight: 1 }}>{d.getDate()}</span>
                    </div>
                    <span style={{ fontWeight: '700', fontSize: '0.9rem', color: isToday ? 'var(--chip-text)' : '#333333', flex: 1 }}>{ev.titre}</span>
                    {isToday && <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#111111', background: 'var(--accent-stripe)', padding: '0.2rem 0.55rem', borderRadius: 999 }}>Aujourd'hui</span>}
                    {isPast && !isToday && <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: '600' }}>Passé</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Mes cycles */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Mes cycles</span>
          <span style={styles.sectionCount}>{programmes.length} cycle{programmes.length > 1 ? 's' : ''}</span>
        </div>

        {(() => {
          const vraisActifs = programmes.filter(p => p.date_debut && !isCycleTermine(p))
          const sansDates   = programmes.filter(p => !p.date_debut)
          const termines    = programmes.filter(p => p.date_debut && isCycleTermine(p))
          const actifs      = [...vraisActifs, ...sansDates]
          const visibles    = showPastCycles ? [...vraisActifs, ...sansDates, ...termines] : actifs
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
                        style={{ ...styles.card, borderLeft: `4px solid ${termine ? '#d1d5db' : index === 0 ? 'var(--accent)' : '#e5e7eb'}`, opacity: termine ? 0.6 : 1 }}>
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
              eventSource='client'
              programmeDebut={(programmes.find(p => p.date_debut && !isCycleTermine(p)) || programmes.find(p => !p.date_debut))?.date_debut || client.date_debut}
              programmeSemaines={(programmes.find(p => p.date_debut && !isCycleTermine(p)) || programmes.find(p => !p.date_debut) || programmes[0])?.semaines || 8}
              seances={seances}
              onViewSeance={(id, semaine) => navigate(`/client/seance/${id}${semaine ? `?semaine=${semaine}` : ''}`)}
            />
          </div>
        </div>

        <button onClick={handleLogout} style={styles.logoutBtn}>Se déconnecter</button>
        <p style={{ textAlign: 'center', fontSize: '0.68rem', color: '#d1d5db', marginTop: '0.75rem', marginBottom: 0 }}>v{APP_VERSION}</p>

        {/* ── Confidentialité & compte ───────────────────────── */}
        <div style={styles.legalRow}>
          <button onClick={() => navigate('/client/mentions-legales')} style={styles.legalLink}>
            Confidentialité & mentions légales
          </button>
          <span style={{ color: '#e5e7eb' }}>·</span>
          <button onClick={() => setDeleteConfirm(true)} style={{ ...styles.legalLink, color: '#ef4444' }}>
            Supprimer mon compte
          </button>
        </div>
      </div>

      {/* Modal suppression de compte */}
      {deleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>⚠️</p>
            <p style={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a1a', margin: '0 0 0.5rem' }}>
              Supprimer mon compte
            </p>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, margin: '0 0 1.25rem' }}>
              Cette action est <strong>irréversible</strong>. Toutes tes données (entraînements, nutrition, tests, messages) seront définitivement supprimées.
            </p>
            <button onClick={handleDeleteAccount} disabled={deletingAccount}
              style={{ width: '100%', padding: '0.875rem', borderRadius: 12, border: 'none', background: '#ef4444', color: 'white', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', marginBottom: '0.6rem' }}>
              {deletingAccount ? 'Suppression…' : 'Oui, supprimer définitivement'}
            </button>
            <button onClick={() => setDeleteConfirm(false)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <ClientOnboarding />
      <ClientBottomNav />
    </div>
  )
}

const styles = {
  page:        { minHeight: '100vh', background: 'var(--accent-muted)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  centered:    { minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { background: 'var(--header-bg)', height: 70, padding: '0 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo:        { color: 'white', fontWeight: '800', fontSize: '1.25rem', letterSpacing: '-0.5px' },
  avatar:      { width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', color: 'var(--header-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.85rem' },
  content:     { padding: '1.5rem', maxWidth: '480px', margin: '0 auto' },
  label:       { color: '#888', fontSize: '0.875rem', margin: '0 0 0.2rem' },
  title:       { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle:    { color: '#6b7280', fontSize: '0.875rem', marginTop: '0.4rem' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle:  { fontSize: '0.75rem', fontWeight: '700', color: 'var(--accent-fg)', textTransform: 'uppercase', letterSpacing: '0.08em', borderLeft: '3px solid var(--accent-stripe)', paddingLeft: '0.5rem' },
  sectionCount:  { color: '#9ca3af', fontSize: '0.8rem' },
  emptyCard:   { background: 'white', borderRadius: 16, padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  card:        { background: 'white', borderRadius: 14, padding: '1.1rem 1.25rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle:   { fontWeight: '700', fontSize: '0.95rem', color: '#333333', margin: '0 0 0.2rem' },
  cardSub:     { color: '#9ca3af', fontSize: '0.8rem', margin: 0 },
  chevron:     { color: '#d1d5db', fontSize: '1.5rem', lineHeight: 1 },
  logoutBtn:   { marginTop: '2.5rem', width: '100%', padding: '0.875rem', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 12, color: '#9ca3af', fontSize: '0.875rem', cursor: 'pointer' },
  legalRow:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' },
  legalLink:   { background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200, padding: '0 0 env(safe-area-inset-bottom)' },
  modalCard:   { background: 'white', borderRadius: '20px 20px 0 0', padding: '1.75rem 1.5rem', width: '100%', maxWidth: 480, textAlign: 'center' },
  nextCard:    { background: 'var(--header-bg)', borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', borderLeft: '4px solid var(--accent-stripe)' },
  nextLabel:   { fontSize: '0.7rem', fontWeight: '700', color: 'var(--header-text)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.35rem' },
  nextTitle:   { fontSize: '1.1rem', fontWeight: '800', color: 'var(--accent-fg-dark)', margin: '0 0 0.2rem' },
  nextDate:    { fontSize: '0.82rem', color: 'var(--header-text)', opacity: 0.7, margin: 0 },
  calendarCard:{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  pushBtn:     { width: '100%', padding: '0.75rem 1rem', marginBottom: '1.25rem', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.875rem', fontWeight: '600', color: '#374151', cursor: 'pointer', textAlign: 'left' },
  nutritionWidget: { background: 'white', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer', borderLeft: '4px solid #16a34a' },
  weekRow:     { display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: 12, padding: '0.65rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  weekDay:     { width: 40, height: 40, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
}
