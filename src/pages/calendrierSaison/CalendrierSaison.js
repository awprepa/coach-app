import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../../supabase'
import { CompetitionTab } from './CompetitionTab'
import { EffectifView } from './EffectifView'
import { GroupesNiveauView } from './GroupesNiveauView'
import { InheritedEventPreview } from './InheritedEventPreview'
import { Leg, Stat } from './Petits'
import { SeanceModal } from './SeanceModal'
import { DayCell } from './DayCell'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'
import { dupliquerBlocs, dupliquerDocuments, loadBlocs, loadBlocsPour } from './blocs'
import { WeekZoomModal } from './WeekZoomModal'
import { CREATE_TYPES, DOW, HAS_BLOCS, MATCH_CATEGORIES, STYLE_COLORS, TYPES, buildMonths, iso, isoWeek, localISO, matchCatColor, seasonStartYear, ymd } from './constants'
import { isLight } from './couleurs'
import { clipLabel, formatPopDate } from './seqHelpers'
import { S } from './styles'

const EMPTY_LIST = []

export default function CalendrierSaison({ groupeId = null, embedded = false, openEventId = null }) {
  const [groupes, setGroupes]   = useState([])
  const [groupe, setGroupe]     = useState(null)
  const [startYear, setStartYear] = useState(seasonStartYear())
  const [evenements, setEvenements] = useState([])
  const [phases, setPhases]     = useState([])
  const [loading, setLoading]   = useState(true)

  // Panneau : { mode:'edit'|'create', evt, form, blocs }
  const [panel, setPanel] = useState(null)
  const [saving, setSaving] = useState(false)

  // Zoom semaine : { startISO, wkNum, days, blocsMap }
  const [weekZoom, setWeekZoom] = useState(null)

  // Aperçu en lecture seule d'un évènement hérité d'un groupe parent : { evt, blocs }
  const [dayPreview, setDayPreview] = useState(null)

  // Menu contextuel sur une séance (clic droit) : { x, y, dateISO, evt }
  const [ctx, setCtx] = useState(null)
  // Bulle de création sur un jour : { x, y, form }
  const [pop, setPop] = useState(null)
  // Presse-papier : { source, blocs }  (source = évènement copié)
  const [clip, setClip] = useState(null)
  const [calTab, setCalTab] = useState('calendrier') // 'calendrier' | 'effectif' | 'competition'
  const [matchsFFR, setMatchsFFR]         = useState([])
  const [classementFFR, setClassementFFR] = useState([])
  const [syncingFFR, setSyncingFFR]       = useState(false)
  const [lastSyncFFR, setLastSyncFFR]     = useState(null)

  // Glisser-déposer : évènement en cours de déplacement + jour survolé
  const [dragEvt, setDragEvt] = useState(null)
  const [dragOver, setDragOver] = useState(null) // dateISO survolé

  // Sélection multi-jours (glisser)
  const [sel, setSel]           = useState(null)   // { start: ISO, end: ISO }
  const [selDrag, setSelDrag]   = useState(false)
  const [selMenu, setSelMenu]   = useState(null)   // { x, y }
  const [selMode, setSelMode]   = useState('main') // 'main' | 'period'
  const [selForm, setSelForm]   = useState({ type: 'vacances', label: '', couleur: '#f4e8c4' })
  const [periodClip, setPeriodClip] = useState(null) // { start, end, events, blocsMap }

  // Panneau IA planification
  const [aiOpen, setAiOpen]       = useState(false)
  const [aiMessages, setAiMessages] = useState([])
  const [aiProposed, setAiProposed] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInput, setAiInput]     = useState('')
  const selRef     = useRef(null)
  selRef.current   = sel
  const lastDateRef = useRef(null) // dernier jour survolé/cliqué (pour coller via clavier)
  const lastEvtRef  = useRef(null) // dernier évènement focusé (pour delete/copier via clavier)
  // ref stable pour le handler clavier (évite re-register à chaque render)
  const kbRef = useRef(null)

  const groupColor = groupe?.couleur || '#2f6f76'
  const months = useMemo(() => buildMonths(startYear), [startYear])
  const seasonStart = iso(startYear, 6, 1)
  const seasonEnd   = iso(startYear + 1, 5, 30)

  // ── Chargement des groupes ──────────────────────────────────────────────────
  useEffect(() => {
    if (groupeId) {
      // mode intégré : un seul groupe
      supabase.from('groupes').select('*').eq('id', groupeId).single().then(({ data }) => {
        if (data) { setGroupes([data]); setGroupe(data) }
        else setLoading(false)
      })
    } else {
      supabase.from('groupes').select('*').order('nom').then(({ data }) => {
        setGroupes(data || [])
        if (data?.length) setGroupe(data[0])
        else setLoading(false)
      })
    }
  }, [groupeId])

  // ── Chargement saison (évènements + phases) ─────────────────────────────────
  // silent=true : pas de spinner, préserve la position de scroll (utilisé après create/edit/delete)
  // Remonte la chaîne de groupes parents (sous-sous-groupe → sous-groupe → groupe
  // principal…) pour hériter de leurs évènements dans le calendrier.
  async function getAncestorIds(startParentId) {
    // une seule requête (la table des groupes est petite) au lieu d'un aller-retour par niveau
    const { data } = await supabase.from('groupes').select('id, parent_id')
    const parent = {}
    ;(data || []).forEach(g => { parent[g.id] = g.parent_id })
    const ids = []
    let pid = startParentId
    let garde = 0
    while (pid && garde < 10) { ids.push(pid); pid = parent[pid] || null; garde++ }
    return ids
  }

  const loadSeq = useRef(0)
  const loadSeason = useCallback(async (silent = false) => {
    if (!groupe) return
    const mine = ++loadSeq.current            // numéro de cette demande
    const scrollY = window.scrollY
    if (!silent) setLoading(true)
    try {
      const ancestorIds = groupe.parent_id ? await getAncestorIds(groupe.parent_id) : []
      const [{ data: evs, error: errEv }, { data: phs }] = await Promise.all([
        supabase.from('groupe_evenements').select('*')
          .in('groupe_id', [groupe.id, ...ancestorIds]).gte('date', seasonStart).lte('date', seasonEnd).order('date'),
        supabase.from('groupe_phases').select('*')
          .eq('groupe_id', groupe.id).order('ordre'),
      ])
      if (mine !== loadSeq.current) return    // le groupe ou la saison a changé entre-temps
      if (errEv) { console.error('[CalendrierSaison] chargement', errEv.message); return }
      // Évènements hérités d'un groupe parent (entraînements communs à toute
      // l'équipe) : affichés partout, mais modifiables seulement depuis le
      // groupe qui les a créés.
      setEvenements((evs || []).map(e => ({ ...e, _inherited: e.groupe_id !== groupe.id })))
      setPhases(phs || [])
      if (groupe.monclubhouse_url) {
        const [{ data: ffr }, { data: cls }] = await Promise.all([
          supabase.from('matchs_ffr').select('*').eq('groupe_id', groupe.id).order('date_match'),
          supabase.from('classements_ffr').select('*').eq('groupe_id', groupe.id).order('position'),
        ])
        if (mine !== loadSeq.current) return
        setMatchsFFR(ffr || [])
        setClassementFFR(cls || [])
        if (ffr?.length) setLastSyncFFR(ffr[0].synced_at)
      } else {
        setMatchsFFR([]); setClassementFFR([])
      }
    } catch (e) {
      console.error('[CalendrierSaison] chargement', e)
    } finally {
      if (mine === loadSeq.current) {
        if (!silent) setLoading(false)
        else requestAnimationFrame(() => window.scrollTo(0, scrollY))
      }
    }
  }, [groupe, seasonStart, seasonEnd])

  useEffect(() => { loadSeason() }, [loadSeason])
  // Si le cache hors-ligne a servi une version périmée, le service worker prévient
  // dès que la version fraîche arrive : on se met à jour sans actualiser la page.
  useAutoRefresh(() => loadSeason(true))

  // Accès direct à un évènement précis (ex: clic sur "Prochain entraînement"
  // depuis le tableau de bord du groupe) — ouvre son panneau d'édition dès
  // que la saison est chargée. Le ref évite de rouvrir si l'utilisateur
  // referme le panneau ensuite.
  const autoOpenedRef = useRef(null)
  useEffect(() => {
    if (!openEventId || autoOpenedRef.current === openEventId || !evenements.length) return
    const found = evenements.find(e => e.id === openEventId)
    if (found) {
      autoOpenedRef.current = openEventId
      if (found._inherited) loadBlocs(found.id).then(blocs => setDayPreview({ evt: found, blocs }))
      else openEdit(found)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEventId, evenements])

  // fermer le menu contextuel sur clic ailleurs / touche échap
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const onKey = e => { if (e.key === 'Escape') setCtx(null) }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  // fermer la bulle de création sur touche échap
  useEffect(() => {
    if (!pop) return
    const onKey = e => { if (e.key === 'Escape') setPop(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pop])

  // finaliser la sélection multi-jours au mouseup
  useEffect(() => {
    if (!selDrag) return
    const onUp = e => {
      setSelDrag(false)
      const s = selRef.current
      if (!s) return
      const [start, end] = [s.start, s.end].sort()
      // si 1 seul jour : on garde sel actif (case bleue) mais pas de selMenu flottant
      if (start === end) return
      const x = Math.min(e.clientX, window.innerWidth - 250)
      const y = Math.min(e.clientY + 10, window.innerHeight - 310)
      setSelMenu({ x, y }); setSelMode('main')
      setSelForm({ type: 'vacances', label: '', couleur: '#f4e8c4' })
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [selDrag])

  // fermer le menu de sélection sur Echap
  useEffect(() => {
    if (!selMenu) return
    const onKey = e => { if (e.key === 'Escape') { setSelMenu(null); setSel(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selMenu])

  // ── Raccourcis clavier globaux ───────────────────────────────────────────────
  // Le handler est dans kbRef pour toujours lire les valeurs à jour sans re-register
  // Delete/Backspace : supprimer l'évènement actif
  // Cmd/Ctrl+C       : copier l'évènement actif OU la période sélectionnée
  // Cmd/Ctrl+V       : coller au dernier jour survolé
  useEffect(() => {
    const onKey = e => kbRef.current?.(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])                // inscrit une seule fois, kbRef.current est toujours à jour

  // ── Index par jour (recalculés seulement quand les données changent) ───────
  const evByDay = useMemo(() => {
    // Un jour de match FFR, la carte FFR recouvre la case : son événement « match »
    // (créé automatiquement pour le RPE) n'y est pas ajouté, sinon son texte
    // élargit la colonne du mois et la saison ne tient plus à l'écran.
    const joursFFR = new Set(matchsFFR.map(m => m.date_match).filter(Boolean))
    const out = {}
    for (const e of evenements) {
      if (e.type === 'match' && joursFFR.has(e.date)) continue
      const [Y, M, D] = e.date.split('-').map(Number)
      ;(out[ymd(Y, M - 1, D)] ||= []).push(e)
    }
    return out
  }, [evenements, matchsFFR])
  const matchsList = useMemo(() => evenements.filter(e => e.type === 'match'), [evenements])
  const nbEntrainements = useMemo(() => evenements.filter(e => e.type === 'entrainement').length, [evenements])
  // Matchs du groupe + matchs FFR synchronisés (un seul par date si les deux existent)
  const nbMatchs = useMemo(() => new Set([
    ...matchsList.map(m => m.date),
    ...matchsFFR.filter(m => m.date_match).map(m => m.date_match),
  ]).size, [matchsList, matchsFFR])
  const today = new Date(); const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate())
  const ffrByDay = useMemo(() => {
    const out = {}
    for (const m of matchsFFR) {
      if (!m.date_match) continue
      const [Y, M, D] = m.date_match.split('-').map(Number)
      ;(out[ymd(Y, M - 1, D)] ||= []).push(m)
    }
    return out
  }, [matchsFFR])

  // Sync FFR depuis l'Edge Function
  async function syncFFR() {
    if (!groupe?.monclubhouse_url) return
    setSyncingFFR(true)
    try {
      const { data: result, error: fnErr } = await supabase.functions.invoke('sync-ffr', {
        body: { groupe_id: groupe.id },
      })
      if (fnErr) throw fnErr

      // Toujours recharger les données après sync (qu'il y ait erreur ou pas)
      const [{ data: ffr }, { data: cls }] = await Promise.all([
        supabase.from('matchs_ffr').select('*').eq('groupe_id', groupe.id).order('date_match'),
        supabase.from('classements_ffr').select('*').eq('groupe_id', groupe.id).order('position'),
      ])
      setMatchsFFR(ffr || [])
      setClassementFFR(cls || [])
      if (ffr?.length) setLastSyncFFR(new Date().toISOString())

      // Message de résultat
      const r = result?.results?.[0]
      const msg = `Sync terminée\n• ${ffr?.length || 0} matchs\n• ${cls?.length || 0} équipes au classement${r?.errors?.length ? '\n\n! ' + r.errors.join('\n') : ''}`
      alert(msg)
    } catch (e) {
      alert('Erreur sync : ' + (e?.message || String(e)))
    }
    setSyncingFFR(false)
  }

  // phase couvrant un mois (pour le ruban + le liseré de colonne)
  const seasonPhases = phases.filter(p => p.type === 'phase')
  const vacances = phases.filter(p => p.type === 'vacances')
  function phaseOfMonth(y, m) {
    const mid = iso(y, m, 15)
    return seasonPhases.find(p => p.date_debut <= mid && mid <= p.date_fin) || null
  }
  function vacInfo(y, m, d) {
    const date = iso(y, m, d)
    for (const v of vacances) {
      if (v.date_debut <= date && date <= v.date_fin)
        return { in: true, start: date === v.date_debut, label: v.label }
    }
    return { in: false }
  }
  // segments du ruban : regroupe les mois consécutifs de même phase
  const ribbon = []
  months.forEach(M => {
    const p = phaseOfMonth(M.y, M.m)
    const last = ribbon[ribbon.length - 1]
    if (last && last.id === (p?.id || null)) last.span++
    else ribbon.push({ id: p?.id || null, label: p?.label || '', couleur: p?.couleur || '#d8dce1', span: 1 })
  })

  // ── Actions panneau ───────────────────────────────────────────────────────────
  function emptyForm(dateISO) {
    return {
      type: 'entrainement', date: dateISO || seasonStart, heure: '', titre: '',
      style: '', adversaire: '', categorie: 'Championnat', domicile: true, journee: '',
      lieu: '', duree_min: '', note: '', themes_seance: '',
    }
  }
  function openCreate(dateISO) {
    // Priorité : date explicite > jour sélectionné dans le calendrier >
    // dernier jour survolé > aujourd'hui (si dans la saison) > début de saison
    const d = dateISO
      || sel?.start
      || lastDateRef.current
      || (todayISO >= seasonStart && todayISO <= seasonEnd ? todayISO : null)
    setPanel({ mode: 'create', evt: null, form: emptyForm(d), blocs: [] })
  }
  // ── Zoom semaine ─────────────────────────────────────────────────────────────
  async function openWeekZoom(dateISO) {
    const [y, m, d] = dateISO.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    const dow = (date.getUTCDay() + 6) % 7          // 0 = lundi
    const monday = new Date(date)
    monday.setUTCDate(date.getUTCDate() - dow)

    // Matchs FFR : numéro de journée (quand la FFR met une date à la place, on
    // prend le rang du match dans la saison) et nom de notre équipe (le plus
    // fréquent), pour les cartes de match.
    const ffrTries = [...matchsFFR].filter(m => m.date_match).sort((a, b) => a.date_match.localeCompare(b.date_match))
    const compte = {}
    ffrTries.forEach(m => [m.equipe_dom, m.equipe_ext].forEach(n => { if (n) compte[n] = (compte[n] || 0) + 1 }))
    const notreNom = Object.keys(compte).sort((a, b) => compte[b] - compte[a])[0] || null
    const competition = classementFFR.find(c => c.competition === groupe?.monclubhouse_competition)?.competition_label
      || classementFFR[0]?.competition_label || null

    const days = []
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday)
      cur.setUTCDate(monday.getUTCDate() + i)
      const dISO = cur.toISOString().slice(0, 10)
      // Inclure les matchs FFR comme événements (lecture seule)
      const ffrEvs = matchsFFR
        .filter(m => m.date_match === dISO)
        .map(m => ({
          ...m, type: 'ffr_match', date: m.date_match,
          _journee: /^\d+$/.test(String(m.journee || '').trim()) ? String(m.journee).trim() : String(ffrTries.indexOf(m) + 1),
        }))
      // Un match FFR a aussi son événement « match » dans le calendrier (créé
      // automatiquement, pour le RPE) : on n'affiche que la carte FFR ce jour-là.
      const evs = evenements.filter(e => e.date === dISO && !(ffrEvs.length && e.type === 'match'))
      days.push({ date: dISO, dow: i, events: [...ffrEvs, ...evs] })
    }

    // Charger les blocs de toutes les séances de la semaine
    const blocsMap = await loadBlocsPour(
      days.flatMap(day => day.events.filter(ev => HAS_BLOCS.includes(ev.type)).map(ev => ev.id))
    )

    const startISO = monday.toISOString().slice(0, 10)
    const [sy, sm, sd] = startISO.split('-').map(Number)
    const wkNum = isoWeek(sy, sm - 1, sd)
    setWeekZoom({ startISO, wkNum, days, blocsMap, notreNom, competition })
  }

  async function navigateWeekZoom(delta) {
    if (!weekZoom) return
    const cur = new Date(weekZoom.startISO + 'T00:00:00')
    cur.setDate(cur.getDate() + delta * 7)
    const newDate = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
    await openWeekZoom(newDate)
  }
  async function openEdit(e) {
    let blocs = []
    if (HAS_BLOCS.includes(e.type) || e.type === 'collectif') blocs = await loadBlocs(e.id)
    setPanel({
      mode: 'edit', evt: e,
      form: {
        type: e.type, date: e.date, heure: e.heure || '', titre: e.titre || '',
        style: e.style || '', adversaire: e.adversaire || '', categorie: e.categorie || 'Championnat',
        domicile: e.domicile ?? true, journee: e.journee || '',
        lieu: e.lieu || '', duree_min: e.duree_min || '', note: e.note || '',
        themes_seance: e.themes_seance || '',
      },
      blocs,
    })
  }
  function closePanel() { setPanel(null) }

  // ── IA Planification ─────────────────────────────────────────────────────────
  async function sendToAI() {
    if (!aiInput.trim() || aiLoading || !groupe) return
    const userMsg = { role: 'user', content: aiInput.trim() }
    const newMessages = [...aiMessages, userMsg]
    setAiMessages(newMessages)
    setAiInput('')
    setAiLoading(true)
    const today = new Date()
    const cutoff = new Date(today); cutoff.setDate(today.getDate() - 28)
    const cutoffISO = localISO(cutoff)
    const context = {
      groupe: { nom: groupe.nom },
      phases: seasonPhases.map(p => ({ label: p.label, debut: p.date_debut, fin: p.date_fin })),
      recentEvents: evenements
        .filter(e => e.date >= cutoffISO)
        .map(e => ({ date: e.date, type: e.type, titre: e.titre, charge: e.charge })),
      currentDate: localISO(today),
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/calendar-ai`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ messages: newMessages, context }),
        }
      )
      const data = await res.json()
      if (data.ok) {
        setAiMessages(prev => [...prev, { role: 'assistant', content: data.texte }])
        if (data.evenements?.length > 0) setAiProposed(data.evenements)
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: `Erreur : ${data.error}` }])
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Erreur de connexion.' }])
    }
    setAiLoading(false)
  }

  async function confirmAI() {
    if (!aiProposed.length || !groupe) return
    setAiLoading(true)
    let created = 0
    for (const ev of aiProposed) {
      const isMatch = ev.type === 'match'
      const payload = {
        groupe_id: groupe.id, date: ev.date, type: ev.type || 'entrainement',
        heure: ev.heure || null, titre: ev.titre || null, lieu: ev.lieu || null,
        duree_min: ev.duree_min ? Number(ev.duree_min) : null,
        charge: null, note: ev.note || null,
        style: null, themes_seance: ev.themes_seance || null,
        adversaire: isMatch ? (ev.adversaire || null) : null,
        categorie: isMatch ? (ev.categorie || 'Championnat') : null,
        domicile: isMatch ? (ev.domicile ?? true) : null,
        journee: isMatch ? (ev.journee || null) : null,
      }
      const { data: newEvt, error } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
      if (error) continue
      created++
      if (ev.contact_intensite != null || ev.course_volume || ev.course_intensite) {
        await supabase.from('groupe_seance_blocs').insert([{
          evenement_id: newEvt.id, nom: 'Séance', duree: ev.duree_min ? String(ev.duree_min) : '', ordre: 1,
          contact_intensite: ev.contact_intensite ?? null,
          course_volume: ev.course_volume || null,
          course_intensite: ev.course_intensite || null,
        }])
      }
    }
    await loadSeason(true)
    setAiProposed([])
    setAiMessages(prev => [...prev, { role: 'assistant', content: `${created} séance${created > 1 ? 's' : ''} créée${created > 1 ? 's' : ''} sur le calendrier.` }])
    setAiLoading(false)
  }
  const setForm = patch => setPanel(p => ({ ...p, form: { ...p.form, ...patch } }))

  function buildPayload(f) {
    const isMatch = f.type === 'match'
    return {
      groupe_id: groupe.id, date: f.date, heure: f.heure || null, type: f.type,
      titre: f.titre || null, lieu: f.lieu || null,
      duree_min: f.duree_min ? Number(f.duree_min) : null, charge: null, note: f.note || null,
      style:          f.type === 'entrainement' ? (f.style || null) : null,
      themes_seance:  f.type === 'entrainement' ? (f.themes_seance || null) : null,
      adversaire: isMatch ? (f.adversaire || null) : null,
      categorie:  isMatch ? (f.categorie || null) : null,
      domicile:   isMatch ? !!f.domicile : null,
      journee:    isMatch ? (f.journee || null) : null,
    }
  }

  async function saveEvent() {
    if (!panel || !groupe) return
    setSaving(true)
    const payload = buildPayload(panel.form)
    let evtId = panel.evt?.id
    if (panel.mode === 'create') {
      const { data, error } = await supabase.from('groupe_evenements').insert([payload]).select('*').single()
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
      evtId = data.id
      // Affichage immédiat (optimiste)
      setEvenements(prev => [...prev, data])
    } else {
      const { error } = await supabase.from('groupe_evenements').update(payload).eq('id', evtId)
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
      setEvenements(prev => prev.map(e => e.id === evtId ? { ...e, ...payload } : e))
    }
    setSaving(false)
    closePanel()
    // Resync en fond, sans bloquer la fermeture
    loadSeason(true)
  }
  async function deleteEvent() {
    if (!panel?.evt) return
    if (!window.confirm(`Supprimer « ${clipLabel(panel.evt)} » du ${formatPopDate(panel.evt.date)} ?`)) return
    const delId = panel.evt.id
    setSaving(true)
    const { error } = await supabase.from('groupe_evenements').delete().eq('id', delId)
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setEvenements(prev => prev.filter(e => e.id !== delId))
    closePanel()
    loadSeason(true)
  }
  async function deleteEventDirect(e) {
    if (!window.confirm(`Supprimer « ${clipLabel(e)} » du ${formatPopDate(e.date)} ?`)) return
    const { error } = await supabase.from('groupe_evenements').delete().eq('id', e.id)
    if (error) { alert('Erreur : ' + error.message); return }
    setEvenements(prev => prev.filter(x => x.id !== e.id))
    loadSeason(true)
  }

  // ── Copier / coller ─────────────────────────────────────────────────────────
  async function copyEvent(e) {
    let blocs = []
    if (HAS_BLOCS.includes(e.type) || e.type === 'collectif') blocs = await loadBlocs(e.id)
    setClip({ source: e, blocs })
    setCtx(null)
  }
  async function pasteEvent(dateISO) {
    if (!clip || !groupe) return
    const s = clip.source
    const payload = {
      groupe_id: groupe.id, date: dateISO, heure: s.heure || null, type: s.type,
      titre: s.titre || null, lieu: s.lieu || null, duree_min: s.duree_min || null,
      charge: null, note: s.note || null, style: s.style || null,
      themes_seance: s.themes_seance || null,
      adversaire: s.adversaire || null, categorie: s.categorie || null,
      domicile: s.domicile, journee: s.journee || null,
    }
    const { data, error } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
    if (error) { alert('Erreur : ' + error.message); return }
    // déroulé complet (blocs, exercices, séquences de jeu) et documents joints
    await dupliquerBlocs(data.id, clip.blocs)
    await dupliquerDocuments(s.id, data.id)
    setCtx(null)
    await loadSeason(true)
  }

  // ── Blocs / exercices (édition d'une séance existante) ──────────────────────
  async function addBloc() {
    if (!panel?.evt) { alert("Enregistre d'abord la séance pour lui ajouter un déroulé."); return }
    const ordre = Math.max(0, ...(panel.blocs.map(b => b.ordre || 0))) + 1
    const { data } = await supabase.from('groupe_seance_blocs')
      .insert([{ evenement_id: panel.evt.id, nom: 'Nouveau bloc', duree: '', ordre }]).select('*').single()
    if (data) setPanel(p => ({ ...p, blocs: [...p.blocs, { ...data, exos: [] }] }))
  }
  async function updateBloc(id, patch) {
    setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === id ? { ...b, ...patch } : b) }))
    await supabase.from('groupe_seance_blocs').update(patch).eq('id', id)
  }
  async function deleteBloc(id) {
    setPanel(p => ({ ...p, blocs: p.blocs.filter(b => b.id !== id) }))
    await supabase.from('groupe_seance_blocs').delete().eq('id', id)
  }
  // ── State helpers séquences ────────────────────────────────────────────────
  function setBlocSeqs(blocId, seqsOrUpdater) {
    setPanel(p => p ? {
      ...p,
      blocs: p.blocs.map(b => b.id === blocId ? {
        ...b,
        sequences: typeof seqsOrUpdater === 'function' ? seqsOrUpdater(b.sequences || []) : seqsOrUpdater
      } : b)
    } : p)
  }
  function removeSeqFromState(blocId, seqId) {
    setPanel(p => p ? {
      ...p,
      blocs: p.blocs.map(b => b.id === blocId
        ? { ...b, sequences: (b.sequences || []).filter(s => s.id !== seqId) }
        : b)
    } : p)
  }
  function addSeqToState(blocId, seq) {
    setPanel(p => p ? {
      ...p,
      blocs: p.blocs.map(b => b.id === blocId
        ? { ...b, sequences: [...(b.sequences || []), seq].sort((a, z) => a.ordre - z.ordre) }
        : b)
    } : p)
  }
  function patchSeqInState(seqId, patch) {
    setPanel(p => p ? {
      ...p,
      blocs: p.blocs.map(b => ({
        ...b,
        sequences: (b.sequences || []).map(s => s.id === seqId ? { ...s, ...patch } : s)
      }))
    } : p)
  }
  // Ajoute une séquence juste avant un inter_bloc (insertion au milieu)
  async function addSeqBeforeInterBloc(blocId, type, interBlocId) {
    const bloc = (panel.blocs || []).find(b => b.id === blocId)
    const seqs = (bloc?.sequences || []).slice().sort((a, b) => a.ordre - b.ordre)
    const interSeq = seqs.find(s => s.id === interBlocId)
    if (!interSeq) return
    const toShift = seqs.filter(s => s.ordre >= interSeq.ordre)
    // Décaler en local immédiatement
    const shifted = seqs.map(s => toShift.find(t => t.id === s.id) ? { ...s, ordre: s.ordre + 1 } : s)
    const newSeq = { id: `tmp-${Date.now()}`, bloc_id: blocId, type, theme: type === 'jeu' ? '' : 'Récup.', duree_sec: type === 'jeu' ? 90 : 35, ordre: interSeq.ordre }
    setBlocSeqs(blocId, [...shifted, newSeq].sort((a, z) => a.ordre - z.ordre))
    // Sync DB
    await Promise.all(toShift.map(s => supabase.from('groupe_seance_sequences').update({ ordre: s.ordre + 1 }).eq('id', s.id)))
    const { data } = await supabase.from('groupe_seance_sequences').insert({
      bloc_id: blocId, type, theme: newSeq.theme, duree_sec: newSeq.duree_sec, ordre: interSeq.ordre
    }).select().single()
    if (data) {
      // Remplace l'ID temporaire par le vrai
      setPanel(p => p ? {
        ...p,
        blocs: p.blocs.map(b => b.id === blocId
          ? { ...b, sequences: (b.sequences || []).map(s => s.id === newSeq.id ? data : s) }
          : b)
      } : p)
    }
  }
  async function addExo(blocId) {
    const bloc = panel.blocs.find(b => b.id === blocId)
    const ordre = (bloc?.exos.length || 0) + 1
    const { data } = await supabase.from('groupe_seance_exercices')
      .insert([{ bloc_id: blocId, nom: 'Nouvel exercice', prescription: '', detail: '', ordre }]).select('*').single()
    if (data) setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === blocId ? { ...b, exos: [...b.exos, data] } : b) }))
  }
  async function updateExo(blocId, id, patch) {
    setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === blocId ? { ...b, exos: b.exos.map(x => x.id === id ? { ...x, ...patch } : x) } : b) }))
    await supabase.from('groupe_seance_exercices').update(patch).eq('id', id)
  }
  async function deleteExo(blocId, id) {
    setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === blocId ? { ...b, exos: b.exos.filter(x => x.id !== id) } : b) }))
    await supabase.from('groupe_seance_exercices').delete().eq('id', id)
  }

  // ── Sélection multi-jours ────────────────────────────────────────────────────
  const selMin = sel ? [sel.start, sel.end].sort()[0] : null
  const selMax = sel ? [sel.start, sel.end].sort()[1] : null
  function inSel(dISO) { return !!selMin && dISO >= selMin && dISO <= selMax }

  function onDayMouseDown(e, dISO) {
    if (e.button !== 0 || dragEvt) return
    e.preventDefault()
    lastDateRef.current = dISO
    lastEvtRef.current = null   // on clique sur la grille → on désélectionne tout évènement ciblé
    setSel({ start: dISO, end: dISO })
    setSelDrag(true)
    setSelMenu(null); setPop(null); setCtx(null)
  }
  function onDayMouseEnter(dISO) {
    lastDateRef.current = dISO
    if (!selDrag) return
    setSel(prev => prev ? { ...prev, end: dISO } : null)
  }

  // Supprime tous les évènements compris dans la sélection en cours
  async function deleteEventsInSel() {
    const s = selRef.current
    if (!s || !groupe) return
    const [start, end] = [s.start, s.end].sort()
    // Jamais les évènements hérités d'un groupe parent — sinon une sélection
    // multiple depuis un sous-groupe supprimerait l'entraînement de tout le monde.
    const toDelete = evenements.filter(ev => ev.date >= start && ev.date <= end && !ev._inherited)
    if (!toDelete.length) return
    if (!window.confirm(`Supprimer ${toDelete.length} évènement${toDelete.length > 1 ? 's' : ''} (du ${formatPopDate(start)} au ${formatPopDate(end)}) ?`)) return
    const { error } = await supabase.from('groupe_evenements').delete().in('id', toDelete.map(ev => ev.id))
    if (error) { alert('Erreur : ' + error.message); return }
    setSel(null)
    await loadSeason(true)
  }

  async function copyPeriod() {
    if (!sel || !groupe) return
    const [s, e] = [sel.start, sel.end].sort()
    const rangeEvts = evenements.filter(ev => ev.date >= s && ev.date <= e)
    const blocsMap = await loadBlocsPour(rangeEvts.filter(ev => HAS_BLOCS.includes(ev.type)).map(ev => ev.id))
    setPeriodClip({ start: s, end: e, events: rangeEvts, blocsMap })
    setSelMenu(null); setSel(null)
  }

  async function pastePeriod(newStartISO) {
    if (!periodClip || !groupe) return
    const origStart = new Date(periodClip.start + 'T00:00:00')
    const newStart  = new Date(newStartISO + 'T00:00:00')
    const offsetDays = Math.round((newStart - origStart) / 86400000)
    for (const ev of periodClip.events) {
      const nd = new Date(ev.date + 'T00:00:00')
      nd.setDate(nd.getDate() + offsetDays)
      const newDate = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`
      const payload = {
        groupe_id: groupe.id, date: newDate, heure: ev.heure || null, type: ev.type,
        titre: ev.titre || null, lieu: ev.lieu || null, duree_min: ev.duree_min || null,
        charge: ev.charge || null, note: ev.note || null, style: ev.style || null,
        themes_seance: ev.themes_seance || null,
        adversaire: ev.adversaire || null, categorie: ev.categorie || null,
        domicile: ev.domicile, journee: ev.journee || null,
      }
      const { data: nev } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
      if (nev) {
        await dupliquerBlocs(nev.id, periodClip.blocsMap[ev.id])
        await dupliquerDocuments(ev.id, nev.id)
      }
    }
    await loadSeason(true)
    setPop(null); setCtx(null)
  }

  async function addPeriodFromSel() {
    if (!sel || !groupe) return
    const [s, e] = [sel.start, sel.end].sort()
    const label = selForm.label.trim() || (selForm.type === 'vacances' ? 'Vacances' : 'Phase')
    await supabase.from('groupe_phases').insert([{
      groupe_id: groupe.id, type: selForm.type, label,
      couleur: selForm.couleur, date_debut: s, date_fin: e,
      ordre: phases.length + 1,
    }])
    await loadSeason(true)
    setSelMenu(null); setSel(null)
  }

  // ── Glisser-déposer : déplacer un évènement vers un autre jour ───────────────
  async function moveEvent(evt, newDateISO) {
    if (!evt || evt.date === newDateISO) return
    // maj optimiste
    setEvenements(prev => prev.map(e => e.id === evt.id ? { ...e, date: newDateISO } : e))
    const { error } = await supabase.from('groupe_evenements').update({ date: newDateISO }).eq('id', evt.id)
    if (error) { alert('Erreur : ' + error.message); loadSeason(true) }
  }

  // ── Menu contextuel sur une séance (clic droit) ─────────────────────────────
  function openCtx(e, dateISO, evt) {
    e.preventDefault()
    e.stopPropagation()
    lastDateRef.current = dateISO
    if (evt) lastEvtRef.current = evt
    setPop(null)
    setCtx({ x: e.clientX, y: e.clientY, dateISO, evt: evt || null })
  }

  // ── Bulle de création sur un jour (double-clic ou clic droit) ────────────────
  function openPop(e, dateISO) {
    e.preventDefault()
    e.stopPropagation()
    setCtx(null)
    const PW = 272, PH = 330
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - PW - 12))
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - PH - 12))
    setPop({ x, y, form: emptyForm(dateISO) })
  }
  const setPopForm = patch => setPop(p => ({ ...p, form: { ...p.form, ...patch } }))

  async function quickSave(openDetails) {
    if (!pop || !groupe) return
    setSaving(true)
    const { data, error } = await supabase.from('groupe_evenements').insert([buildPayload(pop.form)]).select('*').single()
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setPop(null)
    // Affichage immédiat (optimiste), puis resync en fond sans bloquer l'écran
    if (data) setEvenements(prev => [...prev, data])
    loadSeason(true)
    if (openDetails && data) openEdit(data)
  }

  // ── Actions de la grille, regroupées dans un objet stable ───────────────────
  // (les cases sont mémoïsées : elles ne doivent pas changer à chaque rendu)
  const act = useRef({})
  act.current = {
    weekZoom: dISO => openWeekZoom(dISO),
    dayMouseDown: onDayMouseDown,
    dayMouseEnter: onDayMouseEnter,
    dayDoubleClick: (e, dISO) => { setSel(null); if (!selMenu) openPop(e, dISO) },
    dayContext: (e, dISO) => {
      e.preventDefault(); e.stopPropagation()
      if (selDrag) return
      setSel(null)  // efface la sélection avant d'ouvrir la bulle
      lastDateRef.current = dISO
      openPop(e, dISO)
    },
    evtContext: (ev, e) => openCtx(ev, e.date, e),
    evtClick: async e => {
      if (e._inherited) { const blocs = await loadBlocs(e.id); setDayPreview({ evt: e, blocs }) }
      else { lastEvtRef.current = e; openEdit(e) }
    },
    evtMouseDown: (ev, e) => { ev.stopPropagation(); lastEvtRef.current = e; lastDateRef.current = e.date },
    dragStart: e => setDragEvt(e),
    dragEnd: () => { setDragEvt(null); setDragOver(null) },
    dragOver: dISO => setDragOver(prev => prev === dISO ? prev : dISO),
    drop: dISO => { if (dragEvtRef.current) moveEvent(dragEvtRef.current, dISO); setDragEvt(null); setDragOver(null) },
  }
  const dragEvtRef = useRef(null)
  dragEvtRef.current = dragEvt
  const h = useMemo(() => {
    const out = {}
    for (const k of ['weekZoom', 'dayMouseDown', 'dayMouseEnter', 'dayDoubleClick', 'dayContext', 'evtContext', 'evtClick', 'evtMouseDown', 'dragStart', 'dragEnd', 'dragOver', 'drop']) {
      out[k] = (...args) => act.current[k](...args)
    }
    return out
  }, [])

  // Aller au mois en cours (à l'ouverture et via le bouton « Aujourd'hui »)
  const gridRef = useRef(null)
  function scrollToToday(smooth = false) {
    const wrap = gridRef.current
    if (!wrap) return
    const col = wrap.querySelector(`[data-mcol="${today.getFullYear()}-${today.getMonth()}"]`)
    if (col) wrap.scrollTo({ left: Math.max(0, col.offsetLeft), behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => { if (!loading && calTab === 'calendrier') scrollToToday() }, [loading, groupe?.id, startYear, calTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const seasonOpts = [seasonStartYear() - 1, seasonStartYear(), seasonStartYear() + 1]
  const pageStyle = embedded ? S.pageEmbed : S.page
  const todayISO = localISO(today)

  // Handler clavier mis à jour à chaque render (lu via kbRef)
  kbRef.current = (e) => {
    const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform)
    const isCmd = isMac ? e.metaKey : e.ctrlKey
    const tag = (e.target?.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return
    if (panel) return // un panneau d'édition est ouvert (séance, calculateur d'intensité…) → pas de raccourcis clavier calendrier

    // Delete / Backspace → supprimer l'évènement ciblé OU les évènements de la sélection
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const evt = lastEvtRef.current
      if (evt) { deleteEventDirect(evt); lastEvtRef.current = null }
      else if (selRef.current) { deleteEventsInSel() }
      return
    }
    // Cmd+C → copier
    if (isCmd && e.key === 'c') {
      const evt = lastEvtRef.current
      if (evt) { copyEvent(evt); e.preventDefault() }
      else if (selRef.current) { copyPeriod(); e.preventDefault() }
    }
    // Cmd+V → coller
    if (isCmd && e.key === 'v') {
      const date = lastDateRef.current
      if (!date) return
      if (clip) { pasteEvent(date); e.preventDefault() }
      else if (periodClip) { pastePeriod(date); e.preventDefault() }
    }
  }

  const btnColor = isLight(groupColor) ? '#1a1a1a' : '#ffffff'

  return (
    <div style={pageStyle}>
      {/* ── Bande identité club ── */}
      {groupe && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: groupColor,
          borderRadius: 10,
          padding: '8px 14px',
          marginBottom: 12,
        }}>
          {groupe.couleur_secondaire && (
            <span style={{ width: 12, height: 12, borderRadius: 3, background: groupe.couleur_secondaire, flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.3)' }} />
          )}
          <span style={{ fontWeight: 900, fontSize: '0.85rem', color: btnColor, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {groupe.nom}
          </span>
          <span style={{ fontSize: '0.72rem', color: btnColor, opacity: 0.6, marginLeft: 2 }}>
            · Saison {startYear} / {startYear + 1}
          </span>
        </div>
      )}

      {/* ── Onglets Calendrier / Compétition — Effectif et Groupes de niveau
           vivent maintenant sur le tableau de bord du groupe (embedded),
           mais restent ici sur la page calendrier autonome. ── */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[
          ['calendrier','Calendrier'],
          ...(embedded ? [] : [['effectif','Effectif'], ['niveau','Groupes de niveau']]),
          ...(groupe?.monclubhouse_url ? [['competition','Compétition']] : []),
        ].map(([v,l]) => (
          <button key={v} onClick={() => setCalTab(v)}
            style={{ padding:'7px 18px', borderRadius:20, border:'none', fontWeight:700, fontSize:'0.8rem',
              background: calTab===v ? groupColor : '#e5e7eb',
              color: calTab===v ? (isLight(groupColor)?'#1a1a1a':'#fff') : '#6b7280',
              cursor:'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Barre d'actions ── */}
      <div style={S.toolbar}>
        {!embedded && <h1 style={{ ...S.h1, border: `1.5px solid ${groupColor}`, paddingLeft: 10 }}>Calendrier saison</h1>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: embedded ? 0 : 'auto' }}>
          {!groupeId && (
            <div style={{ ...S.groupSel, borderColor: `color-mix(in srgb, ${groupColor} 40%, #e6e8ec)` }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: groupColor, flexShrink: 0 }} />
              <select value={groupe?.id || ''} onChange={e => setGroupe(groupes.find(g => g.id === e.target.value))} style={S.select}>
                {groupes.length === 0 && <option>Aucun groupe</option>}
                {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
              </select>
            </div>
          )}
          <select value={startYear} onChange={e => setStartYear(Number(e.target.value))} style={S.select}>
            {seasonOpts.map(y => <option key={y} value={y}>Saison {y} / {y + 1}</option>)}
          </select>
          <button style={S.btn} onClick={() => { if (startYear !== seasonStartYear()) setStartYear(seasonStartYear()); else scrollToToday(true) }}>
            Aujourd'hui
          </button>
          <button style={{ ...S.btnDark, background: groupColor, borderColor: groupColor, color: btnColor }}
            onClick={() => openCreate()}>
            <span style={{ fontWeight: 900 }}>+</span> Ajouter
          </button>
          <button style={S.btn} onClick={() => setAiOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 5, verticalAlign: 'middle' }}>
              <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5.5-4 6.7V18H9v-2.3C6.5 14.5 5 12 5 9a7 7 0 0 1 7-7z"/>
              <line x1="9" y1="21" x2="15" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/>
            </svg>
            IA Planif.
          </button>
        </div>
      </div>

      {calTab === 'effectif' && <EffectifView groupeId={groupe?.id} groupColor={groupColor} />}

      {calTab === 'niveau' && <GroupesNiveauView groupeId={groupe?.id} groupColor={groupColor} />}

      {calTab === 'competition' && (
        <CompetitionTab
          matchs={matchsFFR}
          classement={classementFFR}
          groupColor={groupColor}
          groupeNom={groupe?.nom || ''}
          syncing={syncingFFR}
          lastSync={lastSyncFFR}
          onSync={syncFFR}
        />
      )}

      {calTab === 'calendrier' && (<>
      {/* ── Résumé + légende ── */}
      <div style={{ ...S.summary, borderBottom: `2px solid color-mix(in srgb, ${groupColor} 30%, #e6e8ec)`, paddingBottom: 12 }}>
        <Stat v={nbMatchs} l="Matchs" color={groupColor} />
        <span style={S.sep} />
        <Stat v={nbEntrainements} l="Entraînements" color={groupColor} />
        <span style={S.sep} />
        <Stat v={evenements.length} l="Évènements" color={groupColor} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 13, flexWrap: 'wrap' }}>
          {MATCH_CATEGORIES.map(cat => (
            <Leg key={cat} c={matchCatColor(cat, groupColor)} t={cat} />
          ))}
          <span style={S.sep} />
          <Leg c={groupColor} t="Entraînement" />
          <Leg c={TYPES.muscu.color} t="Musculation" />
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#9aa1ac', fontSize: '0.85rem', padding: '2rem' }}>Chargement…</p>
      ) : !groupe ? (
        <p style={{ color: '#9aa1ac', fontSize: '0.85rem', padding: '2rem' }}>Crée d'abord un groupe pour planifier sa saison.</p>
      ) : (
        <>
          {/* ── Ruban des phases ── */}
          <div style={S.phrow}>
            {ribbon.map((r, i) => (
              <div key={i} style={{ ...S.phseg, background: r.couleur, flex: r.span, minWidth: r.span * 108 }}>{r.label}</div>
            ))}
          </div>

          {/* ── Grille saison ── */}
          <div style={S.gridwrap} ref={gridRef}>
            <div style={S.grid}>
              {months.map(M => {
                const ph = phaseOfMonth(M.y, M.m)
                return (
                  <div key={`${M.y}-${M.m}`} data-mcol={`${M.y}-${M.m}`} style={S.mcol}>
                    <div style={{ ...S.mch, borderTop: `3px solid ${ph?.couleur || groupColor}`, background: `color-mix(in srgb, ${groupColor} 4%, #fbfcfd)` }}>
                      <div style={{ ...S.mm, color: `color-mix(in srgb, ${groupColor} 60%, #15181d)` }}>{M.label}</div>
                      <div style={S.my}>{M.y}</div>
                    </div>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                      if (d > M.days) return <div key={d} style={S.blank}><div style={S.dnum} /><div style={S.ddow} /><div style={{ flex: 1 }} /></div>
                      const dow = new Date(M.y, M.m, d).getDay()
                      const vac = vacInfo(M.y, M.m, d)
                      const dISO = iso(M.y, M.m, d)
                      const weekStart = dow === 1 || d === 1   // lundi, ou 1er jour visible du mois
                      const evs = evByDay[ymd(M.y, M.m, d)] || EMPTY_LIST
                      return (
                        <DayCell key={d}
                          y={M.y} m={M.m} d={d} dISO={dISO} dow={dow}
                          evs={evs} ffr={ffrByDay[ymd(M.y, M.m, d)] || EMPTY_LIST}
                          groupColor={groupColor} h={h}
                          vacIn={vac.in} vacStart={!!vac.start} vacLabel={vac.label || ''}
                          isToday={ymd(M.y, M.m, d) === todayKey} isPastDay={dISO < todayISO}
                          weekStart={weekStart} wkNum={weekStart ? isoWeek(M.y, M.m, d) : null}
                          selected={inSel(dISO)} dropOver={dragOver === dISO}
                          dragActive={!!dragEvt} draggingId={dragEvt && evs.some(e => e.id === dragEvt.id) ? dragEvt.id : null}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#9aa1ac', marginTop: 8 }}>
            Glisser sur plusieurs jours pour les sélectionner · double-clic pour ajouter · glisser une séance pour la déplacer · Suppr = effacer · ⌘C/⌘V = copier/coller
            {clip && <span style={{ color: groupColor, fontWeight: 700 }}> · « {clipLabel(clip.source)} » copié</span>}
            {periodClip && <span style={{ color: '#059669', fontWeight: 700 }}> · Période copiée ({periodClip.events.length} évèn.) — clic droit sur un jour pour coller</span>}
          </p>
        </>
      )}
      </>)}

      {/* ── Menu contextuel (clic droit sur séance) ── */}
      {ctx && ctx.evt && (
        <div style={{ ...S.ctxMenu, left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          <button style={S.ctxItem} onClick={() => { openEdit(ctx.evt); setCtx(null) }}>Modifier</button>
          <button style={S.ctxItem} onClick={() => copyEvent(ctx.evt)}>Copier</button>
          {clip && <button style={S.ctxItem} onClick={() => pasteEvent(ctx.dateISO)}>Coller ici</button>}
          <div style={S.ctxSep} />
          <button style={{ ...S.ctxItem, color: '#e11d48' }} onClick={() => { deleteEventDirect(ctx.evt); setCtx(null) }}>Supprimer</button>
        </div>
      )}

      {/* ── Bulle de création sur un jour ── */}
      {pop && (
        <>
          <div style={S.popScrim} onClick={() => setPop(null)} onContextMenu={e => { e.preventDefault(); setPop(null) }} />
          <div style={{ ...S.popover, left: pop.x, top: pop.y }} onClick={e => e.stopPropagation()}>
            <div style={S.popHead}>
              <span style={S.popDate}>{formatPopDate(pop.form.date)}</span>
              <span role="button" tabIndex={0} style={{ color: '#9aa1ac', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1 }} onClick={() => setPop(null)}>×</span>
            </div>

            {/* choix du type */}
            <div style={S.popTypes}>
              {CREATE_TYPES.map(k => {
                const t = TYPES[k]
                const on = pop.form.type === k
                return (
                  <button key={k} onClick={() => setPopForm({ type: k })}
                    style={{ ...S.popType, ...(on ? { borderColor: '#333333', background: '#333333', color: '#fff' } : null) }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: k === 'match' ? groupColor : (t.color || '#cbd1d9') }} />
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* champs compacts selon le type */}
            {pop.form.type === 'match' && (
              <>
                <input value={pop.form.adversaire} onChange={e => setPopForm({ adversaire: e.target.value })} placeholder="Adversaire" style={S.popInput} />
                <div style={S.popCats}>
                  {MATCH_CATEGORIES.map(c => (
                    <button key={c} onClick={() => setPopForm({ categorie: c })}
                      style={{ ...S.popCat, ...(pop.form.categorie === c ? { borderColor: '#333333', background: '#f2f3f5', fontWeight: 700 } : null) }}>{c}</button>
                  ))}
                </div>
              </>
            )}
            {pop.form.type === 'entrainement' && (
              <input value={pop.form.style} onChange={e => setPopForm({ style: e.target.value })} placeholder="Style (ex. Vitesse, Collectif…)" style={S.popInput} />
            )}
            {pop.form.type === 'muscu' && (
              <input value={pop.form.titre} onChange={e => setPopForm({ titre: e.target.value })} placeholder="Titre (ex. Force max)" style={S.popInput} />
            )}

            <div style={{ display: 'flex', gap: 7 }}>
              <input type="time" value={pop.form.heure} onChange={e => setPopForm({ heure: e.target.value })} style={{ ...S.popInput, flex: 1, marginBottom: 0 }} />
              <input type="number" value={pop.form.duree_min} onChange={e => setPopForm({ duree_min: e.target.value })} placeholder="min" style={{ ...S.popInput, width: 64, marginBottom: 0 }} />
            </div>

            {clip && (
              <button style={S.popPaste} onClick={() => { pasteEvent(pop.form.date); setPop(null) }}>
                Coller « {clipLabel(clip.source)} »
              </button>
            )}
            {periodClip && (
              <button style={{ ...S.popPaste, color: '#059669', borderColor: '#a7f3d0' }} onClick={() => { pastePeriod(pop.form.date); setPop(null) }}>
                Coller la période ({periodClip.events.length} évèn.)
              </button>
            )}

            <div style={S.popActions}>
              <button style={S.popGhost} onClick={() => quickSave(true)} disabled={saving}>Détails…</button>
              <button style={S.popCreate} onClick={() => quickSave(false)} disabled={saving}>
                <span style={{ color: '#e4f816' }}>{saving ? '…' : 'Créer'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Panneau ── */}
      {/* ── Zoom semaine ── */}
      {weekZoom && (
        <WeekZoomModal
          weekZoom={weekZoom}
          groupe={groupe}
          onClose={() => setWeekZoom(null)}
          onNavigate={navigateWeekZoom}
        />
      )}

      {/* ── Panneau IA Planification ── */}
      {aiOpen && (
        <>
          <div style={S.scrim} onClick={() => setAiOpen(false)} />
          <div style={{
            position: 'fixed', inset: 0, zIndex: 61, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
          <div style={{
            pointerEvents: 'all',
            width: 'min(680px, 94vw)', height: 'min(600px, 90vh)',
            background: '#f5f6f8', borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={S.phead}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#15181d' }}>Planification IA</span>
                <button onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#9aa1ac', lineHeight: 1 }}>×</button>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#9aa1ac', margin: '4px 0 0' }}>
                Décris les séances à créer — dates, charge, thèmes, intensité
              </p>
            </div>

            {/* Historique du chat */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aiMessages.length === 0 && (
                <p style={{ color: '#9aa1ac', fontSize: '0.76rem', fontStyle: 'italic', lineHeight: 1.5 }}>
                  Ex : "Mardi 24 juin entraînement charge haute, contact intense et gros volume de course. Vendredi séance récup légère."
                </p>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? '#1a1a1a' : '#f0f2f5',
                  color: m.role === 'user' ? '#e4f816' : '#15181d',
                  borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  padding: '8px 12px', fontSize: '0.78rem', lineHeight: 1.5,
                }}>
                  {m.content}
                </div>
              ))}
              {aiLoading && (
                <div style={{ alignSelf: 'flex-start', background: '#f0f2f5', borderRadius: '12px 12px 12px 4px', padding: '8px 14px', fontSize: '0.78rem', color: '#9aa1ac', letterSpacing: '0.1em' }}>
                  · · ·
                </div>
              )}
            </div>

            {/* Aperçu des séances proposées */}
            {aiProposed.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f2f5', background: '#fafbfc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '.08em' }}>{aiProposed.length} séance{aiProposed.length > 1 ? 's' : ''} proposée{aiProposed.length > 1 ? 's' : ''}</span>
                  <button onClick={() => setAiProposed([])} style={{ background: 'none', border: 'none', fontSize: '0.7rem', color: '#9aa1ac', cursor: 'pointer' }}>Annuler</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto', marginBottom: 8 }}>
                  {aiProposed.map((ev, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: '0.73rem', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#15181d' }}>{ev.date}</span>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: TYPES[ev.type]?.color || '#9aa1ac', flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: TYPES[ev.type]?.color || '#6b7280' }}>{TYPES[ev.type]?.label || ev.type}</span>
                      {ev.titre && <span style={{ color: '#6b7280' }}>{ev.titre}</span>}
                      {ev.charge && <span style={{ color: '#9aa1ac', fontSize: '0.68rem' }}>{ev.charge}</span>}
                    </div>
                  ))}
                </div>
                <button onClick={confirmAI} disabled={aiLoading} style={{ width: '100%', background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 8, padding: '9px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}>
                  Créer {aiProposed.length} séance{aiProposed.length > 1 ? 's' : ''} sur le calendrier
                </button>
              </div>
            )}

            {/* Saisie */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid #e6e8ec', background: '#fff', display: 'flex', gap: 8 }}>
              <input
                value={aiInput} onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendToAI()}
                placeholder="Décris tes séances…"
                disabled={aiLoading}
                style={{ flex: 1, border: '1.5px solid #e0e3e8', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem', fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={sendToAI} disabled={aiLoading || !aiInput.trim()}
                style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', opacity: aiLoading || !aiInput.trim() ? 0.5 : 1 }}>
                Envoyer
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {dayPreview && (
        <InheritedEventPreview evt={dayPreview.evt} blocs={dayPreview.blocs} onClose={() => setDayPreview(null)} />
      )}

      {panel && (
        <SeanceModal
          panel={panel}
          groupColor={groupColor}
          groupeId={groupe?.id}
          couleurSecondaire={groupe?.couleur_secondaire}
          closePanel={closePanel}
          setForm={setForm}
          addBloc={addBloc}
          updateBloc={updateBloc}
          deleteBloc={deleteBloc}
          addExo={addExo}
          updateExo={updateExo}
          deleteExo={deleteExo}
          saveEvent={saveEvent}
          deleteEvent={deleteEvent}
          saving={saving}
          removeSeq={removeSeqFromState}
          addSeqToState={addSeqToState}
          patchSeqInState={patchSeqInState}
          setBlocSeqs={setBlocSeqs}
          addSeqBeforeInterBloc={addSeqBeforeInterBloc}
          reloadBlocs={async () => {
            if (!panel?.evt) return
            const blocs = await loadBlocs(panel.evt.id)
            if (blocs && blocs.length >= 0) setPanel(p => p ? { ...p, blocs } : p)
          }}
        />
      )}
    </div>
  )
}
