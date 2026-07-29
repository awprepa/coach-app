import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

const COULEURS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2']
const TYPES = [
  { key: 'intermittent_long', label: 'Intermittent long' },
  { key: 'intermittent_court', label: 'Intermittent court' },
  { key: 'agilite', label: 'Agilité' },
  { key: 'autre', label: 'Autre' },
]
const SNAP_TOL = 1.8
const GRID = 1

function nextLabel(plots) {
  const nums = plots.map(p => parseInt((p.label || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n))
  const n = nums.length ? Math.max(...nums) + 1 : 1
  return `P${n}`
}

function clamp(v, min = 2, max = 98) { return Math.max(min, Math.min(max, v)) }
function uid(prefix) { return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7)}` }

function snapPlot(x, y, plots, excludeId) {
  let guideX = null, guideY = null
  for (const p of plots) {
    if (p.id === excludeId) continue
    if (guideX === null && Math.abs(p.x - x) < SNAP_TOL) guideX = p.x
    if (guideY === null && Math.abs(p.y - y) < SNAP_TOL) guideY = p.y
  }
  const finalX = guideX !== null ? guideX : Math.round(x / GRID) * GRID
  const finalY = guideY !== null ? guideY : Math.round(y / GRID) * GRID
  return { x: finalX, y: finalY, guideX, guideY }
}

export default function SchemaEditor({ schema, onClose, onSaved }) {
  const isNew = !schema?.id
  const [nom, setNom] = useState(schema?.nom || '')
  const [typeExercice, setTypeExercice] = useState(schema?.type_exercice || 'autre')
  const [description, setDescription] = useState(schema?.description || '')
  const [plots, setPlots] = useState(schema?.donnees?.plots || [])
  const [segments, setSegments] = useState(schema?.donnees?.segments || [])
  const [rects, setRects] = useState(schema?.donnees?.rects || [])
  const [mode, setMode] = useState('point') // 'point' | 'rect' | 'lien'
  const [linkFirstId, setLinkFirstId] = useState(null)
  const [selectedPlotId, setSelectedPlotId] = useState(null)
  const [selectedSegId, setSelectedSegId] = useState(null)
  const [selectedRectId, setSelectedRectId] = useState(null)
  const [nextColor, setNextColor] = useState(COULEURS[0])
  const [nextStyle, setNextStyle] = useState('plein')
  const [nextRempli, setNextRempli] = useState(false)
  const [rectDraft, setRectDraft] = useState(null)
  const [snapGuides, setSnapGuides] = useState({ x: null, y: null })
  const [saving, setSaving] = useState(false)
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const justDraggedRef = useRef(false)

  function svgPointRaw(e) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 50, y: 50 }
    const loc = pt.matrixTransform(ctm.inverse())
    return { x: Math.max(0, Math.min(100, loc.x)), y: Math.max(0, Math.min(100, loc.y)) }
  }

  // Suppression au clavier de l'élément sélectionné
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (selectedPlotId) { deletePlot(selectedPlotId); e.preventDefault() }
      else if (selectedSegId) { deleteSegment(selectedSegId); e.preventDefault() }
      else if (selectedRectId) { deleteRect(selectedRectId); e.preventDefault() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedPlotId, selectedSegId, selectedRectId])

  function handleCanvasClick(e) {
    if (justDraggedRef.current) return // un drag/tracé qui vient de finir ne doit pas créer de point
    if (!e.target.dataset?.bg) return // clic sur un plot/segment/zone géré ailleurs
    if (mode === 'lien') { setSelectedPlotId(null); setSelectedSegId(null); setSelectedRectId(null); return }
    if (mode !== 'point') return
    const raw = svgPointRaw(e)
    const plot = { id: uid('p'), label: nextLabel(plots), x: clamp(raw.x), y: clamp(raw.y), couleur: nextColor }
    setPlots(prev => [...prev, plot])
    setSelectedPlotId(plot.id)
    setSelectedSegId(null)
    setSelectedRectId(null)
  }

  function handleSvgPointerDown(e) {
    if (!e.target.dataset?.bg) return
    if (mode === 'rect') {
      const p = svgPointRaw(e)
      try { svgRef.current.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }
      dragRef.current = { kind: 'rect-draft', x1: p.x, y1: p.y, x2: p.x, y2: p.y, moved: false }
      setRectDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      setSelectedPlotId(null); setSelectedSegId(null); setSelectedRectId(null)
    }
  }

  function handlePlotPointerDown(e, plotId) {
    e.stopPropagation()
    if (mode === 'rect') return
    if (mode === 'lien') {
      if (!linkFirstId) { setLinkFirstId(plotId); return }
      if (linkFirstId === plotId) { setLinkFirstId(null); return }
      const seg = { id: uid('s'), from: linkFirstId, to: plotId, distance_m: null, style: nextStyle }
      setSegments(prev => [...prev, seg])
      setLinkFirstId(null)
      setSelectedSegId(seg.id)
      setSelectedPlotId(null)
      return
    }
    setSelectedPlotId(plotId)
    setSelectedSegId(null)
    setSelectedRectId(null)
    try { e.target.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }
    dragRef.current = { kind: 'plot', id: plotId, moved: false }
  }

  function handleRectPointerDown(e, rectId) {
    e.stopPropagation()
    if (mode === 'lien') return
    const r = rects.find(x => x.id === rectId)
    if (!r) return
    setSelectedRectId(rectId)
    setSelectedPlotId(null)
    setSelectedSegId(null)
    const p = svgPointRaw(e)
    try { e.target.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }
    dragRef.current = { kind: 'rect-move', id: rectId, offX: p.x - r.x, offY: p.y - r.y, moved: false }
  }

  function handleResizePointerDown(e, rectId, corner) {
    e.stopPropagation()
    setSelectedRectId(rectId)
    try { e.target.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }
    dragRef.current = { kind: 'rect-resize', id: rectId, corner, moved: false }
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return
    const p = svgPointRaw(e)
    dragRef.current.moved = true

    if (dragRef.current.kind === 'rect-draft') {
      dragRef.current.x2 = p.x
      dragRef.current.y2 = p.y
      setRectDraft({ x1: dragRef.current.x1, y1: dragRef.current.y1, x2: p.x, y2: p.y })
    } else if (dragRef.current.kind === 'plot') {
      const dragId = dragRef.current.id
      const { x, y, guideX, guideY } = snapPlot(p.x, p.y, plots, dragId)
      setPlots(prev => prev.map(pl => pl.id === dragId ? { ...pl, x: clamp(x), y: clamp(y) } : pl))
      setSnapGuides({ x: guideX, y: guideY })
    } else if (dragRef.current.kind === 'rect-move') {
      const dragId = dragRef.current.id
      const offX = dragRef.current.offX
      const offY = dragRef.current.offY
      setRects(prev => prev.map(r => {
        if (r.id !== dragId) return r
        const x = Math.max(0, Math.min(100 - r.w, p.x - offX))
        const y = Math.max(0, Math.min(100 - r.h, p.y - offY))
        return { ...r, x, y }
      }))
    } else if (dragRef.current.kind === 'rect-resize') {
      const dragId = dragRef.current.id
      const corner = dragRef.current.corner
      setRects(prev => prev.map(r => {
        if (r.id !== dragId) return r
        let { x, y, w, h } = r
        const x2 = x + w, y2 = y + h
        if (corner.includes('w')) { w = x2 - p.x; x = p.x }
        if (corner.includes('e')) { w = p.x - x }
        if (corner.includes('n')) { h = y2 - p.y; y = p.y }
        if (corner.includes('s')) { h = p.y - y }
        w = Math.max(3, w); h = Math.max(3, h)
        x = Math.max(0, Math.min(100 - w, x)); y = Math.max(0, Math.min(100 - h, y))
        return { ...r, x, y, w, h }
      }))
    }
  }

  function handlePointerUp() {
    if (dragRef.current?.kind === 'rect-draft') {
      const { x1, y1, x2, y2 } = dragRef.current
      const x = Math.min(x1, x2)
      const y = Math.min(y1, y2)
      const w = Math.abs(x2 - x1)
      const h = Math.abs(y2 - y1)
      setRectDraft(null)
      if (w > 2 && h > 2) {
        const rect = { id: uid('r'), x, y, w, h, couleur: nextColor, style: nextStyle, rempli: nextRempli }
        setRects(prev => [...prev, rect])
        setSelectedRectId(rect.id)
      }
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
      dragRef.current = null
      return
    }
    if (dragRef.current?.moved) {
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
    }
    dragRef.current = null
    setSnapGuides({ x: null, y: null })
  }

  function renamePlot(id, label) { setPlots(prev => prev.map(p => p.id === id ? { ...p, label } : p)) }
  function recolorPlot(id, couleur) { setPlots(prev => prev.map(p => p.id === id ? { ...p, couleur } : p)) }
  function deletePlot(id) {
    setPlots(prev => prev.filter(p => p.id !== id))
    setSegments(prev => prev.filter(s => s.from !== id && s.to !== id))
    setSelectedPlotId(null)
  }
  function updateSegment(id, patch) { setSegments(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)) }
  function deleteSegment(id) { setSegments(prev => prev.filter(s => s.id !== id)); setSelectedSegId(null) }
  function updateRect(id, patch) { setRects(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function deleteRect(id) { setRects(prev => prev.filter(r => r.id !== id)); setSelectedRectId(null) }

  async function save() {
    if (!nom.trim()) { alert('Donne un nom au schéma.'); return }
    setSaving(true)
    const payload = {
      nom: nom.trim(), type_exercice: typeExercice, description: description.trim() || null,
      donnees: { plots, segments, rects }, updated_at: new Date().toISOString(),
    }
    const { error } = isNew
      ? await supabase.from('schemas_entrainement').insert(payload)
      : await supabase.from('schemas_entrainement').update(payload).eq('id', schema.id)
    setSaving(false)
    if (error) { alert(error.message); return }
    onSaved()
  }

  const selectedPlot = plots.find(p => p.id === selectedPlotId)
  const selectedSeg = segments.find(s => s.id === selectedSegId)
  const selectedRect = rects.find(r => r.id === selectedRectId)
  const draftRectView = rectDraft ? {
    x: Math.min(rectDraft.x1, rectDraft.x2), y: Math.min(rectDraft.y1, rectDraft.y2),
    w: Math.abs(rectDraft.x2 - rectDraft.x1), h: Math.abs(rectDraft.y2 - rectDraft.y1),
  } : null

  const corners = r => ([
    ['nw', r.x, r.y], ['ne', r.x + r.w, r.y], ['sw', r.x, r.y + r.h], ['se', r.x + r.w, r.y + r.h],
  ])

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.header}>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom du schéma"
            style={S.nomInput} />
          <button onClick={onClose} style={S.closeBtn}>×</button>
        </div>

        <div style={S.typeRow}>
          {TYPES.map(t => (
            <button key={t.key} onClick={() => setTypeExercice(t.key)}
              style={{ ...S.typeBtn, ...(typeExercice === t.key ? S.typeBtnActive : {}) }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={S.toolbar}>
          <div style={S.toolGroup}>
            <button onClick={() => { setMode('point'); setLinkFirstId(null) }}
              style={{ ...S.modeBtn, ...(mode === 'point' ? S.modeBtnActive : {}) }}>✛ Points</button>
            <button onClick={() => { setMode('rect'); setLinkFirstId(null) }}
              style={{ ...S.modeBtn, ...(mode === 'rect' ? S.modeBtnActive : {}) }}>▭ Zone</button>
            <button onClick={() => { setMode('lien'); setSelectedPlotId(null); setSelectedSegId(null); setSelectedRectId(null) }}
              style={{ ...S.modeBtn, ...(mode === 'lien' ? S.modeBtnActive : {}) }}>
              ⟋ Relier {linkFirstId ? '· choisis le 2e plot' : ''}
            </button>
          </div>
          <div style={S.toolGroup}>
            {COULEURS.map(c => (
              <button key={c} onClick={() => setNextColor(c)}
                style={{ ...S.colorSwatch, background: c, border: nextColor === c ? '2.5px solid #1f2937' : '2px solid #fff' }} />
            ))}
          </div>
          <div style={S.toolGroup}>
            <button onClick={() => setNextStyle('plein')} style={{ ...S.styleBtn, ...(nextStyle === 'plein' ? S.styleBtnActive : {}) }}>― plein</button>
            <button onClick={() => setNextStyle('pointille')} style={{ ...S.styleBtn, ...(nextStyle === 'pointille' ? S.styleBtnActive : {}) }}>┄ pointillé</button>
            {mode === 'rect' && (
              <button onClick={() => setNextRempli(v => !v)} style={{ ...S.styleBtn, ...(nextRempli ? S.styleBtnActive : {}) }}>▨ rempli</button>
            )}
          </div>
        </div>

        <div style={S.canvasWrap}>
          <svg ref={svgRef} viewBox="0 0 100 100" style={{ ...S.canvas, cursor: mode === 'lien' ? 'pointer' : mode === 'rect' ? 'crosshair' : 'default' }}
            onClick={handleCanvasClick}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}>
            <rect data-bg="1" x="0" y="0" width="100" height="100" fill="#f3f4e8" />

            {snapGuides.x !== null && <line x1={snapGuides.x} y1="0" x2={snapGuides.x} y2="100" stroke="#6366f1" strokeWidth="0.35" strokeDasharray="1.5,1.2" />}
            {snapGuides.y !== null && <line x1="0" y1={snapGuides.y} x2="100" y2={snapGuides.y} stroke="#6366f1" strokeWidth="0.35" strokeDasharray="1.5,1.2" />}

            {rects.map(r => {
              const isSel = selectedRectId === r.id
              return (
                <g key={r.id}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h}
                    fill={r.rempli ? r.couleur : 'transparent'} fillOpacity={r.rempli ? 0.18 : 0}
                    stroke={isSel ? '#6366f1' : r.couleur} strokeWidth={isSel ? 1 : 0.7}
                    strokeDasharray={r.style === 'pointille' ? '2.4,1.6' : undefined}
                    onPointerDown={e => handleRectPointerDown(e, r.id)}
                    style={{ cursor: mode === 'rect' || mode === 'point' ? 'move' : 'default' }} />
                  {isSel && corners(r).map(([c, cx, cy]) => (
                    <rect key={c} x={cx - 1.4} y={cy - 1.4} width="2.8" height="2.8" fill="#fff" stroke="#6366f1" strokeWidth="0.6"
                      onPointerDown={e => handleResizePointerDown(e, r.id, c)}
                      style={{ cursor: (c === 'nw' || c === 'se') ? 'nwse-resize' : 'nesw-resize' }} />
                  ))}
                </g>
              )
            })}

            {draftRectView && (
              <rect x={draftRectView.x} y={draftRectView.y} width={draftRectView.w} height={draftRectView.h}
                fill={nextColor} fillOpacity="0.12" stroke={nextColor} strokeWidth="0.8" strokeDasharray="2,1.4" />
            )}

            {segments.map(seg => {
              const from = plots.find(p => p.id === seg.from)
              const to = plots.find(p => p.id === seg.to)
              if (!from || !to) return null
              const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2
              const isSel = selectedSegId === seg.id
              return (
                <g key={seg.id} onClick={e => { e.stopPropagation(); setSelectedSegId(seg.id); setSelectedPlotId(null); setSelectedRectId(null) }}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth="4" />
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={isSel ? '#6366f1' : '#374151'} strokeWidth={isSel ? 1.1 : 0.8}
                    strokeDasharray={seg.style === 'pointille' ? '3,2' : undefined} />
                  {seg.distance_m != null && (
                    <text x={midX} y={midY - 2} fontSize="3" fill="#1f2937" textAnchor="middle" fontWeight="700"
                      style={{ paintOrder: 'stroke', stroke: '#f3f4e8', strokeWidth: 1.2 }}>{seg.distance_m}m</text>
                  )}
                </g>
              )
            })}
            {plots.map(p => (
              <g key={p.id} onPointerDown={e => handlePlotPointerDown(e, p.id)} style={{ cursor: mode === 'lien' ? 'pointer' : 'grab' }}>
                <circle cx={p.x} cy={p.y} r="2.2" fill={p.couleur}
                  stroke={selectedPlotId === p.id || linkFirstId === p.id ? '#1f2937' : '#fff'}
                  strokeWidth={selectedPlotId === p.id || linkFirstId === p.id ? 1 : 0.5} />
                <text x={p.x} y={p.y - 3.4} fontSize="2.6" fill="#1f2937" textAnchor="middle" fontWeight="800"
                  style={{ paintOrder: 'stroke', stroke: '#f3f4e8', strokeWidth: 1, pointerEvents: 'none' }}>{p.label}</text>
              </g>
            ))}
          </svg>
          <p style={S.hint}>
            {mode === 'point' && 'Tape sur le terrain pour poser un plot · glisse un plot pour le déplacer (aligne-toi sur un autre plot pour accrocher)'}
            {mode === 'rect' && 'Glisse pour tracer une zone · glisse une zone pour la déplacer · tire un coin pour la redimensionner'}
            {mode === 'lien' && 'Tape 2 plots pour les relier'}
          </p>
        </div>

        {selectedPlot && (
          <div style={S.editPanel}>
            <input value={selectedPlot.label} onChange={e => renamePlot(selectedPlot.id, e.target.value)} style={S.editLabelInput} />
            <div style={S.toolGroup}>
              {COULEURS.map(c => (
                <button key={c} onClick={() => recolorPlot(selectedPlot.id, c)}
                  style={{ ...S.colorSwatch, background: c, border: selectedPlot.couleur === c ? '2.5px solid #1f2937' : '2px solid #fff' }} />
              ))}
            </div>
            <button onClick={() => deletePlot(selectedPlot.id)} style={S.deleteBtn}>🗑 Supprimer</button>
          </div>
        )}

        {selectedSeg && (
          <div style={S.editPanel}>
            <input type="number" min="0" placeholder="Distance (m)" value={selectedSeg.distance_m ?? ''}
              onChange={e => updateSegment(selectedSeg.id, { distance_m: e.target.value ? Number(e.target.value) : null })}
              style={S.editLabelInput} />
            <div style={S.toolGroup}>
              <button onClick={() => updateSegment(selectedSeg.id, { style: 'plein' })} style={{ ...S.styleBtn, ...(selectedSeg.style === 'plein' ? S.styleBtnActive : {}) }}>― plein</button>
              <button onClick={() => updateSegment(selectedSeg.id, { style: 'pointille' })} style={{ ...S.styleBtn, ...(selectedSeg.style === 'pointille' ? S.styleBtnActive : {}) }}>┄ pointillé</button>
            </div>
            <button onClick={() => deleteSegment(selectedSeg.id)} style={S.deleteBtn}>🗑 Supprimer</button>
          </div>
        )}

        {selectedRect && (
          <div style={S.editPanel}>
            <div style={S.toolGroup}>
              {COULEURS.map(c => (
                <button key={c} onClick={() => updateRect(selectedRect.id, { couleur: c })}
                  style={{ ...S.colorSwatch, background: c, border: selectedRect.couleur === c ? '2.5px solid #1f2937' : '2px solid #fff' }} />
              ))}
            </div>
            <div style={S.toolGroup}>
              <button onClick={() => updateRect(selectedRect.id, { style: 'plein' })} style={{ ...S.styleBtn, ...(selectedRect.style === 'plein' ? S.styleBtnActive : {}) }}>― plein</button>
              <button onClick={() => updateRect(selectedRect.id, { style: 'pointille' })} style={{ ...S.styleBtn, ...(selectedRect.style === 'pointille' ? S.styleBtnActive : {}) }}>┄ pointillé</button>
              <button onClick={() => updateRect(selectedRect.id, { rempli: !selectedRect.rempli })} style={{ ...S.styleBtn, ...(selectedRect.rempli ? S.styleBtnActive : {}) }}>▨ rempli</button>
            </div>
            <button onClick={() => deleteRect(selectedRect.id)} style={S.deleteBtn}>🗑 Supprimer</button>
          </div>
        )}

        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Description (ex : 30-30, aller-retour, récup passive)" rows={2} style={S.descInput} />

        <div style={S.footer}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : '💾 Enregistrer dans la bibliothèque'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modal: { background: '#fff', borderRadius: 18, padding: '1.25rem', width: '100%', maxWidth: 620, maxHeight: '94vh', overflowY: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  header: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 },
  nomInput: { flex: 1, fontSize: '1.05rem', fontWeight: 800, border: 'none', borderBottom: '2px solid #e5e7eb', padding: '4px 2px', outline: 'none', fontFamily: 'inherit' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  typeRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  typeBtn: { padding: '5px 11px', borderRadius: 999, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  typeBtnActive: { background: '#1f2937', color: '#fff', borderColor: '#1f2937' },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 8, padding: '8px 10px', background: '#f9fafb', borderRadius: 10 },
  toolGroup: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  modeBtn: { padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  modeBtnActive: { background: '#4338ca', color: '#fff', borderColor: '#4338ca' },
  colorSwatch: { width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', padding: 0 },
  styleBtn: { padding: '5px 9px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' },
  styleBtnActive: { background: '#1f2937', color: '#fff', borderColor: '#1f2937' },
  canvasWrap: { border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  canvas: { width: '100%', height: 360, display: 'block', touchAction: 'none' },
  hint: { fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center', margin: '4px 0 0', padding: '4px 0' },
  editPanel: { display: 'flex', gap: 8, alignItems: 'center', background: '#eef2ff', borderRadius: 10, padding: '8px 10px', marginBottom: 8, flexWrap: 'wrap' },
  editLabelInput: { flex: 1, minWidth: 90, border: '1.5px solid #c7d2fe', borderRadius: 8, padding: '5px 8px', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit' },
  deleteBtn: { background: 'none', border: 'none', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  descInput: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', fontSize: '0.82rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 },
  footer: { display: 'flex', gap: 8 },
  btnPrimary: { flex: 1, background: '#1f2937', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' },
  btnSecondary: { flex: 1, background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.75rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' },
}
