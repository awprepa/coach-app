import { useState, useRef, useEffect } from 'react'
import Icon from './Icon'

// Mise en page commune aux onglets de la Bibliothèque : panneau de tri fixe à
// gauche (titre, recherche, listes avec compteurs), contenu à droite.
// Sur téléphone, le panneau passe au-dessus du contenu.

const HAUT_FIXE = 62 + 12 // barre de navigation coach (collée en haut) + marge

export function Cadre({ panneau, children }) {
  // Sur ordinateur, le panneau a sa propre barre de défilement : sa hauteur
  // suit la place réellement visible sous la barre de navigation, pour que le
  // bas de la liste reste toujours atteignable sans faire défiler la page.
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ajuster = () => {
      if (window.innerWidth <= 820) { el.style.maxHeight = ''; return }
      const haut = Math.max(el.getBoundingClientRect().top, HAUT_FIXE)
      el.style.maxHeight = `${Math.max(window.innerHeight - haut - 12, 200)}px`
    }
    ajuster()
    window.addEventListener('scroll', ajuster, { passive: true })
    window.addEventListener('resize', ajuster)
    return () => { window.removeEventListener('scroll', ajuster); window.removeEventListener('resize', ajuster) }
  }, [])

  return (
    <div className="bib-cadre" style={S.cadre}>
      <style>{`
        .bib-panneau > *{flex-shrink:0;}
        .bib-panneau{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.25) transparent;}
        .bib-panneau .bib-item:hover{background:rgba(255,255,255,0.08) !important;}
        .bib-panneau .bib-item[aria-pressed="true"]:not(.bib-case):hover{background:#e4f816 !important;}
        .bib-panneau input::placeholder{color:rgba(255,255,255,0.45);}
        @media (max-width: 820px){
          .bib-cadre{grid-template-columns:1fr !important;padding:1rem !important;}
          .bib-panneau{position:static !important;gap:14px !important;max-height:none !important;overflow:visible !important;}
          .bib-liste{flex-direction:row !important;flex-wrap:wrap;gap:6px !important;}
          .bib-liste > div{display:contents;}
          .bib-liste .bib-zone{flex-basis:100%;margin:4px 0 0 !important;}
          .bib-liste .bib-item{width:auto !important;border:1.5px solid rgba(255,255,255,0.2) !important;border-radius:999px !important;padding:6px 12px !important;min-height:36px;}
        }
      `}</style>
      <aside ref={ref} className="bib-panneau" style={S.panneau}>{panneau}</aside>
      <main style={{ minWidth: 0 }}>{children}</main>
    </div>
  )
}

export function TitrePanneau({ titre, sous }) {
  return (
    <div>
      <h1 style={S.titre}>{titre}</h1>
      {sous && <p style={S.sous}>{sous}</p>}
    </div>
  )
}

export function Recherche({ value, onChange, placeholder }) {
  return (
    <label style={S.recherche}>
      <Icon name="search" size={16} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={S.rechercheInput} />
    </label>
  )
}

// `repliable` : le groupe est fermé par défaut et s'ouvre d'un clic sur son
// titre ; `resume` s'affiche à côté du titre quand il est fermé (ex. le choix actif).
export function GroupeTri({ titre, action, repliable, resume, children }) {
  const [ouvert, setOuvert] = useState(!repliable)
  return (
    <div>
      <div style={S.groupeTete}>
        {repliable ? (
          <button onClick={() => setOuvert(o => !o)} aria-expanded={ouvert} style={S.groupeBouton}>
            <span style={{ display: 'inline-flex', transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}><Icon name="chevron-right" size={14} /></span>
            {titre}
            {!ouvert && resume && <span style={S.resume}>{resume}</span>}
          </button>
        ) : <span>{titre}</span>}
        {action}
      </div>
      {ouvert && <div className="bib-liste" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</div>}
    </div>
  )
}

export function LienTri({ onClick, children }) {
  return <button onClick={onClick} style={S.lien}>{children}</button>
}

export function SousTitreTri({ children }) {
  return <p className="bib-zone" style={S.zone}>{children}</p>
}

// Ligne de tri. `coche` (true/false) l'affiche en case à cocher, sinon elle
// se comporte comme une sélection unique (fond anthracite quand active).
export function ItemTri({ actif, coche, n, icone, onClick, children }) {
  const caseACocher = coche !== undefined
  const fonce = !caseACocher && actif
  return (
    <button onClick={onClick} aria-pressed={caseACocher ? coche : actif} className={caseACocher ? 'bib-item bib-case' : 'bib-item'}
      style={{ ...S.item, ...(fonce ? S.itemActif : {}) }}>
      {caseACocher && (
        <span style={{ ...S.case, ...(coche ? S.caseCochee : {}) }}>
          {coche && <Icon name="check" size={12} />}
        </span>
      )}
      {icone && <span style={{ display: 'flex', flexShrink: 0 }}><Icon name={icone} size={16} /></span>}
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {n !== undefined && <span style={{ ...S.n, ...(fonce ? { color: '#1a1a1a' } : {}) }}>{n}</span>}
    </button>
  )
}

// Choix à deux valeurs (ex. Travail / Échauffement)
export function Segment({ options, value, onChange }) {
  return (
    <div style={S.seg}>
      {options.map(o => (
        <button key={String(o.val)} onClick={() => onChange(o.val)} aria-pressed={value === o.val}
          style={{ ...S.segBtn, ...(value === o.val ? S.segBtnActif : {}) }}>{o.label}</button>
      ))}
    </div>
  )
}

// Filtre actif retirable, affiché dans la barre au-dessus des cartes
export function PuceFiltre({ onRetirer, children }) {
  return (
    <span style={S.puce}>
      {children}
      <button onClick={onRetirer} style={S.puceX} aria-label={`Retirer le filtre ${children}`}><Icon name="x" size={12} /></button>
    </span>
  )
}

export const BIB = {
  barre:      { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap', minHeight: 40 },
  compte:     { fontWeight: 800, fontSize: '0.95rem', color: '#333333' },
  droite:     { marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn:        { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnP:       { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', background: '#333333', color: '#e4f816', border: '1.5px solid #333333', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnPetit:   { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, padding: '0 12px', background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnPetitP:  { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 32, padding: '0 12px', background: '#333333', color: '#e4f816', border: '1.5px solid #333333', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  icone:      { width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#6b7280', padding: 0, flexShrink: 0 },
  etiquette:  { fontSize: '0.72rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' },
  carte:      { background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' },
  carteTete:  { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '14px 14px 0' },
  carteNom:   { fontWeight: 700, fontSize: '0.92rem', color: '#333333', margin: 0, lineHeight: 1.3 },
  carteMeta:  { fontSize: '0.75rem', color: '#6b7280', margin: '3px 0 0' },
  cartePied:  { borderTop: '1px solid #f3f4f6', padding: '10px 14px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 'auto' },
  grille:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14, alignItems: 'start' },
  blocPuce:   { background: '#333333', color: '#e4f816', padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0 },
  codeTag:    { background: '#f3f4f6', color: '#374151', padding: '2px 5px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800, minWidth: 24, textAlign: 'center', flexShrink: 0 },
  vide:       { background: 'white', borderRadius: 14, padding: '3rem 2rem', textAlign: 'center', color: '#6b7280', fontSize: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  menu:       { position: 'absolute', right: 0, top: '100%', background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 200, marginTop: 4, overflow: 'hidden' },
  menuItem:   { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.82rem', color: '#374151', fontWeight: 600, cursor: 'pointer', background: 'white', border: 'none', borderBottom: '1px solid #f3f4f6', textAlign: 'left', fontFamily: 'inherit' },
}

const S = {
  cadre:       { maxWidth: 1240, margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: '248px 1fr', gap: 24, alignItems: 'start', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  // Panneau de tri : bloc anthracite, séparé visuellement des cartes blanches
  panneau:     { position: 'sticky', top: HAUT_FIXE, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: 20, background: '#333333', color: 'white', borderRadius: 16, padding: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
  groupeBouton: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' },
  resume:      { marginLeft: 6, textTransform: 'none', letterSpacing: 0, fontWeight: 700, color: '#1a1a1a', background: '#e4f816', borderRadius: 999, padding: '1px 8px' },
  titre:       { fontSize: '1.4rem', fontWeight: 800, color: 'white', margin: 0, letterSpacing: '-0.01em' },
  sous:        { color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem', margin: '4px 0 0', lineHeight: 1.45 },
  recherche:   { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '0 12px', height: 40, color: 'rgba(255,255,255,0.6)' },
  rechercheInput: { border: 'none', outline: 'none', flex: 1, minWidth: 0, fontSize: '0.85rem', color: 'white', background: 'none', fontFamily: 'inherit' },
  groupeTete:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' },
  lien:        { background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit' },
  zone:        { fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontWeight: 700, margin: '10px 10px 2px' },
  item:        { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.88)', background: 'none', border: 'none', width: '100%', fontFamily: 'inherit' },
  itemActif:   { background: '#e4f816', color: '#1a1a1a', fontWeight: 700 },
  n:           { marginLeft: 'auto', color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' },
  case:        { width: 16, height: 16, border: '1.5px solid rgba(255,255,255,0.45)', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#1a1a1a' },
  caseCochee:  { background: '#e4f816', borderColor: '#e4f816' },
  seg:         { display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 3 },
  segBtn:      { border: 'none', background: 'none', borderRadius: 8, padding: '7px 0', fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontFamily: 'inherit' },
  segBtnActif: { background: 'white', color: '#333333' },
  puce:        { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 999, padding: '3px 4px 3px 11px', fontSize: '0.75rem', fontWeight: 700, color: '#374151' },
  puceX:       { width: 20, height: 20, borderRadius: '50%', background: '#f3f4f6', border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', cursor: 'pointer', padding: 0 },
}
