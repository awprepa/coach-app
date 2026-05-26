import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode]         = useState('connexion') // 'connexion' | 'inscription' | 'reset' | 'update-password'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [prenom, setPrenom]     = useState('')
  const [nom, setNom]           = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)

  function switchMode(m) { setMode(m); setError(''); setSuccess('') }

  // Détecter l'événement PASSWORD_RECOVERY (l'utilisateur arrive depuis le lien email)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update-password')
        setError('')
        setSuccess('')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleConnexion(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed'))
        setError('Confirme ton adresse email avant de te connecter (vérifie tes spams).')
      else
        setError('Email ou mot de passe incorrect.')
    }
    setLoading(false)
  }

  async function handleInscription(e) {
    e.preventDefault()
    if (!prenom.trim() || !nom.trim()) { setError('Prénom et nom obligatoires.'); return }
    setLoading(true); setError(''); setSuccess('')

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/login',
        data: {
          prenom: prenom.trim(),
          nom: nom.trim().toUpperCase(),
        },
      },
    })
    if (authError) { setError(authError.message); setLoading(false); return }

    // L'insert clients est géré par le trigger Supabase handle_new_user
    // (évite les problèmes RLS quand l'email n'est pas encore confirmé)

    setSuccess('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.')
    setLoading(false)
    switchMode('connexion')
    setPrenom(''); setNom(''); setEmail(''); setPassword('')
  }

  async function handleUpdatePassword(e) {
    e.preventDefault()
    if (newPassword.length < 8) { setError('Le mot de passe doit faire au moins 8 caractères.'); return }
    if (newPassword !== confirmPassword) { setError('Les mots de passe ne correspondent pas.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setError(error.message)
    } else {
      setSuccess('Mot de passe mis à jour ! Tu peux maintenant te connecter.')
      await supabase.auth.signOut()
      setNewPassword(''); setConfirmPassword('')
      setTimeout(() => switchMode('connexion'), 2000)
    }
    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!email) { setError('Entre ton adresse email.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })
    if (error) setError(error.message)
    else setSuccess('Email envoyé ! Vérifie ta boîte mail (et tes spams / courriers indésirables) pour réinitialiser ton mot de passe.')
    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.brand}>
        <img src="/logo-noir.png" alt="AWprepa" style={{ height: 120, width: 'auto', display: 'block', margin: '0 auto' }} />
        <p style={styles.tagline}>Plateforme de coaching sportif</p>
      </div>

      <div style={styles.card}>
        {mode !== 'reset' && mode !== 'update-password' && (
          <div style={styles.toggle}>
            <button onClick={() => switchMode('connexion')}
              style={{ ...styles.toggleBtn, ...(mode === 'connexion' ? styles.toggleActive : {}) }}>
              Connexion
            </button>
            <button onClick={() => switchMode('inscription')}
              style={{ ...styles.toggleBtn, ...(mode === 'inscription' ? styles.toggleActive : {}) }}>
              Créer un compte
            </button>
          </div>
        )}

        {success && <p style={styles.successMsg}>{success}</p>}

        {mode === 'connexion' && (
          <form onSubmit={handleConnexion}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="votre@email.com" style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Mot de passe</label>
              <div style={styles.pwdWrap}>
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="••••••••" style={{ ...styles.input, paddingRight: '2.8rem' }} />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={styles.eyeBtn} aria-label={showPwd ? 'Masquer' : 'Voir'}>
                  {showPwd ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
            <button type="button" onClick={() => switchMode('reset')} style={styles.forgotBtn}>
              Mot de passe oublié ?
            </button>
          </form>
        )}

        {mode === 'inscription' && (
          <form onSubmit={handleInscription}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ ...styles.field, flex: 1 }}>
                <label style={styles.label}>Prénom *</label>
                <input type="text" value={prenom} onChange={e => setPrenom(e.target.value)}
                  required style={styles.input} />
              </div>
              <div style={{ ...styles.field, flex: 1 }}>
                <label style={styles.label}>Nom *</label>
                <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                  required style={styles.input} />
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="votre@email.com" style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Mot de passe *</label>
              <div style={styles.pwdWrap}>
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="8 caractères minimum" minLength={8} style={{ ...styles.input, paddingRight: '2.8rem' }} />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={styles.eyeBtn} aria-label={showPwd ? 'Masquer' : 'Voir'}>
                  {showPwd ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
            <p style={styles.hint}>En créant un compte, tu seras visible par ton coach qui pourra te contacter et t'assigner des séances.</p>
          </form>
        )}

        {mode === 'update-password' && (
          <form onSubmit={handleUpdatePassword}>
            <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Choisis ton nouveau mot de passe.
            </p>
            <div style={styles.field}>
              <label style={styles.label}>Nouveau mot de passe</label>
              <div style={styles.pwdWrap}>
                <input type={showPwd ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  required placeholder="8 caractères minimum" minLength={8} style={{ ...styles.input, paddingRight: '2.8rem' }} autoFocus />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={styles.eyeBtn} aria-label={showPwd ? 'Masquer' : 'Voir'}>
                  {showPwd ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Confirmer le mot de passe</label>
              <div style={styles.pwdWrap}>
                <input type={showPwd ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  required placeholder="••••••••" style={{ ...styles.input, paddingRight: '2.8rem' }} />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={styles.eyeBtn} aria-label={showPwd ? 'Masquer' : 'Voir'}>
                  {showPwd ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset}>
            <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Entre ton adresse email et on t'envoie un lien pour réinitialiser ton mot de passe.
            </p>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="votre@email.com" style={styles.input} />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={loading} style={styles.btn}>
              {loading ? 'Envoi...' : 'Envoyer le lien'}
            </button>
            <button type="button" onClick={() => switchMode('connexion')} style={styles.forgotBtn}>
              ← Retour à la connexion
            </button>
          </form>
        )}
      </div>

      {/* Lien CGV */}
      <p style={styles.cgvHint}>
        En vous connectant, vous acceptez nos{' '}
        <button onClick={() => navigate('/cgv')} style={styles.cgvLink}>
          Conditions Générales de Vente
        </button>
      </p>
    </div>
  )
}

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

const styles = {
  page:        { minHeight: '100vh', background: '#efefef', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  brand:       { textAlign: 'center', marginBottom: '2rem' },
  logo:        { fontSize: '2.25rem', fontWeight: '900', color: '#333333', letterSpacing: '-1px' },
  tagline:     { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.4rem' },
  card:        { background: 'white', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  toggle:      { display: 'flex', background: '#f3f4f6', borderRadius: '12px', padding: '4px', marginBottom: '1.75rem' },
  toggleBtn:   { flex: 1, background: 'transparent', border: 'none', borderRadius: '9px', padding: '0.55rem', fontSize: '0.875rem', fontWeight: '600', color: '#6b7280', cursor: 'pointer' },
  toggleActive:{ background: '#333333', color: '#e4f816' },
  field:       { marginBottom: '1rem' },
  label:       { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input:       { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  error:       { color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem', background: '#fef2f2', padding: '0.6rem 0.875rem', borderRadius: '8px' },
  successMsg:  { color: '#065f46', fontSize: '0.85rem', marginBottom: '1rem', background: '#d1fae5', padding: '0.6rem 0.875rem', borderRadius: '8px' },
  btn:         { width: '100%', padding: '0.875rem', background: '#333333', color: '#e4f816', border: 'none', borderRadius: '12px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', marginTop: '0.5rem' },
  forgotBtn:   { width: '100%', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.8rem', cursor: 'pointer', marginTop: '0.75rem', padding: '0.25rem' },
  hint:        { color: '#9ca3af', fontSize: '0.75rem', textAlign: 'center', marginTop: '1rem', lineHeight: 1.5 },
  pwdWrap:     { position: 'relative' },
  eyeBtn:      { position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: '0.25rem' },
  cgvHint:     { marginTop: '1.5rem', fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' },
  cgvLink:     { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 },
}
