import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function AccueilClient() {
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [programmes, setProgrammes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClientData()
  }, [])

  async function fetchClientData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) console.log(error)
    else {
      setClient(data)
      const { data: progs } = await supabase
        .from('programmes')
        .select('*')
        .eq('client_id', data.id)
        .order('created_at', { ascending: false })
      setProgrammes(progs || [])
    }
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) return <p>Chargement...</p>
  if (!client) return <p>Aucun profil trouvé.</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Bonjour {client.prenom} 👋</h1>
        <button onClick={handleLogout}>Déconnexion</button>
      </div>

      <h2>Mes programmes</h2>
      {programmes.length === 0 ? (
        <p>Aucun programme pour l'instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {programmes.map(programme => (
            <div
              key={programme.id}
              onClick={() => navigate(`/client/programme/${programme.id}`)}
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
    </div>
  )
}