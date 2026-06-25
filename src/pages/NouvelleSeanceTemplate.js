import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function newEx(ordre) {
  return { _id: Math.random().toString(36).slice(2), code: '', nom: '', series: '', repetitions: '', tempo: '', recuperation: '', ordre, bibliotheque_id: null }
}

export default function NouvelleSeanceTemplate() {
  const navigate = useNavigate()
  const [nom, setNom] = useState('')
  const [dossier, setDossier] = useState('')
  const [dossiers, setDossiers] = useState([])
  const [exercices, setExercices] = useState([newEx(1)])
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(null)

  // Bibliothèque pour l'autocomplétion
  const [biblio, setBiblio] = useState([])
  const [suggestions, setSuggestions] = useState({}) // { _id: [{ id, nom }] }
  const [openSug, setOpenSug] = useState(null) // _id ouvert
  const sugRefs = useRef({})

  useEffect(() => {
    supabase.from('seance_templates').select('dossier').then(({ data }) => {
      const ds = [...new Set((data || []).map(t => t.dossier).filter(Boolean))].sort()
      setDossiers(ds)
    })
    supabase.from('bibliotheque_exercices').select('id, nom').order('nom').then(({ data }) => {
      setBiblio(data || [])
    })
  }, [])

  // Fermer suggestions si clic dehors
  useEffect(() => {
    function handler(e) {
      if (openSug && !sugRefs.current[openSug]?.contains(e.target)) setOpenSug(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openSug])

  function updateEx(id, field, value) {
    setExercices(prev => prev.map(ex => ex._id === id ? { ...ex, [field]: value } : ex))
    if (field === 'nom') {
      const q = value.trim().toLowerCase()
      if (q.length >= 2) {
        const matches = biblio.filter(b => b.nom.toLowerCase().includes(q)).slice(0, 6)
        setSuggestions(prev => ({ ...prev, [id]: matches }))
        setOpenSug(id)
      } else {
        setOpenSug(null)
      }
    }
  }

  function pickSuggestion(exId, bibItem) {
    setExercices(prev => prev.map(ex => ex._id === exId ? { ...ex, nom: bibItem.nom, bibliotheque_id: bibItem.id } : ex))
    setOpenSug(null)
  }

  function addEx() {
    setExercices(prev => [...prev, newEx(prev.length + 1)])
  }

  function removeEx(id) {
    setExercices(prev => {
      const next = prev.filter(ex => ex._id !== id)
      return next.map((ex, i) => ({ ...ex, ordre: i + 1 }))
    })
  }

  async function handleSave() {
    if (!nom.trim()) return
    setSaving(true)
    const exos = exercices
      .filter(ex => ex.nom.trim())
      .map(({ _id, ...ex }, i) => ({ ...ex, ordre: i + 1 }))
    const { data: t } = await supabase.from('seance_templates')
      .insert([{ nom: nom.trim(), exercices: exos, dossier: dossier.trim() || null }])
      .select().single()
    setSaving(false)
    if (t) { setSavedId(t.id); setTimeout(() => navigate('/bibliotheque?tab=modeles'), 800) }
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/bibliotheque?tab=modeles')} style={S.backBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Bibliothèque
        </button>
        <button
          onClick={handleSave}
          disabled={!nom.trim() || saving || !!savedId}
          style={{ ...S.saveBtn, opacity: !nom.trim() ? 0.4 : 1 }}
        >
          {savedId ? '✓ Enregistré' : saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div style={S.body}>
        <h1 style={S.title}>Nouvelle séance</h1>

        {/* Nom */}
        <div style={S.fieldGroup}>
          <label style={S.label}>Nom de la séance</label>
          <input
            autoFocus
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder="Ex : Haut du corps A, Jambes force..."
            style={S.inputLarge}
          />
        </div>

        {/* Dossier */}
        <div style={S.fieldGroup}>
          <label style={S.label}>Dossier <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optionnel)</span></label>
          {dossiers.length > 0 ? (
            <select value={dossier} onChange={e => setDossier(e.target.value)} style={S.select}>
              <option value="">— Sans dossier —</option>
              {dossiers.map(d => <option key={d} value={d}>{d}</option>)}
              <option value="__new__">+ Nouveau dossier...</option>
            </select>
          ) : null}
          {(dossier === '__new__' || dossiers.length === 0) && (
            <input
              value={dossier === '__new__' ? '' : dossier}
              onChange={e => setDossier(e.target.value)}
              placeholder="Nom du dossier..."
              style={{ ...S.input, marginTop: dossiers.length > 0 ? '0.4rem' : 0 }}
            />
          )}
        </div>

        {/* Exercices */}
        <div style={S.fieldGroup}>
          <label style={S.label}>Exercices</label>

          {/* Colonnes header */}
          <div style={S.colHeader}>
            <span style={{ width: 52 }}>Code</span>
            <span style={{ flex: 1 }}>Exercice</span>
            <span style={{ width: 52, textAlign: 'center' }}>Sér.</span>
            <span style={{ width: 52, textAlign: 'center' }}>Reps</span>
            <span style={{ width: 52, textAlign: 'center' }}>Tempo</span>
            <span style={{ width: 60, textAlign: 'center' }}>Récup</span>
            <span style={{ width: 24 }}/>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {exercices.map((ex, i) => (
              <div key={ex._id} style={S.exCard}>
                {/* Ligne principale */}
                <div style={S.exRow}>
                  <input
                    value={ex.code}
                    onChange={e => updateEx(ex._id, 'code', e.target.value)}
                    placeholder={`A${i + 1}`}
                    style={S.codeInput}
                  />
                  {/* Nom avec autocomplétion */}
                  <div style={{ flex: 1, position: 'relative' }} ref={el => { sugRefs.current[ex._id] = el }}>
                    <input
                      value={ex.nom}
                      onChange={e => updateEx(ex._id, 'nom', e.target.value)}
                      onFocus={() => {
                        if (ex.nom.trim().length >= 2 && suggestions[ex._id]?.length) setOpenSug(ex._id)
                      }}
                      placeholder="Nom de l'exercice"
                      style={{ ...S.input, width: '100%' }}
                    />
                    {openSug === ex._id && suggestions[ex._id]?.length > 0 && (
                      <div style={S.sugBox}>
                        {suggestions[ex._id].map(s => (
                          <div key={s.id} style={S.sugItem} onMouseDown={() => pickSuggestion(ex._id, s)}>
                            {s.nom}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input value={ex.series} onChange={e => updateEx(ex._id, 'series', e.target.value)}
                    placeholder="3" style={{ ...S.input, width: 52, textAlign: 'center' }} />
                  <input value={ex.repetitions} onChange={e => updateEx(ex._id, 'repetitions', e.target.value)}
                    placeholder="8" style={{ ...S.input, width: 52, textAlign: 'center' }} />
                  <input value={ex.tempo} onChange={e => updateEx(ex._id, 'tempo', e.target.value)}
                    placeholder="2/0/2" style={{ ...S.input, width: 52, textAlign: 'center' }} />
                  <input value={ex.recuperation} onChange={e => updateEx(ex._id, 'recuperation', e.target.value)}
                    placeholder="90s" style={{ ...S.input, width: 60, textAlign: 'center' }} />
                  <button onClick={() => removeEx(ex._id)}
                    style={S.removeBtn} disabled={exercices.length === 1}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                {/* Badge biblio si lié */}
                {ex.bibliotheque_id && (
                  <div style={S.biblioBadge}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Lié à la bibliothèque
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={addEx} style={S.addExBtn}>
            + Ajouter un exercice
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  page:       { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', background: '#f8f9fa' },
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.5rem', background: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 },
  backBtn:    { display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontWeight: '600', fontSize: '0.875rem', padding: '0.3rem 0' },
  saveBtn:    { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.6rem 1.25rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', transition: 'opacity 0.15s' },
  body:       { maxWidth: 780, margin: '0 auto', padding: '2rem 1.5rem' },
  title:      { fontSize: '1.5rem', fontWeight: '800', color: '#111827', margin: '0 0 1.75rem' },
  fieldGroup: { marginBottom: '1.5rem' },
  label:      { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' },
  inputLarge: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '1rem', fontWeight: '600', color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' },
  input:      { padding: '0.5rem 0.6rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.83rem', color: '#111827', outline: 'none', boxSizing: 'border-box' },
  select:     { width: '100%', padding: '0.55rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.875rem', color: '#374151', background: 'white', outline: 'none', boxSizing: 'border-box' },
  colHeader:  { display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0 0 0.35rem', fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  exCard:     { background: 'white', borderRadius: 10, border: '1.5px solid #e5e7eb', padding: '0.6rem 0.75rem' },
  exRow:      { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  codeInput:  { width: 52, padding: '0.5rem 0.4rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: '700', color: '#333', textAlign: 'center', outline: 'none', boxSizing: 'border-box', background: '#f9fafb' },
  removeBtn:  { background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '0.25rem', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 6, transition: 'color 0.15s' },
  addExBtn:   { marginTop: '0.75rem', width: '100%', background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 10, padding: '0.65rem', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s' },
  biblioBadge:{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.35rem', background: '#eff6ff', color: '#3b82f6', fontSize: '0.65rem', fontWeight: '700', padding: '2px 7px', borderRadius: 999 },
  sugBox:     { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 2, overflow: 'hidden' },
  sugItem:    { padding: '0.55rem 0.875rem', fontSize: '0.85rem', color: '#374151', fontWeight: '500', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' },
}
