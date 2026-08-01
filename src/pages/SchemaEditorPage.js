import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'

const SNAP_TOL = 1.8
const GRID = 1
const DEFAULT_COLOR = '#ffffff'
const FIELD_COLOR = '#86cf99'
const SCALE = 2 // unités de viewBox par mètre, fixe : garantit que toutes les distances du schéma sont proportionnelles entre elles
const DEFAULT_RAYON = 1.6
const HISTORY_MAX = 60

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

// ── Icônes (SVG inline, pas d'emoji) ──
function IconLock({ locked }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9-3" />}
    </svg>
  )
}
function IconDuplicate() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 15.5V6a2 2 0 0 1 2-2h9.5" />
    </svg>
  )
}
function IconUndo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" />
    </svg>
  )
}
function IconRedo() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h2" />
    </svg>
  )
}
function IconFront() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="11" height="11" rx="1.5" opacity="0.4" /><rect x="10" y="10" width="11" height="11" rx="1.5" />
    </svg>
  )
}
function IconBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="11" height="11" rx="1.5" /><rect x="10" y="10" width="11" height="11" rx="1.5" opacity="0.4" />
    </svg>
  )
}
function LockBadge({ x, y, size = 3.4 }) {
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <rect x={-size / 2} y={-size * 0.12} width={size} height={size * 0.78} rx={size * 0.16} fill="#1f2937" />
      <path d={`M ${-size * 0.32} ${-size * 0.12} v ${-size * 0.2} a ${size * 0.32} ${size * 0.32} 0 0 1 ${size * 0.64} 0 v ${size * 0.2}`}
        fill="none" stroke="#1f2937" strokeWidth={size * 0.16} />
    </g>
  )
}

export default function SchemaEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id
  const [schema, setSchema] = useState(isNew ? null : undefined) // undefined = chargement

  useEffect(() => {
    if (isNew) return
    supabase.from('schemas_entrainement').select('*').eq('id', id).single().then(({ data }) => setSchema(data || null))
  }, [id, isNew])

  function goBack() { navigate('/bibliotheque?tab=schemas') }

  if (schema === undefined) return <div style={S.page}><p style={{ color: '#9ca3af' }}>Chargement…</p></div>

  return <SchemaEditorForm key={schema?.id || 'nouveau'} schema={schema} isNew={isNew} onClose={goBack} onSaved={goBack} />
}

function SchemaEditorForm({ schema, isNew, onClose, onSaved }) {
  const [nom, setNom] = useState(schema?.nom || '')
  const [description, setDescription] = useState(schema?.description || '')
  const [plots, setPlots] = useState(schema?.donnees?.plots || [])
  const [segments, setSegments] = useState(schema?.donnees?.segments || [])
  const [rects, setRects] = useState(schema?.donnees?.rects || [])
  const [mode, setMode] = useState('point') // 'point' | 'rect' | 'lien'
  const [linkFirstId, setLinkFirstId] = useState(null)
  const [selPlots, setSelPlots] = useState([])   // ids sélectionnés (multi-sélection au sein d'un même type)
  const [selRects, setSelRects] = useState([])
  const [selSegId, setSelSegId] = useState(null)
  const [nextColor, setNextColor] = useState(DEFAULT_COLOR)
  const [nextStyle, setNextStyle] = useState('plein')
  const [nextRempli, setNextRempli] = useState(false)
  const [rectDraft, setRectDraft] = useState(null)
  const [snapGuides, setSnapGuides] = useState({ x: null, y: null })
  const [saving, setSaving] = useState(false)
  const [historyTick, setHistoryTick] = useState(0) // force le re-rendu des boutons annuler/rétablir
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const justDraggedRef = useRef(false)
  const undoStack = useRef([])
  const redoStack = useRef([])

  function svgPointRaw(e) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 50, y: 50 }
    const loc = pt.matrixTransform(ctm.inverse())
    return { x: Math.max(0, Math.min(100, loc.x)), y: Math.max(0, Math.min(100, loc.y)) }
  }

  // ── Historique annuler/rétablir ──
  function pushHistory() {
    undoStack.current.push({ plots, segments, rects })
    if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift()
    redoStack.current = []
    setHistoryTick(t => t + 1)
  }
  function undo() {
    if (!undoStack.current.length) return
    const prev = undoStack.current.pop()
    redoStack.current.push({ plots, segments, rects })
    setPlots(prev.plots); setSegments(prev.segments); setRects(prev.rects)
    setSelPlots([]); setSelRects([]); setSelSegId(null)
    setHistoryTick(t => t + 1)
  }
  function redo() {
    if (!redoStack.current.length) return
    const next = redoStack.current.pop()
    undoStack.current.push({ plots, segments, rects })
    setPlots(next.plots); setSegments(next.segments); setRects(next.rects)
    setSelPlots([]); setSelRects([]); setSelSegId(null)
    setHistoryTick(t => t + 1)
  }

  function deleteSelection() {
    if (selSegId) { deleteSegment(selSegId); return }
    const pIds = selPlots.filter(pid => !plots.find(p => p.id === pid)?.verrouille)
    const rIds = selRects.filter(rid => !rects.find(r => r.id === rid)?.verrouille)
    if (!pIds.length && !rIds.length) return
    pushHistory()
    setPlots(prev => prev.filter(p => !pIds.includes(p.id)))
    setSegments(prev => prev.filter(s => !pIds.includes(s.from) && !pIds.includes(s.to)))
    setRects(prev => prev.filter(r => !rIds.includes(r.id)))
    setSelPlots([]); setSelRects([])
  }

  function duplicateSelection() {
    const pIds = selPlots.filter(pid => !plots.find(p => p.id === pid)?.verrouille)
    const rIds = selRects.filter(rid => !rects.find(r => r.id === rid)?.verrouille)
    if (!pIds.length && !rIds.length) return
    pushHistory()
    const OFFSET = 4
    const baseNum = parseInt(nextLabel(plots).replace(/\D/g, ''), 10)
    const newPlots = pIds.map((pid, i) => {
      const p = plots.find(x => x.id === pid)
      return { ...p, id: uid('p'), label: `P${baseNum + i}`, x: clamp(p.x + OFFSET), y: clamp(p.y + OFFSET), verrouille: false }
    })
    const newRects = rIds.map(rid => {
      const r = rects.find(x => x.id === rid)
      return { ...r, id: uid('r'), x: clamp(r.x + OFFSET, 0, 100 - r.w), y: clamp(r.y + OFFSET, 0, 100 - r.h), verrouille: false }
    })
    if (newPlots.length) setPlots(prev => [...prev, ...newPlots])
    if (newRects.length) setRects(prev => [...prev, ...newRects])
    setSelPlots(newPlots.map(p => p.id))
    setSelRects(newRects.map(r => r.id))
  }

  function nudgeSelection(dx, dy) {
    pushHistory()
    setPlots(prev => prev.map(p => selPlots.includes(p.id) && !p.verrouille ? { ...p, x: clamp(p.x + dx), y: clamp(p.y + dy) } : p))
    setRects(prev => prev.map(r => selRects.includes(r.id) && !r.verrouille
      ? { ...r, x: Math.max(0, Math.min(100 - r.w, r.x + dx)), y: Math.max(0, Math.min(100 - r.h, r.y + dy)) } : r))
  }

  // Raccourcis clavier : Suppr, Ctrl/Cmd+Z annuler, Ctrl/Cmd+Maj+Z rétablir,
  // Ctrl/Cmd+D dupliquer, flèches pour déplacer la sélection d'1 unité (5 avec Maj)
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (typing) return
      if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return }
      if (e.key.startsWith('Arrow') && (selPlots.length || selRects.length)) {
        const step = e.shiftKey ? 5 : 1
        let dx = 0, dy = 0
        if (e.key === 'ArrowLeft') dx = -step
        else if (e.key === 'ArrowRight') dx = step
        else if (e.key === 'ArrowUp') dy = -step
        else if (e.key === 'ArrowDown') dy = step
        else return
        e.preventDefault()
        nudgeSelection(dx, dy)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPlots, selRects, selSegId, plots, segments, rects])

  function isMultiActive(kind, itemId) {
    return kind === 'plot' ? (selPlots.length > 1 && selPlots.includes(itemId)) : (selRects.length > 1 && selRects.includes(itemId))
  }

  function handleCanvasClick(e) {
    if (justDraggedRef.current) return // un drag/tracé qui vient de finir ne doit pas créer de point
    if (!e.target.dataset?.bg) return // clic sur un plot/segment/zone géré ailleurs
    if (mode === 'lien') { setSelPlots([]); setSelRects([]); setSelSegId(null); return }
    if (mode !== 'point') return
    const raw = svgPointRaw(e)
    pushHistory()
    const plot = { id: uid('p'), label: nextLabel(plots), x: clamp(raw.x), y: clamp(raw.y), couleur: nextColor, rayon: DEFAULT_RAYON }
    setPlots(prev => [...prev, plot])
    setSelPlots([plot.id])
    setSelRects([])
    setSelSegId(null)
  }

  function handleSvgPointerDown(e) {
    if (!e.target.dataset?.bg) return
    if (mode === 'rect') {
      const p = svgPointRaw(e)
      try { svgRef.current.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }
      dragRef.current = { kind: 'rect-draft', x1: p.x, y1: p.y, x2: p.x, y2: p.y, moved: false, historyPushed: false }
      setRectDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
      setSelPlots([]); setSelRects([]); setSelSegId(null)
    }
  }

  // Le déplacement d'un plot fonctionne dans tous les modes ; en mode "Relier",
  // un simple tap (sans mouvement) crée le lien, un glissé déplace le plot.
  // En mode "Points", Maj+clic ajoute/retire un plot de la sélection multiple ;
  // un glissé sur un groupe sélectionné déplace tout le groupe ensemble.
  function handlePlotPointerDown(e, plotId) {
    e.stopPropagation()
    if (mode === 'rect') return
    const p = plots.find(x => x.id === plotId)
    if (!p) return

    if (mode === 'point') {
      if (e.shiftKey) {
        setSelPlots(prev => prev.includes(plotId) ? prev.filter(x => x !== plotId) : [...prev, plotId])
        setSelRects([]); setSelSegId(null)
        return
      }
      if (!isMultiActive('plot', plotId)) {
        setSelPlots([plotId]); setSelRects([]); setSelSegId(null)
      }
    }

    if (p.verrouille) return
    try { e.target.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }

    if (mode === 'point' && isMultiActive('plot', plotId)) {
      const startP = svgPointRaw(e)
      dragRef.current = {
        kind: 'plot-group', anchorId: plotId,
        ids: selPlots.filter(pid => !plots.find(pl => pl.id === pid)?.verrouille),
        lastX: startP.x, lastY: startP.y, moved: false, historyPushed: false,
      }
    } else {
      dragRef.current = { kind: 'plot', id: plotId, moved: false, historyPushed: false }
    }
  }

  function handlePlotResizePointerDown(e, plotId) {
    e.stopPropagation()
    const p = plots.find(x => x.id === plotId)
    if (!p || p.verrouille) return
    try { e.target.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }
    dragRef.current = { kind: 'plot-resize', id: plotId, moved: false, historyPushed: false }
  }

  function handleRectPointerDown(e, rectId) {
    e.stopPropagation()
    if (mode === 'lien') return
    const r = rects.find(x => x.id === rectId)
    if (!r) return

    if (e.shiftKey) {
      setSelRects(prev => prev.includes(rectId) ? prev.filter(x => x !== rectId) : [...prev, rectId])
      setSelPlots([]); setSelSegId(null)
      return
    }
    if (!isMultiActive('rect', rectId)) {
      setSelRects([rectId]); setSelPlots([]); setSelSegId(null)
    }

    if (r.verrouille) return
    const p = svgPointRaw(e)
    try { e.target.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }

    if (isMultiActive('rect', rectId)) {
      dragRef.current = {
        kind: 'rect-group', anchorId: rectId,
        ids: selRects.filter(rid => !rects.find(rr => rr.id === rid)?.verrouille),
        lastX: p.x, lastY: p.y, moved: false, historyPushed: false,
      }
    } else {
      dragRef.current = { kind: 'rect-move', id: rectId, offX: p.x - r.x, offY: p.y - r.y, moved: false, historyPushed: false }
    }
  }

  function handleResizePointerDown(e, rectId, corner) {
    e.stopPropagation()
    const r = rects.find(x => x.id === rectId)
    if (!r || r.verrouille) return
    setSelRects([rectId]); setSelPlots([])
    try { e.target.setPointerCapture?.(e.pointerId) } catch { /* pointer déjà relâché */ }
    dragRef.current = { kind: 'rect-resize', id: rectId, corner, moved: false, historyPushed: false }
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return
    const p = svgPointRaw(e)
    const wasMoved = dragRef.current.moved
    dragRef.current.moved = true
    if (!wasMoved && !dragRef.current.historyPushed) {
      pushHistory()
      dragRef.current.historyPushed = true
    }

    if (dragRef.current.kind === 'rect-draft') {
      dragRef.current.x2 = p.x
      dragRef.current.y2 = p.y
      setRectDraft({ x1: dragRef.current.x1, y1: dragRef.current.y1, x2: p.x, y2: p.y })
    } else if (dragRef.current.kind === 'plot') {
      const dragId = dragRef.current.id
      const { x, y, guideX, guideY } = snapPlot(p.x, p.y, plots, dragId)
      setPlots(prev => prev.map(pl => pl.id === dragId ? { ...pl, x: clamp(x), y: clamp(y) } : pl))
      // un déplacement manuel décorrèle le segment de la distance saisie précédemment
      setSegments(prev => prev.map(s => (s.from === dragId || s.to === dragId) && s.distance_m != null ? { ...s, distance_m: null } : s))
      setSnapGuides({ x: guideX, y: guideY })
    } else if (dragRef.current.kind === 'plot-group') {
      const dx = p.x - dragRef.current.lastX, dy = p.y - dragRef.current.lastY
      dragRef.current.lastX = p.x; dragRef.current.lastY = p.y
      const ids = dragRef.current.ids
      setPlots(prev => prev.map(pl => ids.includes(pl.id) ? { ...pl, x: clamp(pl.x + dx), y: clamp(pl.y + dy) } : pl))
      setSegments(prev => prev.map(s => (ids.includes(s.from) || ids.includes(s.to)) && s.distance_m != null ? { ...s, distance_m: null } : s))
    } else if (dragRef.current.kind === 'plot-resize') {
      const dragId = dragRef.current.id
      const pl = plots.find(x => x.id === dragId)
      if (pl) {
        const dist = Math.hypot(p.x - pl.x, p.y - pl.y)
        const rayon = Math.max(0.8, Math.min(5, dist))
        setPlots(prev => prev.map(x => x.id === dragId ? { ...x, rayon } : x))
      }
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
    } else if (dragRef.current.kind === 'rect-group') {
      const dx = p.x - dragRef.current.lastX, dy = p.y - dragRef.current.lastY
      dragRef.current.lastX = p.x; dragRef.current.lastY = p.y
      const ids = dragRef.current.ids
      setRects(prev => prev.map(r => ids.includes(r.id)
        ? { ...r, x: Math.max(0, Math.min(100 - r.w, r.x + dx)), y: Math.max(0, Math.min(100 - r.h, r.y + dy)) } : r))
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
        // le redimensionnement manuel décorrèle la taille affichée des cotes réelles saisies
        return { ...r, x, y, w, h, largeur_m: null, hauteur_m: null }
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
        const rect = { id: uid('r'), x, y, w, h, couleur: nextColor, style: nextStyle, rempli: nextRempli, largeur_m: null, hauteur_m: null }
        setRects(prev => [...prev, rect])
        setSelRects([rect.id])
      }
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
      dragRef.current = null
      return
    }

    if (dragRef.current?.kind === 'plot' && mode === 'lien' && !dragRef.current.moved) {
      const plotId = dragRef.current.id
      if (!linkFirstId) {
        setLinkFirstId(plotId)
      } else if (linkFirstId === plotId) {
        setLinkFirstId(null)
      } else {
        pushHistory()
        const seg = { id: uid('s'), from: linkFirstId, to: plotId, distance_m: null, style: nextStyle }
        setSegments(prev => [...prev, seg])
        setLinkFirstId(null)
        setSelSegId(seg.id)
      }
      dragRef.current = null
      return
    }

    // Un clic (sans glissé) sur un élément qui faisait partie d'un groupe
    // réduit la sélection à ce seul élément — comportement standard des
    // logiciels de dessin (le glissé, lui, déplace tout le groupe).
    if ((dragRef.current?.kind === 'plot-group' || dragRef.current?.kind === 'rect-group') && !dragRef.current.moved) {
      if (dragRef.current.kind === 'plot-group') setSelPlots([dragRef.current.anchorId])
      else setSelRects([dragRef.current.anchorId])
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

  function renamePlot(pid, label) { setPlots(prev => prev.map(p => p.id === pid ? { ...p, label } : p)) }
  function recolorPlot(pid, couleur) { setPlots(prev => prev.map(p => p.id === pid ? { ...p, couleur } : p)) }
  function toggleLockPlot(pid) { pushHistory(); setPlots(prev => prev.map(p => p.id === pid ? { ...p, verrouille: !p.verrouille } : p)) }
  function deletePlot(pid) {
    const p = plots.find(x => x.id === pid)
    if (p?.verrouille) return
    pushHistory()
    setPlots(prev => prev.filter(x => x.id !== pid))
    setSegments(prev => prev.filter(s => s.from !== pid && s.to !== pid))
    setSelPlots([])
  }
  function updateSegment(sid, patch) { setSegments(prev => prev.map(s => s.id === sid ? { ...s, ...patch } : s)) }
  function deleteSegment(sid) { pushHistory(); setSegments(prev => prev.filter(s => s.id !== sid)); setSelSegId(null) }

  // Déplace le plot `toId` pour que sa distance à `fromId` corresponde à
  // distance_m selon l'échelle fixe, en conservant la direction actuelle
  // (fonctionne aussi en diagonale).
  function placeAtDistance(plotsById, fromId, toId, distance_m) {
    const from = plotsById[fromId], to = plotsById[toId]
    if (!from || !to) return
    const dx = to.x - from.x, dy = to.y - from.y
    const curLen = Math.hypot(dx, dy) || 1
    const targetLen = distance_m * SCALE
    const ux = dx / curLen, uy = dy / curLen
    plotsById[toId] = { ...to, x: clamp(from.x + ux * targetLen), y: clamp(from.y + uy * targetLen) }
  }

  // Applique une distance réelle à un segment, selon l'échelle fixe du schéma,
  // puis propage aux autres segments déjà chiffrés qui partagent un plot avec
  // celui-ci (utile pour un triangle ou un carré tracé point à point) : chaque
  // côté déjà mesuré garde sa longueur en répercutant le déplacement de proche
  // en proche. Sur une forme fermée (ex. le 3e côté d'un triangle), il est
  // géométriquement impossible de garder les trois longueurs ET les positions
  // déjà fixées : la cote de ce dernier côté est alors effacée plutôt que de
  // rester affichée alors qu'elle ne correspond plus au dessin.
  function updateSegmentDistance(sid, value) {
    const distance_m = value ? Number(value) : null
    if (!distance_m || distance_m <= 0) {
      setSegments(prev => prev.map(s => s.id === sid ? { ...s, distance_m: null } : s))
      return
    }
    const seg = segments.find(s => s.id === sid)
    if (!seg) return
    const nextSegments = segments.map(s => s.id === sid ? { ...s, distance_m } : s)
    const plotsById = Object.fromEntries(plots.map(p => [p.id, p]))

    placeAtDistance(plotsById, seg.from, seg.to, distance_m)

    // propagation en largeur à partir du plot qu'on vient de fixer
    const fixed = new Set([seg.from, seg.to])
    let frontier = [seg.to]
    while (frontier.length) {
      const nextFrontier = []
      for (const anchorId of frontier) {
        for (const s2 of nextSegments) {
          if (s2.id === seg.id || s2.distance_m == null) continue
          const otherId = s2.from === anchorId ? s2.to : s2.to === anchorId ? s2.from : null
          if (!otherId || fixed.has(otherId)) continue
          placeAtDistance(plotsById, anchorId, otherId, s2.distance_m)
          fixed.add(otherId)
          nextFrontier.push(otherId)
        }
      }
      frontier = nextFrontier
    }

    // efface les distances devenues incohérentes (les deux extrémités ont été
    // fixées par la propagation sans que ce côté ait pu être satisfait)
    const finalSegments = nextSegments.map(s => {
      if (s.id === seg.id || s.distance_m == null) return s
      const from = plotsById[s.from], to = plotsById[s.to]
      if (!from || !to) return s
      const actualM = Math.hypot(to.x - from.x, to.y - from.y) / SCALE
      return Math.abs(actualM - s.distance_m) > 0.05 ? { ...s, distance_m: null } : s
    })

    setPlots(prev => prev.map(p => plotsById[p.id] || p))
    setSegments(finalSegments)
  }

  function updateRect(rid, patch) { setRects(prev => prev.map(r => r.id === rid ? { ...r, ...patch } : r)) }
  function toggleLockRect(rid) { pushHistory(); setRects(prev => prev.map(r => r.id === rid ? { ...r, verrouille: !r.verrouille } : r)) }
  function deleteRect(rid) {
    const r = rects.find(x => x.id === rid)
    if (r?.verrouille) return
    pushHistory()
    setRects(prev => prev.filter(x => x.id !== rid))
    setSelRects([])
  }
  function bringRectToFront(rid) {
    pushHistory()
    setRects(prev => { const r = prev.find(x => x.id === rid); return r ? [...prev.filter(x => x.id !== rid), r] : prev })
  }
  function sendRectToBack(rid) {
    pushHistory()
    setRects(prev => { const r = prev.find(x => x.id === rid); return r ? [r, ...prev.filter(x => x.id !== rid)] : prev })
  }

  function toggleLockMany(kind) {
    pushHistory()
    if (kind === 'plot') {
      const allLocked = selPlots.every(pid => plots.find(p => p.id === pid)?.verrouille)
      setPlots(prev => prev.map(p => selPlots.includes(p.id) ? { ...p, verrouille: !allLocked } : p))
    } else {
      const allLocked = selRects.every(rid => rects.find(r => r.id === rid)?.verrouille)
      setRects(prev => prev.map(r => selRects.includes(r.id) ? { ...r, verrouille: !allLocked } : r))
    }
  }

  // Applique les cotes réelles (largeur_m/hauteur_m) selon l'échelle fixe du schéma.
  function updateRectDims(rid, patch) {
    setRects(prev => prev.map(r => {
      if (r.id !== rid) return r
      const next = { ...r, ...patch }
      const lm = next.largeur_m, hm = next.hauteur_m
      const w = lm > 0 ? clamp(lm * SCALE, 2, 98) : next.w
      const h = hm > 0 ? clamp(hm * SCALE, 2, 98) : next.h
      return { ...next, w, h }
    }))
  }

  const selectedPlot = selPlots.length === 1 ? plots.find(p => p.id === selPlots[0]) : null
  const selectedSeg = segments.find(s => s.id === selSegId)
  const selectedRect = selRects.length === 1 ? rects.find(r => r.id === selRects[0]) : null
  const allLockedPlots = selPlots.length > 0 && selPlots.every(pid => plots.find(p => p.id === pid)?.verrouille)
  const allLockedRects = selRects.length > 0 && selRects.every(rid => rects.find(r => r.id === rid)?.verrouille)
  const draftRectView = rectDraft ? {
    x: Math.min(rectDraft.x1, rectDraft.x2), y: Math.min(rectDraft.y1, rectDraft.y2),
    w: Math.abs(rectDraft.x2 - rectDraft.x1), h: Math.abs(rectDraft.y2 - rectDraft.y1),
  } : null

  const corners = r => ([
    ['nw', r.x, r.y], ['ne', r.x + r.w, r.y], ['sw', r.x, r.y + r.h], ['se', r.x + r.w, r.y + r.h],
  ])

  async function save() {
    if (!nom.trim()) { alert('Donne un nom au schéma.'); return }
    setSaving(true)
    const payload = {
      nom: nom.trim(), description: description.trim() || null,
      donnees: { plots, segments, rects }, updated_at: new Date().toISOString(),
    }
    const { error } = isNew
      ? await supabase.from('schemas_entrainement').insert(payload)
      : await supabase.from('schemas_entrainement').update(payload).eq('id', schema.id)
    setSaving(false)
    if (error) { alert(error.message); return }
    onSaved()
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={onClose} style={S.backBtn}>← Retour</button>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom du schéma"
          style={S.nomInput} />
      </div>

      <div style={S.body}>
        <div style={S.toolbar}>
          <div style={S.toolGroup}>
            <button onClick={() => { setMode('point'); setLinkFirstId(null) }}
              style={{ ...S.modeBtn, ...(mode === 'point' ? S.modeBtnActive : {}) }}>✛ Points</button>
            <button onClick={() => { setMode('rect'); setLinkFirstId(null) }}
              style={{ ...S.modeBtn, ...(mode === 'rect' ? S.modeBtnActive : {}) }}>▭ Zone</button>
            <button onClick={() => { setMode('lien'); setSelPlots([]); setSelRects([]); setSelSegId(null) }}
              style={{ ...S.modeBtn, ...(mode === 'lien' ? S.modeBtnActive : {}) }}>
              ⟋ Relier {linkFirstId ? '· choisis le 2e plot' : ''}
            </button>
          </div>
          <div style={S.toolGroup}>
            <input type="color" value={nextColor} onChange={e => setNextColor(e.target.value)} style={S.colorInput} />
          </div>
          <div style={S.toolGroup}>
            <button onClick={() => setNextStyle('plein')} style={{ ...S.styleBtn, ...(nextStyle === 'plein' ? S.styleBtnActive : {}) }}>― plein</button>
            <button onClick={() => setNextStyle('pointille')} style={{ ...S.styleBtn, ...(nextStyle === 'pointille' ? S.styleBtnActive : {}) }}>┄ pointillé</button>
            {mode === 'rect' && (
              <button onClick={() => setNextRempli(v => !v)} style={{ ...S.styleBtn, ...(nextRempli ? S.styleBtnActive : {}) }}>▨ rempli</button>
            )}
          </div>
          <div style={{ ...S.toolGroup, marginLeft: 'auto' }}>
            <button onClick={undo} disabled={!undoStack.current.length} style={{ ...S.iconBtn, opacity: undoStack.current.length ? 1 : 0.35 }} title="Annuler (Ctrl+Z)"><IconUndo /></button>
            <button onClick={redo} disabled={!redoStack.current.length} style={{ ...S.iconBtn, opacity: redoStack.current.length ? 1 : 0.35 }} title="Rétablir (Ctrl+Maj+Z)"><IconRedo /></button>
          </div>
        </div>

        <div style={S.canvasWrap}>
          <svg ref={svgRef} viewBox="0 0 100 100" style={{ ...S.canvas, cursor: mode === 'lien' ? 'pointer' : mode === 'rect' ? 'crosshair' : 'default' }}
            onClick={handleCanvasClick}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}>
            <rect data-bg="1" x="0" y="0" width="100" height="100" fill={FIELD_COLOR} />

            {snapGuides.x !== null && <line x1={snapGuides.x} y1="0" x2={snapGuides.x} y2="100" stroke="#1f2937" strokeWidth="0.35" strokeDasharray="1.5,1.2" />}
            {snapGuides.y !== null && <line x1="0" y1={snapGuides.y} x2="100" y2={snapGuides.y} stroke="#1f2937" strokeWidth="0.35" strokeDasharray="1.5,1.2" />}

            {rects.map(r => {
              const isSel = selRects.includes(r.id)
              const isSolo = selRects.length === 1 && selRects[0] === r.id
              return (
                <g key={r.id}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h}
                    fill={r.rempli ? r.couleur : 'transparent'} fillOpacity={r.rempli ? 0.22 : 0}
                    stroke={isSel ? '#1f2937' : r.couleur} strokeWidth={isSel ? 1 : 0.7}
                    strokeDasharray={r.style === 'pointille' ? '2.4,1.6' : undefined}
                    onPointerDown={e => handleRectPointerDown(e, r.id)}
                    style={{ cursor: r.verrouille ? 'not-allowed' : (mode === 'rect' || mode === 'point') ? 'move' : 'default' }} />
                  {r.largeur_m > 0 && (
                    <text x={r.x + r.w / 2} y={r.y - 0.5} fontSize="2.1" fill="#1f2937" textAnchor="middle" fontWeight="700"
                      style={{ paintOrder: 'stroke', stroke: FIELD_COLOR, strokeWidth: 1, pointerEvents: 'none' }}>
                      {r.largeur_m}m
                    </text>
                  )}
                  {r.hauteur_m > 0 && (
                    <text x={r.x - 0.5} y={r.y + r.h / 2} fontSize="2.1" fill="#1f2937" textAnchor="middle" fontWeight="700"
                      transform={`rotate(-90 ${r.x - 0.5} ${r.y + r.h / 2})`}
                      style={{ paintOrder: 'stroke', stroke: FIELD_COLOR, strokeWidth: 1, pointerEvents: 'none' }}>
                      {r.hauteur_m}m
                    </text>
                  )}
                  {r.verrouille && <LockBadge x={r.x + 2.5} y={r.y + 2.5} />}
                  {isSolo && !r.verrouille && corners(r).map(([c, cx, cy]) => (
                    <rect key={c} x={cx - 1.4} y={cy - 1.4} width="2.8" height="2.8" fill="#fff" stroke="#1f2937" strokeWidth="0.6"
                      onPointerDown={e => handleResizePointerDown(e, r.id, c)}
                      style={{ cursor: (c === 'nw' || c === 'se') ? 'nwse-resize' : 'nesw-resize' }} />
                  ))}
                </g>
              )
            })}

            {draftRectView && (
              <rect x={draftRectView.x} y={draftRectView.y} width={draftRectView.w} height={draftRectView.h}
                fill={nextColor} fillOpacity="0.2" stroke={nextColor} strokeWidth="0.8" strokeDasharray="2,1.4" />
            )}

            {segments.map(seg => {
              const from = plots.find(p => p.id === seg.from)
              const to = plots.find(p => p.id === seg.to)
              if (!from || !to) return null
              const dx = to.x - from.x, dy = to.y - from.y
              const len = Math.hypot(dx, dy) || 1
              const nx = -dy / len, ny = dx / len
              const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2
              const labelX = midX + nx * 4.5, labelY = midY + ny * 4.5
              const isSel = selSegId === seg.id
              return (
                <g key={seg.id} onClick={e => { e.stopPropagation(); setSelSegId(seg.id); setSelPlots([]); setSelRects([]) }}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth="4" />
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={isSel ? '#1f2937' : '#374151'} strokeWidth={isSel ? 0.8 : 0.5}
                    strokeDasharray={seg.style === 'pointille' ? '3,2' : undefined} />
                  {seg.distance_m != null && (
                    <text x={labelX} y={labelY} fontSize="2.1" fill="#1f2937" textAnchor="middle" fontWeight="700"
                      style={{ paintOrder: 'stroke', stroke: FIELD_COLOR, strokeWidth: 1 }}>{seg.distance_m}m</text>
                  )}
                </g>
              )
            })}
            {plots.map(p => {
              const isSel = selPlots.includes(p.id)
              const isSolo = selPlots.length === 1 && selPlots[0] === p.id
              const rayon = p.rayon || DEFAULT_RAYON
              return (
                <g key={p.id} onPointerDown={e => handlePlotPointerDown(e, p.id)} style={{ cursor: p.verrouille ? 'not-allowed' : mode === 'lien' ? 'pointer' : 'grab' }}>
                  {/* cible tactile invisible, plus large que le point visible pour rester facile à saisir au doigt */}
                  <circle cx={p.x} cy={p.y} r={Math.max(5, rayon + 2)} fill="transparent" />
                  <circle cx={p.x} cy={p.y} r={rayon} fill={p.couleur}
                    stroke={isSel || linkFirstId === p.id ? '#1f2937' : '#fff'}
                    strokeWidth={isSel || linkFirstId === p.id ? 0.9 : 0.4} />
                  <text x={p.x} y={p.y - rayon - 1.2} fontSize="2.4" fill="#1f2937" textAnchor="middle" fontWeight="800"
                    style={{ paintOrder: 'stroke', stroke: FIELD_COLOR, strokeWidth: 1, pointerEvents: 'none' }}>{p.label}</text>
                  {p.verrouille && <LockBadge x={p.x + rayon + 1.6} y={p.y - rayon - 1.6} size={2.8} />}
                  {isSolo && !p.verrouille && mode === 'point' && (
                    <rect x={p.x + rayon * 0.7071 - 1.1} y={p.y - rayon * 0.7071 - 1.1} width="2.2" height="2.2"
                      fill="#fff" stroke="#1f2937" strokeWidth="0.6"
                      onPointerDown={e => handlePlotResizePointerDown(e, p.id)}
                      style={{ cursor: 'nesw-resize' }} />
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {selectedPlot && (
          <div style={S.editPanel}>
            <input value={selectedPlot.label} disabled={selectedPlot.verrouille} onFocus={pushHistory}
              onChange={e => renamePlot(selectedPlot.id, e.target.value)} style={S.editLabelInput} />
            <input type="color" value={selectedPlot.couleur} disabled={selectedPlot.verrouille} onFocus={pushHistory}
              onChange={e => recolorPlot(selectedPlot.id, e.target.value)} style={S.colorInput} />
            <button onClick={() => toggleLockPlot(selectedPlot.id)} style={{ ...S.iconBtn, ...(selectedPlot.verrouille ? S.iconBtnActive : {}) }}
              title={selectedPlot.verrouille ? 'Déverrouiller' : 'Verrouiller'}><IconLock locked={selectedPlot.verrouille} /></button>
            <button onClick={duplicateSelection} disabled={selectedPlot.verrouille} style={S.iconBtn} title="Dupliquer (Ctrl+D)"><IconDuplicate /></button>
            <button onClick={() => deletePlot(selectedPlot.id)} disabled={selectedPlot.verrouille} style={{ ...S.deleteBtn, opacity: selectedPlot.verrouille ? 0.4 : 1 }}>Supprimer</button>
          </div>
        )}

        {selPlots.length > 1 && (
          <div style={S.editPanel}>
            <span style={S.multiLabel}>{selPlots.length} points sélectionnés</span>
            <button onClick={() => toggleLockMany('plot')} style={{ ...S.iconBtn, ...(allLockedPlots ? S.iconBtnActive : {}) }}
              title={allLockedPlots ? 'Déverrouiller' : 'Verrouiller'}><IconLock locked={allLockedPlots} /></button>
            <button onClick={duplicateSelection} style={S.iconBtn} title="Dupliquer (Ctrl+D)"><IconDuplicate /></button>
            <button onClick={deleteSelection} style={S.deleteBtn}>Supprimer</button>
          </div>
        )}

        {selectedSeg && (
          <div style={S.editPanel}>
            <input type="number" min="0" placeholder="Distance (m)" value={selectedSeg.distance_m ?? ''} onFocus={pushHistory}
              onChange={e => updateSegmentDistance(selectedSeg.id, e.target.value)}
              style={S.editLabelInput} />
            <div style={S.toolGroup}>
              <button onClick={() => { pushHistory(); updateSegment(selectedSeg.id, { style: 'plein' }) }} style={{ ...S.styleBtn, ...(selectedSeg.style === 'plein' ? S.styleBtnActive : {}) }}>― plein</button>
              <button onClick={() => { pushHistory(); updateSegment(selectedSeg.id, { style: 'pointille' }) }} style={{ ...S.styleBtn, ...(selectedSeg.style === 'pointille' ? S.styleBtnActive : {}) }}>┄ pointillé</button>
            </div>
            <button onClick={() => deleteSegment(selectedSeg.id)} style={S.deleteBtn}>Supprimer</button>
          </div>
        )}

        {selectedRect && (
          <div style={S.editPanel}>
            <input type="number" min="0" placeholder="Largeur (m)" value={selectedRect.largeur_m ?? ''} disabled={selectedRect.verrouille} onFocus={pushHistory}
              onChange={e => updateRectDims(selectedRect.id, { largeur_m: e.target.value ? Number(e.target.value) : null })}
              style={{ ...S.editLabelInput, minWidth: 70 }} />
            <input type="number" min="0" placeholder="Hauteur (m)" value={selectedRect.hauteur_m ?? ''} disabled={selectedRect.verrouille} onFocus={pushHistory}
              onChange={e => updateRectDims(selectedRect.id, { hauteur_m: e.target.value ? Number(e.target.value) : null })}
              style={{ ...S.editLabelInput, minWidth: 70 }} />
            <input type="color" value={selectedRect.couleur} disabled={selectedRect.verrouille} onFocus={pushHistory}
              onChange={e => updateRect(selectedRect.id, { couleur: e.target.value })} style={S.colorInput} />
            <div style={S.toolGroup}>
              <button onClick={() => { pushHistory(); updateRect(selectedRect.id, { style: 'plein' }) }} style={{ ...S.styleBtn, ...(selectedRect.style === 'plein' ? S.styleBtnActive : {}) }}>― plein</button>
              <button onClick={() => { pushHistory(); updateRect(selectedRect.id, { style: 'pointille' }) }} style={{ ...S.styleBtn, ...(selectedRect.style === 'pointille' ? S.styleBtnActive : {}) }}>┄ pointillé</button>
              <button onClick={() => { pushHistory(); updateRect(selectedRect.id, { rempli: !selectedRect.rempli }) }} style={{ ...S.styleBtn, ...(selectedRect.rempli ? S.styleBtnActive : {}) }}>▨ rempli</button>
            </div>
            <button onClick={() => sendRectToBack(selectedRect.id)} style={S.iconBtn} title="Arrière-plan"><IconBack /></button>
            <button onClick={() => bringRectToFront(selectedRect.id)} style={S.iconBtn} title="Premier plan"><IconFront /></button>
            <button onClick={() => toggleLockRect(selectedRect.id)} style={{ ...S.iconBtn, ...(selectedRect.verrouille ? S.iconBtnActive : {}) }}
              title={selectedRect.verrouille ? 'Déverrouiller' : 'Verrouiller'}><IconLock locked={selectedRect.verrouille} /></button>
            <button onClick={duplicateSelection} disabled={selectedRect.verrouille} style={S.iconBtn} title="Dupliquer (Ctrl+D)"><IconDuplicate /></button>
            <button onClick={() => deleteRect(selectedRect.id)} disabled={selectedRect.verrouille} style={{ ...S.deleteBtn, opacity: selectedRect.verrouille ? 0.4 : 1 }}>Supprimer</button>
          </div>
        )}

        {selRects.length > 1 && (
          <div style={S.editPanel}>
            <span style={S.multiLabel}>{selRects.length} zones sélectionnées</span>
            <button onClick={() => toggleLockMany('rect')} style={{ ...S.iconBtn, ...(allLockedRects ? S.iconBtnActive : {}) }}
              title={allLockedRects ? 'Déverrouiller' : 'Verrouiller'}><IconLock locked={allLockedRects} /></button>
            <button onClick={duplicateSelection} style={S.iconBtn} title="Dupliquer (Ctrl+D)"><IconDuplicate /></button>
            <button onClick={deleteSelection} style={S.deleteBtn}>Supprimer</button>
          </div>
        )}

        <p style={S.hint}>
          Maj+clic pour sélectionner plusieurs éléments · flèches du clavier pour ajuster la position · Ctrl+D dupliquer · Ctrl+Z annuler
        </p>

        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Description" rows={2} style={S.descInput} />

        <div style={S.footer}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer dans la bibliothèque'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  page: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: '100vh', background: '#f5f6f8' },
  header: { display: 'flex', gap: 12, alignItems: 'center', padding: '1rem 1.25rem', background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#374151', fontWeight: 700, fontSize: '0.85rem', padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap' },
  nomInput: { flex: 1, fontSize: '1.15rem', fontWeight: 800, border: 'none', borderBottom: '2px solid #e5e7eb', padding: '4px 2px', outline: 'none', fontFamily: 'inherit', background: 'transparent' },
  body: { maxWidth: 1000, margin: '0 auto', padding: '1.25rem' },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 10, padding: '10px 12px', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12 },
  toolGroup: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  modeBtn: { padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  modeBtnActive: { background: '#333333', color: '#e4f816', borderColor: '#333333' },
  colorInput: { width: 32, height: 28, padding: 0, border: '1.5px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', background: 'none' },
  styleBtn: { padding: '5px 9px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' },
  styleBtnActive: { background: '#333333', color: '#e4f816', borderColor: '#333333' },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', flexShrink: 0 },
  iconBtnActive: { background: '#333333', color: '#e4f816', border: '1.5px solid #333333' },
  canvasWrap: { border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 10, background: '#fff' },
  canvas: { width: '100%', height: '68vh', minHeight: 420, maxHeight: 700, display: 'block', touchAction: 'none' },
  editPanel: { display: 'flex', gap: 8, alignItems: 'center', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', marginBottom: 10, flexWrap: 'wrap' },
  editLabelInput: { flex: 1, minWidth: 90, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '5px 8px', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit' },
  multiLabel: { fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginRight: 'auto' },
  deleteBtn: { background: 'none', border: 'none', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  descInput: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', fontSize: '0.82rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 12, background: '#fff' },
  hint: { fontSize: '0.68rem', color: '#9ca3af', fontWeight: 600, margin: '0 0 10px' },
  footer: { display: 'flex', gap: 8, paddingBottom: '1.5rem' },
  btnPrimary: { flex: 1, background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.75rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' },
  btnSecondary: { flex: 1, background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.75rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' },
}
