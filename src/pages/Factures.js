import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { supabase } from '../supabase'
import ClientPicker from '../components/ClientPicker'

/* ── Icônes SVG ─────────────────────────────────────────────────────────── */
const Ico = {
  settings: (s=15) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  edit:     (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  print:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  trash:    (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  invoice:  (s=36) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="8" y1="9" x2="10" y2="9"/></svg>,
  person:   (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.5 8.5 0 0 1 13 0"/></svg>,
  building: (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="9" width="18" height="13" rx="1"/><path d="M8 9V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>,
  chevron:  (s=11) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  plus:     (s=14) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
}

const STATUTS = {
  brouillon: { label: 'Brouillon', bg: '#f3f4f6', color: '#6b7280' },
  envoyee:   { label: 'Envoyée',   bg: '#eff6ff', color: '#1d4ed8' },
  payee:     { label: 'Payée',     bg: '#f0fdf4', color: '#15803d' },
}

// Statut d'échéance (paiements.statut) — mêmes couleurs que partout ailleurs dans l'app
const PAY_OK   = { key: 'ok',   label: 'À jour',     color: '#15803d', bg: '#dcfce7' }
const PAY_SOON = { key: 'soon', label: 'Bientôt',    color: '#b45309', bg: '#fef3c7' }
const PAY_LATE = { key: 'late', label: 'En retard',  color: '#b91c1c', bg: '#fee2e2' }
const PAY_STATUTS = [PAY_OK, PAY_SOON, PAY_LATE]
const SOON_JOURS = 7 // échéance à moins de 7 jours → "Bientôt"

const SETTINGS_KEYS = ['facture_nom', 'facture_adresse', 'facture_siret', 'facture_iban', 'facture_email', 'facture_numero_debut', 'facture_activite']

function newLigne() { return { id: Math.random().toString(36).slice(2), description: '', quantite: 1, prix: 0 } }

const EMPTY_FORM = () => ({
  client_id: '', date_emission: new Date().toISOString().slice(0, 10),
  date_echeance: '', notes: '', lignes: [newLigne()],
  dest_manuel: false, dest_nom: '', dest_adresse: '', dest_siret: '', dest_email: '',
})

const EMPTY_MANUAL = () => ({ client_id: '', montant: '', description: '', date_echeance: new Date().toISOString().slice(0, 10) })

function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }
function initials(prenom, nom) { return `${(prenom||'?')[0]}${(nom||'?')[0]}`.toUpperCase() }

// Regroupe les lignes `paiements` par client et calcule le statut global de
// chacun (à jour / bientôt / en retard) à partir de sa plus proche échéance
// non payée — c'est tout le "système" : rien à entretenir à la main.
function buildRows(paiements) {
  const byClient = {}
  paiements.forEach(p => { if (p.client_id) (byClient[p.client_id] ||= []).push(p) })
  const today = new Date().toISOString().slice(0, 10)

  const rows = Object.values(byClient).map(rows => {
    const client = rows[0].clients
    const sorted = [...rows].sort((a, b) => (a.date_echeance || '9999-99-99').localeCompare(b.date_echeance || '9999-99-99'))
    const pending = sorted.filter(r => r.statut !== 'paye')
    const paid = [...rows].filter(r => r.statut === 'paye').sort((a, b) => (b.date_paiement || '').localeCompare(a.date_paiement || ''))
    const next = pending[0] || null
    const last = paid[0] || null
    const offre = next?.contrats || last?.contrats || null

    let statusKey = 'ok'
    if (next) {
      const late = next.statut === 'en_retard' || (next.date_echeance && next.date_echeance < today)
      if (late) statusKey = 'late'
      else if (next.date_echeance) {
        const jours = Math.ceil((new Date(next.date_echeance) - new Date(today)) / 86400000)
        statusKey = jours <= SOON_JOURS ? 'soon' : 'ok'
      }
    }

    return {
      clientId: client?.id, client,
      history: [...rows].sort((a, b) => (b.date_echeance || b.date_paiement || '').localeCompare(a.date_echeance || a.date_paiement || '')),
      next, last, offre, statusKey,
      montant: next?.montant ?? last?.montant ?? 0,
    }
  })

  const order = { late: 0, soon: 1, ok: 2 }
  return rows.sort((a, b) => order[a.statusKey] - order[b.statusKey] || (a.client?.nom || '').localeCompare(b.client?.nom || ''))
}

export default function Factures() {
  const [paiements, setPaiements]         = useState([])
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
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [teamGroupes, setTeamGroupes]     = useState([])
  const [teamMemberIds, setTeamMemberIds] = useState(new Set())
  const printRef = useRef()

  // ── Tableau paiements ───────────────────────────────────────────────────
  const [filter, setFilter]               = useState('tous')
  const [expanded, setExpanded]           = useState(null) // clientId déplié
  const [showManual, setShowManual]       = useState(false)
  const [manualForm, setManualForm]       = useState(EMPTY_MANUAL())
  const [manualSaving, setManualSaving]   = useState(false)
  const [editingPaiement, setEditingPaiement] = useState(null) // ligne en édition (modal léger)

  useEffect(() => { fetchAll() }, [])

  const loadPaiements = useCallback(async () => {
    const { data } = await supabase
      .from('paiements')
      .select('*, clients(id, prenom, nom, email), contrats(formule_label, engagement_mois, prix_mensuel)')
      .order('date_echeance', { ascending: false })
    setPaiements(data || [])
  }, [])

  // Filet de sécurité : une échéance "en_attente" dont la date est dépassée
  // passe en "en_retard" (le statut affiché, lui, est de toute façon recalculé
  // en direct depuis la date dans buildRows — ceci ne fait que garder la
  // donnée en base cohérente pour les autres vues qui liraient `statut`).
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    paiements.forEach(async p => {
      if (p.statut === 'en_attente' && p.date_echeance && p.date_echeance < today) {
        await supabase.from('paiements').update({ statut: 'en_retard' }).eq('id', p.id)
      }
    })
  }, [paiements])

  async function fetchAll() {
    const [{ data: f }, { data: c }, { data: s }, { data: cats }, { data: pays }, { data: gs }, { data: membres }] = await Promise.all([
      supabase.from('factures').select('*, clients(prenom, nom, email)').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, prenom, nom, email, categorie_id').order('nom'),
      supabase.from('app_settings').select('key, value').in('key', SETTINGS_KEYS),
      supabase.from('categories').select('id, nom').order('nom'),
      supabase.from('paiements').select('*, clients(id, prenom, nom, email), contrats(formule_label, engagement_mois, prix_mensuel)').order('date_echeance', { ascending: false }),
      supabase.from('groupes').select('id, nom, parent_id').order('nom'),
      supabase.from('groupe_membres').select('client_id, groupe_id'),
    ])
    setFactures(f || [])
    setClients(c || [])
    setCategories(cats || [])
    setPaiements(pays || [])

    const allGroupes = gs || []
    const clientById = {}
    ;(c || []).forEach(cl => { clientById[cl.id] = cl })
    const membresParGroupe = {}
    ;(membres || []).forEach(m => { (membresParGroupe[m.groupe_id] ||= []).push(m.client_id) })
    const racineDe = (gid) => allGroupes.find(x => x.id === gid)?.parent_id || gid
    const membresIdsParRacine = {}
    Object.entries(membresParGroupe).forEach(([gid, ids]) => {
      const set = (membresIdsParRacine[racineDe(gid)] ||= new Set())
      ids.forEach(id => set.add(id))
    })
    const groupesResult = allGroupes.filter(g => !g.parent_id).map(g => ({
      id: g.id, nom: g.nom,
      membres: [...(membresIdsParRacine[g.id] || [])].map(id => clientById[id]).filter(Boolean),
    })).filter(g => g.membres.length > 0)
    setTeamGroupes(groupesResult)
    setTeamMemberIds(new Set((membres || []).map(m => m.client_id)))

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
    const yy = new Date().getFullYear().toString().slice(2)
    const offset = parseInt(settings.facture_numero_debut || '0')
    const yearCount = factures.filter(f => f.numero?.startsWith(yy)).length
    return yy + String(offset + yearCount + 1).padStart(3, '0')
  }

  function openCreate(clientId) {
    setEditingId(null)
    setForm({ ...EMPTY_FORM(), client_id: clientId || '' })
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
      dest_email:    f.destinataire?.email    || '',
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
                       ? { nom: form.dest_nom.trim(), adresse: form.dest_adresse.trim(), siret: form.dest_siret.trim(), email: form.dest_email.trim() }
                       : null,
    }

    if (editingId) {
      const { data, error } = await supabase.from('factures')
        .update(payload)
        .eq('id', editingId)
        .select('*, clients(prenom, nom, email)').single()
      if (error) { alert(error.message); return }
      setFactures(prev => prev.map(f => f.id === editingId ? data : f))
      setPrintId(editingId)
    } else {
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

  async function updateStatutFacture(id, statut) {
    const { error } = await supabase.from('factures').update({ statut }).eq('id', id)
    if (error) { alert('Erreur mise à jour statut : ' + error.message); return }
    setFactures(prev => prev.map(f => f.id === id ? { ...f, statut } : f))
  }

  async function deleteFacture(id) {
    if (!window.confirm('Supprimer cette facture ?')) return
    const { error } = await supabase.from('factures').delete().eq('id', id)
    if (error) { alert('Erreur suppression : ' + error.message); return }
    setFactures(prev => prev.filter(f => f.id !== id))
    if (printId === id) setPrintId(null)
    if (editingId === id) { setShowForm(false); setEditingId(null) }
  }

  function totalFacture(lignes) {
    return (lignes || []).reduce((s, l) => s + (parseFloat(l.prix) || 0) * (parseFloat(l.quantite) || 1), 0)
  }

  // ── Échéances / paiements ────────────────────────────────────────────────
  async function marquerPaye(p) {
    await supabase.from('paiements').update({ statut: 'paye', date_paiement: new Date().toISOString().slice(0, 10) }).eq('id', p.id)
    loadPaiements()
  }

  async function marquerNonPaye(p) {
    await supabase.from('paiements').update({ statut: 'en_attente', date_paiement: null }).eq('id', p.id)
    loadPaiements()
  }

  function openManual(clientId) {
    setManualForm({ ...EMPTY_MANUAL(), client_id: clientId || '' })
    setShowManual(true)
  }

  async function saveManual() {
    if (!manualForm.client_id || !manualForm.montant) return
    setManualSaving(true)
    await supabase.from('paiements').insert({
      client_id: manualForm.client_id,
      montant: parseFloat(manualForm.montant),
      description: manualForm.description || null,
      date_echeance: manualForm.date_echeance || null,
      statut: 'en_attente',
    })
    setManualSaving(false)
    setShowManual(false)
    loadPaiements()
  }

  async function saveEditPaiement() {
    if (!editingPaiement) return
    await supabase.from('paiements').update({
      montant: parseFloat(editingPaiement.montant),
      description: editingPaiement.description || null,
      date_echeance: editingPaiement.date_echeance || null,
    }).eq('id', editingPaiement.id)
    setEditingPaiement(null)
    loadPaiements()
  }

  async function deletePaiementLigne(id) {
    if (!window.confirm('Supprimer cette ligne ?')) return
    await supabase.from('paiements').delete().eq('id', id)
    loadPaiements()
  }

  function buildEmailHtml({ prenom, numero, total, dateEmission, iban, nomDest, nomCoach, activite, emailCoach }) {
    const ibanBlock = iban ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin:0 0 28px 0;">
        <tr><td style="padding:16px 22px;">
          <p style="color:#1e40af;font-size:13px;font-weight:700;margin:0 0 6px 0;font-family:sans-serif;">Règlement par virement bancaire</p>
          <p style="color:#374151;font-size:13px;margin:0 0 3px 0;font-family:sans-serif;">IBAN : <strong>${iban}</strong></p>
          <p style="color:#374151;font-size:13px;margin:0;font-family:sans-serif;">Référence : <strong>Facture ${numero}${nomDest ? ` — ${nomDest}` : ''}</strong></p>
        </td></tr>
      </table>` : ''

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:40px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

    <tr><td style="background:#1a1a1a;border-radius:14px 14px 0 0;padding:28px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:20px;font-weight:800;color:#e4f816;letter-spacing:-0.5px;font-family:sans-serif;">AWprepa</p>
            <p style="margin:4px 0 0;font-size:13px;color:#9ca3af;font-family:sans-serif;">${activite}</p>
          </td>
          <td align="right">
            <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-family:sans-serif;">Facture</p>
            <p style="margin:2px 0 0;font-size:18px;font-weight:800;color:#ffffff;font-family:sans-serif;">n°${numero}</p>
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="background:#ffffff;padding:36px 36px 28px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">

      <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.65;font-family:sans-serif;">Bonjour${prenom ? ` <strong style="color:#111;">${prenom}</strong>` : ''},</p>

      <p style="font-size:15px;color:#374151;margin:0 0 28px;line-height:1.65;font-family:sans-serif;">
        Veuillez trouver ci-joint la facture <strong style="color:#111;">n°${numero}</strong> d'un montant de <strong style="color:#111;">${total} €</strong>, établie le ${dateEmission}.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin:0 0 28px 0;">
        <tr><td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#6b7280;font-size:13px;font-family:sans-serif;padding-bottom:10px;">N° de facture</td>
              <td align="right" style="font-weight:700;color:#111;font-size:14px;font-family:sans-serif;padding-bottom:10px;">${numero}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;font-family:sans-serif;padding-bottom:10px;border-top:1px solid #f0f0f0;padding-top:10px;">Date d'émission</td>
              <td align="right" style="color:#374151;font-size:14px;font-family:sans-serif;border-top:1px solid #f0f0f0;padding-top:10px;padding-bottom:10px;">${dateEmission}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;font-family:sans-serif;border-top:1px solid #f0f0f0;padding-top:10px;">Montant total TTC</td>
              <td align="right" style="font-weight:800;color:#111;font-size:20px;font-family:sans-serif;border-top:1px solid #f0f0f0;padding-top:10px;">${total} €</td>
            </tr>
          </table>
        </td></tr>
      </table>

      ${ibanBlock}

      <p style="font-size:15px;color:#374151;margin:0 0 28px;line-height:1.65;font-family:sans-serif;">
        N'hésitez pas à me contacter si vous avez la moindre question.
      </p>

      <table cellpadding="0" cellspacing="0" style="border-top:1px solid #f3f4f6;padding-top:20px;margin-top:4px;width:100%;">
        <tr>
          <td style="width:44px;vertical-align:top;">
            <div style="width:36px;height:36px;border-radius:50%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;">
              <span style="color:#e4f816;font-weight:800;font-size:14px;font-family:sans-serif;">${nomCoach.charAt(0)}</span>
            </div>
          </td>
          <td style="vertical-align:top;padding-left:10px;">
            <p style="margin:0;font-weight:700;font-size:14px;color:#111;font-family:sans-serif;">${nomCoach}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#6b7280;font-family:sans-serif;">${activite}</p>
            ${emailCoach ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;font-family:sans-serif;">${emailCoach}</p>` : ''}
          </td>
        </tr>
      </table>

    </td></tr>

    <tr><td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;padding:18px 36px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;font-family:sans-serif;">
        ${nomCoach} · ${activite} · TVA non applicable, art. 293 B du CGI
      </p>
    </td></tr>

  </table>

</td></tr>
</table>
</body></html>`
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

  const rows = buildRows(paiements)
  const counts = { tous: rows.length, ok: 0, soon: 0, late: 0 }
  rows.forEach(r => { counts[r.statusKey]++ })
  const visibleRows = filter === 'tous' ? rows : rows.filter(r => r.statusKey === filter)

  return (
    <div style={S.page}>

      {/* ── En-tête ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Paiements</h1>
          <p style={S.sub}>Calculé automatiquement depuis les contrats signés.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowSettings(v => !v)} style={{ ...S.btnSecondary, display:'flex', alignItems:'center', gap:'0.4rem' }}>{Ico.settings()} Mes infos</button>
          <button onClick={() => openManual(null)} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'0.4rem' }}>{Ico.plus()} Paiement manuel</button>
        </div>
      </div>

      {/* ── Paramètres coach (pour les factures PDF) ── */}
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

      {/* ── Pastilles = filtre ── */}
      <div style={S.stats}>
        <button onClick={() => setFilter('tous')} style={{ ...S.stat, ...(filter === 'tous' ? S.statActive : {}) }}>
          <div style={{ ...S.statN, color: '#111' }}>{counts.tous}</div>
          <div style={S.statL}>Tous les clients</div>
        </button>
        <button onClick={() => setFilter('ok')} style={{ ...S.stat, ...(filter === 'ok' ? S.statActive : {}) }}>
          <div style={{ ...S.statN, color: PAY_OK.color }}>{counts.ok}</div>
          <div style={S.statL}><span style={{ ...S.dot, background: PAY_OK.color }} />{PAY_OK.label}</div>
        </button>
        <button onClick={() => setFilter('soon')} style={{ ...S.stat, ...(filter === 'soon' ? S.statActive : {}) }}>
          <div style={{ ...S.statN, color: PAY_SOON.color }}>{counts.soon}</div>
          <div style={S.statL}><span style={{ ...S.dot, background: PAY_SOON.color }} />{PAY_SOON.label}</div>
        </button>
        <button onClick={() => setFilter('late')} style={{ ...S.stat, ...(filter === 'late' ? S.statActive : {}) }}>
          <div style={{ ...S.statN, color: PAY_LATE.color }}>{counts.late}</div>
          <div style={S.statL}><span style={{ ...S.dot, background: PAY_LATE.color }} />{PAY_LATE.label}</div>
        </button>
      </div>

      {/* ── Tableau ── */}
      {rows.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '3rem' }}>
          <p style={{ marginBottom: '0.75rem', color: '#d1d5db' }}>{Ico.invoice(36)}</p>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1.25rem' }}>Aucun paiement suivi pour l'instant.</p>
          <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Les échéances apparaissent ici automatiquement dès qu'un contrat est signé.</p>
        </div>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Client', 'Offre', 'Montant', 'Dernier paiement', 'Prochaine échéance', 'Statut', ''].map((h, i) => (
                  <th key={h} style={{ ...S.th, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => {
                const st = PAY_STATUTS.find(s => s.key === r.statusKey)
                const isOpen = expanded === r.clientId
                return (
                  <Fragment key={r.clientId}>
                    <tr onClick={() => setExpanded(isOpen ? null : r.clientId)} style={S.tr}>
                      <td style={S.td}>
                        <div style={S.who}>
                          <span style={{ ...S.caret, transform: isOpen ? 'rotate(90deg)' : 'none' }}>{Ico.chevron()}</span>
                          <div style={S.avatar}>{initials(r.client?.prenom, r.client?.nom)}</div>
                          <span style={S.name}>{r.client?.prenom} {r.client?.nom}</span>
                        </div>
                      </td>
                      <td style={{ ...S.td, color: '#6b7280' }}>
                        {r.offre ? `${r.offre.prix_mensuel}€/mois${r.offre.engagement_mois ? ` · ${r.offre.engagement_mois} mois` : ' · sans engagement'}` : '—'}
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, color: '#111' }}>{parseFloat(r.montant).toFixed(0)} €</td>
                      <td style={{ ...S.td, color: '#6b7280' }}>{r.last ? fmtDate(r.last.date_paiement) : '—'}</td>
                      <td style={{ ...S.td, color: '#374151', fontWeight: 600 }}>{r.next ? fmtDate(r.next.date_echeance) : 'Terminé'}</td>
                      <td style={S.td}>
                        <span style={{ ...S.pill, background: st.bg, color: st.color }}><span style={{ ...S.dot, background: 'currentColor' }} />{st.label}</span>
                      </td>
                      <td style={{ ...S.td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        {r.next && (
                          <button onClick={() => marquerPaye(r.next)} style={S.actionBtn}>Marquer payé</button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={S.detailRow}>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div style={S.detailInner}>
                            {r.history.length === 0 ? (
                              <p style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>Pas encore d'historique.</p>
                            ) : r.history.map(p => (
                              <div key={p.id} style={S.hist}>
                                <span>
                                  {p.statut === 'paye'
                                    ? <>Payé <b>{fmtDate(p.date_paiement)}</b></>
                                    : <>Échéance <b>{fmtDate(p.date_echeance)}</b>{p.statut === 'en_retard' && <span style={{ color: PAY_LATE.color, fontWeight: 700 }}> · en retard</span>}</>}
                                  {p.description && <span style={{ color: '#9ca3af' }}> — {p.description}</span>}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                  <span style={{ fontWeight: 700, color: '#111' }}>{parseFloat(p.montant).toFixed(0)} €</span>
                                  {p.statut === 'paye'
                                    ? <button onClick={() => marquerNonPaye(p)} style={S.histLink}>Annuler</button>
                                    : <button onClick={() => marquerPaye(p)} style={S.histLink}>Marquer payé</button>}
                                  <button onClick={() => setEditingPaiement({ ...p })} style={S.histIconBtn}>{Ico.edit(12)}</button>
                                  <button onClick={() => deletePaiementLigne(p.id)} style={{ ...S.histIconBtn, color: '#dc2626' }}>{Ico.trash(12)}</button>
                                </div>
                              </div>
                            ))}
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem' }}>
                              <button onClick={() => openManual(r.clientId)} style={S.histAddBtn}>+ Échéance manuelle</button>
                              <button onClick={() => openCreate(r.clientId)} style={S.histAddBtn}>{Ico.print(12)} Générer une facture PDF</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={S.footnote}>Besoin d'un document officiel pour un client sans contrat dans l'app ? <a onClick={() => openCreate(null)} style={S.footnoteLink}>Générer une facture PDF</a></p>

      {/* ── Modal paiement manuel ── */}
      {showManual && (
        <div style={S.overlay} onClick={() => setShowManual(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Échéance manuelle</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={S.label}>Client *</label>
                <ClientPicker value={manualForm.client_id} onChange={id => setManualForm(p => ({ ...p, client_id: id }))} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Montant (€) *</label>
                  <input style={S.input} type="number" min={0} step={0.01} value={manualForm.montant} onChange={e => setManualForm(p => ({ ...p, montant: e.target.value }))} placeholder="69" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Échéance</label>
                  <input style={S.input} type="date" value={manualForm.date_echeance} onChange={e => setManualForm(p => ({ ...p, date_echeance: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={S.label}>Description (optionnel)</label>
                <input style={S.input} value={manualForm.description} onChange={e => setManualForm(p => ({ ...p, description: e.target.value }))} placeholder="Bilan, programme one-shot…" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button style={S.btnSecondary} onClick={() => setShowManual(false)}>Annuler</button>
              <button style={{ ...S.btnPrimary, opacity: manualSaving ? 0.7 : 1 }} onClick={saveManual} disabled={manualSaving}>{manualSaving ? 'Enregistrement…' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal édition d'une ligne ── */}
      {editingPaiement && (
        <div style={S.overlay} onClick={() => setEditingPaiement(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Modifier l'échéance</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Montant (€)</label>
                  <input style={S.input} type="number" min={0} step={0.01} value={editingPaiement.montant} onChange={e => setEditingPaiement(p => ({ ...p, montant: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={S.label}>Échéance</label>
                  <input style={S.input} type="date" value={editingPaiement.date_echeance || ''} onChange={e => setEditingPaiement(p => ({ ...p, date_echeance: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={S.label}>Description</label>
                <input style={S.input} value={editingPaiement.description || ''} onChange={e => setEditingPaiement(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button style={S.btnSecondary} onClick={() => setEditingPaiement(null)}>Annuler</button>
              <button style={S.btnPrimary} onClick={saveEditPaiement}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Formulaire facture (accès secondaire, via "Générer une facture PDF") ── */}
      {showForm && (
        <div style={S.overlay} onClick={() => { setShowForm(false); setEditingId(null) }}>
          <div style={{ ...S.modal, maxWidth: 680, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ ...S.sectionTitle, margin: 0 }}>
                {editingId ? 'Modifier la facture' : `Nouvelle facture — N° ${nextNumero()}`}
              </p>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} style={S.btnClose}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ gridColumn: form.dest_manuel ? '1 / -1' : undefined }}>
                <label style={S.label}>Facturer à</label>
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
                      value={selectedGroupId || (form.client_id || '')}
                      onChange={e => {
                        const val = e.target.value
                        if (val.startsWith('cat:') || val.startsWith('grp:')) {
                          setSelectedGroupId(val)
                          setForm(f => ({ ...f, client_id: '' }))
                        } else {
                          setSelectedGroupId(null)
                          setForm(f => ({ ...f, client_id: val }))
                        }
                      }}
                      style={S.input}
                    >
                      <option value="">— Aucun / Particulier —</option>
                      {clients.filter(c => !teamMemberIds.has(c.id)).map(c => (
                        <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                      ))}
                      {categories.length > 0 && (
                        <optgroup label="── Catégories ──">
                          {categories.map(cat => (
                            <option key={cat.id} value={`cat:${cat.id}`}>{cat.nom}</option>
                          ))}
                        </optgroup>
                      )}
                      {teamGroupes.length > 0 && (
                        <optgroup label="── Groupes / Équipes ──">
                          {teamGroupes.map(g => (
                            <option key={g.id} value={`grp:${g.id}`}>{g.nom}</option>
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
                        {(selectedGroupId.startsWith('cat:')
                          ? clients.filter(c => c.categorie_id === selectedGroupId.replace('cat:', ''))
                          : (teamGroupes.find(g => g.id === selectedGroupId.replace('grp:', ''))?.membres || [])
                        ).map(c => (
                          <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                        ))}
                      </select>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                    <div>
                      <label style={{ ...S.label, marginTop: 0 }}>Nom / Club *</label>
                      <input value={form.dest_nom} onChange={e => setForm(f => ({ ...f, dest_nom: e.target.value }))} placeholder="Ex : FC Toulouse, M. Dupont…" style={S.input} />
                    </div>
                    <div>
                      <label style={{ ...S.label, marginTop: 0 }}>Adresse</label>
                      <input value={form.dest_adresse} onChange={e => setForm(f => ({ ...f, dest_adresse: e.target.value }))} placeholder="Ex : 12 rue des Sports, 31000 Toulouse" style={S.input} />
                    </div>
                    <div>
                      <label style={{ ...S.label, marginTop: 0 }}>SIRET (optionnel)</label>
                      <input value={form.dest_siret} onChange={e => setForm(f => ({ ...f, dest_siret: e.target.value }))} placeholder="Ex : 123 456 789 00012" style={S.input} />
                    </div>
                    <div>
                      <label style={{ ...S.label, marginTop: 0 }}>Email (pour envoi mail)</label>
                      <input type="email" value={form.dest_email} onChange={e => setForm(f => ({ ...f, dest_email: e.target.value }))} placeholder="contact@club.fr" style={S.input} />
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
                  <option value="Préparation physique — premier engagement (3 ou 6 mois)||69">Préparation physique — premier engagement (3 ou 6 mois) — 69 €/mois</option>
                  <option value="Préparation physique — renouvellement sans engagement||89">Préparation physique — renouvellement sans engagement — 89 €/mois</option>
                  <option value="Préparation physique — renouvellement 3 mois||79">Préparation physique — renouvellement 3 mois — 79 €/mois</option>
                  <option value="Préparation physique — renouvellement 6 mois||69">Préparation physique — renouvellement 6 mois — 69 €/mois</option>
                </optgroup>
                <optgroup label="Coaching remise en forme">
                  <option value="Coaching remise en forme — premier engagement (3 ou 6 mois)||69">Coaching remise en forme — premier engagement (3 ou 6 mois) — 69 €/mois</option>
                  <option value="Coaching remise en forme — renouvellement sans engagement||89">Coaching remise en forme — renouvellement sans engagement — 89 €/mois</option>
                  <option value="Coaching remise en forme — renouvellement 3 mois||79">Coaching remise en forme — renouvellement 3 mois — 79 €/mois</option>
                  <option value="Coaching remise en forme — renouvellement 6 mois||69">Coaching remise en forme — renouvellement 6 mois — 69 €/mois</option>
                </optgroup>
                <optgroup label="Autre">
                  <option value="Programme one-shot||30">Programme one-shot — 30 €</option>
                </optgroup>
              </select>
            </div>

            <p style={S.label}>Prestations</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {form.lignes.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={l.description} onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j===i ? { ...x, description: e.target.value } : x) }))} placeholder="Ex : Coaching mensuel — Juin 2026" style={{ ...S.input, flex: '3 1 180px' }} />
                  <input type="number" value={l.quantite} min="1" onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j===i ? { ...x, quantite: e.target.value } : x) }))} style={{ ...S.input, width: 72, flex: '0 0 72px' }} placeholder="Qté" />
                  <input type="number" value={l.prix} min="0" step="0.01" onChange={e => setForm(f => ({ ...f, lignes: f.lignes.map((x, j) => j===i ? { ...x, prix: e.target.value } : x) }))} style={{ ...S.input, width: 96, flex: '0 0 96px' }} placeholder="Prix €" />
                  <span style={{ minWidth: 78, textAlign: 'right', fontWeight: '700', fontSize: '0.9rem', color: '#111' }}>
                    {((parseFloat(l.prix)||0) * (parseFloat(l.quantite)||1)).toFixed(2)} €
                  </span>
                  {form.lignes.length > 1 && (
                    <button onClick={() => setForm(f => ({ ...f, lignes: f.lignes.filter((_, j) => j!==i) }))} style={S.btnClose}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setForm(f => ({ ...f, lignes: [...f.lignes, newLigne()] }))} style={{ ...S.btnSecondary, alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.35rem 0.7rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>{Ico.plus(12)} Ligne</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 0.15rem', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total</p>
                <p style={{ fontSize: '1.5rem', fontWeight: '900', color: '#111', margin: 0 }}>{totalFacture(form.lignes).toFixed(2)} €</p>
                <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0.2rem 0 0' }}>TVA non applicable — Art. 293B CGI</p>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={S.label}>Notes (optionnel)</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Conditions de règlement, informations complémentaires…" rows={2} style={{ ...S.input, width: '100%', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} style={S.btnSecondary}>Annuler</button>
              <button onClick={submitForm} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {editingId ? 'Enregistrer les modifications' : 'Créer la facture'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Aperçu + impression facture ── */}
      {facturePrint && (
        <div style={{ ...S.card, marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p style={{ ...S.sectionTitle, margin: 0 }}>Aperçu — Facture N° {facturePrint.numero}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={facturePrint.statut}
                onChange={e => updateStatutFacture(facturePrint.id, e.target.value)}
                style={{ ...S.input, padding: '0.3rem 0.5rem', fontSize: '0.78rem', width: 'auto', cursor: 'pointer' }}
              >
                <option value="brouillon">Brouillon</option>
                <option value="envoyee">Envoyée</option>
                <option value="payee">Payée</option>
              </select>
              <button onClick={() => openEdit(facturePrint)} style={{ ...S.btnSecondary, display:'flex', alignItems:'center', gap:'0.4rem' }}>{Ico.edit()} Modifier</button>
              <button onClick={handlePrint} style={{ ...S.btnPrimary, display:'flex', alignItems:'center', gap:'0.4rem' }}>{Ico.print()} Imprimer / PDF</button>
              <button onClick={() => deleteFacture(facturePrint.id)} style={{ ...S.btnSecondary, color: '#dc2626', borderColor: '#fecaca' }}>{Ico.trash()}</button>
              <button onClick={() => setPrintId(null)} style={S.btnSecondary}>✕ Fermer</button>
            </div>
          </div>

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

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'2.75rem' }}>
        <div style={{ display:'flex', flexDirection:'column' }}>
          <img src="/logo-noir.png" alt="AWprepa" style={{ height:48, width:'auto', marginBottom:10, marginLeft:-18 }} onError={e => e.target.style.display='none'} />
          <p style={{ fontWeight:900, fontSize:'1rem', color:'#111', margin:0 }}>{nomCoach}</p>
          {activite && <p style={{ fontSize:'0.78rem', color:'#6b7280', margin:'3px 0 0' }}>{activite}</p>}
        </div>

        <div style={{ background:'#f3f4f6', borderRadius:8, padding:'0.8rem 1.1rem', textAlign:'right', minWidth:185 }}>
          <p style={{ fontSize:'0.68rem', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 1px' }}>N° de facture</p>
          <p style={{ fontWeight:800, fontSize:'0.92rem', color:'#111', margin:'0 0 10px' }}>{facture.numero}</p>
          <p style={{ fontSize:'0.68rem', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 1px' }}>Date d'émission</p>
          <p style={{ fontWeight:600, fontSize:'0.85rem', color:'#374151', margin:0 }}>{dateEmission}</p>
          {dateEcheance && <>
            <p style={{ fontSize:'0.68rem', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.07em', margin:'8px 0 1px' }}>Échéance</p>
            <p style={{ fontWeight:700, fontSize:'0.85rem', color:'#dc2626', margin:0 }}>{dateEcheance}</p>
          </>}
        </div>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'2rem' }}>
        <div>
          <p style={{ fontWeight:900, fontSize:'2rem', letterSpacing:'-1px', color:'#111', margin:'0 0 0.875rem' }}>FACTURE</p>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {adresse    && <p style={{ fontSize:'0.78rem', color:'#4b5563', margin:0 }}>{adresse}</p>}
            {siret      && <p style={{ fontSize:'0.78rem', color:'#4b5563', margin:0 }}>SIRET : {siret}</p>}
            {emailCoach && <p style={{ fontSize:'0.78rem', color:'#4b5563', margin:0 }}>{emailCoach}</p>}
          </div>
        </div>

        <div style={{ border:'1px solid #e5e7eb', borderRadius:6, padding:'0.875rem 1.1rem', minWidth:200, maxWidth:240 }}>
          <p style={{ fontSize:'0.62rem', fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.1em', margin:'0 0 0.5rem' }}>Facturé à</p>
          {facture.destinataire
            ? <>
                <p style={{ fontWeight:700, fontSize:'0.88rem', color:'#111', margin:'0 0 2px' }}>{facture.destinataire.nom}</p>
                {facture.destinataire.adresse && <p style={{ fontSize:'0.82rem', color:'#4b5563', margin:'2px 0 0', lineHeight:1.5 }}>{facture.destinataire.adresse}</p>}
                {facture.destinataire.siret   && <p style={{ fontSize:'0.82rem', color:'#4b5563', margin:'2px 0 0' }}>SIRET : {facture.destinataire.siret}</p>}
              </>
            : facture.clients
              ? <>
                  <p style={{ fontWeight:700, fontSize:'0.88rem', color:'#111', margin:'0 0 2px' }}>{facture.clients.prenom} {facture.clients.nom}</p>
                  {facture.clients.email && <p style={{ fontSize:'0.82rem', color:'#4b5563', margin:'2px 0 0' }}>{facture.clients.email}</p>}
                </>
              : <p style={{ fontSize:'0.82rem', color:'#9ca3af', fontStyle:'italic', margin:0 }}>Non renseigné</p>
          }
        </div>
      </div>

      <div style={{ height:1, background:'#e5e7eb', marginBottom:'1.25rem' }} />

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

      {iban && (
        <div style={INV.infoSection}>
          <p style={INV.infoTitle}>Règlement par virement bancaire</p>
          <p style={INV.sm}>IBAN : <strong>{iban}</strong></p>
          <p style={INV.sm}>Référence obligatoire : <strong>Facture {facture.numero}{facture.clients ? ` — ${facture.clients.prenom} ${facture.clients.nom}` : ''}</strong></p>
        </div>
      )}

      {facture.notes && (
        <div style={INV.infoSection}>
          <p style={INV.infoTitle}>Notes</p>
          <p style={INV.sm}>{facture.notes}</p>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={INV.footer}>
        <p style={INV.footerTxt}>{nomCoach}{activite ? ` · ${activite}` : ''}</p>
        {siret && <p style={INV.footerTxt}>SIRET {siret}</p>}
        {adresse && <p style={INV.footerTxt}>{adresse}</p>}
        {emailCoach && <p style={INV.footerTxt}>{emailCoach}</p>}
      </div>

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
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' },
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

  // Pastilles filtre
  stats:       { display: 'flex', gap: '0.7rem', marginBottom: '1.25rem', flexWrap: 'wrap' },
  stat:        { flex: 1, minWidth: 140, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '0.85rem 1.1rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  statActive:  { borderColor: '#111', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  statN:       { fontSize: '1.4rem', fontWeight: 900, lineHeight: 1, marginBottom: '0.3rem' },
  statL:       { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: '0.4rem' },
  dot:         { width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },

  // Tableau
  th:          { textAlign: 'left', padding: '0.65rem 1rem', fontSize: '0.64rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e5e7eb' },
  tr:          { borderBottom: '1px solid #f3f4f6', cursor: 'pointer' },
  td:          { padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#374151', verticalAlign: 'middle' },
  who:         { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  caret:       { display: 'inline-flex', color: '#9ca3af', transition: 'transform .15s' },
  avatar:      { width: 32, height: 32, borderRadius: '50%', background: '#333', color: '#e4f816', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, flexShrink: 0 },
  name:        { fontWeight: 800, color: '#111', fontSize: '0.86rem' },
  pill:        { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.26rem 0.65rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 800 },
  actionBtn:   { background: '#333', color: '#e4f816', border: 'none', borderRadius: 9, padding: '0.4rem 0.75rem', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  detailRow:   { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  detailInner: { padding: '0.2rem 1rem 1rem 3.6rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' },
  hist:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: '#6b7280', padding: '0.3rem 0' },
  histLink:    { background: 'none', border: 'none', color: '#374151', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', padding: 0 },
  histIconBtn: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '0.2rem', display: 'flex' },
  histAddBtn:  { background: 'none', border: '1px dashed #d1d5db', color: '#6b7280', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', borderRadius: 8, padding: '0.35rem 0.7rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.3rem' },

  footnote:     { marginTop: '1.25rem', textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af' },
  footnoteLink: { color: '#374151', fontWeight: 700, cursor: 'pointer', borderBottom: '1px dashed #9ca3af' },

  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal:       { background: 'white', borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalTitle:  { fontWeight: 700, fontSize: '1.05rem', color: '#111', margin: '0 0 1.25rem' },
}

/* ── Styles facture imprimable ── */
const INV = {
  wrap:       { padding: '2.25rem 2.25rem 2rem', background: 'white', maxWidth: 740, margin: '0 auto', fontSize: '0.88rem', color: '#111', border: '1px solid #e5e7eb', borderRadius: 12, display: 'flex', flexDirection: 'column', minHeight: '265mm' },
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
