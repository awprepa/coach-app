import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { findMuscles, MUSCLES } from '../data/muscleData'

// ── Choisir un exercice dans la bibliothèque ─────────────────────────────────
// Fenêtre avec recherche, filtre par muscle (plusieurs à la fois : l'exercice
// doit les travailler tous) et filtre par catégorie.

const SANS_CAT = 'Sans catégorie'

// Muscles rangés par zone du corps
const ZONES = [
  { titre: 'Haut du corps', muscles: ['pectoraux', 'dorsaux', 'epaules', 'trapezes', 'biceps', 'triceps', 'avant_bras'] },
  { titre: 'Core', muscles: ['abdominaux', 'obliques', 'lombaires'] },
  { titre: 'Bas du corps', muscles: ['quadriceps', 'ischio_jambiers', 'fessiers', 'mollets'] },
]

// Muscles d'un exercice : JSON { p, s } rangé dans description par la page
// Bibliothèque ; à défaut, déduits du nom.
function musclesDe(ex) {
  if (ex.description) {
    try {
      const p = JSON.parse(ex.description)
      if (p && p.p) return { p: p.p || [], s: p.s || [] }
    } catch (_) {}
  }
  const m = findMuscles(ex.nom || '')
  return m ? { p: m.primary, s: m.secondary } : { p: [], s: [] }
}

export default function ChoixBibliotheque({ onChoisir, onFermer }) {
  const [liste, setListe] = useState(null)
  const [terme, setTerme] = useState('')
  const [muscles, setMuscles] = useState([])
  const [cats, setCats] = useState([])
  const [zones, setZones] = useState([])   // zones entières : au moins un muscle de la zone
  const [avecSecondaires, setAvecSecondaires] = useState(false)

  useEffect(() => {
    supabase.from('bibliotheque_exercices')
      .select('id, nom, categorie, image_url, description').order('nom')
      .then(({ data }) => setListe((data || []).map(ex => ({ ...ex, m: musclesDe(ex) }))))
  }, [])

  useEffect(() => {
    const echap = e => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', echap)
    return () => document.removeEventListener('keydown', echap)
  }, [onFermer])

  const touche = (ex, k) => ex.m.p.includes(k) || (avecSecondaires && ex.m.s.includes(k))
  const t = terme.trim().toLowerCase()
  // Recherche et catégorie d'abord : sert aussi à compter les exercices par muscle
  const base = useMemo(() => (liste || []).filter(ex =>
    (!t || ex.nom.toLowerCase().includes(t)) &&
    (!cats.length || cats.includes(ex.categorie || SANS_CAT))
  ), [liste, t, cats])
  const dansZone = (ex, titre) => ZONES.find(z => z.titre === titre).muscles.some(k => touche(ex, k))
  const correspond = (ex, ms, zs) => ms.every(k => touche(ex, k)) && zs.every(z => dansZone(ex, z))
  const resultats = base.filter(ex => correspond(ex, muscles, zones))
  const categories = [...new Set((liste || []).map(ex => ex.categorie || SANS_CAT))]
    .sort((a, b) => (a === SANS_CAT) - (b === SANS_CAT) || a.localeCompare(b))

  const bascule = (tab, set, v) => set(tab.includes(v) ? tab.filter(x => x !== v) : [...tab, v])

  return (
    <div style={S.fond} onClick={onFermer}>
      <div style={S.fenetre} onClick={e => e.stopPropagation()} role="dialog" aria-label="Bibliothèque d'exercices">
        <div style={S.tete}>
          <h2 style={S.titre}>Bibliothèque d'exercices</h2>
          <label style={S.recherche}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input value={terme} onChange={e => setTerme(e.target.value)} placeholder="Rechercher un exercice" autoFocus style={S.rechercheInput} />
          </label>
          <button onClick={onFermer} style={S.icone} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={S.filtres}>
          <div>
            <div style={S.filtreTete}>
              <p style={S.label}>Muscles</p>
              {(muscles.length > 0 || cats.length > 0 || zones.length > 0) && (
                <button onClick={() => { setMuscles([]); setCats([]); setZones([]) }} style={S.lien}>Tout effacer</button>
              )}
            </div>
            <div style={S.seg}>
              {[[false, 'Muscle principal'], [true, 'Principal ou secondaire']].map(([v, l]) => (
                <button key={l} onClick={() => setAvecSecondaires(v)} aria-pressed={avecSecondaires === v}
                  style={{ ...S.segBtn, ...(avecSecondaires === v ? S.segOn : {}) }}>{l}</button>
              ))}
            </div>
            {ZONES.map(z => (
              <div key={z.titre} style={{ marginBottom: 16 }}>
                {/* La zone entière : exercices qui travaillent au moins un de ses muscles */}
                {(() => {
                  const actif = zones.includes(z.titre)
                  const n = base.filter(ex => correspond(ex, muscles, actif ? zones : [...zones, z.titre])).length
                  return (
                    <button onClick={() => bascule(zones, setZones, z.titre)} aria-pressed={actif} onMouseDown={e => e.preventDefault()}
                      style={{ ...S.puce, ...S.puceMuscle, ...S.zoneBtn, ...(actif ? S.puceOn : {}) }}>
                      <span style={S.puceTexte}>{z.titre}</span>
                      <span style={{ ...S.nb, color: actif ? 'rgba(228,248,22,0.6)' : '#9ca3af' }}>{n}</span>
                    </button>
                  )
                })()}
                <div style={S.grilleMuscles}>
                  {z.muscles.filter(k => MUSCLES[k]).map(k => {
                    const actif = muscles.includes(k)
                    const n = base.filter(ex => correspond(ex, actif ? muscles : [...muscles, k], zones)).length
                    return (
                      <button key={k} onClick={() => bascule(muscles, setMuscles, k)} aria-pressed={actif} onMouseDown={e => e.preventDefault()}
                        style={{ ...S.puce, ...S.puceMuscle, ...(actif ? S.puceOn : {}) }}>
                        <span style={S.puceTexte}>{MUSCLES[k].label}</span>
                        <span style={{ ...S.nb, color: actif ? 'rgba(228,248,22,0.6)' : '#9ca3af' }}>{n}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {categories.length > 1 && (
            <div>
              <div style={S.filtreTete}><p style={S.label}>Catégorie</p></div>
              <div style={S.puces}>
                {categories.map(c => (
                  <button key={c} onClick={() => bascule(cats, setCats, c)} aria-pressed={cats.includes(c)}
                    style={{ ...S.puce, ...(cats.includes(c) ? S.puceOn : {}) }}>{c}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={S.resultats}>
          <div style={S.resTete}>
            <span style={S.compte}>{liste ? `${resultats.length} exercice${resultats.length > 1 ? 's' : ''}` : 'Chargement…'}</span>
            {zones.map(z => (
              <span key={z} style={S.actif}>
                {z}
                <button onClick={() => bascule(zones, setZones, z)} style={S.actifX} aria-label={`Retirer ${z}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </span>
            ))}
            {muscles.map(k => (
              <span key={k} style={S.actif}>
                {MUSCLES[k]?.label}
                <button onClick={() => bascule(muscles, setMuscles, k)} style={S.actifX} aria-label={`Retirer ${MUSCLES[k]?.label}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </span>
            ))}
          </div>
          <div style={S.items}>
            {liste && resultats.length === 0 ? (
              <p style={S.vide}>
                {liste.length === 0 ? 'La bibliothèque est vide.'
                  : muscles.length > 1 ? 'Aucun exercice ne travaille tous ces muscles à la fois. Retire un filtre.'
                  : 'Aucun exercice trouvé.'}
              </p>
            ) : resultats.map(ex => (
              <button key={ex.id} onClick={() => onChoisir(ex)} style={S.item}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                {ex.image_url
                  ? <img loading="lazy" src={ex.image_url} alt="" style={S.vignette} />
                  : <span style={S.vignette}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" /></svg></span>}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={S.nom}>{ex.nom}</span>
                  {(ex.m.p.length > 0 || ex.m.s.length > 0) && (
                    <span style={S.muscles}>
                      {ex.m.p.length > 0 && <span style={S.mp}>{ex.m.p.map(k => MUSCLES[k]?.label || k).join(', ')}</span>}
                      {ex.m.s.length > 0 && <span style={S.ms}>{ex.m.p.length > 0 ? '· ' : ''}{ex.m.s.map(k => MUSCLES[k]?.label || k).join(', ')}</span>}
                    </span>
                  )}
                </span>
                {ex.categorie && <span style={S.cat}>{ex.categorie}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const S = {
  fond:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  fenetre:   { background: 'white', borderRadius: 16, width: '100%', maxWidth: 1100, height: 'min(720px, calc(100vh - 48px))', display: 'grid', gridTemplateColumns: '360px 1fr', gridTemplateRows: 'auto minmax(0, 1fr)', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' },
  tete:      { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16, padding: '16px 16px 16px 24px', borderBottom: '1px solid #e5e7eb' },
  titre:     { margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#333333', flex: 1 },
  recherche: { display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0 12px', minHeight: 40, width: 360, maxWidth: '45%' },
  rechercheInput: { border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: '0.875rem', width: '100%', background: 'none', color: '#1a1a1a' },
  icone:     { width: 40, height: 40, borderRadius: 10, border: 'none', background: 'none', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  filtres:   { borderRight: '1px solid #e5e7eb', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 },
  filtreTete:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 24 },
  label:     { margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' },
  lien:      { background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', cursor: 'pointer', padding: '4px 0', textDecoration: 'underline', textUnderlineOffset: 3 },
  seg:       { display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 12 },
  segBtn:    { flex: 1, border: 'none', background: 'none', borderRadius: 8, padding: '6px 8px', minHeight: 32, fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', cursor: 'pointer', lineHeight: 1.2 },
  segOn:     { background: 'white', color: '#333333', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' },
  puces:     { display: 'flex', flexWrap: 'wrap', gap: 8 },
  puce:      { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 999, minHeight: 32, padding: '0 12px', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, color: '#374151', cursor: 'pointer' },
  zoneBtn:   { marginBottom: 6, fontWeight: 800 },
  puceTexte: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
  zone:      { margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 700, color: '#374151' },
  grilleMuscles: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  puceMuscle:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, width: '100%', padding: '0 10px', textAlign: 'left' },
  puceOn:    { background: '#333333', border: '1.5px solid #333333', color: '#e4f816' },
  nb:        { fontWeight: 600, marginLeft: 4, fontVariantNumeric: 'tabular-nums' },
  resultats: { display: 'flex', flexDirection: 'column', minHeight: 0 },
  resTete:   { display: 'flex', alignItems: 'center', gap: 8, padding: '16px 24px 8px', flexWrap: 'wrap', minHeight: 52 },
  compte:    { fontSize: '0.8rem', fontWeight: 700, color: '#6b7280', marginRight: 'auto' },
  actif:     { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f3f4f6', borderRadius: 999, padding: '0 4px 0 12px', minHeight: 28, fontSize: '0.75rem', fontWeight: 700, color: '#333333' },
  actifX:    { width: 22, height: 22, border: 'none', background: 'none', borderRadius: '50%', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  items:     { overflowY: 'auto', padding: '0 16px 16px' },
  item:      { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit' },
  vignette:  { width: 48, height: 48, borderRadius: 10, background: '#f3f4f6', flexShrink: 0, objectFit: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  nom:       { display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#333333' },
  muscles:   { display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  // Muscles en texte discret : principaux en gris foncé, secondaires en gris clair
  mp:        { fontSize: '0.75rem', fontWeight: 600, color: '#4b5563' },
  ms:        { fontSize: '0.75rem', fontWeight: 500, color: '#9ca3af' },
  cat:       { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' },
  vide:      { padding: '48px 24px', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.5 },
}
