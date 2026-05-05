import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

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
        <ul>
          {clients.map(client => (
            <li key={client.id}>
              {client.prenom} {client.nom} — {client.offre}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}