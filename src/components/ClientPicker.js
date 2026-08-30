import { useState, useRef, useEffect } from 'react'
import useClientsEtGroupes from '../hooks/useClientsEtGroupes'

// Sélecteur de client réutilisable : les clients individuels (sans groupe)
// s'affichent en liste normale, les groupes apparaissent à part — cliquer
// sur un groupe affiche la liste de ses membres à la place, avec un retour.
// Remplace les <select multi-options> et listes plates qui mélangeaient
// individuels et membres de groupe partout dans l'app coach.
export default function ClientPicker({ value, onChange, clientFields, placeholder = 'Choisir un client…', disabled, allowClear, clearLabel = 'Tous les clients', excludeIds }) {
  const { individuels: individuelsAll, groupes: groupesAll, loading } = useClientsEtGroupes(clientFields)
  const individuels = excludeIds ? individuelsAll.filter(c => !excludeIds.has(c.id)) : individuelsAll
  const groupes = excludeIds
    ? groupesAll.map(g => ({ ...g, membres: g.membres.filter(c => !excludeIds.has(c.id)) })).filter(g => g.membres.length > 0)
    : groupesAll
  const [open, setOpen] = useState(false)
  const [openGroupe, setOpenGroupe] = useState(null) // groupe en cours de consultation
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setOpenGroupe(null); setSearch('') } }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const allClients = [...individuels, ...groupes.flatMap(g => g.membres)]
  const selected = allClients.find(c => c.id === value)

  function select(c) {
    onChange(c.id, c)
    setOpen(false)
    setOpenGroupe(null)
    setSearch('')
  }

  const q = search.trim().toLowerCase()
  const indivFiltres = q ? individuels.filter(c => `${c.prenom} ${c.nom}`.toLowerCase().includes(q)) : individuels
  const groupesFiltres = q ? groupes.filter(g => g.nom.toLowerCase().includes(q)) : groupes
  const membresFiltres = openGroupe ? (q ? openGroupe.membres.filter(c => `${c.prenom} ${c.nom}`.toLowerCase().includes(q)) : openGroupe.membres) : []

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" disabled={disabled} onClick={() => setOpen(v => !v)} style={S.trigger}>
        <span style={{ color: selected ? '#1a1a1a' : '#9ca3af', fontWeight: selected ? 600 : 500 }}>
          {selected ? `${selected.prenom} ${selected.nom}` : allowClear && !value ? clearLabel : placeholder}
        </span>
        <span style={{ color: '#9ca3af' }}>▾</span>
      </button>

      {open && (
        <div style={S.panel}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={S.search}
          />
          <div style={S.list}>
            {loading ? (
              <p style={S.empty}>Chargement…</p>
            ) : openGroupe ? (
              <>
                <div onClick={() => setOpenGroupe(null)} style={S.backRow}>← {openGroupe.nom}</div>
                {membresFiltres.length === 0 ? (
                  <p style={S.empty}>Aucun membre trouvé.</p>
                ) : membresFiltres.map(c => (
                  <div key={c.id} onClick={() => select(c)} style={{ ...S.row, background: value === c.id ? '#f9fafb' : 'transparent' }}>
                    {c.prenom} {c.nom}
                  </div>
                ))}
              </>
            ) : (
              <>
                {allowClear && !q && (
                  <div onClick={() => { onChange(null, null); setOpen(false) }} style={{ ...S.row, fontWeight: 700, color: !value ? '#1a1a1a' : '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
                    {clearLabel}
                  </div>
                )}
                {indivFiltres.map(c => (
                  <div key={c.id} onClick={() => select(c)} style={{ ...S.row, background: value === c.id ? '#f9fafb' : 'transparent' }}>
                    {c.prenom} {c.nom}
                  </div>
                ))}
                {groupesFiltres.length > 0 && (
                  <>
                    {indivFiltres.length > 0 && <div style={S.sep} />}
                    {groupesFiltres.map(g => (
                      <div key={g.id} onClick={() => setOpenGroupe(g)} style={S.groupRow}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: g.couleur || '#6b7280', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontWeight: 700 }}>{g.nom}</span>
                        <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{g.membres.length} membre{g.membres.length > 1 ? 's' : ''} ›</span>
                      </div>
                    ))}
                  </>
                )}
                {indivFiltres.length === 0 && groupesFiltres.length === 0 && (
                  <p style={S.empty}>Aucun résultat.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  trigger: {
    width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0.55rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white',
    fontSize: '0.875rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  },
  panel: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
    background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12,
    boxShadow: '0 8px 28px rgba(0,0,0,0.12)', overflow: 'hidden',
  },
  search: {
    width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: 'none',
    borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit',
  },
  list: { maxHeight: 260, overflowY: 'auto' },
  row: { padding: '0.55rem 0.85rem', fontSize: '0.85rem', color: '#374151', fontWeight: 600, cursor: 'pointer' },
  groupRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.85rem', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' },
  backRow: { padding: '0.55rem 0.85rem', fontSize: '0.8rem', color: '#6366f1', fontWeight: 700, cursor: 'pointer', borderBottom: '1px solid #f3f4f6' },
  sep: { height: 1, background: '#f3f4f6', margin: '2px 0' },
  empty: { padding: '0.75rem', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' },
}
