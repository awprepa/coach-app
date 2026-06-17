import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'

function toISO(date) { return date.toISOString().slice(0, 10) }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d) }

function getPlanDayNumber(dateISO, plan) {
  if (!plan?.date_debut) return 1
  const debut  = new Date(plan.date_debut + 'T00:00:00')
  const target = new Date(dateISO + 'T00:00:00')
  const diff   = Math.floor((target - debut) / 86400000)
  if (diff < 0) return null
  return (diff % 7) + 1
}

function formatAxis(iso) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function adherenceColor(pct) {
  if (pct === null) return '#e5e7eb'
  if (pct >= 80)  return '#16a34a'
  if (pct >= 50)  return '#d97706'
  return '#ef4444'
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{ background: '#1a1a1a', color: 'white', borderRadius: 10, padding: '0.5rem 0.75rem', fontSize: '0.78rem', lineHeight: 1.6, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
      <div style={{ fontWeight: 800, color: '#e4f816', marginBottom: 2 }}>{label}</div>
      <div>{Math.round(d?.kcalMange || 0)} kcal mangés</div>
      {d?.kcalPrevu > 0 && <div style={{ color: '#9ca3af' }}>objectif : {d.kcalPrevu} kcal</div>}
      {d?.adherPct !== null && <div style={{ color: adherenceColor(d.adherPct) }}>adhérence : {d.adherPct}%</div>}
    </div>
  )
}

export default function HistoriqueNutrition() {
  const navigate  = useNavigate()
  const fadeStyle = usePageFade()
  const [client,  setClient]  = useState(null)
  const [plan,    setPlan]    = useState(null)
  const [days,    setDays]    = useState([])
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) { setLoading(false); return }

      const { data: c } = await supabase.from('clients').select('id, prenom').eq('user_id', userId).maybeSingle()
      if (!c) { setLoading(false); return }
      setClient(c)

      const today = toISO(new Date())
      const { data: activePlan } = await supabase
        .from('nutrition_plans').select('*').eq('client_id', c.id).eq('statut', 'actif')
        .or(`date_fin.is.null,date_fin.gte.${today}`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (activePlan) {
        setPlan(activePlan)
        const from = daysAgo(27)
        const [{ data: daysData }, { data: logsData }] = await Promise.all([
          supabase.from('nutrition_plan_days')
            .select('jour_numero, label, objectif_kcal, nutrition_plan_meals(id, kcal)')
            .eq('plan_id', activePlan.id).order('jour_numero'),
          supabase.from('nutrition_plan_logs')
            .select('*').eq('client_id', c.id).eq('plan_id', activePlan.id)
            .gte('date', from).lte('date', today),
        ])
        setDays(daysData || [])
        setLogs(logsData || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Données dérivées ─────────────────────────────────────────────────────
  const { byDate, daysMap } = useMemo(() => {
    const dm = {}
    for (const d of days) dm[d.jour_numero] = d
    const logsMap = {}
    for (const l of logs) {
      if (!logsMap[l.date]) logsMap[l.date] = []
      logsMap[l.date].push(l)
    }
    return { byDate: logsMap, daysMap: dm }
  }, [days, logs])

  // Calcule les stats pour une date ISO
  const dayStats = useMemo(() => {
    if (!plan) return {}
    const result = {}
    for (let i = 27; i >= 0; i--) {
      const iso    = daysAgo(i)
      if (plan.date_debut && iso < plan.date_debut) continue
      const dayNum = getPlanDayNumber(iso, plan)
      if (!dayNum) continue
      const dayData = daysMap[dayNum]
      const meals   = dayData?.nutrition_plan_meals || []
      const dayLogs = byDate[iso] || []
      const planLogs = dayLogs.filter(l => l.meal_id !== null)
      const extras   = dayLogs.filter(l => l.meal_id === null)

      let kcalMange = 0
      let fait = 0, horsplan = 0, saute = 0
      for (const meal of meals) {
        const log = planLogs.find(l => l.meal_id === meal.id)
        const s   = log?.statut || 'non_loggé'
        if (s === 'fait')       { kcalMange += meal.kcal || 0; fait++ }
        else if (s === 'hors_plan') { kcalMange += log.hors_plan_kcal ?? meal.kcal ?? 0; horsplan++ }
        else if (s === 'saute') saute++
      }
      for (const e of extras) kcalMange += e.hors_plan_kcal || 0

      const total     = meals.length
      const loggued   = fait + horsplan + saute
      const kcalPrevu = dayData?.objectif_kcal || plan.objectif_kcal || meals.reduce((s, m) => s + (m.kcal || 0), 0) || 0
      const adherPct  = total > 0 && loggued > 0 ? Math.round((fait + horsplan) / total * 100) : null

      result[iso] = { iso, fait, horsplan, saute, total, loggued, kcalMange, kcalPrevu, adherPct }
    }
    return result
  }, [plan, daysMap, byDate])

  const allDates     = Object.keys(dayStats).sort()
  const datesLoggued = allDates.filter(d => dayStats[d].loggued > 0)

  // Stats résumé 14 jours
  const last14 = allDates.slice(-14)
  const totalMeals14 = last14.reduce((s, d) => s + dayStats[d].total, 0)
  const totalFait14  = last14.reduce((s, d) => s + dayStats[d].fait, 0)
  const totalHP14    = last14.reduce((s, d) => s + dayStats[d].horsplan, 0)
  const totalSaute14 = last14.reduce((s, d) => s + dayStats[d].saute, 0)
  const adher14      = totalMeals14 > 0 ? Math.round((totalFait14 + totalHP14) / totalMeals14 * 100) : null

  // Données graphique (14 derniers jours avec logs)
  const chartData = useMemo(() => {
    return last14
      .filter(d => dayStats[d]?.loggued > 0)
      .map(d => ({ date: formatAxis(d), kcalMange: Math.round(dayStats[d].kcalMange), kcalPrevu: dayStats[d].kcalPrevu, adherPct: dayStats[d].adherPct }))
  }, [dayStats, last14])

  const avgKcalPrevu = plan?.objectif_kcal || (last14.length ? Math.round(last14.reduce((s, d) => s + dayStats[d].kcalPrevu, 0) / last14.length) : 0)

  if (loading) return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span style={S.headerTitle}>Historique</span>
        <div style={{ width: 32 }} />
      </div>
      <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>Chargement…</div>
      <ClientBottomNav />
    </div>
  )

  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={S.headerTitle}>Historique nutrition</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>

        {/* Pas de plan */}
        {!plan && (
          <div style={S.card}>
            <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem', textAlign: 'center' }}>Aucun plan actif</p>
            <p style={{ color: '#6b7280', fontSize: '0.83rem', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>L'historique d'adhérence sera disponible dès que ton coach active un plan.</p>
          </div>
        )}

        {/* Résumé 14 jours */}
        {plan && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Résumé — 14 jours</span>
              <span style={S.cardSub}>{datesLoggued.length} jour{datesLoggued.length > 1 ? 's' : ''} loggué{datesLoggued.length > 1 ? 's' : ''}</span>
            </div>

            {datesLoggued.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '0.83rem', textAlign: 'center', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                Commence à cocher tes repas depuis la page plan pour voir tes stats ici.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Adhérence', val: adher14 !== null ? `${adher14}%` : '—', color: adherenceColor(adher14) },
                    { label: 'Fait',      val: totalFait14,  color: '#16a34a' },
                    { label: 'Hors-plan', val: totalHP14,    color: '#d97706' },
                    { label: 'Sauté',     val: totalSaute14, color: '#ef4444' },
                  ].map(stat => (
                    <div key={stat.label} style={{ flex: 1, textAlign: 'center', background: stat.color + '15', borderRadius: 10, padding: '8px 4px' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.val}</div>
                      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: stat.color, opacity: 0.8, marginTop: 3, textTransform: 'uppercase' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                {totalMeals14 > 0 && (
                  <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ background: '#16a34a', width: `${totalFait14 / totalMeals14 * 100}%` }} />
                    <div style={{ background: '#d97706', width: `${totalHP14 / totalMeals14 * 100}%` }} />
                    <div style={{ background: '#ef4444', width: `${totalSaute14 / totalMeals14 * 100}%` }} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Graphique kcal */}
        {chartData.length > 1 && (
          <div style={{ ...S.card, background: '#1a1a1a', overflow: 'hidden' }}>
            <div style={S.cardHeader}>
              <span style={{ ...S.cardTitle, color: '#f9fafb' }}>Kcal consommés</span>
              <span style={{ ...S.cardSub, color: '#6b7280' }}>14 derniers jours loggués</span>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={42} />
                <Tooltip content={<CustomTooltip />} />
                {avgKcalPrevu > 0 && (
                  <ReferenceLine y={avgKcalPrevu} stroke="#e4f816" strokeDasharray="5 3" strokeWidth={1.5}
                    label={{ value: `${avgKcalPrevu} kcal`, position: 'insideTopRight', fill: '#e4f816', fontSize: 10, fontWeight: 700 }} />
                )}
                <Line type="monotone" dataKey="kcalMange" stroke="#e4f816" strokeWidth={2.5}
                  dot={{ fill: '#e4f816', r: 3, strokeWidth: 0 }} activeDot={{ fill: 'white', r: 4, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Calendrier 28 jours */}
        {plan && allDates.length > 0 && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Calendrier</span>
              <span style={S.cardSub}>28 derniers jours</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: 6 }}>
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <span key={i} style={{ textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>{d}</span>
              ))}
            </div>
            <CalendarGrid dayStats={dayStats} />
          </div>
        )}

        <div style={{ height: 20 }} />
      </div>

      <ClientBottomNav />
    </div>
  )
}

// ─── Calendrier ───────────────────────────────────────────────────────────────
function CalendarGrid({ dayStats }) {
  const today = toISO(new Date())
  // 28 derniers jours
  const allDates = Array.from({ length: 28 }, (_, i) => daysAgo(27 - i))

  const firstDate = new Date(allDates[0] + 'T00:00:00')
  const jsDay     = firstDate.getDay()
  const offset    = jsDay === 0 ? 6 : jsDay - 1

  const cells = [
    ...Array.from({ length: offset }, (_, i) => ({ key: `e${i}`, empty: true })),
    ...allDates.map(iso => {
      const s = dayStats[iso]
      const pct = s?.adherPct ?? (s?.loggued > 0 ? 0 : null)
      return { key: iso, iso, dayNum: parseInt(iso.split('-')[2], 10), color: adherenceColor(pct), isToday: iso === today, hasData: (s?.loggued || 0) > 0 }
    }),
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
      {cells.map(cell => {
        if (cell.empty) return <div key={cell.key} />
        return (
          <div key={cell.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: cell.hasData ? cell.color : '#f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              outline: cell.isToday ? '2.5px solid #1a1a1a' : 'none',
              outlineOffset: 1,
            }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: cell.hasData ? 'white' : '#9ca3af', lineHeight: 1 }}>{cell.dayNum}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:       { background: '#fafafa', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:     { background: 'var(--header-bg)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'white', position: 'sticky', top: 0, zIndex: 60 },
  headerTitle:{ fontSize: '1rem', fontWeight: 800 },
  backBtn:    { width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  content:    { padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  card:       { background: 'white', borderRadius: 16, padding: '1.1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' },
  cardTitle:  { fontSize: '0.92rem', fontWeight: 800, color: '#1a1a1a' },
  cardSub:    { fontSize: '0.74rem', fontWeight: 600, color: '#9ca3af' },
}
