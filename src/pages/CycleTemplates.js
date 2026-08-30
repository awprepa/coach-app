import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SeanceAIModal from '../components/SeanceAIModal'

export default function CycleTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showAI, setShowAI] = useState(false)
  const [ouvrantId, setOuvrantId] = useState(null) // template en cours de matérialisation en brouillon

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

  // ── Aperçu cycle ─────────────────────────────────────────────────────────────
  const [previewCycleId, setPreviewCycleId]       = useState(null)
  const [openPreviewSeances, setOpenPreviewSeances] = useState(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('programme_templates')
      .select('*, programme_template_seances(*)')
      .order('created_at', { ascending: false })
    const list = data || []
    setTemplates(list)
    setOpenFolders(new Set())
    setLoading(false)
  }, [])

  function toggleFolder(name) {
    setOpenFolders(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

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

  function togglePreview(id) {
    setPreviewCycleId(prev => prev === id ? null : id)
    setOpenPreviewSeances(new Set())
  }

  function togglePreviewSeance(key) {
    setOpenPreviewSeances(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
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

  // Insère les séances (+ exercices + RPE cibles) d'un template dans un programme
  // réel déjà créé — logique partagée entre l'envoi à un client et l'ouverture
  // du brouillon bibliothèque, pour que les deux matérialisent les données de la
  // même façon (cardio compris).
  async function materialiserSeances(templateSeancesRaw, programmeId) {
    const seances = [...(templateSeancesRaw || [])].sort((a, b) => a.jour - b.jour || a.ordre - b.ordre)
    for (const [idx, ts] of seances.entries()) {
      const { data: newSeance } = await supabase
        .from('seances')
        .insert({
          programme_id: programmeId, nom: ts.nom, ordre: ts.ordre || idx + 1, echauffement: ts.echauffement || [],
          cardio_debut: ts.cardio_debut || null, cardio_fin: ts.cardio_fin || null, cardio_blocs: ts.cardio_blocs || [],
        })
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
  }

  // Crée un nouveau template vide + son brouillon d'édition, et ouvre directement
  // ce brouillon dans le vrai éditeur de cycle (Programme.js / Seance.js).
  async function creerTemplate() {
    const { data: tpl, error } = await supabase
      .from('programme_templates')
      .insert({ nom: 'Nouveau cycle', semaines: 8, description: '' })
      .select().single()
    if (error) { alert(error.message); return }
    const { data: draft, error: e2 } = await supabase
      .from('programmes')
      .insert({ nom: tpl.nom, semaines: tpl.semaines, bibliotheque_template_id: tpl.id })
      .select().single()
    if (e2) { alert(e2.message); return }
    navigate(`/programme/${draft.id}`)
  }

  // "Modifier" un template existant : rouvre son brouillon s'il existe déjà,
  // sinon le matérialise à partir des données du template (première ouverture,
  // ou template créé par l'IA / migré depuis un ancien template sans brouillon).
  async function ouvrirDraft(t) {
    setOuvrantId(t.id)
    try {
      const { data: existing } = await supabase
        .from('programmes').select('id').eq('bibliotheque_template_id', t.id).maybeSingle()
      if (existing) { navigate(`/programme/${existing.id}`); return }

      const { data: draft, error } = await supabase
        .from('programmes')
        .insert({ nom: t.nom, semaines: t.semaines, bibliotheque_template_id: t.id })
        .select().single()
      if (error) { alert(error.message); return }
      await materialiserSeances(t.programme_template_seances, draft.id)
      navigate(`/programme/${draft.id}`)
    } finally {
      setOuvrantId(null)
    }
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
    await materialiserSeances(sendModal.programme_template_seances, progId)

    const client = clients.find(c => c.id === sendForm.client_id)
    setSendSuccess(`${client?.prenom} ${client?.nom}`)
    setSending(false)
    setTimeout(() => { setSendModal(null); navigate(`/programme/${progId}`) }, 1500)
  }

  // ─── LISTE ───────────────────────────────────────────────────────────────────
  {
    const allFolders = [...new Set([...openFolders, ...templates.map(t => t.dossier).filter(Boolean)])].sort()
    const sansDossier = templates.filter(t => !t.dossier)
    const folderOptions = [...new Set(templates.map(t => t.dossier).filter(Boolean))].sort()

    function renderCard(t) {
      const isPreviewed = previewCycleId === t.id
      return (
        <div key={t.id} style={S.card}>
          <div style={{ ...S.cardHeader, cursor: 'pointer' }} onClick={() => togglePreview(t.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.cardTitle}>{t.nom}</div>
              {t.description && <div style={S.cardDesc}>{t.description}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
              <span style={{ color: '#d1d5db', fontSize: '1.1rem', transform: isPreviewed ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
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
                    {allFolders.map(f => (
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

          {/* ── Panel aperçu séances ── */}
          {isPreviewed && (() => {
            const seances = [...(t.programme_template_seances || [])].sort((a, b) => (a.jour - b.jour) || (a.ordre - b.ordre))
            return (
              <div style={{ borderTop: '1px solid #f3f4f6', background: '#fafafa' }}>
                {seances.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: '0.78rem', textAlign: 'center', padding: '0.75rem' }}>Aucune séance dans ce cycle</p>
                ) : seances.map((s, idx) => {
                  const key = s.id || idx
                  const seanceOpen = openPreviewSeances.has(key)
                  const exs = s.exercices || []
                  return (
                    <div key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div
                        onClick={e => { e.stopPropagation(); togglePreviewSeance(key) }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.875rem', cursor: 'pointer' }}
                      >
                        <span style={{ background: '#e5e7eb', color: '#374151', fontSize: '0.63rem', fontWeight: 700, borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>J{s.jour}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>{s.nom || `Séance ${idx + 1}`}</span>
                        <span style={{ color: '#9ca3af', fontSize: '0.7rem', flexShrink: 0 }}>{exs.length} ex.</span>
                        <span style={{ color: '#d1d5db', fontSize: '1rem', transform: seanceOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>›</span>
                      </div>
                      {seanceOpen && (
                        <div style={{ padding: '0.25rem 0.875rem 0.6rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          {exs.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: '0.72rem', padding: '0.25rem 0' }}>Séance vide</p>
                          ) : (() => {
                            const items = []
                            let prevBloc = null
                            exs.forEach((ex, ei) => {
                              const bloc = blocLetter(ex.code)
                              if (bloc && bloc !== prevBloc) {
                                const color = blocColor(bloc)
                                items.push(
                                  <div key={`hdr-${ei}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: ei > 0 ? '0.5rem' : 0, marginBottom: '0.05rem' }}>
                                    <span style={{ background: color, color: 'white', fontSize: '0.55rem', fontWeight: '800', borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>Bloc {bloc}</span>
                                    <div style={{ flex: 1, height: 1, background: color, opacity: 0.25 }} />
                                  </div>
                                )
                                prevBloc = bloc
                              }
                              const color = bloc ? blocColor(bloc) : null
                              items.push(
                                <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.28rem 0.4rem', borderLeft: `3px solid ${color || '#e5e7eb'}`, borderRadius: '0 3px 3px 0' }}>
                                  {ex.code && <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.62rem', fontWeight: 700, borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{ex.code}</span>}
                                  <span style={{ flex: 1, fontSize: '0.78rem', color: '#374151' }}>{ex.nom || '—'}</span>
                                  <span style={{ fontSize: '0.68rem', color: '#6b7280', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                    {[ex.series && `${ex.series}×`, ex.repetitions, ex.tempo && `@${ex.tempo}`].filter(Boolean).join(' ')}
                                  </span>
                                </div>
                              )
                            })
                            return items
                          })()}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          <div style={S.cardActions}>
            <button style={S.btnPrimary} onClick={() => openSendModal(t)}>📤 Envoyer</button>
            <button style={S.btnSecondary} onClick={() => ouvrirDraft(t)} disabled={ouvrantId === t.id}>
              {ouvrantId === t.id ? 'Ouverture…' : 'Modifier'}
            </button>
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
            <button style={S.btnPrimary} onClick={creerTemplate}>+ Nouveau template</button>
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
            <button style={{ ...S.btnPrimary, marginTop: '1.25rem' }} onClick={creerTemplate}>Créer un template</button>
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
                      <button onClick={() => { setRenamingFolder(folderName); setRenameVal(folderName) }} style={S.btnIcon} title="Renommer">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onClick={() => supprimerDossier(folderName)} style={S.btnIcon} title="Supprimer le dossier">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
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
