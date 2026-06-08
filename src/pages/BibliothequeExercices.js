import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import { findMuscles, MUSCLES } from '../data/muscleData'

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
    const payload = { nom: form.nom.trim(), categorie: form.categorie || null, image_url: form.image_url || null }
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

  const allCats  = ['Tous', ...CATEGORIES]
  const filtered = exercices.filter(ex => {
    const matchCat    = catFilter === 'Tous' || ex.categorie === catFilter
    const matchSearch = ex.nom.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
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

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Bibliothèque d'exercices</h1>
          <p style={S.subtitle}>{exercices.length} exercice{exercices.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEnEdition(null) }} style={S.btnPrimary}>
          {showForm ? '✕ Annuler' : '+ Ajouter un exercice'}
        </button>
      </div>

      {/* ── Formulaire ajout ── */}
      {showForm && (
        <div style={S.formCard}>
          <p style={S.formTitle}>Nouvel exercice</p>
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
