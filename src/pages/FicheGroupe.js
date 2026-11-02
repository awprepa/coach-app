import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { extractColorsFromImage } from '../utils/colorExtract'
import CropLogoModal from '../components/CropLogoModal'
import CalendrierSaison, { EffectifView, GroupesNiveauView } from './CalendrierSaison'
import GroupeIntensite from '../components/GroupeIntensite'
import { formatRetour, getActiveBlessure } from '../components/BlessureButton'
import GroupeTestsView from '../components/GroupeTestsView'
import GroupeBlessuresView from '../components/GroupeBlessuresView'
import GroupeClassementView from '../components/GroupeClassementView'
import ClubEquipes from '../components/ClubEquipes'
import Icon from '../components/Icon'
import { isoLocal } from '../utils/dates'

const PALETTE_SG = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#e4f816','#f97316']

// Couleur du wellness (moyenne /4) — mêmes seuils que la page client
function wellnessColor(v) {
  if (!v) return '#9ca3af'
  if (v <= 1) return '#ef4444'  // rouge
  if (v <= 2) return '#f97316'  // orange
  if (v <= 3) return '#eab308'  // jaune
  return '#22c55e'              // vert
}

const OFFRES = {
  essai:                { label: 'Essai',         bg: '#fff7ed', color: '#c2410c' },
  preparation_physique: { label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:             { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
  club:                 { label: 'Club',           bg: '#f0fdf4', color: '#15803d' },
}

// Même mapping poste → nom que EffectifView (CalendrierSaison.js), pour
// afficher le poste de chaque membre dans le tableau du tableau de bord.
const POSTE_NOMS = {
  1: 'Pilier', 2: 'Talonneur', 3: 'Pilier',
  4: '2e ligne', 5: '2e ligne',
  6: '3e ligne', 7: '3e ligne', 8: '3e ligne',
  9: 'Demi de mêlée', 10: "Demi d'ouverture",
  12: 'Centre', 13: 'Centre',
  11: 'Ailier', 15: 'Arrière', 14: 'Ailier',
}

// Bornes de la semaine courante (lundi → dimanche), format YYYY-MM-DD
function getWeekBounds() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: isoLocal(monday), end: isoLocal(sunday) }
}

export default function FicheGroupe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab = tabParam === 'calendrier' ? 'calendrier' : tabParam === 'tests' ? 'tests' : tabParam === 'blessures' ? 'blessures' : tabParam === 'classement' ? 'classement' : 'groupe'
  const openEventId = searchParams.get('evenement') || null
  const setTab = t => setSearchParams(t === 'groupe' ? {} : { tab: t })
  const openCalendrierEvent = evId => setSearchParams({ tab: 'calendrier', evenement: evId })

  const [groupe, setGroupe]               = useState(null)
  const [parent, setParent]               = useState(null)
  const [sousGroupes, setSousGroupes]     = useState([])
  const [membres, setMembres]             = useState([])
  const [wellnessMap, setWellnessMap]     = useState({})  // { client_id: dernier wellness }
  const [wellnessDetail, setWellnessDetail] = useState(false) // détail des wellness du jour
  const [manquantsOuverts, setManquantsOuverts] = useState(false) // liste « pas encore rempli » dépliée
  const [eventsCountMap, setEventsCountMap] = useState({}) // { client_id: nb événements cette semaine }
  const [programmes, setProgrammes]       = useState([])
  const [loading, setLoading]             = useState(true)

  // Modales
  const [editOpen, setEditOpen]           = useState(false)
  const [editForm, setEditForm]           = useState({ nom: '', couleur: '', couleur_secondaire: '', monclubhouse_url: '', monclubhouse_competition: '', monclubhouse_competition_espoirs: '' })
  const [editLogoFile, setEditLogoFile]   = useState(null)
  const [editLogoPreview, setEditLogoPreview] = useState(null)
  const [saving, setSaving]               = useState(false)
  const [extractingEditColors, setExtractingEditColors] = useState(false)
  const [editPickingFor, setEditPickingFor] = useState(null) // 'primary' | 'secondary' | null
  const editLogoPickRef = useRef(null)
  const [editCropSrc, setEditCropSrc]       = useState(null)
  const [editPendingFile, setEditPendingFile] = useState(null)

  const [showAddSG, setShowAddSG]         = useState(false)
  const [newSGNom, setNewSGNom]           = useState('')
  const [newSGCouleur, setNewSGCouleur]   = useState('')

  const [showAddMembre, setShowAddMembre] = useState(false)
  const [searchMembre, setSearchMembre]   = useState('')
  const [candidats, setCandidats]         = useState([])   // clients individuels disponibles
  const [selectedCandidats, setSelectedCandidats] = useState(new Set())
  const [addingMembres, setAddingMembres] = useState(false)
  const [showPushToNew, setShowPushToNew]   = useState(false)
  const [newMembresIds, setNewMembresIds]   = useState([])
  const [progsDispos, setProgsDispos]       = useState([])
  const [selectedProgsForNew, setSelectedProgsForNew] = useState(new Set())
  const [pushingToNew, setPushingToNew]     = useState(false)

  const [pushLoading, setPushLoading]     = useState(null)
  const [dedupLoading, setDedupLoading]   = useState(null)

  // ── Vue d'ensemble — nouveaux widgets ───────────────────────────────────────
  const [classementFFR, setClassementFFR] = useState([])
  const [onglets, setOnglets]             = useState(null) // { equipe: {id, nom, n}, sgs: [{id, nom, n}], sans } — onglets équipe / sous-groupes
  const [sgParClient, setSgParClient]     = useState({})   // { client_id: [noms des sous-groupes] }
  const [idsCal, setIdsCal]               = useState([])   // groupes dont on montre les événements (le sous-groupe + son équipe)
  const [prochainMatch, setProchainMatch] = useState(null) // { date, heure, adversaire, domicile }
  const [bascule, setBascule]             = useState(false) // changement d'onglet en cours
  const [menuOuvert, setMenuOuvert]       = useState(false)
  const [classementSrc, setClassementSrc] = useState(null) // groupe dont on affiche le classement (lui-même, ou son équipe pour un sous-groupe)
  const [prochain, setProchain]           = useState(null)     // { evenement, blocs: [{ nom, dureeMin, sequences }] }
  const [monthEvents, setMonthEvents]     = useState({})       // { 'YYYY-MM-DD': [type,...] }
  const [calMonth, setCalMonth]           = useState(() => new Date())
  const [membreSort, setMembreSort]       = useState({ key: 'nom', dir: 1 })
  const [effectifOpen, setEffectifOpen]   = useState(false)
  const [membreSearch, setMembreSearch]   = useState('')
  const [posteMap, setPosteMap]           = useState({}) // { client_id: nom du poste principal }
  const [rosterClientIds, setRosterClientIds] = useState(new Set()) // client_id présents dans l'effectif (groupe_joueurs)
  const [openJoueurClientId, setOpenJoueurClientId] = useState(null) // déclenche l'ouverture du profil groupe depuis Membres
  const [membreFiltre, setMembreFiltre]   = useState('tous') // 'tous' | 'surveiller'
  const [blesses, setBlesses]             = useState([]) // joueurs blessés du groupe [{ nomComplet, description, duree_estimee, date_retour_prevue }]

  // ── Chargement ────────────────────────────────────────────────────────────
  // Passer d'un onglet (équipe / sous-groupe) à l'autre recharge sans écran de chargement
  useEffect(() => {
    if (groupe) setBascule(true)
    load(!!groupe).then(() => setBascule(false))
  }, [id]) // eslint-disable-line
  useEffect(() => { if (idsCal.length) loadMonthEvents() }, [idsCal, calMonth]) // eslint-disable-line

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const [{ data: g }, { data: sg }, { data: gm }, { data: progs }] = await Promise.all([
      supabase.from('groupes').select('*').eq('id', id).single(),
      supabase.from('groupes').select('*').eq('parent_id', id).order('created_at'),
      supabase.from('groupe_membres').select('client_id, clients(id, prenom, nom, offre, date_fin)').eq('groupe_id', id),
      supabase.from('programmes').select('*, seances(count)').eq('groupe_id', id).is('template_id', null).order('created_at', { ascending: false }),
    ])
    // Traiter les anciennes couleurs par défaut comme "aucune couleur"
    const couleurEffective = (g?.couleur && g.couleur !== '#333333') ? g.couleur : null
    const couleur2Effective = (g?.couleur_secondaire && g.couleur_secondaire !== '#e4f816') ? g.couleur_secondaire : null
    const cleanedG = g ? { ...g, couleur: couleurEffective, couleur_secondaire: couleur2Effective } : g
    // Nettoyer en DB si nécessaire
    if (g && (g.couleur !== couleurEffective || g.couleur_secondaire !== couleur2Effective)) {
      await supabase.from('groupes').update({ couleur: couleurEffective, couleur_secondaire: couleur2Effective }).eq('id', g.id)
    }
    setGroupe(cleanedG)
    setEditForm({ nom: cleanedG?.nom || '', couleur: cleanedG?.couleur || '', couleur_secondaire: cleanedG?.couleur_secondaire || '', monclubhouse_url: cleanedG?.monclubhouse_url || '', monclubhouse_competition: cleanedG?.monclubhouse_competition || '', monclubhouse_competition_espoirs: cleanedG?.monclubhouse_competition_espoirs || '' })
    setEditLogoFile(null)
    setEditLogoPreview(null)
    setSousGroupes(sg || [])
    let membresList = (gm || []).map(r => r.clients).filter(Boolean)
    // Un club regroupe les joueurs de toutes ses équipes : ses membres sont
    // ceux rattachés au club + ceux de ses équipes, sans doublon.
    if (g?.type === 'club' && sg?.length) {
      const { data: em } = await supabase.from('groupe_membres')
        .select('client_id, clients(id, prenom, nom, offre, date_fin)').in('groupe_id', sg.map(x => x.id))
      const vus = new Set(membresList.map(c => c.id))
      for (const r of (em || [])) if (r.clients && !vus.has(r.clients.id)) { vus.add(r.clients.id); membresList.push(r.clients) }
      membresList = membresList.sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`))
    }
    setMembres(membresList)

    setProgrammes(progs || [])

    // Poste principal de chaque membre — vient de l'effectif (groupe_joueurs
    // liés par client_id), pas des clients directement.
    // Un sous-groupe affiche aussi le calendrier et les fiches de son équipe ;
    // une équipe lit aussi les fiches rangées dans ses sous-groupes.
    let p = null
    if (g?.parent_id) {
      ({ data: p } = await supabase.from('groupes').select('id, nom, type, logo_url, monclubhouse_url, monclubhouse_competition, monclubhouse_competition_espoirs').eq('id', g.parent_id).single())
    }
    setParent(p)
    const estSG = !!(p && p.type !== 'club')
    const lies = estSG ? [id, p.id] : [id]
    setIdsCal(lies)

    // Onglets : l'équipe, ses sous-groupes et les joueurs sans sous-groupe
    const equipe = estSG ? p : g
    let freres = sg || [], frMembres = null, nEquipe = membresList.length, idsEquipe = new Set(membresList.map(m => m.id))
    if (estSG) {
      const [{ data: fr }, { data: em }] = await Promise.all([
        supabase.from('groupes').select('*').eq('parent_id', p.id).order('created_at'),
        supabase.from('groupe_membres').select('client_id').eq('groupe_id', p.id),
      ])
      freres = fr || []
      idsEquipe = new Set((em || []).map(r => r.client_id))
      nEquipe = idsEquipe.size
    }
    if (freres.length) {
      ({ data: frMembres } = await supabase.from('groupe_membres').select('groupe_id, client_id').in('groupe_id', freres.map(x => x.id)))
    }
    const parClient = {}
    for (const r of (frMembres || [])) {
      const nomSG = freres.find(x => x.id === r.groupe_id)?.nom
      if (nomSG) (parClient[r.client_id] ||= []).push(nomSG)
    }
    setSgParClient(parClient)
    setOnglets(g?.type === 'club' || !freres.length ? null : {
      equipe: { id: equipe.id, nom: equipe.nom, n: nEquipe },
      sgs: freres.map(x => ({ id: x.id, nom: x.nom, n: (frMembres || []).filter(r => r.groupe_id === x.id).length })),
      sans: [...idsEquipe].filter(c => !parClient[c]).length,
    })

    const idsJoueurs = estSG ? lies : [id, ...(sg || []).map(x => x.id)]
    const { data: joueursTous } = await supabase
      .from('groupe_joueurs').select('groupe_id, client_id, prenom, nom, joueur_postes(poste, is_primary), joueur_blessures(statut, description, duree_estimee, date_retour_prevue)')
      .in('groupe_id', idsJoueurs).not('client_id', 'is', null)
    // Une fiche par joueur : celle du groupe affiché d'abord, sinon celle de l'équipe ou d'un sous-groupe
    const idsMembres = new Set(membresList.map(m => m.id))
    const joueursData = []
    const vusJ = new Set()
    for (const j of [...(joueursTous || [])].sort((a, b) => (b.groupe_id === id) - (a.groupe_id === id))) {
      if (!idsMembres.has(j.client_id) || vusJ.has(j.client_id)) continue
      vusJ.add(j.client_id); joueursData.push(j)
    }
    const pMap = {}
    for (const j of joueursData) {
      if (!j.client_id) continue
      const postes = j.joueur_postes || []
      const primary = postes.find(p => p.is_primary) || postes[0]
      if (primary) pMap[j.client_id] = POSTE_NOMS[primary.poste] || `Poste ${primary.poste}`
    }
    setPosteMap(pMap)
    setRosterClientIds(new Set((joueursTous || []).filter(j => j.groupe_id === id).map(j => j.client_id)))
    setBlesses(joueursData
      .map(j => ({ j, bl: getActiveBlessure(j.joueur_blessures) }))
      .filter(({ bl }) => bl)
      .map(({ j, bl }) => ({
        clientId: j.client_id,
        nomComplet: `${j.prenom || ''} ${j.nom || ''}`.trim() || 'Joueur',
        description: bl.description,
        duree_estimee: bl.duree_estimee,
        date_retour_prevue: bl.date_retour_prevue,
      })))

    // Dernier wellness de chaque membre
    const memberIds = membresList.map(m => m.id)
    if (memberIds.length > 0) {
      const { data: wRows } = await supabase
        .from('wellness').select('*')
        .in('client_id', memberIds)
        .order('date', { ascending: false })
      const wMap = {}
      for (const w of (wRows || [])) { if (!wMap[w.client_id]) wMap[w.client_id] = w }
      setWellnessMap(wMap)

      // Nombre d'événements ajoutés au calendrier cette semaine, par membre
      const { start, end } = getWeekBounds()
      const { data: evRows } = await supabase
        .from('evenements').select('client_id')
        .in('client_id', memberIds)
        .gte('date', start).lte('date', end)
      const evMap = {}
      for (const e of (evRows || [])) {
        if (e.client_id) evMap[e.client_id] = (evMap[e.client_id] || 0) + 1
      }
      setEventsCountMap(evMap)
    } else {
      setWellnessMap({})
      setEventsCountMap({})
    }

    // Classement FFR — seulement si le groupe est relié à monclubhouse (même source que l'onglet Compétition).
    // Un sous-groupe sans lien à lui reprend le classement de son équipe.
    const src = g?.monclubhouse_url ? g : (p && p.type !== 'club' && p.monclubhouse_url ? p : null)
    setClassementSrc(src)
    if (src) {
      const { data: cls } = await supabase.from('classements_ffr').select('*').eq('groupe_id', src.id).order('position')
      setClassementFFR(cls || [])
      // Sync auto en arrière-plan (au plus une fois toutes les 3h par groupe) pour que le
      // classement se mette à jour sans que le coach ait besoin d'aller cliquer "Sync" ailleurs.
      const throttleKey = `ffrSync_${src.id}`
      const lastSync = Number(localStorage.getItem(throttleKey) || 0)
      if (Date.now() - lastSync > 3 * 60 * 60 * 1000) {
        localStorage.setItem(throttleKey, String(Date.now()))
        supabase.functions.invoke('sync-ffr', { body: { groupe_id: src.id } })
          .then(() => supabase.from('classements_ffr').select('*').eq('groupe_id', src.id).order('position'))
          .then(res => { if (res?.data) setClassementFFR(res.data) })
          .catch(() => {})
      }
    } else {
      setClassementFFR([])
    }

    // Prochain entraînement (le plus proche à venir) + ses blocs/séquences
    const todayISO = isoLocal()
    const { data: nextEvts } = await supabase.from('groupe_evenements')
      .select('*').in('groupe_id', lies).eq('type', 'entrainement')
      .gte('date', todayISO).order('date').order('heure').limit(1)
    const nextEvt = nextEvts?.[0] || null
    if (nextEvt) {
      const { data: blocsData } = await supabase.from('groupe_seance_blocs')
        .select('*, groupe_seance_sequences(*)').eq('evenement_id', nextEvt.id).order('ordre')
      const blocs = (blocsData || []).map(b => {
        const seqs = (b.groupe_seance_sequences || []).sort((a, z) => a.ordre - z.ordre)
        const dureeSec = seqs.reduce((acc, s) => acc + (s.duree_sec || 0), 0)
        const jeuSec = seqs.filter(s => s.type === 'jeu').reduce((acc, s) => acc + (s.duree_sec || 0), 0)
        return {
          nom: b.nom,
          dureeMin: seqs.length ? Math.round(dureeSec / 60) : (parseInt(b.duree, 10) || 0),
          hasSequences: seqs.length > 0,
          jeuMin: Math.round(jeuSec / 60),
        }
      })
      setProchain({ evenement: nextEvt, blocs })
    } else {
      setProchain(null)
    }

    // Prochain match : calendrier FFR de l'équipe, sinon match saisi à la main
    const [{ data: mFFR }, { data: mEv }] = await Promise.all([
      supabase.from('matchs_ffr').select('date_match, heure, equipe_dom, equipe_ext, est_domicile').eq('groupe_id', equipe?.id || id)
        .gte('date_match', todayISO).order('date_match').limit(1),
      supabase.from('groupe_evenements').select('date, heure, titre, adversaire, domicile').in('groupe_id', lies).eq('type', 'match')
        .gte('date', todayISO).order('date').limit(1),
    ])
    const f = mFFR?.[0], e = mEv?.[0]
    const matchs = [
      f && { date: f.date_match, heure: f.heure, adversaire: f.est_domicile ? f.equipe_ext : f.equipe_dom, domicile: f.est_domicile },
      e && { date: e.date, heure: e.heure, adversaire: e.adversaire || e.titre, domicile: e.domicile },
    ].filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))
    setProchainMatch(matchs[0] || null)

    if (!silent) setLoading(false)
  }

  // ── Mini calendrier — évènements du mois affiché ────────────────────────────
  async function loadMonthEvents() {
    const y = calMonth.getFullYear(), m = calMonth.getMonth()
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const endDate = new Date(y, m + 1, 0)
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    const { data } = await supabase.from('groupe_evenements')
      .select('date, type').in('groupe_id', idsCal).gte('date', start).lte('date', end)
    const map = {}
    for (const e of (data || [])) { (map[e.date] ||= []).push(e.type) }
    setMonthEvents(map)
  }

  // ── Édition du groupe ──────────────────────────────────────────────────────
  function handleEditLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditPendingFile(file)
    setEditCropSrc(URL.createObjectURL(file))
    e.target.value = ''
  }

  async function handleEditCropConfirm(croppedFile, previewUrl) {
    setEditCropSrc(null); setEditPendingFile(null)
    setEditLogoFile(croppedFile)
    setEditLogoPreview(previewUrl)
    setExtractingEditColors(true)
    const colors = await extractColorsFromImage(croppedFile, 2)
    if (colors[0]) setEditForm(f => ({ ...f, couleur: colors[0] }))
    if (colors[1]) setEditForm(f => ({ ...f, couleur_secondaire: colors[1] }))
    setExtractingEditColors(false)
  }

  function handleEditCropCancel() {
    setEditCropSrc(null); setEditPendingFile(null)
  }

  function handleEditLogoColorPick(e) {
    if (!editPickingFor || !editLogoPickRef.current) return
    const img = editLogoPickRef.current
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
    if (editPickingFor === 'primary') setEditForm(f => ({ ...f, couleur: hex }))
    else setEditForm(f => ({ ...f, couleur_secondaire: hex }))
    setEditPickingFor(null)
  }

  async function sauvegarderGroupe() {
    setSaving(true)
    let logoUrl = groupe?.logo_url || null
    if (editLogoFile) {
      const ext  = editLogoFile.name.split('.').pop()
      const path = `groupe-${id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('groupe-logos').upload(path, editLogoFile, { upsert: true })
      if (upErr) { alert('Erreur upload : ' + upErr.message); setSaving(false); return }
      logoUrl = supabase.storage.from('groupe-logos').getPublicUrl(path).data.publicUrl
    }
    const { error } = await supabase.from('groupes').update({
      nom: editForm.nom.trim(),
      couleur: editForm.couleur || null,
      couleur_secondaire: editForm.couleur_secondaire || null,
      logo_url: logoUrl,
      monclubhouse_url: editForm.monclubhouse_url?.trim() || null,
      monclubhouse_competition: editForm.monclubhouse_competition?.trim() || null,
      monclubhouse_competition_espoirs: editForm.monclubhouse_competition_espoirs?.trim() || null,
    }).eq('id', id)
    if (error) { alert(error.message); setSaving(false); return }
    await load()
    setEditOpen(false)
    setSaving(false)
  }

  // ── Sous-groupes ───────────────────────────────────────────────────────────
  async function creerSousGroupe() {
    if (!newSGNom.trim()) return
    // Hérite des couleurs/logo du groupe principal par défaut (identité visuelle
    // commune dans le calendrier, la projection, le classement...) — la pastille
    // sélectionnée ci-dessus permet de le distinguer visuellement si besoin.
    const { data, error } = await supabase.from('groupes')
      .insert([{
        nom: newSGNom.trim(),
        couleur: newSGCouleur || groupe?.couleur || null,
        couleur_secondaire: groupe?.couleur_secondaire || null,
        logo_url: groupe?.logo_url || null,
        parent_id: id,
        type: groupe?.type === 'club' ? 'equipe' : 'sous_groupe',
      }]).select().single()
    if (error) { alert(error.message); return }
    setNewSGNom('')
    setShowAddSG(false)
    navigate(`/groupe/${data.id}`)
  }

  async function supprimerGroupe() {
    if (!window.confirm(`Supprimer le groupe "${groupe?.nom}" ? Les membres redeviendront des clients individuels.`)) return
    await supabase.from('groupes').delete().eq('id', id)
    navigate(parent ? `/groupe/${parent.id}` : '/clients')
  }

  // ── Membres ────────────────────────────────────────────────────────────────
  // Sous-groupe (parent_id défini) → on ajoute des joueurs déjà présents dans
  // le groupe principal (ils y restent), plutôt que de proposer des clients
  // qui n'y sont pas.
  async function ouvrirAddMembre() {
    if (parent && parent.type !== 'club') return ouvrirTransfererMembre()
    // Charger tous les clients qui ne sont dans AUCUN groupe
    const { data: tousMembres } = await supabase.from('groupe_membres').select('client_id')
    const membresIds = new Set((tousMembres || []).map(m => m.client_id))
    const { data: allClients } = await supabase.from('clients').select('id, prenom, nom, offre').order('nom')
    const dispo = (allClients || []).filter(c => !membresIds.has(c.id))
    setCandidats(dispo)
    setSearchMembre('')
    setSelectedCandidats(new Set())
    setShowAddMembre(true)
  }

  async function ouvrirTransfererMembre() {
    // Membres déjà dans CE sous-groupe (à exclure des candidats)
    const dejaIds = new Set(membres.map(m => m.id))
    const { data: rows } = await supabase
      .from('groupe_membres').select('client_id, clients(id, prenom, nom, offre)')
      .eq('groupe_id', groupe.parent_id)
    const dispo = (rows || [])
      .map(r => r.clients).filter(Boolean)
      .filter(c => !dejaIds.has(c.id))
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
    setCandidats(dispo)
    setSearchMembre('')
    setSelectedCandidats(new Set())
    setShowAddMembre(true)
  }

  function toggleCandidat(clientId) {
    setSelectedCandidats(prev => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  function toggleTous() {
    setSelectedCandidats(prev =>
      prev.size === candidatsFiltres.length
        ? new Set()
        : new Set(candidatsFiltres.map(c => c.id))
    )
  }

  async function ajouterMembresSelectionnes() {
    if (parent && parent.type !== 'club') return transfererMembresSelectionnes()
    if (!selectedCandidats.size) return
    setAddingMembres(true)
    const newIds = [...selectedCandidats]
    const rows = newIds.map(clientId => ({ groupe_id: id, client_id: clientId }))
    const { error } = await supabase.from('groupe_membres').insert(rows)
    if (error) { setAddingMembres(false); alert(error.message); return }

    // Passer l'offre à 'club' pour chaque nouveau membre
    await supabase.from('clients').update({ offre: 'club' }).in('id', newIds)

    setAddingMembres(false)
    setShowAddMembre(false)
    setSelectedCandidats(new Set())

    // Rafraîchir les données sans passer par le spinner (silent)
    await load(true)
  }

  // Ajoute des joueurs déjà présents dans le groupe principal à ce sous-groupe.
  // Ils RESTENT membres du groupe principal (plus de transfert destructif) —
  // un joueur peut appartenir à plusieurs sous-groupes à la fois (ex. avants +
  // un autre découpage), et continue d'apparaître dans le calendrier/l'effectif
  // du groupe principal.
  async function transfererMembresSelectionnes() {
    if (!selectedCandidats.size) return
    setAddingMembres(true)
    const clientIds = [...selectedCandidats]

    const rows = clientIds.map(clientId => ({ groupe_id: id, client_id: clientId }))
    const { error } = await supabase.from('groupe_membres').insert(rows)
    if (error) { setAddingMembres(false); alert(error.message); return }

    setAddingMembres(false)
    setShowAddMembre(false)
    setSelectedCandidats(new Set())
    await load(true)

    // Proposer de pousser les programmes existants aux nouveaux membres
    const { data: progs } = await supabase
      .from('programmes')
      .select('id, nom, semaines, date_debut')
      .eq('groupe_id', id)
      .is('template_id', null)
      .order('created_at', { ascending: false })
    if (progs?.length > 0) {
      setNewMembresIds(clientIds)
      setProgsDispos(progs)
      setSelectedProgsForNew(new Set(progs.map(p => p.id)))
      setShowPushToNew(true)
    }
  }

  async function pousserANouveaux() {
    if (!selectedProgsForNew.size || !newMembresIds.length) return
    setPushingToNew(true)

    const progsToPush = progsDispos.filter(p => selectedProgsForNew.has(p.id))

    // Garde-fou : sans date de début sur le programme du groupe, la copie ne peut
    // être alignée sur personne (elle ne commencerait ni ne finirait avec le groupe).
    const sansDate = progsToPush.filter(p => !p.date_debut)
    if (sansDate.length > 0) {
      const noms = sansDate.map(p => `« ${p.nom} »`).join(', ')
      const ok = window.confirm(
        `${noms} n'a pas de date de début : la copie du nouveau membre ne sera alignée sur aucune période ` +
        `(il ne commencera ni ne finira en même temps que le groupe).\n\n` +
        `Conseil : annule, ouvre le programme et fixe sa date de début, puis recommence.\n\n` +
        `Continuer quand même ?`
      )
      if (!ok) { setPushingToNew(false); return }
    }

    // Récupérer les copies déjà existantes pour éviter les doublons
    const templateIds = progsToPush.map(p => p.id)
    const { data: existingCopies } = await supabase
      .from('programmes')
      .select('client_id, template_id')
      .in('template_id', templateIds)
      .in('client_id', newMembresIds)
    const alreadyHas = new Set((existingCopies || []).map(r => `${r.client_id}:${r.template_id}`))

    for (const prog of progsToPush) {
      const { data: seancesData } = await supabase
        .from('seances')
        .select('*, exercices(*)')
        .eq('programme_id', prog.id)
        .order('ordre', { ascending: true })

      for (const clientId of newMembresIds) {
        if (alreadyHas.has(`${clientId}:${prog.id}`)) continue

        // date_debut reprise du programme du groupe : le nouveau membre est aligné
        // sur la même période que tout le monde. S'il arrive en cours de cycle, les
        // semaines déjà écoulées le sont aussi pour lui, et il finit avec le groupe.
        const { data: progCopy, error: pe } = await supabase.from('programmes').insert({
          nom: prog.nom,
          semaines: prog.semaines,
          date_debut: prog.date_debut,
          client_id: clientId,
          groupe_id: id,
          template_id: prog.id,
        }).select().single()

        if (pe || !progCopy) continue

        for (const s of seancesData || []) {
          const { data: sc } = await supabase.from('seances').insert({
            programme_id: progCopy.id,
            nom: s.nom,
            ordre: s.ordre,
            type: s.type || 'musculation',
            echauffement: s.echauffement || null,
          }).select().single()

          if (sc && s.exercices?.length) {
            await supabase.from('exercices').insert(
              s.exercices.map(ex => ({
                seance_id: sc.id,
                code: ex.code, nom: ex.nom, series: ex.series,
                repetitions: ex.repetitions, tempo: ex.tempo,
                recuperation: ex.recuperation, type_intensite: ex.type_intensite,
                valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
                bibliotheque_id: ex.bibliotheque_id || null,
                contenu: ex.contenu || null, schema: ex.schema || null,
              }))
            )
          }
        }
      }
    }

    setPushingToNew(false)
    setShowPushToNew(false)
    setNewMembresIds([])
    setProgsDispos([])
    setSelectedProgsForNew(new Set())
  }

  async function retirerMembre(clientId) {
    if (!window.confirm('Retirer ce membre du groupe ? Il redeviendra un client individuel — sa fiche et ses données restent intactes.')) return
    await supabase.from('groupe_membres').delete().eq('groupe_id', id).eq('client_id', clientId)
    // Retire aussi sa fiche de l'effectif tactique du groupe (poste, statut...) —
    // ne touche jamais aux tables client/programme/wellness, propres au client.
    await supabase.from('groupe_joueurs').delete().eq('groupe_id', id).eq('client_id', clientId)
    setMembres(prev => prev.filter(m => m.id !== clientId))
    setRosterClientIds(prev => { const next = new Set(prev); next.delete(clientId); return next })
  }

  // ── Programmes — Pousser à tous ────────────────────────────────────────────
  async function pousserATous(prog) {
    if (membres.length === 0) { alert('Ce groupe n\'a aucun membre.'); return }
    if (!window.confirm(`Envoyer "${prog.nom}" aux ${membres.length} membre(s) du groupe ?\nChaque membre recevra sa propre copie.`)) return

    setPushLoading(prog.id)

    // Charger les séances + exercices du template
    const { data: seancesData } = await supabase
      .from('seances')
      .select('*, exercices(*)')
      .eq('programme_id', prog.id)
      .order('ordre', { ascending: true })

    // Anti-doublon : membres qui ont déjà une copie de ce programme
    const { data: existingCopies } = await supabase
      .from('programmes')
      .select('client_id')
      .eq('template_id', prog.id)
      .in('client_id', membres.map(m => m.id))
    const alreadyHasIds = new Set((existingCopies || []).map(r => r.client_id))

    let count = 0
    for (const m of membres) {
      if (alreadyHasIds.has(m.id)) continue

      // Créer la copie individuelle
      const { data: progCopy, error: pe } = await supabase.from('programmes').insert({
        nom: prog.nom,
        semaines: prog.semaines,
        date_debut: prog.date_debut,
        client_id: m.id,
        groupe_id: id,
        template_id: prog.id,
      }).select().single()

      if (pe || !progCopy) continue

      // Copier séances + exercices
      for (const s of seancesData || []) {
        const { data: sc } = await supabase.from('seances').insert({
          programme_id: progCopy.id,
          nom: s.nom,
          ordre: s.ordre,
          type: s.type || 'musculation',
          echauffement: s.echauffement || null,
        }).select().single()

        if (sc && s.exercices?.length) {
          await supabase.from('exercices').insert(
            s.exercices.map(ex => ({
              seance_id: sc.id,
              code: ex.code, nom: ex.nom, series: ex.series,
              repetitions: ex.repetitions, tempo: ex.tempo,
              recuperation: ex.recuperation, type_intensite: ex.type_intensite,
              valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
              bibliotheque_id: ex.bibliotheque_id || null,
              contenu: ex.contenu || null, schema: ex.schema || null,
            }))
          )
        }
      }
      count++
    }

    setPushLoading(null)
    alert(`Programme envoyé à ${count} membre(s) !`)
  }

  async function supprimerDoublons(prog) {
    setDedupLoading(prog.id)
    const { data: copies } = await supabase
      .from('programmes')
      .select('id, client_id, created_at')
      .eq('template_id', prog.id)
      .order('created_at', { ascending: true })

    // Garder la première copie par client, supprimer les suivantes
    const seen = {}
    const toDelete = []
    for (const c of copies || []) {
      if (seen[c.client_id]) {
        toDelete.push(c.id)
      } else {
        seen[c.client_id] = true
      }
    }

    if (toDelete.length === 0) {
      setDedupLoading(null)
      alert('Aucun doublon trouvé.')
      return
    }

    await supabase.from('programmes').delete().in('id', toDelete)
    setDedupLoading(null)
    alert(`${toDelete.length} doublon${toDelete.length > 1 ? 's' : ''} supprimé${toDelete.length > 1 ? 's' : ''}.`)
  }

  // ── Durée du programme de groupe ───────────────────────────────────────────
  // Change la durée du « modèle » ET de toutes les copies des membres, pour que
  // le cycle continue de commencer et finir en même temps pour tout le monde.
  async function etendreDuree(prog) {
    const actuelle = parseInt(prog.semaines) || 0
    const saisie = window.prompt(
      `Durée de « ${prog.nom} » en semaines.\n\n` +
      `Actuellement : ${actuelle} semaine${actuelle > 1 ? 's' : ''}.\n` +
      `La nouvelle durée s'appliquera aussi à toutes les copies des membres.`,
      String(actuelle)
    )
    if (saisie === null) return
    const nouvelle = parseInt(saisie, 10)
    if (!Number.isInteger(nouvelle) || nouvelle < 1 || nouvelle > 52) {
      alert('Indique un nombre de semaines entre 1 et 52.')
      return
    }
    if (nouvelle === actuelle) return

    // Extension → que faire des RPE cibles des semaines ajoutées ?
    let recopierRpe = false
    if (nouvelle > actuelle && actuelle > 0) {
      recopierRpe = window.confirm(
        `Semaines ${actuelle + 1} à ${nouvelle} ajoutées.\n\n` +
        `OK  → recopier les RPE cibles de la semaine ${actuelle} sur les nouvelles semaines.\n` +
        `Annuler → les laisser vides (tu les rempliras toi-même).`
      )
    }

    setPushLoading(prog.id)
    try {
      // 1. Le modèle
      const { error: te } = await supabase.from('programmes')
        .update({ semaines: nouvelle }).eq('id', prog.id)
      if (te) throw te

      // 2. Toutes les copies : même durée + même date de début (réalignement)
      const { data: copies, error: ce } = await supabase.from('programmes')
        .update({ semaines: nouvelle, date_debut: prog.date_debut })
        .eq('template_id', prog.id)
        .select('id')
      if (ce) throw ce

      // 3. RPE cibles des nouvelles semaines (sur le modèle)
      let nbRpe = 0
      if (recopierRpe) {
        const { data: seancesTpl } = await supabase.from('seances')
          .select('id').eq('programme_id', prog.id)
        const ids = (seancesTpl || []).map(s => s.id)
        if (ids.length) {
          const { data: derniere } = await supabase.from('rpe_seances')
            .select('seance_id, rpe_cible')
            .in('seance_id', ids)
            .eq('semaine', actuelle)
            .not('rpe_cible', 'is', null)
          // Repartir d'une base propre sur la plage ajoutée (évite les doublons)
          await supabase.from('rpe_seances')
            .delete().in('seance_id', ids).gt('semaine', actuelle).lte('semaine', nouvelle)
          const rows = []
          for (const r of derniere || []) {
            for (let w = actuelle + 1; w <= nouvelle; w++) {
              rows.push({ seance_id: r.seance_id, semaine: w, rpe_cible: r.rpe_cible })
            }
          }
          if (rows.length) {
            const { error: re } = await supabase.from('rpe_seances').insert(rows)
            if (re) throw re
            nbRpe = rows.length
          }
        }
      }

      const n = copies?.length || 0
      alert(
        `Durée passée à ${nouvelle} semaine${nouvelle > 1 ? 's' : ''}.\n` +
        `${n} copie${n > 1 ? 's' : ''} de membre mise${n > 1 ? 's' : ''} à jour.` +
        (nbRpe ? `\n${nbRpe} RPE cible${nbRpe > 1 ? 's' : ''} recopié${nbRpe > 1 ? 's' : ''}.` : '')
      )
      await load(true)
    } catch (e) {
      alert('Échec : ' + (e?.message || e))
    } finally {
      setPushLoading(null)
    }
  }

  async function propaguerATous(prog) {
    if (!window.confirm(`Mettre à jour TOUTES les copies existantes de "${prog.nom}" ?\nCela écrasera le contenu de chaque copie individuelle.`)) return
    setPushLoading(prog.id)

    // Charger le contenu actuel du template
    const { data: seancesData } = await supabase
      .from('seances').select('*, exercices(*)').eq('programme_id', prog.id).order('ordre', { ascending: true })

    // Trouver toutes les copies
    const { data: copies } = await supabase.from('programmes').select('id').eq('template_id', prog.id)
    let count = 0

    // Réaligner la période : même durée et même date de début pour tout le monde,
    // y compris les membres ajoutés en cours de cycle (dont la copie pouvait être
    // créée sans date de début avant le correctif).
    await supabase.from('programmes')
      .update({ semaines: prog.semaines, date_debut: prog.date_debut })
      .eq('template_id', prog.id)

    for (const copy of copies || []) {
      // Supprimer les anciennes séances (les exercices se suppriment en cascade si FK est set)
      const { data: oldSeances } = await supabase.from('seances').select('id').eq('programme_id', copy.id)
      for (const os of oldSeances || []) {
        await supabase.from('exercices').delete().eq('seance_id', os.id)
      }
      await supabase.from('seances').delete().eq('programme_id', copy.id)

      // Re-copier les séances
      for (const s of seancesData || []) {
        const { data: sc } = await supabase.from('seances').insert({
          programme_id: copy.id, nom: s.nom, ordre: s.ordre, type: s.type || 'musculation', echauffement: s.echauffement || null,
        }).select().single()
        if (sc && s.exercices?.length) {
          await supabase.from('exercices').insert(
            s.exercices.map(ex => ({
              seance_id: sc.id,
              code: ex.code, nom: ex.nom, series: ex.series,
              repetitions: ex.repetitions, tempo: ex.tempo,
              recuperation: ex.recuperation, type_intensite: ex.type_intensite,
              valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
              bibliotheque_id: ex.bibliotheque_id || null,
              contenu: ex.contenu || null, schema: ex.schema || null,
            }))
          )
        }
      }
      count++
    }

    setPushLoading(null)
    alert(`${count} copie(s) mise(s) à jour !`)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function subInfo(date_fin) {
    if (!date_fin) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const fin = new Date(date_fin + 'T00:00:00')
    const days = Math.ceil((fin - today) / 86400000)
    if (days < 0)  return { color: '#6b7280', bg: '#f3f4f6', label: 'Expiré' }
    if (days <= 7) return { color: '#dc2626', bg: '#fef2f2', label: `${days}j` }
    if (days <= 30)return { color: '#d97706', bg: '#fffbeb', label: `${days}j` }
    return { color: '#16a34a', bg: '#f0fdf4', label: `${days}j` }
  }

  const candidatsFiltres = candidats.filter(c =>
    `${c.prenom} ${c.nom}`.toLowerCase().includes(searchMembre.toLowerCase())
  )

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#6b7280' }}>Chargement...</p>
    </div>
  )
  if (!groupe) return null

  const accent = groupe.couleur || '#333333'
  const estClub = groupe.type === 'club'
  const estSG = !!(parent && parent.type !== 'club')
  // Onglet « Sans sous-groupe » : la page de l'équipe limitée aux joueurs non répartis
  const vueSans = searchParams.get('vue') === 'sans' && !estSG && !!onglets?.sgs.length
  const membresVue = vueSans ? membres.filter(m => !sgParClient[m.id]) : membres
  const idsVue = new Set(membresVue.map(m => m.id))
  const blessesVue = blesses.filter(b => idsVue.has(b.clientId))
  const blessesParClient = Object.fromEntries(blesses.map(b => [b.clientId, b]))
  const nousClassement = classementSrc && classementFFR
    .filter(c => (c.competition || null) === (classementSrc.monclubhouse_competition || null))
    .find(c => c.equipe?.toLowerCase().includes(classementSrc.nom.toLowerCase()) || classementSrc.nom.toLowerCase().includes(c.equipe?.toLowerCase()))

  // ── Membres — recherche + filtre + tri (nom de famille affiché en premier) ──
  function membreAvg(m) {
    const w = wellnessMap[m.id]
    return w ? (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 : null
  }
  // Alerte si une note individuelle est basse (≤ 2/4), même si la moyenne
  // globale reste correcte — un signal fort peut se cacher dans la moyenne.
  const WELLNESS_DIMS = [['sommeil', 'Som.'], ['fatigue', 'Fat.'], ['douleurs', 'Doul.'], ['stress', 'Stress']]
  function membreAlerte(m) {
    const w = wellnessMap[m.id]
    return w ? WELLNESS_DIMS.some(([k]) => w[k] <= 2) : false
  }
  const membresAffiches = membresVue
    .filter(m => `${m.prenom} ${m.nom}`.toLowerCase().includes(membreSearch.toLowerCase()))
    .filter(m => {
      if (membreFiltre !== 'surveiller') return true
      const avg = membreAvg(m)
      const sub = subInfo(m.date_fin)
      return (avg !== null && avg <= 2) || (sub && sub.label !== 'Expiré' && parseInt(sub.label) <= 7)
    })
    .sort((a, b) => {
      let cmp = 0
      if (membreSort.key === 'nom') cmp = a.nom.localeCompare(b.nom)
      else if (membreSort.key === 'wellness') cmp = (membreAvg(a) ?? -1) - (membreAvg(b) ?? -1)
      else if (membreSort.key === 'poste') cmp = (posteMap[a.id] || '').localeCompare(posteMap[b.id] || '')
      return cmp * membreSort.dir
    })
  function toggleMembreSort(key) {
    setMembreSort(prev => ({ key, dir: prev.key === key ? -prev.dir : 1 }))
  }

  // ── Wellness du jour ──
  const todayISOW = isoLocal()
  const wellnessDuJour = membresVue
    .filter(m => wellnessMap[m.id]?.date === todayISOW)
    .map(m => ({ m, w: wellnessMap[m.id], avg: membreAvg(m), alerte: membreAlerte(m) }))
    .sort((a, b) => (b.alerte - a.alerte) || (a.avg - b.avg))
  const wellnessManquants = membresVue.filter(m => wellnessMap[m.id]?.date !== todayISOW)
    .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))
  const wellnessMoyenne = wellnessDuJour.length
    ? wellnessDuJour.reduce((s, x) => s + x.avg, 0) / wellnessDuJour.length : null
  const wellnessAlertes = wellnessDuJour.filter(x => x.alerte)

  // ── Mini calendrier ──
  const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
  const calY = calMonth.getFullYear(), calM = calMonth.getMonth()
  const firstDow = (new Date(calY, calM, 1).getDay() + 6) % 7 // 0 = lundi
  const nbJours = new Date(calY, calM + 1, 0).getDate()
  const nowCal = new Date()
  const todayISOCal = `${nowCal.getFullYear()}-${String(nowCal.getMonth() + 1).padStart(2, '0')}-${String(nowCal.getDate()).padStart(2, '0')}`
  const calCells = []
  for (let i = 0; i < firstDow; i++) calCells.push(null)
  for (let d = 1; d <= nbJours; d++) calCells.push(d)
  const CAL_EVENT_COLOR = { entrainement: '#dc2626', match: '#2563eb', muscu: '#6366f1' }

  // ── Prochain entraînement — timeline proportionnelle à la durée ──
  const BLOC_TIMELINE_COLORS = ['#2c5faa', '#b45309', '#1d4ed8', '#7c3aed', '#0f766e', '#be185d']


  return (
    <div style={S.pageWide}>
      {/* ── Retour ── */}
      <button onClick={() => {
        if (tab === 'calendrier' || tab === 'tests' || tab === 'blessures' || tab === 'classement') { setTab('groupe'); return }
        if (parent) { navigate(`/groupe/${parent.id}`); return }
        navigate('/groupes')
      }} style={S.back}>
        ← {tab === 'calendrier' || tab === 'tests' || tab === 'blessures' || tab === 'classement' ? groupe.nom : parent ? parent.nom : 'Groupes'}
      </button>

      {/* Adaptations mobile — aucune règle au-dessus de 820px */}
      <style>{`
        @media (max-width: 820px){
          .fg-header{flex-wrap:wrap;gap:0.75rem;}
          .fg-actions{width:100%;}
          .fg-actions button{flex:1;}
          .fg-bande{grid-template-columns:1fr 1fr !important;}
          .fg-grille{grid-template-columns:1fr !important;}
        }
        .fg-onglet:not([aria-current]):hover{background:#ececec !important;color:#1a1a1a !important;}
      `}</style>
      {/* ── Header groupe ── */}
      <div className="fg-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', marginBottom: onglets && tab === 'groupe' ? '1.5rem' : '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {groupe.logo_url
            ? <img loading="lazy" src={groupe.logo_url} alt={groupe.nom} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12 }} />
            : <div style={{ width: 56, height: 56, borderRadius: 12, background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.15rem', color: accent }}>
                {groupe.nom.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
          }
          <div>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {estClub ? 'Club' : estSG ? `Sous-groupe · ${parent.nom}` : parent ? `Équipe · ${parent.nom}` : 'Équipe'}
            </p>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '900', color: '#1a1a1a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{groupe.nom}</h1>
            {estClub && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ background: '#333', color: '#fff', borderRadius: 999, padding: '0.2rem 0.75rem', fontSize: '0.75rem', fontWeight: '700' }}>
                  {membres.length} joueur{membres.length > 1 ? 's' : ''} au total
                </span>
                <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 999, padding: '0.2rem 0.75rem', fontSize: '0.75rem', fontWeight: '700' }}>
                  {sousGroupes.length} équipe{sousGroupes.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="fg-actions" style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
          {!estClub && <>
          <button onClick={() => setTab('calendrier')} style={S.btnSecondary}>
            <IcoCalendar /> Calendrier
          </button>
          <button onClick={() => setTab('blessures')} style={S.btnSecondary}>
            <IcoCross /> Suivi blessures
          </button>
          <button onClick={() => setTab('tests')} style={S.btnSecondary}>
            <IcoChart /> Tests physiques
          </button>
          </>}
          <button onClick={() => setMenuOuvert(o => !o)} aria-label="Modifier ou supprimer" aria-expanded={menuOuvert}
            style={{ ...S.btnSecondary, padding: '0.65rem 0.8rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
          </button>
          {menuOuvert && <>
            <div onClick={() => setMenuOuvert(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 21, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', padding: 6, minWidth: 180 }}>
              <button onClick={() => { setMenuOuvert(false); setEditOpen(true) }} style={S.menuItem}><IcoEdit /> Modifier</button>
              <button onClick={() => { setMenuOuvert(false); supprimerGroupe() }} style={{ ...S.menuItem, color: '#dc2626' }}><IcoTrash /> Supprimer</button>
            </div>
          </>}
        </div>
      </div>

      {/* ── Onglets équipe / sous-groupes : on passe de l'un à l'autre sans quitter la page ── */}
      {onglets && tab === 'groupe' && (
        <div className="fg-onglets" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { key: 'equipe', nom: "Toute l'équipe", n: onglets.equipe.n, actif: groupe.id === onglets.equipe.id && !vueSans, go: () => navigate(`/groupe/${onglets.equipe.id}`) },
            ...onglets.sgs.map(x => ({ key: x.id, nom: x.nom, n: x.n, actif: groupe.id === x.id, go: () => navigate(`/groupe/${x.id}`) })),
            ...(onglets.sgs.length && onglets.sans ? [{ key: 'sans', nom: 'Sans sous-groupe', n: onglets.sans, actif: vueSans, discret: true,
              go: () => groupe.id === onglets.equipe.id ? setSearchParams({ vue: 'sans' }) : navigate(`/groupe/${onglets.equipe.id}?vue=sans`) }] : []),
          ].map(o => (
            <button key={o.key} onClick={() => !o.actif && o.go()} aria-current={o.actif ? 'page' : undefined} className="fg-onglet"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 1rem', border: 'none', borderRadius: '10px 10px 0 0', font: 'inherit', fontSize: '0.88rem', fontWeight: 700, cursor: o.actif ? 'default' : 'pointer',
                background: o.actif ? '#333333' : 'transparent', color: o.actif ? '#fff' : o.discret ? '#9ca3af' : '#5b626c', transition: 'background .15s, color .15s' }}>
              {o.nom}<span style={{ fontSize: '0.75rem', fontWeight: 700, color: o.actif ? '#e4f816' : '#9ca3af' }}>{o.n}</span>
            </button>
          ))}
          {!estSG && (
            <button onClick={() => setShowAddSG(v => !v)} className="fg-onglet"
              style={{ marginLeft: 'auto', height: 40, padding: '0 0.75rem', border: 'none', background: 'none', font: 'inherit', fontSize: '0.82rem', fontWeight: 700, color: '#6b7280', cursor: 'pointer' }}>
              + Sous-groupe
            </button>
          )}
        </div>
      )}
      {showAddSG && !estSG && tab === 'groupe' && (
        <div style={{ ...S.panel, display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.9rem 1.1rem', marginBottom: '1.5rem' }}>
          <input
            autoFocus value={newSGNom} onChange={e => setNewSGNom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && creerSousGroupe()}
            placeholder="Nom du sous-groupe..." style={{ ...S.input, flex: 1, minWidth: 200 }}
          />
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setNewSGCouleur('')}
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'white', border: !newSGCouleur ? '2.5px solid #1a1a1a' : '2px solid #d1d5db', cursor: 'pointer', padding: 0, fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            {PALETTE_SG.map(c => (
              <button key={c} onClick={() => setNewSGCouleur(c)}
                style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: newSGCouleur === c ? '2.5px solid #1a1a1a' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
          <button onClick={creerSousGroupe} style={S.btnPrimary}>Créer</button>
          <button onClick={() => setShowAddSG(false)} style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.5rem 0.875rem', cursor: 'pointer', color: '#6b7280', fontWeight: '600' }}>Annuler</button>
        </div>
      )}

      {tab === 'calendrier' ? (
        <CalendrierSaison groupeId={id} embedded openEventId={openEventId} />
      ) : tab === 'tests' ? (
        <GroupeTestsView groupeId={id} accent={accent} />
      ) : tab === 'blessures' ? (
        <GroupeBlessuresView groupeId={id} accent={accent} />
      ) : tab === 'classement' ? (
        <GroupeClassementView groupe={classementSrc || groupe} classementFFR={classementFFR} accent={accent} />
      ) : estClub ? (
        <ClubEquipes club={groupe} equipes={sousGroupes} onCree={() => load(true)} />
      ) : (
      <>
      <div style={{ opacity: bascule ? 0.45 : 1, transition: 'opacity .15s' }}>
      {/* ── Bandeau du jour : wellness, blessés, prochain match, classement ── */}
      <div className="fg-bande" style={{ ...S.panel, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '1.5rem' }}>
        <button onClick={() => setWellnessDetail(true)} style={S.kpi} title="Voir les wellness du jour">
          <span style={S.kpiLabel}>Wellness du jour</span>
          <span style={S.kpiVal}>{wellnessDuJour.length}<small style={S.kpiSur}>/ {membresVue.length}</small></span>
          <span style={S.kpiSub}>
            {wellnessMoyenne != null
              ? <><span style={{ width: 8, height: 8, borderRadius: '50%', background: wellnessColor(wellnessMoyenne) }} />Moyenne {wellnessMoyenne.toFixed(1)} / 4</>
              : 'Personne pour le moment'}
            {wellnessAlertes.length > 0 && <strong style={{ color: '#dc2626' }}>· {wellnessAlertes.length} à surveiller</strong>}
          </span>
        </button>
        <button onClick={() => setTab('blessures')} style={{ ...S.kpi, borderLeft: '1px solid #f3f4f6' }} title="Ouvrir le suivi blessures">
          <span style={S.kpiLabel}>Blessés</span>
          <span style={S.kpiVal}>{blessesVue.length}</span>
          <span style={S.kpiSub}>{blessesVue.length ? blessesVue.map(b => b.nomComplet.split(' ').map((w, i) => i ? w[0] + '.' : w).join(' ')).join(', ') : 'Aucun'}</span>
        </button>
        <button onClick={() => setTab('calendrier')} style={{ ...S.kpi, borderLeft: '1px solid #f3f4f6' }} title="Ouvrir le calendrier">
          <span style={S.kpiLabel}>Prochain match</span>
          {prochainMatch ? <>
            <span style={{ ...S.kpiVal, fontSize: '1.5rem' }}>{new Date(prochainMatch.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span style={S.kpiSub}>{[prochainMatch.adversaire, prochainMatch.domicile == null ? null : prochainMatch.domicile ? 'domicile' : 'extérieur', prochainMatch.heure?.slice(0, 5).replace(':', 'h')].filter(Boolean).join(' · ')}</span>
          </> : <><span style={S.kpiVal}>–</span><span style={S.kpiSub}>Aucun match prévu</span></>}
        </button>
        <button onClick={() => classementFFR.length && setTab('classement')} style={{ ...S.kpi, borderLeft: '1px solid #f3f4f6', cursor: classementFFR.length ? 'pointer' : 'default' }}>
          <span style={S.kpiLabel}>Classement{classementSrc && classementSrc.id !== groupe.id ? ` · ${classementSrc.nom}` : ''}</span>
          {nousClassement ? <>
            <span style={S.kpiVal}>{nousClassement.position}<small style={{ ...S.kpiSur, marginLeft: 1 }}>{nousClassement.position === 1 ? 'er' : 'e'}</small></span>
            <span style={S.kpiSub}>{nousClassement.pts} pts · {nousClassement.joues} match{nousClassement.joues > 1 ? 's' : ''}</span>
          </> : <><span style={S.kpiVal}>–</span><span style={S.kpiSub}>{classementSrc ? 'Pas encore synchronisé' : 'Non relié à la FFR'}</span></>}
        </button>
      </div>

      {/* ── Colonne large : intensité + joueurs ; colonne étroite : entraînement, calendrier, programmes, classement ── */}
      <div className="fg-grille" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        {!estSG && (
        <div style={S.panel}>
          <div style={S.panelHead}><span style={S.panelLabel}>Intensité des entraînements</span></div>
          <div style={{ padding: '0 1.1rem 1.1rem' }}>
            <GroupeIntensite groupeId={id} accent={accent} />
          </div>
        </div>
        )}

        <div style={{ ...S.panel, maxHeight: 640, display: 'flex', flexDirection: 'column' }}>
          <div style={S.panelHead}><span style={S.panelLabel}>{vueSans ? 'Sans sous-groupe' : 'Joueurs'} · {membresVue.length}</span></div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0 1.1rem 0.7rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 9, padding: '0.4rem 0.7rem' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input value={membreSearch} onChange={e => setMembreSearch(e.target.value)} placeholder="Rechercher un membre..."
                style={{ border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: '0.8rem', width: '100%' }} />
            </div>
            {[['tous', 'Tous'], ['surveiller', 'À surveiller']].map(([k, l]) => (
              <button key={k} onClick={() => setMembreFiltre(k)}
                style={{ font: 'inherit', fontSize: '0.74rem', fontWeight: 700, color: membreFiltre === k ? '#fff' : '#6b7280', background: membreFiltre === k ? '#333' : '#f3f4f6', border: 'none', borderRadius: 8, padding: '0.4rem 0.7rem', cursor: 'pointer' }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr>
                  {[['nom', 'Nom'], ['poste', 'Poste'], ['wellness', 'Wellness']].map(([k, l]) => (
                    <th key={k} onClick={() => toggleMembreSort(k)}
                      style={{ textAlign: 'left', fontSize: '0.62rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.4rem 0.55rem', background: '#f9fafb', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      {l} <span style={{ opacity: membreSort.key === k ? 1 : 0.3, color: membreSort.key === k ? accent : 'inherit' }}>{membreSort.key === k && membreSort.dir === -1 ? '↑' : '↓'}</span>
                    </th>
                  ))}
                  {onglets?.sgs.length > 0 && <th style={{ textAlign: 'left', fontSize: '0.62rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.4rem 0.55rem', background: '#f9fafb', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }}>Sous-groupes</th>}
                  <th style={{ padding: '0.4rem 0.5rem', background: '#f9fafb', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', width: 34, position: 'sticky', right: 0 }} />
                </tr>
              </thead>
              <tbody>
                {membresAffiches.map(m => {
                  const poste = posteMap[m.id]
                  const avg = membreAvg(m)
                  const alerte = membreAlerte(m)
                  const col = avg !== null ? (alerte ? '#ef4444' : wellnessColor(avg)) : '#9ca3af'
                  const w = wellnessMap[m.id]
                  return (
                    <tr key={m.id} onClick={async () => {
                      if (!rosterClientIds.has(m.id)) {
                        // Pas encore dans l'effectif (groupe_joueurs) → on le crée à la volée
                        // pour pouvoir ouvrir directement sa fiche (statut, blessure…) sans
                        // passer par un ajout manuel au poste.
                        await supabase.from('groupe_joueurs').insert({
                          groupe_id: id, client_id: m.id,
                          prenom: m.prenom || '', nom: m.nom || '',
                        })
                        setRosterClientIds(prev => new Set(prev).add(m.id))
                      }
                      setEffectifOpen(true); setOpenJoueurClientId(m.id)
                    }} style={{ cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '0.32rem 0.55rem', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', background: accent + '18', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.56rem', fontWeight: 800, flexShrink: 0 }}>
                            {(m.prenom?.[0] || '') + (m.nom?.[0] || '')}
                          </span>
                          <span style={{ fontWeight: 700, color: '#333' }}>{m.nom} {m.prenom}</span>
                          {blessesParClient[m.id] && (
                            <span title={blessesParClient[m.id].description || 'Blessé'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, color: '#b91c1c', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
                              {formatRetour(blessesParClient[m.id].date_retour_prevue) || 'Blessé'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.32rem 0.55rem', borderBottom: '1px solid #f3f4f6', color: poste ? '#374151' : '#c4ccd4', fontSize: '0.74rem' }}>
                        {poste || '—'}
                      </td>
                      <td style={{ padding: '0.32rem 0.55rem', borderBottom: '1px solid #f3f4f6' }}>
                        {avg !== null ? (
                          <div title={`Som. ${w.sommeil} · Fat. ${w.fatigue} · Doul. ${w.douleurs} · Stress ${w.stress}`}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 800, color: col }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />{avg.toFixed(1)}
                              {alerte && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ef4444', background: '#fee2e2', borderRadius: 999, padding: '0.05rem 0.4rem' }}>alerte</span>}
                            </span>
                            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                              {WELLNESS_DIMS.map(([k, l]) => (
                                <span key={k} style={{ fontSize: '0.62rem', fontWeight: 700, color: w[k] <= 2 ? '#ef4444' : '#9ca3af' }}>{l}{w[k]}</span>
                              ))}
                            </div>
                          </div>
                        ) : <span style={{ color: '#c4ccd4' }}>—</span>}
                      </td>
                      {onglets?.sgs.length > 0 && (
                        <td style={{ padding: '0.32rem 0.55rem', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(sgParClient[m.id] || []).map(n => (
                              <span key={n} style={{ fontSize: '0.66rem', fontWeight: 700, borderRadius: 6, padding: '0.1rem 0.45rem', background: n === groupe.nom && estSG ? '#333' : '#f3f4f6', color: n === groupe.nom && estSG ? '#fff' : '#374151' }}>{n}</span>
                            ))}
                          </div>
                        </td>
                      )}
                      <td style={{ padding: '0.32rem 0.5rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center', position: 'sticky', right: 0, background: 'white' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); retirerMembre(m.id) }}
                          title="Retirer du groupe"
                          style={{ width: 24, height: 24, borderRadius: 7, border: 'none', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {membresAffiches.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.78rem' }}>Aucun membre trouvé.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <button onClick={ouvrirAddMembre} style={{ ...S.btnAdd, margin: '0.85rem 1.1rem 1.1rem', width: 'calc(100% - 2.2rem)' }}>
            {estSG ? `+ Ajouter depuis ${parent?.nom || 'le groupe principal'}` : '+ Ajouter un membre'}
          </button>
        </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
        <div role="button" tabIndex={0} style={{ ...S.panel, height: 300, display: 'flex', flexDirection: 'column', cursor: prochain ? 'pointer' : 'default' }}
          onClick={() => prochain && openCalendrierEvent(prochain.evenement.id)} title={prochain ? "Ouvrir cet entraînement" : undefined}>
          <div style={S.panelHead}><span style={S.panelLabel}>Prochain entraînement</span></div>
          {!prochain ? (
            <p style={{ fontSize: '0.76rem', color: '#6b7280', padding: '0 1.1rem 1.1rem' }}>Aucun entraînement à venir de planifié.</p>
          ) : (
            <>
              <p style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, padding: '0 1.1rem 0.6rem', margin: 0 }}>
                {new Date(prochain.evenement.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                {prochain.evenement.heure ? ` · ${prochain.evenement.heure}` : ''}
                {prochain.evenement.duree_min ? ` · ${prochain.evenement.duree_min} min` : ''}
              </p>
              {/* Chaque bloc remplit une part de la hauteur disponible proportionnelle
                  à sa durée (flex-grow = dureeMin) : la carte s'étire pour occuper
                  toute la hauteur de la carte,
                  quel que soit le nombre de séquences à l'intérieur. */}
              <div style={{ padding: '0 1.1rem 1.1rem', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {prochain.blocs.map((b, i) => (
                  <div key={i} style={{ borderRadius: 6, padding: '5px 8px', position: 'relative', background: BLOC_TIMELINE_COLORS[i % BLOC_TIMELINE_COLORS.length],
                    flex: `${Math.max(b.dureeMin, 1)} 1 0%`, minHeight: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: b.hasSequences ? 20 : 0 }}>{b.nom}</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fff', opacity: 0.85 }}>{b.dureeMin} min</span>
                    {b.hasSequences && (
                      <span title={`Aperçu des séquences jeu / récup — jeu effectif ${b.jeuMin} min`}
                        onClick={e => e.stopPropagation()}
                        style={{ position: 'absolute', top: 5, right: 5, width: 17, height: 17, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IcoEye />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div role="button" tabIndex={0} style={{ ...S.panel, cursor: 'pointer' }} onClick={() => setTab('calendrier')} title="Ouvrir le calendrier">
          <div style={S.panelHead}>
            <button onClick={e => { e.stopPropagation(); setCalMonth(new Date(calY, calM - 1, 1)) }} style={S.calNavBtn}><IcoChevronL /></button>
            <span style={{ ...S.panelLabel, textTransform: 'capitalize', fontSize: '0.78rem', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <IcoCalendar />{MOIS_LABELS[calM]} {calY}
            </span>
            <button onClick={e => { e.stopPropagation(); setCalMonth(new Date(calY, calM + 1, 1)) }} style={S.calNavBtn}><IcoChevronR /></button>
          </div>
          <div style={{ padding: '0 1.1rem 1.1rem' }}>
            <div style={{ maxWidth: 250, margin: '0 auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
                {['L','M','M','J','V','S','D'].map((d, i) => (
                  <div key={i} style={{ fontSize: '0.58rem', fontWeight: 800, color: '#6b7280', textAlign: 'center', textTransform: 'uppercase' }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
                {calCells.map((d, i) => {
                  if (d === null) return <div key={i} />
                  const iso = `${calY}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                  const evs = monthEvents[iso] || []
                  const isToday = iso === todayISOCal
                  const types = [...new Set(evs)].slice(0, 3)
                  const evCol = types[0] ? (CAL_EVENT_COLOR[types[0]] || '#9ca3af') : null
                  return (
                    <div key={i} style={{ position: 'relative', aspectRatio: '1/1', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.72rem', fontWeight: evCol || isToday ? 800 : 700, color: evCol || '#333', borderRadius: 7,
                      background: evCol ? evCol + '1c' : '#f9fafb',
                      boxShadow: isToday ? `inset 0 0 0 2px ${accent}` : 'none' }}
                      title={evs.length ? evs.map(t => t === 'entrainement' ? 'Entraînement' : t === 'match' ? 'Match' : t).join(', ') : undefined}>
                      {d}
                      {types.length > 0 && (
                        <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 2 }}>
                          {types.map(t => <span key={t} style={{ width: 4, height: 4, borderRadius: '50%', background: CAL_EVENT_COLOR[t] || '#9ca3af' }} />)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.9rem', paddingTop: '0.7rem', marginTop: '0.6rem', borderTop: '1px solid #f3f4f6' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626' }} />Entraînement
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb' }} />Match
              </span>
            </div>
          </div>
        </div>

        <div style={S.panel}>
          <div style={S.panelHead}><span style={S.panelLabel}>Programmes du groupe · {programmes.length}</span></div>
          {programmes.map(prog => {
            const nbSeances = prog.seances?.[0]?.count ?? 0
            const isPushing = pushLoading === prog.id
            return (
              <div key={prog.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                <div role="button" tabIndex={0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem 1.1rem', cursor: 'pointer' }}
                  onClick={() => navigate(`/programme/${prog.id}`)}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1a1a1a' }}>{prog.nom}</span>
                      <span style={{ background: accent + '18', color: accent, border: `1px solid ${accent}33`, borderRadius: 999, padding: '0.05rem 0.4rem', fontSize: '0.6rem', fontWeight: 800 }}>TEMPLATE</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#6b7280' }}>
                      {prog.semaines} sem · {nbSeances} séance{nbSeances > 1 ? 's' : ''}
                      {prog.date_debut ? ` · début ${new Date(prog.date_debut).toLocaleDateString('fr-FR')}` : ''}
                    </p>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: '1.15rem' }}>›</span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', padding: '0 1.1rem 0.7rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => pousserATous(prog)}
                    disabled={isPushing || membres.length === 0}
                    style={{ ...S.btnAction, padding: '0.35rem 0.7rem', fontSize: '0.72rem', background: accent, color: isLightColor(accent) ? '#1a1a1a' : 'white', opacity: membres.length === 0 ? 0.4 : 1 }}
                  >
                    {isPushing ? 'Envoi...' : `Pousser aux ${membres.length}`}
                  </button>
                  <button
                    onClick={() => propaguerATous(prog)}
                    disabled={isPushing}
                    style={{ ...S.btnAction, padding: '0.35rem 0.7rem', fontSize: '0.72rem', background: '#f3f4f6', color: '#374151' }}
                    title="Mettre à jour toutes les copies existantes"
                  >
                    Propager
                  </button>
                  <button
                    onClick={() => etendreDuree(prog)}
                    disabled={isPushing}
                    style={{ ...S.btnAction, padding: '0.35rem 0.7rem', fontSize: '0.72rem', background: '#f3f4f6', color: '#374151' }}
                    title="Changer la durée du programme pour le groupe et toutes les copies"
                  >
                    Durée ({prog.semaines} sem)
                  </button>
                  <button
                    onClick={() => supprimerDoublons(prog)}
                    disabled={dedupLoading === prog.id}
                    style={{ ...S.btnAction, padding: '0.35rem 0.7rem', fontSize: '0.72rem', background: '#fee2e2', color: '#b91c1c' }}
                    title="Supprimer les copies en double pour chaque membre"
                  >
                    {dedupLoading === prog.id ? '...' : 'Doublons'}
                  </button>
                </div>
              </div>
            )
          })}
          <button onClick={() => navigate(`/groupe/${id}/nouveau-programme`)} style={{ ...S.btnAdd, margin: '0.85rem 1.1rem 1.1rem', width: 'calc(100% - 2.2rem)' }}>
            + Nouveau programme de groupe
          </button>
        </div>

        <div role="button" tabIndex={0} style={{ ...S.panel, maxHeight: 380, display: 'flex', flexDirection: 'column', cursor: classementFFR.length > 0 ? 'pointer' : 'default' }}
          onClick={() => classementFFR.length > 0 && setTab('classement')} title={classementFFR.length > 0 ? 'Ouvrir le classement complet' : undefined}>
          <div style={S.panelHead}>
            <span style={S.panelLabel}>Classement</span>
            {classementSrc && classementSrc.id !== groupe.id && <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600 }}>{classementSrc.nom}</span>}
          </div>
          {!classementSrc ? (
            <p style={{ fontSize: '0.76rem', color: '#6b7280', padding: '0 1.1rem 1.1rem' }}>Relie ce groupe à monclubhouse.ffr.fr (bouton Modifier) pour afficher le classement.</p>
          ) : classementFFR.length === 0 ? (
            <p style={{ fontSize: '0.76rem', color: '#6b7280', padding: '0 1.1rem 1.1rem' }}>Pas encore synchronisé — voir l'onglet Calendrier ▸ Compétition.</p>
          ) : (
            <div style={{ padding: '0.1rem 0 0.6rem', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {classementFFR.filter(c => (c.competition || null) === (classementSrc.monclubhouse_competition || null)).map(c => {
                const isOurs = c.equipe?.toLowerCase().includes(classementSrc.nom.toLowerCase()) || classementSrc.nom.toLowerCase().includes(c.equipe?.toLowerCase())
                const logoAff = (isOurs && classementSrc.logo_url) || c.logo
                return (
                  <div key={c.equipe} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.2rem 1.1rem', background: isOurs ? accent + '14' : 'transparent' }}>
                    <span style={{ fontSize: '0.68rem', color: isOurs ? accent : '#9ca3af', fontWeight: 800, width: 16, flexShrink: 0 }}>{c.position}</span>
                    {logoAff
                      ? <img loading="lazy" src={logoAff} alt="" style={{ width: 17, height: 17, borderRadius: '50%', objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      : <span style={{ width: 17, height: 17, borderRadius: '50%', background: '#f3f4f6', color: '#6b7280', fontSize: '0.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.equipe?.slice(0, 2).toUpperCase()}</span>
                    }
                    <span style={{ flex: 1, fontSize: '0.75rem', fontWeight: isOurs ? 800 : 700, color: isOurs ? accent : '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.equipe}</span>
                    <span style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600, width: 14, textAlign: 'right' }}>{c.joues}</span>
                    <span style={{ fontSize: '0.75rem', color: isOurs ? accent : '#1a1a1a', fontWeight: 900, width: 20, textAlign: 'right' }}>{c.pts}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ── Effectif — sous-menu repliable (fermé par défaut, contenu long) ── */}
      <div style={{ ...S.panel, marginBottom: '1.5rem' }}>
        <button onClick={() => setEffectifOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '0.9rem 1.1rem', font: 'inherit' }}>
          <span style={S.panelLabel}>Effectif</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#6b7280' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{effectifOpen ? 'Réduire' : 'Afficher'}</span>
            <span style={{ transform: effectifOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', display: 'flex' }}><IcoChevronDown /></span>
          </span>
        </button>
        {effectifOpen && (
          <div style={{ padding: '0 1.1rem 1.1rem' }}>
            <EffectifView groupeId={id} groupColor={accent} openClientId={openJoueurClientId} onOpened={() => setOpenJoueurClientId(null)} />
          </div>
        )}
      </div>

      {/* ── Groupes de niveau — idem ── */}
      <div style={{ ...S.panel, marginBottom: 0, padding: '1.1rem' }}>
        <GroupesNiveauView groupeId={id} groupColor={accent} />
      </div>
      </div>
      </>
      )}

      {/* ── Modal édition groupe ── */}
      {wellnessDetail && (
        <Modal title={`Wellness du ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`} onClose={() => setWellnessDetail(false)} maxWidth={620}>
          <p style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', color: '#6b7280' }}>
            {wellnessDuJour.length} / {membresVue.length} remplis{wellnessMoyenne != null ? ` · moyenne ${wellnessMoyenne.toFixed(1)} / 4` : ''}. Notes de 1 (mauvais) à 4 (très bien) ; une note de 2 ou moins est signalée « bas ».
          </p>
          {wellnessDuJour.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    {['Joueur', 'Sommeil', 'Fatigue', 'Douleurs', 'Stress', 'Moy.'].map((h, i) => (
                      <th key={h} style={{ textAlign: i ? 'center' : 'left', fontSize: '0.68rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.4rem 0.5rem', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wellnessDuJour.map(({ m, w, avg }) => (
                    <tr key={m.id}>
                      <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid #f3f4f6', fontWeight: 700, color: '#333', whiteSpace: 'nowrap' }}>{m.prenom} {m.nom}</td>
                      {WELLNESS_DIMS.map(([k]) => (
                        <td key={k} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center', fontWeight: w[k] <= 2 ? 800 : 600, color: w[k] <= 2 ? '#dc2626' : '#374151', whiteSpace: 'nowrap' }}>
                          {w[k]}{w[k] <= 2 && <span style={{ fontSize: '0.66rem', marginLeft: 3 }}>bas</span>}
                        </td>
                      ))}
                      <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center', fontWeight: 800, color: '#1a1a1a', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: wellnessColor(avg), marginRight: 5 }} />{avg.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {wellnessManquants.length > 0 && (
            <>
              <button onClick={() => setManquantsOuverts(v => !v)} aria-expanded={manquantsOuverts}
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 40, padding: 0, margin: '0 0 0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: manquantsOuverts ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
                Pas encore rempli · {wellnessManquants.length}
              </button>
              {manquantsOuverts && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {wellnessManquants.map(m => (
                    <span key={m.id} style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', background: '#f3f4f6', borderRadius: 999, padding: '0.25rem 0.65rem' }}>{m.prenom} {m.nom}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {editOpen && (
        <Modal title="Modifier le groupe" onClose={() => setEditOpen(false)}>
          <label style={S.label}>Nom du groupe</label>
          <input value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })}
            style={{ ...S.input, marginBottom: '1.25rem', width: '100%', boxSizing: 'border-box' }} />

          <label style={S.label}>Logo du club</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', marginBottom: (editLogoPreview || groupe?.logo_url) ? '0.65rem' : '1.25rem', background: '#f3f4f6', borderRadius: 9, padding: '0.45rem 0.85rem', border: '1.5px solid #e5e7eb' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: 'white' }}>
              {editLogoPreview
                ? <img loading="lazy" src={editLogoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : groupe?.logo_url
                  ? <img loading="lazy" src={groupe.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: '1.1rem' }}><Icon name="folder-open" size={14} /></span>}
            </div>
            <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: '600' }}>
              {extractingEditColors ? 'Analyse couleurs...' : editLogoFile ? editLogoFile.name : groupe?.logo_url ? 'Changer le logo...' : 'Choisir un logo...'}
            </span>
            <input type="file" accept="image/*" onChange={handleEditLogoChange} style={{ display: 'none' }} />
          </label>

          {/* Zone pipette — visible uniquement quand un logo est disponible */}
          {(editLogoPreview || groupe?.logo_url) && (
            <div style={{ background: editPickingFor ? '#fffbeb' : '#f9fafb', borderRadius: 11, padding: '0.65rem', border: `1.5px solid ${editPickingFor ? '#f59e0b' : '#e5e7eb'}`, marginBottom: '1.25rem', transition: 'all 0.15s' }}>
              {editPickingFor && (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: '700', color: '#d97706', textAlign: 'center' }}>
                  Cliquez sur le logo pour choisir la couleur {editPickingFor === 'primary' ? 'principale' : 'secondaire'}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <img
                  ref={editLogoPickRef}
                  src={editLogoPreview || groupe.logo_url}
                  alt="logo"
                  onClick={editPickingFor ? handleEditLogoColorPick : undefined}
                  crossOrigin="anonymous"
                  style={{
                    height: editPickingFor ? 100 : 56,
                    maxWidth: '100%',
                    objectFit: 'contain',
                    borderRadius: 8,
                    cursor: editPickingFor ? 'crosshair' : 'default',
                    transition: 'height 0.2s',
                    outline: editPickingFor ? '2px solid #f59e0b' : 'none',
                    outlineOffset: 3,
                  }}
                />
              </div>
              {editPickingFor && (
                <button onClick={() => setEditPickingFor(null)} style={{ display: 'block', margin: '0.45rem auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#6b7280' }}>Annuler</button>
              )}
            </div>
          )}

          <label style={S.label}>Couleurs</label>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {editForm.couleur ? (
                <>
                  <input type="color" value={editForm.couleur} onChange={e => setEditForm({ ...editForm, couleur: e.target.value })}
                    style={{ width: 36, height: 30, border: '1.5px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', padding: '2px', background: 'white' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#6b7280' }}>Principale</span>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280', fontFamily: 'monospace' }}>{editForm.couleur}</span>
                  <button onClick={() => setEditForm({ ...editForm, couleur: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.75rem', padding: 0 }}>✕</button>
                </>
              ) : (
                <button onClick={() => setEditForm({ ...editForm, couleur: '#6366f1' })}
                  style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: 8, padding: '0.25rem 0.75rem', fontSize: '0.75rem', color: '#6b7280', cursor: 'pointer', fontWeight: '600' }}>
                  + Couleur principale
                </button>
              )}
              {(editLogoPreview || groupe?.logo_url) && (
                <button onClick={() => setEditPickingFor(editPickingFor === 'primary' ? null : 'primary')}
                  title="Pipette — cliquer sur le logo"
                  style={{ background: editPickingFor === 'primary' ? '#fef3c7' : '#f3f4f6', border: `1.5px solid ${editPickingFor === 'primary' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', padding: '2px 6px', fontSize: '0.82rem', lineHeight: 1 }}>
                  <Icon name="palette" size={14} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="color" value={editForm.couleur_secondaire || '#cccccc'} onChange={e => setEditForm({ ...editForm, couleur_secondaire: e.target.value })}
                style={{ width: 36, height: 30, border: '1.5px solid #e5e7eb', borderRadius: 7, cursor: 'pointer', padding: '2px', background: 'white', opacity: editForm.couleur_secondaire ? 1 : 0.45 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#6b7280' }}>Secondaire</span>
              {(editLogoPreview || groupe?.logo_url) && (
                <button onClick={() => setEditPickingFor(editPickingFor === 'secondary' ? null : 'secondary')}
                  title="Pipette — cliquer sur le logo"
                  style={{ background: editPickingFor === 'secondary' ? '#fef3c7' : '#f3f4f6', border: `1.5px solid ${editPickingFor === 'secondary' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', padding: '2px 6px', fontSize: '0.82rem', lineHeight: 1 }}>
                  <Icon name="palette" size={14} />
                </button>
              )}
              {editForm.couleur_secondaire && (
                <button onClick={() => setEditForm({ ...editForm, couleur_secondaire: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.75rem', padding: 0 }}>✕</button>
              )}
            </div>
          </div>

          {/* Aperçu live */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.9rem', borderRadius: 11, background: '#f9fafb', border: `1.5px solid ${editForm.couleur}`, marginBottom: '1.25rem' }}>
            {(editLogoPreview || groupe?.logo_url)
              ? <img loading="lazy" src={editLogoPreview || groupe.logo_url} alt="" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />
              : <div style={{ width: 26, height: 26, borderRadius: 7, background: editForm.couleur + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}><Icon name="trophy" size={14} /></div>
            }
            <span style={{ fontWeight: '700', fontSize: '0.88rem', color: '#1a1a1a', flex: 1 }}>{editForm.nom || groupe?.nom || 'Nom du groupe'}</span>
            <span style={{ background: editForm.couleur + '18', color: editForm.couleur, border: `1px solid ${editForm.couleur}33`, borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: '700' }}>Groupe</span>
          </div>

          {/* Lien monclubhouse */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.3rem' }}>
              Lien monclubhouse.ffr.fr <span style={{ fontWeight: 400, color: '#6b7280' }}>(optionnel)</span>
            </label>
            <input
              value={editForm.monclubhouse_url}
              onChange={e => setEditForm({ ...editForm, monclubhouse_url: e.target.value })}
              placeholder="https://monclubhouse.ffr.fr/clubs/mon-club/competitions/..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.78rem', outline: 'none', color: '#374151', background: '#fff' }}
            />
            {editForm.monclubhouse_url && !editForm.monclubhouse_url.includes('monclubhouse.ffr.fr') && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: '#ef4444' }}>Le lien doit provenir de monclubhouse.ffr.fr</p>
            )}
          </div>

          {editForm.monclubhouse_url && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.3rem' }}>
                Compétition à suivre <span style={{ fontWeight: 400, color: '#6b7280' }}>(si le club a plusieurs équipes, ex: federale-2)</span>
              </label>
              <input
                value={editForm.monclubhouse_competition}
                onChange={e => setEditForm({ ...editForm, monclubhouse_competition: e.target.value })}
                placeholder="federale-2"
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.78rem', outline: 'none', color: '#374151', background: '#fff' }}
              />
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: '#6b7280' }}>
                Laisse vide si le club n'a qu'une équipe. Sinon, mets l'identifiant visible dans l'URL de la compétition sur monclubhouse.ffr.fr (ex: ".../nationales/federale-2/...").
              </p>
            </div>
          )}

          {editForm.monclubhouse_url && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.3rem' }}>
                Équipe espoirs <span style={{ fontWeight: 400, color: '#6b7280' }}>(optionnel — ajoute un onglet Espoirs au classement)</span>
              </label>
              <input
                value={editForm.monclubhouse_competition_espoirs}
                onChange={e => setEditForm({ ...editForm, monclubhouse_competition_espoirs: e.target.value })}
                placeholder="federale-b-championnat-de-france"
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.78rem', outline: 'none', color: '#374151', background: '#fff' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={sauvegarderGroupe} disabled={saving || extractingEditColors} style={{ ...S.btnPrimary, flex: 1, opacity: (saving || extractingEditColors) ? 0.6 : 1 }}>
              {saving ? 'Enregistrement...' : extractingEditColors ? 'Analyse...' : 'Enregistrer'}
            </button>
            <button onClick={() => setEditOpen(false)} style={{ ...S.btnSecondary, flex: 1 }}>Annuler</button>
          </div>
        </Modal>
      )}

      {/* ── Modal ajout membre ── */}
      {showAddMembre && (
        <Modal title={estSG ? `Ajouter depuis ${parent?.nom || 'le groupe principal'}` : 'Ajouter des membres'} onClose={() => setShowAddMembre(false)}>
          <label style={S.label}>Rechercher un client</label>
          <input
            autoFocus value={searchMembre} onChange={e => setSearchMembre(e.target.value)}
            placeholder="Nom du client..." style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: '0.75rem' }}
          />
          {candidatsFiltres.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {selectedCandidats.size > 0 ? `${selectedCandidats.size} sélectionné${selectedCandidats.size > 1 ? 's' : ''}` : `${candidatsFiltres.length} disponible${candidatsFiltres.length > 1 ? 's' : ''}`}
              </span>
              <button onClick={toggleTous} style={{ background: 'none', border: 'none', fontSize: '0.75rem', fontWeight: 700, color: accent, cursor: 'pointer', padding: 0 }}>
                {selectedCandidats.size === candidatsFiltres.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
          )}
          {candidatsFiltres.length === 0 ? (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: '1rem 0' }}>
              {searchMembre
                ? 'Aucun client trouvé.'
                : estSG
                  ? `Tous les joueurs de ${parent?.nom || 'le groupe principal'} sont déjà dans ce sous-groupe.`
                  : 'Tous les clients sont déjà dans un groupe.'}
            </p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem' }}>
              {candidatsFiltres.map(c => {
                const offre = OFFRES[c.offre]
                const checked = selectedCandidats.has(c.id)
                return (
                  <div role="button" tabIndex={0} key={c.id}
                    onClick={() => toggleCandidat(c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 1rem', background: checked ? accent + '15' : '#f9fafb', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${checked ? accent : 'transparent'}`, transition: 'all .1s' }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checked ? accent : '#d1d5db'}`, background: checked ? accent : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {checked && <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontWeight: 700, color: '#333', flex: 1 }}>{c.prenom} {c.nom}</span>
                    {offre && <span style={{ background: offre.bg, color: offre.color, padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600 }}>{offre.label}</span>}
                  </div>
                )
              })}
            </div>
          )}
          {selectedCandidats.size > 0 && (
            <button onClick={ajouterMembresSelectionnes} disabled={addingMembres}
              style={{ width: '100%', background: accent, color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {addingMembres ? 'Ajout en cours…' : `Ajouter ${selectedCandidats.size} joueur${selectedCandidats.size > 1 ? 's' : ''}`}
            </button>
          )}
        </Modal>
      )}

      {/* Modal — pousser programmes aux nouveaux membres */}
      {showPushToNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '1.5rem 1.75rem', width: '100%', maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <p style={{ fontWeight: 900, fontSize: '1rem', marginBottom: '0.4rem', color: '#111' }}>
              Envoyer des programmes ?
            </p>
            <p style={{ fontSize: '0.8rem', color: '#555', marginBottom: '1rem' }}>
              {newMembresIds.length} nouveau{newMembresIds.length > 1 ? 'x membres ajoutés' : ' membre ajouté'}. Veux-tu leur envoyer des programmes existants ?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.25rem' }}>
              {progsDispos.map(prog => (
                <label key={prog.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '0.6rem 0.8rem', borderRadius: 10, border: `1.5px solid ${selectedProgsForNew.has(prog.id) ? accent : '#e0e3e8'}`, background: selectedProgsForNew.has(prog.id) ? accent + '12' : '#fafafa' }}>
                  <input type="checkbox" checked={selectedProgsForNew.has(prog.id)}
                    onChange={() => setSelectedProgsForNew(prev => {
                      const next = new Set(prev)
                      next.has(prog.id) ? next.delete(prog.id) : next.add(prog.id)
                      return next
                    })}
                    style={{ accentColor: accent, width: 16, height: 16 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111' }}>{prog.nom}</div>
                    {prog.semaines && <div style={{ fontSize: '0.72rem', color: '#888' }}>{prog.semaines} semaine{prog.semaines > 1 ? 's' : ''}</div>}
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowPushToNew(false); setNewMembresIds([]); setProgsDispos([]); setSelectedProgsForNew(new Set()) }}
                style={{ flex: 1, background: '#f1f3f5', border: 'none', borderRadius: 10, padding: '0.7rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: '#444' }}>
                Pas maintenant
              </button>
              <button onClick={pousserANouveaux} disabled={pushingToNew || !selectedProgsForNew.size}
                style={{ flex: 1, background: selectedProgsForNew.size ? accent : '#ccc', border: 'none', borderRadius: 10, padding: '0.7rem', fontSize: '0.85rem', fontWeight: 800, cursor: selectedProgsForNew.size ? 'pointer' : 'not-allowed', fontFamily: 'inherit', color: '#fff' }}>
                {pushingToNew ? 'Envoi…' : `Envoyer (${selectedProgsForNew.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de recadrage logo */}
      {editCropSrc && (
        <CropLogoModal
          src={editCropSrc}
          onConfirm={handleEditCropConfirm}
          onCancel={handleEditCropCancel}
        />
      )}
    </div>
  )
}

// ── Icônes SVG (pas d'emojis) ────────────────────────────────────────────────
function IcoEdit() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
}
function IcoTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
}
function IcoCalendar() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
}
function IcoChart() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-5 4 3 5-7" /></svg>
}
function IcoCross() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v8M8 12h8" /><rect x="3" y="3" width="18" height="18" rx="4" /></svg>
}
function IcoEye() {
  return <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
}
function IcoChevronL() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
}
function IcoChevronR() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
}
function IcoChevronDown() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
}

// ── Composants utilitaires ─────────────────────────────────────────────────────
function Section({ title, accent, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: '900', color: accent, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: accent + '28' }} />
      </div>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children, maxWidth = 440 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontWeight: '800', color: '#1a1a1a', fontSize: '1.1rem' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function isLightColor(hex) {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160
  } catch { return false }
}

const S = {
  page: { padding: '2rem', maxWidth: '860px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  pageWide: { padding: '2rem', maxWidth: '1400px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  tabs: { display: 'flex', gap: '0.4rem', marginBottom: '1.75rem' },
  tab: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#fff', color: '#5b626c', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' },
  back: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: '0 0 1.5rem', display: 'block' },
  btnPrimary: { background: '#333', color: '#e4f816', border: 'none', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  dashRow: { display: 'grid', gap: '1.25rem', marginBottom: '1.5rem', alignItems: 'start' },
  panel: { background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.9rem 1.1rem 0.7rem' },
  panelLabel: { fontSize: '0.65rem', fontWeight: '900', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' },
  calNavBtn: { background: '#f3f4f6', border: 'none', borderRadius: 7, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer', flexShrink: 0 },
  btnAdd: { background: 'white', color: '#6b7280', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', width: '100%', textAlign: 'center' },
  btnAction: { border: 'none', borderRadius: 10, padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' },
  input: { padding: '0.6rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' },
  kpi: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem', padding: '1rem 1.5rem', background: 'none', border: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: 0 },
  kpiLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#6b7280' },
  kpiVal: { fontSize: '2rem', fontWeight: 900, color: '#1a1a1a', lineHeight: 1.1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
  kpiSur: { fontSize: '1rem', color: '#6b7280', fontWeight: 700, marginLeft: 4, letterSpacing: 0 },
  kpiSub: { fontSize: '0.8rem', color: '#374151', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  menuItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', background: 'none', border: 'none', borderRadius: 8, padding: '0.6rem 0.75rem', font: 'inherit', fontSize: '0.88rem', fontWeight: 600, color: '#374151', cursor: 'pointer', textAlign: 'left' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
}
