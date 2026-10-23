import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import { getCoachId, sendNotif } from '../notifs'
import { isoLocal } from '../utils/dates'
import Icon from './Icon'
import T from '../theme/tokens'
import { fmtAllure, fmtDistance, fmtDuree, lireFichierCourse } from '../utils/fichierCourse'

const EVENT_TYPES = [
  { value: 'seance',       label: 'Séance',        bg: 'var(--chip-bg)', text: 'var(--chip-text)' },
  { value: 'entrainement', label: 'Entraînement',  bg: '#f97316', text: 'white'   },
  { value: 'match',        label: 'Match',         bg: 'var(--chip-bg)', text: 'var(--chip-text)' },
  { value: 'combat',       label: 'Combat',        bg: '#dc2626', text: 'white'   },
  { value: 'competition',  label: 'Compétition',   bg: '#7c3aed', text: 'white'   },
  { value: 'course',       label: 'Course',        bg: '#0f766e', text: 'white'   },
  { value: 'repos',        label: 'Repos',         bg: T.color.soft, text: T.color.muted },
  { value: 'autre',        label: 'Autre',         bg: '#ccfbf1', text: '#115e59' },
]

// Types supplémentaires utilisés dans les groupes (groupe_evenements)
const GROUP_EXTRA_TYPES = {
  collectif:   { label: 'Collectif',    bg: '#f97316', text: 'white'   },
  muscu:       { label: 'Muscu',        bg: '#6366f1', text: 'white'   },
  vacances:    { label: 'Vacances',     bg: T.color.soft, text: T.color.muted },
  competition: { label: 'Compétition',  bg: '#7c3aed', text: 'white'   },
  ffr_match:   { label: 'Match FFR',    bg: '#1e3a8a', text: 'white'   },
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MOIS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function getTypeStyle(type) {
  return EVENT_TYPES.find(t => t.value === type)
    || (GROUP_EXTRA_TYPES[type] ? { value: type, ...GROUP_EXTRA_TYPES[type] } : null)
    || EVENT_TYPES[0]
}
function getTypeLabel(type) {
  return EVENT_TYPES.find(t => t.value === type)?.label
    || GROUP_EXTRA_TYPES[type]?.label
    || type
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
function getPeriodWeeks(startDate, numWeeks) {
  const d = new Date(startDate); const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return Array.from({ length: numWeeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => { const c = new Date(d); c.setDate(c.getDate() + w * 7 + i); return c })
  )
}
function getCycleWeek(date, programmeDebut, programmeSemaines) {
  if (!programmeDebut) return null
  const debut = new Date(programmeDebut + 'T00:00:00')
  const debutDay = debut.getDay()
  debut.setDate(debut.getDate() + (debutDay === 0 ? -6 : 1 - debutDay))
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  const diff = Math.floor((d - debut) / (1000 * 60 * 60 * 24))
  if (diff < 0) return null
  const w = Math.floor(diff / 7) + 1
  return w > programmeSemaines ? null : w
}
function generateICS(events) {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AWprepa//AWprepa//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH']
  events.forEach(ev => {
    const d = ev.date.replace(/-/g, '')
    const next = new Date(ev.date + 'T00:00:00'); next.setDate(next.getDate() + 1)
    const nd = isoLocal(next).replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nd}`,
      `SUMMARY:${ev.titre}`, `UID:awprepa-${ev.id}@awprepa.com`, 'END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function EventChip({ ev, tiny = false }) {
  const ts = getTypeStyle(ev.type)
  const logoSize = tiny ? 10 : 12
  return (
    <span style={{
      background: ts.bg, color: ts.text,
      fontSize: tiny ? 11 : T.size.xs, fontWeight: 600, lineHeight: 1.3,
      padding: tiny ? '1px 4px' : '2px 6px', borderRadius: 4,
      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      display: 'flex', alignItems: 'center', gap: 3,
    }}>
      {ev._isGroupe && !ev._isFFR && ev._groupeLogoUrl && (
        <img loading="lazy" src={ev._groupeLogoUrl} alt="" style={{ width: logoSize, height: logoSize, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }} />
      )}
      {ev.titre}
    </span>
  )
}

function MonthView({ year, month, todayStr, selectedStr, eventsMap, onDayClick, programmeDebut, programmeSemaines }) {
  const days = getMonthDays(year, month)
  const cells = []
  cells.push(<div key="corner" />)
  JOURS.forEach(j => cells.push(
    <div key={`h-${j}`} style={{ textAlign: 'center', fontSize: T.size.xs, fontWeight: 600, color: T.color.muted, padding: '4px 0' }}>{j}</div>
  ))
  for (let row = 0; row < 6; row++) {
    const weekDays = days.slice(row * 7, row * 7 + 7)
    const cycleW = getCycleWeek(weekDays[0], programmeDebut, programmeSemaines)
    cells.push(
      <div key={`sw-${row}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: cycleW ? 'var(--chip-bg)' : 'transparent', borderRadius: 6 }}>
        {cycleW
          ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--chip-text)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.04em' }}>S{cycleW}</span>
          : null}
      </div>
    )
    weekDays.forEach(day => {
      const ds = formatDate(day); const isToday = ds === todayStr; const isSel = ds === selectedStr
      const evs = eventsMap[ds] || []; const inCycle = !!cycleW
      cells.push(
        <div role="button" tabIndex={0} key={ds} onClick={() => onDayClick(day)} style={{
          minHeight: 48, overflow: 'hidden', boxSizing: 'border-box',
          background: isSel ? 'var(--chip-bg)' : inCycle ? T.color.card : T.color.page,
          borderRadius: 8, padding: '5px 4px', cursor: 'pointer',
          border: isToday ? `2px solid ${T.color.ink}` : `1px solid ${inCycle ? T.color.line : 'transparent'}`,
          opacity: day.getMonth() === month ? 1 : 0.4,
        }}>
          <span style={{ ...T.num, fontSize: T.size.sm, fontWeight: isToday ? 700 : 500, color: isSel ? 'var(--chip-text)' : T.color.ink, display: 'block', marginBottom: 3 }}>{day.getDate()}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
            {evs.slice(0, 2).map(ev => <EventChip key={ev.id} ev={ev} tiny />)}
            {evs.length > 2 && <span style={{ fontSize: 11, color: isSel ? 'var(--chip-text)' : T.color.muted, fontWeight: 600 }}>+{evs.length - 2}</span>}
          </div>
        </div>
      )
    })
  }
  return <div style={{ display: 'grid', gridTemplateColumns: '22px repeat(7,1fr)', gap: 2 }}>{cells}</div>
}

function WeekView({ date, todayStr, selectedStr, eventsMap, onDayClick, programmeDebut, programmeSemaines }) {
  const days = getWeekDays(date)
  const cycleW = getCycleWeek(days[0], programmeDebut, programmeSemaines)
  return (
    <div>
      {cycleW ? (
        <div style={{ background: 'var(--header-bg)', borderRadius: T.radius.control, padding: '0.875rem 1.25rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ color: T.color.onDarkMuted, fontSize: T.size.xs, fontWeight: 600, margin: 0 }}>Cycle en cours</p>
            <p style={{ color: 'var(--header-text)', fontFamily: T.font.display, fontSize: T.size.xl, fontWeight: 700, margin: '0.2rem 0 0' }}>Semaine {cycleW} <span style={{ color: T.color.onDarkMuted, fontWeight: 500 }}>/ {programmeSemaines}</span></p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, background: 'rgb(255 255 255 / .14)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 999, width: `${Math.round((cycleW / programmeSemaines) * 100)}%` }} />
            </div>
            <p style={{ color: T.color.onDarkMuted, fontSize: T.size.xs, margin: '0.3rem 0 0', textAlign: 'right' }}>{Math.round((cycleW / programmeSemaines) * 100)}%</p>
          </div>
        </div>
      ) : <div style={{ height: 8 }} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {days.map((day, i) => {
          const ds = formatDate(day); const isToday = ds === todayStr; const isSel = ds === selectedStr
          const evs = eventsMap[ds] || []
          return (
            <div role="button" tabIndex={0} key={i} onClick={() => onDayClick(day)} style={{
              height: 150, overflow: 'hidden', boxSizing: 'border-box',
              background: isSel ? 'var(--chip-bg)' : cycleW ? T.color.card : T.color.page,
              borderRadius: T.radius.control, padding: '10px 6px', cursor: 'pointer',
              border: isToday ? `2px solid ${T.color.ink}` : `1px solid ${cycleW ? T.color.line : 'transparent'}`,
            }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: T.size.xs, fontWeight: 600, color: isSel ? 'var(--chip-text)' : T.color.muted, margin: '0 0 2px' }}>{JOURS[i]}</p>
                <span style={{ ...T.num, fontSize: T.size.xl, fontWeight: 700, color: isSel ? 'var(--chip-text)' : T.color.ink }}>{day.getDate()}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
                {evs.slice(0, 3).map(ev => <EventChip key={ev.id} ev={ev} />)}
                {evs.length > 3 && <span style={{ fontSize: T.size.xs, color: isSel ? 'var(--chip-text)' : T.color.muted, fontWeight: 600, textAlign: 'center' }}>+{evs.length - 3}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PeriodView({ startDate, numWeeks, todayStr, selectedStr, eventsMap, onDayClick }) {
  const weeks = getPeriodWeeks(startDate, numWeeks)
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '24px repeat(7,1fr)', gap: 3, marginBottom: 3 }}>
        <div />
        {JOURS.map(j => <div key={j} style={{ textAlign: 'center', fontSize: T.size.xs, fontWeight: 600, color: T.color.muted }}>{j}</div>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: '24px repeat(7,1fr)', gap: 3, marginBottom: 4, alignItems: 'stretch' }}>
          <div style={{ background: 'var(--chip-bg)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--chip-text)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>S{wi + 1}</span>
          </div>
          {week.map((day, di) => {
            const ds = formatDate(day); const isToday = ds === todayStr; const isSel = ds === selectedStr
            const evs = eventsMap[ds] || []
            return (
              <div role="button" tabIndex={0} key={di} onClick={() => onDayClick(day)} style={{
                height: 64, overflow: 'hidden', boxSizing: 'border-box',
                background: isSel ? 'var(--chip-bg)' : T.color.card, borderRadius: 8, padding: '5px',
                cursor: 'pointer', border: isToday ? `2px solid ${T.color.ink}` : `1px solid ${T.color.line}`,
              }}>
                <span style={{ ...T.num, fontSize: T.size.xs, fontWeight: 600, color: isSel ? 'var(--chip-text)' : T.color.ink, display: 'block', marginBottom: 3 }}>{day.getDate()}/{day.getMonth()+1}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                  {evs.slice(0, 2).map(ev => <EventChip key={ev.id} ev={ev} tiny />)}
                  {evs.length > 2 && <span style={{ fontSize: 11, color: isSel ? 'var(--chip-text)' : T.color.muted, fontWeight: 600 }}>+{evs.length-2}</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Course : résumé lu dans le fichier GPX/TCX, tracé, lien Strava ──
function TraceCourse({ trace, couleur }) {
  if (!trace || trace.length < 2) return null
  const lats = trace.map(p => p[0]), lons = trace.map(p => p[1])
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)]
  const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180) // longitudes resserrées selon la latitude
  const w = Math.max((lo1 - lo0) * k, 1e-6), h = Math.max(la1 - la0, 1e-6)
  const ech = 90 / Math.max(w, h)
  const pts = trace.map(([la, lo]) => `${(5 + (lo - lo0) * k * ech).toFixed(1)},${(5 + (la1 - la) * ech).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${10 + w * ech} ${10 + h * ech}`} style={{ width: 72, height: 72, flexShrink: 0, background: 'rgb(255 255 255 / .14)', borderRadius: 8 }} aria-label="Tracé de la course">
      <polyline points={pts} fill="none" stroke={couleur} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function ResumeCourse({ activite, couleur }) {
  if (!activite) return null
  const stats = [
    activite.distance_m ? fmtDistance(activite.distance_m) : null,
    fmtDuree(activite.duree_s),
    fmtAllure(activite.allure_s_km),
    activite.denivele_m ? `D+ ${activite.denivele_m} m` : null,
    activite.fc_moy ? `FC moy. ${activite.fc_moy}${activite.fc_max ? ` · max ${activite.fc_max}` : ''}` : null,
  ].filter(Boolean)
  return (
    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', marginTop: '0.45rem' }}>
      <TraceCourse trace={activite.trace} couleur={couleur} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {stats.length > 0 && <span style={{ fontSize: T.size.sm, fontWeight: 600, lineHeight: 1.45 }}>{stats.join(' · ')}</span>}
        {activite.strava_url && (
          <a href={activite.strava_url} target="_blank" rel="noreferrer"
            style={{ alignSelf: 'flex-start', fontSize: T.size.sm, fontWeight: 700, color: couleur, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Voir sur Strava
          </a>
        )}
      </div>
    </div>
  )
}

// Aide : exporter le fichier d'une course depuis Strava
function AideExportStrava() {
  return (
    <details style={{ fontSize: T.size.sm, color: T.color.muted, lineHeight: 1.5 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: T.color.ink }}>Comment récupérer le fichier depuis Strava ?</summary>
      <ol style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
        <li>Ouvre strava.com dans ton navigateur (pas l'app Strava). Sur téléphone, demande la « version ordinateur » du site.</li>
        <li>Ouvre ta course, appuie sur « … » puis « Exporter GPX ».</li>
        <li>Reviens ici et choisis le fichier téléchargé (dans « Fichiers » ou « Téléchargements »).</li>
      </ol>
      <p style={{ margin: '0.4rem 0 0' }}>Un fichier GPX ou TCX de Garmin, Coros ou Suunto marche aussi.</p>
    </details>
  )
}

export default function Calendrier({ clientId, readOnly = false, eventSource = 'coach', programmeDebut, programmeSemaines = 8, seances = [], onViewSeance }) {
  const [vue, setVue]                 = useState('mois')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [evenements, setEvenements]   = useState([])
  const [groupEvts, setGroupEvts]     = useState([])
  const [ffrMatchs, setFfrMatchs]     = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [form, setForm]               = useState({ type: 'seance', titre: '', seanceId: '', description: '' })
  const [saving, setSaving]           = useState(false)
  const [lectureCourse, setLectureCourse] = useState(null) // { evId?, enCours, erreur }
  const [showSyncModal, setShowSyncModal] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchEvenements() }, [clientId])

  // Récupère les événements des groupes auxquels appartient ce client
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchGroupEvenements() }, [clientId])

  // Matchs FFR des groupes du client
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchFFRMatchs() }, [clientId])

  // Temps réel — mise à jour instantanée quand le coach ou le client
  // ajoute / modifie / supprime un événement depuis n'importe quel device
  useEffect(() => {
    if (!clientId) return
    const channel = supabase
      .channel(`calendrier-${clientId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'evenements',
        filter: `client_id=eq.${clientId}`,
      }, payload => {
        if (payload.eventType === 'DELETE') {
          setEvenements(prev => prev.filter(e => e.id !== payload.old.id))
        } else {
          fetchEvenements()
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [clientId])

  async function fetchEvenements() {
    const { data } = await supabase
      .from('evenements')
      .select('*, seances(nom)')
      .eq('client_id', clientId)
      .order('date', { ascending: true })
    setEvenements((data || []).map(ev => ({
      ...ev,
      titre: ev.seances?.nom || ev.titre,
    })))
  }

  async function fetchGroupEvenements() {
    if (!clientId) { setGroupEvts([]); return }
    // 1. Trouver les groupes du client
    const { data: memberships } = await supabase
      .from('groupe_membres')
      .select('groupe_id')
      .eq('client_id', clientId)
    if (!memberships || memberships.length === 0) { setGroupEvts([]); return }
    const groupIds = memberships.map(m => m.groupe_id)
    // Récupérer les logos des groupes
    const { data: groupesData } = await supabase
      .from('groupes').select('id, logo_url').in('id', groupIds)
    const groupeLogoMap = Object.fromEntries((groupesData || []).map(g => [g.id, g.logo_url]))
    // 2. Récupérer les événements de ces groupes
    const { data: gevts } = await supabase
      .from('groupe_evenements')
      .select('id, date, type, titre, style, heure, groupe_id')
      .in('groupe_id', groupIds)
      .order('date', { ascending: true })
    setGroupEvts((gevts || []).map(e => ({
      ...e,
      _isGroupe: true,
      _groupeLogoUrl: groupeLogoMap[e.groupe_id] || null,
      // Titre affiché : titre libre > "Type Style" > "Type"
      titre: e.titre || (e.style ? `${getTypeLabel(e.type)} ${e.style}` : getTypeLabel(e.type)),
    })))
  }

  async function fetchFFRMatchs() {
    if (!clientId) { setFfrMatchs([]); return }
    const { data: memberships } = await supabase
      .from('groupe_membres').select('groupe_id').eq('client_id', clientId)
    if (!memberships?.length) { setFfrMatchs([]); return }
    const groupIds = memberships.map(m => m.groupe_id)
    const { data: matchs } = await supabase
      .from('matchs_ffr').select('*').in('groupe_id', groupIds).order('date_match')
    setFfrMatchs((matchs || []).map(m => {
      const adv = m.est_domicile === true  ? m.equipe_ext
                : m.est_domicile === false ? m.equipe_dom
                : (m.equipe_ext || m.equipe_dom || 'Adversaire')
      const joue = m.score_dom != null && m.score_ext != null
      const scoreStr = joue
        ? (m.est_domicile ? `${m.score_dom}-${m.score_ext}` : m.est_domicile === false ? `${m.score_ext}-${m.score_dom}` : `${m.score_dom}-${m.score_ext}`)
        : null
      return {
        ...m,
        id: `ffr-${m.id}`,
        date: m.date_match,
        type: 'ffr_match',
        _isFFR: true,
        titre: `${adv}${scoreStr ? ` ${scoreStr}` : ''}`,
        // Conserver les champs bruts pour le panneau détail
        _raw: m,
      }
    }))
  }

  async function ajouterEvenement() {
    const titre = (form.type === 'seance' && seances.length > 0)
      ? (seances.find(s => s.id === form.seanceId)?.nom || form.titre)
      : form.type === 'course' ? (form.titre?.trim() || 'Course') : form.titre
    if (!titre?.trim() || !selectedDay) return
    const strava = form.type === 'course' ? lienStrava(form.strava) : null
    const activite = form.type === 'course' && (form.activite || strava) ? { ...(form.activite || {}), strava_url: strava } : null
    setSaving(true)
    const payload = {
      client_id: clientId,
      date: formatDate(selectedDay),
      type: form.type,
      titre,
      seance_id: form.type === 'seance' && form.seanceId ? form.seanceId : null,
      description: form.description?.trim() || null,
      source: eventSource,
      ...(activite ? { activite } : {}),
    }
    const { data, error } = await supabase.from('evenements').insert([payload]).select().single()
    if (error) alert(error.message)
    else {
      setEvenements(prev => [...prev, data])
      setForm({ type: 'seance', titre: '', seanceId: '', description: '' })
      setLectureCourse(null)
      if (eventSource === 'client') notifierCoachNouvelEvenement(data)
    }
    setSaving(false)
  }

  async function notifierCoachNouvelEvenement(ev) {
    try {
      const [{ data: client }, coachId] = await Promise.all([
        supabase.from('clients').select('prenom, nom').eq('id', clientId).single(),
        getCoachId(),
      ])
      const nomClient = client ? `${client.prenom} ${client.nom}` : 'Un client'
      const dateAffichee = new Date(ev.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
      await sendNotif(coachId, {
        titre: `${nomClient} a ajouté un événement`,
        corps: `${getTypeLabel(ev.type)} — ${ev.titre} (${dateAffichee})`,
        type: 'calendrier',
        lien: `/client/${clientId}`,
      })
    } catch (e) {
      console.warn('[notifierCoachNouvelEvenement] échec :', e?.message)
    }
  }

  // Lien Strava : on ne garde qu'une adresse strava.com ou strava.app.link
  function lienStrava(v) {
    const t = (v || '').trim()
    if (!t) return null
    try {
      const u = new URL(t.startsWith('http') ? t : `https://${t}`)
      return /(^|\.)strava\.(com|app\.link)$/.test(u.hostname) ? u.toString() : null
    } catch { return null }
  }

  async function ajouterFichierCourse(ev, fichier) {
    setLectureCourse({ evId: ev.id, enCours: true })
    try {
      const a = await lireFichierCourse(fichier)
      const activite = { ...a, strava_url: ev.activite?.strava_url || null }
      const { error } = await supabase.from('evenements').update({ activite }).eq('id', ev.id)
      if (error) throw new Error('Le fichier n\u2019a pas pu être enregistré.')
      setEvenements(prev => prev.map(e => e.id === ev.id ? { ...e, activite } : e))
      setLectureCourse(null)
    } catch (err) { setLectureCourse({ evId: ev.id, erreur: err.message }) }
  }

  async function supprimerEvenement(evId) {
    const { error } = await supabase.from('evenements').delete().eq('id', evId)
    if (error) alert(error.message)
    else setEvenements(prev => prev.filter(e => e.id !== evId))
  }

  function exportICS() {
    if (evenements.length === 0) { alert('Aucun événement à exporter.'); return }
    const blob = new Blob([generateICS(evenements)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'awprepa-calendrier.ics'; a.click()
    URL.revokeObjectURL(url)
  }

  const eventsMap = {}
  ;[...evenements, ...groupEvts, ...ffrMatchs].forEach(ev => { if (!eventsMap[ev.date]) eventsMap[ev.date] = []; eventsMap[ev.date].push(ev) })

  const todayStr    = formatDate(new Date())
  const selectedStr = selectedDay ? formatDate(selectedDay) : null
  const selectedEvs = selectedDay ? (eventsMap[selectedStr] || []) : []

  let headerLabel = ''
  if (vue === 'mois') {
    headerLabel = `${MOIS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
  } else if (vue === 'semaine') {
    const w = getWeekDays(currentDate)
    headerLabel = `${w[0].getDate()} au ${w[6].getDate()} ${MOIS[w[6].getMonth()]} ${w[6].getFullYear()}`
  } else {
    const debut = programmeDebut ? new Date(programmeDebut + 'T00:00:00') : currentDate
    headerLabel = `${debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · ${programmeSemaines} sem.`
  }

  function prev() {
    setCurrentDate(d => {
      const n = new Date(d)
      if (vue === 'mois') n.setMonth(n.getMonth() - 1)
      else if (vue === 'semaine') n.setDate(n.getDate() - 7)
      else n.setDate(n.getDate() - programmeSemaines * 7)
      return n
    })
  }
  function next() {
    setCurrentDate(d => {
      const n = new Date(d)
      if (vue === 'mois') n.setMonth(n.getMonth() + 1)
      else if (vue === 'semaine') n.setDate(n.getDate() + 7)
      else n.setDate(n.getDate() + programmeSemaines * 7)
      return n
    })
  }

  const periodeDebut = programmeDebut ? new Date(programmeDebut + 'T00:00:00') : currentDate

  // Séances disponibles seulement si le jour sélectionné est dans la période du cycle actif
  const dayInCycle = selectedDay
    ? (getCycleWeek(selectedDay, programmeDebut, programmeSemaines) !== null && seances.length > 0)
    : seances.length > 0
  const visibleTypes = EVENT_TYPES.filter(t => t.value !== 'seance' || dayInCycle)

  function handleDayClick(day) {
    setSelectedDay(day)
    if (form.type === 'seance') {
      const inC = getCycleWeek(day, programmeDebut, programmeSemaines) !== null && seances.length > 0
      if (!inC) setForm(f => ({ ...f, type: 'autre', seanceId: '' }))
    }
  }

  // Formulaire d'ajout — rendu selon le type
  function renderForm() {
    if (form.type === 'seance' && seances.length > 0) {
      return (
        <select value={form.seanceId} onChange={e => setForm({ ...form, seanceId: e.target.value })} style={{ ...S.formInput, flex: 1 }}>
          <option value="">Choisir une séance</option>
          {seances.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
      )
    }
    if (form.type === 'course') {
      return (
        <div style={{ flex: '1 1 220px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <input type="text" placeholder="Titre (ex. Footing 45 min)" aria-label="Titre de la course"
            value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })}
            style={{ ...S.formInput, width: '100%', boxSizing: 'border-box' }} />
          <label style={{ ...S.formInput, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxSizing: 'border-box', fontSize: T.size.md, fontWeight: 600 }}>
            <Icon name="plus" size={16} />
            {lectureCourse?.enCours ? 'Lecture du fichier…' : form.activite?.distance_m ? 'Fichier ajouté : changer' : 'Ajouter le fichier de la course (GPX)'}
            <input type="file" accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml" style={{ display: 'none' }}
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (!f) return
                setLectureCourse({ enCours: true })
                try {
                  const a = await lireFichierCourse(f)
                  setForm(prev => ({ ...prev, activite: a, titre: prev.titre || a.nom || '' }))
                  setLectureCourse(null)
                } catch (err) { setLectureCourse({ erreur: err.message }) }
              }} />
          </label>
          {lectureCourse?.erreur && !lectureCourse.evId && <span style={{ fontSize: T.size.sm, color: T.color.danger, fontWeight: 600 }}>{lectureCourse.erreur}</span>}
          {form.activite?.distance_m != null && (
            <div style={{ background: '#0f766e', color: 'white', borderRadius: T.radius.control, padding: '0.5rem 0.65rem' }}>
              <ResumeCourse activite={form.activite} couleur="white" />
            </div>
          )}
          <input type="url" placeholder="Lien Strava (facultatif)" aria-label="Lien de la course sur Strava"
            value={form.strava || ''} onChange={e => setForm({ ...form, strava: e.target.value })}
            style={{ ...S.formInput, width: '100%', boxSizing: 'border-box' }} />
          <AideExportStrava />
        </div>
      )
    }
    if (form.type === 'autre') {
      return (
        <div style={{ flex: '1 1 220px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <input
            type="text" placeholder="Titre *" aria-label="Titre *"
            value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })}
            style={{ ...S.formInput, width: '100%', boxSizing: 'border-box' }}
          />
          <textarea
            placeholder="Description (optionnel)..." aria-label="Description (optionnel)..."
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
            style={{ ...S.formInput, width: '100%', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
          />
        </div>
      )
    }
    return (
      <input
        type="text" placeholder="Titre de l'événement" aria-label="Titre de l'événement"
        value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })}
        onKeyDown={e => e.key === 'Enter' && ajouterEvenement()}
        style={{ ...S.formInput, flex: 1, minWidth: 160 }}
      />
    )
  }

  return (
    <div style={{ fontFamily: T.font.body, color: T.color.ink }}>

      {/* Barre de contrôle — ligne 1 : vue + sync */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Vue du calendrier" style={{ display: 'flex', background: T.color.soft, borderRadius: T.radius.control, padding: 3, gap: 2 }}>
          {[{ k: 'mois', l: 'Mois' }, { k: 'semaine', l: 'Semaine' }, { k: 'periode', l: 'Cycle' }].map(v => (
            <button key={v.k} role="tab" aria-selected={vue === v.k} onClick={() => setVue(v.k)} style={{
              minHeight: 38, padding: '0 0.65rem', borderRadius: 8, border: 'none', fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 600,
              cursor: 'pointer', background: vue === v.k ? T.color.card : 'transparent',
              color: vue === v.k ? T.color.ink : T.color.muted,
              boxShadow: vue === v.k ? T.shadow.card : 'none',
            }}>{v.l}</button>
          ))}
        </div>

        {clientId && (
          <button onClick={() => setShowSyncModal(true)} aria-label="Synchroniser avec mon agenda" style={{
            minHeight: T.touch, padding: '0 0.75rem', borderRadius: T.radius.control, border: 'none', fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 700,
            cursor: 'pointer', background: 'var(--chip-bg)', color: 'var(--chip-text)', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}><Icon name="refresh" size={16} />Agenda</button>
        )}
      </div>

      {/* Barre de contrôle — ligne 2 : navigation date + export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={prev} style={S.navBtn} aria-label="Période précédente"><Icon name="chevron-right" size={18} style={{ transform: 'rotate(180deg)' }} /></button>
        <span style={{ fontFamily: T.font.display, fontSize: T.size.lg, fontWeight: 700, color: T.color.ink, flex: 1, textAlign: 'center' }}>{headerLabel}</span>
        <button onClick={next} style={S.navBtn} aria-label="Période suivante"><Icon name="chevron-right" size={18} /></button>
        <button onClick={() => { setCurrentDate(new Date()); setVue('semaine') }} style={{ ...S.navBtn, padding: '0 10px' }} aria-label="Revenir à aujourd'hui">Auj.</button>
        <button onClick={exportICS} style={{ ...S.navBtn, padding: '0 10px', gap: 4 }} aria-label="Télécharger le fichier .ics"><Icon name="download" size={16} />.ics</button>
      </div>

      {/* Légende */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        {EVENT_TYPES.map(t => (
          <span key={t.value} style={{ background: t.bg, color: t.text, padding: '2px 8px', borderRadius: 999, fontSize: T.size.xs, fontWeight: 600 }}>{t.label}</span>
        ))}
      </div>

      {/* Vues */}
      {vue === 'mois'    && <MonthView  year={currentDate.getFullYear()} month={currentDate.getMonth()} todayStr={todayStr} selectedStr={selectedStr} eventsMap={eventsMap} onDayClick={handleDayClick} programmeDebut={programmeDebut} programmeSemaines={programmeSemaines} />}
      {vue === 'semaine' && <WeekView   date={currentDate} todayStr={todayStr} selectedStr={selectedStr} eventsMap={eventsMap} onDayClick={handleDayClick} programmeDebut={programmeDebut} programmeSemaines={programmeSemaines} />}
      {vue === 'periode' && <PeriodView startDate={periodeDebut} numWeeks={programmeSemaines} todayStr={todayStr} selectedStr={selectedStr} eventsMap={eventsMap} onDayClick={handleDayClick} />}

      {/* Panel jour sélectionné */}
      {selectedDay && (
        <div style={S.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <p style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: T.size.lg, color: T.color.ink, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {getCycleWeek(selectedDay, programmeDebut, programmeSemaines) && (
                <span style={{ fontFamily: T.font.body, fontSize: T.size.xs, background: 'var(--chip-bg)', color: 'var(--chip-text)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                  S{getCycleWeek(selectedDay, programmeDebut, programmeSemaines)}
                </span>
              )}
            </p>
            <button onClick={() => setSelectedDay(null)} aria-label="Fermer" style={{ width: T.touch, height: T.touch, margin: '-10px -12px -10px 0', display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: T.color.muted, cursor: 'pointer', flexShrink: 0 }}><Icon name="x" size={18} /></button>
          </div>

          {selectedEvs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.875rem' }}>
              {selectedEvs.map(ev => {
                const ts = getTypeStyle(ev.type)

                // ── Match FFR ──────────────────────────────────────────────────
                if (ev._isFFR) {
                  const m = ev._raw
                  const joue = m.score_dom != null && m.score_ext != null
                  const win  = joue && (m.est_domicile ? m.score_dom > m.score_ext : m.est_domicile === false ? m.score_ext > m.score_dom : null)
                  const lose = joue && (m.est_domicile ? m.score_dom < m.score_ext : m.est_domicile === false ? m.score_ext < m.score_dom : null)
                  const bg = joue ? (win ? T.color.success : lose ? T.color.danger : T.color.muted) : T.color.anthracite
                  const notreNom  = m.est_domicile === true  ? m.equipe_dom : m.est_domicile === false ? m.equipe_ext : (m.equipe_dom || m.equipe_ext)
                  const advNom    = m.est_domicile === true  ? m.equipe_ext : m.est_domicile === false ? m.equipe_dom : (m.equipe_ext || m.equipe_dom)
                  const notreLogo = m.est_domicile === true  ? m.logo_dom   : m.est_domicile === false ? m.logo_ext   : (m.logo_dom || m.logo_ext)
                  const advLogo   = m.est_domicile === true  ? m.logo_ext   : m.est_domicile === false ? m.logo_dom   : (m.logo_ext || m.logo_dom)
                  const notreInit = (notreNom || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const advInit   = (advNom || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const logoG  = m.est_domicile !== false ? notreLogo : advLogo
                  const logoD  = m.est_domicile !== false ? advLogo   : notreLogo
                  const nomG   = m.est_domicile !== false ? notreNom  : advNom
                  const nomD   = m.est_domicile !== false ? advNom    : notreNom
                  const initG  = m.est_domicile !== false ? notreInit : advInit
                  const initD  = m.est_domicile !== false ? advInit   : notreInit
                  const scoreStr = joue
                    ? (m.est_domicile ? `${m.score_dom}-${m.score_ext}` : m.est_domicile === false ? `${m.score_ext}-${m.score_dom}` : `${m.score_dom}-${m.score_ext}`)
                    : null

                  function LogoBadgeSmall({ url, initials }) {
                    return (
                      <div style={{ width: 40, height: 40, borderRadius: T.radius.control,
                        background: 'rgb(255 255 255 / .9)', color: T.color.ink,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {url ? <img loading="lazy" src={url} alt={initials} style={{ width: 32, height: 32, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} /> : null}
                        <div style={{ width:'100%', height:'100%', display: url ? 'none' : 'flex', alignItems:'center', justifyContent:'center', fontSize: T.size.xs, fontWeight: 700 }}>{initials}</div>
                      </div>
                    )
                  }

                  return (
                    <div key={ev.id} style={{ background: bg, borderRadius: T.radius.control, padding: '10px 12px', color: '#fff' }}>
                      <div style={{ fontSize: T.size.xs, fontWeight: 600, opacity: .85, marginBottom: 8 }}>
                        Match FFR{m.journee ? ` · J${m.journee}` : ''}
                      </div>
                      {/* Logos + VS */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                          <LogoBadgeSmall url={logoG} initials={initG} />
                          <div style={{ fontSize: T.size.xs, fontWeight: 600, textAlign: 'center', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomG}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          {scoreStr
                            ? <span style={{ ...T.num, fontSize: T.size.xl, fontWeight: 700 }}>{scoreStr}</span>
                            : <span style={{ fontSize: T.size.sm, fontWeight: 700 }}>VS</span>
                          }
                          {!scoreStr && m.heure && <span style={{ fontSize: T.size.xs, opacity: .85 }}>{m.heure}</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                          <LogoBadgeSmall url={logoD} initials={initD} />
                          <div style={{ fontSize: T.size.xs, fontWeight: 600, textAlign: 'center', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomD}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                        {m.est_domicile != null && (
                          <span style={{ background: T.color.signal, color: T.color.ink, borderRadius: 6, padding: '2px 8px', fontSize: T.size.xs, fontWeight: 700 }}>
                            {m.est_domicile ? 'Domicile' : 'Extérieur'}
                          </span>
                        )}
                        {joue && <span style={{ background: 'rgb(255 255 255 / .2)', borderRadius: 6, padding: '2px 8px', fontSize: T.size.xs, fontWeight: 700 }}>
                          {win ? 'Victoire' : lose ? 'Défaite' : 'Nul'}
                        </span>}
                      </div>
                    </div>
                  )
                }

                // ── Événement groupe ───────────────────────────────────────────
                if (ev._isGroupe) {
                  return (
                    <div key={`g-${ev.id}`} style={{ background: ts.bg, color: ts.text, padding: '0.6rem 0.75rem', borderRadius: T.radius.control }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: T.size.md, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {ev._groupeLogoUrl && (
                              <img loading="lazy" src={ev._groupeLogoUrl} alt="" style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                            )}
                            {ev.titre}
                          </span>
                          {ev.heure && <span style={{ fontSize: T.size.xs, opacity: 0.85, marginLeft: '0.5rem' }}>· {ev.heure.slice(0,5)}</span>}
                        </div>
                      </div>
                    </div>
                  )
                }

                // ── Événement personnel ────────────────────────────────────────
                return (
                  <div key={ev.id} style={{ background: ts.bg, color: ts.text, padding: '0.6rem 0.75rem', borderRadius: T.radius.control }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: T.size.md }}>{ev.titre}</span>
                        <span style={{ fontSize: T.size.xs, opacity: 0.85, marginLeft: '0.4rem' }}>{EVENT_TYPES.find(t => t.value === ev.type)?.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        {ev.type === 'seance' && ev.seance_id && onViewSeance && (
                          <button
                            onClick={() => onViewSeance(ev.seance_id, ev.semaine_override ?? getCycleWeek(selectedDay, programmeDebut, programmeSemaines))}
                            style={{ minHeight: 36, background: 'rgb(255 255 255 / .18)', border: 'none', borderRadius: 8, padding: '0 10px', fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 700, cursor: 'pointer', color: ts.text, whiteSpace: 'nowrap' }}
                          >
                            Voir
                          </button>
                        )}
                        {!readOnly && (
                          <button onClick={() => supprimerEvenement(ev.id)} aria-label="Supprimer l'événement" style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: ts.text, cursor: 'pointer', opacity: 0.75 }}><Icon name="x" size={16} /></button>
                        )}
                      </div>
                    </div>
                    {ev.description && (
                      <p style={{ fontSize: T.size.sm, margin: '0.35rem 0 0', opacity: 0.9, lineHeight: 1.4 }}>{ev.description}</p>
                    )}
                    {ev.type === 'course' && <ResumeCourse activite={ev.activite} couleur={ts.text} />}
                    {ev.type === 'course' && !ev.activite?.distance_m && !readOnly && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: '0.45rem', minHeight: 36, padding: '0 10px', background: 'rgb(255 255 255 / .18)', borderRadius: 8, fontSize: T.size.sm, fontWeight: 700, cursor: 'pointer' }}>
                        <Icon name="plus" size={14} />
                        {lectureCourse?.evId === ev.id && lectureCourse.enCours ? 'Lecture du fichier…' : 'Ajouter le fichier GPX'}
                        <input type="file" accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) ajouterFichierCourse(ev, f) }} />
                      </label>
                    )}
                    {lectureCourse?.evId === ev.id && lectureCourse.erreur && (
                      <p style={{ fontSize: T.size.sm, margin: '0.35rem 0 0', fontWeight: 700 }}>{lectureCourse.erreur}</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ color: T.color.muted, fontSize: T.size.md, marginBottom: '0.875rem' }}>Aucun événement ce jour.</p>
          )}

          {!readOnly && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <select value={form.type} onChange={e => setForm({ type: e.target.value, titre: '', seanceId: '', description: '' })} style={S.formInput}>
                {visibleTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {renderForm()}
              <button onClick={ajouterEvenement} disabled={saving} style={{ ...S.addBtn, alignSelf: 'flex-start' }}>{saving ? '…' : <><Icon name="plus" size={16} />Ajouter</>}</button>
            </div>
          )}
        </div>
      )}
      {/* ── Modal synchronisation agenda — via portal ───────────────── */}
      {showSyncModal && clientId && createPortal((() => {
        const base      = process.env.REACT_APP_SUPABASE_URL?.replace('https://', '')
        const webcalUrl = `webcal://${base}/functions/v1/calendar-ics?client_id=${clientId}`
        const httpsUrl  = `https://${base}/functions/v1/calendar-ics?client_id=${clientId}`
        const googleUrl = `https://www.google.com/calendar/render?cid=${encodeURIComponent(httpsUrl)}`

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgb(20 20 20 / .5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: T.font.body }}
            onClick={() => setShowSyncModal(false)}
          >
            <div
              role="dialog" aria-modal="true" aria-label="Synchroniser avec ton agenda"
              style={{ background: T.color.card, borderRadius: `${T.radius.card}px ${T.radius.card}px 0 0`, padding: '1.25rem 1.25rem calc(1.75rem + env(safe-area-inset-bottom))', width: '100%', maxWidth: 520, boxSizing: 'border-box' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: 36, height: 4, background: T.color.line, borderRadius: 999, margin: '0 auto 1.1rem' }} />
              <p style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: T.size.xl, margin: '0 0 0.4rem', color: T.color.ink }}>Synchroniser avec ton agenda</p>
              <p style={{ fontSize: T.size.md, color: T.color.muted, margin: '0 0 1.25rem', lineHeight: 1.5 }}>
                Les événements se mettent à jour automatiquement, ajouts et suppressions compris.
              </p>

              {/* Apple Calendar — vrai <a> cliqué par l'utilisateur */}
              <a
                href={webcalUrl}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', width: '100%', minHeight: 52, padding: '0 1rem', marginBottom: '0.6rem', background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: T.radius.control, fontSize: T.size.lg, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box' }}
                onClick={() => setShowSyncModal(false)}
              >
                <span>Apple Calendrier</span>
              </a>

              {/* Google Calendar */}
              <a
                href={googleUrl} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', width: '100%', minHeight: 52, padding: '0 1rem', marginBottom: '0.6rem', background: T.color.card, color: T.color.ink, border: `1.5px solid ${T.color.line}`, borderRadius: T.radius.control, fontSize: T.size.lg, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box' }}
                onClick={() => setShowSyncModal(false)}
              >
                <span>Google Agenda</span>
              </a>

              {/* Copier le lien */}
              <button
                onClick={() => { navigator.clipboard?.writeText(httpsUrl); setShowSyncModal(false) }}
                style={{ width: '100%', minHeight: T.touch, padding: '0 1rem', background: 'none', border: 'none', borderRadius: T.radius.control, fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 600, cursor: 'pointer', color: T.color.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                Copier le lien (autres agendas)
              </button>
            </div>
          </div>
        )
      })(), document.body)}

    </div>
  )
}

const S = {
  navBtn:    { minWidth: 40, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: T.color.card, border: `1.5px solid ${T.color.line}`, borderRadius: T.radius.control, padding: 0, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 600, cursor: 'pointer', color: T.color.ink },
  panel:     { marginTop: '1rem', background: T.color.page, borderRadius: T.radius.card, padding: '1rem 1.25rem', border: `1px solid ${T.color.line}` },
  formInput: { minHeight: T.touch, padding: '0.5rem 0.75rem', border: `1.5px solid ${T.color.line}`, borderRadius: T.radius.control, fontFamily: T.font.body, fontSize: T.size.lg, color: T.color.ink, background: T.color.card },
  addBtn:    { minHeight: T.touch, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: T.radius.control, padding: '0 1rem', fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 700, cursor: 'pointer' },
}
