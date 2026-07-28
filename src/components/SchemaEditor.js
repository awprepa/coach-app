import { useRef, useState } from 'react'
import { supabase } from '../supabase'

const COULEURS = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2']
const TYPES = [
  { key: 'intermittent_long', label: 'Intermittent long' },
  { key: 'intermittent_court', label: 'Intermittent court' },
  { key: 'agilite', label: 'Agilité' },
  { key: 'autre', label: 'Autre' },
]

function nextLabel(plots) {
  const nums = plots.map(p => parseInt((p.label || '').replace(/\D/g, ''), 10)).filter(n => !isNaN(n))
  const n = nums.length ? Math.max(...nums) + 1 : 1
  return `P${n}`
}

export default function SchemaEditor({ schema, onClose, onSaved }) {
  const isNew = !schema?.id
  const [nom, setNom] = useState(schema?.nom || '')
  const [typeExercice, setTypeExercice] = useState(schema?.type_exercice || 'autre')
  const [description, setDescription] = useState(schema?.description || '')
  const [plots, setPlots] = useState(schema?.donnees?.plots || [])
  const [segments, setSegments] = useState(schema?.donnees?.segments || [])
  const [mode, setMode] = useState('point') // 'point' | 'lien'
  const [linkFirstId, setLinkFirstId] = useState(null)
  const [selectedPlotId, setSelectedPlotId] = useState(null)
  const [selectedSegId, setSelectedSegId] = useState(null)
  const [nextColor, setNextColor] = useState(COULEURS[0])
  const [nextStyle, setNextStyle] = useState('plein')
  const [saving, setSaving] = useState(false)
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const justDraggedRef = useRef(false)

  function svgPoint(e) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 50, y: 50 }
    const loc = pt.matrixTransform(ctm.inverse())
    return { x: Math.max(2, Math.min(98, loc.x)), y: Math.max(2, Math.min(98, loc.y)) }
  }

  function handleCanvasClick(e) {
    if (justDraggedRef.current) return // un drag qui vient de finir ne doit pas créer de point
    if (e.target !== svgRef.current && e.target.tagName !== 'rect') return // clic sur un plot/segment géré ailleurs
    if (mode !== 'point') return
    const { x, y } = svgPoint(e)
    const plot = { id: `p${Date.now()}`, label: nextLabel(plots), x, y, couleur: nextColor }
    setPlots(prev => [...prev, plot])
    setSelectedPlotId(plot.id)
    setSelectedSegId(null)
  }

  function handlePlotPointerDown(e, plotId) {
    e.stopPropagation()
    if (mode === 'lien') {
      if (!linkFirstId) { setLinkFirstId(plotId); return }
      if (linkFirstId === plotId) { setLinkFirstId(null); return }
      const seg = { id: `s${Date.now()}`, from: linkFirstId, to: plotId, distance_m: null, style: nextStyle }
      setSegments(prev => [...prev, seg])
      setLinkFirstId(null)
      setSelectedSegId(seg.id)
      setSelectedPlotId(null)
      return
    }
    setSelectedPlotId(plotId)
    setSelectedSegId(null)
    e.target.setPointerCapture?.(e.pointerId)
    dragRef.current = { id: plotId, moved: false }
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return
    const { x, y } = svgPoint(e)
    dragRef.current.moved = true
    setPlots(prev => prev.map(p => p.id === dragRef.current.id ? { ...p, x, y } : p))
  }

  function handlePointerUp() {
    if (dragRef.current?.moved) {
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
    }
    dragRef.current = null
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

  async function save() {
    if (!nom.trim()) { alert('Donne un nom au schéma.'); return }
    setSaving(true)
    const payload = {
      nom: nom.trim(), type_exercice: typeExercice, description: description.trim() || null,
      donnees: { plots, segments }, updated_at: new Date().toISOString(),
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
            <button onClick={() => { setMode('lien'); setSelectedPlotId(null); setSelectedSegId(null) }}
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
          </div>
        </div>

        <div style={S.canvasWrap}>
          <svg ref={svgRef} viewBox="0 0 100 100" style={S.canvas}
            onClick={handleCanvasClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}>
            <rect x="0" y="0" width="100" height="100" fill="#f3f4e8" />
            {segments.map(seg => {
              const from = plots.find(p => p.id === seg.from)
              const to = plots.find(p => p.id === seg.to)
              if (!from || !to) return null
              const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2
              const isSel = selectedSegId === seg.id
              return (
                <g key={seg.id} onClick={e => { e.stopPropagation(); setSelectedSegId(seg.id); setSelectedPlotId(null) }}>
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="transparent" strokeWidth="4" />
                  <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={isSel ? '#6366f1' : '#374151'} strokeWidth={isSel ? 1.3 : 0.9}
                    strokeDasharray={seg.style === 'pointille' ? '3,2' : undefined} />
                  {seg.distance_m != null && (
                    <text x={midX} y={midY - 2.2} fontSize="3.4" fill="#1f2937" textAnchor="middle" fontWeight="700"
                      style={{ paintOrder: 'stroke', stroke: '#f3f4e8', strokeWidth: 1.2 }}>{seg.distance_m}m</text>
                  )}
                </g>
              )
            })}
            {plots.map(p => (
              <g key={p.id} onPointerDown={e => handlePlotPointerDown(e, p.id)} style={{ cursor: 'grab' }}>
                <circle cx={p.x} cy={p.y} r="3.4" fill={p.couleur}
                  stroke={selectedPlotId === p.id || linkFirstId === p.id ? '#1f2937' : '#fff'}
                  strokeWidth={selectedPlotId === p.id || linkFirstId === p.id ? 1.2 : 0.6} />
                <text x={p.x} y={p.y - 4.6} fontSize="3.4" fill="#1f2937" textAnchor="middle" fontWeight="800"
                  style={{ paintOrder: 'stroke', stroke: '#f3f4e8', strokeWidth: 1.2, pointerEvents: 'none' }}>{p.label}</text>
              </g>
            ))}
          </svg>
          <p style={S.hint}>
            {mode === 'point' ? 'Tape sur le terrain pour poser un plot · glisse un plot pour le déplacer' : 'Tape 2 plots pour les relier'}
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
            <button onClick={() => deletePlot(selectedPlot.id)} style={S.deleteBtn}>Supprimer</button>
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
            <button onClick={() => deleteSegment(selectedSeg.id)} style={S.deleteBtn}>Supprimer</button>
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
  toolGroup: { display: 'flex', gap: 5, alignItems: 'center' },
  modeBtn: { padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  modeBtnActive: { background: '#4338ca', color: '#fff', borderColor: '#4338ca' },
  colorSwatch: { width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', padding: 0 },
  styleBtn: { padding: '5px 9px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' },
  styleBtnActive: { background: '#1f2937', color: '#fff', borderColor: '#1f2937' },
  canvasWrap: { border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  canvas: { width: '100%', height: 360, display: 'block', touchAction: 'none', cursor: 'crosshair' },
  hint: { fontSize: '0.7rem', color: '#9ca3af', textAlign: 'center', margin: '4px 0 0', padding: '4px 0' },
  editPanel: { display: 'flex', gap: 8, alignItems: 'center', background: '#eef2ff', borderRadius: 10, padding: '8px 10px', marginBottom: 8, flexWrap: 'wrap' },
  editLabelInput: { flex: 1, minWidth: 90, border: '1.5px solid #c7d2fe', borderRadius: 8, padding: '5px 8px', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit' },
  deleteBtn: { background: 'none', border: 'none', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  descInput: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', fontSize: '0.82rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 },
  footer: { display: 'flex', gap: 8 },
  btnPrimary: { flex: 1, background: '#1f2937', color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' },
  btnSecondary: { flex: 1, background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.75rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' },
}
