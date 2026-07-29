import { useState } from 'react'

// Calculateur d'intensité par groupe de niveau (VMI/VMA) — cf. cahier des
// charges "Schémas d'entraînement" section 4. Ne persiste rien pour l'instant
// (Phase 5) : le résultat est affiché à l'écran, la liaison à une séance
// (sauvegarde par exercice/groupe de niveau) est prévue en Phase 6.

function roundTo(v, step) {
  if (!step || step <= 0) return v
  return Math.round(v / step) * step
}

export default function CalculateurIntensite({ niveaux, groupColor, onClose }) {
  const criteresDisponibles = [...new Set(niveaux.map(n => n.critere))]
  const [critere, setCritere] = useState(criteresDisponibles[0] || 'vmi')
  const [format, setFormat] = useState('')
  const [intensitePct, setIntensitePct] = useState(90)
  const [fixedVar, setFixedVar] = useState('temps') // 'temps' | 'distance'
  const [tempsSec, setTempsSec] = useState(30)
  const [distanceM, setDistanceM] = useState(100)
  const [nbCdd, setNbCdd] = useState(0)
  const [reductionPct, setReductionPct] = useState(0)
  const [recupIntraPct, setRecupIntraPct] = useState(100)
  const [repsParSerie, setRepsParSerie] = useState(6)
  const [recupInterSec, setRecupInterSec] = useState(90)
  const [arrondiDistance, setArrondiDistance] = useState(5)
  const [arrondiTemps, setArrondiTemps] = useState(5)
  const [dureeCibleMin, setDureeCibleMin] = useState('')

  const niveauxFiltres = niveaux.filter(n => n.critere === critere)

  function calculer(niveau) {
    if (niveau.valeur_ref == null) return null
    const vMs = niveau.valeur_ref / 3.6
    const facteurCdd = Math.max(0, 1 - (Number(reductionPct) || 0) / 100 * (Number(nbCdd) || 0))
    let distance, temps
    if (fixedVar === 'temps') {
      temps = Number(tempsSec) || 0
      const distTheo = vMs * (intensitePct / 100) * temps
      distance = roundTo(distTheo * facteurCdd, arrondiDistance)
    } else {
      distance = Number(distanceM) || 0
      const vitesseEff = vMs * (intensitePct / 100) * facteurCdd
      temps = vitesseEff > 0 ? roundTo(distance / vitesseEff, arrondiTemps) : 0
    }
    const recupIntraSec = roundTo(temps * (Number(recupIntraPct) || 0) / 100, arrondiTemps)
    const cycleSec = temps + recupIntraSec
    const reps = Number(repsParSerie) || 1

    let nbSeries = null, repsTotal = null, dureeTotaleSec = null, volumeM = null
    const cibleSec = Number(dureeCibleMin) > 0 ? Number(dureeCibleMin) * 60 : null
    if (cibleSec && cycleSec > 0) {
      const dureeSerieSec = reps * cycleSec + Number(recupInterSec)
      nbSeries = Math.max(1, Math.round(cibleSec / dureeSerieSec))
      repsTotal = nbSeries * reps
      dureeTotaleSec = nbSeries * dureeSerieSec - Number(recupInterSec) // pas de récup inter après la dernière série
      volumeM = Math.round(repsTotal * distance)
    }

    return { distance, temps, recupIntraSec, nbSeries, repsTotal, dureeTotaleSec, volumeM }
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>
        <div style={S.header}>
          <span style={{ fontWeight: 900, fontSize: '1rem', color: '#1f2937' }}>Calculateur d'intensité</span>
          <button onClick={onClose} style={S.closeBtn}>×</button>
        </div>

        <div style={S.paramsGrid}>
          <label style={S.field}>
            <span style={S.label}>Format (libre)</span>
            <input value={format} onChange={e => setFormat(e.target.value)} placeholder="ex : 30-30, navette 15m" style={S.input} />
          </label>

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
            <span style={S.label}>Nb changements de direction</span>
            <input type="number" min="0" value={nbCdd} onChange={e => setNbCdd(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>% réduction / CDD</span>
            <input type="number" min="0" value={reductionPct} onChange={e => setReductionPct(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>Récup intra (% temps de jeu)</span>
            <input type="number" min="0" value={recupIntraPct} onChange={e => setRecupIntraPct(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>Répétitions / série</span>
            <input type="number" min="1" value={repsParSerie} onChange={e => setRepsParSerie(e.target.value)} style={S.input} />
          </label>

          <label style={S.field}>
            <span style={S.label}>Récup inter-séries (s)</span>
            <input type="number" min="0" value={recupInterSec} onChange={e => setRecupInterSec(e.target.value)} style={S.input} />
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
            <span style={S.label}>Durée de séance cible (min, optionnel)</span>
            <input type="number" min="0" value={dureeCibleMin} onChange={e => setDureeCibleMin(e.target.value)} style={S.input} />
          </label>
        </div>

        <div style={S.resultsWrap}>
          {niveauxFiltres.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', padding: '1rem 0' }}>
              Aucun groupe de niveau avec le critère {critere.toUpperCase()}.
            </p>
          ) : (
            <div style={S.resultsRow}>
              {niveauxFiltres.map(niveau => {
                const r = calculer(niveau)
                return (
                  <div key={niveau.id} style={{ ...S.resultCard, borderColor: `${niveau.couleur}55` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: niveau.couleur, flexShrink: 0 }} />
                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1f2937' }}>{niveau.nom}</span>
                    </div>
                    <div style={S.resultSub}>{niveau.valeur_ref != null ? `${niveau.valeur_ref} km/h` : 'pas de référence'}</div>
                    {!r ? (
                      <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 8 }}>Référence manquante</p>
                    ) : (
                      <div style={S.resultList}>
                        <ResultLine label="Distance" value={`${r.distance} m`} />
                        <ResultLine label="Temps" value={`${r.temps} s`} />
                        <ResultLine label="Récup intra" value={`${r.recupIntraSec} s`} />
                        {r.nbSeries != null && (
                          <>
                            <ResultLine label="Répétitions/série" value={repsParSerie} />
                            <ResultLine label="Séries proposées" value={r.nbSeries} />
                            <ResultLine label="Répétitions totales" value={r.repsTotal} />
                            <ResultLine label="Récup inter" value={`${recupInterSec} s`} />
                            <ResultLine label="Durée totale" value={`≈ ${Math.round(r.dureeTotaleSec / 60)} min`} />
                            <ResultLine label="Volume total" value={`${r.volumeM} m`} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 700, color: '#1f2937' }}>{value}</span>
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
  modal: { background: '#fff', borderRadius: 18, width: '100%', maxWidth: 980, maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 },
  paramsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 18, background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' },
  input: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '7px 9px', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit' },
  toggleRow: { display: 'flex', gap: 6 },
  toggleBtn: { flex: 1, padding: '7px 8px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  toggleBtnActive: { background: '#333333', color: '#e4f816', borderColor: '#333333' },
  resultsWrap: { overflowX: 'auto' },
  resultsRow: { display: 'flex', gap: 12, minWidth: 'min-content' },
  resultCard: { minWidth: 210, flex: '0 0 auto', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 12 },
  resultSub: { fontSize: '0.72rem', color: '#9ca3af', marginBottom: 8 },
  resultList: { display: 'flex', flexDirection: 'column' },
}
