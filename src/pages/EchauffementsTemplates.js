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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {groups.map((g, gi) => {
        if (!g.groupe) {
          return g.items.map((l, i) => (
            <div key={l.id || `${gi}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.3rem 0.5rem', background: '#f9fafb', borderRadius: 8 }}>
              <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#6366f1', minWidth: 50, textAlign: 'right' }}>{l.reps}</span>
            </div>
          ))
        }
        const tours = g.items[0]?.tours
        return (
          <div key={gi} style={{ display: 'flex', alignItems: 'stretch', borderLeft: '3px solid #e4f816', background: '#fffef5', borderRadius: '0 8px 8px 0', padding: '0.4rem 0.75rem' }}>
            <div style={{ flex: 1 }}>
              {g.items.map((l, i) => (
                <div key={l.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: i > 0 ? '0.3rem' : 0, paddingTop: i > 0 ? '0.3rem' : 0, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#6366f1' }}>{l.reps}</span>
                </div>
              ))}
            </div>
            {tours && (
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.75rem', flexShrink: 0 }}>
                <div style={{ borderTop: '2px solid #d97706', borderRight: '2px solid #d97706', borderBottom: '2px solid #d97706', borderRadius: '0 4px 4px 0', width: 6, alignSelf: 'stretch' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: '900', color: '#d97706', paddingLeft: '0.35rem', whiteSpace: 'nowrap' }}>{tours} tours</span>
              </div>
            )}
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
  const [newLigne, setNewLigne]       = useState({ nom: '', reps: '', groupe: '', tours: '' })
  const [saving, setSaving]           = useState(false)
  const [editingLineId, setEditingLineId] = useState(null)
  const [editLineForm, setEditLineForm]   = useState({ nom: '', reps: '', groupe: '', tours: '' })
  const [showPaste, setShowPaste]         = useState(false)
  const [pasteText, setPasteText]         = useState('')
  const [parsedPreview, setParsedPreview] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('echauffements_templates').select('*').order('created_at', { ascending: false })
    setTemplates(data || [])
    setLoading(false)
  }

  function startCreate() {
    setCreating(true); setEditingId(null)
    setFormNom(''); setFormLignes([])
    setNewLigne({ nom: '', reps: '', groupe: '', tours: '' })
  }

  function startEdit(t) {
    setEditingId(t.id); setCreating(false)
    setFormNom(t.nom); setFormLignes(t.lignes || [])
    setNewLigne({ nom: '', reps: '', groupe: '', tours: '' })
  }

  function cancelForm() { setCreating(false); setEditingId(null) }

  function addLigne() {
    if (!newLigne.nom.trim()) return
    const g = newLigne.groupe.trim().toUpperCase() || null
    const existingTours = g ? (formLignes.find(l => l.groupe === g)?.tours || null) : null
    const formTours = g && newLigne.tours ? parseInt(newLigne.tours) || null : null
    const tours = existingTours ?? formTours
    setFormLignes(prev => {
      const next = [...prev, { id: newId(), nom: newLigne.nom.trim(), reps: newLigne.reps.trim(), groupe: g, tours }]
      // propager tours saisi à tout le groupe si nouveau groupe
      if (g && formTours && !existingTours) return next.map(l => l.groupe === g ? { ...l, tours: formTours } : l)
      return next
    })
    setNewLigne(n => ({ nom: '', reps: '', groupe: n.groupe, tours: n.tours })) // garde bloc+tours pour enchaîner
  }

  function removeLigne(lid) { setFormLignes(prev => prev.filter(l => l.id !== lid)) }

  function moveLigne(idx, dir) {
    const arr = [...formLignes]
    const ni = idx + dir
    if (ni < 0 || ni >= arr.length) return
    ;[arr[idx], arr[ni]] = [arr[ni], arr[idx]]
    setFormLignes(arr)
  }

  function startEditLine(l) {
    setEditingLineId(l.id)
    setEditLineForm({ nom: l.nom || '', reps: l.reps || '', groupe: l.groupe || '', tours: l.tours ? String(l.tours) : '' })
  }

  function saveEditLine() {
    if (!editLineForm.nom.trim()) return
    const g = editLineForm.groupe.trim().toUpperCase() || null
    const tours = g && editLineForm.tours ? parseInt(editLineForm.tours) || null : null
    setFormLignes(prev => prev.map(l => {
      if (l.id === editingLineId) return { ...l, nom: editLineForm.nom.trim(), reps: editLineForm.reps.trim(), groupe: g, tours: g ? tours : null }
      if (g && l.groupe === g) return { ...l, tours }   // propager tours aux autres lignes du même bloc
      return l
    }))
    setEditingLineId(null)
  }

  function parsePaste(text) {
    const raw = (text || pasteText).trim()
    if (!raw) return

    function splitNomReps(str) {
      const m = str.match(/^(.*?)\s+(\d*[xX]\d+(?:[\/\.]\w)?|\d+\s*(?:s|min|sec|reps?))\s*$/i)
      return m ? { nom: m[1].trim(), reps: m[2].trim() } : { nom: str.trim(), reps: '' }
    }

    const rows = raw.split('\n').map(r => r.trim())
    const result = []
    let pending = []   // lignes accumulées en attente d'un "X tours"
    let groupIdx = 0

    const flushPending = (tours) => {
      if (!pending.length) return
      if (tours) {
        const letter = String.fromCharCode(65 + groupIdx)
        pending.forEach(l => { l.groupe = letter; l.tours = tours })
        groupIdx++
      }
      result.push(...pending)
      pending = []
    }

    for (const row of rows) {
      if (!row || /^[-–—]+$/.test(row) || /^(échauffement|echauffement|début)/i.test(row)) continue

      // Ligne "X tours" seule → applique aux lignes en attente
      const toursOnly = row.match(/^(\d+)\s*tours?\s*$/i)
      if (toursOnly) { flushPending(parseInt(toursOnly[1])); continue }

      // Colonnes séparées par tabulation
      const cols = row.split('\t').map(c => c.trim()).filter(Boolean)
      if (cols.length >= 2) {
        flushPending(null)
        let nom = cols[0], reps = cols[1], groupe = null, tours = null
        if (cols[2] && /^[A-Za-z]{1,2}$/.test(cols[2])) { groupe = cols[2].toUpperCase(); tours = cols[3] ? parseInt(cols[3]) || null : null }
        result.push({ id: newId(), nom, reps, groupe: groupe || null, tours })
        continue
      }

      // Pattern "exercice ] X tours" inline
      const bracketMatch = row.match(/^(.+?)\s*\]\s*(\d+)\s*tours?\s*$/i)
      if (bracketMatch) {
        flushPending(null)
        const { nom, reps } = splitNomReps(bracketMatch[1])
        const letter = String.fromCharCode(65 + groupIdx)
        result.push({ id: newId(), nom, reps, groupe: letter, tours: parseInt(bracketMatch[2]) })
        groupIdx++
        continue
      }

      // Ligne simple → accumule pour le prochain "X tours"
      const { nom, reps } = splitNomReps(row)
      pending.push({ id: newId(), nom, reps, groupe: null, tours: null })
    }

    flushPending(null)

    // Propager tours dans chaque groupe
    const toursByGroup = {}
    result.forEach(l => { if (l.groupe && l.tours) toursByGroup[l.groupe] = l.tours })
    setParsedPreview(result.map(l => l.groupe ? { ...l, tours: toursByGroup[l.groupe] || l.tours || null } : l))
  }

  function confirmPaste() {
    if (!parsedPreview) return
    setFormLignes(prev => [...prev, ...parsedPreview])
    setPasteText(''); setParsedPreview(null); setShowPaste(false)
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

          {/* ── Zone collage Excel ── */}
          <div style={{ marginBottom: '0.875rem' }}>
            <button onClick={() => { setShowPaste(v => !v); setParsedPreview(null); setPasteText('') }}
              style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}>
              📋 Coller depuis Excel {showPaste ? '▲' : '▼'}
            </button>
            {showPaste && (
              <div style={{ marginTop: '0.5rem', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.875rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.5 }}>
                  Colle directement depuis Excel. Colonnes détectées automatiquement.<br />
                  Format conseillé : <span style={{ fontFamily: 'monospace', background: '#e5e7eb', padding: '1px 5px', borderRadius: 4 }}>Exercice · Reps · Bloc · Tours</span> (tabulation entre chaque)
                </p>
                <textarea
                  value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setParsedPreview(null) }}
                  onPaste={e => { setTimeout(() => parsePaste(e.target.value + '\n' + (e.clipboardData?.getData('text') || '')), 0) }}
                  placeholder={"Squat\t3x10\nFentes\t3x12\nGainage\t30s\nPompes\t3x15\tA\t3\nTraction\t3x8\tA"}
                  rows={6}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.82rem', fontFamily: 'monospace', resize: 'vertical', outline: 'none', background: 'white' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                  <button onClick={() => parsePaste()} disabled={!pasteText.trim()}
                    style={{ ...S.btnPrimary, opacity: !pasteText.trim() ? 0.5 : 1, fontSize: '0.82rem', padding: '0.45rem 0.875rem' }}>
                    🔍 Analyser
                  </button>
                  {parsedPreview && (
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{parsedPreview.length} exercice{parsedPreview.length > 1 ? 's' : ''} détecté{parsedPreview.length > 1 ? 's' : ''}</span>
                  )}
                </div>

                {parsedPreview && parsedPreview.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aperçu</p>
                    <div style={{ background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.625rem 0.875rem' }}>
                      <WarmupDisplay lignes={parsedPreview} />
                    </div>
                    <button onClick={confirmPaste}
                      style={{ ...S.btnPrimary, marginTop: '0.625rem', fontSize: '0.82rem', padding: '0.5rem 1rem' }}>
                      ✓ Ajouter ces {parsedPreview.length} exercices
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Liste des lignes */}
          {formLignes.length > 0 && (
            <div style={{ marginBottom: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {formLignes.map((l, i) => {
                const prevGroupe = i > 0 ? formLignes[i - 1].groupe : undefined
                const groupeChange = l.groupe !== prevGroupe
                return (
                <div key={l.id} style={{ background: l.groupe ? '#fffef5' : 'white', borderLeft: l.groupe ? '3px solid #e4f816' : 'none', border: l.groupe ? '1.5px solid #e9f7a8' : '1.5px solid #f3f4f6', borderLeft: l.groupe ? '3px solid #e4f816' : '1.5px solid #f3f4f6', borderRadius: l.groupe ? '0 10px 10px 0' : 10, marginTop: groupeChange && i > 0 ? '0.25rem' : 0 }}>
                  {editingLineId === l.id ? (
                    /* ── Mode édition ── */
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', padding: '0.5rem 0.875rem' }}>
                      <input value={editLineForm.nom} onChange={e => setEditLineForm(f => ({ ...f, nom: e.target.value }))}
                        placeholder="Exercice" style={{ ...S.input, flex: 1, minWidth: 120, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} autoFocus />
                      <input value={editLineForm.reps} onChange={e => setEditLineForm(f => ({ ...f, reps: e.target.value }))}
                        placeholder="Reps / durée" style={{ ...S.input, width: 100, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} />
                      <input value={editLineForm.groupe} onChange={e => setEditLineForm(f => ({ ...f, groupe: e.target.value }))}
                        placeholder="Bloc" style={{ ...S.input, width: 60, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} maxLength={2} />
                      {editLineForm.groupe.trim() && (
                        <input value={editLineForm.tours} onChange={e => setEditLineForm(f => ({ ...f, tours: e.target.value }))}
                          placeholder="Tours" style={{ ...S.input, width: 68, padding: '0.35rem 0.6rem', fontSize: '0.82rem' }} type="number" min="1" />
                      )}
                      <button onClick={saveEditLine} style={{ ...S.iconBtn, color: '#16a34a', borderColor: '#bbf7d0', fontWeight: '800' }}>✓</button>
                      <button onClick={() => setEditingLineId(null)} style={S.iconBtn}>✕</button>
                    </div>
                  ) : (
                    /* ── Mode affichage ── */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem' }}>
                      {l.groupe && (
                        <span style={{ background: '#333333', color: '#e4f816', padding: '0.1rem 0.45rem', borderRadius: 5, fontSize: '0.68rem', fontWeight: '900', flexShrink: 0 }}>
                          {l.groupe}{l.tours && formLignes.findIndex(x => x.groupe === l.groupe) === i ? ` · ${l.tours}t` : ''}
                        </span>
                      )}
                      <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: '600', color: '#333' }}>{l.nom}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#6366f1', minWidth: 60 }}>{l.reps}</span>
                      <button onClick={() => startEditLine(l)} style={{ ...S.iconBtn, fontSize: '0.75rem' }}>✏️</button>
                      <button onClick={() => moveLigne(i, -1)} disabled={i === 0} style={{ ...S.iconBtn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                      <button onClick={() => moveLigne(i, 1)} disabled={i === formLignes.length - 1} style={{ ...S.iconBtn, opacity: i === formLignes.length - 1 ? 0.3 : 1 }}>↓</button>
                      <button onClick={() => removeLigne(l.id)} style={{ ...S.iconBtn, color: '#dc2626', borderColor: '#fecaca' }}>✕</button>
                    </div>
                  )}
                </div>
              )})}
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
              style={{ ...S.input, width: 80 }}
              maxLength={2}
            />
            {newLigne.groupe.trim() && (() => {
              const existingGroup = formLignes.find(l => l.groupe === newLigne.groupe.trim().toUpperCase())
              return !existingGroup ? (
                <input
                  value={newLigne.tours} onChange={e => setNewLigne(n => ({ ...n, tours: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addLigne()}
                  placeholder="Tours"
                  style={{ ...S.input, width: 72 }}
                  type="number" min="1"
                />
              ) : null
            })()}
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
