import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email ou mot de passe incorrect.')
    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.brand}>
        <span style={styles.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <p style={styles.tagline}>Plateforme de coaching sportif</p>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Connexion</h2>

        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="votre@email.com"
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={styles.input}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" disabled={loading} style={styles.btn}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f5',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  brand: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  logo: {
    fontSize: '2.25rem',
    fontWeight: '900',
    color: '#111827',
    letterSpacing: '-1px',
  },
  tagline: {
    color: '#9ca3af',
    fontSize: '0.875rem',
    marginTop: '0.4rem',
  },
  card: {
    background: 'white',
    borderRadius: '20px',
    padding: '2rem',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  cardTitle: {
    fontSize: '1.25rem',
    fontWeight: '800',
    color: '#111827',
    margin: '0 0 1.5rem',
  },
  field: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.4rem',
  },
  input: {
    width: '100%',
    padding: '0.7rem 0.875rem',
    border: '1.5px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '0.9rem',
    color: '#111827',
    outline: 'none',
    boxSizing: 'border-box',
  },
  error: {
    color: '#dc2626',
    fontSize: '0.85rem',
    marginBottom: '1rem',
    background: '#fef2f2',
    padding: '0.6rem 0.875rem',
    borderRadius: '8px',
  },
  btn: {
    width: '100%',
    padding: '0.875rem',
    background: '#111827',
    color: '#e4f816',
    border: 'none',
    borderRadius: '12px',
    fontSize: '0.95rem',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
}
