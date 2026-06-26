import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SeanceAIModal from '../components/SeanceAIModal'

export default function CycleTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'edit'
  const [current, setCurrent] = useState(null) // template en cours d'édition
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showAI, setShowAI] = useState(false)

  // ── Envoyer à un client ──────────────────────────────────────────────────────
  const [sendModal, setSendModal] = useState(null) // template à envoyer
  const [clients, setClients] = useState([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [sendForm, setSendForm] = useState({ client_id: '', date_debut: '', nom: '' })
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(null) // nom du client
  const [sendMode, setSendMode] = useState('nouveau') // 'nouveau' | 'ecraser'
  const [clientProgrammes, setClientProgrammes] = useState([])
  const [programmeToOverwrite, setProgrammeToOverwrite] = useState(null)
  const [loadingProgrammes, setLoadingProgrammes] = useState(false)

  // ── Dossiers ─────────────────────────────────────────────────────────────────
  const [openFolders, setOpenFolders]     = useState(new Set())
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingFolder, setRenamingFolder] = useState(null)
  const [renameVal, setRenameVal]         = useState('')
  const [movingId, setMovingId]           = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('programme_templates')
      .select('*, programme_template_seances(*)')
      .order('created_at', { ascending: false })
    const list = data || []
    setTemplates(list)
    const folders = [...new Set(list.map(t => t.dossier).filter(Boolean))]
    setOpenFolders(new Set(folders))
    setLoading(false)
  }, [])

  function toggleFolder(name) {
    setOpenFolders(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  function creerDossier() {
    if (!newFolderName.trim()) return
    setOpenFolders(prev => new Set([...prev, newFolderName.trim()]))
    setShowNewFolder(false)
    setNewFolderName('')
  }

  async function renommerDossier(oldName, newName) {
    if (!newName.trim() || newName === oldName) { setRenamingFolder(null); return }
    await supabase.from('programme_templates').update({ dossier: newName.trim() }).eq('dossier', oldName)
    setTemplates(prev => prev.map(t => t.dossier === oldName ? { ...t, dossier: newName.trim() } : t))
    setOpenFolders(prev => { const n = new Set(prev); n.delete(oldName); n.add(newName.trim()); return n })
    setRenamingFolder(null)
  }

  async function supprimerDossier(name) {
    if (!window.confirm(`Supprimer le dossier "${name}" ? Les templates seront déplacés dans "Sans dossier".`)) return
    await supabase.from('programme_templates').update({ dossier: null }).eq('dossier', name)
    setTemplates(prev => prev.map(t => t.dossier === name ? { ...t, dossier: null } : t))
    setOpenFolders(prev => { const n = new Set(prev); n.delete(name); return n })
  }

  async function deplacerDansFolder(templateId, dossier) {
    await supabase.from('programme_templates').update({ dossier: dossier || null }).eq('id', templateId)
    setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, dossier: dossier || null } : t))
    setMovingId(null)
  }

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

  // Sauvegarde un cycle généré par l'IA comme template
  async function handleAICycleSave(cycle) {
    // Créer le template
    const { data: tmpl, error: tmplErr } = await supabase
      .from('programme_templates')
      .insert({ nom: cycle.nom, semaines: cycle.semaines, description: cycle.note_ia || '' })
      .select().single()
    if (tmplErr) throw tmplErr

    // Créer les séances du template
    let ordre = 0
    for (const s of (cycle.seances || [])) {
      await supabase.from('programme_template_seances').insert({
        template_id: tmpl.id,
        nom: s.nom,
        jour: ordre + 1,
        ordre: ordre++,
        exercices: s.exercices || [],
      })
    }
    await load()
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
    setSendMode('nouveau')
    setClientProgrammes([])
    setProgrammeToOverwrite(null)
    setClientsLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('id, prenom, nom, offre')
      .order('nom')
    setClients(data || [])
    setClientsLoading(false)
  }

  async function fetchClientProgrammes(clientId) {
    setLoadingProgrammes(true)
    setProgrammeToOverwrite(null)
    const { data } = await supabase
      .from('programmes')
      .select('id, nom, semaines, date_debut')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setClientProgrammes(data || [])
    setLoadingProgrammes(false)
  }

  async function sendToClient() {
    if (!sendForm.client_id || !sendModal) return
    if (sendMode === 'ecraser' && !programmeToOverwrite) return
    setSending(true)

    let progId

    if (sendMode === 'nouveau') {
      const { data: prog, error } = await supabase
        .from('programmes')
        .insert({ nom: sendForm.nom || sendModal.nom, semaines: sendModal.semaines, client_id: sendForm.client_id, date_debut: sendForm.date_debut || null })
        .select().single()
      if (error) { alert(error.message); setSending(false); return }
      progId = prog.id
    } else {
      // Écraser le cycle existant
      progId = programmeToOverwrite.id
      await supabase.from('programmes')
        .update({ nom: sendForm.nom || sendModal.nom, semaines: sendModal.semaines, date_debut: sendForm.date_debut || programmeToOverwrite.date_debut })
        .eq('id', progId)
      // Supprimer les séances existantes (exercices supprimés en cascade)
      const { data: oldSeances } = await supabase.from('seances').select('id').eq('programme_id', progId)
      const oldIds = (oldSeances || []).map(s => s.id)
      if (oldIds.length > 0) {
        await supabase.from('exercices').delete().in('seance_id', oldIds)
        await supabase.from('seances').delete().eq('programme_id', progId)
      }
    }

    // Insérer les séances du template
    const seances = [...(sendModal.programme_template_seances || [])].sort((a, b) => a.jour - b.jour || a.ordre - b.ordre)
    for (const [idx, ts] of seances.entries()) {
      const { data: newSeance } = await supabase
        .from('seances')
        .insert({ programme_id: progId, nom: ts.nom, ordre: ts.ordre || idx + 1, echauffement: ts.echauffement || [] })
        .select().single()
      if (newSeance && ts.exercices?.length > 0) {
        await supabase.from('exercices').insert(
          ts.exercices.map(ex => ({
            seance_id: newSeance.id,
            code: ex.code, nom: ex.nom, series: ex.series,
            repetitions: ex.repetitions, tempo: ex.tempo,
            recuperation: ex.recuperation, type_intensite: ex.type_intensite,
            valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
            bibliotheque_id: ex.bibliotheque_id || null,
            progressions: ex.progressions || null,
            series_echauffement: ex.series_echauffement || null,
            media_url: ex.media_url || null,
          }))
        )
      }
      const rpeCibles = ts.rpe_cibles || {}
      if (newSeance && Object.keys(rpeCibles).length > 0) {
        await supabase.from('rpe_seances').insert(
          Object.entries(rpeCibles).map(([sem, val]) => ({ seance_id: newSeance.id, semaine: parseInt(sem), rpe_cible: val }))
        )
      }
    }

    const client = clients.find(c => c.id === sendForm.client_id)
    setSendSuccess(`${client?.prenom} ${client?.nom}`)
    setSending(false)
    setTimeout(() => { setSendModal(null); navigate(`/programme/${progId}`) }, 1500)
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

  // ── Gestion exercices dans le template ──────────────────────────────────────
  const [expandedSeances, setExpandedSeances] = useState(new Set())

  function toggleExpandSeance(idx) {
    setExpandedSeances(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function addExToSeance(seanceIdx) {
    setCurrent(p => {
      const seances = [...p.programme_template_seances]
      const exs = seances[seanceIdx].exercices || []
      const lastCode = exs.length > 0 ? exs[exs.length - 1].code || '' : ''
      seances[seanceIdx] = {
        ...seances[seanceIdx],
        exercices: [...exs, { code: lastCode, nom: '', series: '', repetitions: '', tempo: '', recuperation: '', type_intensite: '', valeur_intensite: '', media_url: '', ordre: exs.length + 1 }],
      }
      return { ...p, programme_template_seances: seances }
    })
  }

  function updateExInSeance(seanceIdx, exIdx, field, val) {
    setCurrent(p => {
      const seances = [...p.programme_template_seances]
      const exs = [...(seances[seanceIdx].exercices || [])]
      exs[exIdx] = { ...exs[exIdx], [field]: val }
      seances[seanceIdx] = { ...seances[seanceIdx], exercices: exs }
      return { ...p, programme_template_seances: seances }
    })
  }

  function removeExFromSeance(seanceIdx, exIdx) {
    setCurrent(p => {
      const seances = [...p.programme_template_seances]
      seances[seanceIdx] = {
        ...seances[seanceIdx],
        exercices: (seances[seanceIdx].exercices || []).filter((_, i) => i !== exIdx),
      }
      return { ...p, programme_template_seances: seances }
    })
  }

  // ─── LISTE ───────────────────────────────────────────────────────────────────
  if (view === 'list') {
    const allFolders = [...new Set([...openFolders, ...templates.map(t => t.dossier).filter(Boolean)])].sort()
    const sansDossier = templates.filter(t => !t.dossier)
    const folderOptions = [...new Set(templates.map(t => t.dossier).filter(Boolean))].sort()

    function renderCard(t) {
      return (
        <div key={t.id} style={S.card}>
          <div style={S.cardHeader}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.cardTitle}>{t.nom}</div>
              {t.description && <div style={S.cardDesc}>{t.description}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
              <div style={S.badge}>{t.semaines} sem.</div>
              {/* Bouton déplacer */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => { e.stopPropagation(); setMovingId(movingId === t.id ? null : t.id) }}
                  style={{ ...S.btnIcon, color: movingId === t.id ? '#6366f1' : '#9ca3af' }}
                  title="Déplacer dans un dossier"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </button>
                {movingId === t.id && (
                  <div style={S.moveDropdown} onClick={e => e.stopPropagation()}>
                    <div style={S.moveItem} onClick={() => deplacerDansFolder(t.id, null)}>
                      <span style={{ opacity: 0.5 }}>— Sans dossier</span>
                    </div>
                    {folderOptions.map(f => (
                      <div key={f} style={{ ...S.moveItem, fontWeight: t.dossier === f ? '700' : '500' }} onClick={() => deplacerDansFolder(t.id, f)}>
                        {t.dossier === f ? '✓ ' : ''}{f}
                      </div>
                    ))}
                    <div style={{ padding: '0.4rem 0.65rem', borderTop: '1px solid #f3f4f6' }}>
                      <input autoFocus placeholder="Nouveau dossier…"
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
            </div>
          </div>
          <div style={S.cardStats}>
            <span style={S.stat}>
              {(t.programme_template_seances || []).length} séance{(t.programme_template_seances || []).length > 1 ? 's' : ''}
            </span>
            <span style={S.stat}>{t.semaines} sem.</span>
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
      )
    }

    return (
      <div style={S.page} onClick={() => setMovingId(null)}>
        <div style={S.header}>
          <div>
            <div style={S.title}>Templates de cycles</div>
            <div style={S.subtitle}>{templates.length} template{templates.length > 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button style={S.btnSecondary} onClick={() => setShowNewFolder(true)}>+ Dossier</button>
            <button style={S.btnAI} onClick={() => setShowAI(true)}>✨ IA</button>
            <button style={S.btnPrimary} onClick={newTemplate}>+ Nouveau template</button>
          </div>
        </div>

        {showAI && (
          <SeanceAIModal
            defaultMode="cycle"
            onClose={() => setShowAI(false)}
            onCycleGenerated={handleAICycleSave}
            onCycleDone={() => setShowAI(false)}
          />
        )}

        {/* Créer dossier */}
        {showNewFolder && (
          <div style={{ background: 'white', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }}>
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creerDossier()}
              placeholder="Nom du dossier…"
              style={{ flex: 1, padding: '0.45rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }} />
            <button onClick={creerDossier} style={S.btnPrimary}>Créer</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} style={S.btnSecondary}>✕</button>
          </div>
        )}

        {loading ? (
          <div style={S.empty}>Chargement…</div>
        ) : templates.length === 0 && allFolders.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
            <div style={{ fontWeight: '600', color: '#374151', marginBottom: '0.25rem' }}>Aucun template</div>
            <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Crée un template de cycle pour l'appliquer rapidement à tes clients</div>
            <button style={{ ...S.btnPrimary, marginTop: '1.25rem' }} onClick={newTemplate}>Créer un template</button>
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isOpen ? '#e4f816' : 'none'} stroke={isOpen ? '#333' : '#6b7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      {renamingFolder === folderName ? (
                        <input autoFocus value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renommerDossier(folderName, renameVal); if (e.key === 'Escape') setRenamingFolder(null) }}
                          onBlur={() => renommerDossier(folderName, renameVal)}
                          onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '0.25rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.875rem', outline: 'none' }} />
                      ) : (
                        <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#111827' }}>{folderName}</span>
                      )}
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{items.length} template{items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setRenamingFolder(folderName); setRenameVal(folderName) }} style={S.btnIcon} title="Renommer">✏️</button>
                      <button onClick={() => supprimerDossier(folderName)} style={S.btnIcon} title="Supprimer le dossier">🗑️</button>
                      <span style={{ color: '#d1d5db', fontSize: '1.1rem', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', cursor: 'pointer' }}
                        onClick={() => toggleFolder(folderName)}>›</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '0.75rem', background: 'white' }}>
                      {items.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: '0.82rem', textAlign: 'center', padding: '0.75rem 0' }}>Dossier vide — déplace un template ici via l'icône dossier</p>
                      ) : (
                        <div style={S.grid}>{items.map(t => renderCard(t))}</div>
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
                <div style={S.grid}>{sansDossier.map(t => renderCard(t))}</div>
              </div>
            )}
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
                  {sendMode === 'ecraser' ? 'Cycle mis à jour !' : 'Cycle envoyé !'}
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  « {sendModal.nom} » {sendMode === 'ecraser' ? 'a été appliqué à' : 'a été créé pour'} <strong>{sendSuccess}</strong>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.25rem' }}>
                      {clients.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSendForm(f => ({ ...f, client_id: c.id })); fetchClientProgrammes(c.id) }}
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

                {/* Mode : nouveau cycle ou écraser l'existant */}
                {sendForm.client_id && (
                  <div style={S.formGroup}>
                    <label style={S.label}>Mode d'application</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[
                        { key: 'nouveau',  label: '✨ Nouveau cycle' },
                        { key: 'ecraser', label: '🔄 Écraser le cycle actuel' },
                      ].map(m => (
                        <button
                          key={m.key}
                          onClick={() => setSendMode(m.key)}
                          style={{
                            flex: 1, padding: '0.55rem 0.5rem', borderRadius: '10px', border: '1.5px solid',
                            fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer',
                            borderColor: sendMode === m.key ? '#1a1a1a' : '#e5e7eb',
                            background: sendMode === m.key ? '#1a1a1a' : 'white',
                            color: sendMode === m.key ? '#e4f816' : '#374151',
                          }}
                        >{m.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Picker du cycle à écraser */}
                {sendMode === 'ecraser' && sendForm.client_id && (
                  <div style={S.formGroup}>
                    <label style={S.label}>Cycle à remplacer *</label>
                    {loadingProgrammes ? (
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '0.4rem 0' }}>Chargement…</div>
                    ) : clientProgrammes.length === 0 ? (
                      <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: '0.4rem 0' }}>Ce client n'a pas encore de cycle.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '160px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.25rem' }}>
                        {clientProgrammes.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setProgrammeToOverwrite(p)}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '0.6rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left',
                              background: programmeToOverwrite?.id === p.id ? '#1a1a1a' : 'transparent',
                            }}
                          >
                            <span style={{ fontWeight: '600', fontSize: '0.875rem', color: programmeToOverwrite?.id === p.id ? '#e4f816' : '#111827' }}>
                              {p.nom}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: programmeToOverwrite?.id === p.id ? 'rgba(228,248,22,0.7)' : '#6b7280' }}>
                              {p.semaines} sem.
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {programmeToOverwrite && (
                      <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: '0.4rem', padding: '0.4rem 0.75rem', background: '#fef3c7', borderRadius: '8px' }}>
                        ⚠️ Les séances et exercices de « {programmeToOverwrite.nom} » seront effacés et remplacés par le template.
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button onClick={() => setSendModal(null)} style={{ ...S.btnSecondary, flex: 1 }}>Annuler</button>
                  <button
                    onClick={sendToClient}
                    disabled={!sendForm.client_id || sending || (sendMode === 'ecraser' && !programmeToOverwrite)}
                    style={{
                      ...S.btnPrimary, flex: 2,
                      opacity: (!sendForm.client_id || sending || (sendMode === 'ecraser' && !programmeToOverwrite)) ? 0.5 : 1,
                      cursor: (!sendForm.client_id || sending || (sendMode === 'ecraser' && !programmeToOverwrite)) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending
                      ? (sendMode === 'ecraser' ? 'Mise à jour…' : 'Création en cours…')
                      : sendMode === 'ecraser' ? '🔄 Écraser le cycle' : '📤 Envoyer le cycle'}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {current.programme_template_seances.map((s, idx) => {
            const isOpen = expandedSeances.has(idx)
            const exs = s.exercices || []
            return (
              <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                {/* Ligne séance */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#fafafa' }}>
                  <div style={S.seanceNum}>J{s.jour}</div>
                  <input style={{ ...S.input, flex: 1, marginBottom: 0 }} value={s.nom}
                    onChange={e => updateSeance(idx, 'nom', e.target.value)}
                    placeholder="Nom de la séance" />
                  <input style={{ ...S.input, width: '60px', marginBottom: 0, textAlign: 'center' }} type="number" min={1}
                    value={s.jour} onChange={e => updateSeance(idx, 'jour', parseInt(e.target.value) || 1)}
                    title="Jour" />
                  <button
                    onClick={() => toggleExpandSeance(idx)}
                    style={{ ...S.btnSecondary, padding: '0.4rem 0.6rem', fontSize: '0.78rem', marginBottom: 0, whiteSpace: 'nowrap' }}>
                    {isOpen ? '▲' : '▼'} {exs.length} ex.
                  </button>
                  <button style={S.btnRemove} onClick={() => removeSeance(idx)}>✕</button>
                </div>

                {/* Exercices expandables */}
                {isOpen && (
                  <div style={{ padding: '0.75rem', background: 'white', borderTop: '1px solid #f3f4f6' }}>
                    {exs.length === 0 && (
                      <p style={{ fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic', margin: '0 0 0.5rem' }}>
                        Aucun exercice — ajoute-en ci-dessous.
                      </p>
                    )}
                    {exs.map((ex, ei) => (
                      <div key={ei} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', marginBottom: '0.5rem', padding: '0.5rem 0.6rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <button onClick={() => removeExFromSeance(idx, ei)}
                          style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '0.85rem', padding: '0 2px', flexShrink: 0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                        <input value={ex.code} onChange={e => updateExInSeance(idx, ei, 'code', e.target.value)}
                          placeholder="A1" style={{ ...S.input, width: '52px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.82rem' }} />
                        <input value={ex.nom} onChange={e => updateExInSeance(idx, ei, 'nom', e.target.value)}
                          placeholder="Exercice" style={{ ...S.input, flex: 2, minWidth: '120px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.82rem' }} />
                        <input value={ex.series} onChange={e => updateExInSeance(idx, ei, 'series', e.target.value)}
                          placeholder="Séries" style={{ ...S.input, width: '58px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.82rem' }} type="number" />
                        <input value={ex.repetitions} onChange={e => updateExInSeance(idx, ei, 'repetitions', e.target.value)}
                          placeholder="Reps" style={{ ...S.input, width: '64px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.82rem' }} />
                        <input value={ex.tempo} onChange={e => updateExInSeance(idx, ei, 'tempo', e.target.value)}
                          placeholder="Tempo" style={{ ...S.input, width: '72px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.82rem' }} />
                        <input value={ex.recuperation} onChange={e => updateExInSeance(idx, ei, 'recuperation', e.target.value)}
                          placeholder="Récup" style={{ ...S.input, width: '64px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.82rem' }} />
                        <select value={ex.type_intensite} onChange={e => updateExInSeance(idx, ei, 'type_intensite', e.target.value)}
                          style={{ ...S.input, width: '82px', marginBottom: 0, padding: '0.3rem 0.35rem', fontSize: '0.78rem' }}>
                          <option value="">Intensité</option>
                          <option value="RPE">RPE</option>
                          <option value="RIR">RIR</option>
                          <option value="% 1RM">% 1RM</option>
                          <option value="Vitesse">Vitesse</option>
                          <option value="Libre">Libre</option>
                        </select>
                        <input value={ex.valeur_intensite} onChange={e => updateExInSeance(idx, ei, 'valeur_intensite', e.target.value)}
                          placeholder="Val." style={{ ...S.input, width: '52px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.82rem' }} />
                        <input value={ex.media_url || ''} onChange={e => updateExInSeance(idx, ei, 'media_url', e.target.value)}
                          placeholder="URL média" style={{ ...S.input, flex: 3, minWidth: '120px', marginBottom: 0, padding: '0.3rem 0.45rem', fontSize: '0.78rem', color: '#6366f1' }} />
                      </div>
                    ))}
                    <button onClick={() => addExToSeance(idx)}
                      style={{ ...S.btnSecondary, fontSize: '0.78rem', padding: '0.35rem 0.75rem', marginTop: '0.25rem' }}>
                      + Exercice
                    </button>
                  </div>
                )}
              </div>
            )
          })}
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
  btnAI:      { background: '#111827', color: '#e4f816', border: '1.5px solid rgba(228,248,22,0.35)', borderRadius: '8px', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: '500', cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer' },
  btnDanger: { background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', cursor: 'pointer' },
  btnRemove: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem' },
  btnBack: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer', padding: '0.5rem 0' },
  btnIcon: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.3rem', color: '#9ca3af' },
  folderBlock: { background: '#f9fafb', borderRadius: 14, overflow: 'visible', border: '1px solid #e5e7eb' },
  folderHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.1rem', cursor: 'pointer', background: '#f3f4f6', borderRadius: '14px 14px 0 0', borderBottom: '1px solid #e5e7eb' },
  moveDropdown: { position: 'absolute', right: 0, top: '100%', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 180, marginTop: 4 },
  moveItem: { padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#374151', fontWeight: '500', cursor: 'pointer', borderBottom: '1px solid #f9fafb' },
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
