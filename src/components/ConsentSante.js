import { useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

/**
 * Écran de consentement RGPD pour les données de santé (Art. 9 RGPD).
 * Affiché une seule fois avant le premier accès aux modules santé.
 * @param {string} clientId  - UUID du client
 * @param {function} onConsent - Callback appelé après consentement enregistré
 */
export default function ConsentSante({ clientId, onConsent }) {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  async function handleAccept() {
    if (!checked || !clientId) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('consents').upsert(
      { client_id: clientId, type: 'sante', texte_version: '1.0' },
      { onConflict: 'client_id,type' }
    )
    if (err) { setError('Une erreur est survenue. Réessaie.'); setSaving(false); return }
    setSaving(false)
    onConsent()
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Icône */}
        <div style={S.iconWrap}>
          <span style={{ fontSize: '2rem' }}>🔒</span>
        </div>

        {/* Titre */}
        <p style={S.title}>Données de santé</p>
        <p style={S.subtitle}>
          Cette section utilise des données personnelles de santé. Conformément au RGPD (Art. 9),
          ton consentement explicite est requis avant de continuer.
        </p>

        {/* Ce qui est collecté */}
        <div style={S.infoBox}>
          <p style={S.infoTitle}>Ce qui est collecté :</p>
          {[
            'Profil nutritionnel (objectif, allergènes, régime)',
            'Repas journaliers (calories, macronutriments)',
            'Photos de repas',
            'Hydratation',
            'Tests physiques (performances mesurées)',
            'Bien-être quotidien (sommeil, fatigue, stress, douleurs)',
            'Poids corporel',
          ].map(item => (
            <div key={item} style={S.infoRow}>
              <span style={S.dot}>•</span>
              <span style={S.infoText}>{item}</span>
            </div>
          ))}
        </div>

        {/* Finalité */}
        <div style={S.purposeBox}>
          <p style={S.purposeText}>
            Ces données sont utilisées <strong>uniquement</strong> pour optimiser ton suivi sportif et nutritionnel.
            Elles ne sont ni vendues, ni transmises à des tiers. Tu peux retirer ton consentement à tout moment
            en contactant <strong>arthur.whry@gmail.com</strong>.
          </p>
        </div>

        {/* Checkbox consentement */}
        <label style={S.checkLabel}>
          <div style={{ ...S.checkbox, ...(checked ? S.checkboxActive : {}) }}
            onClick={() => setChecked(v => !v)}>
            {checked && <span style={S.checkmark}>✓</span>}
          </div>
          <span style={S.checkText}>
            Je consens à la collecte et au traitement de mes données de santé
            par Arthur Wehrey dans le cadre de mon suivi sportif.
          </span>
        </label>

        {error && <p style={S.error}>{error}</p>}

        {/* Boutons */}
        <button
          onClick={handleAccept}
          disabled={!checked || saving}
          style={{ ...S.btn, ...(!checked || saving ? S.btnDisabled : S.btnActive) }}>
          {saving ? 'Enregistrement…' : 'Je consens et je continue'}
        </button>

        <button onClick={() => navigate(-1)} style={S.btnRefuse}>
          Refuser et revenir en arrière
        </button>

        {/* Lien mentions légales */}
        <button onClick={() => navigate('/client/mentions-legales')} style={S.linkBtn}>
          Lire la politique de confidentialité complète →
        </button>
      </div>
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem 1rem 3rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  card:        { background: 'white', borderRadius: 20, padding: '1.75rem 1.5rem', maxWidth: 480, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  iconWrap:    { width: 56, height: 56, borderRadius: 16, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' },
  title:       { fontWeight: 900, fontSize: '1.2rem', color: '#1a1a1a', margin: '0 0 0.4rem' },
  subtitle:    { fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, margin: '0 0 1.25rem' },
  infoBox:     { background: '#f9fafb', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '1rem' },
  infoTitle:   { fontWeight: 800, fontSize: '0.78rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem' },
  infoRow:     { display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' },
  dot:         { color: '#9ca3af', flexShrink: 0, fontSize: '0.85rem' },
  infoText:    { fontSize: '0.83rem', color: '#4b5563', lineHeight: 1.5 },
  purposeBox:  { background: '#fffbeb', borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '1.25rem', border: '1px solid #fde68a' },
  purposeText: { fontSize: '0.82rem', color: '#78350f', lineHeight: 1.6, margin: 0 },
  checkLabel:  { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.25rem' },
  checkbox:    { width: 22, height: 22, borderRadius: 6, border: '2px solid #d1d5db', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, transition: 'all 0.15s' },
  checkboxActive: { background: '#1a1a1a', borderColor: '#1a1a1a' },
  checkmark:   { color: '#e4f816', fontWeight: 900, fontSize: '0.8rem', lineHeight: 1 },
  checkText:   { fontSize: '0.83rem', color: '#374151', lineHeight: 1.55 },
  error:       { color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.75rem' },
  btn:         { width: '100%', padding: '0.9rem', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', marginBottom: '0.6rem', transition: 'opacity 0.15s' },
  btnActive:   { background: '#1a1a1a', color: '#e4f816' },
  btnDisabled: { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' },
  btnRefuse:   { width: '100%', padding: '0.75rem', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', marginBottom: '1rem' },
  linkBtn:     { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', padding: '0.25rem 0', width: '100%', textAlign: 'center' },
}
