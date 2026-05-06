import { useEffect, useState } from 'react'
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
  const [form, setForm] = useState({
    code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '',
    type_intensite: '', valeur_intensite: ''
  })
  const [enEdition, setEnEdition] = useState(null)
  const [formEdition, setFormEdition] = useState({})

  useEffect(() => {
    fetchSeance()
  }, [])

  async function fetchSeance() {
    const { data, error } = await supabase
      .from('seances')
      .select('*, programmes(id, nom, client_id, semaines)')
      .eq('id', id)
      .single()
    if (error) console.log(error)
    else {
      setSeance(data)
      setSemaines(data.programmes.semaines)
      await fetchExercices()
      await fetchRpeSeances()
    }
    setLoading(false)
  }

  async function fetchExercices() {
    const { data, error } = await supabase
      .from('exercices')
      .select('*, charges(*)')
      .eq('seance_id', id)
      .order('ordre', { ascending: true })
    if (error) console.log(error)
    else {
      setExercices(data)
      const chargesMap = {}
      data.forEach(ex => {
        chargesMap[ex.id] = {}
        ex.charges.forEach(c => {
          chargesMap[ex.id][c.semaine] = { id: c.id, charge: c.charge, rpe_reel: c.rpe_reel }
        })
      })
      setCharges(chargesMap)
    }
  }

  async function fetchRpeSeances() {
    const { data, error } = await supabase
      .from('rpe_seances')
      .select('*')
      .eq('seance_id', id)
    if (error) console.log(error)
    else {
      const rpeMap = {}
      data.forEach(r => {
        rpeMap[r.semaine] = { id: r.id, rpe_cible: r.rpe_cible, rpe_reel: r.rpe_reel }
      })
      setRpeSeances(rpeMap)
    }
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function ajouterExercice(e) {
    e.preventDefault()
    if (!form.code.trim() || !form.nom.trim()) return
    const { data, error } = await supabase
      .from('exercices')
      .insert([{
        seance_id: id,
        code: form.code,
        nom: form.nom,
        series: form.series ? parseInt(form.series) : null,
        repetitions: form.repetitions,
        tempo: form.tempo,
        recuperation: form.recuperation,
        type_intensite: form.type_intensite,
        valeur_intensite: form.valeur_intensite,
        ordre: exercices.length + 1
      }])
      .select()
      .single()
    if (error) alert(error.message)
    else {
      setExercices([...exercices, { ...data, charges: [] }])
      setCharges({ ...charges, [data.id]: {} })
      setForm({ code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '' })
    }
  }

  function commencerEdition(ex) {
    setEnEdition(ex.id)
    setFormEdition({
      code: ex.code, nom: ex.nom,
      series: ex.series || '', repetitions: ex.repetitions || '',
      tempo: ex.tempo || '', recuperation: ex.recuperation || '',
      type_intensite: ex.type_intensite || '', valeur_intensite: ex.valeur_intensite || ''
    })
  }

  async function sauvegarderEdition(exId) {
    const { error } = await supabase
      .from('exercices')
      .update({
        code: formEdition.code, nom: formEdition.nom,
        series: formEdition.series ? parseInt(formEdition.series) : null,
        repetitions: formEdition.repetitions,
        tempo: formEdition.tempo, recuperation: formEdition.recuperation,
        type_intensite: formEdition.type_intensite,
        valeur_intensite: formEdition.valeur_intensite
      })
      .eq('id', exId)
    if (error) alert(error.message)
    else {
      setExercices(exercices.map(ex => ex.id === exId ? { ...ex, ...formEdition } : ex))
      setEnEdition(null)
    }
  }

  async function supprimerExercice(exId) {
    if (!window.confirm('Supprimer cet exercice ?')) return
    const { error } = await supabase.from('exercices').delete().eq('id', exId)
    if (error) alert(error.message)
    else {
      setExercices(exercices.filter(ex => ex.id !== exId))
      const newCharges = { ...charges }
      delete newCharges[exId]
      setCharges(newCharges)
    }
  }

  async function updateCharge(exId, semaine, field, valeur) {
    const existing = charges[exId]?.[semaine]
    if (existing) {
      const { error } = await supabase
        .from('charges')
        .update({ [field]: valeur })
        .eq('id', existing.id)
      if (error) alert(error.message)
      else {
        setCharges({
          ...charges,
          [exId]: { ...charges[exId], [semaine]: { ...existing, [field]: valeur } }
        })
      }
    } else {
      const { data, error } = await supabase
        .from('charges')
        .insert([{ exercice_id: exId, semaine, [field]: valeur }])
        .select()
        .single()
      if (error) alert(error.message)
      else {
        setCharges({
          ...charges,
          [exId]: { ...charges[exId], [semaine]: { id: data.id, charge: '', rpe_reel: null, [field]: valeur } }
        })
      }
    }
  }

  async function updateRpeSeance(semaine, field, valeur) {
    const existing = rpeSeances[semaine]
    if (existing) {
      const { error } = await supabase
        .from('rpe_seances')
        .update({ [field]: valeur })
        .eq('id', existing.id)
      if (error) alert(error.message)
      else {
        setRpeSeances({
          ...rpeSeances,
          [semaine]: { ...existing, [field]: valeur }
        })
      }
    } else {
      const { data, error } = await supabase
        .from('rpe_seances')
        .insert([{ seance_id: id, semaine, [field]: valeur }])
        .select()
        .single()
      if (error) alert(error.message)
      else {
        setRpeSeances({
          ...rpeSeances,
          [semaine]: { id: data.id, rpe_cible: null, rpe_reel: null, [field]: valeur }
        })
      }
    }
  }

  if (loading) return <p>Chargement...</p>
  if (!seance) return <p>Séance introuvable.</p>

  const colSemaines = Array.from({ length: semaines }, (_, i) => i + 1)

  const graphData = colSemaines.map(s => ({
    name: `S${s}`,
    'RPE cible': rpeSeances[s]?.rpe_cible || null,
    'RPE réel': rpeSeances[s]?.rpe_reel || null,
  }))

  return (
    <div style={{ padding: '2rem', maxWidth: '100%', overflowX: 'auto' }}>
      <button onClick={() => navigate(`/programme/${seance.programmes.id}`)} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>
      <h1>{seance.nom}</h1>
      <p style={{ color: '#666' }}>{seance.programmes.nom}</p>

      {/* RPE SÉANCE */}
      <h2>Intensité de la séance (RPE)</h2>
      <table style={{ borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ padding: '0.5rem', textAlign: 'left' }}></th>
            {colSemaines.map(s => (
              <th key={s} style={{ padding: '0.5rem', textAlign: 'center' }}>S{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>RPE cible</td>
            {colSemaines.map(s => (
              <td key={s} style={{ padding: '0.25rem', textAlign: 'center' }}>
                <input
                  type="number" min="1" max="10" step="0.5"
                  defaultValue={rpeSeances[s]?.rpe_cible || ''}
                  onBlur={e => updateRpeSeance(s, 'rpe_cible', e.target.value)}
                  style={{ width: '55px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '0.25rem' }}
                  placeholder="—"
                />
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ padding: '0.5rem', fontWeight: 'bold', color: '#666' }}>RPE réel</td>
            {colSemaines.map(s => (
              <td key={s} style={{ padding: '0.25rem', textAlign: 'center' }}>
                <input
                  type="number" min="1" max="10" step="0.5"
                  defaultValue={rpeSeances[s]?.rpe_reel || ''}
                  onBlur={e => updateRpeSeance(s, 'rpe_reel', e.target.value)}
                  style={{ width: '55px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '0.25rem', color: '#666' }}
                  placeholder="—"
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* GRAPHIQUE RPE */}
      <div style={{ marginBottom: '2rem' }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={graphData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis domain={[0, 10]} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="RPE cible" stroke="#2563eb" strokeWidth={2} dot={true} connectNulls />
            <Line type="monotone" dataKey="RPE réel" stroke="#16a34a" strokeWidth={2} dot={true} strokeDasharray="5 5" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* EXERCICES */}
      <h2>Exercices</h2>
      {exercices.length === 0 ? (
        <p>Aucun exercice pour l'instant.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left', background: '#f5f5f5' }}>
              <th style={{ padding: '0.5rem' }}>Code</th>
              <th style={{ padding: '0.5rem' }}>Exercice</th>
              <th style={{ padding: '0.5rem' }}>Séries</th>
              <th style={{ padding: '0.5rem' }}>Reps</th>
              <th style={{ padding: '0.5rem' }}>Tempo</th>
              <th style={{ padding: '0.5rem' }}>Récup</th>
              <th style={{ padding: '0.5rem' }}>Type intensité</th>
              <th style={{ padding: '0.5rem' }}>Valeur</th>
              {colSemaines.map(s => (
                <th key={s} style={{ padding: '0.5rem', textAlign: 'center' }} colSpan={2}>S{s}</th>
              ))}
              <th style={{ padding: '0.5rem' }}>Actions</th>
            </tr>
            <tr style={{ borderBottom: '1px solid #ccc', background: '#fafafa', fontSize: '0.75rem', color: '#666' }}>
              <th colSpan={8}></th>
              {colSemaines.map(s => (
                <>
                  <th key={`${s}-kg`} style={{ padding: '0.25rem', textAlign: 'center' }}>kg</th>
                  <th key={`${s}-rpe`} style={{ padding: '0.25rem', textAlign: 'center' }}>RPE</th>
                </>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exercices.map(ex => (
              <tr key={ex.id} style={{ borderBottom: '1px solid #eee' }}>
                {enEdition === ex.id ? (
                  <>
                    <td style={{ padding: '0.5rem' }}><input value={formEdition.code} onChange={e => setFormEdition({ ...formEdition, code: e.target.value })} style={{ width: '50px' }} /></td>
                    <td style={{ padding: '0.5rem' }}><input value={formEdition.nom} onChange={e => setFormEdition({ ...formEdition, nom: e.target.value })} style={{ width: '130px' }} /></td>
                    <td style={{ padding: '0.5rem' }}><input value={formEdition.series} onChange={e => setFormEdition({ ...formEdition, series: e.target.value })} style={{ width: '45px' }} /></td>
                    <td style={{ padding: '0.5rem' }}><input value={formEdition.repetitions} onChange={e => setFormEdition({ ...formEdition, repetitions: e.target.value })} style={{ width: '55px' }} /></td>
                    <td style={{ padding: '0.5rem' }}><input value={formEdition.tempo} onChange={e => setFormEdition({ ...formEdition, tempo: e.target.value })} style={{ width: '55px' }} /></td>
                    <td style={{ padding: '0.5rem' }}><input value={formEdition.recuperation} onChange={e => setFormEdition({ ...formEdition, recuperation: e.target.value })} style={{ width: '55px' }} /></td>
                    <td style={{ padding: '0.5rem' }}>
                      <select value={formEdition.type_intensite} onChange={e => setFormEdition({ ...formEdition, type_intensite: e.target.value })} style={{ width: '90px' }}>
                        <option value="">—</option>
                        <option value="RPE">RPE</option>
                        <option value="RIR">RIR</option>
                        <option value="% 1RM">% 1RM</option>
                        <option value="Vitesse">Vitesse</option>
                        <option value="Libre">Libre</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem' }}><input value={formEdition.valeur_intensite} onChange={e => setFormEdition({ ...formEdition, valeur_intensite: e.target.value })} style={{ width: '60px' }} /></td>
                    {colSemaines.map(s => (
                      <>
                        <td key={`${s}-kg`} style={{ padding: '0.25rem' }}>—</td>
                        <td key={`${s}-rpe`} style={{ padding: '0.25rem' }}>—</td>
                      </>
                    ))}
                    <td style={{ padding: '0.5rem' }}>
                      <button onClick={() => sauvegarderEdition(ex.id)} style={{ marginRight: '0.25rem' }}>✅</button>
                      <button onClick={() => setEnEdition(null)}>✖️</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{ex.code}</td>
                    <td style={{ padding: '0.5rem' }}>{ex.nom}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{ex.series}</td>
                    <td style={{ padding: '0.5rem' }}>{ex.repetitions}</td>
                    <td style={{ padding: '0.5rem' }}>{ex.tempo}</td>
                    <td style={{ padding: '0.5rem' }}>{ex.recuperation}</td>
                    <td style={{ padding: '0.5rem', color: '#2563eb', fontWeight: 'bold' }}>{ex.type_intensite}</td>
                    <td style={{ padding: '0.5rem' }}>{ex.valeur_intensite}</td>
                    {colSemaines.map(s => (
                      <>
                        <td key={`${s}-kg`} style={{ padding: '0.25rem', textAlign: 'center' }}>
                          <input
                            type="text"
                            defaultValue={charges[ex.id]?.[s]?.charge || ''}
                            onBlur={e => updateCharge(ex.id, s, 'charge', e.target.value)}
                            style={{ width: '55px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '0.25rem' }}
                            placeholder="—"
                          />
                        </td>
                        <td key={`${s}-rpe`} style={{ padding: '0.25rem', textAlign: 'center' }}>
                          <input
                            type="number" min="1" max="10" step="0.5"
                            defaultValue={charges[ex.id]?.[s]?.rpe_reel || ''}
                            onBlur={e => updateCharge(ex.id, s, 'rpe_reel', e.target.value)}
                            style={{ width: '55px', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px', padding: '0.25rem', color: '#16a34a' }}
                            placeholder="—"
                          />
                        </td>
                      </>
                    ))}
                    <td style={{ padding: '0.5rem' }}>
                      <button onClick={() => commencerEdition(ex)} style={{ marginRight: '0.25rem' }}>✏️</button>
                      <button onClick={() => supprimerExercice(ex.id)}>🗑️</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* FORMULAIRE AJOUT EXERCICE */}
      <h2>Ajouter un exercice</h2>
      <form onSubmit={ajouterExercice}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input name="code" value={form.code} onChange={handleChange} placeholder="A1" required />
          <input name="nom" value={form.nom} onChange={handleChange} placeholder="Squat" required />
          <input name="series" value={form.series} onChange={handleChange} placeholder="Séries" />
          <input name="repetitions" value={form.repetitions} onChange={handleChange} placeholder="Reps" />
          <input name="tempo" value={form.tempo} onChange={handleChange} placeholder="Tempo" />
          <input name="recuperation" value={form.recuperation} onChange={handleChange} placeholder="Récup" />
          <select name="type_intensite" value={form.type_intensite} onChange={handleChange}>
            <option value="">Type</option>
            <option value="RPE">RPE</option>
            <option value="RIR">RIR</option>
            <option value="% 1RM">% 1RM</option>
            <option value="Vitesse">Vitesse</option>
            <option value="Libre">Libre</option>
          </select>
          <input name="valeur_intensite" value={form.valeur_intensite} onChange={handleChange} placeholder="Valeur" />
        </div>
        <button type="submit">+ Ajouter l'exercice</button>
      </form>
    </div>
  )
}