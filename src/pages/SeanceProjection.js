import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// ── Utilitaires couleur ────────────────────────────────────────────────────────
function hexToHSL(hex) {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16) / 255
    const g = parseInt(h.substring(2, 4), 16) / 255
    const b = parseInt(h.substring(4, 6), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let hue = 0, sat = 0
    const light = (max + min) / 2
    if (max !== min) {
      const d = max - min
      sat = light > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: hue = ((b - r) / d + 2) / 6; break
        default: hue = ((r - g) / d + 4) / 6
      }
    }
    return { h: hue * 360, s: sat * 100, l: light * 100 }
  } catch { return { h: 220, s: 70, l: 55 } }
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function isLightColor(hex) {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 140
  } catch { return false }
}

// Retourne une teinte très claire de la couleur (pour le fond des lignes)
function lightTint(hex, lightness = 94) {
  const { h, s } = hexToHSL(hex)
  // Saturation modérée pour que ça reste reconnaissable mais très lisible
  return hslToHex(h, Math.min(s * 0.55 + 30, 75), lightness)
}

// Retourne la couleur la plus claire entre deux
function lighterOf(hex1, hex2) {
  if (!hex2) return hex1
  const { l: l1 } = hexToHSL(hex1)
  const { l: l2 } = hexToHSL(hex2)
  return l1 >= l2 ? hex1 : hex2
}

// Retourne la couleur la plus sombre entre deux
function darkerOf(hex1, hex2) {
  if (!hex2) return hex1
  const { l: l1 } = hexToHSL(hex1)
  const { l: l2 } = hexToHSL(hex2)
  return l1 <= l2 ? hex1 : hex2
}

// Génère 8 nuances depuis la couleur la plus claire du club
// — varie uniquement luminosité/saturation, JAMAIS la teinte
function generateBlockPalette(lightColor, darkColor) {
  const { h: h1, s: s1, l: l1 } = hexToHSL(lightColor)
  // Saturation fixée à celle de la couleur claire (ou un minimum de 55)
  const baseS = Math.max(55, Math.min(90, s1))
  // Luminosité de base = celle de la couleur claire, ramenée entre 50 et 70
  const baseL = Math.max(50, Math.min(70, l1))

  // 8 nuances : on varie saturation et luminosité autour de la base, même teinte
  const shifts = [
    [  0,  0],   // A – identique
    [  8, -6],   // B – plus saturé, plus sombre
    [ -6,  8],   // C – moins saturé, plus clair
    [ 12,-10],   // D
    [ -4,  5],   // E
    [ 10, -4],   // F
    [ -8,  3],   // G
    [  6, -8],   // H
  ]

  // Si couleur secondaire disponible, alterner entre les deux teintes
  if (darkColor) {
    const { h: h2, s: s2, l: l2 } = hexToHSL(darkColor)
    const baseS2 = Math.max(30, Math.min(90, s2))
    const baseL2 = Math.max(40, Math.min(70, Math.max(l2, 45)))
    return shifts.map(([ds, dl], i) =>
      i % 2 === 0
        ? hslToHex(h1, baseS + ds, baseL + dl)
        : hslToHex(h2, baseS2 + ds, baseL2 + dl)
    )
  }

  return shifts.map(([ds, dl]) => hslToHex(h1, baseS + ds, baseL + dl))
}

// Palette par défaut (sans club)
const DEFAULT_PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#a78bfa',
  '#f43f5e','#06b6d4','#fb923c','#84cc16',
]

function makeBlockColor(palette, letter) {
  if (!letter) return '#6b7280'
  const idx = letter.toUpperCase().charCodeAt(0) - 65
  return palette[Math.max(0, idx) % palette.length]
}

export default function SeanceProjection() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [club, setClub] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const contentRef = useRef(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (loading) return
    function computeScale() {
      const el = contentRef.current
      if (!el) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const cw = el.scrollWidth
      const ch = el.scrollHeight
      const s = Math.min(vw / cw, vh / ch, 1)
      setScale(s)
    }
    computeScale()
    window.addEventListener('resize', computeScale)
    return () => window.removeEventListener('resize', computeScale)
  }, [loading, exercices, seance])

  async function load() {
    const [{ data: s }, { data: exs }] = await Promise.all([
      supabase.from('seances').select('*, programmes(id, nom, client_id, groupe_id, template_id)').eq('id', id).single(),
      supabase.from('exercices').select('*').eq('seance_id', id).order('ordre', { ascending: true }),
    ])
    setSeance(s)
    setExercices(exs || [])

    const groupeId = s?.programmes?.groupe_id
    const clientId = s?.programmes?.client_id

    if (groupeId) {
      const { data: g } = await supabase
        .from('groupes').select('nom, couleur, couleur_secondaire, logo_url').eq('id', groupeId).single()
      if (g) setClub({ nom: g.nom, couleur: g.couleur, couleur_secondaire: g.couleur_secondaire || null, logo_url: g.logo_url || null })
    } else if (clientId) {
      const { data: client } = await supabase
        .from('clients')
        .select('categorie_id, categories(id, nom, couleur, logo_url)')
        .eq('id', clientId)
        .maybeSingle()
      const cat = client?.categories
      if (cat) setClub({ nom: cat.nom, couleur: cat.couleur, logo_url: cat.logo_url || null })
    }

    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'sans-serif' }}>Chargement...</p>
    </div>
  )
  if (!seance) return null

  // ── Couleurs ──────────────────────────────────────────────────────────────────
  const PRIMARY   = club?.couleur            || '#FFD600'
  const SECONDARY = club?.couleur_secondaire || null

  // La couleur la plus claire sert de base pour les tableaux
  const LIGHT_COLOR = lighterOf(PRIMARY, SECONDARY)
  // La couleur la plus sombre sert de base pour le fond
  const DARK_COLOR  = SECONDARY ? darkerOf(PRIMARY, SECONDARY) : PRIMARY

  // Fond : dérivé de la couleur sombre, très désaturé
  const { h: darkH, s: darkS } = hexToHSL(DARK_COLOR)
  const BG_COLOR = hslToHex(darkH, Math.min(darkS * 0.15, 12), 12)

  // Barre de gradient en haut si 2 couleurs
  const TOP_BAR = SECONDARY
    ? `linear-gradient(90deg, ${PRIMARY}, ${SECONDARY})`
    : PRIMARY

  // Palette de blocs basée sur la couleur claire (+ foncée si dispo)
  const BLOCK_PALETTE = club ? generateBlockPalette(LIGHT_COLOR, SECONDARY ? DARK_COLOR : null) : DEFAULT_PALETTE

  const echauffement = seance.echauffement || []
  const hasWarmup = echauffement.length > 0

  // Grouper les exercices par lettre
  const groups = []
  exercices.forEach(ex => {
    const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
    const last = groups[groups.length - 1]
    if (letter && last?.letter === letter) last.items.push(ex)
    else groups.push({ letter, items: [ex] })
  })

  // Grouper l'échauffement
  const warmGroups = []
  echauffement.forEach(l => {
    const last = warmGroups[warmGroups.length - 1]
    if (l.groupe && last?.groupe === l.groupe) last.items.push(l)
    else warmGroups.push({ groupe: l.groupe, items: [l] })
  })

  const COLS = '100px 1fr 75px 110px 100px 100px 140px'

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: BG_COLOR }}>
      {/* Bande couleur en haut */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: TOP_BAR, zIndex: 10 }} />

      <div ref={contentRef} style={{
        width: '100vw',
        background: BG_COLOR,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '2rem 3rem',
        boxSizing: 'border-box',
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1.5rem', paddingBottom: '1.25rem',
          borderBottom: `3px solid ${LIGHT_COLOR}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div style={{
              width: 58, height: 58, borderRadius: 12,
              background: LIGHT_COLOR,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden',
            }}>
              <img
                src={club?.logo_url || '/logo192.png'}
                alt={club?.nom || 'AWprepa'}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: '800', color: LIGHT_COLOR, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 4 }}>
                {club?.nom || 'AWprepa'}{seance.programmes?.nom ? ` · ${seance.programmes.nom}` : ''}
              </div>
              <h1 style={{ fontSize: '2.4rem', fontWeight: '900', color: '#fff', margin: 0, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
                {seance.nom}
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            {seance.date && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 3 }}>
                  {seance.semaine ? `Semaine ${seance.semaine}` : ''}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: LIGHT_COLOR }}>
                  {new Date(seance.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              </div>
            )}
            <button onClick={() => navigate(-1)} style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.4)', borderRadius: 10, padding: '0.5rem 1rem',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', fontFamily: 'inherit',
            }}>✕</button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

          {/* ── Programme ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groups.map((g, gi) => {
                const blockColor = makeBlockColor(BLOCK_PALETTE, g.letter)
                const isSuperset = g.items.length > 1
                // Texte sur fond de couleur vive (col header)
                const headerTextColor = isLightColor(blockColor) ? '#111' : '#fff'

                return (
                  <div key={gi} style={{
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: `1px solid ${blockColor}30`,
                  }}>
                    {/* Barre fine en haut */}
                    <div style={{ height: 4, background: blockColor }} />

                    {/* Titre du bloc */}
                    <div style={{ background: '#1c1c1c', padding: '7px 16px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: '900', letterSpacing: '2px',
                        color: blockColor, textTransform: 'uppercase',
                      }}>
                        {isSuperset ? `Superset · ${g.letter}` : `${g.letter} — ${gi === 0 ? 'Principal' : 'Complément'}`}
                      </span>
                    </div>

                    {/* En-têtes colonnes — fond couleur vive */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: COLS, gap: '8px',
                      background: blockColor, padding: '6px 16px',
                    }}>
                      {['Code', 'Exercice', 'Séries', 'Répétitions', 'Tempo', 'Récup.', 'Intensité'].map((label, i) => (
                        <span key={label} style={{
                          fontSize: '8px', fontWeight: '800', letterSpacing: '1.5px',
                          color: headerTextColor + (i > 1 ? 'bb' : ''),
                          textTransform: 'uppercase',
                          textAlign: i > 1 ? 'center' : 'left',
                          opacity: i === 0 ? 0 : 1,  // cache "Code" visuellement (badge le remplace)
                        }}>{label}</span>
                      ))}
                    </div>

                    {/* Lignes exercices — fond clair */}
                    {g.items.map((ex, i) => {
                      const rowBg = lightTint(blockColor, 95 - i * 3)
                      return (
                        <div key={ex.id} style={{
                          display: 'grid', gridTemplateColumns: COLS, gap: '8px',
                          alignItems: 'center',
                          padding: '11px 16px',
                          background: rowBg,
                          borderBottom: i < g.items.length - 1 ? `1px solid ${blockColor}30` : 'none',
                        }}>
                          {/* Badge code */}
                          <div>
                            <span style={{
                              background: '#1a1a1a',
                              color: blockColor,
                              padding: '3px 10px',
                              borderRadius: 5,
                              fontSize: '11px', fontWeight: '900',
                              display: 'inline-block',
                              letterSpacing: '0.04em',
                            }}>{ex.code}</span>
                          </div>

                          {/* Nom */}
                          <span style={{ fontSize: '1.05rem', fontWeight: '700', color: '#111' }}>
                            {ex.nom}
                          </span>

                          {/* Séries */}
                          <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#111', textAlign: 'center' }}>
                            {ex.series ? `${ex.series}×` : <span style={{ color: '#aaa' }}>—</span>}
                          </span>

                          {/* Répétitions */}
                          <span style={{ fontSize: '1.1rem', fontWeight: '900', color: '#111', textAlign: 'center' }}>
                            {ex.repetitions || <span style={{ color: '#aaa' }}>—</span>}
                          </span>

                          {/* Tempo */}
                          <span style={{ fontSize: '0.95rem', fontWeight: '600', color: '#555', textAlign: 'center' }}>
                            {ex.tempo || <span style={{ color: '#bbb' }}>—</span>}
                          </span>

                          {/* Récupération */}
                          <span style={{ fontSize: '1.05rem', fontWeight: '800', color: '#222', textAlign: 'center' }}>
                            {ex.recuperation || <span style={{ color: '#bbb' }}>—</span>}
                          </span>

                          {/* Intensité */}
                          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#333', textAlign: 'center' }}>
                            {ex.type_intensite
                              ? `${ex.type_intensite}${ex.valeur_intensite ? ' · ' + ex.valeur_intensite : ''}`
                              : <span style={{ color: '#bbb' }}>—</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Échauffement (sidebar droite) ── */}
          {hasWarmup && (
            <div style={{ width: 270, flexShrink: 0 }}>
              <div style={{
                fontSize: '9px', fontWeight: '900', letterSpacing: '3px',
                color: LIGHT_COLOR, textTransform: 'uppercase',
                marginBottom: 14, paddingBottom: 8,
                borderBottom: `1px solid rgba(255,255,255,0.1)`,
              }}>Échauffement</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {warmGroups.map((wg, wgi) => {
                  if (!wg.groupe) {
                    return wg.items.map((l, i) => (
                      <div key={l.id || `${wgi}-${i}`} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px',
                        background: 'rgba(255,255,255,0.05)',
                        borderLeft: `3px solid ${LIGHT_COLOR}60`,
                        borderRadius: '0 8px 8px 0',
                      }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ddd' }}>{l.nom}</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: '900', color: LIGHT_COLOR }}>{l.reps}</span>
                      </div>
                    ))
                  }
                  const tours = wg.items[0]?.tours
                  return (
                    <div key={wgi} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${LIGHT_COLOR}20`,
                      borderLeft: `3px solid ${LIGHT_COLOR}`,
                      borderRadius: '0 8px 8px 0',
                      overflow: 'hidden',
                    }}>
                      {wg.items.map((l, i) => (
                        <div key={l.id || i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 14px',
                          borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#ddd' }}>{l.nom}</span>
                          <span style={{ fontSize: '0.95rem', fontWeight: '900', color: LIGHT_COLOR }}>{l.reps}</span>
                        </div>
                      ))}
                      {tours && (
                        <div style={{
                          background: LIGHT_COLOR + '15',
                          padding: '5px 14px',
                          borderTop: `1px solid ${LIGHT_COLOR}20`,
                        }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '900', color: LIGHT_COLOR }}>{tours} tours</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
