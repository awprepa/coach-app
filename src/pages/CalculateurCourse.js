import { useEffect, useState } from 'react'
import EnTeteClient from '../components/EnTeteClient'
import ClientBottomNav from '../components/ClientBottomNav'
import SchemaTerrainView from '../components/SchemaTerrainView'
import T from '../theme/tokens'
import { FORMATS_COURSE, calculerParcours, calculerSeance, intensiteConseillee, genererParcours, evaluerSeance, NIVEAUX_DIFFICULTE } from '../utils/calculateurCourse'

// Calculateur de course intermittente.
// - /calculateur : page publique (sans compte), ressource gratuite envoyée en
//   message privé depuis les Réels ; encadré « Retrouve-le dans l'appli » qui
//   mène à l'appli (son installation).
// - /client/calculateur : la même page dans l'espace client (menu du profil).

const CLE = 'aw_calculateur_course_v1'
const DEFAUT = { reference: 'vmi', vitesse: '', effort: 30, recup: 30, intensite: 90, virages: [{ a: 180 }], longueurs: ['', ''], sols: [false, false], reps: 10, series: 1, recupSeries: 3 }
const MAX_VIRAGES = 20

// Réglages enregistrés : reprend l'ancien format (compteurs de virages) et
// remet une longueur par trajet
function relire(brut) {
  const x = { ...DEFAUT, ...brut }
  if (!Array.isArray(brut?.virages)) {
    x.virages = [
      ...Array(Number(brut?.demiTours ?? 1) || 0).fill(180),
      ...Array(Number(brut?.virages90) || 0).fill(90),
      ...Array(Number(brut?.virages45) || 0).fill(45),
    ]
    let k = 0 // l'ancien « sens » ne comptait que les virages à 90° et 45°, en alternant droite / gauche
    x.virages = x.virages.map(a => (a === 180 ? { a } : { a, s: brut?.sens?.[k] || (k++ % 2 === 0 ? 'd' : 'g') })).slice(0, MAX_VIRAGES)
  }
  x.virages = x.virages.filter(v => [180, 90, 45].includes(v?.a)).slice(0, MAX_VIRAGES)
  const l = Array.isArray(brut?.longueurs) ? brut.longueurs : []
  x.longueurs = Array.from({ length: x.virages.length + 1 }, (_, i) => (Number(l[i]) > 0 ? l[i] : ''))
  // passages au sol : un par trajet (en arrivant au plot) ; l'ancien compteur remplissait dans l'ordre
  const nbSol = Number(brut?.sol) || 0
  x.sols = Array.from({ length: x.longueurs.length }, (_, i) => (Array.isArray(brut?.sols) ? !!brut.sols[i] : i < nbSol))
  delete x.demiTours; delete x.virages90; delete x.virages45; delete x.sens; delete x.sol
  return x
}

const virgule = v => String(Math.round(v * 10) / 10).replace('.', ',')
const demi = v => virgule(Math.round(v * 2) / 2)
const NOM_VIRAGE = v => (v.a === 180 ? 'Demi-tour' : `${v.a}° à ${v.s === 'g' ? 'gauche' : 'droite'}`)
const nombre = v => (v === '' || v == null ? '' : Number(String(v).replace(',', '.')))

export default function CalculateurCourse({ publique = false }) {
  const [p, setP] = useState(() => {
    try { return relire(JSON.parse(localStorage.getItem(CLE) || '{}')) } catch (_) { return relire({}) }
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

  const [infoIntensite, setInfoIntensite] = useState(false)
  const maj = (cle, val) => setP(x => ({ ...x, [cle]: val }))

  function choisirFormat(f) {
    const c = intensiteConseillee(p.reference, f.effort)
    setP(x => ({ ...x, effort: f.effort, recup: f.recup, intensite: c ? c.conseil : x.intensite }))
  }
  function choisirReference(ref) {
    const c = intensiteConseillee(ref, Number(p.effort))
    setP(x => ({ ...x, reference: ref, intensite: c ? c.conseil : x.intensite }))
  }

  const r = calculerParcours({
    vitesseRef: nombre(p.vitesse), intensite: Number(p.intensite), effort: Number(p.effort),
    virages: p.virages, longueurs: p.longueurs.map(nombre), sols: p.sols,
  })
  const seance = !r.erreur ? calculerSeance({ distance: r.distance, effort: Number(p.effort), recup: Number(p.recup), reps: Number(p.reps), series: Number(p.series), recupSeriesMin: Number(p.recupSeries) }) : null
  const evaluation = !r.erreur ? evaluerSeance({ reference: p.reference, intensite: Number(p.intensite), effort: Number(p.effort), recup: Number(p.recup), reps: Number(p.reps), series: Number(p.series), recupSeriesMin: Number(p.recupSeries), perte: r.perte }) : null
  const parcours = !r.erreur ? genererParcours({ longueurs: r.longueurs, virages: p.virages, sols: p.sols }) : null
  // Couleur des plots de chaque trajet (sans résultat : longueurs de 10 m pour placer les plots)
  const couleurs = (parcours || genererParcours({ longueurs: p.longueurs.map(() => 10), virages: p.virages })).couleurs
  const conseil = intensiteConseillee(p.reference, Number(p.effort))
  const kmh = nombre(p.vitesse) > 0 ? nombre(p.vitesse) * (Number(p.intensite) || 0) / 100 : null
  // Parcours : un changement de direction ajouté à la fin crée un nouveau trajet après lui
  function ajouterVirage(a) {
    setP(x => x.virages.length >= MAX_VIRAGES ? x : ({ ...x, virages: [...x.virages, a === 180 ? { a } : { a, s: 'd' }], longueurs: [...x.longueurs, ''], sols: [...x.sols, false] }))
  }
  function retirerVirage(i) {
    setP(x => ({ ...x, virages: x.virages.filter((_, k) => k !== i), longueurs: x.longueurs.filter((_, k) => k !== i + 1), sols: x.sols.filter((_, k) => k !== i) }))
  }
  const choisirSens = (i, cote) => setP(x => ({ ...x, virages: x.virages.map((v, k) => (k === i ? { ...v, s: cote } : v)) }))
  const basculerSol = i => setP(x => ({ ...x, sols: x.sols.map((v, k) => (k === i ? !v : v)) }))
  const choisirLongueur = (i, val) => setP(x => ({ ...x, longueurs: x.longueurs.map((l, k) => (k === i ? val : l)) }))
  const ligneResultat = !r.erreur ? resumeParcours(r, p.virages) : ''
  const formatActif = FORMATS_COURSE.find(f => f.effort === Number(p.effort) && f.recup === Number(p.recup))?.nom
  const ref = p.reference === 'vmi' ? 'VMI' : 'VMA'

  return (
    <div style={S.page}>
      {publique ? (
        // Page publique : à la place de l'en-tête, la barre « appli AWprepa » reste en haut de l'écran
        <a href="/" style={S.barreAppli}>
          <img src="/apple-touch-icon.png" alt="" style={S.barreIcone} />
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
          <Compteur label={`% de ta ${ref}`} detail={kmh ? `soit ${virgule(kmh)} km/h` : undefined} value={Number(p.intensite) || 0} pas={5} min={50} max={140} onChange={v => maj('intensite', v)} unite="%" dernier
            info={<button onClick={() => setInfoIntensite(v => !v)} aria-expanded={infoIntensite} aria-label="Quel pourcentage choisir ?" style={S.infoZone}><span style={{ ...S.info, ...(infoIntensite ? S.infoActif : {}) }}>i</span></button>} />
          {infoIntensite && <InfoIntensite reference={p.reference} effort={Number(p.effort)} intensite={Number(p.intensite) || 0} conseil={conseil} appliquer={v => maj('intensite', v)} />}
        </section>

        {/* 4. Parcours */}
        <section style={S.carte}>
          <Titre n="4" texte="Ton parcours" />
          <p style={S.groupe}>Dans l'ordre</p>
          {p.longueurs.map((l, i) => (
            <div key={i}>
              <div style={S.trajet}>
                <span style={{ ...S.point, background: couleurs[i] }} aria-hidden="true" />
                <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 6h14M11 2l4 4-4 4" fill="none" stroke={T.color.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span style={{ ...S.point, background: couleurs[i + 1] }} aria-hidden="true" />
                <span style={S.auto}>{nombre(l) > 0 ? '' : 'auto'}</span>
                <div style={{ ...S.entreeUnite, width: 104 }}>
                  <input type="text" inputMode="decimal" aria-label={`Longueur du trajet ${i + 1}`} value={l}
                    placeholder={r.longueurs ? demi(r.longueurs[i]) : 'auto'}
                    onChange={e => choisirLongueur(i, e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5))} style={S.entree} />
                  <span style={S.unite}>m</span>
                </div>
                <button onClick={() => basculerSol(i)} aria-pressed={!!p.sols[i]} aria-label={`Passage au sol en arrivant au plot (trajet ${i + 1})`}
                  style={{ ...S.solBouton, ...(p.sols[i] ? S.segmentActif : {}) }}>Sol</button>
              </div>
              {i < p.virages.length && (
                <div style={S.virage}>
                  <span style={S.virageNom}>{p.virages[i].a === 180 ? 'Demi-tour' : `${p.virages[i].a}°`}</span>
                  {p.virages[i].a !== 180 && (
                    <div style={S.sens}>
                      {[['g', 'Gauche'], ['d', 'Droite']].map(([c, lib]) => (
                        <button key={c} onClick={() => choisirSens(i, c)} aria-pressed={p.virages[i].s === c}
                          style={{ ...S.sensBouton, ...(p.virages[i].s === c ? S.segmentActif : {}) }}>{lib}</button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => retirerVirage(i)} aria-label={`Retirer : ${NOM_VIRAGE(p.virages[i])}`} style={S.retirer}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
          <p style={S.ajoutLabel}>Ajouter un changement de direction</p>
          <div style={S.ajout}>
            {[[180, 'Demi-tour'], [90, '90°'], [45, '45°']].map(([a, lib]) => (
              <button key={a} onClick={() => ajouterVirage(a)} disabled={p.virages.length >= MAX_VIRAGES} style={S.ajoutBouton}>+ {lib}</button>
            ))}
          </div>
        </section>

        {/* Résultat */}
        <section style={S.resultat} aria-live="polite">
          {r.erreur ? (
            <p style={S.resultatErreur}>{r.erreur}</p>
          ) : (
            <>
              <p style={S.resultatLabel}>Distance à courir en {p.effort} s</p>
              <p style={S.resultatValeur}>{virgule(r.distance)} <span style={S.resultatUnite}>m</span></p>
              {ligneResultat && <p style={S.resultatLigne}>{ligneResultat}</p>}
              <div style={S.schema} data-schema-calc><SchemaTerrainView value={parcours.schema} consigne={false} zoom coteMin={28} /></div>
              {!parcours.surTerrain && <p style={S.resultatNote}>Parcours plus long qu’un terrain de rugby</p>}
            </>
          )}
        </section>

        {/* 5. Séance */}
        <section style={S.carte}>
          <Titre n="5" texte="Ta séance" />
          {evaluation && <Jauge e={evaluation} />}
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

        {!r.erreur && seance && (
          <button onClick={() => creerFiche({ p, r, seance, evaluation, ref, kmh, ligneResultat, format: formatActif || `${p.effort}-${p.recup}` }).catch(err => alert(`Impossible de créer la fiche : ${err.message}`))} style={S.creer}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Créer ta séance
          </button>
        )}

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

function Compteur({ label, detail, value, onChange, pas = 1, min = 0, max = 20, unite, dernier, info }) {
  const v = Number(value) || 0
  return (
    <div style={{ ...S.compteur, ...(dernier ? { borderBottom: 'none' } : {}) }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={S.compteurLabel}>{label}{info && <> {info}</>}</p>
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

// Explication de l'intensité (bouton « i ») : quel % choisir selon la durée de l'effort
const REPERES_VMI = [['Moins de 10 s', 100, 110], ['10 à 20 s', 90, 100], ['21 à 60 s', 85, 95], ['1 à 2 min', 80, 90], ['Plus de 2 min', 80, 85]]
function InfoIntensite({ reference, effort, intensite, conseil, appliquer }) {
  const vmi = reference === 'vmi'
  const fourchette = conseil ? (conseil.min === conseil.max ? `${conseil.min} %` : `${conseil.min} à ${conseil.max} %`) : null
  return (
    <div style={S.repere}>
      <p style={S.repereTitre}><strong>Quel pourcentage choisir ?</strong></p>
      {vmi ? (
        <>
          <p style={S.repereTexte}>Ta VMI est la vitesse atteinte à la fin du test 30-15 IFT. Comme le test comporte des demi-tours et des relances, elle est plus élevée que ta VMA.</p>
          <p style={S.repereTexte}>Plus chaque effort est court, plus tu peux courir vite. Le pourcentage dépend donc de la durée de l’effort :</p>
          <div style={S.repereTable}>
            {REPERES_VMI.map(([duree, mn, mx]) => {
              const actif = conseil && conseil.min === mn && conseil.max === mx
              return (
                <div key={duree} style={{ ...S.repereRang, ...(actif ? S.repereRangActif : {}) }}>
                  <span>{duree}</span><strong>{mn} à {mx} %</strong>
                </div>
              )
            })}
          </div>
          <p style={S.repereSource}>Repères de Buchheit et Laursen (2013).</p>
        </>
      ) : (
        <>
          <p style={S.repereTexte}>Ta VMA est la vitesse maximale aérobie, mesurée sur un test en ligne droite (VAMEVAL, Léger-Boucher, demi-Cooper…).</p>
          <p style={S.repereTexte}>Le 30-30 se court à 100 % de ta VMA. Plus l’effort est court, plus tu peux monter au-dessus ; plus il est long, plus tu descends en dessous.</p>
          <p style={S.repereSource}>Repère de Billat (2000).</p>
        </>
      )}
      {fourchette && (
        <p style={{ ...S.repereTexte, color: T.color.ink }}>Pour {effort} s d’effort : <strong>{fourchette}</strong>. Prends le bas de la fourchette si tu reprends ou si tu enchaînes beaucoup de répétitions, le haut pour une séance courte et intense.</p>
      )}
      {conseil && intensite !== conseil.conseil && (
        <button onClick={() => appliquer(conseil.conseil)} style={S.repereBouton}>Mettre {conseil.conseil} %</button>
      )}
    </div>
  )
}

// Difficulté estimée : barre en 5 niveaux, de « Légère » à « Impossible »
const COULEURS_NIVEAU = [T.color.success, '#ca8a04', T.color.warning, T.color.danger, '#7f1d1d']
function Jauge({ e }) {
  const c = COULEURS_NIVEAU[e.niveau]
  return (
    <div style={S.jauge}>
      <div style={S.jaugeLigne}>
        <span style={S.jaugeLabel}>Difficulté</span>
        <span style={{ ...S.jaugeNiveau, color: c }}>{e.libelle}</span>
      </div>
      <div style={S.segments} role="img" aria-label={`Difficulté : ${e.libelle}`}>
        {NIVEAUX_DIFFICULTE.map((n, i) => (
          <div key={n} style={{ ...S.segment4, background: i <= e.niveau ? c : T.color.line }} />
        ))}
      </div>
      {e.repetitionEpuisement && (
        <p style={S.jaugeNote}>Épuisement estimé vers la répétition {e.repetitionEpuisement}</p>
      )}
    </div>
  )
}

// Ligne sous la distance : longueur des trajets, ou boucle à enchaîner
function resumeParcours(r, virages) {
  const L = r.longueurs
  if (r.boucle) {
    const b = r.boucle
    const fin = b.reste > 0 ? `, puis encore ${demi(b.reste)} m` : ''
    if (b.tours === 0) return `Arrête-toi après ${demi(r.distance)} m (parcours de ${demi(b.longueur)} m)`
    return b.ferme
      ? `Boucle de ${demi(b.longueur)} m : fais-la ${b.tours} fois${fin}`
      : `Parcours de ${demi(b.longueur)} m : enchaîne-le ${b.tours} fois en repartant en sens inverse${fin}`
  }
  if (L.length < 2) return ''
  if (!L.every(l => Math.abs(l - L[0]) < 0.25)) return '' // longueurs différentes : écrites sur le schéma
  return virages.every(v => v.a === 180) ? `Plots à ${demi(L[0])} m, ${L.length} trajets` : `${L.length} trajets de ${demi(L[0])} m`
}

// Fiche de la séance en image (PNG) : document aux couleurs de l'appli (bandeau
// anthracite, liseré jaune), chiffres clés, schéma du parcours, séance.
// Dessinée en SVG puis convertie en image dans le navigateur (rien n'est envoyé).
const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const POLICE = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif'

async function creerFiche({ p, r, seance, evaluation, ref, kmh, ligneResultat, format }) {
  // Fiche « document » : bandeau sombre, chiffres clés, parcours, séance ; ni cartes ni tuiles du site
  const W = 1080, M = 72
  const mesure = document.createElement('canvas').getContext('2d')
  const largeur = (t, taille, gras = 600) => { mesure.font = `${gras} ${taille}px ${POLICE}`; return mesure.measureText(t).width }
  const txt = (x, y, t, { taille = 30, gras = 600, couleur = '#1a1a1a', ancre = 'start', espace = 0 } = {}) =>
    `<text x="${x}" y="${y}" font-size="${taille}" font-weight="${gras}" fill="${couleur}" text-anchor="${ancre}"${espace ? ` letter-spacing="${espace}"` : ''}>${esc(t)}</text>`
  const rubrique = (y, t) => txt(M, y, t.toUpperCase(), { taille: 24, gras: 800, couleur: '#6b7280', espace: 3 })
  const filet = y => `<rect x="${M}" y="${y}" width="${W - 2 * M}" height="2" fill="#e5e7eb"/>`
  const parts = []

  // Bandeau : logo (dessiné ensuite), titre de la séance, date ; liseré jaune
  parts.push(`<rect width="${W}" height="300" fill="#333333"/>`)
  parts.push(txt(M + 112, 96, 'AWPREPA · SÉANCE DE COURSE', { taille: 24, gras: 800, couleur: '#e4f816', espace: 3 }))
  parts.push(txt(M + 112, 134, new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), { taille: 26, couleur: 'rgba(255,255,255,0.6)' }))
  parts.push(txt(M, 250, `${format} à ${p.intensite} % ${ref}`, { taille: 76, gras: 800, couleur: '#ffffff' }))
  parts.push(`<rect y="300" width="${W}" height="12" fill="#e4f816"/>`)
  let y = 312

  // Chiffres clés sur trois colonnes séparées par des filets
  y += 86
  const col = (W - 2 * M) / 3
  const cles = [
    ['Distance', `${demi(r.distance)} m`, `par effort de ${p.effort} s`],
    ['Vitesse', kmh ? `${virgule(kmh)} km/h` : '-', `${p.intensite} % de ta ${ref}`],
    ['Volume', `${seance.volume.toLocaleString('fr-FR').replace(/\s/g, ' ')} m`, Number(p.series) > 1 ? `${p.reps} × ${p.series} répétitions` : `${p.reps} répétitions`],
  ]
  cles.forEach(([l, v, sous], i) => {
    const x = M + i * col + (i ? 32 : 0)
    if (i) parts.push(`<rect x="${M + i * col}" y="${y - 40}" width="2" height="190" fill="#e5e7eb"/>`)
    parts.push(txt(x, y, l.toUpperCase(), { taille: 22, gras: 800, couleur: '#6b7280', espace: 2 }))
    parts.push(txt(x, y + 78, v, { taille: 58, gras: 800 }))
    parts.push(txt(x, y + 124, sous, { taille: 24, couleur: '#6b7280' }))
  })
  y += 190
  parts.push(filet(y))

  // Le parcours : repères en une ligne, puis le schéma
  y += 70
  parts.push(rubrique(y, 'Le parcours'))
  const nbCdd = p.virages.length
  const nbSol = p.sols.filter(Boolean).length
  const infos = [`${nbCdd} changement${nbCdd > 1 ? 's' : ''} de direction`, ...(nbSol ? [`${nbSol} passage${nbSol > 1 ? 's' : ''} au sol`] : [])].join('  ·  ')
  y += 52
  parts.push(txt(M, y, infos, { taille: 30, gras: 700 }))
  if (ligneResultat) {
    y += 54
    const w = largeur(ligneResultat, 28, 700) + 32
    parts.push(`<rect x="${M}" y="${y - 38}" width="${w}" height="54" rx="10" fill="#e4f816"/>`)
    parts.push(txt(M + 16, y - 2, ligneResultat, { taille: 28, gras: 700, couleur: '#1a1a1a' }))
  }
  y += 36
  const dessin = document.querySelector('[data-schema-calc] svg')
  const TS = W - 2 * M
  if (dessin) {
    const copie = dessin.cloneNode(true)
    copie.removeAttribute('style')
    copie.setAttribute('x', M); copie.setAttribute('y', y); copie.setAttribute('width', TS); copie.setAttribute('height', TS)
    parts.push(`<clipPath id="cs"><rect x="${M}" y="${y}" width="${TS}" height="${TS}" rx="24"/></clipPath><g clip-path="url(#cs)">${new XMLSerializer().serializeToString(copie)}</g>`)
    y += TS
  }
  y += 56
  parts.push(filet(y))

  // La séance : récupérations, durée, difficulté
  y += 70
  parts.push(rubrique(y, 'La séance'))
  const lignes = [
    ['Récupération', `${p.recup} s entre les efforts${Number(p.series) > 1 ? `, ${p.recupSeries} min entre les séries` : ''}`],
    ['Durée', `environ ${seance.dureeMin} min`],
  ]
  lignes.forEach(([l, v]) => {
    y += 54
    parts.push(txt(M, y, l, { taille: 28, couleur: '#6b7280' }))
    parts.push(txt(M + 260, y, v, { taille: 28, gras: 700 }))
  })
  if (evaluation) {
    const c = COULEURS_NIVEAU[evaluation.niveau]
    y += 54
    parts.push(txt(M, y, 'Difficulté', { taille: 28, couleur: '#6b7280' }))
    parts.push(txt(M + 260, y, evaluation.libelle, { taille: 28, gras: 800, couleur: c }))
    const bx = M + 260 + largeur(evaluation.libelle, 28, 800) + 28, bw = W - M - bx, sw = (bw - 4 * 8) / 5
    NIVEAUX_DIFFICULTE.forEach((_, i) => parts.push(`<rect x="${bx + i * (sw + 8)}" y="${y - 20}" width="${sw}" height="12" rx="6" fill="${i <= evaluation.niveau ? c : '#e5e7eb'}"/>`))
    if (evaluation.repetitionEpuisement) { y += 46; parts.push(txt(M + 260, y, `Épuisement estimé vers la répétition ${evaluation.repetitionEpuisement}`, { taille: 24, gras: 700, couleur: '#7f1d1d' })) }
  }
  y += 72

  // Pied de page
  parts.push(`<rect y="${y}" width="${W}" height="96" fill="#f5f5f5"/>`)
  parts.push(txt(M, y + 58, 'Calculé sur awprepa.app/calculateur', { taille: 24, couleur: '#6b7280' }))
  parts.push(txt(W - M, y + 58, 'AWprepa - préparation physique', { taille: 24, gras: 700, couleur: '#333333', ancre: 'end' }))
  const H = y + 96

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${POLICE}"><rect width="${W}" height="${H}" fill="#ffffff"/>${parts.join('')}</svg>`
  const image = new Image()
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  // Logo de l'appli, coins arrondis
  try {
    const logo = new Image(); logo.src = '/apple-touch-icon.png'; await logo.decode()
    ctx.save(); ctx.beginPath(); ctx.roundRect(M, 52, 92, 92, 22); ctx.clip(); ctx.drawImage(logo, M, 52, 92, 92); ctx.restore()
  } catch (_) {}
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  const nom = `seance-course-${new Date().toISOString().slice(0, 10)}.png`
  const fichier = new File([blob], nom, { type: 'image/png' })
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: 'Ta séance de course' }); return } catch (e) { if (e.name === 'AbortError') return }
  }
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(blob); lien.download = nom
  document.body.appendChild(lien); lien.click(); lien.remove()
  setTimeout(() => URL.revokeObjectURL(lien.href), 10000)
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
  // l'icône de l'appli telle qu'elle apparaît sur l'écran d'accueil
  barreIcone: { width: 56, height: 56, borderRadius: 13, display: 'block', flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,0.12)' },
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

  jauge: { paddingBottom: 12, marginBottom: 4, borderBottom: `1px solid ${T.color.soft}` },
  jaugeLigne: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  jaugeLabel: { fontSize: T.size.base, fontWeight: 600, color: T.color.ink },
  jaugeNiveau: { fontSize: T.size.base, fontWeight: 800 },
  segments: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginTop: 8 },
  jaugeNote: { margin: '8px 0 0', fontSize: T.size.sm, fontWeight: 600, color: '#7f1d1d' },
  segment4: { height: 8, borderRadius: T.radius.pill },
  bilan: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12, padding: 12, background: T.color.soft, borderRadius: T.radius.control },

  trajet: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' },
  point: { width: 16, height: 16, borderRadius: T.radius.pill, flexShrink: 0, boxShadow: '0 0 0 1.5px rgba(0,0,0,0.25)' },
  auto: { flex: 1, minWidth: 0, fontSize: T.size.xs, fontWeight: 600, color: T.color.muted },
  solBouton: { minHeight: T.touch, minWidth: 52, padding: '0 10px', borderRadius: T.radius.control, border: `1.5px solid ${T.color.line}`, background: T.color.card, color: T.color.muted, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  repere: { marginTop: 4, padding: 12, background: T.color.soft, borderRadius: T.radius.control },
  repereTitre: { margin: 0, fontSize: T.size.md, color: T.color.ink },
  repereTexte: { margin: '6px 0 0', fontSize: T.size.xs, color: T.color.muted, lineHeight: 1.45 },
  repereTable: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 },
  repereRang: { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderRadius: 8, fontSize: T.size.sm, color: T.color.ink, ...T.num },
  repereRangActif: { background: T.color.ink, color: T.color.signal },
  repereSource: { margin: '6px 0 0', fontSize: T.size.xs, color: T.color.muted, fontStyle: 'italic' },
  // zone tactile de 44 px autour d'un petit rond « i »
  infoZone: { width: T.touch, height: T.touch, margin: '-12px -10px', padding: 0, border: 'none', background: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', cursor: 'pointer' },
  info: { width: 22, height: 22, borderRadius: T.radius.pill, border: `1.5px solid ${T.color.muted}`, color: T.color.muted, fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 700, fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' },
  infoActif: { background: T.color.ink, borderColor: T.color.ink, color: T.color.signal },
  repereBouton: { marginTop: 10, minHeight: 36, padding: '0 12px', borderRadius: T.radius.pill, border: 'none', background: T.color.ink, color: T.color.signal, fontFamily: T.font.body, fontSize: T.size.xs, fontWeight: 700, cursor: 'pointer' },
  virage: { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 0 4px', padding: '0 0 0 16px', borderLeft: `2px solid ${T.color.line}`, minHeight: 44 },
  virageNom: { flex: 1, fontSize: T.size.md, fontWeight: 700, color: T.color.muted },
  sens: { display: 'flex', gap: 4, background: T.color.soft, borderRadius: T.radius.control, padding: 3 },
  sensBouton: { minHeight: 38, padding: '0 12px', borderRadius: 8, border: 'none', background: 'transparent', color: T.color.muted, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 700, cursor: 'pointer' },
  retirer: { width: T.touch, height: T.touch, border: 'none', background: 'none', color: T.color.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  ajoutLabel: { margin: '12px 0 6px', fontSize: T.size.sm, fontWeight: 600, color: T.color.muted },
  ajout: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 },
  ajoutBouton: { minHeight: T.touch, borderRadius: T.radius.control, border: `1.5px solid ${T.color.line}`, background: T.color.card, color: T.color.ink, fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 700, cursor: 'pointer' },
  creer: { minHeight: 52, borderRadius: T.radius.control, border: 'none', background: T.color.ink, color: T.color.signal, fontFamily: T.font.body, fontSize: T.size.lg, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },

  pied: { margin: '8px 0 0', textAlign: 'center', fontSize: T.size.xs, color: T.color.muted },

}
