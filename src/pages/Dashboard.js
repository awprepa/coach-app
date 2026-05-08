import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function getWeekBounds() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) }
}

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [wellnessAlertes, setWellnessAlertes] = useState([])
  const [expirations, setExpirations] = useState([])
  const [nouveaux, setNouveaux] = useState([])
  const [weekEvents, setWeekEvents] = useState([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const today = new Date().toISOString().slice(0, 10)
    const { start, end } = getWeekBounds()

    const [{ data: clients }, { data: wellness }, { data: evts }] = await Promise.all([
      supabase.from('clients').select('*, categories(nom, couleur)').order('created_at', { ascending: false }),
      supabase.from('wellness').select('*').eq('date', today),
      supabase.from('evenements').select('*, clients(prenom, nom)')
        .gte('date', start).lte('date', end).order('date', { ascending: true }),
    ])

    const cl = clients || []
    const wl = wellness || []

    // Wellness alertes : avg ≤ 2
    const alertes = cl.reduce((acc, c) => {
      const w = wl.find(x => x.client_id === c.id)
      if (!w) return acc
      const avg = (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4
      if (avg <= 2) acc.push({ ...c, wellness: w, avg })
      return acc
    }, [])
    setWellnessAlertes(alertes)

    // Abonnements expirant dans ≤ 7 jours
    const todayDate = new Date(); todayDate.setHours(0,0,0,0)
    const exp = cl.filter(c => {
      if (!c.date_fin) return false
      const fin = new Date(c.date_fin + 'T00:00:00')
      const days = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
      return days >= 0 && days <= 7
    }).map(c => {
      const fin = new Date(c.date_fin + 'T00:00:00')
      const days = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
      return { ...c, daysLeft: days }
    })
    setExpirations(exp)

    // Nouveaux clients non notifiés
    setNouveaux(cl.filter(c => c.coach_notifie === false))

    setWeekEvents(evts || [])
    setLoading(false)
  }

  async function marquerVu(clientId) {
    await supabase.from('clients').update({ coach_notifie: true }).eq('id', clientId)
    setNouveaux(prev => prev.filter(c => c.id !== clientId))
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading) return <div style={S.centered}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>

  const totalAlertes = wellnessAlertes.length + expirations.length + nouveaux.length

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div>
          <p style={S.dateLabel}>{dateLabel}</p>
          <h1 style={S.title}>Tableau de bord</h1>
        </div>
        {totalAlertes > 0 && (
          <div style={S.alertBadge}>{totalAlertes} alerte{totalAlertes > 1 ? 's' : ''}</div>
        )}
      </div>

      {/* Alertes wellness */}
      {wellnessAlertes.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={S.sectionTitle}>⚠ Wellness préoccupant aujourd'hui</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {wellnessAlertes.map(c => (
              <div key={c.id} onClick={() => navigate(`/client/${c.id}`)} style={S.alertCard}>
                <div style={S.alertAvatar}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <p style={S.alertName}>{c.prenom} {c.nom}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                    {['sommeil','fatigue','douleurs','stress'].map(k => (
                      <span key={k} style={{ fontSize: '0.65rem', color: '#6b7280' }}>
                        {k.slice(0,3)} <strong style={{ color: c.wellness[k] <= 2 ? '#dc2626' : '#333' }}>{c.wellness[k]}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <span style={{ background: '#fef2f2', color: '#dc2626', padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '800' }}>
                  {c.avg.toFixed(1)}/4
                </span>
                <span style={S.chevron}>›</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Abonnements expirants */}
      {expirations.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={S.sectionTitle}>⏳ Abonnements qui expirent bientôt</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {expirations.map(c => (
              <div key={c.id} onClick={() => navigate(`/client/${c.id}`)} style={S.alertCard}>
                <div style={S.alertAvatar}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <p style={S.alertName}>{c.prenom} {c.nom}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                    {new Date(c.date_fin + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </p>
                </div>
                <span style={{ background: c.daysLeft === 0 ? '#fef2f2' : '#fffbeb', color: c.daysLeft === 0 ? '#dc2626' : '#d97706', padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '800' }}>
                  {c.daysLeft === 0 ? 'Aujourd\'hui' : `${c.daysLeft}j`}
                </span>
                <span style={S.chevron}>›</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nouveaux clients */}
      {nouveaux.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={S.sectionTitle}>🆕 Nouveaux inscrits</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {nouveaux.map(c => (
              <div key={c.id} style={S.alertCard}>
                <div style={S.alertAvatar}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                <div style={{ flex: 1 }}>
                  <p style={S.alertName}>{c.prenom} {c.nom}</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{c.email}</p>
                </div>
                <button onClick={() => navigate(`/client/${c.id}`)} style={{ background: '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}>
                  Voir
                </button>
                <button onClick={() => marquerVu(c.id)} style={{ background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 8, padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}>
                  ✓ Vu
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalAlertes === 0 && (
        <div style={{ background: 'white', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>✓</span>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#16a34a', fontWeight: '600' }}>Tout va bien, aucune alerte aujourd'hui.</p>
        </div>
      )}

      {/* Planning de la semaine */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p style={S.sectionTitle}>Cette semaine</p>
          <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{weekEvents.length} événement{weekEvents.length > 1 ? 's' : ''}</span>
        </div>
        {weekEvents.length === 0 ? (
          <div style={{ background: 'white', borderRadius: 14, padding: '1.25rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            Aucun événement cette semaine.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {weekEvents.map(ev => {
              const d = new Date(ev.date + 'T00:00:00')
              const isToday = ev.date === todayStr
              const isPast = ev.date < todayStr
              return (
                <div key={ev.id} onClick={() => navigate(`/client/${ev.client_id}`)}
                  style={{ ...S.eventRow, background: isToday ? '#333333' : 'white', opacity: isPast && !isToday ? 0.55 : 1 }}>
                  <div style={{ ...S.dayBadge, background: isToday ? 'rgba(228,248,22,0.15)' : '#f3f4f6', color: isToday ? '#e4f816' : '#6b7280' }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>{JOURS[d.getDay()]}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: '900', lineHeight: 1 }}>{d.getDate()}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: '700', fontSize: '0.88rem', color: isToday ? 'white' : '#333333', margin: '0 0 0.1rem' }}>{ev.titre}</p>
                    <p style={{ fontSize: '0.72rem', color: isToday ? 'rgba(255,255,255,0.55)' : '#9ca3af', margin: 0 }}>
                      {ev.clients?.prenom} {ev.clients?.nom}
                    </p>
                  </div>
                  {isToday && <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#e4f816', background: 'rgba(228,248,22,0.15)', padding: '0.2rem 0.55rem', borderRadius: 999 }}>Aujourd'hui</span>}
                  <span style={{ ...S.chevron, color: isToday ? 'rgba(255,255,255,0.3)' : '#d1d5db' }}>›</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  page:        { padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered:    { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' },
  dateLabel:   { fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 0.2rem', textTransform: 'capitalize' },
  title:       { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  alertBadge:  { background: '#fef2f2', color: '#dc2626', padding: '0.35rem 0.875rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: '800' },
  sectionTitle:{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.6rem' },
  alertCard:   { background: 'white', borderRadius: 14, padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  alertAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#333333', color: '#e4f816', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '800', flexShrink: 0 },
  alertName:   { fontWeight: '700', fontSize: '0.9rem', color: '#333333', margin: 0 },
  eventRow:    { borderRadius: 12, padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  dayBadge:    { width: 38, height: 38, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chevron:     { fontSize: '1.25rem', color: '#d1d5db' },
}
