import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'

function toISO(date) { return date.toISOString().slice(0, 10) }

const MEAL_LABELS = {
  petit_dej:   { label: 'Petit-déj',   color: '#f59e0b' },
  dejeuner:    { label: 'Déjeuner',    color: '#3b82f6' },
  collation:   { label: 'Collation',   color: '#22c55e' },
  diner:       { label: 'Dîner',       color: '#8b5cf6' },
  collation_2: { label: 'Collation 2', color: '#f97316' },
  autre:       { label: 'Autre',       color: '#9ca3af' },
}

const TYPE_JOUR_LABELS = {
  standard:     'Jour standard',
  entrainement: "Jour d'entraînement",
  repos:        'Jour de repos',
  competition:  'Jour de compétition',
  custom:       'Jour spécial',
}

function getPlanDayNumber(dateISO, plan) {
  if (!plan.date_debut) return 1
  const debut = new Date(plan.date_debut + 'T00:00:00')
  const target = new Date(dateISO + 'T00:00:00')
  const diffDays = Math.floor((target - debut) / 86400000)
  if (diffDays < 0) return null
  return (diffDays % 7) + 1
}

// ─── Composant carte repas (hooks autorisés ici) ──────────────────────────────
function MealCard({ meal, log, dayNum, saving, onLog, onHorsPlan }) {
  const [expanded, setExpanded] = useState(false)
  const ml = MEAL_LABELS[meal.meal_type] || { label: meal.meal_type, color: '#9ca3af' }
  const statut = log?.statut || null
  const foods = (meal.nutrition_plan_foods || []).sort((a, b) => a.ordre - b.ordre)

  const borderColor = statut === 'fait' ? '#16a34a' : statut === 'hors_plan' ? '#d97706' : statut === 'saute' ? '#ef4444' : '#e5e7eb'

  return (
    <div style={{ ...S.mealCard, borderLeft: `3px solid ${borderColor}` }}>
      {/* En-tête */}
      <button onClick={() => setExpanded(v => !v)} style={S.mealHeader}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: ml.color, display: 'inline-block', flexShrink: 0 }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1a1a1a' }}>{ml.label} — {meal.nom}</div>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
            {[meal.kcal && `${meal.kcal} kcal`, meal.prot_g && `P ${meal.prot_g}g`, meal.carbs_g && `G ${meal.carbs_g}g`, meal.fat_g && `L ${meal.fat_g}g`].filter(Boolean).join(' · ')}
          </div>
        </div>
        {statut && (
          <span style={{
            fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 20,
            background: statut === 'fait' ? '#dcfce7' : statut === 'hors_plan' ? '#fef9c3' : '#fee2e2',
            color: statut === 'fait' ? '#166534' : statut === 'hors_plan' ? '#92400e' : '#dc2626',
          }}>
            {statut === 'fait' ? '✓ Fait' : statut === 'hors_plan' ? '≠ Autre' : '✕ Sauté'}
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Détails */}
      {expanded && (
        <div style={{ padding: '0.5rem 1rem 0.75rem', borderTop: '1px solid #f5f5f5' }}>
          {foods.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {foods.map(food => (
                <div key={food.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f9fafb' }}>
                  <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>{food.nom}</span>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                    {food.quantite_g ? `${food.quantite_g}g` : ''}{food.kcal ? ` · ${food.kcal} kcal` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          {meal.recette && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 8, fontSize: '0.72rem', color: '#92400e', lineHeight: 1.5 }}>
              <strong>Préparation :</strong> {meal.recette}
            </div>
          )}
          {log?.statut === 'hors_plan' && log.hors_plan_nom && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 8, fontSize: '0.72rem', color: '#92400e' }}>
              Mangé à la place : <strong>{log.hors_plan_nom}</strong>
              {log.hors_plan_kcal && ` · ${log.hors_plan_kcal} kcal`}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, padding: '0 1rem 0.875rem' }}>
        <button disabled={saving} onClick={() => onLog(meal, 'fait', dayNum)}
          style={{ ...S.actionBtn, background: statut === 'fait' ? '#16a34a' : '#f0fdf4', color: statut === 'fait' ? 'white' : '#16a34a', border: `1.5px solid ${statut === 'fait' ? '#16a34a' : '#bbf7d0'}` }}>
          ✓ Fait
        </button>
        <button disabled={saving} onClick={() => onHorsPlan(meal, dayNum)}
          style={{ ...S.actionBtn, background: statut === 'hors_plan' ? '#d97706' : '#fffbeb', color: statut === 'hors_plan' ? 'white' : '#d97706', border: `1.5px solid ${statut === 'hors_plan' ? '#d97706' : '#fde68a'}` }}>
          ≠ Autre
        </button>
        <button disabled={saving} onClick={() => onLog(meal, 'saute', dayNum)}
          style={{ ...S.actionBtn, background: statut === 'saute' ? '#ef4444' : '#fef2f2', color: statut === 'saute' ? 'white' : '#ef4444', border: `1.5px solid ${statut === 'saute' ? '#ef4444' : '#fecaca'}` }}>
          ✕ Sauté
        </button>
      </div>
    </div>
  )
}

// ─── Carte repas libre ajouté par le client ───────────────────────────────────
function ExtraCard({ log, onDelete }) {
  return (
    <div style={{ ...S.mealCard, borderLeft: '3px solid #6366f1' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#6366f1', display: 'inline-block', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1a1a1a' }}>{log.hors_plan_nom || 'Repas ajouté'}</div>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
            {[log.hors_plan_kcal && `${log.hors_plan_kcal} kcal`, log.hors_plan_prot && `P ${log.hors_plan_prot}g`, log.hors_plan_carbs && `G ${log.hors_plan_carbs}g`, log.hors_plan_fat && `L ${log.hors_plan_fat}g`].filter(Boolean).join(' · ') || 'Sans info nutritionnelle'}
          </div>
        </div>
        <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9', flexShrink: 0 }}>Ajouté</span>
        <button onClick={() => onDelete(log.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#d1d5db', display: 'flex' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Carte compensation kcal ──────────────────────────────────────────────────
function CompensationCard({ meals, logs, tomorrowDay }) {
  const totalPlan = meals.reduce((s, m) => s + (m.kcal || 0), 0)
  if (!totalPlan) return null

  const planLogs  = logs.filter(l => l.meal_id !== null)
  const extraLogs = logs.filter(l => l.meal_id === null)
  if (!planLogs.length && !extraLogs.length) return null

  let mange = 0
  for (const l of planLogs) {
    const m = meals.find(m => m.id === l.meal_id)
    if (l.statut === 'fait')           mange += m?.kcal || 0
    else if (l.statut === 'hors_plan') mange += l.hors_plan_kcal ?? m?.kcal ?? 0
  }
  for (const l of extraLogs) mange += l.hors_plan_kcal || 0

  const loggedIds     = new Set(planLogs.map(l => l.meal_id))
  const resteKcal     = meals.filter(m => !loggedIds.has(m.id)).reduce((s, m) => s + (m.kcal || 0), 0)
  const prevuMange    = totalPlan - resteKcal
  const surplus       = mange - prevuMange
  const isOver        = surplus > 80
  const isUnder       = resteKcal === 0 && (totalPlan - mange) > 100

  if (!isOver && !isUnder) return null

  function getTomorrowSuggestion() {
    if (!tomorrowDay) return null
    const tmMeals = (tomorrowDay.nutrition_plan_meals || []).filter(m => m.kcal > 0)
    if (!tmMeals.length) return null
    const best = tmMeals.reduce((prev, cur) => Math.abs(cur.kcal - surplus) < Math.abs(prev.kcal - surplus) ? cur : prev)
    const ml = MEAL_LABELS[best.meal_type]
    return ml ? ml.label.toLowerCase() : best.nom
  }

  const tmLabel = isOver ? getTomorrowSuggestion() : null
  const c = isOver
    ? { bg: '#fef2f2', border: '#fecaca', iconBg: '#fee2e2', iconStroke: '#dc2626', title: '#dc2626' }
    : { bg: '#f0fdf4', border: '#bbf7d0', iconBg: '#dcfce7', iconStroke: '#16a34a', title: '#16a34a' }

  return (
    <div style={{ borderRadius: 14, padding: '14px 16px', background: c.bg, border: `1.5px solid ${c.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: c.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isOver
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.iconStroke} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c.iconStroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          }
        </div>
        <div style={{ flex: 1 }}>
          {isOver && (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: c.title, marginBottom: 4 }}>
                +{Math.round(surplus)} kcal au-dessus de l'objectif
              </div>
              <div style={{ fontSize: '0.76rem', color: '#6b7280', lineHeight: 1.6 }}>
                Tu as mangé <strong>{Math.round(mange)} kcal</strong> pour <strong>{Math.round(prevuMange)} prévues</strong>.
                {tmLabel
                  ? <span> Pour compenser demain, allège ta <strong>{tmLabel}</strong>.</span>
                  : <span> Pense à alléger un repas sur le prochain jour.</span>
                }
              </div>
            </>
          )}
          {isUnder && (
            <>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: c.title, marginBottom: 4 }}>
                Journée complète · {Math.round(totalPlan - mange)} kcal sous l'objectif
              </div>
              <div style={{ fontSize: '0.76rem', color: '#6b7280', lineHeight: 1.6 }}>
                Tu as mangé <strong>{Math.round(mange)} kcal</strong> sur <strong>{Math.round(totalPlan)} prévues</strong>. Tu peux ajouter un repas ci-dessous si c'est non intentionnel.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function NutritionPlanClient() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const fadeStyle = usePageFade()
  const [client, setClient] = useState(null)
  const [plan, setPlan]     = useState(null)
  const [days, setDays]     = useState([])
  const [logs, setLogs]     = useState([])
  const [water, setWater]   = useState({ ml: 0 })
  const [loading, setLoading] = useState(true)
  const [tab, setTab]       = useState('semaine')
  const [viewDate, setViewDate] = useState(new Date())
  const [savingLog, setSavingLog] = useState(null)
  const [horsplanModal, setHorsplanModal] = useState(null)
  const [horsplanForm, setHorsplanForm]   = useState({ nom: '', kcal: '', prot_g: '', carbs_g: '', fat_g: '' })
  const [showAddModal, setShowAddModal]   = useState(false)
  const [addForm, setAddForm]             = useState({ nom: '', kcal: '', prot_g: '', carbs_g: '', fat_g: '', meal_type: 'autre' })
  const [savingExtra, setSavingExtra]     = useState(false)

  // Retour depuis scanner avec produit pré-rempli
  useEffect(() => {
    const food = location.state?.prefillFood
    if (!food) return
    // food vient du scanner : champs kcal_100, prot_100… (valeurs pour 100g)
    setAddForm({
      nom:     food.name || food.nom || '',
      kcal:    food.kcal_100 != null ? String(Math.round(food.kcal_100)) : '',
      prot_g:  food.prot_100 != null ? String(Math.round(food.prot_100)) : '',
      carbs_g: food.carbs_100 != null ? String(Math.round(food.carbs_100)) : '',
      fat_g:   food.fat_100 != null ? String(Math.round(food.fat_100)) : '',
      meal_type: 'autre',
    })
    setShowAddModal(true)
    // Nettoyer l'état de navigation pour éviter ré-ouverture au refresh
    window.history.replaceState({}, '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Chargement ───────────────────────────────────────────────────────────
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
        const { data: daysData } = await supabase
          .from('nutrition_plan_days')
          .select(`*, nutrition_plan_meals(*, nutrition_plan_foods(*))`)
          .eq('plan_id', activePlan.id).order('jour_numero')
        setDays(daysData || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Logs + eau pour la date ──────────────────────────────────────────────
  const loadLogs = useCallback(async (dateISO) => {
    if (!client || !plan) return
    const [{ data: logsData }, { data: waterData }] = await Promise.all([
      supabase.from('nutrition_plan_logs').select('*')
        .eq('client_id', client.id).eq('plan_id', plan.id).eq('date', dateISO),
      supabase.from('nutrition_water').select('ml')
        .eq('client_id', client.id).eq('date', dateISO).maybeSingle(),
    ])
    setLogs(logsData || [])
    setWater(waterData || { ml: 0 })
  }, [client, plan])

  useEffect(() => {
    if (client && plan) loadLogs(toISO(viewDate))
  }, [client, plan, viewDate, loadLogs])

  // ── Logger un repas ──────────────────────────────────────────────────────
  async function logMeal(meal, statut, dayNum) {
    if (!client || !plan) return
    setSavingLog(meal.id)
    const iso = toISO(viewDate)
    const existing = logs.find(l => l.meal_id === meal.id)
    if (existing) {
      if (existing.statut === statut) {
        await supabase.from('nutrition_plan_logs').delete().eq('id', existing.id)
        setLogs(prev => prev.filter(l => l.id !== existing.id))
      } else {
        await supabase.from('nutrition_plan_logs').update({ statut }).eq('id', existing.id)
        setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, statut } : l))
      }
    } else {
      const { data: inserted } = await supabase.from('nutrition_plan_logs').insert({
        plan_id: plan.id, client_id: client.id,
        date: iso, jour_numero: dayNum, meal_id: meal.id, statut,
      }).select().single()
      if (inserted) setLogs(prev => [...prev, inserted])
    }
    setSavingLog(null)
  }

  // ── Ajouter repas libre ──────────────────────────────────────────────────
  async function addExtraMeal() {
    if (!client || !plan || !addForm.nom.trim()) return
    setSavingExtra(true)
    const iso    = toISO(viewDate)
    const dayNum = getPlanDayNumber(iso, plan) || 1
    const { data: ins } = await supabase.from('nutrition_plan_logs').insert({
      plan_id: plan.id, client_id: client.id,
      date: iso, jour_numero: dayNum,
      meal_id: null, statut: 'extra',
      hors_plan_nom:   addForm.nom.trim(),
      hors_plan_kcal:  addForm.kcal    ? Number(addForm.kcal)    : null,
      hors_plan_prot:  addForm.prot_g  ? Number(addForm.prot_g)  : null,
      hors_plan_carbs: addForm.carbs_g ? Number(addForm.carbs_g) : null,
      hors_plan_fat:   addForm.fat_g   ? Number(addForm.fat_g)   : null,
    }).select().single()
    if (ins) setLogs(prev => [...prev, ins])
    setAddForm({ nom: '', kcal: '', prot_g: '', carbs_g: '', fat_g: '', meal_type: 'autre' })
    setShowAddModal(false)
    setSavingExtra(false)
  }

  // ── Supprimer repas libre ────────────────────────────────────────────────
  async function deleteExtraLog(logId) {
    await supabase.from('nutrition_plan_logs').delete().eq('id', logId)
    setLogs(prev => prev.filter(l => l.id !== logId))
  }

  // ── Hors-plan ────────────────────────────────────────────────────────────
  async function saveHorsPlan(meal, dayNum) {
    if (!client || !plan) return
    const iso = toISO(viewDate)
    const existing = logs.find(l => l.meal_id === meal.id)
    const payload = {
      plan_id: plan.id, client_id: client.id,
      date: iso, jour_numero: dayNum, meal_id: meal.id, statut: 'hors_plan',
      hors_plan_nom:   horsplanForm.nom   || null,
      hors_plan_kcal:  horsplanForm.kcal  ? Number(horsplanForm.kcal)    : null,
      hors_plan_prot:  horsplanForm.prot_g  ? Number(horsplanForm.prot_g)  : null,
      hors_plan_carbs: horsplanForm.carbs_g ? Number(horsplanForm.carbs_g) : null,
      hors_plan_fat:   horsplanForm.fat_g   ? Number(horsplanForm.fat_g)   : null,
    }
    if (existing) {
      await supabase.from('nutrition_plan_logs').update(payload).eq('id', existing.id)
      setLogs(prev => prev.map(l => l.id === existing.id ? { ...l, ...payload } : l))
    } else {
      const { data: inserted } = await supabase.from('nutrition_plan_logs').insert(payload).select().single()
      if (inserted) setLogs(prev => [...prev, inserted])
    }
    setHorsplanModal(null)
    setHorsplanForm({ nom: '', kcal: '', prot_g: '', carbs_g: '', fat_g: '' })
  }

  // ── Hydratation ──────────────────────────────────────────────────────────
  async function updateWater(delta) {
    if (!client) return
    const newMl = Math.max(0, (water.ml || 0) + delta)
    setWater({ ml: newMl })
    await supabase.from('nutrition_water').upsert(
      { client_id: client.id, date: toISO(viewDate), ml: newMl, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,date' }
    )
  }

  // ── Liste de courses ─────────────────────────────────────────────────────
  function getShoppingList() {
    const items = {}
    for (const day of days) {
      for (const meal of (day.nutrition_plan_meals || [])) {
        for (const food of (meal.nutrition_plan_foods || [])) {
          const key = food.nom.toLowerCase()
          if (items[key]) { items[key].quantite += food.quantite_g || 0; items[key].count++ }
          else items[key] = { nom: food.nom, quantite: food.quantite_g || 0, count: 1 }
        }
      }
    }
    return Object.values(items).sort((a, b) => a.nom.localeCompare(b.nom))
  }

  // ── Render loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition')} style={S.iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>Nutrition</span>
        <div style={{ width: 32 }} />
      </div>
      <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Chargement…</div>
      <ClientBottomNav />
    </div>
  )

  // ── Render sans plan ─────────────────────────────────────────────────────
  if (!plan) return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition')} style={S.iconBtn} aria-label="Retour au journal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>Plan de mon coach</span>
        <div style={{ width: 32 }} />
      </div>
      <div style={S.content}>
        <div style={{ background: 'white', borderRadius: 18, padding: '2rem 1.5rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f3f4f6', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
              <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
          </div>
          <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem', fontSize: '1rem' }}>Aucun plan actif</p>
          <p style={{ color: '#6b7280', fontSize: '0.83rem', lineHeight: 1.5, margin: 0 }}>
            Ton coach n'a pas encore activé de plan nutritionnel pour toi. En attendant, tu peux noter tes repas
            dans ton journal.
          </p>
          <button onClick={() => navigate('/client/nutrition')}
            style={{ marginTop: '1.1rem', width: '100%', background: '#1a1a1a', color: 'var(--accent)', border: 'none', borderRadius: 14, padding: '0.85rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            Aller à mon journal
          </button>
        </div>
        <div style={{ height: 80 }} />
      </div>
      <ClientBottomNav />
    </div>
  )

  // ── Données dérivées ─────────────────────────────────────────────────────
  const iso = toISO(viewDate)
  const isToday = iso === toISO(new Date())
  const dayNum = getPlanDayNumber(iso, plan)
  const currentDay = days.find(d => d.jour_numero === dayNum)
  const meals = (currentDay?.nutrition_plan_meals || []).sort((a, b) => a.ordre - b.ordre)

  const planLogs  = logs.filter(l => l.meal_id !== null)
  const extraLogs = logs.filter(l => l.meal_id === null)

  const totalKcalPlan = meals.reduce((s, m) => s + (m.kcal || 0), 0)
  let totalKcalMange = 0
  for (const l of planLogs) {
    const m = meals.find(m => m.id === l.meal_id)
    if (l.statut === 'fait')           totalKcalMange += m?.kcal || 0
    else if (l.statut === 'hors_plan') totalKcalMange += l.hors_plan_kcal ?? m?.kcal ?? 0
  }
  for (const l of extraLogs) totalKcalMange += l.hors_plan_kcal || 0

  const isOver    = totalKcalMange > totalKcalPlan && totalKcalPlan > 0
  const adherence = totalKcalPlan > 0 ? Math.min(Math.round(totalKcalMange / totalKcalPlan * 100), 150) : 0

  // Jour de demain dans le plan (pour suggestion de compensation)
  const tomorrowDate = new Date(viewDate); tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowNum  = getPlanDayNumber(toISO(tomorrowDate), plan)
  const tomorrowDay  = days.find(d => d.jour_numero === tomorrowNum)

  function changeDay(delta) {
    const d = new Date(viewDate); d.setDate(d.getDate() + delta)
    if (d > new Date()) return
    setViewDate(d)
  }

  const waterTarget = 2000
  const waterPct = Math.min((water.ml / waterTarget) * 100, 100)
  const shoppingList = getShoppingList()

  return (
    <div style={{ ...S.page, ...fadeStyle }}>

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition')} style={S.iconBtn} aria-label="Retour au journal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem' }}>{plan.nom}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.62rem' }}>Plan prescrit</div>
        </div>
        <button onClick={() => navigate('/client/nutrition/historique')} style={{ width: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </button>
      </div>

      {/* Onglets */}
      <div style={S.tabBar}>
        {[
          { key: 'semaine',     label: '7 jours' },
          { key: 'courses',     label: 'Courses' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '0.6rem 0', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '0.78rem',
            color: tab === t.key ? 'var(--accent-fg-dark)' : 'rgba(255,255,255,0.45)',
            borderBottom: tab === t.key ? '2px solid var(--accent-fg-dark)' : '2px solid transparent',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.content}>

        {/* ══ 7 JOURS ══════════════════════════════════════════════════════ */}
        {tab === 'semaine' && (
          <div>
            {days.map(day => (
              <div key={day.id} style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontWeight: 800, fontSize: '0.83rem', color: '#1a1a1a', marginBottom: 4 }}>
                  Jour {day.jour_numero} — {day.label}
                  {(day.objectif_kcal || plan.objectif_kcal) && (
                    <span style={{ color: '#9ca3af', fontWeight: 500, marginLeft: 6 }}>
                      {day.objectif_kcal || plan.objectif_kcal} kcal
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(day.nutrition_plan_meals || []).sort((a, b) => a.ordre - b.ordre).map(meal => {
                    const ml = MEAL_LABELS[meal.meal_type] || { label: meal.meal_type, color: '#9ca3af' }
                    return (
                      <div key={meal.id} style={S.weekMealRow}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ml.color, display: 'inline-block', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1a1a1a' }}>{ml.label} — {meal.nom}</span>
                          <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>
                            {[meal.kcal && `${meal.kcal} kcal`, meal.prot_g && `P ${meal.prot_g}g`, meal.carbs_g && `G ${meal.carbs_g}g`].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{(meal.nutrition_plan_foods || []).length} aliments</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ COURSES ══════════════════════════════════════════════════════ */}
        {tab === 'courses' && (
          <div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              Liste complète pour les 7 jours. Les quantités sont cumulées.
            </p>
            {shoppingList.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0' }}>Aucun aliment dans le plan.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {shoppingList.map((item, i) => <ShoppingItem key={i} item={item} />)}
              </div>
            )}
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>

      {/* Modal hors-plan */}
      {horsplanModal && (
        <div style={S.overlay} onClick={() => setHorsplanModal(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1rem' }} />
            <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 0.3rem', color: '#1a1a1a' }}>Repas hors-plan</p>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 1rem' }}>Qu'as-tu mangé à la place ? (optionnel)</p>
            <div style={{ marginBottom: '0.65rem' }}>
              <label style={S.fieldLabel}>Ce que tu as mangé</label>
              <input value={horsplanForm.nom} onChange={e => setHorsplanForm(f => ({ ...f, nom: e.target.value }))} style={S.fieldInput} placeholder="Ex: Restaurant, pizza…" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
              {[{ key: 'kcal', label: 'Calories (kcal)' }, { key: 'prot_g', label: 'Prot (g)' }, { key: 'carbs_g', label: 'Gluc (g)' }, { key: 'fat_g', label: 'Lip (g)' }].map(f => (
                <div key={f.key}>
                  <label style={S.fieldLabel}>{f.label}</label>
                  <input type="number" value={horsplanForm[f.key]} onChange={e => setHorsplanForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.fieldInput} placeholder="—" />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setHorsplanModal(null)} style={S.cancelBtn}>Annuler</button>
              <button onClick={() => saveHorsPlan(horsplanModal.meal, horsplanModal.dayNum)} style={S.saveBtn}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ajouter repas libre ─────────────────────────────────────── */}
      {showAddModal && (
        <div style={S.overlay} onClick={() => setShowAddModal(false)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1rem' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0, color: '#1a1a1a' }}>Ajouter un repas</p>
              <button
                onClick={() => navigate('/client/nutrition/scanner', { state: { returnTo: '/client/nutrition/plan' } })}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="21"/><line x1="14" y1="14" x2="21" y2="14"/>
                </svg>
                Scanner
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 1rem', lineHeight: 1.5 }}>
              Repas non prévu dans le plan — pris en compte dans le bilan kcal du jour.
            </p>
            <div style={{ marginBottom: '0.65rem' }}>
              <label style={S.fieldLabel}>Nom du repas *</label>
              <input value={addForm.nom} onChange={e => setAddForm(f => ({ ...f, nom: e.target.value }))} style={S.fieldInput} placeholder="Ex: Yaourt grec, barre protéinée…" autoFocus />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '0.8rem' }}>
              {[{ key: 'kcal', label: 'Calories (kcal)' }, { key: 'prot_g', label: 'Prot (g)' }, { key: 'carbs_g', label: 'Gluc (g)' }, { key: 'fat_g', label: 'Lip (g)' }].map(f => (
                <div key={f.key}>
                  <label style={S.fieldLabel}>{f.label}</label>
                  <input type="number" inputMode="numeric" value={addForm[f.key]} onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.fieldInput} placeholder="—" />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={S.fieldLabel}>Type de repas</label>
              <select value={addForm.meal_type} onChange={e => setAddForm(f => ({ ...f, meal_type: e.target.value }))}
                style={{ ...S.fieldInput, appearance: 'none', WebkitAppearance: 'none' }}>
                {Object.entries(MEAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAddModal(false)} style={S.cancelBtn}>Annuler</button>
              <button onClick={addExtraMeal} disabled={!addForm.nom.trim() || savingExtra}
                style={{ ...S.saveBtn, opacity: !addForm.nom.trim() ? 0.5 : 1 }}>
                {savingExtra ? 'Enregistrement…' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ClientBottomNav />
    </div>
  )
}

// ─── Hydratation ──────────────────────────────────────────────────────────────
function HydratationCard({ water, onUpdate }) {
  const waterTarget = 2000
  const waterPct = Math.min(((water.ml || 0) / waterTarget) * 100, 100)
  const verres = Math.round((water.ml || 0) / 250)
  const targetVerres = Math.round(waterTarget / 250)
  return (
    <div style={S.waterCard}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'white' }}>Hydratation</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(255,255,255,0.25)', padding: '3px 9px', borderRadius: 20, color: 'white' }}>{Math.round(waterPct)}%</span>
      </div>
      <div style={{ height: 8, background: '#eff6ff', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ height: '100%', background: '#3b82f6', borderRadius: 999, width: `${waterPct}%`, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button onClick={() => onUpdate(-250)} style={S.waterBtnMinus} aria-label="Retirer 1 verre">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, marginTop: 2 }}>1 verre</span>
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>
            {verres} <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>verre{verres > 1 ? 's' : ''}</span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#93c5fd', fontWeight: 600, marginTop: 3 }}>
            {water.ml || 0} ml · objectif {targetVerres} verres
          </div>
        </div>
        <button onClick={() => onUpdate(+250)} style={S.waterBtnPlus} aria-label="Ajouter 1 verre">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, marginTop: 2 }}>1 verre</span>
        </button>
      </div>
    </div>
  )
}

// ─── Shopping item ────────────────────────────────────────────────────────────
function ShoppingItem({ item }) {
  const [checked, setChecked] = useState(false)
  return (
    <div onClick={() => setChecked(v => !v)} style={{ ...S.shopRow, opacity: checked ? 0.4 : 1 }}>
      <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? '#16a34a' : '#d1d5db'}`, background: checked ? '#16a34a' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1a1a1a', flex: 1, textDecoration: checked ? 'line-through' : 'none' }}>{item.nom}</span>
      {item.quantite > 0 && (
        <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>
          {item.count > 1 ? `${Math.round(item.quantite)}g / sem.` : `${Math.round(item.quantite)}g`}
        </span>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:    { background: '#f5f5f5', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:  { background: 'var(--header-bg)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 60 },
  iconBtn: { width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabBar:  { background: 'var(--header-bg)', display: 'flex', borderTop: '1px solid rgba(255,255,255,0.1)', position: 'sticky', top: 56, zIndex: 59 },
  content: { padding: '14px 14px 150px', display: 'flex', flexDirection: 'column', gap: '10px' },
  dateNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', borderRadius: 14, padding: '10px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  dateArrow: { background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.3rem', cursor: 'pointer', padding: '0 4px' },
  kcalCard: { background: 'var(--header-bg)', borderRadius: 18, padding: '16px 18px' },
  macrosCard: { background: 'white', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  mealCard: { background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  mealHeader: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px', textAlign: 'left' },
  actionBtn: { flex: 1, padding: '0.55rem 0', borderRadius: 10, fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' },
  weekMealRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'white', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  shopRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'white', borderRadius: 12, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  waterCard: { background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', borderRadius: 18, padding: '16px 16px 18px', boxShadow: '0 4px 16px rgba(29,78,216,0.25)' },
  waterBtnMinus: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, width: 72, height: 60, borderRadius: 16, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', color: 'white', cursor: 'pointer', flexShrink: 0 },
  waterBtnPlus: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, width: 72, height: 60, borderRadius: 16, background: 'rgba(255,255,255,0.9)', border: 'none', color: '#1d4ed8', cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' },
  scanCta: {
    position: 'fixed',
    bottom: 'calc(82px + max(env(safe-area-inset-bottom, 0px), 0px))',
    left: 0, right: 0,
    padding: '0 14px 12px',
    background: 'transparent',
    zIndex: 70, pointerEvents: 'none',
  },
  scanCtaBtn: {
    width: '100%', padding: '0.9rem 1.25rem', background: '#1a1a1a', color: '#e4f816',
    border: 'none', borderRadius: 16, fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.22)', pointerEvents: 'all',
  },
  overlay: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' },
  sheet: { background: 'white', borderRadius: '22px 22px 0 0', padding: '1rem 1.25rem 2.5rem', width: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' },
  fieldLabel: { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.3rem' },
  fieldInput: { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit' },
  cancelBtn: { flex: 1, padding: '0.75rem', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', color: '#6b7280', fontFamily: 'inherit' },
  saveBtn:   { flex: 2, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'var(--chip-bg)', color: 'var(--chip-text)', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' },
  addMealBtn: { width: '100%', padding: '0.9rem', borderRadius: 14, border: '2px dashed #c7d2fe', background: '#f5f3ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6366f1', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'inherit' },
}
