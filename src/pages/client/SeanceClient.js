import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useTimer } from '../../context/TimerContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell as RechartsCell, LineChart, Line, Legend } from 'recharts'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'
import { enqueueCharge, processQueue, pendingCount } from '../../utils/offlineQueue'
import { saveSeanceLocally, loadSeanceLocally, formatSavedAt } from '../../utils/localDB'
import { createPortal } from 'react-dom'
import MuscleMap from '../../components/MuscleMap'
import { findMuscles } from '../../data/muscleData'

function getSemaineActuelle(dateDebut, totalSemaines) {
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  const semaine = Math.ceil((diffJours + 1) / 7)
  return Math.min(Math.max(semaine, 1), totalSemaines)
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

function formatTimer(secs) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const COL = 52
const COL_LABEL = 56

export default function SeanceClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [charges, setCharges] = useState({})
  const [rpeSeances, setRpeSeances] = useState({})
  const [semaines, setSemaines] = useState(4)
  const [semaineActuelle, setSemaineActuelle] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [tracking, setTracking] = useState({})
  const [warmupTracking, setWarmupTracking] = useState({}) // { exId: [{ serie, poids, reps_reelles }] }
  const [blocsTermines, setBlocsTermines] = useState(new Set())
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
  const [histoLoading, setHistoLoading] = useState({})
  const [rpeOpen, setRpeOpen] = useState(false)
  const [echauffement, setEchauffement] = useState([])
  const [expandedDone, setExpandedDone] = useState(new Set())
  const [pendingSync, setPendingSync] = useState(0)
  const [offlineMode, setOfflineMode] = useState(false)  // true = données servies depuis IndexedDB
  const [localSavedAt, setLocalSavedAt] = useState(null)
  const [muscleSheet, setMuscleSheet] = useState(null)   // { nom, primary, secondary }
  const blocRefs = useRef({})

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSeance() }, [])

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
      .select('*, programmes(id, nom, semaines, date_debut, created_at)')
      .eq('id', id).single()
    if (error) {
      const local = await loadSeanceLocally(id)
      if (local) { restoreFromLocal(local); setOfflineMode(true); setLocalSavedAt(local.savedAt) }
      setLoading(false)
      return
    }
    setSeance(data)
    setEchauffement(data.echauffement || [])
    const total = data.programmes.semaines
    setSemaines(total)
    const dateDebut = data.programmes.date_debut || data.programmes.created_at
    const semAct = dateDebut ? getSemaineActuelle(dateDebut, total) : 1
    if (dateDebut) setSemaineActuelle(semAct)

    const exData   = await fetchExercices(data.programmes.semaines, dateDebut, semAct)
    const rpeData  = await fetchRpeSeances(semAct)
    const commData = await fetchCommentaires(semAct)

    // Persister tout en local pour le mode offline
    if (exData) {
      await saveSeanceLocally(id, {
        seance:          data,
        echauffement:    data.echauffement || [],
        semaines:        total,
        semaineActuelle: semAct,
        exercices:       exData.exercices,
        charges:         exData.charges,
        tracking:        exData.tracking,
        warmupTracking:  exData.warmupTracking,
        blocsTermines:   [...(exData.blocsTermines || [])],
        rpeSeances:      rpeData || {},
        commentaires:    commData || [],
      })
    }
    setLoading(false)
  }

  function restoreFromLocal(local) {
    setSeance(local.seance)
    setEchauffement(local.echauffement || [])
    setSemaines(local.semaines)
    setSemaineActuelle(local.semaineActuelle)
    setExercices(local.exercices || [])
    setCharges(local.charges || {})
    setTracking(local.tracking || {})
    setWarmupTracking(local.warmupTracking || {})
    setRpeSeances(local.rpeSeances || {})
    setCommentaires(local.commentaires || [])
    setBlocsTermines(new Set(local.blocsTermines || []))
    // Restaurer le commentaire de la semaine actuelle
    const cur = (local.commentaires || []).find(c => c.semaine === local.semaineActuelle)
    if (cur) { setCommentaire(cur.texte); setNonEffectuee(cur.non_effectuee || false) }
  }

  async function fetchExercices(totalSem, dateDebut, semAct) {
    const { data, error } = await supabase
      .from('exercices').select('*, charges(*), bibliotheque_exercices(image_url)')
      .eq('seance_id', id).order('ordre', { ascending: true })
    if (error) { console.log(error); return null }
    setExercices(data)
    const map = {}
    data.forEach(ex => {
      map[ex.id] = {}
      ex.charges.forEach(c => { map[ex.id][c.semaine] = { id: c.id, charge: c.charge, rpe_reel: c.rpe_reel } })
    })
    setCharges(map)

    const sem = semAct ?? (dateDebut ? getSemaineActuelle(dateDebut, totalSem || 4) : 1)
    const exIds = data.map(e => e.id)
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
      wMap[ex.id] = (rows || [])
        .filter(r => r.exercice_id === ex.id && r.serie >= 1000)
        .sort((a, b) => a.serie - b.serie)
        .map(r => ({ serie: r.serie, poids: r.poids || '', reps_reelles: r.reps_reelles?.toString() || '' }))
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

    return { exercices: data, charges: map, tracking: t, warmupTracking: wMap, blocsTermines: done }
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
    await supabase.from('seance_commentaires').upsert(
      { seance_id: id, semaine: semaineActuelle, texte: commentaire.trim() },
      { onConflict: 'seance_id,semaine' }
    )
    setCommentaires(prev => {
      const others = prev.filter(c => c.semaine !== semaineActuelle)
      return [{ seance_id: id, semaine: semaineActuelle, texte: commentaire.trim() }, ...others]
    })
    setCommentSaved(true)
    setTimeout(() => setCommentSaved(false), 2000)
  }

  async function fetchRpeSeances() {
    const { data, error } = await supabase.from('rpe_seances').select('*').eq('seance_id', id)
    if (error) { console.log(error); return null }
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
  }

  async function devaliderSerie(exId, serieIdx, groupLetter) {
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
    }
    flashSaved()
  }

  async function saveSerieField(exId, serieIdx) {
    const serie = tracking[exId]?.[serieIdx] || {}
    if (!serie.is_done) return // seulement si déjà done
    await supabase.from('serie_tracking').upsert({
      exercice_id: exId, semaine: semaineActuelle, serie: serieIdx + 1,
      poids: serie.poids || null,
      reps_reelles: serie.reps_reelles ? parseInt(serie.reps_reelles) : null,
      valide: serie.valide, is_done: serie.is_done
    }, { onConflict: 'exercice_id,semaine,serie' })
    flashSaved()
  }

  async function validerSerie(exId, serieIdx, groupLetter, groupItems, targetReps) {
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
      reps_reelles: serie.reps_reelles ? parseInt(serie.reps_reelles) : null,
      valide: repsOk,
      is_done: true,
    }, { onConflict: 'exercice_id,semaine,serie' })
    if (!groupLetter || !groupItems) return
    const allDone = groupItems.every(ex => {
      const t = newT[ex.id] || []
      return t.length > 0 && t.every(s => s.is_done)
    })
    if (allDone) {
      setBlocsTermines(prev => new Set([...prev, groupLetter]))
      const letters = [...new Set(exercices.map(e => e.code?.match(/^([A-Za-z]+)/)?.[1]).filter(Boolean))]
      const idx = letters.indexOf(groupLetter)
      if (idx < letters.length - 1) {
        setTimeout(() => blocRefs.current[letters[idx + 1]]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
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
      if (error) alert(error.message)
      else flashSaved()
    } else {
      const { data, error } = await supabase.from('charges').insert([{ exercice_id: exId, semaine, [field]: cleanVal || null }]).select().single()
      if (error) alert(error.message)
      else {
        setCharges(prev => ({ ...prev, [exId]: { ...prev[exId], [semaine]: { id: data.id, charge: '', rpe_reel: null, [field]: cleanVal } } }))
        flashSaved()
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
      if (error) alert(error.message)
      else { setRpeSeances(prev => ({ ...prev, [semaine]: { ...existing, rpe_reel: cleanVal } })); flashSaved() }
    } else {
      const { data, error } = await supabase.from('rpe_seances').insert([{ seance_id: id, semaine, rpe_reel: cleanVal || null }]).select().single()
      if (error) alert(error.message)
      else { setRpeSeances(prev => ({ ...prev, [semaine]: { id: data.id, rpe_cible: null, rpe_reel: cleanVal } })); flashSaved() }
    }
  }

  if (loading) return <PageLoading />
  if (!seance) return <div style={S.centered}><p style={{ color: '#888' }}>Séance introuvable.</p></div>

  const cols = Array.from({ length: semaines }, (_, i) => i + 1)
  const graphData = cols.map(s => ({ name: `S${s}`, 'RPE cible': rpeSeances[s]?.rpe_cible || null, 'RPE réel': rpeSeances[s]?.rpe_reel || null }))

  // Grouper les exercices par lettre
  const groups = []
  exercices.forEach(ex => {
    const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
    const last = groups[groups.length - 1]
    if (last && last.letter === letter && letter) last.items.push(ex)
    else groups.push({ letter, items: [ex] })
  })

  const totalBlocs = groups.length
  const doneBlocs = groups.filter(g => g.letter && blocsTermines.has(g.letter)).length

  // Résumé d'un bloc terminé (ex: "4×6 · 80 kg")
  function blocSummary(groupItems) {
    const ex = groupItems[0]
    const series = ex.series || '?'
    const reps = ex.repetitions || '?'
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
        color: isCur ? '#e4f816' : '#9ca3af',
        borderRadius: 8, padding: '5px 0', fontSize: '0.7rem', fontWeight: '900',
      }}>S{s}</div>
    )
  }

  function TableCell({ children, isCur }) {
    return (
      <div style={{
        width: COL, flexShrink: 0, textAlign: 'center',
        background: isCur ? '#fffef5' : '#fafafa',
        border: `1.5px solid ${isCur ? '#e4f816' : '#f0f0f0'}`,
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
    fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    display: 'flex', alignItems: 'center',
  }

  function isTemps(reps) { return typeof reps === 'string' && reps.includes('"') }

  function openMuscleSheet(ex) {
    const result = findMuscles(ex.nom)
    if (!result) return
    setMuscleSheet({ nom: ex.nom, primary: result.primary, secondary: result.secondary })
  }

  function renderExContent(ex, showRecup, showSeries = true, groupLetter = null, groupItems = null) {
    const tempsMode = isTemps(ex.repetitions)
    const seriesList = tracking[ex.id] || []
    const hasAnyCharge = Object.values(charges[ex.id] || {}).some(v => v.charge && parseFloat(v.charge) > 0)
    const isHistoOpen = histoOpen[ex.id]

    return (
      <div key={ex.id}>
        {/* Image */}
        {ex.bibliotheque_exercices?.image_url && (
          <div style={{ marginBottom: '0.75rem', borderRadius: '10px', overflow: 'hidden' }}>
            <img src={ex.bibliotheque_exercices.image_url} alt={ex.nom}
              style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }} />
          </div>
        )}

        {/* Titre exercice */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={S.exCode}>{ex.code}</span>
            <span style={S.exNom}>{ex.nom}</span>
            {findMuscles(ex.nom) && (
              <button onClick={() => openMuscleSheet(ex)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.45, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>💪</button>
            )}
          </div>
          <span style={S.semBadge}>S{semaineActuelle}</span>
        </div>

        {/* Barre paramètres */}
        {(() => {
          const params = [
            showSeries && ex.series       ? { label: 'SÉRIES',              val: ex.series }                          : null,
            ex.repetitions                ? { label: tempsMode ? 'DURÉE' : 'REPS', val: ex.repetitions }             : null,
            ex.tempo                      ? { label: 'TEMPO',               val: ex.tempo }                           : null,
            showRecup && ex.recuperation  ? { label: 'RÉCUP',               val: ex.recuperation }                    : null,
            ex.type_intensite             ? { label: 'INTENSITÉ',           val: ex.valeur_intensite || ex.type_intensite } : null,
          ].filter(Boolean)
          if (!params.length) return null
          return (
            <div style={S.paramsBar}>
              {params.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
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
              <span style={S.seriesTrackerLabel}>SÉRIES · SEMAINE {semaineActuelle}</span>
              <button onClick={() => toggleHisto(ex.id)} style={S.histoBtn}>
                📋 {isHistoOpen ? 'Masquer' : 'Historique'}
              </button>
            </div>

            {/* Historique performances réelles (accordéon) */}
            {isHistoOpen && (
              <div style={{ marginBottom: '0.75rem', background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {histoLoading[ex.id] ? (
                  <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem', padding: '0.75rem', margin: 0 }}>Chargement…</p>
                ) : (() => {
                  const grouped = histoTracking[ex.id] || {}
                  const semsPrev = Object.keys(grouped)
                    .map(Number)
                    .filter(s => s < semaineActuelle)
                    .sort((a, b) => b - a) // plus récente en premier
                  if (!semsPrev.length) return (
                    <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem', padding: '0.75rem', margin: 0 }}>Aucune donnée enregistrée pour les semaines précédentes.</p>
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
                            <span style={{ background: sem === semaineActuelle - 1 ? '#333333' : '#f3f4f6', color: sem === semaineActuelle - 1 ? '#e4f816' : '#6b7280', borderRadius: 6, padding: '0.1rem 0.45rem', fontSize: '0.68rem', fontWeight: '900' }}>S{sem}</span>
                            {sem === semaineActuelle - 1 && <span style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 600 }}>sem. précédente</span>}
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#374151' }}>{poidsLabel}</span>
                        </div>
                        {/* Détail séries */}
                        <div style={{ padding: '0 0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {rows.map((r, ri) => (
                            <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.6rem', fontWeight: '800', color: '#d1d5db', width: 16, textAlign: 'center', flexShrink: 0 }}>{r.serie}</span>
                              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1a1a1a', minWidth: 52 }}>
                                {r.poids ? `${r.poids} kg` : <span style={{ color: '#d1d5db' }}>— kg</span>}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
                                {r.reps_reelles ? `× ${r.reps_reelles} ${tempsMode ? 's' : 'reps'}` : ''}
                              </span>
                              <span style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>
                                {r.valide ? '✓' : '⚠'}
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

            {/* ── Séries d'échauffement ────────────────────── */}
            {(() => {
              const warmups = warmupTracking[ex.id] || []
              return (
                <div style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Échauffement {warmups.length > 0 ? `· ${warmups.length} série${warmups.length > 1 ? 's' : ''}` : ''}
                    </span>
                    <button onClick={() => addWarmupSet(ex.id)} style={{
                      background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 6,
                      color: '#9ca3af', fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer', padding: '2px 8px',
                    }}>+ Série</button>
                  </div>
                  {warmups.map((ws, wi) => (
                    <div key={ws.serie} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem', background: '#f9fafb', borderRadius: 8, padding: '0.35rem 0.55rem', border: '1.5px solid #e5e7eb' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#9ca3af', width: 22, textAlign: 'center', flexShrink: 0 }}>É{wi + 1}</span>
                      <input type="text" value={ws.poids}
                        onChange={e => updateWarmupField(ex.id, wi, 'poids', e.target.value)}
                        onBlur={() => saveWarmupSet(ex.id, wi)}
                        placeholder="kg"
                        style={{ width: 48, padding: '0.25rem 0.35rem', border: '1.5px solid #e5e7eb', borderRadius: 5, fontSize: '0.82rem', fontWeight: '700', textAlign: 'center', outline: 'none', background: 'white' }} />
                      <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>kg</span>
                      <input type="number" value={ws.reps_reelles}
                        onChange={e => updateWarmupField(ex.id, wi, 'reps_reelles', e.target.value)}
                        onBlur={() => saveWarmupSet(ex.id, wi)}
                        placeholder={tempsMode ? 'sec' : 'reps'}
                        style={{ width: 44, padding: '0.25rem 0.35rem', border: '1.5px solid #e5e7eb', borderRadius: 5, fontSize: '0.82rem', fontWeight: '700', textAlign: 'center', outline: 'none', background: 'white' }} />
                      <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{tempsMode ? 's' : 'reps'}</span>
                      <button onClick={() => removeWarmupSet(ex.id, wi)} style={{
                        marginLeft: 'auto', background: 'none', border: 'none', color: '#d1d5db', fontSize: '1rem', cursor: 'pointer', padding: '0 2px', flexShrink: 0,
                      }}>×</button>
                    </div>
                  ))}
                </div>
              )
            })()}

            {seriesList.map((serie, si) => (
              <div key={si} style={{ ...S.serieRow, ...(serie.is_done ? (serie.valide ? S.serieRowDone : S.serieRowWarn) : {}) }}>
                <span style={S.serieNum}>{si + 1}</span>
                <input type="text" value={serie.poids}
                  onChange={e => updateTrackingField(ex.id, si, 'poids', e.target.value)}
                  onBlur={() => saveSerieField(ex.id, si)}
                  placeholder="kg"
                  readOnly={serie.is_done}
                  style={{ ...S.serieInput, width: 52, ...(serie.is_done ? S.serieInputDone : {}) }} />
                <span style={S.serieUnit}>kg</span>
                <input type="number" value={serie.reps_reelles}
                  onChange={e => updateTrackingField(ex.id, si, 'reps_reelles', e.target.value)}
                  onBlur={() => saveSerieField(ex.id, si)}
                  placeholder={tempsMode ? (ex.repetitions?.replace('"', '') || 'sec') : (ex.repetitions || 'reps')}
                  readOnly={serie.is_done}
                  style={{ ...S.serieInput, width: 48, ...(serie.is_done ? S.serieInputDone : {}) }} />
                <span style={S.serieUnit}>{tempsMode ? 's' : 'reps'}</span>
                {serie.is_done
                  ? pendingUnvalidate?.exId === ex.id && pendingUnvalidate?.serieIdx === si
                    ? <>
                        <button onClick={() => setPendingUnvalidate(null)} style={S.unvalCancelBtn}>Non</button>
                        <button onClick={() => devaliderSerie(ex.id, si, groupLetter)} style={S.unvalConfirmBtn}>Oui</button>
                      </>
                    : <button onClick={() => setPendingUnvalidate({ exId: ex.id, serieIdx: si })}
                        style={serie.valide ? S.serieDoneBadge : S.serieDoneWarnBadge}>
                        {serie.valide ? '✓' : '⚠'}
                      </button>
                  : <button onClick={() => validerSerie(ex.id, si, groupLetter, groupItems, ex.repetitions)} style={S.serieValBtn}>Valider</button>
                }
              </div>
            ))}

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
              const warmupCount = warmups.filter(w => (parseInt(w.reps_reelles) || 0) > 0).length
              const workCount = doneSeries.length
              return (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '0.3rem 0.65rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#e4f816', lineHeight: 1 }}>{totalReps}</span>
                    <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>{tempsMode ? 'VOLUME (sec)' : 'VOLUME (reps)'}</span>
                  </div>
                  {tonnage > 0 && (
                    <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '0.3rem 0.65rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#e4f816', lineHeight: 1 }}>{Math.round(tonnage)} kg</span>
                      <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>TONNAGE</span>
                    </div>
                  )}
                  {warmupCount > 0 && (
                    <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '0.3rem 0.65rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#6b7280', lineHeight: 1 }}>{warmupCount}+{workCount}</span>
                      <span style={{ fontSize: '0.55rem', color: '#9ca3af', marginTop: 1 }}>ÉCH+TRAV</span>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Bouton récup */}
            {showRecup && ex.recuperation && (() => {
              const recupSecs = parseRecup(ex.recuperation)
              return recupSecs > 0 ? (
                <button onClick={() => lancerTimer(recupSecs)} style={S.recupBtn}>
                  ⏱ Lancer la récup · {ex.recuperation}
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
                <input key={`charge-${ex.id}-${s}`} type="text"
                  defaultValue={charges[ex.id]?.[s]?.charge || ''}
                  onBlur={e => updateCharge(ex.id, s, 'charge', e.target.value)}
                  style={inputStyle(s === semaineActuelle)} placeholder="—" />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={labelStyle}>RPE</div>
              {cols.map(s => (
                <input key={`rpe-${ex.id}-${s}`} type="number" min="1" max="10" step="0.5"
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
      {/* Bandeau hors ligne */}
      {offlineMode && (
        <div style={{ background: '#f59e0b', color: 'white', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', position: 'sticky', top: 0, zIndex: 200 }}>
          ✈️ Mode hors ligne · données locales {localSavedAt ? `(${formatSavedAt(localSavedAt)})` : ''}
        </div>
      )}
      {/* Badge charges en attente (visible si online + items en queue) */}
      {navigator.onLine && pendingSync > 0 && (
        <div style={{ background: '#22c55e', color: 'white', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px' }}>
          ↑ Synchronisation de {pendingSync} charge{pendingSync > 1 ? 's' : ''} en cours…
        </div>
      )}

      {/* Toast */}
      <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: '#333333', color: '#e4f816', padding: '0.6rem 1.4rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.875rem', opacity: saved ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 100 }}>
        ✓ Enregistré
      </div>

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(`/client/programme/${seance.programmes.id}`)} style={S.backBtn}>‹</button>
        <span style={S.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        {/* Titre */}
        <div style={{ marginBottom: '1rem' }}>
          <p style={S.programmeNom}>{seance.programmes.nom}</p>
          <h1 style={S.title}>{seance.nom}</h1>
          <div style={{ marginTop: '0.4rem' }}>
            <span style={S.curBadge}>S{semaineActuelle} en cours</span>
          </div>
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

        {/* Barre de progression */}
        {totalBlocs > 0 && !nonEffectuee && (
          <div style={S.progressCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Progression séance</span>
              <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#333333' }}>{doneBlocs} / {totalBlocs} blocs {doneBlocs === totalBlocs && doneBlocs > 0 ? '✓' : ''}</span>
            </div>
            <div style={S.progressTrack}>
              <div style={{ ...S.progressFill, width: `${(doneBlocs / totalBlocs) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Échauffement */}
        {echauffement.length > 0 && (() => {
          const warmGroups = []
          echauffement.forEach(l => {
            const last = warmGroups[warmGroups.length - 1]
            if (l.groupe && last?.groupe === l.groupe) last.items.push(l)
            else warmGroups.push({ groupe: l.groupe, items: [l] })
          })
          return (
            <div style={{ ...S.card, marginBottom: '0.75rem' }}>
              <p style={S.sectionLabel}>Échauffement</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {warmGroups.map((g, gi) => {
                  if (!g.groupe) {
                    return g.items.map((l, i) => (
                      <div key={l.id || `${gi}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0.5rem', background: '#f9fafb', borderRadius: 8 }}>
                        <span style={{ flex: 1, fontSize: '0.92rem', fontWeight: '600', color: '#333333' }}>{l.nom}</span>
                        <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#6366f1' }}>{l.reps}</span>
                      </div>
                    ))
                  }
                  const tours = g.items[0]?.tours
                  return (
                    <div key={gi} style={{ display: 'flex', alignItems: 'stretch', borderLeft: '3px solid #e4f816', background: '#fffef5', borderRadius: '0 10px 10px 0', padding: '0.5rem 0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        {g.items.map((l, i) => (
                          <div key={l.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: i > 0 ? '0.35rem' : 0, paddingTop: i > 0 ? '0.35rem' : 0, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                            <span style={{ flex: 1, fontSize: '0.92rem', fontWeight: '600', color: '#333333' }}>{l.nom}</span>
                            <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#6366f1' }}>{l.reps}</span>
                          </div>
                        ))}
                      </div>
                      {tours && (
                        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.75rem', flexShrink: 0 }}>
                          <div style={{ borderTop: '2px solid #d97706', borderRight: '2px solid #d97706', borderBottom: '2px solid #d97706', borderRadius: '0 4px 4px 0', width: 6, alignSelf: 'stretch' }} />
                          <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#d97706', paddingLeft: '0.35rem', whiteSpace: 'nowrap' }}>{tours} tours</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Exercices */}
        {nonEffectuee ? (
          <div style={S.nonEffectueeCard}>
            <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>😴</p>
            <p style={{ fontWeight: '700', color: '#374151', margin: '0 0 0.25rem' }}>Séance non effectuée</p>
            <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>Semaine {semaineActuelle} — Appuie sur le bouton ci-dessus pour annuler</p>
          </div>
        ) : exercices.length === 0 ? (
          <div style={S.emptyCard}>Aucun exercice.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {groups.map((group, gi) => {
              const isDone = group.letter && blocsTermines.has(group.letter)
              const isExpanded = expandedDone.has(group.letter)

              // Bloc terminé → ligne compacte (sauf si on a cliqué pour expand)
              if (isDone && !isExpanded) {
                const summary = blocSummary(group.items)
                const label = group.items.length === 1
                  ? group.items[0].nom
                  : `Superset ${group.letter} (${group.items.length} exos)`
                return (
                  <div key={gi}
                    ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                    onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.add(group.letter); return s })}
                    style={S.collapsedRow}>
                    <span style={S.collapsedCheck}>✓</span>
                    <span style={S.collapsedCode}>{group.letter}</span>
                    <span style={S.collapsedNom}>{label}</span>
                    <span style={S.collapsedStats}>{summary}</span>
                    <span style={{ color: '#d1d5db', fontSize: '0.85rem' }}>›</span>
                  </div>
                )
              }

              // Bloc simple
              if (group.items.length === 1) {
                return (
                  <div key={gi}
                    ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                    style={{ ...S.exCard, ...(isDone ? S.exCardDone : {}) }}>
                    {isDone && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={S.blocDoneBadge}>✓ Bloc terminé</div>
                        <button onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.delete(group.letter); return s })}
                          style={S.collapseBtn}>Replier ↑</button>
                      </div>
                    )}
                    {renderExContent(group.items[0], true, true, group.letter, group.items)}
                  </div>
                )
              }

              // Superset
              return (
                <div key={gi}
                  ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                  style={{ ...S.supersetWrapper, ...(isDone ? { borderColor: '#16a34a' } : {}) }}>
                  <div style={{ ...S.supersetHeader, ...(isDone ? { background: '#14532d' } : {}) }}>
                    <span style={S.supersetBadge}>SUPERSET · {group.letter}</span>
                    {isDone
                      ? <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <span style={{ color: '#86efac', fontSize: '0.7rem', fontWeight: '700' }}>✓ Terminé</span>
                          <button onClick={() => setExpandedDone(prev => { const s = new Set(prev); s.delete(group.letter); return s })}
                            style={{ ...S.collapseBtn, color: '#86efac', borderColor: '#16a34a' }}>Replier ↑</button>
                        </div>
                      : <span style={S.supersetHint}>Enchaîner sans récupération</span>
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
                </div>
              )
            })}
          </div>
        )}

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
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#e4f816', lineHeight: 1 }}>{Math.round(tonnageTotal).toLocaleString('fr-FR')} kg</div>
                  <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tonnage total</div>
                </div>
              )}
              {repsTotal > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#e4f816', lineHeight: 1 }}>{repsTotal}</div>
                  <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Volume (reps)</div>
                </div>
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#e4f816', lineHeight: 1 }}>{exosDone}<span style={{ fontSize: '0.85rem', opacity: 0.6 }}>/{exercices.length}</span></div>
                <div style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.45)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Exos lancés</div>
              </div>
            </div>
          )
        })()}

        {/* Intensité RPE — section repliable */}
        <div style={{ marginTop: '1.25rem' }}>
          <button onClick={() => setRpeOpen(v => !v)}
            style={S.rpeToggle}>
            <span>📊 Intensité de la séance</span>
            <span style={{ transform: rpeOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', fontSize: '1rem', color: '#9ca3af' }}>›</span>
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
                  <Line type="monotone" dataKey="RPE cible" stroke="#333333" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="RPE réel" stroke="#e4f816" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 5" connectNulls />
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
                      <input key={`rpe-seance-${s}`} type="number" min="1" max="10" step="0.5"
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
          <div style={{ background: 'white', borderRadius: 14, padding: '1rem 1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
              onBlur={saveCommentaire} rows={3} placeholder="Laisse une note sur cette séance..."
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem 0.75rem', fontSize: '0.88rem', color: '#333333', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button onClick={saveCommentaire}
                style={{ background: commentSaved ? '#16a34a' : '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', transition: 'background 0.3s' }}>
                {commentSaved ? '✓ Enregistré' : 'Enregistrer'}
              </button>
            </div>
          </div>
          {commentaires.filter(c => c.semaine !== semaineActuelle).length > 0 && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Semaines précédentes</p>
              {commentaires.filter(c => c.semaine !== semaineActuelle).map(c => (
                <div key={c.semaine} style={{ background: 'white', borderRadius: 12, padding: '0.75rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>S{c.semaine}</span>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>{c.texte}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ClientBottomNav />
    </div>
  )

  // ── Bottom sheet muscles ────────────────────────────────────────────────────
  return (
    <>
      {main}
      {muscleSheet && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setMuscleSheet(null)}
        >
          <div
            style={{ background: 'white', borderRadius: '22px 22px 0 0', padding: '1.25rem 1.25rem calc(1.75rem + env(safe-area-inset-bottom))', width: '100%', boxSizing: 'border-box', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1rem' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0, color: '#1a1a1a' }}>💪 {muscleSheet.nom}</p>
              <button onClick={() => setMuscleSheet(null)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <MuscleMap primary={muscleSheet.primary} secondary={muscleSheet.secondary} size={180} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {muscleSheet.primary.map(m => (
                <span key={m} style={{ background: '#dc2626', color: 'white', padding: '0.25rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>{m.replace(/_/g, '-')}</span>
              ))}
              {muscleSheet.secondary.map(m => (
                <span key={m} style={{ background: '#f97316', color: 'white', padding: '0.25rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700 }}>{m.replace(/_/g, '-')}</span>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  centered:    { minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:     { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logo:        { color: 'white', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.5px' },
  content:     { padding: '1.25rem 1.25rem', maxWidth: '480px', margin: '0 auto' },
  programmeNom:{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.2rem' },
  title:       { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  curBadge:    { background: '#333333', color: '#e4f816', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700' },
  // Progress bar
  progressCard:{ background: 'white', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  progressTrack:{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#333333', borderRadius: 999, transition: 'width 0.5s ease' },
  // Cards
  card:        { background: 'white', borderRadius: '14px', padding: '1rem 1.1rem', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  sectionLabel:{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.75rem' },
  emptyCard:       { background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  nonEffectueeBtn: { width: '100%', marginBottom: '0.75rem', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: '700', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  nonEffectueeBtnActive: { background: '#fef2f2', border: '1.5px solid #fca5a5', color: '#dc2626' },
  nonEffectueeCard:{ background: 'white', borderRadius: 14, padding: '2rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '0.75rem' },
  // Exercice actif
  exCard:      { background: 'white', borderRadius: '14px', padding: '1rem 1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  exCardDone:  { border: '2px solid #86efac', background: '#f0fdf4' },
  exCode:      { background: '#333333', color: '#e4f816', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800' },
  exNom:       { fontWeight: '700', fontSize: '0.92rem', color: '#333333' },
  semBadge:    { background: '#f3f4f6', color: '#6b7280', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', flexShrink: 0 },
  // Exercice collapsé (terminé)
  collapsedRow:{ background: 'white', borderRadius: 12, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer', border: '1.5px solid #86efac' },
  collapsedCheck:{ color: '#16a34a', fontWeight: '900', fontSize: '0.9rem', flexShrink: 0 },
  collapsedCode:{ background: '#16a34a', color: 'white', padding: '0.1rem 0.45rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', flexShrink: 0 },
  collapsedNom:{ fontWeight: '700', fontSize: '0.88rem', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  collapsedStats:{ fontSize: '0.78rem', fontWeight: '600', color: '#9ca3af', flexShrink: 0 },
  blocDoneBadge:{ background: '#16a34a', color: 'white', borderRadius: 6, padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: '800', display: 'inline-block' },
  collapseBtn: { background: 'none', border: '1px solid #86efac', color: '#16a34a', borderRadius: 6, padding: '0.15rem 0.5rem', fontSize: '0.68rem', fontWeight: '700', cursor: 'pointer' },
  // Paramètres
  paramsBar:    { display: 'flex', alignItems: 'center', background: '#f3f4f6', borderRadius: 10, padding: '0.45rem 0.6rem', marginBottom: '0.75rem', overflowX: 'auto' },
  paramItem:    { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 0.65rem', flexShrink: 0 },
  paramDivider: { width: 1, height: 26, background: '#e5e7eb', flexShrink: 0 },
  paramLabel:   { fontSize: '0.52rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 },
  paramValue:   { fontSize: '0.95rem', fontWeight: '800', color: '#111827', lineHeight: 1.3, whiteSpace: 'nowrap' },
  // Séries tracker
  seriesTracker:{ background: '#f8f9fa', borderRadius: 10, padding: '0.75rem', marginBottom: '0.6rem' },
  seriesTrackerLabel:{ fontSize: '0.62rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' },
  histoBtn:    { background: 'none', border: 'none', color: '#6366f1', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', padding: 0 },
  serieRow:    { display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', background: 'white', borderRadius: 8, padding: '0.4rem 0.6rem', border: '1.5px solid #e5e7eb' },
  serieRowDone:{ background: '#f0fdf4', border: '1.5px solid #86efac' },
  serieRowWarn: { background: '#fffbeb', border: '1.5px solid #fbbf24' },
  serieNum:    { fontSize: '0.72rem', fontWeight: '900', color: '#e4f816', background: '#333333', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serieInput:     { padding: '0.3rem 0.4rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem', fontWeight: '700', color: '#333333', textAlign: 'center', outline: 'none' },
  serieInputDone: { background: '#f0fdf4', border: '1.5px solid #86efac', color: '#15803d' },
  serieUnit:   { fontSize: '0.65rem', fontWeight: '600', color: '#9ca3af', flexShrink: 0 },
  serieValBtn: { marginLeft: 'auto', background: '#333333', color: '#e4f816', border: 'none', borderRadius: 6, padding: '0.3rem 0.65rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  serieDoneBadge:  { marginLeft: 'auto', background: '#16a34a', color: 'white', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.8rem', fontWeight: '800', flexShrink: 0, border: 'none', cursor: 'pointer' },
  serieDoneWarnBadge: { marginLeft: 'auto', background: '#f59e0b', color: 'white', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.8rem', fontWeight: '800', flexShrink: 0, border: 'none', cursor: 'pointer' },
  unvalCancelBtn:  { marginLeft: 'auto', background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  unvalConfirmBtn: { background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  recupBtn:    { width: '100%', marginTop: '0.5rem', background: '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.55rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' },
  // RPE toggle
  rpeToggle:   { width: '100%', background: 'white', border: 'none', borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '700', color: '#374151', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '0.5rem' },
  // Superset
  supersetWrapper:{ borderRadius: '14px', overflow: 'hidden', border: '2px solid #e4f816', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  supersetHeader: { background: '#333333', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  supersetBadge:  { background: '#e4f816', color: '#333333', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '900', letterSpacing: '0.05em' },
  supersetHint:   { color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: '600' },
  supersetConnector:{ background: '#fffef5', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem' },
  supersetLine:   { flex: 1, height: '1px', background: '#e4f816', opacity: 0.4 },
  supersetTag:    { fontSize: '0.68rem', fontWeight: '800', color: '#a16207', whiteSpace: 'nowrap' },
  // Timer (styles inlinés directement dans le JSX)
}
