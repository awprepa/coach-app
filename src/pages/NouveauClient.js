import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function NouveauClient() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    prenom: '', nom: '', email: '', telephone: '',
    objectif: '', offre: 'suivi_premium',
    date_debut: '', date_fin: '', notes: '', categorie_id: ''
  })
  const [categories, setCategories] = useState([])
  const [succes, setSucces] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)
  const [inviteSending, setInviteSending] = useState(false)

  useEffect(() => {
    supabase.from('categories').select('*').order('created_at').then(({ data }) => setCategories(data || []))
  }, [])

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = { ...form, categorie_id: form.categorie_id || null }
    const { error } = await supabase.from('clients').insert([payload])
    if (error) alert(error.message)
    else setSucces(true)
  }

  async function sendInvite() {
    if (!form.email) return
    setInviteSending(true)
    await supabase.auth.signInWithOtp({
      email: form.email,
      options: { shouldCreateUser: true, emailRedirectTo: 'https://awprepa.app' },
    })
    setInviteSending(false)
    setInviteSent(true)
  }

  if (succes) return (
    <div style={styles.page}>
      <div style={styles.successCard}>
        <div style={styles.successIcon}>✓</div>
        <h2 style={styles.successTitle}>Client ajouté !</h2>
        <p style={styles.successSub}>Le profil a bien été créé.</p>
        {form.email && (
          inviteSent ? (
            <p style={{ color: '#16a34a', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: '600' }}>
              ✓ Invitation envoyée à {form.email}
            </p>
          ) : (
            <button onClick={sendInvite} disabled={inviteSending}
              style={{ ...styles.btnSecondary, width: '100%', marginBottom: '0.75rem', opacity: inviteSending ? 0.6 : 1 }}>
              {inviteSending ? 'Envoi...' : `Envoyer une invitation à ${form.email}`}
            </button>
          )
        )}
        <button onClick={() => navigate('/')} style={styles.btnPrimary}>Retour aux clients</button>
      </div>
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Nouveau client</h1>
        <p style={styles.subtitle}>Renseignez les informations du client</p>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.section}>
          <p style={styles.sectionTitle}>Informations personnelles</p>
          <div style={styles.row2}>
            <Field label="Prénom *" name="prenom" value={form.prenom} onChange={handleChange} required />
            <Field label="Nom *" name="nom" value={form.nom} onChange={handleChange} required />
          </div>
          <div style={styles.row2}>
            <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} />
            <Field label="Téléphone" name="telephone" value={form.telephone} onChange={handleChange} />
          </div>
        </div>

        <div style={styles.section}>
          <p style={styles.sectionTitle}>Suivi</p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Offre</label>
            <select name="offre" value={form.offre} onChange={handleChange} style={styles.select}>
              <option value="suivi_premium">Suivi Premium</option>
              <option value="plan_seul">Plan Seul</option>
            </select>
          </div>
          {categories.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={styles.label}>Catégorie</label>
              <select name="categorie_id" value={form.categorie_id} onChange={handleChange} style={styles.select}>
                <option value="">— Aucune —</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.nom}</option>)}
              </select>
            </div>
          )}
          <div style={styles.row2}>
            <Field label="Date de début" name="date_debut" type="date" value={form.date_debut} onChange={handleChange} />
            <Field label="Date de fin" name="date_fin" type="date" value={form.date_fin} onChange={handleChange} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Objectif</label>
            <textarea name="objectif" value={form.objectif} onChange={handleChange} rows={3} style={styles.textarea} placeholder="Ex: Prise de masse, performance rugby..." />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} style={styles.textarea} placeholder="Informations complémentaires..." />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={() => navigate('/')} style={styles.btnSecondary}>Annuler</button>
          <button type="submit" style={styles.btnPrimary}>Ajouter le client</button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, name, type = 'text', value, onChange, required, placeholder }) {
  return (
    <div style={{ marginBottom: '1rem', flex: 1 }}>
      <label style={styles.label}>{label}</label>
      <input
        type={type} name={name} value={value} onChange={onChange}
        required={required} placeholder={placeholder}
        style={styles.input}
      />
    </div>
  )
}

const styles = {
  page: {
    padding: '2rem',
    maxWidth: '700px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle: { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  form: {},
  section: {
    background: 'white',
    borderRadius: '16px',
    padding: '1.5rem',
    marginBottom: '1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: '0.75rem', fontWeight: '700', color: '#374151',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    margin: '0 0 1rem',
  },
  row2: { display: 'flex', gap: '1rem' },
  label: {
    display: 'block', fontSize: '0.75rem', fontWeight: '700',
    color: '#374151', textTransform: 'uppercase',
    letterSpacing: '0.05em', marginBottom: '0.4rem',
  },
  input: {
    width: '100%', padding: '0.7rem 0.875rem',
    border: '1.5px solid #e5e7eb', borderRadius: '10px',
    fontSize: '0.9rem', color: '#333333', outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%', padding: '0.7rem 0.875rem',
    border: '1.5px solid #e5e7eb', borderRadius: '10px',
    fontSize: '0.9rem', color: '#333333', outline: 'none',
    background: 'white', boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', padding: '0.7rem 0.875rem',
    border: '1.5px solid #e5e7eb', borderRadius: '10px',
    fontSize: '0.9rem', color: '#333333', outline: 'none',
    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  btnPrimary: {
    background: '#333333', color: '#e4f816', border: 'none',
    borderRadius: '12px', padding: '0.75rem 1.5rem',
    fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer', flex: 1,
  },
  btnSecondary: {
    background: 'white', color: '#374151',
    border: '1.5px solid #e5e7eb', borderRadius: '12px',
    padding: '0.75rem 1.5rem', fontSize: '0.9rem',
    fontWeight: '600', cursor: 'pointer',
  },
  successCard: {
    background: 'white', borderRadius: '20px', padding: '3rem 2rem',
    textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    maxWidth: '400px', margin: '4rem auto',
  },
  successIcon: {
    width: '56px', height: '56px', borderRadius: '50%',
    background: '#e4f816', color: '#333333',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.5rem', fontWeight: '900', margin: '0 auto 1rem',
  },
  successTitle: { fontSize: '1.25rem', fontWeight: '800', color: '#333333', margin: '0 0 0.5rem' },
  successSub: { color: '#9ca3af', marginBottom: '1.5rem' },
}
