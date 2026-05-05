import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) console.log(error)
    else setClients(data)
    setLoading(false)
  }

  if (loading) return <p>Chargement...</p>

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Mes clients</h1>
      {clients.length === 0 ? (
        <p>Aucun client pour l'instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {clients.map(client => (
            <div
              key={client.id}
              onClick={() => navigate(`/client/${client.id}`)}
              style={{
                padding: '1rem',
                border: '1px solid #ccc',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              <strong>{client.prenom} {client.nom}</strong>
              <span style={{ marginLeft: '1rem', color: '#666' }}>
                {client.offre === 'suivi_premium' ? 'Suivi Premium' : 'Plan Seul'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}