import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function getSemaineActuelle(dateDebut, totalSemaines) {
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  const semaine = Math.ceil((diffJours + 1) / 7)
  return Math.min(Math.max(semaine, 1), totalSemaines)
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
    await fetchExercices()
    await fetchRpeSeances()
    setLoading(false)
  }

  async function fetchExercices() {
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
  }

  async function fetchRpeSeances() {
    const { data, error } = await supabase.from('rpe_seances').select('*').eq('seance_id', id)
    if (error) { console.log(error); return }
    const map = {}
    data.forEach(r => { map[r.semaine] = { id: r.id, rpe_cible: r.rpe_cible, rpe_reel: r.rpe_reel } })
    setRpeSeances(map)
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
        background: isCur ? '#111827' : '#f3f4f6',
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
    border: `1.5px solid ${isCur ? '#111827' : '#e5e7eb'}`,
    borderRadius: 8, fontSize: '0.88rem', fontWeight: '700',
    color: '#111827', outline: 'none', boxSizing: 'border-box',
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
      {/* Toast */}
      <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#e4f816', padding: '0.6rem 1.4rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.875rem', opacity: saved ? 1 : 0, transition: 'opacity 0.3s', pointerEvents: 'none', zIndex: 100 }}>
        ✓ Enregistré
      </div>

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
              <Line type="monotone" dataKey="RPE cible" stroke="#111827" strokeWidth={2} dot={{ r: 2 }} connectNulls />
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

              function renderExCard(ex, showRecup, showSeries = true) {
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
                        <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#111827' }}>{ex.nom}</span>
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
                      {(showSeries && ex.series || ex.repetitions || ex.tempo || (showRecup && ex.recuperation)) && (
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
                if (group.items.length === 1) {
                  return (
                    <div key={gi} style={S.exCard}>
                      {renderExCard(group.items[0], true)}
                    </div>
                  )
                }
                // Superset : plusieurs exercices avec la même lettre
                return (
                  <div key={gi} style={S.supersetWrapper}>
                    <div style={S.supersetHeader}>
                      <span style={S.supersetBadge}>SUPERSET · {group.letter}</span>
                      <span style={S.supersetHint}>Enchaîner sans récupération</span>
                    </div>
                    {group.items.map((ex, idx) => {
                      const isLast = idx === group.items.length - 1
                      const isFirst = idx === 0
                      return (
                        <div key={ex.id}>
                          <div style={{ ...S.exCard, borderRadius: idx === 0 ? '0 0 0 0' : '0', marginBottom: 0 }}>
                            {renderExCard(ex, isLast, isFirst)}
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
      </div>
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: '2rem' },
  centered:    { minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:     { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logo:        { color: 'white', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.5px' },
  content:     { padding: '1.5rem', maxWidth: '480px', margin: '0 auto' },
  programmeNom:{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.25rem' },
  title:       { fontSize: '1.5rem', fontWeight: '800', color: '#111827', margin: 0 },
  curBadge:    { background: '#111827', color: '#e4f816', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700' },
  card:        { background: 'white', borderRadius: '14px', padding: '1rem 1.1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  sectionLabel:{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.75rem' },
  emptyCard:   { background: 'white', borderRadius: '16px', padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  exCard:      { background: 'white', borderRadius: '14px', padding: '1rem 1.1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  exCode:      { background: '#111827', color: '#e4f816', padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800' },
  exNom:       { fontWeight: '700', fontSize: '0.92rem', color: '#111827' },
  paramsRow:   { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  paramChip:   { background: '#111827', borderRadius: '10px', padding: '0.35rem 0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '52px' },
  paramLabel:  { fontSize: '0.58rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 },
  paramValue:  { fontSize: '1rem', fontWeight: '800', color: '#e4f816', lineHeight: 1.3 },
  intensiteBadge: { background: '#f3f4f6', color: '#374151', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0 },
  compressBtn: { background: '#111827', color: '#e4f816', border: 'none', borderRadius: '999px', padding: '0.3rem 0.85rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  compressCard: { padding: '0.7rem 0', borderBottom: '1px solid #f0f0f0' },
  compressParam: { background: '#111827', borderRadius: '8px', padding: '0.25rem 0.55rem', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  compressParamLabel: { fontSize: '0.55rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 },
  compressParamValue: { fontSize: '0.85rem', fontWeight: '800', color: '#e4f816', lineHeight: 1.3 },
  supersetWrapper: { borderRadius: '14px', overflow: 'hidden', border: '2px solid #e4f816', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  supersetHeader: { background: '#111827', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  supersetBadge: { background: '#e4f816', color: '#111827', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '900', letterSpacing: '0.05em' },
  supersetHint: { color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: '600' },
  supersetConnector: { background: '#fffef5', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem' },
  supersetLine: { flex: 1, height: '1px', background: '#e4f816', opacity: 0.4 },
  supersetTag: { fontSize: '0.68rem', fontWeight: '800', color: '#a16207', whiteSpace: 'nowrap' },
}
