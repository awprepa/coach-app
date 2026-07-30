import { useState } from 'react'

// Calculateur d'intensité par groupe de niveau (VMI/VMA) — cf. cahier des
// charges "Schémas d'entraînement" section 4. Ne persiste rien par
// lui-même : le résultat est affiché à l'écran, et enregistré via `onApply`
// si fourni (rattachement à un bloc/exercice de séance, Phase 6).

function roundTo(v, step) {
  if (!step || step <= 0) return v
  return Math.round(v / step) * step
}

// Baromètre de difficulté — indicatif seulement, basé sur des seuils simples
// (volume de répétitions, durée totale, récupération), pas sur une étude
// spécifique. Chaque facteur a un palier "extrême" au-delà des seuils
// habituels, pour que des valeurs absurdes (ex : 1 000 000 de séries)
// continuent de faire monter le score au lieu de plafonner silencieusement
// sur "Élevée" comme avant.
function evaluerDifficulte({ recupIntraPct, repsTotal, dureeTotaleMin }) {
  const notes = []
  let score = 0

  if (repsTotal >= 60) { score += 4; notes.push(`${repsTotal} répétitions au total — volume extrême`) }
  else if (repsTotal >= 30) { score += 3; notes.push(`${repsTotal} répétitions au total — volume très élevé`) }
  else if (repsTotal >= 15) { score += 2; notes.push(`${repsTotal} répétitions au total — volume élevé`) }
  else if (repsTotal >= 8) { score += 1; notes.push(`${repsTotal} répétitions au total — volume modéré`) }
  else notes.push(`${repsTotal} répétitions au total — volume contenu`)

  if (recupIntraPct < 50) { score += 2; notes.push('Récupération courte (< 50 % du temps de jeu)') }
  else if (recupIntraPct < 100) { score += 1; notes.push('Récupération modérée (50–100 % du temps de jeu)') }
  else notes.push('Récupération généreuse (≥ 100 % du temps de jeu)')

  if (dureeTotaleMin >= 60) { score += 3; notes.push(`≈ ${dureeTotaleMin} min de travail effectif — séance extrêmement longue`) }
  else if (dureeTotaleMin >= 30) { score += 2; notes.push(`≈ ${dureeTotaleMin} min de travail effectif — séance longue`) }
  else if (dureeTotaleMin >= 15) { score += 1; notes.push(`≈ ${dureeTotaleMin} min de travail effectif`) }

  const max = 9
  const niveau = score >= 7 ? 'Extrême' : score >= 5 ? 'Élevée' : score >= 3 ? 'Modérée' : 'Légère'
  const couleur = score >= 7 ? '#7f1d1d' : score >= 5 ? '#dc2626' : score >= 3 ? '#f59e0b' : '#16a34a'
  return { score, max, niveau, couleur, notes }
}

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen(v => !v)}>
      <span style={S.infoBtn}>i</span>
      {open && (
        <div style={S.infoTooltip}>{text}</div>
      )}
    </span>
  )
}

const EXPLICATION_CALCUL = `Distance/temps : à partir de la vitesse de référence du niveau (VMI ou VMA), distance (m) = (vitesse ÷ 3,6) × % intensité × temps (s) — ou l'inverse si la distance est fixée.

Changements de direction (CDD) : la distance/vitesse théorique est réduite de "% réduction" par CDD, de façon cumulée (ex : 3 CDD × 5 % = 15 % de réduction totale).

Baromètre de difficulté : indicatif, basé sur 3 facteurs cumulés — le volume total de répétitions, la récupération intra-série (%), et la durée totale de travail effectif. Plus ces valeurs sont élevées, plus le score et le niveau (Légère / Modérée / Élevée / Extrême) montent.`

export default function CalculateurIntensite({ niveaux, groupColor, onClose, onApply }) {
  const criteresDisponibles = [...new Set(niveaux.map(n => n.critere))]
  const [critere, setCritere] = useState(criteresDisponibles[0] || 'vmi')
  const [intensitePct, setIntensitePct] = useState(90)
  const [fixedVar, setFixedVar] = useState('temps') // 'temps' | 'distance'
  const [tempsSec, setTempsSec] = useState(30)
  const [distanceM, setDistanceM] = useState(100)
  const [recupIntraPct, setRecupIntraPct] = useState(100)
  const [repsParSerie, setRepsParSerie] = useState(6)
  const [nbSeries, setNbSeries] = useState(1)
  const [recupInterSec, setRecupInterSec] = useState(90)

  const [avance, setAvance] = useState(false)
  const [format, setFormat] = useState('')
  const [nbCdd, setNbCdd] = useState(0)
  const [reductionPct, setReductionPct] = useState(0)
  const [arrondiDistance, setArrondiDistance] = useState(5)
  const [arrondiTemps, setArrondiTemps] = useState(5)
  const [dureeCibleMin, setDureeCibleMin] = useState('')

  const niveauxFiltres = niveaux.filter(n => n.critere === critere)
  const facteurCdd = Math.max(0, 1 - (Number(reductionPct) || 0) / 100 * (Number(nbCdd) || 0))
  const reductionActive = facteurCdd < 1

  function suggererSeries() {
    const cibleSec = Number(dureeCibleMin) > 0 ? Number(dureeCibleMin) * 60 : null
    if (!cibleSec) return
    const ref = niveauxFiltres.find(n => n.valeur_ref != null)
    if (!ref) return
    const { temps, recupIntraSec } = calculerBrut(ref)
    const cycleSec = temps + recupIntraSec
    const reps = Number(repsParSerie) || 1
    const dureeSerieSec = reps * cycleSec + Number(recupInterSec)
    setNbSeries(Math.max(1, Math.round(cibleSec / dureeSerieSec)))
  }

  function calculerBrut(niveau) {
    const vMs = niveau.valeur_ref / 3.6
    let distance, distanceTheo, temps
    if (fixedVar === 'temps') {
      temps = Number(tempsSec) || 0
      distanceTheo = vMs * (intensitePct / 100) * temps
      distance = roundTo(distanceTheo * facteurCdd, arrondiDistance)
    } else {
      distance = Number(distanceM) || 0
      distanceTheo = distance
      const vitesseEff = vMs * (intensitePct / 100) * facteurCdd
      temps = vitesseEff > 0 ? roundTo(distance / vitesseEff, arrondiTemps) : 0
    }
    const recupIntraSec = roundTo(temps * (Number(recupIntraPct) || 0) / 100, arrondiTemps)
    return { distance, distanceTheo: roundTo(distanceTheo, arrondiDistance), temps, recupIntraSec }
  }

  function calculer(niveau) {
    if (niveau.valeur_ref == null) return null
    const { distance, distanceTheo, temps, recupIntraSec } = calculerBrut(niveau)
    const cycleSec = temps + recupIntraSec
    const reps = Number(repsParSerie) || 1
    const series = Number(nbSeries) || 1

    const repsTotal = reps * series
    const dureeTotaleSec = series * (reps * cycleSec) + Math.max(0, series - 1) * Number(recupInterSec)
    const volumeM = Math.round(repsTotal * distance)
    const dureeTotaleMin = Math.round(dureeTotaleSec / 60)

    const difficulte = evaluerDifficulte({ recupIntraPct: Number(recupIntraPct) || 0, repsTotal, dureeTotaleMin })

    return { distance, distanceTheo, temps, recupIntraSec, repsTotal, dureeTotaleMin, volumeM, difficulte }
  }

  const resultats = niveauxFiltres.map(n => ({ niveau: n, r: calculer(n) })).filter(x => x.r)
  const difficulteGlobale = resultats[0]?.r?.difficulte || null

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span style={{ fontWeight: 900, fontSize: '1rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: 6 }}>
            Calculateur d'intensité
            <InfoTooltip text={EXPLICATION_CALCUL} />
          </span>
          <button onClick={onClose} style={S.closeBtn}>×</button>
        </div>

        <div style={S.paramsGrid}>
          <label style={S.field}>
            <span style={S.label}>Référence</span>
            <div style={S.toggleRow}>
              {criteresDisponibles.length ? criteresDisponibles.map(c => (
                <button key={c} onClick={() => setCritere(c)}
                  style={{ ...S.toggleBtn, ...(critere === c ? { background: groupColor, color: isLight(groupColor) ? '#1a1a1a' : '#fff', borderColor: groupColor } : {}) }}>
                  {c.toUpperCase()}
                </button>
              )) : <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Aucun groupe de niveau</span>}
            </div>
          </label>

          <label style={S.field}>
            <span style={S.label}>% intensité</span>
            <input type="number" value={intensitePct} onChange={e => setIntensitePct(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>Variable fixée</span>
            <div style={S.toggleRow}>
              <button onClick={() => setFixedVar('temps')} style={{ ...S.toggleBtn, ...(fixedVar === 'temps' ? S.toggleBtnActive : {}) }}>Temps</button>
              <button onClick={() => setFixedVar('distance')} style={{ ...S.toggleBtn, ...(fixedVar === 'distance' ? S.toggleBtnActive : {}) }}>Distance</button>
            </div>
          </label>

          {fixedVar === 'temps' ? (
            <label style={S.field}>
              <span style={S.label}>Temps (s)</span>
              <input type="number" value={tempsSec} onChange={e => setTempsSec(e.target.value)} style={S.input} />
            </label>
          ) : (
            <label style={S.field}>
              <span style={S.label}>Distance (m)</span>
              <input type="number" value={distanceM} onChange={e => setDistanceM(e.target.value)} style={S.input} />
            </label>
          )}

          <label style={S.field}>
            <span style={S.label}>Répétitions / série</span>
            <input type="number" min="1" value={repsParSerie} onChange={e => setRepsParSerie(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>Nombre de séries</span>
            <input type="number" min="1" value={nbSeries} onChange={e => setNbSeries(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>Récup intra (%)</span>
            <input type="number" min="0" value={recupIntraPct} onChange={e => setRecupIntraPct(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>Récup inter-séries (s)</span>
            <input type="number" min="0" value={recupInterSec} onChange={e => setRecupInterSec(e.target.value)} style={S.input} />
          </label>
        </div>

        <button onClick={() => setAvance(v => !v)} style={S.avanceToggle}>
          {avance ? '− Options avancées' : '+ Options avancées'}
        </button>

        {avance && (
          <div style={S.paramsGrid}>
            <label style={S.field}>
              <span style={S.label}>Format (libre)</span>
              <input value={format} onChange={e => setFormat(e.target.value)} placeholder="ex : 30-30, navette 15m" style={S.input} />
            </label>

            <label style={S.field}>
              <span style={S.label}>Changements de direction</span>
              <input type="number" min="0" value={nbCdd} onChange={e => setNbCdd(e.target.value)} style={S.input} />
            </label>

            <label style={S.field}>
              <span style={S.label}>% réduction / CDD</span>
              <input type="number" min="0" value={reductionPct} onChange={e => setReductionPct(e.target.value)} style={S.input} />
            </label>

            <label style={S.field}>
              <span style={S.label}>Arrondi distance (m)</span>
              <input type="number" min="0" value={arrondiDistance} onChange={e => setArrondiDistance(e.target.value)} style={S.input} />
            </label>

            <label style={S.field}>
              <span style={S.label}>Arrondi temps (s)</span>
              <input type="number" min="0" value={arrondiTemps} onChange={e => setArrondiTemps(e.target.value)} style={S.input} />
            </label>

            <label style={S.field}>
              <span style={S.label}>Durée de séance cible (min)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="number" min="0" value={dureeCibleMin} onChange={e => setDureeCibleMin(e.target.value)} style={{ ...S.input, flex: 1, minWidth: 0 }} />
                <button onClick={suggererSeries} disabled={!dureeCibleMin} style={{ ...S.toggleBtn, opacity: dureeCibleMin ? 1 : 0.5, whiteSpace: 'nowrap' }}>Suggérer</button>
              </div>
            </label>
          </div>
        )}

        {reductionActive && (
          <div style={S.cddNote}>
            Réduction changements de direction active : × {(facteurCdd * 100).toFixed(0)} % de la distance/vitesse théorique
            ({nbCdd} CDD × {reductionPct} % = {Math.min(100, (Number(reductionPct) || 0) * (Number(nbCdd) || 0)).toFixed(0)} % de réduction totale).
          </div>
        )}

        {difficulteGlobale && (
          <div style={S.baroWrap}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#1f2937' }}>Difficulté estimée : {difficulteGlobale.niveau}</span>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>indicatif — à confirmer sur le terrain</span>
            </div>
            <div style={S.baroBarBg}>
              <div style={{ ...S.baroBarFill, width: `${(difficulteGlobale.score / difficulteGlobale.max) * 100}%`, background: difficulteGlobale.couleur }} />
            </div>
            <ul style={S.baroNotes}>
              {difficulteGlobale.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        <div style={S.resultsWrap}>
          {niveauxFiltres.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', padding: '1rem 0' }}>
              Aucun groupe de niveau avec le critère {critere.toUpperCase()}.
            </p>
          ) : (
            <div style={S.resultsRow}>
              {resultats.map(({ niveau, r }) => (
                <div key={niveau.id} style={{ ...S.resultCard, borderColor: `${niveau.couleur}55` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: niveau.couleur, flexShrink: 0 }} />
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1f2937' }}>{niveau.nom}</span>
                  </div>
                  <div style={S.resultSub}>{niveau.valeur_ref} km/h</div>
                  <div style={S.resultList}>
                    {reductionActive ? (
                      <ResultLine label="Distance" value={`${r.distance} m (théo. ${r.distanceTheo} m)`} />
                    ) : (
                      <ResultLine label="Distance" value={`${r.distance} m`} />
                    )}
                    <ResultLine label="Temps" value={`${r.temps} s`} />
                    <ResultLine label="Récup intra" value={`${r.recupIntraSec} s`} />
                    <ResultLine label="Répétitions/série" value={repsParSerie} />
                    <ResultLine label="Nombre de séries" value={nbSeries} />
                    <ResultLine label="Répétitions totales" value={r.repsTotal} />
                    <ResultLine label="Récup inter" value={`${recupInterSec} s`} />
                    <ResultLine label="Durée totale" value={`≈ ${r.dureeTotaleMin} min`} />
                    <ResultLine label="Volume total" value={`${r.volumeM} m`} />
                  </div>
                  {onApply && (
                    <button
                      onClick={() => onApply(niveau, {
                        parametres: { format, critere, intensitePct, fixedVar, tempsSec, distanceM, nbCdd, reductionPct, recupIntraPct, repsParSerie, nbSeries, recupInterSec, arrondiDistance, arrondiTemps },
                        resultat: { distance: r.distance, distanceTheo: r.distanceTheo, temps: r.temps, recupIntraSec: r.recupIntraSec, repsTotal: r.repsTotal, dureeTotaleMin: r.dureeTotaleMin, volumeM: r.volumeM },
                      })}
                      style={S.applyBtn}>
                      Enregistrer pour ce niveau
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '3px 0', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 700, color: '#1f2937', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function isLight(hex) {
  if (!hex) return true
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modal: { background: '#fff', borderRadius: 18, width: '100%', maxWidth: 900, maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 },
  paramsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px 12px', marginBottom: 10, background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  label: { fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', minHeight: '2.1em', display: 'flex', alignItems: 'flex-end' },
  input: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '7px 9px', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  toggleRow: { display: 'flex', gap: 6 },
  toggleBtn: { flex: 1, padding: '7px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  toggleBtnActive: { background: '#333333', color: '#e4f816', borderColor: '#333333' },
  avanceToggle: { background: 'none', border: 'none', color: '#4338ca', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '4px 0 12px', textAlign: 'left' },
  cddNote: { fontSize: '0.75rem', color: '#92400e', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '8px 12px', marginBottom: 12 },
  baroWrap: { background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 14 },
  baroBarBg: { height: 8, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  baroBarFill: { height: '100%', borderRadius: 999, transition: 'width 0.2s' },
  baroNotes: { margin: 0, padding: '0 0 0 18px', fontSize: '0.74rem', color: '#6b7280', lineHeight: 1.6 },
  resultsWrap: { overflowX: 'auto' },
  resultsRow: { display: 'flex', gap: 12, minWidth: 'min-content' },
  resultCard: { minWidth: 220, flex: '0 0 auto', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 12 },
  applyBtn: { width: '100%', marginTop: 10, padding: '7px', borderRadius: 8, border: 'none', background: '#333333', color: '#e4f816', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' },
  resultSub: { fontSize: '0.72rem', color: '#9ca3af', marginBottom: 8 },
  resultList: { display: 'flex', flexDirection: 'column' },
  infoBtn: { width: 16, height: 16, borderRadius: '50%', background: '#e5e7eb', color: '#4b5563', fontSize: '0.65rem', fontWeight: 800, fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  infoTooltip: { position: 'absolute', top: '130%', left: 0, zIndex: 20, width: 300, maxWidth: '80vw', background: '#1f2937', color: '#f3f4f6', fontSize: '0.72rem', fontWeight: 400, lineHeight: 1.5, borderRadius: 10, padding: '10px 12px', whiteSpace: 'pre-line', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' },
}
