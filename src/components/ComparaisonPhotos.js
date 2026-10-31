import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

// Comparaison de deux photos d'évolution, côté coach, avec des mesures :
// on pose deux repères par mesure (ex. largeur des épaules) sur chaque photo.
// Chaque mesure est rapportée à une mesure de référence (ex. hanches) sur la
// même photo : la distance de prise de vue n'a donc pas d'effet.
// Les repères sont enregistrés par photo (réutilisés dans d'autres comparaisons),
// en fractions de la largeur / hauteur de l'image.

const POSE_LABEL = { face: 'Face', profil: 'Profil', dos: 'Dos' }
const PRESETS = ['Épaules', 'Taille', 'Hanches', 'Cuisses', 'Bras']
const COULEURS = ['#e4f816', '#38bdf8', '#fb923c', '#f472b6', '#a78bfa']
const couleur = nom => COULEURS[PRESETS.indexOf(nom)] || COULEURS[0]
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const fmt2 = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ComparaisonPhotos({ clientId, photos, actif, onActif }) {
  const [reperes, setReperes] = useState({})     // photoId -> { nom: [[x,y],[x,y]] }
  const [tailles, setTailles] = useState({})     // photoId -> { w, h } (taille réelle de l'image)
  const [ajoutees, setAjoutees] = useState([])   // mesures ajoutées pendant la séance
  const [active, setActive] = useState(null)
  const [reference, setReference] = useState(null)
  const [etat, setEtat] = useState('')
  const chargees = useRef(new Set())
  const aEnregistrer = useRef(new Set())
  const drag = useRef(null)

  // Repères déjà posés sur ces photos
  useEffect(() => {
    const ids = photos.map(p => p.id).filter(id => !chargees.current.has(id))
    if (!ids.length) return
    ids.forEach(id => chargees.current.add(id))
    supabase.from('photo_comparaison_traits').select('cle, traits').eq('client_id', clientId).in('cle', ids.map(id => `mesures_${id}`))
      .then(({ data }) => {
        const r = {}
        for (const row of data || []) if (row.traits && !Array.isArray(row.traits)) r[row.cle.slice(8)] = row.traits
        setReperes(prev => ({ ...r, ...prev }))
      })
  }, [photos, clientId])

  // Enregistrement automatique des photos modifiées (après une courte pause)
  useEffect(() => {
    if (!aEnregistrer.current.size) return
    setEtat('…')
    const t = setTimeout(async () => {
      const ids = [...aEnregistrer.current]
      aEnregistrer.current.clear()
      const { error } = await supabase.from('photo_comparaison_traits').upsert(
        ids.map(id => ({ client_id: clientId, cle: `mesures_${id}`, traits: reperes[id] || {}, updated_at: new Date().toISOString() })),
        { onConflict: 'client_id,cle' })
      setEtat(error ? 'Mesures non enregistrées' : 'Mesures enregistrées')
    }, 600)
    return () => clearTimeout(t)
  }, [reperes, clientId])

  function modifier(photoId, nom, pts) {
    aEnregistrer.current.add(photoId)
    setReperes(prev => {
      const r = { ...(prev[photoId] || {}) }
      if (pts) r[nom] = pts; else delete r[nom]
      return { ...prev, [photoId]: r }
    })
  }

  // Mesures connues : celles déjà posées sur ces photos + celles ajoutées
  const noms = [...new Set([...photos.flatMap(p => Object.keys(reperes[p.id] || {})), ...ajoutees])]
    .sort((a, b) => (PRESETS.indexOf(a) + 1 || 99) - (PRESETS.indexOf(b) + 1 || 99))
  const nomActif = noms.includes(active) ? active : null
  const nomRef = noms.includes(reference) ? reference : noms.includes('Hanches') ? 'Hanches' : noms[0]

  const longueur = (photoId, nom) => {
    const p = reperes[photoId]?.[nom], t = tailles[photoId]
    if (!p || p.length < 2 || !t) return null
    return Math.hypot((p[1][0] - p[0][0]) * t.w, (p[1][1] - p[0][1]) * t.h)
  }

  // Étape en cours pour la mesure active
  let etape = null
  if (nomActif) {
    const manque = photos.find(p => (reperes[p.id]?.[nomActif] || []).length < 2)
    etape = manque
      ? { photo: manque, n: (reperes[manque.id]?.[nomActif] || []).length }
      : { fini: true }
  }

  function point(e, svg) {
    const r = svg.getBoundingClientRect()
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]
  }
  function onDown(e, photo, i) {
    const svg = e.currentTarget
    svg.setPointerCapture?.(e.pointerId)
    onActif(i)
    const cible = e.target.closest('[data-nom]')
    if (cible) {
      drag.current = { photoId: photo.id, nom: cible.getAttribute('data-nom'), k: +cible.getAttribute('data-k') }
      setActive(cible.getAttribute('data-nom'))
      return
    }
    if (!nomActif) return
    // Mesure déjà placée sur cette photo : on l'ajuste en faisant glisser ses repères
    const pts = reperes[photo.id]?.[nomActif] || []
    if (pts.length < 2) modifier(photo.id, nomActif, [...pts, point(e, svg)])
  }
  function onMove(e, photo) {
    const d = drag.current
    if (!d || d.photoId !== photo.id) return
    const pts = [...(reperes[photo.id]?.[d.nom] || [])]
    pts[d.k] = point(e, e.currentTarget)
    modifier(photo.id, d.nom, pts)
  }
  const onUp = () => { drag.current = null }

  function ajouter(nom) {
    setAjoutees(prev => prev.includes(nom) ? prev : [...prev, nom])
    setActive(nom)
  }
  function retirer(nom) {
    photos.forEach(p => { if (reperes[p.id]?.[nom]) modifier(p.id, nom, null) })
    setAjoutees(prev => prev.filter(n => n !== nom))
    if (active === nom) setActive(null)
  }

  const posesDifferentes = new Set(photos.map(p => p.pose)).size > 1
  const resultats = nomRef ? noms.filter(n => n !== nomRef).map(nom => {
    const v = photos.map(p => { const a = longueur(p.id, nom), b = longueur(p.id, nomRef); return a && b ? a / b : null })
    if (v.some(x => x == null)) return { nom, manque: true }
    return { nom, v, pct: (v[v.length - 1] / v[0] - 1) * 100 }
  }) : []

  return (
    <div style={S.zone}>
      <div style={S.photos}>
        {photos.map((p, i) => {
          const t = tailles[p.id]
          return (
            <div key={p.id} style={S.colonne}>
              <div style={S.tete}>
                <p style={S.teteDate}><span style={S.num}>{i + 1}</span>{fmtDate(p.date)}</p>
                <small style={S.tetePose}>{POSE_LABEL[p.pose] || 'Pose ?'}</small>
              </div>
              <div style={{ ...S.cadre, boxShadow: actif === i ? '0 0 0 3px #e4f816' : 'none' }} onClick={() => onActif(i)}>
                <img src={p.url} alt="" draggable={false} style={S.img}
                  onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; setTailles(prev => ({ ...prev, [p.id]: { w, h } })) }} />
                {t && (
                  <svg viewBox={`0 0 ${t.w} ${t.h}`} preserveAspectRatio="none" style={{ ...S.svg, cursor: nomActif ? 'crosshair' : 'default' }}
                    onPointerDown={e => onDown(e, p, i)} onPointerMove={e => onMove(e, p)} onPointerUp={onUp} onPointerCancel={onUp}>
                    {noms.map(nom => {
                      const pts = (reperes[p.id]?.[nom] || []).map(([x, y]) => [x * t.w, y * t.h])
                      const c = couleur(nom)
                      const r = t.w * 0.016
                      return (
                        <g key={nom}>
                          {pts.length === 2 && <>
                            <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} stroke="rgba(0,0,0,.55)" strokeWidth="4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                            <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                            <text x={(pts[0][0] + pts[1][0]) / 2} y={Math.min(pts[0][1], pts[1][1]) - r * 1.6} textAnchor="middle" fontSize={t.w * 0.04} fontWeight="800"
                              fill={c} stroke="rgba(0,0,0,.7)" strokeWidth={t.w * 0.01} paintOrder="stroke" pointerEvents="none">{nom}</text>
                          </>}
                          {pts.map((q, k) => (
                            <circle key={k} data-nom={nom} data-k={k} cx={q[0]} cy={q[1]} r={r} fill={c} stroke="#000" strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} />
                          ))}
                        </g>
                      )
                    })}
                  </svg>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={S.panneau}>
        <div style={S.etape}>
          {!nomActif ? 'Choisis ou ajoute une mesure ci-dessous, puis clique deux repères sur chaque photo.'
            : etape.fini ? <><b style={S.etapeNom}>{nomActif}</b> est placée sur les deux photos. Fais glisser un repère pour l'ajuster, ou passe à une autre mesure.</>
            : <><b style={S.etapeNom}>{nomActif}</b> · photo {photos.indexOf(etape.photo) + 1} ({fmtDate(etape.photo.date)}) : clique le {etape.n === 0 ? 'premier' : 'second'} repère.</>}
        </div>

        <div style={S.bloc}>
          <div style={S.blocTete}><h3 style={S.blocTitre}>Mesures</h3><span style={S.etat}>{etat}</span></div>
          {noms.map(nom => {
            const nb = photos.filter(p => (reperes[p.id]?.[nom] || []).length === 2).length
            const on = nom === nomActif
            return (
              <div key={nom} onClick={() => setActive(nom)} style={{ ...S.mesure, ...(on ? S.mesureOn : null) }}>
                <span style={{ ...S.point, background: couleur(nom) }} />
                <span style={S.mesureNom}>{nom}</span>
                <span style={{ ...S.mesureEtat, color: nb === photos.length ? '#16a34a' : '#6b7280' }}>{nb}/{photos.length} photos</span>
                <button onClick={e => { e.stopPropagation(); setReference(nom) }} title="Mesure de référence"
                  style={{ ...S.ref, ...(nom === nomRef ? S.refOn : null) }}>Référence</button>
                {on && <button onClick={e => { e.stopPropagation(); retirer(nom) }} style={S.retirer} aria-label={`Retirer la mesure ${nom}`} title="Retirer cette mesure des deux photos">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>}
              </div>
            )
          })}
          <div style={S.ajouts}>
            {PRESETS.filter(n => !noms.includes(n)).map(n => (
              <button key={n} onClick={() => ajouter(n)} style={S.ajout}>+ {n}</button>
            ))}
          </div>
        </div>

        <div style={S.bloc}>
          <h3 style={S.blocTitre}>Résultat</h3>
          {resultats.length === 0 ? (
            <p style={S.vide}>Place au moins deux mesures sur les deux photos. Chaque mesure est comparée à la mesure de référence : la distance de prise de vue n'a donc pas d'effet.</p>
          ) : resultats.map((r, i) => {
            const stable = !r.manque && Math.abs(r.pct) < 1
            const col = stable ? '#6b7280' : r.pct > 0 ? '#16a34a' : '#dc2626'
            return (
              <div key={r.nom} style={{ ...S.res, borderTop: i ? '1px solid #f3f4f6' : 'none' }}>
                <span style={S.resLib}>{r.nom} / {nomRef}
                  <small style={S.resSous}>{r.manque ? 'À placer sur les deux photos'
                    : stable ? 'Stable' : `${r.nom} ${r.pct > 0 ? 'plus' : 'moins'} large${r.nom.endsWith('s') ? 's' : ''} par rapport ${nomRef.endsWith('s') ? 'aux' : 'à la'} ${nomRef.toLowerCase()}`}</small>
                </span>
                {!r.manque && <>
                  <span style={S.resVal}>{r.v.map(fmt2).join(' → ')}</span>
                  <span style={{ ...S.pill, background: col }}>{r.pct > 0 ? '+' : ''}{r.pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</span>
                </>}
              </div>
            )
          })}
          {posesDifferentes && <p style={{ ...S.vide, color: '#b45309', marginTop: 8 }}>Ces photos ne sont pas prises sous le même angle : les mesures ne sont pas comparables.</p>}
        </div>
      </div>
    </div>
  )
}

const S = {
  zone:       { display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  photos:     { flex: '1 1 480px', minWidth: 0, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'flex-start', background: '#f3f4f6', borderRadius: 12, padding: 12 },
  colonne:    { flex: '1 1 0', minWidth: 0, maxWidth: 360 },
  tete:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  teteDate:   { margin: 0, fontSize: 13, fontWeight: 800, color: '#1a1a1a', display: 'flex', alignItems: 'center' },
  tetePose:   { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  num:        { width: 22, height: 22, borderRadius: 6, background: '#333333', color: '#e4f816', fontSize: 12, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 },
  cadre:      { position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', lineHeight: 0 },
  img:        { display: 'block', width: '100%', maxHeight: '68vh', objectFit: 'contain', userSelect: 'none' },
  svg:        { position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' },
  panneau:    { flex: '0 1 340px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 },
  etape:      { background: '#333333', color: 'white', borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 600, lineHeight: 1.45 },
  etapeNom:   { color: '#e4f816' },
  bloc:       { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 },
  blocTete:   { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  blocTitre:  { margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em' },
  etat:       { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  mesure:     { display: 'flex', alignItems: 'center', gap: 8, padding: 8, minHeight: 44, borderRadius: 9, cursor: 'pointer', border: '1.5px solid transparent' },
  mesureOn:   { border: '1.5px solid #333333', background: '#fafafa' },
  point:      { width: 12, height: 12, borderRadius: '50%', flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.2)' },
  mesureNom:  { flex: 1, fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  mesureEtat: { fontSize: 12, fontWeight: 700 },
  ref:        { fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '2px 8px', border: '1.5px solid #e5e7eb', color: '#6b7280', background: 'white', cursor: 'pointer', fontFamily: 'inherit' },
  refOn:      { background: '#333333', border: '1.5px solid #333333', color: '#e4f816' },
  retirer:    { width: 28, height: 28, border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  ajouts:     { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  ajout:      { border: '1.5px dashed #d1d5db', background: 'white', borderRadius: 999, padding: '5px 10px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' },
  vide:       { fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 },
  res:        { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' },
  resLib:     { flex: 1, fontSize: 13, fontWeight: 700, color: '#1a1a1a' },
  resSous:    { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 2 },
  resVal:     { fontSize: 13, fontWeight: 700, color: '#6b7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  pill:       { borderRadius: 999, padding: '3px 9px', fontSize: 12, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'white', whiteSpace: 'nowrap' },
}
