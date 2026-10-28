import { useEffect, useState } from 'react'
import { FORMATS, calculerIntermittent, genererSchema, libelleIntermittent } from '../utils/intermittents'
import { repereIntensite, arrondiDemi } from '../utils/courseVmi'

// Fenêtre « Ajouter un intermittent » (séance terrain d'un client et
// Bibliothèque > Schémas) : format, changements de direction (demi-tours),
// intensité, VMI → distance calculée en direct, puis bloc + schéma générés.

const virgule = v => String(Math.round(v * 10) / 10).replace('.', ',')

export default function AjouterIntermittentModal({ vmiJoueur, onValider, onClose, libelleValider = 'Ajouter à la séance' }) {
  const [format, setFormat] = useState('30-30')
  const [effort, setEffort] = useState(30)
  const [recup, setRecup] = useState(30)
  const [cdd, setCdd] = useState(1)
  const [intensite, setIntensite] = useState(repereIntensite(30).conseil)
  const [vmi, setVmi] = useState(vmiJoueur ?? '')
  const [reps, setReps] = useState(10)
  const [series, setSeries] = useState(1)
  const [recupSeries, setRecupSeries] = useState(3)
  const [surface, setSurface] = useState('gazon')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function choisirFormat(f) {
    setFormat(f.nom)
    setEffort(f.effort); setRecup(f.recup)
    setIntensite(repereIntensite(f.effort).conseil)
  }
  function changerEffort(v) {
    setFormat('autre'); setEffort(v)
    const r = repereIntensite(v); if (r) setIntensite(r.conseil)
  }

  const num = v => (v === '' ? '' : Number(v))
  const params = { effort: Number(effort), recup: Number(recup), cdd, intensite: Number(intensite), vmi: Number(vmi), reps: Number(reps), series: Number(series), recupSeries: Number(recupSeries), surface }
  const calcul = calculerIntermittent(params)
  const repere = repereIntensite(Number(effort))
  const ok = !calcul.erreur && !calcul.tropLong
  const totalExercice = calcul.total ? calcul.total * (Number(reps) || 0) * (Number(series) || 1) : 0

  async function valider() {
    if (!ok) return
    setSaving(true)
    const nom = `${params.effort}-${params.recup} · ${params.intensite} % VMI`
    const contenu = [{ texte: libelleIntermittent(params, calcul.ligne), repos: params.series > 1 ? `r = ${params.recupSeries}'` : null }]
    await onValider({ nom, contenu, schema: genererSchema(params, calcul.ligne) })
    setSaving(false)
  }

  const champNum = (label, value, set, props = {}) => (
    <label style={S.champ}>
      <span style={S.label}>{label}</span>
      <input type="number" inputMode="decimal" min="0" value={value} onChange={e => set(num(e.target.value))} style={S.input} {...props} />
    </label>
  )

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Ajouter un intermittent">
        <div style={S.head}>
          <p style={S.titre}>Ajouter un intermittent</p>
          <button onClick={onClose} style={S.fermer} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div style={S.corps}>
          <div style={S.champ}>
            <span style={S.label}>Format</span>
            <div style={S.segments}>
              {FORMATS.map(f => (
                <button key={f.nom} type="button" onClick={() => choisirFormat(f)} style={{ ...S.segment, ...(format === f.nom ? S.segmentOn : null) }}>{f.nom}</button>
              ))}
              <button type="button" onClick={() => setFormat('autre')} style={{ ...S.segment, ...(format === 'autre' ? S.segmentOn : null) }}>Autre</button>
            </div>
          </div>

          <div style={S.grille}>
            {champNum('Effort (s)', effort, changerEffort)}
            {champNum('Récup (s)', recup, v => { setFormat('autre'); setRecup(v) })}
          </div>

          <div style={S.champ}>
            <span style={S.label}>Changements de direction (demi-tours)</span>
            <div style={S.stepper}>
              <button type="button" onClick={() => setCdd(c => Math.max(0, c - 1))} style={S.stepBtn} aria-label="Un de moins">−</button>
              <span style={S.stepVal}>{cdd}</span>
              <button type="button" onClick={() => setCdd(c => Math.min(10, c + 1))} style={S.stepBtn} aria-label="Un de plus">+</button>
            </div>
          </div>

          <div style={S.grille}>
            <label style={S.champ}>
              <span style={S.label}>Intensité (% VMI)</span>
              <input type="number" min="0" step="5" value={intensite} onChange={e => setIntensite(num(e.target.value))} style={S.input} />
              {repere && <span style={S.aide}>Repère pour {effort} s : {repere.min} à {repere.max} %</span>}
            </label>
            <label style={S.champ}>
              <span style={S.label}>VMI du joueur (km/h)</span>
              <input type="number" min="0" step="0.5" value={vmi} onChange={e => setVmi(num(e.target.value))} placeholder="À saisir" style={S.input} />
              {vmiJoueur ? <span style={S.aide}>Dernier 30-15 : {virgule(vmiJoueur)} km/h</span> : <span style={S.aide}>Aucun 30-15 enregistré</span>}
            </label>
          </div>

          <div style={S.grille}>
            {champNum('Répétitions', reps, setReps)}
            {champNum('Séries', series, setSeries, { min: 1 })}
            {Number(series) > 1 && champNum('Récup entre séries (min)', recupSeries, setRecupSeries)}
          </div>

          <div style={S.champ}>
            <span style={S.label}>Fond du schéma</span>
            <div style={S.segments}>
              {[['gazon', 'Terrain de rugby'], ['vierge', 'Vierge']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setSurface(k)} style={{ ...S.segment, ...(surface === k ? S.segmentOn : null) }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ ...S.resultat, ...(calcul.erreur || calcul.tropLong ? S.resultatErreur : null) }}>
            {calcul.erreur ? calcul.erreur : (
              <>
                <p style={S.resultatGrand}>
                  {cdd > 0
                    ? `Plots à ${virgule(arrondiDemi(calcul.ligne))} m · ${cdd + 1} trajets (${cdd} demi-tour${cdd > 1 ? 's' : ''})`
                    : `Ligne droite de ${virgule(arrondiDemi(calcul.ligne))} m`}
                </p>
                <p style={S.resultatSous}>
                  {virgule(calcul.total)} m par répétition, à {virgule(calcul.vitesse * 3.6)} km/h{cdd > 0 ? ` · ${cdd} s perdue${cdd > 1 ? 's' : ''} aux demi-tours` : ''}
                </p>
                {totalExercice > 0 && (
                  <p style={S.resultatSous}>
                    Exercice complet : {Number(series) > 1 ? `${series} × ` : ''}{reps} × {virgule(calcul.total)} m = <b style={{ color: '#1a1a1a' }}>{Math.round(totalExercice).toLocaleString('fr-FR')} m</b>
                  </p>
                )}
                {calcul.tropLong && (
                  <p style={{ ...S.resultatSous, color: '#b91c1c', fontWeight: 700, marginTop: 6 }}>
                    La ligne est plus longue que le terrain : ajoute un changement de direction ou choisis le fond vierge.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div style={S.pied}>
          <button onClick={onClose} style={S.btnSecondaire}>Annuler</button>
          <button onClick={valider} disabled={!ok || saving} style={{ ...S.btnPrincipal, opacity: !ok || saving ? 0.5 : 1 }}>
            {saving ? 'Création…' : libelleValider}
          </button>
        </div>
      </div>
    </div>
  )
}

// Mêmes styles que ModifierClientModal
const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: '1px solid #f3f4f6' },
  titre: { margin: 0, fontSize: 18, fontWeight: 800, color: '#1a1a1a' },
  fermer: { width: 44, height: 44, marginRight: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 10, color: '#4b5563', cursor: 'pointer' },
  corps: { padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  champ: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  aide: { fontSize: 12.5, color: '#6b7280' },
  input: { width: '100%', minHeight: 44, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: '#1a1a1a', background: '#ffffff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  segments: { display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 10, padding: 3, flexWrap: 'wrap' },
  segment: { flex: '1 1 auto', minHeight: 38, border: 'none', background: 'none', color: '#4b5563', fontSize: 13, fontWeight: 700, padding: '0 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  segmentOn: { background: '#333333', color: '#e4f816' },
  stepper: { display: 'flex', alignItems: 'center', gap: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#ffffff', color: '#374151', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  stepVal: { minWidth: 32, textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' },
  resultat: { background: '#f3f4f6', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, color: '#374151' },
  resultatErreur: { background: '#fef2f2', color: '#b91c1c' },
  resultatGrand: { margin: 0, fontSize: 14, fontWeight: 600, color: '#1a1a1a' },
  resultatSous: { margin: '4px 0 0', fontSize: 13, color: '#6b7280' },
  pied: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' },
  btnSecondaire: { minHeight: 44, background: '#ffffff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrincipal: { minHeight: 44, background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}
