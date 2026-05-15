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
  { key: 'scan',    label: 'Code-barres', emoji: '▦' },
  { key: 'manuel',  label: 'Manuel',      emoji: '✏️' },
  { key: 'photo',   label: 'Photo IA',    emoji: '📷' },
  { key: 'vocal',   label: 'Vocal IA',    emoji: '🎤' },
  { key: 'favoris', label: 'Favoris',     emoji: '⭐' },
]

function todayISO() { return new Date().toISOString().slice(0, 10) }

// ── Helpers UI ───────────────────────────────────────────────────────────────
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
      padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
    }}>
      {score.toUpperCase()}
    </span>
  )
}

// ── Compression image (canvas → JPEG base64) ────────────────────────────────
function compressImage(file, maxSide = 1024) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxSide || height > maxSide) {
          if (width > height) { height = Math.round(height * maxSide / width); width = maxSide }
          else                { width  = Math.round(width  * maxSide / height); height = maxSide }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1])
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ── Composant résultats IA (photo + vocal) ───────────────────────────────────
function AIResults({ analysis, items, onUpdateQty, onReset }) {
  const totalKcal  = items.reduce((s, i) => s + (i.kcal   || 0), 0)
  const totalProt  = items.reduce((s, i) => s + (i.prot_g  || 0), 0)
  const totalCarbs = items.reduce((s, i) => s + (i.carbs_g || 0), 0)
  const totalFat   = items.reduce((s, i) => s + (i.fat_g   || 0), 0)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a', margin: 0 }}>
          {analysis.repas_nom || 'Repas analysé'}
        </p>
        <button onClick={onReset} style={{
          background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '3px 8px', fontSize: '0.68rem', color: '#9ca3af', cursor: 'pointer',
        }}>
          Recommencer
        </button>
      </div>

      {analysis.note_ia && (
        <div style={{
          background: '#f0fdf4', borderRadius: 10, padding: '0.55rem 0.75rem',
          fontSize: '0.78rem', color: '#166534', marginBottom: '0.7rem', lineHeight: 1.4,
        }}>🤖 {analysis.note_ia}</div>
      )}

      {analysis.confiance && (
        <p style={{ fontSize: '0.66rem', color: '#9ca3af', margin: '0 0 0.5rem' }}>
          Confiance IA : {analysis.confiance}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {items.map((item, idx) => (
          <div key={idx} style={{
            border: '1px solid #f0f0f0', borderRadius: 10,
            padding: '0.6rem 0.75rem', background: '#fafafa',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a1a', flex: 1 }}>{item.name}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#6b7280', flexShrink: 0 }}>
                {item.kcal} kcal
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <input
                type="number" inputMode="decimal"
                value={item.quantity}
                onChange={e => onUpdateQty(idx, parseFloat(e.target.value) || 0)}
                style={{
                  width: 62, padding: '0.3rem 0.45rem',
                  border: '1.5px solid #e5e7eb', borderRadius: 8,
                  fontSize: '0.82rem', textAlign: 'center', outline: 'none', background: 'white',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{item.unit || 'g'}</span>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', marginLeft: 'auto' }}>
                P {Math.round((item.prot_g || 0) * 10) / 10}g ·
                G {Math.round((item.carbs_g || 0) * 10) / 10}g ·
                L {Math.round((item.fat_g || 0) * 10) / 10}g
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div style={{
        marginTop: '0.75rem', background: '#1a1a1a', borderRadius: 12,
        padding: '0.65rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        <span style={{ fontSize: '1rem', fontWeight: 900, color: '#e4f816', flexShrink: 0 }}>
          {Math.round(totalKcal)} kcal
        </span>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)' }}>
          P {Math.round(totalProt * 10) / 10}g ·
          G {Math.round(totalCarbs * 10) / 10}g ·
          L {Math.round(totalFat * 10) / 10}g
        </span>
      </div>
    </div>
  )
}

function AILoading({ label }) {
  return (
    <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🤖</div>
      <p style={{ fontWeight: 700, color: '#374151', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>Gemini Flash analyse…</p>
    </div>
  )
}

function AIError({ error, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
      <div style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>⚠️</div>
      <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.25rem' }}>Analyse échouée</p>
      <p style={{ color: '#9ca3af', fontSize: '0.78rem', marginBottom: '1rem' }}>{error}</p>
      <button onClick={onRetry} style={S.btnSecondary}>Réessayer</button>
    </div>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function AjouterRepas() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [client,   setClient]   = useState(null)
  const [mealType, setMealType] = useState(searchParams.get('type') || 'dejeuner')
  const [mode,     setMode]     = useState('scan')
  const [saving,   setSaving]   = useState(false)

  // ── Scan code-barres ─────────────────────────────────────────────────────
  const videoRef        = useRef(null)
  const scanControlsRef = useRef(null)
  const [cameraError,    setCameraError]    = useState(false)
  const [loadingBarcode, setLoadingBarcode] = useState(false)
  const [scanDone,       setScanDone]       = useState(false)

  // ── Produit catalogue (scan ou recherche manuelle) ───────────────────────
  const [food,     setFood]     = useState(null)
  const [quantity, setQuantity] = useState('100')

  // ── Saisie manuelle libre ────────────────────────────────────────────────
  const [manualForm,    setManualForm]    = useState({ name: '', kcal: '', prot: '', carbs: '', fat: '' })
  const [searchTerm,    setSearchTerm]    = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching,     setSearching]     = useState(false)

  // ── Favoris ───────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState([])

  // ── IA partagée (photo + vocal) ───────────────────────────────────────────
  const [aiAnalysis,     setAiAnalysis]     = useState(null)
  const [analyzingAI,    setAnalyzingAI]    = useState(false)
  const [aiError,        setAiError]        = useState(null)
  const [editableItems,  setEditableItems]  = useState([])

  // ── Photo ─────────────────────────────────────────────────────────────────
  const photoInputRef = useRef(null)

  // ── Vocal ─────────────────────────────────────────────────────────────────
  const recognitionRef  = useRef(null)
  const [isRecording,    setIsRecording]    = useState(false)
  const [transcript,     setTranscript]     = useState('')
  const [voiceSupported, setVoiceSupported] = useState(true)

  // ── workout tag ──────────────────────────────────────────────────────────
  const [workoutTag, setWorkoutTag] = useState(null)

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    setVoiceSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition))
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

  // ── Caméra barcode ────────────────────────────────────────────────────────
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
          async (result) => {
            if (!mounted || !result) return
            stopCamera(); setScanDone(true)
            await handleBarcode(result.getText())
          }
        )
        if (mounted) scanControlsRef.current = controls
      } catch (e) {
        console.error('[scan] camera:', e)
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
      const { data, error } = await supabase.functions.invoke('nutrition-barcode-lookup', { body: { barcode } })
      if (!error && data?.found && data.food) {
        setFood(data.food)
        setQuantity(String(data.food.serving_g || 100))
      } else {
        setMode('manuel')
      }
    } catch (e) { console.error('[barcode]', e) }
    setLoadingBarcode(false)
  }

  function rescan() { setFood(null); setQuantity('100'); setScanDone(false); setCameraError(false) }

  // ── Recherche catalogue ───────────────────────────────────────────────────
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

  function pickFood(f) { setFood(f); setQuantity(String(f.serving_g || 100)); setSearchResults([]); setSearchTerm('') }
  function pickTemplate(t) { setFood({ _isTemplate: true, ...t }); setMealType(t.meal_type || mealType) }
  function clearFood() { setFood(null); setQuantity('100'); setSearchTerm(''); setSearchResults([]); rescan() }

  // ── Macros catalogue ──────────────────────────────────────────────────────
  const macros = (() => {
    if (!food) return null
    if (food._isTemplate) return { name: food.name, kcal: food.kcal, prot: food.prot_g, carbs: food.carbs_g, fat: food.fat_g }
    const qty = parseFloat(quantity) || 0
    if (!food.kcal_100 || qty === 0) return null
    const r = qty / 100
    return {
      name: food.name,
      kcal:  Math.round(food.kcal_100  * r),
      prot:  food.prot_100  != null ? Math.round(food.prot_100  * r * 10) / 10 : null,
      carbs: food.carbs_100 != null ? Math.round(food.carbs_100 * r * 10) / 10 : null,
      fat:   food.fat_100   != null ? Math.round(food.fat_100   * r * 10) / 10 : null,
    }
  })()

  // ── Photo : capture + analyse ─────────────────────────────────────────────
  async function handlePhotoCapture(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzingAI(true); setAiError(null)
    try {
      const base64 = await compressImage(file)
      const { data, error } = await supabase.functions.invoke('nutrition-analyze-photo', {
        body: { photo_base64: base64, mime_type: file.type || 'image/jpeg' },
      })
      if (error || !data?.ok) throw new Error(data?.error || 'Analyse échouée')
      handleAIResult(data)
    } catch (err) {
      setAiError(err.message || 'Analyse impossible')
    }
    setAnalyzingAI(false)
  }

  // ── Vocal : Web Speech API ────────────────────────────────────────────────
  function startRecording() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
      setTranscript(text)
      setIsRecording(false)
      callParseVoice(text)
    }
    rec.onerror  = () => { setIsRecording(false) }
    rec.onend    = () => { setIsRecording(false) }
    recognitionRef.current = rec
    rec.start()
    setIsRecording(true)
    setTranscript('')
    setAiAnalysis(null)
    setEditableItems([])
  }

  function stopRecording() {
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    setIsRecording(false)
  }

  async function callParseVoice(text) {
    setAnalyzingAI(true); setAiError(null)
    try {
      const { data, error } = await supabase.functions.invoke('nutrition-parse-voice', { body: { text } })
      if (error || !data?.ok) throw new Error(data?.error || 'Parsing échoué')
      handleAIResult(data)
    } catch (err) {
      setAiError(err.message || 'Analyse impossible')
    }
    setAnalyzingAI(false)
  }

  // ── Résultat IA → état éditable ───────────────────────────────────────────
  function handleAIResult(data) {
    if (!data?.items?.length) { setAiError('Aucun aliment détecté'); return }
    setAiAnalysis(data)
    setEditableItems(data.items.map(item => ({
      ...item,
      _origKcal:  item.kcal,
      _origProt:  item.prot_g,
      _origCarbs: item.carbs_g,
      _origFat:   item.fat_g,
      _origQty:   item.quantity,
    })))
  }

  function updateItemQuantity(idx, newQty) {
    setEditableItems(items => items.map((item, i) => {
      if (i !== idx) return item
      const ratio = newQty / (item._origQty || 100)
      return {
        ...item,
        quantity: newQty,
        kcal:    Math.round((item._origKcal  || 0) * ratio),
        prot_g:  Math.round((item._origProt  || 0) * ratio * 10) / 10,
        carbs_g: Math.round((item._origCarbs || 0) * ratio * 10) / 10,
        fat_g:   Math.round((item._origFat   || 0) * ratio * 10) / 10,
      }
    }))
  }

  function resetAI() { setAiAnalysis(null); setEditableItems([]); setAiError(null); setTranscript('') }

  // ── Validation ────────────────────────────────────────────────────────────
  const canSave = (() => {
    if (mode === 'photo' || mode === 'vocal') return editableItems.length > 0
    if (mode === 'manuel' && !food)
      return manualForm.name.trim().length > 0 && (manualForm.kcal || manualForm.prot || manualForm.carbs || manualForm.fat)
    if (food?._isTemplate) return true
    return !!macros
  })()

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!client || saving || !canSave) return
    setSaving(true)
    try {
      const now  = new Date()
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
      const wt   = workoutTag || null
      let row, insertItems = null

      if (mode === 'photo' || mode === 'vocal') {
        const totKcal  = editableItems.reduce((s, i) => s + (i.kcal   || 0), 0)
        const totProt  = editableItems.reduce((s, i) => s + (i.prot_g  || 0), 0)
        const totCarbs = editableItems.reduce((s, i) => s + (i.carbs_g || 0), 0)
        const totFat   = editableItems.reduce((s, i) => s + (i.fat_g   || 0), 0)
        row = {
          client_id: client.id, date: todayISO(), time, meal_type: mealType,
          source: mode === 'photo' ? 'photo_ai' : 'voice_ai',
          name: aiAnalysis?.repas_nom || (mode === 'photo' ? 'Repas photo IA' : 'Repas vocal IA'),
          kcal: Math.round(totKcal),
          prot_g: Math.round(totProt * 10) / 10,
          carbs_g: Math.round(totCarbs * 10) / 10,
          fat_g: Math.round(totFat * 10) / 10,
          workout_tag: wt,
        }
        insertItems = editableItems.map((item, i) => ({
          name: item.name, quantity: item.quantity, unit: item.unit || 'g',
          kcal: item.kcal, prot_g: item.prot_g, carbs_g: item.carbs_g, fat_g: item.fat_g, ordre: i,
        }))
      } else if (mode === 'manuel' && !food) {
        row = {
          client_id: client.id, date: todayISO(), time, meal_type: mealType, source: 'manual',
          name: manualForm.name.trim(),
          kcal: parseInt(manualForm.kcal)    || null,
          prot_g: parseFloat(manualForm.prot)  || null,
          carbs_g: parseFloat(manualForm.carbs) || null,
          fat_g: parseFloat(manualForm.fat)   || null,
          workout_tag: wt,
        }
      } else if (food?._isTemplate) {
        row = {
          client_id: client.id, date: todayISO(), time, meal_type: mealType, source: 'template',
          name: food.name, kcal: food.kcal, prot_g: food.prot_g,
          carbs_g: food.carbs_g, fat_g: food.fat_g, fibre_g: food.fibre_g, workout_tag: wt,
        }
        await supabase.from('nutrition_meal_templates').update({ use_count: (food.use_count || 0) + 1 }).eq('id', food.id)
      } else if (macros) {
        row = {
          client_id: client.id, date: todayISO(), time, meal_type: mealType,
          source: mode === 'scan' ? 'barcode' : 'manual',
          name: food.brand ? `${food.name} (${food.brand})` : food.name,
          kcal: macros.kcal, prot_g: macros.prot, carbs_g: macros.carbs, fat_g: macros.fat,
          workout_tag: wt,
        }
      }

      if (!row) { setSaving(false); return }

      const { data: meal, error } = await supabase.from('nutrition_meals').insert(row).select().single()
      if (error) { console.error(error); setSaving(false); return }

      // Items depuis catalogue
      if (food?.id && !food._isTemplate) {
        await supabase.from('nutrition_meal_items').insert({
          meal_id: meal.id, food_id: food.id,
          name: food.name, quantity: parseFloat(quantity), unit: food.unit || 'g',
          kcal: macros.kcal, prot_g: macros.prot, carbs_g: macros.carbs, fat_g: macros.fat,
        })
      }
      // Items depuis IA
      if (insertItems?.length) {
        await supabase.from('nutrition_meal_items').insert(insertItems.map(it => ({ ...it, meal_id: meal.id })))
      }

      navigate('/client/nutrition')
    } catch (e) { console.error('[save]', e); setSaving(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────
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

        {/* ── Type de repas ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {MEAL_TYPES.map(t => (
            <button key={t.key} onClick={() => setMealType(t.key)} style={{
              flex: 1, border: mealType === t.key ? 'none' : '1.5px solid #e5e7eb',
              borderRadius: 14, padding: '0.65rem 0.2rem',
              cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
              background: mealType === t.key ? '#1a1a1a' : 'white',
              color: mealType === t.key ? '#e4f816' : '#6b7280',
              boxShadow: mealType === t.key ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '1.2rem', marginBottom: 3 }}>{t.emoji}</div>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Sélecteur de mode ─────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '2px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {MODES.map(m => (
            <button key={m.key} onClick={() => {
              setMode(m.key)
              stopCamera()
              if (m.key === 'scan') { setFood(null); setScanDone(false); setCameraError(false) }
              if (m.key !== 'photo' && m.key !== 'vocal') resetAI()
            }} style={{
              flexShrink: 0,
              padding: '0.55rem 1rem',
              borderRadius: 24,
              border: mode === m.key ? 'none' : '1.5px solid #e5e7eb',
              background: mode === m.key ? '#1a1a1a' : 'white',
              color: mode === m.key ? '#e4f816' : '#374151',
              fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}>
              {m.emoji} {m.label}
            </button>
          ))}
        </div>

        {/* ══ MODE SCAN ═══════════════════════════════════════════════ */}
        {mode === 'scan' && (
          <div style={S.card}>
            {!food && !loadingBarcode && (
              cameraError ? (
                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <p style={{ fontSize: '2rem', margin: '0 0 0.4rem' }}>📷</p>
                  <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.3rem' }}>Caméra inaccessible</p>
                  <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>Vérifie les permissions caméra</p>
                  <button onClick={() => setMode('manuel')} style={S.btnSecondary}>Saisie manuelle</button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'center', margin: '0 0 0.75rem' }}>
                    Pointe la caméra vers le code-barres
                  </p>
                  <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '3/4', position: 'relative' }}>
                    <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      {/* Coin haut-gauche */}
                      <div style={{ position: 'absolute', width: '82%', height: '36%', pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: 22, height: 22, borderTop: '3px solid #e4f816', borderLeft: '3px solid #e4f816', borderRadius: '4px 0 0 0' }} />
                        <div style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderTop: '3px solid #e4f816', borderRight: '3px solid #e4f816', borderRadius: '0 4px 0 0' }} />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, width: 22, height: 22, borderBottom: '3px solid #e4f816', borderLeft: '3px solid #e4f816', borderRadius: '0 0 0 4px' }} />
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderBottom: '3px solid #e4f816', borderRight: '3px solid #e4f816', borderRadius: '0 0 4px 0' }} />
                      </div>
                      {/* Masque sombre autour */}
                      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.42)' }} />
                      {/* Zone transparente */}
                      <div style={{ position: 'relative', width: '82%', height: '36%', background: 'transparent', zIndex: 1 }} />
                    </div>
                  </div>
                  <button onClick={() => setMode('manuel')} style={{ ...S.btnSecondary, marginTop: '0.75rem', width: '100%' }}>
                    Saisir manuellement
                  </button>
                </>
              )
            )}
            {loadingBarcode && (
              <div style={{ textAlign: 'center', padding: '2.5rem' }}>
                <p style={{ fontSize: '2rem', margin: '0 0 0.4rem' }}>🔍</p>
                <p style={{ color: '#6b7280', fontWeight: 600 }}>Recherche du produit…</p>
              </div>
            )}
            {food && !loadingBarcode && (
              <FoodCard food={food} quantity={quantity} setQuantity={setQuantity} macros={macros} onClear={rescan} />
            )}
          </div>
        )}

        {/* ══ MODE MANUEL ═════════════════════════════════════════════ */}
        {mode === 'manuel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {!food && (
              <div style={S.card}>
                <p style={S.cardLabel}>🔍 Rechercher dans le catalogue</p>
                <div style={{ position: 'relative' }}>
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Ex : yaourt nature, poulet…" style={S.input} />
                  {searching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '0.75rem' }}>…</span>}
                </div>
                {searchResults.length > 0 && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {searchResults.map(f => (
                      <button key={f.id} onClick={() => pickFood(f)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.7rem', borderRadius: 10, border: '1px solid #f3f4f6', background: 'white', cursor: 'pointer', textAlign: 'left' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1a1a1a' }}>{f.name}</div>
                          {f.brand && <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{f.brand}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                          {f.nutri_score && <NutriScoreBadge score={f.nutri_score} />}
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280' }}>{Math.round(f.kcal_100 || 0)} kcal/100g</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchTerm.length >= 2 && !searchResults.length && !searching && (
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', margin: '0.5rem 0 0' }}>Aucun résultat — saisie libre ci-dessous</p>
                )}
              </div>
            )}
            {food && <div style={S.card}><FoodCard food={food} quantity={quantity} setQuantity={setQuantity} macros={macros} onClear={clearFood} /></div>}
            {!food && (
              <div style={S.card}>
                <p style={S.cardLabel}>✏️ Saisie libre</p>
                <input value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nom du repas *" style={{ ...S.input, marginBottom: '0.5rem', fontWeight: 700 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[['kcal','Calories (kcal)','numeric'],['prot','Protéines (g)','decimal'],['carbs','Glucides (g)','decimal'],['fat','Lipides (g)','decimal']].map(([k, l, im]) => (
                    <div key={k}>
                      <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '0 0 3px', fontWeight: 600 }}>{l}</p>
                      <input value={manualForm[k]} onChange={e => setManualForm(f => ({ ...f, [k]: e.target.value }))}
                        type="number" inputMode={im} placeholder="0" style={{ ...S.input, padding: '0.5rem 0.7rem' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ MODE FAVORIS ════════════════════════════════════════════ */}
        {mode === 'favoris' && (
          <div style={S.card}>
            {templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <p style={{ fontSize: '2rem', margin: '0 0 0.4rem' }}>⭐</p>
                <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.3rem' }}>Aucun favori</p>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Sauvegarde un repas depuis l'onglet Nutrition pour le retrouver ici.</p>
              </div>
            ) : (
              <>
                <p style={S.cardLabel}>⭐ Mes repas favoris</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {templates.map(t => (
                    <button key={t.id} onClick={() => pickTemplate(t)} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.7rem 0.85rem', borderRadius: 12,
                      border: food?.id === t.id ? '2px solid #1a1a1a' : '1px solid #f3f4f6',
                      background: food?.id === t.id ? '#f9f9f9' : 'white', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a1a' }}>{t.name}</div>
                        {t.meal_type && <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
                          {MEAL_TYPES.find(m => m.key === t.meal_type)?.label || t.meal_type}
                          {t.use_count > 0 && ` · ${t.use_count}× utilisé`}
                        </div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#e4f816', background: '#1a1a1a', borderRadius: 8, padding: '2px 8px' }}>
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

        {/* ══ MODE PHOTO ══════════════════════════════════════════════ */}
        {mode === 'photo' && (
          <div style={S.card}>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={handlePhotoCapture} />

            {!aiAnalysis && !analyzingAI && !aiError && (
              <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.6rem' }}>📷</div>
                <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.4rem' }}>Analyse photo IA</p>
                <p style={{ color: '#9ca3af', fontSize: '0.82rem', lineHeight: 1.5, margin: '0 0 1.2rem' }}>
                  Prends en photo ton repas — Gemini Flash identifie les aliments et estime les macros automatiquement.
                </p>
                <button onClick={() => photoInputRef.current?.click()} style={S.btnPrimary}>
                  📷 Prendre une photo
                </button>
                <p style={{ fontSize: '0.68rem', color: '#b0b8c1', marginTop: '0.5rem' }}>
                  Ou choisir depuis la galerie
                </p>
              </div>
            )}
            {analyzingAI && <AILoading label="Analyse de la photo…" />}
            {aiError && !analyzingAI && <AIError error={aiError} onRetry={() => { setAiError(null); setAiAnalysis(null) }} />}
            {aiAnalysis && !analyzingAI && (
              <AIResults analysis={aiAnalysis} items={editableItems} onUpdateQty={updateItemQuantity} onReset={resetAI} />
            )}
          </div>
        )}

        {/* ══ MODE VOCAL ══════════════════════════════════════════════ */}
        {mode === 'vocal' && (
          <div style={S.card}>
            {!voiceSupported && (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <p style={{ fontSize: '2rem', margin: '0 0 0.4rem' }}>🎤</p>
                <p style={{ fontWeight: 700, color: '#374151', marginBottom: '0.3rem' }}>Non disponible</p>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>La reconnaissance vocale n'est pas supportée par ce navigateur.</p>
              </div>
            )}

            {voiceSupported && !aiAnalysis && !analyzingAI && !aiError && (
              <div style={{ padding: '0.25rem 0' }}>
                <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.3rem', fontSize: '0.95rem' }}>Saisie vocale IA</p>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', lineHeight: 1.5, margin: '0 0 1rem' }}>
                  Parle ou tape ton repas — Gemini identifie les aliments et calcule les macros.
                </p>

                {/* Bouton micro */}
                <button onClick={isRecording ? stopRecording : startRecording} style={{
                  width: '100%', padding: '0.8rem', border: 'none', borderRadius: 14,
                  background: isRecording ? '#ef4444' : '#1a1a1a',
                  color: isRecording ? 'white' : '#e4f816',
                  fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}>
                  <span style={{ filter: isRecording ? 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' : 'none' }}>🎤</span>
                  {isRecording ? 'Arrêter l\'enregistrement' : 'Parler'}
                </button>
                {isRecording && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.4rem', fontWeight: 600 }}>
                    ● Enregistrement en cours… parle maintenant
                  </p>
                )}

                {/* Séparateur */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.9rem 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                  <span style={{ fontSize: '0.72rem', color: '#b0b8c1', fontWeight: 600 }}>ou tape ton repas</span>
                  <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                </div>

                {/* Textarea toujours visible (fallback iOS / préférence) */}
                <textarea
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                  placeholder="Ex : poulet grillé 180g, riz basmati 120g, salade verte…"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '0.7rem 0.875rem',
                    border: '1.5px solid #e5e7eb', borderRadius: 12,
                    fontSize: '0.88rem', outline: 'none', resize: 'none',
                    background: '#f9fafb', color: '#1a1a1a', fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />

                {transcript.trim().length > 4 && !isRecording && (
                  <button onClick={() => callParseVoice(transcript)} style={{
                    ...S.btnPrimary, width: '100%', marginTop: '0.6rem',
                  }}>
                    🤖 Analyser ce repas
                  </button>
                )}
              </div>
            )}

            {analyzingAI && <AILoading label="Analyse du repas vocal…" />}
            {aiError && !analyzingAI && <AIError error={aiError} onRetry={() => { setAiError(null); setTranscript('') }} />}
            {aiAnalysis && !analyzingAI && (
              <AIResults analysis={aiAnalysis} items={editableItems} onUpdateQty={updateItemQuantity} onReset={resetAI} />
            )}
          </div>
        )}

        {/* ── Tag entraînement ──────────────────────────────────────── */}
        {canSave && client?.offre === 'preparation_physique' && (
          <div style={S.card}>
            <p style={S.cardLabel}>🏋️ Lié à l'entraînement ?</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[{ key: null, label: 'Non' }, { key: 'pre', label: 'Pré-séance' }, { key: 'post', label: 'Post-séance' }].map(({ key, label }) => (
                <button key={String(key)} onClick={() => setWorkoutTag(key)} style={{
                  flex: 1, padding: '0.5rem', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 700,
                  background: workoutTag === key ? '#1a1a1a' : '#f3f4f6',
                  color: workoutTag === key ? '#e4f816' : '#6b7280',
                  transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>

      {/* ── Bouton Ajouter ────────────────────────────────────────────── */}
      {canSave && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 80, background: 'white', borderTop: '1px solid #f0f0f0', padding: '0.75rem 1rem', paddingBottom: 'max(1.1rem, calc(0.75rem + env(safe-area-inset-bottom, 20px)))' }}>
          {macros && !(mode === 'photo' || mode === 'vocal') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', padding: '0.4rem 0.2rem', background: '#f9fafb', borderRadius: 10 }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#1a1a1a', paddingLeft: '0.5rem' }}>{macros.kcal} kcal</span>
              <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
              <MacroPill label="Prot"  value={macros.prot}  color="#3b82f6" />
              <MacroPill label="Gluc"  value={macros.carbs} color="#f59e0b" />
              <MacroPill label="Lip"   value={macros.fat}   color="#ef4444" />
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{
            width: '100%', padding: '0.9rem',
            background: saving ? '#d1d5db' : '#1a1a1a',
            color: saving ? '#9ca3af' : '#e4f816',
            border: 'none', borderRadius: 14, fontWeight: 800, fontSize: '1rem',
            cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Enregistrement…' : '+ Ajouter ce repas'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Composant FoodCard ─────────────────────────────────────────────────────
function FoodCard({ food, quantity, setQuantity, macros, onClear }) {
  const unit = food.unit || 'g'
  return (
    <div>
      {/* Nom + badge nutri-score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.9rem' }}>
        <div style={{ flex: 1, paddingRight: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1a1a1a' }}>{food.name}</span>
            {food.nutri_score && <NutriScoreBadge score={food.nutri_score} />}
          </div>
          {food.brand && <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>{food.brand}</p>}
        </div>
        <button onClick={onClear} style={{ background: '#f3f4f6', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#6b7280' }}>×</button>
      </div>

      {/* Sélecteur de quantité */}
      <div style={{ background: '#f9fafb', borderRadius: 12, padding: '0.8rem', marginBottom: '0.85rem' }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>Quantité</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="number" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)}
            style={{ width: 80, padding: '0.45rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '1rem', fontWeight: 800, textAlign: 'center', outline: 'none', background: 'white' }} />
          <span style={{ fontSize: '0.85rem', color: '#6b7280', fontWeight: 600 }}>{unit}</span>
          {/* Raccourcis */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {food.serving_g && food.serving_g !== 100 && (
              <button onClick={() => setQuantity(String(food.serving_g))}
                style={{ background: parseFloat(quantity) === food.serving_g ? '#1a1a1a' : 'white', color: parseFloat(quantity) === food.serving_g ? '#e4f816' : '#374151', border: parseFloat(quantity) === food.serving_g ? 'none' : '1.5px solid #e5e7eb', borderRadius: 20, padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Portion {food.serving_g}{unit}
              </button>
            )}
            <button onClick={() => setQuantity('100')}
              style={{ background: parseFloat(quantity) === 100 ? '#1a1a1a' : 'white', color: parseFloat(quantity) === 100 ? '#e4f816' : '#374151', border: parseFloat(quantity) === 100 ? 'none' : '1.5px solid #e5e7eb', borderRadius: 20, padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
              100{unit}
            </button>
          </div>
        </div>
      </div>

      {/* Valeurs pour la quantité choisie */}
      {macros && (
        <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '0.75rem 0.9rem' }}>
          <p style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.45rem' }}>
            Valeurs pour {quantity}{unit}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#e4f816' }}>{macros.kcal} kcal</span>
            <MacroPill label="Prot"  value={macros.prot}  color="#60a5fa" />
            <MacroPill label="Gluc"  value={macros.carbs} color="#fbbf24" />
            <MacroPill label="Lip"   value={macros.fat}   color="#f87171" />
          </div>
          {food.kcal_100 != null && parseFloat(quantity) !== 100 && (
            <p style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.3)', margin: '0.35rem 0 0' }}>
              Réf. 100{unit} : {Math.round(food.kcal_100)} kcal · P {food.prot_100 ?? '—'}g · G {food.carbs_100 ?? '—'}g · L {food.fat_100 ?? '—'}g
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const S = {
  page: { background: '#fafafa', minHeight: '100dvh' },
  header: { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: '1.05rem', fontWeight: 800, color: 'white', letterSpacing: '0.01em' },
  iconBtn: { width: 32, height: 32, borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  content: { padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  card: { background: 'white', borderRadius: 16, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardLabel: { fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', margin: '0 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', outline: 'none', background: '#f9fafb', color: '#1a1a1a' },
  btnPrimary: { padding: '0.75rem 1.5rem', border: 'none', borderRadius: 12, background: '#1a1a1a', color: '#e4f816', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' },
  btnSecondary: { padding: '0.55rem 1.2rem', border: '1.5px solid #e5e7eb', borderRadius: 10, background: 'white', color: '#374151', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' },
}
