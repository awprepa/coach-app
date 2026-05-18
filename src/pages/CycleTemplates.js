import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function CycleTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'edit'
  const [current, setCurrent] = useState(null) // template en cours d'édition
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // ── Envoyer à un client ──────────────────────────────────────────────────────
  const [sendModal, setSendModal] = useState(null) // template à envoyer
  const [clients, setClients] = useState([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [sendForm, setSendForm] = useState({ client_id: '', date_debut: '', nom: '' })
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(null) // nom du client

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('programme_templates')
      .select('*, programme_template_seances(*)')
      .order('created_at', { ascending: false })
    setTemplates(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function newTemplate() {
    setCurrent({
      id: null,
      nom: '',
      semaines: 8,
      description: '',
      programme_template_seances: [],
    })
    setView('edit')
  }

  function editTemplate(t) {
    const seances = [...(t.programme_template_seances || [])]
      .sort((a, b) => a.jour - b.jour || a.ordre - b.ordre)
    setCurrent({ ...t, programme_template_seances: seances })
    setView('edit')
  }

  async function saveTemplate() {
    if (!current.nom.trim()) return
    setSaving(true)
    let templateId = current.id

    if (!templateId) {
      const { data, error } = await supabase
        .from('programme_templates')
        .insert({ nom: current.nom, semaines: current.semaines, description: current.description })
        .select('id')
        .single()
      if (error) { setSaving(false); return }
      templateId = data.id
    } else {
      await supabase.from('programme_templates')
        .update({ nom: current.nom, semaines: current.semaines, description: current.description })
        .eq('id', templateId)
    }

    // Resync séances : delete all + reinsert
    await supabase.from('programme_template_seances').delete().eq('template_id', templateId)
    if (current.programme_template_seances.length > 0) {
      await supabase.from('programme_template_seances').insert(
        current.programme_template_seances.map(s => ({
          template_id: templateId,
          nom: s.nom,
          jour: s.jour,
          ordre: s.ordre,
          exercices: s.exercices || [],
        }))
      )
    }

    setSaving(false)
    setView('list')
    load()
  }

  async function deleteTemplate(id) {
    await supabase.from('programme_templates').delete().eq('id', id)
    setDeleteConfirm(null)
    load()
  }

  async function openSendModal(t) {
    setSendModal(t)
    setSendForm({ client_id: '', date_debut: '', nom: t.nom })
    setSendSuccess(null)
    setClientsLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('id, prenom, nom, offre')
      .order('nom')
    setClients(data || [])
    setClientsLoading(false)
  }

  async function sendToClient() {
    if (!sendForm.client_id || !sendModal) return
    setSending(true)

    // 1. Créer le programme pour le client
    const { data: prog, error } = await supabase
      .from('programmes')
      .insert({
        nom: sendForm.nom || sendModal.nom,
        semaines: sendModal.semaines,
        client_id: sendForm.client_id,
        date_debut: sendForm.date_debut || null,
      })
      .select()
      .single()

    if (error) { alert(error.message); setSending(false); return }

    // 2. Dupliquer les séances du template
    const seances = [...(sendModal.programme_template_seances || [])]
      .sort((a, b) => a.jour - b.jour || a.ordre - b.ordre)

    for (const [idx, ts] of seances.entries()) {
      const { data: newSeance } = await supabase
        .from('seances')
        .insert({ programme_id: prog.id, nom: ts.nom, ordre: ts.ordre || idx + 1 })
        .select()
        .single()
      if (newSeance && ts.exercices?.length > 0) {
        await supabase.from('exercices').insert(
          ts.exercices.map(ex => ({
            seance_id: newSeance.id,
            code: ex.code, nom: ex.nom, series: ex.series,
            repetitions: ex.repetitions, tempo: ex.tempo,
            recuperation: ex.recuperation, type_intensite: ex.type_intensite,
            valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
            bibliotheque_id: ex.bibliotheque_id || null,
          }))
        )
      }
    }

    const client = clients.find(c => c.id === sendForm.client_id)
    setSendSuccess(`${client?.prenom} ${client?.nom}`)
    setSending(false)

    // Naviguer vers le programme créé après 1.5s
    setTimeout(() => {
      setSendModal(null)
      navigate(`/programme/${prog.id}`)
    }, 1500)
  }

  function addSeance() {
    const seances = current.programme_template_seances
    const maxJour = seances.length > 0 ? Math.max(...seances.map(s => s.jour)) : 0
    setCurrent(p => ({
      ...p,
      programme_template_seances: [
        ...p.programme_template_seances,
        { nom: '', jour: maxJour + 1, ordre: 1, exercices: [] },
      ],
    }))
  }

  function updateSeance(idx, field, val) {
    setCurrent(p => {
      const seances = [...p.programme_template_seances]
      seances[idx] = { ...seances[idx], [field]: val }
      return { ...p, programme_template_seances: seances }
    })
  }

  function removeSeance(idx) {
    setCurrent(p => ({
      ...p,
      programme_template_seances: p.programme_template_seances.filter((_, i) => i !== idx),
    }))
  }

  // ─── LISTE ───────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <div>
            <div style={S.title}>Templates de cycles</div>
            <div style={S.subtitle}>{templates.length} template{templates.length > 1 ? 's' : ''}</div>
          </div>
          <button style={S.btnPrimary} onClick={newTemplate}>+ Nouveau template</button>
        </div>

        {loading ? (
          <div style={S.empty}>Chargement…</div>
        ) : templates.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
            <div style={{ fontWeight: '600', color: '#374151', marginBottom: '0.25rem' }}>Aucun template</div>
            <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Crée un template de cycle pour l'appliquer rapidement à tes clients</div>
            <button style={{ ...S.btnPrimary, marginTop: '1.25rem' }} onClick={newTemplate}>Créer un template</button>
          </div>
        ) : (
          <div style={S.grid}>
            {templates.map(t => (
              <div key={t.id} style={S.card}>
                <div style={S.cardHeader}>
                  <div>
                    <div style={S.cardTitle}>{t.nom}</div>
                    {t.description && <div style={S.cardDesc}>{t.description}</div>}
                  </div>
                  <div style={S.badge}>{t.semaines} sem.</div>
                </div>
                <div style={S.cardStats}>
                  <span style={S.stat}>
                    🏋️ {(t.programme_template_seances || []).length} séance{(t.programme_template_seances || []).length > 1 ? 's' : ''}
                  </span>
                  <span style={S.stat}>
                    📅 {Math.ceil((t.programme_template_seances || []).length / (t.semaines || 1) * 7)} j/sem
                  </span>
                </div>
                <div style={S.cardActions}>
                  <button style={S.btnPrimary} onClick={() => openSendModal(t)}>📤 Envoyer</button>
                  <button style={S.btnSecondary} onClick={() => editTemplate(t)}>Modifier</button>
                  {deleteConfirm === t.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button style={S.btnDanger} onClick={() => deleteTemplate(t.id)}>Supprimer</button>
                      <button style={S.btnSecondary} onClick={() => setDeleteConfirm(null)}>Annuler</button>
                    </div>
                  ) : (
                    <button style={S.btnGhost} onClick={() => setDeleteConfirm(t.id)}>Supprimer</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* ── Modale : Envoyer à un client ──────────────────────────────────── */}
      {sendModal && (
        <div style={S.overlay} onClick={() => !sending && setSendModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>

            {sendSuccess ? (
              // Succès
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#111827', marginBottom: '0.4rem' }}>
                  Cycle envoyé !
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  « {sendModal.nom} » a été créé pour <strong>{sendSuccess}</strong>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                  Redirection vers le programme…
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#111827' }}>📤 Envoyer un cycle</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                      Template : <strong>{sendModal.nom}</strong> · {sendModal.semaines} sem.
                    </div>
                  </div>
                  <button onClick={() => setSendModal(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: 0 }}>✕</button>
                </div>

                {/* Nom du programme */}
                <div style={S.formGroup}>
                  <label style={S.label}>Nom du programme</label>
                  <input
                    style={S.input}
                    value={sendForm.nom}
                    onChange={e => setSendForm(f => ({ ...f, nom: e.target.value }))}
                    placeholder={sendModal.nom}
                  />
                </div>

                {/* Date de début */}
                <div style={S.formGroup}>
                  <label style={S.label}>Date de début <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optionnel)</span></label>
                  <input
                    style={S.input}
                    type="date"
                    value={sendForm.date_debut}
                    onChange={e => setSendForm(f => ({ ...f, date_debut: e.target.value }))}
                  />
                </div>

                {/* Sélection du client */}
                <div style={S.formGroup}>
                  <label style={S.label}>Client *</label>
                  {clientsLoading ? (
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.5rem 0' }}>Chargement…</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.25rem' }}>
                      {clients.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setSendForm(f => ({ ...f, client_id: c.id }))}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.6rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left',
                            background: sendForm.client_id === c.id ? '#1a1a1a' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <span style={{ fontWeight: '600', fontSize: '0.875rem', color: sendForm.client_id === c.id ? '#e4f816' : '#111827' }}>
                            {c.prenom} {c.nom}
                          </span>
                          <span style={{
                            fontSize: '0.7rem', fontWeight: '600', padding: '2px 8px', borderRadius: '20px',
                            background: sendForm.client_id === c.id ? 'rgba(228,248,22,0.15)' : '#f3f4f6',
                            color: sendForm.client_id === c.id ? '#e4f816' : '#6b7280',
                          }}>
                            {c.offre || 'coaching'}
                          </span>
                        </button>
                      ))}
                      {clients.length === 0 && (
                        <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.75rem', textAlign: 'center' }}>
                          Aucun client trouvé
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button onClick={() => setSendModal(null)} style={{ ...S.btnSecondary, flex: 1 }}>Annuler</button>
                  <button
                    onClick={sendToClient}
                    disabled={!sendForm.client_id || sending}
                    style={{
                      ...S.btnPrimary, flex: 2,
                      opacity: !sendForm.client_id || sending ? 0.5 : 1,
                      cursor: !sendForm.client_id || sending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending ? 'Création en cours…' : '📤 Envoyer le cycle'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
  }

  // ─── ÉDITEUR ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.btnBack} onClick={() => setView('list')}>← Retour</button>
        <button style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }} onClick={saveTemplate} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div style={S.form}>
        <div style={S.formGroup}>
          <label style={S.label}>Nom du template *</label>
          <input style={S.input} value={current.nom}
            onChange={e => setCurrent(p => ({ ...p, nom: e.target.value }))}
            placeholder="Ex: Préparation physique générale" />
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ ...S.formGroup, flex: 1 }}>
            <label style={S.label}>Durée (semaines)</label>
            <input style={S.input} type="number" min={1} max={52} value={current.semaines}
              onChange={e => setCurrent(p => ({ ...p, semaines: parseInt(e.target.value) || 8 }))} />
          </div>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>Description</label>
          <textarea style={{ ...S.input, minHeight: '80px', resize: 'vertical' }}
            value={current.description || ''}
            onChange={e => setCurrent(p => ({ ...p, description: e.target.value }))}
            placeholder="Objectifs, niveau, particularités…" />
        </div>

        <div style={S.sectionTitle}>Séances ({current.programme_template_seances.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {current.programme_template_seances.map((s, idx) => (
            <div key={idx} style={S.seanceRow}>
              <div style={S.seanceNum}>J{s.jour}</div>
              <input style={{ ...S.input, flex: 1, marginBottom: 0 }} value={s.nom}
                onChange={e => updateSeance(idx, 'nom', e.target.value)}
                placeholder="Nom de la séance" />
              <input style={{ ...S.input, width: '70px', marginBottom: 0 }} type="number" min={1}
                value={s.jour} onChange={e => updateSeance(idx, 'jour', parseInt(e.target.value) || 1)}
                title="Jour" />
              <button style={S.btnRemove} onClick={() => removeSeance(idx)}>✕</button>
            </div>
          ))}
        </div>
        <button style={{ ...S.btnSecondary, marginTop: '0.75rem' }} onClick={addSeance}>
          + Ajouter une séance
        </button>
      </div>
    </div>
  )
}

const S = {
  page: { padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  title: { fontSize: '1.4rem', fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: '0.875rem', color: '#6b7280', marginTop: '0.2rem' },
  empty: { color: '#9ca3af', padding: '2rem', textAlign: 'center' },
  emptyState: { textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' },
  card: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' },
  cardTitle: { fontWeight: '700', color: '#111827', fontSize: '1rem' },
  cardDesc: { fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' },
  badge: { background: '#f3f4f6', color: '#374151', borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap' },
  cardStats: { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  stat: { fontSize: '0.8rem', color: '#6b7280' },
  cardActions: { display: 'flex', gap: '0.5rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.875rem' },
  form: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem' },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' },
  sectionTitle: { fontWeight: '700', color: '#111827', marginBottom: '0.75rem', marginTop: '1.25rem', fontSize: '0.95rem' },
  seanceRow: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  seanceNum: { background: '#333333', color: '#e4f816', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', fontWeight: '700', minWidth: '32px', textAlign: 'center' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '8px', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer' },
  btnDanger: { background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer' },
  btnRemove: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem' },
  btnBack: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer', padding: '0.5rem 0' },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: '16px', padding: '1.5rem',
    width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    maxHeight: '90vh', overflowY: 'auto',
  },
}
