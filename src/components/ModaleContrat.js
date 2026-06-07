import AppLogo from './AppLogo'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { CGV_CONTENU, CURRENT_CGV_VERSION } from '../pages/CGV'

const OFFRE_LABELS = {
  preparation_physique: 'Préparation physique',
  coaching:             'Coaching remise en forme',
  essai:                'Période d\'essai',
}

export default function ModaleContrat({ clientId, userId, offre, onAccepte }) {
  const navigate = useNavigate()
  const [checked,      setChecked]      = useState(false)
  const [checkedRetro, setCheckedRetro] = useState(false)
  const [mention,      setMention]      = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState(null)

  const mentionValide = mention.trim().toLowerCase() === 'lu et approuvé'
  const peutValider   = checked && checkedRetro && mentionValide

  async function handleValider() {
    if (!peutValider) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('acceptations_contrat').upsert({
      client_id:       clientId,
      user_id:         userId,
      version_contrat: CURRENT_CGV_VERSION,
      formule:         offre || null,
    }, { onConflict: 'client_id,version_contrat', ignoreDuplicates: true })
    if (err) {
      setError('Une erreur est survenue. Réessaie.')
      setSaving(false)
      return
    }
    onAccepte()
  }

  return (
    <div style={S.overlay}>
      <div style={S.center}>
      <div style={S.modal}>
        {/* En-tête */}
        <div style={S.header}>
          <AppLogo />
          <p style={S.headerSub}>Contrat de prestation de services</p>
        </div>

        {/* Formule */}
        {offre && (
          <div style={S.formuleBadge}>
            <span style={S.formuleLabel}>Formule souscrite</span>
            <span style={S.formuleValue}>{OFFRE_LABELS[offre] || offre}</span>
          </div>
        )}

        {/* CGV scrollable */}
        <p style={S.cgvTitle}>Conditions Générales de Vente</p>
        <div style={S.cgvScroll}>
          {CGV_CONTENU.map((art, i) => (
            <div key={i} style={{ marginBottom: '1rem' }}>
              <p style={S.artTitre}>{art.titre}</p>
              <p style={S.artTexte}>{art.texte}</p>
            </div>
          ))}
        </div>

        {/* Lien CGV complet */}
        <button onClick={() => navigate('/cgv')} style={S.cgvLink}>
          Lire les CGV dans un onglet dédié →
        </button>

        {/* Case à cocher CGV */}
        <label style={S.checkLabel}>
          <div style={{ ...S.checkbox, ...(checked ? S.checkboxOn : {}) }}
            onClick={() => setChecked(v => !v)}>
            {checked && <span style={S.checkmark}>✓</span>}
          </div>
          <span style={S.checkText}>
            J'ai lu et j'accepte les Conditions Générales de Vente et le contrat de prestation de services AWPrepa
          </span>
        </label>

        {/* Case renonciation droit de rétractation */}
        <label style={{ ...S.checkLabel, marginBottom: '1.1rem' }}>
          <div style={{ ...S.checkbox, ...(checkedRetro ? S.checkboxOn : {}) }}
            onClick={() => setCheckedRetro(v => !v)}>
            {checkedRetro && <span style={S.checkmark}>✓</span>}
          </div>
          <span style={S.checkText}>
            Je demande expressément le début immédiat de la prestation et reconnais renoncer à mon droit de rétractation conformément à l'article L221-25 du Code de la consommation. Le premier mois est dû en totalité.
          </span>
        </label>

        {/* Mention manuscrite */}
        <div style={S.mentionWrap}>
          <label style={S.mentionLabel}>Mention manuscrite obligatoire</label>
          <input
            type="text"
            value={mention}
            onChange={e => setMention(e.target.value)}
            placeholder='Tapez "Lu et approuvé"'
            style={{ ...S.mentionInput, ...(mention && !mentionValide ? S.mentionInputError : mentionValide ? S.mentionInputOk : {}) }}
          />
          {mention && !mentionValide && (
            <p style={S.mentionHint}>Tapez exactement : Lu et approuvé</p>
          )}
        </div>

        {error && <p style={S.error}>{error}</p>}

        {/* Bouton valider */}
        <button
          onClick={handleValider}
          disabled={!peutValider || saving}
          style={{ ...S.btn, ...(!peutValider || saving ? S.btnOff : S.btnOn) }}>
          {saving ? 'Enregistrement…' : 'Valider et accéder à mon espace'}
        </button>
      </div>
      </div>
    </div>
  )
}

const S = {
  overlay:      { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '1rem', paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', boxSizing: 'border-box' },
  center:       { width: '100%', maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' },
  modal:        { background: 'white', borderRadius: 20, padding: '1.75rem 1.25rem', width: '100%', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:       { textAlign: 'center', marginBottom: '1.25rem' },
  logo:         { fontSize: '1.75rem', fontWeight: 900, color: '#333333', letterSpacing: '-0.5px' },
  headerSub:    { fontSize: '0.82rem', color: '#6b7280', margin: '0.25rem 0 0' },
  formuleBadge: { background: '#f3f4f6', borderRadius: 10, padding: '0.6rem 1rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  formuleLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' },
  formuleValue: { fontSize: '0.88rem', fontWeight: 800, color: '#1a1a1a' },
  cgvTitle:     { fontWeight: 800, fontSize: '0.82rem', color: '#333333', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.6rem' },
  cgvScroll:    { height: 220, overflowY: 'auto', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '0.6rem', background: '#fafafa' },
  artTitre:     { fontWeight: 800, fontSize: '0.78rem', color: '#374151', margin: '0 0 0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' },
  artTexte:     { fontSize: '0.8rem', color: '#4b5563', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-line' },
  cgvLink:      { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', padding: '0 0 1rem', display: 'block' },
  checkLabel:   { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.1rem' },
  checkbox:     { width: 22, height: 22, borderRadius: 6, border: '2px solid #d1d5db', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, transition: 'all 0.15s' },
  checkboxOn:   { background: '#1a1a1a', borderColor: '#1a1a1a' },
  checkmark:    { color: 'var(--accent)', fontWeight: 900, fontSize: '0.8rem' },
  checkText:    { fontSize: '0.83rem', color: '#374151', lineHeight: 1.55 },
  mentionWrap:  { marginBottom: '1.25rem' },
  mentionLabel: { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  mentionInput: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  mentionInputError: { borderColor: '#fca5a5', background: '#fff5f5' },
  mentionInputOk:    { borderColor: '#86efac', background: '#f0fdf4' },
  mentionHint:  { fontSize: '0.75rem', color: '#ef4444', margin: '0.3rem 0 0' },
  error:        { color: '#dc2626', fontSize: '0.8rem', marginBottom: '0.75rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: 8 },
  btn:          { width: '100%', padding: '0.9rem', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', transition: 'opacity 0.15s' },
  btnOn:        { background: '#333333', color: 'var(--accent)', cursor: 'pointer' },
  btnOff:       { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' },
}
