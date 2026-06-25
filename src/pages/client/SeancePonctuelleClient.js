import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase'

const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']
function formatDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}
function todayISO() { return new Date().toISOString().slice(0, 10) }
// Normalise pour une recherche insensible aux accents et à la casse
function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── Formulaire d'ajout d'exercice (nom autocomplété + séries + reps) ─────────
function AddExerciceForm({ onAdd, adding, biblio }) {
  const [nom,    setNom]    = useState('')
  const [series, setSeries] = useState('3')
  const [reps,   setReps]   = useState('10')
  const [open,   setOpen]   = useState(false)

  // Filtrage local sur la bibliothèque déjà chargée (instantané, sans requête,
  // insensible aux accents : "de" trouve "Développé couché")
  const q = normalize(nom.trim())
  const sugg = q
    ? biblio.filter(b => normalize(b.nom).includes(q)).slice(0, 8)
    : []
  // On masque la liste si le nom tapé correspond déjà exactement à un exo choisi
  const showSugg = open && sugg.length > 0 && !(sugg.length === 1 && normalize(sugg[0].nom) === q)

  function submit() {
    if (!nom.trim()) return
    onAdd({
      nom: nom.trim(),
      series: Math.max(1, parseInt(series) || 1),
      reps: reps !== '' ? (parseInt(reps) || null) : null,
    })
    setNom(''); setSeries('3'); setReps('10'); setOpen(false)
  }

  return (
    <div style={S.addCard}>
      <label style={S.miniLabel}>Exercice</label>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Nom de l'exercice"
          value={nom}
          onChange={e => { setNom(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          style={S.input}
        />
        {showSugg && (
          <div style={S.bibDropdown}>
            {sugg.map(r => (
              <div
                key={r.id}
                onMouseDown={e => { e.preventDefault(); setNom(r.nom); setOpen(false) }}
                style={S.bibItem}
              >
                {r.nom}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.65rem' }}>
        <div style={{ flex: 1 }}>
          <label style={S.miniLabel}>Séries</label>
          <input type="number" inputMode="numeric" min="1" value={series}
            onChange={e => setSeries(e.target.value)} style={{ ...S.input, textAlign: 'center' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.miniLabel}>Répétitions</label>
          <input type="number" inputMode="numeric" placeholder="—" value={reps}
            onChange={e => setReps(e.target.value)} style={{ ...S.input, textAlign: 'center' }} />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!nom.trim() || adding}
        style={{ ...S.addExBtn, opacity: (!nom.trim() || adding) ? 0.5 : 1, marginTop: '0.75rem' }}
      >
        {adding ? '…' : '+ Ajouter à la séance'}
      </button>
    </div>
  )
}

export default function SeancePonctuelleClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isNew = id === 'nouveau'

  // clientId : depuis l'état de navigation, sinon résolu via la session
  const [clientId, setClientId] = useState(location.state?.clientId || null)

  // Création
  const [newTitre, setNewTitre] = useState('')
  const [newDate,  setNewDate]  = useState(todayISO)
  const [newExs,   setNewExs]   = useState([])  // [{tmpId, nom, series, reps}]
  const [saving,   setSaving]   = useState(false)

  // Remplissage
  const [evenement, setEvenement] = useState(null)
  const [exercices, setExercices] = useState([])
  const [loading,   setLoading]   = useState(!isNew)
  const [saved,     setSaved]     = useState(false)
  const [addingEx,  setAddingEx]  = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const saveTimer = useRef(null)

  // Bibliothèque chargée une seule fois (filtrage local dans AddExerciceForm)
  const [biblio, setBiblio] = useState([])
  useEffect(() => {
    supabase.from('bibliotheque_exercices').select('id, nom').order('nom')
      .then(({ data }) => setBiblio(data || []))
  }, [])

  useEffect(() => { if (!isNew) fetchData() }, [id]) // eslint-disable-line

  // Résout le client courant si l'état de navigation a été perdu (refresh, etc.)
  useEffect(() => {
    if (!isNew || clientId) return
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      let { data: cl } = await supabase.from('clients').select('id').eq('user_id', session.user.id).maybeSingle()
      if (!cl) {
        const r = await supabase.from('clients').select('id').eq('email', session.user.email).maybeSingle()
        cl = r.data
      }
      if (cl) setClientId(cl.id)
    })()
  }, [isNew]) // eslint-disable-line

  async function fetchData() {
    const { data: ev } = await supabase.from('evenements').select('*').eq('id', id).single()
    if (!ev) { navigate(-1); return }
    setEvenement(ev)
    const { data: exs } = await supabase
      .from('seances_libres_exercices')
      .select('*, seances_libres_series(*)')
      .eq('evenement_id', id)
      .order('ordre', { ascending: true })
    const exsList = exs || []
    // Charger les images depuis la bibliothèque (lookup par nom)
    const noms = exsList.map(e => e.nom).filter(Boolean)
    let imageMap = {}
    if (noms.length > 0) {
      const { data: bibItems } = await supabase
        .from('bibliotheque_exercices')
        .select('nom, image_url')
        .in('nom', noms)
      bibItems?.forEach(b => { if (b.image_url) imageMap[b.nom] = b.image_url })
    }
    setExercices(exsList.map(ex => ({
      ...ex,
      image_url: imageMap[ex.nom] || null,
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

  // ── CRÉATION (local) ──────────────────────────────────────────────────────
  function newAjouter({ nom, series, reps }) {
    setNewExs(prev => [...prev, { tmpId: `tmp_${Date.now()}`, nom, series, reps }])
  }
  function newSupprimer(tmpId) {
    setNewExs(prev => prev.filter(e => e.tmpId !== tmpId))
  }

  // Résout le client courant (état de nav ou session)
  async function resolveClientId() {
    if (clientId) return clientId
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    let { data: cl } = await supabase.from('clients').select('id').eq('user_id', session.user.id).maybeSingle()
    if (!cl) {
      const r = await supabase.from('clients').select('id').eq('email', session.user.email).maybeSingle()
      cl = r.data
    }
    if (cl) { setClientId(cl.id); return cl.id }
    return null
  }

  async function creerSeance() {
    if (!newTitre.trim() || saving) return
    setSaving(true)

    const cid = await resolveClientId()
    if (!cid) { setSaving(false); alert("Impossible de t'identifier. Reconnecte-toi puis réessaie."); return }

    const { data: ev, error: evErr } = await supabase.from('evenements').insert([{
      client_id: cid,
      date: newDate,
      type: 'seance',
      titre: newTitre.trim(),
      source: 'client',  // contrainte evenements_source_check : 'coach' | 'client'
    }]).select().single()

    if (evErr || !ev) { setSaving(false); alert('Erreur lors de la création : ' + (evErr?.message || 'inconnue')); return }

    let ordre = 1
    for (const ex of newExs) {
      const { data: dbEx } = await supabase
        .from('seances_libres_exercices')
        .insert([{ evenement_id: ev.id, client_id: cid, nom: ex.nom, ordre: ordre++ }])
        .select().single()
      if (dbEx) {
        const rows = []
        for (let i = 1; i <= ex.series; i++) {
          rows.push({ exercice_id: dbEx.id, num_serie: i, poids: null, reps: ex.reps })
        }
        if (rows.length > 0) await supabase.from('seances_libres_series').insert(rows)
      }
    }

    setSaving(false)
    navigate(`/client/seance-ponctuelle/${ev.id}`, { replace: true })
  }

  // ── REMPLISSAGE (DB temps réel) ───────────────────────────────────────────
  async function ajouterExercice({ nom, series, reps }) {
    setAddingEx(true)
    const ordre = exercices.length + 1
    const { data: ex } = await supabase
      .from('seances_libres_exercices')
      .insert([{ evenement_id: id, client_id: evenement.client_id, nom, ordre }])
      .select().single()
    if (ex) {
      const rows = []
      for (let i = 1; i <= series; i++) rows.push({ exercice_id: ex.id, num_serie: i, poids: null, reps })
      const { data: dbSeries } = await supabase.from('seances_libres_series').insert(rows).select()
      setExercices(prev => [...prev, {
        ...ex,
        series: (dbSeries || []).sort((a, b) => a.num_serie - b.num_serie)
          .map(s => ({ ...s, poids: s.poids ?? '', reps: s.reps ?? '' })),
      }])
    }
    setAddingEx(false)
    setShowAddForm(false)
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
      e.id === exId ? { ...e, series: [...e.series, { ...s, poids: '', reps: '' }] } : e))
  }

  async function supprimerSerie(exId, serieId) {
    await supabase.from('seances_libres_series').delete().eq('id', serieId)
    setExercices(prev => prev.map(e =>
      e.id === exId ? { ...e, series: e.series.filter(s => s.id !== serieId) } : e))
  }

  function updateSerie(exId, serieId, field, value) {
    setExercices(prev => prev.map(e =>
      e.id === exId
        ? { ...e, series: e.series.map(s => s.id === serieId ? { ...s, [field]: value } : s) }
        : e))
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

  // ── Spinner ───────────────────────────────────────────────────────────────
  if (!isNew && loading) return (
    <div style={{ minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={S.spinner} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── RENDER : CRÉATION ─────────────────────────────────────────────────────
  if (isNew) return (
    <div style={S.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>‹</button>
        <span style={S.headerTitle}>Nouvelle séance</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        {/* Nom + date */}
        <div style={{ ...S.exCard, marginBottom: '1rem' }}>
          <label style={S.miniLabel}>Nom de la séance</label>
          <input type="text" placeholder="ex: Full body, Haut du corps…"
            value={newTitre} onChange={e => setNewTitre(e.target.value)} style={S.input} autoFocus />
          <div style={{ marginTop: '0.75rem' }}>
            <label style={S.miniLabel}>Date</label>
            <div style={{ overflow: 'hidden', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fafafa' }}>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: 'none', outline: 'none', fontSize: '0.88rem', color: '#333', background: 'transparent' }} />
            </div>
          </div>
        </div>

        {/* Exercices ajoutés */}
        {newExs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
            {newExs.map((ex, idx) => (
              <div key={ex.tmpId} style={S.summaryCard}>
                <span style={S.exNum}>{idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '0.92rem', color: '#1a1a1a' }}>{ex.nom}</p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
                    {ex.series} série{ex.series > 1 ? 's' : ''}{ex.reps ? ` × ${ex.reps} reps` : ''}
                  </p>
                </div>
                <button onClick={() => newSupprimer(ex.tmpId)} style={S.deleteBtn} title="Supprimer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Formulaire ajout */}
        <AddExerciceForm onAdd={newAjouter} adding={false} biblio={biblio} />

        {/* Créer */}
        <button
          onClick={creerSeance}
          disabled={!newTitre.trim() || newExs.length === 0 || saving}
          style={{ ...S.createBtn, opacity: (!newTitre.trim() || newExs.length === 0 || saving) ? 0.5 : 1 }}
        >
          {saving ? '…' : 'Créer la séance'}
        </button>
        <div style={{ height: 100 }} />
      </div>
    </div>
  )

  // ── RENDER : REMPLISSAGE ──────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {evenement?.titre}
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>{formatDate(evenement?.date)}</p>
        </div>
        <div style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {saved && <span style={{ fontSize: '0.65rem', color: 'var(--accent-fg)', fontWeight: 700 }}>✓</span>}
        </div>
      </div>

      <div style={S.content}>
        {exercices.length === 0 && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0 0.5rem', color: '#9ca3af', fontSize: '0.85rem' }}>
            Aucun exercice pour l'instant.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {exercices.map((ex, idx) => {
            const targetReps = ex.series[0]?.reps || null
            const seriesCount = ex.series.length
            return (
              <div key={ex.id} style={S.exCard}>
                {/* En-tête exercice */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.6rem', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <span style={S.exNum}>{idx + 1}</span>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.nom}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    {ex.image_url && (
                      <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e5e7eb', flexShrink: 0 }}>
                        <img src={ex.image_url} alt={ex.nom} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    )}
                    <button onClick={() => supprimerExercice(ex.id)} style={S.deleteBtn} title="Supprimer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Params bar : séries × reps cible */}
                <div style={S.paramsBar}>
                  <div style={S.paramItem}>
                    <span style={S.paramLabel}>SÉRIES</span>
                    <span style={S.paramValue}>{seriesCount}</span>
                  </div>
                  {targetReps != null && (
                    <>
                      <div style={S.paramDivider} />
                      <div style={S.paramItem}>
                        <span style={S.paramLabel}>REPS CIBLE</span>
                        <span style={S.paramValue}>{targetReps}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Lignes séries — wrapper gris comme SeanceClient */}
                <div style={S.seriesTracker}>
                  {/* Label colonnes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', paddingLeft: 24 }}>
                    <span style={{ width: 52, fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Poids</span>
                    <span style={{ fontSize: '0.62rem', color: '#9ca3af', width: 22, textAlign: 'center' }}>kg</span>
                    <span style={{ width: 48, fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Reps</span>
                    <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>reps</span>
                  </div>

                  {ex.series.map(serie => {
                    const filled = serie.poids !== '' && serie.poids != null
                    return (
                      <div key={serie.id} style={{ ...S.serieRow, ...(filled ? S.serieRowDone : {}) }}>
                        <span style={S.serieNum}>{serie.num_serie}</span>
                        <input type="number" inputMode="decimal" placeholder="kg" value={serie.poids}
                          onChange={e => updateSerie(ex.id, serie.id, 'poids', e.target.value)}
                          onBlur={() => saveSerie(ex.id, serie.id)}
                          style={{ ...S.serieInput, width: 52 }} />
                        <span style={S.serieUnit}>kg</span>
                        <input type="number" inputMode="numeric" placeholder="reps" value={serie.reps}
                          onChange={e => updateSerie(ex.id, serie.id, 'reps', e.target.value)}
                          onBlur={() => saveSerie(ex.id, serie.id)}
                          style={{ ...S.serieInput, width: 48 }} />
                        <span style={S.serieUnit}>reps</span>
                        <button onClick={() => supprimerSerie(ex.id, serie.id)}
                          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '1rem', padding: '0 2px', flexShrink: 0 }}>×</button>
                      </div>
                    )
                  })}

                  <button onClick={() => ajouterSerie(ex.id)} style={S.addSerieBtn}>+ Série</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Ajouter un exercice — collapsible */}
        <div style={{ marginTop: '1.25rem' }}>
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)} style={S.addExerciceToggle}>
              + Ajouter un exercice
            </button>
          ) : (
            <>
              <AddExerciceForm onAdd={ajouterExercice} adding={addingEx} biblio={biblio} />
              <button onClick={() => setShowAddForm(false)}
                style={{ width: '100%', marginTop: '0.5rem', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.8rem', cursor: 'pointer', padding: '0.4rem 0' }}>
                Annuler
              </button>
            </>
          )}
        </div>

        <div style={{ height: 100 }} />
      </div>
    </div>
  )
}

const S = {
  page:    { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:  { background: 'var(--header-bg)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 60 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: 800, fontSize: '1rem', color: 'white' },
  backBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 },
  content: { padding: '1.25rem', maxWidth: 480, margin: '0 auto' },
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#333', animation: 'spin .7s linear infinite' },
  exCard:  { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  addCard: { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', border: '1.5px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  summaryCard: { background: 'white', borderRadius: 14, padding: '0.75rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '0.6rem' },
  exNum:      { width: 24, height: 24, borderRadius: '50%', background: 'var(--chip-bg)', color: 'var(--chip-text)', fontSize: '0.72rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deleteBtn:  { background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  seriesTracker: { background: '#f8f9fa', borderRadius: 10, padding: '0.75rem', marginTop: '0.65rem' },
  serieRow:    { display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', background: 'white', borderRadius: 8, padding: '0.4rem 0.6rem', border: '1.5px solid #e5e7eb' },
  serieRowDone:{ background: '#f0fdf4', border: '1.5px solid #86efac' },
  serieNum:   { fontSize: '0.72rem', fontWeight: '900', color: 'var(--chip-text)', background: 'var(--chip-bg)', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serieInput:  { padding: '0.3rem 0.4rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem', fontWeight: '700', color: '#333333', textAlign: 'center', outline: 'none' },
  serieUnit:  { fontSize: '0.65rem', fontWeight: '600', color: '#9ca3af', flexShrink: 0 },
  addSerieBtn: { marginTop: '0.5rem', background: 'none', border: '1.5px dashed #e5e7eb', borderRadius: 8, padding: '0.4rem 0.875rem', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', cursor: 'pointer', width: '100%' },
  addExBtn:    { background: '#333', color: 'var(--accent-fg)', border: 'none', borderRadius: 10, padding: '0.7rem 1rem', width: '100%', textAlign: 'center', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer', boxSizing: 'border-box' },
  input:       { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.88rem', color: '#333', outline: 'none', background: '#fafafa' },
  miniLabel:   { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' },
  bibDropdown: { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 50 },
  bibItem:     { padding: '0.6rem 0.875rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' },
  createBtn:   { display: 'block', width: '100%', boxSizing: 'border-box', background: '#1a1a1a', color: 'var(--accent-fg)', border: 'none', borderRadius: 12, padding: '0.95rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', marginTop: '1.5rem', textAlign: 'center' },
  paramsBar:   { display: 'flex', alignItems: 'center', background: '#f8f9fb', borderRadius: 9, padding: '0.45rem 0.75rem', gap: 0 },
  paramItem:   { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 },
  paramLabel:  { fontSize: '0.58rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  paramValue:  { fontSize: '0.95rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1.2 },
  paramDivider:{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0, margin: '0 0.3rem' },
  addExerciceToggle: { width: '100%', background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.75rem 1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box' },
}
