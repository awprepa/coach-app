import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'

const STATUT_CONFIG = {
  brouillon: { label: 'Brouillon', bg: '#fef9c3', color: '#854d0e' },
  actif:     { label: 'Actif',     bg: '#dcfce7', color: '#166534' },
  archive:   { label: 'Archivé',   bg: '#f3f4f6', color: '#6b7280' },
}

const MEAL_LABELS = {
  petit_dej:   { label: 'Petit-déj',   color: '#f59e0b' },
  dejeuner:    { label: 'Déjeuner',    color: '#3b82f6' },
  collation:   { label: 'Collation',   color: '#22c55e' },
  diner:       { label: 'Dîner',       color: '#8b5cf6' },
  collation_2: { label: 'Collation 2', color: '#f97316' },
}

function toISO(date) { return date.toISOString().slice(0, 10) }

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatShort(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function getPlanDayNumber(dateISO, plan) {
  if (!plan?.date_debut) return 1
  const debut  = new Date(plan.date_debut + 'T00:00:00')
  const target = new Date(dateISO + 'T00:00:00')
  const diff   = Math.floor((target - debut) / 86400000)
  if (diff < 0) return null
  return (diff % 7) + 1
}

export default function NutritionPlansCoach() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [client,  setClient]  = useState(null)
  const [plans,   setPlans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('plans')

  // Suivi state
  const [suiviData,    setSuiviData]    = useState([])
  const [suiviLoading, setSuiviLoading] = useState(false)
  const [suiviLoaded,  setSuiviLoaded]  = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('clients').select('id, prenom, nom').eq('id', clientId).single(),
        supabase.from('nutrition_plans').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      ])
      setClient(c)
      setPlans(p || [])
      setLoading(false)
    }
    load()
  }, [clientId])

  // ── Chargement du suivi ───────────────────────────────────────────────────
  const loadSuivi = useCallback(async () => {
    if (suiviLoaded || suiviLoading) return
    const activePlan = plans.find(p => p.statut === 'actif')
    if (!activePlan) { setSuiviLoaded(true); return }
    setSuiviLoading(true)

    const today = toISO(new Date())
    const from  = toISO(new Date(Date.now() - 13 * 86400000))

    const [{ data: daysData }, { data: logsData }] = await Promise.all([
      supabase.from('nutrition_plan_days')
        .select('jour_numero, label, objectif_kcal, nutrition_plan_meals(id, nom, meal_type, kcal, ordre)')
        .eq('plan_id', activePlan.id).order('jour_numero'),
      supabase.from('nutrition_plan_logs')
        .select('*')
        .eq('client_id', clientId).eq('plan_id', activePlan.id)
        .gte('date', from).lte('date', today),
    ])

    const daysMap = {}
    for (const d of (daysData || [])) daysMap[d.jour_numero] = d

    const logsMap = {}
    for (const l of (logsData || [])) {
      if (!logsMap[l.date]) logsMap[l.date] = []
      logsMap[l.date].push(l)
    }

    const result = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const iso = toISO(d)
      if (activePlan.date_debut && iso < activePlan.date_debut) continue

      const dayNum = getPlanDayNumber(iso, activePlan)
      if (!dayNum) continue
      const dayData = daysMap[dayNum]
      const meals   = (dayData?.nutrition_plan_meals || []).sort((a, b) => a.ordre - b.ordre)
      const dayLogs = logsMap[iso] || []
      const planLogs = dayLogs.filter(l => l.meal_id !== null)
      const extras   = dayLogs.filter(l => l.meal_id === null)

      let kcalMange = 0
      const mealStats = meals.map(meal => {
        const log    = planLogs.find(l => l.meal_id === meal.id)
        const statut = log?.statut || 'non_loggé'
        if (statut === 'fait')           kcalMange += meal.kcal || 0
        else if (statut === 'hors_plan') kcalMange += log.hors_plan_kcal ?? meal.kcal ?? 0
        return { meal, statut, log }
      })
      for (const e of extras) kcalMange += e.hors_plan_kcal || 0

      const total    = meals.length
      const fait     = mealStats.filter(m => m.statut === 'fait').length
      const horsplan = mealStats.filter(m => m.statut === 'hors_plan').length
      const saute    = mealStats.filter(m => m.statut === 'saute').length
      const nonLog   = total - fait - horsplan - saute
      const kcalPrevu = (dayData?.objectif_kcal || activePlan.objectif_kcal || meals.reduce((s, m) => s + (m.kcal || 0), 0))

      result.push({ iso, dayNum, label: dayData?.label || `J${dayNum}`, total, fait, horsplan, saute, nonLog, kcalMange, kcalPrevu, extras: extras.length, mealStats })
    }

    setSuiviData(result)
    setSuiviLoaded(true)
    setSuiviLoading(false)
  }, [plans, clientId, suiviLoaded, suiviLoading])

  useEffect(() => {
    if (tab === 'suivi' && plans.length > 0 && !suiviLoaded) loadSuivi()
  }, [tab, plans, suiviLoaded, loadSuivi])

  // ── Actions plans ─────────────────────────────────────────────────────────
  async function deletePlan(planId, e) {
    e.stopPropagation()
    if (!window.confirm('Supprimer ce plan ? Cette action est irréversible.')) return
    await supabase.from('nutrition_plans').delete().eq('id', planId)
    setPlans(prev => prev.filter(p => p.id !== planId))
  }

  async function toggleStatut(plan, e) {
    e.stopPropagation()
    const next = plan.statut === 'actif' ? 'archive' : plan.statut === 'brouillon' ? 'actif' : 'brouillon'
    await supabase.from('nutrition_plans').update({ statut: next }).eq('id', plan.id)
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, statut: next } : p))
    setSuiviLoaded(false)
  }

  const activePlan = plans.find(p => p.statut === 'actif')
  const actif  = plans.filter(p => p.statut === 'actif')
  const autres = plans.filter(p => p.statut !== 'actif')

  // ── Stats globales suivi ──────────────────────────────────────────────────
  const daysWithLogs  = suiviData.filter(d => d.total > 0 && (d.fait + d.horsplan + d.saute) > 0)
  const totalMeals    = suiviData.reduce((s, d) => s + d.total, 0)
  const totalFait     = suiviData.reduce((s, d) => s + d.fait, 0)
  const totalHorsPlan = suiviData.reduce((s, d) => s + d.horsplan, 0)
  const totalSaute    = suiviData.reduce((s, d) => s + d.saute, 0)
  const adherencePct  = totalMeals > 0 ? Math.round((totalFait + totalHorsPlan) / totalMeals * 100) : null

  return (
    <div style={S.page}>
      <div style={S.inner}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
          <button onClick={() => navigate('/nutrition')} style={S.backBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={S.title}>Nutrition</h1>
            {client && <p style={S.subtitle}>{client.prenom} {client.nom}</p>}
          </div>
          {tab === 'plans' && (
            <button onClick={() => navigate(`/nutrition/plan/new?clientId=${clientId}`)} style={S.newBtn}>
              + Nouveau
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={S.tabBar}>
          {[{ key: 'plans', label: 'Plans' }, { key: 'suivi', label: 'Suivi adhérence' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '0.65rem 0', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.82rem',
              color: tab === t.key ? '#1a1a1a' : '#9ca3af',
              borderBottom: tab === t.key ? '2.5px solid #1a1a1a' : '2.5px solid transparent',
              fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ══ TAB PLANS ════════════════════════════════════════════════════ */}
        {tab === 'plans' && (
          loading ? (
            <div style={S.empty}>Chargement…</div>
          ) : plans.length === 0 ? (
            <div style={S.emptyCard}>
              <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.3rem' }}>Aucun plan nutritionnel</p>
              <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                Crée un plan en important un JSON généré par l'IA.
              </p>
              <button onClick={() => navigate(`/nutrition/plan/new?clientId=${clientId}`)} style={S.newBtn}>
                + Créer le premier plan
              </button>
            </div>
          ) : (
            <>
              {actif.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={S.sectionLabel}>Plan actif</div>
                  {actif.map(plan => <PlanCard key={plan.id} plan={plan} navigate={navigate} onDelete={deletePlan} onToggle={toggleStatut} />)}
                </div>
              )}
              {autres.length > 0 && (
                <div>
                  <div style={S.sectionLabel}>Autres plans</div>
                  {autres.map(plan => <PlanCard key={plan.id} plan={plan} navigate={navigate} onDelete={deletePlan} onToggle={toggleStatut} />)}
                </div>
              )}
            </>
          )
        )}

        {/* ══ TAB SUIVI ════════════════════════════════════════════════════ */}
        {tab === 'suivi' && (
          suiviLoading ? (
            <div style={S.empty}>Chargement du suivi…</div>
          ) : !activePlan ? (
            <div style={S.emptyCard}>
              <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem' }}>Aucun plan actif</p>
              <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: 0, lineHeight: 1.5 }}>
                Active un plan pour voir le suivi d'adhérence du client.
              </p>
            </div>
          ) : suiviData.length === 0 ? (
            <div style={S.emptyCard}>
              <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem' }}>Aucune donnée</p>
              <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: 0, lineHeight: 1.5 }}>
                Le client n'a pas encore loggé de repas depuis le début du plan ({formatDate(activePlan.date_debut)}).
              </p>
            </div>
          ) : (
            <>
              {/* Résumé global */}
              <div style={S.summaryCard}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Résumé — 14 derniers jours · {daysWithLogs.length} jour{daysWithLogs.length > 1 ? 's' : ''} loggué{daysWithLogs.length > 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Adhérence', val: adherencePct !== null ? `${adherencePct}%` : '—', color: adherencePct >= 80 ? '#16a34a' : adherencePct >= 60 ? '#d97706' : '#dc2626', bg: adherencePct >= 80 ? '#dcfce7' : adherencePct >= 60 ? '#fef9c3' : '#fee2e2' },
                    { label: 'Fait',      val: totalFait,     color: '#166534', bg: '#dcfce7' },
                    { label: 'Hors-plan', val: totalHorsPlan, color: '#92400e', bg: '#fef9c3' },
                    { label: 'Sauté',     val: totalSaute,    color: '#dc2626', bg: '#fee2e2' },
                  ].map(stat => (
                    <div key={stat.label} style={{ flex: 1, textAlign: 'center', background: stat.bg, borderRadius: 10, padding: '8px 4px' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.val}</div>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: stat.color, opacity: 0.8, marginTop: 3, textTransform: 'uppercase' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                {/* Barre globale */}
                {totalMeals > 0 && (
                  <div style={{ height: 8, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ background: '#16a34a', width: `${totalFait / totalMeals * 100}%`, transition: 'width 0.4s' }} />
                    <div style={{ background: '#d97706', width: `${totalHorsPlan / totalMeals * 100}%`, transition: 'width 0.4s' }} />
                    <div style={{ background: '#ef4444', width: `${totalSaute / totalMeals * 100}%`, transition: 'width 0.4s' }} />
                  </div>
                )}
              </div>

              {/* Liste par jour */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {suiviData.map(day => (
                  <DayAdherenceCard key={day.iso} day={day} />
                ))}
              </div>
            </>
          )
        )}

      </div>
    </div>
  )
}

// ─── Carte jour adhérence ─────────────────────────────────────────────────────
function DayAdherenceCard({ day }) {
  const [open, setOpen] = useState(false)
  const { iso, label, total, fait, horsplan, saute, nonLog, kcalMange, kcalPrevu, mealStats } = day
  const loggued = fait + horsplan + saute
  const adherPct = total > 0 ? Math.round((fait + horsplan) / total * 100) : null
  const isToday = iso === new Date().toISOString().slice(0, 10)

  const dotColor = adherPct === null ? '#e5e7eb'
    : adherPct >= 80 ? '#16a34a'
    : adherPct >= 50 ? '#d97706'
    : '#ef4444'

  return (
    <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: isToday ? '1.5px solid #1a1a1a' : '1.5px solid #f0f0f0' }}>
      <button onClick={() => setOpen(v => !v)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', fontFamily: 'inherit' }}>
        {/* Dot adhérence */}
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />

        {/* Date + label */}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1a1a1a' }}>
            {isToday ? "Aujourd'hui" : formatShort(iso)}
            <span style={{ fontWeight: 500, color: '#9ca3af', marginLeft: 6, fontSize: '0.75rem' }}>{label}</span>
          </div>
          {loggued > 0 && (
            <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
              {loggued}/{total} repas loggués · {Math.round(kcalMange)} kcal
              {kcalPrevu > 0 && ` / ${kcalPrevu} prescrits`}
            </div>
          )}
          {loggued === 0 && (
            <div style={{ fontSize: '0.68rem', color: '#d1d5db', marginTop: 1, fontStyle: 'italic' }}>Aucun log</div>
          )}
        </div>

        {/* Mini barres */}
        {total > 0 && loggued > 0 && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {Array.from({ length: total }, (_, i) => {
              const ms = mealStats[i]
              const c = ms?.statut === 'fait' ? '#16a34a' : ms?.statut === 'hors_plan' ? '#d97706' : ms?.statut === 'saute' ? '#ef4444' : '#e5e7eb'
              return <div key={i} style={{ width: 6, height: 20, borderRadius: 3, background: c }} />
            })}
          </div>
        )}

        {/* Adhérence % */}
        {adherPct !== null && loggued > 0 && (
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: dotColor, minWidth: 36, textAlign: 'right' }}>
            {adherPct}%
          </span>
        )}

        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && mealStats.length > 0 && (
        <div style={{ borderTop: '1px solid #f5f5f5', padding: '10px 14px 12px' }}>
          {mealStats.map(({ meal, statut, log }) => {
            const ml = MEAL_LABELS[meal.meal_type] || { label: meal.meal_type, color: '#9ca3af' }
            const statusColors = { fait: '#16a34a', hors_plan: '#d97706', saute: '#ef4444', non_loggé: '#d1d5db' }
            const statusLabels = { fait: 'Fait', hors_plan: 'Autre chose', saute: 'Sauté', non_loggé: 'Non loggé' }
            return (
              <div key={meal.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #fafafa' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ml.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', flex: 1 }}>{ml.label} — {meal.nom}</span>
                {meal.kcal > 0 && <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{meal.kcal} kcal</span>}
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: statusColors[statut], background: statusColors[statut] + '18', padding: '2px 7px', borderRadius: 20 }}>
                  {statusLabels[statut]}
                </span>
                {statut === 'hors_plan' && log?.hors_plan_nom && (
                  <span style={{ fontSize: '0.62rem', color: '#9ca3af', fontStyle: 'italic' }}>({log.hors_plan_nom})</span>
                )}
              </div>
            )
          })}
          {day.extras > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#6d28d9', marginTop: 6, fontStyle: 'italic' }}>
              + {day.extras} repas ajouté{day.extras > 1 ? 's' : ''} hors-plan
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Carte plan ───────────────────────────────────────────────────────────────
function PlanCard({ plan, navigate, onDelete, onToggle }) {
  const sc = STATUT_CONFIG[plan.statut] || STATUT_CONFIG.brouillon
  return (
    <div onClick={() => navigate(`/nutrition/plan/${plan.id}`)} style={S.card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.97rem', color: '#1a1a1a', marginBottom: 4 }}>{plan.nom}</div>
          {plan.description && (
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 6, lineHeight: 1.4 }}>{plan.description}</div>
          )}
          <div style={{ fontSize: '0.73rem', color: '#9ca3af', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {plan.date_debut && <span>Du {formatDate(plan.date_debut)}</span>}
            {plan.date_fin   && <span>au {formatDate(plan.date_fin)}</span>}
            {!plan.date_debut && !plan.date_fin && <span>Pas de dates définies</span>}
            {plan.objectif_kcal && <span>· {plan.objectif_kcal} kcal/j</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={e => onToggle(plan, e)} style={{ ...S.badge, background: sc.bg, color: sc.color }}>{sc.label}</button>
          <button onClick={e => onDelete(plan.id, e)} style={S.deleteBtn}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:       { background: '#fafafa', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  inner:      { maxWidth: 700, margin: '0 auto', padding: '2rem 1.25rem' },
  backBtn:    { width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', flexShrink: 0 },
  title:      { fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' },
  subtitle:   { fontSize: '0.83rem', color: '#9ca3af', margin: '2px 0 0', fontWeight: 500 },
  newBtn:     { padding: '0.6rem 1rem', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  tabBar:     { display: 'flex', borderBottom: '1.5px solid #f0f0f0', marginBottom: '1.25rem' },
  empty:      { textAlign: 'center', color: '#9ca3af', padding: '3rem 0' },
  emptyCard:  { background: 'white', borderRadius: 18, padding: '2rem', textAlign: 'center', border: '1.5px dashed #e5e7eb' },
  sectionLabel: { fontSize: '0.7rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' },
  summaryCard: { background: 'white', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12, border: '1.5px solid #f0f0f0' },
  card:       { background: 'white', borderRadius: 16, padding: '14px 16px', marginBottom: 10, border: '1.5px solid #f0f0f0', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  badge:      { fontSize: '0.7rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer' },
  deleteBtn:  { width: 26, height: 26, borderRadius: '50%', background: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
}
