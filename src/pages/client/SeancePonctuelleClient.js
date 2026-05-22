import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']
function formatDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

export default function SeancePonctuelleClient() {
  const { id } = useParams()      // id = evenement.id
  const navigate = useNavigate()

  const [evenement,   setEvenement]   = useState(null)
  const [exercices,   setExercices]   = useState([])   // [{id, nom, ordre, series:[{id,num_serie,poids,reps}]}]
  const [loading,     setLoading]     = useState(true)
  const [newExNom,    setNewExNom]    = useState('')
  const [showAddEx,   setShowAddEx]   = useState(false)
  const [addingEx,    setAddingEx]    = useState(false)
  const [saved,       setSaved]       = useState(false)
  const saveTimer = useRef(null)

  useEffect(() => { fetchData() }, []) // eslint-disable-line

  async function fetchData() {
    // Charge l'événement
    const { data: ev } = await supabase
      .from('evenements').select('*').eq('id', id).single()
    if (!ev) { navigate(-1); return }
    setEvenement(ev)

    // Charge les exercices + séries
    const { data: exs } = await supabase
      .from('seances_libres_exercices')
      .select('*, seances_libres_series(*)')
      .eq('evenement_id', id)
      .order('ordre', { ascending: true })

    setExercices((exs || []).map(ex => ({
      ...ex,
      series: (ex.seances_libres_series || [])
        .sort((a, b) => a.num_serie - b.num_serie)
        .map(s => ({ ...s, poids: s.poids ?? '', reps: s.reps ?? '' })),
    })))
    setLoading(false)
  }

  // ── Flash "enregistré" ────────────────────────────────────────────────────
  function flashSaved() {
    setSaved(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(false), 1800)
  }

  // ── Exercices ─────────────────────────────────────────────────────────────
  async function ajouterExercice() {
    const nom = newExNom.trim()
    if (!nom) return
    setAddingEx(true)
    const ordre = exercices.length + 1

    // Récupère client_id depuis l'evenement
    const { data: ex, error } = await supabase
      .from('seances_libres_exercices')
      .insert([{ evenement_id: id, client_id: evenement.client_id, nom, ordre }])
      .select().single()

    if (!error && ex) {
      // Crée une première série vide
      const { data: s1 } = await supabase
        .from('seances_libres_series')
        .insert([{ exercice_id: ex.id, num_serie: 1, poids: null, reps: null }])
        .select().single()

      setExercices(prev => [...prev, {
        ...ex,
        series: s1 ? [{ ...s1, poids: '', reps: '' }] : [],
      }])
      setNewExNom('')
      setShowAddEx(false)
    }
    setAddingEx(false)
  }

  async function supprimerExercice(exId) {
    await supabase.from('seances_libres_exercices').delete().eq('id', exId)
    setExercices(prev => prev.filter(e => e.id !== exId))
  }

  // ── Séries ────────────────────────────────────────────────────────────────
  async function ajouterSerie(exId) {
    const ex = exercices.find(e => e.id === exId)
    if (!ex) return
    const num = (ex.series.length > 0 ? Math.max(...ex.series.map(s => s.num_serie)) : 0) + 1
    const { data: s } = await supabase
      .from('seances_libres_series')
      .insert([{ exercice_id: exId, num_serie: num, poids: null, reps: null }])
      .select().single()
    if (s) {
      setExercices(prev => prev.map(e =>
        e.id === exId ? { ...e, series: [...e.series, { ...s, poids: '', reps: '' }] } : e
      ))
    }
  }

  async function supprimerSerie(exId, serieId) {
    await supabase.from('seances_libres_series').delete().eq('id', serieId)
    setExercices(prev => prev.map(e =>
      e.id === exId
        ? { ...e, series: e.series.filter(s => s.id !== serieId) }
        : e
    ))
  }

  function updateSerie(exId, serieId, field, value) {
    setExercices(prev => prev.map(e =>
      e.id === exId
        ? { ...e, series: e.series.map(s => s.id === serieId ? { ...s, [field]: value } : s) }
        : e
    ))
  }

  async function saveSerie(exId, serieId) {
    const ex = exercices.find(e => e.id === exId)
    const serie = ex?.series.find(s => s.id === serieId)
    if (!serie) return
    const poids = serie.poids !== '' ? parseFloat(serie.poids) || null : null
    const reps  = serie.reps  !== '' ? parseInt(serie.reps)  || null : null
    await supabase.from('seances_libres_series')
      .update({ poids, reps })
      .eq('id', serieId)
    flashSaved()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#333', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {evenement?.titre}
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
            {formatDate(evenement?.date)}
          </p>
        </div>
        <div style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {saved && <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
        </div>
      </div>

      <div style={S.content}>
        {/* Notes générales */}
        {evenement?.description && (
          <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '0.6rem 0.875rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
            {evenement.description}
          </div>
        )}

        {/* Exercices */}
        {exercices.length === 0 && !showAddEx && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af', fontSize: '0.85rem' }}>
            Aucun exercice — ajoute le premier ci-dessous.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {exercices.map((ex, idx) => (
            <div key={ex.id} style={S.exCard}>
              {/* Titre exercice */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={S.exNum}>{idx + 1}</span>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>{ex.nom}</span>
                </div>
                <button onClick={() => supprimerExercice(ex.id)} style={S.deleteBtn} title="Supprimer">🗑</button>
              </div>

              {/* En-têtes colonnes */}
              <div style={S.serieHeader}>
                <span style={{ width: 26 }}>#</span>
                <span style={{ flex: 1 }}>Poids (kg)</span>
                <span style={{ flex: 1 }}>Reps</span>
                <span style={{ width: 28 }} />
              </div>

              {/* Séries */}
              {ex.series.map((serie) => (
                <div key={serie.id} style={S.serieRow}>
                  <span style={{ width: 26, fontSize: '0.78rem', color: '#9ca3af', fontWeight: 700 }}>{serie.num_serie}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="—"
                    value={serie.poids}
                    onChange={e => updateSerie(ex.id, serie.id, 'poids', e.target.value)}
                    onBlur={() => saveSerie(ex.id, serie.id)}
                    style={S.serieInput}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={serie.reps}
                    onChange={e => updateSerie(ex.id, serie.id, 'reps', e.target.value)}
                    onBlur={() => saveSerie(ex.id, serie.id)}
                    style={S.serieInput}
                  />
                  <button
                    onClick={() => supprimerSerie(ex.id, serie.id)}
                    style={{ width: 28, background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '0.9rem', padding: 0, textAlign: 'center' }}
                  >✕</button>
                </div>
              ))}

              {/* Bouton + Série */}
              <button onClick={() => ajouterSerie(ex.id)} style={S.addSerieBtn}>
                + Série
              </button>
            </div>
          ))}
        </div>

        {/* Ajouter un exercice */}
        <div style={{ marginTop: '1.25rem' }}>
          {!showAddEx ? (
            <button onClick={() => setShowAddEx(true)} style={S.addExBtn}>
              + Ajouter un exercice
            </button>
          ) : (
            <div style={S.addExForm}>
              <input
                type="text"
                placeholder="Nom de l'exercice (ex: Squat, Bench press…)"
                value={newExNom}
                onChange={e => setNewExNom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ajouterExercice()}
                style={S.input}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button
                  onClick={ajouterExercice}
                  disabled={!newExNom.trim() || addingEx}
                  style={{ ...S.submitBtn, opacity: (!newExNom.trim() || addingEx) ? 0.5 : 1 }}
                >{addingEx ? '…' : 'Ajouter'}</button>
                <button onClick={() => { setShowAddEx(false); setNewExNom('') }} style={S.cancelBtn}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Padding bas nav */}
        <div style={{ height: 100 }} />
      </div>
    </div>
  )
}

const S = {
  page:    { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:  { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 60 },
  backBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 },
  content: { padding: '1.25rem', maxWidth: 480, margin: '0 auto' },
  exCard:  { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  exNum:   { width: 24, height: 24, borderRadius: 6, background: '#333', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#d1d5db', padding: '2px 4px' },
  serieHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  serieRow:  { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' },
  serieInput: { flex: 1, padding: '0.5rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', color: '#333', outline: 'none', textAlign: 'center', background: '#fafafa', minWidth: 0 },
  addSerieBtn: { marginTop: '0.5rem', background: 'none', border: '1.5px dashed #e5e7eb', borderRadius: 8, padding: '0.4rem 0.875rem', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', cursor: 'pointer', width: '100%' },
  addExBtn: { background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.875rem 1rem', width: '100%', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box' },
  addExForm: { background: 'white', borderRadius: 14, padding: '1rem 1.25rem', border: '1.5px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.88rem', color: '#333', outline: 'none', background: '#fafafa' },
  submitBtn: { flex: 1, background: '#333333', color: 'var(--accent)', border: 'none', borderRadius: 9, padding: '0.65rem', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '0.65rem 1rem', fontWeight: 600, fontSize: '0.85rem', color: '#9ca3af', cursor: 'pointer' },
}
