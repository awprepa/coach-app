import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'

const MOIS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']
function formatDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T12:00:00')
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}
function todayISO() { return new Date().toISOString().slice(0, 10) }

export default function MesSeancesClient() {
  const navigate = useNavigate()

  const [clientId,     setClientId]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [inGroup,      setInGroup]      = useState(false)
  const [templates,    setTemplates]    = useState([])   // [{id, nom, exercices:[{id, nom, ordre, series:[]}]}]
  const [view,         setView]         = useState('list')  // 'list' | 'edit'
  const [editing,      setEditing]      = useState(null)    // {id|null, nom, exercices}
  const [saving,       setSaving]       = useState(false)
  const [nomEditing,   setNomEditing]   = useState('')

  // Ajout exercice
  const [showAddEx,    setShowAddEx]    = useState(false)
  const [searchEx,     setSearchEx]     = useState('')
  const [bibResults,   setBibResults]   = useState([])
  const [addingEx,     setAddingEx]     = useState(false)
  const searchTimer = useRef(null)

  // Utiliser un template
  const [utiliserTpl,  setUtiliserTpl]  = useState(null)  // template object
  const [utiliserDate, setUtiliserDate] = useState(todayISO)
  const [placing,      setPlacing]      = useState(false)

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => { init() }, []) // eslint-disable-line

  async function init() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { navigate('/client/accueil'); return }

    const { data: cl } = await supabase
      .from('clients').select('id').eq('user_id', session.user.id).maybeSingle()
    if (!cl) {
      const { data: cl2 } = await supabase
        .from('clients').select('id').eq('email', session.user.email).maybeSingle()
      if (!cl2) { navigate('/client/accueil'); return }
      setClientId(cl2.id)
      await checkGroupAndLoad(cl2.id)
    } else {
      setClientId(cl.id)
      await checkGroupAndLoad(cl.id)
    }
    setLoading(false)
  }

  async function checkGroupAndLoad(cid) {
    const { data: gm } = await supabase
      .from('groupe_membres').select('id').eq('client_id', cid).limit(1)
    const isIn = (gm || []).length > 0
    setInGroup(isIn)
    if (isIn) await loadTemplates(cid)
  }

  async function loadTemplates(cid) {
    const { data: tpls } = await supabase
      .from('seances_libres_templates')
      .select('*, template_exercices(*, template_series(*))')
      .eq('client_id', cid)
      .order('created_at', { ascending: false })

    setTemplates((tpls || []).map(t => ({
      ...t,
      exercices: (t.template_exercices || [])
        .sort((a, b) => a.ordre - b.ordre)
        .map(ex => ({
          ...ex,
          series: (ex.template_series || [])
            .sort((a, b) => a.num_serie - b.num_serie)
            .map(s => ({ ...s, poids: s.poids ?? '', reps: s.reps ?? '' }))
        }))
    })))
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

  // ── Créer / éditer template ───────────────────────────────────────────────
  function ouvrirNouveau() {
    setEditing({ id: null, nom: '', exercices: [] })
    setNomEditing('')
    setView('edit')
    setShowAddEx(false)
    setSearchEx('')
    setBibResults([])
  }

  function ouvrirEdition(tpl) {
    setEditing(JSON.parse(JSON.stringify(tpl))) // deep copy
    setNomEditing(tpl.nom)
    setView('edit')
    setShowAddEx(false)
    setSearchEx('')
    setBibResults([])
  }

  async function sauvegarderTemplate() {
    if (!nomEditing.trim()) return
    setSaving(true)

    if (!editing.id) {
      // Nouveau template
      const { data: tpl } = await supabase
        .from('seances_libres_templates')
        .insert([{ client_id: clientId, nom: nomEditing.trim() }])
        .select().single()
      if (!tpl) { setSaving(false); return }

      // Ajoute les exercices déjà présents dans editing (ajoutés avant de sauver)
      for (const ex of editing.exercices) {
        const { data: newEx } = await supabase
          .from('template_exercices')
          .insert([{ template_id: tpl.id, nom: ex.nom, ordre: ex.ordre }])
          .select().single()
        if (newEx && ex.series.length > 0) {
          await supabase.from('template_series').insert(
            ex.series.map(s => ({
              exercice_id: newEx.id,
              num_serie: s.num_serie,
              poids: s.poids !== '' ? parseFloat(s.poids) || null : null,
              reps:  s.reps  !== '' ? parseInt(s.reps)   || null : null,
            }))
          )
        }
      }
    } else {
      // Mise à jour nom seulement (exercices sont déjà sauvegardés en temps réel)
      await supabase.from('seances_libres_templates')
        .update({ nom: nomEditing.trim() })
        .eq('id', editing.id)
    }

    await loadTemplates(clientId)
    setSaving(false)
    setView('list')
    setEditing(null)
  }

  async function supprimerTemplate(tplId) {
    await supabase.from('seances_libres_templates').delete().eq('id', tplId)
    setTemplates(prev => prev.filter(t => t.id !== tplId))
  }

  // ── Exercices du template en cours d'édition ─────────────────────────────
  async function ajouterExercice(nomEx) {
    const nom = nomEx.trim()
    if (!nom) return
    setAddingEx(true)

    const ordre = (editing.exercices.length + 1)

    if (editing.id) {
      // Template déjà sauvegardé : persiste immédiatement
      const { data: ex } = await supabase
        .from('template_exercices')
        .insert([{ template_id: editing.id, nom, ordre }])
        .select().single()
      if (ex) {
        const { data: s1 } = await supabase
          .from('template_series')
          .insert([{ exercice_id: ex.id, num_serie: 1, poids: null, reps: null }])
          .select().single()
        const newEx = { ...ex, series: s1 ? [{ ...s1, poids: '', reps: '' }] : [] }
        setEditing(prev => ({ ...prev, exercices: [...prev.exercices, newEx] }))
      }
    } else {
      // Nouveau template pas encore sauvegardé : ajout local uniquement
      const tmpId = `tmp_${Date.now()}`
      const newEx = {
        id: tmpId,
        template_id: null,
        nom,
        ordre,
        series: [{ id: `${tmpId}_s1`, exercice_id: tmpId, num_serie: 1, poids: '', reps: '' }]
      }
      setEditing(prev => ({ ...prev, exercices: [...prev.exercices, newEx] }))
    }

    setSearchEx('')
    setBibResults([])
    setShowAddEx(false)
    setAddingEx(false)
  }

  async function supprimerExercice(exId) {
    if (editing.id && !exId.startsWith('tmp_')) {
      await supabase.from('template_exercices').delete().eq('id', exId)
    }
    setEditing(prev => ({ ...prev, exercices: prev.exercices.filter(e => e.id !== exId) }))
  }

  async function ajouterSerie(exId) {
    const ex = editing.exercices.find(e => e.id === exId)
    if (!ex) return
    const num = ex.series.length > 0 ? Math.max(...ex.series.map(s => s.num_serie)) + 1 : 1

    if (editing.id && !exId.startsWith('tmp_')) {
      const { data: s } = await supabase
        .from('template_series')
        .insert([{ exercice_id: exId, num_serie: num, poids: null, reps: null }])
        .select().single()
      if (s) {
        setEditing(prev => ({
          ...prev,
          exercices: prev.exercices.map(e =>
            e.id === exId ? { ...e, series: [...e.series, { ...s, poids: '', reps: '' }] } : e
          )
        }))
      }
    } else {
      const tmpSId = `tmp_s_${Date.now()}`
      setEditing(prev => ({
        ...prev,
        exercices: prev.exercices.map(e =>
          e.id === exId
            ? { ...e, series: [...e.series, { id: tmpSId, exercice_id: exId, num_serie: num, poids: '', reps: '' }] }
            : e
        )
      }))
    }
  }

  async function supprimerSerie(exId, serieId) {
    if (editing.id && !serieId.startsWith('tmp_')) {
      await supabase.from('template_series').delete().eq('id', serieId)
    }
    setEditing(prev => ({
      ...prev,
      exercices: prev.exercices.map(e =>
        e.id === exId ? { ...e, series: e.series.filter(s => s.id !== serieId) } : e
      )
    }))
  }

  function updateSerie(exId, serieId, field, value) {
    setEditing(prev => ({
      ...prev,
      exercices: prev.exercices.map(e =>
        e.id === exId
          ? { ...e, series: e.series.map(s => s.id === serieId ? { ...s, [field]: value } : s) }
          : e
      )
    }))
  }

  async function saveSerie(exId, serieId) {
    if (!editing.id || serieId.startsWith('tmp_')) return
    const ex = editing.exercices.find(e => e.id === exId)
    const serie = ex?.series.find(s => s.id === serieId)
    if (!serie) return
    const poids = serie.poids !== '' ? parseFloat(serie.poids) || null : null
    const reps  = serie.reps  !== '' ? parseInt(serie.reps)   || null : null
    await supabase.from('template_series').update({ poids, reps }).eq('id', serieId)
  }

  // ── Utiliser un template ───────────────────────────────────────────────────
  async function placerTemplate() {
    if (!utiliserTpl || !utiliserDate) return
    setPlacing(true)

    // Crée l'événement
    const { data: ev } = await supabase.from('evenements').insert([{
      client_id: clientId,
      date: utiliserDate,
      type: 'seance',
      titre: utiliserTpl.nom,
      source: 'client_ponctuelle',
    }]).select().single()

    if (!ev) { setPlacing(false); return }

    // Copie les exercices + séries du template dans l'événement
    for (const ex of utiliserTpl.exercices) {
      const { data: newEx } = await supabase
        .from('seances_libres_exercices')
        .insert([{ evenement_id: ev.id, client_id: clientId, nom: ex.nom, ordre: ex.ordre }])
        .select().single()
      if (newEx && ex.series.length > 0) {
        await supabase.from('seances_libres_series').insert(
          ex.series.map(s => ({
            exercice_id: newEx.id,
            num_serie: s.num_serie,
            poids: s.poids !== '' ? parseFloat(s.poids) || null : null,
            reps:  s.reps  !== '' ? parseInt(s.reps)   || null : null,
          }))
        )
      }
    }

    setPlacing(false)
    setUtiliserTpl(null)
    navigate(`/client/seance-ponctuelle/${ev.id}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={S.spinner} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={S.page}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => view === 'edit' ? setView('list') : navigate(-1)} style={S.backBtn}>‹</button>
        <span style={S.headerTitle}>
          {view === 'edit' ? (editing?.id ? 'Modifier le modèle' : 'Nouveau modèle') : 'Mes séances'}
        </span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        {!inGroup ? (
          <div style={S.gateCard}>
            <div style={S.gateIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <p style={{ margin: '0.75rem 0 0.25rem', fontWeight: 800, fontSize: '1rem', color: '#1a1a1a' }}>
              Réservé aux membres d'un groupe
            </p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5, textAlign: 'center' }}>
              Cette fonctionnalité est disponible une fois que tu rejoins un groupe d'entraînement.
            </p>
          </div>
        ) : view === 'list' ? (
          renderList()
        ) : (
          renderEditor()
        )}
      </div>

      {/* Modal Utiliser */}
      {utiliserTpl && (
        <div style={S.overlay} onClick={() => !placing && setUtiliserTpl(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={{ margin: '0 0 0.25rem', fontWeight: 800, fontSize: '1rem', color: '#1a1a1a' }}>
              Placer « {utiliserTpl.nom} »
            </p>
            <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#6b7280' }}>
              Choisis la date de la séance
            </p>
            <input
              type="date"
              value={utiliserDate}
              onChange={e => setUtiliserDate(e.target.value)}
              style={S.dateInput}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                onClick={placerTemplate}
                disabled={!utiliserDate || placing}
                style={{ ...S.btnPrimary, opacity: (!utiliserDate || placing) ? 0.5 : 1, flex: 1 }}
              >
                {placing ? '…' : 'Ajouter au calendrier'}
              </button>
              <button onClick={() => setUtiliserTpl(null)} style={S.btnCancel}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      <ClientBottomNav />
    </div>
  )

  // ── Vue liste ─────────────────────────────────────────────────────────────
  function renderList() {
    return (
      <>
        <button onClick={ouvrirNouveau} style={S.createBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Créer un modèle
        </button>

        {templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#9ca3af', fontSize: '0.85rem' }}>
            Aucun modèle de séance pour l'instant.<br />
            <span style={{ fontSize: '0.78rem' }}>Crée ton premier modèle ci-dessus.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={S.tplCard}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>{tpl.nom}</p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                      {tpl.exercices.length} exercice{tpl.exercices.length !== 1 ? 's' : ''}
                    </p>
                    {/* Résumé exercices */}
                    {tpl.exercices.length > 0 && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {tpl.exercices.slice(0, 4).map(ex => (
                          <div key={ex.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={S.exNumSmall}>{ex.ordre}</div>
                            <span style={{ fontSize: '0.78rem', color: '#374151' }}>{ex.nom}</span>
                            {ex.series.length > 0 && (
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 'auto' }}>
                                {ex.series.length}×
                                {ex.series[0].reps ? `${ex.series[0].reps} reps` : ''}
                              </span>
                            )}
                          </div>
                        ))}
                        {tpl.exercices.length > 4 && (
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', paddingLeft: 26 }}>
                            +{tpl.exercices.length - 4} autres…
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => supprimerTemplate(tpl.id)}
                    style={S.deleteBtn}
                    title="Supprimer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
                  <button
                    onClick={() => { setUtiliserTpl(tpl); setUtiliserDate(todayISO()) }}
                    style={{ ...S.btnPrimary, flex: 1, fontSize: '0.82rem', padding: '0.55rem' }}
                  >
                    Utiliser
                  </button>
                  <button
                    onClick={() => ouvrirEdition(tpl)}
                    style={{ ...S.btnOutline, flex: 1, fontSize: '0.82rem', padding: '0.55rem' }}
                  >
                    Modifier
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ height: 110 }} />
      </>
    )
  }

  // ── Vue éditeur ───────────────────────────────────────────────────────────
  function renderEditor() {
    const exs = editing?.exercices || []

    return (
      <>
        {/* Nom du modèle */}
        <div style={S.card}>
          <label style={S.label}>Nom du modèle</label>
          <input
            type="text"
            placeholder="ex: Force haut du corps, Full body A…"
            value={nomEditing}
            onChange={e => setNomEditing(e.target.value)}
            style={S.input}
            autoFocus={!editing?.id}
          />
        </div>

        {/* Exercices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {exs.map((ex, idx) => (
            <div key={ex.id} style={S.exCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={S.exNum}>{idx + 1}</span>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1a1a1a' }}>{ex.nom}</span>
                </div>
                <button onClick={() => supprimerExercice(ex.id)} style={S.deleteBtn} title="Supprimer">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>

              {/* En-têtes */}
              <div style={S.serieHeader}>
                <span style={{ width: 26 }}>#</span>
                <span style={{ flex: 1 }}>Poids (kg)</span>
                <span style={{ flex: 1 }}>Reps</span>
                <span style={{ width: 28 }} />
              </div>

              {/* Séries */}
              {ex.series.map(serie => (
                <div key={serie.id} style={S.serieRow}>
                  <span style={{ width: 26, fontSize: '0.78rem', color: '#9ca3af', fontWeight: 700 }}>{serie.num_serie}</span>
                  <input
                    type="number" inputMode="decimal" placeholder="—"
                    value={serie.poids}
                    onChange={e => updateSerie(ex.id, serie.id, 'poids', e.target.value)}
                    onBlur={() => saveSerie(ex.id, serie.id)}
                    style={S.serieInput}
                  />
                  <input
                    type="number" inputMode="numeric" placeholder="—"
                    value={serie.reps}
                    onChange={e => updateSerie(ex.id, serie.id, 'reps', e.target.value)}
                    onBlur={() => saveSerie(ex.id, serie.id)}
                    style={S.serieInput}
                  />
                  <button
                    onClick={() => supprimerSerie(ex.id, serie.id)}
                    style={{ width: 28, background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '0.85rem', padding: 0, textAlign: 'center' }}
                  >✕</button>
                </div>
              ))}

              <button onClick={() => ajouterSerie(ex.id)} style={S.addSerieBtn}>
                + Série
              </button>
            </div>
          ))}
        </div>

        {/* Ajouter exercice */}
        <div style={{ marginTop: '0.875rem' }}>
          {!showAddEx ? (
            <button onClick={() => setShowAddEx(true)} style={S.addExBtn}>
              + Ajouter un exercice
            </button>
          ) : (
            <div style={{ ...S.card, position: 'relative' }}>
              <label style={S.label}>Rechercher dans la bibliothèque ou taper un nom</label>
              <input
                type="text"
                placeholder="Squat, Développé couché…"
                value={searchEx}
                onChange={handleSearchChange}
                onKeyDown={e => e.key === 'Enter' && bibResults.length === 0 && searchEx.trim() && ajouterExercice(searchEx)}
                style={S.input}
                autoFocus
              />
              {/* Résultats bibliothèque */}
              {bibResults.length > 0 && (
                <div style={S.bibDropdown}>
                  {bibResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => ajouterExercice(r.nom)}
                      style={S.bibItem}
                    >
                      {r.nom}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                <button
                  onClick={() => ajouterExercice(searchEx)}
                  disabled={!searchEx.trim() || addingEx}
                  style={{ ...S.btnPrimary, flex: 1, opacity: (!searchEx.trim() || addingEx) ? 0.5 : 1 }}
                >
                  {addingEx ? '…' : bibResults.length > 0 ? 'Ajouter personnalisé' : 'Ajouter'}
                </button>
                <button onClick={() => { setShowAddEx(false); setSearchEx(''); setBibResults([]) }} style={S.btnCancel}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bouton sauvegarder */}
        <button
          onClick={sauvegarderTemplate}
          disabled={!nomEditing.trim() || saving}
          style={{ ...S.btnPrimary, width: '100%', marginTop: '1.5rem', padding: '0.875rem', opacity: (!nomEditing.trim() || saving) ? 0.5 : 1 }}
        >
          {saving ? '…' : editing?.id ? 'Enregistrer les modifications' : 'Créer le modèle'}
        </button>

        <div style={{ height: 110 }} />
      </>
    )
  }
}

const S = {
  page:    { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:  { background: 'var(--header-bg)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'sticky', top: 0, zIndex: 60 },
  backBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: 800, fontSize: '1rem', color: 'white' },
  content: { padding: '1.25rem', maxWidth: 480, margin: '0 auto' },
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#333', animation: 'spin .7s linear infinite' },

  gateCard: { background: 'white', borderRadius: 16, padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  gateIcon: { width: 56, height: 56, borderRadius: 16, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' },

  createBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', color: 'var(--accent-fg)', border: 'none', borderRadius: 12, padding: '0.875rem 1rem', width: '100%', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', marginBottom: '1.25rem', boxSizing: 'border-box' },

  tplCard: { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  card:    { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  exCard:  { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },

  label:  { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' },
  input:  { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.88rem', color: '#333', outline: 'none', background: '#fafafa' },

  exNum:      { width: 24, height: 24, borderRadius: 6, background: '#333', color: 'var(--accent-fg)', fontSize: '0.72rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  exNumSmall: { width: 18, height: 18, borderRadius: 4, background: '#e5e7eb', color: '#374151', fontSize: '0.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  serieHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  serieRow:    { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' },
  serieInput:  { flex: 1, padding: '0.5rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', color: '#333', outline: 'none', textAlign: 'center', background: '#fafafa', minWidth: 0 },
  addSerieBtn: { marginTop: '0.5rem', background: 'none', border: '1.5px dashed #e5e7eb', borderRadius: 8, padding: '0.4rem 0.875rem', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', cursor: 'pointer', width: '100%' },
  addExBtn:    { background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.875rem 1rem', width: '100%', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box' },
  deleteBtn:   { background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  btnPrimary: { background: '#1a1a1a', color: 'var(--accent-fg)', border: 'none', borderRadius: 10, padding: '0.65rem 1rem', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer' },
  btnOutline: { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem 1rem', fontWeight: 700, fontSize: '0.88rem', color: '#374151', cursor: 'pointer' },
  btnCancel:  { background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '0.65rem 1rem', fontWeight: 600, fontSize: '0.85rem', color: '#9ca3af', cursor: 'pointer' },

  bibDropdown: { position: 'absolute', left: '1.25rem', right: '1.25rem', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden' },
  bibItem:     { display: 'block', width: '100%', textAlign: 'left', padding: '0.65rem 0.875rem', border: 'none', borderBottom: '1px solid #f3f4f6', background: 'white', fontSize: '0.85rem', color: '#374151', cursor: 'pointer' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  modal:   { background: 'white', borderRadius: '20px 20px 0 0', padding: '1.5rem 1.25rem', width: '100%', maxWidth: 480 },
  dateInput: { width: '100%', boxSizing: 'border-box', padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.95rem', color: '#333', outline: 'none', background: '#fafafa' },
}
