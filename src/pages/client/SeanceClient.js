import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import ClientBottomNav from '../../components/ClientBottomNav'

function getSemaineActuelle(dateDebut, totalSemaines) {
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  const semaine = Math.ceil((diffJours + 1) / 7)
  return Math.min(Math.max(semaine, 1), totalSemaines)
}

function parseRecup(str) {
  if (!str) return 0
  const s = String(str).trim()
  // 1'30" ou 1'30  → minutes + secondes
  const m1 = s.match(/^(\d+)[''′](\d{1,2})[""″]?/)
  if (m1) return parseInt(m1[1]) * 60 + parseInt(m1[2])
  // 1:30 → minutes:secondes
  const m2 = s.match(/^(\d+):(\d{2})/)
  if (m2) return parseInt(m2[1]) * 60 + parseInt(m2[2])
  // 1' → minutes seules
  const m3 = s.match(/^(\d+)[''′]$/)
  if (m3) return parseInt(m3[1]) * 60
  // 30" → secondes seules
  const m4 = s.match(/^(\d+)[""″]/)
  if (m4) return parseInt(m4[1])
  // 3min → minutes
  const m5 = s.match(/^(\d+)\s*min?/i)
  if (m5) return parseInt(m5[1]) * 60
  // nombre seul → secondes
  const m6 = s.match(/^(\d+)/)
  if (m6) return parseInt(m6[1])
  return 0
}

function formatTimer(secs) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const COL = 52  // largeur colonne semaine en px
const COL_LABEL = 56 // largeur colonne labels

export default function SeanceClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [seance, setSeance] = useState(null)
  const [exercices, setExercices] = useState([])
  const [charges, setCharges] = useState({})
  const [rpeSeances, setRpeSeances] = useState({})
  const [semaines, setSemaines] = useState(4)
  const [semaineActuelle, setSemaineActuelle] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [compressed, setCompressed] = useState(false)
  const [tracking, setTracking]         = useState({}) // { exId: [{poids,reps_reelles,valide}] }
  const [blocsTermines, setBlocsTermines] = useState(new Set())
  const [commentaire, setCommentaire]   = useState('')
  const [commentaires, setCommentaires] = useState([]) // historique toutes semaines
  const [commentSaved, setCommentSaved] = useState(false)
  const [timerSecs, setTimerSecs]       = useState(0)
  const [timerTotal, setTimerTotal]     = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [histoOpen, setHistoOpen]       = useState({})
  const timerRef  = useRef(null)
  const blocRefs  = useRef({})

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSeance() }, [])

  async function fetchSeance() {
    const { data, error } = await supabase
      .from('seances')
      .select('*, programmes(id, nom, semaines, date_debut, clients(date_debut))')
      .eq('id', id).single()
    if (error) { console.log(error); setLoading(false); return }
    setSeance(data)
    const total = data.programmes.semaines
    setSemaines(total)
    const dateDebut = data.programmes.date_debut || data.programmes.clients?.date_debut
    if (dateDebut) setSemaineActuelle(getSemaineActuelle(dateDebut, total))
    await fetchExercices(data.programmes.semaines, data.programmes.date_debut || data.programmes.clients?.date_debut)
    await fetchRpeSeances()
    await fetchCommentaires()
    setLoading(false)
  }

  async function fetchExercices(totalSem, dateDebut) {
    const { data, error } = await supabase
      .from('exercices').select('*, charges(*), bibliotheque_exercices(image_url)')
      .eq('seance_id', id).order('ordre', { ascending: true })
    if (error) { console.log(error); return }
    setExercices(data)
    const map = {}
    data.forEach(ex => {
      map[ex.id] = {}
      ex.charges.forEach(c => { map[ex.id][c.semaine] = { id: c.id, charge: c.charge, rpe_reel: c.rpe_reel } })
    })
    setCharges(map)

    // Initialiser le tracking série
    const sem = dateDebut ? getSemaineActuelle(dateDebut, totalSem || 4) : 1
    const exIds = data.map(e => e.id)
    const { data: rows } = await supabase.from('serie_tracking').select('*').in('exercice_id', exIds).eq('semaine', sem)

    // Grouper par lettre pour calculer le max de séries dans chaque superset
    const groupMap = {}
    data.forEach(ex => {
      const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
      if (letter) {
        if (!groupMap[letter]) groupMap[letter] = []
        groupMap[letter].push(ex)
      }
    })

    const t = {}
    data.forEach(ex => {
      const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
      const group = letter ? groupMap[letter] : [ex]
      const n = group.length > 1
        ? Math.max(...group.map(e => Math.max(parseInt(e.series) || 0, 1)))
        : Math.max(parseInt(ex.series) || 0, 1)
      t[ex.id] = Array.from({ length: n }, (_, i) => {
        const saved = rows?.find(r => r.exercice_id === ex.id && r.serie === i + 1)
        return saved ? { poids: saved.poids || '', reps_reelles: saved.reps_reelles?.toString() || '', valide: saved.valide || false } : { poids: '', reps_reelles: '', valide: false }
      })
    })
    setTracking(t)
    // Marquer blocs déjà terminés
    const done = new Set()
    data.forEach(ex => {
      const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
      if (!letter) return
      const group = data.filter(e => e.code?.match(/^([A-Za-z]+)/)?.[1] === letter)
      const allDone = group.every(e => {
        const tr = t[e.id] || []
        return tr.length > 0 && tr.every(s => s.valide)
      })
      if (allDone) done.add(letter)
    })
    setBlocsTermines(done)
  }

  async function fetchCommentaires() {
    const { data } = await supabase
      .from('seance_commentaires').select('*').eq('seance_id', id).order('semaine', { ascending: false })
    if (!data) return
    setCommentaires(data)
    const cur = data.find(c => c.semaine === semaineActuelle)
    if (cur) setCommentaire(cur.texte)
  }

  async function saveCommentaire() {
    if (!commentaire.trim()) return
    await supabase.from('seance_commentaires').upsert(
      { seance_id: id, semaine: semaineActuelle, texte: commentaire.trim() },
      { onConflict: 'seance_id,semaine' }
    )
    setCommentaires(prev => {
      const others = prev.filter(c => c.semaine !== semaineActuelle)
      return [{ seance_id: id, semaine: semaineActuelle, texte: commentaire.trim() }, ...others]
    })
    setCommentSaved(true)
    setTimeout(() => setCommentSaved(false), 2000)
  }

  async function fetchRpeSeances() {
    const { data, error } = await supabase.from('rpe_seances').select('*').eq('seance_id', id)
    if (error) { console.log(error); return }
    const map = {}
    data.forEach(r => { map[r.semaine] = { id: r.id, rpe_cible: r.rpe_cible, rpe_reel: r.rpe_reel } })
    setRpeSeances(map)
  }

  // Nettoyage timer au démontage
  useEffect(() => () => clearInterval(timerRef.current), [])

  function startTimer(secs) {
    clearInterval(timerRef.current)
    setTimerTotal(secs); setTimerSecs(secs); setTimerRunning(true)
    timerRef.current = setInterval(() => {
      setTimerSecs(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setTimerRunning(false)
          if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300])
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function stopTimer() { clearInterval(timerRef.current); setTimerRunning(false); setTimerSecs(0); setTimerTotal(0) }

  function updateTrackingField(exId, serieIdx, field, value) {
    setTracking(prev => {
      const series = [...(prev[exId] || [])]
      series[serieIdx] = { ...(series[serieIdx] || {}), [field]: value }
      return { ...prev, [exId]: series }
    })
  }

  async function validerSerie(exId, serieIdx, groupLetter, groupItems) {
    const serie = tracking[exId]?.[serieIdx] || {}
    // Mise à jour state
    const newT = { ...tracking }
    newT[exId] = [...(tracking[exId] || [])]
    newT[exId][serieIdx] = { ...serie, valide: true }
    setTracking(newT)
    flashSaved()
    // Sauvegarde DB
    await supabase.from('serie_tracking').upsert({
      exercice_id: exId, semaine: semaineActuelle, serie: serieIdx + 1,
      poids: serie.poids || null,
      reps_reelles: serie.reps_reelles ? parseInt(serie.reps_reelles) : null,
      valide: true
    }, { onConflict: 'exercice_id,semaine,serie' })
    // Vérifier si bloc terminé
    if (!groupLetter || !groupItems) return
    const allDone = groupItems.every(ex => {
      const t = newT[ex.id] || []
      return t.length > 0 && t.every(s => s.valide)
    })
    if (allDone) {
      setBlocsTermines(prev => new Set([...prev, groupLetter]))
      const letters = [...new Set(exercices.map(e => e.code?.match(/^([A-Za-z]+)/)?.[1]).filter(Boolean))]
      const idx = letters.indexOf(groupLetter)
      if (idx < letters.length - 1) {
        setTimeout(() => blocRefs.current[letters[idx + 1]]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
      }
    }
  }

  function flashSaved() { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  async function updateCharge(exId, semaine, field, valeur) {
    const existing = charges[exId]?.[semaine]
    if (existing) {
      const { error } = await supabase.from('charges').update({ [field]: valeur }).eq('id', existing.id)
      if (error) alert(error.message)
      else { setCharges(prev => ({ ...prev, [exId]: { ...prev[exId], [semaine]: { ...existing, [field]: valeur } } })); flashSaved() }
    } else {
      const { data, error } = await supabase.from('charges').insert([{ exercice_id: exId, semaine, [field]: valeur }]).select().single()
      if (error) alert(error.message)
      else { setCharges(prev => ({ ...prev, [exId]: { ...prev[exId], [semaine]: { id: data.id, charge: '', rpe_reel: null, [field]: valeur } } })); flashSaved() }
    }
  }

  async function updateRpeReel(semaine, valeur) {
    const existing = rpeSeances[semaine]
    if (existing) {
      const { error } = await supabase.from('rpe_seances').update({ rpe_reel: valeur }).eq('id', existing.id)
      if (error) alert(error.message)
      else { setRpeSeances(prev => ({ ...prev, [semaine]: { ...existing, rpe_reel: valeur } })); flashSaved() }
    } else {
      const { data, error } = await supabase.from('rpe_seances').insert([{ seance_id: id, semaine, rpe_reel: valeur }]).select().single()
      if (error) alert(error.message)
      else { setRpeSeances(prev => ({ ...prev, [semaine]: { id: data.id, rpe_cible: null, rpe_reel: valeur } })); flashSaved() }
    }
  }

  if (loading) return <div style={S.centered}><p style={{ color: '#888' }}>Chargement...</p></div>
  if (!seance)  return <div style={S.centered}><p style={{ color: '#888' }}>Séance introuvable.</p></div>

  const cols = Array.from({ length: semaines }, (_, i) => i + 1)
  const graphData = cols.map(s => ({ name: `S${s}`, 'RPE cible': rpeSeances[s]?.rpe_cible || null, 'RPE réel': rpeSeances[s]?.rpe_reel || null }))

  function WeekHeader({ s }) {
    const isCur = s === semaineActuelle
    return (
      <div style={{
        width: COL, flexShrink: 0, textAlign: 'center',
        background: isCur ? '#333333' : '#f3f4f6',
        color: isCur ? '#e4f816' : '#9ca3af',
        borderRadius: 8, padding: '5px 0', fontSize: '0.7rem', fontWeight: '900',
      }}>S{s}</div>
    )
  }

  function Cell({ children, isCur }) {
    return (
      <div style={{
        width: COL, flexShrink: 0, textAlign: 'center',
        background: isCur ? '#fffef5' : '#fafafa',
        border: `1.5px solid ${isCur ? '#e4f816' : '#f0f0f0'}`,
        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 36,
      }}>{children}</div>
    )
  }

  const inputStyle = (isCur) => ({
    width: COL, height: 36, textAlign: 'center',
    border: `1.5px solid ${isCur ? '#333333' : '#e5e7eb'}`,
    borderRadius: 8, fontSize: '0.88rem', fontWeight: '700',
    color: '#333333', outline: 'none', boxSizing: 'border-box',
    background: isCur ? '#fffef5' : 'white',
    flexShrink: 0,
  })

  const labelStyle = {
    width: COL_LABEL, flexShrink: 0,
    fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    display: 'flex', alignItems: 'center',
  }

  return (
    <div style={S.page}>
      {/* Toast enregistré */}
      <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: '#333333', color: '#e4f816', padding: '0.6rem 1.4rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.875rem', opacity: saved ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 100 }}>
        ✓ Enregistré
      </div>

      {/* Timer récup */}
      {timerTotal > 0 && (
        <div style={{ ...S.timerBanner, background: timerSecs === 0 ? '#14532d' : '#333333' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={S.timerCount}>{timerSecs === 0 ? '✓ GO !' : formatTimer(timerSecs)}</span>
            <span style={S.timerLabel}>{timerSecs === 0 ? 'Récup terminée' : 'RÉCUPÉRATION'}</span>
          </div>
          {timerSecs > 0 && (
            <div style={S.timerBar}>
              <div style={{ ...S.timerProgress, width: `${(1 - timerSecs / timerTotal) * 100}%` }} />
            </div>
          )}
          <button onClick={stopTimer} style={S.timerStop}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(`/client/programme/${seance.programmes.id}`)} style={S.backBtn}>‹</button>
        <span style={S.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        {/* Titre */}
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={S.programmeNom}>{seance.programmes.nom}</p>
          <h1 style={S.title}>{seance.nom}</h1>
          <div style={{ marginTop: '0.5rem' }}>
            <span style={S.curBadge}>S{semaineActuelle} en cours</span>
          </div>
        </div>

        {/* Graphique progression */}
        <div style={S.card}>
          <p style={S.sectionLabel}>Progression de l'intensité</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={graphData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
              <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
              <Line type="monotone" dataKey="RPE cible" stroke="#333333" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="RPE réel" stroke="#e4f816" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 5" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Table RPE séance */}
        <div style={S.card}>
          <p style={S.sectionLabel}>Intensité séance</p>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ minWidth: COL_LABEL + cols.length * (COL + 4) }}>
              {/* Headers */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <div style={{ width: COL_LABEL, flexShrink: 0 }} />
                {cols.map(s => <WeekHeader key={s} s={s} />)}
              </div>
              {/* RPE cible */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                <div style={labelStyle}>Cible</div>
                {cols.map(s => (
                  <Cell key={s} isCur={s === semaineActuelle}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#374151' }}>{rpeSeances[s]?.rpe_cible ?? '—'}</span>
                  </Cell>
                ))}
              </div>
              {/* RPE réel */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <div style={labelStyle}>Réel</div>
                {cols.map(s => (
                  <input
                    key={`rpe-seance-${s}`}
                    type="number" min="1" max="10" step="0.5"
                    defaultValue={rpeSeances[s]?.rpe_reel || ''}
                    onBlur={e => updateRpeReel(s, e.target.value)}
                    style={inputStyle(s === semaineActuelle)}
                    placeholder="—"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Exercices */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <p style={{ ...S.sectionLabel, margin: 0 }}>Exercices · {exercices.length}</p>
          <button onClick={() => setCompressed(c => !c)} style={S.compressBtn}>
            {compressed ? '⊞ Développer' : '⊟ Compresser'}
          </button>
        </div>

        {exercices.length === 0 ? (
          <div style={S.emptyCard}>Aucun exercice.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(() => {
              // Grouper par lettre (A de A1/A2, B de B1, etc.)
              const groups = []
              exercices.forEach(ex => {
                const letter = ex.code?.match(/^([A-Za-z]+)/)?.[1]
                const last = groups[groups.length - 1]
                if (last && last.letter === letter && letter) {
                  last.items.push(ex)
                } else {
                  groups.push({ letter, items: [ex] })
                }
              })

              function renderExCard(ex, showRecup, showSeries = true, groupLetter = null, groupItems = null) {
                if (compressed) {
                  const params = [
                    showSeries && ex.series      && { label: 'SÉRIES', value: ex.series },
                    ex.repetitions               && { label: 'REPS',   value: ex.repetitions },
                    ex.tempo                     && { label: 'TEMPO',  value: ex.tempo },
                    showRecup && ex.recuperation && { label: 'RÉCUP',  value: ex.recuperation },
                    ex.type_intensite            && { label: ex.type_intensite, value: ex.valeur_intensite || '—' },
                  ].filter(Boolean)
                  return (
                    <div key={ex.id} style={S.compressCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: params.length ? '0.6rem' : 0 }}>
                        <span style={S.exCode}>{ex.code}</span>
                        <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#333333' }}>{ex.nom}</span>
                      </div>
                      {params.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {params.map((p, i) => (
                            <div key={i} style={S.compressParam}>
                              <span style={S.compressParamLabel}>{p.label}</span>
                              <span style={S.compressParamValue}>{p.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                const seriesList = tracking[ex.id] || []

                return (
                  <div key={ex.id}>
                    {/* En-tête exercice */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      {ex.bibliotheque_exercices?.image_url && (
                        <div style={{ marginBottom: '0.75rem', borderRadius: '10px', overflow: 'hidden' }}>
                          <img
                            src={ex.bibliotheque_exercices.image_url}
                            alt={ex.nom}
                            style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
                          />
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={S.exCode}>{ex.code}</span>
                          <span style={S.exNom}>{ex.nom}</span>
                        </div>
                        {ex.type_intensite && (
                          <span style={S.intensiteBadge}>{ex.type_intensite} {ex.valeur_intensite}</span>
                        )}
                      </div>
                      {((showSeries && ex.series) || ex.repetitions || ex.tempo || (showRecup && ex.recuperation)) && (
                        <div style={S.paramsRow}>
                          {showSeries && ex.series && (
                            <div style={S.paramChip}>
                              <span style={S.paramLabel}>SÉRIES</span>
                              <span style={S.paramValue}>{ex.series}</span>
                            </div>
                          )}
                          {ex.repetitions && (
                            <div style={S.paramChip}>
                              <span style={S.paramLabel}>REPS</span>
                              <span style={S.paramValue}>{ex.repetitions}</span>
                            </div>
                          )}
                          {ex.tempo && (
                            <div style={S.paramChip}>
                              <span style={S.paramLabel}>TEMPO</span>
                              <span style={S.paramValue}>{ex.tempo}</span>
                            </div>
                          )}
                          {showRecup && ex.recuperation && (
                            <div style={S.paramChip}>
                              <span style={S.paramLabel}>RÉCUP</span>
                              <span style={S.paramValue}>{ex.recuperation}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Suivi des séries */}
                    {seriesList.length > 0 && (
                      <div style={S.seriesTracker}>
                        <p style={S.seriesTrackerLabel}>Séries — S{semaineActuelle}</p>
                        {seriesList.map((serie, si) => (
                          <div key={si} style={{ ...S.serieRow, ...(serie.valide ? S.serieRowDone : {}) }}>
                            <span style={S.serieNum}>{si + 1}</span>
                            <input
                              type="text"
                              value={serie.poids}
                              onChange={e => updateTrackingField(ex.id, si, 'poids', e.target.value)}
                              placeholder="kg"
                              disabled={serie.valide}
                              style={{ ...S.serieInput, width: 52 }}
                            />
                            <span style={S.serieUnit}>kg</span>
                            <input
                              type="number"
                              value={serie.reps_reelles}
                              onChange={e => updateTrackingField(ex.id, si, 'reps_reelles', e.target.value)}
                              placeholder={ex.repetitions || 'reps'}
                              disabled={serie.valide}
                              style={{ ...S.serieInput, width: 48 }}
                            />
                            <span style={S.serieUnit}>reps</span>
                            {serie.valide ? (
                              <span style={S.serieDoneBadge}>✓</span>
                            ) : (
                              <button
                                onClick={() => validerSerie(ex.id, si, groupLetter, groupItems)}
                                style={S.serieValBtn}
                              >Valider</button>
                            )}
                          </div>
                        ))}
                        {showRecup && ex.recuperation && (() => {
                          const recupSecs = parseRecup(ex.recuperation)
                          return recupSecs > 0 ? (
                            <button onClick={() => startTimer(recupSecs)} style={S.recupBtn}>
                              ⏱ Lancer la récup · {ex.recuperation}
                            </button>
                          ) : null
                        })()}
                      </div>
                    )}

                    {/* Historique charges */}
                    {(() => {
                      const histoData = Object.entries(charges[ex.id] || {})
                        .filter(([, v]) => v.charge && parseFloat(v.charge) > 0)
                        .map(([sem, v]) => ({ sem: `S${sem}`, kg: parseFloat(v.charge), isCur: parseInt(sem) === semaineActuelle }))
                        .sort((a, b) => parseInt(a.sem.slice(1)) - parseInt(b.sem.slice(1)))
                      if (histoData.length < 2) return null
                      const isOpen = histoOpen[ex.id]
                      return (
                        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '0.6rem', marginBottom: '0.5rem' }}>
                          <button onClick={() => setHistoOpen(prev => ({ ...prev, [ex.id]: !prev[ex.id] }))}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#6b7280', fontSize: '0.72rem', fontWeight: '700' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                            Historique charges
                            <span style={{ color: '#d1d5db', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', fontSize: '0.85rem' }}>›</span>
                          </button>
                          {isOpen && (
                            <div style={{ marginTop: '0.6rem' }}>
                              <ResponsiveContainer width="100%" height={110}>
                                <BarChart data={histoData} barSize={20} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                  <XAxis dataKey="sem" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                  <Tooltip
                                    contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '0.78rem' }}
                                    formatter={v => [`${v} kg`, '']}
                                    labelStyle={{ fontWeight: '700', color: '#333' }}
                                  />
                                  <Bar dataKey="kg" radius={[4, 4, 0, 0]}>
                                    {histoData.map((entry, idx) => (
                                      <Cell key={idx} fill={entry.isCur ? '#333333' : '#e5e7eb'} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                              <p style={{ margin: '0.25rem 0 0', fontSize: '0.62rem', color: '#9ca3af', textAlign: 'center' }}>Barre foncée = semaine en cours</p>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Table charge/RPE toutes semaines */}
                    <div style={{ overflowX: 'auto', borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem' }}>
                      <div style={{ minWidth: COL_LABEL + cols.length * (COL + 4) }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                          <div style={{ width: COL_LABEL, flexShrink: 0 }} />
                          {cols.map(s => <WeekHeader key={s} s={s} />)}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                          <div style={labelStyle}>kg</div>
                          {cols.map(s => (
                            <input
                              key={`charge-${ex.id}-${s}`}
                              type="text"
                              defaultValue={charges[ex.id]?.[s]?.charge || ''}
                              onBlur={e => updateCharge(ex.id, s, 'charge', e.target.value)}
                              style={inputStyle(s === semaineActuelle)}
                              placeholder="—"
                            />
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <div style={labelStyle}>RPE</div>
                          {cols.map(s => (
                            <input
                              key={`rpe-${ex.id}-${s}`}
                              type="number" min="1" max="10" step="0.5"
                              defaultValue={charges[ex.id]?.[s]?.rpe_reel || ''}
                              onBlur={e => updateCharge(ex.id, s, 'rpe_reel', e.target.value)}
                              style={inputStyle(s === semaineActuelle)}
                              placeholder="—"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              return groups.map((group, gi) => {
                const isDone = group.letter && blocsTermines.has(group.letter)
                if (group.items.length === 1) {
                  return (
                    <div key={gi} ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                      style={{ ...S.exCard, ...(isDone ? S.exCardDone : {}) }}>
                      {isDone && <div style={S.blocDoneBadge}>✓ Bloc terminé</div>}
                      {renderExCard(group.items[0], true, true, group.letter, group.items)}
                    </div>
                  )
                }
                // Superset : plusieurs exercices avec la même lettre
                return (
                  <div key={gi} ref={el => { if (group.letter) blocRefs.current[group.letter] = el }}
                    style={{ ...S.supersetWrapper, ...(isDone ? { borderColor: '#16a34a' } : {}) }}>
                    <div style={{ ...S.supersetHeader, ...(isDone ? { background: '#14532d' } : {}) }}>
                      <span style={S.supersetBadge}>SUPERSET · {group.letter}</span>
                      {isDone
                        ? <span style={{ color: '#86efac', fontSize: '0.7rem', fontWeight: '700' }}>✓ Terminé</span>
                        : <span style={S.supersetHint}>Enchaîner sans récupération</span>
                      }
                    </div>
                    {group.items.map((ex, idx) => {
                      const isLast = idx === group.items.length - 1
                      const isFirst = idx === 0
                      return (
                        <div key={ex.id}>
                          <div style={{ ...S.exCard, borderRadius: idx === 0 ? '0 0 0 0' : '0', marginBottom: 0 }}>
                            {renderExCard(ex, isLast, isFirst, group.letter, group.items)}
                          </div>
                          {!isLast && (
                            <div style={S.supersetConnector}>
                              <div style={S.supersetLine} />
                              <span style={S.supersetTag}>↓ Enchaîner</span>
                              <div style={S.supersetLine} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            })()}
          </div>
        )}
        {/* Commentaires */}
        <div style={{ marginTop: '1.5rem' }}>
          <p style={{ ...S.sectionLabel, marginBottom: '0.75rem' }}>Notes · S{semaineActuelle}</p>
          <div style={{ background: 'white', borderRadius: 14, padding: '1rem 1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <textarea
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              onBlur={saveCommentaire}
              rows={3}
              placeholder="Laisse une note sur cette séance..."
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem 0.75rem', fontSize: '0.88rem', color: '#333333', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button onClick={saveCommentaire} style={{ background: commentSaved ? '#16a34a' : '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', transition: 'background 0.3s' }}>
                {commentSaved ? '✓ Enregistré' : 'Enregistrer'}
              </button>
            </div>
          </div>

          {/* Historique semaines précédentes */}
          {commentaires.filter(c => c.semaine !== semaineActuelle).length > 0 && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Semaines précédentes</p>
              {commentaires.filter(c => c.semaine !== semaineActuelle).map(c => (
                <div key={c.semaine} style={{ background: 'white', borderRadius: 12, padding: '0.75rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>S{c.semaine}</span>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>{c.texte}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  centered:    { minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:     { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logo:        { color: 'white', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.5px' },
  content:     { padding: '1.5rem', maxWidth: '480px', margin: '0 auto' },
  programmeNom:{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.25rem' },
  title:       { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  curBadge:    { background: '#333333', color: '#e4f816', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700' },
  card:        { background: 'white', borderRadius: '14px', padding: '1rem 1.1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  sectionLabel:{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.75rem' },
  emptyCard:   { background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  exCard:      { background: 'white', borderRadius: '14px', padding: '1rem 1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  exCode:      { background: '#333333', color: '#e4f816', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800' },
  exNom:       { fontWeight: '700', fontSize: '0.92rem', color: '#333333' },
  paramsRow:   { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  paramChip:   { background: '#333333', borderRadius: '10px', padding: '0.35rem 0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '52px' },
  paramLabel:  { fontSize: '0.58rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 },
  paramValue:  { fontSize: '1rem', fontWeight: '800', color: '#e4f816', lineHeight: 1.3 },
  intensiteBadge: { background: '#f3f4f6', color: '#374151', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0 },
  compressBtn: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '999px', padding: '0.3rem 0.85rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  compressCard: { padding: '0.7rem 0', borderBottom: '1px solid #f0f0f0' },
  compressParam: { background: '#333333', borderRadius: '8px', padding: '0.25rem 0.55rem', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  compressParamLabel: { fontSize: '0.55rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 },
  compressParamValue: { fontSize: '0.85rem', fontWeight: '800', color: '#e4f816', lineHeight: 1.3 },
  supersetWrapper: { borderRadius: '14px', overflow: 'hidden', border: '2px solid #e4f816', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  supersetHeader: { background: '#333333', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  supersetBadge: { background: '#e4f816', color: '#333333', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '900', letterSpacing: '0.05em' },
  supersetHint: { color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: '600' },
  supersetConnector: { background: '#fffef5', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem' },
  supersetLine: { flex: 1, height: '1px', background: '#e4f816', opacity: 0.4 },
  supersetTag: { fontSize: '0.68rem', fontWeight: '800', color: '#a16207', whiteSpace: 'nowrap' },
  // Timer banner
  timerBanner: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' },
  timerCount: { fontSize: '2rem', fontWeight: '900', color: 'white', lineHeight: 1 },
  timerLabel: { fontSize: '0.62rem', fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.15rem' },
  timerBar: { flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' },
  timerProgress: { height: '100%', background: '#e4f816', borderRadius: 999, transition: 'width 1s linear' },
  timerStop: { background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: 999, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Series tracking
  seriesTracker: { background: '#f8f9fa', borderRadius: 10, padding: '0.75rem', marginBottom: '0.75rem' },
  seriesTrackerLabel: { fontSize: '0.65rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' },
  serieRow: { display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', background: 'white', borderRadius: 8, padding: '0.4rem 0.6rem', border: '1.5px solid #e5e7eb' },
  serieRowDone: { background: '#f0fdf4', border: '1.5px solid #86efac' },
  serieNum: { fontSize: '0.72rem', fontWeight: '900', color: '#e4f816', background: '#333333', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serieInput: { padding: '0.3rem 0.4rem', border: '1.5px solid #e5e7eb', borderRadius: 6, fontSize: '0.85rem', fontWeight: '700', color: '#333333', textAlign: 'center', outline: 'none' },
  serieUnit: { fontSize: '0.65rem', fontWeight: '600', color: '#9ca3af', flexShrink: 0 },
  serieValBtn: { marginLeft: 'auto', background: '#333333', color: '#e4f816', border: 'none', borderRadius: 6, padding: '0.3rem 0.65rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  serieDoneBadge: { marginLeft: 'auto', background: '#16a34a', color: 'white', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.8rem', fontWeight: '800', flexShrink: 0 },
  recupBtn: { width: '100%', marginTop: '0.5rem', background: '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.55rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' },
  // Bloc done state
  exCardDone: { border: '2px solid #86efac', background: '#f0fdf4' },
  blocDoneBadge: { background: '#16a34a', color: 'white', borderRadius: 6, padding: '0.25rem 0.7rem', fontSize: '0.7rem', fontWeight: '800', display: 'inline-block', marginBottom: '0.5rem' },
}
