import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const STATUTS = {
  brouillon: { label: 'Brouillon', bg: '#f3f4f6', color: '#6b7280' },
  envoyee:   { label: 'Envoyée',   bg: '#eff6ff', color: '#1d4ed8' },
  payee:     { label: 'Payée',     bg: '#f0fdf4', color: '#15803d' },
}

const SETTINGS_KEYS = ['facture_nom', 'facture_adresse', 'facture_siret', 'facture_iban', 'facture_email', 'facture_numero_debut']

function newLigne() { return { id: Math.random().toString(36).slice(2), description: '', quantite: 1, prix: 0 } }

export default function Factures() {
  const [factures, setFactures]       = useState([])
  const [clients, setClients]         = useState([])
  const [settings, setSettings]       = useState({})
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [printId, setPrintId]         = useState(null)
  const [settingsForm, setSettingsForm] = useState({})
  const [form, setForm] = useState({
    client_id: '', date_emission: new Date().toISOString().slice(0, 10),
    date_echeance: '', notes: '', lignes: [newLigne()],
  })
  const printRef = useRef()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: f }, { data: c }, { data: s }] = await Promise.all([
      supabase.from('factures').select('*, clients(prenom, nom)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, prenom, nom').order('nom'),
      supabase.from('app_settings').select('key, value').in('key', SETTINGS_KEYS),
    ])
    setFactures(f || [])
    setClients(c || [])
    const map = {}
    ;(s || []).forEach(r => { map[r.key] = r.value })
    setSettings(map)
    setSettingsForm(map)
    setLoading(false)
  }

  async function saveSetting(key, value) {
    await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' })
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function saveAllSettings() {
    await Promise.all(Object.entries(settingsForm).map(([key, value]) =>
      supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' })
    ))
    setSettings(settingsForm)
    setShowSettings(false)
  }

  function nextNumero() {
    const debut = parseInt(settings.facture_numero_debut || '1')
    return String(debut + factures.length).padStart(4, '0')
  }

  async function createFacture() {
    const numero = nextNumero()
    const { data, error } = await supabase.from('factures').insert([{
      client_id: form.client_id || null,
      numero,
      date_emission: form.date_emission,
      date_echeance: form.date_echeance || null,
      lignes: form.lignes.filter(l => l.description.trim()),
      notes: form.notes || null,
      statut: 'brouillon',
    }]).select('*, clients(prenom, nom)').single()
    if (error) { alert(error.message); return }
    setFactures(prev => [data, ...prev])
    setShowForm(false)
    setForm({ client_id: '', date_emission: new Date().toISOString().slice(0, 10), date_echeance: '', notes: '', lignes: [newLigne()] })
    setPrintId(data.id)
  }

  async function updateStatut(id, statut) {
    await supabase.from('factures').update({ statut }).eq('id', id)
    setFactures(prev => prev.map(f => f.id === id ? { ...f, statut } : f))
  }

  async function deleteFacture(id) {
    if (!window.confirm('Supprimer cette facture ?')) return
    await supabase.from('factures').delete().eq('id', id)
    setFactures(prev => prev.filter(f => f.id !== id))
    if (printId === id) setPrintId(null)
  }

  function totalFacture(lignes) {
    return (lignes || []).reduce((s, l) => s + (parseFloat(l.prix) || 0) * (parseFloat(l.quantite) || 1), 0)
  }

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`<html><head><title>Facture</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: white; }
      @page { size: A4; margin: 20mm 15mm; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body>`)
    win.document.write(content.innerHTML)
    win.document.write('</body></html>')
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const facturePrint = factures.find(f => f.id === printId)

  if (loading) return <div style={S.page}><p style={{ color: '#9ca3af' }}>Chargement…</p></div>

  return (
    <div style={S.page}>
      {/* En-tête */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Factures</h1>
          <p style={S.sub}>{factures.length} facture{factures.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowSettings(v => !v)} style={S.btnSecondary}>⚙️ Mes infos</button>
          <button onClick={() => setShowForm(true)} style={S.btnPrimary}>+ Nouvelle facture</button>
        </div>
      </div>

      {/* Paramètres coach */}
      {showSettings && (
        <div style={S.card}>
          <p style={S.sectionTitle}>Informations coach (apparaissent sur les factures)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              { key: 'facture_nom', label: 'Nom / Raison sociale', placeholder: 'Arthur Wehrey' },
              { key: 'facture_adresse', label: 'Adresse', placeholder: '12 rue des Stades, 75001 Paris' },
              { key: 'facture_siret', label: 'SIRET', placeholder: '123 456 789 00012' },
              { key: 'facture_iban', label: 'IBAN (virement)', placeholder: 'FR76 3000…' },
              { key: 'facture_email', label: 'Email facturation', placeholder: 'arthur@awprepa.app' },
              { key: 'facture_numero_debut', label: 'N° de départ', placeholder: '1' },
            ].map(f => (
              <div key={f.key}>
                <label style={S.label}>{f.label}</label>
                <input
                  value={settingsForm[f.key] || ''}
                  onChange={e => setSettingsForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={S.input}
                />
              </div>
            ))}
          </div>
          <button onClick={saveAllSettings} style={S.btnPrimary}>✓ Sauvegarder</button>
        </div>
      )}

      {/* Formulaire nouvelle facture */}
      {showForm && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ ...S.sectionTitle, margin: 0 }}>Nouvelle facture — N° {nextNumero()}</p>
            <button onClick={() => setShowForm(false)} style={S.btnClose}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={S.label}>Client</label>
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} style={S.input}>
                <option value="">— Aucun —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Date d'émission</label>
              <input type="date" value={form.date_emission} onChange={e => setForm(f => ({ ...f, date_emission: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Date d'échéance</label>
              <input type="date" value={form.date_echeance} onChange={e => setForm(f => ({ ...f, date_echeance: e.target.value }))} style={S.input} />
            </div>
          </div>

          {/* Lignes */}
          <p style={S.label}>Prestations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {form.lignes.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={l.description} onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j === i ? { ...x, description: e.target.value } : x) }))}
                  placeholder="Description (ex : Coaching — Janvier 2026)"
                  style={{ ...S.input, flex: 3 }}
                />
                <input
                  type="number" value={l.quantite} min="1"
                  onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j === i ? { ...x, quantite: e.target.value } : x) }))}
                  style={{ ...S.input, width: 70 }} placeholder="Qté"
                />
                <input
                  type="number" value={l.prix} min="0"
                  onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j === i ? { ...x, prix: e.target.value } : x) }))}
                  style={{ ...S.input, width: 90 }} placeholder="Prix €"
                />
                <span style={{ minWidth: 70, textAlign: 'right', fontWeight: '700', fontSize: '0.9rem' }}>
                  {((parseFloat(l.prix) || 0) * (parseFloat(l.quantite) || 1)).toFixed(2)} €
                </span>
                {form.lignes.length > 1 && (
                  <button onClick={() => setForm(f => ({ ...f, lignes: f.lignes.filter((_, j) => j !== i) }))} style={S.btnClose}>✕</button>
                )}
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, lignes: [...f.lignes, newLigne()] }))} style={{ ...S.btnSecondary, alignSelf: 'flex-start', fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>+ Ligne</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: '0.75rem 1.25rem', textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.2rem' }}>TOTAL HT</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '900', color: '#111', margin: 0 }}>
                {totalFacture(form.lignes).toFixed(2)} €
              </p>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0.2rem 0 0' }}>TVA non applicable — Art. 293B CGI</p>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={S.label}>Notes (optionnel)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Conditions de règlement, informations complémentaires…"
              rows={2} style={{ ...S.input, width: '100%', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setShowForm(false)} style={S.btnSecondary}>Annuler</button>
            <button onClick={createFacture} style={S.btnPrimary}>✓ Créer la facture</button>
          </div>
        </div>
      )}

      {/* Liste des factures */}
      {factures.length === 0 && !showForm ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🧾</p>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Aucune facture. Crée ta première ci-dessus.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {factures.map(f => (
            <div key={f.id} style={{ ...S.card, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Numéro + client */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111' }}>N° {f.numero}</span>
                    <span style={{ ...S.badge, ...STATUTS[f.statut] }}>{STATUTS[f.statut]?.label}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>
                    {f.clients ? `${f.clients.prenom} ${f.clients.nom}` : 'Sans client'} · {new Date(f.date_emission).toLocaleDateString('fr-FR')}
                  </p>
                </div>

                {/* Montant */}
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <p style={{ margin: 0, fontWeight: '800', fontSize: '1.1rem', color: '#111' }}>{totalFacture(f.lignes).toFixed(2)} €</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>{(f.lignes || []).length} ligne{f.lignes?.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <select
                    value={f.statut}
                    onChange={e => updateStatut(f.id, e.target.value)}
                    style={{ ...S.input, padding: '0.3rem 0.5rem', fontSize: '0.78rem', width: 'auto' }}
                  >
                    <option value="brouillon">Brouillon</option>
                    <option value="envoyee">Envoyée</option>
                    <option value="payee">Payée</option>
                  </select>
                  <button onClick={() => setPrintId(printId === f.id ? null : f.id)} style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}>
                    {printId === f.id ? '▲ Fermer' : '🖨️ Voir / Imprimer'}
                  </button>
                  <button onClick={() => deleteFacture(f.id)} style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.3rem 0.65rem', color: '#dc2626', borderColor: '#fecaca' }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Aperçu + impression */}
      {facturePrint && (
        <div style={{ ...S.card, marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ ...S.sectionTitle, margin: 0 }}>Aperçu — Facture N° {facturePrint.numero}</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handlePrint} style={S.btnPrimary}>🖨️ Imprimer / PDF</button>
              <button onClick={() => setPrintId(null)} style={S.btnSecondary}>✕ Fermer</button>
            </div>
          </div>

          {/* Zone d'impression */}
          <div ref={printRef}>
            <div style={S.invoice}>
              {/* Header facture */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
                <div>
                  <p style={{ fontWeight: '900', fontSize: '1.1rem', color: '#111', margin: '0 0 0.25rem' }}>{settings.facture_nom || 'Nom du coach'}</p>
                  {settings.facture_adresse && <p style={S.inv_sm}>{settings.facture_adresse}</p>}
                  {settings.facture_siret  && <p style={S.inv_sm}>SIRET : {settings.facture_siret}</p>}
                  {settings.facture_email  && <p style={S.inv_sm}>{settings.facture_email}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: '900', fontSize: '1.8rem', color: '#111', margin: '0 0 0.25rem', letterSpacing: '-1px' }}>FACTURE</p>
                  <p style={S.inv_sm}>N° {facturePrint.numero}</p>
                  <p style={S.inv_sm}>Émise le {new Date(facturePrint.date_emission).toLocaleDateString('fr-FR')}</p>
                  {facturePrint.date_echeance && <p style={S.inv_sm}>Échéance : {new Date(facturePrint.date_echeance).toLocaleDateString('fr-FR')}</p>}
                </div>
              </div>

              {/* Client */}
              {facturePrint.clients && (
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '2rem' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.3rem' }}>Facturé à</p>
                  <p style={{ fontWeight: '700', fontSize: '0.95rem', color: '#111', margin: 0 }}>{facturePrint.clients.prenom} {facturePrint.clients.nom}</p>
                </div>
              )}

              {/* Lignes */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #111' }}>
                    <th style={{ ...S.inv_th, textAlign: 'left', flex: 1 }}>Description</th>
                    <th style={{ ...S.inv_th, textAlign: 'center', width: 60 }}>Qté</th>
                    <th style={{ ...S.inv_th, textAlign: 'right', width: 100 }}>Prix unit.</th>
                    <th style={{ ...S.inv_th, textAlign: 'right', width: 100 }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {(facturePrint.lignes || []).map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={S.inv_td}>{l.description}</td>
                      <td style={{ ...S.inv_td, textAlign: 'center' }}>{l.quantite}</td>
                      <td style={{ ...S.inv_td, textAlign: 'right' }}>{parseFloat(l.prix).toFixed(2)} €</td>
                      <td style={{ ...S.inv_td, textAlign: 'right', fontWeight: '700' }}>{((parseFloat(l.prix) || 0) * (parseFloat(l.quantite) || 1)).toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #111', paddingTop: '0.75rem' }}>
                    <span style={{ fontWeight: '900', fontSize: '1rem' }}>TOTAL TTC</span>
                    <span style={{ fontWeight: '900', fontSize: '1.1rem' }}>{totalFacture(facturePrint.lignes).toFixed(2)} €</span>
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0.4rem 0 0', textAlign: 'right' }}>TVA non applicable — Art. 293B CGI</p>
                </div>
              </div>

              {/* Règlement */}
              {settings.facture_iban && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1.25rem', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.3rem' }}>Règlement par virement</p>
                  <p style={S.inv_sm}>IBAN : {settings.facture_iban}</p>
                  <p style={S.inv_sm}>Référence : Facture {facturePrint.numero} — {facturePrint.clients ? `${facturePrint.clients.prenom} ${facturePrint.clients.nom}` : ''}</p>
                </div>
              )}

              {/* Notes */}
              {facturePrint.notes && (
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.3rem' }}>Notes</p>
                  <p style={S.inv_sm}>{facturePrint.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page:        { padding: '1.5rem', maxWidth: 900, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' },
  title:       { fontSize: '1.5rem', fontWeight: '900', color: '#111', margin: 0 },
  sub:         { fontSize: '0.82rem', color: '#9ca3af', margin: '0.2rem 0 0' },
  card:        { background: 'white', borderRadius: 16, padding: '1.25rem 1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  sectionTitle:{ fontSize: '0.72rem', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.875rem' },
  label:       { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' },
  input:       { width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', color: '#333', outline: 'none', boxSizing: 'border-box', background: 'white' },
  btnPrimary:  { background: '#333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.65rem 1.25rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary:{ background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnClose:    { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem' },
  badge:       { padding: '0.15rem 0.55rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: '700' },
  // Styles facture imprimable
  invoice:     { padding: '2rem', background: 'white', maxWidth: 700, margin: '0 auto', fontSize: '0.88rem', color: '#111' },
  inv_sm:      { fontSize: '0.82rem', color: '#4b5563', margin: '0.15rem 0 0', lineHeight: 1.5 },
  inv_th:      { padding: '0.5rem 0.75rem', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#111' },
  inv_td:      { padding: '0.65rem 0.75rem', fontSize: '0.88rem', color: '#374151' },
}
