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
  const [enEdition, setEnEdition] = useState(null)
  const [nomEdition, setNomEdition] = useState('')
  const [editProgramme, setEditProgramme] = useState(false)
  const [formProgramme, setFormProgramme] = useState({ nom: '', semaines: 4 })

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
    else {
      setProgramme(data)
      setFormProgramme({ nom: data.nom, semaines: data.semaines })
    }
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
      .insert([{ programme_id: id, nom: nouvelleSeance, ordre: seances.length + 1 }])
      .select()
      .single()
    if (error) alert(error.message)
    else {
      setSeances([...seances, data])
      setNouvelleSeance('')
    }
  }

  async function sauvegarderSeance(seanceId) {
    const { error } = await supabase
      .from('seances')
      .update({ nom: nomEdition })
      .eq('id', seanceId)
    if (error) alert(error.message)
    else {
      setSeances(seances.map(s => s.id === seanceId ? { ...s, nom: nomEdition } : s))
      setEnEdition(null)
    }
  }

  async function supprimerSeance(seanceId) {
    if (!window.confirm('Supprimer cette séance et tous ses exercices ?')) return
    const { error } = await supabase.from('seances').delete().eq('id', seanceId)
    if (error) alert(error.message)
    else setSeances(seances.filter(s => s.id !== seanceId))
  }

  async function sauvegarderProgramme() {
    const { error } = await supabase
      .from('programmes')
      .update({ nom: formProgramme.nom, semaines: formProgramme.semaines })
      .eq('id', id)
    if (error) alert(error.message)
    else {
      setProgramme({ ...programme, ...formProgramme })
      setEditProgramme(false)
    }
  }

  async function supprimerProgramme() {
    if (!window.confirm('Supprimer ce programme et toutes ses séances ?')) return
    const { error } = await supabase.from('programmes').delete().eq('id', id)
    if (error) alert(error.message)
    else navigate(`/client/${programme.client_id}`)
  }

  if (loading) return <p>Chargement...</p>
  if (!programme) return <p>Programme introuvable.</p>

  return (
    <div style={{ padding: '2rem', maxWidth: '700px' }}>
      <button onClick={() => navigate(`/client/${programme.client_id}`)} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>

      {editProgramme ? (
        <div style={{ marginBottom: '2rem' }}>
          <input
            value={formProgramme.nom}
            onChange={e => setFormProgramme({ ...formProgramme, nom: e.target.value })}
            style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'block' }}
          />
          <select
            value={formProgramme.semaines}
            onChange={e => setFormProgramme({ ...formProgramme, semaines: e.target.value })}
            style={{ marginBottom: '0.5rem' }}
          >
            {[2,3,4,5,6,7,8,10,12].map(n => (
              <option key={n} value={n}>{n} semaines</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={sauvegarderProgramme}>✅ Sauvegarder</button>
            <button onClick={() => setEditProgramme(false)}>✖️ Annuler</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ marginBottom: '0.25rem' }}>{programme.nom}</h1>
          <p style={{ color: '#666', marginBottom: '0.5rem' }}>
            {programme.clients.prenom} {programme.clients.nom} — {programme.semaines} semaines
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setEditProgramme(true)}>✏️ Modifier</button>
            <button onClick={supprimerProgramme} style={{ color: 'red' }}>🗑️ Supprimer</button>
          </div>
        </div>
      )}

      <h2>Séances</h2>
      {seances.length === 0 ? (
        <p>Aucune séance pour l'instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {seances.map(seance => (
            <div key={seance.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {enEdition === seance.id ? (
                <>
                  <input
                    value={nomEdition}
                    onChange={e => setNomEdition(e.target.value)}
                    style={{ flex: 1, padding: '0.5rem' }}
                  />
                  <button onClick={() => sauvegarderSeance(seance.id)}>✅</button>
                  <button onClick={() => setEnEdition(null)}>✖️</button>
                </>
              ) : (
                <>
                  <div
                    onClick={() => navigate(`/seance/${seance.id}`)}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <strong>{seance.nom}</strong>
                  </div>
                  <button onClick={() => { setEnEdition(seance.id); setNomEdition(seance.nom) }}>✏️</button>
                  <button onClick={() => supprimerSeance(seance.id)}>🗑️</button>
                </>
              )}
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