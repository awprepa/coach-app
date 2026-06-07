import { useState } from 'react'
import { supabase } from '../supabase'

const TARIFS = {
  preparation_physique: { label: 'Préparation physique', sans: 89, m3: 79, m6: 69 },
  coaching:             { label: 'Coaching remise en forme', sans: 79, m3: 69, m6: 59 },
}

export default function ConfirmationOffre({ client, onConfirme }) {
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  const tarif = TARIFS[client.offre]
  if (!tarif) return null // essai → on n'affiche pas

  const engagement = client.engagement_mois
  const prixMensuel = engagement === 3 ? tarif.m3 : engagement === 6 ? tarif.m6 : tarif.sans
  const dureeLabel = engagement === 3 ? '3 mois' : engagement === 6 ? '6 mois' : 'sans engagement'
  const totalLabel = engagement ? `${prixMensuel * engagement}€ au total` : `${prixMensuel}€/mois, résiliable avec 30 jours de préavis`

  async function confirmer() {
    if (!checked) return
    setLoading(true)
    await supabase.from('clients').update({ offre_confirmee_at: new Date().toISOString() }).eq('id', client.id)
    setLoading(false)
    onConfirme()
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.icon}>📋</div>
          <h2 style={S.title}>Confirmation de souscription</h2>
          <p style={S.sub}>Veuillez confirmer votre formule avant d'accéder à l'application</p>
        </div>

        {/* Récapitulatif */}
        <div style={S.recap}>
          <div style={S.recapRow}>
            <span style={S.recapLabel}>Offre</span>
            <span style={S.recapValue}>{tarif.label}</span>
          </div>
          <div style={S.recapRow}>
            <span style={S.recapLabel}>Engagement</span>
            <span style={S.recapValue}>{dureeLabel}</span>
          </div>
          <div style={S.recapRow}>
            <span style={S.recapLabel}>Tarif mensuel</span>
            <span style={{ ...S.recapValue, fontWeight: '800', color: '#333' }}>{prixMensuel}€ / mois</span>
          </div>
          {client.date_debut && (
            <div style={S.recapRow}>
              <span style={S.recapLabel}>Début</span>
              <span style={S.recapValue}>{new Date(client.date_debut).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          {client.date_fin && (
            <div style={S.recapRow}>
              <span style={S.recapLabel}>Fin</span>
              <span style={S.recapValue}>{new Date(client.date_fin).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
          <div style={{ ...S.recapRow, borderTop: '1.5px solid #e5e7eb', marginTop: '0.5rem', paddingTop: '0.75rem' }}>
            <span style={S.recapLabel}>Montant</span>
            <span style={{ ...S.recapValue, fontWeight: '800', color: '#333' }}>{totalLabel}</span>
          </div>
        </div>

        {/* Conditions engagement */}
        {engagement && (
          <div style={S.warning}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e', lineHeight: 1.5 }}>
              Formule avec engagement de <strong>{dureeLabel}</strong>. Conformément aux CGV, aucun remboursement n'est accordé en cas d'arrêt anticipé passé le délai légal de rétractation de 14 jours.
            </p>
          </div>
        )}

        {/* Checkbox */}
        <label style={S.checkRow}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#333333', flexShrink: 0, cursor: 'pointer' }} />
          <span style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>
            Je confirme souscrire à la formule <strong>{tarif.label}</strong> {engagement ? `avec un engagement de ${dureeLabel}` : 'sans engagement'} au tarif de <strong>{prixMensuel}€/mois</strong>, et avoir pris connaissance des CGV.
          </span>
        </label>

        <button
          onClick={confirmer}
          disabled={!checked || loading}
          style={{ ...S.btn, opacity: (!checked || loading) ? 0.5 : 1, cursor: (!checked || loading) ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Enregistrement…' : '✓ Confirmer ma souscription'}
        </button>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto', paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))', boxSizing: 'border-box' },
  modal: { background: 'white', borderRadius: 20, padding: '2rem 1.25rem', width: '100%', maxWidth: 440, boxSizing: 'border-box', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  header: { textAlign: 'center', marginBottom: '1.5rem' },
  icon: { fontSize: '2rem', marginBottom: '0.75rem' },
  title: { fontSize: '1.2rem', fontWeight: '800', color: '#111827', margin: '0 0 0.4rem' },
  sub: { fontSize: '0.82rem', color: '#6b7280', margin: 0 },
  recap: { background: '#f9fafb', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1rem', border: '1.5px solid #e5e7eb' },
  recapRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0' },
  recapLabel: { fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' },
  recapValue: { fontSize: '0.88rem', color: '#374151', fontWeight: '600' },
  warning: { background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' },
  checkRow: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1.25rem', cursor: 'pointer' },
  btn: { width: '100%', background: '#333333', color: '#e4f816', border: 'none', borderRadius: 12, padding: '0.875rem', fontSize: '0.95rem', fontWeight: '800' },
}
