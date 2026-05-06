import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

export default function SeanceClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [charges, setCharges] = useState({})
  const [rpeSeances, setRpeSeances] = useState({})
  const [semaines, setSemaines] = useState(4)
  const [semaineActive, setSemaineActive] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSeance()
  }, [])

  async function fetchSeance() {
    const { data, error } = await supabase
      .from('seances')
      .select('*, programmes(id, nom, semaines)')
      .eq('id', id)
      .single()
    if (error) console.log(error)
    else {
      setSeance(data)
      setSemaines(data.programmes.semaines)
      await fetchExercices()
      await fetchRpeSeances()
    }
    setLoading(false)
  }

  async function fetchExercices() {
    const { data, error } = await supabase
      .from('exercices')
      .select('*, charges(*)')
      .eq('seance_id', id)
      .order('ordre', { ascending: true })
    if (error) console.log(error)
    else {
      setExercices(data)
      const chargesMap = {}
      data.forEach(ex => {
        chargesMap[ex.id] = {}
        ex.charges.forEach(c => {
          chargesMap[ex.id][c.semaine] = { id: c.id, charge: c.charge, rpe_reel: c.rpe_reel }
        })
      })
      setCharges(chargesMap)
    }
  }

  async function fetchRpeSeances() {
    const { data, error } = await supabase
      .from('rpe_seances')
      .select('*')
      .eq('seance_id', id)
    if (error) console.log(error)
    else {
      const rpeMap = {}
      data.forEach(r => {
        rpeMap[r.semaine] = { id: r.id, rpe_cible: r.rpe_cible, rpe_reel: r.rpe_reel }
      })
      setRpeSeances(rpeMap)
    }
  }

  async function updateCharge(exId, semaine, field, valeur) {
    const existing = charges[exId]?.[semaine]
    if (existing) {
      const { error } = await supabase
        .from('charges')
        .update({ [field]: valeur })
        .eq('id', existing.id)
      if (error) alert(error.message)
      else setCharges({
        ...charges,
        [exId]: { ...charges[exId], [semaine]: { ...existing, [field]: valeur } }
      })
    } else {
      const { data, error } = await supabase
        .from('charges')
        .insert([{ exercice_id: exId, semaine, [field]: valeur }])
        .select()
        .single()
      if (error) alert(error.message)
      else setCharges({
        ...charges,
        [exId]: { ...charges[exId], [semaine]: { id: data.id, charge: '', rpe_reel: null, [field]: valeur } }
      })
    }
  }

  async function updateRpeReel(semaine, valeur) {
    const existing = rpeSeances[semaine]
    if (existing) {
      const { error } = await supabase
        .from('rpe_seances')
        .update({ rpe_reel: valeur })
        .eq('id', existing.id)
      if (error) alert(error.message)
      else setRpeSeances({
        ...rpeSeances,
        [semaine]: { ...existing, rpe_reel: valeur }
      })
    } else {
      const { data, error } = await supabase
        .from('rpe_seances')
        .insert([{ seance_id: id, semaine, rpe_reel: valeur }])
        .select()
        .single()
      if (error) alert(error.message)
      else setRpeSeances({
        ...rpeSeances,
        [semaine]: { id: data.id, rpe_cible: null, rpe_reel: valeur }
      })
    }
  }

  if (loading) return <p>Chargement...</p>
  if (!seance) return <p>Séance introuvable.</p>

  const colSemaines = Array.from({ length: semaines }, (_, i) => i + 1)

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <button onClick={() => navigate(`/client/programme/${seance.programmes.id}`)} style={{ marginBottom: '1rem' }}>
        ← Retour
      </button>
      <h1>{seance.nom}</h1>
      <p style={{ color: '#666' }}>{seance.programmes.nom}</p>

      {/* Sélecteur de semaine */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {colSemaines.map(s => (
          <button
            key={s}
            onClick={() => setSemaineActive(s)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #ccc',
              background: semaineActive === s ? '#2563eb' : 'white',
              color: semaineActive === s ? 'white' : 'black',
              cursor: 'pointer'
            }}
          >
            S{s}
          </button>
        ))}
      </div>

      {/* RPE séance */}
      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Intensité de la séance — Semaine {semaineActive}</h3>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          {rpeSeances[semaineActive]?.rpe_cible && (
            <p><strong>RPE cible :</strong> {rpeSeances[semaineActive].rpe_cible}/10</p>
          )}
          <div>
            <label><strong>Ton RPE réel :</strong></label>
            <input
              type="number" min="1" max="10" step="0.5"
              defaultValue={rpeSeances[semaineActive]?.rpe_reel || ''}
              onBlur={e => updateRpeReel(semaineActive, e.target.value)}
              style={{ marginLeft: '0.5rem', width: '60px', padding: '0.25rem', textAlign: 'center' }}
              placeholder="—"
            />
            <span style={{ marginLeft: '0.25rem' }}>/10</span>
          </div>
        </div>
      </div>

      {/* Exercices */}
      <h2>Exercices — Semaine {semaineActive}</h2>
      {exercices.length === 0 ? (
        <p>Aucun exercice.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {exercices.map(ex => (
            <div key={ex.id} style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ fontWeight: 'bold', color: '#2563eb', marginRight: '0.5rem' }}>{ex.code}</span>
                  <span style={{ fontWeight: 'bold' }}>{ex.nom}</span>
                </div>
                {ex.type_intensite && (
                  <span style={{ color: '#666', fontSize: '0.875rem' }}>
                    {ex.type_intensite} : {ex.valeur_intensite}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
                {ex.series && <span>{ex.series} séries</span>}
                {ex.repetitions && <span>{ex.repetitions} reps</span>}
                {ex.tempo && <span>Tempo : {ex.tempo}</span>}
                {ex.recuperation && <span>Récup : {ex.recuperation}</span>}
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: '0.875rem' }}>Charge (kg)</label><br />
                  <input
                    type="text"
                    defaultValue={charges[ex.id]?.[semaineActive]?.charge || ''}
                    onBlur={e => updateCharge(ex.id, semaineActive, 'charge', e.target.value)}
                    style={{ width: '80px', padding: '0.5rem', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px' }}
                    placeholder="—"
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.875rem' }}>RPE réel</label><br />
                  <input
                    type="number" min="1" max="10" step="0.5"
                    defaultValue={charges[ex.id]?.[semaineActive]?.rpe_reel || ''}
                    onBlur={e => updateCharge(ex.id, semaineActive, 'rpe_reel', e.target.value)}
                    style={{ width: '80px', padding: '0.5rem', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px' }}
                    placeholder="—"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}