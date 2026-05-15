import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const OFFRES = {
  essai:                { label: 'Essai',          bg: '#fff7ed', color: '#c2410c' },
  preparation_physique: { label: 'Prépa physique',  bg: '#eff6ff', color: '#1d4ed8' },
  coaching:             { label: 'Coaching',        bg: '#f5f3ff', color: '#6d28d9' },
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function daysDiff(isoDate) {
  if (!isoDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(isoDate)
  d.setHours(0, 0, 0, 0)
  return Math.round((today - d) / 86400000)
}

function lastLogLabel(isoDate) {
  if (!isoDate) return 'Jamais'
  const diff = daysDiff(isoDate)
  if (diff === 0) return 'Aujourd\'hui'
  if (diff === 1) return 'Il y a 1 jour'
  return `Il y a ${diff} jours`
}

// Barre de progression kcal
function KcalBar({ consumed, target }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0
  const over = consumed > target && target > 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>
          Kcal aujourd'hui
        </span>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: over ? '#ef4444' : '#1a1a1a' }}>
          {Math.round(consumed)} <span style={{ color: '#9ca3af', fontWeight: 500 }}>/ {target} kcal</span>
        </span>
      </div>
      <div style={{ height: 7, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct * 100}%`,
          background: over ? '#ef4444' : pct >= 0.9 ? '#22c55e' : '#e4f816',
          borderRadius: 999,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

export default function NutritionCoach() {
  const navigate = useNavigate()
  const [clients,  setClients]  = useState([])
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  // ── Chargement ───────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)

      // 1. Tous les clients
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, prenom, nom, offre')
        .order('prenom', { ascending: true })

      if (!allClients || allClients.length === 0) {
        setClients([])
        setEnriched([])
        setLoading(false)
        return
      }

      setClients(allClients)
      const ids = allClients.map(c => c.id)
      const today = todayISO()

      // 2. Goals actifs (batch)
      const { data: allGoals } = await supabase
        .from('nutrition_goals')
        .select('client_id, kcal, active_from, active_to')
        .in('client_id', ids)
        .or(`active_to.is.null,active_to.gte.${today}`)
        .order('active_from', { ascending: false })

      // Garder uniquement le goal le plus récent par client
      const goalsMap = {}
      for (const g of (allGoals || [])) {
        if (!goalsMap[g.client_id]) {
          goalsMap[g.client_id] = g
        }
      }

      // 3. Repas du jour (batch) — agrégation kcal en JS
      const { data: todayMeals } = await supabase
        .from('nutrition_meals')
        .select('client_id, kcal')
        .in('client_id', ids)
        .eq('date', today)

      const kcalTodayMap = {}
      for (const m of (todayMeals || [])) {
        kcalTodayMap[m.client_id] = (kcalTodayMap[m.client_id] || 0) + (Number(m.kcal) || 0)
      }

      // 4. Dernière date de log par client (batch) — déduplique en JS
      const { data: allDates } = await supabase
        .from('nutrition_meals')
        .select('client_id, date')
        .in('client_id', ids)
        .order('date', { ascending: false })

      const lastDateMap = {}
      for (const row of (allDates || [])) {
        if (!lastDateMap[row.client_id]) {
          lastDateMap[row.client_id] = row.date
        }
      }

      // 5. Assembler
      const result = allClients.map(c => ({
        ...c,
        goal:     goalsMap[c.id]   || null,
        kcalDay:  kcalTodayMap[c.id] || 0,
        lastDate: lastDateMap[c.id] || null,
      }))

      setEnriched(result)
      setLoading(false)
    }

    load()
  }, [])

  // ── Filtrage + tri ────────────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? enriched.filter(c =>
          `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
          `${c.nom} ${c.prenom}`.toLowerCase().includes(q)
        )
      : enriched

    // Clients avec goals d'abord
    const withGoal    = filtered.filter(c => c.goal)
    const withoutGoal = filtered.filter(c => !c.goal)
    return [...withGoal, ...withoutGoal]
  }, [enriched, search])

  // ── Rendu ─────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.inner}>

        {/* Header */}
        <div style={S.header}>
          <h1 style={S.title}>🥗 Suivi Nutrition</h1>
          <p style={S.subtitle}>
            {clients.length} client{clients.length !== 1 ? 's' : ''} ·{' '}
            {enriched.filter(c => c.goal).length} avec objectifs
          </p>
        </div>

        {/* Barre de recherche */}
        <div style={S.searchWrapper}>
          <span style={S.searchIcon}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client…"
            style={S.searchInput}
          />
          {search && (
            <button onClick={() => setSearch('')} style={S.searchClear}>×</button>
          )}
        </div>

        {/* Liste */}
        {loading ? (
          <div style={S.emptyState}>Chargement…</div>
        ) : displayed.length === 0 ? (
          <div style={S.emptyState}>
            {search ? 'Aucun client ne correspond à la recherche.' : 'Aucun client trouvé.'}
          </div>
        ) : (
          <div style={S.grid}>
            {displayed.map(client => {
              const hasGoal   = !!client.goal
              const lastLabel = lastLogLabel(client.lastDate)
              const diffDays  = daysDiff(client.lastDate)
              const lastColor = client.lastDate === null
                ? '#9ca3af'
                : diffDays === 0
                  ? '#16a34a'
                  : diffDays <= 2
                    ? '#d97706'
                    : '#ef4444'

              return (
                <div
                  key={client.id}
                  onClick={() => navigate(`/client/${client.id}`)}
                  style={S.card}
                >
                  {/* Ligne supérieure : nom + badge offre */}
                  <div style={S.cardTop}>
                    <div style={S.clientName}>
                      {client.prenom} {client.nom}
                    </div>
                    {client.offre && OFFRES[client.offre] && (
                      <span style={{
                        ...S.offreBadge,
                        background: OFFRES[client.offre].bg,
                        color:      OFFRES[client.offre].color,
                      }}>
                        {OFFRES[client.offre].label}
                      </span>
                    )}
                  </div>

                  {/* Barre kcal ou bouton objectifs */}
                  {hasGoal ? (
                    <div style={{ marginTop: 12 }}>
                      <KcalBar consumed={client.kcalDay} target={client.goal.kcal} />
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/client/${client.id}`) }}
                        style={S.defineGoalBtn}
                      >
                        + Définir objectifs
                      </button>
                    </div>
                  )}

                  {/* Dernière date de log */}
                  <div style={{ ...S.lastLog, color: lastColor }}>
                    <span style={S.lastLogDot} />
                    Dernier log : {lastLabel}
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

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  page: {
    background: '#fafafa',
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  inner: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '2rem',
  },
  header: {
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: 800,
    color: '#1a1a1a',
    margin: '0 0 4px',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9ca3af',
    margin: 0,
    fontWeight: 500,
  },
  searchWrapper: {
    position: 'relative',
    marginBottom: '1.25rem',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    fontSize: '0.95rem',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '11px 42px 11px 40px',
    border: '1.5px solid #e5e7eb',
    borderRadius: 12,
    fontSize: '0.92rem',
    color: '#1a1a1a',
    background: 'white',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  searchClear: {
    position: 'absolute',
    right: 12,
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '1.2rem',
    fontWeight: 700,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '0 4px',
  },
  emptyState: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: '3rem 0',
    fontSize: '0.95rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 14,
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '16px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s, transform 0.1s',
    border: '1.5px solid #f0f0f0',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  clientName: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: '-0.01em',
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  offreBadge: {
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 700,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  defineGoalBtn: {
    background: '#f9fafb',
    border: '1.5px dashed #d1d5db',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#6b7280',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  lastLog: {
    marginTop: 10,
    fontSize: '0.75rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  lastLogDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'currentColor',
    display: 'inline-block',
    flexShrink: 0,
  },
}
