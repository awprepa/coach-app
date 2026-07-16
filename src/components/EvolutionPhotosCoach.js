import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabase'

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

  const load = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase.from('evolution_photos')
      .select('id, date, storage_path, uploaded_by')
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
        const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        const path = `${clientId}/${addDate}_${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('evolution-photos').upload(path, file, { contentType: file.type || 'image/jpeg' })
        if (upErr) throw upErr
        await supabase.from('evolution_photos').insert({ client_id: clientId, date: addDate, storage_path: path, uploaded_by: 'coach' })
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

  function toggleCompare(id) {
    setCompare(prev => prev.includes(id) ? prev.filter(x => x !== id)
      : prev.length >= 2 ? [prev[1], id] : [...prev, id])
  }

  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  // Grouper par date
  const byDate = {}
  for (const p of photos) { (byDate[p.date] ||= []).push(p) }
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
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onAdd} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 9, padding: '0.5rem 0.85rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {uploading ? '…' : '+ Ajouter'}
        </button>
      </div>

      {/* Bandeau comparaison */}
      {cmpPhotos.length === 2 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: '0.9rem' }}>
          {cmpPhotos.map(p => (
            <div key={p.id} style={{ flex: 1, textAlign: 'center' }}>
              <img src={p.url} alt="" onClick={() => setViewer(p.url)} style={{ width: '100%', borderRadius: 10, cursor: 'zoom-in', maxHeight: 340, objectFit: 'cover' }} />
              <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0.3rem 0 0', fontWeight: 700 }}>{fmtDate(p.date)}</p>
            </div>
          ))}
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
            Touche 2 photos pour les comparer côte à côte.
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
                      {p.uploaded_by === 'coach' && <span style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(0,0,0,0.6)', color: '#e4f816', fontSize: '0.55rem', fontWeight: 800, padding: '1px 5px', borderRadius: 4 }}>COACH</span>}
                      <button onClick={() => supprimer(p)} style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', fontSize: '0.65rem', cursor: 'pointer' }}>✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
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
