import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import EnTeteClient from '../components/EnTeteClient'
import ClientBottomNav from '../components/ClientBottomNav'
import T from '../theme/tokens'
import { FORMATS_COURSE, calculerCourse, calculerSeance, intensiteConseillee, REGLAGES_DEFAUT } from '../utils/calculateurCourse'

// Calculateur de course intermittente.
// - /calculateur : page publique (sans compte), ressource gratuite envoyée en
//   message privé depuis les Réels ; bandeau « Aussi dans l'appli » et ajout à
//   l'écran d'accueil.
// - /client/calculateur : la même page dans l'espace client (menu du profil).

const CLE = 'aw_calculateur_course_v1'
const DEFAUT = { reference: 'vmi', vitesse: '', effort: 30, recup: 30, intensite: 90, demiTours: 1, virages90: 0, virages45: 0, sol: 0, reps: 10, series: 1, recupSeries: 3 }

const virgule = v => String(Math.round(v * 10) / 10).replace('.', ',')
const nombre = v => (v === '' || v == null ? '' : Number(String(v).replace(',', '.')))

export default function CalculateurCourse({ publique = false }) {
  const [p, setP] = useState(() => {
    try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || '{}') } } catch (_) { return DEFAUT }
  })
  const [installer, setInstaller] = useState(false)
  const [detail, setDetail] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(CLE, JSON.stringify(p)) } catch (_) {}
  }, [p])

  // Page publique : l'icône ajoutée à l'écran d'accueil doit rouvrir le calculateur, pas l'appli
  useEffect(() => {
    if (!publique) return
    const lien = document.querySelector('link[rel="manifest"]')
    const avant = lien?.getAttribute('href')
    if (lien) lien.setAttribute('href', '/calculateur.webmanifest')
    const titreAvant = document.title
    document.title = 'Calculateur de course - AWprepa'
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    const metaAvant = meta?.getAttribute('content')
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'apple-mobile-web-app-title'); document.head.appendChild(meta) }
    meta.setAttribute('content', 'Calcul course')
    return () => {
      if (lien && avant) lien.setAttribute('href', avant)
      document.title = titreAvant
      if (metaAvant != null) meta.setAttribute('content', metaAvant); else meta.remove()
    }
  }, [publique])

  const maj = (cle, val) => setP(x => ({ ...x, [cle]: val }))
  const conseil = intensiteConseillee(p.reference, Number(p.effort))

  function choisirFormat(f) {
    const c = intensiteConseillee(p.reference, f.effort)
    setP(x => ({ ...x, effort: f.effort, recup: f.recup, intensite: c ? c.conseil : x.intensite }))
  }
  function choisirReference(ref) {
    const c = intensiteConseillee(ref, Number(p.effort))
    setP(x => ({ ...x, reference: ref, intensite: c ? c.conseil : x.intensite }))
  }

  const r = calculerCourse({
    vitesseRef: nombre(p.vitesse), intensite: Number(p.intensite), effort: Number(p.effort),
    demiTours: p.demiTours, virages90: p.virages90, virages45: p.virages45, sol: p.sol,
  })
  const seance = !r.erreur ? calculerSeance({ distance: r.distance, effort: Number(p.effort), recup: Number(p.recup), reps: Number(p.reps), series: Number(p.series), recupSeriesMin: Number(p.recupSeries) }) : null
  const formatActif = FORMATS_COURSE.find(f => f.effort === Number(p.effort) && f.recup === Number(p.recup))?.nom
  const ref = p.reference === 'vmi' ? 'VMI' : 'VMA'

  return (
    <div style={S.page}>
      <EnTeteClient retour={publique ? undefined : true} titre="Calculateur de course" sousTitre="Intermittent selon ta VMI ou ta VMA" />

      <main style={S.contenu}>
        {publique && (
          <div style={S.bandeau}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={S.bandeauTitre}>Retrouve-le dans l'appli AWprepa</p>
              <p style={S.bandeauTexte}>Avec ton programme et tes séances calculés pour toi.</p>
            </div>
            <button onClick={() => setInstaller(true)} style={S.bandeauBouton}>
              <IconeAjout /> Écran d'accueil
            </button>
          </div>
        )}

        {/* 1. Vitesse de référence */}
        <section style={S.carte}>
          <Titre n="1" texte="Ta vitesse de référence" />
          <div style={S.segment}>
            {[['vmi', 'VMI (test 30-15)'], ['vma', 'VMA']].map(([v, l]) => (
              <button key={v} onClick={() => choisirReference(v)} style={{ ...S.segmentBouton, ...(p.reference === v ? S.segmentActif : {}) }}>{l}</button>
            ))}
          </div>
          <label style={S.champLarge}>
            <span style={S.label}>Ta {ref}</span>
            <div style={S.entreeUnite}>
              <input type="text" inputMode="decimal" placeholder={p.reference === 'vmi' ? 'ex : 19' : 'ex : 16'} value={p.vitesse}
                onChange={e => maj('vitesse', e.target.value.replace(/[^0-9.,]/g, ''))} style={S.entreeGrande} />
              <span style={S.unite}>km/h</span>
            </div>
          </label>
          <p style={S.aide}>
            {p.reference === 'vmi'
              ? 'La vitesse du dernier palier réussi au 30-15 IFT. Au rugby, c’est la plus adaptée : le test comporte des demi-tours, des accélérations et de la récupération.'
              : 'Ta vitesse maximale aérobie, mesurée sur un test en continu (VAMEVAL, Léger-Boucher, 45-15…).'}
          </p>
        </section>

        {/* 2. Format */}
        <section style={S.carte}>
          <Titre n="2" texte="Le format" sousTitre="Secondes d’effort - secondes de récupération" />
          <div style={S.puces}>
            {FORMATS_COURSE.map(f => (
              <button key={f.nom} onClick={() => choisirFormat(f)} style={{ ...S.puce, ...(formatActif === f.nom ? S.puceActive : {}) }}>{f.nom}</button>
            ))}
          </div>
          <div style={S.deuxColonnes}>
            <ChampNombre label="Effort" unite="s" value={p.effort} onChange={v => {
              const c = intensiteConseillee(p.reference, v)
              setP(x => ({ ...x, effort: v, intensite: c ? c.conseil : x.intensite }))
            }} />
            <ChampNombre label="Récupération" unite="s" value={p.recup} onChange={v => maj('recup', v)} />
          </div>
        </section>

        {/* 3. Intensité */}
        <section style={S.carte}>
          <Titre n="3" texte="L’intensité" />
          <Compteur label={`% de ta ${ref}`} value={Number(p.intensite) || 0} pas={5} min={50} max={140} onChange={v => maj('intensite', v)} unite="%" />
          {conseil && (
            <p style={S.aide}>
              {p.reference === 'vmi'
                ? <>Repère pour {p.effort} s d’effort : <strong style={S.fort}>{conseil.min} à {conseil.max} % de ta VMI</strong>. Plus l’effort est court, plus tu peux aller vite.</>
                : <>Repère : un 30-30 se court à <strong style={S.fort}>100 % de VMA</strong>. Plus l’effort est court, plus tu peux dépasser 100 %.</>}
            </p>
          )}
        </section>

        {/* 4. Parcours */}
        <section style={S.carte}>
          <Titre n="4" texte="Ton parcours" sousTitre="Ce qui te ralentit pendant l’effort" />
          <Compteur label="Demi-tours" detail={`− ${virgule(REGLAGES_DEFAUT.cdd180)} s chacun`} value={p.demiTours} onChange={v => maj('demiTours', v)} />
          <Compteur label="Virages à 90°" detail={`− ${virgule(REGLAGES_DEFAUT.cdd90)} s chacun`} value={p.virages90} onChange={v => maj('virages90', v)} />
          <Compteur label="Virages à 45°" detail={`− ${virgule(REGLAGES_DEFAUT.cdd45)} s chacun`} value={p.virages45} onChange={v => maj('virages45', v)} />
          <Compteur label="Passages au sol" detail={`plaquage et relevé, − ${virgule(REGLAGES_DEFAUT.sol)} s chacun`} value={p.sol} onChange={v => maj('sol', v)} dernier />
        </section>

        {/* Résultat */}
        <section style={S.resultat} aria-live="polite">
          {r.erreur ? (
            <p style={S.resultatErreur}>{r.erreur}</p>
          ) : (
            <>
              <p style={S.resultatLabel}>Distance à courir en {p.effort} s</p>
              <p style={S.resultatValeur}>{virgule(r.distance)} <span style={S.resultatUnite}>m</span></p>
              {r.navette && r.trajets > 1 && (
                <p style={S.resultatLigne}>Plots à <strong style={{ color: T.color.signal }}>{virgule(r.ligne)} m</strong>, {r.trajets} trajets</p>
              )}
              {r.navette && <Navette ligne={r.ligne} trajets={r.trajets} />}
              {!r.navette && (
                <p style={S.resultatLigne}>À répartir sur ton parcours, virages compris.</p>
              )}
              <div style={S.resultatGrille}>
                <Info label="Vitesse" valeur={`${virgule(r.vitesseKmh)} km/h`} />
                <Info label="Temps perdu" valeur={`${virgule(r.perte)} s`} />
                <Info label="En ligne droite" valeur={`${virgule(r.distanceDroite)} m`} />
              </div>
            </>
          )}
        </section>

        {/* 5. Séance */}
        <section style={S.carte}>
          <Titre n="5" texte="Ta séance" />
          <Compteur label="Répétitions par série" value={Number(p.reps) || 0} min={1} max={60} onChange={v => maj('reps', v)} />
          <Compteur label="Séries" value={Number(p.series) || 1} min={1} max={10} onChange={v => maj('series', v)} />
          {Number(p.series) > 1 && (
            <Compteur label="Récupération entre les séries" value={Number(p.recupSeries) || 0} min={0} max={15} unite="min" onChange={v => maj('recupSeries', v)} dernier />
          )}
          {seance && (
            <div style={S.bilan}>
              <Info sombre={false} label="Volume total" valeur={`${seance.volume.toLocaleString('fr-FR')} m`} />
              <Info sombre={false} label="Durée" valeur={`≈ ${seance.dureeMin} min`} />
              <Info sombre={false} label="Répétitions" valeur={seance.repsTotal} />
            </div>
          )}
        </section>

        {publique && (
          <section style={S.carte}>
            <p style={S.appelTitre}>Le calcul, c’est la base.</p>
            <p style={S.appelTexte}>
              Choisir le bon format au bon moment de la semaine, le faire progresser, l’adapter à tes entraînements de club et à tes matchs : c’est là que tout se joue.
              Tu veux un programme de course et de musculation construit pour toi ? Écris-moi en message privé.
            </p>
          </section>
        )}

        <button onClick={() => setDetail(v => !v)} style={S.lienDetail}>
          {detail ? 'Masquer le détail du calcul' : 'Comment c’est calculé ?'}
        </button>
        {detail && (
          <div style={S.detail}>
            <p style={S.detailTexte}>Vitesse = ta {ref} × le % d’intensité. On retire du temps d’effort le temps perdu dans les changements de direction et les passages au sol, puis on calcule la distance parcourue à cette vitesse pendant le temps qui reste.</p>
            <p style={S.detailTexte}>Temps perdus utilisés : demi-tour {virgule(REGLAGES_DEFAUT.cdd180)} s, virage à 90° {virgule(REGLAGES_DEFAUT.cdd90)} s, virage à 45° {virgule(REGLAGES_DEFAUT.cdd45)} s, passage au sol {virgule(REGLAGES_DEFAUT.sol)} s.</p>
            <p style={S.detailTexte}>Repères d’intensité en % de VMI : d’après les travaux de Martin Buchheit sur le 30-15 Intermittent Fitness Test.</p>
          </div>
        )}
        {publique && <p style={S.pied}>AWprepa - préparation physique</p>}
      </main>

      {!publique && <ClientBottomNav />}
      {installer && <AjoutEcranAccueil onFermer={() => setInstaller(false)} />}
    </div>
  )
}

/* ---------- petits composants ---------- */

function Titre({ n, texte, sousTitre }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={S.titre}><span style={S.titreNum}>{n}</span>{texte}</p>
      {sousTitre && <p style={S.sousTitre}>{sousTitre}</p>}
    </div>
  )
}

function ChampNombre({ label, unite, value, onChange }) {
  return (
    <label style={S.champLarge}>
      <span style={S.label}>{label}</span>
      <div style={S.entreeUnite}>
        <input type="text" inputMode="numeric" value={value} onChange={e => {
          const v = e.target.value.replace(/[^0-9]/g, '')
          onChange(v === '' ? '' : Number(v))
        }} style={S.entree} />
        <span style={S.unite}>{unite}</span>
      </div>
    </label>
  )
}

function Compteur({ label, detail, value, onChange, pas = 1, min = 0, max = 20, unite, dernier }) {
  const v = Number(value) || 0
  return (
    <div style={{ ...S.compteur, ...(dernier ? { borderBottom: 'none' } : {}) }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={S.compteurLabel}>{label}</p>
        {detail && <p style={S.compteurDetail}>{detail}</p>}
      </div>
      <button aria-label={`Moins : ${label}`} onClick={() => onChange(Math.max(min, v - pas))} style={S.compteurBouton} disabled={v <= min}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
      <span style={S.compteurValeur}>{v}{unite ? <span style={S.compteurUnite}> {unite}</span> : null}</span>
      <button aria-label={`Plus : ${label}`} onClick={() => onChange(Math.min(max, v + pas))} style={S.compteurBouton} disabled={v >= max}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  )
}

function Info({ label, valeur, sombre = true }) {
  return (
    <div>
      <p style={{ ...S.infoLabel, color: sombre ? T.color.onDarkMuted : T.color.muted }}>{label}</p>
      <p style={{ ...S.infoValeur, color: sombre ? T.color.onDark : T.color.ink }}>{valeur}</p>
    </div>
  )
}

// Schéma de la navette : plot de départ (jaune), plot de demi-tour (bleu), allers-retours
function Navette({ ligne, trajets }) {
  const W = 300, x1 = 28, x2 = W - 28
  const n = Math.min(trajets, 6)
  const h = 18 + n * 12
  return (
    <svg viewBox={`0 0 ${W} ${h + 34}`} style={{ width: '100%', maxWidth: 360, display: 'block', margin: '14px 0 4px' }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const y = 14 + i * 12
        const [a, b] = i % 2 === 0 ? [x1 + 10, x2 - 10] : [x2 - 10, x1 + 10]
        const fin = b + (i % 2 === 0 ? -6 : 6)
        return (
          <g key={i} stroke="rgba(255,255,255,0.55)" strokeWidth="2" fill="none" strokeLinecap="round">
            <line x1={a} y1={y} x2={fin} y2={y} />
            <polyline points={i % 2 === 0 ? `${fin - 5},${y - 4} ${fin + 1},${y} ${fin - 5},${y + 4}` : `${fin + 5},${y - 4} ${fin - 1},${y} ${fin + 5},${y + 4}`} />
          </g>
        )
      })}
      <polygon points={`${x1 - 8},${h + 6} ${x1 + 8},${h + 6} ${x1},${h - 10}`} fill="#f2c94c" />
      <polygon points={`${x2 - 8},${h + 6} ${x2 + 8},${h + 6} ${x2},${h - 10}`} fill="#2f80ed" />
      <text x={W / 2} y={h + 26} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="13" fontWeight="700" fontFamily={T.font.body}>
        {trajets > 1 ? `${virgule(ligne)} m entre les plots` : `${virgule(ligne)} m en ligne droite`}
      </text>
    </svg>
  )
}

// Ajout à l'écran d'accueil.
// iPhone : Safari ne permet pas à un site de s'ajouter tout seul, et le menu Partager
// ouvert par un site (navigator.share) n'a PAS « Sur l'écran d'accueil » (testé par
// Arthur le 20/11/2026) : il faut le bouton Partager de Safari lui-même.
// Android (Chrome) : installation en un appui quand le navigateur la propose.
// Navigateur d'Instagram, Facebook ou TikTok : il faut d'abord ouvrir la page dans le navigateur du téléphone.
function AjoutEcranAccueil({ onFermer }) {
  const ua = navigator.userAgent || ''
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isInApp = /Instagram|FBAN|FBAV|TikTok|BytedanceWebview/i.test(ua)
  const isNonSafari = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(ua)
  const installe = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  const invite = window.__awInstallPrompt

  async function agir() {
    if (invite) {
      invite.prompt()
      try { await invite.userChoice } catch (_) {}
      window.__awInstallPrompt = null
      onFermer()
    }
  }

  let etapes, bouton = null
  if (installe) {
    etapes = [['ok', 'C’est déjà fait : tu utilises le calculateur depuis ton écran d’accueil.']]
  } else if (isInApp) {
    etapes = [
      ['menu', <>Appuie sur les <strong style={S.feuilleFort}>trois points</strong> en haut à droite</>],
      ['ouvrir', <>Choisis <strong style={S.feuilleFort}>« Ouvrir dans le navigateur »</strong></>],
      ['plus', <>Puis reviens sur ce bouton dans {isIOS ? 'Safari' : 'ton navigateur'}</>],
    ]
  } else if (isIOS && isNonSafari) {
    etapes = [['ouvrir', <>Sur iPhone, l’ajout fonctionne depuis <strong style={S.feuilleFort}>Safari</strong> : ouvre {window.location.host}/calculateur dans Safari</>]]
  } else if (isIOS) {
    etapes = [
      ['partager', <>Appuie sur le bouton <strong style={S.feuilleFort}>Partager</strong> de Safari, en bas de l’écran (ou dans le menu aux trois points)</>],
      ['plus', <>Choisis <strong style={S.feuilleFort}>« Sur l’écran d’accueil »</strong>, puis « Ajouter »</>],
    ]
  } else if (invite) {
    etapes = [['plus', 'Un appui suffit : le calculateur s’ajoute à ton écran d’accueil.']]
    bouton = 'Ajouter à l’écran d’accueil'
  } else {
    etapes = [
      ['menu', <>Ouvre le <strong style={S.feuilleFort}>menu</strong> de ton navigateur (les trois points)</>],
      ['plus', <>Choisis <strong style={S.feuilleFort}>« Ajouter à l’écran d’accueil »</strong></>],
    ]
  }

  return createPortal(
    <>
      <div onClick={onFermer} style={S.voile} />
      <div role="dialog" aria-label="Ajouter à l'écran d'accueil" style={S.feuille}>
        <div style={S.poignee} />
        <p style={S.feuilleTitre}>Le calculateur sur ton écran d’accueil</p>
        <p style={S.feuilleTexte}>Il s’ouvrira comme une appli, sans passer par le navigateur.</p>
        <div style={S.feuilleEtapes}>
          {etapes.map(([icone, texte], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={S.feuilleIcone}><IconeEtape type={icone} /></div>
              <p style={S.feuilleEtape}>{texte}</p>
            </div>
          ))}
        </div>
        {bouton && <button onClick={agir} style={S.feuilleBouton}>{bouton}</button>}
        <button onClick={onFermer} style={S.feuilleFermer}>Fermer</button>
      </div>
    </>,
    document.body
  )
}

function IconeEtape({ type }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#e4f816', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'partager') return <svg {...p}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
  if (type === 'menu') return <svg {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
  if (type === 'ouvrir') return <svg {...p}><path d="M14 4h6v6" /><line x1="20" y1="4" x2="11" y2="13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
  if (type === 'ok') return <svg {...p}><polyline points="5 12 10 17 19 7" /></svg>
  return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="6" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
}

function IconeAjout() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="6" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
}

/* ---------- styles (jetons du thème d'origine) ---------- */
const S = {
  page: { minHeight: '100vh', background: T.color.page, fontFamily: T.font.body, paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' },
  contenu: { maxWidth: 560, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 },

  bandeau: { display: 'flex', alignItems: 'center', gap: 12, background: T.color.anthracite, borderRadius: T.radius.card, padding: '12px 12px 12px 16px' },
  bandeauTitre: { margin: 0, fontSize: T.size.md, fontWeight: 700, color: T.color.onDark },
  bandeauTexte: { margin: '2px 0 0', fontSize: T.size.xs, color: T.color.onDarkMuted, lineHeight: 1.35 },
  bandeauBouton: { minHeight: T.touch, padding: '0 12px', borderRadius: T.radius.control, border: 'none', background: T.color.signal, color: T.color.anthracite, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' },

  carte: { ...T.card },
  titre: { margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: T.size.lg, fontWeight: 700, color: T.color.ink },
  titreNum: { width: 24, height: 24, borderRadius: T.radius.pill, background: T.color.ink, color: T.color.signal, fontSize: T.size.xs, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sousTitre: { margin: '4px 0 0 34px', fontSize: T.size.sm, color: T.color.muted },
  label: { ...T.label },
  aide: { margin: '10px 0 0', fontSize: T.size.sm, color: T.color.muted, lineHeight: 1.45 },
  fort: { color: T.color.ink },

  segment: { display: 'flex', gap: 6, background: T.color.soft, borderRadius: T.radius.control, padding: 4, marginBottom: 12 },
  segmentBouton: { flex: 1, minHeight: 40, borderRadius: 8, border: 'none', background: 'transparent', color: T.color.muted, fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 700, cursor: 'pointer' },
  segmentActif: { background: T.color.ink, color: T.color.signal },

  champLarge: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 },
  entreeUnite: { display: 'flex', alignItems: 'center', border: `1.5px solid ${T.color.line}`, borderRadius: T.radius.control, background: T.color.card, paddingRight: 12 },
  entreeGrande: { flex: 1, minWidth: 0, height: 52, border: 'none', outline: 'none', background: 'transparent', padding: '0 12px', fontFamily: T.font.body, fontSize: T.size.xl, fontWeight: 700, color: T.color.ink, ...T.num },
  entree: { flex: 1, minWidth: 0, height: T.touch, border: 'none', outline: 'none', background: 'transparent', padding: '0 12px', fontFamily: T.font.body, fontSize: T.size.lg, fontWeight: 700, color: T.color.ink, ...T.num },
  unite: { fontSize: T.size.md, fontWeight: 600, color: T.color.muted },
  deuxColonnes: { display: 'flex', gap: 10, marginTop: 12 },

  puces: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  puce: { minHeight: T.touch, borderRadius: T.radius.control, border: `1.5px solid ${T.color.line}`, background: T.color.card, color: T.color.ink, fontFamily: T.font.body, fontSize: T.size.base, fontWeight: 700, cursor: 'pointer', ...T.num },
  puceActive: { background: T.color.ink, color: T.color.signal, border: `1.5px solid ${T.color.ink}` },

  compteur: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.color.soft}` },
  compteurLabel: { margin: 0, fontSize: T.size.base, fontWeight: 600, color: T.color.ink },
  compteurDetail: { margin: '2px 0 0', fontSize: T.size.xs, color: T.color.muted },
  compteurBouton: { width: T.touch, height: T.touch, borderRadius: T.radius.control, border: `1.5px solid ${T.color.line}`, background: T.color.card, color: T.color.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  compteurValeur: { minWidth: 44, textAlign: 'center', fontSize: T.size.xl, fontWeight: 700, color: T.color.ink, ...T.num },
  compteurUnite: { fontSize: T.size.sm, fontWeight: 600, color: T.color.muted },

  resultat: { background: T.color.anthracite, borderRadius: T.radius.card, padding: '18px 16px' },
  resultatLabel: { margin: 0, fontSize: T.size.sm, fontWeight: 600, color: T.color.onDarkMuted },
  resultatValeur: { margin: '4px 0 0', fontSize: 48, fontWeight: 800, color: T.color.onDark, lineHeight: 1, letterSpacing: -1, ...T.num },
  resultatUnite: { fontSize: T.size.xl, fontWeight: 700, color: T.color.onDarkMuted },
  resultatLigne: { margin: '10px 0 0', fontSize: T.size.base, color: T.color.onDark, lineHeight: 1.4 },
  resultatErreur: { margin: 0, fontSize: T.size.base, color: T.color.onDark, lineHeight: 1.45 },
  resultatGrille: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' },
  infoLabel: { margin: 0, fontSize: T.size.xs, fontWeight: 600 },
  infoValeur: { margin: '2px 0 0', fontSize: T.size.lg, fontWeight: 700, ...T.num },

  bilan: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, padding: 12, background: T.color.soft, borderRadius: T.radius.control },

  appelTitre: { margin: 0, fontSize: T.size.lg, fontWeight: 700, color: T.color.ink },
  appelTexte: { margin: '6px 0 0', fontSize: T.size.md, color: T.color.muted, lineHeight: 1.5 },

  lienDetail: { alignSelf: 'center', minHeight: T.touch, padding: '0 12px', background: 'none', border: 'none', color: T.color.ink, fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' },
  detail: { ...T.card, background: T.color.soft, boxShadow: 'none' },
  detailTexte: { margin: '0 0 8px', fontSize: T.size.sm, color: T.color.muted, lineHeight: 1.5 },
  pied: { margin: '8px 0 0', textAlign: 'center', fontSize: T.size.xs, color: T.color.muted },

  voile: { position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.55)' },
  feuille: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#1e1e1e', borderRadius: '24px 24px 0 0', padding: '12px 24px calc(env(safe-area-inset-bottom) + 24px)', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: T.font.body, maxWidth: 560, margin: '0 auto' },
  poignee: { width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', marginBottom: 20 },
  feuilleTitre: { margin: 0, fontSize: T.size.lg, fontWeight: 700, color: '#fff', textAlign: 'center' },
  feuilleTexte: { margin: '6px 0 18px', fontSize: T.size.sm, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.45 },
  feuilleEtapes: { width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  feuilleIcone: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(228,248,22,0.12)', border: '1.5px solid rgba(228,248,22,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  feuilleEtape: { margin: 0, fontSize: T.size.md, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 },
  feuilleFort: { color: '#fff' },
  feuilleBouton: { width: '100%', height: 52, borderRadius: 14, border: 'none', background: T.color.signal, color: T.color.anthracite, fontFamily: T.font.body, fontSize: T.size.lg, fontWeight: 700, cursor: 'pointer', marginBottom: 4 },
  feuilleFermer: { minHeight: T.touch, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 500, cursor: 'pointer' },
}
