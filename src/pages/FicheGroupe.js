import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { extractColorsFromImage } from '../utils/colorExtract'
import CropLogoModal from '../components/CropLogoModal'
import CalendrierSaison from './CalendrierSaison'

const PALETTE_SG = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#e4f816','#f97316']

const OFFRES = {
  essai:                { label: 'Essai',         bg: '#fff7ed', color: '#c2410c' },
  preparation_physique: { label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:             { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
  club:                 { label: 'Club',           bg: '#f0fdf4', color: '#15803d' },
}

export default function FicheGroupe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'calendrier' ? 'calendrier' : 'groupe'
  const setTab = t => setSearchParams(t === 'calendrier' ? { tab: 'calendrier' } : {})

  const [groupe, setGroupe]               = useState(null)
  const [parent, setParent]               = useState(null)
  const [sousGroupes, setSousGroupes]     = useState([])
  const [membres, setMembres]             = useState([])
  const [programmes, setProgrammes]       = useState([])
  const [loading, setLoading]             = useState(true)

  // Modales
  const [editOpen, setEditOpen]           = useState(false)
  const [editForm, setEditForm]           = useState({ nom: '', couleur: '', couleur_secondaire: '', monclubhouse_url: '' })
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

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [id]) // eslint-disable-line

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
    setEditForm({ nom: cleanedG?.nom || '', couleur: cleanedG?.couleur || '', couleur_secondaire: cleanedG?.couleur_secondaire || '', monclubhouse_url: cleanedG?.monclubhouse_url || '' })
    setEditLogoFile(null)
    setEditLogoPreview(null)
    setSousGroupes(sg || [])
    setMembres((gm || []).map(r => r.clients).filter(Boolean))
    setProgrammes(progs || [])

    if (g?.parent_id) {
      const { data: p } = await supabase.from('groupes').select('id, nom').eq('id', g.parent_id).single()
      setParent(p)
    } else {
      setParent(null)
    }
    if (!silent) setLoading(false)
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
    }).eq('id', id)
    if (error) { alert(error.message); setSaving(false); return }
    await load()
    setEditOpen(false)
    setSaving(false)
  }

  // ── Sous-groupes ───────────────────────────────────────────────────────────
  async function creerSousGroupe() {
    if (!newSGNom.trim()) return
    const { data, error } = await supabase.from('groupes')
      .insert([{ nom: newSGNom.trim(), couleur: newSGCouleur || null, parent_id: id }]).select().single()
    if (error) { alert(error.message); return }
    setSousGroupes([...sousGroupes, data])
    setNewSGNom('')
    setShowAddSG(false)
  }

  async function supprimerSousGroupe(sgId) {
    if (!window.confirm('Supprimer ce sous-groupe et tous ses membres ?')) return
    await supabase.from('groupes').delete().eq('id', sgId)
    setSousGroupes(sousGroupes.filter(s => s.id !== sgId))
  }

  async function supprimerGroupe() {
    if (!window.confirm(`Supprimer le groupe "${groupe?.nom}" ? Les membres redeviendront des clients individuels.`)) return
    await supabase.from('groupes').delete().eq('id', id)
    navigate('/clients')
  }

  // ── Membres ────────────────────────────────────────────────────────────────
  async function ouvrirAddMembre() {
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

    // Proposer de pousser les programmes existants aux nouveaux membres
    const { data: progs } = await supabase
      .from('programmes')
      .select('id, nom, semaines')
      .eq('groupe_id', id)
      .is('template_id', null)
      .order('created_at', { ascending: false })
    if (progs?.length > 0) {
      setNewMembresIds(newIds)
      setProgsDispos(progs)
      setSelectedProgsForNew(new Set(progs.map(p => p.id)))
      setShowPushToNew(true)
    }
  }

  async function pousserANouveaux() {
    if (!selectedProgsForNew.size || !newMembresIds.length) return
    setPushingToNew(true)

    const progsToPush = progsDispos.filter(p => selectedProgsForNew.has(p.id))

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

        const { data: progCopy, error: pe } = await supabase.from('programmes').insert({
          nom: prog.nom,
          semaines: prog.semaines,
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
    if (!window.confirm('Retirer ce membre du groupe ? Il redeviendra un client individuel.')) return
    await supabase.from('groupe_membres').delete().eq('groupe_id', id).eq('client_id', clientId)
    setMembres(membres.filter(m => m.id !== clientId))
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
            }))
          )
        }
      }
      count++
    }

    setPushLoading(null)
    alert(`✅ Programme envoyé à ${count} membre(s) !`)
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

  async function propaguerATous(prog) {
    if (!window.confirm(`Mettre à jour TOUTES les copies existantes de "${prog.nom}" ?\nCela écrasera le contenu de chaque copie individuelle.`)) return
    setPushLoading(prog.id)

    // Charger le contenu actuel du template
    const { data: seancesData } = await supabase
      .from('seances').select('*, exercices(*)').eq('programme_id', prog.id).order('ordre', { ascending: true })

    // Trouver toutes les copies
    const { data: copies } = await supabase.from('programmes').select('id').eq('template_id', prog.id)
    let count = 0

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
          programme_id: copy.id, nom: s.nom, ordre: s.ordre, echauffement: s.echauffement || null,
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
            }))
          )
        }
      }
      count++
    }

    setPushLoading(null)
    alert(`✅ ${count} copie(s) mise(s) à jour !`)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function subInfo(date_fin) {
    if (!date_fin) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const fin = new Date(date_fin + 'T00:00:00')
    const days = Math.ceil((fin - today) / 86400000)
    if (days < 0)  return { color: '#9ca3af', bg: '#f3f4f6', label: 'Expiré' }
    if (days <= 7) return { color: '#dc2626', bg: '#fef2f2', label: `${days}j` }
    if (days <= 30)return { color: '#d97706', bg: '#fffbeb', label: `${days}j` }
    return { color: '#16a34a', bg: '#f0fdf4', label: `${days}j` }
  }

  const candidatsFiltres = candidats.filter(c =>
    `${c.prenom} ${c.nom}`.toLowerCase().includes(searchMembre.toLowerCase())
  )

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#9ca3af' }}>Chargement...</p>
    </div>
  )
  if (!groupe) return null

  const accent = groupe.couleur || '#333333'

  return (
    <div style={tab === 'calendrier' ? S.pageWide : S.page}>
      {/* ── Retour ── */}
      <button onClick={() => parent ? navigate(`/groupe/${parent.id}`) : navigate('/clients')} style={S.back}>
        ← {parent ? parent.nom : 'Clients'}
      </button>

      {/* ── Header groupe ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {groupe.logo_url
            ? <img src={groupe.logo_url} alt={groupe.nom} style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 12 }} />
            : <div style={{ width: 64, height: 64, borderRadius: 12, background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem' }}>🏆</div>
          }
          <div>
            {parent && <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: '700', color: accent, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Sous-groupe de {parent.nom}</p>}
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '900', color: '#1a1a1a' }}>{groupe.nom}</h1>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ background: accent + '18', color: accent, border: `1px solid ${accent}44`, borderRadius: 999, padding: '0.2rem 0.75rem', fontSize: '0.75rem', fontWeight: '700' }}>
                {membres.length} membre{membres.length > 1 ? 's' : ''}
              </span>
              <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 999, padding: '0.2rem 0.75rem', fontSize: '0.75rem', fontWeight: '700' }}>
                {sousGroupes.length} sous-groupe{sousGroupes.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setEditOpen(true)} style={S.btnSecondary}>✏️ Modifier</button>
          <button onClick={supprimerGroupe} style={{ ...S.btnSecondary, color: '#dc2626', borderColor: '#fee2e2' }}>🗑 Supprimer</button>
        </div>
      </div>

      {/* ── Barre accent ── */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}44)`, borderRadius: 999, marginBottom: '1.25rem' }} />

      {/* ── Onglets ── */}
      <div style={S.tabs}>
        <button onClick={() => setTab('groupe')}
          style={{ ...S.tab, ...(tab === 'groupe' ? { background: '#333333', color: '#fff' } : null) }}>
          Groupe
        </button>
        <button onClick={() => setTab('calendrier')}
          style={{ ...S.tab, ...(tab === 'calendrier' ? { background: '#333333', color: '#fff' } : null) }}>
          📅 Calendrier
        </button>
      </div>

      {tab === 'calendrier' ? (
        <CalendrierSaison groupeId={id} embedded />
      ) : (
      <>
      {/* ── Sous-groupes ── */}
      <Section title="Sous-groupes" accent={accent}>
        {sousGroupes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {sousGroupes.map(sg => (
              <div key={sg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', background: 'white', borderRadius: 14, border: `1.5px solid ${sg.couleur}30`, cursor: 'pointer' }}
                onClick={() => navigate(`/groupe/${sg.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: sg.couleur, display: 'inline-block' }} />
                  <span style={{ fontWeight: '700', color: '#333' }}>{sg.nom}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Sous-groupe</span>
                  <button onClick={e => { e.stopPropagation(); supprimerSousGroupe(sg.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem', padding: '0.1rem 0.3rem' }}>✕</button>
                  <span style={{ color: '#d1d5db', fontSize: '1.25rem' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddSG ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.75rem', background: '#f9fafb', borderRadius: 12 }}>
            <input
              autoFocus value={newSGNom} onChange={e => setNewSGNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creerSousGroupe()}
              placeholder="Nom du sous-groupe..." style={S.input}
            />
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setNewSGCouleur('')}
                style={{ width: 22, height: 22, borderRadius: '50%', background: 'white', border: !newSGCouleur ? '2.5px solid #1a1a1a' : '2px solid #d1d5db', cursor: 'pointer', padding: 0, fontSize: '0.7rem', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              {PALETTE_SG.map(c => (
                <button key={c} onClick={() => setNewSGCouleur(c)}
                  style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: newSGCouleur === c ? '2.5px solid #1a1a1a' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={creerSousGroupe} style={S.btnPrimary}>Créer</button>
              <button onClick={() => setShowAddSG(false)} style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.5rem 0.875rem', cursor: 'pointer', color: '#9ca3af', fontWeight: '600' }}>Annuler</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddSG(true)} style={S.btnAdd}>+ Créer un sous-groupe</button>
        )}
      </Section>

      {/* ── Membres ── */}
      <Section title="Membres" accent={accent}>
        {membres.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '0.75rem', background: 'white', borderRadius: 14, overflow: 'hidden', border: '1px solid #f3f4f6' }}>
            {membres.map((m, i) => {
              const offre = OFFRES[m.offre]
              const sub = subInfo(m.date_fin)
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.25rem', borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
                  onClick={() => navigate(`/client/${m.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.8rem', color: accent, flexShrink: 0 }}>
                      {(m.prenom?.[0] || '') + (m.nom?.[0] || '')}
                    </div>
                    <span style={{ fontWeight: '700', color: '#333' }}>{m.prenom} {m.nom}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sub && <span style={{ background: sub.bg, color: sub.color, padding: '0.15rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '700' }}>{sub.label}</span>}
                    {offre && <span style={{ background: offre.bg, color: offre.color, padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '600' }}>{offre.label}</span>}
                    <button onClick={e => { e.stopPropagation(); retirerMembre(m.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem', padding: '0.1rem 0.3rem' }} title="Retirer du groupe">✕</button>
                    <span style={{ color: '#d1d5db', fontSize: '1.25rem' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={ouvrirAddMembre} style={S.btnAdd}>+ Ajouter un membre</button>
      </Section>

      {/* ── Programmes du groupe ── */}
      <Section title="Programmes du groupe" accent={accent}>
        {programmes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {programmes.map(prog => {
              const nbSeances = prog.seances?.[0]?.count ?? 0
              const isPushing = pushLoading === prog.id
              return (
                <div key={prog.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', cursor: 'pointer' }}
                    onClick={() => navigate(`/programme/${prog.id}`)}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1a1a1a' }}>{prog.nom}</span>
                        <span style={{ background: accent + '18', color: accent, border: `1px solid ${accent}33`, borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: '800' }}>TEMPLATE</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>
                        {prog.semaines} sem · {nbSeances} séance{nbSeances > 1 ? 's' : ''}
                        {prog.date_debut ? ` · début ${new Date(prog.date_debut).toLocaleDateString('fr-FR')}` : ''}
                      </p>
                    </div>
                    <span style={{ color: '#d1d5db', fontSize: '1.25rem' }}>›</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 1.25rem 0.85rem', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => pousserATous(prog)}
                      disabled={isPushing || membres.length === 0}
                      style={{ ...S.btnAction, background: accent, color: isLightColor(accent) ? '#1a1a1a' : 'white', opacity: membres.length === 0 ? 0.4 : 1 }}
                    >
                      {isPushing ? '⏳ Envoi...' : `📤 Pousser aux ${membres.length} membre${membres.length > 1 ? 's' : ''}`}
                    </button>
                    <button
                      onClick={() => propaguerATous(prog)}
                      disabled={isPushing}
                      style={{ ...S.btnAction, background: '#f3f4f6', color: '#374151' }}
                      title="Mettre à jour toutes les copies existantes"
                    >
                      🔄 Propager les modifs
                    </button>
                    <button
                      onClick={() => supprimerDoublons(prog)}
                      disabled={dedupLoading === prog.id}
                      style={{ ...S.btnAction, background: '#fee2e2', color: '#b91c1c' }}
                      title="Supprimer les copies en double pour chaque membre"
                    >
                      {dedupLoading === prog.id ? '⏳' : '🗑 Doublons'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={() => navigate(`/groupe/${id}/nouveau-programme`)} style={S.btnAdd}>
          + Nouveau programme de groupe
        </button>
      </Section>
      </>
      )}

      {/* ── Modal édition groupe ── */}
      {editOpen && (
        <Modal title="Modifier le groupe" onClose={() => setEditOpen(false)}>
          <label style={S.label}>Nom du groupe</label>
          <input value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })}
            style={{ ...S.input, marginBottom: '1.25rem', width: '100%', boxSizing: 'border-box' }} />

          <label style={S.label}>Logo du club</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', marginBottom: (editLogoPreview || groupe?.logo_url) ? '0.65rem' : '1.25rem', background: '#f3f4f6', borderRadius: 9, padding: '0.45rem 0.85rem', border: '1.5px solid #e5e7eb' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: 'white' }}>
              {editLogoPreview
                ? <img src={editLogoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : groupe?.logo_url
                  ? <img src={groupe.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: '1.1rem' }}>📂</span>}
            </div>
            <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: '600' }}>
              {extractingEditColors ? '⏳ Analyse couleurs...' : editLogoFile ? editLogoFile.name : groupe?.logo_url ? 'Changer le logo...' : 'Choisir un logo...'}
            </span>
            <input type="file" accept="image/*" onChange={handleEditLogoChange} style={{ display: 'none' }} />
          </label>

          {/* Zone pipette — visible uniquement quand un logo est disponible */}
          {(editLogoPreview || groupe?.logo_url) && (
            <div style={{ background: editPickingFor ? '#fffbeb' : '#f9fafb', borderRadius: 11, padding: '0.65rem', border: `1.5px solid ${editPickingFor ? '#f59e0b' : '#e5e7eb'}`, marginBottom: '1.25rem', transition: 'all 0.15s' }}>
              {editPickingFor && (
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', fontWeight: '700', color: '#d97706', textAlign: 'center' }}>
                  🎨 Cliquez sur le logo pour choisir la couleur {editPickingFor === 'primary' ? 'principale' : 'secondaire'}
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
                <button onClick={() => setEditPickingFor(null)} style={{ display: 'block', margin: '0.45rem auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#9ca3af' }}>Annuler</button>
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
                  <span style={{ fontSize: '0.7rem', color: '#d1d5db', fontFamily: 'monospace' }}>{editForm.couleur}</span>
                  <button onClick={() => setEditForm({ ...editForm, couleur: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', padding: 0 }}>✕</button>
                </>
              ) : (
                <button onClick={() => setEditForm({ ...editForm, couleur: '#6366f1' })}
                  style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: 8, padding: '0.25rem 0.75rem', fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer', fontWeight: '600' }}>
                  + Couleur principale
                </button>
              )}
              {(editLogoPreview || groupe?.logo_url) && (
                <button onClick={() => setEditPickingFor(editPickingFor === 'primary' ? null : 'primary')}
                  title="Pipette — cliquer sur le logo"
                  style={{ background: editPickingFor === 'primary' ? '#fef3c7' : '#f3f4f6', border: `1.5px solid ${editPickingFor === 'primary' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', padding: '2px 6px', fontSize: '0.82rem', lineHeight: 1 }}>
                  🎨
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
                  🎨
                </button>
              )}
              {editForm.couleur_secondaire && (
                <button onClick={() => setEditForm({ ...editForm, couleur_secondaire: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', padding: 0 }}>✕</button>
              )}
            </div>
          </div>

          {/* Aperçu live */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.9rem', borderRadius: 11, background: '#f9fafb', borderLeft: `4px solid ${editForm.couleur}`, marginBottom: '1.25rem' }}>
            {(editLogoPreview || groupe?.logo_url)
              ? <img src={editLogoPreview || groupe.logo_url} alt="" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }} />
              : <div style={{ width: 26, height: 26, borderRadius: 7, background: editForm.couleur + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>🏆</div>
            }
            <span style={{ fontWeight: '700', fontSize: '0.88rem', color: '#1a1a1a', flex: 1 }}>{editForm.nom || groupe?.nom || 'Nom du groupe'}</span>
            <span style={{ background: editForm.couleur + '18', color: editForm.couleur, border: `1px solid ${editForm.couleur}33`, borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: '700' }}>Groupe</span>
          </div>

          {/* Lien monclubhouse */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.3rem' }}>
              Lien monclubhouse.ffr.fr <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optionnel)</span>
            </label>
            <input
              value={editForm.monclubhouse_url}
              onChange={e => setEditForm({ ...editForm, monclubhouse_url: e.target.value })}
              placeholder="https://monclubhouse.ffr.fr/clubs/mon-club/competitions/..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.78rem', outline: 'none', color: '#374151', background: '#fff' }}
            />
            {editForm.monclubhouse_url && !editForm.monclubhouse_url.includes('monclubhouse.ffr.fr') && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: '#ef4444' }}>⚠️ Le lien doit provenir de monclubhouse.ffr.fr</p>
            )}
          </div>

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
        <Modal title="Ajouter des membres" onClose={() => setShowAddMembre(false)}>
          <input
            autoFocus value={searchMembre} onChange={e => setSearchMembre(e.target.value)}
            placeholder="Rechercher un client..." style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: '0.5rem' }}
          />
          {candidatsFiltres.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {selectedCandidats.size > 0 ? `${selectedCandidats.size} sélectionné${selectedCandidats.size > 1 ? 's' : ''}` : `${candidatsFiltres.length} disponible${candidatsFiltres.length > 1 ? 's' : ''}`}
              </span>
              <button onClick={toggleTous} style={{ background: 'none', border: 'none', fontSize: '0.75rem', fontWeight: 700, color: accent, cursor: 'pointer', padding: 0 }}>
                {selectedCandidats.size === candidatsFiltres.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
            </div>
          )}
          {candidatsFiltres.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1rem 0' }}>
              {searchMembre ? 'Aucun client trouvé.' : 'Tous les clients sont déjà dans un groupe.'}
            </p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1rem' }}>
              {candidatsFiltres.map(c => {
                const offre = OFFRES[c.offre]
                const checked = selectedCandidats.has(c.id)
                return (
                  <div key={c.id}
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
              {addingMembres ? 'Ajout en cours…' : `Ajouter ${selectedCandidats.size} membre${selectedCandidats.size > 1 ? 's' : ''}`}
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

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontWeight: '800', color: '#1a1a1a', fontSize: '1.1rem' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
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
  tab: { background: '#fff', color: '#5b626c', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.5rem 1.1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' },
  back: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: '0 0 1.5rem', display: 'block' },
  btnPrimary: { background: '#333', color: '#e4f816', border: 'none', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  btnAdd: { background: 'white', color: '#6b7280', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', width: '100%', textAlign: 'center' },
  btnAction: { border: 'none', borderRadius: 10, padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' },
  input: { padding: '0.6rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
}
