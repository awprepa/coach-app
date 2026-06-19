import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'

const EVENT_TYPES = [
  { value: 'seance',       label: 'Séance',        bg: 'var(--chip-bg)', text: 'var(--chip-text)' },
  { value: 'entrainement', label: 'Entraînement',  bg: '#f97316', text: 'white'   },
  { value: 'match',        label: 'Match',         bg: 'var(--chip-bg)', text: 'var(--chip-text)' },
  { value: 'combat',       label: 'Combat',        bg: '#dc2626', text: 'white'   },
  { value: 'competition',  label: 'Compétition',   bg: '#7c3aed', text: 'white'   },
  { value: 'repos',        label: 'Repos',         bg: '#e5e7eb', text: '#6b7280' },
  { value: 'autre',        label: 'Autre',         bg: '#f0fdfa', text: '#0f766e' },
]

// Types supplémentaires utilisés dans les groupes (groupe_evenements)
const GROUP_EXTRA_TYPES = {
  collectif:   { label: 'Collectif',    bg: '#f97316', text: 'white'   },
  muscu:       { label: 'Muscu',        bg: '#6366f1', text: 'white'   },
  vacances:    { label: 'Vacances',     bg: '#e5e7eb', text: '#6b7280' },
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
    const nd = next.toISOString().slice(0, 10).replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nd}`,
      `SUMMARY:${ev.titre}`, `UID:awprepa-${ev.id}@awprepa.com`, 'END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function EventChip({ ev, tiny = false }) {
  const ts = getTypeStyle(ev.type)
  const prefix = ev._isGroupe && !ev._isFFR ? '👥 ' : ''
  return (
    <span style={{
      background: ts.bg, color: ts.text,
      fontSize: tiny ? '0.6rem' : '0.7rem', fontWeight: '700',
      padding: tiny ? '1px 4px' : '2px 6px', borderRadius: '4px',
      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block',
    }}>{prefix}{ev.titre}</span>
  )
}

function MonthView({ year, month, todayStr, selectedStr, eventsMap, onDayClick, programmeDebut, programmeSemaines }) {
  const days = getMonthDays(year, month)
  const cells = []
  cells.push(<div key="corner" />)
  JOURS.forEach(j => cells.push(
    <div key={`h-${j}`} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', padding: '4px 0' }}>{j}</div>
  ))
  for (let row = 0; row < 6; row++) {
    const weekDays = days.slice(row * 7, row * 7 + 7)
    const cycleW = getCycleWeek(weekDays[0], programmeDebut, programmeSemaines)
    cells.push(
      <div key={`sw-${row}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: cycleW ? 'var(--chip-bg)' : '#f9fafb', borderRadius: 7 }}>
        {cycleW
          ? <span style={{ fontSize: '0.6rem', fontWeight: '900', color: 'var(--chip-text)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}>S{cycleW}</span>
          : <span style={{ width: 2, height: '60%', background: '#e5e7eb', borderRadius: 2 }} />}
      </div>
    )
    weekDays.forEach(day => {
      const ds = formatDate(day); const isToday = ds === todayStr; const isSel = ds === selectedStr
      const evs = eventsMap[ds] || []; const inCycle = !!cycleW
      cells.push(
        <div key={ds} onClick={() => onDayClick(day)} style={{
          height: 46, overflow: 'hidden', boxSizing: 'border-box',
          background: isSel ? 'var(--chip-bg)' : inCycle ? '#fffef5' : 'white',
          borderRadius: 8, padding: '5px 4px', cursor: 'pointer',
          border: isToday ? '2px solid var(--accent)' : inCycle ? '1px solid #f0ead0' : '1px solid #f3f4f6',
          opacity: day.getMonth() === month ? 1 : 0.35,
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: isToday ? '800' : '500', color: isSel ? 'var(--chip-text)' : '#374151', display: 'block', marginBottom: 3 }}>{day.getDate()}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
            {evs.slice(0, 2).map(ev => <EventChip key={ev.id} ev={ev} tiny />)}
            {evs.length > 2 && <span style={{ fontSize: '0.55rem', color: isSel ? 'var(--chip-text)' : '#9ca3af', opacity: isSel ? 0.7 : 1, fontWeight: '700' }}>+{evs.length - 2} →</span>}
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
        <div style={{ background: 'var(--header-bg)', borderRadius: 12, padding: '0.875rem 1.25rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.62rem', fontWeight: '700', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cycle en cours</p>
            <p style={{ color: 'var(--accent-text)', fontSize: '1.05rem', fontWeight: '900', margin: '0.2rem 0 0' }}>Semaine {cycleW} <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: '400' }}>/ {programmeSemaines}</span></p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--chip-bg)', borderRadius: 999, width: `${Math.round((cycleW / programmeSemaines) * 100)}%` }} />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', margin: '0.3rem 0 0', textAlign: 'right' }}>{Math.round((cycleW / programmeSemaines) * 100)}%</p>
          </div>
        </div>
      ) : <div style={{ height: 8 }} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {days.map((day, i) => {
          const ds = formatDate(day); const isToday = ds === todayStr; const isSel = ds === selectedStr
          const evs = eventsMap[ds] || []
          return (
            <div key={i} onClick={() => onDayClick(day)} style={{
              height: 150, overflow: 'hidden', boxSizing: 'border-box',
              background: isSel ? 'var(--chip-bg)' : cycleW ? '#fffef5' : 'white',
              borderRadius: 12, padding: '10px 6px', cursor: 'pointer',
              border: isToday ? '2px solid var(--accent)' : cycleW ? '1px solid #f0ead0' : '1px solid #f3f4f6',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: '0.68rem', fontWeight: '700', color: isSel ? 'var(--chip-text)' : '#9ca3af', margin: '0 0 2px', textTransform: 'uppercase' }}>{JOURS[i]}</p>
                <span style={{ fontSize: '1.2rem', fontWeight: '800', color: isSel ? 'var(--chip-text)' : isToday ? 'var(--accent)' : '#374151' }}>{day.getDate()}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
                {evs.slice(0, 3).map(ev => <EventChip key={ev.id} ev={ev} />)}
                {evs.length > 3 && <span style={{ fontSize: '0.65rem', color: isSel ? 'var(--chip-text)' : '#9ca3af', opacity: isSel ? 0.7 : 1, fontWeight: '700', textAlign: 'center' }}>+{evs.length - 3} →</span>}
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
        {JOURS.map(j => <div key={j} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af' }}>{j}</div>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: '24px repeat(7,1fr)', gap: 3, marginBottom: 4, alignItems: 'stretch' }}>
          <div style={{ background: 'var(--chip-bg)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: '900', color: 'var(--chip-text)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>S{wi + 1}</span>
          </div>
          {week.map((day, di) => {
            const ds = formatDate(day); const isToday = ds === todayStr; const isSel = ds === selectedStr
            const evs = eventsMap[ds] || []
            return (
              <div key={di} onClick={() => onDayClick(day)} style={{
                height: 64, overflow: 'hidden', boxSizing: 'border-box',
                background: isSel ? 'var(--chip-bg)' : '#fffef5', borderRadius: 7, padding: '5px',
                cursor: 'pointer', border: isToday ? '2px solid var(--accent)' : '1px solid #f0ead0',
              }}>
                <span style={{ fontSize: '0.68rem', fontWeight: '700', color: isSel ? 'var(--chip-text)' : '#374151', display: 'block', marginBottom: 3 }}>{day.getDate()}/{day.getMonth()+1}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                  {evs.slice(0, 2).map(ev => <EventChip key={ev.id} ev={ev} tiny />)}
                  {evs.length > 2 && <span style={{ fontSize: '0.55rem', color: isSel ? 'var(--chip-text)' : '#9ca3af', opacity: isSel ? 0.7 : 1, fontWeight: '700' }}>+{evs.length-2} →</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
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
        if (payload.eventType === 'INSERT') {
          setEvenements(prev =>
            prev.find(e => e.id === payload.new.id) ? prev : [...prev, payload.new]
          )
        } else if (payload.eventType === 'DELETE') {
          setEvenements(prev => prev.filter(e => e.id !== payload.old.id))
        } else if (payload.eventType === 'UPDATE') {
          setEvenements(prev => prev.map(e => e.id === payload.new.id ? payload.new : e))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [clientId])

  async function fetchEvenements() {
    const { data } = await supabase.from('evenements').select('*').eq('client_id', clientId).order('date', { ascending: true })
    setEvenements(data || [])
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
    // 2. Récupérer les événements de ces groupes (type + titre uniquement)
    const { data: gevts } = await supabase
      .from('groupe_evenements')
      .select('id, date, type, titre, style, heure')
      .in('groupe_id', groupIds)
      .order('date', { ascending: true })
    setGroupEvts((gevts || []).map(e => ({
      ...e,
      _isGroupe: true,
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
      : form.titre
    if (!titre?.trim() || !selectedDay) return
    setSaving(true)
    const payload = {
      client_id: clientId,
      date: formatDate(selectedDay),
      type: form.type,
      titre,
      seance_id: form.type === 'seance' && form.seanceId ? form.seanceId : null,
      description: form.description?.trim() || null,
      source: eventSource,
    }
    const { data, error } = await supabase.from('evenements').insert([payload]).select().single()
    if (error) alert(error.message)
    else { setEvenements(prev => [...prev, data]); setForm({ type: 'seance', titre: '', seanceId: '', description: '' }) }
    setSaving(false)
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
    headerLabel = `${w[0].getDate()} — ${w[6].getDate()} ${MOIS[w[6].getMonth()]} ${w[6].getFullYear()}`
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

  // Formulaire d'ajout — rendu selon le type
  function renderForm() {
    if (form.type === 'seance' && seances.length > 0) {
      return (
        <select value={form.seanceId} onChange={e => setForm({ ...form, seanceId: e.target.value })} style={{ ...S.formInput, flex: 1 }}>
          <option value="">— Choisir une séance —</option>
          {seances.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
      )
    }
    if (form.type === 'autre') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <input
            type="text" placeholder="Titre *"
            value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })}
            style={{ ...S.formInput, width: '100%', boxSizing: 'border-box' }}
          />
          <textarea
            placeholder="Description (optionnel)..."
            value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
            style={{ ...S.formInput, width: '100%', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
          />
        </div>
      )
    }
    return (
      <input
        type="text" placeholder="Titre de l'événement"
        value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })}
        onKeyDown={e => e.key === 'Enter' && ajouterEvenement()}
        style={{ ...S.formInput, flex: 1, minWidth: 160 }}
      />
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Barre de contrôle — ligne 1 : vue + sync */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 }}>
          {[{ k: 'mois', l: 'Mois' }, { k: 'semaine', l: 'Semaine' }, { k: 'periode', l: 'Cycle' }].map(v => (
            <button key={v.k} onClick={() => setVue(v.k)} style={{
              padding: '0.3rem 0.8rem', borderRadius: 7, border: 'none', fontSize: '0.78rem', fontWeight: '600',
              cursor: 'pointer', background: vue === v.k ? 'white' : 'transparent',
              color: vue === v.k ? '#333333' : '#9ca3af',
              boxShadow: vue === v.k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{v.l}</button>
          ))}
        </div>

        {clientId && (
          <button onClick={() => setShowSyncModal(true)} style={{
            padding: '0.3rem 0.9rem', borderRadius: 8, border: 'none', fontSize: '0.78rem', fontWeight: '700',
            cursor: 'pointer', background: 'var(--chip-bg)', color: 'var(--chip-text)',
          }}>📅 Sync. Agenda</button>
        )}
      </div>

      {/* Barre de contrôle — ligne 2 : navigation date + export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={prev} style={S.navBtn}>‹</button>
        <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#333333', flex: 1, textAlign: 'center' }}>{headerLabel}</span>
        <button onClick={next} style={S.navBtn}>›</button>
        <button onClick={() => { setCurrentDate(new Date()); setVue('semaine') }} style={{ ...S.navBtn, fontSize: '0.72rem' }}>Auj.</button>
        <button onClick={exportICS} style={{ ...S.navBtn, fontSize: '0.72rem', fontWeight: '700' }}>↓ .ics</button>
      </div>

      {/* Légende */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        {EVENT_TYPES.map(t => (
          <span key={t.value} style={{ background: t.bg, color: t.text, padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: '700', border: t.value === 'autre' ? '1px solid #99f6e4' : 'none' }}>{t.label}</span>
        ))}
      </div>

      {/* Vues */}
      {vue === 'mois'    && <MonthView  year={currentDate.getFullYear()} month={currentDate.getMonth()} todayStr={todayStr} selectedStr={selectedStr} eventsMap={eventsMap} onDayClick={setSelectedDay} programmeDebut={programmeDebut} programmeSemaines={programmeSemaines} />}
      {vue === 'semaine' && <WeekView   date={currentDate} todayStr={todayStr} selectedStr={selectedStr} eventsMap={eventsMap} onDayClick={setSelectedDay} programmeDebut={programmeDebut} programmeSemaines={programmeSemaines} />}
      {vue === 'periode' && <PeriodView startDate={periodeDebut} numWeeks={programmeSemaines} todayStr={todayStr} selectedStr={selectedStr} eventsMap={eventsMap} onDayClick={setSelectedDay} />}

      {/* Panel jour sélectionné */}
      {selectedDay && (
        <div style={S.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <p style={{ fontWeight: '800', fontSize: '0.9rem', color: '#333333', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {selectedDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {getCycleWeek(selectedDay, programmeDebut, programmeSemaines) && (
                <span style={{ fontSize: '0.72rem', background: 'var(--chip-bg)', color: 'var(--chip-text)', padding: '2px 8px', borderRadius: 6, fontWeight: '800' }}>
                  S{getCycleWeek(selectedDay, programmeDebut, programmeSemaines)}
                </span>
              )}
            </p>
            <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
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
                  const bg = joue ? (win ? '#16a34a' : lose ? '#dc2626' : '#64748b') : '#1e3a8a'
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
                      <div style={{ width: 40, height: 40, borderRadius: 10,
                        background: 'rgba(255,255,255,.18)', border: '1.5px solid rgba(255,255,255,.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {url ? <img src={url} alt={initials} style={{ width: 32, height: 32, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} /> : null}
                        <div style={{ width:'100%', height:'100%', display: url ? 'none' : 'flex', alignItems:'center', justifyContent:'center', fontSize:'.65rem', fontWeight:900 }}>{initials}</div>
                      </div>
                    )
                  }

                  return (
                    <div key={ev.id} style={{ background: `linear-gradient(135deg, ${bg}, color-mix(in srgb, ${bg} 70%, #000))`, borderRadius: 12, padding: '10px 12px', color: '#fff' }}>
                      <div style={{ fontSize: '.58rem', fontWeight: 800, opacity: .7, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                        Match FFR{m.journee ? ` · J${m.journee}` : ''}
                      </div>
                      {/* Logos + VS */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                          <LogoBadgeSmall url={logoG} initials={initG} />
                          <div style={{ fontSize: '.55rem', fontWeight: 700, opacity: .85, textAlign: 'center', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomG}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          {scoreStr
                            ? <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>{scoreStr}</span>
                            : <span style={{ fontSize: '.72rem', fontWeight: 900, opacity: .9, letterSpacing: '.04em' }}>VS</span>
                          }
                          {!scoreStr && m.heure && <span style={{ fontSize: '.6rem', opacity: .7 }}>🕐 {m.heure}</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
                          <LogoBadgeSmall url={logoD} initials={initD} />
                          <div style={{ fontSize: '.55rem', fontWeight: 700, opacity: .85, textAlign: 'center', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomD}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                        {m.est_domicile != null && (
                          <span style={{ background: '#e4f816', color: '#1a1a1a', borderRadius: 6, padding: '2px 8px', fontSize: '.6rem', fontWeight: 800 }}>
                            {m.est_domicile ? '🏠 Domicile' : '✈️ Extérieur'}
                          </span>
                        )}
                        {joue && <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 6, padding: '2px 8px', fontSize: '.6rem', fontWeight: 700 }}>
                          {win ? '✅ Victoire' : lose ? '❌ Défaite' : '🤝 Nul'}
                        </span>}
                      </div>
                    </div>
                  )
                }

                // ── Événement groupe ───────────────────────────────────────────
                if (ev._isGroupe) {
                  return (
                    <div key={`g-${ev.id}`} style={{ background: ts.bg, color: ts.text, padding: '0.55rem 0.75rem', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: '700', fontSize: '0.88rem' }}>👥 {ev.titre}</span>
                          {ev.heure && <span style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: '0.5rem' }}>· {ev.heure.slice(0,5)}</span>}
                        </div>
                      </div>
                    </div>
                  )
                }

                // ── Événement personnel ────────────────────────────────────────
                return (
                  <div key={ev.id} style={{ background: ts.bg, color: ts.text, padding: '0.55rem 0.75rem', borderRadius: 8, border: ev.type === 'autre' ? '1px solid #99f6e4' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: '700', fontSize: '0.88rem' }}>{ev.titre}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.65, marginLeft: '0.4rem' }}>{EVENT_TYPES.find(t => t.value === ev.type)?.label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        {ev.type === 'seance' && ev.seance_id && onViewSeance && (
                          <button
                            onClick={() => onViewSeance(ev.seance_id, getCycleWeek(selectedDay, programmeDebut, programmeSemaines))}
                            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', color: ts.text, whiteSpace: 'nowrap' }}
                          >
                            Voir →
                          </button>
                        )}
                        {!readOnly && (
                          <button onClick={() => supprimerEvenement(ev.id)} style={{ background: 'none', border: 'none', color: ts.text, cursor: 'pointer', opacity: 0.5, padding: '0 2px', fontSize: '0.9rem' }}>✕</button>
                        )}
                      </div>
                    </div>
                    {ev.description && (
                      <p style={{ fontSize: '0.78rem', margin: '0.35rem 0 0', opacity: 0.8, lineHeight: 1.4 }}>{ev.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', marginBottom: '0.875rem' }}>Aucun événement ce jour.</p>
          )}

          {!readOnly && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <select value={form.type} onChange={e => setForm({ type: e.target.value, titre: '', seanceId: '', description: '' })} style={S.formInput}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {renderForm()}
              <button onClick={ajouterEvenement} disabled={saving} style={{ ...S.addBtn, alignSelf: 'flex-start' }}>{saving ? '...' : '+ Ajouter'}</button>
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
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
            onClick={() => setShowSyncModal(false)}
          >
            <div
              style={{ background: 'white', borderRadius: '22px 22px 0 0', padding: '1.25rem 1.25rem calc(1.75rem + env(safe-area-inset-bottom))', width: '100%', boxSizing: 'border-box' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1.1rem' }} />
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 0.4rem', color: '#1a1a1a' }}>📅 Synchroniser avec ton agenda</p>
              <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
                Les événements se mettent à jour automatiquement — ajouts et suppressions compris.
              </p>

              {/* Apple Calendar — vrai <a> cliqué par l'utilisateur */}
              <a
                href={webcalUrl}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.85rem 1rem', marginBottom: '0.6rem', background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: 14, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box' }}
                onClick={() => setShowSyncModal(false)}
              >
                <span style={{ fontSize: '1.2rem' }}>🍎</span>
                <span>Apple Calendrier</span>
              </a>

              {/* Google Calendar */}
              <a
                href={googleUrl} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.85rem 1rem', marginBottom: '0.6rem', background: '#f8f9fa', color: '#1a1a1a', border: '1.5px solid #e5e7eb', borderRadius: 14, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box' }}
                onClick={() => setShowSyncModal(false)}
              >
                <span style={{ fontSize: '1.2rem' }}>📆</span>
                <span>Google Agenda</span>
              </a>

              {/* Copier le lien */}
              <button
                onClick={() => { navigator.clipboard?.writeText(httpsUrl); setShowSyncModal(false) }}
                style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 14, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', color: '#6b7280' }}
              >
                🔗 Copier le lien (autres agendas)
              </button>
            </div>
          </div>
        )
      })(), document.body)}

    </div>
  )
}

const S = {
  navBtn:    { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', fontSize: '1rem', cursor: 'pointer', color: '#374151' },
  panel:     { marginTop: '1rem', background: '#f9fafb', borderRadius: 14, padding: '1rem 1.25rem', border: '1px solid #e5e7eb' },
  formInput: { padding: '0.5rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.82rem', color: '#333333', outline: 'none', background: 'white' },
  addBtn:    { background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' },
}
