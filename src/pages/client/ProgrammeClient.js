import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

export default function ProgrammeClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [programme, setProgramme] = useState(null)
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProgramme()
    fetchSeances()
  }, [])

  async function fetchProgramme() {
    const { data, error } = await supabase
      .from('programmes')
      .select('*')
      .eq('id', id)
      .single()
    if (error) console.log(error)
    else setProgramme(data)
    setLoading(false)
  }

  async function fetchSeances() {
    const { data, error } = await supabase
      .from('seances')
      .select('*')
      .eq('programme_id', id)
      .order('ordre', { ascending: true })
    if (error) console.log(error)
    else setSeances(data)
  }

  if (loading) return <p>Chargement...</p>
  if (!programme) return <p>Programme introuvable.</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <button onClick={() => navigate('/client/accueil')} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>
      <h1>{programme.nom}</h1>
      <p style={{ color: '#666' }}>{programme.semaines} semaines</p>

      <h2>Séances</h2>
      {seances.length === 0 ? (
        <p>Aucune séance pour l'instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {seances.map(seance => (
            <div
              key={seance.id}
              onClick={() => navigate(`/client/seance/${seance.id}`)}
              style={{
                padding: '1rem',
                border: '1px solid #ccc',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              <strong>{seance.nom}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}