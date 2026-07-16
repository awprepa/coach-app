import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'
import { compressImage } from '../../lib/compressImage'

const DOW = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export default function PhotosClient() {
  const navigate  = useNavigate()
  const fadeStyle = usePageFade()
  const fileRef   = useRef(null)
  const [client, setClient]   = useState(null)
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10))
  const [files, setFiles]     = useState([])       // File[]
  const [uploading, setUploading] = useState(false)
  const [done, setDone]       = useState(0)        // nb envoyées (message de succès)
  const [error, setError]     = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      let { data } = await supabase.from('clients').select('id, prenom, photo_reminder_dow').eq('user_id', user.id).maybeSingle()
      if (!data && user.email) {
        const r = await supabase.from('clients').select('id, prenom, photo_reminder_dow').eq('email', user.email).maybeSingle()
        data = r.data
      }
      setClient(data)
    }
    load()
  }, [])

  function onPick(e) {
    const picked = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    setFiles(prev => [...prev, ...picked])
    setDone(0); setError('')
    e.target.value = ''
  }
  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function envoyer() {
    if (!client || !files.length || uploading) return
    setUploading(true); setError('')
    let ok = 0
    for (const file of files) {
      try {
        const blob = await compressImage(file)
        const path = `${client.id}/${date}_${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage.from('evolution-photos')
          .upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        // Insert SANS .select() : le client n'a pas le droit de relire ses photos
        const { error: insErr } = await supabase.from('evolution_photos')
          .insert({ client_id: client.id, date, storage_path: path, uploaded_by: 'client' })
        if (insErr) throw insErr
        ok++
      } catch (e) {
        console.error('[PhotosClient upload]', e?.message)
      }
    }
    setUploading(false)
    setFiles([])
    setDone(ok)
    if (ok < files.length) setError(`${files.length - ok} photo(s) n'ont pas pu être envoyées. Réessaie.`)
  }

  const rappel = client?.photo_reminder_dow != null ? DOW[client.photo_reminder_dow] : null

  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.back}>‹</button>
        <h1 style={S.headerTitle}>Photos d'évolution</h1>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.body}>
        <div style={S.infoCard}>
          <p style={{ margin: 0, fontWeight: 700, color: '#1a1a1a', fontSize: '0.95rem' }}>Envoie tes photos à ton coach</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
            Elles servent à suivre ton évolution dans le temps. Elles sont <strong>privées</strong> et
            visibles uniquement par ton coach — tu ne les reverras pas ici après envoi.
          </p>
          {rappel && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 700 }}>
              Rappel : ton coach te demande tes photos chaque {rappel}.
            </p>
          )}
        </div>

        <label style={S.fieldLabel}>Date des photos</label>
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)}
          onChange={e => setDate(e.target.value)} style={S.dateInput} />

        <input ref={fileRef} type="file" accept="image/*" multiple
          onChange={onPick} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} style={S.pickBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
          </svg>
          Choisir des photos
        </button>

        {files.length > 0 && (
          <div style={{ marginTop: '0.9rem' }}>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 700, margin: '0 0 0.5rem' }}>
              {files.length} photo{files.length > 1 ? 's' : ''} prête{files.length > 1 ? 's' : ''} à envoyer
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
              {files.map((f, i) => (
                <div key={i} style={S.thumb}>
                  <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removeFile(i)} style={S.thumbX}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={envoyer} disabled={uploading} style={S.sendBtn}>
              {uploading ? 'Envoi en cours…' : `Envoyer ${files.length} photo${files.length > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {done > 0 && files.length === 0 && (
          <div style={S.successCard}>
            {done} photo{done > 1 ? 's' : ''} envoyée{done > 1 ? 's' : ''} à ton coach. Merci !
          </div>
        )}
        {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: '0.75rem' }}>{error}</p>}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:        { minHeight: '100dvh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 100 },
  header:      { height: 56, background: 'var(--header-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.75rem', position: 'sticky', top: 0, zIndex: 50 },
  back:        { background: 'none', border: 'none', color: 'white', fontSize: '1.8rem', cursor: 'pointer', width: 32, lineHeight: 1 },
  headerTitle: { color: 'white', fontWeight: 800, fontSize: '1rem', margin: 0 },
  body:        { padding: '1rem' },
  infoCard:    { background: 'white', borderRadius: 14, padding: '1rem 1.1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1.1rem' },
  fieldLabel:  { display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.35rem' },
  dateInput:   { width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.85rem', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.95rem', outline: 'none', background: 'white', marginBottom: '1rem', fontFamily: 'inherit' },
  pickBtn:     { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'white', color: '#374151', border: '2px dashed #c7d2fe', borderRadius: 14, padding: '0.95rem', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer' },
  thumb:       { position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: '#e5e7eb' },
  thumbX:      { position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sendBtn:     { width: '100%', marginTop: '1rem', background: '#1a1a1a', color: 'var(--accent)', border: 'none', borderRadius: 14, padding: '0.95rem', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer' },
  successCard: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '0.9rem 1rem', color: '#15803d', fontSize: '0.88rem', fontWeight: 700, marginTop: '1rem' },
}
