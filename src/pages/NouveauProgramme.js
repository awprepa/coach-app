import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function NouveauProgramme() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    nom: '',
    semaines: 4
  })

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('programmes')
      .insert([{ ...form, client_id: id }])
      .select()
      .single()

    if (error) alert(error.message)
    else navigate(`/programme/${data.id}`)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '500px' }}>
      <button onClick={() => navigate(`/client/${id}`)} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>
      <h1>Nouveau programme</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label>Nom du programme *</label><br />
          <input
            name="nom"
            value={form.nom}
            onChange={handleChange}
            required
            placeholder="ex: Bloc 1 - Force"
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Nombre de semaines</label><br />
          <select name="semaines" value={form.semaines} onChange={handleChange}>
            <option value={2}>2 semaines</option>
            <option value={3}>3 semaines</option>
            <option value={4}>4 semaines</option>
            <option value={5}>5 semaines</option>
            <option value={6}>6 semaines</option>
            <option value={7}>7 semaines</option>
            <option value={8}>8 semaines</option>
          </select>
        </div>
        <button type="submit">Créer le programme</button>
      </form>
    </div>
  )
}