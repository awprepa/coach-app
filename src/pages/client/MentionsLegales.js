import { useNavigate } from 'react-router-dom'
import usePageFade from '../../hooks/usePageFade'

function Section({ title, children }) {
  return (
    <div style={S.section}>
      <p style={S.sectionTitle}>{title}</p>
      {children}
    </div>
  )
}

function Para({ children }) {
  return <p style={S.para}>{children}</p>
}

export default function MentionsLegales() {
  const navigate = useNavigate()
  const fadeStyle = usePageFade()

  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>‹</button>
        <span style={S.headerTitle}>Confidentialité & Mentions légales</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>

        {/* ── MENTIONS LÉGALES ─────────────────────────────────── */}
        <p style={S.bigTitle}>Mentions légales</p>
        <Para>Conformément à l'article 6 de la loi n°2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN).</Para>

        <Section title="Éditeur du site">
          <Para><strong>Arthur Wehrey</strong> — Préparateur physique indépendant</Para>
          <Para>41 rue Fénelon, 31200 Toulouse</Para>
          <Para>Contact : <strong>wehrey.arthur@gmail.com</strong></Para>
          <Para>SIRET : en cours d'immatriculation</Para>
        </Section>

        <Section title="Hébergement">
          <Para><strong>Front-end :</strong> Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</Para>
          <Para><strong>Base de données & authentification :</strong> Supabase Inc. — serveurs AWS eu-west-3 (Paris, France)</Para>
        </Section>

        {/* ── POLITIQUE DE CONFIDENTIALITÉ ─────────────────────── */}
        <p style={{ ...S.bigTitle, marginTop: '2rem' }}>Politique de confidentialité</p>
        <Para>Dernière mise à jour : mai 2026</Para>

        <Section title="1. Responsable du traitement">
          <Para>Arthur Wehrey, 41 rue Fénelon, 31200 Toulouse — wehrey.arthur@gmail.com</Para>
        </Section>

        <Section title="2. Données collectées et finalités">
          <Para><strong>Données d'identification :</strong> prénom, nom, adresse e-mail, date de début et de fin de contrat. Base légale : exécution du contrat (Art. 6.1.b RGPD).</Para>
          <Para><strong>Données d'entraînement :</strong> programmes, séances, exercices, charges, RPE. Base légale : exécution du contrat.</Para>
          <Para><strong>Données de santé :</strong> profil nutritionnel (objectif physique, allergènes, régime), repas et macronutriments journaliers, hydratation, photos de repas, résultats de tests physiques, données de bien-être (sommeil, fatigue, stress, douleurs), poids corporel. Base légale : <strong>consentement explicite (Art. 9.2.a RGPD)</strong>.</Para>
          <Para><strong>Messagerie :</strong> échanges entre toi et ton coach. Base légale : exécution du contrat.</Para>
          <Para><strong>Authentification :</strong> adresse e-mail et mot de passe hashé. Base légale : exécution du contrat.</Para>
        </Section>

        <Section title="3. Durées de conservation">
          <Para>• Données de compte : durée de la relation contractuelle + 30 jours</Para>
          <Para>• Données d'entraînement et tests : durée du contrat + 2 ans</Para>
          <Para>• Données de santé (nutrition, wellness) : durée du contrat + 1 an</Para>
          <Para>• Photos de repas : durée du contrat + 6 mois</Para>
          <Para>• Données comptables (factures) : 10 ans (obligation légale)</Para>
        </Section>

        <Section title="4. Destinataires des données">
          <Para>Tes données sont accessibles uniquement à Arthur Wehrey (ton coach) et aux sous-traitants techniques suivants :</Para>
          <Para>• <strong>Supabase</strong> (base de données, authentification, stockage des photos) — Accord de traitement conforme RGPD, données hébergées en France (AWS Paris)</Para>
          <Para>• <strong>Vercel</strong> (hébergement de l'application) — Accord de traitement conforme RGPD</Para>
          <Para>Aucune donnée n'est vendue ni transmise à des tiers à des fins commerciales.</Para>
        </Section>

        <Section title="5. Transferts hors Union Européenne">
          <Para>Les données sont principalement hébergées en France (AWS eu-west-3). Vercel et Supabase peuvent avoir recours à des infrastructures basées aux États-Unis, encadrées par le Data Privacy Framework UE-USA et des clauses contractuelles types (CCT) approuvées par la Commission européenne.</Para>
        </Section>

        <Section title="6. Tes droits (Art. 15 à 22 RGPD)">
          <Para>Tu disposes des droits suivants sur tes données personnelles :</Para>
          <Para>• <strong>Droit d'accès</strong> — obtenir une copie de tes données</Para>
          <Para>• <strong>Droit de rectification</strong> — corriger des données inexactes</Para>
          <Para>• <strong>Droit à l'effacement</strong> — demander la suppression de tes données</Para>
          <Para>• <strong>Droit à la portabilité</strong> — recevoir tes données dans un format structuré</Para>
          <Para>• <strong>Droit d'opposition</strong> — t'opposer à certains traitements</Para>
          <Para>• <strong>Retrait du consentement</strong> — retirer ton consentement aux données de santé à tout moment, sans que cela remette en cause les traitements antérieurs</Para>
          <Para>Pour exercer ces droits, envoie un e-mail à <strong>wehrey.arthur@gmail.com</strong>. Délai de réponse : 30 jours maximum.</Para>
        </Section>

        <Section title="7. Réclamation auprès de la CNIL">
          <Para>Si tu estimes que tes droits ne sont pas respectés, tu peux introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (CNIL) : <strong>www.cnil.fr</strong></Para>
        </Section>

        <Section title="8. Sécurité">
          <Para>Les données sont protégées par :</Para>
          <Para>• Chiffrement en transit (HTTPS/TLS)</Para>
          <Para>• Chiffrement au repos (AWS)</Para>
          <Para>• Contrôle d'accès par politiques de sécurité (Row Level Security)</Para>
          <Para>• Authentification par e-mail et mot de passe</Para>
        </Section>

        {/* ── SUPPRIMER MON COMPTE ─────────────────────────────── */}
        <div style={S.deleteBox}>
          <p style={S.deleteTitle}>Supprimer mon compte</p>
          <p style={S.deletePara}>
            Pour demander la suppression définitive de ton compte et de toutes tes données personnelles, envoie un e-mail à <strong>wehrey.arthur@gmail.com</strong> depuis l'adresse associée à ton compte. Ou utilise directement le bouton dans les paramètres de l'application.
          </p>
        </div>

        <p style={{ fontSize: '0.75rem', color: '#d1d5db', textAlign: 'center', marginTop: '2rem', marginBottom: '1rem' }}>
          AWprepa · wehrey.arthur@gmail.com · Toulouse, France
        </p>
      </div>
    </div>
  )
}

const S = {
  page:        { background: '#f5f5f5', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:      { background: 'var(--header-bg)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 60 },
  backBtn:     { background: 'none', border: 'none', color: 'white', fontSize: '1.6rem', cursor: 'pointer', width: 32, lineHeight: 1 },
  headerTitle: { fontSize: '0.95rem', fontWeight: 800, color: 'white' },
  content:     { padding: '1.5rem 1.25rem', maxWidth: 600, margin: '0 auto', paddingBottom: '3rem' },
  bigTitle:    { fontSize: '1.15rem', fontWeight: 900, color: '#1a1a1a', margin: '0 0 1rem' },
  section:     { background: 'white', borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '0.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  sectionTitle: { fontWeight: 800, fontSize: '0.82rem', color: '#333333', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.6rem' },
  para:        { fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.65, margin: '0 0 0.4rem' },
  deleteBox:   { background: '#fff5f5', border: '1.5px solid #fca5a5', borderRadius: 14, padding: '1rem 1.1rem', marginTop: '1.5rem' },
  deleteTitle: { fontWeight: 800, fontSize: '0.88rem', color: '#dc2626', margin: '0 0 0.5rem' },
  deletePara:  { fontSize: '0.83rem', color: '#6b7280', lineHeight: 1.6, margin: 0 },
}
