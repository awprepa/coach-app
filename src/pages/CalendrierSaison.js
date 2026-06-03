import React, { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase'

/* ─────────────────────────────────────────────────────────────────────────────
   Calendrier saison (préparateur physique) — vue mois × jours d'un groupe.
   - Matchs en pavés couleur-du-groupe (repères de la saison)
   - Types de création : Entraînement (+ style libre) · Match (+ catégorie) · Muscu
   - Clic sur une séance → panneau détail (édition + déroulé blocs/exercices)
   - Double-clic sur un jour → création
   - Clic droit sur un jour ou une séance → menu (ajouter / copier / coller / suppr.)
   Utilisable :
     • en page autonome (route)            → <CalendrierSaison />
     • intégré dans une fiche groupe        → <CalendrierSaison groupeId={id} embedded />
   ───────────────────────────────────────────────────────────────────────────── */

const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S']            // index getDay()
const MOIS_LABEL = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

// Types d'évènement.
//  - les 3 premiers sont proposés à la création (CREATE_TYPES)
//  - les suivants restent gérés pour l'affichage des données existantes (legacy)
const TYPES = {
  match:        { label: 'Match',        color: null,      solid: 'group' }, // couleur du groupe
  entrainement: { label: 'Entraînement', color: '#6b94a3' },
  muscu:        { label: 'Musculation',  color: '#b08769' },
  // legacy (affichage seulement) :
  collectif:    { label: 'Collectif',    color: '#98a2ad', neutral: true },
  vitesse:      { label: 'Vitesse',      color: '#6b94a3' },
  prevention:   { label: 'Prévention',   color: '#8c7ea6', short: 'Activ.' },
  recup:        { label: 'Récup',        color: null,      blank: true },
  test:         { label: 'Tests',        color: '#454c57', dark: true },
  autre:        { label: 'Autre',        color: '#9aa1ac' },
}
const CREATE_TYPES = ['entrainement', 'match', 'muscu']
const MATCH_CATEGORIES = ['Amical', 'Championnat', 'Coupe', 'Phases finales']
// Couleur de fond par catégorie de match (null = couleur du groupe)
const MATCH_CAT_COLORS = {
  Amical:           '#64748b',  // gris ardoise — match amical, faible enjeu
  Championnat:      null,        // couleur du groupe
  Coupe:            '#d97706',  // ambre — coupe
  'Phases finales': '#dc2626',  // rouge — playoffs / finale
}
function matchCatColor(categorie, groupColor) {
  const c = MATCH_CAT_COLORS[categorie]
  return (c === undefined || c === null) ? groupColor : c
}
// types qui ont un déroulé en blocs/exercices
const HAS_BLOCS = ['entrainement', 'muscu', 'vitesse', 'prevention', 'recup', 'autre']

const ymd = (y, m, d) => `${y}-${m}-${d}`                  // clé interne (m 0-based)
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Numéro de semaine ISO 8601 (semaine commençant le lundi, S1 = semaine du 1er jeudi de l'année)
function isoWeek(y, m, d) {
  const date = new Date(Date.UTC(y, m, d))
  const day = (date.getUTCDay() + 6) % 7        // 0 = lundi … 6 = dimanche
  date.setUTCDate(date.getUTCDate() - day + 3)  // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const fday = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3)
  return 1 + Math.round((date - firstThursday) / (7 * 86400000))
}

// 12 mois Juillet(start) → Juin(start+1)
function buildMonths(startYear) {
  const out = []
  for (let i = 0; i < 12; i++) {
    const m = (6 + i) % 12
    const y = startYear + (6 + i >= 12 ? 1 : 0)
    out.push({ y, m, label: MOIS_LABEL[m], days: new Date(y, m + 1, 0).getDate() })
  }
  return out
}
function seasonStartYear(date = new Date()) {
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
}

export default function CalendrierSaison({ groupeId = null, embedded = false }) {
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

  // Menu contextuel sur une séance (clic droit) : { x, y, dateISO, evt }
  const [ctx, setCtx] = useState(null)
  // Bulle de création sur un jour : { x, y, form }
  const [pop, setPop] = useState(null)
  // Presse-papier : { source, blocs }  (source = évènement copié)
  const [clip, setClip] = useState(null)
  const [calTab, setCalTab] = useState('calendrier') // 'calendrier' | 'effectif'

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
  const selRef     = useRef(null)
  selRef.current   = sel
  const lastDateRef = useRef(null) // dernier jour survolé/cliqué (pour coller via clavier)
  const lastEvtRef  = useRef(null) // dernier évènement focusé (pour delete/copier via clavier)
  // ref stable pour le handler clavier (évite re-register à chaque render)
  const kbRef = useRef(null)

  const groupColor = groupe?.couleur || '#2f6f76'
  const months = buildMonths(startYear)
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
  const loadSeason = useCallback(async (silent = false) => {
    if (!groupe) return
    const scrollY = window.scrollY
    if (!silent) setLoading(true)
    const [{ data: evs }, { data: phs }] = await Promise.all([
      supabase.from('groupe_evenements').select('*')
        .eq('groupe_id', groupe.id).gte('date', seasonStart).lte('date', seasonEnd).order('date'),
      supabase.from('groupe_phases').select('*')
        .eq('groupe_id', groupe.id).order('ordre'),
    ])
    setEvenements(evs || [])
    setPhases(phs || [])
    if (!silent) setLoading(false)
    else requestAnimationFrame(() => window.scrollTo(0, scrollY))
  }, [groupe, seasonStart, seasonEnd])

  useEffect(() => { loadSeason() }, [loadSeason])

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

  // ── Index par jour ──────────────────────────────────────────────────────────
  const evByDay = {}
  for (const e of evenements) {
    const [Y, M, D] = e.date.split('-').map(Number)
    const k = ymd(Y, M - 1, D)
    ;(evByDay[k] ||= []).push(e)
  }
  const matchsList = evenements.filter(e => e.type === 'match')
  const today = new Date(); const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate())

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
      lieu: '', duree_min: '', charge: '', note: '',
    }
  }
  function openCreate(dateISO) {
    setPanel({ mode: 'create', evt: null, form: emptyForm(dateISO), blocs: [] })
  }
  async function loadBlocs(evtId) {
    const { data } = await supabase.from('groupe_seance_blocs')
      .select('*, groupe_seance_exercices(*), groupe_seance_sequences(*)')
      .eq('evenement_id', evtId).order('ordre')
    return (data || []).map(b => ({
      ...b,
      exos: (b.groupe_seance_exercices || []).sort((a, z) => a.ordre - z.ordre),
      sequences: (b.groupe_seance_sequences || []).sort((a, z) => a.ordre - z.ordre),
    }))
  }

  // ── Zoom semaine ─────────────────────────────────────────────────────────────
  async function openWeekZoom(dateISO) {
    const [y, m, d] = dateISO.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    const dow = (date.getUTCDay() + 6) % 7          // 0 = lundi
    const monday = new Date(date)
    monday.setUTCDate(date.getUTCDate() - dow)

    const days = []
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday)
      cur.setUTCDate(monday.getUTCDate() + i)
      const dISO = cur.toISOString().slice(0, 10)
      const evs = evenements.filter(e => e.date === dISO)
      days.push({ date: dISO, dow: i, events: evs })
    }

    // Charger les blocs de toutes les séances de la semaine
    const blocsMap = {}
    for (const day of days) {
      for (const ev of day.events) {
        if (HAS_BLOCS.includes(ev.type)) blocsMap[ev.id] = await loadBlocs(ev.id)
      }
    }

    const startISO = monday.toISOString().slice(0, 10)
    const [sy, sm, sd] = startISO.split('-').map(Number)
    const wkNum = isoWeek(sy, sm - 1, sd)
    setWeekZoom({ startISO, wkNum, days, blocsMap })
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
        lieu: e.lieu || '', duree_min: e.duree_min || '', charge: e.charge || '', note: e.note || '',
      },
      blocs,
    })
  }
  function closePanel() { setPanel(null) }
  const setForm = patch => setPanel(p => ({ ...p, form: { ...p.form, ...patch } }))

  function buildPayload(f) {
    const isMatch = f.type === 'match'
    return {
      groupe_id: groupe.id, date: f.date, heure: f.heure || null, type: f.type,
      titre: f.titre || null, lieu: f.lieu || null,
      duree_min: f.duree_min ? Number(f.duree_min) : null, charge: f.charge || null, note: f.note || null,
      style:      f.type === 'entrainement' ? (f.style || null) : null,
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
      const { data, error } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
      evtId = data.id
    } else {
      const { error } = await supabase.from('groupe_evenements').update(payload).eq('id', evtId)
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    await loadSeason(true)
    closePanel()
  }
  async function deleteEvent() {
    if (!panel?.evt) return
    setSaving(true)
    await supabase.from('groupe_evenements').delete().eq('id', panel.evt.id)
    setSaving(false)
    await loadSeason(true)
    closePanel()
  }
  async function deleteEventDirect(e) {
    await supabase.from('groupe_evenements').delete().eq('id', e.id)
    await loadSeason(true)
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
      charge: s.charge || null, note: s.note || null, style: s.style || null,
      adversaire: s.adversaire || null, categorie: s.categorie || null,
      domicile: s.domicile, journee: s.journee || null,
    }
    const { data, error } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
    if (error) { alert('Erreur : ' + error.message); return }
    // dupliquer blocs + exercices
    for (const b of clip.blocs) {
      const { data: nb } = await supabase.from('groupe_seance_blocs')
        .insert([{ evenement_id: data.id, nom: b.nom, duree: b.duree || '', ordre: b.ordre }]).select('id').single()
      if (nb && b.exos?.length) {
        await supabase.from('groupe_seance_exercices').insert(
          b.exos.map(x => ({ bloc_id: nb.id, nom: x.nom, prescription: x.prescription || '', detail: x.detail || '', ordre: x.ordre }))
        )
      }
    }
    setCtx(null)
    await loadSeason(true)
  }

  // ── Blocs / exercices (édition d'une séance existante) ──────────────────────
  async function addBloc() {
    if (!panel?.evt) { alert("Enregistre d'abord la séance pour lui ajouter un déroulé."); return }
    const ordre = (panel.blocs.length || 0) + 1
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
    const toDelete = evenements.filter(ev => ev.date >= start && ev.date <= end)
    if (!toDelete.length) return
    for (const ev of toDelete) {
      await supabase.from('groupe_evenements').delete().eq('id', ev.id)
    }
    setSel(null)
    await loadSeason(true)
  }

  async function copyPeriod() {
    if (!sel || !groupe) return
    const [s, e] = [sel.start, sel.end].sort()
    const rangeEvts = evenements.filter(ev => ev.date >= s && ev.date <= e)
    const blocsMap = {}
    for (const ev of rangeEvts) {
      if (HAS_BLOCS.includes(ev.type)) blocsMap[ev.id] = await loadBlocs(ev.id)
    }
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
        adversaire: ev.adversaire || null, categorie: ev.categorie || null,
        domicile: ev.domicile, journee: ev.journee || null,
      }
      const { data: nev } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
      if (nev && periodClip.blocsMap[ev.id]) {
        for (const b of periodClip.blocsMap[ev.id]) {
          const { data: nb } = await supabase.from('groupe_seance_blocs')
            .insert([{ evenement_id: nev.id, nom: b.nom, duree: b.duree || '', ordre: b.ordre }]).select('id').single()
          if (nb && b.exos?.length) {
            await supabase.from('groupe_seance_exercices').insert(
              b.exos.map(x => ({ bloc_id: nb.id, nom: x.nom, prescription: x.prescription || '', detail: x.detail || '', ordre: x.ordre }))
            )
          }
        }
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
    await loadSeason(true)
    if (openDetails && data) openEdit(data)
  }

  // ── Rendu cellule jour ────────────────────────────────────────────────────────
  function renderCell(y, m, d) {
    const evs = evByDay[ymd(y, m, d)] || []
    if (!evs.length) return <div style={{ flex: 1 }} />
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {evs.map(e => {
          const T = TYPES[e.type] || TYPES.autre
          const onCtx = ev => openCtx(ev, e.date, e)
          const onEvtClick = () => { lastEvtRef.current = e; openEdit(e) }
          const dragProps = {
            draggable: true,
            onMouseDown: ev => { ev.stopPropagation(); lastEvtRef.current = e; lastDateRef.current = e.date },
            onDragStart: ev => { ev.stopPropagation(); setDragEvt(e); ev.dataTransfer.effectAllowed = 'move' },
            onDragEnd: () => { setDragEvt(null); setDragOver(null) },
          }
          const dragOpacity = dragEvt?.id === e.id ? 0.4 : 1
          if (e.type === 'match') {
            const mc = matchCatColor(e.categorie, groupColor)
            return (
              <div key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title={`Match${e.categorie ? ' · ' + e.categorie : ''}`}
                style={{ background: mc, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', display: 'flex', justifyContent: 'space-between', gap: 4, cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap', opacity: dragOpacity }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.adversaire || e.titre || 'Match'}</span>
                {e.domicile != null && <small style={{ fontSize: '0.5rem', fontWeight: 700, opacity: 0.9 }}>{e.domicile ? 'dom' : 'ext'}</small>}
              </div>
            )
          }
          if (e.type === 'recup') {
            return <div key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title="Récup" style={{ flex: 1, minHeight: 20, cursor: 'grab', opacity: dragOpacity }} />
          }
          if (e.type === 'test') {
            return <div key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title="Tests" style={{ background: groupColor, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap', opacity: dragOpacity }}>{e.titre || T.label}</div>
          }
          const neutral = T.neutral
          const txt = e.type === 'entrainement' ? (e.style || e.titre || T.label) : (e.titre || T.short || T.label)
          return (
            <div key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title={T.label}
              style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '0 5px', lineHeight: '20px', cursor: 'grab',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', opacity: dragOpacity,
                color: neutral ? '#5b626c' : '#3a4049',
                background: neutral ? '#f0f2f5' : `color-mix(in srgb, ${groupColor} 12%, #fff)`,
                borderLeft: `3px solid ${neutral ? '#c4ccd4' : `color-mix(in srgb, ${groupColor} 65%, #fff)`}`,
              }}>
              {txt}
            </div>
          )
        })}
      </div>
    )
  }

  const seasonOpts = [seasonStartYear() - 1, seasonStartYear(), seasonStartYear() + 1]
  const pageStyle = embedded ? S.pageEmbed : S.page
  const todayISO = iso(today.getFullYear(), today.getMonth(), today.getDate())

  // Handler clavier mis à jour à chaque render (lu via kbRef)
  kbRef.current = (e) => {
    const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform)
    const isCmd = isMac ? e.metaKey : e.ctrlKey
    const tag = (e.target?.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return

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

      {/* ── Onglets Calendrier / Effectif ── */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {[['calendrier','Calendrier'],['effectif','Effectif']].map(([v,l]) => (
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
        {!embedded && <h1 style={{ ...S.h1, borderLeft: `3px solid ${groupColor}`, paddingLeft: 10 }}>Calendrier saison</h1>}
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
          <button style={{ ...S.btnDark, background: groupColor, borderColor: groupColor, color: btnColor }}
            onClick={() => openCreate()}>
            <span style={{ fontWeight: 900 }}>+</span> Ajouter
          </button>
        </div>
      </div>

      {calTab === 'effectif' && <EffectifView groupeId={groupe?.id} groupColor={groupColor} />}

      {calTab === 'calendrier' && (<>
      {/* ── Résumé + légende ── */}
      <div style={{ ...S.summary, borderBottom: `2px solid color-mix(in srgb, ${groupColor} 30%, #e6e8ec)`, paddingBottom: 12 }}>
        <Stat v={matchsList.length} l="Matchs" color={groupColor} />
        <span style={S.sep} />
        <Stat v={evenements.filter(e => e.type === 'entrainement').length} l="Entraînements" color={groupColor} />
        <span style={S.sep} />
        <Stat v={evenements.length} l="Évènements" color={groupColor} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 13, flexWrap: 'wrap' }}>
          {MATCH_CATEGORIES.map(cat => (
            <Leg key={cat} c={matchCatColor(cat, groupColor)} t={cat} />
          ))}
          <span style={S.sep} />
          <Leg c={groupColor} t="Entraînement" />
          <Leg c={groupColor} t="Musculation" />
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
          <div style={S.gridwrap}>
            <div style={S.grid}>
              {months.map(M => {
                const ph = phaseOfMonth(M.y, M.m)
                return (
                  <div key={`${M.y}-${M.m}`} style={S.mcol}>
                    <div style={{ ...S.mch, borderTop: `3px solid ${ph?.couleur || groupColor}`, background: `color-mix(in srgb, ${groupColor} 4%, #fbfcfd)` }}>
                      <div style={{ ...S.mm, color: `color-mix(in srgb, ${groupColor} 60%, #15181d)` }}>{M.label}</div>
                      <div style={S.my}>{M.y}</div>
                    </div>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                      if (d > M.days) return <div key={d} style={S.blank}><div style={S.dnum} /><div style={S.ddow} /><div style={{ flex: 1 }} /></div>
                      const dow = new Date(M.y, M.m, d).getDay()
                      const vac = vacInfo(M.y, M.m, d)
                      const isToday = ymd(M.y, M.m, d) === todayKey
                      const dISO = iso(M.y, M.m, d)
                      const weekStart = dow === 1 || d === 1   // lundi, ou 1er jour visible du mois
                      const wkNum = weekStart ? isoWeek(M.y, M.m, d) : null
                      const selected  = inSel(dISO)
                      const isPastDay = dISO < todayISO
                      return (
                        <div key={d} style={weekStart && d !== 1 ? S.weekSep : null}>
                          {weekStart && (
                        <div
                          style={{ ...S.weekTag, ...(isPastDay ? S.weekTagPast : null), cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); openWeekZoom(dISO) }}
                          title="Voir le détail de cette semaine"
                        >S{wkNum}</div>
                      )}
                          {vac.in && vac.start && <div style={S.vacband}>{vac.label}</div>}
                          <div
                            onMouseDown={e => onDayMouseDown(e, dISO)}
                            onMouseEnter={() => onDayMouseEnter(dISO)}
                            onDoubleClick={e => { setSel(null); if (!selMenu) openPop(e, dISO) }}
                            onContextMenu={e => {
                              e.preventDefault(); e.stopPropagation()
                              if (selDrag) return
                              setSel(null)  // efface la sélection avant d'ouvrir la bulle
                              lastDateRef.current = dISO
                              openPop(e, dISO)
                            }}
                            onDragOver={dragEvt ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== dISO) setDragOver(dISO) }) : undefined}
                            onDrop={dragEvt ? (e => { e.preventDefault(); moveEvent(dragEvt, dISO); setDragEvt(null); setDragOver(null) }) : undefined}
                            style={{
                              ...S.drow,
                              ...(isPastDay ? S.drowPast : null),
                              ...(vac.in ? S.drowVac : null),
                              ...(isToday ? S.drowToday : null),
                              ...(dragOver === dISO ? S.drowDrop : null),
                              ...(selected ? S.drowSel : null),
                              userSelect: 'none',
                            }}>
                            <div style={{ ...S.dnum, ...(isPastDay ? S.dnumPast : null) }}>{d}</div>
                            <div style={S.ddow}>{DOW[dow]}</div>
                            {renderCell(M.y, M.m, d)}
                          </div>
                        </div>
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
              <span style={{ color: '#9aa1ac', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1 }} onClick={() => setPop(null)}>×</span>
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

      {panel && (
        <SeanceModal
          panel={panel}
          groupColor={groupColor}
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
          reloadBlocs={async () => {
            if (!panel?.evt) return
            const blocs = await loadBlocs(panel.evt.id)
            setPanel(p => p ? { ...p, blocs } : p)
          }}
        />
      )}
    </div>
  )
}

/* ── Palette de blocs dérivée des couleurs du club ── */
function hexToHsl(hex) {
  const h = (hex || '#2f6f76').replace('#', '')
  let r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  let hh = 0, s = 0, l = (max+min)/2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d/(2-max-min) : d/(max+min)
    if (max===r) hh = (g-b)/d + (g<b?6:0)
    else if (max===g) hh = (b-r)/d + 2
    else hh = (r-g)/d + 4
    hh /= 6
  }
  return [hh*360, s*100, l*100]
}
function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  const hue2rgb = (p,q,t) => { if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p }
  let r, g, b
  if (s === 0) { r=g=b=l } else {
    const q = l<0.5?l*(1+s):l+s-l*s, p = 2*l-q
    r = hue2rgb(p,q,h+1/3); g = hue2rgb(p,q,h); b = hue2rgb(p,q,h-1/3)
  }
  return '#' + [r,g,b].map(x => Math.round(x*255).toString(16).padStart(2,'0')).join('')
}
function isLight(hex) { const [,, l] = hexToHsl(hex || '#2f6f76'); return l > 55 }
function generateBlocPalette(primary, secondary) {
  const p = primary || '#2f6f76'
  const [ph, ps, pl] = hexToHsl(p)
  const clL = l => Math.min(Math.max(l, 28), 62) // lisibilité : ni trop clair ni trop foncé
  if (secondary && secondary !== primary) {
    const [sh, ss, sl] = hexToHsl(secondary)
    return [
      hslToHex(ph, ps, clL(pl)),
      hslToHex(ph, Math.max(ps-15,20), clL(pl+14)),
      hslToHex(sh, ss, clL(sl)),
      hslToHex(sh, Math.max(ss-15,20), clL(sl+14)),
      hslToHex((ph+25)%360, ps*0.9, clL(pl-8)),
      hslToHex((ph-25+360)%360, ps*0.9, clL(pl+6)),
      hslToHex((sh+25)%360, ss*0.9, clL(sl-8)),
      hslToHex((sh-25+360)%360, ss*0.9, clL(sl+6)),
    ]
  }
  // Couleur unique → rotation de teinte
  return [0,45,90,135,180,225,270,315].map(delta =>
    hslToHex((ph+delta)%360, Math.max(ps*0.9,35), clL(delta % 90 === 0 ? pl : pl+8))
  )
}

/* ── Effectif du groupe — organigramme rugby ── */
function EffectifView({ groupeId, groupColor }) {
  const [joueurs, setJoueurs] = useState([])    // groupe_joueurs avec leurs postes et blessure
  const [wellness, setWellness] = useState({})  // client_id → dernière wellness (moyenne /4)
  const [panelPos, setPanelPos] = useState(null)   // poste | null — panneau liste
  const [panelJoueur, setPanelJoueur] = useState(null) // joueur en édition
  const [addForm, setAddForm] = useState(false)
  const [newPrenom, setNewPrenom] = useState('')
  const [newNom, setNewNom] = useState('')
  const [newRang, setNewRang] = useState(1)
  const [editStatut, setEditStatut] = useState('ok')
  const [editDesc, setEditDesc] = useState('')
  const [editDuree, setEditDuree] = useState('')
  const [editRestrictions, setEditRestrictions] = useState([])
  const [editRang, setEditRang] = useState(1)
  const [editSecondaires, setEditSecondaires] = useState('')
  const [saving, setSaving] = useState(false)

  const RESTRICTIONS = [
    'Sans contact','Sans changement de direction',
    'Sans course haute intensité','Musculation uniquement',
    'Vélo / aqua uniquement','Autre'
  ]

  const POSTES_RUGBY = [
    { num:1, nom:'Pilier gauche' }, { num:2, nom:'Talonneur' }, { num:3, nom:'Pilier droit' },
    { num:4, nom:'2ème ligne' },    { num:5, nom:'2ème ligne' },
    { num:6, nom:'Flanker' },       { num:7, nom:'Flanker' }, { num:8, nom:'N°8' },
    { num:9, nom:'Demi de mêlée' }, { num:10, nom:'Ouvreur' },
    { num:12, nom:'Centre' },       { num:13, nom:'Centre' },
    { num:11, nom:'Ailier gauche' },{ num:15, nom:'Arrière' }, { num:14, nom:'Ailier droit' },
  ]
  const FORMATION = [
    [1,2,3],[4,5],[6,7,8],[9,10],[12,13],[11,15,14]
  ]
  const ROW_LABELS = ['1ères lignes','2èmes lignes','3èmes lignes','Demis','Centres','Ailiers & Arrière']

  useEffect(() => { if (groupeId) fetchAll() }, [groupeId])

  async function fetchAll() {
    if (!groupeId) return
    // Joueurs + leurs postes
    const { data: jData } = await supabase
      .from('groupe_joueurs')
      .select('*, joueur_postes(*), joueur_blessures(*)')
      .eq('groupe_id', groupeId)
    setJoueurs(jData || [])
    // Wellness — chercher les dernières entrées pour les clients liés
    const clientIds = (jData || []).filter(j => j.client_id).map(j => j.client_id)
    if (clientIds.length > 0) {
      const { data: wData } = await supabase
        .from('wellness_logs')
        .select('client_id, score, created_at')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
      // Prendre le dernier score de chaque client
      const wMap = {}
      for (const w of (wData || [])) {
        if (!wMap[w.client_id]) wMap[w.client_id] = w.score
      }
      setWellness(wMap)
    }
  }

  // Joueurs au poste P triés par rang
  function joueursAuPoste(poste) {
    return joueurs
      .filter(j => (j.joueur_postes || []).some(p => p.poste === poste))
      .map(j => ({
        ...j,
        rang: (j.joueur_postes || []).find(p => p.poste === poste)?.rang || 99,
        blessure: (j.joueur_blessures || [])[0] || null,
      }))
      .sort((a, b) => a.rang - b.rang)
  }

  function getStatut(j) { return j.blessure?.statut || 'ok' }
  function getWellness(j) {
    if (!j.client_id) return null
    return wellness[j.client_id] ?? null
  }
  function wColor(w) {
    if (w === null) return '#c4ccd4'
    if (w >= 3) return '#16a34a'
    if (w >= 2) return '#f59e0b'
    return '#dc2626'
  }
  function statutBorderColor(s) {
    if (s === 'ok')   return '#16a34a'
    if (s === 'cond') return '#f59e0b'
    if (s === 'out')  return '#dc2626'
    return '#d1d5db'
  }

  // Stats globales
  const nbOk   = joueurs.filter(j => getStatut(j) === 'ok').length
  const nbCond  = joueurs.filter(j => getStatut(j) === 'cond').length
  const nbOut   = joueurs.filter(j => getStatut(j) === 'out').length
  const wScores = joueurs.filter(j => getWellness(j) !== null).map(j => getWellness(j))
  const wMoy    = wScores.length > 0 ? (wScores.reduce((a,b)=>a+b,0)/wScores.length).toFixed(1) : null

  function openPanelPos(poste) {
    setPanelPos(poste)
    setAddForm(false)
    setNewPrenom(''); setNewNom(''); setNewRang(joueursAuPoste(poste).length + 1)
  }
  function openPanelJoueur(j, poste) {
    setPanelJoueur({ ...j, _poste: poste })
    setEditStatut(j.blessure?.statut || 'ok')
    setEditDesc(j.blessure?.description || '')
    setEditDuree(j.blessure?.duree_estimee || '')
    setEditRestrictions(j.blessure?.restrictions || [])
    setEditRang(j.rang)
    const secondaires = (j.joueur_postes || [])
      .filter(p => p.poste !== poste)
      .map(p => p.poste)
      .join(', ')
    setEditSecondaires(secondaires)
    setPanelPos(null)
  }

  async function saveJoueur() {
    if (!panelJoueur) return
    setSaving(true)
    const joueurId = panelJoueur.id
    // Mettre à jour blessure (upsert)
    await supabase.from('joueur_blessures').upsert({
      joueur_id: joueurId,
      statut: editStatut,
      description: editDesc,
      duree_estimee: editDuree,
      restrictions: editRestrictions,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'joueur_id' })
    // Mettre à jour le rang au poste primaire
    const posteRec = (panelJoueur.joueur_postes || []).find(p => p.poste === panelJoueur._poste)
    if (posteRec) {
      await supabase.from('joueur_postes').update({ rang: editRang }).eq('id', posteRec.id)
    }
    setSaving(false)
    setPanelJoueur(null)
    fetchAll()
  }

  async function addJoueur() {
    if (!newPrenom.trim() || !newNom.trim() || !panelPos) return
    setSaving(true)
    const { data: j } = await supabase.from('groupe_joueurs').insert({
      groupe_id: groupeId,
      prenom: newPrenom.trim(),
      nom: newNom.trim(),
    }).select().single()
    if (j) {
      await supabase.from('joueur_postes').insert({
        joueur_id: j.id,
        poste: panelPos,
        rang: newRang,
        is_primary: true,
      })
    }
    setSaving(false)
    setAddForm(false)
    setNewPrenom(''); setNewNom('')
    fetchAll()
  }

  const RANK_LABELS = ['①','②','③','④','⑤','⑥','⑦','⑧']

  // Rendu d'une carte de poste
  function PosteCard({ poste }) {
    const joueursPoste = joueursAuPoste(poste.num)
    // Afficher max 2, "+N autres" si plus
    const displayed = joueursPoste.slice(0, 2)
    const extra = joueursPoste.length - 2

    return (
      <div
        onClick={() => openPanelPos(poste.num)}
        style={{ flex:1, maxWidth:240, borderRadius:9, overflow:'hidden',
          border:'2px solid #e5e7eb', cursor:'pointer',
          boxShadow:'0 1px 3px rgba(0,0,0,0.08)',
          transition:'box-shadow 0.15s, transform 0.12s' }}
        onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.08)' }}
      >
        {/* En-tête */}
        <div style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 9px', background:'#1f2937' }}>
          <span style={{ fontSize:'1rem', fontWeight:900, color:'#e4f816', minWidth:22 }}>{poste.num}</span>
          <span style={{ fontSize:'0.6rem', fontWeight:700, color:'#9ca3af' }}>{poste.nom}</span>
        </div>
        {/* Corps */}
        <div style={{ background:'#f9fafb', padding:'4px 5px', display:'flex', flexDirection:'column', gap:3 }}>
          {displayed.map((j, i) => {
            const s = getStatut(j)
            const w = getWellness(j)
            return (
              <div key={j.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 7px',
                borderRadius:6, background:'#fff', borderLeft:`3px solid ${statutBorderColor(s)}`, minHeight:26 }}>
                <span style={{ fontSize:'0.6rem', color:'#c4ccd4', fontWeight:700, minWidth:12 }}>
                  {RANK_LABELS[i]}
                </span>
                <span style={{ fontSize:'0.73rem', fontWeight:800, color:'#1f2937', flex:1,
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {j.prenom} {j.nom}
                </span>
                {w !== null && (
                  <span style={{ fontSize:'0.65rem', fontWeight:900, color:wColor(w), minWidth:20, textAlign:'right' }}>
                    {w.toFixed(1)}
                  </span>
                )}
                <span style={{ width:7, height:7, borderRadius:'50%', background:statutBorderColor(s), flexShrink:0 }} />
              </div>
            )
          })}
          {extra > 0 && (
            <div style={{ fontSize:'0.62rem', color:'#9ca3af', fontWeight:600, textAlign:'center',
              padding:'2px 0', cursor:'pointer' }}>
              +{extra} autre{extra > 1 ? 's' : ''} →
            </div>
          )}
          {joueursPoste.length === 0 && (
            <div style={{ fontSize:'0.65rem', color:'#c4ccd4', fontStyle:'italic', textAlign:'center', padding:'4px 0' }}>
              Non assigné
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); openPanelPos(poste.num); setAddForm(true) }}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:3,
              padding:'3px 5px', borderRadius:5, border:'1px dashed #d1d5db',
              fontSize:'0.62rem', color:'#c4ccd4', cursor:'pointer', background:'transparent', width:'100%',
              marginTop:2, transition:'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=groupColor; e.currentTarget.style.color=groupColor }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#d1d5db'; e.currentTarget.style.color='#c4ccd4' }}
          >
            ＋ Ajouter
          </button>
        </div>
      </div>
    )
  }

  const inputStyle = { width:'100%', border:'1.5px solid #e5e7eb', borderRadius:9, padding:'8px 11px', fontSize:'0.8rem', color:'#1f2937', outline:'none', marginBottom:7, fontFamily:'inherit' }

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* Légende */}
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap',
        background:'#fff', borderRadius:8, padding:'7px 12px', fontSize:'0.68rem', marginBottom:10,
        boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        {[['#16a34a','Disponible'],['#f59e0b','Avec conditions'],['#dc2626','Indisponible']].map(([c,l]) => (
          <span key={l} style={{ display:'flex', alignItems:'center', gap:4, color:'#4b5563' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:c, flexShrink:0 }} />
            {l}
          </span>
        ))}
        <span style={{ color:'#c4ccd4', margin:'0 2px' }}>·</span>
        <span style={{ color:'#9ca3af', fontSize:'0.66rem' }}>Barre à gauche = statut · chiffre = wellness /4 · ① ② = hiérarchie au poste</span>
      </div>

      {/* Terrain */}
      <div style={{ background:'#fff', borderRadius:12, padding:'14px 10px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ textAlign:'center', fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em',
          color:'#c4ccd4', textTransform:'uppercase', marginBottom:12 }}>
          ⬆ Direction d'attaque
        </div>

        {FORMATION.map((row, rIdx) => (
          <div key={rIdx} style={{ marginBottom: rIdx < FORMATION.length-1 ? 7 : 0 }}>
            <div style={{ fontSize:'0.58rem', color:'#c4ccd4', fontWeight:700, letterSpacing:'0.08em',
              textTransform:'uppercase', textAlign:'center', marginBottom:4 }}>
              {ROW_LABELS[rIdx]}
            </div>
            <div style={{ display:'flex', justifyContent:'center', gap:8 }}>
              {row.map(num => {
                const poste = POSTES_RUGBY.find(p => p.num === num)
                return <PosteCard key={num} poste={poste} />
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display:'flex', background:'#fff', borderRadius:10, overflow:'hidden',
        boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginTop:10 }}>
        {[
          [joueurs.length, groupColor, 'Joueurs'],
          [nbOk,   '#16a34a', 'Disponibles'],
          [nbCond, '#f59e0b', 'Conditions'],
          [nbOut,  '#dc2626', 'Indisponibles'],
          [wMoy !== null ? wMoy : '—', '#9ca3af', 'Wellness moy. /4'],
        ].map(([val, color, lbl], i) => (
          <div key={lbl} style={{ flex:1, padding:'9px 6px', textAlign:'center',
            borderRight: i < 4 ? '1px solid #f0f2f5' : 'none' }}>
            <div style={{ fontSize:'1.1rem', fontWeight:900, color }}>{val}</div>
            <div style={{ fontSize:'0.6rem', color:'#9ca3af', fontWeight:600, textTransform:'uppercase', marginTop:1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* ─── Panneau liste joueurs au poste ─── */}
      {panelPos && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:500 }}
          onClick={e => { if (e.target === e.currentTarget) setPanelPos(null) }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:460,
            padding:'18px 18px 36px', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ width:32, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 16px' }} />
            <div style={{ fontSize:'0.95rem', fontWeight:900, color:'#1f2937', marginBottom:2 }}>
              Poste {panelPos} — {POSTES_RUGBY.find(p=>p.num===panelPos)?.nom}
            </div>
            <div style={{ fontSize:'0.75rem', color:'#6b7280', marginBottom:16 }}>
              Cliquer sur un joueur pour modifier son statut
            </div>

            {joueursAuPoste(panelPos).map((j, i) => {
              const s = getStatut(j)
              const stBg = { ok:'#f0fdf4', cond:'#fffbeb', out:'#fef2f2' }[s]
              const stLbl = { ok:'Dispo', cond:'Cond.', out:'Blessé' }[s]
              const stBadgeBg = { ok:'#dcfce7', cond:'#fef3c7', out:'#fee2e2' }[s]
              const stBadgeColor = { ok:'#15803d', cond:'#b45309', out:'#b91c1c' }[s]
              return (
                <div key={j.id}
                  onClick={() => openPanelJoueur(j, panelPos)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                    background:stBg, borderRadius:9, marginBottom:5,
                    borderLeft:`3px solid ${statutBorderColor(s)}`, cursor:'pointer' }}>
                  <span style={{ fontSize:'0.66rem', fontWeight:900, color:'#9ca3af', minWidth:14 }}>{RANK_LABELS[i]}</span>
                  <span style={{ fontSize:'0.83rem', fontWeight:800, flex:1 }}>{j.prenom} {j.nom}</span>
                  {j.client_id && getWellness(j) !== null && (
                    <span style={{ fontSize:'0.7rem', fontWeight:900, color:wColor(getWellness(j)) }}>
                      {getWellness(j).toFixed(1)}/4
                    </span>
                  )}
                  <span style={{ fontSize:'0.64rem', padding:'2px 7px', borderRadius:7,
                    fontWeight:700, background:stBadgeBg, color:stBadgeColor }}>{stLbl}</span>
                </div>
              )
            })}

            <button
              onClick={() => setAddForm(f => !f)}
              style={{ width:'100%', padding:'9px', border:'2px dashed #c4ccd4', borderRadius:9,
                background:'transparent', color:'#6b7280', fontSize:'0.78rem', fontWeight:700,
                cursor:'pointer', marginTop:4, fontFamily:'inherit' }}>
              ＋ Ajouter un joueur à ce poste
            </button>

            {addForm && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.08em', color:'#9ca3af', textTransform:'uppercase', marginBottom:7 }}>Nouveau joueur</div>
                <input style={inputStyle} placeholder="Prénom" value={newPrenom} onChange={e=>setNewPrenom(e.target.value)} />
                <input style={inputStyle} placeholder="Nom de famille" value={newNom} onChange={e=>setNewNom(e.target.value)} />
                <input style={{...inputStyle}} type="number" placeholder="Rang (1 = titulaire)" value={newRang} min={1} onChange={e=>setNewRang(Number(e.target.value))} />
                <p style={{ fontSize:'0.68rem', color:'#9ca3af', marginBottom:10 }}>
                  💡 Si ce joueur crée un compte avec ce nom exact, il sera automatiquement lié.
                </p>
                <button onClick={addJoueur} disabled={saving}
                  style={{ width:'100%', padding:'11px', background:groupColor, color: isLight(groupColor)?'#1a1a1a':'#fff',
                    border:'none', borderRadius:11, fontSize:'0.86rem', fontWeight:900, cursor:'pointer', fontFamily:'inherit' }}>
                  {saving ? '...' : '➕ Ajouter le joueur'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Panneau édition joueur ─── */}
      {panelJoueur && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:500 }}
          onClick={e => { if (e.target === e.currentTarget) setPanelJoueur(null) }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:460,
            padding:'18px 18px 36px', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ width:32, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 16px' }} />
            <div style={{ fontSize:'0.95rem', fontWeight:900, color:'#1f2937', marginBottom:2 }}>
              {panelJoueur.prenom} {panelJoueur.nom}
            </div>
            <div style={{ fontSize:'0.75rem', color:'#6b7280', marginBottom:16 }}>
              Poste {panelJoueur._poste} — {POSTES_RUGBY.find(p=>p.num===panelJoueur._poste)?.nom}
            </div>

            {/* Compte lié */}
            {panelJoueur.client_id ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
                background:'#f0fdf4', borderRadius:10, border:'1.5px solid #86efac', marginBottom:14 }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:'#16a34a' }} />
                <div>
                  <div style={{ fontSize:'0.78rem', fontWeight:700, color:'#15803d' }}>Compte app lié ✓</div>
                  {getWellness(panelJoueur) !== null && (
                    <div style={{ fontSize:'0.7rem', color:'#4ade80', fontWeight:600 }}>
                      Wellness : {getWellness(panelJoueur).toFixed(1)} / 4
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding:'8px 12px', background:'#f9fafb', borderRadius:10, border:'1px solid #e5e7eb', marginBottom:14,
                fontSize:'0.72rem', color:'#9ca3af' }}>
                Pas encore de compte app lié
              </div>
            )}

            {/* Statut */}
            <div style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.08em', color:'#9ca3af', textTransform:'uppercase', marginBottom:7 }}>Statut</div>
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {[['ok','✅ Disponible'],['cond','⚠️ Conditions'],['out','🚫 Indispo.']].map(([v,l]) => {
                const selBg = { ok:'#dcfce7', cond:'#fef3c7', out:'#fee2e2' }[v]
                const selBorder = { ok:'#16a34a', cond:'#f59e0b', out:'#dc2626' }[v]
                const selColor = { ok:'#15803d', cond:'#b45309', out:'#b91c1c' }[v]
                const sel = editStatut === v
                return (
                  <button key={v} onClick={() => setEditStatut(v)}
                    style={{ flex:1, padding:'8px 4px', borderRadius:8,
                      border:`2px solid ${sel ? selBorder : 'transparent'}`,
                      fontSize:'0.7rem', fontWeight:800, cursor:'pointer', textAlign:'center',
                      background: sel ? selBg : '#f3f4f6',
                      color: sel ? selColor : '#6b7280',
                      fontFamily:'inherit' }}>
                    {l}
                  </button>
                )
              })}
            </div>

            {/* Restrictions (si cond) */}
            {editStatut === 'cond' && (
              <>
                <div style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.08em', color:'#9ca3af', textTransform:'uppercase', marginBottom:7 }}>Restrictions</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10 }}>
                  {RESTRICTIONS.map(r => {
                    const on = editRestrictions.includes(r)
                    return (
                      <div key={r} onClick={() => setEditRestrictions(prev => on ? prev.filter(x=>x!==r) : [...prev,r])}
                        style={{ padding:'4px 9px', borderRadius:12, fontSize:'0.68rem', fontWeight:700,
                          cursor:'pointer', border:`1.5px solid ${on?'#f59e0b':'#e5e7eb'}`,
                          background: on?'#fef3c7':'#f9fafb', color: on?'#b45309':'#374151' }}>
                        {r}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Détail blessure */}
            {editStatut !== 'ok' && (
              <>
                <div style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.08em', color:'#9ca3af', textTransform:'uppercase', marginBottom:7 }}>Détail blessure</div>
                <input style={inputStyle} placeholder="Ex : Entorse LLE genou droit" value={editDesc} onChange={e=>setEditDesc(e.target.value)} />
                <input style={inputStyle} placeholder="Durée estimée (ex : 3 semaines)" value={editDuree} onChange={e=>setEditDuree(e.target.value)} />
              </>
            )}

            {/* Rang */}
            <div style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.08em', color:'#9ca3af', textTransform:'uppercase', marginBottom:7, marginTop:4 }}>Rang au poste</div>
            <input style={inputStyle} type="number" min={1} value={editRang} onChange={e=>setEditRang(Number(e.target.value))} />

            {/* Postes secondaires */}
            <div style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.08em', color:'#9ca3af', textTransform:'uppercase', marginBottom:7 }}>Postes secondaires (numéros)</div>
            <input style={inputStyle} placeholder="Ex : 6, 8" value={editSecondaires} onChange={e=>setEditSecondaires(e.target.value)} />

            <button onClick={saveJoueur} disabled={saving}
              style={{ width:'100%', padding:'11px', background:groupColor,
                color: isLight(groupColor)?'#1a1a1a':'#fff',
                border:'none', borderRadius:11, fontSize:'0.86rem', fontWeight:900,
                cursor:'pointer', marginTop:10, fontFamily:'inherit' }}>
              {saving ? '...' : '💾 Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Zoom semaine (modal plein écran) ── */
function WeekZoomModal({ weekZoom, groupe, onClose, onNavigate }) {
  const groupColor = groupe?.couleur || '#2f6f76'
  const { wkNum, startISO, days, blocsMap } = weekZoom
  const todayISO = new Date().toISOString().slice(0, 10)
  const DOW_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const [dayPreview, setDayPreview] = useState(null) // { evt, blocs, dateLabel }

  // Date range affichage
  const endDate = new Date(startISO + 'T00:00:00'); endDate.setDate(endDate.getDate() + 6)
  const [sy, sm, sd] = startISO.split('-').map(Number)
  const [ey, em, ed] = endDate.toISOString().slice(0, 10).split('-').map(Number)
  const fmtStart = new Date(sy, sm-1, sd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  const fmtEnd   = new Date(ey, em-1, ed).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  // Seulement les jours avec séances
  const activeDays = days.filter(d => d.events.length > 0)
  const allEvts = days.flatMap(d => d.events)
  const nbMatch = allEvts.filter(e => e.type === 'match').length
  const nbTrain = allEvts.filter(e => e.type === 'entrainement').length
  const nbMuscu = allEvts.filter(e => e.type === 'muscu').length

  // Fermer sur Échap
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function evtColor(type) {
    if (type === 'match') return groupColor
    if (type === 'entrainement') return '#6b94a3'
    if (type === 'muscu') return '#b08769'
    return '#9aa1ac'
  }

  // Palette dérivée des couleurs du club
  const BLOC_COLORS = generateBlocPalette(groupColor, groupe?.couleur_secondaire)
  function blocColor(idx) { return BLOC_COLORS[idx % BLOC_COLORS.length] }

  function chargeLevel(charge) {
    if (!charge) return null
    const c = charge.toLowerCase()
    if (c.includes('lég') || c.includes('faib') || c.includes('bass') || c.includes('repos')) return 'low'
    if (c.includes('mod') || c.includes('moyen')) return 'medium'
    if (c.includes('haut') || c.includes('fort') || c.includes('élev') || c.includes('elev')) return 'high'
    return null
  }
  const INT_COLOR = { low: '#16a34a', medium: '#d97706', high: '#dc2626' }
  const INT_LABEL = { low: 'Légère', medium: 'Modérée', high: 'Haute' }

  function IntensityBar({ charge }) {
    const lvl = chargeLevel(charge)
    if (!lvl) return null
    const c = INT_COLOR[lvl]
    const filled = lvl === 'low' ? 1 : lvl === 'medium' ? 2 : 3
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px 5px' }}>
        <span style={{ fontSize: '.55rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: c }}>{INT_LABEL[lvl]}</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[1,2,3].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: 2, background: i <= filled ? c : '#e5e7eb' }} />)}
        </div>
      </div>
    )
  }

  // Parse la durée d'un bloc en minutes (ex: "30 min", "1h30", "45")
  function parseDurMin(s) {
    if (!s) return null
    const str = String(s).toLowerCase().trim()
    const hm = str.match(/(\d+)\s*h\s*(\d*)/)
    if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2] || 0)
    const m = str.match(/(\d+)\s*m/)
    if (m) return parseInt(m[1])
    // format "5'" ou "55'" (apostrophe ou prime)
    const apos = str.match(/^(\d+)\s*['′']/)
    if (apos) return parseInt(apos[1])
    const n = str.match(/^(\d+)$/)
    if (n) return parseInt(n[1])
    return null
  }

  function EventContent({ evt }) {
    const color = evtColor(evt.type)
    const blocs = blocsMap[evt.id] || []

    if (evt.type === 'match') {
      const mc = matchCatColor(evt.categorie, groupColor)
      return (
        <div style={{ background: `linear-gradient(135deg, ${mc}, ${mc}cc)`, borderRadius: 11, padding: '12px 13px', color: '#fff', textAlign: 'center', marginBottom: 2 }}>
          {evt.categorie && <div style={{ fontSize: '.6rem', fontWeight: 700, opacity: .65, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Match · {evt.categorie}{evt.journee ? ` · ${evt.journee}` : ''}</div>}
          <div style={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1.15, marginBottom: 8 }}>{evt.adversaire ? `vs ${evt.adversaire}` : evt.titre || 'Match'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
            {evt.heure && <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 5, padding: '2px 7px', fontSize: '.6rem', fontWeight: 700 }}>{String(evt.heure).slice(0, 5)}</span>}
            {evt.domicile != null && <span style={{ background: '#e4f816', color: '#333', borderRadius: 5, padding: '2px 7px', fontSize: '.6rem', fontWeight: 700 }}>{evt.domicile ? 'Domicile' : 'Extérieur'}</span>}
            {evt.lieu && <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 5, padding: '2px 7px', fontSize: '.6rem', fontWeight: 700 }}>{evt.lieu}</span>}
          </div>
        </div>
      )
    }

    // Libellé principal de la séance
    const evtLabel = evt.type === 'entrainement' ? (evt.style || evt.titre || 'Entraînement')
      : evt.type === 'muscu' ? (evt.titre || 'Musculation')
      : (evt.titre || TYPES[evt.type]?.label || 'Séance')

    // ── Carte unique englobant toute la séance ──────────────────────────────
    return (
      <div style={{ border: `2px solid ${color}35`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>

        {/* En-tête séance (bandeau coloré) */}
        <div style={{ background: color, padding: '11px 14px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>
              {TYPES[evt.type]?.label || evt.type}
            </div>
            <div style={{ fontSize: '.95rem', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{evtLabel}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            {evt.heure && (
              <span style={{ fontSize: '.8rem', fontWeight: 900, color: '#fff', background: 'rgba(0,0,0,.22)', borderRadius: 6, padding: '3px 8px', letterSpacing: '.01em' }}>
                🕐 {String(evt.heure).slice(0, 5)}
              </span>
            )}
            {evt.duree_min && (
              <span style={{ fontSize: '.68rem', background: 'rgba(255,255,255,.25)', color: '#fff', borderRadius: 5, padding: '2px 7px', fontWeight: 800 }}>
                ⏱ {evt.duree_min} min
              </span>
            )}
            {blocs.length > 0 && (
              <button
                onClick={() => setDayPreview({ evt, blocs })}
                style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.35)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 }}>
                Aperçu complet ↗
              </button>
            )}
          </div>
        </div>

        {/* Phases (blocs) */}
        {blocs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(() => {
              const totalMins = blocs.reduce((sum, b) => sum + (parseDurMin(b.duree) || 0), 0)
              const PX_PER_MIN = 2.5
              const MAX_TOTAL = 220
              const rawH = totalMins * PX_PER_MIN
              const scale = rawH > MAX_TOTAL ? MAX_TOTAL / rawH : 1
              return blocs.map((bloc, idx) => {
              const bc = blocColor(idx)
              const mins = parseDurMin(bloc.duree)
              const h = mins ? Math.max(20, Math.round(mins * PX_PER_MIN * scale)) : 40

              const byGroup = {}
              for (const exo of (bloc.exos || [])) {
                const g = exo.groupe_label?.trim() || ''
                ;(byGroup[g] ||= []).push(exo)
              }
              const groupKeys = Object.keys(byGroup)
              const hasGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== '')

              return (
                <div key={bloc.id} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e6e8ec' }}>
                  {/* En-tête phase */}
                  <div style={{ padding: '7px 12px', background: bc + '18', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: bc, color: '#fff', fontSize: '.7rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 1px 4px ${bc}55` }}>{idx + 1}</span>
                    <span style={{ fontSize: '.78rem', fontWeight: 800, color: '#1a1a1a', flex: 1 }}>{bloc.nom}</span>
                    {bloc.duree && <span style={{ fontSize: '.67rem', fontWeight: 900, color: '#fff', background: bc, borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>{bloc.duree}</span>}
                  </div>

                  {/* Séquences — aperçu lisible */}
                  {bloc.bloc_type === 'sequences' && (() => {
                    const seqs = bloc.sequences || []
                    // Numérotation séquences de jeu uniquement
                    let jeuCount = 0
                    const jeuNum = {}
                    seqs.forEach(s => { if (s.type === 'jeu') { jeuCount++; jeuNum[s.id] = jeuCount } })
                    return (
                      <div style={{ background: '#eef3fb', padding: '6px 8px 8px' }}>
                        {/* Stats + conditions */}
                        <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:6, flexWrap:'wrap' }}>
                          <span style={{ fontSize:'.6rem', fontWeight:800, color:'#2c5faa' }}>
                            Jeu {calcJeuEffectif(seqs)}
                          </span>
                          <span style={{ fontSize:'.6rem', color:'#9db8d8' }}>·</span>
                          <span style={{ fontSize:'.58rem', fontWeight:600, color:'#6a8aaa' }}>
                            {calcDureeBloc(seqs)} total
                          </span>
                          {bloc.conditions_jeu && (
                            <>
                              <span style={{ fontSize:'.6rem', color:'#9db8d8' }}>·</span>
                              <span style={{ fontSize:'.58rem', fontWeight:700, color:'#92400e', background:'#fef3c7', borderRadius:4, padding:'1px 5px' }}>
                                {bloc.conditions_jeu}
                              </span>
                            </>
                          )}
                        </div>
                        {/* Cards séquences */}
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          {seqs.map(seq => seq.type === 'jeu' ? (
                            <div key={seq.id} style={{ background:'#fff', border:'1px solid #c4d8f0', borderRadius:7, padding:'5px 8px', display:'flex', alignItems:'center', gap:7 }}>
                              <div style={{ width:16, height:16, borderRadius:'50%', background:'#2c5faa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.5rem', fontWeight:900, color:'#fff', flexShrink:0 }}>
                                {jeuNum[seq.id]}
                              </div>
                              <div style={{ flex:1, fontSize:'.63rem', fontWeight:700, color:'#1e2d3d', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {seq.theme || '—'}
                              </div>
                              <div style={{ fontSize:'.65rem', fontWeight:900, color:'#b03030', flexShrink:0 }}>
                                {formatSeqDur(seq.duree_sec)}
                              </div>
                            </div>
                          ) : seq.type === 'inter_bloc' ? (
                            /* Récup inter-série — séparateur plus marqué */
                            <div key={seq.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 0' }}>
                              <div style={{ flex:1, height:2, background:'#a3c4e8', borderRadius:1 }}></div>
                              <span style={{ fontSize:'.6rem', fontWeight:800, color:'#2c5faa', background:'#dce8f8', border:'1px solid #a3c4e8', borderRadius:20, padding:'2px 10px', whiteSpace:'nowrap' }}>
                                Récup série · {formatSeqDur(seq.duree_sec)}
                              </span>
                              <div style={{ flex:1, height:2, background:'#a3c4e8', borderRadius:1 }}></div>
                            </div>
                          ) : (
                            <div key={seq.id} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'1px 0' }}>
                              <div style={{ flex:1, height:1, background:'#b8d8c8' }}></div>
                              <span style={{ fontSize:'.52rem', fontWeight:700, color:'#2e7d4f', fontStyle:'italic', whiteSpace:'nowrap' }}>
                                récup {formatSeqDur(seq.duree_sec)}
                              </span>
                              <div style={{ flex:1, height:1, background:'#b8d8c8' }}></div>
                            </div>
                          ))}
                        </div>
                        {bloc.effectif_desc && (
                          <span style={{ fontSize:'.6rem', color:'#9ca3af', fontStyle:'italic', marginTop:4, display:'block' }}>{bloc.effectif_desc}</span>
                        )}
                      </div>
                    )
                  })()}

                  {/* Exercices */}
                  {bloc.bloc_type !== 'sequences' && bloc.exos?.length > 0 && (
                    h < 40
                    /* Bloc trop court → juste le nom centré, pas d'exercices */
                    ? <div style={{ height: h, background: bc + '08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '.68rem', fontWeight: 700, color: bc, opacity: 0.5, fontStyle: 'italic' }}>{bloc.nom}</span>
                      </div>
                    : <div style={{ height: h, overflow: 'hidden', padding: '5px 8px 6px', background: bc + '08', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {hasGroups ? (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${groupKeys.length}, 1fr)`, gap: 5, alignItems: 'stretch' }}>
                          {groupKeys.map(g => (
                            <div key={g} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${bc}30`, display: 'flex', flexDirection: 'column' }}>
                              {g && <div style={{ fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', color: '#fff', background: bc + 'bb', padding: '3px 8px', textAlign: 'center', flexShrink: 0 }}>{g}</div>}
                              <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 3, background: bc + '08', flex: 1 }}>
                                {byGroup[g].map(exo => (
                                  <div key={exo.id} style={{ background: '#fff', borderRadius: 5, padding: '3px 7px', border: `1px solid ${bc}25` }}>
                                    <div style={{ fontSize: '.67rem', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.25 }}>{exo.nom}</div>
                                    {exo.prescription && <div style={{ fontSize: '.62rem', color: bc, fontWeight: 800, marginTop: 1 }}>{exo.prescription}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {bloc.exos.map(exo => (
                            <div key={exo.id} style={{ background: '#fff', borderRadius: 6, padding: '4px 8px', border: `1px solid ${bc}25`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#1a1a1a', flex: 1, lineHeight: 1.25 }}>{exo.nom}</span>
                              {exo.prescription && <span style={{ fontSize: '.62rem', color: '#fff', fontWeight: 800, flexShrink: 0, background: bc, borderRadius: 4, padding: '1px 5px' }}>{exo.prescription}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {bloc.bloc_type !== 'sequences' && !bloc.exos?.length && (
                    <div style={{ height: h, background: bc + '08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: bc, opacity: 0.5, fontStyle: 'italic' }}>{bloc.nom}</span>
                    </div>
                  )}
                </div>
              )
            })
            })()}
          </div>
        ) : (
          /* Pas de blocs */
          <div style={{ padding: '10px 13px' }}>
            {(evt.lieu || evt.note) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                {evt.lieu && <span style={{ fontSize: '.65rem', color: '#5b626c' }}>📍 {evt.lieu}</span>}
                {evt.note && <span style={{ fontSize: '.65rem', color: '#7a8290', fontStyle: 'italic' }}>{evt.note}</span>}
              </div>
            )}
            <div style={{ color: '#c4ccd4', fontSize: '.65rem', fontStyle: 'italic' }}>Aucun déroulé renseigné</div>
          </div>
        )}
      </div>
    )
  }

  function DayColumn({ day }) {
    const isToday = day.date === todayISO
    const matchEvt = day.events.find(e => e.type === 'match')
    const isMuscu  = !matchEvt && day.events.every(e => e.type === 'muscu')
    const [, , dd] = day.date.split('-').map(Number)
    const borderColor = matchEvt ? matchCatColor(matchEvt.categorie, groupColor)
      : isMuscu ? '#b08769'
      : isToday ? '#e4f816'
      : '#6b94a3'
    const typeLabel = matchEvt ? 'Match' : isMuscu ? 'Musculation' : 'Entraînement'

    return (
      <div style={{ background: matchEvt ? '#f8fffe' : isToday ? '#fffef5' : '#fff', display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {/* En-tête colonne */}
        <div style={{ padding: '10px 12px 8px', borderBottom: `3px solid ${borderColor}`, textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9aa1ac' }}>{DOW_FR[day.dow]}</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: isToday ? borderColor : '#15181d', lineHeight: 1.1 }}>{dd}</div>
          <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: borderColor, marginTop: 2 }}>{typeLabel}</div>
          {isToday && <div style={{ display: 'inline-block', fontSize: '.52rem', fontWeight: 800, background: '#e4f816', color: '#333', borderRadius: 4, padding: '1px 5px', marginTop: 2 }}>Aujourd'hui</div>}
        </div>

        {/* Séances */}
        <div style={{ padding: '10px 10px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, overflowY: 'auto' }}>
          {day.events.map(evt => (
            <div key={evt.id}>
              {evt.heure && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ flex: 1, height: 1, background: '#e6e8ec' }} />
                  <span style={{ fontSize: '.58rem', fontWeight: 800, color: '#9aa1ac' }}>{String(evt.heure).slice(0, 5)}</span>
                  <div style={{ flex: 1, height: 1, background: '#e6e8ec' }} />
                </div>
              )}
              <EventContent evt={evt} />
              {evt.charge && <IntensityBar charge={evt.charge} />}
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ── DayPreviewModal — aperçu complet d'une séance ── */
  function DayPreviewModal({ evt, blocs }) {
    const color = evtColor(evt.type)
    const evtLabel = evt.type === 'entrainement' ? (evt.style || evt.titre || 'Entraînement')
      : evt.type === 'muscu' ? (evt.titre || 'Musculation')
      : (evt.titre || TYPES[evt.type]?.label || 'Séance')
    return (
      <>
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:120 }} onClick={() => setDayPreview(null)} />
        <div style={{ position:'fixed', top:'5vh', left:'50%', transform:'translateX(-50%)', width:'min(680px, 94vw)', maxHeight:'88vh', zIndex:121, background:'#fff', borderRadius:18, overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,.45)', display:'flex', flexDirection:'column' }}>
          {/* Header */}
          <div style={{ background:color, padding:'14px 18px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'.6rem', fontWeight:700, color:'rgba(255,255,255,.65)', textTransform:'uppercase', letterSpacing:'.07em' }}>{TYPES[evt.type]?.label || evt.type}</div>
              <div style={{ fontSize:'1.05rem', fontWeight:900, color:'#fff' }}>{evtLabel}</div>
            </div>
            {evt.duree_min && <span style={{ fontSize:'.75rem', fontWeight:800, color:'#fff', background:'rgba(0,0,0,.2)', borderRadius:7, padding:'3px 9px' }}>{evt.duree_min} min</span>}
            <button onClick={() => setDayPreview(null)} style={{ background:'rgba(255,255,255,.15)', border:'none', color:'#fff', borderRadius:8, width:30, height:30, fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>×</button>
          </div>
          {/* Corps */}
          <div style={{ overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
            {blocs.map((bloc, idx) => {
              const bc2 = blocColor(idx)
              const seqs = bloc.sequences || []
              let jeuC = 0; const jN = {}
              seqs.forEach(s => { if (s.type === 'jeu') { jeuC++; jN[s.id] = jeuC } })
              return (
                <div key={bloc.id} style={{ borderRadius:10, overflow:'hidden', border:`1.5px solid ${bc2}30` }}>
                  {/* Tête bloc */}
                  <div style={{ background:bc2, padding:'7px 12px', display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:20, height:20, borderRadius:'50%', background:'rgba(255,255,255,.25)', color:'#fff', fontSize:'.6rem', fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{idx+1}</span>
                    <span style={{ flex:1, fontSize:'.8rem', fontWeight:900, color:'#fff' }}>{bloc.nom}</span>
                    {bloc.duree && <span style={{ fontSize:'.68rem', fontWeight:800, color:'#fff', background:'rgba(0,0,0,.2)', borderRadius:5, padding:'2px 7px' }}>{bloc.duree}</span>}
                  </div>
                  {/* Séquences */}
                  {bloc.bloc_type === 'sequences' && (
                    <div style={{ background:'#eef3fb', padding:'8px 10px', display:'flex', flexDirection:'column', gap:4 }}>
                      {/* Stats */}
                      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2 }}>
                        <span style={{ fontSize:'.62rem', fontWeight:800, color:'#2c5faa' }}>Jeu {calcJeuEffectif(seqs)}</span>
                        <span style={{ fontSize:'.62rem', color:'#9db8d8' }}>·</span>
                        <span style={{ fontSize:'.6rem', fontWeight:600, color:'#6a8aaa' }}>{calcDureeBloc(seqs)} total</span>
                        {bloc.conditions_jeu && <><span style={{ fontSize:'.62rem', color:'#9db8d8' }}>·</span><span style={{ fontSize:'.6rem', fontWeight:700, color:'#92400e', background:'#fef3c7', borderRadius:4, padding:'1px 5px' }}>{bloc.conditions_jeu}</span></>}
                        {bloc.effectif_desc && <span style={{ fontSize:'.6rem', color:'#6b7280', fontStyle:'italic' }}>{bloc.effectif_desc}</span>}
                      </div>
                      {seqs.map(seq => seq.type === 'jeu' ? (
                        <div key={seq.id} style={{ background:'#fff', border:'1px solid #c4d8f0', borderRadius:7, padding:'6px 10px', display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:18, height:18, borderRadius:'50%', background:'#2c5faa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.55rem', fontWeight:900, color:'#fff', flexShrink:0 }}>{jN[seq.id]}</div>
                          <div style={{ flex:1, fontSize:'.72rem', fontWeight:700, color:'#1e2d3d' }}>{seq.theme || '—'}</div>
                          <div style={{ fontSize:'.72rem', fontWeight:900, color:'#b03030', flexShrink:0 }}>{formatSeqDur(seq.duree_sec)}</div>
                        </div>
                      ) : seq.type === 'inter_bloc' ? (
                        <div key={seq.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 0' }}>
                          <div style={{ flex:1, height:2, background:'#a3c4e8', borderRadius:1 }}></div>
                          <span style={{ fontSize:'.65rem', fontWeight:800, color:'#2c5faa', background:'#dce8f8', border:'1px solid #a3c4e8', borderRadius:20, padding:'3px 12px', whiteSpace:'nowrap' }}>Récup série · {formatSeqDur(seq.duree_sec)}</span>
                          <div style={{ flex:1, height:2, background:'#a3c4e8', borderRadius:1 }}></div>
                        </div>
                      ) : (
                        <div key={seq.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'1px 0' }}>
                          <div style={{ flex:1, height:1, background:'#b8d8c8' }}></div>
                          <span style={{ fontSize:'.58rem', fontWeight:700, color:'#2e7d4f', fontStyle:'italic' }}>récup {formatSeqDur(seq.duree_sec)}</span>
                          <div style={{ flex:1, height:1, background:'#b8d8c8' }}></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Exercices */}
                  {bloc.bloc_type !== 'sequences' && (bloc.exos||[]).length > 0 && (
                    <div style={{ padding:'6px 10px 8px', background: bc2+'08', display:'flex', flexDirection:'column', gap:3 }}>
                      {bloc.exos.map(exo => (
                        <div key={exo.id} style={{ background:'#fff', borderRadius:6, padding:'5px 9px', border:`1px solid ${bc2}25`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:'.72rem', fontWeight:700, color:'#1a1a1a', flex:1 }}>{exo.nom}</span>
                          {exo.prescription && <span style={{ fontSize:'.65rem', color:'#fff', fontWeight:800, background:bc2, borderRadius:4, padding:'1px 6px', flexShrink:0 }}>{exo.prescription}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {bloc.bloc_type !== 'sequences' && !(bloc.exos||[]).length && (
                    <div style={{ padding:'8px 12px', background:bc2+'08' }}>
                      <span style={{ fontSize:'.68rem', color:bc2, opacity:.5, fontStyle:'italic' }}>{bloc.nom}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  const cols = activeDays.length || 1
  const Pill = ({ color, label }) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.1)', borderRadius: 7, padding: '3px 9px', fontSize: '.67rem', fontWeight: 700, color: 'rgba(255,255,255,.75)' }}>
      <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />{label}
    </span>
  )

  return (
    <>
      {dayPreview && <DayPreviewModal evt={dayPreview.evt} blocs={dayPreview.blocs} />}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,23,.55)', zIndex: 110 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '70px', left: '2vw', right: '2vw', bottom: '2vh', zIndex: 111, background: '#f5f6f8', borderRadius: 20, boxShadow: '0 32px 100px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ background: '#e4f816', color: '#333', fontSize: '.68rem', fontWeight: 900, padding: '4px 10px', borderRadius: 7, letterSpacing: '.05em', flexShrink: 0 }}>S{wkNum}</span>
            <div>
              <div style={{ color: '#fff', fontSize: '.98rem', fontWeight: 800 }}>Semaine {wkNum}</div>
              <div style={{ color: 'rgba(255,255,255,.45)', fontSize: '.7rem' }}>{fmtStart} → {fmtEnd}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {nbMatch > 0 && <Pill color={groupColor} label={`${nbMatch} Match${nbMatch > 1 ? 's' : ''}`} />}
            {nbTrain > 0 && <Pill color="#6b94a3" label={`${nbTrain} Entraîn.`} />}
            {nbMuscu > 0 && <Pill color="#b08769" label={`${nbMuscu} Muscu`} />}
            {allEvts.length === 0 && <span style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.4)', fontStyle: 'italic' }}>Semaine libre</span>}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => onNavigate(-1)} style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>← S{wkNum - 1}</button>
            <button onClick={() => onNavigate(1)}  style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>S{wkNum + 1} →</button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Grille */}
        {activeDays.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa1ac', fontSize: '.9rem', fontStyle: 'italic' }}>Aucune séance cette semaine</div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', gap: 1, background: '#d8dce4' }}>
              {activeDays.map(day => <DayColumn key={day.date} day={day} />)}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function clipLabel(e) {
  if (!e) return ''
  if (e.type === 'match') return e.adversaire || 'Match'
  if (e.type === 'entrainement') return e.style || e.titre || 'Entraînement'
  return e.titre || (TYPES[e.type]?.label) || 'Évènement'
}
function formatPopDate(dateISO) {
  if (!dateISO) return ''
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// Parse durée libre → minutes (ex: "30 min", "1h30", "45", "5'")
function parseDurMin(s) {
  if (!s) return null
  const str = String(s).toLowerCase().trim()
  const hm = str.match(/(\d+)\s*h\s*(\d*)/)
  if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2] || 0)
  const m = str.match(/(\d+)\s*m/)
  if (m) return parseInt(m[1])
  const apos = str.match(/^(\d+)\s*['′']/)
  if (apos) return parseInt(apos[1])
  const n = str.match(/^(\d+)$/)
  if (n) return parseInt(n[1])
  return null
}

/* ── Helpers séquences (SeanceModal + WeekZoomModal) ── */
function formatSeqDur(sec) {
  if (!sec) return '?'
  const m = Math.floor(sec/60), s = sec%60
  if (m === 0) return `${s}''`
  if (s === 0) return `${m}'`
  return `${m}'${String(s).padStart(2,'0')}`
}
function calcJeuEffectif(seqs) {
  const total = (seqs||[]).filter(s=>s.type==='jeu').reduce((acc,s)=>acc+(s.duree_sec||0),0)
  return formatSeqDur(total)
}
function calcDureeBloc(seqs) {
  const total = (seqs||[]).reduce((acc,s)=>acc+(s.duree_sec||0),0)
  return formatSeqDur(total)
}

/* ── SeanceModal — plein écran, remplace l'ancien panneau latéral ── */
function SeanceModal({
  panel, groupColor, couleurSecondaire, closePanel, setForm,
  addBloc, updateBloc, deleteBloc,
  addExo, updateExo, deleteExo,
  saveEvent, deleteEvent, saving,
  reloadBlocs,
}) {
  const BLOC_COLORS = generateBlocPalette(groupColor, couleurSecondaire)
  const { form } = panel
  const hasBlocs = HAS_BLOCS.includes(form.type) || form.type === 'collectif'
  const totalMin = Number(form.duree_min) || 0

  // ── Timeline ──
  const blocksAreaRef = useRef(null)
  const [pxMin, setPxMin] = useState(3)
  const pxMinRef = useRef(3)
  const dragRef = useRef(null)
  const updateBlocRef = useRef(updateBloc)
  updateBlocRef.current = updateBloc
  const [localDurs, setLocalDurs] = useState({})

  // PX_MIN dynamique basé sur la hauteur de la zone
  useEffect(() => {
    const area = blocksAreaRef.current
    if (!area) return
    const compute = () => {
      const h = area.getBoundingClientRect().height
      if (h > 0 && totalMin > 0) {
        const v = Math.max(1.5, (h - 16) / totalMin)
        pxMinRef.current = v
        setPxMin(v)
      }
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(area)
    return () => ro.disconnect()
  }, [totalMin])

  // Drag (listeners sur document, une seule fois)
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const deltaMin = Math.round((e.clientY - d.startY) / pxMinRef.current)
      const newDur = Math.max(5, Math.min(d.maxDur, d.startDur + deltaMin))
      d.currentDur = newDur
      setLocalDurs(prev => ({ ...prev, [d.id]: newDur }))
    }
    const onUp = () => {
      const d = dragRef.current
      if (!d) return
      if (d.currentDur != null && d.currentDur !== d.startDur) {
        updateBlocRef.current(d.id, { duree: String(d.currentDur) })
      }
      dragRef.current = null
      setLocalDurs({})
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Blocs triés + startMin cumulatif
  const sortedBlocs = [...panel.blocs].sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
  let cursor = 0
  const blocsWithPos = sortedBlocs.map(b => {
    const dur = localDurs[b.id] ?? parseDurMin(b.duree) ?? 0
    const start = cursor
    cursor += dur
    return { ...b, startMin: start, durationMin: dur }
  })
  const usedMin = blocsWithPos.reduce((s, b) => s + b.durationMin, 0)

  function startDrag(e, bloc) {
    e.preventDefault()
    const sumOthers = blocsWithPos.filter(b => b.id !== bloc.id).reduce((s, b) => s + b.durationMin, 0)
    const maxDur = Math.max(5, totalMin - sumOthers)
    dragRef.current = { id: bloc.id, startY: e.clientY, startDur: bloc.durationMin, startMin: bloc.startMin, maxDur, currentDur: bloc.durationMin }
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  // ── Séquences ──
  const evtId = panel.evt?.id
  const [selectedSeqId, setSelectedSeqId] = useState(null)
  const dragSeqId = React.useRef(null)

  async function addSequence(blocId, type = 'jeu') {
    // Ordre = max existant + 1
    const allBlocs = panel.blocs || []
    const bloc = allBlocs.find(b => b.id === blocId)
    const maxOrdre = (bloc?.sequences || []).reduce((m, s) => Math.max(m, s.ordre || 0), 0)
    const { data } = await supabase.from('groupe_seance_sequences').insert({
      bloc_id: blocId, type, theme: type === 'jeu' ? '' : 'Récup.', duree_sec: type === 'jeu' ? 90 : 35, ordre: maxOrdre + 1
    }).select().single()
    if (data) { reloadBlocs?.(); setSelectedSeqId(data.id) }
  }
  async function updateSequence(seqId, patch) {
    await supabase.from('groupe_seance_sequences').update(patch).eq('id', seqId)
    reloadBlocs?.()
  }
  async function addNouvelleSerie(blocId) {
    const bloc = (panel.blocs || []).find(b => b.id === blocId)
    if (!bloc) return
    const maxOrdre = (bloc.sequences || []).reduce((m, s) => Math.max(m, s.ordre || 0), 0)
    await supabase.from('groupe_seance_sequences').insert([
      { bloc_id: blocId, type: 'inter_bloc', ordre: maxOrdre + 1, duree_sec: 180, theme: '' },
      { bloc_id: blocId, type: 'jeu',        ordre: maxOrdre + 2, duree_sec: 90,  theme: '' },
    ])
    reloadBlocs?.()
  }

  async function deleteSequence(seqId) {
    await supabase.from('groupe_seance_sequences').delete().eq('id', seqId)
    setSelectedSeqId(null)
    reloadBlocs?.()
  }
  async function reorderSequences(blocId, fromId, toId) {
    const bloc = (panel.blocs || []).find(b => b.id === blocId)
    if (!bloc) return
    const seqs = [...(bloc.sequences || [])].sort((a, b) => a.ordre - b.ordre)
    const fromIdx = seqs.findIndex(s => s.id === fromId)
    const toIdx   = seqs.findIndex(s => s.id === toId)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    const reordered = [...seqs]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    await Promise.all(reordered.map((s, i) =>
      supabase.from('groupe_seance_sequences').update({ ordre: i + 1 }).eq('id', s.id)
    ))
    reloadBlocs?.()
  }

  async function addBlocSequences() {
    if (!panel?.evt) { alert("Enregistre d'abord la séance pour lui ajouter un déroulé."); return }
    const { data: nb } = await supabase.from('groupe_seance_blocs')
      .select('ordre', { count:'exact' }).eq('evenement_id', evtId)
    const ordre = (nb?.length || 0) + 1
    await supabase.from('groupe_seance_blocs').insert({
      evenement_id: evtId, nom:'Opposition', duree:'30', ordre,
      bloc_type:'sequences', conditions_jeu:'Plaqué / Touché', recup_inter_seq:"30'' à 45''"
    })
    reloadBlocs?.()
  }

  // Libellé de la date
  const dateLabel = form.date ? (() => {
    const [y, m, d] = form.date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  })() : 'Nouvel événement'

  const step = totalMin <= 60 ? 10 : totalMin <= 120 ? 15 : totalMin <= 180 ? 20 : 30

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,23,.55)', zIndex: 110 }} onClick={closePanel} />

      {/* Modal — onKeyDown stopPropagation empêche les raccourcis calendrier (Cmd+C/V) de se déclencher depuis la modale */}
      <div onKeyDown={e => e.stopPropagation()} style={{ position: 'fixed', top: 70, bottom: '2vh', left: '50%', transform: 'translateX(-50%)', width: 'min(96vw, 1000px)', zIndex: 111, background: '#f5f6f8', borderRadius: 20, boxShadow: '0 32px 100px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div>
            <div style={{ color: '#fff', fontSize: '.95rem', fontWeight: 800, textTransform: 'capitalize' }}>{dateLabel}</div>
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.68rem', marginTop: 1 }}>
              {panel.mode === 'create' ? 'Nouvel événement' : 'Modifier l\'événement'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {CREATE_TYPES.map(k => (
              <button key={k} onClick={() => setForm({ type: k })} style={{ background: form.type === k ? '#e4f816' : 'rgba(255,255,255,.1)', border: 'none', color: form.type === k ? '#333' : 'rgba(255,255,255,.55)', borderRadius: 8, padding: '5px 13px', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer' }}>
                {TYPES[k].label}
              </button>
            ))}
          </div>
          <button onClick={closePanel} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body 2 colonnes */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: hasBlocs ? '400px 1fr' : '1fr', overflow: 'hidden', minHeight: 0 }}>

          {/* ── Colonne formulaire ── */}
          <div style={{ background: '#fff', borderRight: hasBlocs ? '1px solid #e0e3e8' : 'none', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            <div style={Sm.section}>
              <div style={Sm.sTitle}>Horaire</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={Sm.fLabel}>Heure</div>
                  <input type="time" value={form.heure} onChange={e => setForm({ heure: e.target.value })} style={Sm.input} />
                </div>
                {form.type !== 'match' && (
                  <div style={{ flex: 1 }}>
                    <div style={Sm.fLabel}>Durée totale (min)</div>
                    <input type="number" value={form.duree_min} onChange={e => setForm({ duree_min: e.target.value })} style={{ ...Sm.input, borderColor: '#7c3aed', background: '#f5f3ff', color: '#5b21b6', fontWeight: 900, textAlign: 'center', fontSize: '.9rem' }} />
                  </div>
                )}
              </div>
            </div>

            <div style={Sm.section}>
              <div style={Sm.sTitle}>{TYPES[form.type]?.label || 'Détails'}</div>

              {form.type === 'match' && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Adversaire</div>
                    <input value={form.adversaire} onChange={e => setForm({ adversaire: e.target.value })} placeholder="ex. Montauban" style={Sm.input} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Catégorie</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {MATCH_CATEGORIES.map(c => (
                        <button key={c} onClick={() => setForm({ categorie: c })} style={{ ...Sm.chip, ...(form.categorie === c ? { background: '#1a1a1a', color: '#e4f816', borderColor: '#1a1a1a' } : {}) }}>{c}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={Sm.fLabel}>Lieu</div>
                      <select value={form.domicile ? '1' : '0'} onChange={e => setForm({ domicile: e.target.value === '1' })} style={Sm.input}>
                        <option value="1">Domicile</option><option value="0">Extérieur</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={Sm.fLabel}>Journée</div>
                      <input value={form.journee} onChange={e => setForm({ journee: e.target.value })} placeholder="ex. J12" style={Sm.input} />
                    </div>
                  </div>
                </>
              )}

              {form.type === 'entrainement' && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Style</div>
                    <input value={form.style} onChange={e => setForm({ style: e.target.value })} placeholder="ex. Vitesse, Collectif, Prévention…" style={Sm.input} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Titre (optionnel)</div>
                    <input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Travail d'appuis" style={Sm.input} />
                  </div>
                </>
              )}

              {form.type === 'muscu' && (
                <div style={{ marginBottom: 10 }}>
                  <div style={Sm.fLabel}>Titre</div>
                  <input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Force max bas du corps" style={Sm.input} />
                </div>
              )}
            </div>

            {form.type !== 'match' && (
              <div style={Sm.section}>
                <div style={Sm.sTitle}>Charge</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Légère', 'Modérée', 'Haute'].map(c => (
                    <button key={c} onClick={() => setForm({ charge: c })} style={{ ...Sm.chip, flex: 1, ...(form.charge === c ? { background: '#1a1a1a', color: '#e4f816', borderColor: '#1a1a1a' } : {}) }}>{c}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={Sm.section}>
              <div style={Sm.sTitle}>Lieu</div>
              <input value={form.lieu} onChange={e => setForm({ lieu: e.target.value })} placeholder="Terrain, salle…" style={Sm.input} />
            </div>

            <div style={Sm.section}>
              <div style={Sm.sTitle}>Note</div>
              <textarea value={form.note} onChange={e => setForm({ note: e.target.value })} rows={3} style={{ ...Sm.input, resize: 'none', height: 72 }} />
            </div>

            {/* ── Section blocs (gauche) ── */}
            {hasBlocs && (
              <div style={{ padding: '14px 16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
                  <div style={Sm.sTitle}>Blocs</div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={addBloc} style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer' }}>+ Bloc</button>
                    <button onClick={addBlocSequences} style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer' }}>+ Déroulé jeu</button>
                  </div>
                </div>

                {panel.mode === 'create' && panel.blocs.length === 0 && (
                  <p style={{ fontSize: '.72rem', color: '#9aa1ac', fontStyle: 'italic' }}>Enregistre la séance d'abord.</p>
                )}

                {blocsWithPos.map((bloc, idx) => {
                  const color = BLOC_COLORS[idx % BLOC_COLORS.length]
                  const groups = {}
                  for (const exo of (bloc.exos || [])) {
                    const g = exo.groupe_label?.trim() || ''
                    ;(groups[g] ||= []).push(exo)
                  }
                  const gKeys = Object.keys(groups)
                  const hasGroups = gKeys.length > 1 || (gKeys.length === 1 && gKeys[0] !== '')
                  return (
                    <div key={bloc.id} style={{ marginBottom: 8, border: `1.5px solid ${color}35`, borderRadius: 10, overflow: 'hidden' }}>
                      {/* Tête colorée */}
                      <div style={{ background: color, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,.25)', color: '#fff', fontSize: '.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                        <input value={bloc.nom} onChange={e => updateBloc(bloc.id, { nom: e.target.value })} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '.78rem', fontWeight: 800, fontFamily: 'inherit', minWidth: 0 }} placeholder="Nom du bloc…" />
                        <input
                          type="number" min={5}
                          value={bloc.durationMin || ''}
                          onChange={e => { const v = parseInt(e.target.value); if (v >= 1) updateBloc(bloc.id, { duree: String(v) }) }}
                          style={{ width: 44, border: 'none', background: 'rgba(0,0,0,.2)', color: '#fff', borderRadius: 5, padding: '2px 5px', fontSize: '.75rem', fontWeight: 900, textAlign: 'center', outline: 'none', fontFamily: 'inherit', flexShrink: 0 }}
                        />
                        <span style={{ color: 'rgba(255,255,255,.65)', fontSize: '.62rem', fontWeight: 700, flexShrink: 0 }}>min</span>
                        <button onClick={() => deleteBloc(bloc.id)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 5, width: 20, height: 20, fontSize: '.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                      </div>

                      {/* Bloc séquences */}
                      {bloc.bloc_type === 'sequences' && (
                        <div style={{ padding:'8px 12px 12px' }}>
                          {/* Stats rapides */}
                          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                            {[
                              ['Jeu effectif', calcJeuEffectif(bloc.sequences), '#2f6f76'],
                              ['Total', calcDureeBloc(bloc.sequences), '#6b7280'],
                              bloc.conditions_jeu ? ['Conditions', bloc.conditions_jeu, '#92400e'] : null,
                            ].filter(Boolean).map(([lbl,val,color2]) => (
                              <span key={lbl} style={{ fontSize:'0.68rem', fontWeight:800, color:color2, background: color2+'15', padding:'2px 7px', borderRadius:6 }}>
                                {lbl} : {val}
                              </span>
                            ))}
                          </div>
                          {/* Timeline — drag & drop pour réordonner */}
                          <div style={{ display:'flex', alignItems:'center', gap:0, overflowX:'auto', paddingBottom:4, flexWrap:'nowrap' }}>
                            {(bloc.sequences || []).map((seq, si) => {
                              const isJeu = seq.type === 'jeu'
                              const isInterBloc = seq.type === 'inter_bloc'
                              const isSelected = selectedSeqId === seq.id
                              const bgNormal = isInterBloc ? '#fef3c7' : isJeu ? '#bfdbfe' : '#bbf7d0'
                              const bgSelected = isInterBloc ? '#fcd34d' : isJeu ? '#93c5fd' : '#86efac'
                              const borderCol = isInterBloc ? '#f59e0b' : isJeu ? '#60a5fa' : '#4ade80'
                              const textCol = isInterBloc ? '#92400e' : isJeu ? '#1e3a5f' : '#14532d'
                              const w = isInterBloc ? 62 : isJeu ? 84 : 54
                              return (
                                <React.Fragment key={seq.id}>
                                  <div
                                    draggable
                                    onDragStart={e => { dragSeqId.current = seq.id; e.dataTransfer.effectAllowed = 'move' }}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => { e.preventDefault(); reorderSequences(bloc.id, dragSeqId.current, seq.id) }}
                                    onClick={() => setSelectedSeqId(seq.id)}
                                    style={{
                                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                                      borderRadius:7, padding:'5px 4px', flexShrink:0, minHeight:50,
                                      width: w, cursor:'grab',
                                      background: isSelected ? bgSelected : bgNormal,
                                      border: `${isSelected ? 2 : 1.5}px solid ${borderCol}`,
                                      outline: isSelected ? `2px solid ${borderCol}` : 'none',
                                      outlineOffset: 1,
                                      transition:'background 0.1s',
                                      userSelect:'none',
                                    }}>
                                    <span style={{ fontSize:'0.6rem', color:'#c4ccd4', marginBottom:1 }}>⠿</span>
                                    {isInterBloc && <span style={{ fontSize:'0.58rem', fontWeight:800, color:'#78350f', textAlign:'center', lineHeight:1.1 }}>÷ série</span>}
                                    <span style={{ fontSize:'0.65rem', fontWeight:900, color: textCol }}>
                                      {formatSeqDur(seq.duree_sec)}
                                    </span>
                                    {!isInterBloc && seq.theme && <span style={{ fontSize:'0.55rem', fontWeight:800, color: isJeu?'#1d4ed8':'#15803d', textAlign:'center', textTransform:'uppercase', marginTop:1, lineHeight:1.1, maxWidth:76, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      {seq.theme}
                                    </span>}
                                  </div>
                                  {si < (bloc.sequences?.length||0)-1 && (
                                    <span style={{ color:'#d1d5db', fontSize:'0.7rem', padding:'0 2px', flexShrink:0 }}>›</span>
                                  )}
                                </React.Fragment>
                              )
                            })}
                            {/* Boutons ajouter */}
                            <span style={{ color:'#d1d5db', fontSize:'0.7rem', padding:'0 4px' }}>›</span>
                            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                              <button onClick={() => addSequence(bloc.id, 'jeu')}
                                style={{ padding:'4px 8px', minHeight:50, borderRadius:7, border:'1.5px dashed #93c5fd',
                                  background:'transparent', color:'#60a5fa', fontSize:'0.62rem', fontWeight:700, cursor:'pointer', lineHeight:1.3, whiteSpace:'nowrap' }}>
                                + Séq.
                              </button>
                              <button onClick={() => addSequence(bloc.id, 'recup')}
                                style={{ padding:'4px 8px', minHeight:50, borderRadius:7, border:'1.5px dashed #86efac',
                                  background:'transparent', color:'#22c55e', fontSize:'0.62rem', fontWeight:700, cursor:'pointer', lineHeight:1.3, whiteSpace:'nowrap' }}>
                                + Récup
                              </button>
                              <button onClick={() => addNouvelleSerie(bloc.id)}
                                style={{ padding:'4px 8px', minHeight:50, borderRadius:7, border:'1.5px dashed #f59e0b',
                                  background:'transparent', color:'#d97706', fontSize:'0.62rem', fontWeight:700, cursor:'pointer', lineHeight:1.3, whiteSpace:'nowrap' }}>
                                ÷ Nouvelle<br/>série
                              </button>
                            </div>
                          </div>

                          {/* Éditeur inline de la séquence sélectionnée */}
                          {selectedSeqId && (bloc.sequences||[]).find(s => s.id === selectedSeqId) && (() => {
                            const seq = (bloc.sequences||[]).find(s => s.id === selectedSeqId)
                            const isJeu = seq.type === 'jeu'
                            const isInterBloc = seq.type === 'inter_bloc'
                            const editorBg = isInterBloc ? '#fffbeb' : isJeu ? '#eff6ff' : '#f0fdf4'
                            const editorBorder = isInterBloc ? '#fcd34d' : isJeu ? '#bfdbfe' : '#bbf7d0'
                            const seqInpStyle = { border:'1.5px solid #e5e7eb', borderRadius:7, padding:'5px 8px', fontSize:'0.75rem', fontFamily:'inherit', color:'#1f2937', outline:'none', background:'#fff' }
                            return (
                              <div style={{ marginTop:8, background: editorBg, borderRadius:9, padding:'10px 12px', border:`1.5px solid ${editorBorder}`, display:'flex', flexWrap:'wrap', gap:8, alignItems:'flex-end' }}>
                                {/* Type — masqué pour inter_bloc */}
                                {!isInterBloc && (
                                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                  <span style={{ fontSize:'0.6rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em' }}>Type</span>
                                  <div style={{ display:'flex', gap:4 }}>
                                    {[['jeu','Séquence'],['recup','Récup.']].map(([v,l]) => (
                                      <button key={v} onClick={() => updateSequence(seq.id, { type:v })}
                                        style={{ padding:'4px 8px', borderRadius:6, border:`1.5px solid ${seq.type===v?(v==='jeu'?'#3b82f6':'#22c55e'):'#e5e7eb'}`, fontSize:'0.65rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                                          background: seq.type===v ? (v==='jeu'?'#dbeafe':'#dcfce7') : '#fff',
                                          color: seq.type===v ? (v==='jeu'?'#1d4ed8':'#15803d') : '#6b7280' }}>
                                        {l}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                )}
                                {isInterBloc && (
                                  <span style={{ fontSize:'0.72rem', fontWeight:800, color:'#92400e', alignSelf:'center' }}>÷ Récup inter-série</span>
                                )}
                                {/* Thème — masqué pour inter_bloc */}
                                {!isInterBloc && (
                                <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:100 }}>
                                  <span style={{ fontSize:'0.6rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em' }}>Thème</span>
                                  <input
                                    style={seqInpStyle}
                                    defaultValue={seq.theme || ''}
                                    placeholder={isJeu ? 'FIGHT, CONDITIONNÉ…' : 'Récupération'}
                                    onBlur={e => updateSequence(seq.id, { theme: e.target.value })}
                                  />
                                </div>
                                )}
                                {/* Durée */}
                                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                  <span style={{ fontSize:'0.6rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em' }}>Durée</span>
                                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                    <input
                                      style={{ ...seqInpStyle, width:56, textAlign:'center' }}
                                      type="number" min={0} max={59} placeholder="min"
                                      defaultValue={Math.floor((seq.duree_sec||0)/60)}
                                      onBlur={e => {
                                        const m = parseInt(e.target.value)||0
                                        const s = (seq.duree_sec||0) % 60
                                        updateSequence(seq.id, { duree_sec: m*60 + s })
                                      }}
                                    />
                                    <span style={{ fontSize:'0.7rem', color:'#9ca3af', fontWeight:700 }}>'</span>
                                    <input
                                      style={{ ...seqInpStyle, width:56, textAlign:'center' }}
                                      type="number" min={0} max={59} placeholder="sec"
                                      defaultValue={(seq.duree_sec||0) % 60}
                                      onBlur={e => {
                                        const s = parseInt(e.target.value)||0
                                        const m = Math.floor((seq.duree_sec||0)/60)
                                        updateSequence(seq.id, { duree_sec: m*60 + s })
                                      }}
                                    />
                                    <span style={{ fontSize:'0.7rem', color:'#9ca3af', fontWeight:700 }}>''</span>
                                  </div>
                                </div>
                                {/* Supprimer */}
                                <button onClick={() => deleteSequence(seq.id)}
                                  style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontSize:'0.68rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-end' }}>
                                  Supprimer
                                </button>
                                <button onClick={() => setSelectedSeqId(null)}
                                  style={{ padding:'5px 8px', borderRadius:7, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', fontSize:'0.68rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-end' }}>
                                  Fermer
                                </button>
                              </div>
                            )
                          })()}

                          {/* Footer infos bloc */}
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8, fontSize:'0.7rem', alignItems:'center' }}>
                            <span style={{ color:'#9ca3af' }}>Conditions :</span>
                            <input
                              defaultValue={bloc.conditions_jeu || ''}
                              onBlur={e => updateBloc(bloc.id, { conditions_jeu: e.target.value })}
                              placeholder="Plaqué / Touché…"
                              style={{ border:'1px solid #e5e7eb', borderRadius:6, padding:'2px 7px', fontSize:'0.7rem', fontFamily:'inherit', color:'#1f2937', outline:'none', width:140 }}
                            />
                            <span style={{ color:'#9ca3af', marginLeft:6 }}>Effectif :</span>
                            <input
                              defaultValue={bloc.effectif_desc || ''}
                              onBlur={e => updateBloc(bloc.id, { effectif_desc: e.target.value })}
                              placeholder="8c8, 7c7…"
                              style={{ border:'1px solid #e5e7eb', borderRadius:6, padding:'2px 7px', fontSize:'0.7rem', fontFamily:'inherit', color:'#1f2937', outline:'none', width:120 }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Exercices */}
                      {bloc.bloc_type !== 'sequences' && <div style={{ background: color + '0a', padding: '6px 8px 7px' }}>
                        {hasGroups ? (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                            {gKeys.map(gk => (
                              <div key={gk} style={{ flex: 1, borderRadius: 7, overflow: 'hidden', border: `1px solid ${color}25` }}>
                                {gk && <div style={{ fontSize: '.55rem', fontWeight: 900, textTransform: 'uppercase', color: '#fff', background: color + 'cc', padding: '2px 7px', textAlign: 'center' }}>{gk}</div>}
                                <div style={{ padding: '3px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {groups[gk].map(exo => (
                                    <div key={exo.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 5, padding: '3px 6px', border: `1px solid ${color}18` }}>
                                      <input key={`nom-${exo.id}`} defaultValue={exo.nom} onBlur={e => updateExo(bloc.id, exo.id, { nom: e.target.value })} placeholder="Exercice…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '.68rem', fontWeight: 700, color: '#1a1a1a', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                                      <input key={`pres-${exo.id}`} defaultValue={exo.prescription || ''} onBlur={e => updateExo(bloc.id, exo.id, { prescription: e.target.value })} placeholder="Charge…" style={{ width: 58, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.63rem', color: '#1a1a1a', padding: '1px 4px', outline: 'none', fontFamily: 'inherit' }} />
                                      <input key={`grp-${exo.id}`} defaultValue={exo.groupe_label || ''} onBlur={e => updateExo(bloc.id, exo.id, { groupe_label: e.target.value })} placeholder="Grp…" title="Groupe (ex: Avants, Arrières…)" style={{ width: 44, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.6rem', color: '#6b7280', padding: '1px 3px', outline: 'none', fontFamily: 'inherit' }} />
                                      <button onClick={() => deleteExo(bloc.id, exo.id)} style={{ background: 'none', border: 'none', color: '#c4c8d0', fontSize: '.85rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 5 }}>
                            {(bloc.exos || []).map(exo => (
                              <div key={exo.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', borderRadius: 6, padding: '4px 8px', border: `1px solid ${color}20` }}>
                                <input key={`nom-${exo.id}`} defaultValue={exo.nom} onBlur={e => updateExo(bloc.id, exo.id, { nom: e.target.value })} placeholder="Exercice…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '.7rem', fontWeight: 600, color: '#1a1a1a', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                                <input key={`pres-${exo.id}`} defaultValue={exo.prescription || ''} onBlur={e => updateExo(bloc.id, exo.id, { prescription: e.target.value })} placeholder="Charge…" style={{ width: 66, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.65rem', color: '#1a1a1a', padding: '2px 5px', outline: 'none', fontFamily: 'inherit' }} />
                                <input key={`grp-${exo.id}`} defaultValue={exo.groupe_label || ''} onBlur={e => updateExo(bloc.id, exo.id, { groupe_label: e.target.value })} placeholder="Groupe…" title="Groupe (ex: Avants, Arrières…)" style={{ width: 58, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.62rem', color: '#6b7280', padding: '2px 5px', outline: 'none', fontFamily: 'inherit' }} />
                                <button onClick={() => deleteExo(bloc.id, exo.id)} style={{ background: 'none', border: 'none', color: '#c4c8d0', fontSize: '.85rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={() => addExo(bloc.id)} style={{ width: '100%', background: 'none', border: `1.5px dashed ${color}50`, borderRadius: 6, color: color, fontSize: '.65rem', fontWeight: 700, padding: '4px', cursor: 'pointer', textAlign: 'center' }}>+ Exercice</button>
                      </div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Colonne timeline (visuelle) ── */}
          {hasBlocs && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f5f6f8', minHeight: 0 }}>

              {/* Stats */}
              <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #e0e3e8', background: '#fff', flexShrink: 0 }}>
                <span style={{ fontSize: '.62rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: '#6b7280' }}>Aperçu</span>
                <span style={{ fontSize: '.98rem', fontWeight: 900, color: '#1a1a1a' }}>{usedMin}</span>
                <span style={{ color: '#d1d5db' }}>/</span>
                <span style={{ fontSize: '.98rem', fontWeight: 900, color: '#7c3aed' }}>{totalMin || '—'}</span>
                <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#9aa1ac' }}>min</span>
                {totalMin > 0 && (
                  <div style={{ width: 90, height: 5, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: Math.min(100, usedMin / totalMin * 100) + '%', background: usedMin > totalMin ? 'linear-gradient(90deg,#ef4444,#dc2626)' : 'linear-gradient(90deg,#10b981,#06b6d4)', transition: 'width .3s' }} />
                  </div>
                )}
                <span style={{ fontSize: '.62rem', fontWeight: 700, color: usedMin > totalMin ? '#ef4444' : '#9aa1ac' }}>
                  {totalMin > 0 ? (usedMin > totalMin ? `⚠️ +${usedMin - totalMin} min` : `· ${totalMin - usedMin} min libres`) : ''}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '.62rem', color: '#b0b7c0', fontStyle: 'italic' }}>← glisser pour ajuster</span>
              </div>

              {/* Zone timeline sans scroll */}
              <div style={{ flex: 1, display: 'flex', gap: 10, padding: '12px 14px', minHeight: 0, overflow: 'hidden' }}>

                {/* Ruler */}
                <div style={{ width: 30, flexShrink: 0, position: 'relative', pointerEvents: 'none' }}>
                  {totalMin > 0 && Array.from({ length: Math.floor(totalMin / step) + 1 }, (_, i) => i * step).map(m => (
                    <div key={m} style={{ position: 'absolute', top: m * pxMin - 7, right: 0, left: 0, textAlign: 'right', paddingRight: 4, fontSize: '.55rem', fontWeight: 700, color: '#c4c8d0' }}>
                      {m === 0 ? '0' : m + '\''}
                    </div>
                  ))}
                </div>

                {/* Blocs area */}
                <div ref={blocksAreaRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>

                  {/* Grid lines */}
                  {totalMin > 0 && Array.from({ length: Math.floor(totalMin / step) + 1 }, (_, i) => i * step).map(m => (
                    <div key={m} style={{ position: 'absolute', top: m * pxMin, left: 0, right: 0, height: 1, background: m % (step * 2) === 0 ? '#d5d8df' : '#eaecf0', pointerEvents: 'none' }} />
                  ))}

                  {/* Blocs */}
                  {panel.mode === 'create' && panel.blocs.length === 0 && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: '.8rem', color: '#9aa1ac', fontStyle: 'italic' }}>Enregistre la séance pour ajouter des blocs.</span>
                    </div>
                  )}

                  {blocsWithPos.map((bloc, idx) => {
                    const color = BLOC_COLORS[idx % BLOC_COLORS.length]
                    const top = bloc.startMin * pxMin
                    const height = bloc.durationMin * pxMin
                    const groups = {}
                    for (const exo of (bloc.exos || [])) {
                      const g = exo.groupe_label?.trim() || ''
                      ;(groups[g] ||= []).push(exo)
                    }
                    const gKeys = Object.keys(groups)
                    const hasGroups = gKeys.length > 1 || (gKeys.length === 1 && gKeys[0] !== '')

                    return (
                      <div key={bloc.id} style={{ position: 'absolute', left: 0, right: 0, top, height: Math.max(height, 6), borderRadius: 8, overflow: 'visible' }}>
                        <div style={{ height: '100%', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: `linear-gradient(155deg, ${color}, ${color}cc)`, boxShadow: `0 2px 10px ${color}44` }}>
                          {/* En-tête */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', flexShrink: 0, overflow: 'hidden', borderBottom: height > 30 ? '1px solid rgba(255,255,255,.15)' : 'none' }}>
                            <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,.25)', color: '#fff', fontSize: '.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                            <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bloc.nom}</span>
                            <span style={{ fontSize: '.6rem', fontWeight: 900, color: 'rgba(255,255,255,.8)', background: 'rgba(0,0,0,.2)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>{bloc.durationMin}'</span>
                          </div>
                          {/* Exercices (lecture seule, proportionnels) */}
                          {height > 30 && (
                            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.08)', minHeight: 0, justifyContent: (bloc.exos || []).length === 0 ? 'center' : 'flex-start', alignItems: (bloc.exos || []).length === 0 ? 'center' : 'stretch' }}>
                              {(bloc.exos || []).length === 0 && (
                                <span style={{ fontSize: Math.min(height * 0.4, 36) + 'px', fontWeight: 900, color: 'rgba(255,255,255,.35)', lineHeight: 1 }}>{idx + 1}</span>
                              )}
                              {hasGroups ? (
                                <div style={{ display: 'flex', height: '100%', gap: 2, padding: '2px 5px 3px' }}>
                                  {gKeys.map(gk => (
                                    <div key={gk} style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,.2)', minWidth: 0 }}>
                                      {gk && <div style={{ fontSize: '.48rem', fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,.9)', background: 'rgba(0,0,0,.2)', padding: '1px 5px', textAlign: 'center', flexShrink: 0 }}>{gk}</div>}
                                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2px 3px', gap: 2, minHeight: 0 }}>
                                        {groups[gk].map(exo => (
                                          <div key={exo.id} style={{ flex: 1, background: 'rgba(255,255,255,.85)', borderRadius: 4, padding: '0 5px', display: 'flex', alignItems: 'center', gap: 4, minHeight: 0, overflow: 'hidden' }}>
                                            <span style={{ flex: 1, fontSize: '.6rem', fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exo.nom}</span>
                                            {exo.prescription && <span style={{ fontSize: '.55rem', fontWeight: 800, color: '#fff', background: color, padding: '0 4px', borderRadius: 3, flexShrink: 0 }}>{exo.prescription}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2px 5px 3px', gap: 2, minHeight: 0 }}>
                                  {(bloc.exos || []).map(exo => (
                                    <div key={exo.id} style={{ flex: 1, background: 'rgba(255,255,255,.85)', borderRadius: 4, padding: '0 6px', display: 'flex', alignItems: 'center', gap: 5, minHeight: 0, overflow: 'hidden' }}>
                                      <span style={{ flex: 1, fontSize: '.6rem', fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exo.nom}</span>
                                      {exo.prescription && <span style={{ fontSize: '.55rem', fontWeight: 800, color: '#fff', background: color, padding: '0 4px', borderRadius: 3, flexShrink: 0 }}>{exo.prescription}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Handle drag */}
                        <div onMouseDown={e => startDrag(e, bloc)} style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 36, height: 9, background: 'rgba(255,255,255,.45)', border: '1.5px solid rgba(255,255,255,.75)', borderRadius: 5, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, userSelect: 'none' }}>
                          <div style={{ width: 16, height: 2, background: 'rgba(80,80,80,.45)', borderRadius: 2 }} />
                        </div>
                      </div>
                    )
                  })}

                  {/* Zone non planifiée */}
                  {totalMin > 0 && usedMin < totalMin && (totalMin - usedMin) * pxMin >= 10 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: usedMin * pxMin, height: (totalMin - usedMin) * pxMin, pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(100,80,200,.04) 5px, rgba(100,80,200,.04) 10px)', border: '1.5px dashed #c4b5fd' }} />
                      {(totalMin - usedMin) * pxMin >= 20 && <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: '.62rem', fontWeight: 700, color: '#7c3aed' }}>{totalMin - usedMin} min non planifiées</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ background: '#fff', borderTop: '1px solid #e0e3e8', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {panel.mode === 'edit' && <button onClick={deleteEvent} disabled={saving} style={{ background: 'none', border: '1.5px solid #fecaca', color: '#ef4444', borderRadius: 8, padding: '7px 16px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>}
          <button onClick={closePanel} style={{ marginLeft: 'auto', background: '#f3f4f6', border: 'none', color: '#6b7280', borderRadius: 8, padding: '7px 18px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>Fermer</button>
          <button onClick={saveEvent} disabled={saving} style={{ background: '#1a1a1a', border: 'none', color: '#e4f816', borderRadius: 8, padding: '8px 26px', fontSize: '.78rem', fontWeight: 800, cursor: 'pointer' }}>
            {saving ? '…' : panel.mode === 'create' ? 'Créer' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </>
  )
}

const Sm = {
  section: { padding: '14px 16px', borderBottom: '1px solid #f0f2f5' },
  sTitle: { fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: '#9aa1ac', marginBottom: 10 },
  fLabel: { fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#b0b7c0', marginBottom: 4 },
  input: { width: '100%', border: '1.5px solid #e4e7ec', borderRadius: 8, padding: '7px 10px', fontSize: '.8rem', fontWeight: 600, color: '#1a1a1a', background: '#f8f9fb', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  chip: { border: '1.5px solid #e0e3e8', background: '#f8f9fb', color: '#6b7280', borderRadius: 7, padding: '5px 10px', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer' },
}

/* ── Sous-composants ── */
function Stat({ v, l, color }) {
  return <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: color || '#15181d' }}>{v}</span>
    <span style={{ fontSize: '0.64rem', color: '#9aa1ac', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{l}</span>
  </div>
}
function Leg({ c, t }) {
  return <div style={{ fontSize: '0.64rem', color: '#5b626c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{t}
  </div>
}

/* ── Styles ── */
const S = {
  page: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '20px 24px 40px', background: '#f5f6f8', minHeight: 'calc(100vh - 60px)', color: '#15181d' },
  pageEmbed: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#15181d' },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  h1: { fontSize: '1.3rem', fontWeight: 800, margin: 0 },
  groupSel: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '4px 10px' },
  select: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#15181d', cursor: 'pointer' },
  btn: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 600, color: '#5b626c', cursor: 'pointer' },
  btnDark: { background: '#333333', color: '#fff', border: '1px solid #333333', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' },
  btnGhostDanger: { border: '1px solid #f3c2c8', background: '#fff', color: '#e11d48', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginRight: 'auto' },
  btnSmall: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 7, padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#5b626c', cursor: 'pointer' },
  summary: { display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, flexWrap: 'wrap' },
  sep: { width: 1, height: 26, background: '#e6e8ec' },
  phrow: { display: 'flex', minWidth: 'max-content', border: '1px solid #e6e8ec', borderBottom: 'none', borderRadius: '11px 11px 0 0', overflow: 'hidden', background: '#fafbfc' },
  phseg: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 24, fontSize: '0.58rem', fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.25)' },
  gridwrap: { overflowX: 'auto', border: '1px solid #e6e8ec', borderRadius: '0 0 11px 11px', background: '#fff' },
  grid: { display: 'flex', minWidth: 'max-content' },
  mcol: { flex: 1, minWidth: 108, borderRight: '1px solid #e6e8ec' },
  mch: { position: 'sticky', top: 0, zIndex: 5, textAlign: 'center', padding: '7px 4px 6px', background: '#fbfcfd', borderBottom: '1px solid #e6e8ec' },
  mm: { fontSize: '0.74rem', fontWeight: 800 },
  my: { fontSize: '0.5rem', fontWeight: 700, color: '#9aa1ac', letterSpacing: '0.04em' },
  drow: { display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #eef0f3', minHeight: 20 },
  drowVac: { background: '#fdf8ea' },
  drowToday: { boxShadow: 'inset 0 0 0 2px #333333', position: 'relative', zIndex: 2 },
  drowDrop: { background: '#eaf7ec', boxShadow: 'inset 0 0 0 2px #34c759', position: 'relative', zIndex: 3 },
  drowSel:  { background: '#e0e7ff', boxShadow: 'inset 0 0 0 1px #818cf8' },
  blank: { display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #eef0f3', minHeight: 20, background: 'repeating-linear-gradient(45deg,#fafbfc,#fafbfc 5px,#f1f3f5 5px,#f1f3f5 10px)' },
  dnum: { width: 17, fontSize: '0.56rem', color: '#5b626c', textAlign: 'center', fontWeight: 700, lineHeight: '20px', borderRight: '1px solid #eef0f3', flexShrink: 0 },
  ddow: { width: 13, fontSize: '0.52rem', color: '#9aa1ac', textAlign: 'center', lineHeight: '20px', textTransform: 'uppercase', flexShrink: 0 },
  vacband: { fontSize: '0.5rem', fontWeight: 800, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '1px 5px', background: '#f4e8c4', lineHeight: 1.6 },
  weekSep: { borderTop: '2px solid #c4ccd4' },
  weekTag: { fontSize: '0.5rem', fontWeight: 800, color: '#8a93a0', letterSpacing: '0.04em', padding: '1px 5px', background: '#f0f2f5', lineHeight: 1.5 },
  scrim: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,0.4)', zIndex: 50 },
  panel: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '94vw', background: '#f5f6f8', zIndex: 60, display: 'flex', flexDirection: 'column', boxShadow: '-16px 0 50px rgba(0,0,0,0.22)' },
  phead: { background: '#fff', padding: '16px 20px 14px', borderBottom: '1px solid #e6e8ec' },
  tag: { fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 5, color: '#fff' },
  pbody: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  pactions: { display: 'flex', gap: 9, padding: '13px 20px', background: '#fff', borderTop: '1px solid #e6e8ec' },
  typeCard: { display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '9px 9px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', color: '#15181d', justifyContent: 'center' },
  chip: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', color: '#15181d' },
  input: { width: '100%', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px 10px', fontSize: '0.82rem', color: '#15181d', boxSizing: 'border-box', background: '#fff' },
  inputSm: { border: '1px solid #e6e8ec', borderRadius: 7, padding: '6px 8px', fontSize: '0.76rem', color: '#15181d', boxSizing: 'border-box', background: '#fff', width: '100%' },
  bloc: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 9, padding: 11, marginBottom: 8 },
  xBtn: { border: 'none', background: 'none', color: '#c2c8d0', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  ctxMenu: { position: 'fixed', zIndex: 70, background: '#fff', borderRadius: 10, border: '1px solid #e6e8ec', boxShadow: '0 12px 34px rgba(0,0,0,0.18)', padding: 5, minWidth: 170, display: 'flex', flexDirection: 'column' },
  ctxItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 7, padding: '8px 11px', fontSize: '0.8rem', fontWeight: 600, color: '#15181d', cursor: 'pointer' },
  ctxSep: { height: 1, background: '#eef0f3', margin: '4px 0' },
  // barre d'action de sélection
  selBar:      { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', background: '#fff', border: '1px solid #e6e8ec', borderRadius: 12, padding: '8px 12px', marginTop: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' },
  selBarLabel: { fontSize: '0.74rem', fontWeight: 800, color: '#333333', textTransform: 'capitalize', marginRight: 4 },
  selBarBtn:   { background: '#f3f4f6', border: '1px solid #e6e8ec', borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, color: '#333333', cursor: 'pointer', whiteSpace: 'nowrap' },
  selBarClose: { background: 'none', border: 'none', color: '#9aa1ac', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1, padding: '0 4px', marginLeft: 'auto' },
  selBarInput: { border: '1px solid #e6e8ec', borderRadius: 8, padding: '6px 9px', fontSize: '0.78rem', color: '#15181d', outline: 'none', minWidth: 180 },
  // jours passés
  drowPast:    { background: '#fafafa' },
  dnumPast:    { color: '#c4ccd4' },
  weekTagPast: { background: '#f3f4f6', color: '#c4ccd4' },
  // bulle de création
  popScrim: { position: 'fixed', inset: 0, zIndex: 68, background: 'transparent' },
  popover: { position: 'fixed', zIndex: 69, width: 272, background: '#fff', borderRadius: 12, border: '1px solid #e6e8ec', boxShadow: '0 16px 44px rgba(0,0,0,0.22)', padding: 12 },
  popHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  popDate: { fontSize: '0.72rem', fontWeight: 800, color: '#15181d', textTransform: 'capitalize' },
  popTypes: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 9 },
  popType: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 7, padding: '7px 4px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', color: '#15181d' },
  popInput: { width: '100%', border: '1px solid #e6e8ec', borderRadius: 8, padding: '7px 9px', fontSize: '0.8rem', color: '#15181d', boxSizing: 'border-box', background: '#fff', marginBottom: 8 },
  popCats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 },
  popCat: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 7, padding: '6px 6px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', color: '#15181d' },
  popPaste: { width: '100%', background: '#f5f6f8', border: '1px solid #e6e8ec', borderRadius: 8, padding: '7px', fontSize: '0.74rem', fontWeight: 700, color: '#5b626c', cursor: 'pointer', marginBottom: 8 },
  popActions: { display: 'flex', gap: 7 },
  popGhost: { flex: 1, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px', fontSize: '0.76rem', fontWeight: 600, color: '#5b626c', cursor: 'pointer' },
  popCreate: { flex: 1, background: '#333333', border: '1px solid #333333', borderRadius: 8, padding: '8px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' },
}
