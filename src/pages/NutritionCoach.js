import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const OFFRES = {
  essai:                { label: 'Essai',         bg: '#fff7ed', color: '#c2410c' },
  preparation_physique: { label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:             { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
  club:                 { label: 'Club',           bg: '#f0fdf4', color: '#15803d' },
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function NutritionCoach() {
  const navigate = useNavigate()
  const [clients,  setClients]  = useState([])
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: allClients } = await supabase
        .from('clients')
        .select('id, prenom, nom, offre')
        .order('prenom', { ascending: true })

      if (!allClients || allClients.length === 0) {
        setClients([]); setEnriched([]); setLoading(false); return
      }
      setClients(allClients)
      const ids = allClients.map(c => c.id)
      const today = new Date().toISOString().slice(0, 10)

      // Plans par client (actif + total)
      const { data: allPlans } = await supabase
        .from('nutrition_plans')
        .select('client_id, statut, nom, date_debut, date_fin')
        .in('client_id', ids)

      const plansMap = {}
      for (const p of (allPlans || [])) {
        if (!plansMap[p.client_id]) plansMap[p.client_id] = { total: 0, actif: null }
        plansMap[p.client_id].total++
        const isValidActif = p.statut === 'actif' && (!p.date_fin || p.date_fin >= today)
        if (isValidActif && !plansMap[p.client_id].actif) plansMap[p.client_id].actif = p
      }

      // Adhérence 7 derniers jours (plan logs)
      const from7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
      const { data: recentLogs } = await supabase
        .from('nutrition_plan_logs')
        .select('client_id, statut, meal_id')
        .in('client_id', ids)
        .gte('date', from7)
        .lte('date', today)

      const adherMap = {}
      for (const l of (recentLogs || [])) {
        if (!adherMap[l.client_id]) adherMap[l.client_id] = { total: 0, ok: 0 }
        if (l.meal_id !== null) {
          adherMap[l.client_id].total++
          if (l.statut === 'fait' || l.statut === 'hors_plan') adherMap[l.client_id].ok++
        }
      }

      const result = allClients.map(c => ({
        ...c,
        plans:   plansMap[c.id] || { total: 0, actif: null },
        adher7:  adherMap[c.id] && adherMap[c.id].total > 0
          ? Math.round(adherMap[c.id].ok / adherMap[c.id].total * 100)
          : null,
        logsCount7: adherMap[c.id]?.total || 0,
      }))

      setEnriched(result)
      setLoading(false)
    }
    load()
  }, [])

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? enriched.filter(c => `${c.prenom} ${c.nom}`.toLowerCase().includes(q) || `${c.nom} ${c.prenom}`.toLowerCase().includes(q))
      : enriched
    // Clients avec plan actif en premier
    return [
      ...filtered.filter(c => c.plans.actif),
      ...filtered.filter(c => !c.plans.actif),
    ]
  }, [enriched, search])

  const nbAvecPlan = enriched.filter(c => c.plans.actif).length

  return (
    <div style={S.page}>
      <div style={S.inner}>

        <div style={S.header}>
          <h1 style={S.title}>Plans nutrition</h1>
          <p style={S.subtitle}>
            {clients.length} client{clients.length !== 1 ? 's' : ''} ·{' '}
            {nbAvecPlan} avec plan actif
          </p>
        </div>

        <div style={S.searchWrapper}>
          <span style={S.searchIcon}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client…"
            style={S.searchInput}
          />
          {search && <button onClick={() => setSearch('')} style={S.searchClear}>×</button>}
        </div>

        {loading ? (
          <div style={S.emptyState}>Chargement…</div>
        ) : displayed.length === 0 ? (
          <div style={S.emptyState}>
            {search ? 'Aucun client ne correspond.' : 'Aucun client trouvé.'}
          </div>
        ) : (
          <div style={S.grid}>
            {displayed.map(client => {
              const { actif, total } = client.plans
              return (
                <div
                  key={client.id}
                  onClick={() => navigate(`/nutrition/${client.id}`)}
                  style={S.card}
                >
                  {/* Nom + offre */}
                  <div style={S.cardTop}>
                    <div style={S.clientName}>{client.prenom} {client.nom}</div>
                    {client.offre && OFFRES[client.offre] && (
                      <span style={{ ...S.offreBadge, background: OFFRES[client.offre].bg, color: OFFRES[client.offre].color }}>
                        {OFFRES[client.offre].label}
                      </span>
                    )}
                  </div>

                  {/* Plan actif */}
                  {actif ? (
                    <div style={S.planActif}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={S.planDot} />
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#166534' }}>{actif.nom}</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 2, paddingLeft: 14 }}>
                        {actif.date_debut ? `Depuis le ${formatDate(actif.date_debut)}` : 'Plan en cours'}
                        {total > 1 && ` · ${total} plans au total`}
                      </div>
                    </div>
                  ) : (
                    <div style={S.noPlan}>
                      {total > 0
                        ? `${total} plan${total > 1 ? 's' : ''} — aucun actif`
                        : 'Aucun plan nutritionnel'}
                    </div>
                  )}

                  {/* Adhérence 7 jours */}
                  {client.adher7 !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 999,
                          background: client.adher7 >= 80 ? '#16a34a' : client.adher7 >= 50 ? '#d97706' : '#ef4444',
                          width: `${client.adher7}%`,
                        }} />
                      </div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: client.adher7 >= 80 ? '#16a34a' : client.adher7 >= 50 ? '#d97706' : '#ef4444', flexShrink: 0 }}>
                        {client.adher7}% / 7j
                      </span>
                    </div>
                  )}

                  {/* Flèche */}
                  <div style={S.arrow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  page: { background: '#fafafa', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  inner: { maxWidth: 900, margin: '0 auto', padding: '2rem' },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.6rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 4px', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.875rem', color: '#9ca3af', margin: 0, fontWeight: 500 },
  searchWrapper: { position: 'relative', marginBottom: '1.25rem', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 14, pointerEvents: 'none', display: 'flex', alignItems: 'center', top: 0, bottom: 0 },
  searchInput: {
    width: '100%', padding: '11px 42px 11px 40px', border: '1.5px solid #e5e7eb',
    borderRadius: 12, fontSize: '0.92rem', color: '#1a1a1a', background: 'white',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  searchClear: { position: 'absolute', right: 12, background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.2rem', fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  emptyState: { textAlign: 'center', color: '#9ca3af', padding: '3rem 0', fontSize: '0.95rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  card: {
    background: 'white', borderRadius: 16, padding: '16px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', cursor: 'pointer',
    border: '1.5px solid #f0f0f0', position: 'relative',
    transition: 'box-shadow 0.15s, transform 0.1s',
  },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  clientName: { fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.01em', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  offreBadge: { padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' },
  planActif: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 10px', marginBottom: 6 },
  planDot: { width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block', flexShrink: 0 },
  noPlan: { fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic', marginBottom: 6 },
  arrow: { position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' },
}
