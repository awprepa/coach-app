import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'

// ─── Helpers date ──────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function thirtyDaysAgoISO() {
  return addDays(todayISO(), -29)
}

// Génère la liste des 30 jours ISO du plus ancien au plus récent
function last30Days() {
  const start = thirtyDaysAgoISO()
  return Array.from({ length: 30 }, (_, i) => addDays(start, i))
}

function formatDateAxis(isoDate) {
  const [, m, d] = isoDate.split('-')
  return `${d}/${m}`
}

// ─── Tooltip Recharts personnalisé ────────────────────────────────────────────

function CustomTooltip({ active, payload, label, kcalTarget }) {
  if (!active || !payload || !payload.length) return null
  const kcal = payload[0]?.value ?? 0
  return (
    <div style={{
      background: '#1a1a1a', color: 'white', borderRadius: 10,
      padding: '0.5rem 0.75rem', fontSize: '0.78rem', lineHeight: 1.6,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontWeight: 800, color: 'var(--accent)', marginBottom: 2 }}>{label}</div>
      <div>{Math.round(kcal)} kcal</div>
      {kcalTarget > 0 && (
        <div style={{ color: '#9ca3af' }}>
          objectif : {kcalTarget} kcal
        </div>
      )}
    </div>
  )
}

// ─── Couleur de la case calendrier ────────────────────────────────────────────

function dayCircleColor(kcal, kcalTarget) {
  if (!kcal) return '#e5e7eb' // pas de données
  if (!kcalTarget) return '#22c55e' // données mais pas d'objectif
  const ratio = kcal / kcalTarget
  if (ratio < 0.5)  return '#ef4444'
  if (ratio < 0.8)  return '#f97316'
  if (ratio < 1.0)  return '#eab308'
  return '#22c55e'
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function HistoriqueNutrition() {
  const navigate = useNavigate()
  const [client,  setClient]  = useState(null)
  const [goals,   setGoals]   = useState(null)
  const [rawMeals, setRawMeals] = useState([])
  const [loading, setLoading] = useState(true)

  // ─── Chargement ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) { setLoading(false); return }

      // Client
      const { data: c } = await supabase
        .from('clients')
        .select('id, prenom')
        .eq('user_id', userId)
        .maybeSingle()
      if (!c) { setLoading(false); return }
      setClient(c)

      const today = todayISO()

      // Goals actifs (plus récent avec active_to IS NULL ou >= today)
      const { data: g } = await supabase
        .from('nutrition_goals')
        .select('*')
        .eq('client_id', c.id)
        .or(`active_to.is.null,active_to.gte.${today}`)
        .order('active_from', { ascending: false })
        .limit(1)
        .maybeSingle()
      setGoals(g)

      // Repas des 30 derniers jours
      const { data: m } = await supabase
        .from('nutrition_meals')
        .select('date, kcal, prot_g, carbs_g, fat_g, meal_type')
        .eq('client_id', c.id)
        .gte('date', thirtyDaysAgoISO())
        .order('date', { ascending: true })
      setRawMeals(m || [])

      setLoading(false)
    }
    load()
  }, [])

  // ─── Agrégation par date ──────────────────────────────────────────────────
  const byDate = useMemo(() => {
    const map = {}
    for (const row of rawMeals) {
      if (!map[row.date]) {
        map[row.date] = { date: row.date, kcal: 0, prot: 0, carbs: 0, fat: 0, count: 0 }
      }
      map[row.date].kcal  += Number(row.kcal)    || 0
      map[row.date].prot  += Number(row.prot_g)  || 0
      map[row.date].carbs += Number(row.carbs_g) || 0
      map[row.date].fat   += Number(row.fat_g)   || 0
      map[row.date].count += 1
    }
    return map
  }, [rawMeals])

  // Jours avec données
  const daysWithData = Object.keys(byDate)

  // Moyenne kcal / jour sur les jours loggués
  const avgKcal = useMemo(() => {
    if (!daysWithData.length) return 0
    const total = daysWithData.reduce((acc, d) => acc + byDate[d].kcal, 0)
    return Math.round(total / daysWithData.length)
  }, [byDate, daysWithData])

  // % adhérence (jours >= 80% de l'objectif / 30 jours)
  const adherencePct = useMemo(() => {
    if (!goals?.kcal_target || !daysWithData.length) return null
    const goodDays = daysWithData.filter(
      d => byDate[d].kcal >= goals.kcal_target * 0.8
    ).length
    return Math.round((goodDays / 30) * 100)
  }, [goals, byDate, daysWithData])

  // Données graphique Recharts : 14 derniers jours AVEC données
  const chartData = useMemo(() => {
    const allDays = last30Days().slice(-14)
    return allDays
      .filter(d => byDate[d])
      .map(d => ({
        date: formatDateAxis(d),
        kcal: Math.round(byDate[d].kcal),
      }))
  }, [byDate])

  // Grille calendrier : 30 jours dans l'ordre chronologique
  const calendarDays = useMemo(() => last30Days(), [])

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button onClick={() => navigate(-1)} style={S.backBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={S.headerTitle}>Historique</span>
          <div style={{ width: 32 }} />
        </div>
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem 1rem' }}>Chargement…</p>
        <ClientBottomNav />
      </div>
    )
  }

  // ─── Rendu principal ──────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={S.headerTitle}>Historique</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>

        {/* ─── État vide ─────────────────────────────────────────────────── */}
        {daysWithData.length === 0 && (
          <div style={{ ...S.card, textAlign: 'center', padding: '2.5rem 1.25rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📊</div>
            <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem', fontSize: '1rem' }}>
              Aucun repas dans les 30 derniers jours
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.84rem', margin: 0, lineHeight: 1.5 }}>
              Commence à logger tes repas depuis la page Nutrition pour voir tes tendances ici.
            </p>
          </div>
        )}

        {/* ─── Résumé 30 jours ───────────────────────────────────────────── */}
        {daysWithData.length > 0 && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Résumé 30 jours</span>
              <span style={S.cardSub}>{daysWithData.length} jour{daysWithData.length > 1 ? 's' : ''} loggué{daysWithData.length > 1 ? 's' : ''}</span>
            </div>
            <div style={S.statsRow}>
              <div style={S.statBox}>
                <span style={S.statValue}>{daysWithData.length}</span>
                <span style={S.statLabel}>jours loggués</span>
              </div>
              <div style={S.statDivider} />
              <div style={S.statBox}>
                <span style={S.statValue}>{avgKcal}</span>
                <span style={S.statLabel}>kcal moy / jour</span>
              </div>
              {adherencePct !== null && (
                <>
                  <div style={S.statDivider} />
                  <div style={S.statBox}>
                    <span style={{
                      ...S.statValue,
                      color: adherencePct >= 80 ? '#22c55e' : adherencePct >= 50 ? '#f97316' : '#ef4444',
                    }}>
                      {adherencePct}%
                    </span>
                    <span style={S.statLabel}>adhérence</span>
                  </div>
                </>
              )}
            </div>
            {goals?.kcal_target && (
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0.6rem 0 0', textAlign: 'center' }}>
                Objectif : {goals.kcal_target} kcal/jour — adhérence = jours ≥ 80% de l'objectif
              </p>
            )}
          </div>
        )}

        {/* ─── Calendrier 30 jours ───────────────────────────────────────── */}
        {daysWithData.length > 0 && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Calendrier</span>
              <span style={S.cardSub}>30 derniers jours</span>
            </div>

            {/* Légende jours semaine */}
            <div style={S.weekLabels}>
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
                <span key={d} style={S.weekLabel}>{d}</span>
              ))}
            </div>

            {/* Grille — on démarre le premier jour sur la bonne colonne */}
            <CalendarGrid days={calendarDays} byDate={byDate} kcalTarget={goals?.kcal_target} />
          </div>
        )}

        {/* ─── Graphique Recharts ────────────────────────────────────────── */}
        {chartData.length > 0 && (
          <div style={{ ...S.card, background: '#1a1a1a', overflow: 'hidden' }}>
            <div style={S.cardHeader}>
              <span style={{ ...S.cardTitle, color: '#f9fafb' }}>Évolution kcal</span>
              <span style={{ ...S.cardSub, color: '#6b7280' }}>14 derniers jours</span>
            </div>

            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={v => `${v}`}
                />
                <Tooltip content={<CustomTooltip kcalTarget={goals?.kcal_target || 0} />} />
                {goals?.kcal_target > 0 && (
                  <ReferenceLine
                    y={goals.kcal_target}
                    stroke="#ef4444"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{
                      value: `obj. ${goals.kcal_target}`,
                      position: 'insideTopRight',
                      fill: '#ef4444',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="kcal"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }}
                  activeDot={{ fill: 'white', r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Espace BottomNav */}
        <div style={{ height: 20 }} />
      </div>

      <ClientBottomNav />
    </div>
  )
}

// ─── Grille calendrier ────────────────────────────────────────────────────────

function CalendarGrid({ days, byDate, kcalTarget }) {
  // Quel jour de la semaine est le premier jour de la liste ? (0=dim, 1=lun…)
  // On veut que Lundi = colonne 0
  const firstDate = new Date(days[0] + 'T00:00:00')
  const jsDay = firstDate.getDay() // 0=dim, 1=lun, …, 6=sam
  const offset = jsDay === 0 ? 6 : jsDay - 1 // nombre de cases vides avant le 1er jour

  const cells = [
    ...Array.from({ length: offset }, (_, i) => ({ key: `empty-${i}`, empty: true })),
    ...days.map(iso => {
      const dayNum = parseInt(iso.split('-')[2], 10)
      const data   = byDate[iso]
      const kcal   = data?.kcal || 0
      const color  = dayCircleColor(kcal, kcalTarget)
      const isToday = iso === todayISO()
      return { key: iso, dayNum, kcal, color, isToday, empty: false }
    }),
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: '6px',
    }}>
      {cells.map(cell => {
        if (cell.empty) return <div key={cell.key} />
        return (
          <div key={cell.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: cell.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              outline: cell.isToday ? '2px solid #1a1a1a' : 'none',
              outlineOffset: 1,
              boxSizing: 'border-box',
            }}>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: cell.isToday ? 900 : 700,
                color: cell.color === '#e5e7eb' ? '#9ca3af' : 'white',
                lineHeight: 1,
              }}>
                {cell.dayNum}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    background: '#fafafa',
    minHeight: '100vh',
    paddingBottom: '90px',
  },
  header: {
    background: 'var(--header-bg)',
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    color: 'white',
  },
  headerTitle: {
    fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.01em',
  },
  backBtn: {
    width: 32, height: 32, borderRadius: 999,
    background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  content: {
    padding: '1rem',
    display: 'flex', flexDirection: 'column', gap: '1rem',
  },
  card: {
    background: 'white', borderRadius: 16, padding: '1.1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '0.85rem',
  },
  cardTitle: { fontSize: '0.92rem', fontWeight: 800, color: '#1a1a1a' },
  cardSub:   { fontSize: '0.74rem', fontWeight: 600, color: '#9ca3af' },
  statsRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    padding: '0.25rem 0',
  },
  statBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    flex: 1,
  },
  statValue: {
    fontSize: '1.45rem', fontWeight: 900, color: '#1a1a1a', lineHeight: 1,
  },
  statLabel: {
    fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af', textAlign: 'center',
    lineHeight: 1.3,
  },
  statDivider: {
    width: 1, height: 36, background: '#f3f4f6', flexShrink: 0,
  },
  weekLabels: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '6px',
    marginBottom: '6px',
  },
  weekLabel: {
    textAlign: 'center', fontSize: '0.62rem', fontWeight: 700,
    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
}
