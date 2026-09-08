import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { getActiveBlessure } from '../components/BlessureButton'

// ── Accès direct aux groupes (coach) ─────────────────────────────────────────
// Avant, il fallait passer par le Tableau de bord (onglet Groupes) ou la page
// Clients. Cette page est branchée directement dans la barre de navigation.

function initialesGroupe(nom) {
  const mots = (nom || '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[1][0]).toUpperCase()
}

export default function Groupes() {
  const navigate = useNavigate()
  const [groupes, setGroupes] = useState([])
  const [counts, setCounts]   = useState({})   // groupe_id → nb de membres
  const [blesses, setBlesses] = useState({})   // groupe_id → [{ prenom, nom, description, duree_estimee, date_retour_prevue }]
  const [sousGroupes, setSousGroupes] = useState({}) // parent_id → [sous-groupes]
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: gs }, { data: membres }, { data: joueurs }] = await Promise.all([
        supabase.from('groupes').select('id, nom, couleur, logo_url, parent_id').order('nom'),
        supabase.from('groupe_membres').select('groupe_id'),
        supabase.from('groupe_joueurs').select('groupe_id, prenom, nom, joueur_blessures(statut, description, duree_estimee, date_retour_prevue)'),
      ])
      const all = gs || []
      const c = {}
      ;(membres || []).forEach(m => { c[m.groupe_id] = (c[m.groupe_id] || 0) + 1 })
      const b = {}
      ;(joueurs || []).forEach(j => {
        const bl = getActiveBlessure(j.joueur_blessures)
        if (bl) {
          (b[j.groupe_id] ||= []).push({
            nomComplet: `${j.prenom || ''} ${j.nom || ''}`.trim() || 'Joueur',
            description: bl.description,
            duree_estimee: bl.duree_estimee,
            date_retour_prevue: bl.date_retour_prevue,
          })
        }
      })
      const sg = {}
      all.filter(g => g.parent_id).forEach(g => { (sg[g.parent_id] ||= []).push(g) })
      setGroupes(all.filter(g => !g.parent_id))
      setCounts(c)
      setBlesses(b)
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

      {groupes.length > 0 && (
        <div style={S.list}>
          {groupes.map((g, i) => {
            const enfants = sousGroupes[g.id] || []
            return (
              <div key={g.id} style={{ borderTop: i > 0 ? '1px solid #eceef1' : 'none' }}>
                <div style={S.row} onClick={() => navigate(`/groupe/${g.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                    {g.logo_url
                      ? <img src={g.logo_url} alt="" style={S.logo} />
                      : <div style={S.logoFallback}>{initialesGroupe(g.nom)}</div>}
                    <div style={{ minWidth: 0 }}>
                      <p style={S.nom}>{g.nom}</p>
                      <p style={S.meta}>
                        {counts[g.id] || 0} membre{(counts[g.id] || 0) > 1 ? 's' : ''}
                        {enfants.length > 0 && ` · ${enfants.length} sous-groupe${enfants.length > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexShrink: 0 }}>
                    {blesses[g.id]?.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/groupe/${g.id}?tab=blessures`) }}
                        style={S.blessLink}
                        title="Ouvrir le suivi blessures du groupe"
                      >
                        <span style={S.blessDot} />
                        {blesses[g.id].length} blessé{blesses[g.id].length > 1 ? 's' : ''}
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/groupe/${g.id}?tab=calendrier`) }}
                      style={S.btnGhost}
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
                      <button key={sg.id} onClick={() => navigate(`/groupe/${sg.id}`)} style={S.sousLink}>
                        {sg.nom}
                        <span style={S.sousCount}> · {counts[sg.id] || 0}</span>
                        {blesses[sg.id]?.length > 0 && (
                          <span
                            onClick={e => { e.stopPropagation(); navigate(`/groupe/${sg.id}?tab=blessures`) }}
                            style={S.sousBless}
                          > · {blesses[sg.id].length} blessé{blesses[sg.id].length > 1 ? 's' : ''}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const S = {
  page:     { padding: '1.25rem 1.5rem 2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head:     { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.1rem' },
  h1:       { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#111' },
  sub:      { margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#8a8f98', fontWeight: 500 },
  btnSecondary: { border: '1px solid #dfe2e7', background: 'white', borderRadius: 8, padding: '7px 12px', fontSize: '0.78rem', fontWeight: 600, color: '#374151', cursor: 'pointer' },
  empty:    { fontSize: '0.86rem', color: '#8a8f98', fontWeight: 500 },

  list:     { background: 'white', borderRadius: 10, border: '1px solid #e5e7eb' },
  row:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.15rem', cursor: 'pointer', gap: 12 },
  logo:     { width: 36, height: 36, objectFit: 'contain', borderRadius: 8, flexShrink: 0, border: '1px solid #eceef1' },
  logoFallback: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, background: '#f2f3f5', color: '#6b7280' },
  nom:      { margin: 0, fontWeight: 700, fontSize: '0.92rem', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta:     { margin: '2px 0 0', fontSize: '0.74rem', color: '#8a8f98', fontWeight: 500 },
  btnGhost: { border: '1px solid #dfe2e7', background: 'white', borderRadius: 7, padding: '5px 10px', fontSize: '0.73rem', fontWeight: 600, color: '#4b5563', cursor: 'pointer', whiteSpace: 'nowrap' },
  chevron:  { color: '#c7cbd1', fontSize: '1.15rem' },

  sousRow:  { display: 'flex', flexWrap: 'wrap', gap: '0.2rem 1.1rem', padding: '0 1.15rem 0.85rem 3.15rem' },
  sousLink: { border: 'none', background: 'none', padding: 0, fontSize: '0.76rem', fontWeight: 600, color: '#4b5563', cursor: 'pointer' },
  sousCount:{ color: '#9ca3af', fontWeight: 500 },
  sousBless:{ color: '#b91c1c', fontWeight: 700 },

  blessLink: { display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, color: '#b91c1c', fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' },
  blessDot: { width: 6, height: 6, borderRadius: '50%', background: '#b91c1c', flexShrink: 0 },
}
