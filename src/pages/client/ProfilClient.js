import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'

const OFFRES = {
  essai:               'Essai',
  preparation_physique:'Prépa physique',
  coaching:            'Coaching',
  club:                'Club',
}

const POSTES_RUGBY = [
  '1 - Pilier gauche', '2 - Talonneur', '3 - Pilier droit',
  '4 - 2ème ligne', '5 - 2ème ligne',
  '6 - 3ème ligne aile', '7 - 3ème ligne aile', '8 - 3ème ligne centre',
  '9 - Demi de mêlée', '10 - Demi d\'ouverture',
  '11 - Ailier gauche', '12 - Centre', '13 - Centre',
  '14 - Ailier droit', '15 - Arrière',
]

const OBJECTIFS_NUTRI = [
  { value: 'perte_poids',    label: 'Perte de poids' },
  { value: 'prise_masse',    label: 'Prise de masse' },
  { value: 'recomposition',  label: 'Recomposition' },
  { value: 'performance',    label: 'Performance' },
  { value: 'sante',          label: 'Santé générale' },
]

const ACTIVITES = [
  { value: 'sedentaire',  label: 'Sédentaire (×1,2)' },
  { value: 'leger',       label: 'Légèrement actif (×1,375)' },
  { value: 'modere',      label: 'Modérément actif (×1,55)' },
  { value: 'actif',       label: 'Très actif (×1,725)' },
  { value: 'intensif',    label: 'Intensément actif (×1,9)' },
]

// ── Crop modal 100 % custom (sans react-image-crop) ──────────────────────────
// Correspond exactement au Design A du mockup :
//   • Image déplaçable par drag/touch
//   • Cercle fixe au centre avec overlay sombre
//   • Poignées bar blanches N/S/E/W
//   • Slider de zoom
function CustomCropModal({ src, onConfirm, onCancel, saving }) {
  const CIRCLE_R = 140                // rayon du cercle en px
  const [zoom,       setZoom]       = useState(1)
  const [offset,     setOffset]     = useState({ x: 0, y: 0 })
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [baseScale,  setBaseScale]  = useState(1)
  const imgRef   = useRef()
  const dragRef  = useRef({ active: false, lastX: 0, lastY: 0 })
  const areaRef  = useRef()

  // Quand l'image est chargée : on calcule baseScale pour couvrir le cercle
  function onImgLoad(e) {
    const nw = e.target.naturalWidth
    const nh = e.target.naturalHeight
    setImgNatural({ w: nw, h: nh })
    // L'image doit couvrir le diamètre du cercle sur son plus petit côté
    setBaseScale((CIRCLE_R * 2) / Math.min(nw, nh))
  }

  // Clamp l'offset pour ne pas sortir le cercle de l'image
  function clamp(x, y, z) {
    const scale = baseScale * z
    const hw = (imgNatural.w * scale) / 2
    const hh = (imgNatural.h * scale) / 2
    const mx = Math.max(0, hw - CIRCLE_R)
    const my = Math.max(0, hh - CIRCLE_R)
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) }
  }

  // Gestion touch (mobile)
  function onTouchStart(e) {
    if (e.touches.length === 1) {
      dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY }
    }
  }
  function onTouchMove(e) {
    if (!dragRef.current.active || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - dragRef.current.lastX
    const dy = e.touches[0].clientY - dragRef.current.lastY
    dragRef.current.lastX = e.touches[0].clientX
    dragRef.current.lastY = e.touches[0].clientY
    setOffset(prev => clamp(prev.x + dx, prev.y + dy, zoom))
  }
  function onTouchEnd() { dragRef.current.active = false }

  // Gestion souris (desktop)
  function onMouseDown(e) { dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY } }
  function onMouseMove(e) {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.lastX
    const dy = e.clientY - dragRef.current.lastY
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY
    setOffset(prev => clamp(prev.x + dx, prev.y + dy, zoom))
  }
  function onMouseUp() { dragRef.current.active = false }

  // Zoom slider
  function onZoomChange(newZ) {
    setZoom(newZ)
    setOffset(prev => clamp(prev.x, prev.y, newZ))
  }

  // Bloque le scroll de page lors du drag tactile
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const prevent = (e) => { if (dragRef.current.active) e.preventDefault() }
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  }, [])

  // Extraction canvas → blob JPEG
  async function handleConfirm() {
    if (!imgNatural.w || !imgRef.current) return
    const displayScale = baseScale * zoom
    const displayW     = imgNatural.w * displayScale
    const displayH     = imgNatural.h * displayScale
    // Position du coin haut-gauche du cercle, relative au coin haut-gauche de l'image (en px écran)
    const dx = -CIRCLE_R - offset.x + displayW / 2
    const dy = -CIRCLE_R - offset.y + displayH / 2
    // Conversion en pixels naturels de l'image
    const srcX    = dx / displayScale
    const srcY    = dy / displayScale
    const srcSize = (CIRCLE_R * 2) / displayScale

    const OUT = 400
    const canvas = document.createElement('canvas')
    canvas.width  = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')
    // Clip circulaire
    ctx.beginPath()
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(imgRef.current, srcX, srcY, srcSize, srcSize, 0, 0, OUT, OUT)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))
    onConfirm(blob)
  }

  const displayScale = baseScale * zoom
  const imgW = imgNatural.w > 0 ? imgNatural.w * displayScale : undefined
  const imgH = imgNatural.h > 0 ? imgNatural.h * displayScale : undefined

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, background: '#000',
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>
      {/* Barre haute — titre centré absolument pour ne pas être décalé par les boutons */}
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', paddingTop: 'max(16px, env(safe-area-inset-top))', flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)',
          fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', padding: 0, zIndex: 1,
        }}>Annuler</button>
        <span style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          color: 'white', fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap',
        }}>Photo de profil</span>
        <button onClick={handleConfirm} disabled={saving || !imgNatural.w} style={{
          background: !saving && imgNatural.w ? '#e4f816' : 'rgba(255,255,255,0.15)',
          color:      !saving && imgNatural.w ? '#000'    : 'rgba(255,255,255,0.4)',
          border: 'none', borderRadius: 99, padding: '8px 20px',
          fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', zIndex: 1,
        }}>{saving ? '…' : 'Valider'}</button>
      </div>

      {/* Zone de recadrage */}
      <div ref={areaRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'grab' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}   onMouseMove={onMouseMove}  onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

        {/* Image déplaçable */}
        <img ref={imgRef} src={src} alt="Recadrage" onLoad={onImgLoad} draggable={false}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: imgW, height: imgH,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            transformOrigin: 'center', display: 'block',
            pointerEvents: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          }} />

        {/* Overlay sombre + cercle + poignées */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ position: 'relative', width: CIRCLE_R * 2, height: CIRCLE_R * 2 }}>
            {/* Bordure du cercle + ombre qui assombrit l'extérieur */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.88)',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            }} />
            {/* Grille tiers 3×3 (clippée au cercle) */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.22)' }} />
              <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.22)' }} />
              <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.22)' }} />
              <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.22)' }} />
            </div>
            {/* Poignée N */}
            <div style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', width: 32, height: 5, background: 'white', borderRadius: 99, opacity: 0.9 }} />
            {/* Poignée S */}
            <div style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)', width: 32, height: 5, background: 'white', borderRadius: 99, opacity: 0.9 }} />
            {/* Poignée O */}
            <div style={{ position: 'absolute', left: -3, top: '50%', transform: 'translateY(-50%)', width: 5, height: 32, background: 'white', borderRadius: 99, opacity: 0.9 }} />
            {/* Poignée E */}
            <div style={{ position: 'absolute', right: -3, top: '50%', transform: 'translateY(-50%)', width: 5, height: 32, background: 'white', borderRadius: 99, opacity: 0.9 }} />
          </div>
        </div>
      </div>

      {/* Bas : hint + slider zoom */}
      <div style={{ padding: '16px 24px', paddingBottom: 'max(28px, env(safe-area-inset-bottom))', flexShrink: 0 }}>
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.7rem', margin: '0 0 14px', textAlign: 'center', lineHeight: 1.5 }}>
          Glisse pour repositionner · Curseur pour zoomer
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>⊖</span>
          <div style={{ flex: 1, position: 'relative', height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 99, background: '#e4f816', width: `${((zoom - 1) / 2) * 100}%` }} />
            <input type="range" min="1" max="3" step="0.05" value={zoom}
              onChange={e => onZoomChange(parseFloat(e.target.value))}
              style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', margin: 0, height: '100%' }} />
            <div style={{
              position: 'absolute', top: '50%', transform: 'translateY(-50%)',
              left: `calc(${((zoom - 1) / 2) * 100}% - 9px)`,
              width: 18, height: 18, borderRadius: '50%', background: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)', pointerEvents: 'none',
            }} />
          </div>
          <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>⊕</span>
        </div>
      </div>
    </div>
  )
}

// ── Page ProfilClient ─────────────────────────────────────────────────────────
export default function ProfilClient() {
  const navigate  = useNavigate()
  const fadeStyle = usePageFade()
  const fileRef   = useRef()

  const [client,       setClient]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [avatarUrl,    setAvatarUrl]    = useState(null)
  const [uploading,    setUploading]    = useState(false)
  const [savingNutri,  setSavingNutri]  = useState(false)
  const [savedMsg,     setSavedMsg]     = useState(false)
  const [savingInfo,   setSavingInfo]   = useState(false)
  const [savedInfoMsg, setSavedInfoMsg] = useState(false)

  // Recadrage photo
  const [cropSrc,  setCropSrc]  = useState(null)
  const [cropping, setCropping] = useState(false)

  // Infos personnelles éditables
  const [prenom,        setPrenom]        = useState('')
  const [nom,           setNom]           = useState('')
  const [telephone,     setTelephone]     = useState('')
  const [dateNaissance, setDateNaissance] = useState('')

  // Groupes et postes
  const [groupes, setGroupes] = useState([]) // [{ groupe_id, nom, poste }]
  const [postes,  setPostes]  = useState({}) // { groupe_id: poste }
  const [savingPoste, setSavingPoste] = useState(null)

  // Champs nutrition
  const [sexe,     setSexe]     = useState('')
  const [age,      setAge]      = useState('')
  const [taille,   setTaille]   = useState('')
  const [poids,    setPoids]    = useState('')
  const [objectif, setObjectif] = useState('')
  const [activite, setActivite] = useState('modere')

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) { navigate('/login'); return }

      let c = null
      const { data: byId } = await supabase.from('clients').select('*').eq('user_id', user.id).maybeSingle()
      if (byId?.id) c = byId
      else {
        const { data: byEmail } = await supabase.from('clients').select('*').eq('email', user.email).maybeSingle()
        c = byEmail
      }
      if (!c) { setLoading(false); return }
      setClient(c)
      if (c.avatar_url) setAvatarUrl(c.avatar_url)
      setPrenom(c.prenom || '')
      setNom(c.nom || '')
      setTelephone(c.telephone || '')
      setDateNaissance(c.date_naissance || '')

      // Groupes dont le client est membre
      const { data: membres } = await supabase
        .from('groupe_membres')
        .select('groupe_id, poste, groupes(nom)')
        .eq('client_id', c.id)
      if (membres?.length) {
        setGroupes(membres.map(m => ({ groupe_id: m.groupe_id, nom: m.groupes?.nom || '', poste: m.poste || '' })))
        const p = {}
        membres.forEach(m => { p[m.groupe_id] = m.poste || '' })
        setPostes(p)
      }

      const { data: nutri } = await supabase.from('nutrition_profile').select('*').eq('client_id', c.id).maybeSingle()
      if (nutri) {
        setSexe(nutri.sexe || '')
        setAge(String(nutri.age_ans || ''))
        setTaille(String(nutri.taille_cm || ''))
        setPoids(String(nutri.poids_kg || ''))
        setObjectif(nutri.objectif_physique || '')
        setActivite(nutri.niveau_activite || 'modere')
      }
      setLoading(false)
    }
    load()
  }, [navigate])

  // Ouvre le recadreur
  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file || !client) return
    e.target.value = ''
    const reader = new FileReader()
    reader.addEventListener('load', () => setCropSrc(reader.result?.toString() || ''))
    reader.readAsDataURL(file)
  }

  // Reçoit le blob depuis CustomCropModal → upload
  async function handleCropConfirm(blob) {
    if (!blob || !client) return
    setCropping(true)
    try {
      const path = `${client.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('profile-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('clients').update({ avatar_url: url }).eq('id', client.id)
      setAvatarUrl(url)
      setCropSrc(null)
    } catch (err) {
      console.error('Upload avatar:', err)
    } finally {
      setCropping(false)
    }
  }

  async function saveInfoPerso() {
    if (!client) return
    setSavingInfo(true)
    await supabase.from('clients').update({
      prenom: prenom.trim() || client.prenom,
      nom: nom.trim() || client.nom,
      telephone: telephone.trim() || null,
      date_naissance: dateNaissance || null,
    }).eq('id', client.id)
    setSavingInfo(false)
    setSavedInfoMsg(true)
    setTimeout(() => setSavedInfoMsg(false), 2000)
  }

  async function savePoste(groupeId) {
    if (!client) return
    setSavingPoste(groupeId)
    await supabase.from('groupe_membres')
      .update({ poste: postes[groupeId] || null })
      .eq('groupe_id', groupeId).eq('client_id', client.id)
    setSavingPoste(null)
  }

  async function saveNutriProfil() {
    if (!client) return
    setSavingNutri(true)
    try {
      await supabase.from('nutrition_profile').upsert({
        client_id:        client.id,
        sexe:             sexe || null,
        age_ans:          age ? parseInt(age) : null,
        taille_cm:        taille ? parseFloat(taille) : null,
        poids_kg:         poids ? parseFloat(poids) : null,
        objectif_physique: objectif || null,
        niveau_activite:  activite,
      }, { onConflict: 'client_id' })
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    } catch (err) {
      console.error('Save nutri profil:', err)
    } finally {
      setSavingNutri(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Chargement…</span>
    </div>
  )

  const initiales = `${client?.prenom?.[0] || ''}${client?.nom?.[0] || ''}`.toUpperCase()

  return (
    <>
    <div style={{ ...S.page, ...fadeStyle }}>

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>← Retour</button>
        <h1 style={S.headerTitle}>Mon profil</h1>
      </div>

      {/* Avatar */}
      <div style={S.avatarSection}>
        <div style={S.avatarWrap} onClick={() => fileRef.current?.click()}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" style={S.avatarImg} />
          ) : (
            <div style={S.avatarInitials}>{initiales}</div>
          )}
          <div style={S.avatarEditBadge}>
            {uploading ? '⏳' : '📷'}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
        <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: '6px 0 0', textAlign: 'center' }}>
          {uploading ? 'Envoi en cours…' : 'Appuie pour changer ta photo'}
        </p>
      </div>

      {/* Infos éditables */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>Mes informations</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>Prénom</label>
            <input value={prenom} onChange={e => setPrenom(e.target.value)} style={S.input} placeholder="Prénom" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>Nom</label>
            <input value={nom} onChange={e => setNom(e.target.value)} style={S.input} placeholder="Nom" />
          </div>
        </div>
        <div style={S.fieldGroup}>
          <label style={S.fieldLabel}>Téléphone</label>
          <input value={telephone} onChange={e => setTelephone(e.target.value)} style={S.input} placeholder="06 00 00 00 00" type="tel" />
        </div>
        <div style={S.fieldGroup}>
          <label style={S.fieldLabel}>Date de naissance</label>
          <input value={dateNaissance} onChange={e => setDateNaissance(e.target.value)} style={S.input} type="date" />
        </div>
        <div style={S.infoRow}>
          <span style={S.infoLabel}>Email</span>
          <span style={S.infoVal}>{client?.email || '—'}</span>
        </div>
        <div style={{ ...S.infoRow, borderBottom: 'none' }}>
          <span style={S.infoLabel}>Offre</span>
          <span style={S.infoVal}>{OFFRES[client?.offre] || client?.offre || '—'}</span>
        </div>
        <button onClick={saveInfoPerso} disabled={savingInfo} style={{ ...S.saveBtn, marginTop: 14 }}>
          {savedInfoMsg ? '✓ Sauvegardé !' : savingInfo ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      {/* Poste dans les groupes */}
      {groupes.length > 0 && (
        <div style={S.card}>
          <h2 style={S.cardTitle}>Mon poste</h2>
          {groupes.map(g => (
            <div key={g.groupe_id} style={{ marginBottom: 14 }}>
              <label style={S.fieldLabel}>{g.nom}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={postes[g.groupe_id] || ''}
                  onChange={e => setPostes(p => ({ ...p, [g.groupe_id]: e.target.value }))}
                  style={{ ...S.select, flex: 1 }}
                >
                  <option value="">— Choisir un poste —</option>
                  {POSTES_RUGBY.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  onClick={() => savePoste(g.groupe_id)}
                  disabled={savingPoste === g.groupe_id}
                  style={{ background: 'var(--chip-bg)', color: 'var(--chip-text)', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}
                >
                  {savingPoste === g.groupe_id ? '…' : 'OK'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Profil nutritionnel */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>Profil nutritionnel</h2>
        <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 14px', lineHeight: 1.5 }}>
          Ces données servent à calculer tes objectifs caloriques et macros.
        </p>

        {/* Sexe */}
        <div style={S.fieldGroup}>
          <label style={S.fieldLabel}>Sexe</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['homme', 'femme'].map(s => (
              <button key={s} onClick={() => setSexe(s)} style={{
                flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: sexe === s ? 'var(--chip-bg)' : '#f3f4f6',
                color: sexe === s ? 'var(--chip-text)' : '#6b7280',
                fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.15s',
                lineHeight: 1,
              }}>
                {s === 'homme' ? '♂︎ Homme' : '♀︎ Femme'}
              </button>
            ))}
          </div>
        </div>

        {/* Âge / Taille / Poids */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>Âge</label>
            <input value={age} onChange={e => setAge(e.target.value)} placeholder="ans" type="number" min="10" max="99" style={S.input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>Taille (cm)</label>
            <input value={taille} onChange={e => setTaille(e.target.value)} placeholder="cm" type="number" min="100" max="250" style={S.input} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLabel}>Poids (kg)</label>
            <input value={poids} onChange={e => setPoids(e.target.value)} placeholder="kg" type="number" min="30" max="300" style={S.input} />
          </div>
        </div>

        {/* Objectif physique */}
        <div style={S.fieldGroup}>
          <label style={S.fieldLabel}>Objectif</label>
          <select value={objectif} onChange={e => setObjectif(e.target.value)} style={S.select}>
            <option value="">— Choisir —</option>
            {OBJECTIFS_NUTRI.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Niveau d'activité */}
        <div style={S.fieldGroup}>
          <label style={S.fieldLabel}>Niveau d'activité</label>
          <select value={activite} onChange={e => setActivite(e.target.value)} style={S.select}>
            {ACTIVITES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        <button onClick={saveNutriProfil} disabled={savingNutri} style={S.saveBtn}>
          {savedMsg ? '✓ Sauvegardé !' : savingNutri ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      {/* Actions */}
      <div style={S.card}>
        <button onClick={handleLogout} style={S.logoutBtn}>
          Se déconnecter
        </button>
      </div>

      <div style={{ height: 100 }} />
      <ClientBottomNav />
    </div>

    {/* Modal recadrage — hors du div avec transform (position:fixed fonctionne) */}
    {cropSrc && (
      <CustomCropModal
        src={cropSrc}
        onConfirm={handleCropConfirm}
        onCancel={() => setCropSrc(null)}
        saving={cropping}
      />
    )}
    </>
  )
}

const S = {
  page: {
    background: '#f5f5f5',
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    background: 'var(--header-bg)',
    padding: '52px 20px 20px',
    borderLeft: '4px solid var(--accent-stripe)',
  },
  backBtn: {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
    fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer',
    padding: 0, marginBottom: 8, display: 'block',
  },
  headerTitle: {
    color: 'var(--accent-fg-dark)',
    fontWeight: 900, fontSize: '1.15rem', margin: 0,
  },
  avatarSection: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '24px 16px 8px',
  },
  avatarWrap: {
    position: 'relative', cursor: 'pointer',
    width: 88, height: 88,
  },
  avatarImg: {
    width: 88, height: 88, borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid var(--accent-stripe)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  },
  avatarInitials: {
    width: 88, height: 88, borderRadius: '50%',
    background: 'var(--chip-bg)', color: 'var(--chip-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: '1.6rem',
    border: '3px solid var(--accent-stripe)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: '50%',
    background: 'var(--accent-stripe)', color: '#111',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.75rem', border: '2px solid white',
  },
  card: {
    margin: '12px 16px',
    background: 'white',
    borderRadius: 16,
    padding: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardTitle: {
    fontSize: '0.82rem', fontWeight: 700, color: '#374151',
    margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  infoRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid #f3f4f6',
  },
  infoLabel: {
    fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600,
  },
  infoVal: {
    fontSize: '0.85rem', color: '#1a1a1a', fontWeight: 700,
    textAlign: 'right', maxWidth: '60%',
  },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: {
    display: 'block', fontSize: '0.75rem', fontWeight: 700,
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em',
    marginBottom: 6,
  },
  input: {
    width: '100%', padding: '9px 10px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: '0.9rem',
    background: '#f9fafb', boxSizing: 'border-box', color: '#1a1a1a',
    outline: 'none',
  },
  select: {
    width: '100%', padding: '9px 10px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: '0.85rem',
    background: '#f9fafb', color: '#1a1a1a', outline: 'none',
    appearance: 'auto',
  },
  saveBtn: {
    width: '100%', padding: '12px', borderRadius: 12,
    background: 'var(--chip-bg)', color: 'var(--chip-text)',
    border: 'none', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
    marginTop: 4, transition: 'opacity 0.15s',
  },
  logoutBtn: {
    width: '100%', padding: '12px', borderRadius: 12,
    background: '#fff', color: '#ef4444',
    border: '1.5px solid #fca5a5', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
  },
}
