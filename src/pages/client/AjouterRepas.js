import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'

const MEAL_TYPES = [
  { key: 'petit_dej', label: 'Petit-déj', emoji: '🥐' },
  { key: 'dejeuner',  label: 'Déjeuner',  emoji: '🍽️' },
  { key: 'collation', label: 'Collation', emoji: '🍎' },
  { key: 'diner',     label: 'Dîner',     emoji: '🌙' },
]

const MODES = [
  { key: 'scan',    label: 'Scan',    emoji: '📊' },
  { key: 'manuel',  label: 'Manuel',  emoji: '✏️' },
  { key: 'favoris', label: 'Favoris', emoji: '⭐' },
  { key: 'photo',   label: 'Photo',   emoji: '📷' },
  { key: 'vocal',   label: 'Vocal',   emoji: '🎤' },
]

function todayISO() { return new Date().toISOString().slice(0, 10) }

function MacroPill({ label, value, color }) {
  if (value == null) return null
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 800, color }}>{Math.round(value * 10) / 10}g</div>
      <div style={{ fontSize: '0.6rem', color: '#9ca3af', marginTop: 1 }}>{label}</div>
    </div>
  )
}

function NutriScoreBadge({ score }) {
  if (!score) return null
  const colors = { a: '#038141', b: '#85BB2F', c: '#FFCC00', d: '#FF6600', e: '#FF0000' }
  return (
    <span style={{
      background: colors[score.toLowerCase()] || '#9ca3af',
      color: 'white', fontSize: '0.7rem', fontWeight: 900,
      padding: '2px 7px', borderRadius: 4,
      textTransform: 'uppercase',
    }}>
      {score.toUpperCase()}
    </span>
  )
}

export default function AjouterRepas() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initType = searchParams.get('type')

  const [client, setClient]     = useState(null)
  const [mealType, setMealType] = useState(initType || 'dejeuner')
  const [mode, setMode]         = useState('scan')
  const [saving, setSaving]     = useState(false)

  // ── Scan ────────────────────────────────────────────────────────────────
  const videoRef        = useRef(null)
  const scanControlsRef = useRef(null)
  const [cameraError, setCameraError]     = useState(false)
  const [loadingBarcode, setLoadingBarcode] = useState(false)
  const [scanDone, setScanDone]           = useState(false) // produit trouvé ou non trouvé

  // ── Produit sélectionné (scan ou recherche) ──────────────────────────
  const [food, setFood]         = useState(null) // objet nutrition_foods ou template
  const [quantity, setQuantity] = useState('100')

  // ── Saisie manuelle ────────────────────────────────────────────────────
  const [manualForm, setManualForm] = useState({ name: '', kcal: '', prot: '', carbs: '', fat: '' })
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]   = useState(false)

  // ── Favoris ─────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState([])

  // ── workout tag (prépa physique seulement) ───────────────────────────
  const [workoutTag, setWorkoutTag] = useState(null)

  // ── Init client ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('clients').select('id,offre').eq('user_id', session.user.id).maybeSingle()
        .then(({ data }) => setClient(data))
    })
  }, [])

  // ── Favoris : chargement ─────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'favoris' || !client) return
    supabase.from('nutrition_meal_templates')
      .select('*').eq('client_id', client.id)
      .order('use_count', { ascending: false }).limit(30)
      .then(({ data }) => setTemplates(data || []))
  }, [mode, client])

  // ── Caméra : démarrage / arrêt ───────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (scanControlsRef.current) {
      try { scanControlsRef.current.stop?.() } catch { /* ignore */ }
      scanControlsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (mode !== 'scan' || scanDone || cameraError) { stopCamera(); return }

    let mounted = true

    async function startCamera() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        if (!videoRef.current || !mounted) return
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          async (result, err) => {
            if (!mounted || !result) return
            stopCamera()
            setScanDone(true)
            await handleBarcode(result.getText())
          }
        )
        if (mounted) scanControlsRef.current = controls
      } catch (e) {
        console.error('[AjouterRepas] camera:', e)
        if (mounted) setCameraError(true)
      }
    }

    startCamera()
    return () => { mounted = false; stopCamera() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scanDone, cameraError])

  async function handleBarcode(barcode) {
    setLoadingBarcode(true)
    try {
      const { data, error } = await supabase.functions.invoke('nutrition-barcode-lookup', {
        body: { barcode },
      })
      if (!error && data?.found && data.food) {
        setFood(data.food)
        setQuantity(String(data.food.serving_g || 100))
      } else {
        // Produit introuvable → bascule en mode manuel
        setMode('manuel')
        setManualForm(f => ({ ...f, name: '' }))
      }
    } catch (e) {
      console.error('[handleBarcode]', e)
    }
    setLoadingBarcode(false)
  }

  function rescan() {
    setFood(null)
    setQuantity('100')
    setScanDone(false)
    setCameraError(false)
  }

  // ── Recherche produit ────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'manuel' || food || searchTerm.length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase.from('nutrition_foods')
        .select('id,name,brand,kcal_100,prot_100,carbs_100,fat_100,serving_g,nutri_score,unit')
        .ilike('name', `%${searchTerm}%`).limit(8)
      setSearchResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [searchTerm, mode, food])

  function pickFood(f) {
    setFood(f)
    setQuantity(String(f.serving_g || 100))
    setSearchResults([])
    setSearchTerm('')
  }

  function pickTemplate(t) {
    setFood({ _isTemplate: true, ...t })
    setMealType(t.meal_type || mealType)
  }

  function clearFood() {
    setFood(null)
    setQuantity('100')
    setSearchTerm('')
    setSearchResults([])
    rescan()
  }

  // ── Calcul macros depuis food + quantité ─────────────────────────────────
  const macros = (() => {
    if (!food) return null
    if (food._isTemplate) return {
      name: food.name, kcal: food.kcal,
      prot: food.prot_g, carbs: food.carbs_g, fat: food.fat_g,
    }
    const qty = parseFloat(quantity) || 0
    if (!food.kcal_100 || qty === 0) return null
    const r = qty / 100
    return {
      name: food.name,
      kcal:  Math.round(food.kcal_100 * r),
      prot:  food.prot_100  != null ? Math.round(food.prot_100  * r * 10) / 10 : null,
      carbs: food.carbs_100 != null ? Math.round(food.carbs_100 * r * 10) / 10 : null,
      fat:   food.fat_100   != null ? Math.round(food.fat_100   * r * 10) / 10 : null,
    }
  })()

  // ── Validation ───────────────────────────────────────────────────────────
  const canSave = (() => {
    if (mode === 'manuel' && !food) {
      return manualForm.name.trim().length > 0 &&
        (manualForm.kcal || manualForm.prot || manualForm.carbs || manualForm.fat)
    }
    if (food?._isTemplate) return true
    return !!macros
  })()

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!client || saving || !canSave) return
    setSaving(true)
    try {
      const now   = new Date()
      const time  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
      const today = todayISO()
      const wt    = workoutTag || null

      let row
      if (mode === 'manuel' && !food) {
        row = {
          client_id: client.id, date: today, time,
          meal_type: mealType, source: 'manual',
          name:   manualForm.name.trim(),
          kcal:   parseInt(manualForm.kcal)    || null,
          prot_g: parseFloat(manualForm.prot)  || null,
          carbs_g:parseFloat(manualForm.carbs) || null,
          fat_g:  parseFloat(manualForm.fat)   || null,
          workout_tag: wt,
        }
      } else if (food?._isTemplate) {
        row = {
          client_id: client.id, date: today, time,
          meal_type: mealType, source: 'template',
          name: food.name, kcal: food.kcal,
          prot_g: food.prot_g, carbs_g: food.carbs_g,
          fat_g: food.fat_g, fibre_g: food.fibre_g,
          workout_tag: wt,
        }
        await supabase.from('nutrition_meal_templates')
          .update({ use_count: (food.use_count || 0) + 1 }).eq('id', food.id)
      } else if (macros) {
        const src = mode === 'scan' ? 'barcode' : 'manual'
        row = {
          client_id: client.id, date: today, time,
          meal_type: mealType, source: src,
          name: food.brand ? `${food.name} (${food.brand})` : food.name,
          kcal: macros.kcal, prot_g: macros.prot,
          carbs_g: macros.carbs, fat_g: macros.fat,
          workout_tag: wt,
        }
      }

      if (!row) { setSaving(false); return }

      const { data: meal, error } = await supabase
        .from('nutrition_meals').insert(row).select().single()
      if (error) { console.error(error); setSaving(false); return }

      // Insert item si vient du catalogue
      if (food?.id && !food._isTemplate) {
        await supabase.from('nutrition_meal_items').insert({
          meal_id: meal.id, food_id: food.id,
          name: food.name, quantity: parseFloat(quantity),
          unit: food.unit || 'g',
          kcal: macros.kcal, prot_g: macros.prot,
          carbs_g: macros.carbs, fat_g: macros.fat,
        })
      }

      navigate('/client/nutrition')
    } catch (e) {
      console.error('[handleSave]', e)
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.iconBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={S.headerTitle}>Ajouter un repas</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>

        {/* ── Sélecteur type de repas ────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0 0.25rem' }}>
          {MEAL_TYPES.map(t => (
            <button key={t.key} onClick={() => setMealType(t.key)} style={{
              flex: 1, border: 'none', borderRadius: 12, padding: '0.55rem 0.25rem',
              cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700,
              background: mealType === t.key ? '#1a1a1a' : 'white',
              color: mealType === t.key ? '#e4f816' : '#6b7280',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '1.1rem', marginBottom: 2 }}>{t.emoji}</div>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tabs de mode ──────────────────────────────────────────── */}
        <div style={{
          display: 'flex', background: 'white', borderRadius: 14,
          padding: '0.3rem', gap: '0.2rem',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => { setMode(m.key); if (m.key !== 'scan') stopCamera(); if (m.key === 'scan') { setFood(null); setScanDone(false); setCameraError(false) } }} style={{
              flex: 1, border: 'none', borderRadius: 10, padding: '0.45rem 0.2rem',
              cursor: 'pointer', fontSize: '0.62rem', fontWeight: 700,
              background: mode === m.key ? '#1a1a1a' : 'transparent',
              color: mode === m.key ? '#e4f816' : '#9ca3af',
              transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '0.95rem', marginBottom: 1 }}>{m.emoji}</div>
              {m.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* MODE : SCAN                                               */}
        {/* ══════════════════════════════════════════════════════════ */}
        {mode === 'scan' && (
          <div style={S.card}>
            {!food && !loadingBarcode && (
              <>
                {cameraError ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
                    <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.3rem' }}>Caméra inaccessible</p>
                    <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
                      Vérifie les permissions caméra dans les réglages
                    </p>
                    <button onClick={() => setMode('manuel')} style={S.btnSecondary}>Saisie manuelle</button>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'center', margin: '0 0 0.75rem' }}>
                      Pointe la caméra vers le code-barres
                    </p>
                    <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '4/3', position: 'relative' }}>
                      <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {/* Viseur */}
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                      }}>
                        <div style={{
                          width: '65%', height: '28%', border: '2px solid #e4f816',
                          borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                        }} />
                      </div>
                    </div>
                    <button onClick={() => setMode('manuel')} style={{ ...S.btnSecondary, marginTop: '0.75rem', width: '100%' }}>
                      Saisir manuellement à la place
                    </button>
                  </>
                )}
              </>
            )}

            {loadingBarcode && (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                <p style={{ color: '#6b7280', fontWeight: 600 }}>Recherche du produit…</p>
              </div>
            )}

            {food && !loadingBarcode && <FoodCard food={food} quantity={quantity} setQuantity={setQuantity} macros={macros} onClear={rescan} />}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* MODE : MANUEL                                             */}
        {/* ══════════════════════════════════════════════════════════ */}
        {mode === 'manuel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {/* Recherche catalogue */}
            {!food && (
              <div style={S.card}>
                <p style={S.cardLabel}>🔍 Rechercher dans le catalogue</p>
                <div style={{ position: 'relative' }}>
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Ex : yaourt nature, poulet…"
                    style={S.input}
                  />
                  {searching && (
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9ca3af' }}>…</div>
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {searchResults.map(f => (
                      <button key={f.id} onClick={() => pickFood(f)} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.55rem 0.7rem', borderRadius: 10, border: '1px solid #f3f4f6',
                        background: 'white', cursor: 'pointer', textAlign: 'left',
                      }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a1a' }}>{f.name}</div>
                          {f.brand && <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{f.brand}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                          {f.nutri_score && <NutriScoreBadge score={f.nutri_score} />}
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>
                            {Math.round(f.kcal_100 || 0)} kcal/100g
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchTerm.length >= 2 && searchResults.length === 0 && !searching && (
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', margin: '0.5rem 0 0' }}>
                    Aucun résultat — saisie libre ci-dessous
                  </p>
                )}
              </div>
            )}

            {/* Produit sélectionné depuis catalogue */}
            {food && (
              <div style={S.card}>
                <FoodCard food={food} quantity={quantity} setQuantity={setQuantity} macros={macros} onClear={clearFood} />
              </div>
            )}

            {/* Saisie libre */}
            {!food && (
              <div style={S.card}>
                <p style={S.cardLabel}>✏️ Saisie libre</p>
                <input
                  value={manualForm.name}
                  onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nom du repas *"
                  style={{ ...S.input, marginBottom: '0.5rem', fontWeight: 700 }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { key: 'kcal',  label: 'Calories (kcal)', type: 'number' },
                    { key: 'prot',  label: 'Protéines (g)',   type: 'decimal' },
                    { key: 'carbs', label: 'Glucides (g)',     type: 'decimal' },
                    { key: 'fat',   label: 'Lipides (g)',      type: 'decimal' },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '0 0 3px', fontWeight: 600 }}>{label}</p>
                      <input
                        value={manualForm[key]}
                        onChange={e => setManualForm(f => ({ ...f, [key]: e.target.value }))}
                        type="number" inputMode={type === 'decimal' ? 'decimal' : 'numeric'}
                        placeholder="0"
                        style={{ ...S.input, padding: '0.5rem 0.7rem' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* MODE : FAVORIS                                            */}
        {/* ══════════════════════════════════════════════════════════ */}
        {mode === 'favoris' && (
          <div style={S.card}>
            {templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
                <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.3rem' }}>Aucun favori</p>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
                  Sauvegarde un repas depuis l'onglet Nutrition pour le retrouver ici.
                </p>
              </div>
            ) : (
              <>
                <p style={S.cardLabel}>⭐ Mes repas favoris</p>
                {food?._isTemplate && (
                  <div style={{
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 12, padding: '0.75rem', marginBottom: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 800, color: '#1a1a1a', margin: 0, fontSize: '0.9rem' }}>{food.name}</p>
                        <p style={{ color: '#6b7280', margin: '2px 0 0', fontSize: '0.75rem' }}>✅ Sélectionné</p>
                      </div>
                      <button onClick={clearFood} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {templates.map(t => (
                    <button key={t.id} onClick={() => pickTemplate(t)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.7rem 0.85rem', borderRadius: 12,
                      border: food?.id === t.id ? '2px solid #1a1a1a' : '1px solid #f3f4f6',
                      background: food?.id === t.id ? '#f9f9f9' : 'white',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a1a' }}>{t.name}</div>
                        {t.meal_type && <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
                          {MEAL_TYPES.find(m => m.key === t.meal_type)?.label || t.meal_type}
                          {t.use_count > 0 && ` · ${t.use_count}× utilisé`}
                        </div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#e4f816', background: '#1a1a1a', borderRadius: 8, padding: '2px 8px' }}>
                          {t.kcal || '—'} kcal
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2 }}>
                          {[t.prot_g && `P ${t.prot_g}g`, t.carbs_g && `G ${t.carbs_g}g`, t.fat_g && `L ${t.fat_g}g`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* MODE : PHOTO / VOCAL (placeholders)                      */}
        {/* ══════════════════════════════════════════════════════════ */}
        {(mode === 'photo' || mode === 'vocal') && (
          <div style={{ ...S.card, textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{mode === 'photo' ? '📷' : '🎤'}</div>
            <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem' }}>
              {mode === 'photo' ? 'Analyse photo IA' : 'Saisie vocale IA'}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
              🚧 Disponible en Phase 3 — bientôt !
            </p>
          </div>
        )}

        {/* ── Tag entraînement (prépa physique) ─────────────────── */}
        {canSave && client?.offre === 'preparation_physique' && (
          <div style={S.card}>
            <p style={S.cardLabel}>🏋️ Lié à l'entraînement ?</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[
                { key: null,   label: 'Non' },
                { key: 'pre',  label: 'Pré-séance' },
                { key: 'post', label: 'Post-séance' },
              ].map(({ key, label }) => (
                <button key={String(key)} onClick={() => setWorkoutTag(key)} style={{
                  flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none',
                  cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700,
                  background: workoutTag === key ? '#1a1a1a' : '#f3f4f6',
                  color: workoutTag === key ? '#e4f816' : '#6b7280',
                  transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 80 }} />
      </div>

      {/* ── Bouton Ajouter ─────────────────────────────────────────── */}
      {canSave && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 80,
          background: 'white', borderTop: '1px solid #f0f0f0',
          padding: '0.85rem 1rem calc(0.85rem + env(safe-area-inset-bottom))',
        }}>
          {macros && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 900, color: '#1a1a1a' }}>{macros.kcal} kcal</span>
              <MacroPill label="Prot" value={macros.prot}  color="#3b82f6" />
              <MacroPill label="Gluc" value={macros.carbs} color="#f59e0b" />
              <MacroPill label="Lip"  value={macros.fat}   color="#ef4444" />
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{
            width: '100%', padding: '0.9rem',
            background: saving ? '#d1d5db' : '#1a1a1a',
            color: saving ? '#9ca3af' : '#e4f816',
            border: 'none', borderRadius: 14,
            fontWeight: 800, fontSize: '1rem', cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Enregistrement…' : '+ Ajouter ce repas'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Composant : carte produit ────────────────────────────────────────────────
function FoodCard({ food, quantity, setQuantity, macros, onClear }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1a1a1a' }}>{food.name}</span>
            {food.nutri_score && <NutriScoreBadge score={food.nutri_score} />}
          </div>
          {food.brand && <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: '2px 0 0' }}>{food.brand}</p>}
        </div>
        <button onClick={onClear} style={{
          background: '#f3f4f6', border: 'none', borderRadius: '50%',
          width: 28, height: 28, cursor: 'pointer', fontSize: '0.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>×</button>
      </div>

      {/* Pour 100g */}
      {food.kcal_100 != null && (
        <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 0.6rem' }}>
          Pour 100g : {Math.round(food.kcal_100)} kcal
          {food.prot_100  != null && ` · P ${food.prot_100}g`}
          {food.carbs_100 != null && ` · G ${food.carbs_100}g`}
          {food.fat_100   != null && ` · L ${food.fat_100}g`}
        </p>
      )}

      {/* Quantité */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151', margin: 0, flexShrink: 0 }}>Quantité :</p>
        <input
          type="number" inputMode="decimal"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          style={{ ...S.input, width: 80, textAlign: 'center', padding: '0.4rem 0.5rem', fontWeight: 700 }}
        />
        <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600 }}>{food.unit || 'g'}</span>
        {food.serving_g && (
          <button onClick={() => setQuantity(String(food.serving_g))} style={{
            background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '0.3rem 0.6rem',
            fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', cursor: 'pointer',
          }}>
            1 portion ({food.serving_g}{food.unit || 'g'})
          </button>
        )}
      </div>

      {/* Macros calculées */}
      {macros && (
        <div style={{
          display: 'flex', background: '#f9fafb', borderRadius: 10,
          padding: '0.6rem', gap: '0.5rem', alignItems: 'center',
        }}>
          <span style={{ fontSize: '1rem', fontWeight: 900, color: '#1a1a1a', marginRight: '0.25rem' }}>
            {macros.kcal} kcal
          </span>
          <MacroPill label="Prot"  value={macros.prot}  color="#3b82f6" />
          <MacroPill label="Gluc"  value={macros.carbs} color="#f59e0b" />
          <MacroPill label="Lip"   value={macros.fat}   color="#ef4444" />
        </div>
      )}
    </div>
  )
}

const S = {
  page: { background: '#fafafa', minHeight: '100dvh', paddingBottom: '90px' },
  header: {
    background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: '1.05rem', fontWeight: 800, color: 'white', letterSpacing: '0.01em' },
  iconBtn: {
    width: 32, height: 32, borderRadius: 999,
    background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  card: {
    background: 'white', borderRadius: 16, padding: '1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', margin: '0 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: {
    width: '100%', boxSizing: 'border-box',
    padding: '0.6rem 0.875rem', border: '1.5px solid #e5e7eb',
    borderRadius: 10, fontSize: '0.88rem', outline: 'none',
    background: '#f9fafb', color: '#1a1a1a',
  },
  btnSecondary: {
    padding: '0.55rem 1.2rem', border: '1.5px solid #e5e7eb',
    borderRadius: 10, background: 'white', color: '#374151',
    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
  },
}
