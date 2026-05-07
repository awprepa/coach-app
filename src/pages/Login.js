import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [mode, setMode]         = useState('connexion') // 'connexion' | 'inscription'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [prenom, setPrenom]     = useState('')
  const [nom, setNom]           = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleConnexion(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email ou mot de passe incorrect.')
    setLoading(false)
  }

  async function handleInscription(e) {
    e.preventDefault()
    if (!prenom.trim() || !nom.trim()) { setError('Prénom et nom obligatoires.'); return }
    setLoading(true); setError(''); setSuccess('')

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    // Créer le profil client
    const { error: dbError } = await supabase.from('clients').insert({
      prenom: prenom.trim(),
      nom: nom.trim().toUpperCase(),
      email: email.trim().toLowerCase(),
      coach_notifie: false,
    })
    if (dbError) console.error('Profil client:', dbError)

    setSuccess('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.')
    setLoading(false)
    setMode('connexion')
    setPrenom(''); setNom(''); setEmail(''); setPassword('')
  }

  return (
    <div style={styles.page}>
      <div style={styles.brand}>
        <span style={styles.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <p style={styles.tagline}>Plateforme de coaching sportif</p>
      </div>

      <div style={styles.card}>
        {/* Toggle */}
        <div style={styles.toggle}>
          <button onClick={() => { setMode('connexion'); setError(''); setSuccess('') }}
            style={{ ...styles.toggleBtn, ...(mode === 'connexion' ? styles.toggleActive : {}) }}>
            Connexion
          </button>
          <button onClick={() => { setMode('inscription'); setError(''); setSuccess('') }}
            style={{ ...styles.toggleBtn, ...(mode === 'inscription' ? styles.toggleActive : {}) }}>
            Créer un compte
          </button>
        </div>

        {success && <p style={styles.successMsg}>{success}</p>}

        {mode === 'connexion' ? (
          <form onSubmit={handleConnexion}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="votre@email.com" style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••" style={styles.input} />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleInscription}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ ...styles.field, flex: 1 }}>
                <label style={styles.label}>Prénom *</label>
                <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)}
                  required placeholder="Lucas" style={styles.input} />
              </div>
              <div style={{ ...styles.field, flex: 1 }}>
                <label style={styles.label}>Nom *</label>
                <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                  required placeholder="MAUGARD" style={styles.input} />
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="votre@email.com" style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Mot de passe *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="8 caractères minimum" minLength={8} style={styles.input} />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
            <p style={styles.hint}>En créant un compte, tu seras visible par ton coach qui pourra te contacter et t'assigner des séances.</p>
          </form>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh', background: '#f5f5f5', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '2rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  brand:       { textAlign: 'center', marginBottom: '2rem' },
  logo:        { fontSize: '2.25rem', fontWeight: '900', color: '#111827', letterSpacing: '-1px' },
  tagline:     { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.4rem' },
  card:        { background: 'white', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  toggle:      { display: 'flex', background: '#f3f4f6', borderRadius: '12px', padding: '4px', marginBottom: '1.75rem' },
  toggleBtn:   { flex: 1, background: 'transparent', border: 'none', borderRadius: '9px', padding: '0.55rem', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280', cursor: 'pointer' },
  toggleActive:{ background: '#111827', color: '#e4f816' },
  field:       { marginBottom: '1rem' },
  label:       { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input:       { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#111827', outline: 'none', boxSizing: 'border-box' },
  error:       { color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem', background: '#fef2f2', padding: '0.6rem 0.875rem', borderRadius: '8px' },
  successMsg:  { color: '#065f46', fontSize: '0.85rem', marginBottom: '1rem', background: '#d1fae5', padding: '0.6rem 0.875rem', borderRadius: '8px' },
  btn:         { width: '100%', padding: '0.875rem', background: '#111827', color: '#e4f816', border: 'none', borderRadius: '12px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', marginTop: '0.5rem' },
  hint:        { color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 },
}
