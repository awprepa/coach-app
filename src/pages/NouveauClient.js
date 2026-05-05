import { useState } from 'react'
import { supabase } from '../supabase'

export default function NouveauClient() {
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    objectif: '',
    offre: 'suivi_premium',
    date_debut: '',
    date_fin: '',
    notes: ''
  })
  const [succes, setSucces] = useState(false)

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { error } = await supabase.from('clients').insert([form])
    if (error) alert(error.message)
    else setSucces(true)
  }

  if (succes) return <p style={{ padding: '2rem' }}>✅ Client ajouté avec succès !</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '500px' }}>
      <h1>Nouveau client</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label>Prénom *</label><br />
          <input name="prenom" value={form.prenom} onChange={handleChange} required />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Nom *</label><br />
          <input name="nom" value={form.nom} onChange={handleChange} required />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Email</label><br />
          <input name="email" value={form.email} onChange={handleChange} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Téléphone</label><br />
          <input name="telephone" value={form.telephone} onChange={handleChange} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Objectif</label><br />
          <textarea name="objectif" value={form.objectif} onChange={handleChange} rows={3} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Offre</label><br />
          <select name="offre" value={form.offre} onChange={handleChange}>
            <option value="suivi_premium">Suivi Premium</option>
            <option value="plan_seul">Plan Seul</option>
          </select>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Date de début</label><br />
          <input type="date" name="date_debut" value={form.date_debut} onChange={handleChange} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Date de fin</label><br />
          <input type="date" name="date_fin" value={form.date_fin} onChange={handleChange} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Notes</label><br />
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} />
        </div>
        <button type="submit">Ajouter le client</button>
      </form>
    </div>
  )
}