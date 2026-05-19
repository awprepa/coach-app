import { useNavigate } from 'react-router-dom'

export const CGV_CONTENU = [
  {
    titre: 'Préambule',
    texte: `AWPrepa est une activité de coaching sportif en ligne exercée par Arthur Wehrey, 41 rue Fénelon, 31200 Toulouse — wehrey.arthur@gmail.com — 07 83 82 13 71.`,
  },
  {
    titre: 'Article 1 — Services proposés',
    texte: `AWPrepa propose les services suivants :

• Préparation physique (suivi premium) : 99€/mois sans engagement, 89€/mois sur 3 mois, 79€/mois sur 6 mois, 49€ le 1er mois découverte
• Coaching remise en forme (suivi premium) : 89€/mois sans engagement, 79€/mois sur 3 mois, 69€/mois sur 6 mois, 39€ le 1er mois découverte
• Programme one-shot personnalisé : 60€ (sans limite de durée, sans suivi)

Chaque formule inclut : programme personnalisé, suivi via l'application AWPrepa, feedback par messagerie, visioconférence de bilan mensuelle (hors programme one-shot).`,
  },
  {
    titre: 'Article 2 — Paiement',
    texte: `Le paiement est dû à la souscription. Pour les formules avec engagement, le montant total est exigible selon les modalités convenues (mensuel ou en une fois). Tout retard entraîne la suspension des services.`,
  },
  {
    titre: 'Article 3 — Rétractation et remboursement',
    texte: `Conformément à l'article L221-18 du Code de la consommation, le client dispose d'un délai de 14 jours pour exercer son droit de rétractation, à compter de la signature du contrat.

Passé ce délai :
• Formules sans engagement : résiliation possible avec 30 jours de préavis, le mois en cours reste dû
• Formules avec engagement (3 ou 6 mois) : aucun remboursement en cas d'arrêt anticipé
• Programme one-shot : aucun remboursement une fois le programme livré`,
  },
  {
    titre: 'Article 4 — Responsabilité',
    texte: `Le client déclare être apte à pratiquer une activité physique. AWPrepa est soumis à une obligation de moyens. Le prestataire ne peut être tenu responsable des blessures résultant du non-respect des consignes, d'un état de santé non déclaré ou d'une pratique inadaptée.`,
  },
  {
    titre: 'Article 5 — Propriété intellectuelle',
    texte: `Les programmes fournis sont la propriété exclusive d'Arthur Wehrey. Toute reproduction ou diffusion sans accord écrit est interdite.`,
  },
  {
    titre: 'Article 6 — Données personnelles (RGPD)',
    texte: `Les données collectées sont utilisées uniquement dans le cadre de la prestation. Elles ne sont jamais transmises à des tiers. Droit d'accès, de rectification et de suppression : wehrey.arthur@gmail.com.`,
  },
  {
    titre: 'Article 7 — Droit applicable',
    texte: `Droit français. Tribunaux compétents : Toulouse.`,
  },
]

export default function CGV() {
  const navigate = useNavigate()

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>‹</button>
        <span style={S.headerTitle}>Conditions Générales de Vente</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        <p style={S.version}>Version 1.0 — Mai 2026</p>

        {CGV_CONTENU.map((art, i) => (
          <div key={i} style={S.article}>
            <p style={S.articleTitre}>{art.titre}</p>
            <p style={S.articleTexte}>{art.texte}</p>
          </div>
        ))}

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
  footer:       { fontSize: '0.75rem', color: '#d1d5db', textAlign: 'center', marginTop: '2rem' },
}
