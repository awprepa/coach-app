import { useEffect, useRef, useState, useCallback } from 'react'

// Éditeur de schéma de terrain (plots, flèches directionnelles, zones) pour les
// blocs de séance terrain. Remplace l'ancien SchemaEditorPage/SchemaSVG pour ce
// cas d'usage : flèches avec tête (le sens de course est l'information clé),
// icônes cohérentes, surfaces réalistes (gazon rugby / piste / salle).
//
// `value` / `onChange` portent la forme { surface, plots, arrows, zones } —
// voir SchemaTerrainView.js pour le rendu lecture seule côté client.

const PALETTE = ['#f2c94c', '#eb5757', '#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#f5f7fa', '#1a1d21']
const SURFACES = { gazon: 'Gazon', piste: 'Piste', salle: 'Salle', vierge: 'Vierge' }

function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
function nextLabel(plots) {
  const nums = plots.map(p => parseInt((p.label || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n))
  return 'P' + ((nums.length ? Math.max(...nums) : 0) + 1)
}

export function surfaceDefs() {
  return `
    <pattern id="surf-gazon" width="12.5" height="25" patternUnits="userSpaceOnUse">
      <rect width="12.5" height="25" fill="#3c7d45"/>
      <rect width="12.5" height="12.5" fill="#427f49"/>
    </pattern>
    <pattern id="surf-piste" width="100" height="100" patternUnits="userSpaceOnUse">
      <rect width="100" height="100" fill="#a1472b"/>
    </pattern>
    <pattern id="surf-salle" width="100" height="100" patternUnits="userSpaceOnUse">
      <rect width="100" height="100" fill="#cdae7c"/>
    </pattern>
    <pattern id="surf-vierge" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#eef0ec"/>
      <path d="M10 0H0V10" fill="none" stroke="#dcdfd7" stroke-width="0.25"/>
    </pattern>
  `
}

export function markerDefs() {
  return PALETTE.concat(['#1a1d21']).map((c, i) => `
    <marker id="arrow-${i}" markerWidth="3" markerHeight="3" refX="2.6" refY="1.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0.2 L3,1.5 L0,2.8 Z" fill="${c}"/>
    </marker>
  `).join('')
}
function markerIdFor(color) {
  const idx = PALETTE.concat(['#1a1d21']).indexOf(color)
  return idx >= 0 ? idx : PALETTE.length
}

export function surfaceMarkings(surface) {
  if (surface === 'gazon') {
    const L = '#f4f5f2', op = 0.6
    return `
      <rect x="3" y="3" width="94" height="94" fill="none" stroke="${L}" stroke-width="0.4" opacity="${op}"/>
      <line x1="3" y1="50" x2="97" y2="50" stroke="${L}" stroke-width="0.32" opacity="${op}"/>
      <line x1="3" y1="40" x2="97" y2="40" stroke="${L}" stroke-width="0.26" opacity="${op}" stroke-dasharray="1.4,1"/>
      <line x1="3" y1="60" x2="97" y2="60" stroke="${L}" stroke-width="0.26" opacity="${op}" stroke-dasharray="1.4,1"/>
      <line x1="3" y1="24" x2="97" y2="24" stroke="${L}" stroke-width="0.3" opacity="${op}"/>
      <line x1="3" y1="76" x2="97" y2="76" stroke="${L}" stroke-width="0.3" opacity="${op}"/>
      <line x1="3" y1="13" x2="97" y2="13" stroke="${L}" stroke-width="0.34" opacity="${op}"/>
      <line x1="3" y1="87" x2="97" y2="87" stroke="${L}" stroke-width="0.34" opacity="${op}"/>
      <g opacity="${op}"><line x1="46" y1="9" x2="46" y2="13" stroke="${L}" stroke-width="0.6"/><line x1="54" y1="9" x2="54" y2="13" stroke="${L}" stroke-width="0.6"/><line x1="46" y1="10.6" x2="54" y2="10.6" stroke="${L}" stroke-width="0.5"/></g>
      <g opacity="${op}"><line x1="46" y1="87" x2="46" y2="91" stroke="${L}" stroke-width="0.6"/><line x1="54" y1="87" x2="54" y2="91" stroke="${L}" stroke-width="0.6"/><line x1="46" y1="89.4" x2="54" y2="89.4" stroke="${L}" stroke-width="0.5"/></g>
    `
  }
  if (surface === 'piste') {
    let html = ''
    for (let i = 1; i <= 6; i++) html += `<line x1="0" y1="${i * 100 / 7}" x2="100" y2="${i * 100 / 7}" stroke="#ece2d6" stroke-width="0.25" opacity="0.55"/>`
    return html
  }
  if (surface === 'salle') {
    return `<rect x="4" y="4" width="92" height="92" fill="none" stroke="#a9835a" stroke-width="0.35" opacity="0.6"/>`
  }
  return ''
}

const DEFAULT_SCHEMA = { surface: 'gazon', plots: [], arrows: [], zones: [] }

export default function SchemaTerrainEditor({ value, onChange }) {
  const schema = value || DEFAULT_SCHEMA
  const [tool, setTool] = useState('select')
  const [plotColor, setPlotColor] = useState(PALETTE[0])
  const [arrowColor, setArrowColor] = useState('#1a1d21')
  const [arrowStyle, setArrowStyle] = useState('plein')
  const [selection, setSelection] = useState(null)
  const [drawStart, setDrawStart] = useState(null)
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const historyRef = useRef([])
  const futureRef = useRef([])
  const [, forceTick] = useState(0)

  function patch(next) { onChange({ ...schema, ...next }) }

  function pushHistory() {
    historyRef.current.push({ plots: schema.plots, arrows: schema.arrows, zones: schema.zones })
    if (historyRef.current.length > 50) historyRef.current.shift()
    futureRef.current = []
    forceTick(t => t + 1)
  }
  function undo() {
    if (!historyRef.current.length) return
    futureRef.current.push({ plots: schema.plots, arrows: schema.arrows, zones: schema.zones })
    const prev = historyRef.current.pop()
    setSelection(null)
    patch(prev)
    forceTick(t => t + 1)
  }
  function redo() {
    if (!futureRef.current.length) return
    historyRef.current.push({ plots: schema.plots, arrows: schema.arrows, zones: schema.zones })
    const next = futureRef.current.pop()
    setSelection(null)
    patch(next)
    forceTick(t => t + 1)
  }

  function svgPoint(e) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: Math.max(0, Math.min(100, loc.x)), y: Math.max(0, Math.min(100, loc.y)) }
  }

  const onPointerDown = useCallback((e) => {
    const target = e.target.closest('[data-kind]')
    const p = svgPoint(e)

    if (target) {
      const kind = target.getAttribute('data-kind')
      const id = target.getAttribute('data-id')
      setSelection({ type: kind, id })

      if (kind === 'plot' && tool === 'arrow') {
        const plot = schema.plots.find(x => x.id === id)
        setDrawStart({ x: plot.x, y: plot.y })
        return
      }
      if (kind === 'plot' && (tool === 'select' || tool === 'plot')) {
        dragRef.current = { kind: 'plot-move', id, historyPushed: false }
        return
      }
      return
    }

    setSelection(null)

    if (tool === 'plot') {
      pushHistory()
      const plot = { id: uid('p'), x: p.x, y: p.y, color: plotColor, label: nextLabel(schema.plots) }
      patch({ plots: [...schema.plots, plot] })
      setSelection({ type: 'plot', id: plot.id })
      return
    }
    if (tool === 'arrow') {
      setDrawStart({ x: p.x, y: p.y })
      return
    }
    if (tool === 'zone') {
      dragRef.current = { kind: 'zone-draft', x1: p.x, y1: p.y, x2: p.x, y2: p.y }
      forceTick(t => t + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, plotColor, schema])

  const onPointerMove = useCallback((e) => {
    const p = svgPoint(e)
    if (dragRef.current && dragRef.current.kind === 'plot-move') {
      if (!dragRef.current.historyPushed) { pushHistory(); dragRef.current.historyPushed = true }
      patch({ plots: schema.plots.map(pl => pl.id === dragRef.current.id ? { ...pl, x: p.x, y: p.y } : pl) })
    } else if (dragRef.current && dragRef.current.kind === 'zone-draft') {
      dragRef.current.x2 = p.x; dragRef.current.y2 = p.y
      forceTick(t => t + 1)
    } else if (drawStart) {
      setDrawStart(s => ({ ...s, cur: p }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, drawStart])

  const onPointerUp = useCallback((e) => {
    if (dragRef.current && dragRef.current.kind === 'plot-move') {
      dragRef.current = null
    } else if (dragRef.current && dragRef.current.kind === 'zone-draft') {
      const d = dragRef.current
      const x = Math.min(d.x1, d.x2), y = Math.min(d.y1, d.y2)
      const w = Math.abs(d.x2 - d.x1), h = Math.abs(d.y2 - d.y1)
      if (w > 2 && h > 2) {
        pushHistory()
        const zone = { id: uid('z'), x, y, w, h, color: arrowColor }
        patch({ zones: [...schema.zones, zone] })
        setSelection({ type: 'zone', id: zone.id })
      }
      dragRef.current = null
      forceTick(t => t + 1)
    } else if (drawStart) {
      const target = e.target.closest('[data-kind="plot"]')
      const endPlot = target ? schema.plots.find(x => x.id === target.getAttribute('data-id')) : null
      const p = svgPoint(e)
      const x2 = endPlot ? endPlot.x : p.x, y2 = endPlot ? endPlot.y : p.y
      const dist = Math.hypot(x2 - drawStart.x, y2 - drawStart.y)
      if (dist > 2) {
        pushHistory()
        const arrow = { id: uid('a'), x1: drawStart.x, y1: drawStart.y, x2, y2, color: arrowColor, style: arrowStyle, distance: null }
        patch({ arrows: [...schema.arrows, arrow] })
        setSelection({ type: 'arrow', id: arrow.id })
      }
      setDrawStart(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, drawStart, arrowColor, arrowStyle])

  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault()
        pushHistory()
        if (selection.type === 'plot') patch({ plots: schema.plots.filter(x => x.id !== selection.id) })
        if (selection.type === 'arrow') patch({ arrows: schema.arrows.filter(x => x.id !== selection.id) })
        if (selection.type === 'zone') patch({ zones: schema.zones.filter(x => x.id !== selection.id) })
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, schema])

  function deleteSelected() {
    if (!selection) return
    pushHistory()
    if (selection.type === 'plot') patch({ plots: schema.plots.filter(x => x.id !== selection.id) })
    if (selection.type === 'arrow') patch({ arrows: schema.arrows.filter(x => x.id !== selection.id) })
    if (selection.type === 'zone') patch({ zones: schema.zones.filter(x => x.id !== selection.id) })
    setSelection(null)
  }

  const selectedPlot = selection?.type === 'plot' ? schema.plots.find(p => p.id === selection.id) : null
  const selectedArrow = selection?.type === 'arrow' ? schema.arrows.find(a => a.id === selection.id) : null
  const selectedZone = selection?.type === 'zone' ? schema.zones.find(z => z.id === selection.id) : null
  const zoneDraft = dragRef.current?.kind === 'zone-draft' ? dragRef.current : null

  return (
    <div style={S.wrap}>
      <div style={S.topbar}>
        <div style={S.pills}>
          {Object.entries(SURFACES).map(([key, label]) => (
            <button key={key} onClick={() => patch({ surface: key })} style={{ ...S.pill, ...(schema.surface === key ? S.pillOn : {}) }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={undo} disabled={!historyRef.current.length} style={{ ...S.iconBtn, opacity: historyRef.current.length ? 1 : 0.35 }} title="Annuler (Ctrl+Z)"><IcoUndo /></button>
        <button onClick={redo} disabled={!futureRef.current.length} style={{ ...S.iconBtn, opacity: futureRef.current.length ? 1 : 0.35 }} title="Rétablir"><IcoRedo /></button>
      </div>

      {(tool === 'plot' || tool === 'arrow' || tool === 'zone') && (
        <div style={S.ctxbar}>
          <span style={S.ctxLabel}>{tool === 'plot' ? 'Couleur du plot' : tool === 'arrow' ? 'Couleur de la flèche' : 'Couleur de la zone'}</span>
          <div style={S.swatchRow}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => tool === 'plot' ? setPlotColor(c) : setArrowColor(c)}
                style={{ ...S.swatch, background: c, ...((tool === 'plot' ? plotColor : arrowColor) === c ? S.swatchOn : {}) }} />
            ))}
          </div>
          {tool === 'arrow' && (
            <div style={S.styleToggle}>
              {['plein', 'pointille'].map(st => (
                <button key={st} onClick={() => setArrowStyle(st)} style={{ ...S.styleBtn, ...(arrowStyle === st ? S.styleBtnOn : {}) }}>
                  {st === 'plein' ? '— plein' : '┄ pointillé'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={S.body}>
        <div style={S.rail}>
          {[
            { key: 'select', title: 'Sélection', icon: <path d="M5 3l14 7-6 2-2 6-6-15Z" /> },
            { key: 'plot', title: 'Plot', icon: <circle cx="12" cy="12" r="6" /> },
            { key: 'arrow', title: 'Flèche', icon: <><path d="M5 19 19 5" /><path d="M9 5h10v10" /></> },
            { key: 'zone', title: 'Zone', icon: <rect x="4" y="4" width="16" height="16" rx="2" /> },
          ].map(t => (
            <button key={t.key} title={t.title} onClick={() => { setTool(t.key); setSelection(null) }}
              style={{ ...S.railBtn, ...(tool === t.key ? S.railBtnOn : {}) }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            </button>
          ))}
        </div>

        <div style={S.canvasWrap}>
          <svg
            ref={svgRef} viewBox="0 0 100 100" width="100%" height="100%"
            style={{ display: 'block', cursor: tool === 'arrow' ? 'crosshair' : tool === 'zone' ? 'crosshair' : 'default' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          >
            <defs dangerouslySetInnerHTML={{ __html: surfaceDefs() + markerDefs() }} />
            <rect data-bg="1" x="0" y="0" width="100" height="100" fill={`url(#surf-${schema.surface})`} />
            <g dangerouslySetInnerHTML={{ __html: surfaceMarkings(schema.surface) }} />

            {schema.zones.map(z => {
              const isSel = selection?.type === 'zone' && selection.id === z.id
              return (
                <rect key={z.id} data-id={z.id} data-kind="zone" x={z.x} y={z.y} width={z.w} height={z.h}
                  fill={z.color} fillOpacity={0.22} stroke={isSel ? '#ffffff' : z.color} strokeWidth={isSel ? 1 : 0.6}
                  style={{ cursor: 'pointer' }} />
              )
            })}

            {schema.arrows.map(a => {
              const isSel = selection?.type === 'arrow' && selection.id === a.id
              const dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.hypot(dx, dy) || 1
              const nx = -dy / len, ny = dx / len
              const midX = (a.x1 + a.x2) / 2, midY = (a.y1 + a.y2) / 2
              const labelX = midX + nx * 4.6, labelY = midY + ny * 4.6
              return (
                <g key={a.id} data-id={a.id} data-kind="arrow" style={{ cursor: 'pointer' }}>
                  <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth="3.5" />
                  <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={isSel ? '#ffffff' : a.color}
                    strokeWidth={isSel ? 0.75 : 0.55} strokeLinecap="round"
                    strokeDasharray={a.style === 'pointille' ? '2,1.6' : undefined}
                    markerEnd={`url(#arrow-${markerIdFor(a.color)})`} />
                  {a.distance != null && (
                    <>
                      <rect x={labelX - 5} y={labelY - 2.1} width="10" height="4.2" rx="2.1" fill="#14161a" fillOpacity="0.82" />
                      <text x={labelX} y={labelY + 0.9} fontSize="2.5" fontWeight="700" fill="#ffffff" textAnchor="middle">{a.distance} m</text>
                    </>
                  )}
                </g>
              )
            })}

            {schema.plots.map(p => {
              const isSel = selection?.type === 'plot' && selection.id === p.id
              const labelW = Math.max(7, p.label.length * 2.3 + 2.4)
              return (
                <g key={p.id} data-id={p.id} data-kind="plot" style={{ cursor: 'grab' }}>
                  <circle cx={p.x} cy={p.y + 0.22} r="1.9" fill="rgba(0,0,0,0.28)" />
                  <circle cx={p.x} cy={p.y} r="1.85" fill={p.color} stroke={isSel ? '#ffffff' : 'rgba(0,0,0,0.18)'} strokeWidth={isSel ? 0.6 : 0.32} />
                  <rect x={p.x - labelW / 2} y={p.y - 6.3} width={labelW} height="3.7" rx="1.85" fill="#14161a" fillOpacity="0.82" />
                  <text x={p.x} y={p.y - 3.75} fontSize="2.3" fontWeight="700" fill="#ffffff" textAnchor="middle">{p.label}</text>
                </g>
              )
            })}

            {drawStart && (
              <line x1={drawStart.x} y1={drawStart.y} x2={drawStart.cur?.x ?? drawStart.x} y2={drawStart.cur?.y ?? drawStart.y}
                stroke={arrowColor} strokeWidth="0.7" strokeDasharray="1.6,1.2" markerEnd={`url(#arrow-${markerIdFor(arrowColor)})`} />
            )}
            {zoneDraft && (
              <rect x={Math.min(zoneDraft.x1, zoneDraft.x2)} y={Math.min(zoneDraft.y1, zoneDraft.y2)}
                width={Math.abs(zoneDraft.x2 - zoneDraft.x1)} height={Math.abs(zoneDraft.y2 - zoneDraft.y1)}
                fill={arrowColor} fillOpacity="0.15" stroke={arrowColor} strokeWidth="0.7" strokeDasharray="1.6,1.2" />
            )}
          </svg>
        </div>

        <div style={S.inspector}>
          {!selection && (
            <p style={S.hint}>Plot pour poser un point, Flèche pour tracer le sens de course (glisser d'un plot à un autre), Zone pour une surface. Suppr pour effacer, Ctrl+Z pour annuler.</p>
          )}
          {selectedPlot && (
            <>
              <label style={S.fieldLabel}>Étiquette</label>
              <input value={selectedPlot.label} onChange={e => patch({ plots: schema.plots.map(p => p.id === selectedPlot.id ? { ...p, label: e.target.value } : p) })} style={S.fieldInput} />
              <label style={S.fieldLabel}>Couleur</label>
              <div style={S.swatchGrid}>
                {PALETTE.map(c => (
                  <button key={c} onClick={() => { pushHistory(); patch({ plots: schema.plots.map(p => p.id === selectedPlot.id ? { ...p, color: c } : p) }) }}
                    style={{ ...S.swatchBig, background: c, ...(selectedPlot.color === c ? S.swatchBigOn : {}) }} />
                ))}
              </div>
              <button onClick={deleteSelected} style={S.btnDelete}>Supprimer le plot</button>
            </>
          )}
          {selectedArrow && (
            <>
              <label style={S.fieldLabel}>Couleur</label>
              <div style={S.swatchGrid}>
                {PALETTE.map(c => (
                  <button key={c} onClick={() => { pushHistory(); patch({ arrows: schema.arrows.map(a => a.id === selectedArrow.id ? { ...a, color: c } : a) }) }}
                    style={{ ...S.swatchBig, background: c, ...(selectedArrow.color === c ? S.swatchBigOn : {}) }} />
                ))}
              </div>
              <label style={S.fieldLabel}>Distance (m)</label>
              <input type="number" min="0" step="0.5" value={selectedArrow.distance ?? ''} placeholder="Non renseignée"
                onChange={e => patch({ arrows: schema.arrows.map(a => a.id === selectedArrow.id ? { ...a, distance: e.target.value ? Number(e.target.value) : null } : a) })}
                style={S.fieldInput} />
              <button onClick={deleteSelected} style={S.btnDelete}>Supprimer la flèche</button>
            </>
          )}
          {selectedZone && (
            <>
              <label style={S.fieldLabel}>Couleur</label>
              <div style={S.swatchGrid}>
                {PALETTE.map(c => (
                  <button key={c} onClick={() => { pushHistory(); patch({ zones: schema.zones.map(z => z.id === selectedZone.id ? { ...z, color: c } : z) }) }}
                    style={{ ...S.swatchBig, background: c, ...(selectedZone.color === c ? S.swatchBigOn : {}) }} />
                ))}
              </div>
              <button onClick={deleteSelected} style={S.btnDelete}>Supprimer la zone</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function IcoUndo() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" /></svg>
}
function IcoRedo() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h2" /></svg>
}

const S = {
  wrap: { background: '#14161a', borderRadius: 14, overflow: 'hidden', border: '1px solid #2c3036' },
  topbar: { height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: '#1b1e24', borderBottom: '1px solid #2c3036' },
  pills: { display: 'flex', gap: 2, background: '#21242b', borderRadius: 9, padding: 3 },
  pill: { border: 'none', background: 'none', color: '#a3a9b1', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 7, cursor: 'pointer' },
  pillOn: { background: '#14161a', color: '#eef0f2' },
  iconBtn: { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 8, color: '#878d96', cursor: 'pointer' },

  ctxbar: { height: 42, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', background: '#1b1e24', borderBottom: '1px solid #2c3036' },
  ctxLabel: { fontSize: 11, fontWeight: 700, color: '#5b6067', textTransform: 'uppercase', letterSpacing: '0.06em' },
  swatchRow: { display: 'flex', gap: 6 },
  swatch: { width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', border: '2px solid transparent', padding: 0 },
  swatchOn: { borderColor: '#eef0f2' },
  styleToggle: { display: 'flex', gap: 4, background: '#21242b', borderRadius: 8, padding: 3 },
  styleBtn: { border: 'none', background: 'none', color: '#878d96', fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, cursor: 'pointer' },
  styleBtnOn: { background: '#14161a', color: '#eef0f2' },

  body: { display: 'flex', height: 420 },
  rail: { width: 50, flexShrink: 0, background: '#1b1e24', borderRight: '1px solid #2c3036', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 4 },
  railBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 9, color: '#878d96', cursor: 'pointer' },
  railBtnOn: { background: '#e4f816', color: '#1f2937' },

  canvasWrap: { flex: 1, minWidth: 0, background: '#14161a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 },

  inspector: { width: 220, flexShrink: 0, background: '#1b1e24', borderLeft: '1px solid #2c3036', padding: 14, overflowY: 'auto' },
  hint: { fontSize: 12, color: '#878d96', lineHeight: 1.6, margin: 0 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: '#5b6067', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', margin: '10px 0 6px' },
  fieldInput: { width: '100%', background: '#21242b', border: '1px solid #2c3036', color: '#eef0f2', fontSize: 13, fontWeight: 600, padding: '7px 9px', borderRadius: 8, outline: 'none', boxSizing: 'border-box' },
  swatchGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 },
  swatchBig: { width: '100%', aspectRatio: '1', borderRadius: '50%', cursor: 'pointer', border: '2px solid transparent' },
  swatchBigOn: { borderColor: '#eef0f2' },
  btnDelete: { width: '100%', marginTop: 14, background: 'none', border: '1px solid #2c3036', color: '#ef4444', fontSize: 12.5, fontWeight: 700, padding: 9, borderRadius: 8, cursor: 'pointer' },
}
