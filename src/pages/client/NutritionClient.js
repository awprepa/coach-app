import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { NutritionSkeleton } from '../../components/Skeleton'
import usePageFade from '../../hooks/usePageFade'
import ConsentSante from '../../components/ConsentSante'

const MEAL_TYPES = [
  { key: 'petit_dej', label: 'Petit-déj',   emoji: '🥐' },
  { key: 'dejeuner',  label: 'Déjeuner',    emoji: '🍽️' },
  { key: 'collation', label: 'Collation',   emoji: '🍎' },
  { key: 'diner',     label: 'Dîner',       emoji: '🌙' },
]

function toISO(date) { return date.toISOString().slice(0, 10) }
function sum(arr, key) { return arr.reduce((acc, x) => acc + (Number(x[key]) || 0), 0) }

function formatDate(date) {
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/^./, c => c.toUpperCase())
}

// ─── Score local par repas (sans appel IA) ──────────────────────────────────
function scoreMeal(items) {
  if (!items.length) return null
  const prot  = sum(items, 'prot_g')
  const carbs = sum(items, 'carbs_g')
  const fat   = sum(items, 'fat_g')
  const kcal  = sum(items, 'kcal')

  const protKcal  = prot * 4
  const carbsKcal = carbs * 4
  const fatKcal   = fat * 9
  const total = protKcal + carbsKcal + fatKcal
  if (total === 0) return null

  const protPct  = protKcal  / total * 100
  const fatPct   = fatKcal   / total * 100
  const carbsPct = carbsKcal / total * 100

  let score = 5
  // Protéines
  if (protPct >= 30) score += 2
  else if (protPct >= 20) score += 1
  else if (protPct < 10) score -= 1
  // Lipides
  if (fatPct > 50) score -= 1.5
  else if (fatPct <= 30) score += 0.5
  // Glucides
  if (carbsPct > 75) score -= 1
  // Volume
  if (kcal < 80) score -= 1
  if (kcal > 900) score -= 0.5

  const s = Math.max(2, Math.min(10, Math.round(score * 10) / 10))
  const color = s >= 7 ? '#16a34a' : s >= 5 ? '#d97706' : '#dc2626'
  const label = s >= 7 ? 'Excellent' : s >= 5 ? 'Correct' : 'À améliorer'
  return { score: s, color, label }
}

export default function NutritionClient() {
  const navigate = useNavigate()
  const fadeStyle = usePageFade()
  const [client,  setClient]  = useState(null)
  const [goals,   setGoals]   = useState(null)
  const [meals,   setMeals]   = useState([])
  const [water,   setWater]   = useState({ ml: 0 })
  const [loading, setLoading] = useState(true)
  const [viewDate, setViewDate] = useState(new Date())

  // Favoris
  const [favoriteModal, setFavoriteModal] = useState(null)
  const [favoriteName,  setFavoriteName]  = useState('')
  const [savingFav,     setSavingFav]     = useState(false)

  // Score IA journée
  const [qualityResult,  setQualityResult]  = useState(null)
  const [loadingQuality, setLoadingQuality] = useState(false)

  // Edition d'un plat
  const [editModal,  setEditModal]  = useState(null) // { meal }
  const [editForm,   setEditForm]   = useState({})
  const [savingEdit, setSavingEdit] = useState(false)

  // Bottom sheet d'ajout
  const [addSheet,      setAddSheet]      = useState(null)  // { meal_type } | null
  const [sheetSearch,   setSheetSearch]   = useState('')
  const [recentFoods,   setRecentFoods]   = useState([])    // aliments récents dédupliqués
  const [templates,     setTemplates]     = useState([])    // favoris (meal_templates)
  const [sheetTab,      setSheetTab]      = useState('recents') // 'recents' | 'favoris'
  const [addingFood,    setAddingFood]    = useState(null)  // id en cours d'ajout rapide
  const [hasProfile,   setHasProfile]    = useState(true)  // false = invite à créer le profil
  const [consentOk,    setConsentOk]     = useState(null)  // null=chargement, true=ok, false=manquant
  const [activePlan,   setActivePlan]    = useState(null)  // plan prescrit actif

  // Charger client + goals
  useEffect(() => {
    async function loadClient() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('id, prenom, offre').eq('user_id', userId).maybeSingle()
      if (!c) { setLoading(false); return }
      setClient(c)

      // Vérifier le consentement données de santé (RGPD Art. 9)
      const { data: consent } = await supabase.from('consents')
        .select('id').eq('client_id', c.id).eq('type', 'sante').maybeSingle()
      if (!consent) { setConsentOk(false); setLoading(false); return }
      setConsentOk(true)

      // Vérifier si le profil nutritionnel existe (sans bloquer si erreur RLS)
      const { data: profil, error: profilError } = await supabase.from('nutrition_profile')
        .select('id').eq('client_id', c.id).maybeSingle()
      if (!profilError && !profil) {
        setHasProfile(false)
      }

      const today = toISO(new Date())
      const { data: g } = await supabase.from('nutrition_goals').select('*').eq('client_id', c.id)
        .or(`active_to.is.null,active_to.gte.${today}`).order('active_from', { ascending: false }).limit(1).maybeSingle()
      setGoals(g)

      // Plan prescrit actif
      const { data: ap } = await supabase.from('nutrition_plans').select('id, nom')
        .eq('client_id', c.id).eq('statut', 'actif')
        .or(`date_fin.is.null,date_fin.gte.${today}`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setActivePlan(ap)

      setLoading(false)
    }
    loadClient()
  }, [navigate])

  // Recharger repas + eau quand la date change
  useEffect(() => {
    if (!client) return
    async function loadDay() {
      const iso = toISO(viewDate)
      const [{ data: m }, { data: w }] = await Promise.all([
        supabase.from('nutrition_meals').select('*').eq('client_id', client.id).eq('date', iso).order('time', { ascending: true, nullsFirst: false }),
        supabase.from('nutrition_water').select('ml').eq('client_id', client.id).eq('date', iso).maybeSingle(),
      ])
      setMeals(m || [])
      setWater(w || { ml: 0 })
      setQualityResult(null)
    }
    loadDay()
  }, [client, viewDate])

  function changeDay(delta) {
    const d = new Date(viewDate); d.setDate(d.getDate() + delta)
    if (d > new Date()) return
    setViewDate(d)
  }
  const isToday = toISO(viewDate) === toISO(new Date())

  // ─── Hydratation ──────────────────────────────────────────────────────────
  async function updateWater(delta) {
    if (!client) return
    const newMl = Math.max(0, (water.ml || 0) + delta)
    setWater({ ml: newMl })
    await supabase.from('nutrition_water').upsert(
      { client_id: client.id, date: toISO(viewDate), ml: newMl, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,date' }
    )
  }

  // ─── Supprimer un repas ───────────────────────────────────────────────────
  async function deleteMeal(id) {
    setMeals(prev => prev.filter(m => m.id !== id))
    await supabase.from('nutrition_meals').delete().eq('id', id)
  }

  // ─── Favori ───────────────────────────────────────────────────────────────
  async function saveFavorite() {
    if (!client || !favoriteModal || !favoriteName.trim()) return
    setSavingFav(true)
    const m = favoriteModal.meal
    await supabase.from('nutrition_meal_templates').insert({
      client_id: client.id, name: favoriteName.trim(), meal_type: m.meal_type,
      kcal: m.kcal, prot_g: m.prot_g, carbs_g: m.carbs_g, fat_g: m.fat_g, fibre_g: m.fibre_g,
    })
    setSavingFav(false); setFavoriteModal(null); setFavoriteName('')
  }

  // ─── Édition d'un plat ────────────────────────────────────────────────────
  function openEdit(meal) {
    setEditModal({ meal })
    setEditForm({
      name:       meal.name       || '',
      quantity_g: meal.quantity_g != null ? String(meal.quantity_g) : '',
      kcal:       String(Math.round(meal.kcal    || 0)),
      prot_g:     String(Math.round((meal.prot_g  || 0) * 10) / 10),
      carbs_g:    String(Math.round((meal.carbs_g || 0) * 10) / 10),
      fat_g:      String(Math.round((meal.fat_g   || 0) * 10) / 10),
    })
  }

  function handleQtyChange(newQty) {
    const orig = editModal.meal
    const oldQty = orig.quantity_g
    setEditForm(f => {
      if (oldQty && Number(newQty) > 0) {
        const ratio = Number(newQty) / oldQty
        return {
          ...f,
          quantity_g: newQty,
          kcal:   String(Math.round((orig.kcal    || 0) * ratio)),
          prot_g: String(Math.round((orig.prot_g  || 0) * ratio * 10) / 10),
          carbs_g:String(Math.round((orig.carbs_g || 0) * ratio * 10) / 10),
          fat_g:  String(Math.round((orig.fat_g   || 0) * ratio * 10) / 10),
        }
      }
      return { ...f, quantity_g: newQty }
    })
  }

  async function saveEdit() {
    if (!editModal || savingEdit) return
    setSavingEdit(true)
    const updates = {
      name:       editForm.name,
      quantity_g: editForm.quantity_g ? Number(editForm.quantity_g) : null,
      kcal:       Number(editForm.kcal)    || 0,
      prot_g:     Number(editForm.prot_g)  || 0,
      carbs_g:    Number(editForm.carbs_g) || 0,
      fat_g:      Number(editForm.fat_g)   || 0,
    }
    await supabase.from('nutrition_meals').update(updates).eq('id', editModal.meal.id)
    setMeals(prev => prev.map(m => m.id === editModal.meal.id ? { ...m, ...updates } : m))
    setSavingEdit(false)
    setEditModal(null)
  }

  // ─── Ouvrir la sheet ─────────────────────────────────────────────────────
  async function openAddSheet(meal_type) {
    setAddSheet({ meal_type })
    setSheetSearch('')
    setSheetTab('recents')
    if (!client) return
    // Charger récents (30 derniers jours, dédupliqués par nom)
    const since = new Date(); since.setDate(since.getDate() - 30)
    const { data: recent } = await supabase
      .from('nutrition_meals')
      .select('name, kcal, prot_g, carbs_g, fat_g, quantity_g')
      .eq('client_id', client.id)
      .gte('date', toISO(since))
      .order('date', { ascending: false })
      .limit(200)
    // Dédupliquer par nom, garder la version la plus récente
    const seen = new Set()
    const deduped = (recent || []).filter(r => {
      if (!r.name || seen.has(r.name)) return false
      seen.add(r.name); return true
    }).slice(0, 20)
    setRecentFoods(deduped)
    // Charger favoris
    const { data: favs } = await supabase
      .from('nutrition_meal_templates')
      .select('*')
      .eq('client_id', client.id)
      .order('name')
    setTemplates(favs || [])
  }

  // ─── Ajout rapide depuis la sheet ────────────────────────────────────────
  async function quickAdd(food) {
    if (!client || !addSheet) return
    const key = food.name
    setAddingFood(key)
    const row = {
      client_id: client.id,
      date:       toISO(viewDate),
      meal_type:  addSheet.meal_type,
      name:       food.name,
      kcal:       food.kcal       || 0,
      prot_g:     food.prot_g     || 0,
      carbs_g:    food.carbs_g    || 0,
      fat_g:      food.fat_g      || 0,
      quantity_g: food.quantity_g || null,
    }
    const { data: inserted } = await supabase.from('nutrition_meals').insert(row).select().single()
    if (inserted) setMeals(prev => [...prev, inserted])
    setAddingFood(null)
    setAddSheet(null)
  }

  // ─── Score IA journée ─────────────────────────────────────────────────────
  async function analyzeQuality() {
    if (!meals.length || loadingQuality) return
    setLoadingQuality(true); setQualityResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('nutrition-quality-score', {
        body: { meals, goals, water_ml: water.ml || 0 },
      })
      if (!error && data?.ok) setQualityResult(data)
      else setQualityResult({ score: null, verdict: 'Indisponible', commentaire: data?.error || 'Réessaie plus tard.' })
    } catch (e) {
      setQualityResult({ score: null, verdict: 'Erreur', commentaire: e.message })
    }
    setLoadingQuality(false)
  }

  // ─── Consentement RGPD (données de santé) ────────────────────────────────
  if (consentOk === false) return <ConsentSante clientId={client?.id} onConsent={() => setConsentOk(true)} />

  // ─── Render loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={{ width: 32 }} />
        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'white' }}>Nutrition</span>
        <div style={{ width: 32 }} />
      </div>
      <NutritionSkeleton />
      <ClientBottomNav />
    </div>
  )

  const totals = {
    kcal:  sum(meals, 'kcal'),
    prot:  sum(meals, 'prot_g'),
    carbs: sum(meals, 'carbs_g'),
    fat:   sum(meals, 'fat_g'),
  }
  const mealsByType = MEAL_TYPES.reduce((acc, t) => {
    acc[t.key] = meals.filter(m => m.meal_type === t.key)
    return acc
  }, {})
  const waterTarget = goals?.hydration_ml || 2000
  const waterPct    = Math.min((water.ml / waterTarget) * 100, 100)

  // Si les objectifs macros ne sont pas définis, on les dérive des kcal (30% prot / 45% gluc / 25% lip)
  const kcalRef = goals?.kcal_target || null
  const derivedProt  = goals?.prot_g  || (kcalRef ? Math.round(kcalRef * 0.30 / 4)  : null)
  const derivedCarbs = goals?.carbs_g || (kcalRef ? Math.round(kcalRef * 0.45 / 4)  : null)
  const derivedFat   = goals?.fat_g   || (kcalRef ? Math.round(kcalRef * 0.25 / 9)  : null)

  return (
    <div style={{ ...S.page, ...fadeStyle }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition/historique')} style={S.iconBtn} aria-label="Historique">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
          </svg>
        </button>
        <div style={S.dateNav}>
          <button onClick={() => changeDay(-1)} style={S.dateArrow}>‹</button>
          <span style={S.dateLabel}>{isToday ? "Aujourd'hui" : formatDate(viewDate)}</span>
          <button onClick={() => changeDay(+1)} style={{ ...S.dateArrow, opacity: isToday ? 0.25 : 1 }} disabled={isToday}>›</button>
        </div>
        <button onClick={() => navigate('/client/nutrition/profil')} style={S.iconBtn} aria-label="Profil nutrition">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </button>
      </div>

      <div style={S.content}>

        {/* ── Plan prescrit actif ─────────────────────────────────── */}
        {activePlan && (
          <button
            onClick={() => navigate('/client/nutrition/plan')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              background: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
              borderRadius: 16, padding: '14px 16px', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(22,101,52,0.3)',
            }}
          >
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'white' }}>Plan prescrit actif</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>{activePlan.nom}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}

        {/* ── Invite à créer le profil si absent ──────────────────── */}
        {!hasProfile && (
          <div style={{ background: 'var(--header-bg)', borderRadius: 18, padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.8rem' }}>🎯</span>
              <div>
                <p style={{ fontWeight: 900, fontSize: '0.95rem', color: 'white', margin: 0 }}>Configure ton profil</p>
                <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', margin: '2px 0 0', lineHeight: 1.4 }}>
                  Réponds à quelques questions pour obtenir tes objectifs nutritionnels personnalisés.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/client/nutrition/profil?setup=1')}
              style={{ background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: 12, padding: '10px 16px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', textAlign: 'center' }}
            >
              Commencer le questionnaire →
            </button>
          </div>
        )}

        {/* ── Carte sombre résumé ─────────────────────────────────── */}
        <div style={S.summaryCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '2.6rem', fontWeight: 900, color: 'var(--accent-fg-dark)', lineHeight: 1, letterSpacing: '-1px' }}>
                {Math.round(totals.kcal)}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>
                kcal mangés
              </div>
            </div>
            {goals && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>
                  {Math.max(0, Math.round((goals.kcal_target || 0) - totals.kcal))}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  restants
                </div>
              </div>
            )}
          </div>

          {goals && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{
                  height: '100%', borderRadius: 999, background: '#e4f816',
                  width: `${Math.min(totals.kcal / (goals.kcal_target || 1) * 100, 100)}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>
                {Math.round(totals.kcal / (goals.kcal_target || 1) * 100)}% de l'objectif ({goals.kcal_target} kcal)
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: '🥩', name: 'Prot',  val: totals.prot,  target: derivedProt,  color: '#60a5fa' },
              { icon: '🌾', name: 'Gluc',  val: totals.carbs, target: derivedCarbs, color: '#fbbf24' },
              { icon: '🥑', name: 'Lip',   val: totals.fat,   target: derivedFat,   color: '#f87171' },
            ].map(m => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.82rem', width: 20, textAlign: 'center' }}>{m.icon}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', width: 28, textTransform: 'uppercase' }}>{m.name}</span>
                <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: m.color, borderRadius: 999, width: `${m.target ? Math.min(m.val / m.target * 100, 100) : 0}%`, transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.4)', width: 68, textAlign: 'right', fontWeight: 600 }}>
                  {Math.round(m.val)}{m.target ? ` / ${Math.round(m.target)}g` : 'g'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Note IA journée ─────────────────────────────────────── */}
        {meals.length > 0 && (
          <div style={S.scoreCard}>
            {!qualityResult && !loadingQuality && (
              <button onClick={analyzeQuality} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', width: '100%', padding: 0, textAlign: 'left' }}>
                <div style={S.scoreCircle}>✨</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 800, color: '#15803d', margin: '0 0 2px', fontSize: '0.88rem' }}>Évaluer ma journée</p>
                  <p style={{ fontSize: '0.7rem', color: '#166534', margin: 0, opacity: 0.75 }}>Note IA /10, conseils personnalisés</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )}
            {loadingQuality && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={S.scoreCircle}>⏳</div>
                <p style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600, margin: 0 }}>Analyse en cours…</p>
              </div>
            )}
            {qualityResult && !loadingQuality && (() => {
              const sc = qualityResult.score
              const color = sc >= 7 ? '#16a34a' : sc >= 5 ? '#d97706' : '#dc2626'
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${color}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 900, color, lineHeight: 1 }}>{sc ?? '—'}</span>
                    <span style={{ fontSize: '0.5rem', color: '#9ca3af', fontWeight: 600 }}>/10</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 800, color: '#15803d', margin: '0 0 2px', fontSize: '0.88rem' }}>{qualityResult.verdict}</p>
                    <p style={{ fontSize: '0.7rem', color: '#166534', margin: 0, lineHeight: 1.4, opacity: 0.85 }}>{qualityResult.commentaire}</p>
                  </div>
                  <button onClick={() => setQualityResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.9rem', flexShrink: 0 }}>↺</button>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Sections repas ─────────────────────────────────────── */}
        {(goals || meals.length > 0) ? MEAL_TYPES.map(t => {
          const items = mealsByType[t.key]
          const kcalSection = sum(items, 'kcal')
          const mealNote = scoreMeal(items)

          return (
            <div key={t.key} style={S.mealSection}>
              {/* En-tête section */}
              <div style={S.mealHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '1.2rem' }}>{t.emoji}</span>
                  <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1a1a1a' }}>{t.label}</span>
                  {kcalSection > 0 && (
                    <span style={S.kcalBadge}>{Math.round(kcalSection)} kcal</span>
                  )}
                  {/* Note du repas */}
                  {mealNote && (
                    <span style={{
                      fontSize: '0.66rem', fontWeight: 800,
                      color: mealNote.color,
                      background: mealNote.color + '18',
                      padding: '2px 7px', borderRadius: 20,
                      border: `1px solid ${mealNote.color}30`,
                    }}>
                      {mealNote.score}/10
                    </span>
                  )}
                </div>
                <button
                  onClick={() => openAddSheet(t.key)}
                  style={S.addBtn}
                  aria-label={`Ajouter ${t.label}`}
                >+</button>
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div style={{ borderTop: '1px solid #f5f5f5' }}>
                  {items.map(m => (
                    <div key={m.id} style={S.mealItem}>
                      {/* Zone cliquable pour éditer */}
                      <button
                        onClick={() => openEdit(m)}
                        style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                      >
                        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name || 'Repas'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 1 }}>
                          {[
                            m.quantity_g ? `${Math.round(m.quantity_g)}g` : null,
                            m.prot_g  ? `P ${Math.round(m.prot_g)}g` : null,
                            m.carbs_g ? `G ${Math.round(m.carbs_g)}g` : null,
                            m.fat_g   ? `L ${Math.round(m.fat_g)}g`  : null,
                          ].filter(Boolean).join(' · ')}
                        </div>
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>{Math.round(m.kcal || 0)} kcal</span>
                        {/* Crayon édition */}
                        <button
                          onClick={() => openEdit(m)}
                          style={S.actionBtn}
                          title="Modifier"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        {/* Favori */}
                        <button
                          onClick={() => { setFavoriteModal({ meal: m }); setFavoriteName(m.name || '') }}
                          style={S.actionBtn}
                          title="Favori"
                        >⭐</button>
                        {/* Supprimer */}
                        <button
                          onClick={() => deleteMeal(m.id)}
                          style={{ ...S.actionBtn, fontSize: '0.6rem', color: '#9ca3af' }}
                          title="Supprimer"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Section vide */}
              {items.length === 0 && (
                <div style={{ padding: '0.6rem 1rem 0.8rem', borderTop: '1px solid #f5f5f5' }}>
                  <p style={{ fontSize: '0.75rem', color: '#d1d5db', fontStyle: 'italic', margin: 0 }}>
                    Rien encore — tape + pour ajouter
                  </p>
                </div>
              )}
            </div>
          )
        }) : (
          <div style={{ ...S.mealSection, padding: '1.25rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.8rem', margin: '0 0 0.4rem' }}>🥗</p>
            <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.3rem' }}>Bienvenue dans ton suivi nutrition</p>
            <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: 0, lineHeight: 1.5 }}>
              Ton coach va définir tes objectifs. En attendant, commence à logger tes repas avec le bouton +.
            </p>
          </div>
        )}

        {/* ── Hydratation ────────────────────────────────────────── */}
        <div style={S.waterCard}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'white' }}>💧 Hydratation</span>
            <span style={S.waterPct}>{Math.round(waterPct)}%</span>
          </div>

          {/* Barre de progression */}
          <div style={{ height: 8, background: '#eff6ff', borderRadius: 999, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: '100%', background: '#3b82f6', borderRadius: 999, width: `${Math.min(waterPct, 100)}%`, transition: 'width 0.3s ease' }} />
          </div>

          {/* Contrôles : − / verres / + */}
          {(() => {
            const verres = Math.round(water.ml / 250)
            const targetVerres = Math.round(waterTarget / 250)
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {/* Bouton − */}
                <button onClick={() => updateWater(-250)} style={S.waterBtnMinus} aria-label="Retirer 1 verre">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, marginTop: 2 }}>1 verre</span>
                </button>

                {/* Volume central */}
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', lineHeight: 1 }}>
                    {verres} <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>verre{verres > 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#93c5fd', fontWeight: 600, marginTop: 3 }}>
                    {water.ml} ml · objectif {targetVerres} verres ({waterTarget >= 1000 ? `${(waterTarget / 1000).toFixed(1).replace('.', ',')} L` : `${waterTarget} ml`})
                  </div>
                </div>

                {/* Bouton + */}
                <button onClick={() => updateWater(+250)} style={S.waterBtnPlus} aria-label="Ajouter 1 verre">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, marginTop: 2 }}>1 verre</span>
                </button>
              </div>
            )
          })()}
        </div>

        {/* Espace pour scroller sous la barre scanner + FAB */}
        <div style={{ height: 230 }} />
      </div>

      {createPortal(
        <>
          {/* ── Barre scanner fixe ───────────────────────────────── */}
          <div style={S.scanCta}>
            <button onClick={() => navigate('/client/nutrition/scanner')} style={S.scanCtaBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/>
                <line x1="18" y1="14" x2="21" y2="14"/><line x1="21" y1="17" x2="21" y2="21"/>
                <line x1="17" y1="21" x2="21" y2="21"/><line x1="14" y1="18" x2="14" y2="21"/>
              </svg>
              Scanner un article
            </button>
          </div>

          {/* ── FAB ─────────────────────────────────────────────── */}
          <button onClick={() => openAddSheet(null)} style={S.fab} aria-label="Ajouter un repas">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chip-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </>,
        document.body
      )}

      {/* ── Modals (via portal — contourne le transform de usePageFade) ─── */}
      {createPortal(<>

      {/* ── Bottom sheet : ajouter un aliment ─────────────────────── */}
      {addSheet && (() => {
        const mealLabel = MEAL_TYPES.find(t => t.key === addSheet.meal_type)
        const query = sheetSearch.toLowerCase()
        const sourceList = sheetTab === 'favoris' ? templates : recentFoods
        const filtered = sourceList.filter(f =>
          !query || (f.name || '').toLowerCase().includes(query)
        )
        return (
          <div style={S.overlay} onClick={() => setAddSheet(null)}>
            <div style={S.sheet} onClick={e => e.stopPropagation()}>
              {/* Poignée */}
              <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 14px' }} />

              {/* Titre */}
              <p style={{ fontWeight: 900, fontSize: '1rem', color: '#1a1a1a', margin: '0 0 12px' }}>
                {mealLabel ? `${mealLabel.emoji} Ajouter au ${mealLabel.label}` : '➕ Ajouter un aliment'}
              </p>

              {/* Si pas de meal_type : choix du repas */}
              {!addSheet.meal_type && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
                  {MEAL_TYPES.map(t => (
                    <button key={t.key} onClick={() => setAddSheet({ meal_type: t.key })}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, background: 'white', border: '1.5px solid #e5e7eb', fontSize: '0.78rem', fontWeight: 700, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Barre de recherche */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={sheetSearch}
                  onChange={e => setSheetSearch(e.target.value)}
                  placeholder="Rechercher un aliment ou une recette…"
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.88rem', color: '#1a1a1a' }}
                />
                {sheetSearch && (
                  <button onClick={() => setSheetSearch('')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}>✕</button>
                )}
              </div>

              {/* Onglets Récents / Favoris */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {[['recents', '🕐 Récents'], ['favoris', '⭐ Favoris']].map(([key, label]) => (
                  <button key={key} onClick={() => setSheetTab(key)}
                    style={{ padding: '5px 12px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', borderColor: sheetTab === key ? '#1a1a1a' : '#e5e7eb', background: sheetTab === key ? 'var(--chip-bg)' : 'white', color: sheetTab === key ? 'var(--chip-text)' : '#6b7280' }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Liste récents / favoris */}
              <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 14, borderRadius: 12, border: '1px solid #f3f4f6', background: 'white' }}>
                {filtered.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#d1d5db', fontSize: '0.78rem', padding: '1rem', margin: 0, fontStyle: 'italic' }}>
                    {sheetSearch ? 'Aucun résultat' : sheetTab === 'favoris' ? 'Aucun favori enregistré' : 'Aucun aliment récent'}
                  </p>
                ) : filtered.map((food, i) => (
                  <button key={i} onClick={() => quickAdd(food)} disabled={addingFood === food.name}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: addingFood === food.name ? '#f0fdf4' : 'white', border: 'none', borderBottom: i < filtered.length - 1 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer', textAlign: 'left', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sheetTab === 'favoris' && '⭐ '}{food.name}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 1 }}>
                        {[
                          food.prot_g   ? `P ${Math.round(food.prot_g)}g`   : null,
                          food.carbs_g  ? `G ${Math.round(food.carbs_g)}g`  : null,
                          food.fat_g    ? `L ${Math.round(food.fat_g)}g`    : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>{Math.round(food.kcal || 0)} kcal</span>
                      <span style={{ background: addingFood === food.name ? '#16a34a' : 'var(--chip-bg)', color: 'var(--chip-text)', borderRadius: 8, padding: '4px 8px', fontSize: '0.72rem', fontWeight: 800 }}>
                        {addingFood === food.name ? '✓' : '+'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Séparateur */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
                <span style={{ fontSize: '0.65rem', color: '#d1d5db', fontWeight: 700 }}>AJOUTER AUTREMENT</span>
                <div style={{ flex: 1, height: 1, background: '#f3f4f6' }} />
              </div>

              {/* 3 boutons de mode */}
              {(() => {
                const mt = addSheet.meal_type || 'dejeuner'
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    <button onClick={() => { setAddSheet(null); navigate(`/client/nutrition/ajouter?type=${mt}&mode=photo`) }}
                      style={S.modeBtn}>
                      <span style={{ fontSize: '1.5rem' }}>📷</span>
                      <span style={S.modeBtnLabel}>Photo IA</span>
                    </button>
                    <button onClick={() => { setAddSheet(null); navigate(`/client/nutrition/scanner?type=${mt}`) }}
                      style={S.modeBtn}>
                      <span style={{ fontSize: '1.5rem' }}>📊</span>
                      <span style={S.modeBtnLabel}>Code-barre</span>
                    </button>
                    <button onClick={() => { setAddSheet(null); navigate(`/client/nutrition/ajouter?type=${mt}&mode=manuel`) }}
                      style={S.modeBtn}>
                      <span style={{ fontSize: '1.5rem' }}>✏️</span>
                      <span style={S.modeBtnLabel}>Manuel</span>
                    </button>
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {/* ── Modal : modifier un plat ────────────────────────────────── */}
      {editModal && (
        <div style={S.overlay} onClick={() => setEditModal(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            {/* Poignée */}
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1.1rem' }} />
            <p style={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a1a', margin: '0 0 1rem' }}>✏️ Modifier le plat</p>

            {/* Nom */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Nom</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                style={S.fieldInput}
                placeholder="Ex: Poulet grillé"
              />
            </div>

            {/* Quantité */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel}>Quantité (g)</label>
              <input
                type="number" inputMode="decimal"
                value={editForm.quantity_g}
                onChange={e => handleQtyChange(e.target.value)}
                style={S.fieldInput}
                placeholder="Ex: 150"
              />
              {editModal.meal.quantity_g && (
                <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '4px 0 0' }}>
                  Modifie la quantité → les macros se recalculent automatiquement
                </p>
              )}
            </div>

            {/* Macros sur 2 colonnes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.1rem' }}>
              {[
                { key: 'kcal',   label: 'Calories (kcal)', color: 'var(--accent-fg)' },
                { key: 'prot_g', label: 'Protéines (g)',   color: '#3b82f6' },
                { key: 'carbs_g',label: 'Glucides (g)',    color: '#f59e0b' },
                { key: 'fat_g',  label: 'Lipides (g)',     color: '#ef4444' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ ...S.fieldLabel, color: f.color }}>{f.label}</label>
                  <input
                    type="number" inputMode="decimal"
                    value={editForm[f.key]}
                    onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ ...S.fieldInput, borderColor: f.color + '40' }}
                  />
                </div>
              ))}
            </div>

            {/* Boutons */}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setEditModal(null)} style={S.btnCancel}>Annuler</button>
              <button onClick={saveEdit} disabled={savingEdit} style={S.btnSave}>
                {savingEdit ? 'Sauvegarde…' : '✓ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : favori ─────────────────────────────────────────── */}
      {favoriteModal && (
        <div style={S.overlay} onClick={() => setFavoriteModal(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1.1rem' }} />
            <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 0.8rem', color: '#1a1a1a' }}>⭐ Sauvegarder en favori</p>
            <input
              value={favoriteName} onChange={e => setFavoriteName(e.target.value)}
              placeholder="Ex : Déjeuner poulet-riz" autoFocus style={{ ...S.fieldInput, marginBottom: '0.85rem' }}
            />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setFavoriteModal(null)} style={S.btnCancel}>Annuler</button>
              <button onClick={saveFavorite} disabled={!favoriteName.trim() || savingFav} style={{
                ...S.btnSave,
                background: favoriteName.trim() ? '#1a1a1a' : '#e5e7eb',
                color: favoriteName.trim() ? 'var(--chip-text)' : '#9ca3af',
              }}>{savingFav ? 'Sauvegarde…' : 'Sauvegarder ⭐'}</button>
            </div>
          </div>
        </div>
      )}

      </>, document.body)}

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page: { background: '#f5f5f5', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: {
    background: 'var(--header-bg)',
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 60,
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 999,
    background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dateNav: { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px 14px' },
  dateLabel: { color: 'white', fontSize: '0.82rem', fontWeight: 700 },
  dateArrow: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1rem', cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
  content: { padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  summaryCard: { background: 'var(--header-bg)', borderRadius: 20, padding: '18px 18px 16px' },
  scoreCard: {
    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    border: '1px solid #bbf7d0', borderRadius: 18, padding: '13px 16px',
  },
  scoreCircle: {
    width: 48, height: 48, borderRadius: '50%', background: '#22c55e',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0,
  },
  mealSection: { background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  mealHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px' },
  kcalBadge: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', padding: '3px 8px', borderRadius: 20, marginLeft: 4 },
  addBtn: {
    width: 30, height: 30, borderRadius: '50%', background: 'var(--chip-bg)',
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.2rem', fontWeight: 700, color: 'var(--chip-text)', flexShrink: 0,
  },
  mealItem: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', borderBottom: '1px solid #f9f9f9', gap: '0.5rem',
  },
  actionBtn: {
    width: 26, height: 26, borderRadius: '50%', background: '#f3f4f6',
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0,
  },
  waterCard: {
    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
    borderRadius: 18, padding: '16px 16px 18px',
    boxShadow: '0 4px 16px rgba(29,78,216,0.25)',
  },
  waterPct: {
    fontSize: '0.72rem', fontWeight: 700,
    background: 'rgba(255,255,255,0.25)', padding: '3px 9px', borderRadius: 20,
    color: 'white',
  },
  waterBtnMinus: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 2, width: 72, height: 60, borderRadius: 16,
    background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)',
    color: 'white', cursor: 'pointer', flexShrink: 0,
  },
  waterBtnPlus: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 2, width: 72, height: 60, borderRadius: 16,
    background: 'rgba(255,255,255,0.9)', border: 'none',
    color: '#1d4ed8', cursor: 'pointer', flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  scanCta: {
    position: 'fixed',
    bottom: 'calc(82px + max(env(safe-area-inset-bottom, 0px), 0px))',
    left: 0, right: 0,
    padding: '0 14px 22px',
    background: 'transparent',
    zIndex: 70, pointerEvents: 'none',
  },
  scanCtaBtn: {
    width: '100%', padding: '0.9rem 1.25rem', background: 'var(--chip-bg)', color: 'var(--chip-text)',
    border: 'none', borderRadius: 16, fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.22)', pointerEvents: 'all',
  },
  fab: {
    position: 'fixed',
    bottom: 'calc(166px + max(env(safe-area-inset-bottom, 0px), 0px))',
    right: 16, zIndex: 75,
    width: 52, height: 52, borderRadius: '50%', background: 'var(--chip-bg)',
    border: '2px solid var(--accent-stripe)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  // Modals
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end',
  },
  sheet: {
    background: 'white', borderRadius: '22px 22px 0 0',
    padding: '1rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom))',
    width: '100%', boxSizing: 'border-box',
    maxHeight: '85vh', overflowY: 'auto',
  },
  fieldGroup: { marginBottom: '0.85rem' },
  fieldLabel: { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' },
  fieldInput: {
    width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.9rem',
    border: '1.5px solid #e5e7eb', borderRadius: 12,
    fontSize: '0.9rem', outline: 'none', color: '#1a1a1a',
  },
  btnCancel: { flex: 1, padding: '0.75rem', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', color: '#6b7280' },
  btnSave:   { flex: 2, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'var(--chip-bg)', color: 'var(--chip-text)', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer' },
  modeBtn:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: '#f8f8f8', border: '1.5px solid #f0f0f0', borderRadius: 14, padding: '13px 8px', cursor: 'pointer' },
  modeBtnLabel:{ fontSize: '0.68rem', fontWeight: 800, color: '#374151', textAlign: 'center' },
}
