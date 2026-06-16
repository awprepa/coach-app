import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'

function toISO(date) { return date.toISOString().slice(0, 10) }

const MEAL_LABELS = {
  petit_dej: { label: 'Petit-déj', emoji: '🥐' },
  dejeuner:  { label: 'Déjeuner',  emoji: '🍽️' },
  collation: { label: 'Collation', emoji: '🍎' },
  diner:     { label: 'Dîner',     emoji: '🌙' },
  collation_2: { label: 'Collation 2', emoji: '🍌' },
}

const TYPE_JOUR_LABELS = {
  standard:     'Jour standard',
  entrainement: "Jour d'entraînement",
  repos:        'Jour de repos',
  competition:  'Jour de compétition',
  custom:       'Jour spécial',
}

// Quel jour du plan correspond à une date donnée ?
function getPlanDayNumber(dateISO, plan) {
  if (!plan.date_debut) return 1
  const debut = new Date(plan.date_debut + 'T00:00:00')
  const target = new Date(dateISO + 'T00:00:00')
  const diffDays = Math.floor((target - debut) / 86400000)
  if (diffDays < 0) return null
  return (diffDays % 7) + 1
}

export default function NutritionPlanClient() {
  const navigate = useNavigate()
  const fadeStyle = usePageFade()
  const [client, setClient] = useState(null)
  const [plan, setPlan] = useState(null)
  const [days, setDays] = useState([])
  const [logs, setLogs] = useState([]) // logs du client pour la date courante
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('aujourd_hui') // aujourd_hui | semaine | courses
  const [viewDate, setViewDate] = useState(new Date())
  const [savingLog, setSavingLog] = useState(null)
  const [horsplanModal, setHorsplanModal] = useState(null) // { meal }
  const [horsplanForm, setHorsplanForm] = useState({ nom: '', kcal: '', prot_g: '', carbs_g: '', fat_g: '' })

  // ── Chargement client + plan actif ───────────────────────────────────────
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
        .from('nutrition_plans')
        .select('*')
        .eq('client_id', c.id)
        .eq('statut', 'actif')
        .or(`date_fin.is.null,date_fin.gte.${today}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!activePlan) { setLoading(false); return }
      setPlan(activePlan)

      // Charger tous les jours du plan avec repas + aliments
      const { data: daysData } = await supabase
        .from('nutrition_plan_days')
        .select(`*, nutrition_plan_meals(*, nutrition_plan_foods(*))`)
        .eq('plan_id', activePlan.id)
        .order('jour_numero')
      setDays(daysData || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Chargement des logs pour la date ────────────────────────────────────
  const loadLogs = useCallback(async (dateISO) => {
    if (!client || !plan) return
    const { data } = await supabase
      .from('nutrition_plan_logs')
      .select('*')
      .eq('client_id', client.id)
      .eq('plan_id', plan.id)
      .eq('date', dateISO)
    setLogs(data || [])
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
        // Désactiver (toggle off)
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

  // ── Logger hors-plan ─────────────────────────────────────────────────────
  async function saveHorsPlan(meal, dayNum) {
    if (!client || !plan) return
    const iso = toISO(viewDate)
    const existing = logs.find(l => l.meal_id === meal.id)
    const payload = {
      plan_id: plan.id, client_id: client.id,
      date: iso, jour_numero: dayNum, meal_id: meal.id,
      statut: 'hors_plan',
      hors_plan_nom: horsplanForm.nom || null,
      hors_plan_kcal: horsplanForm.kcal ? Number(horsplanForm.kcal) : null,
      hors_plan_prot: horsplanForm.prot_g ? Number(horsplanForm.prot_g) : null,
      hors_plan_carbs: horsplanForm.carbs_g ? Number(horsplanForm.carbs_g) : null,
      hors_plan_fat: horsplanForm.fat_g ? Number(horsplanForm.fat_g) : null,
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

  // ── Génération liste de courses (semaine en cours) ───────────────────────
  function getShoppingList() {
    const items = {}
    for (const day of days) {
      for (const meal of (day.nutrition_plan_meals || [])) {
        for (const food of (meal.nutrition_plan_foods || [])) {
          const key = food.nom.toLowerCase()
          if (items[key]) {
            items[key].quantite += food.quantite_g || 0
            items[key].count += 1
          } else {
            items[key] = { nom: food.nom, quantite: food.quantite_g || 0, count: 1 }
          }
        }
      }
    }
    return Object.values(items).sort((a, b) => a.nom.localeCompare(b.nom))
  }

  // ──────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition')} style={S.iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>Mon plan nutrition</span>
        <div style={{ width: 32 }} />
      </div>
      <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Chargement…</div>
      <ClientBottomNav />
    </div>
  )

  if (!plan) return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition')} style={S.iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>Mon plan nutrition</span>
        <div style={{ width: 32 }} />
      </div>
      <div style={S.content}>
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ fontSize: '2rem', margin: '0 0 0.75rem' }}>🥗</p>
          <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem' }}>Aucun plan actif</p>
          <p style={{ color: '#6b7280', fontSize: '0.83rem', lineHeight: 1.5, margin: 0 }}>
            Ton coach n'a pas encore activé de plan nutritionnel pour toi.
          </p>
        </div>
      </div>
      <ClientBottomNav />
    </div>
  )

  const iso = toISO(viewDate)
  const isToday = iso === toISO(new Date())
  const dayNum = getPlanDayNumber(iso, plan)
  const currentDay = days.find(d => d.jour_numero === dayNum)
  const meals = (currentDay?.nutrition_plan_meals || []).sort((a, b) => a.ordre - b.ordre)

  const totalKcalPlan = meals.reduce((s, m) => s + (m.kcal || 0), 0)
  const totalKcalFait = logs.filter(l => l.statut === 'fait').reduce((_, l) => {
    const m = meals.find(m => m.id === l.meal_id)
    return _ + (m?.kcal || 0)
  }, 0)
  const adherence = totalKcalPlan > 0 ? Math.round(totalKcalFait / totalKcalPlan * 100) : 0

  function changeDay(delta) {
    const d = new Date(viewDate); d.setDate(d.getDate() + delta)
    if (d > new Date()) return
    setViewDate(d)
  }

  const shoppingList = getShoppingList()

  return (
    <div style={{ ...S.page, ...fadeStyle }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition')} style={S.iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem' }}>{plan.nom}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>Plan prescrit</div>
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* ── Onglets ─────────────────────────────────────────────────── */}
      <div style={S.tabBar}>
        {[
          { key: 'aujourd_hui', label: "Aujourd'hui" },
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

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB : AUJOURD'HUI                                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'aujourd_hui' && (
          <>
            {/* Navigation date */}
            <div style={S.dateNav}>
              <button onClick={() => changeDay(-1)} style={S.dateArrow}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1a1a1a' }}>
                  {isToday ? "Aujourd'hui" : viewDate.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                {currentDay && (
                  <div style={{ fontSize: '0.67rem', color: '#9ca3af', marginTop: 1 }}>
                    J{dayNum} — {currentDay.label}
                  </div>
                )}
              </div>
              <button onClick={() => changeDay(+1)} style={{ ...S.dateArrow, opacity: isToday ? 0.3 : 1 }} disabled={isToday}>›</button>
            </div>

            {/* Résumé calories */}
            {totalKcalPlan > 0 && (
              <div style={S.kcalCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--accent-fg-dark)', lineHeight: 1 }}>{totalKcalFait}</div>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>kcal mangés</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'white', fontSize: '1rem' }}>{totalKcalPlan}</div>
                    <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>kcal prescrites</div>
                  </div>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#e4f816', borderRadius: 999, width: `${Math.min(adherence, 100)}%`, transition: 'width 0.4s' }} />
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'right' }}>{adherence}% du plan suivi</div>
              </div>
            )}

            {/* Macros du jour */}
            {currentDay && (
              <div style={S.macrosCard}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>
                  {TYPE_JOUR_LABELS[currentDay.type_jour] || 'Jour standard'}
                  {(currentDay.objectif_kcal || plan.objectif_kcal) && ` · ${currentDay.objectif_kcal || plan.objectif_kcal} kcal`}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { label: 'P', val: currentDay.objectif_prot || plan.objectif_prot, color: '#60a5fa' },
                    { label: 'G', val: currentDay.objectif_carbs || plan.objectif_carbs, color: '#fbbf24' },
                    { label: 'L', val: currentDay.objectif_fat || plan.objectif_fat, color: '#f87171' },
                  ].filter(m => m.val).map(m => (
                    <div key={m.label} style={{ flex: 1, textAlign: 'center', padding: '6px 0', background: '#f9fafb', borderRadius: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: m.color }}>{m.val}g</div>
                      <div style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 700 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Repas du jour */}
            {meals.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0', fontSize: '0.85rem' }}>
                Aucun repas prescrit pour ce jour.
              </div>
            ) : (
              meals.map(meal => {
                const log = logs.find(l => l.meal_id === meal.id)
                const statut = log?.statut || null
                const ml = MEAL_LABELS[meal.meal_type] || { label: meal.meal_type, emoji: '🍴' }
                const foods = (meal.nutrition_plan_foods || []).sort((a, b) => a.ordre - b.ordre)
                const [expanded, setExpanded] = useState(false)

                return (
                  <div key={meal.id} style={{ ...S.mealCard, borderLeft: `3px solid ${statut === 'fait' ? '#16a34a' : statut === 'hors_plan' ? '#d97706' : statut === 'saute' ? '#ef4444' : '#e5e7eb'}` }}>
                    {/* En-tête repas */}
                    <button onClick={() => setExpanded(v => !v)} style={S.mealHeader}>
                      <span style={{ fontSize: '1.2rem' }}>{ml.emoji}</span>
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
                          {statut === 'fait' ? '✓ Fait' : statut === 'hors_plan' ? '≠ Hors-plan' : '✕ Sauté'}
                        </span>
                      )}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>

                    {/* Détails (aliments + recette) */}
                    {expanded && (
                      <div style={{ padding: '0.5rem 1rem 0.75rem', borderTop: '1px solid #f5f5f5' }}>
                        {foods.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            {foods.map(food => (
                              <div key={food.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f9fafb' }}>
                                <span style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>{food.nom}</span>
                                <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                                  {food.quantite_g ? `${food.quantite_g}g` : ''}
                                  {food.kcal ? ` · ${food.kcal} kcal` : ''}
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
                      <button
                        disabled={savingLog === meal.id}
                        onClick={() => logMeal(meal, 'fait', dayNum)}
                        style={{ ...S.actionBtn, background: statut === 'fait' ? '#16a34a' : '#f0fdf4', color: statut === 'fait' ? 'white' : '#16a34a', border: `1.5px solid ${statut === 'fait' ? '#16a34a' : '#bbf7d0'}` }}
                      >
                        ✓ Fait
                      </button>
                      <button
                        disabled={savingLog === meal.id}
                        onClick={() => { setHorsplanModal({ meal, dayNum }); setHorsplanForm({ nom: '', kcal: '', prot_g: '', carbs_g: '', fat_g: '' }) }}
                        style={{ ...S.actionBtn, background: statut === 'hors_plan' ? '#d97706' : '#fffbeb', color: statut === 'hors_plan' ? 'white' : '#d97706', border: `1.5px solid ${statut === 'hors_plan' ? '#d97706' : '#fde68a'}` }}
                      >
                        ≠ Autre
                      </button>
                      <button
                        disabled={savingLog === meal.id}
                        onClick={() => logMeal(meal, 'saute', dayNum)}
                        style={{ ...S.actionBtn, background: statut === 'saute' ? '#ef4444' : '#fef2f2', color: statut === 'saute' ? 'white' : '#ef4444', border: `1.5px solid ${statut === 'saute' ? '#ef4444' : '#fecaca'}` }}
                      >
                        ✕ Sauté
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB : 7 JOURS                                                 */}
        {/* ══════════════════════════════════════════════════════════════ */}
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
                    const ml = MEAL_LABELS[meal.meal_type] || { label: meal.meal_type, emoji: '🍴' }
                    return (
                      <div key={meal.id} style={S.weekMealRow}>
                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{ml.emoji}</span>
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

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB : LISTE DE COURSES                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'courses' && (
          <div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              Liste complète pour les 7 jours du plan. Les quantités sont cumulées.
            </p>
            {shoppingList.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0' }}>Aucun aliment dans le plan.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {shoppingList.map((item, i) => (
                  <ShoppingItem key={i} item={item} />
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>

      {/* ── Modal hors-plan ────────────────────────────────────────── */}
      {horsplanModal && (
        <div style={S.overlay} onClick={() => setHorsplanModal(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1rem' }} />
            <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 0.3rem', color: '#1a1a1a' }}>Repas hors-plan</p>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 1rem' }}>
              Qu'as-tu mangé à la place ? (optionnel)
            </p>
            <div style={{ marginBottom: '0.65rem' }}>
              <label style={S.fieldLabel}>Ce que tu as mangé</label>
              <input value={horsplanForm.nom} onChange={e => setHorsplanForm(f => ({ ...f, nom: e.target.value }))} style={S.fieldInput} placeholder="Ex: Restaurant, pizza…" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
              {[
                { key: 'kcal', label: 'Calories (kcal)' }, { key: 'prot_g', label: 'Prot (g)' },
                { key: 'carbs_g', label: 'Gluc (g)' }, { key: 'fat_g', label: 'Lip (g)' },
              ].map(f => (
                <div key={f.key}>
                  <label style={S.fieldLabel}>{f.label}</label>
                  <input type="number" value={horsplanForm[f.key]} onChange={e => setHorsplanForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.fieldInput} placeholder="—" />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setHorsplanModal(null)} style={S.cancelBtn}>Annuler</button>
              <button onClick={() => saveHorsPlan(horsplanModal.meal, horsplanModal.dayNum)} style={S.saveBtn}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      <ClientBottomNav />
    </div>
  )
}

function ShoppingItem({ item }) {
  const [checked, setChecked] = useState(false)
  return (
    <div onClick={() => setChecked(v => !v)} style={{ ...S.shopRow, opacity: checked ? 0.4 : 1 }}>
      <div style={{
        width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? '#16a34a' : '#d1d5db'}`,
        background: checked ? '#16a34a' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
      </div>
      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1a1a1a', flex: 1, textDecoration: checked ? 'line-through' : 'none' }}>
        {item.nom}
      </span>
      {item.quantite > 0 && (
        <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600 }}>
          {item.count > 1 ? `${Math.round(item.quantite)}g / sem.` : `${Math.round(item.quantite)}g`}
        </span>
      )}
    </div>
  )
}

const S = {
  page: { background: '#f5f5f5', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: {
    background: 'var(--header-bg)', padding: '1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 60,
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.12)',
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  tabBar: {
    background: 'var(--header-bg)', display: 'flex',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    position: 'sticky', top: 56, zIndex: 59,
  },
  content: { padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  dateNav: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'white', borderRadius: 14, padding: '10px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  dateArrow: { background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.3rem', cursor: 'pointer', padding: '0 4px' },
  kcalCard: {
    background: 'var(--header-bg)', borderRadius: 18, padding: '16px 18px',
  },
  macrosCard: {
    background: 'white', borderRadius: 14, padding: '12px 14px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  mealCard: {
    background: 'white', borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  mealHeader: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px', textAlign: 'left',
  },
  actionBtn: {
    flex: 1, padding: '0.55rem 0', borderRadius: 10,
    fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
  },
  weekMealRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    background: 'white', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  shopRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    background: 'white', borderRadius: 12, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  overlay: { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end' },
  sheet: { background: 'white', borderRadius: '22px 22px 0 0', padding: '1rem 1.25rem 2.5rem', width: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' },
  fieldLabel: { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '0.3rem' },
  fieldInput: { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit' },
  cancelBtn: { flex: 1, padding: '0.75rem', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', color: '#6b7280' },
  saveBtn: { flex: 2, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'var(--chip-bg)', color: 'var(--chip-text)', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer' },
}
