import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ImportExcel from './ImportExcel'
import useClientsEtGroupes from '../hooks/useClientsEtGroupes'
import Icon from '../components/Icon'
import { Cadre, TitrePanneau, Recherche, GroupeTri, ItemTri, LienTri, BIB } from '../components/BiblioCadre'

const TOUS = '__tous'
const SANS = '__sans'

export default function SeanceTemplates() {
  const navigate = useNavigate()
  const [templates, setTemplates]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [openFolders, setOpenFolders]     = useState(new Set())
  const [showImport, setShowImport]       = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState(null)
  const [renameVal, setRenameVal]         = useState('')
  const [movingId, setMovingId]           = useState(null)
  const [drafts, setDrafts]               = useState([])
  const [recherche, setRecherche]         = useState('')
  const [dossierActif, setDossierActif]   = useState(TOUS)
  const [ouverts, setOuverts]             = useState(new Set()) // cartes dépliées (fermées par défaut)

  // Édition inline
  const [editingId, setEditingId]         = useState(null)
  const [editNom, setEditNom]             = useState('')
  const [editExercices, setEditExercices] = useState([])
  const [savingEdit, setSavingEdit]       = useState(false)

  // Assignation à un client — individuels en liste normale, groupes à part
  // (au clic, la liste de ses membres s'affiche pour cocher dedans).
  const [sendingTemplate, setSendingTemplate] = useState(null)
  const { individuels, groupes } = useClientsEtGroupes()
  const [clientProgrammes, setClientProgrammes] = useState({})
  const [progsLoaded, setProgsLoaded]     = useState(false)
  const [openGroupIds, setOpenGroupIds]   = useState(new Set())
  const [selectedAssign, setSelectedAssign] = useState({})  // clientId → programmeId
  const [assigning, setAssigning]         = useState(false)
  const [assignDone, setAssignDone]       = useState(false)

  useEffect(() => { fetchTemplates(); fetchDrafts() }, [])

  async function fetchDrafts() {
    const { data } = await supabase
      .from('seances')
      .select('id, nom, created_at')
      .is('programme_id', null)
      .order('created_at', { ascending: false })
    setDrafts(data || [])
  }

  async function supprimerBrouillon(id) {
    if (!window.confirm('Supprimer ce brouillon ?')) return
    await supabase.from('exercices').delete().eq('seance_id', id)
    await supabase.from('seances').delete().eq('id', id)
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

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
    setDossierActif(newFolderName.trim())
  }

  async function renommerDossier(oldName, newName) {
    if (!newName.trim() || newName === oldName) { setRenamingFolder(null); return }
    await supabase.from('seance_templates').update({ dossier: newName.trim() }).eq('dossier', oldName)
    setTemplates(prev => prev.map(t => t.dossier === oldName ? { ...t, dossier: newName.trim() } : t))
    setOpenFolders(prev => { const n = new Set(prev); n.delete(oldName); n.add(newName.trim()); return n })
    if (dossierActif === oldName) setDossierActif(newName.trim())
    setRenamingFolder(null)
  }

  async function supprimerDossier(name) {
    if (!window.confirm(`Supprimer le dossier "${name}" ? Les modèles seront déplacés dans "Sans dossier".`)) return
    await supabase.from('seance_templates').update({ dossier: null }).eq('dossier', name)
    setTemplates(prev => prev.map(t => t.dossier === name ? { ...t, dossier: null } : t))
    setOpenFolders(prev => { const n = new Set(prev); n.delete(name); return n })
    if (dossierActif === name) setDossierActif(TOUS)
  }

  async function deplacerDansFolder(templateId, dossier) {
    await supabase.from('seance_templates').update({ dossier: dossier || null }).eq('id', templateId)
    setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, dossier: dossier || null } : t))
    setMovingId(null)
  }

  // ── Édition inline ────────────────────────────────────────────────────────

  function startEdit(t, e) {
    e.stopPropagation()
    setEditingId(t.id)
    setEditNom(t.nom)
    setEditExercices((t.exercices || []).map(ex => ({ ...ex })))
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
    setOpenGroupIds(new Set())
    setAssignDone(false)
    if (!progsLoaded) {
      const ids = [...individuels, ...groupes.flatMap(g => g.membres)].map(c => c.id)
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
      setClientProgrammes(progsByClient)
      setProgsLoaded(true)
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

  function renderAssignRow(c) {
    const progs = clientProgrammes[c.id] || []
    const isChecked = selectedAssign[c.id] !== undefined
    return (
      <div key={c.id} style={{ ...S.clientRow, background: isChecked ? '#f3f4f6' : 'white', borderColor: isChecked ? '#d1d5db' : '#e5e7eb' }}>
        <div role="button" tabIndex={0} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: progs.length > 0 ? 'pointer' : 'default' }}
          onClick={() => progs.length > 0 && toggleClient(c.id)}>
          <div style={{
            width: 20, height: 20, borderRadius: 6, border: `2px solid ${isChecked ? '#333333' : '#d1d5db'}`,
            background: isChecked ? '#333333' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {isChecked && <span style={{ color: '#e4f816', display: 'flex' }}><Icon name="check" size={14} /></span>}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#333' }}>{c.prenom} {c.nom}</p>
            {progs.length === 0 && <p style={{ margin: 0, fontSize: '0.75rem', color: '#dc2626' }}>Aucun cycle : envoi impossible</p>}
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
        .insert([{
          programme_id: progId, nom: sendingTemplate.nom, ordre: (count || 0) + 1,
          cardio_blocs: Array.isArray(sendingTemplate.cardio_blocs) ? sendingTemplate.cardio_blocs : [],
        }])
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

  if (loading) return <div style={S.centered}><p style={{ color: '#6b7280' }}>Chargement...</p></div>

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
        items.push(
          <div key={`hdr-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: i > 0 ? 12 : 0, marginBottom: 4 }}>
            <span style={BIB.blocPuce}>Bloc {bloc}</span>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>
        )
        prevBloc = bloc
      }
      // « 4 × 6 » ; les répétitions non numériques (« 30 s ») restent telles quelles
      const dosage = [ex.series, ex.repetitions].filter(Boolean).join(' × ')
      items.push(
        <div key={i} style={S.exRow}>
          {ex.code && <span style={BIB.codeTag}>{ex.code}</span>}
          <span style={S.exNom}>{ex.nom}</span>
          <span style={S.exDosage}>
            {dosage}{ex.recuperation ? `${dosage ? ' · ' : ''}récup ${ex.recuperation}` : ''}
          </span>
        </div>
      )
    })
    return items
  }

  const allFolders = [...new Set([...openFolders, ...templates.map(t => t.dossier).filter(Boolean)])].sort()
  const q = recherche.trim().toLowerCase()
  const visibles = templates
    .filter(t => dossierActif === TOUS || (dossierActif === SANS ? !t.dossier : t.dossier === dossierActif))
    .filter(t => !q || t.nom.toLowerCase().includes(q))
  const titreSelection = dossierActif === TOUS ? 'Tous les modèles' : dossierActif === SANS ? 'Sans dossier' : dossierActif
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`

  function renderTemplate(t) {
    const isEditing = editingId === t.id
    const exs = t.exercices || []
    const nbBlocs = new Set(exs.map(ex => blocLetter(ex.code)).filter(Boolean)).size
    const ouvert = isEditing || ouverts.has(t.id)
    const basculer = () => !isEditing && setOuverts(prev => { const n = new Set(prev); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })

    return (
      <div key={t.id} style={{ ...BIB.carte, ...(isEditing ? { gridColumn: '1 / -1' } : {}) }}>
        {/* En-tête de la carte */}
        <div style={{ ...BIB.carteTete, ...(ouvert ? {} : { paddingBottom: 12 }) }}>
          {!isEditing && (
            <button onClick={basculer} aria-expanded={ouvert} aria-label={ouvert ? 'Fermer la séance' : 'Ouvrir la séance'} style={{ ...BIB.icone, width: 24, height: 24, marginTop: -2 }}>
              <span style={{ display: 'inline-flex', transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}><Icon name="chevron-right" size={16} /></span>
            </button>
          )}
          <div role="button" tabIndex={0} onClick={basculer} style={{ flex: 1, minWidth: 0, cursor: isEditing ? 'default' : 'pointer' }}>
            {isEditing ? (
              <input value={editNom} onChange={e => setEditNom(e.target.value)} aria-label="Nom du modèle"
                style={{ ...S.editInput, fontWeight: '700', width: '100%' }} autoFocus />
            ) : (
              <>
                <p style={BIB.carteNom}>{t.nom}</p>
                <p style={BIB.carteMeta}>{pluriel(exs.length, 'exercice')}{nbBlocs > 0 ? ` · ${pluriel(nbBlocs, 'bloc')}` : ''}</p>
              </>
            )}
          </div>
          {!isEditing && (
            <div style={{ display: 'flex', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); setMovingId(movingId === t.id ? null : t.id) }}
                  style={BIB.icone} title="Déplacer dans un dossier" aria-label="Déplacer dans un dossier"><Icon name="folder" size={14} /></button>
                {movingId === t.id && (
                  <div style={BIB.menu} onClick={e => e.stopPropagation()}>
                    <button style={BIB.menuItem} onClick={() => deplacerDansFolder(t.id, null)}>
                      <span style={{ color: '#6b7280' }}>Sans dossier</span>
                    </button>
                    {allFolders.map(f => (
                      <button key={f} style={{ ...BIB.menuItem, fontWeight: t.dossier === f ? 700 : 600 }} onClick={() => deplacerDansFolder(t.id, f)}>
                        {t.dossier === f && <Icon name="check" size={14} />}{f}
                      </button>
                    ))}
                    <div style={{ padding: '0.5rem 0.65rem' }}>
                      <input autoFocus placeholder="Nouveau dossier…" aria-label="Nouveau dossier"
                        style={{ ...S.editInput, width: '100%', fontSize: '0.8rem' }}
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
              <button onClick={e => { e.stopPropagation(); supprimer(t.id) }} style={BIB.icone} title="Supprimer le modèle" aria-label="Supprimer le modèle"><Icon name="trash" size={14} /></button>
            </div>
          )}
        </div>

        {/* Contenu : exercices par bloc, ou éditeur */}
        {ouvert && <div style={{ padding: '12px 14px' }}>
          {isEditing ? (
            <div>
              {editExercices.length === 0 && (
                <p style={{ color: '#6b7280', fontSize: '0.82rem', margin: '0 0 0.5rem' }}>Aucun exercice : ajoute-en ci-dessous.</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {editExercices.map((ex, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'white', borderRadius: 10, padding: '6px 8px', border: '1px solid #e5e7eb' }}>
                    <input value={ex.code || ''} onChange={e => updateEx(i, 'code', e.target.value)} aria-label="Code"
                      placeholder="Code" style={{ ...S.editInput, width: 56, fontWeight: '700', textAlign: 'center' }} />
                    <input value={ex.nom || ''} onChange={e => updateEx(i, 'nom', e.target.value)} aria-label="Nom de l'exercice"
                      placeholder="Nom de l'exercice" style={{ ...S.editInput, flex: 1, minWidth: 0 }} />
                    <input value={ex.series || ''} onChange={e => updateEx(i, 'series', e.target.value)} aria-label="Séries"
                      placeholder="Séries" style={{ ...S.editInput, width: 64, textAlign: 'center' }} />
                    <input value={ex.repetitions || ''} onChange={e => updateEx(i, 'repetitions', e.target.value)} aria-label="Répétitions"
                      placeholder="Reps" style={{ ...S.editInput, width: 64, textAlign: 'center' }} />
                    <input value={ex.recuperation || ''} onChange={e => updateEx(i, 'recuperation', e.target.value)} aria-label="Récupération"
                      placeholder="Récup" style={{ ...S.editInput, width: 72, textAlign: 'center' }} />
                    <button onClick={() => deleteEx(i)} style={{ ...BIB.icone, color: '#dc2626' }} title="Retirer l'exercice" aria-label="Retirer l'exercice"><Icon name="x" size={16} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addEx} style={S.ajoutEx}>+ Ajouter un exercice</button>
            </div>
          ) : exs.length === 0 ? (
            <p style={{ color: '#6b7280', fontSize: '0.82rem', margin: 0 }}>Séance vide.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {renderExercicesBlocs(exs)}
            </div>
          )}
        </div>}

        {/* Pied : actions */}
        <div style={BIB.cartePied}>
          {isEditing ? (
            <>
              <button onClick={e => saveEdit(t.id, e)} disabled={savingEdit} style={BIB.btnPetitP}>{savingEdit ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={cancelEdit} style={BIB.btnPetit}>Annuler</button>
            </>
          ) : (
            <>
              <button onClick={e => openAssign(t, e)} style={BIB.btnPetitP}>Envoyer</button>
              <button onClick={e => startEdit(t, e)} style={BIB.btnPetit}>Modifier</button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div onClick={() => setMovingId(null)}>

      {/* Modal assignation */}
      {sendingTemplate && (
        <div style={S.overlay} onClick={() => setSendingTemplate(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <p style={S.modalLabel}>Envoyer le modèle</p>
                <p style={S.modalTitle}>{sendingTemplate.nom}</p>
              </div>
              <button onClick={() => setSendingTemplate(null)} style={S.closeBtn} aria-label="Fermer"><Icon name="x" size={18} /></button>
            </div>

            {assignDone ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <p style={{ fontWeight: '700', color: '#333' }}>Séance ajoutée</p>
              </div>
            ) : (
              <>
                <div style={S.clientList}>
                  {individuels.length === 0 && groupes.length === 0 ? (
                    <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>Aucun client.</p>
                  ) : (
                    <>
                      {individuels.map(c => renderAssignRow(c))}
                      {groupes.map(g => {
                        const isOpen = openGroupIds.has(g.id)
                        const nbCoches = g.membres.filter(m => selectedAssign[m.id] !== undefined).length
                        return (
                          <div key={g.id}>
                            <div role="button" tabIndex={0}
                              onClick={() => setOpenGroupIds(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })}
                              style={{ ...S.clientRow, cursor: 'pointer', background: '#f9fafb' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.couleur || '#6b7280', flexShrink: 0 }} />
                                <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#333' }}>{g.nom}</p>
                                {nbCoches > 0 && <span style={{ fontSize: '0.75rem', color: '#333333', fontWeight: 700 }}>{nbCoches} coché{nbCoches > 1 ? 's' : ''}</span>}
                              </div>
                              <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: '0.75rem' }}>{g.membres.length} membre{g.membres.length > 1 ? 's' : ''} {isOpen ? '▲' : '▼'}</span>
                            </div>
                            {isOpen && (
                              <div style={{ paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem', marginBottom: '0.4rem' }}>
                                {g.membres.map(c => renderAssignRow(c))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>

                <div style={S.modalFooter}>
                  <button onClick={() => setSendingTemplate(null)} style={BIB.btn}>Annuler</button>
                  <button onClick={assignerTemplate} disabled={assignCount === 0 || assigning}
                    style={{ ...BIB.btnP, opacity: assignCount === 0 ? 0.4 : 1 }}>
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

      <Cadre panneau={
        <>
          <TitrePanneau titre="Modèles de séances" sous={pluriel(templates.length, 'modèle')} />
          <Recherche value={recherche} onChange={setRecherche} placeholder="Rechercher un modèle" />
          <GroupeTri titre="Dossiers" action={<LienTri onClick={() => setShowNewFolder(true)}>+ Nouveau</LienTri>}>
            {showNewFolder && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') creerDossier(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') } }}
                  placeholder="Nom du dossier" aria-label="Nom du dossier" style={{ ...S.editInput, flex: 1, minWidth: 0 }} />
                <button onClick={creerDossier} style={BIB.btnPetitP}>Créer</button>
              </div>
            )}
            <ItemTri actif={dossierActif === TOUS} n={templates.length} onClick={() => setDossierActif(TOUS)}>Tous les modèles</ItemTri>
            {allFolders.map(f => (
              <ItemTri key={f} icone={dossierActif === f ? 'folder-open' : 'folder'} actif={dossierActif === f}
                n={templates.filter(t => t.dossier === f).length} onClick={() => setDossierActif(f)}>{f}</ItemTri>
            ))}
            <ItemTri actif={dossierActif === SANS} n={templates.filter(t => !t.dossier).length} onClick={() => setDossierActif(SANS)}>Sans dossier</ItemTri>
          </GroupeTri>
        </>
      }>
        {/* Brouillons */}
        {drafts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={BIB.etiquette}>Brouillons en cours</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {drafts.map(d => (
                <div key={d.id} style={S.brouillon}>
                  <div style={{ minWidth: 0 }}>
                    <p style={BIB.carteNom}>{d.nom}</p>
                    <p style={BIB.carteMeta}>Créé le {new Date(d.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <button onClick={() => navigate(`/seance/${d.id}`)} style={BIB.btnPetit}>Continuer</button>
                  <button onClick={() => supprimerBrouillon(d.id)} style={BIB.icone} title="Supprimer le brouillon" aria-label="Supprimer le brouillon">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Barre : sélection courante, actions du dossier, création */}
        <div style={BIB.barre}>
          {renamingFolder && renamingFolder === dossierActif ? (
            <input autoFocus value={renameVal} aria-label="Nouveau nom du dossier"
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renommerDossier(dossierActif, renameVal); if (e.key === 'Escape') setRenamingFolder(null) }}
              onBlur={() => renommerDossier(dossierActif, renameVal)}
              style={{ ...S.editInput, width: 220, fontWeight: 700 }} />
          ) : (
            <span style={BIB.compte}>{titreSelection} · {pluriel(visibles.length, 'modèle')}</span>
          )}
          {dossierActif !== TOUS && dossierActif !== SANS && (
            <>
              <button onClick={() => { setRenamingFolder(dossierActif); setRenameVal(dossierActif) }} style={BIB.icone} title="Renommer le dossier" aria-label="Renommer le dossier"><Icon name="edit" size={14} /></button>
              <button onClick={() => supprimerDossier(dossierActif)} style={BIB.icone} title="Supprimer le dossier" aria-label="Supprimer le dossier"><Icon name="trash" size={14} /></button>
            </>
          )}
          <div style={BIB.droite}>
            <button onClick={() => setShowImport(true)} style={BIB.btn}>Importer depuis Excel</button>
            <button onClick={nouvelleSeance} style={BIB.btnP}>+ Nouvelle séance</button>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div style={BIB.vide}>
            <p style={{ fontWeight: 700, color: '#374151', margin: '0 0 0.35rem' }}>
              {templates.length === 0 ? 'Aucun modèle' : q ? 'Aucun modèle ne correspond' : 'Dossier vide'}
            </p>
            <p style={{ margin: 0 }}>
              {templates.length === 0 ? 'Crée ta première séance ou importe-la depuis Excel.'
                : q ? 'Change ta recherche.' : 'Range un modèle ici avec l’icône dossier de sa carte.'}
            </p>
          </div>
        ) : (
          <div style={BIB.grille}>
            {visibles.map(t => renderTemplate(t))}
          </div>
        )}
      </Cadre>
    </div>
  )
}

const S = {
  centered:       { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  brouillon:      { background: 'white', border: '1.5px dashed #c4c8cf', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 },
  exRow:          { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' },
  exNom:          { flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: '600', color: '#333333' },
  exDosage:       { fontSize: '0.78rem', fontWeight: '600', color: '#6b7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  ajoutEx:        { marginTop: 8, background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 8, padding: '0.45rem 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer', width: '100%', fontFamily: 'inherit' },
  editInput:      { padding: '0.45rem 0.6rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', color: '#333', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  // Modal assignation
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modal:          { background: 'white', borderRadius: 18, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid #f3f4f6' },
  modalLabel:     { fontSize: '0.7rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 0.2rem' },
  modalTitle:     { fontSize: '1rem', fontWeight: '800', color: '#333333', margin: 0 },
  closeBtn:       { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.1rem', padding: '0.1rem', lineHeight: 1 },
  clientList:     { flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  clientRow:      { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: 10, border: '1.5px solid #f3f4f6', transition: 'all 0.15s' },
  modalFooter:    { padding: '1rem 1.25rem', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
}
