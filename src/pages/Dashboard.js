import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const PALETTE_CATS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4']
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const OFFRES = {
  essai:               { label: 'Essai',         bg: '#fff7ed', color: '#c2410c' },
  preparation_physique:{ label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:            { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
}
function offreLabel(o) { return OFFRES[o]?.label || o }
function offreBadge(o) { const v = OFFRES[o]; return v ? { background: v.bg, color: v.color } : {} }

function getAvatar(prenom, nom) {
  const initiales = `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase()
  const palettes = [
    { bg: '#dbeafe', text: '#1d4ed8' }, { bg: '#dcfce7', text: '#15803d' },
    { bg: '#fef9c3', text: '#a16207' }, { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#ede9fe', text: '#6d28d9' }, { bg: '#ffedd5', text: '#c2410c' },
  ]
  const idx = ((prenom?.charCodeAt(0) || 0) + (nom?.charCodeAt(0) || 0)) % palettes.length
  return { initiales, ...palettes[idx] }
}

function getSubInfo(date_fin) {
  if (!date_fin) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const fin = new Date(date_fin + 'T00:00:00')
  const days = Math.ceil((fin - today) / (1000 * 60 * 60 * 24))
  if (days < 0)  return { color: '#9ca3af', bg: '#f3f4f6', label: 'Expiré' }
  if (days <= 7) return { color: '#dc2626', bg: '#fef2f2', label: `${days}j` }
  if (days <= 30) return { color: '#d97706', bg: '#fffbeb', label: `${days}j` }
  return { color: '#16a34a', bg: '#f0fdf4', label: `${days}j` }
}

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

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading]         = useState(true)
  const [clients, setClients]         = useState([])
  const [categories, setCategories]   = useState([])
  const [weekEvents, setWeekEvents]   = useState([])
  const [search, setSearch]           = useState('')
  const [activeCat, setActiveCat]     = useState(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [newCatNom, setNewCatNom]     = useState('')
  const [newCatColor, setNewCatColor] = useState(PALETTE_CATS[0])
  const [showWeek, setShowWeek]       = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const today = new Date().toISOString().slice(0, 10)
    const { start, end } = getWeekBounds()

    const [
      { data: clientsData },
      { data: wData },
      { data: evts },
      { data: catsData },
    ] = await Promise.all([
      supabase.from('clients').select('*, categories(id, nom, couleur)').order('prenom'),
      supabase.from('wellness').select('*').eq('date', today),
      supabase.from('evenements').select('*, clients(prenom, nom)')
        .gte('date', start).lte('date', end).order('date', { ascending: true }),
      supabase.from('categories').select('*').order('created_at'),
    ])

    const withWellness = (clientsData || []).map(c => ({
      ...c,
      wellness_today: (wData || []).find(w => w.client_id === c.id) || null,
    }))

    setClients(withWellness)
    setCategories(catsData || [])
    setWeekEvents(evts || [])
    setLoading(false)
  }

  async function marquerVu(clientId) {
    await supabase.from('clients').update({ coach_notifie: true }).eq('id', clientId)
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, coach_notifie: true } : c))
  }

  async function ajouterCategorie() {
    if (!newCatNom.trim()) return
    const { data, error } = await supabase
      .from('categories').insert([{ nom: newCatNom, couleur: newCatColor }]).select().single()
    if (error) { alert(error.message); return }
    setCategories(prev => [...prev, data])
    setNewCatNom(''); setNewCatColor(PALETTE_CATS[0]); setShowCatForm(false)
  }

  async function supprimerCategorie(catId) {
    if (!window.confirm('Supprimer cette catégorie ?')) return
    await supabase.from('categories').delete().eq('id', catId)
    setCategories(prev => prev.filter(c => c.id !== catId))
    if (activeCat === catId) setActiveCat(null)
  }

  if (loading) return <div style={S.centered}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>

  const today = new Date().toISOString().slice(0, 10)
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Alertes
  const wellnessAlertes = clients.filter(c => {
    const w = c.wellness_today
    if (!w) return false
    return (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 <= 2
  }).map(c => {
    const w = c.wellness_today
    return { ...c, avg: (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 }
  })

  const todayDate = new Date(); todayDate.setHours(0,0,0,0)
  const expirations = clients.filter(c => {
    if (!c.date_fin) return false
    const fin = new Date(c.date_fin + 'T00:00:00')
    const days = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 7
  }).map(c => {
    const fin = new Date(c.date_fin + 'T00:00:00')
    return { ...c, daysLeft: Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24)) }
  })

  const nouveaux = clients.filter(c => c.coach_notifie === false)
  const totalAlertes = wellnessAlertes.length + expirations.length + nouveaux.length

  // Filtrage clients
  const filtered = clients.filter(c => {
    const matchSearch = `${c.prenom} ${c.nom}`.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCat === null ? true : c.categorie_id === activeCat
    return matchSearch && matchCat
  })

  const nbEssai = clients.filter(c => c.offre === 'essai').length
  const nbPrepa = clients.filter(c => c.offre === 'preparation_physique').length
  const nbCoach = clients.filter(c => c.offre === 'coaching').length

  return (
    <div style={S.page}>

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div style={S.pageHeader}>
        <div>
          <p style={S.dateLabel}>{dateLabel}</p>
          <h1 style={S.title}>Tableau de bord</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {totalAlertes > 0 && (
            <span style={S.alertBadge}>{totalAlertes} alerte{totalAlertes > 1 ? 's' : ''}</span>
          )}
          <button onClick={() => navigate('/nouveau-client')} style={S.btnPrimary}>+ Nouveau client</button>
        </div>
      </div>

      {/* ── Alertes ─────────────────────────────────────────────── */}
      {totalAlertes === 0 ? (
        <div style={{ ...S.alertCard, cursor: 'default', gap: '0.6rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '1rem' }}>✓</span>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#16a34a', fontWeight: '600' }}>Tout va bien, aucune alerte aujourd'hui.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {wellnessAlertes.map(c => (
            <div key={c.id} onClick={() => navigate(`/client/${c.id}`)} style={{ ...S.alertCard, borderLeft: '4px solid #ef4444' }}>
              <div style={{ ...S.alertAvatar, background: '#fef2f2', color: '#dc2626' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
              <div style={{ flex: 1 }}>
                <p style={S.alertName}>{c.prenom} {c.nom}</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.15rem' }}>
                  {['sommeil','fatigue','douleurs','stress'].map(k => (
                    <span key={k} style={{ fontSize: '0.65rem', color: '#6b7280' }}>
                      {k.slice(0,3)} <strong style={{ color: c.wellness_today[k] <= 2 ? '#dc2626' : '#333' }}>{c.wellness_today[k]}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <span style={{ background: '#fef2f2', color: '#dc2626', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '800' }}>⚠ {c.avg.toFixed(1)}/4</span>
              <span style={S.chevron}>›</span>
            </div>
          ))}
          {expirations.map(c => (
            <div key={c.id} onClick={() => navigate(`/client/${c.id}`)} style={{ ...S.alertCard, borderLeft: '4px solid #f59e0b' }}>
              <div style={{ ...S.alertAvatar, background: '#fffbeb', color: '#d97706' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
              <div style={{ flex: 1 }}>
                <p style={S.alertName}>{c.prenom} {c.nom}</p>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                  {new Date(c.date_fin + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                </p>
              </div>
              <span style={{ background: c.daysLeft === 0 ? '#fef2f2' : '#fffbeb', color: c.daysLeft === 0 ? '#dc2626' : '#d97706', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '800' }}>
                ⏳ {c.daysLeft === 0 ? "Aujourd'hui" : `${c.daysLeft}j`}
              </span>
              <span style={S.chevron}>›</span>
            </div>
          ))}
          {nouveaux.map(c => (
            <div key={c.id} style={{ ...S.alertCard, borderLeft: '4px solid #6366f1', cursor: 'default' }}>
              <div style={{ ...S.alertAvatar, background: '#ede9fe', color: '#6d28d9' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
              <div style={{ flex: 1 }}>
                <p style={S.alertName}>{c.prenom} {c.nom}</p>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{c.email}</p>
              </div>
              <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '800' }}>🆕 Nouveau</span>
              <button onClick={() => navigate(`/client/${c.id}`)} style={S.btnSmall}>Voir</button>
              <button onClick={() => marquerVu(c.id)} style={{ ...S.btnSmall, background: '#f3f4f6', color: '#6b7280' }}>✓ Vu</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Planning de la semaine (collapsible) ────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setShowWeek(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0, marginBottom: showWeek ? '0.75rem' : 0 }}>
          <p style={S.sectionTitle}>Cette semaine</p>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '600' }}>{weekEvents.length} événement{weekEvents.length !== 1 ? 's' : ''}</span>
          <span style={{ color: '#d1d5db', fontSize: '1rem', transform: showWeek ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
        </button>
        {showWeek && (
          weekEvents.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 12, padding: '1rem 1.25rem', color: '#9ca3af', fontSize: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              Aucun événement cette semaine.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {weekEvents.map(ev => {
                const d = new Date(ev.date + 'T00:00:00')
                const isToday = ev.date === today
                const isPast  = ev.date < today
                return (
                  <div key={ev.id} onClick={() => navigate(`/client/${ev.client_id}`)}
                    style={{ ...S.eventRow, background: isToday ? '#333333' : 'white', opacity: isPast && !isToday ? 0.55 : 1 }}>
                    <div style={{ ...S.dayBadge, background: isToday ? 'rgba(228,248,22,0.15)' : '#f3f4f6', color: isToday ? '#e4f816' : '#6b7280' }}>
                      <span style={{ fontSize: '0.55rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>{JOURS[d.getDay()]}</span>
                      <span style={{ fontSize: '0.95rem', fontWeight: '900', lineHeight: 1 }}>{d.getDate()}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: '700', fontSize: '0.88rem', color: isToday ? 'white' : '#333333', margin: '0 0 0.1rem' }}>{ev.titre}</p>
                      <p style={{ fontSize: '0.72rem', color: isToday ? 'rgba(255,255,255,0.55)' : '#9ca3af', margin: 0 }}>{ev.clients?.prenom} {ev.clients?.nom}</p>
                    </div>
                    {isToday && <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#e4f816', background: 'rgba(228,248,22,0.15)', padding: '0.2rem 0.55rem', borderRadius: 999 }}>Aujourd'hui</span>}
                    <span style={{ color: isToday ? 'rgba(255,255,255,0.3)' : '#d1d5db', fontSize: '1.25rem' }}>›</span>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* ── Clients ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <p style={S.sectionTitle}>Mes clients</p>
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Recherche */}
      <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
        <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>🔍</span>
        <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.65rem 0.875rem 0.65rem 2.4rem', border: '1.5px solid #e5e7eb', borderRadius: '12px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: 'white' }}
        />
      </div>

      {/* Filtres catégories */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button onClick={() => setActiveCat(null)}
          style={{ ...S.catTab, background: activeCat === null ? '#333333' : 'white', color: activeCat === null ? '#e4f816' : '#6b7280', border: activeCat === null ? 'none' : '1.5px solid #e5e7eb' }}>
          Tous
        </button>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
            style={{ ...S.catTab, background: activeCat === cat.id ? cat.couleur : 'white', color: activeCat === cat.id ? 'white' : '#374151', border: activeCat === cat.id ? 'none' : `1.5px solid ${cat.couleur}`, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeCat === cat.id ? 'rgba(255,255,255,0.7)' : cat.couleur, flexShrink: 0 }} />
            {cat.nom}
            <span onClick={e => { e.stopPropagation(); supprimerCategorie(cat.id) }} style={{ opacity: 0.5, fontSize: '0.7rem', cursor: 'pointer', marginLeft: '0.1rem' }}>✕</span>
          </button>
        ))}
        {showCatForm ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <input autoFocus value={newCatNom} onChange={e => setNewCatNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ajouterCategorie()}
              placeholder="Nom..." style={{ padding: '0.35rem 0.65rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', width: 110 }} />
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {PALETTE_CATS.map(c => (
                <button key={c} onClick={() => setNewCatColor(c)}
                  style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: newCatColor === c ? '2.5px solid #333' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
            <button onClick={ajouterCategorie} style={{ ...S.btnPrimary, padding: '0.3rem 0.65rem', fontSize: '0.78rem', borderRadius: '8px' }}>OK</button>
            <button onClick={() => setShowCatForm(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowCatForm(true)} style={{ ...S.catTab, background: 'white', color: '#9ca3af', border: '1.5px dashed #d1d5db' }}>+ Catégorie</button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Total', value: clients.length },
          { label: 'Essai', value: nbEssai },
          { label: 'Prépa physique', value: nbPrepa },
          { label: 'Coaching', value: nbCoach },
        ].map(stat => (
          <div key={stat.label} style={S.statCard}>
            <p style={S.statLabel}>{stat.label}</p>
            <p style={S.statValue}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div style={S.listCard}>
        {filtered.length === 0 ? (
          <p style={{ color: '#9ca3af', padding: '2rem', textAlign: 'center', fontSize: '0.875rem' }}>
            {search || activeCat ? 'Aucun client trouvé.' : 'Aucun client pour l\'instant.'}
          </p>
        ) : (
          filtered.map((client, i) => {
            const av  = getAvatar(client.prenom, client.nom)
            const sub = getSubInfo(client.date_fin)
            const cat = client.categories
            const w   = client.wellness_today
            const wAvg = w ? (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 : null
            return (
              <div key={client.id} onClick={() => navigate(`/client/${client.id}`)}
                style={{ ...S.listRow, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ ...S.avatar, background: av.bg, color: av.text }}>{av.initiales}</div>
                    {cat && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: cat.couleur, border: '2px solid white' }} />}
                  </div>
                  <div>
                    <p style={S.clientName}>{client.prenom} {client.nom}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {client.objectif && <p style={{ color: '#9ca3af', fontSize: '0.78rem', margin: 0 }}>{client.objectif}</p>}
                      {cat && <span style={{ fontSize: '0.7rem', color: cat.couleur, fontWeight: '700' }}>· {cat.nom}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {wAvg !== null && (
                    <span title={`Som. ${w.sommeil} · Fat. ${w.fatigue} · Doul. ${w.douleurs} · Stress ${w.stress}`}
                      style={{ background: wAvg <= 2 ? '#fef2f2' : '#f0fdf4', color: wAvg <= 2 ? '#dc2626' : '#16a34a', padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: '700' }}>
                      {wAvg <= 2 ? '⚠ ' : '✓ '}{wAvg.toFixed(1)}
                    </span>
                  )}
                  {sub && (
                    <span style={{ background: sub.bg, color: sub.color, padding: '0.2rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: '700' }}>{sub.label}</span>
                  )}
                  <span style={{ ...S.badge, ...offreBadge(client.offre) }}>{offreLabel(client.offre)}</span>
                  <span style={S.chevron}>›</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const S = {
  page:        { padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered:    { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  dateLabel:   { fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 0.2rem', textTransform: 'capitalize' },
  title:       { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  alertBadge:  { background: '#fef2f2', color: '#dc2626', padding: '0.3rem 0.75rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: '800' },
  btnPrimary:  { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSmall:    { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.3rem 0.65rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' },
  sectionTitle:{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  alertCard:   { background: 'white', borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  alertAvatar: { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '800', flexShrink: 0 },
  alertName:   { fontWeight: '700', fontSize: '0.88rem', color: '#333333', margin: 0 },
  eventRow:    { borderRadius: 10, padding: '0.6rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  dayBadge:    { width: 36, height: 36, borderRadius: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catTab:      { padding: '0.3rem 0.8rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  statCard:    { background: '#f9fafb', borderRadius: 12, padding: '1rem 1.25rem' },
  statLabel:   { fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.4rem' },
  statValue:   { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  listCard:    { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  listRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', cursor: 'pointer' },
  avatar:      { width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.875rem', flexShrink: 0 },
  clientName:  { fontWeight: '700', fontSize: '0.92rem', color: '#333333', margin: '0 0 0.1rem' },
  badge:       { padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: '600' },
  chevron:     { color: '#d1d5db', fontSize: '1.25rem' },
}
