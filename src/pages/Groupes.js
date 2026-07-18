import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// ── Accès direct aux groupes (coach) ─────────────────────────────────────────
// Avant, il fallait passer par le Tableau de bord (onglet Groupes) ou la page
// Clients. Cette page est branchée directement dans la barre de navigation.

export default function Groupes() {
  const navigate = useNavigate()
  const [groupes, setGroupes] = useState([])
  const [counts, setCounts]   = useState({})   // groupe_id → nb de membres
  const [sousGroupes, setSousGroupes] = useState({}) // parent_id → [sous-groupes]
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: gs }, { data: membres }] = await Promise.all([
        supabase.from('groupes').select('id, nom, couleur, logo_url, parent_id').order('nom'),
        supabase.from('groupe_membres').select('groupe_id'),
      ])
      const all = gs || []
      const c = {}
      ;(membres || []).forEach(m => { c[m.groupe_id] = (c[m.groupe_id] || 0) + 1 })
      const sg = {}
      all.filter(g => g.parent_id).forEach(g => { (sg[g.parent_id] ||= []).push(g) })
      setGroupes(all.filter(g => !g.parent_id))
      setCounts(c)
      setSousGroupes(sg)
      setLoading(false)
    })()
  }, [])

  return (
    <div style={S.page}>
      <div style={S.head}>
        <div>
          <h1 style={S.h1}>Groupes</h1>
          <p style={S.sub}>
            {loading ? 'Chargement…' : `${groupes.length} groupe${groupes.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => navigate('/clients')} style={S.btnSecondary}>Gérer depuis Clients</button>
      </div>

      {!loading && groupes.length === 0 && (
        <p style={S.empty}>Aucun groupe pour l'instant. Tu peux en créer un depuis la page Clients.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {groupes.map(g => {
          const couleur = g.couleur || '#6b7280'
          const enfants = sousGroupes[g.id] || []
          return (
            <div key={g.id} style={{ ...S.card, border: `1.5px solid ${couleur}22` }}>
              <div style={{ ...S.cardMain, borderLeft: `4px solid ${couleur}` }}
                onClick={() => navigate(`/groupe/${g.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
                  {g.logo_url
                    ? <img src={g.logo_url} alt="" style={S.logo} />
                    : <div style={{ ...S.logoFallback, background: couleur + '20' }}>🏆</div>}
                  <div style={{ minWidth: 0 }}>
                    <p style={S.nom}>{g.nom}</p>
                    <p style={S.meta}>
                      {counts[g.id] || 0} membre{(counts[g.id] || 0) > 1 ? 's' : ''}
                      {enfants.length > 0 && ` · ${enfants.length} sous-groupe${enfants.length > 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/groupe/${g.id}?tab=calendrier`) }}
                    style={S.btnCal}
                    title="Ouvrir le calendrier du groupe"
                  >
                    Calendrier
                  </button>
                  <span style={S.chevron}>›</span>
                </div>
              </div>

              {enfants.length > 0 && (
                <div style={S.sousRow}>
                  {enfants.map(sg => (
                    <button key={sg.id} onClick={() => navigate(`/groupe/${sg.id}`)} style={S.sousChip}>
                      {sg.nom}
                      <span style={{ color: '#9ca3af', fontWeight: 600 }}> · {counts[sg.id] || 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const S = {
  page:     { padding: '1.25rem 1.5rem 2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head:     { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' },
  h1:       { margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#111' },
  sub:      { margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 },
  btnSecondary: { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 9, padding: '7px 12px', fontSize: '0.78rem', fontWeight: 700, color: '#374151', cursor: 'pointer' },
  empty:    { fontSize: '0.86rem', color: '#9ca3af', fontWeight: 600 },
  card:     { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  cardMain: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', cursor: 'pointer', gap: 12 },
  logo:     { width: 40, height: 40, objectFit: 'contain', borderRadius: 8, flexShrink: 0 },
  logoFallback: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 },
  nom:      { margin: 0, fontWeight: 800, fontSize: '1rem', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta:     { margin: '2px 0 0', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 },
  btnCal:   { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 8, padding: '6px 10px', fontSize: '0.74rem', fontWeight: 700, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' },
  chevron:  { color: '#d1d5db', fontSize: '1.25rem' },
  sousRow:  { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 1.25rem 0.9rem' },
  sousChip: { border: '1px solid #e5e7eb', background: '#f9fafb', borderRadius: 999, padding: '5px 11px', fontSize: '0.75rem', fontWeight: 700, color: '#374151', cursor: 'pointer' },
}
