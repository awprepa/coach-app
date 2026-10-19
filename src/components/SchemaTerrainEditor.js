import { useEffect, useRef, useState, useCallback } from 'react'
import { analyser, arrondiDemi, calculer, deborde, DEPLACEMENTS, echelleDe, mettreAEchelle, metresFleche, REGLAGES_DEFAUT } from '../utils/courseVmi'

// Éditeur de schéma de terrain (plots, flèches directionnelles, zones) pour les
// blocs de séance terrain. Remplace l'ancien SchemaEditorPage/SchemaSVG pour ce
// cas d'usage : flèches avec tête (le sens de course est l'information clé),
// icônes cohérentes, surfaces réalistes (terrain de rugby / salle / vierge).
//
// `value` / `onChange` portent la forme { surface, plots, arrows, zones,
// course, groupe } — distances à l'échelle réelle du terrain (courseVmi.js) ;
// voir SchemaTerrainView.js pour le rendu lecture seule côté client.

export const PALETTE = ['#f2c94c', '#eb5757', '#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#f5f7fa', '#1a1d21']
const SURFACES = { gazon: 'Terrain de rugby', salle: 'Salle', vierge: 'Vierge' }
// Une ancienne surface (ex. « piste », retirée) s'affiche en terrain de rugby.
export const surfaceOf = schema => (SURFACES[schema?.surface] ? schema.surface : 'gazon')

// Tailles en unités du schéma (le dessin fait 100 × 100)
export const PLOT_R = 1.15

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
    <pattern id="surf-salle" width="100" height="100" patternUnits="userSpaceOnUse">
      <rect width="100" height="100" fill="#cdae7c"/>
    </pattern>
    <pattern id="surf-vierge" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#eef0ec"/>
      <path d="M10 0H0V10" fill="none" stroke="#dcdfd7" stroke-width="0.25"/>
    </pattern>
  `
}

// Une tête de flèche par couleur utilisée (couleur libre possible)
export const markerId = color => `arrow-${String(color || '#1a1d21').replace(/[^0-9a-z]/gi, '')}`
export function markerDefs(colors = []) {
  return [...new Set(['#1a1d21', ...colors])].map(c => `
    <marker id="${markerId(c)}" markerWidth="4" markerHeight="4" refX="3.4" refY="2" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0.3 L4,2 L0,3.7 Z" fill="${c}"/>
    </marker>
  `).join('')
}

export function surfaceMarkings(surface) {
  if (surface === 'gazon') {
    // Terrain de rugby dans le sens de la longueur : 120 m (avec les en-buts de
    // 10 m) × 70 m, à 0,8 unité par mètre. Lignes : ballon mort, en-but, 5 m
    // (pointillés), 22 m, 40 m (les « 10 m » de part et d'autre du milieu,
    // pointillés), 50 m (milieu) ; tirets à 5 m et 15 m des lignes de touche.
    const L = '#f4f5f2', op = 0.75, k = 0.8, top = 2, x1 = 22, x2 = 78
    const y = m => (top + m * k).toFixed(2)
    const ligne = (m, w, dash) => `<line x1="${x1}" y1="${y(m)}" x2="${x2}" y2="${y(m)}" stroke="${L}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    const cote = (m, txt) => `<text x="${x1 - 1.2}" y="${(+y(m) + 0.7).toFixed(2)}" font-size="2" font-weight="700" fill="${L}" text-anchor="end">${txt}</text>`
    const tirets = x => `<line x1="${x}" y1="${y(10)}" x2="${x}" y2="${y(110)}" stroke="${L}" stroke-width="0.22" stroke-dasharray="0.9,4.1"/>`
    const poteaux = m => {
      const yy = +y(m), d = 2.24 // 5,6 m entre les poteaux
      return `<line x1="${50 - d}" y1="${yy - 1.6}" x2="${50 - d}" y2="${yy + 1.6}" stroke="${L}" stroke-width="0.45"/><line x1="${50 + d}" y1="${yy - 1.6}" x2="${50 + d}" y2="${yy + 1.6}" stroke="${L}" stroke-width="0.45"/><line x1="${50 - d}" y1="${yy}" x2="${50 + d}" y2="${yy}" stroke="${L}" stroke-width="0.35"/>`
    }
    return `<g opacity="${op}">
      <rect x="${x1}" y="${y(0)}" width="${x2 - x1}" height="${(120 * k).toFixed(2)}" fill="none" stroke="${L}" stroke-width="0.4"/>
      ${ligne(10, 0.4)}${ligne(110, 0.4)}
      ${ligne(15, 0.25, '1.4,1.1')}${ligne(105, 0.25, '1.4,1.1')}
      ${ligne(32, 0.32)}${ligne(88, 0.32)}
      ${ligne(50, 0.25, '1.4,1.1')}${ligne(70, 0.25, '1.4,1.1')}
      ${ligne(60, 0.36)}
      ${tirets(x1 + 4)}${tirets(x1 + 12)}${tirets(x2 - 4)}${tirets(x2 - 12)}
      ${poteaux(10)}${poteaux(110)}
      ${cote(10, 'En-but')}${cote(15, '5')}${cote(32, '22')}${cote(50, '40')}${cote(60, '50')}${cote(70, '40')}${cote(88, '22')}${cote(105, '5')}${cote(110, 'En-but')}
    </g>`
  }
  if (surface === 'salle') {
    return `<rect x="4" y="4" width="92" height="92" fill="none" stroke="#a9835a" stroke-width="0.35" opacity="0.6"/>`
  }
  return ''
}

// ── Formes partagées par l'éditeur et l'affichage côté client ──

// Flèches aller-retour sur le même trajet : chacune est décalée sur sa droite
// pour que les deux restent visibles côte à côte.
export function flechesDecalees(arrows) {
  const pres = (u, v) => Math.hypot(u.x1 - v.x2, u.y1 - v.y2) < 1 && Math.hypot(u.x2 - v.x1, u.y2 - v.y1) < 1
  return new Set(arrows.filter(a => arrows.some(b => b !== a && pres(a, b))).map(a => a.id))
}

// Flèche : la distance est posée au milieu du trait, dans une étiquette.
export function ArrowShape({ a: brute, selected, surface, decale }) {
  let a = brute, lx = 0, ly = 0
  if (decale) {
    const l = Math.hypot(brute.x2 - brute.x1, brute.y2 - brute.y1) || 1
    const nx = -(brute.y2 - brute.y1) / l, ny = (brute.x2 - brute.x1) / l
    a = { ...brute, x1: brute.x1 + nx * 1.1, y1: brute.y1 + ny * 1.1, x2: brute.x2 + nx * 1.1, y2: brute.y2 + ny * 1.1 }
    // l'étiquette s'écarte encore de son côté, pour ne pas toucher celle du retour
    const w0 = 6
    lx = nx * (Math.abs(nx) > 0.7 ? w0 / 2 + 0.6 : 1.4); ly = ny * (Math.abs(ny) > 0.7 ? 1.4 : w0 / 2 + 0.6)
  }
  const m = arrondiDemi(metresFleche(a, surface))
  const mode = a.mode === 'arriere' ? ' · arrière' : a.mode === 'chasses' ? ' · chassés' : ''
  const label = a.masquerDistance || m < 0.5 ? null : `${String(m).replace('.', ',')} m${mode}`
  const mx = (a.x1 + a.x2) / 2 + lx, my = (a.y1 + a.y2) / 2 + ly
  const w = label ? label.length * 1.15 + 1.8 : 0
  // Le trait s'arrête un peu avant ses extrémités : la pointe reste visible
  // quand la flèche part d'un plot ou y arrive.
  const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1
  const ux = (a.x2 - a.x1) / len, uy = (a.y2 - a.y1) / len
  const d0 = len > 6 ? PLOT_R + 0.5 : 0, d1 = len > 6 ? PLOT_R + 0.7 : 0
  return (
    <>
      <line x1={a.x1 + ux * d0} y1={a.y1 + uy * d0} x2={a.x2 - ux * d1} y2={a.y2 - uy * d1} stroke={selected ? '#ffffff' : a.color}
        strokeWidth={selected ? 0.6 : 0.45} strokeLinecap="round"
        strokeDasharray={a.style === 'pointille' ? '1.6,1.3' : undefined}
        markerEnd={`url(#${markerId(a.color)})`} />
      {label && (
        <g>
          <rect x={mx - w / 2} y={my - 1.45} width={w} height="2.9" rx="1.45" fill="#14161a" fillOpacity="0.85" />
          <text x={mx} y={my + 0.7} fontSize="1.9" fontWeight="700" fill="#ffffff" textAnchor="middle">{label}</text>
        </g>
      )}
    </>
  )
}

// Plot : petit point, étiquette juste au-dessus (masquée si vide).
export function PlotShape({ p, selected }) {
  const label = [(p.label || '').trim(), p.sol ? 'sol' : ''].filter(Boolean).join(' · ')
  const w = label.length * 1.05 + 1.6
  return (
    <>
      <circle cx={p.x} cy={p.y + 0.15} r={PLOT_R + 0.05} fill="rgba(0,0,0,0.25)" />
      <circle cx={p.x} cy={p.y} r={PLOT_R} fill={p.color} stroke={selected ? '#ffffff' : 'rgba(0,0,0,0.2)'} strokeWidth={selected ? 0.45 : 0.22} />
      {label && (
        <>
          <rect x={p.x - w / 2} y={p.y - PLOT_R - 3.2} width={w} height="2.6" rx="1.3" fill="#14161a" fillOpacity="0.8" />
          <text x={p.x} y={p.y - PLOT_R - 1.3} fontSize="1.75" fontWeight="700" fill="#ffffff" textAnchor="middle">{label}</text>
        </>
      )}
    </>
  )
}

// Couleurs prédéfinies + couleur libre
function ColorChoice({ value, onPick, grande }) {
  const libre = value && !PALETTE.includes(value)
  return (
    <div style={grande ? S.swatchGrid : S.swatchRow}>
      {PALETTE.map(c => (
        <button key={c} type="button" title={c} onClick={() => onPick(c)}
          style={grande ? { ...S.swatchBig, background: c, ...(value === c ? S.swatchBigOn : {}) } : { ...S.swatch, background: c, ...(value === c ? S.swatchOn : {}) }} />
      ))}
      <label title="Autre couleur" style={{ ...(grande ? S.swatchBig : S.swatch), ...S.swatchLibre, ...(libre ? (grande ? S.swatchBigOn : S.swatchOn) : {}), background: libre ? value : 'conic-gradient(#eb5757, #f2c94c, #27ae60, #2f80ed, #9b51e0, #eb5757)' }}>
        <input type="color" value={value || '#ffffff'} onChange={e => onPick(e.target.value)} style={S.colorInput} />
      </label>
    </div>
  )
}

const DEFAULT_SCHEMA = { surface: 'gazon', plots: [], arrows: [], zones: [] }
const ACCROCHE = 2 // unités : une flèche commencée ou finie près d'un point s'y accroche

// Points d'accroche : plots et extrémités des flèches existantes
function accrocher(schema, p) {
  const pts = [...schema.plots.map(q => ({ x: q.x, y: q.y })), ...schema.arrows.flatMap(a => [{ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }])]
  let best = null, bd = ACCROCHE
  pts.forEach(q => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q } })
  return best ? { x: best.x, y: best.y } : p
}

// Déplace tout l'exercice de (dx, dy)
function translater(schema, dx, dy) {
  return {
    plots: schema.plots.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })),
    arrows: schema.arrows.map(a => ({ ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy })),
    zones: schema.zones.map(z => ({ ...z, x: z.x + dx, y: z.y + dy })),
  }
}

export default function SchemaTerrainEditor({ value, onChange, vmiJoueur, hauteur = 420 }) {
  const schema = value || DEFAULT_SCHEMA
  const groupe = !!schema.groupe
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
  const [reglagesOuverts, setReglagesOuverts] = useState(false)

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

    // Exercice verrouillé : on déplace tout d'un seul coup
    if (groupe) {
      dragRef.current = { kind: 'group-move', x0: p.x, y0: p.y, base: { plots: schema.plots, arrows: schema.arrows, zones: schema.zones }, historyPushed: false }
      setSelection(null)
      return
    }

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
      setDrawStart(accrocher(schema, p))
      return
    }
    if (tool === 'zone') {
      dragRef.current = { kind: 'zone-draft', x1: p.x, y1: p.y, x2: p.x, y2: p.y }
      forceTick(t => t + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, plotColor, schema, groupe])

  const onPointerMove = useCallback((e) => {
    const p = svgPoint(e)
    if (dragRef.current && dragRef.current.kind === 'group-move') {
      const d = dragRef.current
      if (!d.historyPushed) { pushHistory(); d.historyPushed = true }
      patch(translater(d.base, p.x - d.x0, p.y - d.y0))
    } else if (dragRef.current && dragRef.current.kind === 'plot-move') {
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
    if (dragRef.current && (dragRef.current.kind === 'plot-move' || dragRef.current.kind === 'group-move')) {
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
      const p = endPlot ? { x: endPlot.x, y: endPlot.y } : accrocher(schema, svgPoint(e))
      const x2 = p.x, y2 = p.y
      const dist = Math.hypot(x2 - drawStart.x, y2 - drawStart.y)
      if (dist > 2) {
        pushHistory()
        const arrow = { id: uid('a'), x1: drawStart.x, y1: drawStart.y, x2, y2, color: arrowColor, style: arrowStyle, mode: 'avant' }
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection && !groupe) {
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
  }, [selection, schema, groupe])

  function deleteSelected() {
    if (!selection) return
    pushHistory()
    if (selection.type === 'plot') patch({ plots: schema.plots.filter(x => x.id !== selection.id) })
    if (selection.type === 'arrow') patch({ arrows: schema.arrows.filter(x => x.id !== selection.id) })
    if (selection.type === 'zone') patch({ zones: schema.zones.filter(x => x.id !== selection.id) })
    setSelection(null)
  }

  function fixerDistance(arrow, metres) {
    if (!(metres > 0)) return
    const len = Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) || 1
    const cible = metres * echelleDe(surfaceOf(schema))
    const nx = arrow.x1 + (arrow.x2 - arrow.x1) / len * cible, ny = arrow.y1 + (arrow.y2 - arrow.y1) / len * cible
    const dx = nx - arrow.x2, dy = ny - arrow.y2
    const ici = (x, y) => Math.hypot(x - arrow.x2, y - arrow.y2) < 0.01
    pushHistory()
    patch({
      plots: schema.plots.map(p => ici(p.x, p.y) ? { ...p, x: p.x + dx, y: p.y + dy } : p),
      arrows: schema.arrows.map(a => ({
        ...a,
        ...(ici(a.x1, a.y1) ? { x1: a.x1 + dx, y1: a.y1 + dy } : {}),
        ...(ici(a.x2, a.y2) ? { x2: a.x2 + dx, y2: a.y2 + dy } : {}),
      })),
    })
  }

  // ── Course à la VMI ──
  const course = schema.course || {}
  const vmiEffective = course.vmi ?? vmiJoueur ?? null
  const setCourse = c => patch({ course: { ...course, ...c } })
  const calcul = schema.arrows.length && course.effort ? calculer(schema, { vmi: vmiEffective, effort: course.effort, intensite: course.intensite }) : null
  const analyse = schema.arrows.length ? analyser(schema) : null
  function adapterDistances() {
    if (!calcul || calcul.erreur) return
    pushHistory()
    const s2 = mettreAEchelle(schema, calcul.k)
    patch({ plots: s2.plots, arrows: s2.arrows, zones: s2.zones, course: { ...course, vmi: vmiEffective } })
  }
  const num = v => (v === '' || v == null ? null : Number(v))
  const fmt = (v, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',')

  const decales = flechesDecalees(schema.arrows)
  const selectedPlot = selection?.type === 'plot' ? schema.plots.find(p => p.id === selection.id) : null
  const selectedArrow = selection?.type === 'arrow' ? schema.arrows.find(a => a.id === selection.id) : null
  const selectedZone = selection?.type === 'zone' ? schema.zones.find(z => z.id === selection.id) : null
  const zoneDraft = dragRef.current?.kind === 'zone-draft' ? dragRef.current : null

  return (
    <div style={S.wrap}>
      <div style={S.topbar}>
        <div style={S.pills}>
          {Object.entries(SURFACES).map(([key, label]) => (
            <button key={key} onClick={() => patch({ surface: key })} style={{ ...S.pill, ...(surfaceOf(schema) === key ? S.pillOn : {}) }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setSelection(null); setTool('select'); patch({ groupe: !groupe }) }}
          title={groupe ? 'Déverrouiller : modifier les éléments un par un' : 'Verrouiller : déplacer tout l\u2019exercice d\u2019un seul coup'}
          style={{ ...S.lockBtn, ...(groupe ? S.lockBtnOn : {}) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />{groupe ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
          </svg>
          {groupe ? 'Exercice verrouillé' : 'Verrouiller l\u2019exercice'}
        </button>
        <button onClick={undo} disabled={!historyRef.current.length} style={{ ...S.iconBtn, opacity: historyRef.current.length ? 1 : 0.35 }} title="Annuler (Ctrl+Z)"><IcoUndo /></button>
        <button onClick={redo} disabled={!futureRef.current.length} style={{ ...S.iconBtn, opacity: futureRef.current.length ? 1 : 0.35 }} title="Rétablir"><IcoRedo /></button>
      </div>

      {(tool === 'plot' || tool === 'arrow' || tool === 'zone') && (
        <div style={S.ctxbar}>
          <span style={S.ctxLabel}>{tool === 'plot' ? 'Couleur du plot' : tool === 'arrow' ? 'Couleur de la flèche' : 'Couleur de la zone'}</span>
          <ColorChoice value={tool === 'plot' ? plotColor : arrowColor} onPick={c => tool === 'plot' ? setPlotColor(c) : setArrowColor(c)} />
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

      <div style={{ ...S.body, height: hauteur }}>
        <div style={S.rail}>
          {[
            { key: 'select', title: 'Sélection', icon: <path d="M5 3l14 7-6 2-2 6-6-15Z" /> },
            { key: 'plot', title: 'Plot', icon: <circle cx="12" cy="12" r="6" /> },
            { key: 'arrow', title: 'Flèche', icon: <><path d="M5 19 19 5" /><path d="M9 5h10v10" /></> },
            { key: 'zone', title: 'Zone', icon: <rect x="4" y="4" width="16" height="16" rx="2" /> },
          ].map(t => (
            <button key={t.key} title={t.title} disabled={groupe} onClick={() => { setTool(t.key); setSelection(null) }}
              style={{ ...S.railBtn, ...(tool === t.key && !groupe ? S.railBtnOn : {}), ...(groupe ? { opacity: 0.35, cursor: 'default' } : {}) }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            </button>
          ))}
        </div>

        <div style={S.canvasWrap}>
          <svg
            ref={svgRef} viewBox="0 0 100 100" width="100%" height="100%"
            style={{ display: 'block', cursor: groupe ? 'move' : tool === 'arrow' ? 'crosshair' : tool === 'zone' ? 'crosshair' : 'default' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          >
            <defs dangerouslySetInnerHTML={{ __html: surfaceDefs() + markerDefs([...schema.arrows.map(a => a.color), arrowColor]) }} />
            <rect data-bg="1" x="0" y="0" width="100" height="100" fill={`url(#surf-${surfaceOf(schema)})`} />
            <g dangerouslySetInnerHTML={{ __html: surfaceMarkings(surfaceOf(schema)) }} />

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
              const dec = decales.has(a.id)
              return (
                <g key={a.id} data-id={a.id} data-kind="arrow" style={{ cursor: 'pointer' }}>
                  <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="transparent" strokeWidth="3.5" />
                  <ArrowShape a={a} selected={isSel} surface={surfaceOf(schema)} decale={dec} />
                </g>
              )
            })}

            {schema.plots.map(p => {
              const isSel = selection?.type === 'plot' && selection.id === p.id
              return (
                <g key={p.id} data-id={p.id} data-kind="plot" style={{ cursor: 'grab' }}>
                  <circle cx={p.x} cy={p.y} r="2.6" fill="transparent" />
                  <PlotShape p={p} selected={isSel} />
                </g>
              )
            })}

            {drawStart && (
              <line x1={drawStart.x} y1={drawStart.y} x2={drawStart.cur?.x ?? drawStart.x} y2={drawStart.cur?.y ?? drawStart.y}
                stroke={arrowColor} strokeWidth="0.5" strokeDasharray="1.6,1.2" markerEnd={`url(#${markerId(arrowColor)})`} />
            )}
            {zoneDraft && (
              <rect x={Math.min(zoneDraft.x1, zoneDraft.x2)} y={Math.min(zoneDraft.y1, zoneDraft.y2)}
                width={Math.abs(zoneDraft.x2 - zoneDraft.x1)} height={Math.abs(zoneDraft.y2 - zoneDraft.y1)}
                fill={arrowColor} fillOpacity="0.15" stroke={arrowColor} strokeWidth="0.7" strokeDasharray="1.6,1.2" />
            )}
          </svg>
        </div>

        <div style={S.inspector}>
          {groupe && (
            <p style={S.hint}>Exercice verrouillé : fais glisser le schéma pour le placer sur le terrain. Les distances ne changent pas. Déverrouille pour modifier un élément.</p>
          )}
          {!groupe && !selection && (
            <p style={S.hint}>Plot pour poser un point, Flèche pour tracer le parcours dans l'ordre (d'un point au suivant), Zone pour une surface. Les distances sont à l'échelle du terrain. Suppr pour effacer, Ctrl+Z pour annuler.</p>
          )}
          {selectedPlot && (
            <>
              <label style={S.fieldLabel}>Étiquette</label>
              <input value={selectedPlot.label} onChange={e => patch({ plots: schema.plots.map(p => p.id === selectedPlot.id ? { ...p, label: e.target.value } : p) })} style={S.fieldInput} />
              <label style={S.fieldLabel}>Couleur</label>
              <ColorChoice grande value={selectedPlot.color} onPick={c => { pushHistory(); patch({ plots: schema.plots.map(p => p.id === selectedPlot.id ? { ...p, color: c } : p) }) }} />
              <label style={S.checkRow}>
                <input type="checkbox" checked={!!selectedPlot.sol} onChange={e => { pushHistory(); patch({ plots: schema.plots.map(p => p.id === selectedPlot.id ? { ...p, sol: e.target.checked } : p) }) }} />
                Passage au sol sur ce plot
              </label>
              <button onClick={deleteSelected} style={S.btnDelete}>Supprimer le plot</button>
            </>
          )}
          {selectedArrow && (
            <>
              <label style={S.fieldLabel}>Couleur</label>
              <ColorChoice grande value={selectedArrow.color} onPick={c => { pushHistory(); patch({ arrows: schema.arrows.map(a => a.id === selectedArrow.id ? { ...a, color: c } : a) }) }} />
              <label style={S.fieldLabel}>Distance réelle (m)</label>
              <input key={selectedArrow.id + ':' + arrondiDemi(metresFleche(selectedArrow, surfaceOf(schema)))} type="number" min="0.5" step="0.5"
                defaultValue={arrondiDemi(metresFleche(selectedArrow, surfaceOf(schema)))}
                onBlur={e => fixerDistance(selectedArrow, Number(e.target.value))}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                style={S.fieldInput} />
              <label style={S.fieldLabel}>Déplacement</label>
              <select value={selectedArrow.mode || 'avant'} onChange={e => { pushHistory(); patch({ arrows: schema.arrows.map(a => a.id === selectedArrow.id ? { ...a, mode: e.target.value } : a) }) }} style={S.fieldInput}>
                {Object.entries(DEPLACEMENTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <label style={S.checkRow}>
                <input type="checkbox" checked={!selectedArrow.masquerDistance} onChange={e => patch({ arrows: schema.arrows.map(a => a.id === selectedArrow.id ? { ...a, masquerDistance: !e.target.checked } : a) })} />
                Afficher la distance
              </label>
              <button onClick={deleteSelected} style={S.btnDelete}>Supprimer la flèche</button>
            </>
          )}
          {selectedZone && (
            <>
              <label style={S.fieldLabel}>Couleur</label>
              <ColorChoice grande value={selectedZone.color} onPick={c => { pushHistory(); patch({ zones: schema.zones.map(z => z.id === selectedZone.id ? { ...z, color: c } : z) }) }} />
              <button onClick={deleteSelected} style={S.btnDelete}>Supprimer la zone</button>
            </>
          )}
        </div>
      </div>

      <div style={S.course}>
        <div style={S.courseHead}>
          <span style={S.courseTitre}>Course à la VMI</span>
          <span style={S.courseSous}>Les distances s'adaptent à la VMI du joueur, dans les proportions du schéma.</span>
        </div>
        <div style={S.courseGrid}>
          {[
            ['effort', 'Effort (s)', course.effort, 1],
            ['intensite', 'Intensité (% VMI)', course.intensite ?? '', 5],
            ['reps', 'Répétitions', course.reps, 1],
            ['recup', 'Récup (s)', course.recup, 1],
          ].map(([k, l, v, step]) => (
            <label key={k} style={S.courseField}>
              <span style={S.fieldLabelInline}>{l}</span>
              <input type="number" min="0" step={step} value={v ?? ''} placeholder={k === 'intensite' ? '100' : ''}
                onChange={e => setCourse({ [k]: num(e.target.value) })} style={S.fieldInput} />
            </label>
          ))}
          <label style={S.courseField}>
            <span style={S.fieldLabelInline}>VMI du joueur (km/h)</span>
            <input type="number" min="0" step="0.5" value={course.vmi ?? ''} placeholder={vmiJoueur ? String(vmiJoueur) : ''}
              onChange={e => setCourse({ vmi: num(e.target.value) })} style={S.fieldInput} />
          </label>
        </div>
        {vmiJoueur && course.vmi == null && <p style={S.courseInfo}>VMI du dernier 30-15 du joueur : {fmt(vmiJoueur)} km/h.</p>}

        {analyse && (
          <p style={S.courseInfo}>
            Temps perdu : {fmt(analyse.perteTotale)} s
            {analyse.virages.length > 0 && ` · ${analyse.virages.length} changement${analyse.virages.length > 1 ? 's' : ''} de direction (${analyse.virages.map(v => `${v.deg}°`).join(', ')})`}
            {analyse.nbSol > 0 && ` · ${analyse.nbSol} passage${analyse.nbSol > 1 ? 's' : ''} au sol`}
          </p>
        )}
        {calcul && !calcul.erreur && (
          <p style={S.courseInfo}>
            À {fmt(calcul.vitesse * 3.6)} km/h : parcours de {fmt(calcul.distanceTotale)} m au lieu de {fmt(calcul.distanceTotale / calcul.k)} m dessinés.
          </p>
        )}
        {calcul?.erreur && course.effort && <p style={S.courseErreur}>{calcul.erreur}</p>}
        {deborde(schema) && <p style={S.courseErreur}>L'exercice dépasse du dessin : verrouille-le et fais-le glisser, ou réduis l'intensité.</p>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <button onClick={adapterDistances} disabled={!calcul || !!calcul.erreur || Math.abs(calcul.k - 1) < 0.005}
            style={{ ...S.btnAdapter, ...(!calcul || calcul.erreur || Math.abs(calcul.k - 1) < 0.005 ? { opacity: 0.4, cursor: 'default' } : {}) }}>
            Adapter les distances
          </button>
          <button onClick={() => setReglagesOuverts(o => !o)} style={S.btnLien}>
            {reglagesOuverts ? 'Masquer les réglages' : 'Réglages des pertes de temps'}
          </button>
        </div>

        {reglagesOuverts && (
          <div style={S.courseGrid}>
            {[
              ['cdd180', 'Demi-tour (s)'], ['cdd90', 'Virage à 90° (s)'], ['cdd45', 'Virage à 45° (s)'],
              ['sol', 'Passage au sol (s)'], ['arriere', 'Course arrière (% vitesse)'], ['chasses', 'Pas chassés (% vitesse)'],
            ].map(([k, l]) => (
              <label key={k} style={S.courseField}>
                <span style={S.fieldLabelInline}>{l}</span>
                <input type="number" min="0" step={k === 'arriere' || k === 'chasses' ? 5 : 0.1}
                  value={course.reglages?.[k] ?? REGLAGES_DEFAUT[k]}
                  onChange={e => setCourse({ reglages: { ...(course.reglages || {}), [k]: num(e.target.value) ?? REGLAGES_DEFAUT[k] } })}
                  style={S.fieldInput} />
              </label>
            ))}
          </div>
        )}
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
  swatchGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 },
  swatchBig: { width: '100%', aspectRatio: '1', borderRadius: '50%', cursor: 'pointer', border: '2px solid transparent' },
  swatchBigOn: { borderColor: '#eef0f2' },
  swatchLibre: { position: 'relative', overflow: 'hidden', display: 'block', boxSizing: 'border-box' },
  colorInput: { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 },
  lockBtn: { display: 'flex', alignItems: 'center', gap: 6, background: '#21242b', border: '1px solid #2c3036', color: '#a3a9b1', fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer' },
  lockBtnOn: { background: '#e4f816', color: '#1f2937', borderColor: '#e4f816' },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#c9cdd3', margin: '12px 0 0', cursor: 'pointer' },
  course: { borderTop: '1px solid #2c3036', background: '#1b1e24', padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  courseHead: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  courseTitre: { fontSize: 13, fontWeight: 800, color: '#eef0f2' },
  courseSous: { fontSize: 12, color: '#878d96' },
  courseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 },
  courseField: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabelInline: { fontSize: 11, fontWeight: 700, color: '#878d96' },
  courseInfo: { margin: 0, fontSize: 12.5, color: '#c9cdd3', lineHeight: 1.5 },
  courseErreur: { margin: 0, fontSize: 12.5, color: '#f87171', fontWeight: 600, lineHeight: 1.5 },
  btnAdapter: { background: '#e4f816', color: '#1f2937', border: 'none', fontSize: 13, fontWeight: 800, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' },
  btnLien: { background: 'none', border: 'none', color: '#a3a9b1', fontSize: 12.5, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', padding: 0 },
  btnDelete: { width: '100%', marginTop: 14, background: 'none', border: '1px solid #2c3036', color: '#ef4444', fontSize: 12.5, fontWeight: 700, padding: 9, borderRadius: 8, cursor: 'pointer' },
}
