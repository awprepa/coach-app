import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useTimer } from '../../context/TimerContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell as RechartsCell, LineChart, Line, Legend } from 'recharts'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'
import { enqueueCharge, processQueue, pendingCount } from '../../utils/offlineQueue'
import { saveSeanceLocally, loadSeanceLocally, formatSavedAt } from '../../utils/localDB'
import { createPortal } from 'react-dom'
import { sendNotif, getCoachId } from '../../notifs'
import { computeExerciseXp, fetchExerciceSetsByName, totalXpFromByName } from '../../data/xpSystem'
import XpBulle, { useXpBulle } from '../../components/XpBulle'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { autoPlacerSeanceSurCalendrier } from '../../utils/autoPlacerSeance'
import SeanceTerrainClient from './SeanceTerrainClient'
import { isoLocal } from '../../utils/dates'
import EnTeteClient from '../../components/EnTeteClient'

function getSemaineActuelle(dateDebut) {
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.ceil((diffJours + 1) / 7))
}

// Semaine du cycle correspondant à une date de calendrier donnée — même
// logique que getCycleWeek dans Calendrier.js (dupliquée ici volontairement,
// comme ailleurs dans ce fichier, plutôt que de partager un util pour un
// calcul aussi court).
function getCycleWeekForDate(date, programmeDebut, programmeSemaines) {
  if (!programmeDebut) return null
  const debut = new Date(programmeDebut + 'T00:00:00')
  const debutDay = debut.getDay()
  debut.setDate(debut.getDate() + (debutDay === 0 ? -6 : 1 - debutDay))
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const diff = Math.floor((d - debut) / (1000 * 60 * 60 * 24))
  if (diff < 0) return null
  const w = Math.floor(diff / 7) + 1
  return w > programmeSemaines ? null : w
}

// Remonte le champ au centre de l'écran une fois le clavier déployé (iOS ne
// recadre pas le viewport autour du champ actif, et ClientBottomNav étant en
// position fixed il finit par flotter au-dessus du clavier et cacher la ligne).
function scrollInputIntoView(e) {
  const target = e.target
  setTimeout(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 300)
}

function parseRecup(str) {
  if (!str) return 0
  const s = String(str).trim()
  const m1 = s.match(/^(\d+)[''′](\d{1,2})[""″]?/)
  if (m1) return parseInt(m1[1]) * 60 + parseInt(m1[2])
  const m2 = s.match(/^(\d+):(\d{2})/)
  if (m2) return parseInt(m2[1]) * 60 + parseInt(m2[2])
  const m3 = s.match(/^(\d+)[''′]$/)
  if (m3) return parseInt(m3[1]) * 60
  const m4 = s.match(/^(\d+)[""″]/)
  if (m4) return parseInt(m4[1])
  const m5 = s.match(/^(\d+)\s*min?/i)
  if (m5) return parseInt(m5[1]) * 60
  const m6 = s.match(/^(\d+)/)
  if (m6) return parseInt(m6[1])
  return 0
}

// Extrait le nombre de reps cible d'un texte de prescription ("8", "6-8",
// "3/3", '10"', "AMRAP"…) — première suite de chiffres trouvée, ou null.
// Sert de repli quand le joueur valide une série sans avoir rempli les reps
// réelles, pour ne jamais enregistrer reps_reelles: null (ce qui exclurait
// silencieusement la série de la page Progression).
function parseTargetReps(str) {
  if (!str) return null
  const m = String(str).match(/\d+/)
  return m ? parseInt(m[0]) : null
}

function formatTimer(secs) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const COL = 52
const COL_LABEL = 56

const ICONE_ECHAUFFEMENT = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 1.5 1.5 2.5 3 2.5-1-2-1-4.5 0-7z"/></svg>
const ICONE_CARDIO = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>
const COCHE = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>

// Échauffement / cardio validable : carte avec bouton Valider, repliée en
// ligne verte une fois validée (comme un bloc terminé). Annulation via la
// coche puis Oui, comme pour une série.
function ElementValidable({ titre, sousTitre, resume, icone, valide, ouvert, confirm, onValider, onBasculer, onDemanderAnnul, onAnnulNon, onAnnulOui, children }) {
  const coin = valide
    ? confirm
      ? <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onAnnulNon} style={S.unvalCancelBtn}>Non</button>
          <button onClick={onAnnulOui} style={S.unvalConfirmBtn}>Oui</button>
        </div>
      : <button onClick={onDemanderAnnul} title="Annuler la validation" style={S.prepCheck}><span style={S.prepCheckIn}>{COCHE}</span></button>
    : <button onClick={onValider} style={S.prepValBtn}>Valider</button>
  if (valide && !ouvert) {
    return (
      <div style={S.prepFait}>
        <span style={{ ...S.prepIco, ...S.prepIcoFait }}>{icone}</span>
        <div role="button" tabIndex={0} onClick={onBasculer} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={S.prepTitre}>{titre}</div>
          <div style={S.prepSous}>{confirm ? 'Annuler la validation ?' : resume}</div>
        </div>
        {coin}
      </div>
    )
  }
  return (
    <div style={{ ...S.card, padding: 0, marginBottom: 0, ...(valide ? { border: '1.5px solid #86efac' } : {}) }}>
      <div style={S.prepHead}>
        <span style={{ ...S.prepIco, ...(valide ? S.prepIcoFait : {}) }}>{icone}</span>
        <div role={valide ? 'button' : undefined} tabIndex={valide ? 0 : undefined} onClick={valide ? onBasculer : undefined}
          style={{ flex: 1, minWidth: 0, cursor: valide ? 'pointer' : 'default' }}>
          <div style={S.prepTitre}>{titre}</div>
          {sousTitre && <div style={S.prepSous}>{confirm ? 'Annuler la validation ?' : sousTitre}</div>}
        </div>
        {coin}
      </div>
      <div style={{ padding: '0 14px 14px' }}>{children}</div>
    </div>
  )
}

// Vignette vidéo/photo à droite d'une ligne (miniature YouTube ou image en fond)
function Vignette({ url, nom, youtubeId, onOuvrir, large = 48 }) {
  const yt = youtubeId(url)
  const fond = yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : url
  return (
    <button onClick={() => onOuvrir({ nom, url })} title="Voir le mouvement"
      style={{ ...S.vignette, width: large, backgroundImage: `url("${fond}")` }}>
      {yt && <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><polygon points="6 4 20 12 6 20"/></svg>}
    </button>
  )
}

export default function SeanceClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [seance, setSeance] = useState(null)
  const seanceRef = useRef(null)       // miroir de `seance` toujours à jour (évite les closures périmées dans les handlers montés une seule fois)
  const [exercices, setExercices] = useState([])
  const [videoDemandes, setVideoDemandes] = useState({}) // { exercice_id: demande en_attente }
  const [charges, setCharges] = useState({})
  const [rpeSeances, setRpeSeances] = useState({})
  const [semaines, setSemaines] = useState(4)
  const [semaineActuelle, setSemaineActuelle] = useState(1)
  const [rattrapageDeSemaine, setRattrapageDeSemaine] = useState(null) // semaine naturelle si différente de semaineActuelle
  const [showWeekPicker, setShowWeekPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [tracking, setTracking] = useState({})
  const trackingRef = useRef({})       // miroir de `tracking` toujours à jour (pour l'auto-save)
  const [warmupTracking, setWarmupTracking] = useState({}) // { exId: [{ serie, poids, reps_reelles }] }
  const [blocsTermines, setBlocsTermines] = useState(new Set())
  const [blocsSkippes, setBlocsSkippes] = useState(new Set()) // blocs marqués "non effectués"
  const [activeBloc, setActiveBloc] = useState(null) // lettre du bloc actif (déplié)
  const [commentaire, setCommentaire] = useState('')
  const [commentaires, setCommentaires] = useState([])
  const [commentSaved, setCommentSaved] = useState(false)
  const [nonEffectuee, setNonEffectuee] = useState(false)
  const [nonEffectueeSaving, setNonEffectueeSaving] = useState(false)
  const [nonEffectueeConfirm, setNonEffectueeConfirm] = useState(false)
  const [pendingUnvalidate, setPendingUnvalidate] = useState(null) // { exId, serieIdx }
  const { timerSecs, timerTotal, isRunning: timerRunning, isDone: timerDone, startTimer, stopTimer } = useTimer()
  const [histoOpen, setHistoOpen] = useState({})
  const [histoTracking, setHistoTracking] = useState({}) // { exId: { semaine: [{ poids, reps_reelles, valide, serie }] } }
  const [variantImageMap, setVariantImageMap] = useState({}) // { nom_lower: image_url } pour les variantes de progression
  const [histoLoading, setHistoLoading] = useState({})
  const [mediaModal, setMediaModal] = useState(null) // { nom, url }
  const [rpeOpen, setRpeOpen] = useState(false)
  const [echauffement, setEchauffement] = useState([])
  const [cardioDebutAll, setCardioDebutAll] = useState({})
  const [cardioFinAll,   setCardioFinAll]   = useState({})
  const [cardioBlocs,    setCardioBlocs]    = useState([])  // blocs cardio texte libre
  const [elemValides, setElemValides] = useState(new Set())   // 'echauffement' | 'cardio_debut' | 'cardio_fin' | 'cardio_bloc_<i>'
  const [elemOuverts, setElemOuverts] = useState(new Set())   // éléments validés rouverts
  const [elemConfirm, setElemConfirm] = useState(null)        // élément dont on confirme l'annulation
  const [expandedDone, setExpandedDone] = useState(new Set())
  const [pendingSync, setPendingSync] = useState(0)
  const [offlineMode, setOfflineMode] = useState(false)  // true = données servies depuis IndexedDB
  const [localSavedAt, setLocalSavedAt] = useState(null)
  const [validatingSet, setValidatingSet] = useState(new Set()) // anti double-tap : clés "exId-si"
  trackingRef.current = tracking       // synchronisé à chaque rendu
  seanceRef.current = seance
  const blocRefs = useRef({})
  const prNotifiedRef = useRef({}) // { [exId]: maxPoidsNotifié } — évite les doublons dans la même séance
  const finNotifSentRef = useRef(false) // verrou anti-doublon de la notif "séance terminée"

  // ── Gain d'XP en direct (bulle éphémère) — clients hors groupe uniquement ──
  const xpEnabledRef = useRef(false)   // true une fois confirmé que le client n'est dans aucun groupe
  const xpByNameRef = useRef({})       // { nomExercice: { allSets: [{date,poids,reps}] } } — historique complet, même format que Progression
  const xpTotalRef = useRef(0)         // total XP courant (identique à celui de la page Progression)
  const bodyweightRef = useRef(null)
  const xpBlocRef = useRef({})         // { groupLetter: xpGagnéCetteSéance } — pour le récap "Terminer le bloc"
  const triggerXpBulle = useXpBulle()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSeance() }, [])

  // Validations de l'échauffement et des cardios pour la semaine affichée
  useEffect(() => {
    if (!id) return
    supabase.from('seance_element_validations').select('element')
      .eq('seance_id', id).eq('semaine', semaineActuelle)
      .then(({ data }) => setElemValides(new Set((data || []).map(v => v.element))))
  }, [id, semaineActuelle])

  // Une fois le client identifié : vérifie qu'il n'est dans aucun groupe, et si
  // c'est le cas précharge son total d'XP (même calcul que ProgressionClient.js)
  // pour pouvoir animer les gains en direct pendant la séance.
  useEffect(() => {
    const clientId = seance?.programmes?.client_id
    if (!clientId || xpEnabledRef.current) return
    ;(async () => {
      try {
        const { data: membres } = await supabase.from('groupe_membres').select('groupe_id').eq('client_id', clientId).limit(1)
        if ((membres || []).length > 0) return // membre d'un groupe → pas d'animation XP
        const [{ data: profile }, { data: lastWellness }, byName] = await Promise.all([
          supabase.from('nutrition_profile').select('poids_kg').eq('client_id', clientId).maybeSingle(),
          supabase.from('wellness').select('poids').eq('client_id', clientId).not('poids', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle(),
          fetchExerciceSetsByName(supabase, clientId),
        ])
        bodyweightRef.current = lastWellness?.poids || (profile?.poids_kg ? parseFloat(profile.poids_kg) : null) || null
        xpByNameRef.current = byName
        xpTotalRef.current = totalXpFromByName(byName, bodyweightRef.current)
        xpEnabledRef.current = true
      } catch (e) { console.warn('[xp] initialisation échouée:', e) }
    })()
  }, [seance])

  // Re-fetch léger quand l'app revient au premier plan
  useEffect(() => {
    async function refreshOnVisible() {
      if (document.visibilityState !== 'visible') return
      if (!navigator.onLine) return
      // Recharge uniquement le tracking et les blocs passés pour la semaine actuelle
      const exIds = exercices.map(e => e.id)
      if (!exIds.length) return
      const sem = semaineActuelle
      const [{ data: rows }, { data: skipsData }] = await Promise.all([
        supabase.from('serie_tracking').select('*').in('exercice_id', exIds).eq('semaine', sem),
        supabase.from('bloc_skips').select('bloc_lettre').eq('seance_id', id).eq('semaine', sem),
      ])
      if (rows) {
        setTracking(prev => {
          const next = { ...prev }
          exercices.forEach(ex => {
            const n = (prev[ex.id] || []).length
            next[ex.id] = Array.from({ length: n }, (_, i) => {
              const saved = rows.find(r => r.exercice_id === ex.id && r.serie === i + 1)
              return saved
                ? { poids: saved.poids || '', reps_reelles: saved.reps_reelles?.toString() || '', valide: saved.valide || false, is_done: saved.is_done || saved.valide || false }
                : (prev[ex.id]?.[i] || { poids: '', reps_reelles: '', valide: false, is_done: false })
            })
          })
          return next
        })
        // Recalculer les blocs terminés — on compare au nombre de séries ATTENDU, pas juste les rows en base
        const done = new Set()
        exercices.forEach(ex => {
          const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
          if (!letter) return
          const group = exercices.filter(e => e.code?.match(/^([A-Za-z]+)/)?.[1] === letter)
          const expectedN = group.length > 1
            ? Math.max(...group.map(m => Math.max(parseInt(m.series) || 0, 1)))
            : Math.max(parseInt(ex.series) || 0, 1)
          const allDone = group.every(e => {
            const exRows = rows.filter(r => r.exercice_id === e.id && r.serie < 1000)
            return exRows.length >= expectedN && exRows.every(r => r.is_done)
          })
          if (allDone) done.add(letter)
        })
        setBlocsTermines(done)
      }
      if (skipsData) setBlocsSkippes(new Set(skipsData.map(s => s.bloc_lettre)))
    }
    document.addEventListener('visibilitychange', refreshOnVisible)
    return () => document.removeEventListener('visibilitychange', refreshOnVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercices, semaineActuelle, id])

  // Sync offline → online : rejoue la file dès que la connexion revient
  useEffect(() => {
    async function handleOnline() {
      const synced = await processQueue(supabase)
      if (synced > 0) {
        setPendingSync(0)
        // Recharger les charges pour refléter les données serveur
        fetchSeance()
      }
    }
    // Au montage : traiter les éventuelles charges en attente
    pendingCount().then(setPendingSync)
    if (navigator.onLine) handleOnline()

    // Message du SW quand il détecte le retour en ligne (Background Sync API)
    function handleSWMessage(e) {
      if (e.data?.type === 'PROCESS_CHARGE_QUEUE') handleOnline()
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage)

    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Marquer l'événement comme terminé quand toute la séance est finie
  // (doit être AVANT les early returns pour respecter les règles des hooks)
  useEffect(() => {
    if (exercices.length === 0) return
    const groups = []
    exercices.forEach(ex => {
      const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
      const last = groups[groups.length - 1]
      if (last && last.letter === letter && letter) last.items.push(ex)
      else groups.push({ letter, items: [ex] })
    })
    const totalBlocs = groups.length
    const doneBlocs = groups.filter(g => g.letter && (blocsTermines.has(g.letter) || blocsSkippes.has(g.letter))).length
    if (totalBlocs === 0 || doneBlocs < totalBlocs) return
    // Double verrou : ref (même montage) + localStorage (persiste même si la PWA est relancée)
    const storageKey = `fin_notif_${id}_${semaineActuelle}`
    if (finNotifSentRef.current || localStorage.getItem(storageKey)) return
    finNotifSentRef.current = true
    localStorage.setItem(storageKey, '1')
    ;(async () => {
      try {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
        const ydate = isoLocal(yesterday)
        const { data: ev } = await supabase.from('evenements').select('id, terminee')
          .eq('seance_id', id).gte('date', ydate)
          .order('date', { ascending: true }).limit(1).maybeSingle()
        if (!ev?.id) return
        // Update atomique : réussit uniquement si terminee est encore false
        // Si deux effets se déclenchent simultanément, un seul obtiendra la ligne en retour
        const { data: updated } = await supabase.from('evenements')
          .update({ terminee: true }).eq('id', ev.id).eq('terminee', false)
          .select('id').maybeSingle()
        if (!updated) return // déjà marqué terminé par un autre déclenchement
        const clientId = seance?.programmes?.client_id
        const [coachId, clientRes] = await Promise.all([
          getCoachId(),
          clientId
            ? supabase.from('clients').select('prenom').eq('id', clientId).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        const prenom = clientRes?.data?.prenom || 'Un client'
        if (coachId) {
          sendNotif(coachId, {
            titre: 'Séance terminée',
            corps: `${prenom} a terminé "${seance?.nom || 'sa séance'}"`,
            type: 'seance',
            lien: clientId ? `/client/${clientId}` : '/',
          })
        }
      } catch (e) { console.warn('[notif-seance] échec:', e) }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocsTermines, blocsSkippes, exercices])

  async function fetchSeance() {
    // Si hors ligne → charger depuis IndexedDB
    if (!navigator.onLine) {
      const local = await loadSeanceLocally(id)
      if (local) { restoreFromLocal(local); setOfflineMode(true); setLocalSavedAt(local.savedAt) }
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('seances')
      .select('*, programmes(id, nom, semaines, date_debut, created_at, client_id)')
      .eq('id', id).single()
    if (error) {
      const local = await loadSeanceLocally(id)
      if (local) { restoreFromLocal(local); setOfflineMode(true); setLocalSavedAt(local.savedAt) }
      setLoading(false)
      return
    }
    setSeance(data)
    setEchauffement(data.echauffement || [])
    setCardioDebutAll(data.cardio_debut || {})
    setCardioFinAll(data.cardio_fin || {})
    setCardioBlocs(Array.isArray(data.cardio_blocs) ? data.cardio_blocs : [])
    const total = data.programmes.semaines
    setSemaines(total)
    const dateDebut = data.programmes.date_debut || data.programmes.created_at
    const paramSemaine = parseInt(searchParams.get('semaine'))
    const semaineNaturelle = dateDebut ? getSemaineActuelle(dateDebut) : 1
    let semAct = (paramSemaine >= 1) ? paramSemaine : semaineNaturelle
    if (dateDebut) setSemaineActuelle(semAct)
    setRattrapageDeSemaine((paramSemaine >= 1 && paramSemaine !== semaineNaturelle) ? semaineNaturelle : null)

    const exData   = await fetchExercices(data.programmes.semaines, dateDebut, semAct)
    const rpeData  = await fetchRpeSeances(semAct)
    const commData = await fetchCommentaires(semAct)

    // Persister tout en local pour le mode offline
    if (exData) {
      await saveSeanceLocally(id, {
        seance:          data,
        echauffement:    data.echauffement || [],
        cardio_debut:    data.cardio_debut || {},
        cardio_fin:      data.cardio_fin || {},
        cardio_blocs:    Array.isArray(data.cardio_blocs) ? data.cardio_blocs : [],
        semaines:        total,
        semaineActuelle: semAct,
        exercices:       exData.exercices,
        charges:         exData.charges,
        tracking:        exData.tracking,
        warmupTracking:  exData.warmupTracking,
        blocsTermines:   [...(exData.blocsTermines || [])],
        blocsSkippes:    [...(exData.blocsSkippes || [])],
        rpeSeances:      rpeData || {},
        commentaires:    commData || [],
      })
    }
    setLoading(false)
  }

  function restoreFromLocal(local) {
    setSeance(local.seance)
    setEchauffement(local.echauffement || [])
    setCardioDebutAll(local.cardio_debut || {})
    setCardioFinAll(local.cardio_fin || {})
    setCardioBlocs(Array.isArray(local.cardio_blocs) ? local.cardio_blocs : [])
    setSemaines(local.semaines)
    setSemaineActuelle(local.semaineActuelle)
    setExercices(local.exercices || [])
    setCharges(local.charges || {})
    setTracking(local.tracking || {})
    setWarmupTracking(local.warmupTracking || {})
    setRpeSeances(local.rpeSeances || {})
    setCommentaires(local.commentaires || [])
    const restoredDone = new Set(local.blocsTermines || [])
    setBlocsTermines(restoredDone)
    const restoredSkipped = new Set(local.blocsSkippes || [])
    setBlocsSkippes(restoredSkipped)
    // Initialiser le bloc actif : premier bloc non terminé et non passé
    const restoredLetters = [...new Set((local.exercices || []).map(e => e.code?.match(/^([A-Za-z]+)/)?.[1]).filter(Boolean))]
    const restoredFirstActive = restoredLetters.find(l => !restoredDone.has(l) && !restoredSkipped.has(l))
    setActiveBloc(restoredFirstActive || null)
    // Restaurer le commentaire de la semaine actuelle
    const cur = (local.commentaires || []).find(c => c.semaine === local.semaineActuelle)
    if (cur) { setCommentaire(cur.texte); setNonEffectuee(cur.non_effectuee || false) }
  }

  // Rafraîchit uniquement les paramètres affichés de chaque exercice (nom,
  // séries, reps, tempo, récup, intensité, progressions par semaine, média) —
  // sans toucher à `tracking`/`charges`, pour ne jamais écraser une saisie en
  // cours (le SW peut déclencher ce rafraîchissement à tout moment via
  // aw:data-refreshed dès qu'il détecte un changement serveur, y compris pendant
  // que le joueur tape). Corrige le cas où le coach modifie un exercice (ex: une
  // variante sur 1-2 semaines) pendant que la page du joueur est déjà ouverte.
  async function refreshExerciceParams() {
    const { data, error } = await supabase
      .from('exercices').select('*, bibliotheque_exercices(image_url)')
      .eq('seance_id', id).order('ordre', { ascending: true })
    if (error || !data) return
    const fraisParId = Object.fromEntries(data.map(e => [e.id, e]))
    setExercices(prev => prev.map(ex => {
      const frais = fraisParId[ex.id]
      return frais ? { ...ex, ...frais, charges: ex.charges } : ex
    }))
  }
  useAutoRefresh(refreshExerciceParams)

  async function fetchExercices(totalSem, dateDebut, semAct) {
    const { data, error } = await supabase
      .from('exercices').select('*, charges(*), bibliotheque_exercices(image_url)')
      .eq('seance_id', id).order('ordre', { ascending: true })
    if (error) { console.error(error); return null }
    setExercices(data)
    const map = {}
    data.forEach(ex => {
      map[ex.id] = {}
      ex.charges.forEach(c => { map[ex.id][c.semaine] = { id: c.id, charge: c.charge, rpe_reel: c.rpe_reel } })
    })
    setCharges(map)

    let sem = semAct ?? (dateDebut ? getSemaineActuelle(dateDebut) : 1)
    const exIds = data.map(e => e.id)
    if (exIds.length) {
      const { data: demandes } = await supabase
        .from('demandes_video').select('*').in('exercice_id', exIds).eq('statut', 'en_attente')
      const vMap = {}
      ;(demandes || []).forEach(d => { vMap[d.exercice_id] = d })
      setVideoDemandes(vMap)
    }
    const { data: allRows } = await supabase.from('serie_tracking').select('*').in('exercice_id', exIds).eq('semaine', sem)
    const rows = allRows || []

    const groupMap = {}
    data.forEach(ex => {
      const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
      if (letter) {
        if (!groupMap[letter]) groupMap[letter] = []
        groupMap[letter].push(ex)
      }
    })

    const t = {}
    data.forEach(ex => {
      const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
      const group = letter ? groupMap[letter] : [ex]
      const n = group.length > 1
        ? Math.max(...group.map(e => Math.max(parseInt(e.series) || 0, 1)))
        : Math.max(parseInt(ex.series) || 0, 1)
      t[ex.id] = Array.from({ length: n }, (_, i) => {
        const saved = rows?.find(r => r.exercice_id === ex.id && r.serie === i + 1)
        return saved
          ? { poids: saved.poids || '', reps_reelles: saved.reps_reelles?.toString() || '', valide: saved.valide || false, is_done: saved.is_done || saved.valide || false }
          : { poids: '', reps_reelles: '', valide: false, is_done: false }
      })
    })
    setTracking(t)

    const wMap = {}
    data.forEach(ex => {
      const tracked = (rows || [])
        .filter(r => r.exercice_id === ex.id && r.serie >= 1000)
        .sort((a, b) => a.serie - b.serie)
        .map(r => ({ serie: r.serie, poids: r.poids || '', reps_reelles: r.reps_reelles?.toString() || '', fromCoach: r.serie < 2000, pourcentage: null }))

      // Si aucune série de chauffe enregistrée ET le coach en a défini → pré-remplir
      if (tracked.length === 0 && ex.series_echauffement?.length > 0) {
        const chargeBase = parseFloat(map[ex.id]?.[sem]?.charge) || null
        wMap[ex.id] = ex.series_echauffement.map((def, i) => {
          const pct = parseFloat(def.pourcentage) || null
          const poidsCalc = chargeBase && pct ? Math.round(chargeBase * pct / 100 * 2) / 2 : null
          return {
            serie: 1000 + i,
            poids: poidsCalc ? String(poidsCalc) : '',
            reps_reelles: def.reps ? String(def.reps) : '',
            fromCoach: true,
            pourcentage: pct,
          }
        })
      } else {
        wMap[ex.id] = tracked
      }
    })
    setWarmupTracking(wMap)

    const done = new Set()
    data.forEach(ex => {
      const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
      if (!letter) return
      const group = data.filter(e => e.code?.match(/^([A-Za-z]+)/)?.[1] === letter)
      const allDone = group.every(e => {
        const tr = t[e.id] || []
        return tr.length > 0 && tr.every(s => s.is_done)
      })
      if (allDone) done.add(letter)
    })
    setBlocsTermines(done)

    // Charger les blocs passés (non effectués)
    const { data: skipsData } = await supabase
      .from('bloc_skips').select('bloc_lettre').eq('seance_id', id).eq('semaine', sem)
    const skipped = new Set((skipsData || []).map(s => s.bloc_lettre))
    setBlocsSkippes(skipped)

    // Initialiser le bloc actif : premier bloc non terminé et non passé
    const allLetters = [...new Set(data.map(e => e.code?.match(/^([A-Za-z]+)/)?.[1]).filter(Boolean))]
    const firstActive = allLetters.find(l => !done.has(l) && !skipped.has(l))
    setActiveBloc(firstActive || null)

    // Charger les images des variantes de progression (nom_variante) depuis la bibliothèque
    const variantNoms = [...new Set(
      data.flatMap(ex => (ex.progressions || []).map(p => p.nom_variante).filter(Boolean))
    )]
    if (variantNoms.length > 0) {
      const { data: variantData } = await supabase
        .from('bibliotheque_exercices')
        .select('nom, image_url')
        .in('nom', variantNoms)
      const vMap = {}
      ;(variantData || []).forEach(v => { if (v.image_url) vMap[v.nom.toLowerCase()] = v.image_url })
      setVariantImageMap(vMap)
    }

    return { exercices: data, charges: map, tracking: t, warmupTracking: wMap, blocsTermines: done, blocsSkippes: skipped }
  }

  async function fetchCommentaires(semAct) {
    const { data } = await supabase
      .from('seance_commentaires').select('*').eq('seance_id', id).order('semaine', { ascending: false })
    if (!data) return null
    setCommentaires(data)
    const sem = semAct ?? semaineActuelle
    const cur = data.find(c => c.semaine === sem)
    if (cur) { setCommentaire(cur.texte); setNonEffectuee(cur.non_effectuee || false) }
    return data
  }

  async function marquerVideoEnvoyee(exerciceId) {
    const demande = videoDemandes[exerciceId]
    if (!demande) return
    await supabase.from('demandes_video')
      .update({ statut: 'faite', fait_le: new Date().toISOString() })
      .eq('id', demande.id)
    setVideoDemandes(prev => { const n = { ...prev }; delete n[exerciceId]; return n })
    try {
      const coachId = await getCoachId()
      const exo = exercices.find(e => e.id === exerciceId)
      const clientId = seance?.programmes?.client_id
      if (coachId) {
        sendNotif(coachId, {
          titre: 'Vidéo envoyée sur WhatsApp',
          corps: `${exo?.nom || 'Un exercice'} — à corriger`,
          type: 'video',
          lien: clientId ? `/client/${clientId}` : '/',
        })
      }
    } catch (e) { console.warn('[marquerVideoEnvoyee] notif échouée:', e) }
  }

  async function toggleNonEffectuee() {
    setNonEffectueeSaving(true)
    const nouvelleValeur = !nonEffectuee
    setNonEffectuee(nouvelleValeur)
    await supabase.from('seance_commentaires').upsert(
      { seance_id: id, semaine: semaineActuelle, texte: commentaire || '', non_effectuee: nouvelleValeur },
      { onConflict: 'seance_id,semaine' }
    )
    setNonEffectueeSaving(false)
  }

  async function saveCommentaire() {
    if (!commentaire.trim()) return
    // Note nouvelle ou modifiée (pas un simple enregistrement à l'identique) : on prévient le coach
    const avant = (commentaires.find(c => c.semaine === semaineActuelle)?.texte || '').trim()
    const changee = commentaire.trim() !== avant
    const { error } = await supabase.from('seance_commentaires').upsert(
      { seance_id: id, semaine: semaineActuelle, texte: commentaire.trim() },
      { onConflict: 'seance_id,semaine' }
    )
    if (error) {
      // Fallback : delete-then-insert si la contrainte unique est absente
      await supabase.from('seance_commentaires')
        .delete().eq('seance_id', id).eq('semaine', semaineActuelle)
      await supabase.from('seance_commentaires')
        .insert({ seance_id: id, semaine: semaineActuelle, texte: commentaire.trim() })
    }
    setCommentaires(prev => {
      const others = prev.filter(c => c.semaine !== semaineActuelle)
      return [{ seance_id: id, semaine: semaineActuelle, texte: commentaire.trim() }, ...others]
    })
    setCommentSaved(true)
    setTimeout(() => setCommentSaved(false), 2000)
    if (changee) notifierCoachNote(commentaire.trim())
  }

  async function notifierCoachNote(texte) {
    try {
      const coachId = await getCoachId()
      const clientId = seance?.programmes?.client_id
      if (!coachId) return
      // Séance de groupe (programme sans client) : on retrouve le client connecté
      const userId = clientId ? null : (await supabase.auth.getSession()).data.session?.user?.id
      const { data: c } = clientId || userId
        ? await supabase.from('clients').select('prenom, nom').eq(clientId ? 'id' : 'user_id', clientId || userId).maybeSingle()
        : { data: null }
      const nom = c ? `${c.prenom} ${c.nom || ''}`.trim() : 'Un client'
      const extrait = texte.length > 120 ? texte.slice(0, 117) + '…' : texte
      sendNotif(coachId, {
        titre: `${nom} a laissé une note`,
        corps: `${seance?.nom || 'Séance'} · S${semaineActuelle} : « ${extrait} »`,
        type: 'note_seance',
        lien: `/seance/${id}`,
      })
    } catch (e) { console.warn('[notifierCoachNote] échec :', e?.message) }
  }

  async function fetchRpeSeances() {
    const { data, error } = await supabase.from('rpe_seances').select('*').eq('seance_id', id)
    if (error) { console.error(error); return null }
    const map = {}
    data.forEach(r => { map[r.semaine] = { id: r.id, rpe_cible: r.rpe_cible, rpe_reel: r.rpe_reel } })
    setRpeSeances(map)
    return map
  }

  async function lancerTimer(secs) {
    const { data: { session } } = await supabase.auth.getSession()
    startTimer(secs, session?.user?.id || null, id)
  }

  function updateTrackingField(exId, serieIdx, field, value) {
    setTracking(prev => {
      const series = [...(prev[exId] || [])]
      series[serieIdx] = { ...(series[serieIdx] || {}), [field]: value }
      return { ...prev, [exId]: series }
    })
    // Auto-sauvegarde débouncée : la valeur est persistée ~800 ms après la
    // dernière frappe, même si le champ ne perd jamais le focus (app fermée
    // ou basculée en plein milieu de la saisie).
    scheduleSerieSave(exId, serieIdx)
  }

  const saveTimersRef = useRef({})
  function scheduleSerieSave(exId, serieIdx) {
    const key = `${exId}-${serieIdx}`
    clearTimeout(saveTimersRef.current[key])
    saveTimersRef.current[key] = setTimeout(() => { saveSerieField(exId, serieIdx) }, 800)
  }
  // Prévient le coach une seule fois si le client a saisi des données dans la
  // séance (poids/reps) sans jamais la terminer. Info simple dans l'onglet notifications
  // (pas de push téléphone : insert direct dans `notifications`, pas de
  // sendNotif) pour qu'Arthur puisse aller consulter les charges utilisées,
  // sans que ça sonne comme une alerte urgente. Verrou côté DB
  // (notif_incomplete_envoyee) : sûr même si l'app repasse plusieurs fois en
  // arrière-plan, et n'envoie rien si la séance a entre-temps été terminée.
  async function flagSeanceIncomplete() {
    const hasData = Object.values(trackingRef.current || {}).some(
      series => (series || []).some(s => s?.poids || s?.reps_reelles)
    )
    if (!hasData) return
    try {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
      const ydate = isoLocal(yesterday)
      const { data: ev } = await supabase.from('evenements').select('id, terminee, notif_incomplete_envoyee')
        .eq('seance_id', id).gte('date', ydate)
        .order('date', { ascending: true }).limit(1).maybeSingle()
      if (!ev?.id || ev.terminee || ev.notif_incomplete_envoyee) return
      const { data: updated } = await supabase.from('evenements')
        .update({ notif_incomplete_envoyee: true }).eq('id', ev.id)
        .eq('terminee', false).eq('notif_incomplete_envoyee', false)
        .select('id').maybeSingle()
      if (!updated) return // déjà signalé par un autre déclenchement
      // Lecture depuis la ref → `seance` (state) est capturé une fois pour toutes par
      // ce handler monté au chargement (deps [] ci-dessous) et resterait figé à sa
      // valeur initiale (null) sinon — même piège que `tracking`/`trackingRef` plus haut.
      const currentSeance = seanceRef.current
      const clientId = currentSeance?.programmes?.client_id
      const [coachId, clientRes] = await Promise.all([
        getCoachId(),
        clientId
          ? supabase.from('clients').select('prenom').eq('id', clientId).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      const prenom = clientRes?.data?.prenom || 'Un client'
      if (coachId) {
        // Insert direct (pas sendNotif) : reste dans l'onglet sans déclencher
        // de push téléphone, volontairement discret.
        await supabase.from('notifications').insert([{
          destinataire_id: coachId,
          titre: 'Séance non terminée',
          corps: `${prenom} a commencé "${currentSeance?.nom || 'sa séance'}" sans la terminer — charges à consulter dans son suivi`,
          type: 'seance',
          lien: clientId ? `/client/${clientId}` : '/',
        }])
      }
    } catch (e) { console.warn('[notif-seance-incomplete] échec:', e) }
  }
  // Flush toutes les sauvegardes en attente si l'app passe en arrière-plan
  useEffect(() => {
    const flushAll = () => {
      Object.keys(saveTimersRef.current).forEach(key => {
        clearTimeout(saveTimersRef.current[key])
        const [exId, si] = [key.slice(0, key.lastIndexOf('-')), key.slice(key.lastIndexOf('-') + 1)]
        saveSerieField(exId, parseInt(si))
      })
      flagSeanceIncomplete()
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flushAll() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushAll)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushAll)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function modifierSerie(exId, serieIdx, field, value, groupLetter) {
    const serie = tracking[exId]?.[serieIdx]
    if (!serie?.is_done) { updateTrackingField(exId, serieIdx, field, value); return }
    const maj = { ...serie, [field]: value, valide: false, is_done: false }
    setTracking(prev => {
      const series = [...(prev[exId] || [])]
      series[serieIdx] = maj
      return { ...prev, [exId]: series }
    })
    setPendingUnvalidate(null)
    supabase.from('serie_tracking').upsert({
      exercice_id: exId, semaine: semaineActuelle, serie: serieIdx + 1,
      poids: maj.poids || null,
      reps_reelles: maj.reps_reelles ? parseInt(maj.reps_reelles) : null,
      valide: false, is_done: false
    }, { onConflict: 'exercice_id,semaine,serie' })
    if (groupLetter) {
      setBlocsTermines(prev => { const n = new Set(prev); n.delete(groupLetter); return n })
      setExpandedDone(prev => { const n = new Set(prev); n.delete(groupLetter); return n })
      setActiveBloc(groupLetter)
    }
  }

  async function devaliderSerie(exId, serieIdx, groupLetter) {
    if (!exId) return
    const newT = { ...tracking }
    newT[exId] = [...(tracking[exId] || [])]
    newT[exId][serieIdx] = { ...newT[exId][serieIdx], valide: false, is_done: false }
    setTracking(newT)
    setPendingUnvalidate(null)
    await supabase.from('serie_tracking').upsert({
      exercice_id: exId, semaine: semaineActuelle, serie: serieIdx + 1,
      poids: newT[exId][serieIdx].poids || null,
      reps_reelles: newT[exId][serieIdx].reps_reelles ? parseInt(newT[exId][serieIdx].reps_reelles) : null,
      valide: false, is_done: false
    }, { onConflict: 'exercice_id,semaine,serie' })
    // Retirer le bloc des terminés si nécessaire
    if (groupLetter) {
      setBlocsTermines(prev => { const s = new Set(prev); s.delete(groupLetter); return s })
      setExpandedDone(prev => { const s = new Set(prev); s.delete(groupLetter); return s })
      setActiveBloc(groupLetter)
    }
    flashSaved()
  }

  async function skipBloc(letter) {
    setBlocsSkippes(prev => new Set([...prev, letter]))
    // Passer au bloc suivant non terminé et non passé
    const letters = [...new Set(exercices.map(e => e.code?.match(/^([A-Za-z]+)/)?.[1]).filter(Boolean))]
    const nextLetter = letters.find(l => l !== letter && !blocsTermines.has(l) && !blocsSkippes.has(l) && l !== letter)
    setActiveBloc(nextLetter || null)
    await supabase.from('bloc_skips').upsert(
      { seance_id: id, semaine: semaineActuelle, bloc_lettre: letter },
      { onConflict: 'seance_id,semaine,bloc_lettre', ignoreDuplicates: true }
    )
    flashSaved()
  }

  async function unskipBloc(letter) {
    setBlocsSkippes(prev => { const s = new Set(prev); s.delete(letter); return s })
    setActiveBloc(letter)
    await supabase.from('bloc_skips').delete()
      .eq('seance_id', id).eq('semaine', semaineActuelle).eq('bloc_lettre', letter)
    flashSaved()
  }

  async function saveSerieField(exId, serieIdx) {
    if (!exId) return
    // Lecture depuis la ref → toujours la dernière valeur saisie (évite closure périmée)
    const serie = trackingRef.current[exId]?.[serieIdx] || {}
    // Sauvegarder dès la saisie, même avant validation — évite la perte si on quitte l'app
    if (!serie.poids && !serie.reps_reelles) return // rien à sauvegarder
    // Ne touche jamais à valide/is_done ici : ces colonnes appartiennent à
    // validerSerie/devaliderSerie. Sinon un blur déclenché en même temps qu'un
    // tap sur « Valider » peut écraser la validation en course (race condition
    // réseau) et forcer le joueur à valider une deuxième fois.
    const exoSSF = exercices.find(e => e.id === exId)
    const { error } = await supabase.from('serie_tracking').upsert({
      exercice_id: exId, semaine: semaineActuelle, serie: serieIdx + 1,
      poids: serie.poids || null,
      reps_reelles: serie.reps_reelles ? parseInt(serie.reps_reelles) : parseTargetReps(exoSSF?.repetitions),
    }, { onConflict: 'exercice_id,semaine,serie' })
    if (error) { console.error('[saveSerieField]', error.message); return }  // pas de flash « sauvegardé » si échec réel
    flashSaved()
    autoPlacerSeanceSurCalendrier(seance?.programmes?.client_id, id, semaineActuelle)
  }

  async function validerSerie(exId, serieIdx, groupLetter, groupItems, targetReps, boutonEl) {
    if (!exId) return
    const vKey = `${exId}-${serieIdx}`
    if (validatingSet.has(vKey)) return // anti double-tap
    setValidatingSet(prev => new Set([...prev, vKey]))
    const serie = tracking[exId]?.[serieIdx] || {}
    // Vérifie si les reps ont été atteintes
    const repsOk = !targetReps || !serie.reps_reelles ||
                    parseInt(serie.reps_reelles) >= parseInt(targetReps)
    const newT = { ...tracking }
    newT[exId] = [...(tracking[exId] || [])]
    newT[exId][serieIdx] = { ...serie, is_done: true, valide: repsOk }
    setTracking(newT)
    flashSaved()
    await supabase.from('serie_tracking').upsert({
      exercice_id: exId, semaine: semaineActuelle, serie: serieIdx + 1,
      poids: serie.poids || null,
      reps_reelles: serie.reps_reelles ? parseInt(serie.reps_reelles) : parseTargetReps(targetReps),
      valide: repsOk,
      is_done: true,
    }, { onConflict: 'exercice_id,semaine,serie' })
    autoPlacerSeanceSurCalendrier(seance?.programmes?.client_id, id, semaineActuelle)

    // ── Gain d'XP en direct (bulle éphémère, clients hors groupe) ─────────
    // Chaque série réelle (exercice+semaine+numéro) ne compte qu'une fois :
    // on la REMPLACE dans allSets au lieu de l'ajouter, pour qu'un cycle
    // valider → dévalider → revalider ne double-compte jamais son XP.
    if (xpEnabledRef.current) {
      const poidsVal = parseFloat(serie.poids)
      const repsVal = parseInt(serie.reps_reelles)
      if (poidsVal > 0 && repsVal > 0) {
        const exo = exercices.find(e => e.id === exId)
        const nom = exo?.nom
        if (nom) {
          const serieKey = `${exId}-${semaineActuelle}-${serieIdx + 1}`
          const prevSets = xpByNameRef.current[nom]?.allSets || []
          const beforeXp = computeExerciseXp(prevSets, bodyweightRef.current)
          const d = new Date()
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const newSets = [...prevSets.filter(s => s.key !== serieKey), { date: today, poids: poidsVal, reps: repsVal, key: serieKey }]
          const afterXp = computeExerciseXp(newSets, bodyweightRef.current)
          const delta = afterXp - beforeXp

          xpByNameRef.current = { ...xpByNameRef.current, [nom]: { allSets: newSets } }
          const totalAvant = xpTotalRef.current
          xpTotalRef.current = totalAvant + delta
          if (delta > 0) {
            xpBlocRef.current[groupLetter] = (xpBlocRef.current[groupLetter] || 0) + delta
            if (boutonEl) triggerXpBulle(boutonEl, delta, totalAvant)
          }
        }
      }
    }

    // ── Détection 1RM PR ─────────────────────────────────────────────────
    const repsR = parseInt(serie.reps_reelles)
    const poids1RM = parseFloat(serie.poids)
    if (repsR === 1 && poids1RM > 0 && poids1RM > (prNotifiedRef.current[exId] || 0)) {
      ;(async () => {
        try {
          // Max historique des semaines précédentes (exclut la semaine en cours)
          const { data: prevRows } = await supabase
            .from('serie_tracking').select('poids')
            .eq('exercice_id', exId).eq('reps_reelles', 1).eq('is_done', true)
            .lt('semaine', semaineActuelle)
          const prevMax = prevRows?.length
            ? Math.max(...prevRows.map(r => parseFloat(r.poids) || 0))
            : 0
          // Aussi comparer au max déjà notifié cette séance (même semaine)
          const sessionMax = prNotifiedRef.current[exId] || 0
          if (poids1RM > Math.max(prevMax, sessionMax)) {
            prNotifiedRef.current[exId] = poids1RM
            const exo = exercices.find(e => e.id === exId)
            const exoNom = exo?.nom || 'Exercice'
            const clientId = seance?.programmes?.client_id
            const coachId = await getCoachId()
            // Notif coach
            if (coachId && clientId) {
              const { data: clientData } = await supabase
                .from('clients').select('prenom').eq('id', clientId).maybeSingle()
              const prenom = clientData?.prenom || 'Un client'
              sendNotif(coachId, {
                titre: 'Nouveau 1RM',
                corps: `${prenom} — ${exoNom} : ${poids1RM} kg`,
                type: 'pr',
                lien: `/client/${clientId}`,
              })
            }
            // Insérer dans tests_resultats
            if (clientId) {
              // Trouver ou créer le test_type correspondant à l'exercice
              let { data: testType } = await supabase
                .from('tests_types').select('id').ilike('nom', exoNom).maybeSingle()
              if (!testType) {
                const { data: newType } = await supabase
                  .from('tests_types').insert({ nom: exoNom, unite: 'kg' }).select().single()
                testType = newType
              }
              if (testType?.id) {
                const today = isoLocal()
                await supabase.from('tests_resultats').insert({
                  test_type_id: testType.id,
                  client_id: clientId,
                  valeur: poids1RM,
                  date: today,
                  notes: `1RM automatique — ${seance?.nom || ''} S${semaineActuelle}`,
                })
              }
            }
          }
        } catch (e) { console.warn('[1rm-pr] échec:', e) }
      })()
    }

    // ── Auto-fill : écrire le max validé dans la table `charges` ──
    const currentPoids = parseFloat(serie.poids)
    if (currentPoids > 0) {
      // Calcul du max parmi toutes les séries is_done de cet exo cette semaine
      const allSeries = newT[exId] || []
      const maxPoids = Math.max(
        ...allSeries
          .filter(s => s.is_done && parseFloat(s.poids) > 0)
          .map(s => parseFloat(s.poids)),
        0
      )
      const existingCharge = charges[exId]?.[semaineActuelle]
      const currentChargeVal = parseFloat(existingCharge?.charge) || 0
      if (maxPoids > 0 && maxPoids >= currentChargeVal) {
        const maxStr = String(maxPoids)
        // Mise à jour optimiste de l'UI
        setCharges(prev => ({
          ...prev,
          [exId]: { ...prev[exId], [semaineActuelle]: { ...(existingCharge || {}), charge: maxStr } },
        }))
        // Sauvegarde Supabase
        if (existingCharge?.id) {
          await supabase.from('charges').update({ charge: maxStr }).eq('id', existingCharge.id)
        } else {
          const { data: newCharge } = await supabase
            .from('charges')
            .insert([{ exercice_id: exId, semaine: semaineActuelle, charge: maxStr }])
            .select().single()
          if (newCharge) {
            setCharges(prev => ({
              ...prev,
              [exId]: { ...prev[exId], [semaineActuelle]: { id: newCharge.id, charge: maxStr, rpe_reel: null } },
            }))
          }
        }
      }
    }

    // Déverrouiller le bouton Valider une fois toutes les opérations terminées
    setValidatingSet(prev => { const n = new Set(prev); n.delete(vKey); return n })
  }

  function terminerBloc(groupLetter, boutonEl) {
    setBlocsTermines(prev => new Set([...prev, groupLetter]))
    autoPlacerSeanceSurCalendrier(seance?.programmes?.client_id, id, semaineActuelle)
    const letters = [...new Set(exercices.map(e => e.code?.match(/^([A-Za-z]+)/)?.[1]).filter(Boolean))]
    const idx = letters.indexOf(groupLetter)
    const nextLetter = letters.slice(idx + 1).find(l => !blocsTermines.has(l) && !blocsSkippes.has(l))
    if (nextLetter) {
      setActiveBloc(nextLetter)
      setTimeout(() => blocRefs.current[nextLetter]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
    }

    // Récap XP du bloc (clients hors groupe) : aucun XP supplémentaire n'est
    // accordé ici (déjà donné série par série) — juste une bulle qui résume
    // ce qui vient d'être gagné sur l'ensemble du bloc.
    if (xpEnabledRef.current && boutonEl) {
      const gagne = xpBlocRef.current[groupLetter] || 0
      if (gagne > 0) {
        const totalAvantRecap = xpTotalRef.current - gagne
        triggerXpBulle(boutonEl, gagne, totalAvantRecap)
        delete xpBlocRef.current[groupLetter]
      }
    }
  }

  function addWarmupSet(exId) {
    setWarmupTracking(prev => {
      const existing = prev[exId] || []
      const newSerie = existing.length > 0 ? Math.max(...existing.map(s => s.serie)) + 1 : 1000
      return { ...prev, [exId]: [...existing, { serie: newSerie, poids: '', reps_reelles: '' }] }
    })
  }

  function updateWarmupField(exId, idx, field, value) {
    setWarmupTracking(prev => {
      const arr = [...(prev[exId] || [])]
      arr[idx] = { ...arr[idx], [field]: value }
      return { ...prev, [exId]: arr }
    })
  }

  async function saveWarmupSet(exId, idx) {
    const set = warmupTracking[exId]?.[idx]
    if (!set) return
    await supabase.from('serie_tracking').upsert({
      exercice_id: exId, semaine: semaineActuelle, serie: set.serie,
      poids: set.poids || null,
      reps_reelles: set.reps_reelles ? parseInt(set.reps_reelles) : null,
      valide: false, is_done: false,
    }, { onConflict: 'exercice_id,semaine,serie' })
    flashSaved()
    autoPlacerSeanceSurCalendrier(seance?.programmes?.client_id, id, semaineActuelle)
  }

  async function removeWarmupSet(exId, idx) {
    const set = warmupTracking[exId]?.[idx]
    if (set?.serie) {
      await supabase.from('serie_tracking').delete()
        .eq('exercice_id', exId).eq('semaine', semaineActuelle).eq('serie', set.serie)
    }
    setWarmupTracking(prev => ({
      ...prev, [exId]: (prev[exId] || []).filter((_, i) => i !== idx)
    }))
  }

  async function validerElement(cle) {
    setElemValides(prev => new Set([...prev, cle]))
    setElemOuverts(prev => { const n = new Set(prev); n.delete(cle); return n })
    autoPlacerSeanceSurCalendrier(seance?.programmes?.client_id, id, semaineActuelle)
    await supabase.from('seance_element_validations').upsert(
      { seance_id: id, semaine: semaineActuelle, element: cle },
      { onConflict: 'seance_id,semaine,element', ignoreDuplicates: true }
    )
    flashSaved()
  }

  async function devaliderElement(cle) {
    setElemValides(prev => { const n = new Set(prev); n.delete(cle); return n })
    setElemConfirm(null)
    await supabase.from('seance_element_validations').delete()
      .eq('seance_id', id).eq('semaine', semaineActuelle).eq('element', cle)
    flashSaved()
  }

  // Props communes d'un élément validable
  function propsElement(cle) {
    return {
      valide: elemValides.has(cle),
      ouvert: elemOuverts.has(cle),
      confirm: elemConfirm === cle,
      onValider: () => validerElement(cle),
      onBasculer: () => setElemOuverts(prev => { const n = new Set(prev); n.has(cle) ? n.delete(cle) : n.add(cle); return n }),
      onDemanderAnnul: () => setElemConfirm(cle),
      onAnnulNon: () => setElemConfirm(null),
      onAnnulOui: () => devaliderElement(cle),
    }
  }

  function CarteCardio({ cle, titre, cardio }) {
    const resume = [cardio.type, cardio.duree_min && `${cardio.duree_min} min`, cardio.intensite].filter(Boolean).join(' · ')
    return (
      <ElementValidable titre={titre} sousTitre={cardio.type} resume={resume} icone={ICONE_CARDIO} {...propsElement(cle)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            {cardio.duree_min && <span style={S.cardioPuceFort}>{cardio.duree_min} min</span>}
            {cardio.intensite && <span style={S.cardioPuce}>{cardio.intensite}</span>}
          </div>
          {cardio.media_url && <Vignette url={cardio.media_url} nom={cardio.type} youtubeId={youtubeId} onOuvrir={setMediaModal} large={56} />}
        </div>
        {cardio.note && <p style={S.cardioNote}>{cardio.note}</p>}
      </ElementValidable>
    )
  }

  function flashSaved() { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  async function toggleHisto(exId) {
    const isOpen = histoOpen[exId]
    setHistoOpen(prev => ({ ...prev, [exId]: !isOpen }))
    // Charger les données réelles si pas encore chargées
    if (!isOpen && !histoTracking[exId]) {
      setHistoLoading(prev => ({ ...prev, [exId]: true }))
      const { data } = await supabase
        .from('serie_tracking')
        .select('*')
        .eq('exercice_id', exId)
        .eq('is_done', true)
        .lt('serie', 1000) // exclure les séries d'échauffement
        .order('semaine').order('serie')
      // Grouper par semaine
      const grouped = {}
      ;(data || []).forEach(r => {
        if (!grouped[r.semaine]) grouped[r.semaine] = []
        grouped[r.semaine].push(r)
      })
      setHistoTracking(prev => ({ ...prev, [exId]: grouped }))
      setHistoLoading(prev => ({ ...prev, [exId]: false }))
    }
  }

  async function updateCharge(exId, semaine, field, valeur) {
    if (!exId) return
    // Normaliser : "-", "--", "—", "" → traiter comme vide (ne pas sauvegarder)
    const cleanVal = (valeur || '').trim().replace(/^[-—]+$/, '')
    const existing = charges[exId]?.[semaine]
    if (!cleanVal && !existing) return // rien à faire

    // Mise à jour optimiste immédiate de l'UI (avec ou sans connexion)
    setCharges(prev => ({
      ...prev,
      [exId]: { ...prev[exId], [semaine]: { ...(existing || {}), [field]: cleanVal } },
    }))

    // Hors ligne → file d'attente
    if (!navigator.onLine) {
      await enqueueCharge({
        exerciceId:       exId,
        semaine,
        field,
        value:            cleanVal,
        existingChargeId: existing?.id || null,
      })
      const n = await pendingCount()
      setPendingSync(n)
      // Enregistrer le Background Sync pour Android/Chrome
      navigator.serviceWorker?.ready.then(sw =>
        sw.sync?.register('sync-charges').catch(() => {})
      )
      flashSaved()   // feedback visuel même hors ligne
      return
    }

    // En ligne → sauvegarde directe
    if (existing) {
      const { error } = await supabase.from('charges').update({ [field]: cleanVal || null }).eq('id', existing.id)
      if (error) { console.error('updateCharge update:', error.message); return }
      flashSaved()
    } else {
      const { data, error } = await supabase.from('charges').insert([{ exercice_id: exId, semaine, [field]: cleanVal || null }]).select().single()
      if (error) { console.error('updateCharge insert:', error.message); return }
      setCharges(prev => ({ ...prev, [exId]: { ...prev[exId], [semaine]: { id: data.id, charge: '', rpe_reel: null, [field]: cleanVal } } }))
      flashSaved()
    }

    // Auto-remplir RPE séance = moyenne des RPE exercices (avec conversion RIR→RPE)
    if (field === 'rpe_reel') {
      const vals = []
      for (const ex of exercices) {
        const raw = ex.id === exId ? cleanVal : charges[ex.id]?.[semaine]?.rpe_reel
        if (!raw) continue
        const num = parseFloat(raw)
        if (isNaN(num) || num <= 0) continue
        const rpe = ex.type_intensite === 'RIR' ? 10 - num : num
        if (rpe >= 1 && rpe <= 10) vals.push(rpe)
      }
      if (vals.length > 0) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        await updateRpeReel(semaine, String(Math.round(avg)))
      }
    }
  }

  async function updateRpeReel(semaine, valeur) {
    // Normaliser : "-", "--", "—", "" → traiter comme vide
    const cleanVal = (valeur || '').trim().replace(/^[-—]+$/, '')
    const existing = rpeSeances[semaine]
    if (!cleanVal && !existing) return
    if (existing) {
      const { error } = await supabase.from('rpe_seances').update({ rpe_reel: cleanVal || null }).eq('id', existing.id)
      if (error) { console.error('updateRpeReel update:', error.message); return }
      setRpeSeances(prev => ({ ...prev, [semaine]: { ...existing, rpe_reel: cleanVal } }))
      flashSaved()
    } else {
      const { data, error } = await supabase.from('rpe_seances').insert([{ seance_id: id, semaine, rpe_reel: cleanVal || null }]).select().single()
      if (error) { console.error('updateRpeReel insert:', error.message); return }
      setRpeSeances(prev => ({ ...prev, [semaine]: { id: data.id, rpe_cible: null, rpe_reel: cleanVal } }))
      flashSaved()
    }
  }

  // Change la semaine à laquelle cette séance est rattachée. Si des données
  // ont déjà été saisies sur la semaine actuelle (ex : joueur qui a fait sa
  // séance la semaine 4 mais veut qu'elle compte comme le rattrapage de la
  // semaine 3), propose de les déplacer plutôt que de juste changer de vue —
  // sinon les poids/reps déjà remplis restent orphelins sur l'ancienne semaine.
  async function changerSemaine(nouvelleSemaine) {
    if (!nouvelleSemaine || nouvelleSemaine === semaineActuelle) return
    const exIds = exercices.map(e => e.id)

    const hasCurrentData =
      Object.values(tracking).some(list => (list || []).some(s => s.poids || s.reps_reelles)) ||
      Object.values(charges).some(c => c[semaineActuelle]?.charge) ||
      !!rpeSeances[semaineActuelle]?.rpe_reel ||
      !!commentaires.find(c => c.semaine === semaineActuelle && (c.texte || c.non_effectuee))

    if (!hasCurrentData) {
      window.location.href = `/client/seance/${id}?semaine=${nouvelleSemaine}`
      return
    }

    const deplacer = window.confirm(
      `Tu as déjà rempli des données pour la semaine ${semaineActuelle}.\n\n` +
      `Veux-tu les déplacer vers la semaine ${nouvelleSemaine} ?\n\n` +
      `OK = déplacer les poids/reps/notes déjà saisis vers S${nouvelleSemaine}.\n` +
      `Annuler = juste changer de semaine sans rien déplacer.`
    )
    if (!deplacer) {
      window.location.href = `/client/seance/${id}?semaine=${nouvelleSemaine}`
      return
    }

    // On ne déplace jamais si la semaine cible contient déjà des données pour
    // cette séance (on ne veut pas risquer d'écraser un vrai historique).
    const [{ data: exTracking }, { data: exCharges }, { data: exRpe }, { data: exComm }, { data: exSkips }] = await Promise.all([
      supabase.from('serie_tracking').select('id').in('exercice_id', exIds).eq('semaine', nouvelleSemaine).limit(1),
      supabase.from('charges').select('id').in('exercice_id', exIds).eq('semaine', nouvelleSemaine).limit(1),
      supabase.from('rpe_seances').select('id').eq('seance_id', id).eq('semaine', nouvelleSemaine).limit(1),
      supabase.from('seance_commentaires').select('id').eq('seance_id', id).eq('semaine', nouvelleSemaine).limit(1),
      supabase.from('bloc_skips').select('id').eq('seance_id', id).eq('semaine', nouvelleSemaine).limit(1),
    ])
    if (exTracking?.length || exCharges?.length || exRpe?.length || exComm?.length || exSkips?.length) {
      alert(`La semaine ${nouvelleSemaine} contient déjà des données pour cette séance : le déplacement a été annulé pour ne rien écraser.`)
      return
    }

    await Promise.all([
      supabase.from('serie_tracking').update({ semaine: nouvelleSemaine }).in('exercice_id', exIds).eq('semaine', semaineActuelle),
      supabase.from('charges').update({ semaine: nouvelleSemaine }).in('exercice_id', exIds).eq('semaine', semaineActuelle),
      supabase.from('rpe_seances').update({ semaine: nouvelleSemaine }).eq('seance_id', id).eq('semaine', semaineActuelle),
      supabase.from('seance_commentaires').update({ semaine: nouvelleSemaine }).eq('seance_id', id).eq('semaine', semaineActuelle),
      supabase.from('bloc_skips').update({ semaine: nouvelleSemaine }).eq('seance_id', id).eq('semaine', semaineActuelle),
    ])

    // Si cette séance a été ouverte depuis le calendrier (un événement lié
    // existe pour ce jour-là), on marque aussi cet événement avec la nouvelle
    // semaine — sinon recliquer sur ce même jour du calendrier rouvrirait la
    // séance sur l'ancienne semaine (recalculée depuis la date) au lieu de
    // suivre les données qu'on vient de déplacer.
    const clientId = seance?.programmes?.client_id
    const dateDebut = seance?.programmes?.date_debut || seance?.programmes?.created_at
    const totalSem = seance?.programmes?.semaines
    if (clientId && dateDebut) {
      try {
        const { data: evsLies } = await supabase
          .from('evenements').select('id, date, semaine_override')
          .eq('client_id', clientId).eq('seance_id', id)
        const match = (evsLies || []).find(ev => {
          const w = ev.semaine_override ?? getCycleWeekForDate(ev.date + 'T00:00:00', dateDebut, totalSem)
          return w === semaineActuelle
        })
        if (match) await supabase.from('evenements').update({ semaine_override: nouvelleSemaine }).eq('id', match.id)
      } catch (e) { console.warn('[changerSemaine] maj événement calendrier échouée:', e) }
    }

    window.location.href = `/client/seance/${id}?semaine=${nouvelleSemaine}`
  }

  // ── Helpers média ──────────────────────────────────────────────────────────
  function youtubeId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : null
  }
  function isImageUrl(url) {
    return /\.(png|gif|jpe?g|webp|svg)(\?.*)?$/i.test(url) || (!youtubeId(url) && !/youtube|youtu\.be/i.test(url))
  }

  if (loading) return <PageLoading entete />
  if (!seance) return <div style={S.centered}><p style={{ color: '#888' }}>Séance introuvable.</p></div>
  if (seance.type === 'terrain') return <SeanceTerrainClient id={id} seance={seance} />

  const cols = Array.from({ length: semaines }, (_, i) => i + 1)
  const graphData = cols.map(s => ({
    name: `S${s}`,
    'RPE cible': rpeSeances[s]?.rpe_cible != null ? parseFloat(rpeSeances[s].rpe_cible) : null,
    'RPE réel':  rpeSeances[s]?.rpe_reel  != null ? parseFloat(rpeSeances[s].rpe_reel)  : null,
  }))

  // Grouper les exercices par lettre
  const groups = []
  exercices.forEach(ex => {
    const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
    const last = groups[groups.length - 1]
    if (last && last.letter === letter && letter) last.items.push(ex)
    else groups.push({ letter, items: [ex] })
  })

  const totalBlocs = groups.length
  const doneBlocs = groups.filter(g => g.letter && (blocsTermines.has(g.letter) || blocsSkippes.has(g.letter))).length

  // Résumé d'un bloc terminé (ex: "4×6 · 80 kg")
  function blocSummary(groupItems) {
    const ex = groupItems[0]
    const progActif = (ex.progressions || []).find(p => semaineActuelle >= (p.semaine_debut || 1) && semaineActuelle <= (p.semaine_fin || 999))
    const series = progActif?.series || ex.series || '?'
    const reps = progActif?.repetitions || ex.repetitions || '?'
    const lastTracked = tracking[ex.id]?.find(s => s.is_done && s.poids)
    const kg = lastTracked?.poids ? `· ${lastTracked.poids} kg` : ''
    return `${series}×${reps} ${kg}`.trim()
  }

  function WeekHeader({ s }) {
    const isCur = s === semaineActuelle
    return (
      <div style={{
        width: COL, flexShrink: 0, textAlign: 'center',
        background: isCur ? '#333333' : '#f3f4f6',
        color: isCur ? 'var(--chip-text)' : '#9ca3af',
        borderRadius: 8, padding: '5px 0', fontSize: '0.7rem', fontWeight: '900',
      }}>S{s}</div>
    )
  }

  function TableCell({ children, isCur }) {
    return (
      <div style={{
        width: COL, flexShrink: 0, textAlign: 'center',
        background: isCur ? '#fffef5' : '#fafafa',
        border: `1.5px solid ${isCur ? 'var(--accent)' : '#f0f0f0'}`,
        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36,
      }}>{children}</div>
    )
  }

  const inputStyle = (isCur) => ({
    width: COL, height: 36, textAlign: 'center',
    border: `1.5px solid ${isCur ? '#333333' : '#e5e7eb'}`,
    borderRadius: 8, fontSize: '0.88rem', fontWeight: '700',
    color: '#333333', outline: 'none', boxSizing: 'border-box',
    background: isCur ? '#fffef5' : 'white', flexShrink: 0,
  })

  const labelStyle = {
    width: COL_LABEL, flexShrink: 0,
    fontSize: '0.7rem', fontWeight: '700', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    display: 'flex', alignItems: 'center',
  }

  function isTemps(reps) { return typeof reps === 'string' && reps.includes('"') }

  function renderExContent(ex, showRecup, showSeries = true, groupLetter = null, groupItems = null) {
    // ── Progression : trouver le bloc actif pour la semaine courante ──
    const progActif = (ex.progressions || []).find(p =>
      semaineActuelle >= (p.semaine_debut || 1) && semaineActuelle <= (p.semaine_fin || 999)
    )
    // Valeurs effectives : progression > défaut
    const effSeries    = progActif?.series          || ex.series
    const effReps      = progActif?.repetitions     || ex.repetitions
    const effIntensity = progActif?.valeur_intensite || ex.valeur_intensite

    const tempsMode = isTemps(effReps)
    const seriesList = tracking[ex.id] || []
    const hasAnyCharge = Object.values(charges[ex.id] || {}).some(v => v.charge && parseFloat(v.charge) > 0)
    const isHistoOpen = histoOpen[ex.id]

    return (
      <div key={ex.id}>
        {/* Titre exercice */}
        {(() => {
          const variantImg = progActif?.nom_variante ? variantImageMap[progActif.nom_variante.toLowerCase()] : null
          const mediaUrl = ex.media_url || variantImg || ex.bibliotheque_exercices?.image_url || null
          const isYt = mediaUrl && youtubeId(mediaUrl)
          const ytId = isYt ? youtubeId(mediaUrl) : null
          return (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
              {/* Infos exercice */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={S.exCode}>{ex.code}</span>
                  <span style={S.exNom}>{progActif?.nom_variante || ex.nom}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: '0.3rem', flexWrap: 'wrap' }}>
                  {progActif && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '2px 7px' }}>
                      {progActif.label || `S${progActif.semaine_debut}-${progActif.semaine_fin}`}
                    </span>
                  )}
                  <span style={S.semBadge}>S{semaineActuelle}</span>
                </div>
              </div>
              {/* Miniature média — visible dès le départ, tap = modal plein écran */}
              {mediaUrl && (
                <button
                  onClick={() => setMediaModal({ nom: progActif?.nom_variante || ex.nom, url: mediaUrl })}
                  style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 10, overflow: 'hidden', border: 'none', cursor: 'pointer', background: '#111', padding: 0, position: 'relative', display: 'block' }}
                  title="Voir le mouvement"
                >
                  {ytId ? (
                    <>
                      <img loading="lazy" src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.38)' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </div>
                    </>
                  ) : (
                    <img loading="lazy" src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                </button>
              )}
            </div>
          )
        })()}

        {/* Demande de vidéo de correction par le coach */}
        {videoDemandes[ex.id] && (
          <div style={S.videoBanner}>
            <span>Ton coach veut une vidéo de ce mouvement — filme-toi et envoie-la lui sur WhatsApp.</span>
            <button onClick={() => marquerVideoEnvoyee(ex.id)} style={S.videoBannerBtn}>J'ai envoyé la vidéo</button>
          </div>
        )}

        {/* Détail libre de la progression (ex: variante, charge max…) */}
        {progActif?.detail && (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.8rem', color: '#374151', fontWeight: 500, lineHeight: 1.5 }}>
            {progActif.detail}
          </div>
        )}

        {/* Barre paramètres */}
        {(() => {
          const params = [
            showSeries && effSeries        ? { label: 'Séries',              val: effSeries }                           : null,
            effReps                        ? { label: tempsMode ? 'Durée' : 'Reps', val: effReps }                     : null,
            ex.tempo                       ? { label: 'Tempo',               val: ex.tempo }                           : null,
            showRecup && ex.recuperation   ? { label: 'Récup',               val: ex.recuperation }                    : null,
            ex.type_intensite              ? { label: 'Intensité',           val: effIntensity || ex.type_intensite }   : null,
          ].filter(Boolean)
          if (!params.length) return null
          return (
            <div style={S.paramsBar}>
              {params.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  {i > 0 && <div style={S.paramDivider} />}
                  <div style={S.paramItem}>
                    <span style={S.paramLabel}>{p.label}</span>
                    <span style={S.paramValue}>{p.val}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Séries tracking */}
        {seriesList.length > 0 && (
          <div style={S.seriesTracker}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={S.seriesTrackerLabel}>Séries · semaine {semaineActuelle}</span>
              <button onClick={() => toggleHisto(ex.id)} style={S.histoBtn}>
                {isHistoOpen ? 'Masquer' : 'Historique'}
              </button>
            </div>

            {/* Historique performances réelles (accordéon) */}
            {isHistoOpen && (
              <div style={{ marginBottom: '0.75rem', background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {histoLoading[ex.id] ? (
                  <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.78rem', padding: '0.75rem', margin: 0 }}>Chargement…</p>
                ) : (() => {
                  const grouped = histoTracking[ex.id] || {}
                  const semsPrev = Object.keys(grouped)
                    .map(Number)
                    .filter(s => s < semaineActuelle)
                    .sort((a, b) => b - a) // plus récente en premier
                  if (!semsPrev.length) return (
                    <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.78rem', padding: '0.75rem', margin: 0 }}>Aucune donnée enregistrée pour les semaines précédentes.</p>
                  )
                  return semsPrev.map((sem, si) => {
                    const rows = grouped[sem] || []
                    // résumé : poids min-max et total reps
                    const poids = rows.map(r => parseFloat(r.poids)).filter(Boolean)
                    const reps  = rows.map(r => parseInt(r.reps_reelles) || 0)
                    const poidsLabel = poids.length === 0 ? '—'
                      : poids.every(p => p === poids[0]) ? `${poids[0]} kg`
                      : `${Math.min(...poids)}–${Math.max(...poids)} kg`
                    return (
                      <div key={sem} style={{ borderBottom: si < semsPrev.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        {/* En-tête semaine */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: sem === semaineActuelle - 1 ? '#fffef5' : 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ background: sem === semaineActuelle - 1 ? '#333333' : '#f3f4f6', color: sem === semaineActuelle - 1 ? 'var(--chip-text)' : '#6b7280', borderRadius: 6, padding: '0.1rem 0.45rem', fontSize: '0.7rem', fontWeight: '900' }}>S{sem}</span>
                            {sem === semaineActuelle - 1 && <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>sem. précédente</span>}
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#374151' }}>{poidsLabel}</span>
                        </div>
                        {/* Détail séries */}
                        <div style={{ padding: '0 0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {rows.map((r, ri) => (
                            <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6b7280', width: 16, textAlign: 'center', flexShrink: 0 }}>{r.serie}</span>
                              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1a1a1a', minWidth: 52 }}>
                                {r.poids ? `${r.poids} kg` : <span style={{ color: '#6b7280' }}>— kg</span>}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                                {r.reps_reelles ? `× ${r.reps_reelles} ${tempsMode ? 's' : 'reps'}` : ''}
                              </span>
                              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, color: r.valide ? '#16a34a' : '#b45309' }}>
                                {r.valide ? 'Fait' : 'Incomplète'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}

            {/* ── Séries de chauffe (au-dessus des séries de travail) ── */}
            {(() => {
              const warmups = warmupTracking[ex.id] || []
              return (
                <>
                  <button onClick={() => addWarmupSet(ex.id)} style={S.ajoutChauffe}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    Série de chauffe
                  </button>
                  {warmups.map((ws, wi) => (
                    <div key={ws.serie} style={{ ...S.serieRow, background: '#fafafa' }}>
                      <span style={S.serieNumChauffe}>É{wi + 1}</span>
                      <input type="text" inputMode="decimal" value={ws.poids}
                        onChange={e => updateWarmupField(ex.id, wi, 'poids', e.target.value)}
                        onBlur={() => saveWarmupSet(ex.id, wi)}
                        onFocus={scrollInputIntoView}
                        placeholder="kg"
                        style={S.serieInput} />
                      <span style={S.serieUnit}>kg</span>
                      <input type="text" inputMode="numeric" value={ws.reps_reelles}
                        onChange={e => updateWarmupField(ex.id, wi, 'reps_reelles', e.target.value)}
                        onBlur={() => saveWarmupSet(ex.id, wi)}
                        onFocus={scrollInputIntoView}
                        placeholder={tempsMode ? 'sec' : 'reps'}
                        style={S.serieInput} />
                      <span style={S.serieUnit}>{tempsMode ? 's' : 'reps'}</span>
                      {ws.fromCoach && ws.pourcentage ? <span style={S.serieUnit}>{ws.pourcentage} %</span> : null}
                      <button onClick={() => removeWarmupSet(ex.id, wi)} title="Supprimer" style={S.serieIconBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                      </button>
                    </div>
                  ))}
                </>
              )
            })()}

            {seriesList.map((serie, si) => {
              const prevSerie = si > 0 ? seriesList[si - 1] : null
              const canCopy = !serie.is_done && prevSerie && (prevSerie.poids || prevSerie.reps_reelles)
              const etatStyle = serie.is_done ? (serie.valide ? S.serieRowDone : S.serieRowWarn) : {}
              const inputEtat = serie.is_done ? (serie.valide ? S.serieInputDone : S.serieInputWarn) : {}
              return (
              <div key={si} style={{ ...S.serieRow, ...etatStyle }}>
                <span style={{ ...S.serieNum, ...(serie.is_done ? { background: serie.valide ? '#16a34a' : '#f59e0b', color: 'white' } : {}) }}>{si + 1}</span>
                <input type="text" inputMode="decimal" value={serie.poids}
                  onChange={e => modifierSerie(ex.id, si, 'poids', e.target.value, groupLetter)}
                  onBlur={() => saveSerieField(ex.id, si)}
                  onFocus={e => { const len = e.target.value.length; e.target.setSelectionRange(len, len); scrollInputIntoView(e) }}
                  placeholder="kg"
                  style={{ ...S.serieInput, ...inputEtat }} />
                <span style={S.serieUnit}>kg</span>
                <input type="text" inputMode="numeric" value={serie.reps_reelles}
                  onChange={e => modifierSerie(ex.id, si, 'reps_reelles', e.target.value, groupLetter)}
                  onBlur={() => saveSerieField(ex.id, si)}
                  onFocus={scrollInputIntoView}
                  placeholder={tempsMode ? (effReps ? String(effReps).replace('"', '') : 'sec') : (effReps ? String(effReps) : 'reps')}
                  style={{ ...S.serieInput, ...inputEtat }} />
                <span style={S.serieUnit}>{tempsMode ? 's' : 'reps'}</span>
                {canCopy && (
                  <button
                    onClick={() => {
                      if (prevSerie.poids) updateTrackingField(ex.id, si, 'poids', prevSerie.poids)
                      if (prevSerie.reps_reelles) updateTrackingField(ex.id, si, 'reps_reelles', prevSerie.reps_reelles)
                    }}
                    title="Reprendre les valeurs de la série précédente"
                    style={{ ...S.serieIconBtn, width: 26 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 0 1 0 10h-2"/></svg>
                  </button>
                )}
                {serie.is_done
                  ? pendingUnvalidate?.exId === ex.id && pendingUnvalidate?.serieIdx === si
                    ? <>
                        <button onClick={() => setPendingUnvalidate(null)} style={S.unvalCancelBtn}>Non</button>
                        <button onClick={() => devaliderSerie(ex.id, si, groupLetter)} style={S.unvalConfirmBtn}>Oui</button>
                      </>
                    : <button onClick={() => setPendingUnvalidate({ exId: ex.id, serieIdx: si })}
                        title="Annuler la validation"
                        style={serie.valide ? S.serieDoneBadge : S.serieDoneWarnBadge}>
                        {serie.valide
                          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
                          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 7v6M12 17v.5"/></svg>}
                      </button>
                  : <button
                      onClick={e => validerSerie(ex.id, si, groupLetter, groupItems, ex.repetitions, e.currentTarget)}
                      disabled={validatingSet.has(`${ex.id}-${si}`)}
                      style={{ ...S.serieValBtn, ...(canCopy ? { marginLeft: 0 } : {}), opacity: validatingSet.has(`${ex.id}-${si}`) ? 0.5 : 1 }}
                    >{validatingSet.has(`${ex.id}-${si}`) ? '…' : 'Valider'}</button>
                }
              </div>
              )
            })}

            {/* ── Volume & Tonnage ─────────────────────────── */}
            {(() => {
              const warmups = warmupTracking[ex.id] || []
              const doneSeries = seriesList.filter(s => s.is_done)
              const allForCalc = [
                ...warmups.map(w => ({ poids: w.poids, reps: parseInt(w.reps_reelles) || 0 })),
                ...doneSeries.map(s => ({ poids: s.poids, reps: parseInt(s.reps_reelles) || 0 })),
              ].filter(s => s.reps > 0)
              if (allForCalc.length === 0) return null
              const totalReps = allForCalc.reduce((s, x) => s + x.reps, 0)
              const tonnage = allForCalc.reduce((s, x) => s + ((parseFloat(x.poids) || 0) * x.reps), 0)
              return (
                <div style={S.bilan}>
                  <span><b style={S.bilanVal}>{totalReps}</b> {tempsMode ? 's' : 'reps'}</span>
                  {tonnage > 0 && <span><b style={S.bilanVal}>{Math.round(tonnage).toLocaleString('fr-FR')}</b> kg de tonnage</span>}
                </div>
              )
            })()}

            {/* Bouton récup */}
            {showRecup && ex.recuperation && (() => {
              const recupSecs = parseRecup(ex.recuperation)
              return recupSecs > 0 ? (
                <button onClick={() => lancerTimer(recupSecs)} style={S.recupBtn}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/></svg>
                  Lancer la récup · {ex.recuperation}
                </button>
              ) : null
            })()}
          </div>
        )}

        {/* Table charges toutes semaines (compact) */}
        <div style={{ overflowX: 'auto', borderTop: '1px solid #f3f4f6', paddingTop: '0.6rem' }}>
          <div style={{ minWidth: COL_LABEL + cols.length * (COL + 4) }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <div style={{ width: COL_LABEL, flexShrink: 0 }} />
              {cols.map(s => <WeekHeader key={s} s={s} />)}
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
              <div style={labelStyle}>kg</div>
              {cols.map(s => (
                <input key={`charge-${ex.id}-${s}`} type="text" inputMode="decimal"
                  value={charges[ex.id]?.[s]?.charge || ''}
                  onChange={e => setCharges(prev => ({
                    ...prev,
                    [ex.id]: { ...prev[ex.id], [s]: { ...(prev[ex.id]?.[s] || {}), charge: e.target.value } },
                  }))}
                  onBlur={e => updateCharge(ex.id, s, 'charge', e.target.value)}
                  onFocus={e => { const len = e.target.value.length; e.target.setSelectionRange(len, len) }}
                  style={inputStyle(s === semaineActuelle)} placeholder="—" />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={labelStyle}>RPE</div>
              {cols.map(s => (
                <input key={`rpe-${ex.id}-${s}`} type="number" inputMode="decimal" min="1" max="10" step="0.5"
                  defaultValue={charges[ex.id]?.[s]?.rpe_reel || ''}
                  onBlur={e => updateCharge(ex.id, s, 'rpe_reel', e.target.value)}
                  style={inputStyle(s === semaineActuelle)} placeholder="—" />
              ))}
            </div>

          </div>
        </div>
      </div>
    )
  }

  const main = (
    <div style={S.page}>
      <XpBulle />
      {/* Bandeau hors ligne */}
      {offlineMode && (
        <div style={{ background: '#f59e0b', color: 'white', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', position: 'sticky', top: 0, zIndex: 200 }}>
          Mode hors ligne · données locales {localSavedAt ? `(${formatSavedAt(localSavedAt)})` : ''}
        </div>
      )}
      {/* Badge charges en attente (visible si online + items en queue) */}
      {navigator.onLine && pendingSync > 0 && (
        <div style={{ background: '#22c55e', color: 'white', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px' }}>
          ↑ Synchronisation de {pendingSync} charge{pendingSync > 1 ? 's' : ''} en cours…
        </div>
      )}

      {/* Toast */}
      <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--chip-bg)', color: 'var(--chip-text)', padding: '0.6rem 1.4rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.875rem', opacity: saved ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 100 }}>
        ✓ Enregistré
      </div>

      {/* Header */}
      <EnTeteClient retour={`/client/programme/${seance.programmes.id}`} />

      <div style={S.content}>
        {/* Titre */}
        <div style={{ marginBottom: '1rem' }}>
          <p style={S.programmeNom}>{seance.programmes.nom}</p>
          <h1 style={S.title}>{seance.nom}</h1>
          <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span role="button" tabIndex={0}
              style={{ ...S.curBadge, cursor: 'pointer' }}
              onClick={() => setShowWeekPicker(v => !v)}
            >
              S{semaineActuelle} {rattrapageDeSemaine != null ? '(rattrapage)' : 'en cours'} ✎
            </span>
            {rattrapageDeSemaine != null && (
              <span style={S.rattrapageHint}>compte pour S{semaineActuelle}, pas S{rattrapageDeSemaine}</span>
            )}
          </div>
          {showWeekPicker && (
            <div style={{ marginTop: '0.5rem' }}>
              <select
                value={semaineActuelle}
                onChange={e => {
                  const n = parseInt(e.target.value, 10)
                  setShowWeekPicker(false)
                  changerSemaine(n)
                }}
                style={S.weekSelect}
              >
                {Array.from({ length: semaines }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>Semaine {n}</option>
                ))}
              </select>
              <p style={S.weekSelectHint}>Change la semaine à laquelle les charges de cette séance seront comptabilisées.</p>
            </div>
          )}
        </div>

        {/* Bouton séance non effectuée */}
        {nonEffectuee ? (
          <button onClick={toggleNonEffectuee} disabled={nonEffectueeSaving}
            style={{ ...S.nonEffectueeBtn, ...S.nonEffectueeBtnActive }}>
            ✓ Séance non effectuée · Annuler
          </button>
        ) : nonEffectueeConfirm ? (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button onClick={() => setNonEffectueeConfirm(false)}
              style={{ flex: 1, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.75rem', fontSize: '0.85rem', fontWeight: '700', color: '#6b7280', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={() => { setNonEffectueeConfirm(false); toggleNonEffectuee() }} disabled={nonEffectueeSaving}
              style={{ flex: 1, background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '0.75rem', fontSize: '0.85rem', fontWeight: '700', color: '#dc2626', cursor: 'pointer' }}>
              Confirmer
            </button>
          </div>
        ) : (
          <button onClick={() => setNonEffectueeConfirm(true)}
            style={S.nonEffectueeBtn}>
            ✕ Marquer comme non effectuée
          </button>
        )}

        {/* Étapes : échauffement + cardios validables, puis blocs de musculation */}
        {(() => {
          const cardioDebut = cardioDebutAll?.[semaineActuelle]?.type ? cardioDebutAll[semaineActuelle] : null
          const cardioFin   = cardioFinAll?.[semaineActuelle]?.type ? cardioFinAll[semaineActuelle] : null
          const prepCles = [echauffement.length > 0 && 'echauffement', cardioDebut && 'cardio_debut'].filter(Boolean)
          const finCles = [...cardioBlocs.map((b, i) => (b.titre || b.texte) ? `cardio_bloc_${i}` : null), cardioFin && 'cardio_fin'].filter(Boolean)
          const totalEtapes = totalBlocs + prepCles.length + finCles.length
          const doneEtapes = doneBlocs + [...prepCles, ...finCles].filter(c => elemValides.has(c)).length
          const nbValides = cles => cles.filter(c => elemValides.has(c)).length
          return (
            <>
              {totalEtapes > 0 && !nonEffectuee && (
                <div style={S.progressCard}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Progression séance</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#333333' }}>{doneEtapes} / {totalEtapes} étapes</span>
                  </div>
                  <div style={S.progressTrack}>
                    <div style={{ ...S.progressFill, width: `${(doneEtapes / totalEtapes) * 100}%` }} />
                  </div>
                </div>
              )}

              {prepCles.length > 0 && (
                <>
                  <p style={S.partie}>Préparation <span style={S.partieCompte}>{nbValides(prepCles)} / {prepCles.length} validé{prepCles.length > 1 ? 's' : ''}</span></p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    {echauffement.length > 0 && (() => {
                      const warmGroups = []
                      echauffement.forEach(l => {
                        const last = warmGroups[warmGroups.length - 1]
                        if (l.groupe && last?.groupe === l.groupe) last.items.push(l)
                        else warmGroups.push({ groupe: l.groupe, items: [l] })
                      })
                      const avecMedia = echauffement.some(l => l.image_url)
                      const ligne = (l, k, premiere) => (
                        <div key={k} style={{ ...S.warmRow, ...(premiere ? { borderTop: 'none' } : {}) }}>
                          <span style={S.warmNom}>{l.nom}</span>
                          <span style={S.warmReps}>{l.reps}</span>
                          {l.image_url
                            ? <Vignette url={l.image_url} nom={l.nom} youtubeId={youtubeId} onOuvrir={setMediaModal} />
                            : avecMedia && <span style={{ width: 48, flexShrink: 0 }} />}
                        </div>
                      )
                      return (
                        <ElementValidable titre="Échauffement" icone={ICONE_ECHAUFFEMENT}
                          sousTitre={`${echauffement.length} exercice${echauffement.length > 1 ? 's' : ''}`}
                          resume={`${echauffement.length} exercice${echauffement.length > 1 ? 's' : ''}`}
                          {...propsElement('echauffement')}>
                          {warmGroups.map((g, gi) => g.groupe
                            ? <div key={gi} style={S.circuit}>
                                <div style={S.circuitLab}><b style={{ color: '#333333' }}>Circuit</b> à enchaîner{g.items[0]?.tours ? <>, <b style={{ color: '#333333' }}>{g.items[0].tours} tours</b></> : null}</div>
                                {g.items.map((l, i) => ligne(l, l.id || i, i === 0))}
                              </div>
                            : g.items.map((l, i) => ligne(l, l.id || `${gi}-${i}`, gi === 0 && i === 0))
                          )}
                        </ElementValidable>
                      )
                    })()}
                    {cardioDebut && CarteCardio({ cle: 'cardio_debut', titre: 'Cardio avant séance', cardio: cardioDebut })}
                  </div>
                </>
              )}

              {totalBlocs > 0 && (prepCles.length > 0 || finCles.length > 0) && (
                <p style={S.partie}>Musculation <span style={S.partieCompte}>{doneBlocs} / {totalBlocs} bloc{totalBlocs > 1 ? 's' : ''}</span></p>
              )}
            </>
          )
        })()}

        {/* Exercices */}
        {nonEffectuee ? (
          <div style={S.nonEffectueeCard}>
            <p style={{ fontWeight: '700', color: '#374151', margin: '0 0 0.25rem' }}>Séance non effectuée</p>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0 }}>Semaine {semaineActuelle} — Appuie sur le bouton ci-dessus pour annuler</p>
          </div>
        ) : exercices.length === 0 ? (
          <div style={S.emptyCard}>Aucun exercice.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {groups.map((group, gi) => {
              const isDone    = group.letter && blocsTermines.has(group.letter)
              const isSkipped = group.letter && blocsSkippes.has(group.letter)
              const isExpanded = expandedDone.has(group.letter)
              const isActive = !group.letter || group.letter === activeBloc

              // Bloc passé (non effectué) → ligne compacte grise avec possibilité d'annuler
              if (isSkipped && !isExpanded) {
                const label = group.items.length === 1
                  ? group.items[0].nom
                  : `Superset ${group.letter} (${group.items.length} exos)`
                return (
                  <div role="button" tabIndex={0} key={gi}
                    ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                    onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.add(group.letter); return s })}
                    style={{ ...S.collapsedRow, borderColor: '#e5e7eb', background: '#f9fafb' }}>
                    <span style={{ ...S.collapsedCheck, background: '#f3f4f6', color: '#6b7280' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg></span>
                    <span style={S.collapsedCode}>{group.letter}</span>
                    <span style={{ ...S.collapsedNom, color: '#6b7280' }}>{label}</span>
                    <span style={{ ...S.collapsedStats, color: '#6b7280' }}>Passé</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                  </div>
                )
              }

              // Bloc non terminé, non passé et non actif → ligne réduite "en attente"
              if (!isDone && !isSkipped && !isActive) {
                const label = group.items.length === 1
                  ? group.items[0].nom
                  : `Superset ${group.letter} (${group.items.length} exos)`
                return (
                  <div key={gi}
                    ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                    style={{ ...S.pendingRow, alignItems: 'center' }}>
                    <span role="button" tabIndex={0} style={S.pendingCode} onClick={() => setActiveBloc(group.letter)}>{group.letter}</span>
                    <span role="button" tabIndex={0} style={{ ...S.pendingNom, flex: 1 }} onClick={() => setActiveBloc(group.letter)}>{label}</span>
                    <button
                      onClick={e => { e.stopPropagation(); skipBloc(group.letter) }}
                      style={S.skipBlocBtn}>
                      Passer
                    </button>
                    <span role="button" tabIndex={0} style={{ display: 'flex' }} onClick={() => setActiveBloc(group.letter)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
                  </div>
                )
              }

              // Bloc terminé → ligne compacte (sauf si on a cliqué pour expand)
              if (isDone && !isExpanded) {
                const summary = blocSummary(group.items)
                const label = group.items.length === 1
                  ? group.items[0].nom
                  : `Superset ${group.letter} (${group.items.length} exos)`
                return (
                  <div role="button" tabIndex={0} key={gi}
                    ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                    onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.add(group.letter); return s })}
                    style={S.collapsedRow}>
                    <span style={S.collapsedCheck}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
                    <span style={S.collapsedCode}>{group.letter}</span>
                    <span style={S.collapsedNom}>{label}</span>
                    <span style={S.collapsedStats}>{summary}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                  </div>
                )
              }

              // Bloc simple
              if (group.items.length === 1) {
                return (
                  <div key={gi}
                    ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                    style={{ ...S.exCard, ...(isDone ? S.exCardDone : {}), ...(isSkipped ? { borderColor: '#e5e7eb', background: '#f9fafb' } : {}) }}>
                    {(isDone || isSkipped) && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        {isSkipped
                          ? <div style={{ ...S.blocDoneBadge, background: '#f3f4f6', color: '#6b7280' }}>Bloc passé</div>
                          : <div style={S.blocDoneBadge}>Bloc terminé</div>
                        }
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {isSkipped && (
                            <button onClick={() => unskipBloc(group.letter)} style={{ ...S.collapseBtn, color: '#6b7280' }}>
                              Annuler
                            </button>
                          )}
                          <button onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.delete(group.letter); return s })}
                            style={S.collapseBtn}>Replier ↑</button>
                        </div>
                      </div>
                    )}
                    {!isDone && !isSkipped && group.letter && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                        <button onClick={() => skipBloc(group.letter)} style={S.skipBlocBtnInline}>
                          Passer ce bloc
                        </button>
                      </div>
                    )}
                    {renderExContent(group.items[0], true, true, group.letter, group.items)}
                    {!isDone && !isSkipped && group.letter && (() => {
                      const allSeriesDone = group.items.every(ex => {
                        const t = tracking[ex.id] || []
                        return t.length > 0 && t.every(s => s.is_done)
                      })
                      return allSeriesDone
                        ? <button onClick={e => terminerBloc(group.letter, e.currentTarget)} style={S.terminerBlocBtn}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Terminer le bloc</button>
                        : null
                    })()}
                  </div>
                )
              }

              // Superset
              return (
                <div key={gi}
                  ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                  style={{ ...S.supersetWrapper, ...(isDone ? { borderColor: '#16a34a' } : {}), ...(isSkipped ? { borderColor: '#e5e7eb' } : {}) }}>
                  <div style={{ ...S.supersetHeader, ...(isDone ? { background: '#14532d' } : {}), ...(isSkipped ? { background: '#f3f4f6' } : {}) }}>
                    <span style={S.supersetBadge}>SUPERSET · {group.letter}</span>
                    {isSkipped
                      ? <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <span style={{ color: '#6b7280', fontSize: '0.7rem', fontWeight: '700' }}>Passé</span>
                          <button onClick={() => unskipBloc(group.letter)} style={{ ...S.collapseBtn, color: '#6b7280', borderColor: '#d1d5db' }}>Annuler</button>
                          <button onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.delete(group.letter); return s })}
                            style={{ ...S.collapseBtn, color: '#6b7280', borderColor: '#d1d5db' }}>Replier ↑</button>
                        </div>
                      : isDone
                        ? <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={{ color: '#86efac', fontSize: '0.7rem', fontWeight: '700' }}>Terminé</span>
                            <button onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.delete(group.letter); return s })}
                              style={{ ...S.collapseBtn, color: '#86efac', borderColor: '#16a34a' }}>Replier ↑</button>
                          </div>
                        : <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={S.supersetHint}>Sans récupération</span>
                            <button onClick={() => skipBloc(group.letter)} style={{ ...S.collapseBtn, color: '#6b7280', borderColor: '#d1d5db', fontSize: '0.7rem' }}>Passer</button>
                          </div>
                    }
                  </div>
                  {group.items.map((ex, idx) => {
                    const isLast = idx === group.items.length - 1
                    const isFirst = idx === 0
                    return (
                      <div key={ex.id}>
                        <div style={{ ...S.exCard, borderRadius: 0, marginBottom: 0, boxShadow: 'none' }}>
                          {renderExContent(ex, isLast, isFirst, group.letter, group.items)}
                        </div>
                        {!isLast && (
                          <div style={S.supersetConnector}>
                            <div style={S.supersetLine} />
                            <span style={S.supersetTag}>↓ Enchaîner</span>
                            <div style={S.supersetLine} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!isDone && !isSkipped && (() => {
                    const allSeriesDone = group.items.every(ex => {
                      const t = tracking[ex.id] || []
                      return t.length > 0 && t.every(s => s.is_done)
                    })
                    return allSeriesDone
                      ? <button onClick={e => terminerBloc(group.letter, e.currentTarget)} style={{ ...S.terminerBlocBtn, borderRadius: '0 0 12px 12px', marginTop: 0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Terminer le bloc</button>
                      : null
                  })()}
                </div>
              )
            })}
          </div>
        )}

        {/* Cardio : blocs cardio puis cardio après séance, en fin de séance */}
        {(() => {
          const cardioFin = cardioFinAll?.[semaineActuelle]?.type ? cardioFinAll[semaineActuelle] : null
          const blocs = cardioBlocs.map((b, i) => ({ b, cle: `cardio_bloc_${i}` })).filter(x => x.b.titre || x.b.texte)
          const cles = [...blocs.map(x => x.cle), cardioFin && 'cardio_fin'].filter(Boolean)
          if (!cles.length) return null
          return (
            <>
              <p style={{ ...S.partie, marginTop: '1rem' }}>Cardio <span style={S.partieCompte}>{cles.filter(c => elemValides.has(c)).length} / {cles.length} validé{cles.length > 1 ? 's' : ''}</span></p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {blocs.map(({ b, cle }, i) => (
                  <ElementValidable key={cle} titre={b.titre || `Bloc cardio ${i + 1}`} sousTitre="Bloc cardio" resume="Bloc cardio"
                    icone={ICONE_CARDIO} {...propsElement(cle)}>
                    {b.texte && <p style={S.cardioTexte}>{b.texte}</p>}
                  </ElementValidable>
                ))}
                {cardioFin && CarteCardio({ cle: 'cardio_fin', titre: 'Cardio après séance', cardio: cardioFin })}
              </div>
            </>
          )
        })()}

        {/* ── Tonnage total de la séance ───────────────────────────── */}
        {!nonEffectuee && (() => {
          let tonnageTotal = 0; let repsTotal = 0; let exosDone = 0
          exercices.forEach(ex => {
            const doneSeries = (tracking[ex.id] || []).filter(s => s.is_done)
            const warmups    = (warmupTracking[ex.id] || [])
            const all = [
              ...warmups.map(w => ({ poids: w.poids, reps: parseInt(w.reps_reelles) || 0 })),
              ...doneSeries.map(s => ({ poids: s.poids, reps: parseInt(s.reps_reelles) || 0 })),
            ].filter(s => s.reps > 0)
            if (all.length > 0) exosDone++
            repsTotal    += all.reduce((t, x) => t + x.reps, 0)
            tonnageTotal += all.reduce((t, x) => t + (parseFloat(x.poids) || 0) * x.reps, 0)
          })
          if (tonnageTotal === 0 && repsTotal === 0) return null
          return (
            <div style={{
              background: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
              borderRadius: 16, padding: '1rem 1.25rem', marginTop: '0.75rem', marginBottom: '0.25rem',
              display: 'flex', gap: '0.5rem', justifyContent: 'space-around', alignItems: 'center',
            }}>
              {tonnageTotal > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--accent-fg)', lineHeight: 1 }}>{Math.round(tonnageTotal).toLocaleString('fr-FR')} kg</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tonnage total</div>
                </div>
              )}
              {repsTotal > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--accent-fg)', lineHeight: 1 }}>{repsTotal}</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Volume (reps)</div>
                </div>
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--accent-fg)', lineHeight: 1 }}>{exosDone}<span style={{ fontSize: '0.85rem', opacity: 0.6 }}>/{exercices.length}</span></div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Exos lancés</div>
              </div>
            </div>
          )
        })()}

        {/* Intensité RPE — section repliable */}
        <div style={{ marginTop: '1.25rem' }}>
          <button onClick={() => setRpeOpen(v => !v)}
            style={S.rpeToggle}>
            <span>Intensité de la séance</span>
            <span style={{ transform: rpeOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', fontSize: '1rem', color: '#6b7280' }}>›</span>
          </button>
          {rpeOpen && (
            <div style={S.card}>
              {/* Graph RPE */}
              <p style={S.sectionLabel}>Progression de l'intensité</p>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={graphData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  <Line type="monotone" dataKey="RPE cible" stroke="#333333" strokeWidth={2} connectNulls
                    dot={(props) => props.value != null ? <circle key={props.index} cx={props.cx} cy={props.cy} r={3} fill="#333333" /> : <g key={props.index}/>} />
                  <Line type="monotone" dataKey="RPE réel" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 5" connectNulls
                    dot={(props) => props.value != null ? <circle key={props.index} cx={props.cx} cy={props.cy} r={3} fill="var(--accent)" /> : <g key={props.index}/>} />
                </LineChart>
              </ResponsiveContainer>
              {/* Table RPE séance */}
              <p style={{ ...S.sectionLabel, marginTop: '0.75rem' }}>RPE séance</p>
              <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                <div style={{ minWidth: COL_LABEL + cols.length * (COL + 4) }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    <div style={{ width: COL_LABEL, flexShrink: 0 }} />
                    {cols.map(s => <WeekHeader key={s} s={s} />)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                    <div style={labelStyle}>Cible</div>
                    {cols.map(s => (
                      <TableCell key={s} isCur={s === semaineActuelle}>
                        <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#374151' }}>{rpeSeances[s]?.rpe_cible ?? '—'}</span>
                      </TableCell>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <div style={labelStyle}>Réel</div>
                    {cols.map(s => (
                      <input key={`rpe-seance-${s}`} type="number" inputMode="decimal" min="1" max="10" step="0.5"
                        defaultValue={rpeSeances[s]?.rpe_reel || ''}
                        onBlur={e => updateRpeReel(s, e.target.value)}
                        style={inputStyle(s === semaineActuelle)} placeholder="—" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ marginTop: '1rem' }}>
          <p style={{ ...S.sectionLabel, marginBottom: '0.6rem' }}>Notes · S{semaineActuelle}</p>
          <div style={{
            background: 'white', borderRadius: 14, padding: '1rem 1.1rem',
            boxShadow: commentSaved ? '0 0 0 2px #16a34a' : '0 1px 3px rgba(0,0,0,0.06)',
            transition: 'box-shadow 0.35s ease',
          }}>
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
              onBlur={saveCommentaire} rows={3} placeholder="Laisse une note sur cette séance..."
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem 0.75rem', fontSize: '0.88rem', color: '#333333', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button onClick={saveCommentaire}
                style={{
                  background: commentSaved ? '#16a34a' : 'var(--chip-bg)',
                  color: commentSaved ? 'white' : 'var(--chip-text)',
                  border: 'none', borderRadius: 8, padding: '0.4rem 1rem',
                  fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer',
                  transition: 'all 0.3s',
                  transform: commentSaved ? 'scale(1.06)' : 'scale(1)',
                }}>
                {commentSaved ? '✓ Enregistré' : 'Enregistrer'}
              </button>
            </div>
          </div>
          {commentaires.filter(c => c.semaine !== semaineActuelle).length > 0 && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Semaines précédentes</p>
              {commentaires.filter(c => c.semaine !== semaineActuelle).map(c => (
                <div key={c.semaine} style={{ background: 'white', borderRadius: 12, padding: '0.75rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>S{c.semaine}</span>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>{c.texte}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ClientBottomNav />

      {/* ── Modale média exercice ── */}
      {mediaModal && (
        <div
          onClick={() => setMediaModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>{mediaModal.nom}</span>
              <button onClick={() => setMediaModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#6b7280', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            {/* Contenu */}
            {youtubeId(mediaModal.url)
              ? <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId(mediaModal.url)}?autoplay=1&rel=0`}
                    title={mediaModal.nom}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  />
                </div>
              : <img
                  src={mediaModal.url}
                  alt={mediaModal.nom}
                  style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block', background: '#f9fafb' }}
                />
            }
          </div>
        </div>
      )}
    </div>
  )

  return main
}

const S = {
  page:        { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  centered:    { minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { background: 'var(--header-bg)', height: 70, padding: '0 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:     { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logo:        { color: 'white', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.5px' },
  content:     { padding: '1.25rem 1.25rem', maxWidth: '480px', margin: '0 auto' },
  programmeNom:{ color: '#6b7280', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.2rem' },
  title:       { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  curBadge:    { background: 'var(--chip-bg)', color: 'var(--chip-text)', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700' },
  rattrapageHint: { fontSize: '0.72rem', fontWeight: '700', color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '0.2rem 0.6rem' },
  videoBanner: { display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: 10, padding: '0.6rem 0.75rem', marginBottom: '0.6rem', fontSize: '0.78rem', color: '#5b21b6', fontWeight: 600, lineHeight: 1.4 },
  videoBannerBtn: { alignSelf: 'flex-start', background: '#5b21b6', color: 'white', border: 'none', borderRadius: 8, padding: '0.4rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  weekSelect: { fontSize: '0.85rem', fontWeight: '700', color: '#333333', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.45rem 0.6rem', background: 'white' },
  weekSelectHint: { fontSize: '0.72rem', color: '#6b7280', margin: '0.35rem 0 0', lineHeight: 1.4 },
  // Progress bar
  progressCard:{ background: 'white', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  progressTrack:{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--chip-bg)', borderRadius: 999, transition: 'width 0.5s ease' },
  // Cards
  card:        { background: 'white', borderRadius: '14px', padding: '1rem 1.1rem', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  sectionLabel:{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.75rem' },
  emptyCard:       { background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', color: '#6b7280', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  nonEffectueeBtn: { width: '100%', marginBottom: '0.75rem', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: '700', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  nonEffectueeBtnActive: { background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' },
  nonEffectueeCard:{ background: 'white', borderRadius: 14, padding: '2rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '0.75rem' },
  // Exercice actif
  exCard:      { background: 'white', borderRadius: '14px', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  exCardDone:  { border: '2px solid #86efac', background: '#f0fdf4' },
  exCode:      { background: 'var(--chip-bg)', color: 'var(--chip-text)', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800' },
  exNom:       { fontWeight: '700', fontSize: '1rem', color: '#333333' },
  semBadge:    { background: '#f3f4f6', color: '#6b7280', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', flexShrink: 0 },
  // Bloc en attente (non actif, non terminé)
  pendingRow: { background: 'white', borderRadius: 12, padding: '0 8px 0 12px', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', border: '1px solid #e5e7eb' },
  pendingCode: { width: 24, height: 24, borderRadius: 7, background: '#f3f4f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.75rem', color: '#374151', flexShrink: 0 },
  pendingNom:  { flex: 1, fontSize: '0.88rem', fontWeight: 600, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // Exercice collapsé (terminé)
  collapsedRow:{ background: 'white', borderRadius: 12, padding: '0 12px', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer', border: '1px solid #bbf7d0' },
  collapsedCheck:{ width: 24, height: 24, borderRadius: 7, background: '#f0fdf4', color: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  collapsedCode:{ background: '#16a34a', color: 'white', padding: '0.1rem 0.45rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', flexShrink: 0 },
  collapsedNom:{ fontWeight: '600', fontSize: '0.88rem', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  collapsedStats:{ fontSize: '0.78rem', fontWeight: '600', color: '#6b7280', flexShrink: 0 },
  blocDoneBadge:{ background: '#16a34a', color: 'white', borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: '800', display: 'inline-block' },
  collapseBtn: { background: 'none', border: '1px solid #86efac', color: '#16a34a', borderRadius: 6, padding: '0.15rem 0.5rem', fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer' },
  // Boutons "Passer ce bloc"
  skipBlocBtn:      { background: 'white', border: '1px solid #d1d5db', color: '#374151', borderRadius: 8, padding: '6px 10px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', flexShrink: 0 },
  skipBlocBtnInline:{ background: 'white', border: '1px solid #d1d5db', color: '#374151', borderRadius: 8, padding: '6px 10px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' },
  terminerBlocBtn:  { width: '100%', marginTop: 12, background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, minHeight: 44, fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  // Paramètres
  paramsBar:    { display: 'flex', alignItems: 'center', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', padding: '8px 0', marginBottom: 16, overflowX: 'auto' },
  paramItem:    { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 8px', flexShrink: 0 },
  paramDivider: { width: 1, height: 28, background: '#f3f4f6', flexShrink: 0 },
  paramLabel:   { fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', lineHeight: 1.3 },
  paramValue:   { fontSize: '0.95rem', fontWeight: '700', color: '#1a1a1a', lineHeight: 1.3, whiteSpace: 'nowrap' },
  // Séries tracker
  seriesTracker:{ marginBottom: 12 },
  seriesTrackerLabel:{ fontSize: '0.82rem', fontWeight: '700', color: '#374151' },
  histoBtn:    { background: 'none', border: 'none', color: '#374151', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', padding: '8px 0', textDecoration: 'underline', textUnderlineOffset: 3 },
  serieRow:    { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, background: 'white', borderRadius: 8, minHeight: 44, padding: '0 6px', border: '1px solid #e5e7eb' },
  serieRowDone:{ background: '#f0fdf4', border: '1px solid #bbf7d0' },
  serieRowWarn: { background: '#fffbeb', border: '1px solid #fde68a' },
  serieNum:    { fontSize: '0.72rem', fontWeight: '800', color: 'var(--chip-text)', background: 'var(--chip-bg)', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serieInput:     { width: 48, height: 30, boxSizing: 'border-box', padding: '0 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.88rem', fontWeight: '600', color: '#333333', background: 'white', textAlign: 'center', outline: 'none', flexShrink: 0 },
  serieInputDone: { border: '1px solid #bbf7d0', color: '#15803d' },
  serieUnit:   { fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', flexShrink: 0 },
  serieValBtn: { marginLeft: 'auto', height: 30, background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: 6, padding: '0 10px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  serieDoneBadge:  { marginLeft: 'auto', width: 30, height: 30, background: '#16a34a', color: 'white', borderRadius: 6, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer' },
  serieDoneWarnBadge: { marginLeft: 'auto', width: 30, height: 30, background: '#f59e0b', color: 'white', borderRadius: 6, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer' },
  unvalCancelBtn:  { marginLeft: 'auto', height: 30, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, padding: '0 10px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  unvalConfirmBtn: { height: 30, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '0 10px', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  recupBtn:    { width: '100%', marginTop: 12, background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: 8, minHeight: 40, fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  // RPE toggle
  rpeToggle:   { width: '100%', background: 'white', border: 'none', borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '700', color: '#374151', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '0.5rem' },
  // Superset
  supersetWrapper:{ borderRadius: '14px', overflow: 'hidden', border: '2px solid var(--accent)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  supersetHeader: { background: 'var(--accent-dark)', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  supersetBadge:  { background: 'var(--chip-bg)', color: 'var(--chip-text)', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '800', letterSpacing: '0.04em', whiteSpace: 'nowrap' },
  supersetHint:   { color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: '500', whiteSpace: 'nowrap' },
  supersetConnector:{ background: '#fffef5', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem' },
  supersetLine:   { flex: 1, height: '1px', background: 'var(--chip-bg)', opacity: 0.4 },
  supersetTag:    { fontSize: '0.7rem', fontWeight: '800', color: '#a16207', whiteSpace: 'nowrap' },
  // Timer (styles inlinés directement dans le JSX)
  serieInputWarn: { border: '1px solid #fde68a', color: '#92400e' },
  serieNumChauffe:{ fontSize: '0.7rem', fontWeight: '800', color: '#6b7280', background: '#e5e7eb', width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serieIconBtn:{ marginLeft: 'auto', width: 30, height: 30, background: 'none', border: 'none', borderRadius: 6, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 },
  ajoutChauffe:{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '0 0 8px', fontSize: '0.8rem', fontWeight: 600, color: '#374151', cursor: 'pointer' },
  bilan:       { display: 'flex', gap: 16, paddingTop: 8, borderTop: '1px solid #f3f4f6', fontSize: '0.8rem', color: '#6b7280' },
  bilanVal:    { fontSize: '0.9rem', fontWeight: 700, color: '#333333' },
  // Échauffement / cardio validables
  partie:      { display: 'flex', alignItems: 'center', gap: 8, margin: '0.25rem 2px 0.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' },
  partieCompte:{ marginLeft: 'auto', letterSpacing: 0, textTransform: 'none', fontWeight: 700, color: '#6b7280' },
  prepHead:    { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 10px' },
  prepIco:     { width: 36, height: 36, borderRadius: 10, background: '#f3f4f6', color: '#333333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  prepIcoFait: { background: '#f0fdf4', color: '#16a34a', width: 32, height: 32 },
  prepTitre:   { fontSize: '0.95rem', fontWeight: 800, color: '#333333' },
  prepSous:    { fontSize: '0.78rem', color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  prepValBtn:  { flexShrink: 0, minHeight: 36, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--chip-bg)', color: 'var(--chip-text)', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' },
  prepCheck:   { width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  prepCheckIn: { width: 30, height: 30, borderRadius: 8, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  prepFait:    { background: 'white', border: '1.5px solid #86efac', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 0 12px', minHeight: 56, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  warmRow:     { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '4px 0', borderTop: '1px solid #f3f4f6' },
  warmNom:     { flex: 1, minWidth: 0, fontSize: '0.88rem', fontWeight: 600, color: '#333333' },
  warmReps:    { fontSize: '0.85rem', fontWeight: 800, color: '#333333', textAlign: 'right', whiteSpace: 'nowrap' },
  vignette:    { height: 36, flexShrink: 0, borderRadius: 7, border: 'none', padding: 0, cursor: 'pointer', backgroundColor: '#1a1a1a', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  circuit:     { borderLeft: '2px solid var(--accent)', paddingLeft: 10, margin: '6px 0' },
  circuitLab:  { fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', padding: '4px 0 2px' },
  cardioPuce:  { background: '#f3f4f6', color: '#374151', borderRadius: 8, padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700 },
  cardioPuceFort: { background: 'var(--chip-bg)', color: 'var(--chip-text)', borderRadius: 8, padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700 },
  cardioNote:  { margin: '10px 0 0', fontSize: '0.84rem', color: '#4b5563', lineHeight: 1.5 },
  cardioTexte: { margin: 0, fontSize: '0.88rem', color: '#1a1a1a', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f9fafb', borderRadius: 10, padding: '10px 12px' },
}
