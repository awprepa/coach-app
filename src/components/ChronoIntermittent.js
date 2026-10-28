import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PLOTS, passagesPlots } from '../utils/intermittents'

// Chrono plein écran d'un intermittent (séance terrain côté joueur) : 5 s de
// préparation, puis effort / récup × répétitions. Bips au départ, à chaque
// plot de demi-tour, à la fin de l'effort et 3 s avant chaque départ. L'écran
// reste allumé (Wake Lock) quand le téléphone le permet.

const PREPA = 5

function phasesDe(info) {
  const ph = [{ type: 'prepa', dur: PREPA, rep: 1 }]
  for (let r = 1; r <= info.reps; r++) {
    ph.push({ type: 'effort', dur: info.effort, rep: r })
    if (r < info.reps && info.recup > 0) ph.push({ type: 'recup', dur: info.recup, rep: r })
  }
  return ph
}

const virgule = v => String(Math.round(v * 10) / 10).replace('.', ',')

export default function ChronoIntermittent({ titre, info, onClose, onTermine }) {
  const phases = useMemo(() => phasesDe(info), [info])
  const passages = useMemo(() => (info.navette ? passagesPlots(info) : []), [info])
  const [demarre, setDemarre] = useState(false)
  const [idx, setIdx] = useState(0)
  const [ecoule, setEcoule] = useState(0) // s écoulées dans la phase
  const [pause, setPause] = useState(false)
  const [fini, setFini] = useState(false)
  const [son, setSon] = useState(true)

  const debutRef = useRef(0)      // performance.now() du début de la phase
  const precedentRef = useRef(0)  // écoulé au tick précédent (pour les bips)
  const audioRef = useRef(null)
  const wakeRef = useRef(null)
  const sonRef = useRef(son)
  sonRef.current = son

  function bip(freq = 880, duree = 0.12, fois = 1) {
    const ctx = audioRef.current
    if (!ctx || !sonRef.current) return
    for (let i = 0; i < fois; i++) {
      const t = ctx.currentTime + i * (duree + 0.08)
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree)
      o.connect(g); g.connect(ctx.destination)
      o.start(t); o.stop(t + duree + 0.02)
    }
  }
  const vibrer = ms => { try { navigator.vibrate?.(ms) } catch (e) { /* non pris en charge */ } }

  async function demarrer() {
    // Créé au toucher : sans geste de l'utilisateur, iOS n'autorise pas le son
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx && !audioRef.current) audioRef.current = new Ctx()
      await audioRef.current?.resume()
    } catch (e) { /* pas de son */ }
    try { wakeRef.current = await navigator.wakeLock?.request('screen') } catch (e) { /* écran non maintenu */ }
    debutRef.current = performance.now()
    precedentRef.current = 0
    setDemarre(true)
  }

  useEffect(() => () => {
    try { wakeRef.current?.release() } catch (e) { /* déjà libéré */ }
    try { audioRef.current?.close() } catch (e) { /* déjà fermé */ }
  }, [])

  // Horloge
  useEffect(() => {
    if (!demarre || pause || fini) return
    const timer = setInterval(() => {
      const ph = phases[idx]
      const t = (performance.now() - debutRef.current) / 1000
      const avant = precedentRef.current
      const franchi = s => avant < s && t >= s
      if (ph.type === 'effort') passages.forEach(p => { if (franchi(p)) { bip(1040, 0.1); vibrer(60) } })
      else [ph.dur - 3, ph.dur - 2, ph.dur - 1].forEach(s => { if (s > 0 && franchi(s)) bip(660, 0.09) })
      precedentRef.current = t
      if (t >= ph.dur) {
        if (idx + 1 >= phases.length) {
          bip(1040, 0.18, 3); vibrer([200, 100, 200])
          setFini(true); setEcoule(ph.dur)
          return
        }
        const suivante = phases[idx + 1]
        if (suivante.type === 'effort') { bip(1040, 0.45); vibrer(300) } else { bip(520, 0.45); vibrer(300) }
        debutRef.current += ph.dur * 1000
        precedentRef.current = 0
        setIdx(idx + 1); setEcoule(0)
      } else setEcoule(t)
    }, 100)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demarre, pause, fini, idx, phases, passages])

  function basculerPause() {
    if (pause) debutRef.current = performance.now() - ecoule * 1000
    setPause(!pause)
  }
  function allerA(i) {
    debutRef.current = performance.now()
    precedentRef.current = 0
    setIdx(i); setEcoule(0); setPause(false)
  }
  // Recommencer l'effort de la navette en cours
  function recommencer() {
    const ph = phases[idx]
    allerA(ph.type === 'effort' ? idx : phases.findIndex(p => p.type === 'effort' && p.rep === ph.rep))
  }
  function passer() {
    if (idx + 1 < phases.length) allerA(idx + 1)
    else { setFini(true); setPause(false) }
  }

  const ph = phases[idx]
  const reste = Math.max(0, Math.ceil(ph.dur - ecoule - 1e-6))
  const pct = Math.min(100, (ecoule / ph.dur) * 100)
  const libelle = { prepa: 'PRÊT', effort: 'EFFORT', recup: 'RÉCUP' }[ph.type]

  // Trajet en cours et prochain plot (effort, navette)
  const nbTrajets = info.navette ? info.cdd + 1 : 0
  let trajet = 0, prochain = null
  if (ph.type === 'effort' && nbTrajets > 1) {
    trajet = passages.filter(p => ecoule >= p).length
    prochain = passages.find(p => p > ecoule)
  }
  const couleurPlot = k => (k % 2 === 0 ? PLOTS.depart : PLOTS.demiTour)

  let ensuite = null
  if (ph.type === 'effort') {
    const apres = idx + 1 < phases.length ? `puis ${phases[idx + 1].dur} s de récup` : 'dernière navette'
    ensuite = prochain != null
      ? <>Plot {couleurPlot(trajet + 1).nom} dans <b style={S.blanc}>{Math.max(0, Math.ceil(prochain - ecoule))} s</b> · {apres}</>
      : <>{apres.charAt(0).toUpperCase() + apres.slice(1)}</>
  } else if (ph.type === 'recup') ensuite = <>Navette {ph.rep + 1} au plot <b style={S.blanc}>{couleurPlot(info.cdd + 1).nom}</b></>
  else ensuite = <>Place-toi au plot <b style={S.blanc}>{PLOTS.depart.nom}</b></>

  const contenu = (
    <div style={S.ecran} role="dialog" aria-label="Chrono">
      <div style={S.tete}>
        <span style={S.titre}>{titre}</span>
        <button onClick={onClose} style={S.x} aria-label="Fermer le chrono">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      {!demarre ? (
        <div style={S.accueil}>
          <p style={S.accueilGrand}>{info.reps} × {info.effort}-{info.recup}</p>
          {info.navette && info.ligne != null && (
            <p style={S.accueilSous}>
              {info.cdd > 0 ? `Plots à ${virgule(Math.round(info.ligne * 2) / 2)} m · ${info.cdd} demi-tour${info.cdd > 1 ? 's' : ''} par navette` : `Ligne droite de ${virgule(Math.round(info.ligne * 2) / 2)} m`}
            </p>
          )}
          <p style={S.accueilSous}>Monte le son du téléphone : un bip au départ, à chaque plot et à la fin de l'effort.</p>
          <button onClick={demarrer} style={S.go}>Démarrer</button>
        </div>
      ) : fini ? (
        <div style={S.accueil}>
          <p style={S.accueilGrand}>Bloc terminé</p>
          <p style={S.accueilSous}>{info.reps} navette{info.reps > 1 ? 's' : ''} de {info.effort}-{info.recup}.</p>
          <button onClick={() => { onTermine?.(); onClose() }} style={S.go}>Marquer le bloc terminé</button>
          <button onClick={onClose} style={S.secondaire}>Fermer</button>
        </div>
      ) : (
        <>
          <div style={S.rep}>{ph.type === 'prepa' ? 'Départ dans' : `Navette ${ph.rep} sur ${info.reps}`}</div>
          <div style={S.reps}>
            {Array.from({ length: info.reps }, (_, i) => {
              const r = i + 1
              const etat = r < ph.rep || (r === ph.rep && ph.type === 'recup') ? 'ok' : r === ph.rep && ph.type === 'effort' ? 'en' : ''
              return <i key={r} style={{ ...S.repBarre, ...(etat === 'ok' ? S.repOk : etat === 'en' ? S.repEn : null) }} />
            })}
          </div>

          <span style={{ ...S.phase, ...(ph.type === 'effort' ? null : S.phaseCalme) }}>{libelle}{pause ? ' · EN PAUSE' : ''}</span>
          <div style={S.compte}>{reste}<small style={S.s}>s</small></div>
          <div style={S.barre}><i style={{ ...S.barreIn, width: `${pct}%`, background: ph.type === 'effort' ? '#e4f816' : 'rgba(255,255,255,0.5)' }} /></div>

          {ph.type === 'effort' && nbTrajets > 1 && (
            <div style={{ ...S.trajets, gridTemplateColumns: `repeat(${Math.min(nbTrajets, 4)}, 1fr)` }}>
              {Array.from({ length: nbTrajets }, (_, k) => {
                const vers = couleurPlot(k + 1)
                const etat = k < trajet ? S.trajetOk : k === trajet ? S.trajetEn : null
                return (
                  <div key={k} style={{ ...S.trajet, ...etat }}>
                    <b style={{ ...S.trajetNum, ...(k === trajet ? { color: '#e4f816' } : null) }}>{k + 1}</b>
                    <span style={S.versPlot}><i style={{ ...S.pastille, background: vers.color }} />{vers.nom}</span>
                  </div>
                )
              })}
            </div>
          )}
          <p style={S.ensuite}>{ensuite}</p>

          <div style={S.bas}>
            <button onClick={recommencer} style={S.rond} aria-label="Recommencer la navette">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /></svg>
            </button>
            <button onClick={basculerPause} style={{ ...S.rond, ...S.rondPause }} aria-label={pause ? 'Reprendre' : 'Pause'}>
              {pause
                ? <svg width="26" height="26" viewBox="0 0 24 24" fill="#1a1a1a"><path d="M7 4.5v15l12-7.5z" /></svg>
                : <svg width="26" height="26" viewBox="0 0 24 24" fill="#1a1a1a"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
            </button>
            <button onClick={passer} style={S.rond} aria-label="Passer à la suite">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M5 5v14l9-7zM16 5h3v14h-3z" /></svg>
            </button>
          </div>
          <button onClick={() => setSon(!son)} style={S.son}>{son ? 'Bips activés · toucher pour couper' : 'Bips coupés · toucher pour activer'}</button>
        </>
      )}
    </div>
  )
  return createPortal(contenu, document.body)
}

const S = {
  ecran: { position: 'fixed', inset: 0, zIndex: 1100, background: '#1a1a1a', color: '#ffffff', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' },
  tete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' },
  titre: { fontSize: 14, fontWeight: 800 },
  x: { width: 44, height: 44, marginRight: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' },
  blanc: { color: '#ffffff' },

  accueil: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px 40px', gap: 12 },
  accueilGrand: { margin: 0, fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  accueilSous: { margin: 0, fontSize: 15, color: 'rgba(255,255,255,0.72)', lineHeight: 1.45 },
  go: { marginTop: 16, minHeight: 56, border: 'none', borderRadius: 14, background: '#e4f816', color: '#1a1a1a', fontSize: 17, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  secondaire: { minHeight: 48, border: 'none', borderRadius: 14, background: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },

  rep: { padding: '4px 16px 0', fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  reps: { display: 'flex', gap: 4, padding: '12px 16px 0' },
  repBarre: { flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.14)', display: 'block' },
  repOk: { background: 'rgba(228,248,22,0.55)' },
  repEn: { background: '#e4f816' },

  phase: { margin: '26px 16px 0', alignSelf: 'flex-start', background: '#e4f816', color: '#1a1a1a', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', padding: '7px 12px', borderRadius: 8 },
  phaseCalme: { background: 'rgba(255,255,255,0.14)', color: '#ffffff' },
  compte: { padding: '0 16px', fontSize: 'min(156px, 38vw)', lineHeight: 1, fontWeight: 800, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', marginTop: 6 },
  s: { fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: 0, marginLeft: 6 },
  barre: { margin: '14px 16px 0', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  barreIn: { display: 'block', height: '100%' },

  trajets: { margin: '24px 16px 0', display: 'grid', gap: 6 },
  trajet: { borderRadius: 10, padding: '9px 8px', background: 'rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  trajetOk: { opacity: 0.45 },
  trajetEn: { outline: '1.5px solid #e4f816', background: 'rgba(228,248,22,0.08)' },
  trajetNum: { display: 'block', fontSize: 15, color: '#ffffff', fontVariantNumeric: 'tabular-nums' },
  versPlot: { display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },
  pastille: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 },
  ensuite: { margin: '20px 16px 0', fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 },

  bas: { marginTop: 'auto', padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  rond: { width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  rondPause: { width: 76, height: 76, background: '#e4f816' },
  son: { alignSelf: 'center', minHeight: 44, margin: '0 0 12px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' },
}
