import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase'

const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']
function formatDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}
function todayISO() { return new Date().toISOString().slice(0, 10) }

export default function SeancePonctuelleClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isNew = id === 'nouveau'

  // ── Mode création ─────────────────────────────────────────────────────────
  const clientId = location.state?.clientId || null

  const [newTitre,   setNewTitre]   = useState('')
  const [newDate,    setNewDate]    = useState(todayISO)
  const [newExs,     setNewExs]     = useState([])   // local before save
  const [saving,     setSaving]     = useState(false)

  // ── Mode lecture/remplissage ──────────────────────────────────────────────
  const [evenement,  setEvenement]  = useState(null)
  const [exercices,  setExercices]  = useState([])
  const [loading,    setLoading]    = useState(!isNew)
  const [saved,      setSaved]      = useState(false)
  const saveTimer   = useRef(null)

  // ── Recherche bibliothèque (partagé) ──────────────────────────────────────
  const [showAddEx,  setShowAddEx]  = useState(false)
  const [searchEx,   setSearchEx]   = useState('')
  const [bibResults, setBibResults] = useState([])
  const [addingEx,   setAddingEx]   = useState(false)
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!isNew) fetchData()
  }, [id]) // eslint-disable-line

  async function fetchData() {
    const { data: ev } = await supabase
      .from('evenements').select('*').eq('id', id).single()
    if (!ev) { navigate(-1); return }
    setEvenement(ev)

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

  function flashSaved() {
    setSaved(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaved(false), 1800)
  }

  // ── Recherche bibliothèque ────────────────────────────────────────────────
  const searchBiblio = useCallback((q) => {
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setBibResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('bibliotheque_exercices')
        .select('id, nom')
        .ilike('nom', `%${q}%`)
        .order('nom')
        .limit(8)
      setBibResults(data || [])
    }, 250)
  }, [])

  function handleSearchChange(e) {
    setSearchEx(e.target.value)
    searchBiblio(e.target.value)
  }

  function cancelSearch() { setShowAddEx(false); setSearchEx(''); setBibResults([]) }

  // ── CRÉATION : gestion locale des exos avant save ─────────────────────────
  function newAjouterExercice(nom) {
    nom = nom.trim()
    if (!nom) return
    const tmpId = `tmp_${Date.now()}`
    setNewExs(prev => [...prev, {
      tmpId,
      nom,
      ordre: prev.length + 1,
      series: [{ tmpId: `${tmpId}_s1`, num_serie: 1, poids: '', reps: '' }],
    }])
    cancelSearch()
  }

  function newSupprimerExercice(tmpId) {
    setNewExs(prev => prev.filter(e => e.tmpId !== tmpId)
      .map((e, i) => ({ ...e, ordre: i + 1 })))
  }

  function newAjouterSerie(exTmpId) {
    setNewExs(prev => prev.map(e => {
      if (e.tmpId !== exTmpId) return e
      const num = e.series.length > 0 ? Math.max(...e.series.map(s => s.num_serie)) + 1 : 1
      return { ...e, series: [...e.series, { tmpId: `tmp_s_${Date.now()}`, num_serie: num, poids: '', reps: '' }] }
    }))
  }

  function newSupprimerSerie(exTmpId, sTmpId) {
    setNewExs(prev => prev.map(e =>
      e.tmpId !== exTmpId ? e
        : { ...e, series: e.series.filter(s => s.tmpId !== sTmpId) }
    ))
  }

  function newUpdateSerie(exTmpId, sTmpId, field, value) {
    setNewExs(prev => prev.map(e =>
      e.tmpId !== exTmpId ? e
        : { ...e, series: e.series.map(s => s.tmpId === sTmpId ? { ...s, [field]: value } : s) }
    ))
  }

  async function creerSeance() {
    if (!newTitre.trim() || !clientId) return
    setSaving(true)

    const { data: ev } = await supabase.from('evenements').insert([{
      client_id: clientId,
      date: newDate,
      type: 'seance',
      titre: newTitre.trim(),
      source: 'client_ponctuelle',
    }]).select().single()

    if (!ev) { setSaving(false); return }

    for (const ex of newExs) {
      const { data: dbEx } = await supabase
        .from('seances_libres_exercices')
        .insert([{ evenement_id: ev.id, client_id: clientId, nom: ex.nom, ordre: ex.ordre }])
        .select().single()
      if (dbEx && ex.series.length > 0) {
        await supabase.from('seances_libres_series').insert(
          ex.series.map(s => ({
            exercice_id: dbEx.id,
            num_serie: s.num_serie,
            poids: s.poids !== '' ? parseFloat(s.poids) || null : null,
            reps:  s.reps  !== '' ? parseInt(s.reps)   || null : null,
          }))
        )
      }
    }

    setSaving(false)
    navigate(`/client/seance-ponctuelle/${ev.id}`, { replace: true })
  }

  // ── ÉDITION : gestion DB en temps réel ───────────────────────────────────
  async function ajouterExercice(nom) {
    nom = nom.trim()
    if (!nom) return
    setAddingEx(true)
    const ordre = exercices.length + 1
    const { data: ex } = await supabase
      .from('seances_libres_exercices')
      .insert([{ evenement_id: id, client_id: evenement.client_id, nom, ordre }])
      .select().single()
    if (ex) {
      const { data: s1 } = await supabase
        .from('seances_libres_series')
        .insert([{ exercice_id: ex.id, num_serie: 1, poids: null, reps: null }])
        .select().single()
      setExercices(prev => [...prev, { ...ex, series: s1 ? [{ ...s1, poids: '', reps: '' }] : [] }])
    }
    cancelSearch()
    setAddingEx(false)
  }

  async function supprimerExercice(exId) {
    await supabase.from('seances_libres_exercices').delete().eq('id', exId)
    setExercices(prev => prev.filter(e => e.id !== exId))
  }

  async function ajouterSerie(exId) {
    const ex = exercices.find(e => e.id === exId)
    if (!ex) return
    const num = ex.series.length > 0 ? Math.max(...ex.series.map(s => s.num_serie)) + 1 : 1
    const { data: s } = await supabase
      .from('seances_libres_series')
      .insert([{ exercice_id: exId, num_serie: num, poids: null, reps: null }])
      .select().single()
    if (s) setExercices(prev => prev.map(e =>
      e.id === exId ? { ...e, series: [...e.series, { ...s, poids: '', reps: '' }] } : e
    ))
  }

  async function supprimerSerie(exId, serieId) {
    await supabase.from('seances_libres_series').delete().eq('id', serieId)
    setExercices(prev => prev.map(e =>
      e.id === exId ? { ...e, series: e.series.filter(s => s.id !== serieId) } : e
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
    await supabase.from('seances_libres_series').update({
      poids: serie.poids !== '' ? parseFloat(serie.poids) || null : null,
      reps:  serie.reps  !== '' ? parseInt(serie.reps)   || null : null,
    }).eq('id', serieId)
    flashSaved()
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderExoCard(nom, idx, series,
    onDelEx, onDelSerie, onAddSerie,
    onUpdateSerie, onBlurSerie,
    exKey
  ) {
    return (
      <div key={exKey} style={S.exCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={S.exNum}>{idx + 1}</span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>{nom}</span>
          </div>
          <button onClick={onDelEx} style={S.deleteBtn} title="Supprimer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>

        <div style={S.serieHeader}>
          <span style={{ width: 26 }}>#</span>
          <span style={{ flex: 1 }}>Poids (kg)</span>
          <span style={{ flex: 1 }}>Reps</span>
          <span style={{ width: 28 }} />
        </div>

        {series.map(serie => {
          const sKey = serie.id || serie.tmpId
          const poidsVal = serie.poids ?? ''
          const repsVal  = serie.reps  ?? ''
          return (
            <div key={sKey} style={S.serieRow}>
              <span style={{ width: 26, fontSize: '0.78rem', color: '#9ca3af', fontWeight: 700 }}>{serie.num_serie}</span>
              <input
                type="number" inputMode="decimal" placeholder="—"
                value={poidsVal}
                onChange={e => onUpdateSerie(sKey, 'poids', e.target.value)}
                onBlur={() => onBlurSerie && onBlurSerie(sKey)}
                style={S.serieInput}
              />
              <input
                type="number" inputMode="numeric" placeholder="—"
                value={repsVal}
                onChange={e => onUpdateSerie(sKey, 'reps', e.target.value)}
                onBlur={() => onBlurSerie && onBlurSerie(sKey)}
                style={S.serieInput}
              />
              <button
                onClick={() => onDelSerie(sKey)}
                style={{ width: 28, background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '0.9rem', padding: 0, textAlign: 'center' }}
              >✕</button>
            </div>
          )
        })}

        <button onClick={onAddSerie} style={S.addSerieBtn}>+ Série</button>
      </div>
    )
  }

  function renderSearchBox(onAdd) {
    return (
      <div style={{ marginTop: '1.25rem' }}>
        {!showAddEx ? (
          <button onClick={() => setShowAddEx(true)} style={S.addExBtn}>
            + Ajouter un exercice
          </button>
        ) : (
          <div style={{ background: 'white', borderRadius: 14, padding: '1rem 1.25rem', border: '1.5px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <label style={S.miniLabel}>Bibliothèque ou nom personnalisé</label>
            <input
              type="text"
              placeholder="Squat, Développé couché…"
              value={searchEx}
              onChange={handleSearchChange}
              onKeyDown={e => e.key === 'Enter' && bibResults.length === 0 && searchEx.trim() && onAdd(searchEx)}
              style={S.input}
              autoFocus
            />
            {bibResults.length > 0 && (
              <div style={S.bibDropdown}>
                {bibResults.map(r => (
                  <button key={r.id} onClick={() => onAdd(r.nom)} style={S.bibItem}>{r.nom}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
              <button
                onClick={() => onAdd(searchEx)}
                disabled={!searchEx.trim() || addingEx}
                style={{ flex: 1, background: '#333', color: 'var(--accent-fg)', border: 'none', borderRadius: 9, padding: '0.65rem', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', opacity: (!searchEx.trim() || addingEx) ? 0.5 : 1 }}
              >
                {addingEx ? '…' : bibResults.length > 0 ? 'Ajouter (personnalisé)' : 'Ajouter'}
              </button>
              <button onClick={cancelSearch} style={S.cancelBtn}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Spinners ──────────────────────────────────────────────────────────────
  if (!isNew && loading) return (
    <div style={{ minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={S.spinner} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── RENDER : Mode création ────────────────────────────────────────────────
  if (isNew) return (
    <div style={S.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: '1rem', color: 'white' }}>
          Nouvelle séance
        </span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        {/* Nom + date */}
        <div style={{ background: 'white', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={S.miniLabel}>Nom de la séance</label>
            <input
              type="text"
              placeholder="ex: Full body, Haut du corps…"
              value={newTitre}
              onChange={e => setNewTitre(e.target.value)}
              style={S.input}
              autoFocus
            />
          </div>
          <div>
            <label style={S.miniLabel}>Date</label>
            <div style={{ overflow: 'hidden', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fafafa' }}>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: 'none', outline: 'none', fontSize: '0.88rem', color: '#333', background: 'transparent' }}
              />
            </div>
          </div>
        </div>

        {/* Exercices locaux */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {newExs.map((ex, idx) =>
            renderExoCard(
              ex.nom, idx, ex.series,
              () => newSupprimerExercice(ex.tmpId),
              (sTmpId) => newSupprimerSerie(ex.tmpId, sTmpId),
              () => newAjouterSerie(ex.tmpId),
              (sTmpId, field, val) => newUpdateSerie(ex.tmpId, sTmpId, field, val),
              null, // pas de save sur blur en mode création
              ex.tmpId,
            )
          )}
        </div>

        {/* Recherche + ajout exo */}
        {renderSearchBox(newAjouterExercice)}

        {/* Bouton créer */}
        <button
          onClick={creerSeance}
          disabled={!newTitre.trim() || !clientId || saving}
          style={{ ...S.createBtn, opacity: (!newTitre.trim() || !clientId || saving) ? 0.5 : 1 }}
        >
          {saving ? '…' : 'Créer la séance'}
        </button>

        <div style={{ height: 100 }} />
      </div>
    </div>
  )

  // ── RENDER : Mode remplissage (événement existant) ────────────────────────
  return (
    <div style={S.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

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
          {saved && <span style={{ fontSize: '0.65rem', color: 'var(--accent-fg)', fontWeight: 700 }}>✓</span>}
        </div>
      </div>

      <div style={S.content}>
        {evenement?.description && (
          <div style={{ background: '#f3f4f6', borderRadius: 10, padding: '0.6rem 0.875rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
            {evenement.description}
          </div>
        )}

        {exercices.length === 0 && !showAddEx && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#9ca3af', fontSize: '0.85rem' }}>
            Aucun exercice — ajoute le premier ci-dessous.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {exercices.map((ex, idx) =>
            renderExoCard(
              ex.nom, idx, ex.series,
              () => supprimerExercice(ex.id),
              (serieId) => supprimerSerie(ex.id, serieId),
              () => ajouterSerie(ex.id),
              (serieId, field, val) => updateSerie(ex.id, serieId, field, val),
              (serieId) => saveSerie(ex.id, serieId),
              ex.id,
            )
          )}
        </div>

        {renderSearchBox(ajouterExercice)}
        <div style={{ height: 100 }} />
      </div>
    </div>
  )
}

const S = {
  page:    { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:  { background: 'var(--header-bg)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 60 },
  backBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 },
  content: { padding: '1.25rem', maxWidth: 480, margin: '0 auto' },
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#333', animation: 'spin .7s linear infinite' },
  exCard:  { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  exNum:   { width: 24, height: 24, borderRadius: 6, background: '#333', color: 'var(--accent-fg)', fontSize: '0.72rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  serieHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  serieRow:    { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' },
  serieInput:  { flex: 1, padding: '0.5rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', color: '#333', outline: 'none', textAlign: 'center', background: '#fafafa', minWidth: 0 },
  addSerieBtn: { marginTop: '0.5rem', background: 'none', border: '1.5px dashed #e5e7eb', borderRadius: 8, padding: '0.4rem 0.875rem', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', cursor: 'pointer', width: '100%' },
  addExBtn:    { background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.875rem 1rem', width: '100%', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box' },
  input:       { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.88rem', color: '#333', outline: 'none', background: '#fafafa' },
  miniLabel:   { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' },
  cancelBtn:   { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '0.65rem 1rem', fontWeight: 600, fontSize: '0.85rem', color: '#9ca3af', cursor: 'pointer' },
  bibDropdown: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', marginTop: '0.4rem', overflow: 'hidden' },
  bibItem:     { display: 'block', width: '100%', textAlign: 'left', padding: '0.65rem 0.875rem', border: 'none', borderBottom: '1px solid #f3f4f6', background: 'white', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' },
  createBtn:   { display: 'block', width: '100%', boxSizing: 'border-box', background: '#1a1a1a', color: 'var(--accent-fg)', border: 'none', borderRadius: 12, padding: '0.95rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', marginTop: '1.5rem', textAlign: 'center' },
}
