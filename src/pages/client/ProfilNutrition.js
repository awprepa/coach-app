import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'

const REGIMES = [
  { key: 'omnivore',    label: 'Omnivore' },
  { key: 'vegetarien',  label: 'Végétarien' },
  { key: 'vegan',       label: 'Végan' },
  { key: 'sans_gluten', label: 'Sans gluten' },
  { key: 'autre',       label: 'Autre' },
]

const ALLERGENES_LIST = [
  'Gluten',
  'Lait',
  'Œufs',
  'Fruits à coque',
  'Soja',
  'Arachides',
  'Poisson',
  'Crustacés',
  'Fruits de mer',
]

export default function ProfilNutrition() {
  const navigate = useNavigate()

  const [client,       setClient]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState(null)

  // Champs du formulaire
  const [regime,       setRegime]       = useState(null)
  const [allergenes,   setAllergenes]   = useState([])
  const [intolerances, setIntolerances] = useState([])
  const [exclusions,   setExclusions]   = useState([])
  const [notes,        setNotes]        = useState('')

  // Input temporaire pour les exclusions
  const [exclusionInput, setExclusionInput] = useState('')

  // ── Chargement ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) { setLoading(false); return }

      const { data: c } = await supabase
        .from('clients')
        .select('id, prenom')
        .eq('user_id', userId)
        .maybeSingle()
      if (!c) { setLoading(false); return }
      setClient(c)

      const { data: profil } = await supabase
        .from('nutrition_profile')
        .select('*')
        .eq('client_id', c.id)
        .maybeSingle()

      if (profil) {
        setRegime(profil.regime || null)
        setAllergenes(profil.allergenes || [])
        setIntolerances(profil.intolerances || [])
        setExclusions(profil.exclusions || [])
        setNotes(profil.notes || '')
      }

      setLoading(false)
    }
    load()
  }, [])

  // ── Helpers checkboxes ───────────────────────────────────────────────────────
  function toggleItem(list, setList, item) {
    setList(prev =>
      prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
    )
  }

  // ── Exclusions libres ────────────────────────────────────────────────────────
  function addExclusion() {
    const val = exclusionInput.trim()
    if (!val) return
    if (!exclusions.includes(val)) {
      setExclusions(prev => [...prev, val])
    }
    setExclusionInput('')
  }

  function removeExclusion(item) {
    setExclusions(prev => prev.filter(x => x !== item))
  }

  // ── Sauvegarde ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!client) return
    setSaving(true)
    setError(null)

    const { error: err } = await supabase
      .from('nutrition_profile')
      .upsert({
        client_id:    client.id,
        regime:       regime || null,
        allergenes,
        intolerances,
        exclusions,
        notes,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'client_id' })

    setSaving(false)
    if (err) {
      setError('Erreur lors de la sauvegarde. Réessaie.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button onClick={() => navigate(-1)} style={S.backBtn}>←</button>
          <span style={S.headerTitle}>Mon profil alimentaire</span>
        </div>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
          Chargement…
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>←</button>
        <span style={S.headerTitle}>Mon profil alimentaire</span>
      </div>

      {/* ── Contenu scrollable ── */}
      <div style={S.scrollArea}>

        {/* Régime */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>🥗 Régime alimentaire</h2>
          <div style={S.pillRow}>
            {REGIMES.map(r => (
              <button
                key={r.key}
                onClick={() => setRegime(regime === r.key ? null : r.key)}
                style={{
                  ...S.pill,
                  background: regime === r.key ? '#1a1a1a' : '#f3f4f6',
                  color:      regime === r.key ? '#e4f816' : '#374151',
                  borderColor: regime === r.key ? '#1a1a1a' : '#e5e7eb',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Allergènes */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>⚠️ Allergènes</h2>
          <p style={S.cardSub}>Allergies avérées (réaction immunitaire)</p>
          <div style={S.checkGrid}>
            {ALLERGENES_LIST.map(item => {
              const checked = allergenes.includes(item)
              return (
                <label key={item} style={S.checkRow}>
                  <div
                    style={{ ...S.checkbox, ...(checked ? S.checkboxChecked : {}) }}
                    onClick={() => toggleItem(allergenes, setAllergenes, item)}
                  >
                    {checked && <span style={S.checkmark}>✓</span>}
                  </div>
                  <span
                    style={{ ...S.checkLabel, ...(checked ? S.checkLabelActive : {}) }}
                    onClick={() => toggleItem(allergenes, setAllergenes, item)}
                  >
                    {item}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Intolérances */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>🚫 Intolérances</h2>
          <p style={S.cardSub}>Difficultés digestives sans réaction immunitaire</p>
          <div style={S.checkGrid}>
            {ALLERGENES_LIST.map(item => {
              const checked = intolerances.includes(item)
              return (
                <label key={item} style={S.checkRow}>
                  <div
                    style={{ ...S.checkbox, ...(checked ? S.checkboxChecked : {}) }}
                    onClick={() => toggleItem(intolerances, setIntolerances, item)}
                  >
                    {checked && <span style={S.checkmark}>✓</span>}
                  </div>
                  <span
                    style={{ ...S.checkLabel, ...(checked ? S.checkLabelActive : {}) }}
                    onClick={() => toggleItem(intolerances, setIntolerances, item)}
                  >
                    {item}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Aliments à éviter */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>🙅 Aliments à éviter</h2>
          <p style={S.cardSub}>Par préférence personnelle (pas une allergie)</p>

          {/* Chips existantes */}
          {exclusions.length > 0 && (
            <div style={S.chipsRow}>
              {exclusions.map(item => (
                <div key={item} style={S.chip}>
                  <span style={S.chipText}>{item}</span>
                  <button
                    onClick={() => removeExclusion(item)}
                    style={S.chipRemove}
                    aria-label={`Supprimer ${item}`}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Input ajout */}
          <div style={S.addRow}>
            <input
              value={exclusionInput}
              onChange={e => setExclusionInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExclusion()}
              placeholder="Ex : ananas, coriandre…"
              style={S.input}
            />
            <button
              onClick={addExclusion}
              disabled={!exclusionInput.trim()}
              style={{
                ...S.addBtn,
                opacity: exclusionInput.trim() ? 1 : 0.4,
              }}
            >
              Ajouter
            </button>
          </div>
        </div>

        {/* Notes libres */}
        <div style={S.card}>
          <h2 style={S.cardTitle}>📝 Notes libres</h2>
          <p style={S.cardSub}>Infos supplémentaires pour ton coach</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ex : je mange 4 fois par jour, je prépare mes repas le dimanche…"
            rows={4}
            style={S.textarea}
          />
        </div>

        {/* Message d'erreur */}
        {error && (
          <div style={S.errorBanner}>{error}</div>
        )}

        {/* Espace pour le bouton fixe + nav */}
        <div style={{ height: 140 }} />
      </div>

      {/* ── Bouton Sauvegarder fixe ── */}
      <div style={S.saveBar}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...S.saveBtn,
            background: saved ? '#22c55e' : '#e4f816',
            color:       saved ? 'white'   : '#1a1a1a',
          }}
        >
          {saving ? 'Sauvegarde…' : saved ? '✓ Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      <ClientBottomNav />
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100dvh',
    background: '#fafafa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
    padding: '52px 20px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: 'none',
    borderRadius: 10,
    color: 'white',
    fontSize: '1.2rem',
    fontWeight: 600,
    width: 38,
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  headerTitle: {
    color: 'white',
    fontSize: '1.1rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  card: {
    background: 'white',
    borderRadius: 16,
    padding: '18px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0 0 4px',
  },
  cardSub: {
    fontSize: '0.78rem',
    color: '#9ca3af',
    margin: '0 0 14px',
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  pill: {
    padding: '8px 16px',
    borderRadius: 999,
    border: '1.5px solid',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    lineHeight: 1.2,
  },
  checkGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer',
    userSelect: 'none',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: '2px solid #e5e7eb',
    background: '#f9fafb',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  checkboxChecked: {
    background: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  checkmark: {
    color: '#e4f816',
    fontSize: '0.75rem',
    fontWeight: 800,
    lineHeight: 1,
  },
  checkLabel: {
    fontSize: '0.9rem',
    color: '#6b7280',
    fontWeight: 500,
    cursor: 'pointer',
  },
  checkLabelActive: {
    color: '#1a1a1a',
    fontWeight: 600,
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#f3f4f6',
    borderRadius: 999,
    padding: '6px 10px 6px 14px',
    border: '1.5px solid #e5e7eb',
  },
  chipText: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#374151',
  },
  chipRemove: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '1.1rem',
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 2px',
    display: 'flex',
    alignItems: 'center',
  },
  addRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  input: {
    flex: 1,
    border: '1.5px solid #e5e7eb',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: '0.9rem',
    color: '#1a1a1a',
    background: '#f9fafb',
    outline: 'none',
  },
  addBtn: {
    background: '#1a1a1a',
    color: '#e4f816',
    border: 'none',
    borderRadius: 10,
    padding: '10px 16px',
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  textarea: {
    width: '100%',
    border: '1.5px solid #e5e7eb',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: '0.9rem',
    color: '#1a1a1a',
    background: '#f9fafb',
    resize: 'vertical',
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#dc2626',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  saveBar: {
    position: 'fixed',
    bottom: 'calc(env(safe-area-inset-bottom) + 16px + 68px)',
    left: 0,
    right: 0,
    padding: '0 16px',
    zIndex: 80,
    pointerEvents: 'none',
  },
  saveBtn: {
    display: 'block',
    width: '100%',
    padding: '16px',
    borderRadius: 14,
    border: 'none',
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    transition: 'background 0.25s, color 0.25s',
    pointerEvents: 'auto',
  },
}
