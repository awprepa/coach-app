import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [status, setStatus]               = useState('loading') // loading | ready | success | error
  const [newPassword, setNewPassword]     = useState('')
  const [confirm, setConfirm]             = useState('')
  const [error, setError]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [showPwd, setShowPwd]             = useState(false)

  useEffect(() => {
    // Supabase traite automatiquement le ?code= dans l'URL (PKCE)
    // On écoute l'événement PASSWORD_RECOVERY pour savoir quand c'est prêt
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus('ready')
      }
    })

    // Si une session existe déjà (code déjà échangé avant le mount)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus('ready')
    })

    // Timeout de sécurité : si rien en 6s, lien invalide ou expiré
    const t = setTimeout(() => {
      setStatus(s => s === 'loading' ? 'error' : s)
    }, 6000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(t)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) { setError('Le mot de passe doit faire au moins 8 caractères.'); return }
    if (newPassword !== confirm)  { setError('Les mots de passe ne correspondent pas.'); return }

    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    if (err) {
      setError(err.message)
    } else {
      setStatus('success')
      await supabase.auth.signOut()
      setTimeout(() => navigate('/login'), 2500)
    }
    setSaving(false)
  }

  return (
    <div style={S.page}>
      <div style={S.brand}>
        <span style={S.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <p style={S.tagline}>Plateforme de coaching sportif</p>
      </div>

      <div style={S.card}>

        {/* Chargement */}
        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔐</div>
            <p style={{ fontWeight: 700, color: '#374151' }}>Vérification du lien…</p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', marginTop: '0.4rem' }}>Un instant</p>
          </div>
        )}

        {/* Lien invalide ou expiré */}
        {status === 'error' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
            <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>
              Lien invalide ou expiré
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Ce lien de réinitialisation n'est plus valide. Demande-en un nouveau.
            </p>
            <button onClick={() => navigate('/login')} style={S.btn}>
              Retour à la connexion
            </button>
          </div>
        )}

        {/* Formulaire */}
        {status === 'ready' && (
          <form onSubmit={handleSubmit}>
            <p style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1a1a1a', margin: '0 0 0.3rem' }}>
              Nouveau mot de passe
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', lineHeight: 1.5, margin: '0 0 1.5rem' }}>
              Choisis un mot de passe sécurisé d'au moins 8 caractères.
            </p>

            <div style={S.field}>
              <label style={S.label}>Nouveau mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required minLength={8}
                  placeholder="8 caractères minimum"
                  style={S.input}
                  autoFocus
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.85rem' }}>
                  {showPwd ? 'Masquer' : 'Voir'}
                </button>
              </div>
            </div>

            <div style={S.field}>
              <label style={S.label}>Confirmer le mot de passe</label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                style={S.input}
              />
            </div>

            {/* Indicateur de force */}
            {newPassword.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: i <= passwordStrength(newPassword) ? strengthColor(newPassword) : '#f0f0f0',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
                <p style={{ fontSize: '0.68rem', color: strengthColor(newPassword), fontWeight: 600, margin: 0 }}>
                  {strengthLabel(newPassword)}
                </p>
              </div>
            )}

            {error && <p style={S.error}>{error}</p>}

            <button type="submit" disabled={saving} style={{ ...S.btn, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Mise à jour…' : '✓ Enregistrer le mot de passe'}
            </button>
          </form>
        )}

        {/* Succès */}
        {status === 'success' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
            <p style={{ fontWeight: 800, fontSize: '1.05rem', color: '#065f46', marginBottom: '0.5rem' }}>
              Mot de passe mis à jour !
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>
              Redirection vers la connexion…
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Helpers force du mot de passe ─────────────────────────────────────────────
function passwordStrength(pwd) {
  let score = 0
  if (pwd.length >= 8)  score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score++
  return Math.max(1, score)
}
function strengthColor(pwd) {
  const s = passwordStrength(pwd)
  return s <= 1 ? '#ef4444' : s === 2 ? '#f59e0b' : s === 3 ? '#3b82f6' : '#22c55e'
}
function strengthLabel(pwd) {
  const s = passwordStrength(pwd)
  return s <= 1 ? 'Trop court' : s === 2 ? 'Faible' : s === 3 ? 'Bien' : 'Fort 💪'
}

const S = {
  page:    { minHeight: '100vh', background: '#efefef', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  brand:   { textAlign: 'center', marginBottom: '2rem' },
  logo:    { fontSize: '2.25rem', fontWeight: '900', color: '#333333', letterSpacing: '-1px' },
  tagline: { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.4rem' },
  card:    { background: 'white', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  field:   { marginBottom: '1rem' },
  label:   { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input:   { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  error:   { color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem', background: '#fef2f2', padding: '0.6rem 0.875rem', borderRadius: '8px' },
  btn:     { width: '100%', padding: '0.875rem', background: '#333333', color: '#e4f816', border: 'none', borderRadius: '12px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', marginTop: '0.5rem' },
}
