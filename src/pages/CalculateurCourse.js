import { useEffect, useState } from 'react'
import EnTeteClient from '../components/EnTeteClient'
import ClientBottomNav from '../components/ClientBottomNav'
import SchemaTerrainView from '../components/SchemaTerrainView'
import T from '../theme/tokens'
import { FORMATS_COURSE, calculerCourse, calculerSeance, intensiteConseillee, genererParcours } from '../utils/calculateurCourse'

// Calculateur de course intermittente.
// - /calculateur : page publique (sans compte), ressource gratuite envoyée en
//   message privé depuis les Réels ; encadré « Retrouve-le dans l'appli » qui
//   mène à l'appli (son installation).
// - /client/calculateur : la même page dans l'espace client (menu du profil).

const CLE = 'aw_calculateur_course_v1'
const DEFAUT = { reference: 'vmi', vitesse: '', effort: 30, recup: 30, intensite: 90, demiTours: 1, virages90: 0, virages45: 0, sol: 0, reps: 10, series: 1, recupSeries: 3 }

const virgule = v => String(Math.round(v * 10) / 10).replace('.', ',')
const nombre = v => (v === '' || v == null ? '' : Number(String(v).replace(',', '.')))

export default function CalculateurCourse({ publique = false }) {
  const [p, setP] = useState(() => {
    try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || '{}') } } catch (_) { return DEFAUT }
  })

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
  const parcours = !r.erreur ? genererParcours({ distance: r.distance, demiTours: p.demiTours, virages90: p.virages90, virages45: p.virages45, sol: p.sol }) : null
  const formatActif = FORMATS_COURSE.find(f => f.effort === Number(p.effort) && f.recup === Number(p.recup))?.nom
  const ref = p.reference === 'vmi' ? 'VMI' : 'VMA'

  return (
    <div style={S.page}>
      {publique ? (
        // Page publique : à la place de l'en-tête, la barre « appli AWprepa » reste en haut de l'écran
        <a href="/" style={S.barreAppli}>
          <span style={S.barreIcone}><img src="/logo-blanc.png" alt="" style={{ height: 36, width: 'auto', display: 'block' }} /></span>
          <span style={S.barreTexte}>Retrouve-le dans l'appli AWprepa</span>
          <span style={S.barreBouton}>Télécharger</span>
        </a>
      ) : (
        <EnTeteClient retour titre="Calculateur de course" sousTitre="Intermittent selon ta VMI ou ta VMA" />
      )}

      <main style={S.contenu}>
        {/* 1. Vitesse de référence */}
        <section style={S.carte}>
          <Titre n="1" texte="Ta vitesse de référence" />
          <div style={S.segment}>
            {[['vmi', 'VMI'], ['vma', 'VMA']].map(([v, l]) => (
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
        </section>

        {/* 2. Format */}
        <section style={S.carte}>
          <Titre n="2" texte="Le format" />
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
          <Compteur label={`% de ta ${ref}`} value={Number(p.intensite) || 0} pas={5} min={50} max={140} onChange={v => maj('intensite', v)} unite="%" dernier />
        </section>

        {/* 4. Parcours */}
        <section style={S.carte}>
          <Titre n="4" texte="Ton parcours" />
          <p style={S.groupe}>Changements de direction</p>
          <Compteur label="Demi-tour (180°)" value={p.demiTours} onChange={v => maj('demiTours', v)} />
          <Compteur label="À 90°" value={p.virages90} onChange={v => maj('virages90', v)} />
          <Compteur label="À 45°" value={p.virages45} onChange={v => maj('virages45', v)} />
          <Compteur label="Passages au sol" detail="plaquage et relevé" value={p.sol} onChange={v => maj('sol', v)} dernier />
        </section>

        {/* Résultat */}
        <section style={S.resultat} aria-live="polite">
          {r.erreur ? (
            <p style={S.resultatErreur}>{r.erreur}</p>
          ) : (
            <>
              <p style={S.resultatLabel}>Distance à courir en {p.effort} s</p>
              <p style={S.resultatValeur}>{virgule(r.distance)} <span style={S.resultatUnite}>m</span></p>
              {parcours.trajets > 1 && (
                <p style={S.resultatLigne}>
                  {r.navette ? <>Plots à <strong style={{ color: T.color.signal }}>{virgule(parcours.trajet)} m</strong>, {parcours.trajets} trajets</>
                    : <>{parcours.trajets} trajets de <strong style={{ color: T.color.signal }}>{virgule(parcours.trajet)} m</strong></>}
                </p>
              )}
              <div style={S.schema}><SchemaTerrainView value={parcours.schema} consigne={false} zoom /></div>
              {!parcours.surTerrain && <p style={S.resultatNote}>Parcours plus long qu’un terrain de rugby</p>}
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
              <Info label="Volume total" valeur={`${seance.volume.toLocaleString('fr-FR')} m`} />
              <Info label="Durée" valeur={`≈ ${seance.dureeMin} min`} />
              <Info label="Répétitions" valeur={seance.repsTotal} />
            </div>
          )}
        </section>

        {publique && <p style={S.pied}>AWprepa - préparation physique</p>}
      </main>

      {!publique && <ClientBottomNav />}
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

function Info({ label, valeur }) {
  return (
    <div>
      <p style={S.infoLabel}>{label}</p>
      <p style={S.infoValeur}>{valeur}</p>
    </div>
  )
}

/* ---------- styles (jetons du thème d'origine) ---------- */
const S = {
  page: { minHeight: '100vh', background: T.color.page, fontFamily: T.font.body, paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' },
  contenu: { maxWidth: 560, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 },

  // même fond que l'en-tête de l'appli (var(--header-bg)), collée en haut de l'écran
  barreAppli: { position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--header-bg)', padding: 'calc(env(safe-area-inset-top) + 12px) 16px 12px', textDecoration: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' },
  barreIcone: { width: 56, height: 56, borderRadius: 14, background: '#1a1a1a', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  barreTexte: { flex: 1, minWidth: 0, fontSize: T.size.base, fontWeight: 700, color: T.color.onDark, lineHeight: 1.3 },
  barreBouton: { minHeight: 40, padding: '0 14px', borderRadius: T.radius.pill, background: T.color.signal, color: T.color.anthracite, fontSize: T.size.sm, fontWeight: 700, display: 'flex', alignItems: 'center', flexShrink: 0 },

  carte: { ...T.card },
  titre: { margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontSize: T.size.lg, fontWeight: 700, color: T.color.ink },
  titreNum: { width: 24, height: 24, borderRadius: T.radius.pill, background: T.color.ink, color: T.color.signal, fontSize: T.size.xs, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sousTitre: { margin: '4px 0 0 34px', fontSize: T.size.sm, color: T.color.muted },
  label: { ...T.label },

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

  groupe: { margin: '4px 0 2px', fontSize: T.size.sm, fontWeight: 700, color: T.color.muted, textTransform: 'uppercase', letterSpacing: '0.03em' },
  compteur: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.color.soft}` },
  compteurLabel: { margin: 0, fontSize: T.size.base, fontWeight: 600, color: T.color.ink },
  compteurDetail: { margin: '2px 0 0', fontSize: T.size.xs, color: T.color.muted },
  compteurBouton: { width: T.touch, height: T.touch, borderRadius: T.radius.control, border: `1.5px solid ${T.color.line}`, background: T.color.card, color: T.color.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  compteurValeur: { minWidth: 44, textAlign: 'center', fontSize: T.size.xl, fontWeight: 700, color: T.color.ink, ...T.num },
  compteurUnite: { fontSize: T.size.sm, fontWeight: 600, color: T.color.muted },

  resultat: { background: T.color.ink, borderRadius: T.radius.card, padding: '18px 16px' },
  resultatLabel: { margin: 0, fontSize: T.size.sm, fontWeight: 600, color: T.color.onDarkMuted },
  resultatValeur: { margin: '4px 0 0', fontSize: 48, fontWeight: 800, color: T.color.onDark, lineHeight: 1, letterSpacing: -1, ...T.num },
  resultatUnite: { fontSize: T.size.xl, fontWeight: 700, color: T.color.onDarkMuted },
  resultatLigne: { margin: '10px 0 0', fontSize: T.size.base, color: T.color.onDark, lineHeight: 1.4 },
  resultatErreur: { margin: 0, fontSize: T.size.base, color: T.color.onDark, lineHeight: 1.45 },
  schema: { marginTop: 14 },
  resultatNote: { margin: '8px 0 0', fontSize: T.size.xs, color: T.color.onDarkMuted, textAlign: 'center' },
  infoLabel: { margin: 0, fontSize: T.size.xs, fontWeight: 600, color: T.color.muted },
  infoValeur: { margin: '2px 0 0', fontSize: T.size.lg, fontWeight: 700, color: T.color.ink, ...T.num },

  bilan: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, padding: 12, background: T.color.soft, borderRadius: T.radius.control },

  pied: { margin: '8px 0 0', textAlign: 'center', fontSize: T.size.xs, color: T.color.muted },

}
