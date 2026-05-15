import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { supabase } from '../../supabase'

// ─── Calcul du grade nutritionnel (A→E) ──────────────────────────────────────
function calculateGrade(food) {
  // Priorité au Nutri-Score d'Open Food Facts
  if (food.nutri_score) return food.nutri_score.toUpperCase()

  let neg = 0
  const kcal   = food.kcal_100   || 0
  const satFat = food.satfat_100 || 0
  const sugar  = food.sugar_100  || 0
  const salt   = food.salt_100   || 0

  // Énergie
  if (kcal > 335)  neg++
  if (kcal > 670)  neg++
  if (kcal > 1005) neg++
  if (kcal > 1340) neg++
  // Graisses saturées
  if (satFat > 1)  neg++
  if (satFat > 2)  neg++
  if (satFat > 4)  neg++
  if (satFat > 8)  neg++
  // Sucres
  if (sugar > 4.5)  neg++
  if (sugar > 9)    neg++
  if (sugar > 13.5) neg++
  if (sugar > 18)   neg++
  // Sel
  if (salt > 0.3) neg++
  if (salt > 1.5) neg++
  // NOVA (ultra-transformé)
  if (food.nova_group === 4) neg += 3
  else if (food.nova_group === 3) neg += 1

  // Points positifs
  let pos = 0
  const prot  = food.prot_100   || 0
  const fiber = food.fibre_100  || 0
  if (prot > 3.2) pos++
  if (prot > 6.4) pos++
  if (prot > 8.0) pos++
  if (fiber > 3.5) pos++
  if (fiber > 4.7) pos++

  const score = neg - pos
  if (score <= 2)  return 'A'
  if (score <= 5)  return 'B'
  if (score <= 9)  return 'C'
  if (score <= 13) return 'D'
  return 'E'
}

const GRADE_SCORE = { A: 9.0, B: 7.0, C: 5.5, D: 3.5, E: 2.0 }
const GRADE_COLOR = { A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626' }

function buildTags(food, grade) {
  const ok = [], warn = [], bad = []
  if (['A', 'B'].includes(grade)) ok.push('Bonne qualité')
  if ((food.prot_100  || 0) > 15)  ok.push('Riche en protéines')
  if ((food.fibre_100 || 0) > 3.5) ok.push('Source de fibres')
  if ((food.sugar_100 || 0) > 22.5) bad.push('Très sucré')
  else if ((food.sugar_100 || 0) > 12.5) warn.push('Sucres élevés')
  if ((food.satfat_100 || 0) > 5)  warn.push('Graisses saturées')
  if ((food.salt_100  || 0) > 1.5) warn.push('Sel élevé')
  if (food.nova_group === 4)       bad.push('Ultra-transformé (NOVA 4)')
  else if (food.nova_group === 1)  ok.push('Non transformé')
  return { ok, warn, bad }
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ScannerArticle() {
  const navigate    = useNavigate()
  const videoRef    = useRef(null)
  const readerRef   = useRef(null)
  const [phase, setPhase]       = useState('scan')    // 'scan' | 'loading' | 'result' | 'notfound' | 'error'
  const [food, setFood]         = useState(null)
  const [grade, setGrade]       = useState(null)
  const [tags, setTags]         = useState({ ok: [], warn: [], bad: [] })
  const [saved, setSaved]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [clientId, setClientId] = useState(null)
  const [camError, setCamError] = useState(false)

  // Charger le client_id
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('clients').select('id').eq('user_id', session.user.id).maybeSingle()
        .then(({ data }) => { if (data) setClientId(data.id) })
    })
  }, [])

  // Démarrer le scanner
  useEffect(() => {
    if (phase !== 'scan') return
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromVideoDevice(undefined, videoRef.current, async (result, err) => {
      if (result) {
        stopScanner()
        await lookupBarcode(result.getText())
      } else if (err && !(err instanceof NotFoundException)) {
        console.warn('[scanner]', err)
      }
    }).catch(e => {
      console.error('[scanner init]', e)
      setCamError(true)
    })

    return () => stopScanner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function stopScanner() {
    try { BrowserMultiFormatReader.releaseAllStreams() } catch {}
  }

  const lookupBarcode = useCallback(async (barcode) => {
    setPhase('loading')
    try {
      const { data, error } = await supabase.functions.invoke('nutrition-barcode-lookup', {
        body: { barcode },
      })
      if (error || !data?.found) {
        setPhase('notfound')
        return
      }
      const f = data.food
      const g = calculateGrade(f)
      const t = buildTags(f, g)
      setFood(f)
      setGrade(g)
      setTags(t)
      setPhase('result')
    } catch (e) {
      console.error('[lookup]', e)
      setPhase('error')
    }
  }, [])

  // Sauvegarder dans l'historique
  async function saveToHistory() {
    if (!food || !clientId || saving || saved) return
    setSaving(true)
    await supabase.from('nutrition_scan_history').insert({
      client_id:       clientId,
      food_id:         food.id || null,
      barcode:         food.barcode,
      product_name:    food.name,
      brand:           food.brand,
      image_url:       food.image_url,
      kcal_100g:       food.kcal_100,
      prot_100g:       food.prot_100,
      carbs_100g:      food.carbs_100,
      fat_100g:        food.fat_100,
      fiber_100g:      food.fibre_100,
      nutriscore_grade:food.nutri_score,
      nova_group:      food.nova_group,
      quality_grade:   grade,
      quality_score:   GRADE_SCORE[grade] || null,
    })
    setSaving(false)
    setSaved(true)
  }

  // Ajouter aux repas du jour
  function addToMeal() {
    navigate('/client/nutrition/ajouter', { state: { prefillFood: food } })
  }

  // Rescanner
  function rescan() {
    setSaved(false)
    setSaving(false)
    setFood(null)
    setGrade(null)
    setPhase('scan')
  }

  const gc = GRADE_COLOR[grade] || '#6b7280'

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.iconBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={S.headerTitle}>Scanner un article</span>
        {phase === 'result' ? (
          <button onClick={() => navigate('/client/nutrition/scans')} style={{ ...S.iconBtn, fontSize: '0.65rem', fontWeight: 700, color: '#e4f816', background: 'rgba(228,248,22,0.12)', width: 'auto', padding: '0 10px' }}>
            Historique
          </button>
        ) : (
          <div style={{ width: 32 }} />
        )}
      </div>

      {/* ── Phase : scan ───────────────────────────────────────── */}
      {phase === 'scan' && (
        <div style={{ position: 'relative', flex: 1 }}>
          {camError ? (
            <div style={S.centered}>
              <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📷</p>
              <p style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: '0.4rem' }}>Caméra inaccessible</p>
              <p style={{ color: '#6b7280', fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.5 }}>
                Autorise l'accès à la caméra dans les réglages de ton navigateur.
              </p>
              <button onClick={() => navigate(-1)} style={{ ...S.btnPrimary, marginTop: '1.5rem' }}>
                Retour
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                style={{ width: '100%', height: '100vh', objectFit: 'cover', display: 'block' }}
                autoPlay
                playsInline
                muted
              />
              {/* Viseur */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                {/* Fond sombre autour du viseur */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  maskImage: 'radial-gradient(ellipse 260px 180px at 50% 46%, transparent 99%, black 100%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 260px 180px at 50% 46%, transparent 99%, black 100%)',
                }} />
                {/* Cadre de visée */}
                <div style={{
                  width: 260, height: 180,
                  border: '2.5px solid #e4f816',
                  borderRadius: 18,
                  boxShadow: '0 0 0 4px rgba(228,248,22,0.15)',
                  position: 'relative',
                }}>
                  {/* Coins accentués */}
                  {[
                    { top: -2, left: -2, borderTop: '3px solid #e4f816', borderLeft: '3px solid #e4f816', borderRadius: '10px 0 0 0' },
                    { top: -2, right: -2, borderTop: '3px solid #e4f816', borderRight: '3px solid #e4f816', borderRadius: '0 10px 0 0' },
                    { bottom: -2, left: -2, borderBottom: '3px solid #e4f816', borderLeft: '3px solid #e4f816', borderRadius: '0 0 0 10px' },
                    { bottom: -2, right: -2, borderBottom: '3px solid #e4f816', borderRight: '3px solid #e4f816', borderRadius: '0 0 10px 0' },
                  ].map((st, i) => (
                    <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...st }} />
                  ))}
                  {/* Ligne de scan animée */}
                  <div style={{
                    position: 'absolute', left: 0, right: 0,
                    height: 2, background: '#e4f816',
                    opacity: 0.75,
                    animation: 'scanLine 2s ease-in-out infinite',
                    top: '50%',
                  }} />
                </div>
                <p style={{
                  color: 'white', fontSize: '0.82rem', fontWeight: 600,
                  marginTop: 20, textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                  background: 'rgba(0,0,0,0.4)', padding: '6px 16px',
                  borderRadius: 999,
                }}>
                  Place le code-barres dans le cadre
                </p>
              </div>
              <style>{`
                @keyframes scanLine {
                  0%   { top: 10%; }
                  50%  { top: 85%; }
                  100% { top: 10%; }
                }
              `}</style>
            </>
          )}
        </div>
      )}

      {/* ── Phase : loading ────────────────────────────────────── */}
      {phase === 'loading' && (
        <div style={S.centered}>
          <div style={S.spinner} />
          <p style={{ color: '#6b7280', fontWeight: 600, marginTop: '1rem' }}>Recherche du produit…</p>
        </div>
      )}

      {/* ── Phase : not found ─────────────────────────────────── */}
      {phase === 'notfound' && (
        <div style={S.centered}>
          <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔍</p>
          <p style={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a1a', marginBottom: '0.4rem' }}>
            Produit introuvable
          </p>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            Ce produit n'est pas encore dans la base Open Food Facts. Essaie la saisie manuelle.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: 280 }}>
            <button onClick={rescan} style={S.btnPrimary}>📷 Rescanner</button>
            <button onClick={addToMeal} style={S.btnSecondary}>✏️ Saisie manuelle</button>
          </div>
        </div>
      )}

      {/* ── Phase : error ─────────────────────────────────────── */}
      {phase === 'error' && (
        <div style={S.centered}>
          <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚠️</p>
          <p style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: '0.4rem' }}>Erreur réseau</p>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            Vérifie ta connexion et réessaie.
          </p>
          <button onClick={rescan} style={S.btnPrimary}>Réessayer</button>
        </div>
      )}

      {/* ── Phase : result ────────────────────────────────────── */}
      {phase === 'result' && food && (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: 110 }}>

          {/* Fiche produit */}
          <div style={S.card}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {/* Photo ou emoji */}
              <div style={{
                width: 64, height: 64, borderRadius: 14,
                background: '#f3f4f6', flexShrink: 0, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem',
              }}>
                {food.image_url
                  ? <img src={food.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '🛒'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a1a', margin: '0 0 2px', lineHeight: 1.25 }}>
                  {food.name}
                </p>
                {food.brand && (
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, margin: '0 0 8px' }}>
                    {food.brand}
                  </p>
                )}
                <p style={{ fontSize: '0.65rem', color: '#d1d5db', margin: 0 }}>Pour 100g</p>
              </div>
              {/* Grade badge */}
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: gc,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: 'white', fontSize: '1.3rem', fontWeight: 900,
              }}>
                {grade}
              </div>
            </div>

            {/* Macros chips */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              {food.kcal_100 != null && <Chip label={`${Math.round(food.kcal_100)} kcal`} bg="#e4f816" color="#1a1a1a" />}
              {food.prot_100 != null  && <Chip label={`P ${Math.round(food.prot_100)}g`}  bg="#3b82f6" color="white" />}
              {food.carbs_100 != null && <Chip label={`G ${Math.round(food.carbs_100)}g`} bg="#f59e0b" color="white" />}
              {food.fat_100 != null   && <Chip label={`L ${Math.round(food.fat_100)}g`}   bg="#ef4444" color="white" />}
              {food.fibre_100 != null && food.fibre_100 > 0 && <Chip label={`Fibres ${Math.round(food.fibre_100)}g`} bg="#e5e7eb" color="#374151" />}
            </div>

            {/* Barre de score */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151' }}>Score qualité</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: gc }}>
                  {GRADE_SCORE[grade]?.toFixed(1)}/10
                </span>
              </div>
              <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${(GRADE_SCORE[grade] || 5) * 10}%`,
                  background: gc, borderRadius: 999,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Tags */}
          {(tags.ok.length + tags.warn.length + tags.bad.length) > 0 && (
            <div style={S.card}>
              <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.6rem' }}>
                Points clés
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {tags.ok.map((t, i) => (
                  <div key={i} style={S.tagRow}>
                    <span style={{ ...S.tagDot, background: '#dcfce7', color: '#16a34a' }}>✓</span>
                    <span style={{ fontSize: '0.82rem', color: '#166534' }}>{t}</span>
                  </div>
                ))}
                {tags.warn.map((t, i) => (
                  <div key={i} style={S.tagRow}>
                    <span style={{ ...S.tagDot, background: '#fef3c7', color: '#92400e' }}>⚠</span>
                    <span style={{ fontSize: '0.82rem', color: '#78350f' }}>{t}</span>
                  </div>
                ))}
                {tags.bad.map((t, i) => (
                  <div key={i} style={S.tagRow}>
                    <span style={{ ...S.tagDot, background: '#fee2e2', color: '#991b1b' }}>✕</span>
                    <span style={{ fontSize: '0.82rem', color: '#991b1b' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NOVA */}
          {food.nova_group && (
            <div style={{ ...S.card, padding: '0.85rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: ['#dcfce7','#d1fae5','#fef9c3','#fee2e2'][food.nova_group - 1] || '#f3f4f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: '1rem',
                  color: ['#16a34a','#15803d','#ca8a04','#dc2626'][food.nova_group - 1] || '#6b7280',
                }}>
                  {food.nova_group}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1a1a1a', margin: '0 0 2px' }}>
                    NOVA {food.nova_group}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: 0 }}>
                    {['Aliments non transformés', 'Ingrédients culinaires', 'Aliments transformés', 'Produits ultra-transformés'][food.nova_group - 1] || ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Espacement bas pour les boutons */}
          <div style={{ height: 10 }} />
        </div>
      )}

      {/* ── Boutons bas (résultat) ─────────────────────────────── */}
      {phase === 'result' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'white', borderTop: '1px solid #f3f4f6',
          padding: '0.85rem 1rem calc(0.85rem + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', gap: '0.6rem',
          zIndex: 80,
        }}>
          <button onClick={addToMeal} style={S.btnPrimary}>
            ➕ Ajouter à mes repas
          </button>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              onClick={saveToHistory}
              disabled={saved || saving}
              style={{
                ...S.btnSecondary,
                flex: 1,
                opacity: saved ? 0.6 : 1,
              }}
            >
              {saving ? '…' : saved ? '✓ Sauvegardé' : '🗂 Sauvegarder'}
            </button>
            <button onClick={rescan} style={{ ...S.btnSecondary, flex: 1 }}>
              📷 Rescanner
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ label, bg, color }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 999,
      background: bg, color,
      fontSize: '0.7rem', fontWeight: 700,
    }}>
      {label}
    </span>
  )
}

const S = {
  page: {
    minHeight: '100vh', background: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    color: 'white', flexShrink: 0, zIndex: 60,
  },
  headerTitle: { fontSize: '1.05rem', fontWeight: 800 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 999,
    background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  centered: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '2rem 1.5rem', textAlign: 'center',
  },
  spinner: {
    width: 40, height: 40, borderRadius: '50%',
    border: '3px solid #f3f4f6',
    borderTopColor: '#e4f816',
    animation: 'spin 0.8s linear infinite',
  },
  card: {
    background: 'white', borderRadius: 16, padding: '1.1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  tagRow: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  tagDot: {
    width: 22, height: 22, borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
  },
  btnPrimary: {
    width: '100%', padding: '0.9rem', borderRadius: 14,
    border: 'none', background: '#1a1a1a', color: '#e4f816',
    fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
  },
  btnSecondary: {
    width: '100%', padding: '0.75rem', borderRadius: 14,
    border: '1.5px solid #e5e7eb', background: 'white', color: '#374151',
    fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
  },
}
