import { useEffect, useState, useRef, Fragment } from 'react'
import SeanceAIModal from '../components/SeanceAIModal'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { autoLinkBiblio } from '../utils/exerciceMatch'
import { searchFreeExDB } from '../utils/freeExerciseDB'

function newId() { return Math.random().toString(36).slice(2) }
function youtubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

/* ── WorkoutX GIF helpers (échauffement) ─────────────────────────────────── */
function AuthGif({ url, apiKey, style, alt }) {
  const [src, setSrc] = useState(null)
  const objRef = useRef(null)
  useEffect(() => {
    if (!url || !apiKey) return
    let mounted = true
    fetch(url, { headers: { 'X-WorkoutX-Key': apiKey } })
      .then(r => r.blob())
      .then(blob => {
        if (!mounted) return
        if (objRef.current) URL.revokeObjectURL(objRef.current)
        const u = URL.createObjectURL(blob)
        objRef.current = u
        setSrc(u)
      })
      .catch(() => {})
    return () => {
      mounted = false
      if (objRef.current) { URL.revokeObjectURL(objRef.current); objRef.current = null }
    }
  }, [url, apiKey])
  if (!src) return <div style={{ ...style, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ opacity: 0.4 }}>…</span></div>
  return <img src={src} alt={alt} style={{ ...style, objectFit: 'cover', display: 'block' }} />
}

function frToEnEchauff(nom) {
  const rules = [
    [/soulevé de terre roumain/gi,'romanian deadlift'],[/soulevé de terre/gi,'deadlift'],
    [/développé couché prise serrée/gi,'close grip bench press'],[/développé couché/gi,'bench press'],
    [/développé incliné/gi,'incline bench press'],[/développé décliné/gi,'decline bench press'],
    [/développé militaire/gi,'overhead press'],[/développé/gi,'press'],
    [/tirage horizontal/gi,'seated row'],[/tirage nuque/gi,'lat pulldown behind neck'],
    [/tirage poitrine/gi,'lat pulldown'],[/tirage vertical/gi,'lat pulldown'],[/tirage/gi,'row'],
    [/tractions? prise serrée/gi,'close grip pull up'],[/tractions? pronation/gi,'pull up'],
    [/tractions? supination/gi,'chin up'],[/tractions?/gi,'pull up'],
    [/élévations? latérales?/gi,'lateral raise'],[/élévations? frontales?/gi,'front raise'],
    [/élévations? postérieures?/gi,'rear delt raise'],[/écarté couché/gi,'chest fly'],
    [/écarté incliné/gi,'incline fly'],[/écarté/gi,'fly'],
    [/curl marteau/gi,'hammer curl'],[/curl incliné/gi,'incline curl'],
    [/curl concentré/gi,'concentration curl'],[/curl/gi,'curl'],
    [/extension nuque/gi,'skull crusher'],[/extension tricep/gi,'tricep extension'],
    [/extension/gi,'extension'],[/leg press/gi,'leg press'],[/leg curl/gi,'leg curl'],
    [/mollets? debout/gi,'standing calf raise'],[/mollets? assis/gi,'seated calf raise'],
    [/mollets?/gi,'calf raise'],[/fentes? marchées?/gi,'walking lunge'],
    [/fentes? bulgares?/gi,'bulgarian split squat'],[/fentes?/gi,'lunge'],
    [/squat goblet/gi,'goblet squat'],[/squat bulgare/gi,'bulgarian split squat'],
    [/squat sumo/gi,'sumo squat'],[/squat/gi,'squat'],
    [/hip thrust/gi,'hip thrust'],[/rowing/gi,'row'],[/gainage/gi,'plank'],
    [/pompes?/gi,'push up'],[/dips?/gi,'dip'],[/presse cuisse/gi,'leg press'],
    [/presse/gi,'press'],[/haltères?/gi,'dumbbell'],[/barre/gi,'barbell'],
    [/câble|poulie/gi,'cable'],[/smith/gi,'smith machine'],
    [/incliné/gi,'incline'],[/décliné/gi,'decline'],[/couché/gi,'lying'],
    [/debout/gi,'standing'],[/assis/gi,'seated'],
    [/unilatéral|uni\b/gi,'single arm'],[/bilatéral/gi,''],
    [/prise large/gi,'wide grip'],[/prise serrée/gi,'close grip'],
    [/prise neutre/gi,'neutral grip'],[/prise inversée/gi,'reverse grip'],
  ]
  let s = nom
  for (const [p, r] of rules) s = s.replace(p, r)
  return s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim()
}

export default function Seance() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  // exercicesRef supprimé — la progression utilise maintenant progDraft (state contrôlé)
  const [charges, setCharges] = useState({})
  const [trackingMap, setTrackingMap] = useState({})
  const [serieTrackingMap, setSerieTrackingMap] = useState({}) // { [exId]: { [semaine]: [{ serie, poids, reps_reelles, valide }] } }
  const [rpeSeances, setRpeSeances] = useState({})
  const [semaines, setSemaines] = useState(4)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '', bibliotheque_id: null, media_url: '' })
  const [enEdition, setEnEdition] = useState(null)
  const [formEdition, setFormEdition] = useState({})
  const [showProgressionFor, setShowProgressionFor] = useState(null) // exercice id
  const [showWarmupFor, setShowWarmupFor]           = useState(null) // exercice id
  const [showSeriesFor, setShowSeriesFor]           = useState(null) // exercice id
  const [biblioEchauffOpen, setBiblioEchauffOpen]  = useState(null) // exercice id
  const [biblioEchauffList, setBiblioEchauffList]  = useState([])
  const [biblioEchauffSearch, setBiblioEchauffSearch] = useState('')
  const [biblioEchauffLoading, setBiblioEchauffLoading] = useState(false)
  const [showLibraryFor, setShowLibraryFor]         = useState(null) // exercice id
  const [librarySuggestions, setLibrarySuggestions] = useState([])
  const [librarySearching, setLibrarySearching]     = useState(false)
  const [libraryLinked, setLibraryLinked]           = useState({}) // { exId: true } flash feedback
  const [editAllMode, setEditAllMode] = useState(false)
  const [formEditions, setFormEditions] = useState({}) // { [exId]: { code, nom, ... } }
  const [biblioSearch, setBiblioSearch] = useState('')
  const [biblioResults, setBiblioResults] = useState([])
  const [showFullLibrary, setShowFullLibrary] = useState(false)
  const [allBiblio, setAllBiblio] = useState([])
  const [biblioFullSearch, setBiblioFullSearch] = useState('')
  const [saveToLibrary, setSaveToLibrary] = useState(false)
  const [libraryImageFile, setLibraryImageFile] = useState(null)
  const [libraryImagePreview, setLibraryImagePreview] = useState(null)
  const libraryFileRef = useRef(null)
  const [nomSuggestions, setNomSuggestions] = useState([])
  const [editNomSuggestions, setEditNomSuggestions] = useState([])
  const [templateSaved, setTemplateSaved] = useState(false)
  const [progSaved, setProgSaved] = useState({})   // { [exId]: true } flash feedback
  const [progDraft, setProgDraft] = useState(null)  // blocs en cours d'édition (inputs contrôlés)
  const [biblioFull, setBiblioFull] = useState([])  // toute la bibliothèque pour auto-matching
  const [pendingAutoLink, setPendingAutoLink] = useState(null) // { exerciceNom, biblioNom }
  const autoLinkResolverRef = useRef(null)

  function waitForAutoLinkConfirm(exerciceNom, biblioNom) {
    return new Promise(resolve => {
      autoLinkResolverRef.current = resolve
      setPendingAutoLink({ exerciceNom, biblioNom })
    })
  }
  function handleAutoLinkDecision(accept) {
    setPendingAutoLink(null)
    autoLinkResolverRef.current?.(accept)
    autoLinkResolverRef.current = null
  }
  const [showAIModal, setShowAIModal] = useState(false)
  // Cardio — objet { [semaine]: { type, duree_min, intensite, note, media_url } | null }
  const [cardioDebut, setCardioDebut]       = useState({})
  const [cardioFin, setCardioFin]           = useState({})
  const [cardioDebutSem, setCardioDebutSem] = useState(1)
  const [cardioFinSem,   setCardioFinSem]   = useState(1)
  const [uploadingCardio, setUploadingCardio] = useState(false)
  const cardioImgDebutRef = useRef(null)
  const cardioImgFinRef   = useRef(null)
  // Échauffement
  const [echauffement, setEchauffement]           = useState([])
  const [echauffForm, setEchauffForm]             = useState({ nom: '', reps: '', groupe: '', tours: '' })
  const [showImportEchauff, setShowImportEchauff] = useState(false)
  const [echauffTemplates, setEchauffTemplates]   = useState([])
  const [loadingTemplates, setLoadingTemplates]   = useState(false)
  const [editingEchauffId, setEditingEchauffId]   = useState(null)
  const [editEchauffForm, setEditEchauffForm]     = useState({ nom: '', reps: '', groupe: '', tours: '', image_url: '' })
  const [echauffBiblioFlash, setEchauffBiblioFlash] = useState({}) // { [lid]: 'saved'|'exists'|'saving' }
  const [uploadingEchauff, setUploadingEchauff]   = useState(false)
  const echauffImgRef = useRef(null)
  const [showEchauffPaste, setShowEchauffPaste]   = useState(false)
  const [echauffPasteText, setEchauffPasteText]   = useState('')
  const [echauffParsed, setEchauffParsed]         = useState(null)
  // WorkoutX GIF pour échauffement
  const [wxKey, setWxKey]                         = useState(() => localStorage.getItem('workoutx_key') || '')
  const [showWxKeyInput, setShowWxKeyInput]        = useState(false)
  const [gifEchauffOpen, setGifEchauffOpen]        = useState(false)
  const [gifResults, setGifResults]               = useState([])
  const [gifSearching, setGifSearching]           = useState(false)
  const [gifQuery, setGifQuery]                   = useState('')
  const [gifTranslated, setGifTranslated]         = useState('')


  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSeance(); fetchBiblioFull() }, [])

  async function fetchBiblioFull() {
    const { data } = await supabase.from('bibliotheque_exercices').select('id, nom').order('nom')
    if (data) setBiblioFull(data)
  }

  async function fetchSeance() {
    const { data, error } = await supabase.from('seances').select('*, programmes(id, nom, client_id, semaines)').eq('id', id).single()
    if (error) console.log(error)
    else { setSeance(data); setSemaines(data.programmes.semaines); setEchauffement(data.echauffement || []); setCardioDebut(data.cardio_debut || {}); setCardioFin(data.cardio_fin || {}); await fetchExercices(); await fetchRpeSeances() }
    setLoading(false)
  }

  async function fetchExercices() {
    const { data, error } = await supabase.from('exercices').select('*, charges(*)').eq('seance_id', id).order('ordre', { ascending: true })
    if (error) console.log(error)
    else {
      // Garantir que chaque bloc de progression a un id unique
      // (les anciens enregistrements en DB peuvent ne pas en avoir)
      const normalized = (data || []).map(ex => ({
        ...ex,
        progressions: (ex.progressions || []).map(p => ({
          ...p,
          id: p.id || Math.random().toString(36).slice(2),
        })),
      }))
      // Toujours trier par code au chargement (A1 < A2 < B1 < B2…)
      const byCode = [...normalized].sort((a, b) => {
        const letterA = (a.code?.match(/^[A-Za-z]+/)?.[0] || '~').toUpperCase()
        const letterB = (b.code?.match(/^[A-Za-z]+/)?.[0] || '~').toUpperCase()
        if (letterA !== letterB) return letterA < letterB ? -1 : 1
        const numA = parseInt(a.code?.match(/\d+/)?.[0] || '9999')
        const numB = parseInt(b.code?.match(/\d+/)?.[0] || '9999')
        return numA - numB
      })
      // Répercuter l'ordre corrigé en DB si nécessaire
      byCode.forEach(async (ex, i) => {
        if (ex.ordre !== i + 1) await supabase.from('exercices').update({ ordre: i + 1 }).eq('id', ex.id)
      })
      setExercices(byCode)
      const chargesMap = {}
      data.forEach(ex => {
        chargesMap[ex.id] = {}
        ex.charges.forEach(c => { chargesMap[ex.id][c.semaine] = { id: c.id, charge: c.charge, rpe_reel: c.rpe_reel } })
      })
      setCharges(chargesMap)

      // Séries réellement effectuées par le client (serie_tracking, travail uniquement : serie < 1000)
      const exIds = data.map(ex => ex.id)
      if (exIds.length > 0) {
        const { data: series } = await supabase
          .from('serie_tracking')
          .select('exercice_id, semaine, serie, poids, reps_reelles, valide')
          .in('exercice_id', exIds)
          .lt('serie', 1000)
          .order('serie', { ascending: true })
        const tMap = {}  // poids max par exercice/semaine (fallback charge cible)
        const stMap = {} // détail par serie : { [exId]: { [semaine]: [{ serie, poids, reps_reelles, valide }] } }
        ;(series || []).forEach(s => {
          if (s.semaine == null) return
          const poids = parseFloat(s.poids)
          // tMap : poids max (existant)
          if (poids) {
            if (!tMap[s.exercice_id]) tMap[s.exercice_id] = {}
            if (!tMap[s.exercice_id][s.semaine] || poids > tMap[s.exercice_id][s.semaine]) {
              tMap[s.exercice_id][s.semaine] = poids
            }
          }
          // stMap : détail complet
          if (!stMap[s.exercice_id]) stMap[s.exercice_id] = {}
          if (!stMap[s.exercice_id][s.semaine]) stMap[s.exercice_id][s.semaine] = []
          stMap[s.exercice_id][s.semaine].push({ serie: s.serie, poids: s.poids, reps_reelles: s.reps_reelles, valide: s.valide })
        })
        setTrackingMap(tMap)
        setSerieTrackingMap(stMap)
      }
    }
  }

  async function fetchRpeSeances() {
    const { data, error } = await supabase.from('rpe_seances').select('*').eq('seance_id', id)
    if (error) console.log(error)
    else {
      const rpeMap = {}
      data.forEach(r => { rpeMap[r.semaine] = { id: r.id, rpe_cible: r.rpe_cible, rpe_reel: r.rpe_reel } })
      setRpeSeances(rpeMap)
    }
  }

  async function searchBiblio(query) {
    if (!query.trim()) { setBiblioResults([]); return }
    const { data } = await supabase.from('bibliotheque_exercices')
      .select('id, nom, categorie, image_url').ilike('nom', `%${query}%`).limit(8)
    setBiblioResults(data || [])
  }

  async function searchNom(query) {
    if (!query.trim()) { setNomSuggestions([]); return }
    const { data } = await supabase.from('bibliotheque_exercices')
      .select('id, nom, categorie, image_url').ilike('nom', `%${query}%`).limit(6)
    setNomSuggestions(data || [])
  }

  async function searchEditNom(query) {
    if (!query.trim()) { setEditNomSuggestions([]); return }
    const { data } = await supabase.from('bibliotheque_exercices')
      .select('id, nom, categorie, image_url').ilike('nom', `%${query}%`).limit(6)
    setEditNomSuggestions(data || [])
  }

  async function openFullLibrary() {
    setShowFullLibrary(true)
    if (allBiblio.length === 0) {
      const { data } = await supabase.from('bibliotheque_exercices')
        .select('id, nom, categorie, image_url').order('nom')
      setAllBiblio(data || [])
    }
  }

  function selectFromBiblio(ex) {
    setForm(f => ({ ...f, nom: ex.nom, bibliotheque_id: ex.id }))
    setBiblioSearch('')
    setBiblioResults([])
    setShowFullLibrary(false)
    setBiblioFullSearch('')
  }

  async function ajouterExercice(e) {
    e.preventDefault()
    if (!form.code.trim() || !form.nom.trim()) return

    let bibliotheque_id = form.bibliotheque_id || null

    if (saveToLibrary && !form.bibliotheque_id) {
      let image_url = null
      if (libraryImageFile) {
        const ext = libraryImageFile.name.split('.').pop()
        const path = `${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('exercices').upload(path, libraryImageFile)
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('exercices').getPublicUrl(path)
          image_url = publicUrl
        }
      }
      const { data: libData } = await supabase.from('bibliotheque_exercices')
        .insert([{ nom: form.nom, image_url }]).select().single()
      if (libData) {
        bibliotheque_id = libData.id
        setBiblioFull(prev => [...prev, { id: libData.id, nom: libData.nom }].sort((a, b) => a.nom.localeCompare(b.nom)))
        setAllBiblio(prev => [...prev, libData].sort((a, b) => a.nom.localeCompare(b.nom)))
      }
    }

    // ── Auto-matching bibliothèque si pas encore lié ──
    if (!bibliotheque_id && biblioFull.length > 0) {
      const autoFound = autoLinkBiblio(form.nom, biblioFull)
      if (autoFound) {
        const foundNom = biblioFull.find(b => b.id === autoFound)?.nom
        const accepted = await waitForAutoLinkConfirm(form.nom, foundNom)
        if (accepted) bibliotheque_id = autoFound
      }
    }

    const { data, error } = await supabase.from('exercices').insert([{
      seance_id: id, code: form.code, nom: form.nom,
      series: form.series ? parseInt(form.series) : null,
      repetitions: form.repetitions, tempo: form.tempo,
      recuperation: form.recuperation, type_intensite: form.type_intensite,
      valeur_intensite: form.valeur_intensite, ordre: exercices.length + 1,
      bibliotheque_id, media_url: form.media_url || null,
    }]).select().single()
    if (error) alert(error.message)
    else {
      const allExos = [...exercices, { ...data, charges: [] }]
      const sorted = [...allExos].sort((a, b) => {
        const [al, an] = sortCodeKey(a.code)
        const [bl, bn] = sortCodeKey(b.code)
        if (al !== bl) return al < bl ? -1 : 1
        return an - bn
      })
      sorted.forEach(async (ex, i) => {
        if (ex.ordre !== i + 1) await supabase.from('exercices').update({ ordre: i + 1 }).eq('id', ex.id)
      })
      setExercices(sorted.map((ex, i) => ({ ...ex, ordre: i + 1 })))
      setCharges({ ...charges, [data.id]: {} })
      setForm({ code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '', bibliotheque_id: null, media_url: '' })
      setBiblioSearch('')
      setSaveToLibrary(false)
      setLibraryImageFile(null)
      setLibraryImagePreview(null)
    }
  }

  async function insertAIExercices({ exercices: aiExs }) {
    let ordre = exercices.length + 1
    const inserted = []
    for (const ex of aiExs) {
      const { data, error } = await supabase.from('exercices').insert([{
        seance_id: id,
        code: ex.code,
        nom: ex.nom,
        series: ex.series ? parseInt(ex.series) : null,
        repetitions: String(ex.repetitions || ''),
        tempo: ex.tempo || '',
        recuperation: ex.recuperation || '',
        type_intensite: ex.type_intensite || '',
        valeur_intensite: String(ex.valeur_intensite || ''),
        ordre,
        bibliotheque_id: ex.bibliotheque_id || null,
      }]).select().single()
      if (!error && data) { inserted.push({ ...data, charges: [] }); ordre++ }
    }
    const allExos = [...exercices, ...inserted]
    const sorted = [...allExos].sort((a, b) => {
      const [al, an] = sortCodeKey(a.code)
      const [bl, bn] = sortCodeKey(b.code)
      if (al !== bl) return al < bl ? -1 : 1
      return an - bn
    })
    sorted.forEach(async (ex, i) => {
      if (ex.ordre !== i + 1) await supabase.from('exercices').update({ ordre: i + 1 }).eq('id', ex.id)
    })
    setExercices(sorted.map((ex, i) => ({ ...ex, ordre: i + 1 })))
    const newCharges = { ...charges }
    inserted.forEach(ex => { newCharges[ex.id] = {} })
    setCharges(newCharges)
  }

  function startEditAll() {
    const forms = {}
    exercices.forEach(ex => {
      forms[ex.id] = {
        code: ex.code || '', nom: ex.nom || '',
        series: ex.series || '', repetitions: ex.repetitions || '',
        tempo: ex.tempo || '', recuperation: ex.recuperation || '',
        type_intensite: ex.type_intensite || '', valeur_intensite: ex.valeur_intensite || '',
        media_url: ex.media_url || '',
      }
    })
    setFormEditions(forms)
    setEditAllMode(true)
    setEnEdition(null)
  }

  function updateFormEdition(exId, field, val) {
    setFormEditions(prev => ({ ...prev, [exId]: { ...prev[exId], [field]: val } }))
  }

  // Trie les exercices par code (A1 < A2 < B1 < B2 < …)
  function sortCodeKey(code) {
    if (!code) return ['~', 9999]
    const letter = (code.match(/^[A-Za-z]+/)?.[0] || '~').toUpperCase()
    const num    = parseInt(code.match(/\d+/)?.[0] || '9999')
    return [letter, num]
  }

  async function saveAllEditions() {
    // 1. Sauvegarder chaque exercice
    for (const ex of exercices) {
      const f = formEditions[ex.id]
      if (!f) continue
      await supabase.from('exercices').update({
        code: f.code, nom: f.nom,
        series: f.series ? parseInt(f.series) : null,
        repetitions: f.repetitions, tempo: f.tempo,
        recuperation: f.recuperation, type_intensite: f.type_intensite,
        valeur_intensite: f.valeur_intensite,
        media_url: f.media_url || null,
      }).eq('id', ex.id)
    }

    // 2. Appliquer les nouvelles valeurs localement
    const updated = exercices.map(ex => {
      const f = formEditions[ex.id]
      return f ? { ...ex, ...f, series: f.series ? parseInt(f.series) : null } : ex
    })

    // 3. Trier par code (A1, A2, B1, B2…)
    const sorted = [...updated].sort((a, b) => {
      const [al, an] = sortCodeKey(a.code)
      const [bl, bn] = sortCodeKey(b.code)
      if (al !== bl) return al < bl ? -1 : 1
      return an - bn
    })

    // 4. Mettre à jour l'ordre en DB si ça a changé
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].ordre !== i + 1) {
        await supabase.from('exercices').update({ ordre: i + 1 }).eq('id', sorted[i].id)
      }
    }

    setExercices(sorted.map((ex, i) => ({ ...ex, ordre: i + 1 })))
    setEditAllMode(false)
  }

  async function sauvegarderEdition(exId) {
    // Auto-matching biblio si le nom a changé et pas encore lié
    const exOriginal = exercices.find(e => e.id === exId)
    let bibliotheque_id = formEdition.bibliotheque_id ?? exOriginal?.bibliotheque_id ?? null
    if (!bibliotheque_id && formEdition.nom && biblioFull.length > 0) {
      const autoFound = autoLinkBiblio(formEdition.nom, biblioFull)
      if (autoFound) {
        const foundNom = biblioFull.find(b => b.id === autoFound)?.nom
        const accepted = await waitForAutoLinkConfirm(formEdition.nom, foundNom)
        if (accepted) bibliotheque_id = autoFound
      }
    }

    const { error } = await supabase.from('exercices').update({
      code: formEdition.code, nom: formEdition.nom,
      series: formEdition.series ? parseInt(formEdition.series) : null,
      repetitions: formEdition.repetitions, tempo: formEdition.tempo,
      recuperation: formEdition.recuperation, type_intensite: formEdition.type_intensite,
      valeur_intensite: formEdition.valeur_intensite,
      media_url: formEdition.media_url || null,
      bibliotheque_id,
    }).eq('id', exId)
    if (error) { alert(error.message); return }

    // Appliquer les nouvelles valeurs puis trier par code
    const updated = exercices.map(ex => ex.id === exId ? { ...ex, ...formEdition, series: formEdition.series ? parseInt(formEdition.series) : null } : ex)
    const sorted = [...updated].sort((a, b) => {
      const [al, an] = sortCodeKey(a.code)
      const [bl, bn] = sortCodeKey(b.code)
      if (al !== bl) return al < bl ? -1 : 1
      return an - bn
    })
    // Mettre à jour l'ordre en DB si ça a changé
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].ordre !== i + 1) {
        await supabase.from('exercices').update({ ordre: i + 1 }).eq('id', sorted[i].id)
      }
    }
    setExercices(sorted.map((ex, i) => ({ ...ex, ordre: i + 1 })))
    setEnEdition(null)
  }

  async function supprimerExercice(exId) {
    if (!window.confirm('Supprimer cet exercice ?')) return
    const { error } = await supabase.from('exercices').delete().eq('id', exId)
    if (error) alert(error.message)
    else {
      setExercices(exercices.filter(ex => ex.id !== exId))
      const newCharges = { ...charges }; delete newCharges[exId]; setCharges(newCharges)
    }
  }

  async function updateCharge(exId, semaine, field, valeur) {
    const existing = charges[exId]?.[semaine]
    if (existing) {
      const { error } = await supabase.from('charges').update({ [field]: valeur }).eq('id', existing.id)
      if (error) alert(error.message)
      else setCharges({ ...charges, [exId]: { ...charges[exId], [semaine]: { ...existing, [field]: valeur } } })
    } else {
      const { data, error } = await supabase.from('charges').insert([{ exercice_id: exId, semaine, [field]: valeur }]).select().single()
      if (error) alert(error.message)
      else setCharges({ ...charges, [exId]: { ...charges[exId], [semaine]: { id: data.id, charge: '', rpe_reel: null, [field]: valeur } } })
    }
  }

  // ── Progressions par semaines ──────────────────────────────────────────
  // Initialise le draft quand on ouvre/ferme le panel de progression
  useEffect(() => {
    if (showProgressionFor) {
      const ex = exercices.find(e => e.id === showProgressionFor)
      // Deep copy pour que le draft soit indépendant du state exercices
      setProgDraft(JSON.parse(JSON.stringify(ex?.progressions || [])))
    } else {
      setProgDraft(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProgressionFor])

  // Met à jour un champ d'un bloc dans le draft (inputs contrôlés — aucun Supabase)
  function updateDraftField(blocId, field, val) {
    setProgDraft(prev => (prev || []).map(p =>
      p.id === blocId ? { ...p, [field]: val } : p
    ))
  }

  // Ajoute un nouveau bloc dans le draft
  function addProgBloc(exId) {
    const ex = exercices.find(e => e.id === exId)
    const progs = progDraft || ex?.progressions || []
    const lastFin = progs.length > 0 ? (progs[progs.length - 1].semaine_fin || 0) : 0
    const debut = lastFin + 1
    const fin = debut + 1
    const newBloc = {
      id: Math.random().toString(36).slice(2),
      label: `S${debut}-${fin}`,
      semaine_debut: debut,
      semaine_fin: fin,
      series: ex?.series || '',
      repetitions: ex?.repetitions || '',
      valeur_intensite: ex?.valeur_intensite || '',
      detail: '',
      nom_variante: '',
    }
    setProgDraft(prev => [...(prev || []), newBloc])
  }

  // Supprime un bloc du draft
  function removeProgBloc(blocId) {
    setProgDraft(prev => (prev || []).filter(p => p.id !== blocId))
  }

  // Sauvegarde le draft dans Supabase + met à jour exercices state
  async function saveProgression(exId) {
    const progs = progDraft || []
    setExercices(prev => prev.map(e => e.id === exId ? { ...e, progressions: progs } : e))
    await supabase.from('exercices').update({ progressions: progs }).eq('id', exId)
    setProgSaved(prev => ({ ...prev, [exId]: true }))
    setTimeout(() => setProgSaved(prev => ({ ...prev, [exId]: false })), 2000)
  }

  // ── Séries d'échauffement (définies par le coach) ──────────────────────
  async function saveSeriesEchauffement(exId, series) {
    setExercices(prev => prev.map(ex => ex.id === exId ? { ...ex, series_echauffement: series } : ex))
    await supabase.from('exercices').update({ series_echauffement: series }).eq('id', exId)
  }
  function addWarmupCoach(exId) {
    const ex = exercices.find(e => e.id === exId)
    const current = ex?.series_echauffement || []
    saveSeriesEchauffement(exId, [...current, { reps: '', pourcentage: '', nom: '', image_url: null }])
  }
  function updateWarmupCoach(exId, idx, field, val) {
    const ex = exercices.find(e => e.id === exId)
    const current = (ex?.series_echauffement || []).map((s, i) => i === idx ? { ...s, [field]: val } : s)
    saveSeriesEchauffement(exId, current)
  }
  function removeWarmupCoach(exId, idx) {
    const ex = exercices.find(e => e.id === exId)
    saveSeriesEchauffement(exId, (ex?.series_echauffement || []).filter((_, i) => i !== idx))
  }

  // ── Bibliothèque d'échauffements ─────────────────────────────────────────
  async function openBiblioEchauff(exId) {
    if (biblioEchauffOpen === exId) { setBiblioEchauffOpen(null); return }
    setBiblioEchauffOpen(exId)
    setBiblioEchauffSearch('')
    setBiblioEchauffLoading(true)
    const { data } = await supabase.from('bibliotheque_exercices')
      .select('id, nom, image_url')
      .eq('is_echauffement', true)
      .order('nom')
    setBiblioEchauffList(data || [])
    setBiblioEchauffLoading(false)
  }

  async function searchBiblioEchauff(q) {
    setBiblioEchauffSearch(q)
    if (!q.trim()) {
      setBiblioEchauffLoading(true)
      const { data } = await supabase.from('bibliotheque_exercices')
        .select('id, nom, image_url').eq('is_echauffement', true).order('nom')
      setBiblioEchauffList(data || [])
      setBiblioEchauffLoading(false)
      return
    }
    const { data } = await supabase.from('bibliotheque_exercices')
      .select('id, nom, image_url').eq('is_echauffement', true)
      .ilike('nom', `%${q}%`).order('nom').limit(20)
    setBiblioEchauffList(data || [])
  }

  function choisirDepuisBiblioEchauff(exId, item) {
    const current = exercices.find(e => e.id === exId)?.series_echauffement || []
    const newSerie = { poids_pct: null, reps: '', image_url: item.image_url || null, nom: item.nom }
    saveSeriesEchauffement(exId, [...current, newSerie])
    setBiblioEchauffOpen(null)
  }

  // ── Bibliothèque d'exercices ──────────────────────────────────────────────
  async function openLibraryPanel(exId) {
    if (showLibraryFor === exId) { setShowLibraryFor(null); return }
    setShowLibraryFor(exId)
    setLibrarySuggestions([])
    const ex = exercices.find(e => e.id === exId)
    if (!ex?.nom) return
    setLibrarySearching(true)
    // Chercher par les premiers mots significatifs du nom
    const baseWords = ex.nom.trim().split(/\s+/).slice(0, 3).join(' ')
    const { data } = await supabase.from('bibliotheque_exercices')
      .select('id, nom, image_url')
      .ilike('nom', `%${baseWords.split(' ')[0]}%`)
      .order('nom').limit(12)
    setLibrarySuggestions(data || [])
    setLibrarySearching(false)
  }

  async function searchLibrarySuggestions(exId, query) {
    if (!query.trim()) { setLibrarySuggestions([]); return }
    const { data } = await supabase.from('bibliotheque_exercices')
      .select('id, nom, image_url').ilike('nom', `%${query}%`).order('nom').limit(12)
    setLibrarySuggestions(data || [])
  }

  async function lierABibliotheque(exId, biblioId) {
    await supabase.from('exercices').update({ bibliotheque_id: biblioId }).eq('id', exId)
    setExercices(prev => prev.map(e => e.id === exId ? { ...e, bibliotheque_id: biblioId } : e))
    setLibraryLinked(prev => ({ ...prev, [exId]: true }))
    setTimeout(() => setLibraryLinked(prev => { const n = { ...prev }; delete n[exId]; return n }), 2000)
    setShowLibraryFor(null)
  }

  async function creerEtLierBibliotheque(exId) {
    const ex = exercices.find(e => e.id === exId)
    if (!ex) return
    const { data, error } = await supabase.from('bibliotheque_exercices')
      .insert([{ nom: ex.nom, image_url: ex.bibliotheque_exercices?.image_url || null }])
      .select().single()
    if (error) { alert(error.message); return }
    setAllBiblio(prev => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)))
    await lierABibliotheque(exId, data.id)
  }

  async function sauvegarderTemplate() {
    if (exercices.length === 0) { alert('Ajoutez des exercices avant de sauvegarder comme modèle.'); return }
    const exData = exercices.map(ex => ({
      code: ex.code, nom: ex.nom, series: ex.series, repetitions: ex.repetitions,
      tempo: ex.tempo, recuperation: ex.recuperation, type_intensite: ex.type_intensite,
      valeur_intensite: ex.valeur_intensite, ordre: ex.ordre, bibliotheque_id: ex.bibliotheque_id,
      progressions: ex.progressions?.length > 0 ? ex.progressions : null,
      series_echauffement: ex.series_echauffement?.length > 0 ? ex.series_echauffement : null,
      media_url: ex.media_url || null,
    }))
    // RPE cibles uniquement (pas les réels)
    const rpeCibles = {}
    Object.entries(rpeSeances).forEach(([sem, r]) => { if (r?.rpe_cible) rpeCibles[sem] = r.rpe_cible })
    const { error } = await supabase.from('seance_templates').insert([{
      nom: seance.nom,
      exercices: exData,
      echauffement: echauffement?.length > 0 ? echauffement : [],
      rpe_cibles: rpeCibles,
    }])
    if (error) alert(error.message)
    else { setTemplateSaved(true); setTimeout(() => setTemplateSaved(false), 2500) }
  }

  async function updateRpeSeance(semaine, field, valeur) {
    const existing = rpeSeances[semaine]
    if (existing) {
      const { error } = await supabase.from('rpe_seances').update({ [field]: valeur }).eq('id', existing.id)
      if (error) alert(error.message)
      else setRpeSeances({ ...rpeSeances, [semaine]: { ...existing, [field]: valeur } })
    } else {
      const { data, error } = await supabase.from('rpe_seances').insert([{ seance_id: id, semaine, [field]: valeur }]).select().single()
      if (error) alert(error.message)
      else setRpeSeances({ ...rpeSeances, [semaine]: { id: data.id, rpe_cible: null, rpe_reel: null, [field]: valeur } })
    }
  }

  // ── Fonctions échauffement ──────────────────────────────────────
  async function persistEchauff(lines) {
    await supabase.from('seances').update({ echauffement: lines }).eq('id', id)
    setEchauffement(lines)
  }

  function addEchauffLine() {
    if (!echauffForm.nom.trim()) return
    const g = echauffForm.groupe.trim().toUpperCase() || null
    const existingTours = g ? (echauffement.find(l => l.groupe === g)?.tours || null) : null
    const formTours = g && echauffForm.tours ? parseInt(echauffForm.tours) || null : null
    const tours = existingTours ?? formTours
    const line = { id: newId(), nom: echauffForm.nom.trim(), reps: echauffForm.reps.trim(), groupe: g, tours }
    let next = [...echauffement, line]
    if (g && formTours && !existingTours) next = next.map(l => l.groupe === g ? { ...l, tours: formTours } : l)
    persistEchauff(next)
    setEchauffForm(f => ({ nom: '', reps: '', groupe: f.groupe, tours: f.tours }))
  }

  function parseEchauffPaste(text) {
    const raw = (text || echauffPasteText).trim()
    if (!raw) return

    function splitNomReps(str) {
      const m = str.match(/^(.*?)\s+(\d*[xX]\d+(?:[\/\.]\w)?|\d+\s*(?:s|min|sec|reps?))\s*$/i)
      return m ? { nom: m[1].trim(), reps: m[2].trim() } : { nom: str.trim(), reps: '' }
    }

    const rows = raw.split('\n').map(r => r.trim())
    const result = []
    let pending = []
    let groupIdx = 0

    const flushPending = (tours) => {
      if (!pending.length) return
      if (tours) {
        const letter = String.fromCharCode(65 + groupIdx)
        pending.forEach(l => { l.groupe = letter; l.tours = tours })
        groupIdx++
      }
      result.push(...pending)
      pending = []
    }

    for (const row of rows) {
      if (!row || /^[-–—]+$/.test(row) || /^(échauffement|echauffement|début)/i.test(row)) continue
      const toursOnly = row.match(/^(\d+)\s*tours?\s*$/i)
      if (toursOnly) { flushPending(parseInt(toursOnly[1])); continue }
      const cols = row.split('\t').map(c => c.trim()).filter(Boolean)
      if (cols.length >= 2) {
        flushPending(null)
        let nom = cols[0], reps = cols[1], groupe = null, tours = null
        if (cols[2] && /^[A-Za-z]{1,2}$/.test(cols[2])) { groupe = cols[2].toUpperCase(); tours = cols[3] ? parseInt(cols[3]) || null : null }
        result.push({ id: newId(), nom, reps, groupe: groupe || null, tours })
        continue
      }
      const bracketMatch = row.match(/^(.+?)\s*\]\s*(\d+)\s*tours?\s*$/i)
      if (bracketMatch) {
        flushPending(null)
        const { nom, reps } = splitNomReps(bracketMatch[1])
        const letter = String.fromCharCode(65 + groupIdx)
        result.push({ id: newId(), nom, reps, groupe: letter, tours: parseInt(bracketMatch[2]) })
        groupIdx++
        continue
      }
      const { nom, reps } = splitNomReps(row)
      pending.push({ id: newId(), nom, reps, groupe: null, tours: null })
    }

    flushPending(null)
    const toursByGroup = {}
    result.forEach(l => { if (l.groupe && l.tours) toursByGroup[l.groupe] = l.tours })
    setEchauffParsed(result.map(l => l.groupe ? { ...l, tours: toursByGroup[l.groupe] || l.tours || null } : l))
  }

  function confirmEchauffPaste() {
    if (!echauffParsed) return
    persistEchauff([...echauffement, ...echauffParsed])
    setEchauffPasteText(''); setEchauffParsed(null); setShowEchauffPaste(false)
  }

  function startEditEchauffLine(l) {
    setEditingEchauffId(l.id)
    setEditEchauffForm({ nom: l.nom || '', reps: l.reps || '', groupe: l.groupe || '', tours: l.tours ? String(l.tours) : '', image_url: l.image_url || '' })
  }

  function saveEditEchauffLine() {
    if (!editEchauffForm.nom.trim()) return
    const g = editEchauffForm.groupe.trim().toUpperCase() || null
    const tours = g && editEchauffForm.tours ? parseInt(editEchauffForm.tours) || null : null
    const updated = echauffement.map(l => {
      if (l.id === editingEchauffId) return { ...l, nom: editEchauffForm.nom.trim(), reps: editEchauffForm.reps.trim(), groupe: g, tours: g ? tours : null, image_url: editEchauffForm.image_url || null }
      if (g && l.groupe === g) return { ...l, tours }
      return l
    })
    persistEchauff(updated)
    setEditingEchauffId(null)
  }

  async function uploadEchauffImage(file) {
    if (!file) return
    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `echauff/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    setUploadingEchauff(true)
    const { error } = await supabase.storage.from('exercices').upload(path, file, { upsert: true })
    setUploadingEchauff(false)
    if (error) { alert('Erreur upload : ' + error.message); return }
    const { data: { publicUrl } } = supabase.storage.from('exercices').getPublicUrl(path)
    setEditEchauffForm(f => ({ ...f, image_url: publicUrl }))
    if (echauffImgRef.current) echauffImgRef.current.value = ''
  }

  async function doGifEchauffSearch(query) {
    if (!query.trim()) return
    setGifSearching(true); setGifResults([])
    const translated = frToEnEchauff(query)
    setGifTranslated(translated)
    const words = translated.split(/\s+/).filter(w => w.length > 2)
    const terms = [...new Set([translated, words.slice(0,2).join(' '), words[0], words.length > 2 ? words.slice(1).join(' ') : null].filter(Boolean))]
    let keyError = false
    async function fetchTerm(term) {
      try {
        const res = await fetch(`https://api.workoutxapp.com/v1/exercises/name/${encodeURIComponent(term)}`, { headers: { 'X-WorkoutX-Key': wxKey } })
        if (res.status === 401 || res.status === 403) { keyError = true; return [] }
        if (!res.ok) return []
        const json = await res.json()
        if (Array.isArray(json)) return json
        return json.data || json.exercises || json.results || []
      } catch { return [] }
    }
    try {
      const allArrays = await Promise.all(terms.map(fetchTerm))
      if (keyError) {
        // Fallback automatique sur la base libre
        setGifTranslated(translated + ' · DB Libre')
        const freeResults = await searchFreeExDB(translated)
        setGifResults(freeResults)
        setGifSearching(false)
        return
      }
      const seen = new Set(); const merged = []
      for (const arr of allArrays) for (const ex of arr) if (!seen.has(ex.id)) { seen.add(ex.id); merged.push(ex) }
      const qWords = new Set(translated.toLowerCase().split(/\s+/).filter(w => w.length > 1))
      const scored = merged.map(ex => {
        const nWords = new Set((ex.name||'').toLowerCase().split(/\s+/).filter(w => w.length > 1))
        const inter = [...qWords].filter(w => nWords.has(w)).length
        const union = new Set([...qWords,...nWords]).size
        return { ...ex, _score: union ? inter/union : 0 }
      })
      scored.sort((a,b) => b._score - a._score)
      setGifResults(scored.slice(0,9))
    } catch(e) { alert('Erreur WorkoutX : ' + e.message) }
    setGifSearching(false)
  }

  function ouvrirGifEchauff(nom) {
    setGifQuery(nom || ''); setGifTranslated(''); setGifResults([])
    setGifEchauffOpen(true)
    if (nom) doGifEchauffSearch(nom)
  }

  async function choisirGifEchauff(r) {
    setGifSearching(true)
    try {
      const url = r.gifUrl || r.imageUrl
      const headers = r._source === 'freedb' ? {} : { 'X-WorkoutX-Key': wxKey }
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const blob = await res.blob()
      const ext = r._source === 'freedb' ? 'jpg' : 'gif'
      const file = new File([blob], `ex_${r.id}.${ext}`, { type: blob.type || 'image/jpeg' })
      const path = `echauff/ex_${Date.now()}_${r.id}.${ext}`
      const { error } = await supabase.storage.from('exercices').upload(path, file, { upsert: true })
      if (error) throw new Error(error.message)
      const { data: { publicUrl } } = supabase.storage.from('exercices').getPublicUrl(path)
      setEditEchauffForm(f => ({ ...f, image_url: publicUrl }))
      setGifEchauffOpen(false)
    } catch(e) { alert('Erreur : ' + e.message) }
    setGifSearching(false)
  }

  function removeEchauffLine(lid) { persistEchauff(echauffement.filter(l => l.id !== lid)) }

  async function sauvegarderEchauffEnBiblio(l) {
    if (!l.nom?.trim()) return
    setEchauffBiblioFlash(f => ({ ...f, [l.id]: 'saving' }))
    // Vérifie si le nom existe déjà (is_echauffement = true)
    const { data: existing } = await supabase
      .from('bibliotheque_exercices')
      .select('id, image_url')
      .eq('nom', l.nom.trim())
      .eq('is_echauffement', true)
      .maybeSingle()
    if (existing) {
      // Si une image est dispo et que la biblio n'en a pas, on met à jour
      if (l.image_url && !existing.image_url) {
        await supabase.from('bibliotheque_exercices').update({ image_url: l.image_url }).eq('id', existing.id)
      }
      setEchauffBiblioFlash(f => ({ ...f, [l.id]: 'exists' }))
    } else {
      await supabase.from('bibliotheque_exercices').insert({ nom: l.nom.trim(), image_url: l.image_url || null, is_echauffement: true })
      setEchauffBiblioFlash(f => ({ ...f, [l.id]: 'saved' }))
    }
    setTimeout(() => setEchauffBiblioFlash(f => { const n = { ...f }; delete n[l.id]; return n }), 2500)
  }

  function moveEchauffLine(idx, dir) {
    const arr = [...echauffement]
    const ni = idx + dir
    if (ni < 0 || ni >= arr.length) return
    ;[arr[idx], arr[ni]] = [arr[ni], arr[idx]]
    persistEchauff(arr)
  }

  async function openImportTemplates() {
    setShowImportEchauff(v => !v)
    if (echauffTemplates.length === 0 && !loadingTemplates) {
      setLoadingTemplates(true)
      const { data } = await supabase.from('echauffements_templates').select('*').order('created_at', { ascending: false })
      setEchauffTemplates(data || [])
      setLoadingTemplates(false)
    }
  }

  function importEchauffTemplate(t) {
    persistEchauff(t.lignes || [])
    setShowImportEchauff(false)
  }

  async function saveEchauffAsTemplate() {
    if (echauffement.length === 0) return
    const nom = window.prompt('Nom du template :', seance.nom + ' – Échauff.')
    if (!nom) return
    const { error } = await supabase.from('echauffements_templates').insert([{ nom: nom.trim(), lignes: echauffement }])
    if (error) alert(error.message)
    else alert('Template sauvegardé !')
  }

  async function uploadCardioImage(position, sem, file) {
    if (!file) return
    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `cardio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    setUploadingCardio(true)
    const { error } = await supabase.storage.from('exercices').upload(path, file, { upsert: true })
    setUploadingCardio(false)
    if (error) { alert('Erreur upload : ' + error.message); return }
    const { data: { publicUrl } } = supabase.storage.from('exercices').getPublicUrl(path)
    const setFn = position === 'debut' ? setCardioDebut : setCardioFin
    setFn(prev => ({ ...prev, [sem]: { ...(prev[sem] || {}), media_url: publicUrl } }))
    const ref = position === 'debut' ? cardioImgDebutRef : cardioImgFinRef
    if (ref.current) ref.current.value = ''
  }

  async function saveCardio(position, newObj) {
    const col = position === 'debut' ? 'cardio_debut' : 'cardio_fin'
    if (position === 'debut') setCardioDebut(newObj)
    else setCardioFin(newObj)
    await supabase.from('seances').update({ [col]: newObj }).eq('id', id)
  }

  function updateCardioSem(position, sem, patch) {
    const setFn = position === 'debut' ? setCardioDebut : setCardioFin
    setFn(prev => ({ ...prev, [sem]: { ...(prev[sem] || {}), ...patch } }))
  }

  if (loading) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>
  if (!seance) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Séance introuvable.</p></div>

  const colSemaines = Array.from({ length: semaines }, (_, i) => i + 1)

  const BLOC_BG = ['#fffbeb','#eff6ff','#f0fdf4','#faf5ff','#fff1f2','#fff7ed','#ecfdf5','#f0f9ff']
  const BLOC_BORDER = ['#f59e0b','#3b82f6','#22c55e','#a855f7','#f43f5e','#f97316','#10b981','#0ea5e9']
  function blocStyle(code) {
    const letter = code?.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase()
    if (!letter) return {}
    const i = letter.charCodeAt(0) - 65
    return { background: BLOC_BG[i % BLOC_BG.length], borderLeft: `3px solid ${BLOC_BORDER[i % BLOC_BORDER.length]}` }
  }
  const graphData = colSemaines.map(s => ({
    name: `S${s}`,
    'RPE cible': rpeSeances[s]?.rpe_cible || null,
    'RPE réel': rpeSeances[s]?.rpe_reel || null,
  }))

  return (
    <div style={styles.page}>

      {/* ── Confirmation liaison bibliothèque ── */}
      {pendingAutoLink && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '1.5rem 1.75rem', width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>
            <p style={{ fontWeight: 900, fontSize: '1rem', color: '#1a1a1a', margin: '0 0 0.5rem' }}>Lier à la bibliothèque ?</p>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              <strong style={{ color: '#374151' }}>{pendingAutoLink.exerciceNom}</strong> ressemble à{' '}
              <strong style={{ color: '#1d4ed8' }}>{pendingAutoLink.biblioNom}</strong> dans ta bibliothèque.
              Veux-tu les lier ?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => handleAutoLinkDecision(false)} style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: 700, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
                Non
              </button>
              <button onClick={() => handleAutoLinkDecision(true)} style={{ background: '#1a1a1a', border: 'none', borderRadius: 9, padding: '0.5rem 1.25rem', fontSize: '0.85rem', fontWeight: 800, color: '#e4f816', cursor: 'pointer', fontFamily: 'inherit' }}>
                Oui, lier
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={() => navigate(`/programme/${seance.programmes.id}`)} style={styles.backBtn}>← Retour</button>

      {/* En-tête */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={styles.progLabel}>{seance.programmes.nom}</p>
          <h1 style={styles.title}>{seance.nom}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => navigate(`/seance/${id}/projection`)} style={{ background: '#111827', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.5rem 0.875rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            📺 Projection
          </button>
          <button onClick={sauvegarderTemplate} style={{ background: templateSaved ? '#f0fdf4' : 'white', color: templateSaved ? '#16a34a' : '#374151', border: `1.5px solid ${templateSaved ? '#86efac' : '#e5e7eb'}`, borderRadius: 10, padding: '0.5rem 0.875rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.3s' }}>
            {templateSaved ? '✓ Modèle sauvegardé' : '📋 Sauvegarder comme modèle'}
          </button>
        </div>
      </div>

      {/* ── Échauffement ── */}
      <div style={{ ...styles.card, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
          <p style={styles.sectionTitle}>Échauffement</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={openImportTemplates} style={{ ...styles.btnSecondary, fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}>
              📥 Importer {showImportEchauff ? '▲' : '▼'}
            </button>
            {echauffement.length > 0 && (
              <button onClick={saveEchauffAsTemplate} style={{ ...styles.btnSecondary, fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}>
                💾 Sauvegarder comme template
              </button>
            )}
          </div>
        </div>

        {/* ── Zone collage Excel ── */}
        <div style={{ marginBottom: '0.875rem' }}>
          <button onClick={() => { setShowEchauffPaste(v => !v); setEchauffParsed(null); setEchauffPasteText('') }}
            style={{ ...styles.btnSecondary, fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}>
            📋 Coller depuis Excel {showEchauffPaste ? '▲' : '▼'}
          </button>
          {showEchauffPaste && (
            <div style={{ marginTop: '0.5rem', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.875rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.5 }}>
                Colle directement depuis Excel (une ligne par exercice).<br />
                Les lignes <span style={{ fontFamily: 'monospace', background: '#e5e7eb', padding: '1px 4px', borderRadius: 3 }}>2 tours</span> en fin de groupe seront détectées automatiquement.
              </p>
              <textarea
                value={echauffPasteText}
                onChange={e => { setEchauffPasteText(e.target.value); setEchauffParsed(null) }}
                onPaste={e => { setTimeout(() => parseEchauffPaste(e.target.value + '\n' + (e.clipboardData?.getData('text') || '')), 0) }}
                placeholder={"90° hanches x8/c\nFacepull unilat x8/b\nSquat x6\n2 tours"}
                rows={5}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.82rem', fontFamily: 'monospace', resize: 'vertical', outline: 'none', background: 'white' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => parseEchauffPaste()} disabled={!echauffPasteText.trim()}
                  style={{ ...styles.btnSecondary, opacity: !echauffPasteText.trim() ? 0.5 : 1, fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
                  🔍 Analyser
                </button>
                {echauffParsed && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{echauffParsed.length} exercice{echauffParsed.length > 1 ? 's' : ''} détecté{echauffParsed.length > 1 ? 's' : ''}</span>}
              </div>
              {echauffParsed && echauffParsed.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aperçu</p>
                  <div style={{ background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.625rem 0.875rem' }}>
                    {(() => {
                      const groups = []
                      echauffParsed.forEach(l => {
                        const last = groups[groups.length - 1]
                        if (l.groupe && last?.groupe === l.groupe) last.items.push(l)
                        else groups.push({ groupe: l.groupe, items: [l] })
                      })
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {groups.map((g, gi) => !g.groupe
                            ? g.items.map((l, i) => (
                                <div key={l.id || `${gi}-${i}`} style={{ display: 'flex', gap: '0.75rem', padding: '0.25rem 0.5rem', background: '#f9fafb', borderRadius: 8 }}>
                                  <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
                                  <span style={{ fontSize: '0.82rem', color: '#6366f1', fontWeight: '700' }}>{l.reps}</span>
                                </div>
                              ))
                            : (() => {
                                const tours = g.items[0]?.tours
                                return (
                                  <div key={gi} style={{ display: 'flex', alignItems: 'stretch', borderLeft: '3px solid #e4f816', background: '#fffef5', borderRadius: '0 8px 8px 0', padding: '0.4rem 0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                      {g.items.map((l, i) => (
                                        <div key={l.id || i} style={{ display: 'flex', gap: '0.75rem', marginTop: i > 0 ? '0.25rem' : 0 }}>
                                          <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
                                          <span style={{ fontSize: '0.82rem', color: '#6366f1', fontWeight: '700' }}>{l.reps}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {tours && (
                                      <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.75rem', flexShrink: 0 }}>
                                        <div style={{ borderTop: '2px solid #d97706', borderRight: '2px solid #d97706', borderBottom: '2px solid #d97706', borderRadius: '0 4px 4px 0', width: 6, alignSelf: 'stretch' }} />
                                        <span style={{ fontSize: '0.72rem', fontWeight: '900', color: '#d97706', paddingLeft: '0.35rem', whiteSpace: 'nowrap' }}>{tours} tours</span>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()
                          )}
                        </div>
                      )
                    })()}
                  </div>
                  <button onClick={confirmEchauffPaste}
                    style={{ ...styles.btnSecondary, marginTop: '0.625rem', fontSize: '0.82rem', padding: '0.5rem 1rem', background: '#333333', color: '#e4f816', border: 'none' }}>
                    ✓ Ajouter ces {echauffParsed.length} exercices
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dropdown import templates */}
        {showImportEchauff && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '0.875rem', border: '1.5px solid #e5e7eb' }}>
            {loadingTemplates ? (
              <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>Chargement...</p>
            ) : echauffTemplates.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>Aucun template — crée-en un depuis la page Échauffements.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {echauffTemplates.map(t => (
                  <button key={t.id} onClick={() => importEchauffTemplate(t)}
                    style={{ background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.35rem 0.875rem', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', color: '#333333' }}>
                    {t.nom} <span style={{ color: '#9ca3af' }}>· {(t.lignes || []).length} ex.</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Table des lignes */}
        {echauffement.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.875rem' }}>
            {echauffement.map((l, i) => {
              const prevGroupe = i > 0 ? echauffement[i - 1].groupe : undefined
              const groupeChange = l.groupe !== prevGroupe
              return (
              <div key={l.id} style={{ background: l.groupe ? '#fffef5' : 'white', border: l.groupe ? '1.5px solid #e9f7a8' : '1.5px solid #f3f4f6', borderLeft: l.groupe ? '3px solid #e4f816' : '1.5px solid #f3f4f6', borderRadius: l.groupe ? '0 10px 10px 0' : 10, marginTop: groupeChange && i > 0 ? '0.25rem' : 0 }}>
                {editingEchauffId === l.id ? (
                  /* ── Mode édition ── */
                  <div style={{ padding: '0.5rem 0.875rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <input value={editEchauffForm.nom} onChange={e => setEditEchauffForm(f => ({ ...f, nom: e.target.value }))}
                        placeholder="Exercice" style={{ ...styles.formInput, flex: 1, minWidth: 120, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} autoFocus />
                      <input value={editEchauffForm.reps} onChange={e => setEditEchauffForm(f => ({ ...f, reps: e.target.value }))}
                        placeholder="Reps / durée" style={{ ...styles.formInput, width: 100, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} />
                      <input value={editEchauffForm.groupe} onChange={e => setEditEchauffForm(f => ({ ...f, groupe: e.target.value }))}
                        placeholder="Bloc" style={{ ...styles.formInput, width: 60, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} maxLength={2} />
                      {editEchauffForm.groupe.trim() && (
                        <input value={editEchauffForm.tours} onChange={e => setEditEchauffForm(f => ({ ...f, tours: e.target.value }))}
                          placeholder="Tours" style={{ ...styles.formInput, width: 68, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} type="number" min="1" />
                      )}
                      <button onClick={saveEditEchauffLine} style={{ ...styles.iconBtnSm, color: '#16a34a', borderColor: '#bbf7d0', fontWeight: '800' }}>✓</button>
                      <button onClick={() => setEditingEchauffId(null)} style={styles.iconBtnSm}>✕</button>
                    </div>
                    {/* Image / GIF */}
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {editEchauffForm.image_url && (
                        <img src={editEchauffForm.image_url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1.5px solid #e5e7eb', flexShrink: 0 }} />
                      )}
                      <input
                        value={editEchauffForm.image_url}
                        onChange={e => setEditEchauffForm(f => ({ ...f, image_url: e.target.value }))}
                        placeholder="🖼 URL image / YouTube (optionnel)"
                        style={{ ...styles.formInput, flex: 1, minWidth: 180, padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => echauffImgRef.current?.click()}
                        disabled={uploadingEchauff}
                        style={{ ...styles.iconBtnSm, fontSize: '0.75rem', whiteSpace: 'nowrap', padding: '0.35rem 0.6rem' }}
                      >
                        {uploadingEchauff ? '…' : '↑ Upload'}
                      </button>
                      <button
                        type="button"
                        onClick={() => ouvrirGifEchauff(editEchauffForm.nom)}
                        style={{ ...styles.iconBtnSm, fontSize: '0.75rem', whiteSpace: 'nowrap', padding: '0.35rem 0.6rem', background: wxKey ? '#f9fafb' : '#fffbeb', borderColor: wxKey ? '#e5e7eb' : '#fde68a', color: wxKey ? '#374151' : '#92400e' }}
                      >GIF</button>
                      {editEchauffForm.image_url && (
                        <button type="button" onClick={() => setEditEchauffForm(f => ({ ...f, image_url: '' }))} style={{ ...styles.iconBtnSm, color: '#dc2626', fontSize: '0.75rem' }}>✕</button>
                      )}
                      <input ref={echauffImgRef} type="file" accept="image/*,video/gif" style={{ display: 'none' }} onChange={e => uploadEchauffImage(e.target.files[0])} />
                    </div>
                  </div>
                ) : (
                  /* ── Mode affichage ── */
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem' }}>
                    {l.groupe ? (
                      <span style={{ background: '#333333', color: '#e4f816', padding: '0.1rem 0.45rem', borderRadius: 5, fontSize: '0.68rem', fontWeight: '900', flexShrink: 0 }}>
                        {l.groupe}{l.tours && echauffement.findIndex(x => x.groupe === l.groupe) === i ? ` · ${l.tours}t` : ''}
                      </span>
                    ) : <span style={{ width: 0 }} />}
                    {l.image_url && (
                      <img src={l.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1.5px solid #e5e7eb', flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: '600', color: '#333333' }}>{l.nom}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#6366f1', minWidth: 60 }}>{l.reps}</span>
                    <button onClick={() => startEditEchauffLine(l)} style={{ ...styles.iconBtnSm, fontSize: '0.75rem' }}>✏️</button>
                    {l.nom?.trim() && (
                      <button
                        onClick={() => sauvegarderEchauffEnBiblio(l)}
                        title="Sauvegarder dans la bibliothèque d'échauffements"
                        style={{ ...styles.iconBtnSm, fontSize: '0.75rem',
                          color: echauffBiblioFlash[l.id] === 'saved' ? '#16a34a' : echauffBiblioFlash[l.id] === 'exists' ? '#6366f1' : '#6b7280',
                          borderColor: echauffBiblioFlash[l.id] === 'saved' ? '#bbf7d0' : echauffBiblioFlash[l.id] === 'exists' ? '#ddd6fe' : undefined,
                          background: echauffBiblioFlash[l.id] === 'saved' ? '#f0fdf4' : echauffBiblioFlash[l.id] === 'exists' ? '#f5f3ff' : undefined
                        }}
                      >
                        {echauffBiblioFlash[l.id] === 'saved' ? '✓' : echauffBiblioFlash[l.id] === 'exists' ? '~' : '📚'}
                      </button>
                    )}
                    <button onClick={() => moveEchauffLine(i, -1)} disabled={i === 0} style={{ ...styles.iconBtnSm, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => moveEchauffLine(i, 1)} disabled={i === echauffement.length - 1} style={{ ...styles.iconBtnSm, opacity: i === echauffement.length - 1 ? 0.3 : 1 }}>↓</button>
                    <button onClick={() => removeEchauffLine(l.id)} style={{ ...styles.iconBtnSm, color: '#dc2626' }}>✕</button>
                  </div>
                )}
              </div>
            )})}
          </div>
        )}

        {/* Formulaire ajout ligne */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={echauffForm.nom} onChange={e => setEchauffForm(f => ({ ...f, nom: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addEchauffLine()}
            placeholder="Exercice" style={{ ...styles.formInput, flex: 1, minWidth: 140 }} />
          <input value={echauffForm.reps} onChange={e => setEchauffForm(f => ({ ...f, reps: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addEchauffLine()}
            placeholder="Reps / durée" style={{ ...styles.formInput, width: 110 }} />
          <input value={echauffForm.groupe} onChange={e => setEchauffForm(f => ({ ...f, groupe: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addEchauffLine()}
            placeholder="Bloc A, B…" style={{ ...styles.formInput, width: 80 }} maxLength={2} />
          {echauffForm.groupe.trim() && !echauffement.find(l => l.groupe === echauffForm.groupe.trim().toUpperCase()) && (
            <input value={echauffForm.tours} onChange={e => setEchauffForm(f => ({ ...f, tours: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addEchauffLine()}
              placeholder="Tours" style={{ ...styles.formInput, width: 72 }} type="number" min="1" />
          )}
          <button onClick={addEchauffLine} disabled={!echauffForm.nom.trim()}
            style={{ ...styles.btnPrimary, opacity: !echauffForm.nom.trim() ? 0.5 : 1 }}>
            + Ajouter
          </button>
        </div>
      </div>

      {/* ── Cardio ── */}
      <div style={{ ...styles.card, marginBottom: '1rem' }}>
        <p style={styles.sectionTitle}>Cardio</p>
        {[
          { position: 'debut', label: 'Avant séance', cardioAll: cardioDebut, sem: cardioDebutSem, setSem: setCardioDebutSem },
          { position: 'fin',   label: 'Après séance', cardioAll: cardioFin,   sem: cardioFinSem,   setSem: setCardioFinSem   },
        ].map(({ position, label, cardioAll, sem, setSem }) => {
          const cardio = cardioAll[sem] || null
          return (
            <div key={position} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: position === 'debut' ? '1px solid #f3f4f6' : 'none' }}>
              {/* Header : label + chips semaines */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', minWidth: 90 }}>{label}</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {colSemaines.map(s => {
                    const hasDef = !!cardioAll[s]?.type
                    return (
                      <button key={s} onClick={() => setSem(s)} style={{
                        padding: '2px 7px', borderRadius: 6, border: '1.5px solid',
                        fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer',
                        background: sem === s ? '#1a1a1a' : hasDef ? '#f0fdf4' : 'white',
                        borderColor: sem === s ? '#1a1a1a' : hasDef ? '#86efac' : '#e5e7eb',
                        color: sem === s ? '#e4f816' : hasDef ? '#16a34a' : '#9ca3af',
                      }}>S{s}</button>
                    )
                  })}
                </div>
                {cardio && (
                  <>
                    <button onClick={() => {
                      const newObj = { ...cardioAll }
                      colSemaines.forEach(s => { newObj[s] = cardio })
                      saveCardio(position, newObj)
                    }} style={{ ...styles.btnSecondary, fontSize: '0.68rem', padding: '2px 8px' }}>
                      Copier toutes semaines
                    </button>
                    <button onClick={() => {
                      const newObj = { ...cardioAll, [sem]: null }
                      saveCardio(position, newObj)
                    }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '700' }}>
                      ✕ Supprimer S{sem}
                    </button>
                  </>
                )}
                {!cardio && (
                  <button onClick={() => updateCardioSem(position, sem, { type: '', duree_min: '', intensite: '', note: '' })}
                    style={{ ...styles.btnSecondary, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                    + Ajouter S{sem}
                  </button>
                )}
              </div>
              {/* Formulaire semaine sélectionnée */}
              {cardio && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', background: '#f9fafb', borderRadius: 10, padding: '0.75rem' }}>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>Type</label>
                    <input placeholder="ex : Footing, Vélo…" value={cardio.type || ''}
                      onChange={e => updateCardioSem(position, sem, { type: e.target.value })}
                      style={styles.editInput} />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>Durée (min)</label>
                    <input type="number" placeholder="—" value={cardio.duree_min || ''}
                      onChange={e => updateCardioSem(position, sem, { duree_min: e.target.value })}
                      style={styles.editInput} min="1" max="120" />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>Intensité</label>
                    <select value={cardio.intensite || ''} onChange={e => updateCardioSem(position, sem, { intensite: e.target.value })} style={styles.editInput}>
                      <option value="">—</option>
                      {['Légère', 'Modérée', 'Intense'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ ...styles.editField, flex: 2, minWidth: 160 }}>
                    <label style={styles.editLabel}>Note</label>
                    <input placeholder="ex : 3×500m récup 1min" value={cardio.note || ''}
                      onChange={e => updateCardioSem(position, sem, { note: e.target.value })}
                      style={styles.editInput} />
                  </div>
                  <button onClick={() => saveCardio(position, { ...cardioAll, [sem]: cardio })} style={styles.btnPrimary}>
                    Enregistrer S{sem}
                  </button>
                  {/* Media */}
                  <div style={{ width: '100%', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {cardio.media_url && (() => {
                      const ytId = youtubeId(cardio.media_url)
                      return ytId
                        ? <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 8, border: '1.5px solid #e5e7eb', flexShrink: 0 }} />
                        : <img src={cardio.media_url} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 8, border: '1.5px solid #e5e7eb', flexShrink: 0 }} />
                    })()}
                    <input value={cardio.media_url || ''}
                      onChange={e => updateCardioSem(position, sem, { media_url: e.target.value })}
                      placeholder="URL image / GIF / YouTube (optionnel)"
                      style={{ ...styles.editInput, flex: 1, minWidth: 180, fontSize: '0.78rem' }} />
                    <button type="button" onClick={() => { const ref = position === 'debut' ? cardioImgDebutRef : cardioImgFinRef; ref.current?.click() }}
                      disabled={uploadingCardio}
                      style={{ ...styles.iconBtnSm, fontSize: '0.75rem', whiteSpace: 'nowrap', padding: '0.35rem 0.6rem' }}>
                      {uploadingCardio ? '…' : '↑ Upload'}
                    </button>
                    {cardio.media_url && (
                      <button type="button" onClick={() => updateCardioSem(position, sem, { media_url: '' })}
                        style={{ ...styles.iconBtnSm, color: '#dc2626', fontSize: '0.75rem' }}>✕</button>
                    )}
                    <input ref={position === 'debut' ? cardioImgDebutRef : cardioImgFinRef}
                      type="file" accept="image/*,video/gif" style={{ display: 'none' }}
                      onChange={e => uploadCardioImage(position, sem, e.target.files[0])} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* RPE + graphique */}
      <div style={styles.rpeGrid}>
        <div style={styles.card}>
          <p style={styles.sectionTitle}>Intensité de la séance (RPE)</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.rpeTable}>
              <thead>
                <tr>
                  <th style={styles.rpeThLabel}></th>
                  {colSemaines.map(s => <th key={s} style={styles.rpeTh}>S{s}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={styles.rpeTdLabel}>Cible</td>
                  {colSemaines.map(s => (
                    <td key={s} style={styles.rpeTd}>
                      <input type="number" min="1" max="10" step="0.5"
                        defaultValue={rpeSeances[s]?.rpe_cible || ''}
                        onBlur={e => updateRpeSeance(s, 'rpe_cible', e.target.value)}
                        style={styles.rpeInput} placeholder="—" />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ ...styles.rpeTdLabel, color: '#9ca3af' }}>Réel</td>
                  {colSemaines.map(s => (
                    <td key={s} style={styles.rpeTd}>
                      <input type="number" min="1" max="10" step="0.5"
                        defaultValue={rpeSeances[s]?.rpe_reel || ''}
                        onBlur={e => updateRpeSeance(s, 'rpe_reel', e.target.value)}
                        style={{ ...styles.rpeInput, color: '#6b7280' }} placeholder="—" />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.card}>
          <p style={styles.sectionTitle}>Progression RPE</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={graphData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              <Line type="monotone" dataKey="RPE cible" stroke="#333333" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="RPE réel" stroke="#e4f816" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table exercices */}
      <div style={{ ...styles.card, marginTop: '1rem', overflowX: 'hidden', padding: editAllMode ? '1.25rem 1rem' : '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <p style={{ ...styles.sectionTitle, margin: 0 }}>Exercices</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {editAllMode ? (
              <>
                <button onClick={saveAllEditions} style={{ ...styles.btnPrimary, padding: '0.45rem 1rem', fontSize: '0.82rem' }}>✓ Sauvegarder tout</button>
                <button onClick={() => setEditAllMode(false)} style={{ ...styles.btnSecondary, padding: '0.45rem 0.875rem', fontSize: '0.82rem' }}>✕ Annuler</button>
              </>
            ) : (
              <>
                {exercices.length > 0 && (
                  <button onClick={startEditAll} style={{ ...styles.btnSecondary, padding: '0.45rem 0.875rem', fontSize: '0.82rem', fontWeight: '700' }}>✏️ Modifier les exercices</button>
                )}
                <button onClick={() => setShowAIModal(true)} style={styles.btnAI}>✨ Générer avec l'IA</button>
              </>
            )}
          </div>
        </div>
        {/* ── Mode édition globale : cartes ── */}
        {editAllMode && exercices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {exercices.map((ex, idx) => {
              const f = formEditions[ex.id] || {}
              return (
                <div key={ex.id} style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '1rem 1.25rem', ...blocStyle(ex.code) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af' }}>#{idx + 1}</span>
                    <span style={styles.codeTag}>{f.code || ex.code}</span>
                    <span style={{ fontWeight: '700', color: '#333', fontSize: '0.9rem' }}>{f.nom || ex.nom}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={styles.editField}>
                      <label style={styles.editLabel}>Code</label>
                      <input value={f.code} onChange={e => updateFormEdition(ex.id, 'code', e.target.value)} style={styles.editInput} placeholder="A1" />
                    </div>
                    <div style={{ ...styles.editField, flex: 2, minWidth: 160 }}>
                      <label style={styles.editLabel}>Exercice</label>
                      <input value={f.nom} onChange={e => updateFormEdition(ex.id, 'nom', e.target.value)} style={styles.editInput} placeholder="Nom" />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel}>Séries</label>
                      <input value={f.series} onChange={e => updateFormEdition(ex.id, 'series', e.target.value)} style={styles.editInput} placeholder="4" type="number" />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel}>Reps</label>
                      <input value={f.repetitions} onChange={e => updateFormEdition(ex.id, 'repetitions', e.target.value)} style={styles.editInput} placeholder="8" />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel}>Tempo</label>
                      <input value={f.tempo} onChange={e => updateFormEdition(ex.id, 'tempo', e.target.value)} style={styles.editInput} placeholder="3-1-1-0" />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel}>Récup</label>
                      <input value={f.recuperation} onChange={e => updateFormEdition(ex.id, 'recuperation', e.target.value)} style={styles.editInput} placeholder="2min" />
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel}>Intensité</label>
                      <select value={f.type_intensite} onChange={e => updateFormEdition(ex.id, 'type_intensite', e.target.value)} style={styles.editInput}>
                        <option value="">—</option>
                        <option value="RPE">RPE</option>
                        <option value="RIR">RIR</option>
                        <option value="% 1RM">% 1RM</option>
                        <option value="Vitesse">Vitesse</option>
                        <option value="Libre">Libre</option>
                      </select>
                    </div>
                    <div style={styles.editField}>
                      <label style={styles.editLabel}>Valeur</label>
                      <input value={f.valeur_intensite} onChange={e => updateFormEdition(ex.id, 'valeur_intensite', e.target.value)} style={styles.editInput} placeholder="7" />
                    </div>
                    <div style={{ ...styles.editField, flex: 3, minWidth: 180 }}>
                      <label style={styles.editLabel}>Lien média (YouTube / image)</label>
                      <input value={f.media_url} onChange={e => updateFormEdition(ex.id, 'media_url', e.target.value)} style={styles.editInput} placeholder="https://youtube.com/..." />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.1rem' }}>
                      <button onClick={() => supprimerExercice(ex.id)} style={{ ...styles.iconBtnSm, color: '#dc2626', borderColor: '#fecaca' }}>🗑️</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!editAllMode && exercices.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1.5rem 0' }}>Aucun exercice. Ajoutez-en un ci-dessous.</p>
        ) : !editAllMode && (
          <div style={{ overflowX: 'auto', margin: '0 -1.5rem', padding: '0 1.5rem' }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}></th>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Exercice</th>
                <th style={styles.th}>Séries</th>
                <th style={styles.th}>Reps</th>
                <th style={styles.th}>Tempo</th>
                <th style={styles.th}>Récup</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Intensité</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Valeur</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Média</th>
                {colSemaines.map(s => (
                  <th key={s} style={{ ...styles.th, textAlign: 'center' }} colSpan={2}>S{s}</th>
                ))}
              </tr>
              <tr style={{ background: '#fafafa', fontSize: '0.7rem', color: '#9ca3af' }}>
                <th colSpan={10}></th>
                {colSemaines.map(s => (
                  <Fragment key={s}>
                    <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontWeight: '600' }}>kg</th>
                    <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontWeight: '600' }}>RPE</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {exercices.map(ex => (
                <Fragment key={ex.id}>
                <tr style={{ ...styles.tr, ...blocStyle(ex.code) }}>
                  {enEdition === ex.id ? (
                    <>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={() => sauvegarderEdition(ex.id)} style={styles.iconBtnSm}>✓</button>
                          <button onClick={() => setEnEdition(null)} style={styles.iconBtnSm}>✕</button>
                        </div>
                      </td>
                      <td style={styles.td}><input value={formEdition.code} onChange={e => setFormEdition({ ...formEdition, code: e.target.value })} style={{ ...styles.cellInput, width: '50px' }} /></td>
                      <td style={styles.td}>
                        <div style={{ position: 'relative' }}>
                          <input
                            value={formEdition.nom}
                            onChange={e => { setFormEdition({ ...formEdition, nom: e.target.value, bibliotheque_id: null }); searchEditNom(e.target.value) }}
                            onBlur={() => setTimeout(() => setEditNomSuggestions([]), 150)}
                            style={{ ...styles.cellInput, width: '130px' }}
                          />
                          {editNomSuggestions.length > 0 && (
                            <div style={styles.suggDropdown}>
                              {editNomSuggestions.map(ex => (
                                <div key={ex.id}
                                  onClick={() => { setFormEdition(f => ({ ...f, nom: ex.nom, bibliotheque_id: ex.id })); setEditNomSuggestions([]) }}
                                  style={styles.suggItem}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                >
                                  {ex.image_url && <img src={ex.image_url} alt="" style={styles.suggImg} />}
                                  <span>{ex.nom}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={styles.td}><input value={formEdition.series} onChange={e => setFormEdition({ ...formEdition, series: e.target.value })} style={{ ...styles.cellInput, width: '45px' }} /></td>
                      <td style={styles.td}><input value={formEdition.repetitions} onChange={e => setFormEdition({ ...formEdition, repetitions: e.target.value })} style={{ ...styles.cellInput, width: '55px' }} /></td>
                      <td style={styles.td}><input value={formEdition.tempo} onChange={e => setFormEdition({ ...formEdition, tempo: e.target.value })} style={{ ...styles.cellInput, width: '55px' }} /></td>
                      <td style={styles.td}><input value={formEdition.recuperation} onChange={e => setFormEdition({ ...formEdition, recuperation: e.target.value })} style={{ ...styles.cellInput, width: '55px' }} /></td>
                      <td style={styles.td}>
                        <select value={formEdition.type_intensite} onChange={e => setFormEdition({ ...formEdition, type_intensite: e.target.value })} style={{ ...styles.cellInput, width: '90px' }}>
                          <option value="">Intensité</option>
                          <option value="RPE">RPE</option>
                          <option value="RIR">RIR</option>
                          <option value="% 1RM">% 1RM</option>
                          <option value="Vitesse">Vitesse</option>
                          <option value="Libre">Libre</option>
                        </select>
                      </td>
                      <td style={styles.td}><input value={formEdition.valeur_intensite} onChange={e => setFormEdition({ ...formEdition, valeur_intensite: e.target.value })} style={{ ...styles.cellInput, width: '60px' }} /></td>
                      <td style={styles.td}>
                        <input
                          value={formEdition.media_url}
                          onChange={e => setFormEdition({ ...formEdition, media_url: e.target.value })}
                          placeholder="URL YouTube / image"
                          style={{ ...styles.cellInput, width: '160px' }}
                        />
                      </td>
                      {colSemaines.map(s => (
                        <Fragment key={s}>
                          <td style={styles.td}>—</td>
                          <td style={styles.td}>—</td>
                        </Fragment>
                      ))}
                    </>
                  ) : (
                    <>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', width: 'fit-content' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem' }}>
                            {/* Modifier */}
                            <button
                              title="Modifier"
                              onClick={() => { setEnEdition(ex.id); setFormEdition({ code: ex.code, nom: ex.nom, series: ex.series || '', repetitions: ex.repetitions || '', tempo: ex.tempo || '', recuperation: ex.recuperation || '', type_intensite: ex.type_intensite || '', valeur_intensite: ex.valeur_intensite || '', media_url: ex.media_url || '' }) }}
                              style={{ ...styles.iconBtnSm, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {/* Périodisation */}
                            <button
                              title="Progression par semaines"
                              onClick={() => setShowProgressionFor(showProgressionFor === ex.id ? null : ex.id)}
                              style={{ ...styles.iconBtnSm, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (ex.progressions?.length > 0) ? '#eff6ff' : undefined, color: (ex.progressions?.length > 0) ? '#2563eb' : '#6b7280' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            </button>
                            {/* Séries d'échauffement */}
                            <button
                              title="Séries d'échauffement"
                              onClick={() => setShowWarmupFor(showWarmupFor === ex.id ? null : ex.id)}
                              style={{ ...styles.iconBtnSm, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (ex.series_echauffement?.length > 0) ? '#fff7ed' : undefined, color: (ex.series_echauffement?.length > 0) ? '#ea580c' : '#6b7280' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c0 6-6 8-6 14a6 6 0 0 0 12 0c0-6-6-8-6-14z"/><path d="M12 12c0 3-2 4-2 6a2 2 0 0 0 4 0c0-2-2-3-2-6z"/></svg>
                            </button>
                            {/* Supprimer */}
                            <button
                              title="Supprimer"
                              onClick={() => supprimerExercice(ex.id)}
                              style={{ ...styles.iconBtnSm, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                          </div>
                          {/* Séries réalisées */}
                          <button
                            title="Séries réalisées par le client"
                            onClick={() => setShowSeriesFor(showSeriesFor === ex.id ? null : ex.id)}
                            style={{ ...styles.iconBtnSm, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 700, color: serieTrackingMap[ex.id] ? '#0369a1' : '#9ca3af', background: showSeriesFor === ex.id ? '#e0f2fe' : serieTrackingMap[ex.id] ? '#f0f9ff' : undefined, borderColor: showSeriesFor === ex.id ? '#7dd3fc' : serieTrackingMap[ex.id] ? '#bae6fd' : undefined }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M5 4h2v2H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2V4h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
                            {serieTrackingMap[ex.id] ? 'réalisé' : '—'}
                          </button>
                          {/* Bibliothèque */}
                          <button
                            title={ex.bibliotheque_id ? 'Lié à la bibliothèque' : 'Ajouter à la bibliothèque'}
                            onClick={() => openLibraryPanel(ex.id)}
                            style={{ ...styles.iconBtnSm, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 700, color: libraryLinked[ex.id] ? '#16a34a' : ex.bibliotheque_id ? '#6366f1' : '#9ca3af', background: libraryLinked[ex.id] ? '#f0fdf4' : ex.bibliotheque_id ? '#f5f3ff' : undefined, borderColor: libraryLinked[ex.id] ? '#bbf7d0' : ex.bibliotheque_id ? '#ddd6fe' : undefined }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                            {libraryLinked[ex.id] ? '✓' : ex.bibliotheque_id ? 'lié' : '—'}
                          </button>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.codeTag}>{ex.code}</span>
                      </td>
                      <td style={{ ...styles.td, fontWeight: '600', color: '#333333' }}>
                        {ex.nom}
                      </td>
                      <td style={styles.tdCenter}>{ex.series}</td>
                      <td style={styles.tdCenter}>{ex.repetitions}</td>
                      <td style={styles.tdCenter}>{ex.tempo}</td>
                      <td style={styles.tdCenter}>{ex.recuperation}</td>
                      <td style={styles.tdCenter}>
                        {ex.type_intensite && <span style={styles.intensiteTag}>{ex.type_intensite}</span>}
                      </td>
                      <td style={styles.tdCenter}>{ex.valeur_intensite}</td>
                      <td style={styles.tdCenter}>
                        {ex.media_url
                          ? <span title={ex.media_url} style={{ fontSize: '0.8rem', cursor: 'default' }}>
                              {/youtube|youtu\.be/i.test(ex.media_url) ? '▶' : '🖼'}
                            </span>
                          : <span style={{ color: '#e5e7eb', fontSize: '0.75rem' }}>—</span>
                        }
                      </td>
                      {colSemaines.map(s => (
                        <Fragment key={s}>
                          <td style={styles.tdCenter}>
                            <input type="text" inputMode="decimal"
                              defaultValue={charges[ex.id]?.[s]?.charge || trackingMap[ex.id]?.[s] || ''}
                              onBlur={e => updateCharge(ex.id, s, 'charge', e.target.value)}
                              style={{ ...styles.chargeInput, ...((!charges[ex.id]?.[s]?.charge && trackingMap[ex.id]?.[s]) ? { color: '#6b7280', fontStyle: 'italic' } : {}) }}
                              placeholder="—" />
                          </td>
                          <td style={styles.tdCenter}>
                            <input type="number" inputMode="decimal" min="1" max="10" step="0.5"
                              defaultValue={charges[ex.id]?.[s]?.rpe_reel || ''}
                              onBlur={e => updateCharge(ex.id, s, 'rpe_reel', e.target.value)}
                              style={{ ...styles.chargeInput, color: '#16a34a' }} placeholder="—" />
                          </td>
                        </Fragment>
                      ))}
                    </>
                  )}
                </tr>
                {/* ── Sous-ligne progression ── */}
                {showProgressionFor === ex.id && (
                  <tr>
                    <td colSpan={99} style={{ padding: '0 0 8px 0', background: '#f0f7ff' }}>
                      <div style={{ padding: '12px 16px', borderTop: '2px solid #bfdbfe', borderBottom: '2px solid #bfdbfe' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '.75rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Progression — {ex.nom}</span>
                          <button onClick={() => addProgBloc(ex.id)}
                            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer' }}>
                            + Bloc semaines
                          </button>
                          {(progDraft?.length > 0) && (
                            <button onClick={() => saveProgression(ex.id)}
                              style={{ background: progSaved[ex.id] ? '#16a34a' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 14px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'background .2s' }}>
                              {progSaved[ex.id]
                                ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sauvegardé !</>
                                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Sauvegarder</>
                              }
                            </button>
                          )}
                          {(progDraft?.length > 0) && (
                            <span style={{ fontSize: '.65rem', color: '#6b7280', marginLeft: 'auto' }}>
                              La prescription de chaque bloc remplace automatiquement la valeur par défaut côté client
                            </span>
                          )}
                        </div>

                        {(!(progDraft?.length)) ? (
                          <p style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
                            Clique sur "+ Bloc semaines" pour définir une progression. Ex : S1-2 → 3 séries / RPE 7, S3-4 → 4 séries / RPE 8…
                          </p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', fontSize: '.72rem' }}>
                              <thead>
                                <tr>
                                  <td style={{ padding: '4px 8px', fontWeight: 700, color: '#6b7280', width: 80 }}>Paramètre</td>
                                  {progDraft.map(p => (
                                    <td key={p.id} style={{ padding: '4px 6px', textAlign: 'center', minWidth: 110 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                        <input
                                          value={p.label ?? ''}
                                          onChange={e => updateDraftField(p.id, 'label', e.target.value)}
                                          style={{ width: 52, textAlign: 'center', fontWeight: 800, color: '#1d4ed8', border: '1.5px solid #bfdbfe', borderRadius: 6, padding: '2px 4px', fontSize: '.72rem', outline: 'none', background: '#eff6ff' }}
                                        />
                                        <button onClick={() => removeProgBloc(p.id)}
                                          style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '.8rem', lineHeight: 1, padding: 0 }}>×</button>
                                      </div>
                                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 3, fontSize: '.6rem', color: '#9ca3af' }}>
                                        <span>S</span>
                                        <input type="number" value={p.semaine_debut ?? ''} min={1}
                                          onChange={e => updateDraftField(p.id, 'semaine_debut', parseInt(e.target.value) || '')}
                                          style={{ width: 30, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 4, padding: '1px 2px', fontSize: '.6rem', outline: 'none' }} />
                                        <span>→</span>
                                        <input type="number" value={p.semaine_fin ?? ''} min={1}
                                          onChange={e => updateDraftField(p.id, 'semaine_fin', parseInt(e.target.value) || '')}
                                          style={{ width: 30, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 4, padding: '1px 2px', fontSize: '.6rem', outline: 'none' }} />
                                      </div>
                                    </td>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  { key: 'nom_variante',    label: 'Exercice' },
                                  { key: 'series',          label: 'Séries' },
                                  { key: 'repetitions',     label: 'Reps / RER' },
                                  { key: 'valeur_intensite',label: 'Intensité' },
                                  { key: 'detail',          label: 'Détail libre' },
                                ].map(row => (
                                  <tr key={row.key} style={{ borderTop: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '5px 8px', fontWeight: 700, color: '#374151', background: '#f8faff', whiteSpace: 'nowrap' }}>{row.label}</td>
                                    {progDraft.map(p => (
                                      <td key={p.id} style={{ padding: '4px 6px', textAlign: 'center' }}>
                                        <input
                                          value={p[row.key] ?? ''}
                                          onChange={e => updateDraftField(p.id, row.key, e.target.value)}
                                          placeholder="—"
                                          style={{ width: '100%', minWidth: 80, textAlign: 'center', border: '1.5px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontSize: '.72rem', outline: 'none', background: '#fff', fontWeight: 600 }}
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {/* ── Sous-ligne séries d'échauffement ── */}
                {showWarmupFor === ex.id && (
                  <tr>
                    <td colSpan={99} style={{ padding: '0 0 8px 0', background: '#fff7ed' }}>
                      <div style={{ padding: '12px 16px', borderTop: '2px solid #fed7aa', borderBottom: '2px solid #fed7aa' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '.75rem', fontWeight: 900, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '.06em' }}>Séries d'échauffement — {ex.nom}</span>
                          <button onClick={() => addWarmupCoach(ex.id)}
                            style={{ background: '#ea580c', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer' }}>
                            + Série vierge
                          </button>
                          <button onClick={() => openBiblioEchauff(ex.id)}
                            style={{ background: biblioEchauffOpen === ex.id ? '#fff7ed' : 'white', color: '#ea580c', border: '1.5px solid #fed7aa', borderRadius: 7, padding: '4px 12px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                            Depuis la bibliothèque
                          </button>
                          <span style={{ fontSize: '.65rem', color: '#9ca3af', marginLeft: 'auto' }}>
                            Visibles côté client, pré-remplies avec le % de la charge
                          </span>
                        </div>

                        {/* Picker bibliothèque échauffements */}
                        {biblioEchauffOpen === ex.id && (
                          <div style={{ background: '#fffbf5', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '0.75rem', marginBottom: '0.75rem' }}>
                            <input
                              value={biblioEchauffSearch}
                              onChange={e => searchBiblioEchauff(e.target.value)}
                              placeholder="Chercher un échauffement…"
                              style={{ width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.65rem', border: '1.5px solid #fed7aa', borderRadius: 7, fontSize: '.82rem', outline: 'none', marginBottom: '0.5rem', background: 'white' }}
                            />
                            {biblioEchauffLoading && <p style={{ fontSize: '.72rem', color: '#9ca3af', margin: 0 }}>Chargement…</p>}
                            {!biblioEchauffLoading && biblioEchauffList.length === 0 && (
                              <p style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
                                Aucun exercice d'échauffement dans la bibliothèque. Ajoute-en depuis "Bibliothèque d'exercices → Échauffements".
                              </p>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 200, overflowY: 'auto' }}>
                              {biblioEchauffList.map(item => (
                                <div key={item.id}
                                  onClick={() => choisirDepuisBiblioEchauff(ex.id, item)}
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'white', border: '1.5px solid #fed7aa', borderRadius: 8, padding: '0.35rem 0.65rem', cursor: 'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                >
                                  {item.image_url && (
                                    <img src={item.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                                  )}
                                  <span style={{ fontSize: '.82rem', fontWeight: 600, color: '#374151', flex: 1 }}>{item.nom}</span>
                                  <span style={{ fontSize: '.68rem', color: '#ea580c', fontWeight: 700 }}>+ Ajouter</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(!ex.series_echauffement?.length) ? (
                          <p style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
                            Clique sur "+ Série vierge" ou choisis depuis la bibliothèque. Ex : 10 reps à 40%, puis 8 reps à 70%…
                          </p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {(ex.series_echauffement || []).map((s, si) => (
                              <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '0.4rem 0.75rem' }}>
                                <button onClick={() => removeWarmupCoach(ex.id, si)}
                                  style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: '0 2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                                {s.image_url && <img src={s.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />}
                                <span style={{ fontSize: '.72rem', fontWeight: 900, color: '#ea580c', flexShrink: 0 }}>É{si + 1}{s.nom ? ` · ${s.nom}` : ''}</span>
                                <input
                                  type="text"
                                  value={s.reps}
                                  onChange={e => updateWarmupCoach(ex.id, si, 'reps', e.target.value)}
                                  placeholder="Reps"
                                  style={{ width: 54, padding: '0.3rem 0.45rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '.82rem', fontWeight: 700, textAlign: 'center', outline: 'none' }}
                                />
                                <span style={{ fontSize: '.72rem', color: '#9ca3af' }}>reps @</span>
                                <input
                                  type="number"
                                  value={s.pourcentage ?? ''}
                                  onChange={e => updateWarmupCoach(ex.id, si, 'pourcentage', e.target.value)}
                                  placeholder="%"
                                  min="1" max="100"
                                  style={{ width: 50, padding: '0.3rem 0.45rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '.82rem', fontWeight: 700, textAlign: 'center', outline: 'none' }}
                                />
                                <span style={{ fontSize: '.72rem', color: '#9ca3af' }}>% charge</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {/* ── Sous-ligne séries réalisées ── */}
                {showSeriesFor === ex.id && (() => {
                  const exData = serieTrackingMap[ex.id] || {}
                  const trackSemaines = Object.keys(exData).map(Number).sort((a, b) => a - b)
                  const maxSeries = trackSemaines.length
                    ? Math.max(...trackSemaines.map(s => exData[s].length))
                    : 0
                  return (
                    <tr>
                      <td colSpan={99} style={{ padding: '0 0 8px 0', background: '#f0f9ff' }}>
                        <div style={{ padding: '12px 16px', borderTop: '2px solid #7dd3fc', borderBottom: '2px solid #7dd3fc' }}>
                          <span style={{ fontSize: '.75rem', fontWeight: 900, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            Séries réalisées — {ex.nom}
                          </span>
                          {!trackSemaines.length ? (
                            <p style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic', margin: '8px 0 0 0' }}>
                              Aucune série enregistrée par le client pour cet exercice.
                            </p>
                          ) : (
                            <div style={{ overflowX: 'auto', marginTop: 10 }}>
                              <table style={{ borderCollapse: 'collapse', fontSize: '.73rem' }}>
                                <thead>
                                  <tr>
                                    <th style={{ padding: '4px 10px', fontWeight: 700, color: '#6b7280', background: '#e0f2fe', borderRadius: '6px 0 0 6px', textAlign: 'left' }}>Série</th>
                                    {trackSemaines.map(s => (
                                      <th key={s} style={{ padding: '4px 14px', fontWeight: 800, color: '#0369a1', background: '#e0f2fe', textAlign: 'center', minWidth: 90 }}>S{s}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {Array.from({ length: maxSeries }, (_, i) => (
                                    <tr key={i} style={{ borderTop: '1px solid #e0f2fe' }}>
                                      <td style={{ padding: '5px 10px', fontWeight: 700, color: '#374151', background: '#f8fcff', whiteSpace: 'nowrap' }}>S{i + 1}</td>
                                      {trackSemaines.map(s => {
                                        const row = exData[s]?.[i]
                                        if (!row) return <td key={s} style={{ padding: '5px 14px', textAlign: 'center', color: '#d1d5db' }}>—</td>
                                        const kg = row.poids ? `${row.poids} kg` : null
                                        const reps = row.reps_reelles != null ? `× ${row.reps_reelles}` : null
                                        const ok = row.valide
                                        return (
                                          <td key={s} style={{ padding: '5px 14px', textAlign: 'center' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: ok ? 700 : 400, color: ok ? '#15803d' : '#374151' }}>
                                              {kg || '—'}{reps ? <span style={{ color: ok ? '#16a34a' : '#6b7280' }}>{reps}</span> : null}
                                              {ok && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                            </span>
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })()}
                {/* ── Panneau bibliothèque ── */}
                {showLibraryFor === ex.id && (
                  <tr>
                    <td colSpan={99} style={{ padding: '0 0 8px 0', background: '#f5f3ff' }}>
                      <div style={{ padding: '12px 16px', borderTop: '2px solid #ddd6fe', borderBottom: '2px solid #ddd6fe' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <span style={{ fontSize: '.75rem', fontWeight: 900, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                            Bibliothèque — {ex.nom}
                          </span>
                          {ex.bibliotheque_id && (
                            <span style={{ fontSize: '.65rem', background: '#ede9fe', color: '#6d28d9', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>
                              ✓ Déjà lié
                            </span>
                          )}
                          <span style={{ fontSize: '.62rem', color: '#9ca3af', marginLeft: 'auto' }}>
                            Clique pour lier ou cherche ci-dessous
                          </span>
                        </div>

                        {/* Barre de recherche */}
                        <input
                          defaultValue={ex.nom}
                          onChange={e => searchLibrarySuggestions(ex.id, e.target.value)}
                          placeholder="Chercher dans la bibliothèque…"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '0.4rem 0.65rem', border: '1.5px solid #ddd6fe', borderRadius: 8, fontSize: '.82rem', outline: 'none', marginBottom: '0.6rem', background: 'white' }}
                        />

                        {librarySearching && <p style={{ fontSize: '.72rem', color: '#9ca3af', margin: 0 }}>Recherche…</p>}

                        {/* Suggestions */}
                        {librarySuggestions.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 220, overflowY: 'auto', marginBottom: '0.6rem' }}>
                            {librarySuggestions.map(b => (
                              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'white', border: `1.5px solid ${b.id === ex.bibliotheque_id ? '#a78bfa' : '#ede9fe'}`, borderRadius: 8, padding: '0.35rem 0.65rem' }}>
                                {b.image_url && <img src={b.image_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />}
                                <span style={{ flex: 1, fontSize: '.82rem', fontWeight: 600, color: '#374151' }}>{b.nom}</span>
                                {b.id === ex.bibliotheque_id
                                  ? <span style={{ fontSize: '.68rem', color: '#6d28d9', fontWeight: 700 }}>✓ Lié</span>
                                  : <button onClick={() => lierABibliotheque(ex.id, b.id)}
                                      style={{ background: '#6d28d9', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>
                                      Lier
                                    </button>
                                }
                              </div>
                            ))}
                          </div>
                        )}

                        {librarySuggestions.length === 0 && !librarySearching && (
                          <p style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic', margin: '0 0 0.6rem' }}>
                            Aucun résultat similaire. Crée une nouvelle entrée ci-dessous.
                          </p>
                        )}

                        <button onClick={() => creerEtLierBibliotheque(ex.id)}
                          style={{ background: 'white', border: '1.5px solid #ddd6fe', color: '#6d28d9', borderRadius: 7, padding: '5px 14px', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>
                          + Créer "{ex.nom}" dans la bibliothèque
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Formulaire ajout */}
      <div style={{ ...styles.card, marginTop: '1rem' }}>
        <p style={styles.sectionTitle}>Ajouter un exercice</p>

        {/* Bibliothèque — bouton unique */}
        <div style={{ marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" onClick={() => showFullLibrary ? setShowFullLibrary(false) : openFullLibrary()}
            style={{ ...styles.btnSecondary, whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '0.55rem 0.875rem' }}>
            {showFullLibrary ? '✕ Fermer la bibliothèque' : 'Choisir dans la bibliothèque'}
          </button>
          {form.bibliotheque_id && (
            <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: '700', whiteSpace: 'nowrap' }}>✓ Lié</span>
          )}
        </div>

          {/* Panel bibliothèque complète */}
          {showFullLibrary && (
            <div style={{ border: '1.5px solid #e5e7eb', borderRadius: '12px', background: 'white', marginTop: '6px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
              <div style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                <input
                  value={biblioFullSearch}
                  onChange={e => setBiblioFullSearch(e.target.value)}
                  placeholder="Filtrer..."
                  style={{ ...styles.formInput, width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                  autoFocus
                />
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {allBiblio.filter(ex => ex.nom.toLowerCase().includes(biblioFullSearch.toLowerCase())).length === 0 ? (
                  <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>
                    {allBiblio.length === 0 ? 'La bibliothèque est vide.' : 'Aucun résultat.'}
                  </p>
                ) : (
                  allBiblio
                    .filter(ex => ex.nom.toLowerCase().includes(biblioFullSearch.toLowerCase()))
                    .map(ex => (
                      <div key={ex.id} onClick={() => selectFromBiblio(ex)}
                        style={{ padding: '0.55rem 0.875rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', fontSize: '0.875rem', color: '#333333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        {ex.image_url
                          ? <img src={ex.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                          : <div style={{ width: 40, height: 40, background: '#f3f4f6', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>💪</div>
                        }
                        <span style={{ flex: 1 }}>{ex.nom}</span>
                        {ex.categorie && <span style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: '400' }}>{ex.categorie}</span>}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

        <form onSubmit={ajouterExercice}>
          <div style={styles.formGrid}>
            <input name="code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="A1" style={{ ...styles.formInput, width: '70px' }} />
            {/* Champ nom avec suggestions bibliothèque */}
            <div style={{ position: 'relative' }}>
              <input
                name="nom" value={form.nom}
                onChange={e => { setForm({ ...form, nom: e.target.value, bibliotheque_id: null }); searchNom(e.target.value) }}
                onBlur={() => setTimeout(() => setNomSuggestions([]), 150)}
                placeholder="Exercice"
                style={{ ...styles.formInput, width: '160px' }}
              />
              {nomSuggestions.length > 0 && (
                <div style={styles.suggDropdown}>
                  {nomSuggestions.map(ex => (
                    <div key={ex.id}
                      onClick={() => { setForm(f => ({ ...f, nom: ex.nom, bibliotheque_id: ex.id })); setNomSuggestions([]) }}
                      style={styles.suggItem}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      {ex.image_url && <img src={ex.image_url} alt="" style={styles.suggImg} />}
                      <span>{ex.nom}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {['series', 'repetitions', 'tempo', 'recuperation'].map(name => (
              <input key={name} name={name} value={form[name]} onChange={e => setForm({ ...form, [e.target.name]: e.target.value })}
                placeholder={{ series: 'Séries', repetitions: 'Reps', tempo: 'Tempo', recuperation: 'Récup' }[name]}
                style={{ ...styles.formInput, width: '80px' }} />
            ))}
            <select name="type_intensite" value={form.type_intensite} onChange={e => setForm({ ...form, type_intensite: e.target.value })} style={{ ...styles.formInput, width: '100px' }}>
              <option value="">Intensité</option>
              <option value="RPE">RPE</option>
              <option value="RIR">RIR</option>
              <option value="% 1RM">% 1RM</option>
              <option value="Vitesse">Vitesse</option>
              <option value="Libre">Libre</option>
            </select>
            <input name="valeur_intensite" value={form.valeur_intensite} onChange={e => setForm({ ...form, valeur_intensite: e.target.value })} placeholder="Valeur" style={{ ...styles.formInput, width: '80px' }} />
          </div>

          {/* Lien média */}
          <div style={{ marginTop: '0.5rem' }}>
            <input name="media_url" value={form.media_url} onChange={e => setForm({ ...form, media_url: e.target.value })}
              placeholder="Lien média (YouTube, image PNG/GIF) — optionnel"
              style={{ ...styles.formInput, width: '100%', boxSizing: 'border-box' }} />
          </div>

          {/* Option sauvegarde bibliothèque */}
          {!form.bibliotheque_id && (
            <div style={{ marginTop: '0.75rem', padding: '0.875rem', background: '#f9fafb', borderRadius: '10px', border: '1.5px solid #f3f4f6' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: saveToLibrary ? '0.75rem' : 0 }}>
                <input type="checkbox" checked={saveToLibrary} onChange={e => setSaveToLibrary(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#333333', cursor: 'pointer' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>Enregistrer dans la bibliothèque</span>
              </label>
              {saveToLibrary && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  {libraryImagePreview && <img src={libraryImagePreview} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1.5px solid #e5e7eb' }} />}
                  <button type="button" onClick={() => libraryFileRef.current.click()}
                    style={{ background: 'white', border: '1.5px dashed #d1d5db', borderRadius: '8px', padding: '0.5rem 0.875rem', fontSize: '0.82rem', cursor: 'pointer', color: '#374151', fontWeight: '600' }}>
                    {libraryImagePreview ? 'Changer la photo' : 'Ajouter une photo (optionnel)'}
                  </button>
                  <input ref={libraryFileRef} type="file" accept="image/*"
                    onChange={e => { const f = e.target.files[0]; if (f) { setLibraryImageFile(f); setLibraryImagePreview(URL.createObjectURL(f)) } }}
                    style={{ display: 'none' }} />
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <button type="submit" style={styles.btnPrimary}>+ Ajouter</button>
          </div>
        </form>
      </div>

      {showAIModal && (
        <SeanceAIModal
          existingCount={exercices.length}
          onClose={() => setShowAIModal(false)}
          onInsert={insertAIExercices}
          programmeId={seance?.programmes?.id}
        />
      )}

      {/* ── Modal GIF WorkoutX — Échauffement ── */}
      {gifEchauffOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setGifEchauffOpen(false) }}>
          <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:560, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'1rem 1.25rem 0.75rem', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <p style={{ fontWeight:800, fontSize:'0.9rem', margin:0 }}>GIF échauffement — WorkoutX</p>
              <button onClick={() => setGifEchauffOpen(false)} style={{ background:'none', border:'none', fontSize:'1rem', cursor:'pointer', color:'#9ca3af' }}>✕</button>
            </div>
            <div style={{ padding:'0.75rem 1.25rem', borderBottom:'1px solid #f3f4f6' }}>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <input
                  value={gifQuery}
                  onChange={e => setGifQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doGifEchauffSearch(gifQuery)}
                  placeholder="Nom de l'exercice (FR ou EN)"
                  style={{ flex:1, padding:'0.55rem 0.75rem', border:'1.5px solid #e5e7eb', borderRadius:10, fontSize:'0.85rem', outline:'none' }}
                />
                <button onClick={() => doGifEchauffSearch(gifQuery)} disabled={gifSearching}
                  style={{ ...styles.btnPrimary, padding:'0.55rem 1rem', fontSize:'0.82rem', flexShrink:0 }}>
                  {gifSearching ? '…' : 'Chercher'}
                </button>
              </div>
              {gifTranslated && gifTranslated !== gifQuery && (
                <p style={{ fontSize:'0.75rem', color:'#6b7280', margin:'0.4rem 0 0' }}>
                  Recherche en anglais : <strong style={{ color:'#6366f1' }}>{gifTranslated}</strong>
                </p>
              )}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'0.75rem 1.25rem' }}>
              {gifSearching && gifResults.length === 0 && <p style={{ textAlign:'center', color:'#9ca3af', fontSize:'0.85rem' }}>Recherche en cours…</p>}
              {!gifSearching && gifResults.length === 0 && <p style={{ textAlign:'center', color:'#9ca3af', fontSize:'0.85rem' }}>Aucun résultat. Essaie un autre terme (en anglais : "squat", "plank"…)</p>}
              {gifResults.length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.5rem' }}>
                  {gifResults.map(r => (
                    <button key={r.id} onClick={() => choisirGifEchauff(r)} disabled={gifSearching}
                      style={{ background:'#111', border:'2px solid #333', borderRadius:12, overflow:'hidden', cursor: gifSearching ? 'wait' : 'pointer', padding:0, display:'flex', flexDirection:'column' }}
                      onMouseEnter={e => { if (!gifSearching) e.currentTarget.style.borderColor='#e4f816' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='#333' }}>
                      {r._source === 'freedb'
                        ? <img src={r.imageUrl} alt={r.name} style={{ width:'100%', aspectRatio:'1', objectFit:'cover', display:'block' }} />
                        : <AuthGif url={r.gifUrl} apiKey={wxKey} alt={r.name} style={{ width:'100%', aspectRatio:'1' }} />
                      }
                      <span style={{ color:'white', fontSize:'0.6rem', padding:'0.3rem 0.4rem', textAlign:'center', lineHeight:1.2 }}>{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding:'0.6rem 1.25rem 1rem', borderTop:'1px solid #f3f4f6', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <span style={{ fontSize:'0.7rem', color:'#9ca3af', flex:1 }}>GIF par <a href="https://workoutxapp.com" target="_blank" rel="noreferrer" style={{ color:'#b45309' }}>WorkoutX</a></span>
              {!showWxKeyInput ? (
                <button onClick={() => setShowWxKeyInput(true)}
                  style={{ fontSize:'0.72rem', color: wxKey ? '#16a34a' : '#92400e', background: wxKey ? '#f0fdf4' : '#fffbeb', border:`1.5px solid ${wxKey ? '#bbf7d0':'#fde68a'}`, borderRadius:8, padding:'0.3rem 0.6rem', cursor:'pointer' }}>
                  {wxKey ? 'Clé OK' : 'Configurer clé'}
                </button>
              ) : (
                <div style={{ display:'flex', gap:'0.4rem', flex:1 }}>
                  <input value={wxKey} onChange={e => setWxKey(e.target.value)}
                    placeholder="Clé API WorkoutX"
                    style={{ flex:1, padding:'0.35rem 0.6rem', border:'1.5px solid #e5e7eb', borderRadius:8, fontSize:'0.78rem', outline:'none' }} />
                  <button onClick={() => { localStorage.setItem('workoutx_key', wxKey); setShowWxKeyInput(false) }}
                    style={{ ...styles.btnPrimary, fontSize:'0.78rem', padding:'0.35rem 0.75rem' }}>OK</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Saisie clé si pas encore configurée */}
      {showWxKeyInput && !gifEchauffOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setShowWxKeyInput(false) }}>
          <div style={{ background:'white', borderRadius:16, padding:'1.5rem', width:'100%', maxWidth:360 }}>
            <p style={{ fontWeight:800, marginBottom:'0.75rem' }}>Clé API WorkoutX</p>
            <input value={wxKey} onChange={e => setWxKey(e.target.value)} placeholder="Colle ta clé ici"
              style={{ width:'100%', padding:'0.6rem 0.75rem', border:'1.5px solid #e5e7eb', borderRadius:10, fontSize:'0.88rem', outline:'none', boxSizing:'border-box', marginBottom:'0.75rem' }} />
            <div style={{ display:'flex', gap:'0.5rem' }}>
              <button onClick={() => setShowWxKeyInput(false)} style={styles.btnSecondary}>Annuler</button>
              <button onClick={() => { localStorage.setItem('workoutx_key', wxKey); setShowWxKeyInput(false) }} style={styles.btnPrimary}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
const styles = {
  loading: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page: { padding: '1.25rem', maxWidth: '100%', overflowX: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' },
  progLabel: { fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' },
  title: { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  rpeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' },
  card: { background: 'white', borderRadius: '16px', padding: '1.25rem 1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  sectionTitle: { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem' },
  rpeTable: { borderCollapse: 'collapse', width: '100%' },
  rpeThLabel: { padding: '0.4rem 0.5rem', textAlign: 'left', fontSize: '0.75rem', color: '#9ca3af' },
  rpeTh: { padding: '0.4rem 0.5rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: '700', color: '#374151' },
  rpeTdLabel: { padding: '0.4rem 0.5rem', fontWeight: '700', fontSize: '0.8rem', color: '#374151', whiteSpace: 'nowrap' },
  rpeTd: { padding: '0.25rem 0.4rem', textAlign: 'center' },
  rpeInput: { width: '50px', textAlign: 'center', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.3rem', fontSize: '0.85rem', outline: 'none' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  thead: { background: '#f9fafb' },
  th: { padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '0.6rem 0.75rem', color: '#374151' },
  tdCenter: { padding: '0.6rem 0.5rem', textAlign: 'center', color: '#374151' },
  codeTag: { background: '#333333', color: '#e4f816', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800' },
  intensiteTag: { background: '#f3f4f6', color: '#374151', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600' },
  chargeInput: { width: '52px', textAlign: 'center', border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '0.25rem', fontSize: '0.8rem', outline: 'none' },
  cellInput: { padding: '0.25rem 0.4rem', border: '1.5px solid #e5e7eb', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' },
  iconBtnSm: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '0.25rem 0.4rem', cursor: 'pointer', fontSize: '0.8rem' },
  formGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' },
  formInput: { padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.85rem', color: '#333333', outline: 'none' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  btnAI: { background: '#111827', color: '#e4f816', border: '1.5px solid rgba(228,248,22,0.35)', borderRadius: '10px', padding: '0.5rem 0.875rem', fontSize: '0.82rem', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.01em' },
  suggDropdown: { position: 'absolute', top: '100%', left: 0, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '3px', overflow: 'hidden', minWidth: '200px' },
  suggItem: { padding: '0.45rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem', color: '#333333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'white' },
  suggImg: { width: 32, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 },
  editField: { display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 80, flex: 1 },
  editLabel: { fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  editInput: { padding: '0.45rem 0.6rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', color: '#333', outline: 'none', background: 'white', width: '100%', boxSizing: 'border-box' },
}
