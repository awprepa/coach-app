import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import { compressImage } from '../lib/compressImage'
import { isoLocal } from '../utils/dates'
import ComparaisonPhotos from './ComparaisonPhotos'

// Poses : comparer une face avec une face. « Toutes » reste possible pour
// balayer une date, mais le filtre par pose est ce qui rend la comparaison juste.
const POSES = [
  { v: 'face',   l: 'De face' },
  { v: 'profil', l: 'De profil' },
  { v: 'dos',    l: 'De dos' },
]
const POSE_LABEL = { face: 'Face', profil: 'Profil', dos: 'Dos' }
const POSE_ORDER = { face: 0, profil: 1, dos: 2 }

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
  const [addDate, setAddDate]   = useState(isoLocal())
  const [uploading, setUploading] = useState(false)
  const [compare, setCompare]   = useState([])     // ids sélectionnés pour comparaison (max 2)
  const [actif, setActif]       = useState(1)      // photo comparée (0 ou 1) remplacée au prochain clic dans la grille
  const [filtre, setFiltre]     = useState('')     // '' = toutes | face | profil | dos
  const [addPose, setAddPose]   = useState('face') // pose des photos ajoutées par le coach
  const [poseEdit, setPoseEdit] = useState(null)   // photo dont on choisit la pose
  const [dateEditVal, setDateEditVal] = useState('')

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

  // Deux photos comparées : une fois les deux choisies, un clic dans la grille
  // remplace la photo sélectionnée (cadre jaune) ; un clic sur une photo comparée la retire.
  function toggleCompare(id) {
    setCompare(prev => {
      if (prev.includes(id)) { setActif(1); return prev.filter(x => x !== id) }
      if (prev.length < 2) return [...prev, id]
      return prev.map((x, i) => i === actif ? id : x)
    })
  }

  // Attribuer / changer la pose d'une photo (utile pour les anciennes photos
  // envoyées avant que la pose existe).
  async function definirPose(photo, pose) {
    await supabase.from('evolution_photos').update({ pose }).eq('id', photo.id)
    setPhotos(prev => prev.map(x => x.id === photo.id ? { ...x, pose } : x))
    setPoseEdit(prev => prev ? { ...prev, pose } : prev)
  }

  async function definirDate(photo, date) {
    if (!date) return
    await supabase.from('evolution_photos').update({ date }).eq('id', photo.id)
    setPhotos(prev => prev.map(x => x.id === photo.id ? { ...x, date } : x))
    setPoseEdit(null)
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
          style={{ flex: '1 1 140px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', padding: '0.5rem 0.6rem', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontWeight: 600, background: 'white' }}>
          {DOW.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
        </select>
        <input type="date" value={addDate} max={isoLocal()} onChange={e => setAddDate(e.target.value)}
          style={{ flex: '1 1 130px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', padding: '0.5rem 0.6rem', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', background: 'white' }} />
        <select value={addPose} onChange={e => setAddPose(e.target.value)}
          style={{ flex: '1 1 110px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', padding: '0.5rem 0.6rem', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.8rem', fontWeight: 600, background: 'white' }}
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

      {/* Comparaison : s'affiche dès que deux photos sont choisies */}
      {cmpPhotos.length === 2 && (
        <ComparaisonPhotos clientId={clientId} photos={cmpPhotos} actif={actif} onActif={setActif} />
      )}

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Chargement…</p>
      ) : !photos.length ? (
        <p style={{ color: '#6b7280', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
          Aucune photo pour l'instant. Le client peut en envoyer depuis son profil, ou ajoute-en toi-même ci-dessus.
        </p>
      ) : (
        <>
          <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 0.6rem' }}>
            {cmpPhotos.length === 2 ? 'Clique une photo pour l\u2019afficher à la place de la photo sélectionnée (cadre jaune).' : cmpPhotos.length === 1 ? 'Choisis une deuxième photo pour comparer.' : 'Choisis deux photos pour les comparer.'} Touche l'étiquette de pose pour la définir.
          </p>
          {dates.map(d => (
            <div key={d} style={{ marginBottom: '0.9rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 800, color: '#374151', margin: '0 0 0.4rem', textTransform: 'capitalize' }}>{fmtDate(d)}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                {byDate[d].slice().sort((a, b) => (POSE_ORDER[a.pose] ?? 99) - (POSE_ORDER[b.pose] ?? 99)).map(p => {
                  const sel = compare.includes(p.id)
                  return (
                    <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', outline: sel ? '3px solid #333333' : 'none', outlineOffset: -3 }}>
                      {p.url
                        ? <img loading="lazy" src={p.url} alt="" onClick={() => toggleCompare(p.id)} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
                        : <div style={{ width: '100%', height: '100%', background: '#f3f4f6' }} />}
                      <button onClick={(e) => { e.stopPropagation(); setPoseEdit(p); setDateEditVal(p.date) }}
                        title="Définir la pose"
                        style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.62)', color: p.pose ? 'white' : '#fca5a5', fontSize: '0.55rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '.02em', border: 'none', cursor: 'pointer' }}>
                        {p.pose ? POSE_LABEL[p.pose].toUpperCase() : 'POSE ?'}
                      </button>
                      {sel && <span style={{ position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: 6, background: '#333333', color: '#e4f816', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{compare.indexOf(p.id) + 1}</span>}
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
            <p style={{ margin: '0 0 0.9rem', fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>Photo du {fmtDate(poseEdit.date)}</p>

            <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pose</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: '1.1rem' }}>
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

            <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date de la photo</p>
            <div style={{ display: 'flex', gap: 7 }}>
              <input type="date" value={dateEditVal} max={isoLocal()}
                onChange={e => setDateEditVal(e.target.value)}
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 11px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.85rem', background: 'white', fontFamily: 'inherit' }} />
              <button onClick={() => definirDate(poseEdit, dateEditVal)} disabled={dateEditVal === poseEdit.date}
                style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0 16px', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', opacity: dateEditVal === poseEdit.date ? 0.4 : 1, fontFamily: 'inherit' }}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
