import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'

const MEAL_TYPES = [
  { key: 'petit_dej', label: 'Petit-déj',  emoji: '🥐' },
  { key: 'dejeuner',  label: 'Déjeuner',   emoji: '🍽️' },
  { key: 'collation', label: 'Collation',  emoji: '🍎' },
  { key: 'diner',     label: 'Dîner',      emoji: '🌙' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function sum(arr, key) {
  return arr.reduce((acc, x) => acc + (Number(x[key]) || 0), 0)
}

// Anneau de progression kcal (SVG)
function KcalRing({ consumed, target }) {
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0
  const radius = 56
  const circ = 2 * Math.PI * radius
  const dash = circ * pct
  const remaining = Math.max(0, (target || 0) - consumed)
  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={radius} fill="none"
          stroke={pct >= 1 ? '#22c55e' : '#e4f816'}
          strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1 }}>
          {Math.round(consumed)}
        </span>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af' }}>
          / {target || '—'} kcal
        </span>
        {target > 0 && (
          <span style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: 2 }}>
            reste {remaining}
          </span>
        )}
      </div>
    </div>
  )
}

// Barre macro
function MacroBar({ label, value, target, color }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af' }}>
          {Math.round(value)}{target ? ` / ${Math.round(target)}` : ''} g
        </span>
      </div>
      <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`, background: color,
          borderRadius: 999, transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

export default function NutritionClient() {
  const navigate = useNavigate()
  const [client, setClient]   = useState(null)
  const [goals, setGoals]     = useState(null)
  const [meals, setMeals]     = useState([])
  const [water, setWater]     = useState({ ml: 0 })
  const [loading, setLoading] = useState(true)
  // Favoris : modal inline
  const [favoriteModal, setFavoriteModal] = useState(null) // { meal }
  const [favoriteName, setFavoriteName]   = useState('')
  const [savingFav, setSavingFav]         = useState(false)
  // Score qualité IA
  const [qualityResult,  setQualityResult]  = useState(null) // { score, verdict, commentaire }
  const [loadingQuality, setLoadingQuality] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) { setLoading(false); return }

      const { data: c } = await supabase
        .from('clients')
        .select('id, prenom, offre')
        .eq('user_id', userId).maybeSingle()
      if (!c) { setLoading(false); return }
      setClient(c)

      const today = todayISO()

      // Cibles actives (la plus récente avec active_to NULL ou > today)
      const { data: g } = await supabase
        .from('nutrition_goals')
        .select('*')
        .eq('client_id', c.id)
        .or(`active_to.is.null,active_to.gte.${today}`)
        .order('active_from', { ascending: false })
        .limit(1).maybeSingle()
      setGoals(g)

      // Repas du jour
      const { data: m } = await supabase
        .from('nutrition_meals')
        .select('*')
        .eq('client_id', c.id)
        .eq('date', today)
        .order('time', { ascending: true, nullsFirst: false })
      setMeals(m || [])

      // Hydratation du jour
      const { data: w } = await supabase
        .from('nutrition_water')
        .select('ml')
        .eq('client_id', c.id)
        .eq('date', today)
        .maybeSingle()
      setWater(w || { ml: 0 })

      setLoading(false)
    }
    load()
  }, [])

  // ─── Hydratation +/- ─────────────────────────────────────────────────────
  async function updateWater(delta) {
    if (!client) return
    const newMl = Math.max(0, (water.ml || 0) + delta)
    setWater({ ml: newMl })
    await supabase.from('nutrition_water').upsert(
      { client_id: client.id, date: todayISO(), ml: newMl, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,date' }
    )
  }

  // ─── Sauvegarder un repas en favori ──────────────────────────────────────
  async function saveFavorite() {
    if (!client || !favoriteModal || !favoriteName.trim()) return
    setSavingFav(true)
    const m = favoriteModal.meal
    await supabase.from('nutrition_meal_templates').insert({
      client_id: client.id,
      name: favoriteName.trim(),
      meal_type: m.meal_type,
      kcal:    m.kcal,
      prot_g:  m.prot_g,
      carbs_g: m.carbs_g,
      fat_g:   m.fat_g,
      fibre_g: m.fibre_g,
    })
    setSavingFav(false)
    setFavoriteModal(null)
    setFavoriteName('')
  }

  const handleAddMeal = () => navigate('/client/nutrition/ajouter')

  // ─── Score qualité IA ─────────────────────────────────────────────────────
  async function analyzeQuality() {
    if (!meals.length || loadingQuality) return
    setLoadingQuality(true)
    setQualityResult(null)
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

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button onClick={() => navigate(-1)} style={S.backBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={S.headerTitle}>Nutrition</span>
          <div style={{ width: 32 }} />
        </div>
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>Chargement…</p>
        <ClientBottomNav />
      </div>
    )
  }

  const totals = {
    kcal:  sum(meals, 'kcal'),
    prot:  sum(meals, 'prot_g'),
    carbs: sum(meals, 'carbs_g'),
    fat:   sum(meals, 'fat_g'),
  }

  // Repas regroupés par type
  const mealsByType = MEAL_TYPES.reduce((acc, t) => {
    acc[t.key] = meals.filter(m => m.meal_type === t.key)
    return acc
  }, {})

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={S.headerTitle}>Nutrition</span>
        <button onClick={() => navigate('/client/nutrition/historique')} style={S.backBtn} aria-label="Historique">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        </button>
      </div>

      <div style={S.content}>
        {/* ─── Pas de cibles définies → onboarding ─────────────────────── */}
        {!goals && (
          <div style={{ ...S.card, textAlign: 'center', background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)' }}>
            <div style={{ fontSize: '2.2rem', marginBottom: '0.4rem' }}>🥗</div>
            <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem', fontSize: '1rem' }}>
              Bienvenue dans ton suivi nutrition
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
              Ton coach va définir tes objectifs caloriques. En attendant, tu peux déjà commencer à logger tes repas.
            </p>
          </div>
        )}

        {/* ─── Résumé du jour ─────────────────────────────────────────── */}
        {goals && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Aujourd'hui</span>
              <span style={S.cardSub}>{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>

            <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center', marginBottom: '1.1rem' }}>
              <KcalRing consumed={totals.kcal} target={goals.kcal_target} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <MacroBar label="Protéines" value={totals.prot}  target={goals.prot_g}  color="#3b82f6" />
                <MacroBar label="Glucides"  value={totals.carbs} target={goals.carbs_g} color="#f59e0b" />
                <MacroBar label="Lipides"   value={totals.fat}   target={goals.fat_g}   color="#ef4444" />
              </div>
            </div>
          </div>
        )}

        {/* ─── Hydratation ────────────────────────────────────────────── */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>💧 Hydratation</span>
            <span style={S.cardSub}>
              {water.ml} ml{goals?.hydration_ml ? ` / ${goals.hydration_ml} ml` : ''}
            </span>
          </div>
          <div style={{ height: 8, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden', marginBottom: '0.9rem' }}>
            <div style={{
              height: '100%',
              width: `${goals?.hydration_ml ? Math.min(water.ml / goals.hydration_ml * 100, 100) : Math.min(water.ml / 2000 * 100, 100)}%`,
              background: 'linear-gradient(90deg, #38bdf8 0%, #06b6d4 100%)',
              borderRadius: 999, transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <button onClick={() => updateWater(-250)} style={S.waterBtn}>−</button>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', minWidth: 80, textAlign: 'center' }}>
              250 ml / tap
            </span>
            <button onClick={() => updateWater(+250)} style={{ ...S.waterBtn, background: '#0ea5e9', color: 'white' }}>+</button>
          </div>
        </div>

        {/* ─── Repas du jour ──────────────────────────────────────────── */}
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ ...S.cardHeader, padding: '1.1rem 1.1rem 0.6rem' }}>
            <span style={S.cardTitle}>Mes repas</span>
            <span style={S.cardSub}>{meals.length} entrée{meals.length > 1 ? 's' : ''}</span>
          </div>

          {meals.length === 0 ? (
            <div style={{ padding: '0.5rem 1.1rem 1.4rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.6rem', margin: '0 0 0.3rem' }}>🍽️</p>
              <p style={{ color: '#6b7280', fontWeight: 600, fontSize: '0.88rem', margin: '0 0 0.3rem' }}>
                Aucun repas aujourd'hui
              </p>
              <p style={{ color: '#9ca3af', fontSize: '0.78rem', margin: 0 }}>
                Tape sur le bouton + pour ajouter ton premier repas
              </p>
            </div>
          ) : (
            <div>
              {MEAL_TYPES.map(t => {
                const items = mealsByType[t.key]
                if (!items.length) return null
                return (
                  <div key={t.key} style={{ borderTop: '1px solid #f3f4f6', padding: '0.85rem 1.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 6 }}>
                      <span style={{ fontSize: '1rem' }}>{t.emoji}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>{t.label}</span>
                    </div>
                    {items.map(m => (
                      <div key={m.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.4rem 0', gap: '0.5rem',
                      }}>
                        <span style={{ fontSize: '0.85rem', color: '#1a1a1a', flex: 1 }}>{m.name || 'Repas'}</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>{m.kcal || 0} kcal</span>
                        <button
                          onClick={() => { setFavoriteModal({ meal: m }); setFavoriteName(m.name || '') }}
                          title="Sauvegarder en favori"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', padding: '2px', flexShrink: 0, lineHeight: 1 }}
                        >⭐</button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Score qualité IA ────────────────────────────────────── */}
        {meals.length > 0 && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>🤖 Analyse IA</span>
              {qualityResult && (
                <button onClick={() => setQualityResult(null)} style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: '#9ca3af', cursor: 'pointer' }}>
                  Réinitialiser
                </button>
              )}
            </div>

            {!qualityResult && !loadingQuality && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.85rem', lineHeight: 1.5 }}>
                  Fais évaluer ta journée par Gemini : note /10, points forts et conseils.
                </p>
                <button onClick={analyzeQuality} style={{
                  padding: '0.65rem 1.4rem', borderRadius: 12, border: 'none',
                  background: '#1a1a1a', color: '#e4f816',
                  fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                }}>
                  ✨ Évaluer ma journée
                </button>
              </div>
            )}

            {loadingQuality && (
              <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', fontWeight: 600 }}>Gemini analyse ta journée…</p>
              </div>
            )}

            {qualityResult && !loadingQuality && (
              <div>
                {qualityResult.score != null && (() => {
                  const sc = qualityResult.score
                  const color = sc >= 7 ? '#16a34a' : sc >= 5 ? '#d97706' : '#dc2626'
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                        border: `4px solid ${color}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: '1.3rem', fontWeight: 900, color, lineHeight: 1 }}>{sc}</span>
                        <span style={{ fontSize: '0.55rem', color: '#9ca3af', fontWeight: 600 }}>/10</span>
                      </div>
                      <div>
                        <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.2rem', fontSize: '0.95rem' }}>
                          {qualityResult.verdict}
                        </p>
                        <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                          {qualityResult.commentaire}
                        </p>
                      </div>
                    </div>
                  )
                })()}
                {qualityResult.score == null && (
                  <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>{qualityResult.commentaire}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Espace pour le FAB */}
        <div style={{ height: 80 }} />
      </div>

      {/* ─── FAB Ajouter un repas ───────────────────────────────────── */}
      <button onClick={handleAddMeal} style={S.fab} aria-label="Ajouter un repas">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ─── Modal : sauvegarder en favori ────────────────────────────── */}
      {favoriteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'flex-end',
        }} onClick={() => setFavoriteModal(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: '20px 20px 0 0',
              padding: '1.25rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom))',
              width: '100%', boxSizing: 'border-box',
            }}
          >
            <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 0.8rem', color: '#1a1a1a' }}>
              ⭐ Sauvegarder en favori
            </p>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 0.6rem' }}>Nom du favori</p>
            <input
              value={favoriteName}
              onChange={e => setFavoriteName(e.target.value)}
              placeholder="Ex : Déjeuner poulet-riz"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '0.7rem 0.9rem', border: '1.5px solid #e5e7eb',
                borderRadius: 12, fontSize: '0.9rem', outline: 'none',
                marginBottom: '0.85rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setFavoriteModal(null)} style={{
                flex: 1, padding: '0.75rem', borderRadius: 12,
                border: '1.5px solid #e5e7eb', background: 'white',
                fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', color: '#6b7280',
              }}>Annuler</button>
              <button onClick={saveFavorite} disabled={!favoriteName.trim() || savingFav} style={{
                flex: 2, padding: '0.75rem', borderRadius: 12,
                border: 'none',
                background: favoriteName.trim() ? '#1a1a1a' : '#e5e7eb',
                color: favoriteName.trim() ? '#e4f816' : '#9ca3af',
                fontWeight: 800, fontSize: '0.88rem', cursor: favoriteName.trim() ? 'pointer' : 'default',
              }}>{savingFav ? 'Sauvegarde…' : 'Sauvegarder ⭐'}</button>
            </div>
          </div>
        </div>
      )}

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page: { background: '#fafafa', minHeight: '100vh', paddingBottom: '90px' },
  header: {
    background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    color: 'white',
  },
  headerTitle: { fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.01em' },
  backBtn: {
    width: 32, height: 32, borderRadius: 999,
    background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
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
  waterBtn: {
    width: 44, height: 44, borderRadius: '50%', border: 'none',
    background: '#f3f4f6', color: '#374151',
    fontSize: '1.4rem', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  fab: {
    position: 'fixed',
    bottom: 'calc(80px + env(safe-area-inset-bottom))',
    right: 18, zIndex: 80,
    width: 58, height: 58, borderRadius: 999,
    background: '#e4f816', border: 'none',
    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
}
