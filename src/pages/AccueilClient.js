import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { purgerCachePrive } from '../utils/purgeCachePrive'
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
import ModaleConditions from '../components/ModaleConditions'
import ModaleContratASigner from '../components/ModaleContratASigner'
import { CURRENT_CONDITIONS_VERSION } from './Conditions'
import { loadClientAllSets, loadClientBodyweight } from '../data/exerciseHistory'
import { computeExerciseXp, levelFromXp } from '../data/xpSystem'
import { isoLocal } from '../utils/dates'
import Icon from '../components/Icon'
import T from '../theme/tokens'

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
const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

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
  const [levelWidget, setLevelWidget] = useState(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [loading, setLoading]             = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [conditionsAcceptees, setConditionsAcceptees] = useState(null) // null=vérif, true=ok, false=à signer
  const [contratASigner, setContratASigner] = useState(null) // null=vérif, false=aucun en attente, {…}=contrat à signer
  const [userId, setUserId] = useState(null)
  const { unread } = useNotifCtx()
  const { logoUrl } = useClientTheme()
  const calRef = useRef(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchClientData() }, [])

  useEffect(() => {
    if (!client?.id) return
    loadLevelWidget(client.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id])

  async function loadLevelWidget(clientId) {
    const [allSetsByName, bodyweight] = await Promise.all([
      loadClientAllSets(clientId),
      loadClientBodyweight(clientId),
    ])
    const totalXp = Object.values(allSetsByName).reduce(
      (sum, sets) => sum + computeExerciseXp(sets, bodyweight), 0
    )
    if (totalXp <= 0) { setLevelWidget(false); return }
    setLevelWidget(levelFromXp(totalXp))
  }

  useEffect(() => {
    if (!client?.id) return
    loadNutritionToday(client.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id])

  async function loadNutritionToday(clientId) {
    const today = isoLocal()
    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select('id, date_debut')
      .eq('client_id', clientId)
      .eq('statut', 'actif')
      .lte('date_debut', today)
      .or(`date_fin.is.null,date_fin.gte.${today}`)
      .order('date_debut', { ascending: false }).limit(1).maybeSingle()
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
    const today = isoLocal()
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

      // Signature A — conditions générales : requises pour tous les clients,
      // y compris "club" (données/aptitude physique, pas d'argent en jeu).
      const { data: conditions } = await supabase
        .from('contrat_conditions_acceptees')
        .select('id')
        .eq('client_id', clientData.id)
        .eq('version', CURRENT_CONDITIONS_VERSION)
        .limit(1)
        .maybeSingle()
      setConditionsAcceptees(!!conditions)

      // Signature B — contrat commercial : uniquement s'il y a un contrat
      // explicitement envoyé par le coach et pas encore signé.
      const { data: contratEnAttente } = await supabase
        .from('contrats')
        .select('*')
        .eq('client_id', clientData.id)
        .eq('statut', 'envoye')
        .order('date_envoi', { ascending: false })
        .limit(1)
        .maybeSingle()
      setContratASigner(contratEnAttente || false)

      const { data: progs } = await supabase
        .from('programmes').select('*').eq('client_id', clientData.id).order('created_at', { ascending: false })
      setProgrammes(progs || [])

      if (progs && progs.length > 0) {
        const vraisActifs = progs.filter(p => p.date_debut && !isCycleTermine(p))
        const todayD = new Date()
        // Préférer un cycle déjà commencé (date_debut <= aujourd'hui) sur un cycle futur
        const dejaCommence = vraisActifs.filter(p => new Date(p.date_debut + 'T00:00:00') <= todayD)
        const progActif = dejaCommence.length > 0 ? dejaCommence[0]
          : vraisActifs.length > 0 ? vraisActifs[0]
          : progs.find(p => !p.date_debut)
        if (progActif) {
          const { data: sd } = await supabase
            .from('seances').select('id, nom, ordre').eq('programme_id', progActif.id).order('ordre', { ascending: true })
          setSeances(sd || [])
        }
      }

      const today = isoLocal()

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
    try { await purgerCachePrive(); await supabase.auth.signOut({ scope: 'local' }) } catch (e) { console.error(e) }
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
      await purgerCachePrive(); await supabase.auth.signOut({ scope: 'local' })
      navigate('/login')
    } catch (e) {
      console.error('delete-account error:', e)
      alert('Une erreur est survenue. Contacte wehrey.arthur@gmail.com pour supprimer ton compte.')
      setDeletingAccount(false)
      setDeleteConfirm(false)
    }
  }

  if (loading || conditionsAcceptees === null || contratASigner === null) return <AccueilSkeleton />
  if (!client)  return <div style={styles.centered}><p style={{ color: T.color.muted }}>Aucun profil trouvé.</p></div>

  const initiales = `${client.prenom?.[0] || ''}${client.nom?.[0] || ''}`.toUpperCase()
  const todayStr  = isoLocal()
  const dateLongue = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const dateDuJour = dateLongue.charAt(0).toUpperCase() + dateLongue.slice(1)

  // Les 7 jours de la semaine en cours (lundi → dimanche) pour la frise
  const { start: lundiStr } = getWeekBounds()
  const lundi = new Date(lundiStr + 'T00:00:00')
  const joursSemaine = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi); d.setDate(lundi.getDate() + i)
    return { iso: dateToISO(d), num: d.getDate(), lettre: JOURS_COURTS[i] }
  })
  const datesAvecEvt = new Set(weekEvents.map(ev => ev.date))

  function ouvrirCalendrier() {
    calRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const peutOuvrirEvt = prochaineSeance && (prochaineSeance._isFFR || prochaineSeance.seance_id)
  function ouvrirProchainEvt() {
    if (prochaineSeance._isFFR) navigate('/client/competition')
    else if (prochaineSeance.seance_id) navigate(`/client/seance/${prochaineSeance.seance_id}`)
  }

  return (
    <div style={{ ...styles.page, ...fadeStyle }}>
      {/* Signature A — conditions générales, bloque l'accès tant que non signées */}
      {conditionsAcceptees === false && (
        <ModaleConditions
          clientId={client.id}
          onAccepte={() => setConditionsAcceptees(true)}
        />
      )}

      {/* Signature B — contrat commercial envoyé par le coach, en attente de signature */}
      {conditionsAcceptees === true && contratASigner && (
        <ModaleContratASigner
          contrat={contratASigner}
          clientId={client.id}
          onSigne={() => setContratASigner(false)}
        />
      )}

      <header style={styles.header}>
        <div style={styles.headerInner}>
          {logoUrl && <AppLogo size={40} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={styles.headerDate}>{dateDuJour}</p>
            <h1 style={styles.headerTitle}>Bonjour {client.prenom}</h1>
          </div>
          <button onClick={() => navigate('/client/notifications')} style={styles.iconBtn}
            aria-label={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'}>
            <Icon name="bell" size={20} />
            {unread > 0 && <span style={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button style={styles.avatar} onClick={() => setShowProfileMenu(v => !v)} aria-label="Mon profil">
            {avatarUrl ? (
              <img loading="lazy" src={avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : initiales}
          </button>
        </div>
        {client.objectif && <p style={styles.headerObjectif}>{client.objectif}</p>}
      </header>
      {showProfileMenu && <ClientProfileMenu client={client} avatarUrl={avatarUrl} onClose={() => setShowProfileMenu(false)} />}

      <div style={styles.content}>
        {prochaineSeance && (
          <section style={T.card}>
            <p style={{ ...T.label, marginBottom: T.space.sm }}>
              {prochaineSeance.date === todayStr ? "Aujourd'hui" : 'Prochain événement'}
            </p>
            {prochaineSeance._isFFR ? (
              /* ── Match FFR : affichage avec logo ── */
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                {(() => {
                  const logo = prochaineSeance.est_domicile ? prochaineSeance.logo_ext : prochaineSeance.est_domicile === false ? prochaineSeance.logo_dom : (prochaineSeance.logo_ext || prochaineSeance.logo_dom)
                  const adv = prochaineSeance.titre?.replace(/^vs /, '') || '?'
                  const initials = adv.split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  return (
                    <div style={styles.ffrLogo}>
                      {logo ? <img loading="lazy" src={logo} alt={adv} style={{ width: 36, height: 36, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} /> : null}
                      <div style={{ width:'100%', height:'100%', display: logo ? 'none' : 'flex', alignItems:'center', justifyContent:'center', fontSize: T.size.md, fontWeight: 700, color: T.color.ink }}>{initials}</div>
                    </div>
                  )
                })()}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ ...styles.nextTitle, marginBottom: 2 }}>{prochaineSeance.titre}</h2>
                  {prochaineSeance.heure && <span style={styles.nextMeta}>{prochaineSeance.heure}</span>}
                </div>
                <span style={styles.ffrPill}>
                  {prochaineSeance.est_domicile ? 'Domicile' : prochaineSeance.est_domicile === false ? 'Extérieur' : 'Match'}
                </span>
              </div>
            ) : (
              <h2 style={styles.nextTitle}>{prochaineSeance.titre}</h2>
            )}
            <p style={{ ...styles.nextMeta, display: 'flex', alignItems: 'center', gap: 6, margin: `0 0 ${peutOuvrirEvt ? T.space.lg : 0}px` }}>
              <Icon name="calendar" size={16} />
              {new Date(prochaineSeance.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {peutOuvrirEvt && (
              <button onClick={ouvrirProchainEvt} style={T.btnPrimary}>
                <Icon name="play" size={18} />
                {prochaineSeance._isFFR ? 'Voir le match' : 'Voir la séance'}
              </button>
            )}
          </section>
        )}

        {/* Planning de la semaine : frise + liste, ouvre le calendrier */}
        <section style={T.card}>
          <div style={styles.sectionHead}>
            <h2 style={T.label}>Cette semaine</h2>
            <button onClick={ouvrirCalendrier} style={styles.linkBtn}>
              Calendrier <Icon name="chevron-right" size={16} />
            </button>
          </div>
          <button onClick={ouvrirCalendrier} style={styles.weekStrip} aria-label="Ouvrir le calendrier">
            {joursSemaine.map(j => {
              const isToday = j.iso === todayStr
              const aEvt = datesAvecEvt.has(j.iso)
              return (
                <span key={j.iso} style={{ ...styles.day, ...(isToday ? styles.dayOn : {}) }}>
                  <span style={{ fontSize: T.size.xs }}>{j.lettre}</span>
                  <span style={{ ...T.num, fontSize: T.size.lg, fontWeight: 700, color: isToday ? T.color.signal : T.color.ink }}>{j.num}</span>
                  <span style={{ ...styles.dayDot, background: aEvt ? (isToday ? T.color.signal : T.color.ink) : 'transparent' }} />
                </span>
              )
            })}
          </button>
          {weekEvents.length > 0 ? (
            <ul style={styles.evList}>
              {weekEvents.map(ev => {
                const d       = new Date(ev.date + 'T00:00:00')
                const isToday = ev.date === todayStr
                const isPast  = ev.date < todayStr
                return (
                  <li key={ev.id} style={styles.evRow}>
                    <span style={{ ...styles.evDay, color: isPast ? T.color.muted : T.color.ink }}>{JOURS[d.getDay()]} {d.getDate()}</span>
                    <span style={{ flex: 1, minWidth: 0, color: isPast ? T.color.muted : T.color.ink, fontWeight: 600 }}>{ev.titre}</span>
                    {isToday && <span style={styles.todayPill}>Aujourd'hui</span>}
                    {isPast && !isToday && <span style={{ fontSize: T.size.sm, color: T.color.muted }}>Passé</span>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p style={{ margin: `${T.space.md}px 0 0`, fontSize: T.size.md, color: T.color.muted }}>Rien de prévu cette semaine.</p>
          )}
          <button onClick={ouvrirCalendrier} style={{ ...T.btnSecondary, marginTop: T.space.md }}>
            <Icon name="plus" size={18} /> Ajouter un événement
          </button>
        </section>

        {levelWidget && (
          <button onClick={() => navigate('/client/progression')} style={styles.levelWidget}>
            <div style={styles.levelWidgetTop}>
              <span style={styles.levelNum}>Niv. {levelWidget.level}</span>
              <span style={styles.levelLabel}>Niveau de compte</span>
              <span style={styles.levelXp}>{levelWidget.xp} / {levelWidget.xpForNextLevel} XP</span>
              <Icon name="chevron-right" size={18} style={{ color: T.color.onDarkMuted }} />
            </div>
            <div style={styles.levelBarTrack}>
              <div style={{ ...styles.levelBarFill, width: `${(levelWidget.xp / levelWidget.xpForNextLevel) * 100}%` }} />
            </div>
          </button>
        )}

        {(permission === 'default' || (permission === 'granted' && !subscribed)) && (
          <button onClick={requestAndSubscribe} style={{ ...T.btnSecondary, background: T.color.card, justifyContent: 'flex-start', padding: '0 16px' }}>
            <Icon name="bell" size={18} /> Activer les notifications push
          </button>
        )}

        {/* Rappel photos d'évolution (jour choisi par le coach) */}
        {client?.photo_reminder_dow != null && new Date().getDay() === client.photo_reminder_dow && (
          <button onClick={() => navigate('/client/photos')} style={styles.rowCard}>
            <span style={styles.rowIcon}><Icon name="camera" size={20} /></span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              <span style={styles.rowTitle}>Photos d'évolution</span>
              <span style={styles.rowSub}>C'est le jour d'envoyer tes photos à ton coach.</span>
            </span>
            <Icon name="chevron-right" size={18} style={{ color: T.color.muted }} />
          </button>
        )}

        {/* Widget nutrition aujourd'hui */}
        {nutritionToday && (
          <button onClick={() => navigate('/client/nutrition')} style={{ ...T.card, border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: T.font.body }}>
            <div style={styles.sectionHead}>
              <span style={T.label}>Nutrition aujourd'hui</span>
              <span style={{ fontSize: T.size.sm, color: T.color.muted }}>
                {nutritionToday.mealsDone}/{nutritionToday.mealsTotal} repas
              </span>
            </div>
            {nutritionToday.kcalPrevu > 0 && (() => {
              const depasse = nutritionToday.kcalMange > nutritionToday.kcalPrevu * 1.05
              return (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: T.size.md, color: T.color.muted }}>
                    <span style={{ ...T.num, fontSize: T.size.xl, fontWeight: 700, color: depasse ? T.color.danger : T.color.ink }}>{nutritionToday.kcalMange}</span>
                    {' '}/ {nutritionToday.kcalPrevu} kcal prescrits{depasse && <span style={{ color: T.color.danger, fontWeight: 600 }}> · dépassé</span>}
                  </p>
                  <div style={styles.barTrack}>
                    <div style={{
                      height: '100%', borderRadius: T.radius.pill,
                      width: `${Math.min(100, Math.round(nutritionToday.kcalMange / nutritionToday.kcalPrevu * 100))}%`,
                      background: depasse ? T.color.danger : T.color.ink,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </>
              )
            })()}
          </button>
        )}

        {/* Mes cycles */}
        <section>
          <div style={{ ...styles.sectionHead, padding: '0 4px' }}>
            <h2 style={T.label}>Mes cycles</h2>
            <span style={{ fontSize: T.size.sm, color: T.color.muted }}>{programmes.length} cycle{programmes.length > 1 ? 's' : ''}</span>
          </div>

          {(() => {
            const todayD2 = new Date()
            const vraisActifs = programmes.filter(p => p.date_debut && !isCycleTermine(p))
            // Trier : cycles commencés d'abord, puis futurs, puis sans date
            const commences = vraisActifs.filter(p => new Date(p.date_debut + 'T00:00:00') <= todayD2)
            const futurs    = vraisActifs.filter(p => new Date(p.date_debut + 'T00:00:00') > todayD2)
            const sansDates = programmes.filter(p => !p.date_debut)
            const termines  = programmes.filter(p => p.date_debut && isCycleTermine(p))
            const actifs    = [...commences, ...futurs, ...sansDates]
            const visibles  = showPastCycles ? [...commences, ...futurs, ...sansDates, ...termines] : actifs
            return (
              <>
                {visibles.length === 0 ? (
                  <div style={{ ...T.card, textAlign: 'center', color: T.color.muted, fontSize: T.size.md }}>Aucun cycle en cours.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: T.space.sm }}>
                    {visibles.map((prog, index) => {
                      const termine = isCycleTermine(prog)
                      return (
                        <button key={prog.id} onClick={() => navigate(`/client/programme/${prog.id}`)} style={styles.cycleCard}>
                          <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <span style={styles.rowTitle}>{prog.nom}</span>
                            <span style={styles.rowSub}>{prog.semaines} semaines</span>
                          </span>
                          {termine
                            ? <span style={styles.softPill}>Terminé</span>
                            : index === 0 && <span style={styles.todayPill}>En cours</span>}
                          <Icon name="chevron-right" size={18} style={{ color: T.color.muted }} />
                        </button>
                      )
                    })}
                  </div>
                )}
                {termines.length > 0 && (
                  <button onClick={() => setShowPastCycles(v => !v)} style={{ ...styles.linkBtn, marginTop: T.space.xs }}>
                    {showPastCycles ? 'Masquer les cycles passés' : `Voir les cycles passés (${termines.length})`}
                  </button>
                )}
              </>
            )
          })()}
        </section>

        {/* Calendrier */}
        <section ref={calRef} style={{ scrollMarginTop: T.space.lg }}>
          <div style={{ ...styles.sectionHead, padding: '0 4px' }}>
            <h2 style={T.label}>Mon calendrier</h2>
          </div>
          <div style={T.card}>
            <Calendrier
              clientId={client.id}
              readOnly={false}
              eventSource='client'
              programmeDebut={(() => { const todayD3 = new Date(); const va = programmes.filter(p => p.date_debut && !isCycleTermine(p)); const dc = va.filter(p => new Date(p.date_debut + 'T00:00:00') <= todayD3); return (dc[0] || va[0] || programmes.find(p => !p.date_debut))?.date_debut || client.date_debut })()}
              programmeSemaines={(() => { const todayD3 = new Date(); const va = programmes.filter(p => p.date_debut && !isCycleTermine(p)); const dc = va.filter(p => new Date(p.date_debut + 'T00:00:00') <= todayD3); return (dc[0] || va[0] || programmes.find(p => !p.date_debut) || programmes[0])?.semaines || 8 })()}
              seances={seances}
              onViewSeance={(id, semaine) => navigate(`/client/seance/${id}${semaine ? `?semaine=${semaine}` : ''}`)}
            />
          </div>
        </section>

        <button onClick={handleLogout} style={{ ...T.btnSecondary, marginTop: T.space.xl, color: T.color.muted }}>Se déconnecter</button>
        <p style={{ textAlign: 'center', fontSize: T.size.xs, color: T.color.muted, margin: 0 }}>v{APP_VERSION}</p>

        {/* ── Confidentialité & compte ───────────────────────── */}
        <div style={styles.legalRow}>
          <button onClick={() => navigate('/client/mentions-legales')} style={styles.legalLink}>
            Confidentialité & mentions légales
          </button>
          <span style={{ color: T.color.line }} aria-hidden="true">·</span>
          <button onClick={() => setDeleteConfirm(true)} style={{ ...styles.legalLink, color: T.color.danger }}>
            Supprimer mon compte
          </button>
        </div>
      </div>

      {/* Modal suppression de compte */}
      {deleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="suppr-titre">
            <p id="suppr-titre" style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: T.size.xl, color: T.color.ink, margin: '0 0 0.5rem' }}>
              Supprimer mon compte
            </p>
            <p style={{ fontSize: T.size.md, color: T.color.muted, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
              Cette action est <strong>irréversible</strong>. Toutes tes données (entraînements, nutrition, tests, messages) seront définitivement supprimées.
            </p>
            <button onClick={handleDeleteAccount} disabled={deletingAccount}
              style={{ ...T.btnPrimary, background: T.color.danger, color: T.color.card, marginBottom: T.space.sm }}>
              {deletingAccount ? 'Suppression…' : 'Oui, supprimer définitivement'}
            </button>
            <button onClick={() => setDeleteConfirm(false)} style={T.btnSecondary}>
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
  page:        { minHeight: '100vh', background: T.color.page, fontFamily: T.font.body, color: T.color.ink, paddingBottom: 110 },
  centered:    { minHeight: '100vh', background: T.color.page, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.font.body },
  header:      { background: T.color.headerBg, color: T.color.onDark, padding: '14px 16px 20px' },
  headerInner: { maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', gap: T.space.md },
  headerDate:  { margin: 0, fontSize: T.size.sm, color: T.color.onDarkMuted, fontWeight: 500 },
  headerTitle: { margin: 0, fontFamily: T.font.display, fontSize: T.size.xxl, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em', color: T.color.onDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerObjectif: { maxWidth: 480, margin: '8px auto 0', fontSize: T.size.md, color: T.color.onDarkMuted },
  iconBtn:     { position: 'relative', width: T.touch, height: T.touch, borderRadius: T.radius.control, background: 'rgb(255 255 255 / .09)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: T.color.onDark, flexShrink: 0 },
  badge:       { position: 'absolute', top: 5, right: 5, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: T.color.signal, color: T.color.ink, fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center' },
  avatar:      { width: T.touch, height: T.touch, borderRadius: '50%', background: 'rgb(255 255 255 / .14)', border: '2px solid rgb(255 255 255 / .12)', color: T.color.onDark, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: T.size.md, cursor: 'pointer', padding: 0, overflow: 'hidden', flexShrink: 0 },
  content:     { padding: T.space.lg, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: T.space.md },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.space.sm, minHeight: 28 },
  linkBtn:     { display: 'inline-flex', alignItems: 'center', gap: 2, minHeight: T.touch, margin: '-8px -4px', padding: '0 4px', background: 'none', border: 'none', color: T.color.ink, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' },
  nextTitle:   { fontFamily: T.font.display, fontSize: T.size.xxl, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.01em', color: T.color.ink, margin: '0 0 6px' },
  nextMeta:    { fontSize: T.size.md, color: T.color.muted, textTransform: 'none' },
  ffrLogo:     { width: T.touch, height: T.touch, borderRadius: T.radius.control, background: T.color.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  ffrPill:     { background: T.color.ink, color: T.color.signal, borderRadius: T.radius.pill, padding: '3px 10px', fontSize: T.size.xs, fontWeight: 700, flexShrink: 0 },
  weekStrip:   { width: '100%', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font.body },
  day:         { height: 64, borderRadius: T.radius.control, background: T.color.soft, color: T.color.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayOn:       { background: T.color.ink, color: T.color.signal },
  dayDot:      { width: 6, height: 6, borderRadius: '50%' },
  evList:      { listStyle: 'none', margin: `${T.space.md}px 0 0`, padding: 0, borderTop: `1px solid ${T.color.line}` },
  evRow:       { display: 'flex', alignItems: 'center', gap: T.space.md, minHeight: T.touch, fontSize: T.size.md, borderBottom: `1px solid ${T.color.soft}` },
  evDay:       { ...T.num, width: 56, flexShrink: 0, fontSize: T.size.md, fontWeight: 700 },
  todayPill:   { background: T.color.ink, color: T.color.signal, borderRadius: T.radius.pill, padding: '3px 10px', fontSize: T.size.xs, fontWeight: 700, flexShrink: 0 },
  softPill:    { background: T.color.soft, color: T.color.muted, borderRadius: T.radius.pill, padding: '3px 10px', fontSize: T.size.xs, fontWeight: 600, flexShrink: 0 },
  levelWidget: { width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: T.radius.card, padding: '14px 16px', background: T.color.anthracite, color: T.color.onDark, fontFamily: T.font.body },
  levelWidgetTop: { display: 'flex', alignItems: 'baseline', gap: 10 },
  levelNum:    { fontFamily: T.font.display, fontSize: T.size.h1, fontWeight: 700, lineHeight: 1, color: T.color.signal },
  levelLabel:  { flex: 1, fontSize: T.size.md, fontWeight: 600 },
  levelXp:     { ...T.num, fontSize: T.size.sm, color: T.color.onDarkMuted },
  levelBarTrack: { height: 6, background: 'rgb(255 255 255 / .12)', borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  levelBarFill:  { height: '100%', background: T.color.signal, borderRadius: 3 },
  rowCard:     { ...T.card, width: '100%', border: 'none', display: 'flex', alignItems: 'center', gap: T.space.md, cursor: 'pointer', fontFamily: T.font.body },
  rowIcon:     { width: T.touch, height: T.touch, borderRadius: T.radius.control, background: T.color.soft, color: T.color.ink, display: 'grid', placeItems: 'center', flexShrink: 0 },
  rowTitle:    { display: 'block', fontSize: T.size.lg, fontWeight: 600, color: T.color.ink },
  rowSub:      { display: 'block', fontSize: T.size.md, color: T.color.muted, marginTop: 2 },
  cycleCard:   { ...T.card, width: '100%', border: 'none', display: 'flex', alignItems: 'center', gap: T.space.md, cursor: 'pointer', fontFamily: T.font.body, minHeight: 64 },
  barTrack:    { height: 6, background: T.color.soft, borderRadius: T.radius.pill, overflow: 'hidden' },
  legalRow:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  legalLink:   { background: 'none', border: 'none', color: T.color.muted, fontFamily: T.font.body, fontSize: T.size.sm, cursor: 'pointer', textDecoration: 'underline', padding: '0 4px', minHeight: T.touch },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgb(20 20 20 / .5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200, padding: '0 0 env(safe-area-inset-bottom)' },
  modalCard:   { background: T.color.card, borderRadius: `${T.radius.card}px ${T.radius.card}px 0 0`, padding: '1.75rem 1.5rem', width: '100%', maxWidth: 480, textAlign: 'center', fontFamily: T.font.body },
}
