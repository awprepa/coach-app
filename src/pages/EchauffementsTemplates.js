import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function newId() { return Math.random().toString(36).slice(2) }

function WarmupDisplay({ lignes }) {
  const groups = []
  ;(lignes || []).forEach(l => {
    const last = groups[groups.length - 1]
    if (l.groupe && last?.groupe === l.groupe) last.items.push(l)
    else groups.push({ groupe: l.groupe, items: [l] })
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {groups.map((g, gi) => {
        if (!g.groupe) {
          return g.items.map((l, i) => (
            <div key={l.id || `${gi}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.3rem 0', borderBottom: '1px solid #f9fafb' }}>
              <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#6366f1', minWidth: 50, textAlign: 'right' }}>{l.reps}</span>
            </div>
          ))
        }
        return (
          <div key={gi} style={{ borderLeft: '3px solid #e4f816', paddingLeft: '0.75rem', background: '#fffef5', borderRadius: '0 8px 8px 0', padding: '0.4rem 0.75rem', marginBottom: '0.15rem' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: '900', color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bloc {g.groupe}</span>
            {g.items.map((l, i) => (
              <div key={l.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#6366f1' }}>{l.reps}</span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function EchauffementsTemplates() {
  const [templates, setTemplates]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [creating, setCreating]       = useState(false)
  const [editingId, setEditingId]     = useState(null)
  const [formNom, setFormNom]         = useState('')
  const [formLignes, setFormLignes]   = useState([])
  const [newLigne, setNewLigne]       = useState({ nom: '', reps: '', groupe: '' })
  const [saving, setSaving]           = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('echauffements_templates').select('*').order('created_at', { ascending: false })
    setTemplates(data || [])
    setLoading(false)
  }

  function startCreate() {
    setCreating(true); setEditingId(null)
    setFormNom(''); setFormLignes([])
    setNewLigne({ nom: '', reps: '', groupe: '' })
  }

  function startEdit(t) {
    setEditingId(t.id); setCreating(false)
    setFormNom(t.nom); setFormLignes(t.lignes || [])
    setNewLigne({ nom: '', reps: '', groupe: '' })
  }

  function cancelForm() { setCreating(false); setEditingId(null) }

  function addLigne() {
    if (!newLigne.nom.trim()) return
    const g = newLigne.groupe.trim().toUpperCase()
    setFormLignes(prev => [...prev, { id: newId(), nom: newLigne.nom.trim(), reps: newLigne.reps.trim(), groupe: g || null }])
    setNewLigne({ nom: '', reps: '', groupe: '' })
  }

  function removeLigne(lid) { setFormLignes(prev => prev.filter(l => l.id !== lid)) }

  function moveLigne(idx, dir) {
    const arr = [...formLignes]
    const ni = idx + dir
    if (ni < 0 || ni >= arr.length) return
    ;[arr[idx], arr[ni]] = [arr[ni], arr[idx]]
    setFormLignes(arr)
  }

  async function saveTemplate() {
    if (!formNom.trim()) return
    setSaving(true)
    if (editingId) {
      const { error } = await supabase.from('echauffements_templates')
        .update({ nom: formNom.trim(), lignes: formLignes }).eq('id', editingId)
      if (error) { alert(error.message); setSaving(false); return }
      setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, nom: formNom.trim(), lignes: formLignes } : t))
    } else {
      const { data, error } = await supabase.from('echauffements_templates')
        .insert([{ nom: formNom.trim(), lignes: formLignes }]).select().single()
      if (error) { alert(error.message); setSaving(false); return }
      setTemplates(prev => [data, ...prev])
    }
    setSaving(false)
    cancelForm()
  }

  async function deleteTemplate(id) {
    if (!window.confirm('Supprimer ce template d\'échauffement ?')) return
    await supabase.from('echauffements_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={S.title}>Échauffements</h1>
          <p style={S.subtitle}>Templates réutilisables, applicables à n'importe quelle séance</p>
        </div>
        {!creating && !editingId && (
          <button onClick={startCreate} style={S.btnPrimary}>+ Nouveau template</button>
        )}
      </div>

      {/* ── Formulaire création / édition ── */}
      {(creating || editingId) && (
        <div style={S.formCard}>
          <p style={S.sectionLabel}>{editingId ? 'Modifier le template' : 'Nouveau template'}</p>

          <input
            value={formNom} onChange={e => setFormNom(e.target.value)}
            placeholder="Nom du template (ex : Échauff. bas du corps)"
            style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: '1rem' }}
            autoFocus
          />

          {/* Liste des lignes */}
          {formLignes.length > 0 && (
            <div style={{ marginBottom: '0.875rem', border: '1.5px solid #f3f4f6', borderRadius: 12, overflow: 'hidden' }}>
              {formLignes.map((l, i) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem', background: l.groupe ? '#fffef5' : 'white', borderLeft: l.groupe ? '3px solid #e4f816' : 'none', borderBottom: i < formLignes.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  {l.groupe && (
                    <span style={{ background: '#333333', color: '#e4f816', padding: '0.1rem 0.45rem', borderRadius: 5, fontSize: '0.68rem', fontWeight: '900', flexShrink: 0 }}>{l.groupe}</span>
                  )}
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#6366f1', minWidth: 60 }}>{l.reps}</span>
                  <button onClick={() => moveLigne(i, -1)} disabled={i === 0} style={{ ...S.iconBtn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => moveLigne(i, 1)} disabled={i === formLignes.length - 1} style={{ ...S.iconBtn, opacity: i === formLignes.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button onClick={() => removeLigne(l.id)} style={{ ...S.iconBtn, color: '#dc2626', borderColor: '#fecaca' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Formulaire ajout ligne */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', background: '#f9fafb', borderRadius: 10, padding: '0.75rem' }}>
            <input
              value={newLigne.nom} onChange={e => setNewLigne(n => ({ ...n, nom: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addLigne()}
              placeholder="Exercice"
              style={{ ...S.input, flex: 1, minWidth: 150 }}
            />
            <input
              value={newLigne.reps} onChange={e => setNewLigne(n => ({ ...n, reps: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addLigne()}
              placeholder="Reps / durée"
              style={{ ...S.input, width: 115 }}
            />
            <input
              value={newLigne.groupe} onChange={e => setNewLigne(n => ({ ...n, groupe: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addLigne()}
              placeholder="Bloc A, B…"
              style={{ ...S.input, width: 90 }}
              maxLength={2}
            />
            <button onClick={addLigne} disabled={!newLigne.nom.trim()}
              style={{ ...S.btnSecondary, opacity: !newLigne.nom.trim() ? 0.4 : 1 }}>
              + Ajouter
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button onClick={saveTemplate} disabled={saving || !formNom.trim()}
              style={{ ...S.btnPrimary, opacity: !formNom.trim() || saving ? 0.5 : 1 }}>
              {saving ? 'Enregistrement...' : editingId ? '✓ Enregistrer' : '✓ Créer le template'}
            </button>
            <button onClick={cancelForm} style={S.btnSecondary}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── Liste des templates ── */}
      {loading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem' }}>Chargement...</p>
      ) : templates.length === 0 && !creating ? (
        <div style={S.empty}>
          <p style={{ fontWeight: '700', color: '#374151', margin: '0 0 0.35rem' }}>Aucun template</p>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Crée ton premier template d'échauffement pour le réutiliser dans tes séances.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {templates.map(t => (
            <div key={t.id} style={S.templateCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                <div>
                  <p style={{ fontWeight: '800', fontSize: '1rem', color: '#1a1a1a', margin: '0 0 0.2rem' }}>{t.nom}</p>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>{(t.lignes || []).length} exercice{(t.lignes || []).length !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                  <button onClick={() => startEdit(t)} style={S.iconBtn}>✏️</button>
                  <button onClick={() => deleteTemplate(t.id)} style={{ ...S.iconBtn, color: '#dc2626' }}>🗑</button>
                </div>
              </div>
              {(t.lignes || []).length === 0 ? (
                <p style={{ color: '#d1d5db', fontSize: '0.82rem', margin: 0 }}>Aucune ligne</p>
              ) : (
                <WarmupDisplay lignes={t.lignes} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const S = {
  page:         { padding: '2rem', maxWidth: '1000px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  title:        { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle:     { color: '#9ca3af', fontSize: '0.875rem', margin: '0.25rem 0 0' },
  sectionLabel: { fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.875rem' },
  btnPrimary:   { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  iconBtn:      { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#6b7280' },
  input:        { padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', color: '#333333', outline: 'none' },
  formCard:     { background: 'white', borderRadius: 16, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1.5px solid #e5e7eb' },
  templateCard: { background: 'white', borderRadius: 14, padding: '1.1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  empty:        { background: 'white', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
}
