import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { extractColorsFromImage } from '../utils/colorExtract'
import CropLogoModal from '../components/CropLogoModal'
import { useNotifications } from '../hooks/useNotifications'

const PALETTE_CATS    = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4']
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

function formatNotifTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const hhmm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return hhmm
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + hhmm
}

const NOTIF_ICONS = { wellness: '🧘', message: '💬', seance: '📅', info: '🔔', default: '🔔' }

export default function Dashboard() {
  const navigate = useNavigate()
  const { notifs, unread, markRead, markAllRead } = useNotifications()
  const [showNotifs, setShowNotifs]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [clients, setClients]         = useState([])
  const [categories, setCategories]   = useState([])
  const [weekEvents, setWeekEvents]   = useState([])
  const [programmes, setProgrammes]   = useState([])
  const [search, setSearch]           = useState('')
  const [activeCat, setActiveCat]     = useState(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [newCatNom, setNewCatNom]     = useState('')
  const [newCatColor, setNewCatColor] = useState(PALETTE_CATS[0])
  const [showWeek, setShowWeek]       = useState(false)
  const [showBilan, setShowBilan]     = useState(true)
  // Groupes
  const [groupes, setGroupes]               = useState([])
  const [groupMemberIds, setGroupMemberIds] = useState(new Set())
  const [showGroupeForm, setShowGroupeForm] = useState(false)
  const [newGroupeNom, setNewGroupeNom]     = useState('')
  const [newGroupeCouleur, setNewGroupeCouleur]   = useState('#6366f1')
  const [newGroupeCouleur2, setNewGroupeCouleur2] = useState('')
  const [newGroupeLogoFile, setNewGroupeLogoFile] = useState(null)
  const [newGroupeLogoPreview, setNewGroupeLogoPreview] = useState(null)
  const [uploadingLogo, setUploadingLogo]   = useState(false)
  const [extractingColors, setExtractingColors] = useState(false)
  const [pickingFor, setPickingFor]         = useState(null) // 'primary' | 'secondary' | null
  const logoPickRef = useRef(null)
  const [cropSrc, setCropSrc]               = useState(null) // URL brute avant recadrage
  const [pendingFile, setPendingFile]       = useState(null) // fichier original avant recadrage

  useEffect(() => {
    fetchAll()
    // Enregistrer l'ID du coach dans app_settings
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('app_settings').upsert([{ key: 'coach_user_id', value: user.id }], { onConflict: 'key' })
      }
    })
    // Realtime : nouvelles entrées wellness
    const channel = supabase.channel('wellness-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wellness' },
        payload => {
          setClients(prev => prev.map(c =>
            c.id === payload.new.client_id ? { ...c, coach_notifie: false } : c
          ))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchAll() {
    const today = new Date().toISOString().slice(0, 10)
    const { start, end } = getWeekBounds()

    const [
      { data: clientsData },
      { data: wData },
      { data: evts },
      { data: catsData },
      { data: progsData },
      { data: groupesData },
      { data: membresData },
    ] = await Promise.all([
      supabase.from('clients').select('*, categories(id, nom, couleur)').order('prenom'),
      supabase.from('wellness').select('*').gte('date', start).lte('date', end),
      supabase.from('evenements').select('*, clients(prenom, nom)')
        .gte('date', start).lte('date', end).order('date', { ascending: true }),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('programmes').select('id, client_id, nom, semaines, date_debut'),
      supabase.from('groupes').select('*').is('parent_id', null).order('created_at'),
      supabase.from('groupe_membres').select('client_id'),
    ])

    const withWellness = (clientsData || []).map(c => {
      const wWeek = (wData || []).filter(w => w.client_id === c.id)
      const wToday = wWeek.find(w => w.date === today) || null
      const weekAvgs = wWeek.map(w => (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4)
      const weekAvg = weekAvgs.length ? weekAvgs.reduce((a, b) => a + b, 0) / weekAvgs.length : null
      return { ...c, wellness_today: wToday, wellness_week: wWeek, wellness_week_avg: weekAvg }
    })

    setClients(withWellness)
    setCategories(catsData || [])
    setWeekEvents(evts || [])
    setProgrammes(progsData || [])
    setGroupes(groupesData || [])
    setGroupMemberIds(new Set((membresData || []).map(m => m.client_id)))
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

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    // Ouvrir le recadreur avant tout
    setPendingFile(file)
    setCropSrc(URL.createObjectURL(file))
    // Reset l'input pour permettre de re-sélectionner le même fichier
    e.target.value = ''
  }

  async function handleCropConfirm(croppedFile, previewUrl) {
    setCropSrc(null); setPendingFile(null)
    setNewGroupeLogoFile(croppedFile)
    setNewGroupeLogoPreview(previewUrl)
    setExtractingColors(true)
    const colors = await extractColorsFromImage(croppedFile, 2)
    if (colors[0]) setNewGroupeCouleur(colors[0])
    if (colors[1]) setNewGroupeCouleur2(colors[1])
    setExtractingColors(false)
  }

  function handleCropCancel() {
    setCropSrc(null); setPendingFile(null)
  }

  function handleLogoColorPick(e) {
    if (!pickingFor || !logoPickRef.current) return
    const img = logoPickRef.current
    const rect = img.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || rect.width
    canvas.height = img.naturalHeight || rect.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const px = Math.round(x * scaleX)
    const py = Math.round(y * scaleY)
    const d = ctx.getImageData(px, py, 1, 1).data
    const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')
    if (pickingFor === 'primary') setNewGroupeCouleur(hex)
    else setNewGroupeCouleur2(hex)
    setPickingFor(null)
  }

  async function creerGroupe() {
    if (!newGroupeNom.trim()) return
    setUploadingLogo(true)
    let logoUrl = null
    if (newGroupeLogoFile) {
      const ext  = newGroupeLogoFile.name.split('.').pop()
      const path = `groupe-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('groupe-logos').upload(path, newGroupeLogoFile, { upsert: true })
      if (upErr) { alert('Erreur upload logo : ' + upErr.message); setUploadingLogo(false); return }
      logoUrl = supabase.storage.from('groupe-logos').getPublicUrl(path).data.publicUrl
    }
    const { data, error } = await supabase.from('groupes')
      .insert([{ nom: newGroupeNom.trim(), couleur: newGroupeCouleur, couleur_secondaire: newGroupeCouleur2 || null, logo_url: logoUrl }])
      .select().single()
    if (error) { alert(error.message); setUploadingLogo(false); return }
    setGroupes(prev => [...prev, data])
    setNewGroupeNom(''); setNewGroupeLogoFile(null); setNewGroupeLogoPreview(null)
    setNewGroupeCouleur('#6366f1'); setNewGroupeCouleur2('')
    setShowGroupeForm(false)
    setUploadingLogo(false)
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

  // Programmes se terminant dans les 7 prochains jours
  const progFinBientot = programmes.filter(p => {
    if (!p.date_debut) return false
    const fin = new Date(p.date_debut + 'T00:00:00')
    fin.setDate(fin.getDate() + p.semaines * 7)
    const days = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 7
  }).map(p => {
    const fin = new Date(p.date_debut + 'T00:00:00')
    fin.setDate(fin.getDate() + p.semaines * 7)
    const daysLeft = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    const client = clients.find(c => c.id === p.client_id)
    return { ...p, daysLeft, clientNom: client ? `${client.prenom} ${client.nom}` : '—', clientId: p.client_id }
  })

  // Clients sans wellness depuis 3+ jours
  const trois = new Date(todayDate); trois.setDate(trois.getDate() - 3)
  const troisStr = trois.toISOString().slice(0, 10)
  const sansWellness = clients.filter(c => {
    const lastEntry = c.wellness_week?.sort((a, b) => b.date.localeCompare(a.date))[0]
    return !lastEntry || lastEntry.date < troisStr
  })

  // Séances prévues aujourd'hui
  const seancesAujourdhui = weekEvents.filter(e => e.date === today)

  const nouveaux = clients.filter(c => c.coach_notifie === false)
  const totalAlertes = wellnessAlertes.length + expirations.length + nouveaux.length + progFinBientot.length

  // Bilan hebdo
  const { start: wStart, end: wEnd } = getWeekBounds()
  const bilanRows = clients.map(c => {
    const evs = weekEvents.filter(e => e.client_id === c.id)
    return { ...c, eventsCount: evs.length }
  }).sort((a, b) => {
    // inactifs d'abord, puis par wellness le plus bas
    const aInactif = a.wellness_week?.length === 0 && a.eventsCount === 0
    const bInactif = b.wellness_week?.length === 0 && b.eventsCount === 0
    if (aInactif && !bInactif) return -1
    if (!aInactif && bInactif) return 1
    if (a.wellness_week_avg !== null && b.wellness_week_avg !== null) return a.wellness_week_avg - b.wellness_week_avg
    if (a.wellness_week_avg === null) return 1
    if (b.wellness_week_avg === null) return -1
    return 0
  })

  // Clients individuels (pas membres d'un groupe)
  const clientsIndividuels = clients.filter(c => !groupMemberIds.has(c.id))

  // Filtrage clients
  const filtered = clientsIndividuels.filter(c => {
    const matchSearch = `${c.prenom} ${c.nom}`.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCat === null ? true : c.categorie_id === activeCat
    return matchSearch && matchCat
  })

  const nbEssai = clientsIndividuels.filter(c => c.offre === 'essai').length
  const nbPrepa = clientsIndividuels.filter(c => c.offre === 'preparation_physique').length
  const nbCoach = clientsIndividuels.filter(c => c.offre === 'coaching').length

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

      {/* ── Notifications reçues ────────────────────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => { setShowNotifs(v => !v); if (!showNotifs) markAllRead() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0, marginBottom: showNotifs ? '0.75rem' : 0 }}>
          <p style={S.sectionTitle}>Notifications</p>
          {unread > 0 && !showNotifs && (
            <span style={{ background: '#e4f816', color: '#333', borderRadius: 999, fontSize: '0.65rem', fontWeight: '800', padding: '1px 7px' }}>{unread}</span>
          )}
          <span style={{ color: '#d1d5db', fontSize: '1rem', transform: showNotifs ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
        </button>
        {showNotifs && (
          <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {notifs.length === 0 && (
              <div style={{ padding: '1.25rem', color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center' }}>Aucune notification</div>
            )}
            {notifs.slice(0, 30).map(n => (
              <div key={n.id} onClick={() => markRead(n.id)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.75rem 1.1rem', borderBottom: '1px solid #f3f4f6', background: n.lu ? 'white' : '#fafff0', cursor: 'default' }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 1 }}>{NOTIF_ICONS[n.type] || NOTIF_ICONS.default}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: n.lu ? '500' : '700', color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.titre}</p>
                  {n.corps && <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{n.corps}</p>}
                </div>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>{formatNotifTime(n.created_at)}</span>
                {!n.lu && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e4f816', flexShrink: 0, marginTop: 5 }} />}
              </div>
            ))}
          </div>
        )}
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
          {progFinBientot.map(p => (
            <div key={p.id} onClick={() => navigate(`/client/${p.clientId}`)} style={{ ...S.alertCard, borderLeft: '4px solid #0ea5e9' }}>
              <div style={{ ...S.alertAvatar, background: '#e0f2fe', color: '#0284c7' }}>📋</div>
              <div style={{ flex: 1 }}>
                <p style={S.alertName}>{p.clientNom}</p>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Cycle : {p.nom}</p>
              </div>
              <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '800', whiteSpace: 'nowrap' }}>
                ⏳ Fin dans {p.daysLeft}j
              </span>
              <span style={S.chevron}>›</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Aujourd'hui ─────────────────────────────────────────── */}
      {(seancesAujourdhui.length > 0 || sansWellness.length > 0) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ ...S.sectionTitle, marginBottom: '0.75rem' }}>Aujourd'hui</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {seancesAujourdhui.length > 0 && (
              <div style={{ background: '#333333', borderRadius: 12, padding: '0.75rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.1rem' }}>📅</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: '700', fontSize: '0.88rem', color: 'white' }}>{seancesAujourdhui.length} séance{seancesAujourdhui.length > 1 ? 's' : ''} planifiée{seancesAujourdhui.length > 1 ? 's' : ''}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                    {seancesAujourdhui.map(e => e.clients?.prenom).join(', ')}
                  </p>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#e4f816', background: 'rgba(228,248,22,0.15)', padding: '0.2rem 0.55rem', borderRadius: 999 }}>Aujourd'hui</span>
              </div>
            )}
            {sansWellness.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, padding: '0.75rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: '1.1rem' }}>🔕</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: '700', fontSize: '0.88rem', color: '#374151' }}>{sansWellness.length} client{sansWellness.length > 1 ? 's' : ''} sans wellness depuis 3j+</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>
                    {sansWellness.slice(0, 3).map(c => c.prenom).join(', ')}{sansWellness.length > 3 ? ` +${sansWellness.length - 3}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bilan de la semaine ─────────────────────────────────── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setShowBilan(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0, marginBottom: showBilan ? '0.75rem' : 0 }}>
          <p style={S.sectionTitle}>Bilan de la semaine</p>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '600' }}>
            {new Date(wStart + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – {new Date(wEnd + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
          <span style={{ color: '#d1d5db', fontSize: '1rem', transform: showBilan ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
        </button>
        {showBilan && (
          <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {/* En-tête colonnes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', padding: '0.5rem 1.1rem', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
              {['Client', 'Wellness moy.', 'Séances', 'Statut'].map(h => (
                <span key={h} style={{ fontSize: '0.62rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
              ))}
            </div>
            {bilanRows.map((c, i) => {
              const avg = c.wellness_week_avg
              const entriesCount = c.wellness_week?.length || 0
              const inactif = entriesCount === 0 && c.eventsCount === 0
              const wColor = avg === null ? '#9ca3af' : avg <= 2 ? '#dc2626' : avg <= 3 ? '#d97706' : '#16a34a'
              const av = getAvatar(c.prenom, c.nom)
              return (
                <div key={c.id} onClick={() => navigate(`/client/${c.id}`)}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px', gap: '0.5rem', alignItems: 'center', padding: '0.65rem 1.1rem', borderTop: i > 0 ? '1px solid #f9fafb' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {/* Nom */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {c.avatar_url
                      ? <img src={c.avatar_url} alt={c.prenom} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 30, height: 30, borderRadius: '50%', background: av.bg, color: av.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: '800', flexShrink: 0 }}>{av.initiales}</div>
                    }
                    <span style={{ fontWeight: '600', fontSize: '0.88rem', color: '#333333' }}>{c.prenom} {c.nom}</span>
                  </div>
                  {/* Wellness moy */}
                  <div>
                    {avg !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ flex: 1, height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${(avg / 4) * 100}%`, height: '100%', background: wColor, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: wColor, minWidth: 28 }}>{avg.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: '#d1d5db' }}>—</span>
                    )}
                    {entriesCount > 0 && (
                      <span style={{ fontSize: '0.62rem', color: '#9ca3af' }}>{entriesCount} bilan{entriesCount > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {/* Séances */}
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: c.eventsCount > 0 ? '#333333' : '#d1d5db' }}>
                    {c.eventsCount > 0 ? c.eventsCount : '—'}
                  </span>
                  {/* Statut */}
                  {inactif ? (
                    <span style={{ background: '#f3f4f6', color: '#9ca3af', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '700', whiteSpace: 'nowrap' }}>Inactif</span>
                  ) : avg !== null && avg <= 2 ? (
                    <span style={{ background: '#fef2f2', color: '#dc2626', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '700', whiteSpace: 'nowrap' }}>⚠ Bas</span>
                  ) : (
                    <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '700', whiteSpace: 'nowrap' }}>✓ OK</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

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

      {/* ── Groupes ─────────────────────────────────────────────── */}
      {groupes.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <p style={{ ...S.sectionTitle, marginBottom: '0.6rem' }}>Groupes</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {groupes.map(g => (
              <div key={g.id}
                onClick={() => navigate(`/groupe/${g.id}`)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.1rem', background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', cursor: 'pointer', borderLeft: `4px solid ${g.couleur}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {g.logo_url
                    ? <img src={g.logo_url} alt={g.nom} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
                    : <div style={{ width: 32, height: 32, borderRadius: 8, background: g.couleur + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>🏆</div>
                  }
                  <span style={{ fontWeight: '700', fontSize: '0.92rem', color: '#1a1a1a' }}>{g.nom}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ background: g.couleur + '18', color: g.couleur, border: `1px solid ${g.couleur}33`, borderRadius: 999, padding: '0.15rem 0.6rem', fontSize: '0.7rem', fontWeight: '700' }}>Groupe</span>
                  <span style={S.chevron}>›</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton nouveau groupe */}
      <div style={{ marginBottom: '1.25rem' }}>
        {showGroupeForm ? (
          <div style={{ background: 'white', borderRadius: 14, padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.88rem', color: '#1a1a1a' }}>Nouveau groupe</p>
            <input autoFocus value={newGroupeNom} onChange={e => setNewGroupeNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creerGroupe()}
              placeholder="Nom du groupe..." style={{ padding: '0.55rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.875rem', outline: 'none' }} />

            {/* Logo upload */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.35rem' }}>Logo du club</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', background: '#f3f4f6', borderRadius: 9, padding: '0.45rem 0.85rem', border: '1.5px solid #e5e7eb' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: 'white' }}>
                  {newGroupeLogoPreview
                    ? <img src={newGroupeLogoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: '1rem' }}>📂</span>}
                </div>
                <span style={{ fontSize: '0.82rem', color: newGroupeLogoFile ? '#374151' : '#9ca3af', fontWeight: '600' }}>
                  {extractingColors ? '⏳ Analyse couleurs...' : newGroupeLogoFile ? newGroupeLogoFile.name : 'Choisir un logo...'}
                </span>
                <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
              </label>
            </div>

            {/* Zone pipette — visible uniquement quand un logo est chargé */}
            {newGroupeLogoPreview && (
              <div style={{ background: pickingFor ? '#fffbeb' : '#f9fafb', borderRadius: 11, padding: '0.65rem', border: `1.5px solid ${pickingFor ? '#f59e0b' : '#e5e7eb'}`, transition: 'all 0.15s' }}>
                {pickingFor && (
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: '700', color: '#d97706', textAlign: 'center' }}>
                    🎨 Cliquez sur le logo pour choisir la couleur {pickingFor === 'primary' ? 'principale' : 'secondaire'}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <img
                    ref={logoPickRef}
                    src={newGroupeLogoPreview}
                    alt="logo"
                    onClick={pickingFor ? handleLogoColorPick : undefined}
                    crossOrigin="anonymous"
                    style={{
                      height: pickingFor ? 100 : 56,
                      maxWidth: '100%',
                      objectFit: 'contain',
                      borderRadius: 8,
                      cursor: pickingFor ? 'crosshair' : 'default',
                      transition: 'height 0.2s',
                      outline: pickingFor ? '2px solid #f59e0b' : 'none',
                      outlineOffset: 3,
                    }}
                  />
                </div>
                {pickingFor && (
                  <button onClick={() => setPickingFor(null)} style={{ display: 'block', margin: '0.45rem auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#9ca3af' }}>Annuler</button>
                )}
              </div>
            )}

            {/* Couleurs */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="color" value={newGroupeCouleur} onChange={e => setNewGroupeCouleur(e.target.value)}
                  style={{ width: 32, height: 28, border: '1.5px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', padding: '2px', background: 'white' }} />
                <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: '700' }}>Principale</span>
                {newGroupeLogoPreview && (
                  <button onClick={() => setPickingFor(pickingFor === 'primary' ? null : 'primary')}
                    title="Pipette — cliquer sur le logo"
                    style={{ background: pickingFor === 'primary' ? '#fef3c7' : '#f3f4f6', border: `1.5px solid ${pickingFor === 'primary' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', padding: '2px 6px', fontSize: '0.82rem', lineHeight: 1 }}>
                    🎨
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="color" value={newGroupeCouleur2 || '#cccccc'} onChange={e => setNewGroupeCouleur2(e.target.value)}
                  style={{ width: 32, height: 28, border: `1.5px solid ${newGroupeCouleur2 ? '#e5e7eb' : '#d1d5db'}`, borderRadius: 7, cursor: 'pointer', padding: '2px', background: 'white', opacity: newGroupeCouleur2 ? 1 : 0.45 }} />
                <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: '700' }}>Secondaire</span>
                {newGroupeLogoPreview && (
                  <button onClick={() => setPickingFor(pickingFor === 'secondary' ? null : 'secondary')}
                    title="Pipette — cliquer sur le logo"
                    style={{ background: pickingFor === 'secondary' ? '#fef3c7' : '#f3f4f6', border: `1.5px solid ${pickingFor === 'secondary' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', padding: '2px 6px', fontSize: '0.82rem', lineHeight: 1 }}>
                    🎨
                  </button>
                )}
                {newGroupeCouleur2 && (
                  <button onClick={() => setNewGroupeCouleur2('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', padding: 0 }}>✕</button>
                )}
              </div>
            </div>

            {/* Aperçu live */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.9rem', borderRadius: 11, background: '#f9fafb', borderLeft: `4px solid ${newGroupeCouleur}` }}>
              {newGroupeLogoPreview
                ? <img src={newGroupeLogoPreview} alt="" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />
                : <div style={{ width: 26, height: 26, borderRadius: 7, background: newGroupeCouleur + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>🏆</div>
              }
              <span style={{ fontWeight: '700', fontSize: '0.88rem', color: '#1a1a1a', flex: 1 }}>{newGroupeNom || 'Nom du groupe'}</span>
              <span style={{ background: newGroupeCouleur + '18', color: newGroupeCouleur, border: `1px solid ${newGroupeCouleur}33`, borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: '700' }}>Groupe</span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={creerGroupe} disabled={uploadingLogo || extractingColors} style={{ ...S.btnPrimary, flex: 1, opacity: (uploadingLogo || extractingColors) ? 0.6 : 1 }}>
                {uploadingLogo ? 'Envoi...' : extractingColors ? 'Analyse...' : 'Créer'}
              </button>
              <button onClick={() => setShowGroupeForm(false)} style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '0.5rem 0.875rem', cursor: 'pointer', color: '#6b7280', fontWeight: '600', fontSize: '0.85rem' }}>Annuler</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowGroupeForm(true)}
            style={{ width: '100%', background: 'white', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.65rem', fontSize: '0.85rem', fontWeight: '700', color: '#6b7280', cursor: 'pointer' }}>
            🏆 Nouveau groupe
          </button>
        )}
      </div>

      {/* ── Clients ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <p style={S.sectionTitle}>Clients individuels</p>
        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{clientsIndividuels.length} client{clientsIndividuels.length !== 1 ? 's' : ''}</span>
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
          { label: 'Individuels', value: clientsIndividuels.length },
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
                    {client.avatar_url
                      ? <img src={client.avatar_url} alt={client.prenom} style={{ ...S.avatar, objectFit: 'cover' }} />
                      : <div style={{ ...S.avatar, background: av.bg, color: av.text }}>{av.initiales}</div>
                    }
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

      {/* Modal de recadrage logo groupe */}
      {cropSrc && (
        <CropLogoModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
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
