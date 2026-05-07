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
  const [formProgramme, setFormProgramme] = useState({ nom: '', semaines: 4, date_debut: '' })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProgramme(); fetchSeances() }, [])

  async function fetchProgramme() {
    const { data, error } = await supabase
      .from('programmes').select('*, clients(prenom, nom)').eq('id', id).single()
    if (error) console.log(error)
    else { setProgramme(data); setFormProgramme({ nom: data.nom, semaines: data.semaines, date_debut: data.date_debut || '' }) }
    setLoading(false)
  }

  async function fetchSeances() {
    const { data, error } = await supabase
      .from('seances').select('*').eq('programme_id', id).order('ordre', { ascending: true })
    if (error) console.log(error)
    else setSeances(data)
  }

  async function ajouterSeance(e) {
    e.preventDefault()
    if (!nouvelleSeance.trim()) return
    const { data, error } = await supabase
      .from('seances').insert([{ programme_id: id, nom: nouvelleSeance, ordre: seances.length + 1 }]).select().single()
    if (error) alert(error.message)
    else { setSeances([...seances, data]); setNouvelleSeance('') }
  }

  async function sauvegarderSeance(seanceId) {
    const { error } = await supabase.from('seances').update({ nom: nomEdition }).eq('id', seanceId)
    if (error) alert(error.message)
    else { setSeances(seances.map(s => s.id === seanceId ? { ...s, nom: nomEdition } : s)); setEnEdition(null) }
  }

  async function deplacerSeance(index, direction) {
    const newSeances = [...seances]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= newSeances.length) return
    const a = newSeances[index]
    const b = newSeances[targetIndex]
    // Échanger les ordres
    const [ordreA, ordreB] = [a.ordre, b.ordre]
    await supabase.from('seances').update({ ordre: ordreB }).eq('id', a.id)
    await supabase.from('seances').update({ ordre: ordreA }).eq('id', b.id)
    newSeances[index] = { ...a, ordre: ordreB }
    newSeances[targetIndex] = { ...b, ordre: ordreA }
    newSeances.sort((x, y) => x.ordre - y.ordre)
    setSeances(newSeances)
  }

  async function supprimerSeance(seanceId) {
    if (!window.confirm('Supprimer cette séance et tous ses exercices ?')) return
    const { error } = await supabase.from('seances').delete().eq('id', seanceId)
    if (error) alert(error.message)
    else setSeances(seances.filter(s => s.id !== seanceId))
  }

  async function sauvegarderProgramme() {
    const { error } = await supabase.from('programmes').update({ nom: formProgramme.nom, semaines: formProgramme.semaines, date_debut: formProgramme.date_debut || null }).eq('id', id)
    if (error) alert(error.message)
    else { setProgramme({ ...programme, ...formProgramme }); setEditProgramme(false) }
  }

  async function supprimerProgramme() {
    if (!window.confirm('Supprimer ce cycle et toutes ses séances ?')) return
    const { error } = await supabase.from('programmes').delete().eq('id', id)
    if (error) alert(error.message)
    else navigate(`/client/${programme.client_id}`)
  }

  if (loading) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>
  if (!programme) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Programme introuvable.</p></div>

  return (
    <div style={styles.page}>
      <button onClick={() => navigate(`/client/${programme.client_id}`)} style={styles.backBtn}>← Retour</button>

      {/* En-tête programme */}
      {editProgramme ? (
        <div style={styles.card}>
          <p style={styles.sectionTitle}>Modifier le cycle</p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Nom</label>
            <input value={formProgramme.nom} onChange={e => setFormProgramme({ ...formProgramme, nom: e.target.value })} style={styles.input} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Date de début</label>
            <input type="date" value={formProgramme.date_debut} onChange={e => setFormProgramme({ ...formProgramme, date_debut: e.target.value })} style={styles.input} />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={styles.label}>Semaines</label>
            <select value={formProgramme.semaines} onChange={e => setFormProgramme({ ...formProgramme, semaines: e.target.value })} style={styles.select}>
              {[2,3,4,5,6,7,8,10,12].map(n => <option key={n} value={n}>{n} semaines</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setEditProgramme(false)} style={styles.btnSecondary}>Annuler</button>
            <button onClick={sauvegarderProgramme} style={styles.btnPrimary}>Sauvegarder</button>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <p style={styles.clientLabel}>{programme.clients.prenom} {programme.clients.nom}</p>
          <h1 style={styles.progTitle}>{programme.nom}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <span style={styles.metaBadge}>{programme.semaines} semaines</span>
            <span style={styles.metaBadge}>{seances.length} séance{seances.length > 1 ? 's' : ''}</span>
            {programme.date_debut && <span style={styles.metaBadge}>Début : {new Date(programme.date_debut + 'T00:00:00').toLocaleDateString('fr-FR')}</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setEditProgramme(true)} style={styles.btnSecondary}>Modifier</button>
            <button onClick={supprimerProgramme} style={styles.btnDanger}>Supprimer</button>
          </div>
        </div>
      )}

      {/* Séances */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={styles.sectionHeader}>
          <p style={styles.sectionTitle}>Séances</p>
        </div>

        {seances.length === 0 ? (
          <div style={styles.emptyCard}>Aucune séance. Ajoutez-en une ci-dessous.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
            {seances.map((seance, i) => (
              <div key={seance.id} style={styles.seanceRow}>
                {enEdition === seance.id ? (
                  <>
                    <input
                      value={nomEdition}
                      onChange={e => setNomEdition(e.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                      autoFocus
                    />
                    <button onClick={() => sauvegarderSeance(seance.id)} style={styles.btnPrimary}>✓</button>
                    <button onClick={() => setEnEdition(null)} style={styles.btnSecondary}>✕</button>
                  </>
                ) : (
                  <>
                    <div style={styles.orderBtns}>
                      <button onClick={() => deplacerSeance(i, -1)} disabled={i === 0} style={{ ...styles.orderBtn, opacity: i === 0 ? 0.2 : 1 }}>↑</button>
                      <button onClick={() => deplacerSeance(i, 1)} disabled={i === seances.length - 1} style={{ ...styles.orderBtn, opacity: i === seances.length - 1 ? 0.2 : 1 }}>↓</button>
                    </div>
                    <div
                      onClick={() => navigate(`/seance/${seance.id}`)}
                      style={{ ...styles.seanceCard, borderLeft: `4px solid ${i === 0 ? '#e4f816' : '#e5e7eb'}` }}
                    >
                      <span style={styles.seanceOrdre}>Jour {i + 1}</span>
                      <span style={styles.seanceNom}>{seance.nom}</span>
                    </div>
                    <button onClick={() => { setEnEdition(seance.id); setNomEdition(seance.nom) }} style={styles.iconBtn}>✏️</button>
                    <button onClick={() => supprimerSeance(seance.id)} style={styles.iconBtn}>🗑️</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={ajouterSeance} style={styles.addForm}>
          <input
            value={nouvelleSeance}
            onChange={e => setNouvelleSeance(e.target.value)}
            placeholder="ex: Séance A — Lower body"
            style={{ ...styles.input, flex: 1 }}
          />
          <button type="submit" style={styles.btnPrimary}>+ Ajouter</button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  loading: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page: { padding: '2rem', maxWidth: '700px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' },
  card: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  clientLabel: { fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' },
  progTitle: { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  metaBadge: { background: '#f3f4f6', color: '#374151', padding: '0.25rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '600' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle: { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  emptyCard: { background: 'white', borderRadius: '14px', padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  seanceRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  seanceCard: { flex: 1, display: 'flex', alignItems: 'center', gap: '0.875rem', background: 'white', borderRadius: '12px', padding: '0.875rem 1rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  seanceOrdre: { fontSize: '0.75rem', fontWeight: '800', color: '#9ca3af', minWidth: '20px' },
  seanceNom: { fontWeight: '600', fontSize: '0.9rem', color: '#333333' },
  addForm: { display: 'flex', gap: '0.75rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input: { padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box', width: '100%' },
  select: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', background: 'white' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDanger: { background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  iconBtn: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' },
  orderBtns: { display: 'flex', flexDirection: 'column', gap: '2px' },
  orderBtn: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '0.2rem 0.45rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', color: '#374151', lineHeight: 1 },
}
