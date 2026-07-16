import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// ── Agenda global (coach) ─────────────────────────────────────────────────────
// Vue d'ensemble en lecture seule de TOUTES les séances de tous les clients et
// de tous les groupes. Chaque pastille porte deux infos d'un coup d'œil :
//   • le liseré gauche = TYPE de séance (match, muscu, entraînement, repos…)
//   • le fond teinté    = QUI (couleur de la catégorie du client / du groupe)
// Clic sur un jour → panneau détaillé avec liens vers les fiches.

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MOIS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

// Couleurs par type — alignées sur les calendriers existants (Calendrier.js).
const TYPE_STYLE = {
  seance:      { label: 'Séance',       color: '#0ea5e9' },
  entrainement:{ label: 'Entraînement', color: '#f97316' },
  match:       { label: 'Match',        color: '#1e3a8a' },
  combat:      { label: 'Combat',       color: '#dc2626' },
  competition: { label: 'Compétition',  color: '#7c3aed' },
  repos:       { label: 'Repos',        color: '#9ca3af' },
  collectif:   { label: 'Collectif',    color: '#f97316' },
  muscu:       { label: 'Muscu',        color: '#6366f1' },
  vitesse:     { label: 'Vitesse',      color: '#0891b2' },
  prevention:  { label: 'Prévention',   color: '#16a34a' },
  recup:       { label: 'Récup',        color: '#14b8a6' },
  vacances:    { label: 'Vacances',     color: '#9ca3af' },
  test:        { label: 'Test',         color: '#7c3aed' },
  autre:       { label: 'Autre',        color: '#0f766e' },
}
function typeStyle(t) { return TYPE_STYLE[t] || TYPE_STYLE.autre }

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getMonthDays(year, month) {
  const first = new Date(year, month, 1)
  let offset = first.getDay() - 1; if (offset < 0) offset = 6
  const start = new Date(first); start.setDate(1 - offset)
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d })
}
function getWeekDays(date) {
  const d = new Date(date); const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return Array.from({ length: 7 }, (_, i) => { const c = new Date(d); c.setDate(c.getDate() + i); return c })
}
function tint(hex, alpha) {
  if (!hex || typeof hex !== 'string') return 'rgba(148,163,184,0.12)'
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return 'rgba(148,163,184,0.12)'
  return `rgba(${r},${g},${b},${alpha})`
}

export default function AgendaGlobal() {
  const navigate = useNavigate()
  const [vue, setVue]           = useState('mois')       // 'mois' | 'semaine'
  const [anchor, setAnchor]     = useState(new Date())   // date de référence
  const [mode, setMode]         = useState('tout')       // 'tout' | 'clients' | 'groupes'
  const [groupeId, setGroupeId] = useState('')           // filtre par groupe (id) ou '' = tous
  const [selDay, setSelDay]     = useState(null)         // 'YYYY-MM-DD'
  const [clientsMap, setClientsMap] = useState({})       // id → { prenom, nom, couleur }
  const [groupes, setGroupes]   = useState([])           // [{ id, nom, couleur, logo_url }]
  const [events, setEvents]     = useState([])           // événements normalisés
  const [loading, setLoading]   = useState(true)

  const todayStr = fmt(new Date())

  // Jours visibles selon la vue → bornes de requête.
  const days = useMemo(() => (
    vue === 'mois' ? getMonthDays(anchor.getFullYear(), anchor.getMonth()) : getWeekDays(anchor)
  ), [vue, anchor])
  const rangeStart = fmt(days[0])
  const rangeEnd   = fmt(days[days.length - 1])

  // Chargement des référentiels (clients + groupes) une fois.
  useEffect(() => {
    (async () => {
      const [{ data: cl }, { data: gr }] = await Promise.all([
        supabase.from('clients').select('id, prenom, nom, categories(couleur)').order('prenom'),
        supabase.from('groupes').select('id, nom, couleur, logo_url').order('nom'),
      ])
      const cm = {}
      ;(cl || []).forEach(c => { cm[c.id] = { prenom: c.prenom, nom: c.nom, couleur: c.categories?.couleur || null } })
      setClientsMap(cm)
      setGroupes(gr || [])
    })()
  }, [])

  // Chargement des événements de la plage visible.
  async function fetchEvents() {
    const [{ data: evs }, { data: gevs }] = await Promise.all([
      supabase.from('evenements')
        .select('id, client_id, date, type, titre, terminee, seances(nom)')
        .gte('date', rangeStart).lte('date', rangeEnd),
      supabase.from('groupe_evenements')
        .select('id, groupe_id, date, heure, type, titre, adversaire, domicile, journee, lieu, terminee, groupes(nom, couleur, logo_url)')
        .gte('date', rangeStart).lte('date', rangeEnd),
    ])
    const list = []
    ;(evs || []).forEach(e => list.push({
      id: 'c-' + e.id, kind: 'client', date: e.date, heure: null,
      type: e.type, terminee: e.terminee,
      who: null, whoId: e.client_id,          // résolu via clientsMap au rendu
      title: e.seances?.nom || e.titre || typeStyle(e.type).label,
      linkTo: '/client/' + e.client_id,
    }))
    ;(gevs || []).forEach(e => {
      const g = e.groupes || {}
      let title = e.titre || typeStyle(e.type).label
      if (e.type === 'match') title = (e.adversaire ? `vs ${e.adversaire}` : (e.titre || 'Match')) + (e.domicile === false ? ' (ext.)' : e.domicile ? ' (dom.)' : '')
      list.push({
        id: 'g-' + e.id, kind: 'groupe', date: e.date, heure: e.heure || null,
        type: e.type, terminee: e.terminee,
        who: g.nom || 'Groupe', whoColor: g.couleur || null, logoUrl: g.logo_url || null,
        groupeId: e.groupe_id, lieu: e.lieu || null, title,
        linkTo: '/groupe/' + e.groupe_id,
      })
    })
    setEvents(list)
    setLoading(false)
  }
  useEffect(() => { setLoading(true); fetchEvents() /* eslint-disable-next-line */ }, [rangeStart, rangeEnd])

  // Temps réel : toute modif d'événement rafraîchit la plage courante (throttle).
  const refetchTimer = useRef(null)
  useEffect(() => {
    const ping = () => { clearTimeout(refetchTimer.current); refetchTimer.current = setTimeout(fetchEvents, 400) }
    const ch = supabase.channel('agenda-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evenements' }, ping)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groupe_evenements' }, ping)
      .subscribe()
    return () => { clearTimeout(refetchTimer.current); supabase.removeChannel(ch) }
  /* eslint-disable-next-line */ }, [rangeStart, rangeEnd])

  // Résolution du "qui" + couleur pour les événements client (dépend de clientsMap).
  const resolved = useMemo(() => events.map(e => {
    if (e.kind === 'client') {
      const c = clientsMap[e.whoId]
      return { ...e, who: c ? c.prenom : 'Client', whoColor: c?.couleur || null }
    }
    return e
  }), [events, clientsMap])

  // Filtres.
  const filtered = useMemo(() => resolved.filter(e => {
    if (mode === 'clients' && e.kind !== 'client') return false
    if (mode === 'groupes' && e.kind !== 'groupe') return false
    if (groupeId && !(e.kind === 'groupe' && e.groupeId === groupeId)) return false
    return true
  }), [resolved, mode, groupeId])

  // Regroupement par jour, trié (heure d'abord si dispo).
  const byDay = useMemo(() => {
    const m = {}
    filtered.forEach(e => { (m[e.date] ||= []).push(e) })
    Object.values(m).forEach(arr => arr.sort((a, b) => (a.heure || '99').localeCompare(b.heure || '99')))
    return m
  }, [filtered])

  function shift(delta) {
    const d = new Date(anchor)
    if (vue === 'mois') d.setMonth(d.getMonth() + delta)
    else d.setDate(d.getDate() + delta * 7)
    setAnchor(d); setSelDay(null)
  }

  const periodLabel = vue === 'mois'
    ? `${MOIS[anchor.getMonth()]} ${anchor.getFullYear()}`
    : (() => { const w = getWeekDays(anchor); return `${w[0].getDate()} ${MOIS[w[0].getMonth()].slice(0,3)} – ${w[6].getDate()} ${MOIS[w[6].getMonth()].slice(0,3)} ${w[6].getFullYear()}` })()

  const total = filtered.length
  const selEvents = selDay ? (byDay[selDay] || []) : []

  return (
    <div style={S.page}>
      <style>{`
        @media (max-width: 620px){
          .agenda-panel{
            top:auto !important; bottom:0 !important; right:0 !important; left:0 !important;
            width:auto !important; max-height:70vh !important;
            border-radius:18px 18px 0 0 !important;
          }
        }
      `}</style>
      {/* En-tête */}
      <div style={S.topbar}>
        <div>
          <h1 style={S.h1}>Agenda global</h1>
          <p style={S.sub}>{loading ? 'Chargement…' : `${total} séance${total > 1 ? 's' : ''} sur la période`}</p>
        </div>
        <div style={S.controls}>
          <div style={S.seg}>
            {['tout', 'clients', 'groupes'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ ...S.segBtn, ...(mode === m ? S.segOn : {}) }}>
                {m === 'tout' ? 'Tout' : m === 'clients' ? 'Clients' : 'Groupes'}
              </button>
            ))}
          </div>
          <select value={groupeId} onChange={e => setGroupeId(e.target.value)} style={S.select}>
            <option value="">Tous les groupes</option>
            {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
          </select>
          <div style={S.seg}>
            <button onClick={() => setVue('mois')}    style={{ ...S.segBtn, ...(vue === 'mois'    ? S.segOn : {}) }}>Mois</button>
            <button onClick={() => setVue('semaine')} style={{ ...S.segBtn, ...(vue === 'semaine' ? S.segOn : {}) }}>Semaine</button>
          </div>
        </div>
      </div>

      {/* Navigation période */}
      <div style={S.navrow}>
        <button onClick={() => shift(-1)} style={S.navBtn}>‹</button>
        <span style={S.period}>{periodLabel}</span>
        <button onClick={() => shift(1)} style={S.navBtn}>›</button>
        <button onClick={() => { setAnchor(new Date()); setSelDay(null) }} style={S.todayBtn}>Aujourd'hui</button>
        <div style={{ flex: 1 }} />
        <Legend />
      </div>

      {/* Grille — pleine largeur */}
      <div>
        <div>
          <div style={S.weekHead}>
            {JOURS.map(j => <div key={j} style={S.weekHeadCell}>{j}</div>)}
          </div>
          <div style={vue === 'mois' ? S.gridMonth : S.gridWeek}>
            {days.map(day => {
              const ds = fmt(day)
              const evs = byDay[ds] || []
              const isToday = ds === todayStr
              const isSel = ds === selDay
              const dim = vue === 'mois' && day.getMonth() !== anchor.getMonth()
              const max = vue === 'mois' ? 4 : 8
              return (
                <div key={ds} onClick={() => setSelDay(ds)} style={{
                  ...(vue === 'mois' ? S.cellMonth : S.cellWeek),
                  opacity: dim ? 0.4 : 1,
                  border: isSel ? '2px solid #1a1a1a' : isToday ? '2px solid var(--accent, #e4f816)' : '1px solid #eef0f3',
                  background: isSel ? '#fafafa' : 'white',
                }}>
                  <div style={S.dayNum}>
                    <span style={{ fontWeight: isToday ? 800 : 600, color: isToday ? '#111' : '#6b7280' }}>{day.getDate()}</span>
                    {evs.length > 0 && <span style={S.dayCount}>{evs.length}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
                    {evs.slice(0, max).map(e => <Chip key={e.id} e={e} />)}
                    {evs.length > max && <span style={S.more}>+{evs.length - max} autres</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Panneau détail du jour sélectionné — tiroir flottant (n'affecte pas la grille) */}
        {selDay && (
          <>
          <div onClick={() => setSelDay(null)} style={S.backdrop} />
          <div className="agenda-panel" style={S.panel}>
            <div style={S.panelHead}>
              <div>
                <p style={S.panelDate}>{new Date(selDay + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p style={S.panelSub}>{selEvents.length} séance{selEvents.length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setSelDay(null)} style={S.panelClose}>✕</button>
            </div>
            {selEvents.length === 0 && <p style={S.empty}>Aucune séance ce jour.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selEvents.map(e => (
                <button key={e.id} onClick={() => navigate(e.linkTo)} style={{
                  ...S.row, borderLeft: `4px solid ${typeStyle(e.type).color}`,
                  background: tint(e.whoColor, 0.1), opacity: e.terminee ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {e.kind === 'groupe' && e.logoUrl
                      ? <img src={e.logoUrl} alt="" style={S.rowLogo} />
                      : <span style={{ ...S.rowDot, background: e.whoColor || '#cbd5e1' }} />}
                    <div style={{ minWidth: 0 }}>
                      <p style={S.rowWho}>{e.who}{e.terminee ? ' ✓' : ''}</p>
                      <p style={S.rowTitle}>
                        {e.heure ? e.heure.slice(0, 5) + ' · ' : ''}{e.title}{e.lieu ? ` · ${e.lieu}` : ''}
                      </p>
                    </div>
                  </div>
                  <span style={{ ...S.rowType, color: typeStyle(e.type).color }}>{typeStyle(e.type).label}</span>
                </button>
              ))}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ e }) {
  const c = typeStyle(e.type).color
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      borderLeft: `3px solid ${c}`, background: tint(e.whoColor, 0.14),
      padding: '2px 5px', borderRadius: 4, fontSize: '0.68rem', fontWeight: 700,
      color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      opacity: e.terminee ? 0.55 : 1,
    }}>
      {e.kind === 'groupe' && e.logoUrl && (
        <img src={e.logoUrl} alt="" style={{ width: 11, height: 11, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.who}</span>
    </div>
  )
}

function Legend() {
  const shown = ['match', 'entrainement', 'muscu', 'seance', 'competition', 'repos']
  return (
    <div style={S.legend}>
      {shown.map(t => (
        <span key={t} style={S.legendItem}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: typeStyle(t).color, display: 'inline-block' }} />
          {typeStyle(t).label}
        </span>
      ))}
      <span style={{ ...S.legendItem, color: '#9ca3af' }}>· fond = client / groupe</span>
    </div>
  )
}

const S = {
  page:    { padding: '1.25rem 1.5rem 2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  topbar:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' },
  h1:      { margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#111' },
  sub:     { margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 },
  controls:{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  seg:     { display: 'inline-flex', background: '#f3f4f6', borderRadius: 9, padding: 3, gap: 3 },
  segBtn:  { border: 'none', background: 'transparent', borderRadius: 7, padding: '5px 11px', fontSize: '0.8rem', fontWeight: 700, color: '#9ca3af', cursor: 'pointer' },
  segOn:   { background: 'white', color: '#111', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  select:  { border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '6px 10px', fontSize: '0.8rem', fontWeight: 600, background: 'white', color: '#374151', cursor: 'pointer' },
  navrow:  { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  navBtn:  { width: 34, height: 34, borderRadius: 9, border: '1.5px solid #e5e7eb', background: 'white', fontSize: '1.2rem', color: '#374151', cursor: 'pointer', lineHeight: 1 },
  period:  { fontSize: '1.05rem', fontWeight: 800, color: '#111', minWidth: 170, textAlign: 'center', textTransform: 'capitalize' },
  todayBtn:{ border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 9, padding: '7px 12px', fontSize: '0.78rem', fontWeight: 700, color: '#374151', cursor: 'pointer' },
  legend:  { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: '#6b7280' },
  backdrop:{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 55 },
  weekHead:{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 },
  weekHeadCell: { textAlign: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' },
  gridMonth: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '1fr', gap: 6 },
  gridWeek:  { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 },
  cellMonth: { minHeight: 118, boxSizing: 'border-box', borderRadius: 10, padding: '6px 6px 5px', cursor: 'pointer', overflow: 'hidden' },
  cellWeek:  { minHeight: 380, boxSizing: 'border-box', borderRadius: 10, padding: '8px', cursor: 'pointer', overflow: 'hidden' },
  dayNum:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.8rem' },
  dayCount:{ fontSize: '0.6rem', fontWeight: 800, color: '#9ca3af', background: '#f3f4f6', borderRadius: 999, padding: '0 6px', lineHeight: '15px' },
  more:    { fontSize: '0.6rem', color: '#9ca3af', fontWeight: 700, paddingLeft: 2 },
  panel:   { position: 'fixed', top: 78, right: 16, width: 340, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto', zIndex: 60, background: 'white', border: '1px solid #eef0f3', borderRadius: 14, padding: '1rem', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' },
  panelHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  panelDate: { margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111', textTransform: 'capitalize' },
  panelSub:  { margin: '2px 0 0', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600 },
  panelClose:{ border: 'none', background: '#f3f4f6', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: '#6b7280', fontSize: '0.8rem' },
  empty:   { fontSize: '0.82rem', color: '#9ca3af', fontWeight: 600, textAlign: 'center', padding: '1.5rem 0' },
  row:     { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid #eef0f3', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', textAlign: 'left' },
  rowLogo: { width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  rowDot:  { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  rowWho:  { margin: 0, fontSize: '0.82rem', fontWeight: 800, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowTitle:{ margin: '1px 0 0', fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowType: { fontSize: '0.66rem', fontWeight: 800, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.03em' },
}
