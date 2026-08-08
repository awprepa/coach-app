import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const OFFRE_LABEL = {
  gratuit: 'Gratuit', essai: 'Essai',
  preparation_physique: 'Prépa physique', coaching: 'Coaching', club: 'Club',
}

function getAvatar(prenom, nom) {
  const initiales = `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase()
  const palettes = [
    { bg: '#dbeafe', text: '#1d4ed8' }, { bg: '#dcfce7', text: '#15803d' },
    { bg: '#fef9c3', text: '#a16207' }, { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#ede9fe', text: '#6d28d9' }, { bg: '#ffedd5', text: '#c2410c' },
  ]
  const idx = ((prenom?.charCodeAt(0) || 0) + (nom?.charCodeAt(0) || 0)) % palettes.length
  return { initiales, ...palettes[idx] }
}

// Colonne "liste des clients" pour la fiche client desktop — cliquer un
// client change juste l'URL (même route, param différent), la fiche se
// recharge sans quitter la page ni perdre la recherche en cours.
export default function ClientListSidebar({ activeId, onSelect }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    supabase.from('clients')
      .select('id, prenom, nom, offre, avatar_url')
      .order('nom', { ascending: true })
      .then(({ data }) => { setClients(data || []); setLoading(false) })
  }, [])

  const filtered = clients.filter(c =>
    `${c.prenom} ${c.nom}`.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div style={S.col}>
      <div style={S.head}>
        <p style={S.title}>Clients <span style={S.count}>· {clients.length}</span></p>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" style={S.search} />
      </div>
      <div style={S.scroll}>
        {loading ? (
          <p style={S.empty}>Chargement…</p>
        ) : filtered.length === 0 ? (
          <p style={S.empty}>Aucun client trouvé.</p>
        ) : filtered.map(c => {
          const av = getAvatar(c.prenom, c.nom)
          const on = c.id === activeId
          return (
            <div key={c.id} onClick={() => onSelect(c.id)}
              style={{ ...S.row, background: on ? '#eef2f2' : 'transparent' }}
              onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#f7f7f8' }}
              onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}
            >
              {c.avatar_url
                ? <img src={c.avatar_url} alt="" style={{ ...S.avatar, objectFit: 'cover' }} />
                : <div style={{ ...S.avatar, background: av.bg, color: av.text }}>{av.initiales}</div>}
              <div style={{ minWidth: 0 }}>
                <p style={S.name}>{c.prenom} {c.nom}</p>
                <p style={S.offre}>{OFFRE_LABEL[c.offre] || c.offre || '—'}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const S = {
  col: { width: 240, flexShrink: 0, background: 'white', borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 },
  head: { padding: '1.1rem 1rem 0.85rem', borderBottom: '1px solid #f0f0f0' },
  title: { fontSize: '0.92rem', fontWeight: 800, margin: '0 0 0.7rem', color: '#1a1a1a' },
  count: { color: '#9ca3af', fontWeight: 600 },
  search: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '7px 10px', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit' },
  scroll: { flex: 1, overflowY: 'auto', padding: '0.5rem' },
  empty: { fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '1.5rem 0.5rem' },
  row: { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 10, cursor: 'pointer', marginBottom: 2 },
  avatar: { width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 900, flexShrink: 0 },
  name: { fontSize: '0.8rem', fontWeight: 700, margin: 0, lineHeight: 1.25, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  offre: { fontSize: '0.66rem', color: '#9ca3af', margin: '1px 0 0' },
}
