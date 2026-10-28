import { useNavigate } from 'react-router-dom'
import AppLogo from './AppLogo'

// Barre du haut commune à toutes les pages client : même hauteur, même logo,
// toujours collée en haut (le haut du téléphone prend ainsi la couleur de la
// barre sur toutes les pages, sans bande blanche ni fondu).
//   retour    : true (page précédente), un chemin, ou une fonction ; absent = pas de bouton
//   titre / sousTitre : texte à côté du logo
//   actions   : boutons à droite
//   children  : ligne supplémentaire sous la barre (sélecteur de date, d'équipe…)
export default function EnTeteClient({ retour, titre, sousTitre, actions, children }) {
  const navigate = useNavigate()
  const retourner = () => {
    if (typeof retour === 'function') retour()
    else if (typeof retour === 'string') navigate(retour)
    else navigate(-1)
  }
  return (
    <header style={S.barre}>
      <div style={{ ...S.ligne, paddingLeft: retour ? 4 : 16 }}>
        {retour && (
          <button onClick={retourner} style={S.bouton} aria-label="Retour">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <AppLogo size={28} />
        <div style={S.textes}>
          {titre && <p style={S.titre}>{titre}</p>}
          {sousTitre && <p style={S.sousTitre}>{sousTitre}</p>}
        </div>
        {actions && <div style={S.actions}>{actions}</div>}
      </div>
      {children}
    </header>
  )
}

// Bouton rond des actions de la barre (même style que la cloche de l'accueil)
export const boutonEnTete = {
  position: 'relative', width: 38, height: 38, borderRadius: 999, flexShrink: 0,
  background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
}

const S = {
  barre: { position: 'sticky', top: 0, zIndex: 40, background: 'var(--header-bg)', color: 'white', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  ligne: { height: 60, paddingRight: 12, display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box' },
  bouton: { width: 44, height: 44, marginRight: -6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'white', cursor: 'pointer', flexShrink: 0 },
  textes: { flex: 1, minWidth: 0 },
  titre: { margin: 0, fontSize: 17, fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sousTitre: { margin: '1px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.68)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
}
