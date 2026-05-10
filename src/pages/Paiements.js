import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

const STATUTS = [
  { key: 'en_attente', label: 'En attente', color: '#f59e0b', bg: '#fef3c7' },
  { key: 'paye', label: 'Payé', color: '#22c55e', bg: '#dcfce7' },
  { key: 'en_retard', label: 'En retard', color: '#ef4444', bg: '#fee2e2' },
]

function statutInfo(key) {
  return STATUTS.find(s => s.key === key) || STATUTS[0]
}

export default function Paiements() {
  const [clients, setClients] = useState([])
  const [paiements, setPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterClient, setFilterClient] = useState('tous')
  const [filterStatut, setFilterStatut] = useState('tous')
  const [modal, setModal] = useState(null) // null | 'new' | { id, ...fields }
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const [form, setForm] = useState({
    client_id: '',
    montant: '',
    description: '',
    date_echeance: '',
    date_paiement: '',
    statut: 'en_attente',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cls }, { data: pays }] = await Promise.all([
      supabase.from('clients').select('id, prenom, nom').order('nom'),
      supabase.from('paiements').select('*, clients(prenom, nom)').order('date_echeance', { ascending: false }),
    ])
    setClients(cls || [])
    setPaiements(pays || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-mark overdue
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    paiements.forEach(async p => {
      if (p.statut === 'en_attente' && p.date_echeance && p.date_echeance < today) {
        await supabase.from('paiements').update({ statut: 'en_retard' }).eq('id', p.id)
      }
    })
  }, [paiements])

  function openNew() {
    setForm({ client_id: clients[0]?.id || '', montant: '', description: '', date_echeance: '', date_paiement: '', statut: 'en_attente' })
    setModal('new')
  }

  function openEdit(p) {
    setForm({
      client_id: p.client_id,
      montant: p.montant,
      description: p.description || '',
      date_echeance: p.date_echeance || '',
      date_paiement: p.date_paiement || '',
      statut: p.statut,
    })
    setModal(p)
  }

  async function save() {
    if (!form.client_id || !form.montant) return
    setSaving(true)
    const payload = {
      client_id: form.client_id,
      montant: parseFloat(form.montant),
      description: form.description || null,
      date_echeance: form.date_echeance || null,
      date_paiement: form.date_paiement || null,
      statut: form.statut,
    }
    if (modal === 'new') {
      await supabase.from('paiements').insert(payload)
    } else {
      await supabase.from('paiements').update(payload).eq('id', modal.id)
    }
    setSaving(false)
    setModal(null)
    load()
  }

  async function updateStatut(id, statut) {
    const updates = { statut }
    if (statut === 'paye') updates.date_paiement = new Date().toISOString().split('T')[0]
    await supabase.from('paiements').update(updates).eq('id', id)
    load()
  }

  async function deletePaiement(id) {
    await supabase.from('paiements').delete().eq('id', id)
    setDeleteConfirm(null)
    load()
  }

  const filtered = paiements
    .filter(p => filterClient === 'tous' || p.client_id === filterClient)
    .filter(p => filterStatut === 'tous' || p.statut === filterStatut)

  const totalAttendu = filtered.reduce((s, p) => s + parseFloat(p.montant || 0), 0)
  const totalPercu = filtered.filter(p => p.statut === 'paye').reduce((s, p) => s + parseFloat(p.montant || 0), 0)

  function fmt(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.title}>Suivi des paiements</div>
          <div style={S.subtitle}>{filtered.length} paiement{filtered.length > 1 ? 's' : ''}</div>
        </div>
        <button style={S.btnPrimary} onClick={openNew}>+ Nouveau paiement</button>
      </div>

      {/* KPIs */}
      <div style={S.kpiRow}>
        <div style={S.kpi}>
          <div style={S.kpiVal}>{totalPercu.toFixed(0)} €</div>
          <div style={S.kpiLabel}>Perçu</div>
        </div>
        <div style={S.kpi}>
          <div style={{ ...S.kpiVal, color: '#f59e0b' }}>{(totalAttendu - totalPercu).toFixed(0)} €</div>
          <div style={S.kpiLabel}>En attente</div>
        </div>
        <div style={S.kpi}>
          <div style={{ ...S.kpiVal, color: '#ef4444' }}>
            {filtered.filter(p => p.statut === 'en_retard').length}
          </div>
          <div style={S.kpiLabel}>En retard</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiVal}>{totalAttendu.toFixed(0)} €</div>
          <div style={S.kpiLabel}>Total</div>
        </div>
      </div>

      {/* Filtres */}
      <div style={S.filters}>
        <select style={S.select} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="tous">Tous les clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
        </select>
        <select style={S.select} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="tous">Tous les statuts</option>
          {STATUTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Tableau */}
      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={S.emptyState}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💳</div>
          <div style={{ fontWeight: '600', color: '#374151' }}>Aucun paiement</div>
          <button style={{ ...S.btnPrimary, marginTop: '1rem' }} onClick={openNew}>Ajouter un paiement</button>
        </div>
      ) : (
        <div style={S.tableCard}>
          <table style={S.table}>
            <thead>
              <tr style={S.thead}>
                <th style={S.th}>Client</th>
                <th style={S.th}>Description</th>
                <th style={S.th}>Montant</th>
                <th style={S.th}>Échéance</th>
                <th style={S.th}>Paiement</th>
                <th style={S.th}>Statut</th>
                <th style={S.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const st = statutInfo(p.statut)
                return (
                  <tr key={p.id} style={S.tr}>
                    <td style={{ ...S.td, fontWeight: '600' }}>
                      {p.clients?.prenom} {p.clients?.nom}
                    </td>
                    <td style={S.td}>{p.description || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ ...S.td, fontWeight: '700', fontSize: '1rem' }}>{parseFloat(p.montant).toFixed(0)} €</td>
                    <td style={S.td}>{fmt(p.date_echeance)}</td>
                    <td style={S.td}>{fmt(p.date_paiement)}</td>
                    <td style={S.td}>
                      <select
                        value={p.statut}
                        onChange={e => updateStatut(p.id, e.target.value)}
                        style={{ ...S.pillSelect, background: st.bg, color: st.color, border: `1px solid ${st.color}40` }}>
                        {STATUTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button style={S.btnIconEdit} onClick={() => openEdit(p)}>✏️</button>
                        {deleteConfirm === p.id ? (
                          <>
                            <button style={S.btnIconDelete} onClick={() => deletePaiement(p.id)}>Oui</button>
                            <button style={S.btnIconCancel} onClick={() => setDeleteConfirm(null)}>Non</button>
                          </>
                        ) : (
                          <button style={S.btnIconDelete} onClick={() => setDeleteConfirm(p.id)}>🗑️</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={S.modalTitle}>{modal === 'new' ? 'Nouveau paiement' : 'Modifier le paiement'}</div>

            <div style={S.formGroup}>
              <label style={S.label}>Client *</label>
              <select style={S.input} value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
                <option value="">Choisir…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Montant (€) *</label>
              <input style={S.input} type="number" min={0} step={0.01}
                value={form.montant} onChange={e => setForm(p => ({ ...p, montant: e.target.value }))}
                placeholder="150" />
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Description</label>
              <input style={S.input} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Mensualité mai, Bilan, …" />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ ...S.formGroup, flex: 1 }}>
                <label style={S.label}>Date d'échéance</label>
                <input style={S.input} type="date" value={form.date_echeance}
                  onChange={e => setForm(p => ({ ...p, date_echeance: e.target.value }))} />
              </div>
              <div style={{ ...S.formGroup, flex: 1 }}>
                <label style={S.label}>Date de paiement</label>
                <input style={S.input} type="date" value={form.date_paiement}
                  onChange={e => setForm(p => ({ ...p, date_paiement: e.target.value }))} />
              </div>
            </div>
            <div style={S.formGroup}>
              <label style={S.label}>Statut</label>
              <select style={S.input} value={form.statut} onChange={e => setForm(p => ({ ...p, statut: e.target.value }))}>
                {STATUTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button style={S.btnSecondary} onClick={() => setModal(null)}>Annuler</button>
              <button style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={save} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  title: { fontSize: '1.4rem', fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: '0.875rem', color: '#6b7280', marginTop: '0.2rem' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' },
  kpi: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem 1.25rem', textAlign: 'center' },
  kpiVal: { fontSize: '1.6rem', fontWeight: '800', color: '#111827' },
  kpiLabel: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem', fontWeight: '500' },
  filters: { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  select: { padding: '0.5rem 0.875rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', background: 'white', color: '#374151', cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' },
  tableCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f9fafb' },
  th: { padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#374151' },
  pillSelect: { padding: '0.25rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', outline: 'none' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '8px', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  btnIconEdit: { background: '#f3f4f6', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.9rem' },
  btnIconDelete: { background: '#fef2f2', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: '#ef4444', fontWeight: '600' },
  btnIconCancel: { background: '#f3f4f6', border: 'none', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '1.25rem' },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' },
}
