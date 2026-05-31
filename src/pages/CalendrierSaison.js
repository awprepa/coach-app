import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

/* ─────────────────────────────────────────────────────────────────────────────
   Calendrier saison (préparateur physique) — vue mois × jours par groupe.
   Les matchs ressortent en pavés couleur-du-groupe (repères de la saison).
   Clic sur une séance → panneau détail (édition + déroulé en blocs/exercices).
   ───────────────────────────────────────────────────────────────────────────── */

const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S']            // index getDay()
const MOIS_LABEL = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

// Types d'évènement : teintes douces désaturées (cohérent maquette validée)
const TYPES = {
  match:      { label: 'Match',      color: null,       solid: 'group' }, // couleur du groupe
  collectif:  { label: 'Collectif',  color: '#98a2ad',  neutral: true },
  muscu:      { label: 'Muscu',      color: '#b08769' },
  vitesse:    { label: 'Vitesse',    color: '#6b94a3' },
  prevention: { label: 'Prévention', color: '#8c7ea6', short: 'Activ.' },
  recup:      { label: 'Récup',      color: null,       blank: true },
  test:       { label: 'Tests',      color: '#454c57',  dark: true },
  autre:      { label: 'Autre',      color: '#9aa1ac' },
}
// types qui ont un déroulé en blocs/exercices
const HAS_BLOCS = ['muscu', 'vitesse', 'prevention', 'recup', 'autre']

const ymd = (y, m, d) => `${y}-${m}-${d}`                  // clé carte (m 0-based)
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// 11 mois Août(start) → Juin(start+1)
function buildMonths(startYear) {
  const out = []
  for (let i = 0; i < 11; i++) {
    const m = (7 + i) % 12
    const y = startYear + (7 + i >= 12 ? 1 : 0)
    out.push({ y, m, label: MOIS_LABEL[m], days: new Date(y, m + 1, 0).getDate() })
  }
  return out
}
function seasonStartYear(date = new Date()) {
  return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1
}

export default function CalendrierSaison() {
  const [groupes, setGroupes]   = useState([])
  const [groupe, setGroupe]     = useState(null)
  const [startYear, setStartYear] = useState(seasonStartYear())
  const [evenements, setEvenements] = useState([])
  const [phases, setPhases]     = useState([])
  const [loading, setLoading]   = useState(true)

  // Panneau : { mode:'edit'|'create', evt, form, blocs }
  const [panel, setPanel] = useState(null)
  const [saving, setSaving] = useState(false)

  const groupColor = groupe?.couleur || '#2f6f76'
  const months = buildMonths(startYear)
  const seasonStart = iso(startYear, 7, 1)
  const seasonEnd   = iso(startYear + 1, 5, 30)

  // ── Chargement des groupes ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('groupes').select('*').order('nom').then(({ data }) => {
      setGroupes(data || [])
      if (data?.length) setGroupe(data[0])
      else setLoading(false)
    })
  }, [])

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
  function openCreate(dateISO) {
    setPanel({
      mode: 'create', evt: null,
      form: { type: 'muscu', date: dateISO || seasonStart, heure: '', titre: '', adversaire: '', domicile: true, journee: '', lieu: '', duree_min: '', charge: '', note: '' },
      blocs: [],
    })
  }
  async function openEdit(e) {
    let blocs = []
    if (HAS_BLOCS.includes(e.type) || e.type === 'collectif') {
      const { data } = await supabase.from('groupe_seance_blocs')
        .select('*, groupe_seance_exercices(*)').eq('evenement_id', e.id).order('ordre')
      blocs = (data || []).map(b => ({ ...b, exos: (b.groupe_seance_exercices || []).sort((a, z) => a.ordre - z.ordre) }))
    }
    setPanel({
      mode: 'edit', evt: e,
      form: {
        type: e.type, date: e.date, heure: e.heure || '', titre: e.titre || '',
        adversaire: e.adversaire || '', domicile: e.domicile ?? true, journee: e.journee || '',
        lieu: e.lieu || '', duree_min: e.duree_min || '', charge: e.charge || '', note: e.note || '',
      },
      blocs,
    })
  }
  function closePanel() { setPanel(null) }
  const setForm = patch => setPanel(p => ({ ...p, form: { ...p.form, ...patch } }))

  async function saveEvent() {
    if (!panel || !groupe) return
    setSaving(true)
    const f = panel.form
    const payload = {
      groupe_id: groupe.id, date: f.date, heure: f.heure || null, type: f.type,
      titre: f.titre || null, lieu: f.lieu || null,
      duree_min: f.duree_min ? Number(f.duree_min) : null, charge: f.charge || null, note: f.note || null,
      adversaire: f.type === 'match' ? (f.adversaire || null) : null,
      domicile:   f.type === 'match' ? !!f.domicile : null,
      journee:    f.type === 'match' ? (f.journee || null) : null,
    }
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
    if (!window.confirm('Supprimer cet évènement ?')) return
    setSaving(true)
    await supabase.from('groupe_evenements').delete().eq('id', panel.evt.id)
    setSaving(false)
    await loadSeason()
    closePanel()
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

  // ── Rendu cellule jour ────────────────────────────────────────────────────────
  function renderCell(y, m, d) {
    const evs = evByDay[ymd(y, m, d)] || []
    if (!evs.length) return <div style={{ flex: 1 }} />
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {evs.map(e => {
          const T = TYPES[e.type] || TYPES.autre
          if (e.type === 'match') {
            return (
              <div key={e.id} onClick={() => openEdit(e)} title="Match"
                style={{ background: groupColor, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', display: 'flex', justifyContent: 'space-between', gap: 4, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.adversaire || e.titre || 'Match'}</span>
                {e.domicile != null && <small style={{ fontSize: '0.5rem', fontWeight: 700, opacity: 0.9 }}>{e.domicile ? 'dom' : 'ext'}</small>}
              </div>
            )
          }
          if (e.type === 'recup') {
            return <div key={e.id} onClick={() => openEdit(e)} title="Récup" style={{ flex: 1, minHeight: 20, cursor: 'pointer' }} />
          }
          if (e.type === 'test') {
            return <div key={e.id} onClick={() => openEdit(e)} title="Tests" style={{ background: T.color, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' }}>{e.titre || T.label}</div>
          }
          const neutral = T.neutral
          return (
            <div key={e.id} onClick={() => openEdit(e)} title={T.label}
              style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '0 5px', lineHeight: '20px', cursor: 'pointer',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                color: neutral ? '#5b626c' : '#3a4049',
                background: neutral ? '#f0f2f5' : `color-mix(in srgb, ${T.color} 9%, #fff)`,
                borderLeft: `3px solid ${neutral ? '#c4ccd4' : `color-mix(in srgb, ${T.color} 70%, #fff)`}`,
              }}>
              {e.titre || T.short || T.label}
            </div>
          )
        })}
      </div>
    )
  }

  const seasonOpts = [seasonStartYear() - 1, seasonStartYear(), seasonStartYear() + 1]

  return (
    <div style={S.page}>
      {/* ── Barre d'actions ── */}
      <div style={S.toolbar}>
        <h1 style={S.h1}>Calendrier saison</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={S.groupSel}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: groupColor, flexShrink: 0 }} />
            <select value={groupe?.id || ''} onChange={e => setGroupe(groupes.find(g => g.id === e.target.value))} style={S.select}>
              {groupes.length === 0 && <option>Aucun groupe</option>}
              {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
            </select>
          </div>
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
        <Stat v={matchsList.filter(m => m.terminee).length} l="Joués" />
        <span style={S.sep} />
        <Stat v={evenements.length} l="Évènements" />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 13, flexWrap: 'wrap' }}>
          <Leg c={groupColor} t="Match" />
          <Leg c={TYPES.muscu.color} t="Muscu" />
          <Leg c={TYPES.vitesse.color} t="Vitesse" />
          <Leg c={TYPES.prevention.color} t="Prévention" />
          <Leg c={TYPES.collectif.color} t="Collectif" />
          <Leg c={TYPES.test.color} t="Tests" />
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
                      return (
                        <div key={d}>
                          {vac.in && vac.start && <div style={S.vacband}>{vac.label}</div>}
                          <div onDoubleClick={() => openCreate(iso(M.y, M.m, d))}
                            style={{ ...S.drow, ...(vac.in ? S.drowVac : null), ...(isToday ? S.drowToday : null) }}>
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
          <p style={{ fontSize: '0.72rem', color: '#9aa1ac', marginTop: 10 }}>Double-clic sur un jour pour ajouter un évènement · clic sur une séance pour l'éditer.</p>
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
  return (
    <div style={S.phead}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...S.tag, background: col }}>{T.label}</span>
        <span style={{ color: '#9aa1ac', fontSize: '1.3rem', cursor: 'pointer', lineHeight: 1 }} onClick={onClose}>×</span>
      </div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '11px 0 2px' }}>
        {panel.mode === 'create' ? 'Nouvel évènement' : (panel.form.titre || panel.form.adversaire || T.label)}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {Object.entries(TYPES).map(([k, t]) => (
            <button key={k} onClick={() => setForm({ type: k })}
              style={{ ...S.typeCard, ...(form.type === k ? { borderColor: '#15181d', background: '#f7f8fa' } : null) }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: k === 'match' ? groupColor : (t.color || '#cbd1d9') }} />
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Date"><input type="date" value={form.date} onChange={e => setForm({ date: e.target.value })} style={S.input} /></Field>
        <Field label="Heure"><input type="time" value={form.heure} onChange={e => setForm({ heure: e.target.value })} style={S.input} /></Field>
      </div>
      {form.type === 'match' ? (
        <>
          <Field label="Adversaire"><input value={form.adversaire} onChange={e => setForm({ adversaire: e.target.value })} placeholder="ex. Montauban" style={S.input} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Lieu">
              <select value={form.domicile ? '1' : '0'} onChange={e => setForm({ domicile: e.target.value === '1' })} style={S.input}>
                <option value="1">Domicile</option><option value="0">Extérieur</option>
              </select>
            </Field>
            <Field label="Journée"><input value={form.journee} onChange={e => setForm({ journee: e.target.value })} placeholder="ex. J12" style={S.input} /></Field>
          </div>
        </>
      ) : (
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
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  h1: { fontSize: '1.3rem', fontWeight: 800, margin: 0 },
  groupSel: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '4px 10px' },
  select: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem', fontWeight: 600, color: '#15181d', cursor: 'pointer' },
  btn: { border: '1px solid #e6e8ec', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 600, color: '#5b626c', cursor: 'pointer' },
  btnDark: { background: '#15181d', color: '#fff', border: '1px solid #15181d', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' },
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
  drowToday: { boxShadow: 'inset 0 0 0 2px #15181d', position: 'relative', zIndex: 2 },
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
  typeCard: { display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 8, padding: '9px 11px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', color: '#15181d' },
  input: { width: '100%', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px 10px', fontSize: '0.82rem', color: '#15181d', boxSizing: 'border-box', background: '#fff' },
  inputSm: { border: '1px solid #e6e8ec', borderRadius: 7, padding: '6px 8px', fontSize: '0.76rem', color: '#15181d', boxSizing: 'border-box', background: '#fff', width: '100%' },
  bloc: { background: '#fff', border: '1px solid #e6e8ec', borderRadius: 9, padding: 11, marginBottom: 8 },
  xBtn: { border: 'none', background: 'none', color: '#c2c8d0', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
}
