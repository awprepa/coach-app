import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

/* ─────────────────────────────────────────────────────────────────────────────
   Calendrier saison (préparateur physique) — vue mois × jours d'un groupe.
   - Matchs en pavés couleur-du-groupe (repères de la saison)
   - Types de création : Entraînement (+ style libre) · Match (+ catégorie) · Muscu
   - Clic sur une séance → panneau détail (édition + déroulé blocs/exercices)
   - Double-clic sur un jour → création
   - Clic droit sur un jour ou une séance → menu (ajouter / copier / coller / suppr.)
   Utilisable :
     • en page autonome (route)            → <CalendrierSaison />
     • intégré dans une fiche groupe        → <CalendrierSaison groupeId={id} embedded />
   ───────────────────────────────────────────────────────────────────────────── */

const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S']            // index getDay()
const MOIS_LABEL = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

// Types d'évènement.
//  - les 3 premiers sont proposés à la création (CREATE_TYPES)
//  - les suivants restent gérés pour l'affichage des données existantes (legacy)
const TYPES = {
  match:        { label: 'Match',        color: null,      solid: 'group' }, // couleur du groupe
  entrainement: { label: 'Entraînement', color: '#6b94a3' },
  muscu:        { label: 'Musculation',  color: '#b08769' },
  // legacy (affichage seulement) :
  collectif:    { label: 'Collectif',    color: '#98a2ad', neutral: true },
  vitesse:      { label: 'Vitesse',      color: '#6b94a3' },
  prevention:   { label: 'Prévention',   color: '#8c7ea6', short: 'Activ.' },
  recup:        { label: 'Récup',        color: null,      blank: true },
  test:         { label: 'Tests',        color: '#454c57', dark: true },
  autre:        { label: 'Autre',        color: '#9aa1ac' },
}
const CREATE_TYPES = ['entrainement', 'match', 'muscu']
const MATCH_CATEGORIES = ['Amical', 'Championnat', 'Coupe', 'Phases finales']
// types qui ont un déroulé en blocs/exercices
const HAS_BLOCS = ['entrainement', 'muscu', 'vitesse', 'prevention', 'recup', 'autre']

const ymd = (y, m, d) => `${y}-${m}-${d}`                  // clé interne (m 0-based)
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// 12 mois Juillet(start) → Juin(start+1)
function buildMonths(startYear) {
  const out = []
  for (let i = 0; i < 12; i++) {
    const m = (6 + i) % 12
    const y = startYear + (6 + i >= 12 ? 1 : 0)
    out.push({ y, m, label: MOIS_LABEL[m], days: new Date(y, m + 1, 0).getDate() })
  }
  return out
}
function seasonStartYear(date = new Date()) {
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
}

export default function CalendrierSaison({ groupeId = null, embedded = false }) {
  const [groupes, setGroupes]   = useState([])
  const [groupe, setGroupe]     = useState(null)
  const [startYear, setStartYear] = useState(seasonStartYear())
  const [evenements, setEvenements] = useState([])
  const [phases, setPhases]     = useState([])
  const [loading, setLoading]   = useState(true)

  // Panneau : { mode:'edit'|'create', evt, form, blocs }
  const [panel, setPanel] = useState(null)
  const [saving, setSaving] = useState(false)

  // Menu contextuel sur une séance (clic droit) : { x, y, dateISO, evt }
  const [ctx, setCtx] = useState(null)
  // Bulle de création sur un jour : { x, y, form }
  const [pop, setPop] = useState(null)
  // Presse-papier : { source, blocs }  (source = évènement copié)
  const [clip, setClip] = useState(null)
  // Glisser-déposer : évènement en cours de déplacement + jour survolé
  const [dragEvt, setDragEvt] = useState(null)
  const [dragOver, setDragOver] = useState(null) // dateISO survolé

  const groupColor = groupe?.couleur || '#2f6f76'
  const months = buildMonths(startYear)
  const seasonStart = iso(startYear, 6, 1)
  const seasonEnd   = iso(startYear + 1, 5, 30)

  // ── Chargement des groupes ──────────────────────────────────────────────────
  useEffect(() => {
    if (groupeId) {
      // mode intégré : un seul groupe
      supabase.from('groupes').select('*').eq('id', groupeId).single().then(({ data }) => {
        if (data) { setGroupes([data]); setGroupe(data) }
        else setLoading(false)
      })
    } else {
      supabase.from('groupes').select('*').order('nom').then(({ data }) => {
        setGroupes(data || [])
        if (data?.length) setGroupe(data[0])
        else setLoading(false)
      })
    }
  }, [groupeId])

  // ── Chargement saison (évènements + phases) ─────────────────────────────────
  const loadSeason = useCallback(async () => {
    if (!groupe) return
    setLoading(true)
    const [{ data: evs }, { data: phs }] = await Promise.all([
      supabase.from('groupe_evenements').select('*')
        .eq('groupe_id', groupe.id).gte('date', seasonStart).lte('date', seasonEnd).order('date'),
      supabase.from('groupe_phases').select('*')
        .eq('groupe_id', groupe.id).order('ordre'),
    ])
    setEvenements(evs || [])
    setPhases(phs || [])
    setLoading(false)
  }, [groupe, seasonStart, seasonEnd])

  useEffect(() => { loadSeason() }, [loadSeason])

  // fermer le menu contextuel sur clic ailleurs / touche échap
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    const onKey = e => { if (e.key === 'Escape') setCtx(null) }
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  // fermer la bulle de création sur touche échap
  useEffect(() => {
    if (!pop) return
    const onKey = e => { if (e.key === 'Escape') setPop(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pop])

  // ── Index par jour ──────────────────────────────────────────────────────────
  const evByDay = {}
  for (const e of evenements) {
    const [Y, M, D] = e.date.split('-').map(Number)
    const k = ymd(Y, M - 1, D)
    ;(evByDay[k] ||= []).push(e)
  }
  const matchsList = evenements.filter(e => e.type === 'match')
  const today = new Date(); const todayKey = ymd(today.getFullYear(), today.getMonth(), today.getDate())

  // phase couvrant un mois (pour le ruban + le liseré de colonne)
  const seasonPhases = phases.filter(p => p.type === 'phase')
  const vacances = phases.filter(p => p.type === 'vacances')
  function phaseOfMonth(y, m) {
    const mid = iso(y, m, 15)
    return seasonPhases.find(p => p.date_debut <= mid && mid <= p.date_fin) || null
  }
  function vacInfo(y, m, d) {
    const date = iso(y, m, d)
    for (const v of vacances) {
      if (v.date_debut <= date && date <= v.date_fin)
        return { in: true, start: date === v.date_debut, label: v.label }
    }
    return { in: false }
  }
  // segments du ruban : regroupe les mois consécutifs de même phase
  const ribbon = []
  months.forEach(M => {
    const p = phaseOfMonth(M.y, M.m)
    const last = ribbon[ribbon.length - 1]
    if (last && last.id === (p?.id || null)) last.span++
    else ribbon.push({ id: p?.id || null, label: p?.label || '', couleur: p?.couleur || '#d8dce1', span: 1 })
  })

  // ── Actions panneau ───────────────────────────────────────────────────────────
  function emptyForm(dateISO) {
    return {
      type: 'entrainement', date: dateISO || seasonStart, heure: '', titre: '',
      style: '', adversaire: '', categorie: 'Championnat', domicile: true, journee: '',
      lieu: '', duree_min: '', charge: '', note: '',
    }
  }
  function openCreate(dateISO) {
    setPanel({ mode: 'create', evt: null, form: emptyForm(dateISO), blocs: [] })
  }
  async function loadBlocs(evtId) {
    const { data } = await supabase.from('groupe_seance_blocs')
      .select('*, groupe_seance_exercices(*)').eq('evenement_id', evtId).order('ordre')
    return (data || []).map(b => ({ ...b, exos: (b.groupe_seance_exercices || []).sort((a, z) => a.ordre - z.ordre) }))
  }
  async function openEdit(e) {
    let blocs = []
    if (HAS_BLOCS.includes(e.type) || e.type === 'collectif') blocs = await loadBlocs(e.id)
    setPanel({
      mode: 'edit', evt: e,
      form: {
        type: e.type, date: e.date, heure: e.heure || '', titre: e.titre || '',
        style: e.style || '', adversaire: e.adversaire || '', categorie: e.categorie || 'Championnat',
        domicile: e.domicile ?? true, journee: e.journee || '',
        lieu: e.lieu || '', duree_min: e.duree_min || '', charge: e.charge || '', note: e.note || '',
      },
      blocs,
    })
  }
  function closePanel() { setPanel(null) }
  const setForm = patch => setPanel(p => ({ ...p, form: { ...p.form, ...patch } }))

  function buildPayload(f) {
    const isMatch = f.type === 'match'
    return {
      groupe_id: groupe.id, date: f.date, heure: f.heure || null, type: f.type,
      titre: f.titre || null, lieu: f.lieu || null,
      duree_min: f.duree_min ? Number(f.duree_min) : null, charge: f.charge || null, note: f.note || null,
      style:      f.type === 'entrainement' ? (f.style || null) : null,
      adversaire: isMatch ? (f.adversaire || null) : null,
      categorie:  isMatch ? (f.categorie || null) : null,
      domicile:   isMatch ? !!f.domicile : null,
      journee:    isMatch ? (f.journee || null) : null,
    }
  }

  async function saveEvent() {
    if (!panel || !groupe) return
    setSaving(true)
    const payload = buildPayload(panel.form)
    let evtId = panel.evt?.id
    if (panel.mode === 'create') {
      const { data, error } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
      evtId = data.id
    } else {
      const { error } = await supabase.from('groupe_evenements').update(payload).eq('id', evtId)
      if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    await loadSeason()
    closePanel()
  }
  async function deleteEvent() {
    if (!panel?.evt) return
    setSaving(true)
    await supabase.from('groupe_evenements').delete().eq('id', panel.evt.id)
    setSaving(false)
    await loadSeason()
    closePanel()
  }
  async function deleteEventDirect(e) {
    await supabase.from('groupe_evenements').delete().eq('id', e.id)
    await loadSeason()
  }

  // ── Copier / coller ─────────────────────────────────────────────────────────
  async function copyEvent(e) {
    let blocs = []
    if (HAS_BLOCS.includes(e.type) || e.type === 'collectif') blocs = await loadBlocs(e.id)
    setClip({ source: e, blocs })
    setCtx(null)
  }
  async function pasteEvent(dateISO) {
    if (!clip || !groupe) return
    const s = clip.source
    const payload = {
      groupe_id: groupe.id, date: dateISO, heure: s.heure || null, type: s.type,
      titre: s.titre || null, lieu: s.lieu || null, duree_min: s.duree_min || null,
      charge: s.charge || null, note: s.note || null, style: s.style || null,
      adversaire: s.adversaire || null, categorie: s.categorie || null,
      domicile: s.domicile, journee: s.journee || null,
    }
    const { data, error } = await supabase.from('groupe_evenements').insert([payload]).select('id').single()
    if (error) { alert('Erreur : ' + error.message); return }
    // dupliquer blocs + exercices
    for (const b of clip.blocs) {
      const { data: nb } = await supabase.from('groupe_seance_blocs')
        .insert([{ evenement_id: data.id, nom: b.nom, duree: b.duree || '', ordre: b.ordre }]).select('id').single()
      if (nb && b.exos?.length) {
        await supabase.from('groupe_seance_exercices').insert(
          b.exos.map(x => ({ bloc_id: nb.id, nom: x.nom, prescription: x.prescription || '', detail: x.detail || '', ordre: x.ordre }))
        )
      }
    }
    setCtx(null)
    await loadSeason()
  }

  // ── Blocs / exercices (édition d'une séance existante) ──────────────────────
  async function addBloc() {
    if (!panel?.evt) { alert("Enregistre d'abord la séance pour lui ajouter un déroulé."); return }
    const ordre = (panel.blocs.length || 0) + 1
    const { data } = await supabase.from('groupe_seance_blocs')
      .insert([{ evenement_id: panel.evt.id, nom: 'Nouveau bloc', duree: '', ordre }]).select('*').single()
    if (data) setPanel(p => ({ ...p, blocs: [...p.blocs, { ...data, exos: [] }] }))
  }
  async function updateBloc(id, patch) {
    setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === id ? { ...b, ...patch } : b) }))
    await supabase.from('groupe_seance_blocs').update(patch).eq('id', id)
  }
  async function deleteBloc(id) {
    setPanel(p => ({ ...p, blocs: p.blocs.filter(b => b.id !== id) }))
    await supabase.from('groupe_seance_blocs').delete().eq('id', id)
  }
  async function addExo(blocId) {
    const bloc = panel.blocs.find(b => b.id === blocId)
    const ordre = (bloc?.exos.length || 0) + 1
    const { data } = await supabase.from('groupe_seance_exercices')
      .insert([{ bloc_id: blocId, nom: 'Nouvel exercice', prescription: '', detail: '', ordre }]).select('*').single()
    if (data) setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === blocId ? { ...b, exos: [...b.exos, data] } : b) }))
  }
  async function updateExo(blocId, id, patch) {
    setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === blocId ? { ...b, exos: b.exos.map(x => x.id === id ? { ...x, ...patch } : x) } : b) }))
    await supabase.from('groupe_seance_exercices').update(patch).eq('id', id)
  }
  async function deleteExo(blocId, id) {
    setPanel(p => ({ ...p, blocs: p.blocs.map(b => b.id === blocId ? { ...b, exos: b.exos.filter(x => x.id !== id) } : b) }))
    await supabase.from('groupe_seance_exercices').delete().eq('id', id)
  }

  // ── Glisser-déposer : déplacer un évènement vers un autre jour ───────────────
  async function moveEvent(evt, newDateISO) {
    if (!evt || evt.date === newDateISO) return
    // maj optimiste
    setEvenements(prev => prev.map(e => e.id === evt.id ? { ...e, date: newDateISO } : e))
    const { error } = await supabase.from('groupe_evenements').update({ date: newDateISO }).eq('id', evt.id)
    if (error) { alert('Erreur : ' + error.message); loadSeason() }
  }

  // ── Menu contextuel sur une séance (clic droit) ─────────────────────────────
  function openCtx(e, dateISO, evt) {
    e.preventDefault()
    e.stopPropagation()
    setPop(null)
    setCtx({ x: e.clientX, y: e.clientY, dateISO, evt: evt || null })
  }

  // ── Bulle de création sur un jour (double-clic ou clic droit) ────────────────
  function openPop(e, dateISO) {
    e.preventDefault()
    e.stopPropagation()
    setCtx(null)
    const PW = 272, PH = 330
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - PW - 12))
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - PH - 12))
    setPop({ x, y, form: emptyForm(dateISO) })
  }
  const setPopForm = patch => setPop(p => ({ ...p, form: { ...p.form, ...patch } }))

  async function quickSave(openDetails) {
    if (!pop || !groupe) return
    setSaving(true)
    const { data, error } = await supabase.from('groupe_evenements').insert([buildPayload(pop.form)]).select('*').single()
    setSaving(false)
    if (error) { alert('Erreur : ' + error.message); return }
    setPop(null)
    await loadSeason()
    if (openDetails && data) openEdit(data)
  }

  // ── Rendu cellule jour ────────────────────────────────────────────────────────
  function renderCell(y, m, d) {
    const evs = evByDay[ymd(y, m, d)] || []
    if (!evs.length) return <div style={{ flex: 1 }} />
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {evs.map(e => {
          const T = TYPES[e.type] || TYPES.autre
          const onCtx = ev => openCtx(ev, e.date, e)
          const dragProps = {
            draggable: true,
            onDragStart: ev => { ev.stopPropagation(); setDragEvt(e); ev.dataTransfer.effectAllowed = 'move' },
            onDragEnd: () => { setDragEvt(null); setDragOver(null) },
          }
          const dragOpacity = dragEvt?.id === e.id ? 0.4 : 1
          if (e.type === 'match') {
            return (
              <div key={e.id} {...dragProps} onClick={() => openEdit(e)} onContextMenu={onCtx} title={`Match${e.categorie ? ' · ' + e.categorie : ''}`}
                style={{ background: groupColor, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', display: 'flex', justifyContent: 'space-between', gap: 4, cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap', opacity: dragOpacity }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.adversaire || e.titre || 'Match'}</span>
                {e.domicile != null && <small style={{ fontSize: '0.5rem', fontWeight: 700, opacity: 0.9 }}>{e.domicile ? 'dom' : 'ext'}</small>}
              </div>
            )
          }
          if (e.type === 'recup') {
            return <div key={e.id} {...dragProps} onClick={() => openEdit(e)} onContextMenu={onCtx} title="Récup" style={{ flex: 1, minHeight: 20, cursor: 'grab', opacity: dragOpacity }} />
          }
          if (e.type === 'test') {
            return <div key={e.id} {...dragProps} onClick={() => openEdit(e)} onContextMenu={onCtx} title="Tests" style={{ background: T.color, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', cursor: 'grab', overflow: 'hidden', whiteSpace: 'nowrap', opacity: dragOpacity }}>{e.titre || T.label}</div>
          }
          const neutral = T.neutral
          const txt = e.type === 'entrainement' ? (e.style || e.titre || T.label) : (e.titre || T.short || T.label)
          return (
            <div key={e.id} {...dragProps} onClick={() => openEdit(e)} onContextMenu={onCtx} title={T.label}
              style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '0 5px', lineHeight: '20px', cursor: 'grab',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', opacity: dragOpacity,
                color: neutral ? '#5b626c' : '#3a4049',
                background: neutral ? '#f0f2f5' : `color-mix(in srgb, ${T.color} 9%, #fff)`,
                borderLeft: `3px solid ${neutral ? '#c4ccd4' : `color-mix(in srgb, ${T.color} 70%, #fff)`}`,
              }}>
              {txt}
            </div>
          )
        })}
      </div>
    )
  }

  const seasonOpts = [seasonStartYear() - 1, seasonStartYear(), seasonStartYear() + 1]
  const pageStyle = embedded ? S.pageEmbed : S.page

  return (
    <div style={pageStyle}>
      {/* ── Barre d'actions ── */}
      <div style={S.toolbar}>
        {!embedded && <h1 style={S.h1}>Calendrier saison</h1>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: embedded ? 0 : 'auto' }}>
          {!groupeId && (
            <div style={S.groupSel}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: groupColor, flexShrink: 0 }} />
              <select value={groupe?.id || ''} onChange={e => setGroupe(groupes.find(g => g.id === e.target.value))} style={S.select}>
                {groupes.length === 0 && <option>Aucun groupe</option>}
                {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
              </select>
            </div>
          )}
          <select value={startYear} onChange={e => setStartYear(Number(e.target.value))} style={S.select}>
            {seasonOpts.map(y => <option key={y} value={y}>Saison {y} / {y + 1}</option>)}
          </select>
          <button style={S.btnDark} onClick={() => openCreate()}><span style={{ color: '#e4f816' }}>+</span> Ajouter</button>
        </div>
      </div>

      {/* ── Résumé + légende ── */}
      <div style={S.summary}>
        <Stat v={matchsList.length} l="Matchs" />
        <span style={S.sep} />
        <Stat v={evenements.filter(e => e.type === 'entrainement').length} l="Entraînements" />
        <span style={S.sep} />
        <Stat v={evenements.length} l="Évènements" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 13, flexWrap: 'wrap' }}>
          <Leg c={groupColor} t="Match" />
          <Leg c={TYPES.entrainement.color} t="Entraînement" />
          <Leg c={TYPES.muscu.color} t="Musculation" />
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#9aa1ac', fontSize: '0.85rem', padding: '2rem' }}>Chargement…</p>
      ) : !groupe ? (
        <p style={{ color: '#9aa1ac', fontSize: '0.85rem', padding: '2rem' }}>Crée d'abord un groupe pour planifier sa saison.</p>
      ) : (
        <>
          {/* ── Ruban des phases ── */}
          <div style={S.phrow}>
            {ribbon.map((r, i) => (
              <div key={i} style={{ ...S.phseg, background: r.couleur, flex: r.span, minWidth: r.span * 108 }}>{r.label}</div>
            ))}
          </div>

          {/* ── Grille saison ── */}
          <div style={S.gridwrap}>
            <div style={S.grid}>
              {months.map(M => {
                const ph = phaseOfMonth(M.y, M.m)
                return (
                  <div key={`${M.y}-${M.m}`} style={S.mcol}>
                    <div style={{ ...S.mch, borderTop: `3px solid ${ph?.couleur || '#e6e8ec'}` }}>
                      <div style={S.mm}>{M.label}</div><div style={S.my}>{M.y}</div>
                    </div>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                      if (d > M.days) return <div key={d} style={S.blank}><div style={S.dnum} /><div style={S.ddow} /><div style={{ flex: 1 }} /></div>
                      const dow = new Date(M.y, M.m, d).getDay()
                      const vac = vacInfo(M.y, M.m, d)
                      const isToday = ymd(M.y, M.m, d) === todayKey
                      const dISO = iso(M.y, M.m, d)
                      return (
                        <div key={d}>
                          {vac.in && vac.start && <div style={S.vacband}>{vac.label}</div>}
                          <div onDoubleClick={e => openPop(e, dISO)} onContextMenu={e => openPop(e, dISO)}
                            onDragOver={dragEvt ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== dISO) setDragOver(dISO) }) : undefined}
                            onDrop={dragEvt ? (e => { e.preventDefault(); moveEvent(dragEvt, dISO); setDragEvt(null); setDragOver(null) }) : undefined}
                            style={{ ...S.drow, ...(vac.in ? S.drowVac : null), ...(isToday ? S.drowToday : null), ...(dragOver === dISO ? S.drowDrop : null) }}>
                            <div style={S.dnum}>{d}</div>
                            <div style={S.ddow}>{DOW[dow]}</div>
                            {renderCell(M.y, M.m, d)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#9aa1ac', marginTop: 10 }}>
            Double-clic ou clic droit sur un jour pour ajouter · glisser-déposer une séance pour la changer de jour · clic droit sur une séance pour copier / coller.
            {clip && <span style={{ color: groupColor, fontWeight: 700 }}> · 📋 « {clipLabel(clip.source)} » dans le presse-papier</span>}
          </p>
        </>
      )}

      {/* ── Menu contextuel ── */}
      {ctx && (
        <div style={{ ...S.ctxMenu, left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          {ctx.evt ? (
            <>
              <button style={S.ctxItem} onClick={() => { openEdit(ctx.evt); setCtx(null) }}>✏️ Modifier</button>
              <button style={S.ctxItem} onClick={() => copyEvent(ctx.evt)}>📋 Copier</button>
              {clip && <button style={S.ctxItem} onClick={() => pasteEvent(ctx.dateISO)}>📌 Coller ici</button>}
              <div style={S.ctxSep} />
              <button style={{ ...S.ctxItem, color: '#e11d48' }} onClick={() => { deleteEventDirect(ctx.evt); setCtx(null) }}>🗑 Supprimer</button>
            </>
          ) : (
            <>
              <button style={S.ctxItem} onClick={() => { openCreate(ctx.dateISO); setCtx(null) }}>➕ Ajouter un évènement</button>
              {clip && <button style={S.ctxItem} onClick={() => pasteEvent(ctx.dateISO)}>📌 Coller « {clipLabel(clip.source)} »</button>}
            </>
          )}
        </div>
      )}

      {/* ── Bulle de création sur un jour ── */}
      {pop && (
        <>
          <div style={S.popScrim} onClick={() => setPop(null)} onContextMenu={e => { e.preventDefault(); setPop(null) }} />
          <div style={{ ...S.popover, left: pop.x, top: pop.y }} onClick={e => e.stopPropagation()}>
            <div style={S.popHead}>
              <span style={S.popDate}>{formatPopDate(pop.form.date)}</span>
              <span style={{ color: '#9aa1ac', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1 }} onClick={() => setPop(null)}>×</span>
            </div>

            {/* choix du type */}
            <div style={S.popTypes}>
              {CREATE_TYPES.map(k => {
                const t = TYPES[k]
                const on = pop.form.type === k
                return (
                  <button key={k} onClick={() => setPopForm({ type: k })}
                    style={{ ...S.popType, ...(on ? { borderColor: '#333333', background: '#333333', color: '#fff' } : null) }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: k === 'match' ? groupColor : (t.color || '#cbd1d9') }} />
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* champs compacts selon le type */}
            {pop.form.type === 'match' && (
              <>
                <input value={pop.form.adversaire} onChange={e => setPopForm({ adversaire: e.target.value })} placeholder="Adversaire" style={S.popInput} />
                <div style={S.popCats}>
                  {MATCH_CATEGORIES.map(c => (
                    <button key={c} onClick={() => setPopForm({ categorie: c })}
                      style={{ ...S.popCat, ...(pop.form.categorie === c ? { borderColor: '#333333', background: '#f2f3f5', fontWeight: 700 } : null) }}>{c}</button>
                  ))}
                </div>
              </>
            )}
            {pop.form.type === 'entrainement' && (
              <input value={pop.form.style} onChange={e => setPopForm({ style: e.target.value })} placeholder="Style (ex. Vitesse, Collectif…)" style={S.popInput} />
            )}
            {pop.form.type === 'muscu' && (
              <input value={pop.form.titre} onChange={e => setPopForm({ titre: e.target.value })} placeholder="Titre (ex. Force max)" style={S.popInput} />
            )}

            <div style={{ display: 'flex', gap: 7 }}>
              <input type="time" value={pop.form.heure} onChange={e => setPopForm({ heure: e.target.value })} style={{ ...S.popInput, flex: 1, marginBottom: 0 }} />
              <input type="number" value={pop.form.duree_min} onChange={e => setPopForm({ duree_min: e.target.value })} placeholder="min" style={{ ...S.popInput, width: 64, marginBottom: 0 }} />
            </div>

            {clip && (
              <button style={S.popPaste} onClick={() => { pasteEvent(pop.form.date); setPop(null) }}>
                📌 Coller « {clipLabel(clip.source)} »
              </button>
            )}

            <div style={S.popActions}>
              <button style={S.popGhost} onClick={() => quickSave(true)} disabled={saving}>Détails…</button>
              <button style={S.popCreate} onClick={() => quickSave(false)} disabled={saving}>
                <span style={{ color: '#e4f816' }}>{saving ? '…' : 'Créer'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Panneau ── */}
      {panel && <div style={S.scrim} onClick={closePanel} />}
      {panel && (
        <div style={S.panel}>
          <PanelHead panel={panel} groupColor={groupColor} onClose={closePanel} />
          <div style={S.pbody}>
            <EventForm form={panel.form} setForm={setForm} groupColor={groupColor} />
            {(HAS_BLOCS.includes(panel.form.type) || panel.form.type === 'collectif') && (
              <BlocsEditor panel={panel} addBloc={addBloc} updateBloc={updateBloc} deleteBloc={deleteBloc}
                addExo={addExo} updateExo={updateExo} deleteExo={deleteExo} />
            )}
          </div>
          <div style={S.pactions}>
            {panel.mode === 'edit' && <button style={S.btnGhostDanger} onClick={deleteEvent} disabled={saving}>Supprimer</button>}
            <button style={S.btn} onClick={closePanel}>Fermer</button>
            <button style={S.btnDark} onClick={saveEvent} disabled={saving}>
              <span style={{ color: '#e4f816' }}>{saving ? '…' : panel.mode === 'create' ? 'Créer' : 'Enregistrer'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function clipLabel(e) {
  if (!e) return ''
  if (e.type === 'match') return e.adversaire || 'Match'
  if (e.type === 'entrainement') return e.style || e.titre || 'Entraînement'
  return e.titre || (TYPES[e.type]?.label) || 'Évènement'
}
function formatPopDate(dateISO) {
  if (!dateISO) return ''
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/* ── Sous-composants ── */
function Stat({ v, l }) {
  return <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{v}</span>
    <span style={{ fontSize: '0.64rem', color: '#9aa1ac', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{l}</span>
  </div>
}
function Leg({ c, t }) {
  return <div style={{ fontSize: '0.64rem', color: '#5b626c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
    <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{t}
  </div>
}
function PanelHead({ panel, groupColor, onClose }) {
  const T = TYPES[panel.form.type] || TYPES.autre
  const col = panel.form.type === 'match' ? groupColor : (T.color || '#5b626c')
  const titre = panel.form.type === 'entrainement'
    ? (panel.form.style || panel.form.titre || T.label)
    : (panel.form.titre || panel.form.adversaire || T.label)
  return (
    <div style={S.phead}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...S.tag, background: col }}>{T.label}</span>
        <span style={{ color: '#9aa1ac', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }} onClick={onClose}>×</span>
      </div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '11px 0 2px' }}>
        {panel.mode === 'create' ? 'Nouvel évènement' : titre}
      </h2>
    </div>
  )
}
function Field({ label, children }) {
  return <label style={{ display: 'block', marginBottom: 11 }}>
    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 4 }}>{label}</span>
    {children}
  </label>
}
function EventForm({ form, setForm, groupColor }) {
  return (
    <div>
      <Field label="Type">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
          {CREATE_TYPES.map(k => {
            const t = TYPES[k]
            return (
              <button key={k} onClick={() => setForm({ type: k })}
                style={{ ...S.typeCard, ...(form.type === k ? { borderColor: '#15181d', background: '#f7f8fa' } : null) }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: k === 'match' ? groupColor : (t.color || '#cbd1d9') }} />
                {t.label}
              </button>
            )
          })}
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Date"><input type="date" value={form.date} onChange={e => setForm({ date: e.target.value })} style={S.input} /></Field>
        <Field label="Heure"><input type="time" value={form.heure} onChange={e => setForm({ heure: e.target.value })} style={S.input} /></Field>
      </div>

      {form.type === 'match' && (
        <>
          <Field label="Adversaire"><input value={form.adversaire} onChange={e => setForm({ adversaire: e.target.value })} placeholder="ex. Montauban" style={S.input} /></Field>
          <Field label="Catégorie">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              {MATCH_CATEGORIES.map(c => (
                <button key={c} onClick={() => setForm({ categorie: c })}
                  style={{ ...S.chip, ...(form.categorie === c ? { borderColor: '#15181d', background: '#15181d', color: '#fff' } : null) }}>
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Lieu du match">
              <select value={form.domicile ? '1' : '0'} onChange={e => setForm({ domicile: e.target.value === '1' })} style={S.input}>
                <option value="1">Domicile</option><option value="0">Extérieur</option>
              </select>
            </Field>
            <Field label="Journée"><input value={form.journee} onChange={e => setForm({ journee: e.target.value })} placeholder="ex. J12" style={S.input} /></Field>
          </div>
        </>
      )}

      {form.type === 'entrainement' && (
        <>
          <Field label="Style d'entraînement"><input value={form.style} onChange={e => setForm({ style: e.target.value })} placeholder="ex. Vitesse, Collectif, Prévention…" style={S.input} /></Field>
          <Field label="Titre (optionnel)"><input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Travail d'appuis" style={S.input} /></Field>
        </>
      )}

      {form.type === 'muscu' && (
        <Field label="Titre"><input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Force max bas du corps" style={S.input} /></Field>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="Lieu"><input value={form.lieu} onChange={e => setForm({ lieu: e.target.value })} placeholder="Salle…" style={S.input} /></Field>
        <Field label="Durée (min)"><input type="number" value={form.duree_min} onChange={e => setForm({ duree_min: e.target.value })} style={S.input} /></Field>
        <Field label="Charge"><input value={form.charge} onChange={e => setForm({ charge: e.target.value })} placeholder="Haute…" style={S.input} /></Field>
      </div>
      <Field label="Note"><textarea value={form.note} onChange={e => setForm({ note: e.target.value })} rows={2} style={{ ...S.input, resize: 'vertical' }} /></Field>
    </div>
  )
}
function BlocsEditor({ panel, addBloc, updateBloc, deleteBloc, addExo, updateExo, deleteExo }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Déroulé en blocs</span>
        <button style={S.btnSmall} onClick={addBloc}>+ Bloc</button>
      </div>
      {panel.mode === 'create' && <p style={{ fontSize: '0.72rem', color: '#9aa1ac' }}>Enregistre la séance pour construire son déroulé.</p>}
      {panel.blocs.map(b => (
        <div key={b.id} style={S.bloc}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 6 }}>
            <input value={b.nom} onChange={e => updateBloc(b.id, { nom: e.target.value })} placeholder="Nom du bloc" style={{ ...S.input, flex: 1, fontWeight: 700 }} />
            <input value={b.duree || ''} onChange={e => updateBloc(b.id, { duree: e.target.value })} placeholder="durée" style={{ ...S.input, width: 70 }} />
            <button style={S.xBtn} onClick={() => deleteBloc(b.id)}>×</button>
          </div>
          {b.exos.map(x => (
            <div key={x.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 5 }}>
              <input value={x.nom} onChange={e => updateExo(b.id, x.id, { nom: e.target.value })} placeholder="Exercice" style={S.inputSm} />
              <input value={x.prescription || ''} onChange={e => updateExo(b.id, x.id, { prescription: e.target.value })} placeholder="5 × 4 @ 85 %" style={S.inputSm} />
              <button style={S.xBtn} onClick={() => deleteExo(b.id, x.id)}>×</button>
            </div>
          ))}
          <button style={{ ...S.btnSmall, width: '100%', marginTop: 4 }} onClick={() => addExo(b.id)}>+ Exercice</button>
        </div>
      ))}
    </div>
  )
}

/* ── Styles ── */
const S = {
  page: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '20px 24px 40px', background: '#f5f6f8', minHeight: 'calc(100vh - 60px)', color: '#15181d' },
  pageEmbed: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#15181d' },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  h1: { fontSize: '1.3rem', fontWeight: 800, margin: 0 },
  groupSel: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '4px 10px' },
  select: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#15181d', cursor: 'pointer' },
  btn: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 600, color: '#5b626c', cursor: 'pointer' },
  btnDark: { background: '#333333', color: '#fff', border: '1px solid #333333', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' },
  btnGhostDanger: { border: '1px solid #f3c2c8', background: '#fff', color: '#e11d48', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginRight: 'auto' },
  btnSmall: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 7, padding: '5px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#5b626c', cursor: 'pointer' },
  summary: { display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, flexWrap: 'wrap' },
  sep: { width: 1, height: 26, background: '#e6e8ec' },
  phrow: { display: 'flex', minWidth: 'max-content', border: '1px solid #e6e8ec', borderBottom: 'none', borderRadius: '11px 11px 0 0', overflow: 'hidden', background: '#fafbfc' },
  phseg: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 24, fontSize: '0.58rem', fontWeight: 800, color: '#fff', letterSpacing: '0.04em', textTransform: 'uppercase', borderRight: '1px solid rgba(255,255,255,0.25)' },
  gridwrap: { overflowX: 'auto', border: '1px solid #e6e8ec', borderRadius: '0 0 11px 11px', background: '#fff' },
  grid: { display: 'flex', minWidth: 'max-content' },
  mcol: { flex: 1, minWidth: 108, borderRight: '1px solid #e6e8ec' },
  mch: { position: 'sticky', top: 0, zIndex: 5, textAlign: 'center', padding: '7px 4px 6px', background: '#fbfcfd', borderBottom: '1px solid #e6e8ec' },
  mm: { fontSize: '0.74rem', fontWeight: 800 },
  my: { fontSize: '0.5rem', fontWeight: 700, color: '#9aa1ac', letterSpacing: '0.04em' },
  drow: { display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #eef0f3', minHeight: 20 },
  drowVac: { background: '#fdf8ea' },
  drowToday: { boxShadow: 'inset 0 0 0 2px #333333', position: 'relative', zIndex: 2 },
  drowDrop: { background: '#eaf7ec', boxShadow: 'inset 0 0 0 2px #34c759', position: 'relative', zIndex: 3 },
  blank: { display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #eef0f3', minHeight: 20, background: 'repeating-linear-gradient(45deg,#fafbfc,#fafbfc 5px,#f1f3f5 5px,#f1f3f5 10px)' },
  dnum: { width: 17, fontSize: '0.56rem', color: '#5b626c', textAlign: 'center', fontWeight: 700, lineHeight: '20px', borderRight: '1px solid #eef0f3', flexShrink: 0 },
  ddow: { width: 13, fontSize: '0.52rem', color: '#9aa1ac', textAlign: 'center', lineHeight: '20px', textTransform: 'uppercase', flexShrink: 0 },
  vacband: { fontSize: '0.5rem', fontWeight: 800, color: '#a16207', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '1px 5px', background: '#f4e8c4', lineHeight: 1.6 },
  scrim: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,0.4)', zIndex: 50 },
  panel: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '94vw', background: '#f5f6f8', zIndex: 60, display: 'flex', flexDirection: 'column', boxShadow: '-16px 0 50px rgba(0,0,0,0.22)' },
  phead: { background: '#fff', padding: '16px 20px 14px', borderBottom: '1px solid #e6e8ec' },
  tag: { fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 9px', borderRadius: 5, color: '#fff' },
  pbody: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  pactions: { display: 'flex', gap: 9, padding: '13px 20px', background: '#fff', borderTop: '1px solid #e6e8ec' },
  typeCard: { display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '9px 9px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', color: '#15181d', justifyContent: 'center' },
  chip: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px 10px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', color: '#15181d' },
  input: { width: '100%', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px 10px', fontSize: '0.82rem', color: '#15181d', boxSizing: 'border-box', background: '#fff' },
  inputSm: { border: '1px solid #e6e8ec', borderRadius: 7, padding: '6px 8px', fontSize: '0.76rem', color: '#15181d', boxSizing: 'border-box', background: '#fff', width: '100%' },
  bloc: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 9, padding: 11, marginBottom: 8 },
  xBtn: { border: 'none', background: 'none', color: '#c2c8d0', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  ctxMenu: { position: 'fixed', zIndex: 70, background: '#fff', borderRadius: 10, border: '1px solid #e6e8ec', boxShadow: '0 12px 34px rgba(0,0,0,0.18)', padding: 5, minWidth: 190, display: 'flex', flexDirection: 'column' },
  ctxItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 7, padding: '8px 11px', fontSize: '0.8rem', fontWeight: 600, color: '#15181d', cursor: 'pointer' },
  ctxSep: { height: 1, background: '#eef0f3', margin: '4px 0' },
  // bulle de création
  popScrim: { position: 'fixed', inset: 0, zIndex: 68, background: 'transparent' },
  popover: { position: 'fixed', zIndex: 69, width: 272, background: '#fff', borderRadius: 12, border: '1px solid #e6e8ec', boxShadow: '0 16px 44px rgba(0,0,0,0.22)', padding: 12 },
  popHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  popDate: { fontSize: '0.72rem', fontWeight: 800, color: '#15181d', textTransform: 'capitalize' },
  popTypes: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 9 },
  popType: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 7, padding: '7px 4px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', color: '#15181d' },
  popInput: { width: '100%', border: '1px solid #e6e8ec', borderRadius: 8, padding: '7px 9px', fontSize: '0.8rem', color: '#15181d', boxSizing: 'border-box', background: '#fff', marginBottom: 8 },
  popCats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 },
  popCat: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 7, padding: '6px 6px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', color: '#15181d' },
  popPaste: { width: '100%', background: '#f5f6f8', border: '1px solid #e6e8ec', borderRadius: 8, padding: '7px', fontSize: '0.74rem', fontWeight: 700, color: '#5b626c', cursor: 'pointer', marginBottom: 8 },
  popActions: { display: 'flex', gap: 7 },
  popGhost: { flex: 1, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px', fontSize: '0.76rem', fontWeight: 600, color: '#5b626c', cursor: 'pointer' },
  popCreate: { flex: 1, background: '#333333', border: '1px solid #333333', borderRadius: 8, padding: '8px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' },
}
