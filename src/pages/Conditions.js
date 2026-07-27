import { useNavigate } from 'react-router-dom'

export const CURRENT_CONDITIONS_VERSION = '1.0'

export const CONDITIONS_CONTENU = [
  {
    titre: 'Préambule',
    texte: `AWPrepa est une activité de coaching sportif en ligne exercée par Arthur Wehrey, entrepreneur individuel, SIRET 106 026 883 00012, 41 rue Fénelon, 31200 Toulouse — wehrey.arthur@gmail.com — 07 83 82 13 71.

Les présentes conditions s'appliquent à toute personne utilisant l'application AWPrepa, qu'elle soit cliente individuelle du coach ou membre d'un club encadré via l'application.`,
  },
  {
    titre: 'Article 1 — Aptitude physique et responsabilité',
    texte: `L'utilisateur déclare être apte à la pratique d'une activité physique, ou avoir obtenu l'accord de son médecin en cas de doute. Il s'engage à signaler à son coach toute contre-indication, blessure ou état de santé pouvant affecter sa pratique.

AWPrepa est soumis à une obligation de moyens. Le prestataire ne peut être tenu responsable des blessures résultant du non-respect des consignes données, d'un état de santé non déclaré, ou d'une pratique inadaptée aux recommandations.`,
  },
  {
    titre: 'Article 2 — Données personnelles (RGPD)',
    texte: `Les données collectées (identité, entraînements, messagerie) sont utilisées uniquement dans le cadre du suivi sportif et ne sont jamais transmises à des tiers à des fins commerciales. Le détail complet (finalités, durées de conservation, droits) figure dans la politique de confidentialité, accessible depuis l'application.`,
  },
  {
    titre: 'Article 3 — Données de santé',
    texte: `Dans le cadre du suivi, l'application peut collecter des données de santé au sens de l'article 9 du RGPD : profil nutritionnel (objectif, allergènes, régime), repas et macronutriments, photos de repas, hydratation, résultats de tests physiques, bien-être quotidien (sommeil, fatigue, stress, douleurs), poids corporel.

Ces données sont utilisées exclusivement pour optimiser le suivi sportif et nutritionnel. Elles ne sont ni vendues, ni transmises à des tiers. L'utilisateur peut retirer son consentement à tout moment en contactant wehrey.arthur@gmail.com.`,
  },
  {
    titre: 'Article 4 — Propriété intellectuelle',
    texte: `Les programmes et contenus fournis via l'application sont la propriété exclusive d'Arthur Wehrey. Toute reproduction ou diffusion sans accord écrit est interdite.`,
  },
  {
    titre: 'Article 5 — Droit applicable',
    texte: `Droit français. Tribunaux compétents : Toulouse.`,
  },
]

export default function Conditions() {
  const navigate = useNavigate()

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>‹</button>
        <span style={S.headerTitle}>Conditions générales</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        <p style={S.version}>Version {CURRENT_CONDITIONS_VERSION}</p>

        {CONDITIONS_CONTENU.map((art, i) => (
          <div key={i} style={S.article}>
            <p style={S.articleTitre}>{art.titre}</p>
            <p style={S.articleTexte}>{art.texte}</p>
          </div>
        ))}

        <button onClick={() => navigate('/client/mentions-legales')} style={S.link}>
          Lire la politique de confidentialité complète →
        </button>

        <p style={S.footer}>AWPrepa · Arthur Wehrey · 41 rue Fénelon, 31200 Toulouse · wehrey.arthur@gmail.com</p>
      </div>
    </div>
  )
}

const S = {
  page:         { background: '#f5f5f5', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:       { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 60 },
  backBtn:      { background: 'none', border: 'none', color: 'white', fontSize: '1.6rem', cursor: 'pointer', width: 32, lineHeight: 1 },
  headerTitle:  { fontSize: '0.95rem', fontWeight: 800, color: 'white' },
  content:      { padding: '1.5rem 1.25rem', maxWidth: 600, margin: '0 auto', paddingBottom: '3rem' },
  version:      { fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1.5rem' },
  article:      { background: 'white', borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '0.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  articleTitre: { fontWeight: 800, fontSize: '0.85rem', color: '#333333', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' },
  articleTexte: { fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' },
  link:         { display: 'block', background: 'none', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline', margin: '0.5rem 0 1.5rem' },
  footer:       { fontSize: '0.75rem', color: '#d1d5db', textAlign: 'center', marginTop: '2rem' },
}
