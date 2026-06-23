import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../supabase'
import { findMuscles, MUSCLES } from '../data/muscleData'
import { findBiblioMatch } from '../utils/exerciceMatch'
import { searchFreeExDB } from '../utils/freeExerciseDB'

// ── Helpers média ──────────────────────────────────────────────────────────
function youtubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
function isImage(url) {
  return url && /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)
}
function mediaThumbnail(url) {
  const ytId = youtubeId(url)
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
  if (isImage(url)) return url
  return null
}

const CATEGORIES = ['Musculation', 'Prépa physique', 'Cardio', 'Mobilité', 'Pliométrie', 'Haltérophilie', 'Gainage', 'Autre']
const MUSCLE_KEYS = Object.keys(MUSCLES)

// Lit les muscles depuis un exercice (colonnes dédiées ou fallback JSON dans description)
function parseMuscles(ex) {
  if (ex.muscles_primaires && Array.isArray(ex.muscles_primaires)) {
    return { primary: ex.muscles_primaires, secondary: ex.muscles_secondaires || [] }
  }
  if (ex.description) {
    try {
      const p = JSON.parse(ex.description)
      if (p && p.p) return { primary: p.p || [], secondary: p.s || [] }
    } catch (_) {}
  }
  return { primary: [], secondary: [] }
}

function encodeMusclesInDescription(primary, secondary) {
  return JSON.stringify({ p: primary, s: secondary })
}

// Chips lecture seule
function MuscleChips({ primary, secondary }) {
  if (!primary.length && !secondary.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.4rem' }}>
      {primary.map(k => <span key={k} style={S.chipP}>{MUSCLES[k]?.label || k}</span>)}
      {secondary.map(k => <span key={k} style={S.chipS}>{MUSCLES[k]?.label || k}</span>)}
    </div>
  )
}

// Sélecteur muscles — deux lignes de chips cliquables
function MusclePicker({ primary, secondary, onChange }) {
  function toggle(key) {
    if (primary.includes(key)) {
      // primaire → secondaire
      onChange({ primary: primary.filter(k => k !== key), secondary: [...secondary.filter(k => k !== key), key] })
    } else if (secondary.includes(key)) {
      // secondaire → rien
      onChange({ primary, secondary: secondary.filter(k => k !== key) })
    } else {
      // rien → primaire
      onChange({ primary: [...primary, key], secondary })
    }
  }

  return (
    <div>
      <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0 0 0.6rem', lineHeight: 1.5 }}>
        1 clic = <span style={{ color: '#dc2626', fontWeight: 700 }}>primaire</span> · 2 clics = <span style={{ color: '#f97316', fontWeight: 700 }}>secondaire</span> · 3 clics = retirer
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {MUSCLE_KEYS.map(k => {
          const isPrimary   = primary.includes(k)
          const isSecondary = secondary.includes(k)
          return (
            <button
              key={k} type="button"
              onClick={() => toggle(k)}
              style={{
                padding: '0.3rem 0.7rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: isPrimary   ? '1.5px solid #dc2626'
                       : isSecondary ? '1.5px solid #f97316'
                       : '1.5px solid #e5e7eb',
                background: isPrimary   ? '#dc2626'
                           : isSecondary ? '#f97316'
                           : 'white',
                color: (isPrimary || isSecondary) ? 'white' : '#9ca3af',
              }}
            >
              {MUSCLES[k].label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Composant image authentifiée (WorkoutX GIFs nécessitent un header auth) ──
function AuthGif({ url, apiKey, style, alt }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (!url || !apiKey) return
    let objectUrl = null
    fetch(url, { headers: { 'X-WorkoutX-Key': apiKey } })
      .then(r => r.blob())
      .then(blob => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl) })
      .catch(() => {})
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url, apiKey])

  if (!src) return (
    <div style={{ ...style, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: '1.2rem', opacity: 0.4 }}>⏳</span>
    </div>
  )
  return <img src={src} alt={alt} style={{ ...style, objectFit: 'cover', display: 'block' }} />
}

// ── Traduction FR→EN pour la recherche WorkoutX ───────────────────────────
function frToEn(nom) {
  // Appliquer d'abord les expressions composées (ordre important : plus long en premier)
  const rules = [
    [/soulevé de terre roumain/gi, 'romanian deadlift'],
    [/soulevé de terre/gi,         'deadlift'],
    [/développé couché prise serrée/gi, 'close grip bench press'],
    [/développé couché/gi,         'bench press'],
    [/développé incliné/gi,        'incline bench press'],
    [/développé décliné/gi,        'decline bench press'],
    [/développé militaire/gi,      'overhead press'],
    [/développé nuque/gi,          'behind neck press'],
    [/développé/gi,                'press'],
    [/tirage horizontal/gi,        'seated row'],
    [/tirage nuque/gi,             'lat pulldown behind neck'],
    [/tirage poitrine/gi,          'lat pulldown'],
    [/tirage vertical/gi,          'lat pulldown'],
    [/tirage/gi,                   'row'],
    [/tractions? prise serrée/gi,  'close grip pull up'],
    [/tractions? pronation/gi,     'pull up'],
    [/tractions? supination/gi,    'chin up'],
    [/tractions?/gi,               'pull up'],
    [/élévations? latérales?/gi,   'lateral raise'],
    [/élévations? frontales?/gi,   'front raise'],
    [/élévations? postérieures?/gi,'rear delt raise'],
    [/oiseau|oiseau/gi,            'rear delt fly'],
    [/écarté couché/gi,            'chest fly'],
    [/écarté incliné/gi,           'incline fly'],
    [/écarté/gi,                   'fly'],
    [/curl marteau/gi,             'hammer curl'],
    [/curl incliné/gi,             'incline curl'],
    [/curl concentré/gi,           'concentration curl'],
    [/curl/gi,                     'curl'],
    [/extension nuque/gi,          'skull crusher'],
    [/extension tricep/gi,         'tricep extension'],
    [/extension/gi,                'extension'],
    [/leg press/gi,                'leg press'],
    [/leg curl/gi,                 'leg curl'],
    [/mollets? debout/gi,          'standing calf raise'],
    [/mollets? assis/gi,           'seated calf raise'],
    [/mollets?/gi,                 'calf raise'],
    [/fentes? marchées?/gi,        'walking lunge'],
    [/fentes? bulgares?/gi,        'bulgarian split squat'],
    [/fentes?/gi,                  'lunge'],
    [/squat goblet/gi,             'goblet squat'],
    [/squat bulgare/gi,            'bulgarian split squat'],
    [/squat sumo/gi,               'sumo squat'],
    [/squat/gi,                    'squat'],
    [/hip thrust/gi,               'hip thrust'],
    [/rowing/gi,                   'row'],
    [/gainage/gi,                  'plank'],
    [/pompes?/gi,                  'push up'],
    [/dips?/gi,                    'dip'],
    [/presse cuisse/gi,            'leg press'],
    [/presse/gi,                   'press'],
    [/haltères?/gi,                'dumbbell'],
    [/barre/gi,                    'barbell'],
    [/câble|poulie haute/gi,       'cable'],
    [/câble|poulie basse/gi,       'cable'],
    [/câble|poulie/gi,             'cable'],
    [/smith/gi,                    'smith machine'],
    [/incliné/gi,                  'incline'],
    [/décliné/gi,                  'decline'],
    [/couché/gi,                   'lying'],
    [/debout/gi,                   'standing'],
    [/assis/gi,                    'seated'],
    [/unilatéral|uni\b/gi,         'single arm'],
    [/bilatéral/gi,                ''],
    [/prise large/gi,              'wide grip'],
    [/prise serrée/gi,             'close grip'],
    [/prise neutre/gi,             'neutral grip'],
    [/prise inversée/gi,           'reverse grip'],
  ]
  let s = nom
  for (const [pattern, replacement] of rules) {
    s = s.replace(pattern, replacement)
  }
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // supprime accents résiduels
    .replace(/\s+/g, ' ')
    .trim()
}

export default function BibliothequeExercices() {
  const [exercices, setExercices]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [catFilter, setCatFilter]       = useState('Tous')
  const [showForm, setShowForm]         = useState(false)
  const [form, setForm]                 = useState({ nom: '', categorie: '', primary: [], secondary: [], image_url: '' })
  const [saving, setSaving]             = useState(false)
  const [enEdition, setEnEdition]       = useState(null)
  const [formEdit, setFormEdit]         = useState({})
  const [seances, setSeances]           = useState([])
  const [addingToSeance, setAddingToSeance] = useState(null)
  const [addForm, setAddForm]           = useState({ seance_id: '', code: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '' })
  const [addSaving, setAddSaving]       = useState(false)
  const [mediaModal, setMediaModal]     = useState(null) // { nom, url }
  const [uploadingFor, setUploadingFor] = useState(null) // 'create' | exId
  const [backfillState, setBackfillState] = useState(null) // null | 'loading' | 'preview' | 'applying' | 'done'
  const [backfillResult, setBackfillResult] = useState(null) // { matched: [], skipped: 0 }
  // WorkoutX GIF search
  const [workoutxKey, setWorkoutxKey] = useState(() => localStorage.getItem('workoutx_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [gifModal, setGifModal] = useState(null) // { target: 'create'|exId, nom: string }
  const [gifResults, setGifResults] = useState([])
  const [gifSearching, setGifSearching] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifTranslated, setGifTranslated] = useState('')
  const [modeEchauff, setModeEchauff]     = useState(false) // false = exercices, true = échauffements
  const fileRef = useRef()

  useEffect(() => { fetchExercices(); fetchSeances() }, [])

  async function fetchExercices() {
    const { data, error } = await supabase.from('bibliotheque_exercices').select('*').order('nom')
    if (!error) setExercices(data)
    setLoading(false)
  }

  async function fetchSeances() {
    const { data } = await supabase
      .from('seances')
      .select('id, nom, programmes(nom, clients(prenom, nom))')
      .order('nom')
    setSeances(data || [])
  }

  // ── Upload fichier image/GIF ──────────────────────────────────────────
  async function uploadMedia(file, target) {
    // target = 'create' | exId
    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `biblio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    setUploadingFor(target)
    const { error: upErr } = await supabase.storage.from('exercices').upload(path, file, { upsert: true })
    setUploadingFor(null)
    if (upErr) { alert('Erreur upload : ' + upErr.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('exercices').getPublicUrl(path)
    return publicUrl
  }

  async function handleFileChange(e, target) {
    const file = e.target.files[0]
    if (!file) return
    const url = await uploadMedia(file, target)
    if (!url) return
    if (target === 'create') {
      setForm(prev => ({ ...prev, image_url: url }))
    } else {
      setFormEdit(prev => ({ ...prev, image_url: url }))
    }
    e.target.value = ''
  }

  // Auto-remplissage muscles au changement de nom
  function applyAutoMuscles(nom, isEdit) {
    const m = findMuscles(nom)
    if (isEdit) {
      setFormEdit(prev => ({ ...prev, nom, ...(m ? { primary: m.primary, secondary: m.secondary } : {}) }))
    } else {
      setForm(prev => ({ ...prev, nom, ...(m ? { primary: m.primary, secondary: m.secondary } : {}) }))
    }
  }

  async function ajouterExercice(e) {
    e.preventDefault()
    if (!form.nom.trim()) return
    setSaving(true)
    const payload = { nom: form.nom.trim(), categorie: form.categorie || null, image_url: form.image_url || null, is_echauffement: modeEchauff }
    const { data, error } = await supabase
      .from('bibliotheque_exercices')
      .insert({ ...payload, muscles_primaires: form.primary, muscles_secondaires: form.secondary })
      .select().single()
    if (error) {
      // Fallback : colonnes muscles absentes → stockage JSON dans description
      const { data: d2, error: e2 } = await supabase
        .from('bibliotheque_exercices')
        .insert({ ...payload, description: encodeMusclesInDescription(form.primary, form.secondary) })
        .select().single()
      if (e2) { alert(e2.message); setSaving(false); return }
      setExercices(prev => [...prev, d2].sort((a, b) => a.nom.localeCompare(b.nom)))
    } else {
      setExercices(prev => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)))
    }
    setForm({ nom: '', categorie: '', primary: [], secondary: [], image_url: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function sauvegarderEdition(exId) {
    setSaving(true)
    const payload = { nom: formEdit.nom, categorie: formEdit.categorie || null, image_url: formEdit.image_url || null }
    const { error } = await supabase
      .from('bibliotheque_exercices')
      .update({ ...payload, muscles_primaires: formEdit.primary, muscles_secondaires: formEdit.secondary })
      .eq('id', exId)
    if (error) {
      const { error: e2 } = await supabase
        .from('bibliotheque_exercices')
        .update({ ...payload, description: encodeMusclesInDescription(formEdit.primary, formEdit.secondary) })
        .eq('id', exId)
      if (e2) { alert(e2.message); setSaving(false); return }
      setExercices(prev => prev.map(ex => ex.id === exId
        ? { ...ex, ...payload, description: encodeMusclesInDescription(formEdit.primary, formEdit.secondary) } : ex))
    } else {
      setExercices(prev => prev.map(ex => ex.id === exId
        ? { ...ex, ...payload, muscles_primaires: formEdit.primary, muscles_secondaires: formEdit.secondary } : ex))
    }
    setEnEdition(null)
    setSaving(false)
  }

  async function supprimerExercice(exId) {
    if (!window.confirm('Supprimer cet exercice de la bibliothèque ?')) return
    const { error } = await supabase.from('bibliotheque_exercices').delete().eq('id', exId)
    if (error) alert(error.message)
    else setExercices(prev => prev.filter(ex => ex.id !== exId))
  }

  async function ajouterASeance(ex) {
    if (!addForm.seance_id || !addForm.code.trim()) return
    setAddSaving(true)
    const { data: existing } = await supabase.from('exercices').select('id').eq('seance_id', addForm.seance_id)
    const ordre = (existing?.length || 0) + 1
    const { error } = await supabase.from('exercices').insert([{
      seance_id: addForm.seance_id, bibliotheque_id: ex.id, nom: ex.nom,
      code: addForm.code,
      series:           addForm.series        ? parseInt(addForm.series) : null,
      repetitions:      addForm.repetitions   || null,
      tempo:            addForm.tempo         || null,
      recuperation:     addForm.recuperation  || null,
      type_intensite:   addForm.type_intensite   || null,
      valeur_intensite: addForm.valeur_intensite  || null,
      ordre,
    }])
    setAddSaving(false)
    if (error) { alert(error.message); return }
    setAddingToSeance(null)
    setAddForm({ seance_id: '', code: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '' })
  }

  // ── WorkoutX GIF search ────────────────────────────────────────────────────
  function saveKey(key) {
    setWorkoutxKey(key)
    localStorage.setItem('workoutx_key', key)
  }

  async function doGifSearch(query) {
    if (!query.trim()) return
    setGifSearching(true)
    setGifResults([])

    const translated = frToEn(query)
    setGifTranslated(translated)
    const words = translated.split(/\s+/).filter(w => w.length > 2)

    // Plusieurs termes pour maximiser les chances de trouver
    const terms = [...new Set([
      translated,                                           // phrase complète traduite
      words.slice(0, 2).join(' '),                          // 2 premiers mots
      words[0],                                             // mot principal seul
      words.length > 2 ? words.slice(1).join(' ') : null,  // sans le premier mot
    ].filter(Boolean))]

    let keyError = false
    async function fetchTerm(term) {
      try {
        const res = await fetch(
          `https://api.workoutxapp.com/v1/exercises/name/${encodeURIComponent(term)}`,
          { headers: { 'X-WorkoutX-Key': workoutxKey } }
        )
        if (res.status === 401 || res.status === 403) { keyError = true; return [] }
        if (!res.ok) return []
        const json = await res.json()
        // Gère les formats : tableau direct, { data: [] }, { exercises: [] }, { results: [] }
        if (Array.isArray(json)) return json
        return json.data || json.exercises || json.results || []
      } catch { return [] }
    }

    try {
      // Recherches parallèles
      const allArrays = await Promise.all(terms.map(fetchTerm))

      if (keyError) {
        // Fallback automatique sur la base libre (sans clé, sans limite)
        setGifTranslated(translated + ' · DB Libre')
        const freeResults = await searchFreeExDB(translated)
        setGifResults(freeResults)
        setGifSearching(false)
        return
      }

      // Fusion + déduplication
      const seen = new Set()
      const merged = []
      for (const arr of allArrays) {
        for (const ex of arr) {
          if (!seen.has(ex.id)) { seen.add(ex.id); merged.push(ex) }
        }
      }

      // Tri par pertinence (Jaccard sur les mots)
      const qWords = new Set(translated.toLowerCase().split(/\s+/).filter(w => w.length > 1))
      const scored = merged.map(ex => {
        const nWords = new Set((ex.name || '').toLowerCase().split(/\s+/).filter(w => w.length > 1))
        const inter = [...qWords].filter(w => nWords.has(w)).length
        const union = new Set([...qWords, ...nWords]).size
        return { ...ex, _score: union ? inter / union : 0 }
      })
      scored.sort((a, b) => b._score - a._score)
      setGifResults(scored.slice(0, 9))
    } catch (e) {
      alert('Erreur WorkoutX : ' + e.message + '\nVérifie ta clé API.')
    }
    setGifSearching(false)
  }

  function ouvrirGifSearch(nom, target) {
    const q = nom || ''
    setGifQuery(q)
    setGifTranslated('')
    setGifModal({ target, nom: q })
    setGifResults([])
    doGifSearch(q)
  }

  async function choisirGif(r) {
    if (!gifModal) return
    setGifSearching(true)
    try {
      const url = r.gifUrl || r.imageUrl
      const headers = r._source === 'freedb' ? {} : { 'X-WorkoutX-Key': workoutxKey }
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const blob = await res.blob()
      const ext = r._source === 'freedb' ? 'jpg' : 'gif'
      const file = new File([blob], `ex_${r.id}.${ext}`, { type: blob.type || 'image/jpeg' })
      const publicUrl = await uploadMedia(file, 'workoutx_tmp')
      if (!publicUrl) throw new Error('Upload échoué')
      if (gifModal.target === 'create') setForm(prev => ({ ...prev, image_url: publicUrl }))
      else setFormEdit(prev => ({ ...prev, image_url: publicUrl }))
      setGifModal(null)
      setGifResults([])
    } catch (e) {
      alert('Erreur lors de la récupération du GIF : ' + e.message)
    }
    setGifSearching(false)
  }

  // ── Backfill : liaison automatique des anciens exercices ──────────────────
  async function lancerBackfill() {
    setBackfillState('loading')
    // Récupère tous les exercices de séances sans bibliotheque_id
    const { data: unlinked, error } = await supabase
      .from('exercices')
      .select('id, nom')
      .is('bibliotheque_id', null)
    if (error) { alert(error.message); setBackfillState(null); return }
    if (!unlinked?.length) {
      setBackfillResult({ matched: [], skipped: 0 })
      setBackfillState('done')
      return
    }
    // Matche chaque exercice contre la bibliothèque
    // 1re passe : correspondance exacte (insensible à la casse et aux espaces)
    // 2e passe : fuzzy matching pour les noms proches
    const matched = []
    for (const ex of unlinked) {
      const nomNorm = ex.nom.toLowerCase().trim()
      // Exact match d'abord
      const exact = exercices.find(b => b.nom.toLowerCase().trim() === nomNorm)
      if (exact) {
        matched.push({ exercice_id: ex.id, exercice_nom: ex.nom, biblio_id: exact.id, biblio_nom: exact.nom, score: 1.0 })
        continue
      }
      // Sinon fuzzy
      const result = findBiblioMatch(ex.nom, exercices)
      if (result) {
        matched.push({ exercice_id: ex.id, exercice_nom: ex.nom, biblio_id: result.match.id, biblio_nom: result.match.nom, score: result.score })
      }
    }
    setBackfillResult({ matched, skipped: unlinked.length - matched.length })
    setBackfillState('preview')
  }

  async function appliquerBackfill() {
    if (!backfillResult?.matched?.length) { setBackfillState('done'); return }
    setBackfillState('applying')
    // Grouper par biblio_id pour minimiser les requêtes
    const groups = {}
    for (const m of backfillResult.matched) {
      if (!groups[m.biblio_id]) groups[m.biblio_id] = []
      groups[m.biblio_id].push(m.exercice_id)
    }
    for (const [biblioId, ids] of Object.entries(groups)) {
      const { error } = await supabase
        .from('exercices')
        .update({ bibliotheque_id: biblioId })
        .in('id', ids)
      if (error) { alert('Erreur : ' + error.message); setBackfillState('preview'); return }
    }
    setBackfillState('done')
  }

  const allCats  = ['Tous', ...CATEGORIES]
  const filtered = exercices.filter(ex => {
    const matchMode   = !!ex.is_echauffement === modeEchauff
    const matchCat    = modeEchauff || catFilter === 'Tous' || ex.categorie === catFilter
    const matchSearch = ex.nom.toLowerCase().includes(search.toLowerCase())
    return matchMode && matchCat && matchSearch
  })

  return (
    <div style={S.page}>

      {/* ── Modal média plein écran ── */}
      {mediaModal && (
        <div onClick={() => setMediaModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#111', borderRadius: 16, overflow: 'hidden', maxWidth: 720, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#1a1a1a' }}>
              <span style={{ color: '#e4f816', fontWeight: 700, fontSize: '0.9rem' }}>{mediaModal.nom}</span>
              <button onClick={() => setMediaModal(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            {youtubeId(mediaModal.url)
              ? <iframe
                  src={`https://www.youtube.com/embed/${youtubeId(mediaModal.url)}?autoplay=1`}
                  style={{ width: '100%', aspectRatio: '16/9', border: 'none' }}
                  allow="autoplay; fullscreen"
                  title={mediaModal.nom}
                />
              : <img src={mediaModal.url} alt={mediaModal.nom} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
            }
          </div>
        </div>
      )}

      {/* ── Modal backfill ── */}
      {backfillState && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

            {/* Loading */}
            {backfillState === 'loading' && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔍</div>
                <p style={{ fontWeight: 700, color: '#333' }}>Analyse en cours…</p>
                <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Comparaison de tous les exercices sans lien</p>
              </div>
            )}

            {/* Applying */}
            {backfillState === 'applying' && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                <p style={{ fontWeight: 700, color: '#333' }}>Liaison en cours…</p>
                <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Mise à jour de la base de données</p>
              </div>
            )}

            {/* Done */}
            {backfillState === 'done' && (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#333', marginBottom: '0.5rem' }}>
                  {backfillResult?.matched?.length
                    ? `${backfillResult.matched.length} exercice${backfillResult.matched.length > 1 ? 's' : ''} lié${backfillResult.matched.length > 1 ? 's' : ''} !`
                    : 'Aucun exercice à lier'}
                </p>
                <p style={{ fontSize: '0.82rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
                  {backfillResult?.matched?.length
                    ? 'Tes clients verront maintenant les images en séance.'
                    : 'Tous les exercices sont déjà liés ou aucune correspondance trouvée.'}
                </p>
                <button onClick={() => { setBackfillState(null); setBackfillResult(null) }} style={S.btnPrimary}>
                  Fermer
                </button>
              </div>
            )}

            {/* Preview */}
            {backfillState === 'preview' && backfillResult && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <p style={{ fontWeight: 800, fontSize: '1rem', color: '#333', margin: 0 }}>🔗 Liaison automatique</p>
                    <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0.25rem 0 0' }}>
                      {backfillResult.matched.length} correspondance{backfillResult.matched.length !== 1 ? 's' : ''} trouvée{backfillResult.matched.length !== 1 ? 's' : ''}
                      {backfillResult.skipped > 0 && ` · ${backfillResult.skipped} sans correspondance`}
                    </p>
                  </div>
                  <button onClick={() => { setBackfillState(null); setBackfillResult(null) }} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
                </div>

                {backfillResult.matched.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>
                    Aucune correspondance trouvée. Vérifie que tes exercices dans la bibliothèque ont des noms similaires.
                  </p>
                ) : (
                  <div style={{ overflowY: 'auto', flex: 1, marginBottom: '1rem' }}>
                    {backfillResult.matched.map(m => (
                      <div key={m.exercice_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.exercice_nom}</p>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>→ {m.biblio_nom}</p>
                        </div>
                        <span style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 7px' }}>
                          {Math.round(m.score * 100)}%
                        </span>
                        <button
                          onClick={() => setBackfillResult(r => ({ ...r, matched: r.matched.filter(x => x.exercice_id !== m.exercice_id), skipped: r.skipped + 1 }))}
                          title="Ignorer cette liaison"
                          style={{ flexShrink: 0, background: 'none', border: '1px solid #e5e7eb', borderRadius: 5, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', lineHeight: 1 }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {backfillResult.matched.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setBackfillState(null); setBackfillResult(null) }} style={S.btnSecondary}>Annuler</button>
                    <button onClick={appliquerBackfill} style={S.btnPrimary}>
                      ✅ Lier les {backfillResult.matched.length} exercices
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal GIF WorkoutX ── */}
      {gifModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 600, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 800, color: '#333', fontSize: '0.95rem' }}>🎬 Choisir un GIF</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>Clique sur le GIF à utiliser pour cet exercice</p>
              </div>
              <button onClick={() => { setGifModal(null); setGifResults([]) }} style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
            </div>
            {/* Barre de recherche */}
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={gifQuery}
                  onChange={e => setGifQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doGifSearch(gifQuery)}
                  placeholder="Nom de l'exercice en FR ou EN…"
                  style={{ ...S.input, flex: 1, fontSize: '0.85rem', padding: '0.55rem 0.75rem' }}
                />
                <button onClick={() => doGifSearch(gifQuery)} disabled={gifSearching} style={{ ...S.btnPrimary, padding: '0.55rem 1rem', fontSize: '0.82rem', flexShrink: 0 }}>
                  {gifSearching ? '⏳' : '🔍 Chercher'}
                </button>
              </div>
              {gifTranslated && gifTranslated !== gifQuery && (
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>
                  🔤 Recherche en anglais : <strong style={{ color: '#6366f1' }}>{gifTranslated}</strong>
                  <span style={{ marginLeft: 6, color: '#d1d5db' }}>· tape en EN directement pour affiner</span>
                </p>
              )}
            </div>
            {/* Résultats */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem' }}>
              {gifSearching && gifResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</p>
                  <p style={{ fontSize: '0.85rem' }}>Recherche en cours…</p>
                </div>
              )}
              {gifSearching && gifResults.length > 0 && (
                <div style={{ textAlign: 'center', padding: '0.75rem', background: '#fffbeb', borderRadius: 10, marginBottom: '0.75rem', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                  ⬇️ Téléchargement du GIF en cours… (quelques secondes)
                </div>
              )}
              {!gifSearching && gifResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                  <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🤷</p>
                  <p style={{ fontSize: '0.85rem' }}>Aucun résultat. Essaie en anglais (ex : "bench press", "squat")</p>
                </div>
              )}
              {!gifSearching && gifResults.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                  {gifResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => choisirGif(r)}
                      style={{ background: '#111', border: '2px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', cursor: gifSearching ? 'wait' : 'pointer', padding: 0, display: 'flex', flexDirection: 'column', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => { if (!gifSearching) e.currentTarget.style.borderColor = '#e4f816' }}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                      disabled={gifSearching}
                      title={r.name}
                    >
                      {r._source === 'freedb'
                        ? <img src={r.imageUrl} alt={r.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                        : <AuthGif url={r.gifUrl} apiKey={workoutxKey} alt={r.name} style={{ width: '100%', aspectRatio: '1' }} />
                      }
                      <p style={{ margin: 0, padding: '0.4rem 0.5rem', fontSize: '0.65rem', fontWeight: 600, color: '#e5e7eb', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#1a1a1a' }}>{r.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bannière clé API WorkoutX ── */}
      {showKeyInput && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>
              🔑 Clé API WorkoutX
              <a href="https://workoutxapp.com" target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#b45309', fontWeight: 400, fontSize: '0.72rem' }}>
                Obtenir une clé gratuite →
              </a>
            </p>
            <input
              value={workoutxKey}
              onChange={e => saveKey(e.target.value)}
              placeholder="Colle ta clé API ici…"
              style={{ ...S.input, fontSize: '0.82rem', padding: '0.55rem 0.75rem' }}
            />
          </div>
          <button onClick={() => setShowKeyInput(false)} style={{ ...S.btnPrimary, padding: '0.55rem 1rem', fontSize: '0.82rem' }}>OK</button>
        </div>
      )}

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Bibliothèque d'exercices</h1>
          <p style={S.subtitle}>{filtered.length} exercice{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowKeyInput(v => !v)}
            style={{ ...S.btnSecondary, fontSize: '0.82rem', color: workoutxKey ? '#16a34a' : '#92400e', borderColor: workoutxKey ? '#bbf7d0' : '#fde68a', background: workoutxKey ? '#f0fdf4' : '#fffbeb' }}
            title={workoutxKey ? 'Clé WorkoutX configurée' : 'Configurer la clé API WorkoutX'}
          >
            {workoutxKey ? '🔑 GIF configuré' : '🔑 Config clé GIF'}
          </button>
          {!modeEchauff && (
            <button onClick={lancerBackfill} style={{ ...S.btnSecondary, fontSize: '0.82rem' }} title="Lier automatiquement les exercices existants à la bibliothèque">
              🔗 Lier les anciens exercices
            </button>
          )}
          <button onClick={() => { setShowForm(!showForm); setEnEdition(null) }} style={S.btnPrimary}>
            {showForm ? '✕ Annuler' : modeEchauff ? '+ Ajouter un échauffement' : '+ Ajouter un exercice'}
          </button>
        </div>
      </div>

      {/* ── Onglets Exercices / Échauffements ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[{ label: 'Exercices de travail', val: false }, { label: 'Échauffements', val: true }].map(tab => (
          <button
            key={String(tab.val)}
            onClick={() => { setModeEchauff(tab.val); setShowForm(false); setCatFilter('Tous'); setSearch('') }}
            style={{
              border: 'none', borderRadius: 9, padding: '0.45rem 1.1rem', fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s',
              background: modeEchauff === tab.val ? 'white' : 'transparent',
              color: modeEchauff === tab.val ? '#111' : '#6b7280',
              boxShadow: modeEchauff === tab.val ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── Formulaire ajout ── */}
      {showForm && (
        <div style={S.formCard}>
          <p style={S.formTitle}>{modeEchauff ? 'Nouvel échauffement' : 'Nouvel exercice'}</p>
          <form onSubmit={ajouterExercice}>
            <div style={S.formRow}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={S.label}>Nom *</label>
                <input
                  value={form.nom}
                  onChange={e => applyAutoMuscles(e.target.value, false)}
                  placeholder="ex : Squat barre"
                  style={S.input} required
                />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={S.label}>Catégorie</label>
                <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} style={S.select}>
                  <option value="">— Choisir —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={S.label}>
                Muscles ciblés
                <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 400, textTransform: 'none', marginLeft: 6 }}>
                  (détecté auto · ajuste si besoin)
                </span>
              </label>
              <div style={{ marginTop: '0.5rem' }}>
                <MusclePicker
                  primary={form.primary}
                  secondary={form.secondary}
                  onChange={({ primary, secondary }) => setForm(prev => ({ ...prev, primary, secondary }))}
                />
              </div>
            </div>
            {/* Média */}
            <MediaField
              value={form.image_url}
              onChange={url => setForm(prev => ({ ...prev, image_url: url }))}
              onFile={e => handleFileChange(e, 'create')}
              uploading={uploadingFor === 'create'}
            />
            <button
              type="button"
              onClick={() => ouvrirGifSearch(form.nom, 'create')}
              style={{ ...S.btnSecondary, fontSize: '0.82rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              🎬 Trouver GIF automatiquement
            </button>
            <button type="submit" disabled={saving} style={S.btnPrimary}>
              {saving ? 'Enregistrement...' : '✓ Créer'}
            </button>
          </form>
        </div>
      )}

      {/* Filtres */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un exercice..."
          style={{ ...S.input, marginBottom: '0.75rem' }} />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {allCats.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              ...S.catPill,
              background: catFilter === c ? '#333333' : 'white',
              color:      catFilter === c ? '#e4f816' : '#374151',
              border:     `1.5px solid ${catFilter === c ? '#333333' : '#e5e7eb'}`,
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem' }}>Chargement...</p>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>
          <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Aucun exercice trouvé.</p>
          <p style={{ fontSize: '0.85rem' }}>Ajoutez votre premier exercice avec le bouton ci-dessus.</p>
        </div>
      ) : (
        <div style={S.grid}>
          {filtered.map(ex => {
            const { primary, secondary } = parseMuscles(ex)
            return (
              <div key={ex.id} style={{ ...S.card, ...(enEdition === ex.id ? { overflow: 'visible', gridColumn: 'span 2' } : {}) }}>
                {enEdition === ex.id ? (
                  // ── Mode édition ──
                  <div style={{ padding: '1rem' }}>
                    <p style={{ ...S.formTitle, marginBottom: '0.875rem' }}>Modifier — {ex.nom}</p>
                    <label style={S.label}>Nom</label>
                    <input value={formEdit.nom} onChange={e => applyAutoMuscles(e.target.value, true)} style={{ ...S.input, marginBottom: '0.75rem' }} />
                    <label style={S.label}>Catégorie</label>
                    <select value={formEdit.categorie || ''} onChange={e => setFormEdit({ ...formEdit, categorie: e.target.value })} style={{ ...S.select, marginBottom: '0.75rem' }}>
                      <option value="">— Choisir —</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <label style={{ ...S.label, marginBottom: '0.5rem' }}>Muscles</label>
                    <div style={{ marginBottom: '1rem' }}>
                      <MusclePicker
                        primary={formEdit.primary || []}
                        secondary={formEdit.secondary || []}
                        onChange={({ primary: p, secondary: s }) => setFormEdit(prev => ({ ...prev, primary: p, secondary: s }))}
                      />
                    </div>
                    {/* Média */}
                    <MediaField
                      value={formEdit.image_url || ''}
                      onChange={url => setFormEdit(prev => ({ ...prev, image_url: url }))}
                      onFile={e => handleFileChange(e, ex.id)}
                      uploading={uploadingFor === ex.id}
                    />
                    <button
                      type="button"
                      onClick={() => ouvrirGifSearch(formEdit.nom || ex.nom, ex.id)}
                      style={{ ...S.btnSecondary, fontSize: '0.82rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      🎬 Trouver GIF automatiquement
                    </button>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => sauvegarderEdition(ex.id)} disabled={saving} style={S.btnPrimary}>
                        {saving ? '...' : '✓ Sauvegarder'}
                      </button>
                      <button onClick={() => setEnEdition(null)} style={S.btnSecondary}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  // ── Mode lecture ──
                  <>
                    {/* Miniature média */}
                    {ex.image_url && (() => {
                      const thumb = mediaThumbnail(ex.image_url)
                      const isYt  = !!youtubeId(ex.image_url)
                      return (
                        <div
                          onClick={() => setMediaModal({ nom: ex.nom, url: ex.image_url })}
                          style={{ position: 'relative', cursor: 'pointer', background: '#111', height: 130, overflow: 'hidden', borderRadius: '14px 14px 0 0' }}
                        >
                          {thumb
                            ? <img src={thumb} alt={ex.nom} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
                                <span style={{ fontSize: '2rem' }}>🔗</span>
                              </div>
                          }
                          {isYt && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <div style={{ background: 'rgba(0,0,0,0.65)', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#e4f816" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    <div style={{ padding: '0.875rem 0.875rem 0.5rem' }}>
                      <p style={S.cardName}>{ex.nom}</p>
                      {ex.categorie && <span style={S.catTag}>{ex.categorie}</span>}
                      <MuscleChips primary={primary} secondary={secondary} />
                    </div>
                    <div style={{ padding: '0 0.875rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button
                        onClick={() => { setAddingToSeance(addingToSeance === ex.id ? null : ex.id); setEnEdition(null) }}
                        style={{ ...S.btnAddSeance, background: addingToSeance === ex.id ? '#333333' : '#f9fafb', color: addingToSeance === ex.id ? '#e4f816' : '#374151' }}
                      >
                        {addingToSeance === ex.id ? '✕ Annuler' : '+ Ajouter à une séance'}
                      </button>

                      {addingToSeance === ex.id && (
                        <div style={S.addPanel}>
                          <select value={addForm.seance_id} onChange={e => setAddForm({ ...addForm, seance_id: e.target.value })} style={S.addInput}>
                            <option value="">— Choisir une séance —</option>
                            {seances.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.programmes?.clients?.prenom} {s.programmes?.clients?.nom} · {s.programmes?.nom} · {s.nom}
                              </option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {[
                              { key: 'code', ph: 'Code (A1)' }, { key: 'series', ph: 'Séries' },
                              { key: 'repetitions', ph: 'Reps' }, { key: 'tempo', ph: 'Tempo' }, { key: 'recuperation', ph: 'Récup' },
                            ].map(f => (
                              <input key={f.key} value={addForm[f.key]}
                                onChange={e => setAddForm({ ...addForm, [f.key]: e.target.value })}
                                placeholder={f.ph} style={{ ...S.addInput, flex: 1, minWidth: 60 }} />
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <select value={addForm.type_intensite} onChange={e => setAddForm({ ...addForm, type_intensite: e.target.value })} style={{ ...S.addInput, flex: 1 }}>
                              <option value="">Type intensité</option>
                              {['RPE', 'RIR', '% 1RM', 'Vitesse', 'Libre'].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <input value={addForm.valeur_intensite}
                              onChange={e => setAddForm({ ...addForm, valeur_intensite: e.target.value })}
                              placeholder="Valeur" style={{ ...S.addInput, flex: 1 }} />
                          </div>
                          <button onClick={() => ajouterASeance(ex)} disabled={addSaving || !addForm.seance_id || !addForm.code}
                            style={{ ...S.btnPrimary, width: '100%', opacity: (!addForm.seance_id || !addForm.code) ? 0.5 : 1 }}>
                            {addSaving ? 'Ajout...' : '✓ Ajouter à la séance'}
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => {
                          setEnEdition(ex.id); setAddingToSeance(null); setShowForm(false)
                          setFormEdit({ nom: ex.nom, categorie: ex.categorie || '', primary, secondary, image_url: ex.image_url || '' })
                        }} style={S.iconBtn}>✏️ Modifier</button>
                        <button onClick={() => supprimerExercice(ex.id)} style={S.iconBtnDanger}>🗑️</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Champ média réutilisable (URL + upload fichier) ── */
function MediaField({ value, onChange, onFile, uploading }) {
  const fileRef = useRef()
  const thumb = mediaThumbnail(value)
  const isYt  = !!youtubeId(value)

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
        Média (YouTube · image · GIF)
      </label>

      {/* Aperçu si URL renseignée */}
      {value && thumb && (
        <div style={{ marginBottom: '0.5rem', borderRadius: 10, overflow: 'hidden', position: 'relative', height: 100, background: '#111' }}>
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
          {isYt && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'rgba(0,0,0,0.6)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#e4f816" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 24, height: 24, color: 'white', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://youtube.com/watch?v=… ou URL image/GIF"
          style={{ flex: '1 1 180px', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#333', outline: 'none', boxSizing: 'border-box', minWidth: 0 }}
        />
        <input type="file" ref={fileRef} onChange={onFile} accept="image/*,.gif" style={{ display: 'none' }} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ flex: '0 0 auto', background: uploading ? '#f3f4f6' : '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.6rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, color: '#374151', cursor: uploading ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {uploading ? '⏳ Upload…' : '📎 Upload fichier'}
        </button>
      </div>
      {value && !thumb && (
        <p style={{ fontSize: '0.7rem', color: '#6366f1', margin: '0.3rem 0 0', wordBreak: 'break-all' }}>🔗 {value}</p>
      )}
      <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '0.3rem 0 0' }}>
        Lien YouTube · image directe (.jpg .png .gif .webp) · ou upload depuis ton appareil
      </p>
    </div>
  )
}

const S = {
  page:       { padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' },
  title:      { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: '0 0 0.25rem' },
  subtitle:   { color: '#9ca3af', fontSize: '0.85rem', margin: 0 },
  formCard:   { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1.75rem', border: '2px solid #e4f816' },
  formTitle:  { fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1.25rem' },
  formRow:    { display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' },
  label:      { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input:      { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  select:     { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', background: 'white', boxSizing: 'border-box' },
  catPill:    { padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' },
  empty:      { background: 'white', borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' },
  card:       { background: 'white', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' },
  cardName:   { fontWeight: '700', fontSize: '0.92rem', color: '#333333', margin: '0 0 0.35rem' },
  catTag:     { background: '#f3f4f6', color: '#374151', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '600' },
  chipP:      { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: '700' },
  chipS:      { background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: '700' },
  iconBtn:       { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', color: '#374151' },
  iconBtnDanger: { background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.78rem' },
  btnPrimary:    { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.65rem 1.1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary:  { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  btnAddSeance:  { border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700', textAlign: 'center' },
  addPanel:      { background: '#f9fafb', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1.5px solid #e5e7eb' },
  addInput:      { padding: '0.45rem 0.6rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.8rem', color: '#333333', outline: 'none', background: 'white', width: '100%', boxSizing: 'border-box' },
}
