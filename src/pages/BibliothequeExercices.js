import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

const CATEGORIES = ['Musculation', 'Prépa physique', 'Cardio', 'Mobilité', 'Pliométrie', 'Haltérophilie', 'Gainage', 'Autre']

export default function BibliothequeExercices() {
  const [exercices, setExercices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('Tous')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nom: '', categorie: '', description: '' })
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [enEdition, setEnEdition] = useState(null)
  const [formEdit, setFormEdit] = useState({})
  const [imageFileEdit, setImageFileEdit] = useState(null)
  const [imagePreviewEdit, setImagePreviewEdit] = useState(null)
  const fileRef = useRef(null)
  const fileRefEdit = useRef(null)
  // Ajout à une séance
  const [seances, setSeances] = useState([])
  const [addingToSeance, setAddingToSeance] = useState(null) // id de l'exercice bibliothèque
  const [addForm, setAddForm] = useState({ seance_id: '', code: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '' })
  const [addSaving, setAddSaving] = useState(false)

  useEffect(() => { fetchExercices(); fetchSeances() }, [])

  async function fetchExercices() {
    const { data, error } = await supabase
      .from('bibliotheque_exercices').select('*').order('nom')
    if (error) console.log(error)
    else setExercices(data)
    setLoading(false)
  }

  async function fetchSeances() {
    const { data } = await supabase
      .from('seances')
      .select('id, nom, programmes(nom, clients(prenom, nom))')
      .order('nom')
    setSeances(data || [])
  }

  async function ajouterASeance(ex) {
    if (!addForm.seance_id || !addForm.code.trim()) return
    setAddSaving(true)
    const { data: existing } = await supabase
      .from('exercices').select('id').eq('seance_id', addForm.seance_id)
    const ordre = (existing?.length || 0) + 1
    const { error } = await supabase.from('exercices').insert([{
      seance_id: addForm.seance_id,
      bibliotheque_id: ex.id,
      nom: ex.nom,
      code: addForm.code,
      series: addForm.series ? parseInt(addForm.series) : null,
      repetitions: addForm.repetitions || null,
      tempo: addForm.tempo || null,
      recuperation: addForm.recuperation || null,
      type_intensite: addForm.type_intensite || null,
      valeur_intensite: addForm.valeur_intensite || null,
      ordre,
    }])
    setAddSaving(false)
    if (error) { alert(error.message); return }
    setAddingToSeance(null)
    setAddForm({ seance_id: '', code: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '' })
  }

  async function uploadImage(file) {
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('exercices').upload(path, file)
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('exercices').getPublicUrl(path)
    return publicUrl
  }

  async function ajouterExercice(e) {
    e.preventDefault()
    if (!form.nom.trim()) return
    setUploading(true)
    try {
      let image_url = null
      if (imageFile) image_url = await uploadImage(imageFile)
      const { data, error } = await supabase.from('bibliotheque_exercices').insert([{
        nom: form.nom, categorie: form.categorie || null,
        description: form.description || null, image_url
      }]).select().single()
      if (error) { alert(error.message); setUploading(false); return }
      setExercices(prev => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)))
      setForm({ nom: '', categorie: '', description: '' })
      setImageFile(null); setImagePreview(null)
      setShowForm(false)
    } catch (err) { alert(err.message) }
    setUploading(false)
  }

  async function sauvegarderEdition(exId) {
    setUploading(true)
    try {
      let image_url = formEdit.image_url
      if (imageFileEdit) image_url = await uploadImage(imageFileEdit)
      const { error } = await supabase.from('bibliotheque_exercices').update({
        nom: formEdit.nom, categorie: formEdit.categorie || null,
        description: formEdit.description || null, image_url
      }).eq('id', exId)
      if (error) { alert(error.message); setUploading(false); return }
      setExercices(prev => prev.map(ex => ex.id === exId ? { ...ex, ...formEdit, image_url } : ex))
      setEnEdition(null); setImageFileEdit(null); setImagePreviewEdit(null)
    } catch (err) { alert(err.message) }
    setUploading(false)
  }

  async function supprimerExercice(exId) {
    if (!window.confirm('Supprimer cet exercice de la bibliothèque ?')) return
    const { error } = await supabase.from('bibliotheque_exercices').delete().eq('id', exId)
    if (error) alert(error.message)
    else setExercices(prev => prev.filter(ex => ex.id !== exId))
  }

  function handleImageChange(e, isEdit = false) {
    const file = e.target.files[0]
    if (!file) return
    if (isEdit) { setImageFileEdit(file); setImagePreviewEdit(URL.createObjectURL(file)) }
    else { setImageFile(file); setImagePreview(URL.createObjectURL(file)) }
  }

  const allCats = ['Tous', ...CATEGORIES]
  const filtered = exercices.filter(ex => {
    const matchCat = catFilter === 'Tous' || ex.categorie === catFilter
    const matchSearch = ex.nom.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Bibliothèque d'exercices</h1>
          <p style={S.subtitle}>{exercices.length} exercice{exercices.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setEnEdition(null) }} style={S.btnPrimary}>
          {showForm ? '✕ Annuler' : '+ Ajouter un exercice'}
        </button>
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div style={S.formCard}>
          <p style={S.formTitle}>Nouvel exercice</p>
          <form onSubmit={ajouterExercice}>
            <div style={S.formRow}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={S.label}>Nom *</label>
                <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                  placeholder="ex : Squat barre" style={S.input} required />
              </div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={S.label}>Catégorie</label>
                <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} style={S.select}>
                  <option value="">— Choisir —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={S.label}>Description (optionnel)</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Conseils de réalisation, points clés..." style={S.textarea} rows={2} />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={S.label}>Image</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                {imagePreview && <img src={imagePreview} alt="" style={S.imagePreview} />}
                <button type="button" onClick={() => fileRef.current.click()} style={S.btnUpload}>
                  {imagePreview ? '🔄 Changer' : '📷 Ajouter une image'}
                </button>
                <input ref={fileRef} type="file" accept="image/*"
                  onChange={e => handleImageChange(e)} style={{ display: 'none' }} />
              </div>
            </div>
            <button type="submit" disabled={uploading} style={S.btnPrimary}>
              {uploading ? 'Enregistrement...' : '✓ Créer'}
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
              background: catFilter === c ? '#111827' : 'white',
              color: catFilter === c ? '#e4f816' : '#374151',
              border: `1.5px solid ${catFilter === c ? '#111827' : '#e5e7eb'}`,
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Grille */}
      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem' }}>Chargement...</p>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>
          <p>Aucun exercice trouvé.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Ajoutez votre premier exercice avec le bouton ci-dessus.</p>
        </div>
      ) : (
        <div style={S.grid}>
          {filtered.map(ex => (
            <div key={ex.id} style={S.card}>
              {enEdition === ex.id ? (
                <div style={{ padding: '1rem' }}>
                  <p style={{ ...S.formTitle, marginBottom: '0.875rem' }}>Modifier</p>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={S.label}>Nom</label>
                    <input value={formEdit.nom} onChange={e => setFormEdit({ ...formEdit, nom: e.target.value })} style={S.input} />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={S.label}>Catégorie</label>
                    <select value={formEdit.categorie || ''} onChange={e => setFormEdit({ ...formEdit, categorie: e.target.value })} style={S.select}>
                      <option value="">— Choisir —</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={S.label}>Description</label>
                    <textarea value={formEdit.description || ''} onChange={e => setFormEdit({ ...formEdit, description: e.target.value })}
                      style={S.textarea} rows={2} />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={S.label}>Image</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {(imagePreviewEdit || formEdit.image_url) && (
                        <img src={imagePreviewEdit || formEdit.image_url} alt="" style={S.imagePreview} />
                      )}
                      <button type="button" onClick={() => fileRefEdit.current.click()} style={S.btnUpload}>
                        {(imagePreviewEdit || formEdit.image_url) ? '🔄 Changer' : '📷 Ajouter'}
                      </button>
                      <input ref={fileRefEdit} type="file" accept="image/*"
                        onChange={e => handleImageChange(e, true)} style={{ display: 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => sauvegarderEdition(ex.id)} disabled={uploading} style={S.btnPrimary}>
                      {uploading ? '...' : '✓ Sauvegarder'}
                    </button>
                    <button onClick={() => { setEnEdition(null); setImageFileEdit(null); setImagePreviewEdit(null) }} style={S.btnSecondary}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={S.cardImg}>
                    {ex.image_url
                      ? <img src={ex.image_url} alt={ex.nom} style={S.img} />
                      : <div style={S.imgPlaceholder}><span style={{ fontSize: '2rem' }}>💪</span></div>
                    }
                  </div>
                  <div style={{ padding: '0.875rem', flex: 1 }}>
                    <p style={S.cardName}>{ex.nom}</p>
                    {ex.categorie && <span style={S.catTag}>{ex.categorie}</span>}
                    {ex.description && <p style={S.cardDesc}>{ex.description}</p>}
                  </div>
                  <div style={{ padding: '0 0.875rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* Bouton ajouter à une séance */}
                    <button
                      onClick={() => { setAddingToSeance(addingToSeance === ex.id ? null : ex.id); setEnEdition(null) }}
                      style={{ ...S.btnAddSeance, background: addingToSeance === ex.id ? '#111827' : '#f9fafb', color: addingToSeance === ex.id ? '#e4f816' : '#374151' }}
                    >
                      {addingToSeance === ex.id ? '✕ Annuler' : '+ Ajouter à une séance'}
                    </button>

                    {/* Panel ajout à séance */}
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
                            { key: 'code', ph: 'Code (A1)' },
                            { key: 'series', ph: 'Séries' },
                            { key: 'repetitions', ph: 'Reps' },
                            { key: 'tempo', ph: 'Tempo' },
                            { key: 'recuperation', ph: 'Récup' },
                          ].map(f => (
                            <input key={f.key} value={addForm[f.key]} onChange={e => setAddForm({ ...addForm, [f.key]: e.target.value })}
                              placeholder={f.ph} style={{ ...S.addInput, flex: 1, minWidth: '60px' }} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <select value={addForm.type_intensite} onChange={e => setAddForm({ ...addForm, type_intensite: e.target.value })} style={{ ...S.addInput, flex: 1 }}>
                            <option value="">Type intensité</option>
                            <option value="RPE">RPE</option>
                            <option value="RIR">RIR</option>
                            <option value="% 1RM">% 1RM</option>
                            <option value="Vitesse">Vitesse</option>
                            <option value="Libre">Libre</option>
                          </select>
                          <input value={addForm.valeur_intensite} onChange={e => setAddForm({ ...addForm, valeur_intensite: e.target.value })}
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
                        setFormEdit({ nom: ex.nom, categorie: ex.categorie || '', description: ex.description || '', image_url: ex.image_url || null })
                        setImagePreviewEdit(null)
                      }} style={S.iconBtn}>✏️ Modifier</button>
                      <button onClick={() => supprimerExercice(ex.id)} style={S.iconBtnDanger}>🗑️</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const S = {
  page: { padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' },
  title: { fontSize: '1.75rem', fontWeight: '800', color: '#111827', margin: '0 0 0.25rem' },
  subtitle: { color: '#9ca3af', fontSize: '0.85rem', margin: 0 },
  formCard: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1.75rem', border: '2px solid #e4f816' },
  formTitle: { fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1.25rem' },
  formRow: { display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' },
  label: { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#111827', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#111827', outline: 'none', background: 'white', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#111827', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },
  imagePreview: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '10px', border: '1.5px solid #e5e7eb' },
  btnUpload: { background: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: '10px', padding: '0.6rem 1rem', fontSize: '0.85rem', cursor: 'pointer', color: '#374151', fontWeight: '600' },
  catPill: { padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' },
  empty: { background: 'white', borderRadius: '16px', padding: '3rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '1rem' },
  card: { background: 'white', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' },
  cardImg: { width: '100%', aspectRatio: '4/3', overflow: 'hidden', background: '#f3f4f6' },
  img: { width: '100%', height: '100%', objectFit: 'cover' },
  imgPlaceholder: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' },
  cardName: { fontWeight: '700', fontSize: '0.92rem', color: '#111827', margin: '0 0 0.35rem' },
  catTag: { background: '#f3f4f6', color: '#374151', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '600' },
  cardDesc: { color: '#9ca3af', fontSize: '0.78rem', margin: '0.5rem 0 0', lineHeight: 1.4 },
  iconBtn: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', color: '#374151' },
  iconBtnDanger: { background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.78rem' },
  btnPrimary: { background: '#111827', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.65rem 1.1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  btnAddSeance: { border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700', textAlign: 'center' },
  addPanel: { background: '#f9fafb', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1.5px solid #e5e7eb' },
  addInput: { padding: '0.45rem 0.6rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.8rem', color: '#111827', outline: 'none', background: 'white', width: '100%', boxSizing: 'border-box' },
}
