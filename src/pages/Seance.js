import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function newId() { return Math.random().toString(36).slice(2) }

export default function Seance() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [charges, setCharges] = useState({})
  const [rpeSeances, setRpeSeances] = useState({})
  const [semaines, setSemaines] = useState(4)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '', bibliotheque_id: null })
  const [enEdition, setEnEdition] = useState(null)
  const [formEdition, setFormEdition] = useState({})
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
  // Échauffement
  const [echauffement, setEchauffement]           = useState([])
  const [echauffForm, setEchauffForm]             = useState({ nom: '', reps: '', groupe: '', tours: '' })
  const [showImportEchauff, setShowImportEchauff] = useState(false)
  const [echauffTemplates, setEchauffTemplates]   = useState([])
  const [loadingTemplates, setLoadingTemplates]   = useState(false)
  const [editingEchauffId, setEditingEchauffId]   = useState(null)
  const [editEchauffForm, setEditEchauffForm]     = useState({ nom: '', reps: '', groupe: '', tours: '' })
  const [showEchauffPaste, setShowEchauffPaste]   = useState(false)
  const [echauffPasteText, setEchauffPasteText]   = useState('')
  const [echauffParsed, setEchauffParsed]         = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSeance() }, [])

  async function fetchSeance() {
    const { data, error } = await supabase.from('seances').select('*, programmes(id, nom, client_id, semaines)').eq('id', id).single()
    if (error) console.log(error)
    else { setSeance(data); setSemaines(data.programmes.semaines); setEchauffement(data.echauffement || []); await fetchExercices(); await fetchRpeSeances() }
    setLoading(false)
  }

  async function fetchExercices() {
    const { data, error } = await supabase.from('exercices').select('*, charges(*)').eq('seance_id', id).order('ordre', { ascending: true })
    if (error) console.log(error)
    else {
      setExercices(data)
      const chargesMap = {}
      data.forEach(ex => {
        chargesMap[ex.id] = {}
        ex.charges.forEach(c => { chargesMap[ex.id][c.semaine] = { id: c.id, charge: c.charge, rpe_reel: c.rpe_reel } })
      })
      setCharges(chargesMap)
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
        setAllBiblio(prev => [...prev, libData].sort((a, b) => a.nom.localeCompare(b.nom)))
      }
    }

    const { data, error } = await supabase.from('exercices').insert([{
      seance_id: id, code: form.code, nom: form.nom,
      series: form.series ? parseInt(form.series) : null,
      repetitions: form.repetitions, tempo: form.tempo,
      recuperation: form.recuperation, type_intensite: form.type_intensite,
      valeur_intensite: form.valeur_intensite, ordre: exercices.length + 1,
      bibliotheque_id
    }]).select().single()
    if (error) alert(error.message)
    else {
      setExercices([...exercices, { ...data, charges: [] }])
      setCharges({ ...charges, [data.id]: {} })
      setForm({ code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '', bibliotheque_id: null })
      setBiblioSearch('')
      setSaveToLibrary(false)
      setLibraryImageFile(null)
      setLibraryImagePreview(null)
    }
  }

  async function sauvegarderEdition(exId) {
    const { error } = await supabase.from('exercices').update({
      code: formEdition.code, nom: formEdition.nom,
      series: formEdition.series ? parseInt(formEdition.series) : null,
      repetitions: formEdition.repetitions, tempo: formEdition.tempo,
      recuperation: formEdition.recuperation, type_intensite: formEdition.type_intensite,
      valeur_intensite: formEdition.valeur_intensite
    }).eq('id', exId)
    if (error) alert(error.message)
    else { setExercices(exercices.map(ex => ex.id === exId ? { ...ex, ...formEdition } : ex)); setEnEdition(null) }
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

  async function sauvegarderTemplate() {
    if (exercices.length === 0) { alert('Ajoutez des exercices avant de sauvegarder comme modèle.'); return }
    const exData = exercices.map(ex => ({
      code: ex.code, nom: ex.nom, series: ex.series, repetitions: ex.repetitions,
      tempo: ex.tempo, recuperation: ex.recuperation, type_intensite: ex.type_intensite,
      valeur_intensite: ex.valeur_intensite, ordre: ex.ordre, bibliotheque_id: ex.bibliotheque_id,
    }))
    const { error } = await supabase.from('seance_templates').insert([{ nom: seance.nom, exercices: exData }])
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
    setEditEchauffForm({ nom: l.nom || '', reps: l.reps || '', groupe: l.groupe || '', tours: l.tours ? String(l.tours) : '' })
  }

  function saveEditEchauffLine() {
    if (!editEchauffForm.nom.trim()) return
    const g = editEchauffForm.groupe.trim().toUpperCase() || null
    const tours = g && editEchauffForm.tours ? parseInt(editEchauffForm.tours) || null : null
    const updated = echauffement.map(l => {
      if (l.id === editingEchauffId) return { ...l, nom: editEchauffForm.nom.trim(), reps: editEchauffForm.reps.trim(), groupe: g, tours: g ? tours : null }
      if (g && l.groupe === g) return { ...l, tours }
      return l
    })
    persistEchauff(updated)
    setEditingEchauffId(null)
  }

  function removeEchauffLine(lid) { persistEchauff(echauffement.filter(l => l.id !== lid)) }

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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', padding: '0.5rem 0.875rem' }}>
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
                ) : (
                  /* ── Mode affichage ── */
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem' }}>
                    {l.groupe ? (
                      <span style={{ background: '#333333', color: '#e4f816', padding: '0.1rem 0.45rem', borderRadius: 5, fontSize: '0.68rem', fontWeight: '900', flexShrink: 0 }}>
                        {l.groupe}{l.tours && echauffement.findIndex(x => x.groupe === l.groupe) === i ? ` · ${l.tours}t` : ''}
                      </span>
                    ) : <span style={{ width: 0 }} />}
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: '600', color: '#333333' }}>{l.nom}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#6366f1', minWidth: 60 }}>{l.reps}</span>
                    <button onClick={() => startEditEchauffLine(l)} style={{ ...styles.iconBtnSm, fontSize: '0.75rem' }}>✏️</button>
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
      <div style={{ ...styles.card, marginTop: '1rem', overflowX: 'auto' }}>
        <p style={styles.sectionTitle}>Exercices</p>
        {exercices.length === 0 ? (
          <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1.5rem 0' }}>Aucun exercice. Ajoutez-en un ci-dessous.</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Exercice</th>
                <th style={styles.th}>Séries</th>
                <th style={styles.th}>Reps</th>
                <th style={styles.th}>Tempo</th>
                <th style={styles.th}>Récup</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Intensité</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Valeur</th>
                {colSemaines.map(s => (
                  <th key={s} style={{ ...styles.th, textAlign: 'center' }} colSpan={2}>S{s}</th>
                ))}
                <th style={styles.th}></th>
              </tr>
              <tr style={{ background: '#fafafa', fontSize: '0.7rem', color: '#9ca3af' }}>
                <th colSpan={8}></th>
                {colSemaines.map(s => (
                  <>
                    <th key={`${s}-kg`} style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontWeight: '600' }}>kg</th>
                    <th key={`${s}-rpe`} style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontWeight: '600' }}>RPE</th>
                  </>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exercices.map(ex => (
                <tr key={ex.id} style={{ ...styles.tr, ...blocStyle(ex.code) }}>
                  {enEdition === ex.id ? (
                    <>
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
                      {colSemaines.map(s => (
                        <>
                          <td key={`${s}-kg`} style={styles.td}>—</td>
                          <td key={`${s}-rpe`} style={styles.td}>—</td>
                        </>
                      ))}
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={() => sauvegarderEdition(ex.id)} style={styles.iconBtnSm}>✓</button>
                          <button onClick={() => setEnEdition(null)} style={styles.iconBtnSm}>✕</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={styles.td}>
                        <span style={styles.codeTag}>{ex.code}</span>
                      </td>
                      <td style={{ ...styles.td, fontWeight: '600', color: '#333333' }}>{ex.nom}</td>
                      <td style={styles.tdCenter}>{ex.series}</td>
                      <td style={styles.tdCenter}>{ex.repetitions}</td>
                      <td style={styles.tdCenter}>{ex.tempo}</td>
                      <td style={styles.tdCenter}>{ex.recuperation}</td>
                      <td style={styles.tdCenter}>
                        {ex.type_intensite && <span style={styles.intensiteTag}>{ex.type_intensite}</span>}
                      </td>
                      <td style={styles.tdCenter}>{ex.valeur_intensite}</td>
                      {colSemaines.map(s => (
                        <>
                          <td key={`${s}-kg`} style={styles.tdCenter}>
                            <input type="text"
                              defaultValue={charges[ex.id]?.[s]?.charge || ''}
                              onBlur={e => updateCharge(ex.id, s, 'charge', e.target.value)}
                              style={styles.chargeInput} placeholder="—" />
                          </td>
                          <td key={`${s}-rpe`} style={styles.tdCenter}>
                            <input type="number" min="1" max="10" step="0.5"
                              defaultValue={charges[ex.id]?.[s]?.rpe_reel || ''}
                              onBlur={e => updateCharge(ex.id, s, 'rpe_reel', e.target.value)}
                              style={{ ...styles.chargeInput, color: '#16a34a' }} placeholder="—" />
                          </td>
                        </>
                      ))}
                      <td style={styles.td}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={() => { setEnEdition(ex.id); setFormEdition({ code: ex.code, nom: ex.nom, series: ex.series || '', repetitions: ex.repetitions || '', tempo: ex.tempo || '', recuperation: ex.recuperation || '', type_intensite: ex.type_intensite || '', valeur_intensite: ex.valeur_intensite || '' }) }} style={styles.iconBtnSm}>✏️</button>
                          <button onClick={() => supprimerExercice(ex.id)} style={styles.iconBtnSm}>🗑️</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Formulaire ajout */}
      <div style={{ ...styles.card, marginTop: '1rem' }}>
        <p style={styles.sectionTitle}>Ajouter un exercice</p>

        {/* Recherche bibliothèque */}
        <div style={{ marginBottom: '0.875rem', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              value={biblioSearch}
              onChange={e => { setBiblioSearch(e.target.value); searchBiblio(e.target.value); setShowFullLibrary(false) }}
              placeholder="Chercher dans la bibliothèque..."
              style={{ ...styles.formInput, flex: 1 }}
            />
            <button type="button" onClick={() => showFullLibrary ? setShowFullLibrary(false) : openFullLibrary()}
              style={{ ...styles.btnSecondary, whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '0.55rem 0.875rem' }}>
              {showFullLibrary ? '✕ Fermer' : 'Voir tout'}
            </button>
            {form.bibliotheque_id && (
              <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: '700', whiteSpace: 'nowrap' }}>✓ Lié</span>
            )}
          </div>

          {/* Résultats recherche en temps réel */}
          {biblioResults.length > 0 && !showFullLibrary && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, marginTop: '4px', overflow: 'hidden' }}>
              {biblioResults.map(ex => (
                <div key={ex.id} onClick={() => selectFromBiblio(ex)}
                  style={{ padding: '0.5rem 0.875rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.875rem', color: '#333333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  {ex.image_url
                    ? <img src={ex.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    : <div style={{ width: 36, height: 36, background: '#f3f4f6', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>💪</div>
                  }
                  <span style={{ flex: 1 }}>{ex.nom}</span>
                  {ex.categorie && <span style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: '500' }}>{ex.categorie}</span>}
                </div>
              ))}
            </div>
          )}

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
        </div>

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
    </div>
  )
}

const styles = {
  loading: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page: { padding: '2rem', maxWidth: '100%', overflowX: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' },
  progLabel: { fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' },
  title: { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  rpeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
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
  suggDropdown: { position: 'absolute', top: '100%', left: 0, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, marginTop: '3px', overflow: 'hidden', minWidth: '200px' },
  suggItem: { padding: '0.45rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem', color: '#333333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'white' },
  suggImg: { width: 32, height: 32, objectFit: 'cover', borderRadius: 6, flexShrink: 0 },
}
