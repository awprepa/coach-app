import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { extractColorsFromImage } from '../utils/colorExtract'

const PALETTE_GROUPES = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#e4f816','#f97316']
const PALETTE_CATS    = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4']

const OFFRES = {
  gratuit:             { label: 'Gratuit',       bg: '#f0fdf4', color: '#15803d' },
  essai:               { label: 'Essai',         bg: '#fff7ed', color: '#c2410c' },
  preparation_physique:{ label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:            { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
}
const FILTRES_OFFRE = [
  { key: 'tous',               label: 'Tous' },
  { key: 'coaching',           label: 'Coaching' },
  { key: 'preparation_physique', label: 'Prépa physique' },
  { key: 'essai',              label: 'Essai' },
  { key: 'gratuit',            label: 'Gratuit' },
]
function offreLabel(offre) { return OFFRES[offre]?.label || (offre || '—') }
function offreBadge(offre) { const o = OFFRES[offre]; return o ? { background: o.bg, color: o.color } : { background: '#f3f4f6', color: '#6b7280' } }

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

export default function Clients() {
  const [clients, setClients]               = useState([])
  const [categories, setCategories]         = useState([])
  const [groupes, setGroupes]               = useState([])
  const [groupMemberIds, setGroupMemberIds] = useState(new Set())
  const [expandedGroupes, setExpandedGroupes] = useState(new Set())
  const [search, setSearch]                 = useState('')
  const [loading, setLoading]               = useState(true)
  const [activeCat, setActiveCat]           = useState(null)
  const [activeOffre, setActiveOffre]       = useState('tous')
  const [showInactifs, setShowInactifs]     = useState(false)
  const [showCatForm, setShowCatForm]       = useState(false)
  const [newCatNom, setNewCatNom]           = useState('')
  const [newCatColor, setNewCatColor]       = useState(PALETTE_CATS[0])
  const [newCatLogo, setNewCatLogo]         = useState('')
  const [showGroupeForm, setShowGroupeForm] = useState(false)
  const [newGroupeNom, setNewGroupeNom]     = useState('')
  const [newGroupeCouleur, setNewGroupeCouleur]   = useState('')
  const [newGroupeCouleur2, setNewGroupeCouleur2] = useState('')
  const [newGroupeLogoFile, setNewGroupeLogoFile]   = useState(null)
  const [newGroupeLogoPreview, setNewGroupeLogoPreview] = useState(null)
  const [uploadingLogo, setUploadingLogo]   = useState(false)
  const [extractingColors, setExtractingColors] = useState(false)
  const [pickingFor, setPickingFor]         = useState(null)
  const [newGroupeUrl, setNewGroupeUrl]     = useState('')
  const logoPickRef = useRef(null)

  const navigate = useNavigate()

  useEffect(() => { fetchAll() }, []) // eslint-disable-line

  async function fetchAll() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const [
      { data: clientsData, error },
      { data: wData },
      { data: catsData },
      { data: groupesData },
      { data: membresData },
    ] = await Promise.all([
      supabase.from('clients').select('*, categories(id, nom, couleur)').order('created_at', { ascending: false }),
      supabase.from('wellness').select('*').eq('date', today),
      supabase.from('categories').select('*').order('created_at'),
      supabase.from('groupes').select('*').is('parent_id', null).order('created_at'),
      supabase.from('groupe_membres').select('client_id'),
    ])
    if (error) { console.log(error); setLoading(false); return }
    const withWellness = (clientsData || []).map(c => ({
      ...c,
      wellness_today: wData?.find(w => w.client_id === c.id) || null,
    }))
    setClients(withWellness)
    setCategories(catsData || [])
    setGroupes(groupesData || [])
    setGroupMemberIds(new Set((membresData || []).map(m => m.client_id)))
    setLoading(false)
  }

  async function ajouterCategorie() {
    if (!newCatNom.trim()) return
    const { data, error } = await supabase
      .from('categories').insert([{ nom: newCatNom, couleur: newCatColor, logo_url: newCatLogo.trim() || null }]).select().single()
    if (error) { alert(error.message); return }
    setCategories([...categories, data])
    setNewCatNom(''); setNewCatColor(PALETTE_CATS[0]); setNewCatLogo(''); setShowCatForm(false)
  }

  async function handleLogoChangeGroupe(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setNewGroupeLogoFile(file)
    setNewGroupeLogoPreview(previewUrl)
    setExtractingColors(true)
    const colors = await extractColorsFromImage(file, 2)
    if (colors[0]) setNewGroupeCouleur(colors[0])
    if (colors[1]) setNewGroupeCouleur2(colors[1])
    setExtractingColors(false)
    e.target.value = ''
  }

  function handleLogoColorPickGroupe(e) {
    if (!pickingFor || !logoPickRef.current) return
    const img = logoPickRef.current
    const rect = img.getBoundingClientRect()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || rect.width
    canvas.height = img.naturalHeight || rect.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const px = Math.round((e.clientX - rect.left) * canvas.width / rect.width)
    const py = Math.round((e.clientY - rect.top) * canvas.height / rect.height)
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
      .insert([{ nom: newGroupeNom.trim(), couleur: newGroupeCouleur || null, couleur_secondaire: newGroupeCouleur2 || null, logo_url: logoUrl, monclubhouse_url: newGroupeUrl.trim() || null }]).select().single()
    if (error) { alert(error.message); setUploadingLogo(false); return }
    setGroupes([...groupes, data])
    setNewGroupeNom(''); setNewGroupeLogoFile(null); setNewGroupeLogoPreview(null)
    setNewGroupeCouleur(''); setNewGroupeCouleur2(''); setPickingFor(null); setNewGroupeUrl('')
    setShowGroupeForm(false); setUploadingLogo(false)
  }

  async function supprimerCategorie(catId) {
    if (!window.confirm('Supprimer cette catégorie ?')) return
    const { error } = await supabase.from('categories').delete().eq('id', catId)
    if (error) { alert(error.message); return }
    setCategories(categories.filter(c => c.id !== catId))
    if (activeCat === catId) setActiveCat(null)
  }

  async function toggleActif(clientId, actuel) {
    const { error } = await supabase.from('clients').update({ actif: !actuel }).eq('id', clientId)
    if (error) { alert(error.message); return }
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, actif: !actuel } : c))
  }

  // Séparation actifs / inactifs (hors groupes)
  const individuels = clients.filter(c => !groupMemberIds.has(c.id))
  const actifs      = individuels.filter(c => c.actif !== false)
  const inactifs    = individuels.filter(c => c.actif === false)

  // Stats actifs uniquement
  const nbCoach  = actifs.filter(c => c.offre === 'coaching').length
  const nbPrepa  = actifs.filter(c => c.offre === 'preparation_physique').length
  const nbEssai  = actifs.filter(c => c.offre === 'essai').length
  const nbGratuit= actifs.filter(c => c.offre === 'gratuit' || !c.offre).length

  const filtered = actifs.filter(c => {
    const matchSearch = `${c.prenom} ${c.nom}`.toLowerCase().includes(search.toLowerCase())
    const matchCat    = activeCat === null ? true : c.categorie_id === activeCat
    const matchOffre  = activeOffre === 'tous' ? true : c.offre === activeOffre
    return matchSearch && matchCat && matchOffre
  })

  if (loading) return <div style={S.loading}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>

  return (
    <div style={S.page}>
      {/* En-tête */}
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.pageTitle}>Mes clients</h1>
          <p style={S.pageSubtitle}>{actifs.length} actif{actifs.length > 1 ? 's' : ''}{inactifs.length > 0 ? ` · ${inactifs.length} inactif${inactifs.length > 1 ? 's' : ''}` : ''}</p>
        </div>
        <button onClick={() => navigate('/nouveau-client')} style={S.btnPrimary}>+ Nouveau client</button>
      </div>

      {/* Recherche */}
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>🔍</span>
        <input type="text" placeholder="Rechercher un client..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.7rem 0.875rem 0.7rem 2.5rem', border: '1.5px solid #e5e7eb', borderRadius: '12px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', background: 'white' }}
        />
      </div>

      {/* Filtres par offre */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        {FILTRES_OFFRE.map(f => {
          const active = activeOffre === f.key
          const o = OFFRES[f.key]
          return (
            <button key={f.key} onClick={() => setActiveOffre(f.key)} style={{
              padding: '0.35rem 0.875rem', borderRadius: 999, fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', border: '1.5px solid',
              borderColor: active ? (o?.color || '#333') : '#e5e7eb',
              background: active ? (o?.bg || '#333') : 'white',
              color: active ? (o?.color || '#fff') : '#6b7280',
            }}>
              {f.label}
              {f.key !== 'tous' && <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>
                {f.key === 'coaching' ? nbCoach : f.key === 'preparation_physique' ? nbPrepa : f.key === 'essai' ? nbEssai : nbGratuit}
              </span>}
            </button>
          )
        })}
      </div>

      {/* Filtres catégories */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <button onClick={() => setActiveCat(null)}
          style={{ ...S.catTab, background: activeCat === null ? '#333333' : 'white', color: activeCat === null ? '#e4f816' : '#6b7280', border: activeCat === null ? 'none' : '1.5px solid #e5e7eb' }}>
          Toutes catégories
        </button>
        {categories.map(cat => (
          <button key={cat.id} onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
            style={{ ...S.catTab, background: activeCat === cat.id ? cat.couleur : 'white', color: activeCat === cat.id ? 'white' : '#374151', border: activeCat === cat.id ? 'none' : `1.5px solid ${cat.couleur}`, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeCat === cat.id ? 'rgba(255,255,255,0.7)' : cat.couleur, display: 'inline-block', flexShrink: 0 }} />
            {cat.nom}
            <span onClick={e => { e.stopPropagation(); supprimerCategorie(cat.id) }} style={{ marginLeft: '0.15rem', opacity: 0.5, fontSize: '0.7rem', cursor: 'pointer' }}>✕</span>
          </button>
        ))}
        {showCatForm ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <input autoFocus value={newCatNom} onChange={e => setNewCatNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouterCategorie()} placeholder="Nom du club..."
              style={{ padding: '0.35rem 0.65rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', width: 130 }} />
            <input value={newCatLogo} onChange={e => setNewCatLogo(e.target.value)} placeholder="URL logo (optionnel)"
              style={{ padding: '0.35rem 0.65rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', width: 170 }} />
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {PALETTE_CATS.map(c => (
                <button key={c} onClick={() => setNewCatColor(c)}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: newCatColor === c ? '2.5px solid #333333' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
            <button onClick={ajouterCategorie} style={{ ...S.btnPrimary, padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderRadius: '8px' }}>OK</button>
            <button onClick={() => setShowCatForm(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowCatForm(true)} style={{ ...S.catTab, background: 'white', color: '#9ca3af', border: '1.5px dashed #d1d5db' }}>+ Catégorie</button>
        )}
      </div>

      {/* ── Groupes ── */}
      {groupes.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={S.listHeader}>GROUPES</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {groupes.map(g => (
              <div key={g.id} style={{ background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', border: `1.5px solid ${g.couleur}22` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', cursor: 'pointer', borderLeft: `4px solid ${g.couleur}` }}
                  onClick={() => navigate(`/groupe/${g.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    {g.logo_url
                      ? <img src={g.logo_url} alt={g.nom} style={{ width: 38, height: 38, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }} />
                      : <div style={{ width: 38, height: 38, borderRadius: 10, background: g.couleur + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>🏆</div>}
                    <div>
                      <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: '#1a1a1a' }}>{g.nom}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>Groupe</p>
                    </div>
                  </div>
                  <span style={S.chevron}>›</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton + Nouveau groupe */}
      <div style={{ marginBottom: '1.5rem' }}>
        {showGroupeForm ? (
          <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ margin: 0, fontWeight: '800', color: '#1a1a1a', fontSize: '0.95rem' }}>Nouveau groupe</p>
            <input autoFocus value={newGroupeNom} onChange={e => setNewGroupeNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && creerGroupe()}
              placeholder="Nom du groupe..." style={{ padding: '0.65rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none' }} />
            {/* Logo */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', background: '#f3f4f6', borderRadius: 9, padding: '0.45rem 0.85rem', border: '1.5px solid #e5e7eb', alignSelf: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 7, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: 'white' }}>
                {newGroupeLogoPreview ? <img src={newGroupeLogoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '0.9rem' }}>📂</span>}
              </div>
              <span style={{ fontSize: '0.82rem', color: newGroupeLogoFile ? '#374151' : '#9ca3af', fontWeight: '600' }}>
                {extractingColors ? '⏳ Analyse...' : newGroupeLogoFile ? newGroupeLogoFile.name : 'Choisir un logo...'}
              </span>
              <input type="file" accept="image/*" onChange={handleLogoChangeGroupe} style={{ display: 'none' }} />
            </label>
            {/* Pipette logo */}
            {newGroupeLogoPreview && (
              <div style={{ background: pickingFor ? '#fffbeb' : '#f9fafb', borderRadius: 10, padding: '0.6rem', border: `1.5px solid ${pickingFor ? '#f59e0b' : '#e5e7eb'}` }}>
                {pickingFor && <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: '700', color: '#d97706', textAlign: 'center' }}>🎨 Cliquez sur le logo pour choisir la couleur {pickingFor === 'primary' ? 'principale' : 'secondaire'}</p>}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <img ref={logoPickRef} src={newGroupeLogoPreview} alt="logo" onClick={pickingFor ? handleLogoColorPickGroupe : undefined} crossOrigin="anonymous"
                    style={{ height: pickingFor ? 90 : 48, maxWidth: '100%', objectFit: 'contain', borderRadius: 7, cursor: pickingFor ? 'crosshair' : 'default', outline: pickingFor ? '2px solid #f59e0b' : 'none' }} />
                </div>
                {pickingFor && <button onClick={() => setPickingFor(null)} style={{ display: 'block', margin: '0.4rem auto 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#9ca3af' }}>Annuler</button>}
              </div>
            )}
            {/* Couleurs */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {newGroupeCouleur ? (
                  <>
                    <input type="color" value={newGroupeCouleur} onChange={e => setNewGroupeCouleur(e.target.value)} style={{ width: 30, height: 26, border: '1.5px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', padding: '2px', background: 'white' }} />
                    <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: '700' }}>Principale</span>
                    <button onClick={() => setNewGroupeCouleur('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', padding: 0 }}>✕</button>
                  </>
                ) : (
                  <button onClick={() => setNewGroupeCouleur('#6366f1')} style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: 7, padding: '0.2rem 0.65rem', fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer', fontWeight: '600' }}>+ Couleur principale</button>
                )}
                {newGroupeLogoPreview && newGroupeCouleur && (
                  <button onClick={() => setPickingFor(pickingFor === 'primary' ? null : 'primary')} style={{ background: pickingFor === 'primary' ? '#fef3c7' : '#f3f4f6', border: `1.5px solid ${pickingFor === 'primary' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', padding: '2px 6px', fontSize: '0.82rem' }}>🎨</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {newGroupeCouleur2 ? (
                  <>
                    <input type="color" value={newGroupeCouleur2} onChange={e => setNewGroupeCouleur2(e.target.value)} style={{ width: 30, height: 26, border: '1.5px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', padding: '2px', background: 'white' }} />
                    <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: '700' }}>Secondaire</span>
                    <button onClick={() => setNewGroupeCouleur2('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', padding: 0 }}>✕</button>
                  </>
                ) : (
                  <button onClick={() => setNewGroupeCouleur2('#e5e7eb')} style={{ background: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: 7, padding: '0.2rem 0.65rem', fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer', fontWeight: '600' }}>+ Couleur secondaire</button>
                )}
                {newGroupeLogoPreview && newGroupeCouleur2 && (
                  <button onClick={() => setPickingFor(pickingFor === 'secondary' ? null : 'secondary')} style={{ background: pickingFor === 'secondary' ? '#fef3c7' : '#f3f4f6', border: `1.5px solid ${pickingFor === 'secondary' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 7, cursor: 'pointer', padding: '2px 6px', fontSize: '0.82rem' }}>🎨</button>
                )}
              </div>
            </div>
            {/* Lien classement */}
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.3rem' }}>
                Lien monclubhouse.ffr.fr <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optionnel)</span>
              </label>
              <input value={newGroupeUrl} onChange={e => setNewGroupeUrl(e.target.value)}
                placeholder="https://monclubhouse.ffr.fr/clubs/..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.78rem', outline: 'none', color: '#374151' }} />
              {newGroupeUrl && !newGroupeUrl.includes('monclubhouse.ffr.fr') && (
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: '#ef4444' }}>⚠️ Le lien doit provenir de monclubhouse.ffr.fr</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={creerGroupe} disabled={uploadingLogo || extractingColors} style={{ ...S.btnPrimary, flex: 1, opacity: (uploadingLogo || extractingColors) ? 0.6 : 1 }}>
                {uploadingLogo ? 'Envoi...' : extractingColors ? 'Analyse...' : 'Créer'}
              </button>
              <button onClick={() => setShowGroupeForm(false)} style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.65rem 1rem', cursor: 'pointer', color: '#6b7280', fontWeight: '600' }}>Annuler</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowGroupeForm(true)}
            style={{ width: '100%', background: 'white', border: '1.5px dashed #d1d5db', borderRadius: 14, padding: '0.85rem', fontSize: '0.875rem', fontWeight: '700', color: '#6b7280', cursor: 'pointer' }}>
            🏆 Nouveau groupe
          </button>
        )}
      </div>

      {/* ── Clients actifs ── */}
      <div style={S.listCard}>
        <p style={S.listHeader}>CLIENTS ACTIFS — {filtered.length}</p>
        {filtered.length === 0 ? (
          <p style={{ color: '#9ca3af', padding: '1.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
            {search || activeCat || activeOffre !== 'tous' ? 'Aucun client pour ce filtre.' : "Aucun client pour l'instant."}
          </p>
        ) : (
          filtered.map((client, i) => <ClientRow key={client.id} client={client} i={i} navigate={navigate} onToggleActif={toggleActif} actif={true} />)
        )}
      </div>

      {/* ── Clients inactifs ── */}
      {inactifs.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <button onClick={() => setShowInactifs(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem 0', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              CLIENTS INACTIFS — {inactifs.length}
            </span>
            <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>{showInactifs ? '▲' : '▼'}</span>
          </button>
          {showInactifs && (
            <div style={{ ...S.listCard, opacity: 0.75 }}>
              {inactifs.map((client, i) => <ClientRow key={client.id} client={client} i={i} navigate={navigate} onToggleActif={toggleActif} actif={false} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, i, navigate, onToggleActif, actif }) {
  const av  = getAvatar(client.prenom, client.nom)
  const sub = getSubInfo(client.date_fin)
  const cat = client.categories
  return (
    <div key={client.id} style={{ ...S.listRow, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
      {/* Cliquable → fiche */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, cursor: 'pointer' }}
        onClick={() => navigate(`/client/${client.id}`)}>
        <div style={{ position: 'relative' }}>
          {client.avatar_url
            ? <img src={client.avatar_url} alt={client.prenom} style={{ ...S.avatar, objectFit: 'cover' }} />
            : <div style={{ ...S.avatar, background: av.bg, color: av.text }}>{av.initiales}</div>}
          {cat && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: cat.couleur, border: '2px solid white' }} />}
        </div>
        <div>
          <p style={{ ...S.clientName, color: actif ? '#333333' : '#9ca3af' }}>{client.prenom} {client.nom}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {client.objectif && <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>{client.objectif}</p>}
            {cat && <span style={{ fontSize: '0.7rem', color: cat.couleur, fontWeight: '700' }}>· {cat.nom}</span>}
          </div>
        </div>
      </div>

      {/* Badges + action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {(() => {
          const w = client.wellness_today
          if (!w) return null
          const avg = (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4
          const alert = avg <= 2
          return (
            <span style={{ background: alert ? '#fef2f2' : '#f0fdf4', color: alert ? '#dc2626' : '#16a34a', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '700' }}>
              {alert ? '⚠ ' : '✓ '}{avg.toFixed(1)}/4
            </span>
          )
        })()}
        {sub && <span style={{ background: sub.bg, color: sub.color, padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '700' }}>{sub.label}</span>}
        <span style={{ ...S.badge, ...offreBadge(client.offre) }}>{offreLabel(client.offre)}</span>
        <button
          onClick={e => { e.stopPropagation(); onToggleActif(client.id, actif) }}
          title={actif ? 'Archiver ce client' : 'Réactiver ce client'}
          style={{ background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', color: actif ? '#9ca3af' : '#16a34a', fontWeight: '700', whiteSpace: 'nowrap' }}>
          {actif ? '📦 Archiver' : '↩ Réactiver'}
        </button>
        <span style={S.chevron} onClick={() => navigate(`/client/${client.id}`)}>›</span>
      </div>
    </div>
  )
}

const S = {
  loading:     { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page:        { padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  pageTitle:   { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  pageSubtitle:{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  btnPrimary:  { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '12px', padding: '0.7rem 1.25rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  catTab:      { padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  listCard:    { background: 'white', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  listHeader:  { fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.1em', padding: '1rem 1.5rem 0.5rem', margin: 0 },
  listRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem' },
  avatar:      { width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.875rem', flexShrink: 0 },
  clientName:  { fontWeight: '700', fontSize: '0.95rem', margin: '0 0 0.15rem' },
  badge:       { padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700', whiteSpace: 'nowrap' },
  chevron:     { color: '#d1d5db', fontSize: '1.25rem', cursor: 'pointer' },
}
