import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SeanceAIModal from '../components/SeanceAIModal'
import ClientPicker from '../components/ClientPicker'
import Icon from '../components/Icon'
import { copierSeanceModele, copiesDuModele, mettreAJourCopies, seancesManquantes } from '../utils/cyclesModeles'

export default function CycleTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showAI, setShowAI] = useState(false)
  const [ouvrantId, setOuvrantId] = useState(null) // template en cours de matérialisation en brouillon

  // ── Envoyer à un client ──────────────────────────────────────────────────────
  const [sendModal, setSendModal] = useState(null) // template à envoyer
  const [selectedClient, setSelectedClient] = useState(null) // client choisi via ClientPicker
  const [sendForm, setSendForm] = useState({ client_id: '', date_debut: '', nom: '' })
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(null) // nom du client
  const [sendMode, setSendMode] = useState('nouveau') // 'nouveau' | 'ecraser'
  const [clientProgrammes, setClientProgrammes] = useState([])
  const [programmeToOverwrite, setProgrammeToOverwrite] = useState(null)
  const [loadingProgrammes, setLoadingProgrammes] = useState(false)
  // ── Mettre à jour les cycles déjà envoyés (ajout des nouvelles séances) ──
  const [majModal, setMajModal] = useState(null) // { template, copies, enCours, rapport }

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
      try { await copierSeanceModele(programmeId, ts, ts.ordre || idx + 1) }
      catch (err) { console.error('[CycleTemplates] séance non copiée :', err.message) }
    }
  }

  async function ouvrirMaj(t) {
    setMajModal({ template: t, copies: null, enCours: false, rapport: null })
    const copies = await copiesDuModele(t.id)
    setMajModal(m => m && m.template.id === t.id ? { ...m, copies } : m)
  }
  async function appliquerMaj() {
    setMajModal(m => ({ ...m, enCours: true }))
    try {
      const rapport = await mettreAJourCopies(majModal.template.id)
      setMajModal(m => ({ ...m, enCours: false, rapport }))
    } catch (err) {
      alert('La mise à jour a échoué : ' + err.message)
      setMajModal(m => ({ ...m, enCours: false }))
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

  function openSendModal(t) {
    setSendModal(t)
    setSendForm({ client_id: '', date_debut: '', nom: t.nom })
    setSelectedClient(null)
    setSendSuccess(null)
    setSendMode('nouveau')
    setClientProgrammes([])
    setProgrammeToOverwrite(null)
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
        .insert({ nom: sendForm.nom || sendModal.nom, semaines: sendModal.semaines, client_id: sendForm.client_id, date_debut: sendForm.date_debut || null, modele_id: sendModal.id })
        .select().single()
      if (error) { alert(error.message); setSending(false); return }
      progId = prog.id
    } else {
      // Écraser le cycle existant
      progId = programmeToOverwrite.id
      await supabase.from('programmes')
        .update({ nom: sendForm.nom || sendModal.nom, semaines: sendModal.semaines, date_debut: sendForm.date_debut || programmeToOverwrite.date_debut, modele_id: sendModal.id })
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

    setSendSuccess(`${selectedClient?.prenom} ${selectedClient?.nom}`)
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
      const nbSeances = (t.programme_template_seances || []).length
      return (
        <div key={t.id} style={S.card}>
          <div role="button" tabIndex={0} style={{ ...S.cardHeader, cursor: 'pointer' }} onClick={() => togglePreview(t.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.cardTitle}>{t.nom}</div>
              {t.description && <div style={S.cardDesc}>{t.description}</div>}
              <div style={S.cardStats}>
                {t.semaines} semaine{t.semaines > 1 ? 's' : ''} · {nbSeances} séance{nbSeances > 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {/* Bouton déplacer */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => { e.stopPropagation(); setMovingId(movingId === t.id ? null : t.id) }}
                  style={{ ...S.btnIcon, color: movingId === t.id ? '#333333' : '#6b7280' }}
                  title="Déplacer dans un dossier" aria-label="Déplacer dans un dossier"
                >
                  <Icon name="folder" size={14} />
                </button>
                {movingId === t.id && (
                  <div style={S.moveDropdown} onClick={e => e.stopPropagation()}>
                    <div role="button" tabIndex={0} style={S.moveItem} onClick={() => deplacerDansFolder(t.id, null)}>
                      <span style={{ color: '#6b7280' }}>Sans dossier</span>
                    </div>
                    {allFolders.map(f => (
                      <div role="button" tabIndex={0} key={f} style={{ ...S.moveItem, fontWeight: t.dossier === f ? '700' : '500', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => deplacerDansFolder(t.id, f)}>
                        {t.dossier === f && <Icon name="check" size={14} />}{f}
                      </div>
                    ))}
                    <div style={{ padding: '0.4rem 0.65rem', borderTop: '1px solid #f3f4f6' }}>
                      <input autoFocus placeholder="Nouveau dossier…" aria-label="Nouveau dossier…"
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
              <span style={{ ...S.chevron, transform: isPreviewed ? 'rotate(90deg)' : 'none' }}><Icon name="chevron-right" size={16} /></span>
            </div>
          </div>

          {/* ── Panel aperçu séances ── */}
          {isPreviewed && (() => {
            const seances = [...(t.programme_template_seances || [])].sort((a, b) => (a.jour - b.jour) || (a.ordre - b.ordre))
            return (
              <div style={S.apercu}>
                {seances.length === 0 ? (
                  <p style={{ color: '#6b7280', fontSize: '0.78rem', textAlign: 'center', padding: '0.75rem' }}>Aucune séance dans ce cycle</p>
                ) : seances.map((s, idx) => {
                  const key = s.id || idx
                  const seanceOpen = openPreviewSeances.has(key)
                  const exs = s.exercices || []
                  return (
                    <div key={key} style={{ borderTop: idx ? '1px solid #e5e7eb' : 'none' }}>
                      <div
                        role="button" tabIndex={0}
                        onClick={e => { e.stopPropagation(); togglePreviewSeance(key) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
                      >
                        <span style={S.jourTag}>J{s.jour}</span>
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.85rem', color: '#333333' }}>{s.nom || `Séance ${idx + 1}`}</span>
                        <span style={{ color: '#6b7280', fontSize: '0.75rem', flexShrink: 0 }}>{exs.length} exercice{exs.length > 1 ? 's' : ''}</span>
                        <span style={{ ...S.chevron, transform: seanceOpen ? 'rotate(90deg)' : 'none' }}><Icon name="chevron-right" size={14} /></span>
                      </div>
                      {seanceOpen && (
                        <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {exs.length === 0 ? (
                            <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: 0, padding: '4px 0' }}>Séance vide</p>
                          ) : (() => {
                            const items = []
                            let prevBloc = null
                            exs.forEach((ex, ei) => {
                              const bloc = blocLetter(ex.code)
                              if (bloc && bloc !== prevBloc) {
                                items.push(
                                  <div key={`hdr-${ei}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: ei > 0 ? 8 : 0, marginBottom: 2 }}>
                                    <span style={S.blocPuce}>Bloc {bloc}</span>
                                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                                  </div>
                                )
                                prevBloc = bloc
                              }
                              items.push(
                                <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                                  {ex.code && <span style={S.codeTag}>{ex.code}</span>}
                                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 600, color: '#333333' }}>{ex.nom || 'Sans nom'}</span>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                    {[[ex.series, ex.repetitions].filter(Boolean).join(' × '), ex.tempo && `tempo ${ex.tempo}`].filter(Boolean).join(' · ')}
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

          {deleteConfirm === t.id ? (
            <div style={S.cardActions}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginRight: 'auto' }}>Supprimer ce template ?</span>
              <button style={S.btnSecondary} onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button style={S.btnDanger} onClick={() => deleteTemplate(t.id)}>Supprimer</button>
            </div>
          ) : (
            <div style={S.cardActions}>
              <button style={S.btnPrimary} onClick={() => openSendModal(t)}>Envoyer</button>
              <button style={S.btnSecondary} onClick={() => ouvrirDraft(t)} disabled={ouvrantId === t.id}>
                {ouvrantId === t.id ? 'Ouverture…' : 'Modifier'}
              </button>
              <button style={S.btnSecondary} onClick={() => ouvrirMaj(t)} title="Ajouter les nouvelles séances du modèle aux cycles déjà envoyés">Mettre à jour les envoyés</button>
              <button style={{ ...S.btnIcon, color: '#dc2626', marginLeft: 'auto' }} onClick={() => setDeleteConfirm(t.id)} title="Supprimer le template" aria-label="Supprimer le template"><Icon name="trash" size={14} /></button>
            </div>
          )}
        </div>
      )
    }

    return (
      <div role="button" tabIndex={0} style={S.page} onClick={() => setMovingId(null)}>
        <div style={S.header}>
          <div>
            <div style={S.title}>Templates de cycles</div>
            <div style={S.subtitle}>{templates.length} template{templates.length > 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button style={S.btnSecondary} onClick={() => setShowNewFolder(true)}>+ Dossier</button>
            <button style={{ ...S.btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowAI(true)}><Icon name="sparkle" size={14} />Générer avec l'IA</button>
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
          <div style={{ background: 'white', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creerDossier()}
              placeholder="Nom du dossier…"
              style={{ flex: 1, padding: '0.45rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }} />
            <button onClick={creerDossier} style={S.btnPrimary}>Créer</button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName('') }} style={S.btnSecondary}>Annuler</button>
          </div>
        )}

        {loading ? (
          <div style={S.empty}>Chargement…</div>
        ) : templates.length === 0 && allFolders.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontWeight: '600', color: '#374151', marginBottom: '0.25rem' }}>Aucun template</div>
            <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Crée un template de cycle pour l'appliquer rapidement à tes clients</div>
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
                  <div role="button" tabIndex={0} style={S.folderHeader} onClick={() => toggleFolder(folderName)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
                      <span style={{ display: 'flex', color: '#374151' }}><Icon name={isOpen ? 'folder-open' : 'folder'} size={16} /></span>
                      {renamingFolder === folderName ? (
                        <input autoFocus value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') renommerDossier(folderName, renameVal); if (e.key === 'Escape') setRenamingFolder(null) }}
                          onBlur={() => renommerDossier(folderName, renameVal)}
                          onClick={e => e.stopPropagation()}
                          style={{ flex: 1, padding: '0.25rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.875rem', outline: 'none' }} />
                      ) : (
                        <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#333333' }}>{folderName}</span>
                      )}
                      <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{items.length} template{items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setRenamingFolder(folderName); setRenameVal(folderName) }} style={S.btnIcon} title="Renommer le dossier">
                        <Icon name="edit" size={14} />
                      </button>
                      <button onClick={() => supprimerDossier(folderName)} style={S.btnIcon} title="Supprimer le dossier">
                        <Icon name="trash" size={14} />
                      </button>
                      <span role="button" tabIndex={0} style={{ ...S.chevron, transform: isOpen ? 'rotate(90deg)' : 'none', cursor: 'pointer' }}
                        onClick={() => toggleFolder(folderName)}><Icon name="chevron-right" size={16} /></span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ padding: 12 }}>
                      {items.length === 0 ? (
                        <p style={{ color: '#6b7280', fontSize: '0.82rem', textAlign: 'center', padding: '0.75rem 0' }}>Dossier vide — déplace un template ici via l'icône dossier</p>
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
                  <p style={S.sectionLabel}>Sans dossier</p>
                )}
                <div style={S.grid}>{sansDossier.map(t => renderCard(t))}</div>
              </div>
            )}
          </div>
        )}

      {/* ── Modale : mettre à jour les cycles déjà envoyés ───────────────────── */}
      {majModal && (() => {
        const modele = [...(majModal.template.programme_template_seances || [])].sort((a, b) => a.ordre - b.ordre)
        const copies = majModal.copies
        const aFaire = (copies || []).map(p => ({ p, manquantes: seancesManquantes(modele, p.seances || []) }))
        const total = aFaire.reduce((n, x) => n + x.manquantes.length, 0)
        return (
          <div style={S.overlay} onClick={() => !majModal.enCours && setMajModal(null)}>
            <div style={{ ...S.modal, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#333333', marginBottom: '0.3rem' }}>Mettre à jour « {majModal.template.nom} »</div>
              <p style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.5, margin: '0 0 1rem' }}>
                Ajoute aux cycles déjà envoyés les séances du modèle qu'ils n'ont pas encore. Les séances existantes, et tout ce que les clients ont rempli, ne sont pas modifiés.
              </p>
              {majModal.rapport ? (
                <>
                  {majModal.rapport.map((x, i) => (
                    <div key={i} style={{ padding: '0.6rem 0', borderTop: i ? '1px solid #f3f4f6' : 'none', fontSize: '0.88rem' }}>
                      <b>{x.client}</b>
                      <div style={{ color: '#4b5563', marginTop: 2 }}>{x.ajoutees.length ? `Ajoutée${x.ajoutees.length > 1 ? 's' : ''} : ${x.ajoutees.join(', ')}` : 'Déjà à jour'}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button style={S.btnPrimary} onClick={() => setMajModal(null)}>Fermer</button>
                  </div>
                </>
              ) : copies === null ? (
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Chargement…</p>
              ) : copies.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Ce cycle n'a encore été envoyé à personne depuis la bibliothèque.</p>
              ) : (
                <>
                  {aFaire.map(({ p, manquantes }) => (
                    <div key={p.id} style={{ padding: '0.6rem 0', borderTop: '1px solid #f3f4f6', fontSize: '0.88rem' }}>
                      <b>{p.clients ? `${p.clients.prenom} ${p.clients.nom}` : 'Client'}</b>
                      <span style={{ color: '#6b7280' }}> · {(p.seances || []).length} séance{(p.seances || []).length > 1 ? 's' : ''} aujourd'hui</span>
                      <div style={{ color: manquantes.length ? '#1a1a1a' : '#6b7280', marginTop: 2 }}>
                        {manquantes.length ? `À ajouter : ${manquantes.map(t => t.nom.trim()).join(', ')}` : 'Déjà à jour'}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button style={S.btnSecondary} onClick={() => setMajModal(null)} disabled={majModal.enCours}>Annuler</button>
                    <button style={{ ...S.btnPrimary, opacity: total && !majModal.enCours ? 1 : 0.5 }} onClick={appliquerMaj} disabled={!total || majModal.enCours}>
                      {majModal.enCours ? 'Mise à jour…' : total ? `Ajouter ${total} séance${total > 1 ? 's' : ''}` : 'Tout est à jour'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Modale : Envoyer à un client ──────────────────────────────────── */}
      {sendModal && (
        <div style={S.overlay} onClick={() => !sending && setSendModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>

            {sendSuccess ? (
              // Succès
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#333333', marginBottom: '0.4rem' }}>
                  {sendMode === 'ecraser' ? 'Cycle mis à jour' : 'Cycle envoyé'}
                </div>
                <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  « {sendModal.nom} » {sendMode === 'ecraser' ? 'a été appliqué à' : 'a été créé pour'} <strong>{sendSuccess}</strong>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Redirection vers le programme…
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#333333' }}>Envoyer un cycle</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                      Template : <strong>{sendModal.nom}</strong> · {sendModal.semaines} sem.
                    </div>
                  </div>
                  <button onClick={() => setSendModal(null)} style={S.btnIcon} aria-label="Fermer"><Icon name="x" size={18} /></button>
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
                  <label style={S.label}>Date de début <span style={{ color: '#6b7280', fontWeight: 400 }}>(optionnel)</span></label>
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
                  <ClientPicker
                    value={sendForm.client_id}
                    clientFields="id, prenom, nom, offre"
                    onChange={(clientId, c) => { setSendForm(f => ({ ...f, client_id: clientId })); setSelectedClient(c); fetchClientProgrammes(clientId) }}
                    placeholder="Choisir un client…"
                  />
                </div>

                {/* Mode : nouveau cycle ou écraser l'existant */}
                {sendForm.client_id && (
                  <div style={S.formGroup}>
                    <label style={S.label}>Mode d'application</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[
                        { key: 'nouveau',  label: 'Nouveau cycle' },
                        { key: 'ecraser', label: 'Écraser le cycle actuel' },
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
                      <div style={{ color: '#6b7280', fontSize: '0.85rem', padding: '0.4rem 0' }}>Chargement…</div>
                    ) : clientProgrammes.length === 0 ? (
                      <div style={{ color: '#dc2626', fontSize: '0.82rem', padding: '0.4rem 0' }}>Ce client n'a pas encore de cycle.</div>
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
                            <span style={{ fontWeight: '600', fontSize: '0.875rem', color: programmeToOverwrite?.id === p.id ? '#e4f816' : '#333333' }}>
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
                        Les séances et exercices de « {programmeToOverwrite.nom} » seront effacés et remplacés par le template.
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
                      : sendMode === 'ecraser' ? 'Écraser le cycle' : 'Envoyer le cycle'}
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
  page: { padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' },
  title: { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: '0 0 0.25rem' },
  subtitle: { fontSize: '0.85rem', color: '#6b7280' },
  sectionLabel: { fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.6rem' },
  empty: { color: '#6b7280', padding: '2rem', textAlign: 'center' },
  emptyState: { textAlign: 'center', padding: '3rem 2rem', background: 'white', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' },
  card: { background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1rem 1.1rem' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontWeight: '700', color: '#333333', fontSize: '0.95rem' },
  cardDesc: { fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' },
  cardStats: { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginTop: '0.35rem' },
  cardActions: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 12, marginTop: 12 },
  apercu: { marginTop: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10 },
  jourTag: { background: '#e5e7eb', color: '#374151', fontSize: '0.72rem', fontWeight: 800, borderRadius: 6, padding: '2px 6px', flexShrink: 0 },
  codeTag: { background: 'white', border: '1px solid #e5e7eb', color: '#374151', fontSize: '0.72rem', fontWeight: 800, borderRadius: 6, padding: '1px 6px', minWidth: 22, textAlign: 'center', flexShrink: 0 },
  blocPuce: { background: '#333333', color: '#e4f816', padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: '800', letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0 },
  chevron: { display: 'inline-flex', color: '#6b7280', transition: 'transform 0.2s' },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', color: '#333333', outline: 'none' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.55rem 0.9rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDanger: { background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnIcon: { width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0, color: '#6b7280', flexShrink: 0 },
  folderBlock: { background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  folderHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' },
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
