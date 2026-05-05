import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function FicheClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [programmes, setProgrammes] = useState([])
  const [loading, setLoading] = useState(true)

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
    else setClient(data)
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

  if (loading) return <p>Chargement...</p>
  if (!client) return <p>Client introuvable.</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <button onClick={() => navigate('/')} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>
      <h1>{client.prenom} {client.nom}</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
        {client.email && <p><strong>Email :</strong> {client.email}</p>}
        {client.telephone && <p><strong>Téléphone :</strong> {client.telephone}</p>}
        {client.offre && <p><strong>Offre :</strong> {client.offre === 'suivi_premium' ? 'Suivi Premium' : 'Plan Seul'}</p>}
        {client.date_debut && <p><strong>Début :</strong> {client.date_debut}</p>}
        {client.date_fin && <p><strong>Fin :</strong> {client.date_fin}</p>}
        {client.objectif && <p><strong>Objectif :</strong> {client.objectif}</p>}
        {client.notes && <p><strong>Notes :</strong> {client.notes}</p>}
      </div>

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