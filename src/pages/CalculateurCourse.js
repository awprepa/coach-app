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
const DEFAUT = { reference: 'vmi', vitesse: '', effort: 30, recup: 30, intensite: 90, virages: [{ a: 180 }], longueurs: ['', ''], sol: 0, reps: 10, series: 1, recupSeries: 3 }
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
  delete x.demiTours; delete x.virages90; delete x.virages45; delete x.sens
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
    virages: p.virages, longueurs: p.longueurs.map(nombre), sol: p.sol,
  })
  const seance = !r.erreur ? calculerSeance({ distance: r.distance, effort: Number(p.effort), recup: Number(p.recup), reps: Number(p.reps), series: Number(p.series), recupSeriesMin: Number(p.recupSeries) }) : null
  const evaluation = !r.erreur ? evaluerSeance({ reference: p.reference, intensite: Number(p.intensite), effort: Number(p.effort), recup: Number(p.recup), reps: Number(p.reps), series: Number(p.series), recupSeriesMin: Number(p.recupSeries), perte: r.perte }) : null
  const parcours = !r.erreur ? genererParcours({ longueurs: r.longueurs, virages: p.virages, sol: p.sol }) : null
  // Parcours : un changement de direction ajouté à la fin crée un nouveau trajet après lui
  function ajouterVirage(a) {
    setP(x => x.virages.length >= MAX_VIRAGES ? x : ({ ...x, virages: [...x.virages, a === 180 ? { a } : { a, s: 'd' }], longueurs: [...x.longueurs, ''] }))
  }
  function retirerVirage(i) {
    setP(x => ({ ...x, virages: x.virages.filter((_, k) => k !== i), longueurs: x.longueurs.filter((_, k) => k !== i + 1) }))
  }
  const choisirSens = (i, cote) => setP(x => ({ ...x, virages: x.virages.map((v, k) => (k === i ? { ...v, s: cote } : v)) }))
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
          <Compteur label={`% de ta ${ref}`} value={Number(p.intensite) || 0} pas={5} min={50} max={140} onChange={v => maj('intensite', v)} unite="%" dernier />
        </section>

        {/* 4. Parcours */}
        <section style={S.carte}>
          <Titre n="4" texte="Ton parcours" />
          <p style={S.groupe}>Dans l'ordre</p>
          {p.longueurs.map((l, i) => (
            <div key={i}>
              <div style={S.trajet}>
                <span style={{ ...S.point, background: i === 0 ? '#f2c94c' : '#2f80ed' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={S.compteurLabel}>Trajet {i + 1}</p>
                  {!(nombre(l) > 0) && <p style={S.compteurDetail}>auto</p>}
                </div>
                <div style={{ ...S.entreeUnite, width: 104 }}>
                  <input type="text" inputMode="decimal" aria-label={`Longueur du trajet ${i + 1}`} value={l}
                    placeholder={r.longueurs ? demi(r.longueurs[i]) : 'auto'}
                    onChange={e => choisirLongueur(i, e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5))} style={S.entree} />
                  <span style={S.unite}>m</span>
                </div>
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
          <Compteur label="Passage au sol" value={p.sol} onChange={v => maj('sol', v)} dernier />
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
              <div style={S.schema}><SchemaTerrainView value={parcours.schema} consigne={false} zoom /></div>
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
          <button onClick={() => creerPdf({ p, r, seance, evaluation, parcours, ref, ligneResultat }).catch(err => alert(`Impossible de créer le PDF : ${err.message}`))} style={S.creer}>
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
  const egal = L.every(l => Math.abs(l - L[0]) < 0.25)
  if (egal) return virages.every(v => v.a === 180) ? `Plots à ${demi(L[0])} m, ${L.length} trajets` : `${L.length} trajets de ${demi(L[0])} m`
  const groupes = []
  L.forEach((l, i) => {
    const g = groupes.find(x => Math.abs(x.l - l) < 0.25)
    if (g) g.n.push(i + 1); else groupes.push({ l, n: [i + 1] })
  })
  const texte = groupes.map(g => `${g.n.length > 1 ? 'trajets' : 'trajet'} ${g.n.length > 1 ? `${g.n.slice(0, -1).join(', ')} et ${g.n[g.n.length - 1]}` : g.n[0]} de ${demi(g.l)} m`).join(', ')
  return texte.charAt(0).toUpperCase() + texte.slice(1)
}

// Bilan de la séance en PDF (jsPDF, chargé seulement au clic), avec le schéma du parcours
async function creerPdf({ p, r, seance, evaluation, parcours, ref, ligneResultat }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 16
  const texte = v => String(v).replace(/[\u2019]/g, "'")
  // En-tête
  doc.setFillColor(51, 51, 51); doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(228, 248, 22); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('AWprepa', M, 12)
  doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text('Ta séance de course', M, 23)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), W - M, 23, { align: 'right' })

  let y = 42
  const titre = t => { doc.setTextColor(26, 26, 26); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(texte(t), M, y); y += 7 }
  const ligne = (label, valeur) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(107, 114, 128); doc.text(texte(label), M, y)
    doc.setTextColor(26, 26, 26); doc.setFont('helvetica', 'bold')
    const lignes = doc.splitTextToSize(texte(valeur), W - M - 70)
    doc.text(lignes, 70, y); y += 6 * lignes.length
  }

  titre('Réglages')
  ligne(`Ta ${ref}`, `${virgule(nombre(p.vitesse))} km/h`)
  ligne('Intensité', `${p.intensite} % de ta ${ref}, soit ${virgule(r.vitesse * 3.6)} km/h`)
  ligne('Format', `${p.effort} s d'effort, ${p.recup} s de récupération`)
  y += 4

  titre('Chaque répétition')
  ligne('Distance à courir', `${demi(r.distance)} m en ${p.effort} s`)
  if (ligneResultat) ligne('Repères', ligneResultat)
  const etapes = []
  r.longueurs.forEach((l, i) => {
    etapes.push(`Trajet ${i + 1} : ${demi(l)} m`)
    if (p.virages[i]) etapes.push(NOM_VIRAGE(p.virages[i]))
  })
  ligne('Parcours', etapes.join(', '))
  if (p.sol > 0) ligne('Passages au sol', String(p.sol))
  y += 2

  // Schéma : traits et plots du parcours, à l'échelle, dans un cadre vert
  const sch = parcours.schema
  const pts = [...sch.plots.map(o => [o.x, o.y]), ...sch.arrows.flatMap(a => [[a.x1, a.y1], [a.x2, a.y2]])]
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
  const larg = Math.max(...xs) - Math.min(...xs) || 1, haut = Math.max(...ys) - Math.min(...ys) || 1
  const cadre = { x: M, y, w: W - 2 * M, h: 78 }
  const k = Math.min((cadre.w - 30) / larg, (cadre.h - 20) / haut)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const X = v => cadre.x + cadre.w / 2 + (v - cx) * k, Y = v => cadre.y + cadre.h / 2 + (v - cy) * k
  doc.setFillColor(58, 138, 63); doc.roundedRect(cadre.x, cadre.y, cadre.w, cadre.h, 3, 3, 'F')
  doc.setDrawColor(26, 29, 33); doc.setLineWidth(0.6)
  const proche = (a, b, c, d) => Math.hypot(a - c, b - d) < 0.5
  sch.arrows.forEach((a, i) => {
    let x1 = X(a.x1), y1 = Y(a.y1), x2 = X(a.x2), y2 = Y(a.y2)
    const d = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / d, uy = (y2 - y1) / d
    // aller et retour sur le même trait : chacun décalé de son côté
    if (sch.arrows.some(b => b !== a && proche(b.x1, b.y1, a.x2, a.y2) && proche(b.x2, b.y2, a.x1, a.y1))) {
      x1 -= uy * 1.6; x2 -= uy * 1.6; y1 += ux * 1.6; y2 += ux * 1.6
    }
    const ex = x2 - ux * 3, ey = y2 - uy * 3
    doc.setDrawColor(26, 29, 33); doc.setLineWidth(0.6)
    doc.line(x1 + ux * 3, y1 + uy * 3, ex, ey)
    doc.setFillColor(26, 29, 33)
    doc.triangle(ex + ux * 2, ey + uy * 2, ex - ux * 1.5 - uy * 1.5, ey - uy * 1.5 + ux * 1.5, ex - ux * 1.5 + uy * 1.5, ey - uy * 1.5 - ux * 1.5, 'F')
    // longueur du trajet au milieu du trait
    const lib = `${demi(r.longueurs[i])} m`
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
    const lw = doc.getTextWidth(lib) + 3, mx = (x1 + x2) / 2 - uy * 3.2, my = (y1 + y2) / 2 + ux * 3.2
    doc.roundedRect(mx - lw / 2, my - 2.4, lw, 4.2, 2, 2, 'F')
    doc.setTextColor(255, 255, 255); doc.text(lib, mx, my + 0.9, { align: 'center' })
  })
  sch.plots.forEach(o => {
    const c = o.color === '#f2c94c' ? [242, 201, 76] : o.color === '#eb5757' ? [235, 87, 87] : [47, 128, 237]
    doc.setFillColor(...c); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.4); doc.circle(X(o.x), Y(o.y), 2.2, 'FD')
    const lib = [o.label, o.sol ? 'sol' : ''].filter(Boolean).join(' · ')
    if (lib) { doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(texte(lib), X(o.x) + 4, Y(o.y) + 1) }
  })
  y += cadre.h + 10

  titre('Ta séance')
  ligne('Répétitions', `${p.reps} par série, ${p.series} ${Number(p.series) > 1 ? 'séries' : 'série'}`)
  if (Number(p.series) > 1) ligne('Récupération entre les séries', `${p.recupSeries} min`)
  ligne('Volume total', `${seance.volume.toLocaleString('fr-FR').replace(/\s/g, ' ')} m`)
  ligne('Durée', `environ ${seance.dureeMin} min`)
  if (evaluation) ligne('Difficulté', evaluation.repetitionEpuisement ? `${evaluation.libelle} (épuisement estimé vers la répétition ${evaluation.repetitionEpuisement})` : evaluation.libelle)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(107, 114, 128)
  doc.text('Calculé avec le calculateur de course AWprepa - awprepa.app/calculateur', W / 2, 287, { align: 'center' })

  const nom = `seance-course-${new Date().toISOString().slice(0, 10)}.pdf`
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const fichier = new File([doc.output('blob')], nom, { type: 'application/pdf' })
  if (mobile && navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: 'Ta séance de course' }); return } catch (e) { if (e.name === 'AbortError') return }
  }
  doc.save(nom)
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

  trajet: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' },
  point: { width: 10, height: 10, borderRadius: T.radius.pill, flexShrink: 0, boxShadow: '0 0 0 2px #fff, 0 0 0 3px rgba(0,0,0,0.12)' },
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
