import AppLogo from './AppLogo'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { supabase } from '../supabase'
import { sendNotif, getCoachId } from '../notifs'

function formatDate(d) {
  return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : null
}

// Génère le PDF archivé du contrat signé — snapshot figé, jamais régénéré
// après coup (c'est ce document, pas la page live, qui fait foi en cas de litige).
function genererPdf(contrat, client, { ip, mention, dateSignature }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marge = 48
  let y = 60
  const largeur = 595 - marge * 2

  function titre(texte, taille = 16) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(taille)
    doc.text(texte, marge, y); y += taille + 8
  }
  function ligne(texte, opts = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.taille || 10)
    const lignes = doc.splitTextToSize(texte, largeur)
    lignes.forEach(l => {
      if (y > 780) { doc.addPage(); y = 60 }
      doc.text(l, marge, y)
      y += (opts.taille || 10) * 1.35
    })
    y += 4
  }

  titre('Contrat de prestation de services — AWPrepa')
  ligne('Arthur Wehrey · SIRET 106 026 883 00012 · 41 rue Fénelon, 31200 Toulouse', { taille: 9 })
  y += 8

  titre('Client', 12)
  ligne(`${client.prenom} ${client.nom} — ${client.email || ''}`)
  y += 4

  titre('Formule souscrite', 12)
  ligne(contrat.formule_label, { bold: true, taille: 12 })
  ligne(contrat.engagement_mois ? `Engagement de ${contrat.engagement_mois} mois` : 'Sans engagement')
  ligne(`Tarif : ${contrat.prix_mensuel}€/mois${contrat.prix_total ? ` — ${contrat.prix_total}€ au total` : ''}`)
  if (contrat.date_debut) ligne(`Début : ${formatDate(contrat.date_debut)}`)
  if (contrat.date_fin) ligne(`Fin : ${formatDate(contrat.date_fin)}`)
  y += 8

  titre('Conditions générales de vente', 12)
  ;(contrat.texte_cgv || []).forEach(art => {
    ligne(art.titre, { bold: true, taille: 10 })
    ligne(art.texte, { taille: 9.5 })
  })

  y += 8
  titre('Signature électronique', 12)
  ligne(`Signé le ${dateSignature.toLocaleString('fr-FR')}`)
  ligne(`Adresse IP : ${ip || 'non disponible'}`)
  ligne(`Mention manuscrite : « ${mention} »`)

  return doc.output('datauristring').split(',')[1] // base64 sans le préfixe data:...
}

export default function ModaleContratASigner({ contrat, clientId, onSigne }) {
  const navigate = useNavigate()
  const [checkedCgv,   setCheckedCgv]   = useState(false)
  const [checkedRetro, setCheckedRetro] = useState(false)
  const [mention,      setMention]      = useState('')
  const [saving,        setSaving]      = useState(false)
  const [error,         setError]       = useState(null)

  const mentionValide = mention.trim().toLowerCase() === 'lu et approuvé'
  const peutValider   = checkedCgv && checkedRetro && mentionValide

  async function handleValider() {
    if (!peutValider || saving) return
    setSaving(true)
    setError(null)
    try {
      const [{ data: ipData }, { data: client }] = await Promise.all([
        supabase.functions.invoke('get-client-ip').catch(() => ({ data: null })),
        supabase.from('clients').select('prenom, nom, email').eq('id', clientId).single(),
      ])
      const ip = ipData?.ip || null
      const dateSignature = new Date()
      const mentionTexte = mention.trim()

      const pdfBase64 = genererPdf(contrat, client, { ip, mention: mentionTexte, dateSignature })
      const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
      const pdfPath = `${clientId}/${contrat.id}.pdf`
      const { error: upErr } = await supabase.storage.from('contrats-pdf')
        .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr

      const { error: updErr } = await supabase.from('contrats').update({
        statut:         'signe',
        date_signature: dateSignature.toISOString(),
        ip_address:     ip,
        mention:        mentionTexte,
        pdf_url:        pdfPath,
      }).eq('id', contrat.id)
      if (updErr) throw updErr

      const coachId = await getCoachId()
      if (coachId) {
        sendNotif(coachId, {
          titre: `${client.prenom} ${client.nom} a signé son contrat`,
          corps: `${contrat.formule_label} — ${contrat.prix_mensuel}€/mois`,
          type: 'contrat',
          lien: `/client/${clientId}`,
        })
      }

      onSigne()
    } catch (e) {
      console.error('[ModaleContratASigner]', e)
      setError('Une erreur est survenue. Réessaie.')
      setSaving(false)
    }
  }

  return (
    <div style={S.overlay}>
      <div style={S.center}>
        <div style={S.modal}>
          <div style={S.header}>
            <AppLogo />
            <p style={S.headerSub}>Contrat de prestation de services</p>
          </div>

          <div style={S.formuleBadge}>
            <span style={S.formuleLabel}>Formule</span>
            <span style={S.formuleValue}>{contrat.formule_label}</span>
          </div>
          <div style={S.recapRow}>
            <span style={S.recapLabel}>Engagement</span>
            <span style={S.recapValue}>{contrat.engagement_mois ? `${contrat.engagement_mois} mois` : 'Sans engagement'}</span>
          </div>
          <div style={S.recapRow}>
            <span style={S.recapLabel}>Tarif</span>
            <span style={{ ...S.recapValue, fontWeight: 800 }}>
              {contrat.prix_mensuel}€/mois{contrat.prix_total ? ` · ${contrat.prix_total}€ au total` : ''}
            </span>
          </div>

          <p style={S.cgvTitle}>Conditions générales de vente</p>
          <div style={S.cgvScroll}>
            {(contrat.texte_cgv || []).map((art, i) => (
              <div key={i} style={{ marginBottom: '1rem' }}>
                <p style={S.artTitre}>{art.titre}</p>
                <p style={S.artTexte}>{art.texte}</p>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/cgv')} style={S.cgvLink}>
            Lire les CGV dans un onglet dédié →
          </button>

          <label style={S.checkLabel}>
            <div style={{ ...S.checkbox, ...(checkedCgv ? S.checkboxOn : {}) }}
              onClick={() => setCheckedCgv(v => !v)}>
              {checkedCgv && <span style={S.checkmark}>✓</span>}
            </div>
            <span style={S.checkText}>
              J'ai lu et j'accepte les Conditions Générales de Vente et ce contrat de prestation de services AWPrepa.
            </span>
          </label>

          <label style={{ ...S.checkLabel, marginBottom: '1.1rem' }}>
            <div style={{ ...S.checkbox, ...(checkedRetro ? S.checkboxOn : {}) }}
              onClick={() => setCheckedRetro(v => !v)}>
              {checkedRetro && <span style={S.checkmark}>✓</span>}
            </div>
            <span style={S.checkText}>
              Je demande expressément le début immédiat de la prestation et reconnais renoncer à mon droit de rétractation conformément à l'article L221-25 du Code de la consommation.
            </span>
          </label>

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

          <button
            onClick={handleValider}
            disabled={!peutValider || saving}
            style={{ ...S.btn, ...(!peutValider || saving ? S.btnOff : S.btnOn) }}>
            {saving ? 'Enregistrement…' : 'Signer le contrat'}
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
  headerSub:    { fontSize: '0.82rem', color: '#6b7280', margin: '0.25rem 0 0' },
  formuleBadge: { background: '#f3f4f6', borderRadius: 10, padding: '0.6rem 1rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  formuleLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' },
  formuleValue: { fontSize: '0.88rem', fontWeight: 800, color: '#1a1a1a' },
  recapRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.2rem' },
  recapLabel:   { fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 },
  recapValue:   { fontSize: '0.85rem', color: '#374151', fontWeight: 600 },
  cgvTitle:     { fontWeight: 800, fontSize: '0.82rem', color: '#333333', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1rem 0 0.6rem' },
  cgvScroll:    { height: 200, overflowY: 'auto', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '0.6rem', background: '#fafafa' },
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
