import { useState } from 'react'
import { supabase } from '../supabase'
import { sendNotif } from '../notifs'
import { CGV_CONTENU } from '../pages/CGV'

const TARIFS = {
  essai:                { label: 'Essai', sans: 49, m3: null, m6: null },
  preparation_physique: { label: 'Préparation physique', sans: 89, m3: 79, m6: 69 },
  coaching:             { label: 'Coaching remise en forme', sans: 79, m3: 69, m6: 59 },
}

export default function EnvoyerContratModal({ client, onClose, onEnvoye }) {
  const [formule,    setFormule]    = useState(TARIFS[client.offre] ? client.offre : 'coaching')
  const [engagement, setEngagement] = useState(client.engagement_mois || null)
  const [dateDebut,  setDateDebut]  = useState(client.date_debut || '')
  const [dateFin,    setDateFin]    = useState(client.date_fin || '')
  const [sending,    setSending]    = useState(false)
  const [error,      setError]      = useState(null)

  const tarif = TARIFS[formule]
  const prixMensuel = engagement === 3 ? tarif.m3 : engagement === 6 ? tarif.m6 : tarif.sans
  const prixTotal = engagement ? prixMensuel * engagement : null

  async function envoyer() {
    if (!prixMensuel) return
    setSending(true)
    setError(null)
    const { error: err } = await supabase.from('contrats').insert({
      client_id:       client.id,
      statut:          'envoye',
      formule,
      formule_label:   tarif.label,
      engagement_mois: engagement || null,
      prix_mensuel:    prixMensuel,
      prix_total:      prixTotal,
      date_debut:      dateDebut || null,
      date_fin:        dateFin || null,
      texte_cgv:       CGV_CONTENU,
    })
    if (err) { setError('Une erreur est survenue. Réessaie.'); setSending(false); return }

    await sendNotif(client.user_id, {
      titre: 'Nouveau contrat à signer',
      corps: `${tarif.label} — ${prixMensuel}€/mois`,
      type: 'contrat',
      lien: '/client/accueil',
    })

    setSending(false)
    onEnvoye()
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <p style={S.title}>Envoyer un contrat</p>
        <p style={S.sub}>{client.prenom} {client.nom}</p>

        <label style={S.label}>Formule</label>
        <select value={formule} onChange={e => { setFormule(e.target.value); setEngagement(null) }} style={S.select}>
          {Object.entries(TARIFS).map(([key, t]) => (
            <option key={key} value={key}>{t.label}</option>
          ))}
        </select>

        <label style={S.label}>Engagement</label>
        <select value={engagement || ''} onChange={e => setEngagement(e.target.value ? parseInt(e.target.value) : null)} style={S.select}>
          <option value="">Sans engagement — {tarif.sans}€/mois</option>
          {tarif.m3 && <option value="3">3 mois — {tarif.m3}€/mois</option>}
          {tarif.m6 && <option value="6">6 mois — {tarif.m6}€/mois</option>}
        </select>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Début</label>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={S.select} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Fin</label>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={S.select} />
          </div>
        </div>

        <div style={S.recap}>
          <span style={S.recapLabel}>Le client verra</span>
          <span style={S.recapValue}>
            {tarif.label} · {prixMensuel}€/mois{prixTotal ? ` · ${prixTotal}€ au total` : ''}
          </span>
        </div>

        {error && <p style={S.error}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={envoyer} disabled={sending || !prixMensuel} style={{ ...S.btnPrimary, opacity: sending || !prixMensuel ? 0.5 : 1 }}>
            {sending ? 'Envoi…' : 'Envoyer au client'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' },
  modal:    { background: 'white', borderRadius: 18, padding: '1.75rem', maxWidth: 440, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  title:    { fontWeight: 800, fontSize: '1.05rem', color: '#1a1a1a', margin: '0 0 2px' },
  sub:      { fontSize: '0.82rem', color: '#6b7280', margin: '0 0 1.25rem' },
  label:    { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.75rem 0 0.35rem' },
  select:   { width: '100%', padding: '0.65rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', color: '#333333', outline: 'none', background: 'white', boxSizing: 'border-box' },
  recap:    { marginTop: '1.1rem', background: '#f9fafb', borderRadius: 10, padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  recapLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  recapValue: { fontSize: '0.85rem', fontWeight: 700, color: '#333333' },
  error:    { color: '#dc2626', fontSize: '0.8rem', marginTop: '0.75rem' },
  btnPrimary:   { flex: 1, background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.7rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' },
  btnSecondary: { flex: 1, background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.7rem', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' },
}
