import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Seance() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    code: '',
    nom: '',
    series: '',
    repetitions: '',
    tempo: '',
    recuperation: '',
  })

  useEffect(() => {
    fetchSeance()
    fetchExercices()
  }, [])

  async function fetchSeance() {
    const { data, error } = await supabase
      .from('seances')
      .select('*, programmes(id, nom, client_id)')
      .eq('id', id)
      .single()

    if (error) console.log(error)
    else setSeance(data)
    setLoading(false)
  }

  async function fetchExercices() {
    const { data, error } = await supabase
      .from('exercices')
      .select('*')
      .eq('seance_id', id)
      .order('ordre', { ascending: true })

    if (error) console.log(error)
    else setExercices(data)
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
        ordre: exercices.length + 1
      }])
      .select()
      .single()

    if (error) alert(error.message)
    else {
      setExercices([...exercices, data])
      setForm({ code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '' })
    }
  }

  if (loading) return <p>Chargement...</p>
  if (!seance) return <p>Séance introuvable.</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <button onClick={() => navigate(`/programme/${seance.programmes.id}`)} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>
      <h1>{seance.nom}</h1>
      <p style={{ color: '#666' }}>{seance.programmes.nom}</p>

      <h2>Exercices</h2>

      {exercices.length === 0 ? (
        <p>Aucun exercice pour l'instant.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Code</th>
              <th style={{ padding: '0.5rem' }}>Exercice</th>
              <th style={{ padding: '0.5rem' }}>Séries</th>
              <th style={{ padding: '0.5rem' }}>Reps</th>
              <th style={{ padding: '0.5rem' }}>Tempo</th>
              <th style={{ padding: '0.5rem' }}>Récup</th>
            </tr>
          </thead>
          <tbody>
            {exercices.map(ex => (
              <tr key={ex.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{ex.code}</td>
                <td style={{ padding: '0.5rem' }}>{ex.nom}</td>
                <td style={{ padding: '0.5rem' }}>{ex.series}</td>
                <td style={{ padding: '0.5rem' }}>{ex.repetitions}</td>
                <td style={{ padding: '0.5rem' }}>{ex.tempo}</td>
                <td style={{ padding: '0.5rem' }}>{ex.recuperation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Ajouter un exercice</h2>
      <form onSubmit={ajouterExercice}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input name="code" value={form.code} onChange={handleChange} placeholder="N°" required />
          <input name="nom" value={form.nom} onChange={handleChange} placeholder="Nom Exercice" required />
          <input name="series" value={form.series} onChange={handleChange} placeholder="Séries" />
          <input name="repetitions" value={form.repetitions} onChange={handleChange} placeholder="Reps" />
          <input name="tempo" value={form.tempo} onChange={handleChange} placeholder="Tempo" />
          <input name="recuperation" value={form.recuperation} onChange={handleChange} placeholder="Récup" />
        </div>
        <button type="submit">+ Ajouter l'exercice</button>
      </form>
    </div>
  )
}