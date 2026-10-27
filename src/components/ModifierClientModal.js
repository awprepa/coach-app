import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { isoLocal } from '../utils/dates'

// Fenêtre « Modifier le profil » de la fiche client (côté coach).
// Remplace l'ancien formulaire coincé dans la colonne latérale.

const OFFRES = [
  ['gratuit', 'Gratuit'], ['essai', 'Essai'], ['preparation_physique', 'Préparation physique'],
  ['coaching', 'Coaching'], ['club', 'Club'],
]
const ENGAGEMENTS = [[null, 'Sans engagement'], [1, '1 mois'], [3, '3 mois'], [6, '6 mois']]

// Date de fin = début + n mois
function finApres(debut, mois) {
  const fin = new Date((debut || isoLocal()) + 'T00:00:00')
  fin.setMonth(fin.getMonth() + mois)
  return isoLocal(fin)
}

export default function ModifierClientModal({ client, categories, onClose, onSaved }) {
  const [form, setForm] = useState(client)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState(null)
  const set = champs => setForm(f => ({ ...f, ...champs }))
  const avecEngagement = ['coaching', 'preparation_physique'].includes(form.offre)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function changerOffre(offre) {
    const champs = { offre, engagement_mois: null }
    if (offre === 'essai') champs.date_fin = finApres(form.date_debut, 1)
    set(champs)
  }
  function changerEngagement(mois) {
    set({ engagement_mois: mois, ...(mois ? { date_fin: finApres(form.date_debut, mois) } : {}) })
  }
  // Avec un engagement, la date de fin suit la date de début
  function changerDebut(date_debut) {
    set({ date_debut, ...(avecEngagement && form.engagement_mois && date_debut ? { date_fin: finApres(date_debut, form.engagement_mois) } : {}) })
  }

  async function enregistrer() {
    if (!form.prenom?.trim()) { setErreur('Le prénom est obligatoire.'); return }
    setSaving(true); setErreur(null)
    // Si l'offre change, le client re-confirme son abonnement à la prochaine connexion
    const offreChangee = form.offre !== client.offre
    const { error } = await supabase.from('clients').update({
      prenom: form.prenom.trim(), nom: form.nom, email: form.email,
      telephone: form.telephone, objectif: form.objectif,
      offre: form.offre, engagement_mois: avecEngagement ? (form.engagement_mois || null) : null,
      date_debut: form.date_debut || null, date_fin: form.date_fin || null,
      notes: form.notes, categorie_id: form.categorie_id || null,
      peut_creer_seances: form.peut_creer_seances || false,
      ...(offreChangee ? { offre_confirmee_at: null } : {}),
    }).eq('id', client.id)
    setSaving(false)
    if (error) { setErreur('Les modifications n’ont pas été enregistrées. Réessaie.'); return }
    onSaved()
  }

  const champ = (label, cle, type = 'text') => (
    <label style={S.champ}>
      <span style={S.label}>{label}</span>
      <input type={type} value={form[cle] || ''} onChange={e => set({ [cle]: e.target.value })} style={S.input} />
    </label>
  )

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Modifier le profil">
        <div style={S.head}>
          <div>
            <p style={S.titre}>Modifier le profil</p>
            <p style={S.sous}>{client.prenom} {client.nom}</p>
          </div>
          <button onClick={onClose} style={S.fermer} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div style={S.corps}>
          <section style={S.section}>
            <p style={S.sectionTitre}>Identité</p>
            <div style={S.grille}>
              {champ('Prénom', 'prenom')}
              {champ('Nom', 'nom')}
              {champ('Email', 'email', 'email')}
              {champ('Téléphone', 'telephone', 'tel')}
            </div>
          </section>

          <section style={S.section}>
            <p style={S.sectionTitre}>Abonnement</p>
            <div style={S.grille}>
              <label style={S.champ}>
                <span style={S.label}>Offre</span>
                <select value={form.offre || 'gratuit'} onChange={e => changerOffre(e.target.value)} style={S.input}>
                  {OFFRES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label style={S.champ}>
                <span style={S.label}>Catégorie</span>
                <select value={form.categorie_id || ''} onChange={e => set({ categorie_id: e.target.value || null })} style={S.input}>
                  <option value="">Aucune</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </label>
            </div>
            {avecEngagement && (
              <div style={S.champ}>
                <span style={S.label}>Engagement</span>
                <div style={S.segments}>
                  {ENGAGEMENTS.map(([v, l]) => (
                    <button key={String(v)} type="button" onClick={() => changerEngagement(v)}
                      style={{ ...S.segment, ...((form.engagement_mois || null) === v ? S.segmentOn : {}) }}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={S.grille}>
              <label style={S.champ}>
                <span style={S.label}>Début</span>
                <input type="date" value={form.date_debut || ''} onChange={e => changerDebut(e.target.value)} style={S.input} />
              </label>
              {champ('Fin', 'date_fin', 'date')}
            </div>
          </section>

          <section style={S.section}>
            <p style={S.sectionTitre}>Suivi</p>
            <label style={S.champ}>
              <span style={S.label}>Objectif</span>
              <textarea value={form.objectif || ''} onChange={e => set({ objectif: e.target.value })} rows={2} style={S.textarea} />
            </label>
            <label style={S.champ}>
              <span style={S.label}>Notes</span>
              <textarea value={form.notes || ''} onChange={e => set({ notes: e.target.value })} rows={3} style={S.textarea} />
            </label>
            <button type="button" onClick={() => set({ peut_creer_seances: !form.peut_creer_seances })} style={S.option}
              role="switch" aria-checked={!!form.peut_creer_seances}>
              <span style={{ ...S.interrupteur, background: form.peut_creer_seances ? '#333333' : '#e5e7eb' }}>
                <span style={{ ...S.bouton, left: form.peut_creer_seances ? 21 : 3, background: form.peut_creer_seances ? '#e4f816' : '#ffffff' }} />
              </span>
              <span>
                <span style={S.optionTitre}>Peut créer ses propres séances</span>
                <span style={S.optionSous}>Accès au créateur de séances, hors groupe</span>
              </span>
            </button>
          </section>
        </div>

        <div style={S.pied}>
          {erreur && <span style={S.erreur}>{erreur}</span>}
          <button onClick={onClose} style={S.btnSecondaire}>Annuler</button>
          <button onClick={enregistrer} disabled={saving} style={{ ...S.btnPrincipal, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid #f3f4f6' },
  titre: { margin: 0, fontSize: 18, fontWeight: 800, color: '#1a1a1a' },
  sous: { margin: '2px 0 0', fontSize: 13, color: '#6b7280' },
  fermer: { width: 44, height: 44, margin: '-10px -10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 10, color: '#4b5563', cursor: 'pointer' },
  corps: { padding: '4px 20px', overflowY: 'auto' },
  section: { display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0', borderBottom: '1px solid #f3f4f6' },
  sectionTitre: { margin: 0, fontSize: 14, fontWeight: 800, color: '#1a1a1a' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  champ: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { width: '100%', minHeight: 44, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: '#1a1a1a', background: '#ffffff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  textarea: { width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: '#1a1a1a', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.45 },
  segments: { display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 10, padding: 3, flexWrap: 'wrap' },
  segment: { flex: '1 1 auto', minHeight: 38, border: 'none', background: 'none', color: '#4b5563', fontSize: 13, fontWeight: 700, padding: '0 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  segmentOn: { background: '#333333', color: '#e4f816' },
  option: { display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  interrupteur: { width: 42, height: 24, borderRadius: 12, position: 'relative', flexShrink: 0, transition: 'background 0.2s' },
  bouton: { position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' },
  optionTitre: { display: 'block', fontSize: 14, fontWeight: 600, color: '#1a1a1a' },
  optionSous: { display: 'block', fontSize: 12.5, color: '#6b7280', marginTop: 2 },
  pied: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' },
  erreur: { flex: '1 1 200px', fontSize: 13, fontWeight: 600, color: '#dc2626' },
  btnSecondaire: { minHeight: 44, background: '#ffffff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrincipal: { minHeight: 44, background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}
