import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

/* ── Icônes SVG ─────────────────────────────────────────────────────────── */
const Ico = {
  settings: (s=15) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  edit:     (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  print:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  trash:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  invoice:  (s=36) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>,
  person:   (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.5 8.5 0 0 1 13 0"/></svg>,
  building: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="9" width="18" height="13" rx="1"/><path d="M8 9V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>,
  group:    (s=13) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 10 0v2"/><circle cx="17" cy="8" r="2.5" strokeOpacity=".6"/><path d="M21 21v-2a5 5 0 0 0-5.27-4.98" strokeOpacity=".6"/></svg>,
}

const STATUTS = {
  brouillon: { label: 'Brouillon', bg: '#f3f4f6', color: '#6b7280' },
  envoyee:   { label: 'Envoyée',   bg: '#eff6ff', color: '#1d4ed8' },
  payee:     { label: 'Payée',     bg: '#f0fdf4', color: '#15803d' },
}

const SETTINGS_KEYS = ['facture_nom', 'facture_adresse', 'facture_siret', 'facture_iban', 'facture_email', 'facture_numero_debut', 'facture_activite']

function newLigne() { return { id: Math.random().toString(36).slice(2), description: '', quantite: 1, prix: 0 } }

const EMPTY_FORM = () => ({
  client_id: '', date_emission: new Date().toISOString().slice(0, 10),
  date_echeance: '', notes: '', lignes: [newLigne()],
  dest_manuel: false, dest_nom: '', dest_adresse: '', dest_siret: '',
})

export default function Factures() {
  const [factures, setFactures]           = useState([])
  const [clients, setClients]             = useState([])
  const [categories, setCategories]       = useState([])
  const [settings, setSettings]           = useState({})
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [editingId, setEditingId]         = useState(null)
  const [showSettings, setShowSettings]   = useState(false)
  const [printId, setPrintId]             = useState(null)
  const [settingsForm, setSettingsForm]   = useState({})
  const [form, setForm]                   = useState(EMPTY_FORM())
  const [selectedGroupId, setSelectedGroupId] = useState(null) // groupe sélectionné dans le dropdown client
  const printRef = useRef()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: f }, { data: c }, { data: s }, { data: cats }] = await Promise.all([
      supabase.from('factures').select('*, clients(prenom, nom, email)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, prenom, nom, email, categorie_id').order('nom'),
      supabase.from('app_settings').select('key, value').in('key', SETTINGS_KEYS),
      supabase.from('categories').select('id, nom').order('nom'),
    ])
    setFactures(f || [])
    setClients(c || [])
    setCategories(cats || [])
    const map = {}
    ;(s || []).forEach(r => { map[r.key] = r.value })
    setSettings(map)
    setSettingsForm(map)
    setLoading(false)
  }

  async function saveAllSettings() {
    await Promise.all(Object.entries(settingsForm).map(([key, value]) =>
      supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' })
    ))
    setSettings(settingsForm)
    setShowSettings(false)
  }

  function nextNumero() {
    const yy = new Date().getFullYear().toString().slice(2) // "26"
    const offset = parseInt(settings.facture_numero_debut || '0')
    const yearCount = factures.filter(f => f.numero?.startsWith(yy)).length
    return yy + String(offset + yearCount + 1).padStart(3, '0')
  }

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM())
    setSelectedGroupId(null)
    setShowForm(true)
    setPrintId(null)
  }

  function openEdit(f) {
    setEditingId(f.id)
    setSelectedGroupId(null)
    setForm({
      client_id:     f.client_id || '',
      date_emission: f.date_emission,
      date_echeance: f.date_echeance || '',
      notes:         f.notes || '',
      lignes:        f.lignes?.length ? f.lignes.map(l => ({ ...l, id: l.id || Math.random().toString(36).slice(2) })) : [newLigne()],
      dest_manuel:   !!f.destinataire,
      dest_nom:      f.destinataire?.nom      || '',
      dest_adresse:  f.destinataire?.adresse  || '',
      dest_siret:    f.destinataire?.siret    || '',
    })
    setShowForm(true)
    setPrintId(null)
  }

  async function submitForm() {
    const payload = {
      client_id:     form.dest_manuel ? null : (form.client_id || null),
      date_emission: form.date_emission,
      date_echeance: form.date_echeance || null,
      lignes:        form.lignes.filter(l => l.description.trim()),
      notes:         form.notes || null,
      destinataire:  form.dest_manuel && form.dest_nom.trim()
                       ? { nom: form.dest_nom.trim(), adresse: form.dest_adresse.trim(), siret: form.dest_siret.trim() }
                       : null,
    }

    if (editingId) {
      // Mise à jour
      const { data, error } = await supabase.from('factures')
        .update(payload)
        .eq('id', editingId)
        .select('*, clients(prenom, nom, email)').single()
      if (error) { alert(error.message); return }
      setFactures(prev => prev.map(f => f.id === editingId ? data : f))
      setPrintId(editingId)
    } else {
      // Création
      const numero = nextNumero()
      const { data, error } = await supabase.from('factures')
        .insert([{ ...payload, numero, statut: 'brouillon' }])
        .select('*, clients(prenom, nom, email)').single()
      if (error) { alert(error.message); return }
      setFactures(prev => [data, ...prev])
      setPrintId(data.id)
    }

    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM())
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
    if (editingId === id) { setShowForm(false); setEditingId(null) }
  }

  function totalFacture(lignes) {
    return (lignes || []).reduce((s, l) => s + (parseFloat(l.prix) || 0) * (parseFloat(l.quantite) || 1), 0)
  }

  function handlePrint() {
    const content = printRef.current
    if (!content) return
    const win = window.open('', '_blank')
    win.document.write(`<!DOCTYPE html><html><head><title>Facture ${facturePrint?.numero || ''}</title>
    <base href="${window.location.origin}/">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:210mm; }
      body {
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;
        color:#111;
        background:white;
        padding:18mm 14mm 14mm 14mm;
      }
      @page { size:A4 portrait; margin:0; }
      @media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
      #invoice-print-wrap {
        width: 100% !important;
        max-width: 100% !important;
        min-height: calc(297mm - 32mm) !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        font-size: 9.5pt !important;
        display: flex !important;
        flex-direction: column !important;
      }
      #invoice-print-wrap table { width:100%; font-size:9pt !important; }
      #invoice-print-wrap p, #invoice-print-wrap td, #invoice-print-wrap th { line-height:1.4 !important; }
      #invoice-print-wrap img { max-height:42px !important; width:auto !important; object-fit:contain; }
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

      {/* ── En-tête ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Factures</h1>
          <p style={S.sub}>{factures.length} facture{factures.length !== 1 ? 's' : ''} · {factures.filter(f=>f.statut==='payee').length} payée{factures.filter(f=>f.statut==='payee').length!==1?'s':''}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowSettings(v => !v)} style={{ ...S.btnSecondary, display:'flex', alignItems:'center', gap:'0.4rem' }}>{Ico.settings()} Mes infos</button>
          <button onClick={openCreate} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'0.4rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Nouvelle facture</button>
        </div>
      </div>

      {/* ── Paramètres coach ── */}
      {showSettings && (
        <div style={S.card}>
          <p style={S.sectionTitle}>Mes informations (apparaissent sur chaque facture)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              { key: 'facture_nom',           label: 'Nom / Raison sociale',  placeholder: 'Arthur Wehrey' },
              { key: 'facture_activite',       label: 'Activité',              placeholder: 'Préparateur physique' },
              { key: 'facture_adresse',        label: 'Adresse',               placeholder: '41 rue Fénelon, 31200 Toulouse' },
              { key: 'facture_siret',          label: 'SIRET',                 placeholder: '106 026 883 00012' },
              { key: 'facture_iban',           label: 'IBAN (virement)',       placeholder: 'FR76 3000…' },
              { key: 'facture_email',          label: 'Email',                 placeholder: 'wehrey.arthur@gmail.com' },
              { key: 'facture_numero_debut',   label: 'Décalage numérotation (si factures existantes avant l\'app)', placeholder: '0' },
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
          <button onClick={saveAllSettings} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'0.4rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sauvegarder</button>
        </div>
      )}

      {/* ── Formulaire création / édition ── */}
      {showForm && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ ...S.sectionTitle, margin: 0 }}>
              {editingId ? 'Modifier la facture' : `Nouvelle facture — N° ${nextNumero()}`}
            </p>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} style={S.btnClose}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ gridColumn: form.dest_manuel ? '1 / -1' : undefined }}>
              <label style={S.label}>Facturer à</label>
              {/* Toggle client enregistré / manuel */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => { setForm(f => ({ ...f, dest_manuel: false })); setSelectedGroupId(null) }}
                  style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.3rem 0.75rem', display:'flex', alignItems:'center', gap:'0.35rem', background: !form.dest_manuel ? '#333' : 'white', color: !form.dest_manuel ? '#e4f816' : '#374151', borderColor: !form.dest_manuel ? '#333' : '#e5e7eb' }}
                >{Ico.person()} Client enregistré</button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, dest_manuel: true, client_id: '' }))}
                  style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.3rem 0.75rem', display:'flex', alignItems:'center', gap:'0.35rem', background: form.dest_manuel ? '#333' : 'white', color: form.dest_manuel ? '#e4f816' : '#374151', borderColor: form.dest_manuel ? '#333' : '#e5e7eb' }}
                >{Ico.building()} Club / Autre</button>
              </div>

              {!form.dest_manuel ? (
                <>
                  <select
                    value={selectedGroupId ? `group:${selectedGroupId}` : (form.client_id || '')}
                    onChange={e => {
                      const val = e.target.value
                      if (val.startsWith('group:')) {
                        setSelectedGroupId(val.replace('group:', ''))
                        setForm(f => ({ ...f, client_id: '' }))
                      } else {
                        setSelectedGroupId(null)
                        setForm(f => ({ ...f, client_id: val }))
                      }
                    }}
                    style={S.input}
                  >
                    <option value="">— Aucun / Particulier —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                    ))}
                    {categories.length > 0 && (
                      <optgroup label="── Groupes / Équipes ──">
                        {categories.map(cat => (
                          <option key={cat.id} value={`group:${cat.id}`}>{cat.nom} (groupe)</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {selectedGroupId && (
                    <select
                      value={form.client_id || ''}
                      onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                      style={{ ...S.input, marginTop: '0.4rem' }}
                    >
                      <option value="">— Choisir un joueur —</option>
                      {clients.filter(c => c.categorie_id === selectedGroupId).map(c => (
                        <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                      ))}
                    </select>
                  )}
                </>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                  <div>
                    <label style={{ ...S.label, marginTop: 0 }}>Nom / Club *</label>
                    <input
                      value={form.dest_nom}
                      onChange={e => setForm(f => ({ ...f, dest_nom: e.target.value }))}
                      placeholder="Ex : FC Toulouse, M. Dupont…"
                      style={S.input}
                    />
                  </div>
                  <div>
                    <label style={{ ...S.label, marginTop: 0 }}>Adresse</label>
                    <input
                      value={form.dest_adresse}
                      onChange={e => setForm(f => ({ ...f, dest_adresse: e.target.value }))}
                      placeholder="Ex : 12 rue des Sports, 31000 Toulouse"
                      style={S.input}
                    />
                  </div>
                  <div>
                    <label style={{ ...S.label, marginTop: 0 }}>SIRET (optionnel)</label>
                    <input
                      value={form.dest_siret}
                      onChange={e => setForm(f => ({ ...f, dest_siret: e.target.value }))}
                      placeholder="Ex : 123 456 789 00012"
                      style={S.input}
                    />
                  </div>
                </div>
              )}
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

          {/* Preset prestations */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={S.label}>Ajouter une prestation prédéfinie</label>
            <select
              value=""
              onChange={e => {
                if (!e.target.value) return
                const [desc, prix] = e.target.value.split('||')
                setForm(f => ({
                  ...f,
                  lignes: [...f.lignes.filter(l => l.description.trim()), { id: Math.random().toString(36).slice(2), description: desc, quantite: 1, prix: parseFloat(prix) }]
                }))
                e.target.value = ''
              }}
              style={{ ...S.input, color: '#374151', cursor: 'pointer' }}
            >
              <option value="">— Choisir une prestation —</option>
              <optgroup label="Préparation physique">
                <option value="Préparation physique — sans engagement||89">Préparation physique — sans engagement — 89 €/mois</option>
                <option value="Préparation physique — 3 mois||79">Préparation physique — 3 mois — 79 €/mois</option>
                <option value="Préparation physique — 6 mois||69">Préparation physique — 6 mois — 69 €/mois</option>
                <option value="Préparation physique — mois d'essai||49">Préparation physique — mois d'essai — 49 €</option>
              </optgroup>
              <optgroup label="Coaching remise en forme">
                <option value="Coaching remise en forme — sans engagement||79">Coaching remise en forme — sans engagement — 79 €/mois</option>
                <option value="Coaching remise en forme — 3 mois||69">Coaching remise en forme — 3 mois — 69 €/mois</option>
                <option value="Coaching remise en forme — 6 mois||59">Coaching remise en forme — 6 mois — 59 €/mois</option>
                <option value="Coaching remise en forme — mois d'essai||49">Coaching remise en forme — mois d'essai — 49 €</option>
              </optgroup>
              <optgroup label="Autre">
                <option value="Programme one-shot||30">Programme one-shot — 30 €</option>
              </optgroup>
            </select>
          </div>

          {/* Lignes */}
          <p style={S.label}>Prestations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {form.lignes.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={l.description}
                  onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j===i ? { ...x, description: e.target.value } : x) }))}
                  placeholder="Ex : Coaching mensuel — Juin 2026"
                  style={{ ...S.input, flex: '3 1 180px' }}
                />
                <input
                  type="number" value={l.quantite} min="1"
                  onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j===i ? { ...x, quantite: e.target.value } : x) }))}
                  style={{ ...S.input, width: 72, flex: '0 0 72px' }} placeholder="Qté"
                />
                <input
                  type="number" value={l.prix} min="0" step="0.01"
                  onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j===i ? { ...x, prix: e.target.value } : x) }))}
                  style={{ ...S.input, width: 96, flex: '0 0 96px' }} placeholder="Prix €"
                />
                <span style={{ minWidth: 78, textAlign: 'right', fontWeight: '700', fontSize: '0.9rem', color: '#111' }}>
                  {((parseFloat(l.prix)||0) * (parseFloat(l.quantite)||1)).toFixed(2)} €
                </span>
                {form.lignes.length > 1 && (
                  <button onClick={() => setForm(f => ({ ...f, lignes: f.lignes.filter((_, j) => j!==i) }))} style={S.btnClose}>✕</button>
                )}
              </div>
            ))}
            <button
              onClick={() => setForm(f => ({ ...f, lignes: [...f.lignes, newLigne()] }))}
              style={{ ...S.btnSecondary, alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.35rem 0.7rem', display:'flex', alignItems:'center', gap:'0.3rem' }}
            ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ligne</button>
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <div style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.75rem 1.25rem', textAlign: 'right' }}>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '900', color: '#111', margin: 0 }}>
                {totalFacture(form.lignes).toFixed(2)} €
              </p>
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0.2rem 0 0' }}>TVA non applicable — Art. 293B CGI</p>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={S.label}>Notes (optionnel)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Conditions de règlement, informations complémentaires…"
              rows={2}
              style={{ ...S.input, width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} style={S.btnSecondary}>Annuler</button>
            <button onClick={submitForm} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {editingId ? 'Enregistrer les modifications' : 'Créer la facture'}
            </button>
          </div>
        </div>
      )}

      {/* ── Liste ── */}
      {factures.length === 0 && !showForm ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '3rem' }}>
          <p style={{ marginBottom: '0.75rem', color: '#d1d5db' }}>{Ico.invoice(36)}</p>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1.25rem' }}>Aucune facture pour l'instant.</p>
          <button onClick={openCreate} style={{ ...S.btnPrimary, display:'inline-flex', alignItems:'center', gap:'0.4rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Créer ma première facture</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {factures.map(f => {
            const isOpen = printId === f.id
            return (
              <div key={f.id} style={{ ...S.card, padding: '1rem 1.25rem', border: isOpen ? '1.5px solid #333' : '1.5px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Numéro + client */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111' }}>N° {f.numero}</span>
                      <span style={{ ...S.badge, background: STATUTS[f.statut]?.bg, color: STATUTS[f.statut]?.color }}>
                        {STATUTS[f.statut]?.label}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>
                      {f.clients ? `${f.clients.prenom} ${f.clients.nom}` : 'Sans client'} · {new Date(f.date_emission + 'T12:00:00').toLocaleDateString('fr-FR')}
                      {f.date_echeance && ` · Échéance ${new Date(f.date_echeance + 'T12:00:00').toLocaleDateString('fr-FR')}`}
                    </p>
                  </div>

                  {/* Montant */}
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <p style={{ margin: 0, fontWeight: '800', fontSize: '1.1rem', color: '#111' }}>{totalFacture(f.lignes).toFixed(2)} €</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>{(f.lignes||[]).filter(l=>l.description).length} prestation{f.lignes?.length!==1?'s':''}</p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <select
                      value={f.statut}
                      onChange={e => updateStatut(f.id, e.target.value)}
                      style={{ ...S.input, padding: '0.3rem 0.5rem', fontSize: '0.78rem', width: 'auto', cursor: 'pointer' }}
                    >
                      <option value="brouillon">Brouillon</option>
                      <option value="envoyee">Envoyée</option>
                      <option value="payee">Payée</option>
                    </select>
                    <button
                      onClick={() => { openEdit(f); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                      style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.3rem 0.65rem', display:'flex', alignItems:'center', gap:'0.35rem' }}
                    >{Ico.edit()} Modifier</button>
                    <button
                      onClick={() => setPrintId(isOpen ? null : f.id)}
                      style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.3rem 0.65rem', display:'flex', alignItems:'center', gap:'0.35rem', background: isOpen ? '#333' : 'white', color: isOpen ? '#e4f816' : '#374151', borderColor: isOpen ? '#333' : '#e5e7eb' }}
                    >{Ico.print()} {isOpen ? 'Fermer' : 'Aperçu PDF'}</button>
                    <button
                      onClick={() => deleteFacture(f.id)}
                      style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.3rem 0.65rem', color: '#dc2626', borderColor: '#fecaca', display:'flex', alignItems:'center' }}
                    >{Ico.trash()}</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Aperçu + impression ── */}
      {facturePrint && (
        <div style={{ ...S.card, marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p style={{ ...S.sectionTitle, margin: 0 }}>Aperçu — Facture N° {facturePrint.numero}</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handlePrint} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'0.4rem' }}>{Ico.print()} Imprimer / Exporter PDF</button>
              <button onClick={() => setPrintId(null)} style={S.btnSecondary}>✕ Fermer</button>
            </div>
          </div>

          {/* Zone imprimable */}
          <div ref={printRef}>
            <InvoiceTemplate facture={facturePrint} settings={settings} total={totalFacture(facturePrint.lignes)} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Composant facture imprimable ─────────────────────────────────────── */
function InvoiceTemplate({ facture, settings, total }) {
  const nomCoach    = settings.facture_nom      || 'Arthur Wehrey'
  const activite    = settings.facture_activite || 'Préparateur physique'
  const adresse     = settings.facture_adresse  || ''
  const siret       = settings.facture_siret    || ''
  const emailCoach  = settings.facture_email    || ''
  const iban        = settings.facture_iban     || ''

  const dateEmission = new Date(facture.date_emission + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })
  const dateEcheance = facture.date_echeance
    ? new Date(facture.date_echeance + 'T12:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })
    : null

  return (
    <div id="invoice-print-wrap" style={INV.wrap}>
      {/* ── Bandeau supérieur ── */}
      <div style={INV.topBand}>
        <div style={INV.topLeft}>
          <img src="/logo-noir.png" alt="AWprepa" style={{ height: 42, width: 'auto', marginBottom: 6 }} onError={e => e.target.style.display='none'} />
          <p style={INV.nomCoach}>{nomCoach}</p>
          <p style={INV.sm}>{activite}</p>
        </div>
        <div style={INV.topRight}>
          <p style={INV.factureTitle}>FACTURE</p>
          <p style={INV.numero}>N° {facture.numero}</p>
        </div>
      </div>

      {/* ── Infos coach + client ── */}
      <div style={INV.metaRow}>
        {/* Coach */}
        <div style={INV.metaBox}>
          <p style={INV.metaLabel}>Émetteur</p>
          {adresse  && <p style={INV.sm}>{adresse}</p>}
          {siret    && <p style={INV.sm}>SIRET : {siret}</p>}
          {emailCoach && <p style={INV.sm}>{emailCoach}</p>}
        </div>
        {/* Client */}
        <div style={INV.metaBox}>
          <p style={INV.metaLabel}>Facturé à</p>
          {facture.destinataire
            ? <>
                <p style={{ ...INV.sm, fontWeight: 700, color: '#111' }}>{facture.destinataire.nom}</p>
                {facture.destinataire.adresse && <p style={INV.sm}>{facture.destinataire.adresse}</p>}
                {facture.destinataire.siret && <p style={INV.sm}>SIRET : {facture.destinataire.siret}</p>}
              </>
            : facture.clients
              ? <>
                  <p style={{ ...INV.sm, fontWeight: 700, color: '#111' }}>{facture.clients.prenom} {facture.clients.nom}</p>
                  {facture.clients.email && <p style={INV.sm}>{facture.clients.email}</p>}
                </>
              : <p style={{ ...INV.sm, color: '#9ca3af', fontStyle: 'italic' }}>Non renseigné</p>
          }
        </div>
        {/* Dates */}
        <div style={INV.metaBox}>
          <p style={INV.metaLabel}>Dates</p>
          <p style={INV.sm}>Émise le <strong>{dateEmission}</strong></p>
          {dateEcheance && <p style={{ ...INV.sm, color: dateEcheance ? '#dc2626' : undefined }}>Échéance : <strong>{dateEcheance}</strong></p>}
        </div>
      </div>

      {/* ── Tableau prestations ── */}
      <table style={INV.table}>
        <thead>
          <tr style={{ background: '#111' }}>
            <th style={{ ...INV.th, textAlign: 'left', width: '55%' }}>Description</th>
            <th style={{ ...INV.th, textAlign: 'center', width: '12%' }}>Qté</th>
            <th style={{ ...INV.th, textAlign: 'right', width: '16%' }}>Prix unit.</th>
            <th style={{ ...INV.th, textAlign: 'right', width: '17%' }}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {(facture.lignes || []).filter(l => l.description).map((l, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={INV.td}>{l.description}</td>
              <td style={{ ...INV.td, textAlign: 'center' }}>{l.quantite}</td>
              <td style={{ ...INV.td, textAlign: 'right' }}>{parseFloat(l.prix).toFixed(2)} €</td>
              <td style={{ ...INV.td, textAlign: 'right', fontWeight: 700 }}>
                {((parseFloat(l.prix)||0) * (parseFloat(l.quantite)||1)).toFixed(2)} €
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Total ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0.75rem 0 1.5rem' }}>
        <div style={INV.totalBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '3rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Sous-total HT</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{total.toFixed(2)} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '3rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>TVA</span>
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Non applicable</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '3rem', borderTop: '2px solid #111', paddingTop: '0.5rem' }}>
            <span style={{ fontWeight: 900, fontSize: '1rem' }}>TOTAL TTC</span>
            <span style={{ fontWeight: 900, fontSize: '1.1rem' }}>{total.toFixed(2)} €</span>
          </div>
          <p style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: '0.3rem', textAlign: 'right' }}>
            TVA non applicable — Article 293 B du CGI
          </p>
        </div>
      </div>

      {/* ── Règlement ── */}
      {iban && (
        <div style={INV.infoSection}>
          <p style={INV.infoTitle}>Règlement par virement bancaire</p>
          <p style={INV.sm}>IBAN : <strong>{iban}</strong></p>
          <p style={INV.sm}>Référence obligatoire : <strong>Facture {facture.numero}{facture.clients ? ` — ${facture.clients.prenom} ${facture.clients.nom}` : ''}</strong></p>
        </div>
      )}

      {/* ── Notes ── */}
      {facture.notes && (
        <div style={INV.infoSection}>
          <p style={INV.infoTitle}>Notes</p>
          <p style={INV.sm}>{facture.notes}</p>
        </div>
      )}

      {/* Spacer — pousse le pied de page en bas */}
      <div style={{ flex: 1 }} />

      {/* ── Pied de page ── */}
      <div style={INV.footer}>
        <p style={INV.footerTxt}>{nomCoach}{activite ? ` · ${activite}` : ''}</p>
        {siret && <p style={INV.footerTxt}>SIRET {siret}</p>}
        {adresse && <p style={INV.footerTxt}>{adresse}</p>}
        {emailCoach && <p style={INV.footerTxt}>{emailCoach}</p>}
      </div>

      {/* ── Mentions légales ── */}
      <div style={INV.legal}>
        <p style={INV.legalTxt}>TVA non applicable — Article 293 B du CGI.</p>
        <p style={INV.legalTxt}>En cas de retard de paiement, des pénalités de retard au taux de 3 fois le taux d'intérêt légal en vigueur seront appliquées, ainsi qu'une indemnité forfaitaire de recouvrement de 40 € (art. L.441-10 du Code de commerce). Pas d'escompte pour paiement anticipé.</p>
      </div>
    </div>
  )
}

/* ── Styles page ── */
const S = {
  page:        { padding: '1.5rem', maxWidth: 960, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' },
  title:       { fontSize: '1.5rem', fontWeight: '900', color: '#111', margin: 0 },
  sub:         { fontSize: '0.82rem', color: '#9ca3af', margin: '0.2rem 0 0' },
  card:        { background: 'white', borderRadius: 16, padding: '1.25rem 1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  sectionTitle:{ fontSize: '0.72rem', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.875rem' },
  label:       { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' },
  input:       { width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', color: '#333', outline: 'none', boxSizing: 'border-box', background: 'white' },
  btnPrimary:  { background: '#333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.65rem 1.25rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary:{ background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnClose:    { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem', flexShrink: 0 },
  badge:       { padding: '0.15rem 0.55rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: '700' },
}

/* ── Styles facture imprimable ── */
const INV = {
  wrap:       { padding: '2rem 2rem 2rem 1.25rem', background: 'white', maxWidth: 740, margin: '0 auto', fontSize: '0.88rem', color: '#111', border: '1px solid #e5e7eb', borderRadius: 12, display: 'flex', flexDirection: 'column', minHeight: '265mm' },
  topBand:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '2px solid #111' },
  topLeft:    { display: 'flex', flexDirection: 'column' },
  topRight:   { textAlign: 'right' },
  nomCoach:   { fontWeight: 900, fontSize: '1.05rem', color: '#111', margin: 0 },
  factureTitle:{ fontWeight: 900, fontSize: '2rem', color: '#111', margin: '0 0 0.1rem', letterSpacing: '-1.5px' },
  numero:     { fontSize: '0.9rem', color: '#6b7280', margin: 0, fontWeight: 600 },
  metaRow:    { display: 'flex', gap: '1.5rem', marginBottom: '1.75rem', flexWrap: 'wrap' },
  metaBox:    { flex: '1 1 160px' },
  metaLabel:  { fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.35rem' },
  sm:         { fontSize: '0.82rem', color: '#4b5563', margin: '0.12rem 0 0', lineHeight: 1.5 },
  table:      { width: '100%', borderCollapse: 'collapse', marginBottom: 0 },
  th:         { padding: '0.55rem 0.75rem', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'white' },
  td:         { padding: '0.6rem 0.75rem', fontSize: '0.86rem', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  totalBox:   { background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.875rem 1.25rem', minWidth: 240 },
  infoSection:{ borderTop: '1px solid #e5e7eb', paddingTop: '0.875rem', marginBottom: '0.875rem' },
  infoTitle:  { fontSize: '0.68rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.3rem' },
  footer:     { borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', marginTop: '0', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' },
  footerTxt:  { fontSize: '0.68rem', color: '#9ca3af', margin: 0, textAlign: 'center' },
  legal:      { borderTop: '1px solid #f3f4f6', paddingTop: '0.6rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  legalTxt:   { fontSize: '0.62rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 },
}
