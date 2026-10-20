import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { detecterCorps, FORMAT, styleRecadre } from '../utils/cadragePhoto'

// Comparaison de photos d'évolution, côté coach : photos recadrées
// automatiquement à la même échelle, et traits à poser pour comparer les
// silhouettes. Un trait « commun » apparaît au même endroit sur toutes les
// photos ; un trait « sur une photo » ne concerne qu'elle. Les traits sont
// enregistrés pour cet ensemble de photos.

const POSE_LABEL = { face: 'Face', profil: 'Profil', dos: 'Dos' }
const COULEUR = { commun: '#e4f816', photo: '#ff5a5f' }
const VB_L = 300, VB_H = VB_L / FORMAT // repère des traits dans le cadre (300 × 400)

function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ComparaisonPhotos({ clientId, photos, onClose }) {
  const cle = photos.map(p => p.id).sort().join('_')
  const [cadrages, setCadrages] = useState({})      // photoId -> {…} | null (pas de corps) | 'erreur'
  const [recadrer, setRecadrer] = useState(true)
  const [traits, setTraits] = useState([])          // { id, type: 'h'|'v'|'libre', photoId|null, x1,y1,x2,y2 }
  const [outil, setOutil] = useState('h')
  const [portee, setPortee] = useState('commun')
  const [selection, setSelection] = useState(null)
  const [etatSauvegarde, setEtatSauvegarde] = useState('')
  const dragRef = useRef(null)
  const chargeRef = useRef(false)
  const ignorerRef = useRef(false) // ne pas réenregistrer les traits qu'on vient de charger

  // Repérage du corps sur chaque photo
  useEffect(() => {
    let annule = false
    photos.forEach(async p => {
      try {
        const c = await detecterCorps(p.url)
        if (!annule) setCadrages(prev => ({ ...prev, [p.id]: c }))
      } catch (e) {
        console.error('[cadrage photo]', e)
        if (!annule) setCadrages(prev => ({ ...prev, [p.id]: 'erreur' }))
      }
    })
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])

  // Traits enregistrés pour ces photos
  useEffect(() => {
    supabase.from('photo_comparaison_traits').select('traits').eq('client_id', clientId).eq('cle', cle).maybeSingle()
      .then(({ data }) => { ignorerRef.current = true; setTraits(data?.traits || []); chargeRef.current = true })
  }, [clientId, cle])

  // Enregistrement automatique (après une courte pause)
  useEffect(() => {
    if (!chargeRef.current) return
    if (ignorerRef.current) { ignorerRef.current = false; return }
    setEtatSauvegarde('…')
    const t = setTimeout(async () => {
      const { error } = await supabase.from('photo_comparaison_traits')
        .upsert({ client_id: clientId, cle, traits, updated_at: new Date().toISOString() }, { onConflict: 'client_id,cle' })
      setEtatSauvegarde(error ? 'Traits non enregistrés' : 'Traits enregistrés')
    }, 600)
    return () => clearTimeout(t)
  }, [traits, clientId, cle])

  const supprimer = useCallback(id => { setTraits(prev => prev.filter(t => t.id !== id)); setSelection(null) }, [])

  useEffect(() => {
    const h = e => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') { if (selection) setSelection(null); else onClose() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) { e.preventDefault(); supprimer(selection) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [selection, supprimer, onClose])

  // ── Interactions sur un cadre ──
  function point(e, svg) {
    const r = svg.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(VB_L, (e.clientX - r.left) / r.width * VB_L)),
      y: Math.max(0, Math.min(VB_H, (e.clientY - r.top) / r.height * VB_H)),
    }
  }
  function onDown(e, photoId) {
    const svg = e.currentTarget
    svg.setPointerCapture?.(e.pointerId)
    const p = point(e, svg)
    const cible = e.target.closest('[data-trait]')
    if (cible) {
      const id = cible.getAttribute('data-trait'), bout = cible.getAttribute('data-bout')
      setSelection(id)
      dragRef.current = { mode: bout ? 'bout' : 'deplacer', id, bout, depart: p, base: traits.find(t => t.id === id) }
      return
    }
    setSelection(null)
    const photo = portee === 'photo' ? photoId : null
    if (outil === 'h') {
      const t = { id: uid(), type: 'h', photoId: photo, x1: 0, y1: p.y, x2: VB_L, y2: p.y }
      setTraits(prev => [...prev, t]); setSelection(t.id)
      dragRef.current = { mode: 'deplacer', id: t.id, depart: p, base: t }
    } else if (outil === 'v') {
      const t = { id: uid(), type: 'v', photoId: photo, x1: p.x, y1: 0, x2: p.x, y2: VB_H }
      setTraits(prev => [...prev, t]); setSelection(t.id)
      dragRef.current = { mode: 'deplacer', id: t.id, depart: p, base: t }
    } else {
      const t = { id: uid(), type: 'libre', photoId: photo, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
      setTraits(prev => [...prev, t]); setSelection(t.id)
      dragRef.current = { mode: 'bout', id: t.id, bout: '2', depart: p, base: t, nouveau: true }
    }
  }
  function onMove(e) {
    const d = dragRef.current
    if (!d) return
    const p = point(e, e.currentTarget)
    const dx = p.x - d.depart.x, dy = p.y - d.depart.y
    setTraits(prev => prev.map(t => {
      if (t.id !== d.id) return t
      const b = d.base
      if (d.mode === 'bout') return d.bout === '1' ? { ...t, x1: p.x, y1: p.y } : { ...t, x2: p.x, y2: p.y }
      if (b.type === 'h') return { ...t, y1: b.y1 + dy, y2: b.y2 + dy }
      if (b.type === 'v') return { ...t, x1: b.x1 + dx, x2: b.x2 + dx }
      return { ...t, x1: b.x1 + dx, y1: b.y1 + dy, x2: b.x2 + dx, y2: b.y2 + dy }
    }))
  }
  function onUp() {
    const d = dragRef.current
    dragRef.current = null
    // Trait libre trop court (simple clic) : on l'abandonne
    if (d?.nouveau) setTraits(prev => prev.filter(t => t.id !== d.id || Math.hypot(t.x2 - t.x1, t.y2 - t.y1) > 6))
  }

  const nbFaits = Object.keys(cadrages).length
  const echecs = photos.filter(p => cadrages[p.id] === null || cadrages[p.id] === 'erreur').length
  const posesDifferentes = new Set(photos.map(p => p.pose)).size > 1
  const largeurCadre = `min(${Math.floor(92 / photos.length)}vw, ${Math.floor(((window.innerHeight - 230) * FORMAT))}px)`

  return (
    <div style={S.overlay}>
      <div style={S.barre}>
        <span style={S.titre}>Comparaison</span>
        <div style={S.groupe}>
          {[['h', 'Trait horizontal'], ['v', 'Trait vertical'], ['libre', 'Trait libre']].map(([k, l]) => (
            <button key={k} onClick={() => setOutil(k)} style={{ ...S.btn, ...(outil === k ? S.btnOn : {}) }}>{l}</button>
          ))}
        </div>
        <div style={S.groupe}>
          <button onClick={() => setPortee('commun')} style={{ ...S.btn, ...(portee === 'commun' ? S.btnOn : {}) }}>
            <span style={{ ...S.pastille, background: COULEUR.commun }} />Commun aux photos
          </button>
          <button onClick={() => setPortee('photo')} style={{ ...S.btn, ...(portee === 'photo' ? S.btnOn : {}) }}>
            <span style={{ ...S.pastille, background: COULEUR.photo }} />Sur une seule photo
          </button>
        </div>
        <label style={S.check}>
          <input type="checkbox" checked={recadrer} onChange={e => setRecadrer(e.target.checked)} />
          Recadrage automatique
        </label>
        <div style={{ flex: 1 }} />
        {selection && <button onClick={() => supprimer(selection)} style={S.btnDanger}>Supprimer le trait</button>}
        {traits.length > 0 && <button onClick={() => { setTraits([]); setSelection(null) }} style={S.btn}>Effacer les traits</button>}
        <span style={S.etat}>{etatSauvegarde}</span>
        <button onClick={onClose} style={S.btnFermer}>Fermer</button>
      </div>

      <div style={S.aide}>
        {outil === 'libre' ? 'Fais glisser sur une photo pour tracer un trait.' : 'Clique sur une photo pour poser le trait, puis fais-le glisser pour l’ajuster.'}
        {' '}Clique sur un trait pour le sélectionner ; Suppr pour l'effacer.
        {recadrer && nbFaits < photos.length && ' Recadrage en cours…'}
        {recadrer && echecs > 0 && ` Corps non repéré sur ${echecs} photo${echecs > 1 ? 's' : ''} : affichée${echecs > 1 ? 's' : ''} sans recadrage.`}
        {posesDifferentes && ' Attention : ces photos ne sont pas toutes prises sous le même angle.'}
      </div>

      <div style={S.photos}>
        {photos.map(p => {
          const c = cadrages[p.id]
          const recadre = recadrer && c && c !== 'erreur'
          const visibles = traits.filter(t => !t.photoId || t.photoId === p.id)
          return (
            <div key={p.id} style={{ width: largeurCadre, flexShrink: 0 }}>
              <div style={{ ...S.cadre, aspectRatio: String(FORMAT) }}>
                <img src={p.url} alt="" draggable={false}
                  style={recadre ? styleRecadre(c) : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                <svg viewBox={`0 0 ${VB_L} ${VB_H}`} preserveAspectRatio="none" style={S.svg}
                  onPointerDown={e => onDown(e, p.id)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                  {visibles.map(t => {
                    const col = t.photoId ? COULEUR.photo : COULEUR.commun
                    const sel = selection === t.id
                    return (
                      <g key={t.id}>
                        <line data-trait={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} />
                        <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(0,0,0,.55)" strokeWidth={sel ? 5 : 4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                        <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={col} strokeWidth={sel ? 2.5 : 1.75} strokeDasharray={sel ? '6 4' : undefined} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                        {t.type === 'libre' && sel && ['1', '2'].map(b => (
                          <circle key={b} data-trait={t.id} data-bout={b} cx={b === '1' ? t.x1 : t.x2} cy={b === '1' ? t.y1 : t.y2} r="5"
                            fill={col} stroke="#000" strokeWidth="1" vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} />
                        ))}
                      </g>
                    )
                  })}
                </svg>
              </div>
              <p style={S.legende}>{fmtDate(p.date)} · {POSE_LABEL[p.pose] || 'Pose ?'}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1100, background: '#f2f2f2', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  barre: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#ffffff', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' },
  titre: { fontSize: 16, fontWeight: 800, color: '#1a1a1a', marginRight: 6 },
  groupe: { display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 9, padding: 3 },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#374151', fontSize: 13, fontWeight: 700, padding: '7px 11px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnOn: { background: '#333333', color: '#e4f816' },
  pastille: { width: 10, height: 10, borderRadius: 3, display: 'inline-block', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.25)' },
  check: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer' },
  btnDanger: { border: '1.5px solid #fecaca', background: 'white', color: '#dc2626', fontSize: 13, fontWeight: 700, padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  etat: { fontSize: 12.5, color: '#6b7280', fontWeight: 600, minWidth: 110, textAlign: 'right' },
  btnFermer: { background: '#333333', color: '#e4f816', border: 'none', fontSize: 13, fontWeight: 800, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  aide: { fontSize: 13, color: '#4b5563', padding: '8px 16px', lineHeight: 1.5 },
  photos: { flex: 1, minHeight: 0, display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'flex-start', padding: '4px 16px 16px', overflow: 'auto' },
  cadre: { position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 10, background: '#1a1a1a' },
  svg: { position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' },
  legende: { margin: '8px 0 0', fontSize: 13.5, fontWeight: 700, color: '#374151', textAlign: 'center' },
}
