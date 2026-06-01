import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { extractColorsFromImage } from '../utils/colorExtract'
import CropLogoModal from '../components/CropLogoModal'
import { useNotifications } from '../hooks/useNotifications'

const PALETTE_CATS    = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4']
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

// Icônes SVG du menu (line-icons faits maison, héritent de currentColor)
const svgIco = paths => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
)
const NAV_ICONS = {
  overview:   svgIco(<><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>),
  clients:    svgIco(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></>),
  notifs:     svgIco(<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>),
  groupes:    svgIco(<><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>),
  calendrier: svgIco(<><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>),
}

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
  const [tab, setTab]                 = useState('overview') // overview | clients | notifs | groupes | calendrier
  const [showSecondaire, setShowSecondaire] = useState(false) // bilan + planning repliés par défaut
  // Groupes
  const [groupes, setGroupes]               = useState([])
  const [groupMemberIds, setGroupMemberIds] = useState(new Set())
  const [memberGroupMap, setMemberGroupMap] = useState({}) // client_id → { id, nom, couleur, logo_url }
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
      supabase.from('groupe_membres').select('client_id, groupe_id, groupes(id, nom, couleur, logo_url)'),
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
    // map client_id → infos groupe (pour afficher les membres regroupés)
    const map = {}
    for (const m of (membresData || [])) {
      if (m.client_id && m.groupes) map[m.client_id] = m.groupes
    }
    setMemberGroupMap(map)
    setLoading(false)
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

  async function marquerVu(clientId) {
    await supabase.from('clients').update({ coach_notifie: true }).eq('id', clientId)
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, coach_notifie: true } : c))
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

  // Programmes se terminant dans les 7 prochains jours (client doit exister)
  const progFinBientot = programmes.filter(p => {
    if (!p.date_debut) return false
    if (!clients.find(c => c.id === p.client_id)) return false  // client supprimé → on ignore
    const fin = new Date(p.date_debut + 'T00:00:00')
    fin.setDate(fin.getDate() + p.semaines * 7)
    const days = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 7
  }).map(p => {
    const fin = new Date(p.date_debut + 'T00:00:00')
    fin.setDate(fin.getDate() + p.semaines * 7)
    const daysLeft = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    const client = clients.find(c => c.id === p.client_id)
    return { ...p, daysLeft, clientNom: `${client.prenom} ${client.nom}`, clientId: p.client_id }
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
  // Membres de groupes
  const clientsMembres = clients.filter(c => groupMemberIds.has(c.id))

  const matchFiltre = c =>
    `${c.prenom} ${c.nom}`.toLowerCase().includes(search.toLowerCase()) &&
    (activeCat === null ? true : c.categorie_id === activeCat)

  // Filtrage clients individuels
  const filtered = clientsIndividuels.filter(matchFiltre)

  // Membres filtrés, regroupés par groupe
  const membresFiltres = clientsMembres.filter(matchFiltre)
  const membresParGroupe = {}
  for (const m of membresFiltres) {
    const g = memberGroupMap[m.id]
    const key = g?.id || 'autres'
    if (!membresParGroupe[key]) membresParGroupe[key] = { groupe: g, membres: [] }
    membresParGroupe[key].membres.push(m)
  }
  const groupesAvecMembres = Object.values(membresParGroupe)
    .sort((a, b) => (a.groupe?.nom || 'zzz').localeCompare(b.groupe?.nom || 'zzz'))

  const nbEssai = clientsIndividuels.filter(c => c.offre === 'essai').length
  const nbPrepa = clientsIndividuels.filter(c => c.offre === 'preparation_physique').length
  const nbCoach = clientsIndividuels.filter(c => c.offre === 'coaching').length

  const TABS = [
    { k: 'overview',   label: "Vue d'ensemble", icon: NAV_ICONS.overview },
    { k: 'clients',    label: 'Clients',        icon: NAV_ICONS.clients },
    { k: 'notifs',     label: 'Notifications',  icon: NAV_ICONS.notifs, badge: unread },
    { k: 'groupes',    label: 'Groupes',        icon: NAV_ICONS.groupes },
    { k: 'calendrier', label: 'Calendrier',     icon: NAV_ICONS.calendrier },
  ]
  function selectTab(k) {
    setTab(k)
    if (k === 'notifs' && unread > 0) markAllRead()
    window.scrollTo({ top: 0 })
  }

  return (
    <div style={S.page}>
      <div style={S.hero}>

        {/* ── Colonne gauche — résumé + menu d'onglets ── */}
        <div style={S.side}>
          <div style={S.sumCard}>
            <p style={S.sumDate}>{dateLabel}</p>
            <h1 style={S.sumTitle}>Tableau de bord</h1>
            <button style={S.sumStatBtn} onClick={() => selectTab('clients')}>
              <span style={S.sumStatL}>Clients</span><span style={S.sumStatV}>{clients.length}</span>
            </button>
            <button style={S.sumStatBtn} onClick={() => selectTab('overview')}>
              <span style={S.sumStatL}>Séances du jour</span><span style={S.sumStatV}>{seancesAujourdhui.length}</span>
            </button>
            <button style={S.sumStatBtn} onClick={() => selectTab('overview')}>
              <span style={S.sumStatL}>Alertes</span><span style={{ ...S.sumStatV, color: totalAlertes > 0 ? '#fca5a5' : '#e4f816' }}>{totalAlertes}</span>
            </button>
            <button style={S.sumStatBtn} onClick={() => selectTab('groupes')}>
              <span style={S.sumStatL}>Groupes</span><span style={S.sumStatV}>{groupes.length}</span>
            </button>
          </div>

          <div style={S.navCard}>
            {TABS.map(t => (
              <button key={t.k} onClick={() => selectTab(t.k)}
                style={{ ...S.navItem, ...(tab === t.k ? S.navItemOn : null) }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <span style={{ ...S.navIco, color: tab === t.k ? '#e4f816' : '#9aa1ac' }}>{t.icon}</span>
                  {t.label}
                </span>
                {t.badge > 0 && <span style={{ ...S.navBadge, ...(tab === t.k ? { background: '#e4f816', color: '#333333' } : null) }}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* Actions rapides — adaptées à l'onglet */}
          <div style={S.navCard}>
            <p style={{ ...S.sectionTitle, padding: '0.35rem 0.6rem 0.15rem' }}>Actions rapides</p>
            {tab === 'groupes' ? (
              <>
                <button style={S.btnPrimary} onClick={() => setShowGroupeForm(true)}>+ Nouveau groupe</button>
                <button style={S.quickAction} onClick={() => selectTab('clients')}>{NAV_ICONS.clients} Voir les clients</button>
              </>
            ) : tab === 'calendrier' ? (
              <>
                <button style={S.quickAction} onClick={() => selectTab('groupes')}>{NAV_ICONS.groupes} Gérer les groupes</button>
                <button style={S.btnPrimary} onClick={() => navigate('/nouveau-client')}>+ Nouveau client</button>
              </>
            ) : (
              <>
                <button style={S.btnPrimary} onClick={() => navigate('/nouveau-client')}>+ Nouveau client</button>
                <button style={S.quickAction} onClick={() => navigate('/messages')}>{NAV_ICONS.notifs} Messagerie</button>
                <button style={S.quickAction} onClick={() => selectTab('calendrier')}>{NAV_ICONS.calendrier} Calendriers</button>
              </>
            )}
          </div>
        </div>

        {/* ── Colonne droite — un seul grand bloc, change selon l'onglet ── */}
        <div style={S.panel}>

          {/* ═══ VUE D'ENSEMBLE ═══ */}
          {tab === 'overview' && (
            <div style={S.bento}>
              <div style={S.kpis}>
                <div style={S.kpiDark}>
                  <div style={S.kpiVal}>{seancesAujourdhui.length}</div>
                  <div style={S.kpiLbl}>séance{seancesAujourdhui.length > 1 ? 's' : ''} aujourd'hui</div>
                </div>
                <div style={S.kpiAccent}>
                  <div style={{ ...S.kpiVal, color: '#333333' }}>{totalAlertes}</div>
                  <div style={{ ...S.kpiLbl, color: '#333333', opacity: 0.8 }}>alerte{totalAlertes > 1 ? 's' : ''} à traiter</div>
                </div>
              </div>

              <div style={S.bentoGrid}>
                {/* Alertes — à traiter en priorité */}
                <div style={S.card}>
                  <div style={S.cardHead}>
                    <span style={S.sectionTitle}>À traiter</span>
                    {totalAlertes > 0 && <span style={{ ...S.pill, background: '#fef2f2', color: '#dc2626' }}>{totalAlertes}</span>}
                  </div>
                  {totalAlertes === 0 ? (
                    <p style={{ ...S.empty, color: '#16a34a' }}>✓ Tout va bien aujourd'hui.</p>
                  ) : (
                    <>
                      {wellnessAlertes.map(c => (
                        <div key={'w' + c.id} style={{ ...S.miniRow, borderLeft: '3px solid #ef4444', cursor: 'default' }}>
                          <div style={{ ...S.miniAva, background: '#fef2f2', color: '#dc2626' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{c.prenom} {c.nom}</p><p style={S.miniSub}>Wellness bas · {c.avg.toFixed(1)}/4</p></div>
                          <button style={S.miniBtnDark} onClick={() => navigate('/messages')}>Message</button>
                          <button style={S.miniBtn} onClick={() => navigate(`/client/${c.id}`)}>Voir</button>
                        </div>
                      ))}
                      {expirations.map(c => (
                        <div key={'e' + c.id} style={{ ...S.miniRow, borderLeft: '3px solid #f59e0b', cursor: 'default' }}>
                          <div style={{ ...S.miniAva, background: '#fffbeb', color: '#d97706' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{c.prenom} {c.nom}</p><p style={S.miniSub}>Abonnement expire {c.daysLeft === 0 ? "auj." : `dans ${c.daysLeft}j`}</p></div>
                          <button style={S.miniBtn} onClick={() => navigate(`/client/${c.id}`)}>Voir</button>
                        </div>
                      ))}
                      {nouveaux.map(c => (
                        <div key={'n' + c.id} style={{ ...S.miniRow, borderLeft: '3px solid #6366f1', cursor: 'default' }}>
                          <div style={{ ...S.miniAva, background: '#ede9fe', color: '#6d28d9' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{c.prenom} {c.nom}</p><p style={S.miniSub}>Nouveau client</p></div>
                          <button style={S.miniBtnDark} onClick={() => navigate(`/client/${c.id}`)}>Voir</button>
                          <button style={S.miniBtn} onClick={() => marquerVu(c.id)}>Vu</button>
                        </div>
                      ))}
                      {progFinBientot.map(p => (
                        <div key={'p' + p.id} onClick={() => navigate(`/client/${p.clientId}`)} style={{ ...S.miniRow, borderLeft: '3px solid #0ea5e9' }}>
                          <div style={{ ...S.miniAva, background: '#e0f2fe', color: '#0284c7' }}>📋</div>
                          <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{p.clientNom}</p><p style={S.miniSub}>Cycle : {p.nom}</p></div>
                          <span style={{ ...S.pill, background: '#e0f2fe', color: '#0284c7' }}>Fin {p.daysLeft}j</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Séances du jour */}
                <div style={S.card}>
                  <div style={S.cardHead}><span style={S.sectionTitle}>Séances du jour</span></div>
                  {seancesAujourdhui.length === 0 ? (
                    <p style={S.empty}>Aucune séance planifiée aujourd'hui.</p>
                  ) : (
                    seancesAujourdhui.map(ev => (
                      <div key={ev.id} onClick={() => navigate(`/client/${ev.client_id}`)} style={S.miniRow}>
                        <div style={S.miniIco}>📅</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={S.miniName}>{ev.titre}</p>
                          <p style={S.miniSub}>{ev.clients?.prenom} {ev.clients?.nom}</p>
                        </div>
                        <span style={S.chevron}>›</span>
                      </div>
                    ))
                  )}
                  {sansWellness.length > 0 && (
                    <div style={{ ...S.miniRow, cursor: 'default' }}>
                      <div style={S.miniIco}>🔕</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={S.miniName}>{sansWellness.length} sans wellness 3j+</p>
                        <p style={S.miniSub}>{sansWellness.slice(0, 3).map(c => c.prenom).join(', ')}{sansWellness.length > 3 ? ` +${sansWellness.length - 3}` : ''}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Détails (bilan + planning) — repliable */}
              <button onClick={() => setShowSecondaire(v => !v)} style={S.collapseBtn}>
                <span style={S.sectionTitle}>Bilan & planning de la semaine</span>
                <span style={{ color: '#9aa1ac', fontSize: '1rem', transform: showSecondaire ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
              </button>

              {showSecondaire && (<>
              {/* Bilan de la semaine */}
              <div style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.sectionTitle}>Bilan de la semaine</span>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: '600' }}>
                    {new Date(wStart + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – {new Date(wEnd + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 70px', gap: '0.5rem', padding: '0.4rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                  {['Client', 'Wellness moy.', 'Séances', 'Statut'].map(h => (
                    <span key={h} style={{ fontSize: '0.6rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>
                {bilanRows.map((c) => {
                  const avg = c.wellness_week_avg
                  const entriesCount = c.wellness_week?.length || 0
                  const inactif = entriesCount === 0 && c.eventsCount === 0
                  const wColor = avg === null ? '#9ca3af' : avg <= 2 ? '#dc2626' : avg <= 3 ? '#d97706' : '#16a34a'
                  const av = getAvatar(c.prenom, c.nom)
                  return (
                    <div key={c.id} onClick={() => navigate(`/client/${c.id}`)}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 70px', gap: '0.5rem', alignItems: 'center', padding: '0.55rem 1rem', borderTop: '1px solid #f6f7f8', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                        {c.avatar_url
                          ? <img src={c.avatar_url} alt={c.prenom} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 28, height: 28, borderRadius: '50%', background: av.bg, color: av.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '800', flexShrink: 0 }}>{av.initiales}</div>
                        }
                        <span style={{ ...S.miniName }}>{c.prenom} {c.nom}</span>
                      </div>
                      <div>
                        {avg !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ flex: 1, height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${(avg / 4) * 100}%`, height: '100%', background: wColor, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: wColor, minWidth: 26 }}>{avg.toFixed(1)}</span>
                          </div>
                        ) : <span style={{ fontSize: '0.78rem', color: '#d1d5db' }}>—</span>}
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: c.eventsCount > 0 ? '#333333' : '#d1d5db' }}>
                        {c.eventsCount > 0 ? c.eventsCount : '—'}
                      </span>
                      {inactif ? (
                        <span style={{ ...S.pill, background: '#f3f4f6', color: '#9ca3af' }}>Inactif</span>
                      ) : avg !== null && avg <= 2 ? (
                        <span style={{ ...S.pill, background: '#fef2f2', color: '#dc2626' }}>⚠ Bas</span>
                      ) : (
                        <span style={{ ...S.pill, background: '#f0fdf4', color: '#16a34a' }}>✓ OK</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Cette semaine */}
              <div style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.sectionTitle}>Cette semaine</span>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: '600' }}>{weekEvents.length} évènement{weekEvents.length !== 1 ? 's' : ''}</span>
                </div>
                {weekEvents.length === 0 ? (
                  <p style={S.empty}>Aucun évènement cette semaine.</p>
                ) : (
                  weekEvents.map(ev => {
                    const d = new Date(ev.date + 'T00:00:00')
                    const isToday = ev.date === today
                    const isPast  = ev.date < today
                    return (
                      <div key={ev.id} onClick={() => navigate(`/client/${ev.client_id}`)}
                        style={{ ...S.miniRow, opacity: isPast && !isToday ? 0.55 : 1 }}>
                        <div style={{ ...S.dayBadge, background: isToday ? '#333333' : '#f3f4f6', color: isToday ? '#e4f816' : '#6b7280' }}>
                          <span style={{ fontSize: '0.5rem', fontWeight: '800', textTransform: 'uppercase', lineHeight: 1 }}>{JOURS[d.getDay()]}</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: '900', lineHeight: 1 }}>{d.getDate()}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={S.miniName}>{ev.titre}</p>
                          <p style={S.miniSub}>{ev.clients?.prenom} {ev.clients?.nom}</p>
                        </div>
                        {isToday && <span style={{ ...S.pill, background: 'rgba(228,248,22,0.25)', color: '#7a8400' }}>Auj.</span>}
                        <span style={S.chevron}>›</span>
                      </div>
                    )
                  })
                )}
              </div>
              </>)}
            </div>
          )}

          {/* ═══ NOTIFICATIONS ═══ */}
          {tab === 'notifs' && (
            <div style={S.card}>
              <div style={S.cardHead}><span style={S.sectionTitle}>Notifications</span></div>
              {notifs.length === 0 && <p style={S.empty}>Aucune notification</p>}
              {notifs.slice(0, 50).map(n => (
                <div key={n.id} onClick={() => { markRead(n.id); if (n.lien && n.lien.startsWith('/') && !n.lien.startsWith('/client/')) navigate(n.lien) }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.7rem 1rem', borderTop: '1px solid #f6f7f8', background: n.lu ? 'white' : '#fafff0', cursor: n.lien && !n.lien.startsWith('/client/') ? 'pointer' : 'default' }}>
                  <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 1 }}>{NOTIF_ICONS[n.type] || NOTIF_ICONS.default}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: n.lu ? '500' : '700', color: '#1a1a1a' }}>{n.titre}</p>
                    {n.corps && <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{n.corps}</p>}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>{formatNotifTime(n.created_at)}</span>
                  {!n.lu && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e4f816', flexShrink: 0, marginTop: 5 }} />}
                </div>
              ))}
            </div>
          )}

          {/* ═══ CLIENTS ═══ */}
          {tab === 'clients' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <p style={S.sectionTitle}>Clients individuels</p>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{clientsIndividuels.length} client{clientsIndividuels.length !== 1 ? 's' : ''}</span>
              </div>

              <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>🔍</span>
                <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.875rem 0.65rem 2.4rem', border: '1.5px solid #e5e7eb', borderRadius: '12px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: 'white' }}
                />
              </div>

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

              {/* ── Membres de groupes ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.75rem 0 0.75rem' }}>
                <p style={S.sectionTitle}>Membres de groupes</p>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{clientsMembres.length} membre{clientsMembres.length !== 1 ? 's' : ''}</span>
              </div>

              {clientsMembres.length === 0 ? (
                <p style={{ ...S.empty, padding: '0.5rem 0' }}>Aucun membre de groupe.</p>
              ) : groupesAvecMembres.length === 0 ? (
                <p style={{ ...S.empty, padding: '0.5rem 0' }}>Aucun membre trouvé pour cette recherche.</p>
              ) : (
                groupesAvecMembres.map(({ groupe: g, membres }) => (
                  <div key={g?.id || 'autres'} style={{ marginBottom: '1rem' }}>
                    {/* En-tête groupe */}
                    <div onClick={() => g && navigate(`/groupe/${g.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.25rem', cursor: g ? 'pointer' : 'default' }}>
                      {g?.logo_url
                        ? <img src={g.logo_url} alt={g.nom} style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />
                        : <span style={{ width: 12, height: 12, borderRadius: 4, background: g?.couleur || '#9ca3af', flexShrink: 0 }} />}
                      <span style={{ fontWeight: '800', fontSize: '0.82rem', color: '#333333' }}>{g?.nom || 'Sans groupe'}</span>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>· {membres.length}</span>
                      <div style={{ flex: 1, height: 1, background: (g?.couleur || '#e5e7eb') + '33' }} />
                    </div>

                    <div style={{ ...S.listCard, borderLeft: `3px solid ${g?.couleur || '#e5e7eb'}` }}>
                      {membres.map((client, i) => {
                        const av  = getAvatar(client.prenom, client.nom)
                        const sub = getSubInfo(client.date_fin)
                        const w   = client.wellness_today
                        const wAvg = w ? (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 : null
                        return (
                          <div key={client.id} onClick={() => navigate(`/client/${client.id}`)}
                            style={{ ...S.listRow, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              {client.avatar_url
                                ? <img src={client.avatar_url} alt={client.prenom} style={{ ...S.avatar, objectFit: 'cover' }} />
                                : <div style={{ ...S.avatar, background: av.bg, color: av.text }}>{av.initiales}</div>}
                              <div>
                                <p style={S.clientName}>{client.prenom} {client.nom}</p>
                                {client.objectif && <p style={{ color: '#9ca3af', fontSize: '0.78rem', margin: 0 }}>{client.objectif}</p>}
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
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ═══ CALENDRIER ═══ */}
          {tab === 'calendrier' && (
            <div style={S.card}>
              <div style={S.cardHead}><span style={S.sectionTitle}>Calendrier des groupes</span></div>
              {groupes.length === 0 ? (
                <p style={S.empty}>Crée un groupe pour accéder à son calendrier de saison.</p>
              ) : (
                groupes.map(g => (
                  <div key={g.id} onClick={() => navigate(`/groupe/${g.id}?tab=calendrier`)}
                    style={{ ...S.miniRow, borderLeft: `3px solid ${g.couleur}` }}>
                    {g.logo_url
                      ? <img src={g.logo_url} alt={g.nom} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
                      : <div style={{ width: 28, height: 28, borderRadius: 7, background: g.couleur + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>🏆</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={S.miniName}>{g.nom}</p>
                      <p style={S.miniSub}>Ouvrir le calendrier de saison</p>
                    </div>
                    <span style={{ ...S.pill, background: g.couleur + '18', color: g.couleur }}>📅</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ═══ GROUPES ═══ */}
          {tab === 'groupes' && (
            <div>
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
                          <button onClick={e => { e.stopPropagation(); navigate(`/groupe/${g.id}?tab=calendrier`) }}
                            title="Ouvrir le calendrier du groupe"
                            style={{ background: g.couleur + '14', color: g.couleur, border: `1px solid ${g.couleur}33`, borderRadius: 8, padding: '0.25rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}>
                            📅 Calendrier
                          </button>
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
            </div>
          )}

        </div>
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
  page:        { padding: '2rem', maxWidth: '1120px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered:    { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },

  // ── Héros (sidebar + bento) ──
  hero:        { display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1rem', marginBottom: '1.75rem', alignItems: 'start' },
  side:        { display: 'flex', flexDirection: 'column', gap: '0.85rem', position: 'sticky', top: '76px' },
  sumCard:     { background: 'linear-gradient(160deg, #333333 0%, #1f2937 100%)', borderRadius: 16, padding: '1.1rem', color: '#fff' },
  sumDate:     { fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize', margin: 0 },
  sumTitle:    { fontSize: '1.15rem', fontWeight: '900', margin: '0.2rem 0 0.9rem' },
  sumStat:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)' },
  sumStatBtn:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'none', cursor: 'pointer' },
  quickAction: { display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', textAlign: 'left', background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '0.55rem 0.7rem', fontSize: '0.82rem', fontWeight: '700', color: '#374151', cursor: 'pointer', marginTop: '0.3rem' },
  miniBtn:     { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  miniBtnDark: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  collapseBtn: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '0.3rem 0.1rem' },
  sumStatL:    { fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' },
  sumStatV:    { fontSize: '1.1rem', fontWeight: '900', color: '#e4f816' },
  navCard:     { background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  navItem:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 10, padding: '0.6rem 0.75rem', fontSize: '0.84rem', fontWeight: '600', color: '#5b626c', cursor: 'pointer' },
  navItemOn:   { background: '#333333', color: '#fff' },
  navBadge:    { background: '#e4f816', color: '#333333', borderRadius: 999, fontSize: '0.62rem', fontWeight: '800', padding: '1px 7px' },
  navIco:      { display: 'flex', alignItems: 'center', flexShrink: 0 },
  panel:       { minWidth: 0 },
  bento:       { display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0 },
  kpis:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' },
  kpiDark:     { background: 'linear-gradient(135deg, #333333, #1f2937)', borderRadius: 16, padding: '1rem 1.15rem', color: '#fff' },
  kpiAccent:   { background: '#e4f816', borderRadius: 16, padding: '1rem 1.15rem' },
  kpiVal:      { fontSize: '1.7rem', fontWeight: '900', lineHeight: 1, color: '#e4f816' },
  kpiLbl:      { fontSize: '0.7rem', fontWeight: '700', opacity: 0.8, marginTop: '0.4rem' },
  bentoGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', alignItems: 'start' },
  card:        { background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', paddingBottom: '0.35rem' },
  cardHead:    { padding: '0.8rem 1rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty:       { color: '#9ca3af', fontSize: '0.82rem', padding: '0.5rem 1rem 0.9rem', margin: 0 },
  miniRow:     { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 1rem', cursor: 'pointer', borderTop: '1px solid #f6f7f8' },
  miniIco:     { width: 28, height: 28, borderRadius: 7, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 },
  miniAva:     { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: '800', flexShrink: 0 },
  miniName:    { margin: 0, fontSize: '0.82rem', fontWeight: '700', color: '#333333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  miniSub:     { margin: 0, fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  pill:        { borderRadius: 999, fontSize: '0.68rem', fontWeight: '800', padding: '0.15rem 0.5rem', whiteSpace: 'nowrap', flexShrink: 0 },
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
