import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { compressImage } from '../lib/compressImage'

// Poses : comparer une face avec une face. « Toutes » reste possible pour
// balayer une date, mais le filtre par pose est ce qui rend la comparaison juste.
const POSES = [
  { v: 'face',   l: 'De face' },
  { v: 'profil', l: 'De profil' },
  { v: 'dos',    l: 'De dos' },
]
const POSE_LABEL = { face: 'Face', profil: 'Profil', dos: 'Dos' }

const DOW = [
  { v: '', l: 'Aucun rappel' },
  { v: '1', l: 'Chaque lundi' },
  { v: '2', l: 'Chaque mardi' },
  { v: '3', l: 'Chaque mercredi' },
  { v: '4', l: 'Chaque jeudi' },
  { v: '5', l: 'Chaque vendredi' },
  { v: '6', l: 'Chaque samedi' },
  { v: '0', l: 'Chaque dimanche' },
]

export default function EvolutionPhotosCoach({ clientId }) {
  const fileRef = useRef(null)
  const [photos, setPhotos]     = useState([])     // [{ id, date, storage_path, uploaded_by, url }]
  const [loading, setLoading]   = useState(true)
  const [reminder, setReminder] = useState('')
  const [addDate, setAddDate]   = useState(new Date().toISOString().slice(0, 10))
  const [uploading, setUploading] = useState(false)
  const [compare, setCompare]   = useState([])     // ids sélectionnés pour comparaison (max 2)
  const [viewer, setViewer]     = useState(null)   // url plein écran
  const [filtre, setFiltre]     = useState('')     // '' = toutes | face | profil | dos
  const [addPose, setAddPose]   = useState('face') // pose des photos ajoutées par le coach
  const [poseEdit, setPoseEdit] = useState(null)   // photo dont on choisit la pose

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase.from('evolution_photos')
      .select('id, date, storage_path, uploaded_by, pose')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
    // URLs signées (bucket privé)
    const withUrls = await Promise.all((rows || []).map(async r => {
      const { data } = await supabase.storage.from('evolution-photos').createSignedUrl(r.storage_path, 3600)
      return { ...r, url: data?.signedUrl || null }
    }))
    setPhotos(withUrls)
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    load()
    supabase.from('clients').select('photo_reminder_dow').eq('id', clientId).maybeSingle()
      .then(({ data }) => setReminder(data?.photo_reminder_dow != null ? String(data.photo_reminder_dow) : ''))
  }, [clientId, load])

  async function saveReminder(v) {
    setReminder(v)
    await supabase.from('clients').update({ photo_reminder_dow: v === '' ? null : parseInt(v) }).eq('id', clientId)
  }

  async function onAdd(e) {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      try {
        const blob = await compressImage(file)
        const path = `${clientId}/${addDate}_${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage.from('evolution-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        await supabase.from('evolution_photos').insert({ client_id: clientId, date: addDate, storage_path: path, uploaded_by: 'coach', pose: addPose })
      } catch (err) { console.error('[coach add photo]', err?.message) }
    }
    setUploading(false)
    load()
  }

  async function supprimer(p) {
    if (!window.confirm('Supprimer cette photo ?')) return
    await supabase.storage.from('evolution-photos').remove([p.storage_path])
    await supabase.from('evolution_photos').delete().eq('id', p.id)
    setPhotos(prev => prev.filter(x => x.id !== p.id))
    setCompare(prev => prev.filter(id => id !== p.id))
  }

  // Jusqu'à 3 photos comparées ; au-delà on fait défiler (on retire la plus ancienne).
  function toggleCompare(id) {
    setCompare(prev => prev.includes(id) ? prev.filter(x => x !== id)
      : prev.length >= 3 ? [...prev.slice(1), id] : [...prev, id])
  }

  // Attribuer / changer la pose d'une photo (utile pour les anciennes photos
  // envoyées avant que la pose existe).
  async function definirPose(photo, pose) {
    setPoseEdit(null)
    await supabase.from('evolution_photos').update({ pose }).eq('id', photo.id)
    setPhotos(prev => prev.map(x => x.id === photo.id ? { ...x, pose } : x))
  }

  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  // Filtre par pose, puis groupement par date
  const visibles = filtre ? photos.filter(p => p.pose === filtre) : photos
  const compte = { face: 0, profil: 0, dos: 0 }
  photos.forEach(p => { if (compte[p.pose] != null) compte[p.pose]++ })
  const byDate = {}
  for (const p of visibles) { (byDate[p.date] ||= []).push(p) }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
  const cmpPhotos = compare.map(id => photos.find(p => p.id === id)).filter(Boolean)

  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '1rem', border: '1px solid #f3f4f6' }}>
      {/* Réglage rappel + ajout */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.9rem', alignItems: 'center' }}>
        <select value={reminder} onChange={e => saveReminder(e.target.value)}
          style={{ flex: 1, minWidth: 150, padding: '0.5rem 0.6rem', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontWeight: 600, background: 'white' }}>
          {DOW.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>
        <input type="date" value={addDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setAddDate(e.target.value)}
          style={{ padding: '0.5rem 0.6rem', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', background: 'white' }} />
        <select value={addPose} onChange={e => setAddPose(e.target.value)}
          style={{ padding: '0.5rem 0.6rem', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontWeight: 600, background: 'white' }}
          title="Pose des photos que tu ajoutes">
          {POSES.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onAdd} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 9, padding: '0.5rem 0.85rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {uploading ? '…' : '+ Ajouter'}
        </button>
      </div>

      {/* Filtre par pose */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: '0.85rem', flexWrap: 'wrap' }}>
          {[{ v: '', l: 'Toutes', n: photos.length },
            ...POSES.map(p => ({ v: p.v, l: POSE_LABEL[p.v], n: compte[p.v] }))].map(f => {
            const on = filtre === f.v
            return (
              <button key={f.v || 'all'} onClick={() => { setFiltre(f.v); setCompare([]) }}
                style={{
                  borderRadius: 999, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${on ? '#1a1a1a' : '#e5e7eb'}`,
                  background: on ? '#1a1a1a' : 'white', color: on ? 'white' : '#374151',
                  fontSize: '0.74rem', fontWeight: 700,
                }}>
                {f.l}<span style={{ opacity: 0.6, fontWeight: 600 }}> · {f.n}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Bandeau comparaison — photos en entier, non rognées */}
      {cmpPhotos.length >= 2 && (
        <div style={{ marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            {cmpPhotos.map(p => (
              <div key={p.id} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <img src={p.url} alt="" onClick={() => setViewer(p.url)}
                  style={{ width: '100%', maxHeight: '62vh', objectFit: 'contain', borderRadius: 10, cursor: 'zoom-in', background: '#f3f4f6' }} />
                <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0.3rem 0 0', fontWeight: 700 }}>{fmtDate(p.date)}</p>
                <p style={{ fontSize: '0.66rem', color: '#9ca3af', margin: 0, fontWeight: 700 }}>{POSE_LABEL[p.pose] || 'Pose ?'}</p>
              </div>
            ))}
          </div>
          {new Set(cmpPhotos.map(p => p.pose)).size > 1 && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', fontWeight: 700, color: '#b45309', background: '#fff8f0', border: '1px solid #f0c98a', borderRadius: 8, padding: '6px 9px' }}>
              Ces photos ne sont pas toutes prises sous le même angle — la comparaison peut induire en erreur.
            </p>
          )}
          <button onClick={() => setCompare([])} style={{ marginTop: '0.5rem', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: '0.2rem' }}>
            Fermer la comparaison
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Chargement…</p>
      ) : !photos.length ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
          Aucune photo pour l'instant. Le client peut en envoyer depuis son profil, ou ajoute-en toi-même ci-dessus.
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 0.6rem' }}>
            Touche jusqu'à 3 photos pour les comparer. Touche l'étiquette de pose pour la définir.
          </p>
          {dates.map(d => (
            <div key={d} style={{ marginBottom: '0.9rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#374151', margin: '0 0 0.4rem', textTransform: 'capitalize' }}>{fmtDate(d)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                {byDate[d].map(p => {
                  const sel = compare.includes(p.id)
                  return (
                    <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', outline: sel ? '3px solid #1d4ed8' : 'none' }}>
                      {p.url
                        ? <img src={p.url} alt="" onClick={() => toggleCompare(p.id)} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
                        : <div style={{ width: '100%', height: '100%', background: '#f3f4f6' }} />}
                      <button onClick={(e) => { e.stopPropagation(); setPoseEdit(p) }}
                        title="Définir la pose"
                        style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.62)', color: p.pose ? 'white' : '#fca5a5', fontSize: '0.55rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '.02em', border: 'none', cursor: 'pointer' }}>
                        {p.pose ? POSE_LABEL[p.pose].toUpperCase() : 'POSE ?'}
                      </button>
                      {p.uploaded_by === 'coach' && <span style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(0,0,0,0.62)', color: '#e4f816', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 4 }}>COACH</span>}
                      <button onClick={() => supprimer(p)} style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', fontSize: '0.65rem', cursor: 'pointer' }}>✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Choix de la pose d'une photo (existante ou nouvelle) */}
      {poseEdit && (
        <div onClick={() => setPoseEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: '1.1rem', width: '100%', maxWidth: 320 }}>
            <p style={{ margin: '0 0 0.2rem', fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>Pose de la photo</p>
            <p style={{ margin: '0 0 0.9rem', fontSize: '0.78rem', color: '#9ca3af' }}>{fmtDate(poseEdit.date)}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {POSES.map(po => {
                const on = poseEdit.pose === po.v
                return (
                  <button key={po.v} onClick={() => definirPose(poseEdit, po.v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 11, border: `1.5px solid ${on ? '#1a1a1a' : '#e5e7eb'}`, background: on ? '#1a1a1a' : 'white', color: on ? 'white' : '#374151', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {po.l}{on && ' ✓'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Visionneuse plein écran */}
      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <img src={viewer} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
