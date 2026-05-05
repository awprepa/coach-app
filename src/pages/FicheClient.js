import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function FicheClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [programmes, setProgrammes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => {
    fetchClient()
    fetchProgrammes()
  }, [])

  async function fetchClient() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()
    if (error) console.log(error)
    else {
      setClient(data)
      setForm(data)
    }
    setLoading(false)
  }

  async function fetchProgrammes() {
    const { data, error } = await supabase
      .from('programmes')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    if (error) console.log(error)
    else setProgrammes(data)
  }

  async function sauvegarderClient() {
    const { error } = await supabase
      .from('clients')
      .update({
        prenom: form.prenom,
        nom: form.nom,
        email: form.email,
        telephone: form.telephone,
        objectif: form.objectif,
        offre: form.offre,
        date_debut: form.date_debut,
        date_fin: form.date_fin,
        notes: form.notes
      })
      .eq('id', id)
    if (error) alert(error.message)
    else {
      setClient(form)
      setEditMode(false)
    }
  }

  async function supprimerClient() {
    if (!window.confirm('Supprimer ce client et toutes ses données ?')) return
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) alert(error.message)
    else navigate('/')
  }

  if (loading) return <p>Chargement...</p>
  if (!client) return <p>Client introuvable.</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <button onClick={() => navigate('/')} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>

      {editMode ? (
        <div style={{ marginBottom: '2rem' }}>
          <h1>Modifier le client</h1>
          {[
            { label: 'Prénom', name: 'prenom' },
            { label: 'Nom', name: 'nom' },
            { label: 'Email', name: 'email' },
            { label: 'Téléphone', name: 'telephone' },
          ].map(field => (
            <div key={field.name} style={{ marginBottom: '0.75rem' }}>
              <label>{field.label}</label><br />
              <input
                value={form[field.name] || ''}
                onChange={e => setForm({ ...form, [field.name]: e.target.value })}
              />
            </div>
          ))}
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Offre</label><br />
            <select value={form.offre} onChange={e => setForm({ ...form, offre: e.target.value })}>
              <option value="suivi_premium">Suivi Premium</option>
              <option value="plan_seul">Plan Seul</option>
            </select>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Objectif</label><br />
            <textarea value={form.objectif || ''} onChange={e => setForm({ ...form, objectif: e.target.value })} rows={3} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Date début</label><br />
            <input type="date" value={form.date_debut || ''} onChange={e => setForm({ ...form, date_debut: e.target.value })} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Date fin</label><br />
            <input type="date" value={form.date_fin || ''} onChange={e => setForm({ ...form, date_fin: e.target.value })} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Notes</label><br />
            <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={sauvegarderClient}>✅ Sauvegarder</button>
            <button onClick={() => setEditMode(false)}>✖️ Annuler</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '2rem' }}>
          <h1>{client.prenom} {client.nom}</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {client.email && <p><strong>Email :</strong> {client.email}</p>}
            {client.telephone && <p><strong>Téléphone :</strong> {client.telephone}</p>}
            {client.offre && <p><strong>Offre :</strong> {client.offre === 'suivi_premium' ? 'Suivi Premium' : 'Plan Seul'}</p>}
            {client.date_debut && <p><strong>Début :</strong> {client.date_debut}</p>}
            {client.date_fin && <p><strong>Fin :</strong> {client.date_fin}</p>}
            {client.objectif && <p><strong>Objectif :</strong> {client.objectif}</p>}
            {client.notes && <p><strong>Notes :</strong> {client.notes}</p>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setEditMode(true)}>✏️ Modifier</button>
            <button onClick={supprimerClient} style={{ color: 'red' }}>🗑️ Supprimer</button>
          </div>
        </div>
      )}

      <h2>Programmes</h2>
      {programmes.length === 0 ? (
        <p>Aucun programme pour l'instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {programmes.map(programme => (
            <div
              key={programme.id}
              onClick={() => navigate(`/programme/${programme.id}`)}
              style={{
                padding: '1rem',
                border: '1px solid #ccc',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              <strong>{programme.nom}</strong>
              <span style={{ marginLeft: '1rem', color: '#666' }}>
                {programme.semaines} semaines
              </span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => navigate(`/client/${id}/nouveau-programme`)}>
        + Nouveau programme
      </button>
    </div>
  )
}