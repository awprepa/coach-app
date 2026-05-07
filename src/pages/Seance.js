import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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

  useEffect(() => { fetchSeance() }, [])

  async function fetchSeance() {
    const { data, error } = await supabase.from('seances').select('*, programmes(id, nom, client_id, semaines)').eq('id', id).single()
    if (error) console.log(error)
    else { setSeance(data); setSemaines(data.programmes.semaines); await fetchExercices(); await fetchRpeSeances() }
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

  if (loading) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>
  if (!seance) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Séance introuvable.</p></div>

  const colSemaines = Array.from({ length: semaines }, (_, i) => i + 1)
  const graphData = colSemaines.map(s => ({
    name: `S${s}`,
    'RPE cible': rpeSeances[s]?.rpe_cible || null,
    'RPE réel': rpeSeances[s]?.rpe_reel || null,
  }))

  return (
    <div style={styles.page}>
      <button onClick={() => navigate(`/programme/${seance.programmes.id}`)} style={styles.backBtn}>← Retour</button>

      {/* En-tête */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={styles.progLabel}>{seance.programmes.nom}</p>
        <h1 style={styles.title}>{seance.nom}</h1>
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
              <Line type="monotone" dataKey="RPE cible" stroke="#111827" strokeWidth={2} dot={{ r: 3 }} connectNulls />
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
                <th style={styles.th}>Intensité</th>
                <th style={styles.th}>Valeur</th>
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
                <tr key={ex.id} style={styles.tr}>
                  {enEdition === ex.id ? (
                    <>
                      <td style={styles.td}><input value={formEdition.code} onChange={e => setFormEdition({ ...formEdition, code: e.target.value })} style={{ ...styles.cellInput, width: '50px' }} /></td>
                      <td style={styles.td}><input value={formEdition.nom} onChange={e => setFormEdition({ ...formEdition, nom: e.target.value })} style={{ ...styles.cellInput, width: '130px' }} /></td>
                      <td style={styles.td}><input value={formEdition.series} onChange={e => setFormEdition({ ...formEdition, series: e.target.value })} style={{ ...styles.cellInput, width: '45px' }} /></td>
                      <td style={styles.td}><input value={formEdition.repetitions} onChange={e => setFormEdition({ ...formEdition, repetitions: e.target.value })} style={{ ...styles.cellInput, width: '55px' }} /></td>
                      <td style={styles.td}><input value={formEdition.tempo} onChange={e => setFormEdition({ ...formEdition, tempo: e.target.value })} style={{ ...styles.cellInput, width: '55px' }} /></td>
                      <td style={styles.td}><input value={formEdition.recuperation} onChange={e => setFormEdition({ ...formEdition, recuperation: e.target.value })} style={{ ...styles.cellInput, width: '55px' }} /></td>
                      <td style={styles.td}>
                        <select value={formEdition.type_intensite} onChange={e => setFormEdition({ ...formEdition, type_intensite: e.target.value })} style={{ ...styles.cellInput, width: '90px' }}>
                          <option value="">—</option>
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
                      <td style={{ ...styles.td, fontWeight: '600', color: '#111827' }}>{ex.nom}</td>
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
                  style={{ padding: '0.5rem 0.875rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '0.875rem', color: '#111827', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
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
                        style={{ padding: '0.55rem 0.875rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', fontSize: '0.875rem', color: '#111827', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
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
            {[
              { name: 'code', placeholder: 'A1', width: '70px' },
              { name: 'nom', placeholder: 'Squat', width: '160px' },
              { name: 'series', placeholder: 'Séries', width: '80px' },
              { name: 'repetitions', placeholder: 'Reps', width: '80px' },
              { name: 'tempo', placeholder: 'Tempo', width: '80px' },
              { name: 'recuperation', placeholder: 'Récup', width: '80px' },
            ].map(f => (
              <input key={f.name} name={f.name} value={form[f.name]} onChange={e => setForm({ ...form, [e.target.name]: e.target.value })} placeholder={f.placeholder} style={{ ...styles.formInput, width: f.width }} />
            ))}
            <select name="type_intensite" value={form.type_intensite} onChange={e => setForm({ ...form, type_intensite: e.target.value })} style={{ ...styles.formInput, width: '100px' }}>
              <option value="">Type</option>
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
                  style={{ width: 16, height: 16, accentColor: '#111827', cursor: 'pointer' }} />
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
  title: { fontSize: '1.5rem', fontWeight: '800', color: '#111827', margin: 0 },
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
  codeTag: { background: '#111827', color: '#e4f816', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '800' },
  intensiteTag: { background: '#f3f4f6', color: '#374151', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600' },
  chargeInput: { width: '52px', textAlign: 'center', border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '0.25rem', fontSize: '0.8rem', outline: 'none' },
  cellInput: { padding: '0.25rem 0.4rem', border: '1.5px solid #e5e7eb', borderRadius: '6px', fontSize: '0.8rem', outline: 'none' },
  iconBtnSm: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '0.25rem 0.4rem', cursor: 'pointer', fontSize: '0.8rem' },
  formGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' },
  formInput: { padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.85rem', color: '#111827', outline: 'none' },
  btnPrimary: { background: '#111827', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
}
