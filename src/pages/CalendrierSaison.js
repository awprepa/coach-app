import { useEffect, useRef, useState, useCallback } from 'react'
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
      .select('*, groupe_seance_exercices(*)').eq('evenement_id', evtId).order('ordre')
    return (data || []).map(b => ({ ...b, exos: (b.groupe_seance_exercices || []).sort((a, z) => a.ordre - z.ordre) }))
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
    await openWeekZoom(cur.toISOString().slice(0, 10))
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
      const newDate = nd.toISOString().slice(0, 10)
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
            return <div key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title="Tests" style={{ background: T.color, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap', opacity: dragOpacity }}>{e.titre || T.label}</div>
          }
          const neutral = T.neutral
          const txt = e.type === 'entrainement' ? (e.style || e.titre || T.label) : (e.titre || T.short || T.label)
          return (
            <div key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title={T.label}
              style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '0 5px', lineHeight: '20px', cursor: 'grab',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', opacity: dragOpacity,
                color: neutral ? '#5b626c' : '#3a4049',
                background: neutral ? '#f0f2f5' : `color-mix(in srgb, ${T.color} 9%, #fff)`,
                borderLeft: `3px solid ${neutral ? '#c4ccd4' : `color-mix(in srgb, ${T.color} 70%, #fff)`}`,
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

  return (
    <div style={pageStyle}>
      {/* ── Barre d'actions ── */}
      <div style={S.toolbar}>
        {!embedded && <h1 style={S.h1}>Calendrier saison</h1>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: embedded ? 0 : 'auto' }}>
          {!groupeId && (
            <div style={S.groupSel}>
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
          <button style={S.btnDark} onClick={() => openCreate()}><span style={{ color: '#e4f816' }}>+</span> Ajouter</button>
        </div>
      </div>

      {/* ── Résumé + légende ── */}
      <div style={S.summary}>
        <Stat v={matchsList.length} l="Matchs" />
        <span style={S.sep} />
        <Stat v={evenements.filter(e => e.type === 'entrainement').length} l="Entraînements" />
        <span style={S.sep} />
        <Stat v={evenements.length} l="Évènements" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 13, flexWrap: 'wrap' }}>
          {MATCH_CATEGORIES.map(cat => (
            <Leg key={cat} c={matchCatColor(cat, groupColor)} t={cat} />
          ))}
          <span style={S.sep} />
          <Leg c={TYPES.entrainement.color} t="Entraînement" />
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
          <div style={S.gridwrap}>
            <div style={S.grid}>
              {months.map(M => {
                const ph = phaseOfMonth(M.y, M.m)
                return (
                  <div key={`${M.y}-${M.m}`} style={S.mcol}>
                    <div style={{ ...S.mch, borderTop: `3px solid ${ph?.couleur || '#e6e8ec'}` }}>
                      <div style={S.mm}>{M.label}</div><div style={S.my}>{M.y}</div>
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

      {panel && <div style={S.scrim} onClick={closePanel} />}
      {panel && (
        <div style={S.panel}>
          <PanelHead panel={panel} groupColor={groupColor} onClose={closePanel} />
          <div style={S.pbody}>
            <EventForm form={panel.form} setForm={setForm} groupColor={groupColor} />
            {(HAS_BLOCS.includes(panel.form.type) || panel.form.type === 'collectif') && (
              <BlocsEditor panel={panel} addBloc={addBloc} updateBloc={updateBloc} deleteBloc={deleteBloc}
                addExo={addExo} updateExo={updateExo} deleteExo={deleteExo} />
            )}
          </div>
          <div style={S.pactions}>
            {panel.mode === 'edit' && <button style={S.btnGhostDanger} onClick={deleteEvent} disabled={saving}>Supprimer</button>}
            <button style={S.btn} onClick={closePanel}>Fermer</button>
            <button style={S.btnDark} onClick={saveEvent} disabled={saving}>
              <span style={{ color: '#e4f816' }}>{saving ? '…' : panel.mode === 'create' ? 'Créer' : 'Enregistrer'}</span>
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

  // Palette de couleurs pour les blocs à l'intérieur d'une séance
  const BLOC_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16']
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
          </div>
        </div>

        {/* Phases (blocs) */}
        {blocs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {(() => {
              const totalMins = blocs.reduce((sum, b) => sum + (parseDurMin(b.duree) || 0), 0)
              const PX_PER_MIN = 2
              const MAX_TOTAL = 160
              const rawH = totalMins * PX_PER_MIN
              const scale = rawH > MAX_TOTAL ? MAX_TOTAL / rawH : 1
              return blocs.map((bloc, idx) => {
              const bc = blocColor(idx)
              const mins = parseDurMin(bloc.duree)
              // height fixe (pas minHeight) pour que la proportion soit toujours visible
              const h = mins ? Math.max(22, Math.round(mins * PX_PER_MIN * scale)) : 36

              const byGroup = {}
              for (const exo of (bloc.exos || [])) {
                const g = exo.groupe_label?.trim() || ''
                ;(byGroup[g] ||= []).push(exo)
              }
              const groupKeys = Object.keys(byGroup)
              const hasGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== '')

              return (
                <div key={bloc.id} style={{ borderTop: idx > 0 ? `1px solid #e6e8ec` : 'none' }}>
                  {/* En-tête phase */}
                  <div style={{ padding: '7px 12px', background: bc + '18', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: bc, color: '#fff', fontSize: '.7rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 1px 4px ${bc}55` }}>{idx + 1}</span>
                    <span style={{ fontSize: '.78rem', fontWeight: 800, color: '#1a1a1a', flex: 1 }}>{bloc.nom}</span>
                    {bloc.duree && <span style={{ fontSize: '.67rem', fontWeight: 900, color: '#fff', background: bc, borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>{bloc.duree}</span>}
                  </div>

                  {/* Exercices */}
                  {bloc.exos?.length > 0 && (
                    <div style={{ height: h, overflowY: 'auto', padding: '6px 10px', background: bc + '08', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {hasGroups ? (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${groupKeys.length}, 1fr)`, gap: 5, alignItems: 'start' }}>
                          {groupKeys.map(g => (
                            <div key={g} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${bc}30` }}>
                              {g && <div style={{ fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', color: '#fff', background: bc + 'bb', padding: '3px 8px', textAlign: 'center' }}>{g}</div>}
                              <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 3, background: bc + '08' }}>
                                {byGroup[g].map(exo => (
                                  <div key={exo.id} style={{ background: '#fff', borderRadius: 7, padding: '6px 9px', border: `1px solid ${bc}30` }}>
                                    <div style={{ fontSize: '.73rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1.3 }}>{exo.nom}</div>
                                    {exo.prescription && <div style={{ fontSize: '.67rem', color: bc, fontWeight: 800, marginTop: 3 }}>{exo.prescription}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {bloc.exos.map(exo => (
                            <div key={exo.id} style={{ background: '#fff', borderRadius: 8, padding: '8px 11px', border: `1px solid ${bc}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#1a1a1a', flex: 1, lineHeight: 1.35 }}>{exo.nom}</span>
                              {exo.prescription && <span style={{ fontSize: '.68rem', color: '#fff', fontWeight: 900, flexShrink: 0, background: bc, borderRadius: 5, padding: '2px 7px' }}>{exo.prescription}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {!bloc.exos?.length && (
                    <div style={{ height: h, background: bc + '08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '.75rem', fontWeight: 800, color: bc, opacity: 0.55 }}>{bloc.nom}</span>
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
      <div style={{ background: matchEvt ? '#f8fffe' : isToday ? '#fffef5' : '#fff', display: 'flex', flexDirection: 'column' }}>
        {/* En-tête colonne */}
        <div style={{ padding: '10px 12px 8px', borderBottom: `3px solid ${borderColor}`, textAlign: 'center' }}>
          <div style={{ fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9aa1ac' }}>{DOW_FR[day.dow]}</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: isToday ? borderColor : '#15181d', lineHeight: 1.1 }}>{dd}</div>
          <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: borderColor, marginTop: 2 }}>{typeLabel}</div>
          {isToday && <div style={{ display: 'inline-block', fontSize: '.52rem', fontWeight: 800, background: '#e4f816', color: '#333', borderRadius: 4, padding: '1px 5px', marginTop: 2 }}>Aujourd'hui</div>}
        </div>

        {/* Séances */}
        <div style={{ padding: '10px 10px 14px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
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

  const cols = activeDays.length || 1
  const Pill = ({ color, label }) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.1)', borderRadius: 7, padding: '3px 9px', fontSize: '.67rem', fontWeight: 700, color: 'rgba(255,255,255,.75)' }}>
      <span style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />{label}
    </span>
  )

  return (
    <>
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
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 1, background: '#d8dce4', alignItems: 'start' }}>
            {activeDays.map(day => <DayColumn key={day.date} day={day} />)}
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

/* ── Sous-composants ── */
function Stat({ v, l }) {
  return <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{v}</span>
    <span style={{ fontSize: '0.64rem', color: '#9aa1ac', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{l}</span>
  </div>
}
function Leg({ c, t }) {
  return <div style={{ fontSize: '0.64rem', color: '#5b626c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{t}
  </div>
}
function PanelHead({ panel, groupColor, onClose }) {
  const T = TYPES[panel.form.type] || TYPES.autre
  const col = panel.form.type === 'match' ? groupColor : (T.color || '#5b626c')
  const titre = panel.form.type === 'entrainement'
    ? (panel.form.style || panel.form.titre || T.label)
    : (panel.form.titre || panel.form.adversaire || T.label)
  return (
    <div style={S.phead}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...S.tag, background: col }}>{T.label}</span>
        <span style={{ color: '#9aa1ac', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }} onClick={onClose}>×</span>
      </div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '11px 0 2px' }}>
        {panel.mode === 'create' ? 'Nouvel évènement' : titre}
      </h2>
    </div>
  )
}
function Field({ label, children }) {
  return <label style={{ display: 'block', marginBottom: 11 }}>
    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 4 }}>{label}</span>
    {children}
  </label>
}
function EventForm({ form, setForm, groupColor }) {
  return (
    <div>
      <Field label="Type">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
          {CREATE_TYPES.map(k => {
            const t = TYPES[k]
            return (
              <button key={k} onClick={() => setForm({ type: k })}
                style={{ ...S.typeCard, ...(form.type === k ? { borderColor: '#15181d', background: '#f7f8fa' } : null) }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: k === 'match' ? groupColor : (t.color || '#cbd1d9') }} />
                {t.label}
              </button>
            )
          })}
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Date"><input type="date" value={form.date} onChange={e => setForm({ date: e.target.value })} style={S.input} /></Field>
        <Field label="Heure"><input type="time" value={form.heure} onChange={e => setForm({ heure: e.target.value })} style={S.input} /></Field>
      </div>

      {form.type === 'match' && (
        <>
          <Field label="Adversaire"><input value={form.adversaire} onChange={e => setForm({ adversaire: e.target.value })} placeholder="ex. Montauban" style={S.input} /></Field>
          <Field label="Catégorie">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {MATCH_CATEGORIES.map(c => (
                <button key={c} onClick={() => setForm({ categorie: c })}
                  style={{ ...S.chip, ...(form.categorie === c ? { borderColor: '#15181d', background: '#15181d', color: '#fff' } : null) }}>
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Lieu du match">
              <select value={form.domicile ? '1' : '0'} onChange={e => setForm({ domicile: e.target.value === '1' })} style={S.input}>
                <option value="1">Domicile</option><option value="0">Extérieur</option>
              </select>
            </Field>
            <Field label="Journée"><input value={form.journee} onChange={e => setForm({ journee: e.target.value })} placeholder="ex. J12" style={S.input} /></Field>
          </div>
        </>
      )}

      {form.type === 'entrainement' && (
        <>
          <Field label="Style d'entraînement"><input value={form.style} onChange={e => setForm({ style: e.target.value })} placeholder="ex. Vitesse, Collectif, Prévention…" style={S.input} /></Field>
          <Field label="Titre (optionnel)"><input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Travail d'appuis" style={S.input} /></Field>
        </>
      )}

      {form.type === 'muscu' && (
        <Field label="Titre"><input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Force max bas du corps" style={S.input} /></Field>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="Lieu"><input value={form.lieu} onChange={e => setForm({ lieu: e.target.value })} placeholder="Salle…" style={S.input} /></Field>
        <Field label="Durée (min)"><input type="number" value={form.duree_min} onChange={e => setForm({ duree_min: e.target.value })} style={S.input} /></Field>
        <Field label="Charge"><input value={form.charge} onChange={e => setForm({ charge: e.target.value })} placeholder="Haute…" style={S.input} /></Field>
      </div>
      <Field label="Note"><textarea value={form.note} onChange={e => setForm({ note: e.target.value })} rows={2} style={{ ...S.input, resize: 'vertical' }} /></Field>
    </div>
  )
}
function BlocsEditor({ panel, addBloc, updateBloc, deleteBloc, addExo, updateExo, deleteExo }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Déroulé en blocs</span>
        <button style={S.btnSmall} onClick={addBloc}>+ Bloc</button>
      </div>
      {panel.mode === 'create' && <p style={{ fontSize: '0.72rem', color: '#9aa1ac' }}>Enregistre la séance pour construire son déroulé.</p>}
      {panel.blocs.map(b => (
        <div key={b.id} style={S.bloc}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 6 }}>
            <input value={b.nom} onChange={e => updateBloc(b.id, { nom: e.target.value })} placeholder="Nom du bloc" style={{ ...S.input, flex: 1, fontWeight: 700 }} />
            <input value={b.duree || ''} onChange={e => updateBloc(b.id, { duree: e.target.value })} placeholder="durée" style={{ ...S.input, width: 70 }} />
            <button style={S.xBtn} onClick={() => deleteBloc(b.id)}>×</button>
          </div>
          {b.exos.map(x => (
            <div key={x.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px auto', gap: 6, marginBottom: 5 }}>
              <input value={x.nom} onChange={e => updateExo(b.id, x.id, { nom: e.target.value })} placeholder="Exercice" style={S.inputSm} />
              <input value={x.prescription || ''} onChange={e => updateExo(b.id, x.id, { prescription: e.target.value })} placeholder="5 × 4 @ 85 %" style={S.inputSm} />
              <input value={x.groupe_label || ''} onChange={e => updateExo(b.id, x.id, { groupe_label: e.target.value })} placeholder="Groupe…" style={{ ...S.inputSm, fontSize: '0.68rem', color: '#7a8290' }} title="Groupe d'activité (ex : Avants, Arrières, Groupe A…)" />
              <button style={S.xBtn} onClick={() => deleteExo(b.id, x.id)}>×</button>
            </div>
          ))}
          <button style={{ ...S.btnSmall, width: '100%', marginTop: 4 }} onClick={() => addExo(b.id)}>+ Exercice</button>
        </div>
      ))}
    </div>
  )
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
