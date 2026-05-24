import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'

const OFFRES = {
  essai:               'Essai',
  preparation_physique:'Prépa physique',
  coaching:            'Coaching',
}

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

export default function ProfilClient() {
  const navigate  = useNavigate()
  const fadeStyle = usePageFade()
  const fileRef   = useRef()
  const imgRef    = useRef()

  const [client,       setClient]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [avatarUrl,    setAvatarUrl]    = useState(null)
  const [uploading,    setUploading]    = useState(false)
  const [savingNutri,  setSavingNutri]  = useState(false)
  const [savedMsg,     setSavedMsg]     = useState(false)

  // Recadrage photo
  const [cropSrc,       setCropSrc]       = useState(null)
  const [crop,          setCrop]          = useState()
  const [completedCrop, setCompletedCrop] = useState(null)
  const [cropping,      setCropping]      = useState(false)

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

      // Profil nutritionnel
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

  // Ouvre le recadreur (ne uploade pas encore)
  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file || !client) return
    e.target.value = ''  // reset pour pouvoir resélectionner le même fichier
    const reader = new FileReader()
    reader.addEventListener('load', () => setCropSrc(reader.result?.toString() || ''))
    reader.readAsDataURL(file)
  }

  // Initialise le crop centré au chargement de l'image
  function onImageLoad(e) {
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget
    const c = centerCrop(
      makeAspectCrop({ unit: '%', width: 85 }, 1, width, height),
      width, height
    )
    setCrop(c)
  }

  // Extrait le carré recadré via canvas → Blob JPEG
  function getCroppedBlob() {
    const image = imgRef.current
    if (!image || !completedCrop) return Promise.resolve(null)
    const canvas = document.createElement('canvas')
    const SIZE = 400
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0, 0, SIZE, SIZE
    )
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  }

  // Confirmer le recadrage → upload
  async function handleCropConfirm() {
    if (!completedCrop || !client) return
    setCropping(true)
    try {
      const blob = await getCroppedBlob()
      if (!blob) return
      const path = `${client.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('profile-photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('clients').update({ avatar_url: url }).eq('id', client.id)
      setAvatarUrl(url)
      setCropSrc(null)
      setCompletedCrop(null)
      setCrop(undefined)
    } catch (err) {
      console.error('Upload avatar recadré:', err)
    } finally {
      setCropping(false)
    }
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
    <div style={{ ...S.page, ...fadeStyle }}>

      {/* ── Modal de recadrage ─────────────────────────────────────────────── */}
      {cropSrc && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: '#000',
          display: 'flex', flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          {/* Barre haute */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px',
            paddingTop: 'max(16px, env(safe-area-inset-top))',
            flexShrink: 0,
          }}>
            <button
              onClick={() => { setCropSrc(null); setCompletedCrop(null); setCrop(undefined) }}
              style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Annuler
            </button>
            <span style={{ color: 'white', fontWeight: 800, fontSize: '0.95rem' }}>Recadrer la photo</span>
            <button
              onClick={handleCropConfirm}
              disabled={!completedCrop || cropping}
              style={{
                background: completedCrop && !cropping ? '#e4f816' : 'rgba(255,255,255,0.2)',
                color: '#111', border: 'none', borderRadius: 10,
                padding: '8px 16px', fontWeight: 800, fontSize: '0.88rem',
                cursor: completedCrop && !cropping ? 'pointer' : 'default',
                transition: 'background 0.2s',
              }}
            >
              {cropping ? '…' : 'Confirmer'}
            </button>
          </div>

          {/* Zone de recadrage */}
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', padding: '0 0 8px',
          }}>
            <ReactCrop
              crop={crop}
              onChange={(_, pct) => setCrop(pct)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
              style={{ maxHeight: '68vh', maxWidth: '100%' }}
            >
              <img
                ref={imgRef}
                src={cropSrc}
                alt="Recadrage"
                onLoad={onImageLoad}
                style={{ maxHeight: '68vh', maxWidth: '100%', display: 'block' }}
              />
            </ReactCrop>
          </div>

          {/* Hint */}
          <p style={{
            color: 'rgba(255,255,255,0.35)', textAlign: 'center',
            fontSize: '0.72rem', padding: '8px 20px',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            flexShrink: 0, margin: 0,
          }}>
            Glisse pour repositionner · Pincer pour zoomer
          </p>
        </div>
      )}

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

      {/* Infos */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>Informations</h2>
        <div style={S.infoRow}>
          <span style={S.infoLabel}>Nom</span>
          <span style={S.infoVal}>{client?.prenom} {client?.nom}</span>
        </div>
        <div style={S.infoRow}>
          <span style={S.infoLabel}>Email</span>
          <span style={S.infoVal}>{client?.email || '—'}</span>
        </div>
        <div style={S.infoRow}>
          <span style={S.infoLabel}>Offre</span>
          <span style={S.infoVal}>{OFFRES[client?.offre] || client?.offre || '—'}</span>
        </div>
        {client?.objectif && (
          <div style={{ ...S.infoRow, borderBottom: 'none' }}>
            <span style={S.infoLabel}>Objectif</span>
            <span style={{ ...S.infoVal, fontStyle: 'italic', color: '#6b7280' }}>"{client.objectif}"</span>
          </div>
        )}
      </div>

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
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{ fontSize: '1rem', lineHeight: 1, position: 'relative', top: '-1px' }}>{s === 'homme' ? '♂' : '♀'}</span>
                <span style={{ lineHeight: 1 }}>{s === 'homme' ? 'Homme' : 'Femme'}</span>
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
