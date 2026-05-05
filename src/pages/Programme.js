import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Programme() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [programme, setProgramme] = useState(null)
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)
  const [nouvelleSeance, setNouvelleSeance] = useState('')

  useEffect(() => {
    fetchProgramme()
    fetchSeances()
  }, [])

  async function fetchProgramme() {
    const { data, error } = await supabase
      .from('programmes')
      .select('*, clients(prenom, nom)')
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

  async function ajouterSeance(e) {
    e.preventDefault()
    if (!nouvelleSeance.trim()) return

    const { data, error } = await supabase
      .from('seances')
      .insert([{
        programme_id: id,
        nom: nouvelleSeance,
        ordre: seances.length + 1
      }])
      .select()
      .single()

    if (error) alert(error.message)
    else {
      setSeances([...seances, data])
      setNouvelleSeance('')
    }
  }

  if (loading) return <p>Chargement...</p>
  if (!programme) return <p>Programme introuvable.</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '700px' }}>
      <button onClick={() => navigate(`/client/${programme.client_id}`)} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>
      <h1>{programme.nom}</h1>
      <p style={{ color: '#666' }}>
        {programme.clients.prenom} {programme.clients.nom} — {programme.semaines} semaines
      </p>

      <h2>Séances</h2>

      {seances.length === 0 ? (
        <p>Aucune séance pour l'instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {seances.map(seance => (
            <div
              key={seance.id}
              onClick={() => navigate(`/seance/${seance.id}`)}
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

      <form onSubmit={ajouterSeance} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          value={nouvelleSeance}
          onChange={e => setNouvelleSeance(e.target.value)}
          placeholder="ex: Séance A - Lower body"
        />
        <button type="submit">+ Ajouter une séance</button>
      </form>
    </div>
  )
}