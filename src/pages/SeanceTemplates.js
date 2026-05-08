import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ImportExcel from './ImportExcel'

export default function SeanceTemplates() {
  const [templates, setTemplates]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [expanded, setExpanded]         = useState(null)      // template id
  const [openFolders, setOpenFolders]   = useState(new Set()) // folder names
  const [showImport, setShowImport]     = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState(null)  // folder name being renamed
  const [renameVal, setRenameVal]       = useState('')
  const [movingId, setMovingId]         = useState(null)      // template id showing move dropdown

  useEffect(() => { fetchTemplates() }, [])

  async function fetchTemplates() {
    const { data } = await supabase.from('seance_templates').select('*').order('created_at', { ascending: false })
    const list = data || []
    setTemplates(list)
    // Ouvrir tous les dossiers par défaut
    const folders = [...new Set(list.map(t => t.dossier).filter(Boolean))]
    setOpenFolders(new Set(folders))
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

  async function creerDossier() {
    if (!newFolderName.trim()) return
    setShowNewFolder(false)
    setNewFolderName('')
    setOpenFolders(prev => new Set([...prev, newFolderName.trim()]))
    // Le dossier existe dès qu'on déplace un modèle dedans
    // On crée juste l'entrée locale pour afficher le dossier vide
    setTemplates(prev => prev) // force re-render
    // Store folder name in a "ghost" way — just update openFolders
    // Actual folder is created when a template is moved into it
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

  if (loading) return <div style={S.centered}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>

  // Grouper les templates
  const allFolders = [...new Set([
    ...openFolders,
    ...templates.map(t => t.dossier).filter(Boolean),
  ])].sort()
  const sansDossier = templates.filter(t => !t.dossier)

  // Tous les dossiers existants pour le menu "déplacer"
  const folderOptions = [...new Set(templates.map(t => t.dossier).filter(Boolean))].sort()

  function renderTemplate(t) {
    return (
      <div key={t.id} style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
          <div>
            <p style={S.nom}>{t.nom}</p>
            <p style={S.meta}>{t.exercices?.length || 0} exercice{(t.exercices?.length || 0) > 1 ? 's' : ''} · {new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {/* Déplacer */}
            <div style={{ position: 'relative' }}>
              <button onClick={e => { e.stopPropagation(); setMovingId(movingId === t.id ? null : t.id) }}
                style={S.actionBtn} title="Déplacer dans un dossier">📁</button>
              {movingId === t.id && (
                <div style={S.moveDropdown} onClick={e => e.stopPropagation()}>
                  <div style={S.moveItem} onClick={() => deplacerDansFolder(t.id, null)}>
                    <span style={{ opacity: 0.5 }}>— Sans dossier</span>
                  </div>
                  {folderOptions.map(f => (
                    <div key={f} style={S.moveItem} onClick={() => deplacerDansFolder(t.id, f)}>
                      📁 {f}
                    </div>
                  ))}
                  {/* Nouveau dossier inline */}
                  <div style={{ padding: '0.4rem 0.65rem', borderTop: '1px solid #f3f4f6' }}>
                    <input
                      autoFocus
                      placeholder="Nouveau dossier..."
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
            <span style={{ color: '#d1d5db', fontSize: '1.2rem', transform: expanded === t.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
          </div>
        </div>

        {expanded === t.id && t.exercices?.length > 0 && (
          <div style={{ marginTop: '0.875rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {t.exercices.map((ex, i) => (
              <div key={i} style={S.exRow}>
                <span style={S.codeTag}>{ex.code}</span>
                <span style={S.exNom}>{ex.nom}</span>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                  {ex.series && <span style={S.chip}>{ex.series} séries</span>}
                  {ex.repetitions && <span style={S.chip}>{ex.repetitions} reps</span>}
                  {ex.recuperation && <span style={S.chip}>{ex.recuperation}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={S.page} onClick={() => setMovingId(null)}>
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowNewFolder(true)} style={S.secondaryBtn}>+ Dossier</button>
          <button onClick={() => setShowImport(true)} style={S.importBtn}>⬆ Importer Excel</button>
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
          <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Ouvre une séance et clique sur "Sauvegarder comme modèle".</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Dossiers */}
          {allFolders.map(folderName => {
            const items = templates.filter(t => t.dossier === folderName)
            const isOpen = openFolders.has(folderName)
            return (
              <div key={folderName} style={S.folderBlock}>
                {/* En-tête dossier */}
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

                {/* Contenu dossier */}
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
  page:          { padding: '2rem', maxWidth: '700px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered:      { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:        { marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:         { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle:      { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  importBtn:     { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  secondaryBtn:  { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.6rem 0.875rem', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  folderInput:   { padding: '0.45rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  empty:         { background: 'white', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  folderBlock:   { background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  folderHeader:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.1rem', cursor: 'pointer', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' },
  folderActionBtn:{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem' },
  card:          { background: '#f9fafb', borderRadius: 10, padding: '0.875rem 1rem', border: '1px solid #f0f0f0' },
  nom:           { fontWeight: '700', fontSize: '0.92rem', color: '#333333', margin: 0 },
  meta:          { color: '#9ca3af', fontSize: '0.75rem', margin: '0.15rem 0 0' },
  actionBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.3rem' },
  moveDropdown:  { position: 'absolute', right: 0, top: '100%', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 180, marginTop: 4 },
  moveItem:      { padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#374151', fontWeight: '600', cursor: 'pointer', borderBottom: '1px solid #f9fafb' },
  exRow:         { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' },
  codeTag:       { background: '#333333', color: '#e4f816', padding: '0.1rem 0.4rem', borderRadius: 5, fontSize: '0.68rem', fontWeight: '800', flexShrink: 0 },
  exNom:         { fontSize: '0.82rem', fontWeight: '600', color: '#374151' },
  chip:          { background: '#e5e7eb', color: '#6b7280', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '600' },
}
