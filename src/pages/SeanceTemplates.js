import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ImportExcel from './ImportExcel'

export default function SeanceTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [expanded, setExpanded]           = useState(null)
  const [openFolders, setOpenFolders]     = useState(new Set())
  const [showImport, setShowImport]       = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState(null)
  const [renameVal, setRenameVal]         = useState('')
  const [movingId, setMovingId]           = useState(null)

  // Édition inline
  const [editingId, setEditingId]         = useState(null)
  const [editNom, setEditNom]             = useState('')
  const [editExercices, setEditExercices] = useState([])
  const [savingEdit, setSavingEdit]       = useState(false)

  // Assignation à un client
  const [sendingTemplate, setSendingTemplate] = useState(null)
  const [clients, setClients]             = useState([])
  const [clientProgrammes, setClientProgrammes] = useState({})
  const [clientsLoaded, setClientsLoaded] = useState(false)
  const [selectedAssign, setSelectedAssign] = useState({})  // clientId → programmeId
  const [assigning, setAssigning]         = useState(false)
  const [assignDone, setAssignDone]       = useState(false)

  useEffect(() => { fetchTemplates() }, [])

  async function nouvelleSeance() {
    const { data, error } = await supabase
      .from('seances')
      .insert([{ nom: 'Nouvelle séance', programme_id: null }])
      .select('id')
      .single()
    if (error) { alert(error.message); return }
    navigate(`/seance/${data.id}`)
  }

  async function fetchTemplates() {
    const { data } = await supabase.from('seance_templates').select('*').order('created_at', { ascending: false })
    const list = data || []
    setTemplates(list)
    setOpenFolders(new Set())
    setLoading(false)
  }

  async function reloadTemplates() {
    const { data } = await supabase.from('seance_templates').select('*').order('created_at', { ascending: false })
    setTemplates(data || [])
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce modèle ?')) return
    await supabase.from('seance_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ── Dossiers ──────────────────────────────────────────────────────────────

  async function creerDossier() {
    if (!newFolderName.trim()) return
    setShowNewFolder(false)
    setNewFolderName('')
    setOpenFolders(prev => new Set([...prev, newFolderName.trim()]))
  }

  async function renommerDossier(oldName, newName) {
    if (!newName.trim() || newName === oldName) { setRenamingFolder(null); return }
    await supabase.from('seance_templates').update({ dossier: newName.trim() }).eq('dossier', oldName)
    setTemplates(prev => prev.map(t => t.dossier === oldName ? { ...t, dossier: newName.trim() } : t))
    setOpenFolders(prev => { const n = new Set(prev); n.delete(oldName); n.add(newName.trim()); return n })
    setRenamingFolder(null)
  }

  async function supprimerDossier(name) {
    if (!window.confirm(`Supprimer le dossier "${name}" ? Les modèles seront déplacés dans "Sans dossier".`)) return
    await supabase.from('seance_templates').update({ dossier: null }).eq('dossier', name)
    setTemplates(prev => prev.map(t => t.dossier === name ? { ...t, dossier: null } : t))
    setOpenFolders(prev => { const n = new Set(prev); n.delete(name); return n })
  }

  async function deplacerDansFolder(templateId, dossier) {
    await supabase.from('seance_templates').update({ dossier: dossier || null }).eq('id', templateId)
    setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, dossier: dossier || null } : t))
    setMovingId(null)
  }

  function toggleFolder(name) {
    setOpenFolders(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  // ── Édition inline ────────────────────────────────────────────────────────

  function startEdit(t, e) {
    e.stopPropagation()
    setEditingId(t.id)
    setEditNom(t.nom)
    setEditExercices((t.exercices || []).map(ex => ({ ...ex })))
    setExpanded(t.id)
  }

  function cancelEdit(e) {
    e && e.stopPropagation()
    setEditingId(null)
  }

  async function saveEdit(templateId, e) {
    e && e.stopPropagation()
    if (!editNom.trim()) return
    setSavingEdit(true)
    await supabase.from('seance_templates')
      .update({ nom: editNom.trim(), exercices: editExercices })
      .eq('id', templateId)
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, nom: editNom.trim(), exercices: editExercices } : t
    ))
    setEditingId(null)
    setSavingEdit(false)
  }

  function updateEx(idx, field, value) {
    setEditExercices(prev => prev.map((ex, i) => i === idx ? { ...ex, [field]: value } : ex))
  }

  function deleteEx(idx) {
    setEditExercices(prev => prev.filter((_, i) => i !== idx))
  }

  function addEx() {
    setEditExercices(prev => [...prev, { code: '', nom: '', series: '', repetitions: '', recuperation: '', ordre: prev.length + 1 }])
  }

  // ── Assignation ───────────────────────────────────────────────────────────

  async function openAssign(template, e) {
    e.stopPropagation()
    setSendingTemplate(template)
    setSelectedAssign({})
    setAssignDone(false)
    if (!clientsLoaded) {
      const { data: clientsData } = await supabase.from('clients')
        .select('id, prenom, nom').order('prenom')
      const ids = (clientsData || []).map(c => c.id)
      let progsByClient = {}
      if (ids.length > 0) {
        const { data: progsData } = await supabase.from('programmes')
          .select('id, nom, client_id')
          .in('client_id', ids)
          .order('created_at', { ascending: false })
        for (const p of (progsData || [])) {
          if (!progsByClient[p.client_id]) progsByClient[p.client_id] = []
          progsByClient[p.client_id].push(p)
        }
      }
      setClients(clientsData || [])
      setClientProgrammes(progsByClient)
      setClientsLoaded(true)
    }
  }

  function toggleClient(clientId) {
    setSelectedAssign(prev => {
      const next = { ...prev }
      if (next[clientId] !== undefined) {
        delete next[clientId]
      } else {
        const progs = clientProgrammes[clientId]
        next[clientId] = progs?.[0]?.id || null
      }
      return next
    })
  }

  const assignCount = Object.keys(selectedAssign).length

  async function assignerTemplate() {
    const entries = Object.entries(selectedAssign).filter(([, progId]) => progId)
    if (entries.length === 0) return
    setAssigning(true)
    for (const [, progId] of entries) {
      const { count } = await supabase.from('seances')
        .select('id', { count: 'exact', head: true }).eq('programme_id', progId)
      const { data: newSeance } = await supabase.from('seances')
        .insert([{ programme_id: progId, nom: sendingTemplate.nom, ordre: (count || 0) + 1 }])
        .select().single()
      if (newSeance && sendingTemplate.exercices?.length > 0) {
        const exInserts = sendingTemplate.exercices.map(ex => ({
          seance_id: newSeance.id, code: ex.code, nom: ex.nom,
          series: ex.series, repetitions: ex.repetitions, tempo: ex.tempo,
          recuperation: ex.recuperation, type_intensite: ex.type_intensite,
          valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
          bibliotheque_id: ex.bibliotheque_id || null,
        }))
        await supabase.from('exercices').insert(exInserts)
      }
    }
    setAssigning(false)
    setAssignDone(true)
    setTimeout(() => {
      setSendingTemplate(null)
      setSelectedAssign({})
      setAssignDone(false)
    }, 1500)
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return <div style={S.centered}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>

  const BLOC_COLORS = ['#6366f1','#16a34a','#ea580c','#2563eb','#dc2626','#ca8a04','#0891b2','#9333ea']
  function blocColor(letter) {
    if (!letter) return '#9ca3af'
    return BLOC_COLORS[(letter.toUpperCase().charCodeAt(0) - 65 + BLOC_COLORS.length) % BLOC_COLORS.length]
  }
  function blocLetter(code) {
    if (!code) return null
    const m = code.match(/^[A-Za-z]+/)
    return m ? m[0].toUpperCase() : null
  }
  function renderExercicesBlocs(exs) {
    const items = []
    let prevBloc = null
    exs.forEach((ex, i) => {
      const bloc = blocLetter(ex.code)
      if (bloc && bloc !== prevBloc) {
        const color = blocColor(bloc)
        items.push(
          <div key={`hdr-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: i > 0 ? '0.6rem' : 0, marginBottom: '0.1rem' }}>
            <span style={{ background: color, color: 'white', fontSize: '0.58rem', fontWeight: '800', borderRadius: 3, padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>Bloc {bloc}</span>
            <div style={{ flex: 1, height: 1, background: color, opacity: 0.25 }} />
          </div>
        )
        prevBloc = bloc
      }
      const color = bloc ? blocColor(bloc) : null
      items.push(
        <div key={i} style={{ ...S.exRow, borderLeft: `3px solid ${color || '#e5e7eb'}`, paddingLeft: '0.5rem', borderRadius: '0 4px 4px 0' }}>
          {ex.code && <span style={S.codeTag}>{ex.code}</span>}
          <span style={S.exNom}>{ex.nom}</span>
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {ex.series && <span style={S.chip}>{ex.series} séries</span>}
            {ex.repetitions && <span style={S.chip}>{ex.repetitions} reps</span>}
            {ex.recuperation && <span style={S.chip}>{ex.recuperation}</span>}
          </div>
        </div>
      )
    })
    return items
  }

  const allFolders = [...new Set([...openFolders, ...templates.map(t => t.dossier).filter(Boolean)])].sort()
  const sansDossier = templates.filter(t => !t.dossier)
  const folderOptions = [...new Set(templates.map(t => t.dossier).filter(Boolean))].sort()

  function renderTemplate(t) {
    const isEditing = editingId === t.id
    const isExpanded = expanded === t.id

    return (
      <div key={t.id} style={S.card}>
        {/* En-tête de la carte */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => !isEditing && setExpanded(isExpanded ? null : t.id)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <input
                value={editNom}
                onChange={e => setEditNom(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ ...S.editInput, fontWeight: '700', fontSize: '0.92rem', width: '100%' }}
                autoFocus
              />
            ) : (
              <>
                <p style={S.nom}>{t.nom}</p>
                <p style={S.meta}>{t.exercices?.length || 0} exercice{(t.exercices?.length || 0) > 1 ? 's' : ''} · {new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
            {isEditing ? (
              <>
                <button onClick={e => saveEdit(t.id, e)} disabled={savingEdit}
                  style={{ ...S.actionBtnSolid, background: '#333', color: '#e4f816' }}>
                  {savingEdit ? '…' : '✓ Sauvegarder'}
                </button>
                <button onClick={cancelEdit} style={S.actionBtnSolid}>Annuler</button>
              </>
            ) : (
              <>
                {/* Envoyer à un client */}
                <button onClick={e => openAssign(t, e)} style={S.actionBtn} title="Envoyer à un client">📤</button>
                {/* Éditer */}
                <button onClick={e => startEdit(t, e)} style={S.actionBtn} title="Modifier le modèle">✏️</button>
                {/* Déplacer */}
                <div style={{ position: 'relative' }}>
                  <button onClick={e => { e.stopPropagation(); setMovingId(movingId === t.id ? null : t.id) }}
                    style={S.actionBtn} title="Déplacer dans un dossier">📁</button>
                  {movingId === t.id && (
                    <div style={S.moveDropdown} onClick={e => e.stopPropagation()}>
                      <div style={S.moveItem} onClick={() => deplacerDansFolder(t.id, null)}>
                        <span style={{ opacity: 0.5 }}>— Sans dossier</span>
                      </div>
                      {allFolders.map(f => (
                        <div key={f} style={S.moveItem} onClick={() => deplacerDansFolder(t.id, f)}>
                          {f}
                        </div>
                      ))}
                      <div style={{ padding: '0.4rem 0.65rem', borderTop: '1px solid #f3f4f6' }}>
                        <input autoFocus placeholder="Nouveau dossier..."
                          style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box' }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              const name = e.target.value.trim()
                              setOpenFolders(prev => new Set([...prev, name]))
                              deplacerDansFolder(t.id, name)
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={e => { e.stopPropagation(); supprimer(t.id) }} style={S.actionBtn}>🗑️</button>
                <span style={{ color: '#d1d5db', fontSize: '1.2rem', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
              </>
            )}
          </div>
        </div>

        {/* Détail / éditeur */}
        {isExpanded && (
          <div style={{ marginTop: '0.875rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.875rem' }}>
            {isEditing ? (
              /* ── Mode édition ────────────────────────────── */
              <div onClick={e => e.stopPropagation()}>
                {editExercices.length === 0 && (
                  <p style={{ color: '#9ca3af', fontSize: '0.82rem', marginBottom: '0.5rem' }}>Aucun exercice — ajoutez-en ci-dessous.</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {editExercices.map((ex, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'white', borderRadius: 8, padding: '0.4rem 0.5rem', border: '1px solid #e5e7eb' }}>
                      <input value={ex.code || ''} onChange={e => updateEx(i, 'code', e.target.value)}
                        placeholder="Code" style={{ ...S.editInput, width: 52, fontFamily: 'monospace', fontWeight: '700', fontSize: '0.75rem', textAlign: 'center' }} />
                      <input value={ex.nom || ''} onChange={e => updateEx(i, 'nom', e.target.value)}
                        placeholder="Nom exercice" style={{ ...S.editInput, flex: 1 }} />
                      <input value={ex.series || ''} onChange={e => updateEx(i, 'series', e.target.value)}
                        placeholder="Séries" style={{ ...S.editInput, width: 52, textAlign: 'center' }} />
                      <input value={ex.repetitions || ''} onChange={e => updateEx(i, 'repetitions', e.target.value)}
                        placeholder="Reps" style={{ ...S.editInput, width: 52, textAlign: 'center' }} />
                      <input value={ex.recuperation || ''} onChange={e => updateEx(i, 'recuperation', e.target.value)}
                        placeholder="Récup" style={{ ...S.editInput, width: 60, textAlign: 'center' }} />
                      <button onClick={() => deleteEx(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.85rem', padding: '0.2rem', flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={addEx}
                  style={{ marginTop: '0.6rem', background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 8, padding: '0.4rem 0.75rem', fontSize: '0.8rem', color: '#6b7280', cursor: 'pointer', width: '100%' }}>
                  + Ajouter un exercice
                </button>
              </div>
            ) : (
              /* ── Mode lecture ────────────────────────────── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                {renderExercicesBlocs(t.exercices || [])}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={S.page} onClick={() => setMovingId(null)}>

      {/* Modal assignation */}
      {sendingTemplate && (
        <div style={S.overlay} onClick={() => setSendingTemplate(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <p style={S.modalLabel}>Envoyer le modèle</p>
                <p style={S.modalTitle}>{sendingTemplate.nom}</p>
              </div>
              <button onClick={() => setSendingTemplate(null)} style={S.closeBtn}>✕</button>
            </div>

            {assignDone ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</p>
                <p style={{ fontWeight: '700', color: '#333' }}>Séance ajoutée !</p>
              </div>
            ) : (
              <>
                <div style={S.clientList}>
                  {clients.length === 0 ? (
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>Aucun client.</p>
                  ) : (
                    clients.map(c => {
                      const progs = clientProgrammes[c.id] || []
                      const isChecked = selectedAssign[c.id] !== undefined
                      return (
                        <div key={c.id} style={{ ...S.clientRow, background: isChecked ? '#f0fdf4' : 'white', borderColor: isChecked ? '#bbf7d0' : '#f3f4f6' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: progs.length > 0 ? 'pointer' : 'default' }}
                            onClick={() => progs.length > 0 && toggleClient(c.id)}>
                            <div style={{
                              width: 20, height: 20, borderRadius: 6, border: `2px solid ${isChecked ? '#22c55e' : '#d1d5db'}`,
                              background: isChecked ? '#22c55e' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              {isChecked && <span style={{ color: 'white', fontSize: '0.7rem', fontWeight: '900' }}>✓</span>}
                            </div>
                            <div>
                              <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#333' }}>{c.prenom} {c.nom}</p>
                              {progs.length === 0 && <p style={{ margin: 0, fontSize: '0.72rem', color: '#ef4444' }}>Aucun cycle de training</p>}
                            </div>
                          </div>
                          {isChecked && progs.length > 1 && (
                            <select
                              value={selectedAssign[c.id] || ''}
                              onChange={e => setSelectedAssign(prev => ({ ...prev, [c.id]: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              style={{ marginLeft: 'auto', fontSize: '0.8rem', border: '1.5px solid #d1d5db', borderRadius: 8, padding: '0.3rem 0.5rem', background: 'white', color: '#374151', outline: 'none' }}>
                              {progs.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                            </select>
                          )}
                          {isChecked && progs.length === 1 && (
                            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', padding: '0.2rem 0.5rem', borderRadius: 6 }}>{progs[0].nom}</span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                <div style={S.modalFooter}>
                  <button onClick={() => setSendingTemplate(null)} style={S.secondaryBtn}>Annuler</button>
                  <button onClick={assignerTemplate} disabled={assignCount === 0 || assigning}
                    style={{ ...S.importBtn, opacity: assignCount === 0 ? 0.4 : 1 }}>
                    {assigning ? 'Envoi…' : `Envoyer à ${assignCount} client${assignCount > 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showImport && (
        <ImportExcel mode="template" onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); reloadTemplates() }} />
      )}

      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Modèles de séances</h1>
          <p style={S.subtitle}>{templates.length} modèle{templates.length > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowNewFolder(true)} style={S.secondaryBtn}>+ Dossier</button>
          <button onClick={() => setShowImport(true)} style={S.secondaryBtn}>⬆ Excel</button>
          <button onClick={nouvelleSeance} style={S.importBtn}>+ Nouvelle séance</button>
        </div>
      </div>

      {/* Créer dossier */}
      {showNewFolder && (
        <div style={{ background: 'white', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && creerDossier()}
            placeholder="Nom du dossier..." style={S.folderInput} />
          <button onClick={creerDossier} style={S.importBtn}>Créer</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} style={S.secondaryBtn}>✕</button>
        </div>
      )}

      {templates.length === 0 && allFolders.length === 0 ? (
        <div style={S.empty}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>📋</p>
          <p style={{ fontWeight: '700', color: '#374151', marginBottom: '0.35rem' }}>Aucun modèle</p>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem' }}>Crée ta première séance ou importe depuis Excel.</p>
          <button onClick={nouvelleSeance} style={S.importBtn}>+ Nouvelle séance</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Dossiers */}
          {allFolders.map(folderName => {
            const items = templates.filter(t => t.dossier === folderName)
            const isOpen = openFolders.has(folderName)
            return (
              <div key={folderName} style={S.folderBlock}>
                <div style={S.folderHeader} onClick={() => toggleFolder(folderName)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
                    <span style={{ fontSize: '1rem' }}>{isOpen ? '📂' : '📁'}</span>
                    {renamingFolder === folderName ? (
                      <input autoFocus value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renommerDossier(folderName, renameVal); if (e.key === 'Escape') setRenamingFolder(null) }}
                        onBlur={() => renommerDossier(folderName, renameVal)}
                        onClick={e => e.stopPropagation()}
                        style={{ ...S.folderInput, flex: 1 }} />
                    ) : (
                      <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#333333' }}>{folderName}</span>
                    )}
                    <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{items.length} modèle{items.length > 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setRenamingFolder(folderName); setRenameVal(folderName) }} style={S.folderActionBtn}>✏️</button>
                    <button onClick={() => supprimerDossier(folderName)} style={S.folderActionBtn}>🗑️</button>
                    <span style={{ color: '#d1d5db', fontSize: '1.1rem', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', cursor: 'pointer' }}
                      onClick={() => toggleFolder(folderName)}>›</span>
                  </div>
                </div>
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0.75rem 0.75rem' }}>
                    {items.length === 0 ? (
                      <p style={{ color: '#9ca3af', fontSize: '0.82rem', textAlign: 'center', padding: '0.75rem 0' }}>Dossier vide — déplace un modèle ici via 📁</p>
                    ) : (
                      items.map(t => renderTemplate(t))
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Sans dossier */}
          {sansDossier.length > 0 && (
            <div>
              {allFolders.length > 0 && (
                <p style={{ fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.6rem' }}>Sans dossier</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {sansDossier.map(t => renderTemplate(t))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const S = {
  page:           { padding: '2rem', maxWidth: '700px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered:       { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:         { marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:          { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle:       { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  importBtn:      { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  secondaryBtn:   { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.6rem 0.875rem', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  folderInput:    { padding: '0.45rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  empty:          { background: 'white', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  folderBlock:    { background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  folderHeader:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.1rem', cursor: 'pointer', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' },
  folderActionBtn:{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem' },
  card:           { background: '#f9fafb', borderRadius: 10, padding: '0.875rem 1rem', border: '1px solid #f0f0f0' },
  nom:            { fontWeight: '700', fontSize: '0.92rem', color: '#333333', margin: 0 },
  meta:           { color: '#9ca3af', fontSize: '0.75rem', margin: '0.15rem 0 0' },
  actionBtn:      { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.3rem' },
  actionBtnSolid: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.35rem 0.65rem', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  moveDropdown:   { position: 'absolute', right: 0, top: '100%', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 180, marginTop: 4 },
  moveItem:       { padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#374151', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid #f9fafb' },
  exRow:          { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' },
  codeTag:        { background: '#333333', color: '#e4f816', padding: '0.1rem 0.4rem', borderRadius: 5, fontSize: '0.68rem', fontWeight: '800', flexShrink: 0 },
  exNom:          { fontSize: '0.82rem', fontWeight: '600', color: '#374151' },
  chip:           { background: '#e5e7eb', color: '#6b7280', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '600' },
  editInput:      { padding: '0.3rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: '0.83rem', color: '#333', outline: 'none', boxSizing: 'border-box' },
  // Modal assignation
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modal:          { background: 'white', borderRadius: 18, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid #f3f4f6' },
  modalLabel:     { fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 0.2rem' },
  modalTitle:     { fontSize: '1rem', fontWeight: '800', color: '#333333', margin: 0 },
  closeBtn:       { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', padding: '0.1rem', lineHeight: 1 },
  clientList:     { flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  clientRow:      { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: 10, border: '1.5px solid #f3f4f6', transition: 'all 0.15s' },
  modalFooter:    { padding: '1rem 1.25rem', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
}
