import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function NouveauProgramme() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ nom: '', semaines: 4, date_debut: '' })

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = { ...form, client_id: id, date_debut: form.date_debut || null }
    const { data, error } = await supabase.from('programmes').insert([payload]).select().single()
    if (error) alert(error.message)
    else navigate(`/programme/${data.id}`)
  }

  return (
    <div style={styles.page}>
      <button onClick={() => navigate(`/client/${id}`)} style={styles.backBtn}>← Retour</button>

      <div style={styles.header}>
        <h1 style={styles.title}>Nouveau cycle</h1>
        <p style={styles.subtitle}>Définissez les paramètres du cycle</p>
      </div>

      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.field}>
          <label style={styles.label}>Nom du cycle *</label>
          <input
            name="nom" value={form.nom} onChange={handleChange}
            required placeholder="ex: Cycle 1 — Force"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Date de début</label>
          <input
            name="date_debut" type="date" value={form.date_debut} onChange={handleChange}
            style={styles.input}
          />
          <p style={styles.weeksHint}>Utilisée pour afficher le cycle sur le calendrier</p>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Nombre de semaines</label>
          <div style={styles.weeksGrid}>
            {[2,3,4,5,6,7,8,10,12].map(n => (
              <button
                key={n} type="button"
                onClick={() => setForm({ ...form, semaines: n })}
                style={{
                  ...styles.weekBtn,
                  background: form.semaines == n ? '#111827' : 'white',
                  color: form.semaines == n ? '#e4f816' : '#374151',
                  border: `1.5px solid ${form.semaines == n ? '#111827' : '#e5e7eb'}`,
                  fontWeight: form.semaines == n ? '700' : '500',
                }}
              >{n}</button>
            ))}
          </div>
          <p style={styles.weeksHint}>{form.semaines} semaine{form.semaines > 1 ? 's' : ''} sélectionnée{form.semaines > 1 ? 's' : ''}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={() => navigate(`/client/${id}`)} style={styles.btnSecondary}>Annuler</button>
          <button type="submit" style={styles.btnPrimary}>Créer le cycle</button>
        </div>
      </form>
    </div>
  )
}

const styles = {
  page: { padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.5rem', fontWeight: '800', color: '#111827', margin: 0 },
  subtitle: { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  card: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  field: { marginBottom: '1.25rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' },
  input: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#111827', outline: 'none', boxSizing: 'border-box' },
  weeksGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  weekBtn: { width: '48px', height: '48px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer' },
  weeksHint: { color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.6rem' },
  btnPrimary: { flex: 1, background: '#111827', color: '#e4f816', border: 'none', borderRadius: '12px', padding: '0.75rem 1.5rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '0.75rem 1.5rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
}
