import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ── Données ────────────────────────────────────────────────────────────────────

const CATS = [
  { key: 'all',         label: 'Tout' },
  { key: 'metabolisme', label: 'Métabolisme' },
  { key: 'proteines',   label: 'Protéines' },
  { key: 'nutrition',   label: 'Nutrition' },
  { key: 'hydratation', label: 'Hydratation' },
  { key: 'aliments',    label: 'Aliments' },
  { key: 'charge',      label: 'Charge' },
  { key: 'wellness',    label: 'Bien-être' },
]

const CAT_COLOR = {
  metabolisme:  { fg: '#fb923c', bg: '#fff7ed' },
  proteines:    { fg: '#60a5fa', bg: '#eff6ff' },
  nutrition:    { fg: '#4ade80', bg: '#f0fdf4' },
  hydratation:  { fg: '#22d3ee', bg: '#ecfeff' },
  aliments:     { fg: '#c084fc', bg: '#faf5ff' },
  charge:       { fg: '#e4f816', bg: '#1a1a1a' },
  wellness:     { fg: '#f472b6', bg: '#fdf2f8' },
}

const ETUDES = [
  {
    n: '01', cat: 'metabolisme',
    titre: 'Formule de Mifflin-St Jeor',
    auteur: 'Mifflin MD, St Jeor ST et al.',
    journal: 'American Journal of Clinical Nutrition',
    annee: 1990,
    stat: '±5 %', stat_label: "d'erreur vs calorimétrie indirecte",
    courte: 'La formule la plus précise pour estimer ton métabolisme de repos (BMR) à partir du sexe, âge, taille et poids. Base de tous les calculs caloriques.',
    formule: 'Homme : 10×poids + 6,25×taille − 5×âge + 5\nFemme : 10×poids + 6,25×taille − 5×âge − 161',
    app: 'Calcul du BMR → objectifs caloriques',
    doi: '10.1093/ajcn/51.2.241',
  },
  {
    n: '02', cat: 'metabolisme',
    titre: 'Compendium des activités physiques',
    auteur: 'Ainsworth BE, Haskell WL et al.',
    journal: 'Medicine & Science in Sports & Exercise',
    annee: 2011,
    stat: '×1,9', stat_label: 'max — sportif intensif (vs ×1,2 sédentaire)',
    courte: 'Répertoire mondial de +800 activités et leur coût énergétique. Les multiplicateurs d\'activité convertissent le BMR en dépense réelle (TDEE).',
    formule: 'TDEE = BMR × PAL\n1,2 (sédentaire) → 1,375 → 1,55 → 1,725 → 1,9',
    app: 'Multiplicateurs d\'activité → TDEE',
    doi: '10.1249/MSS.0b013e31821ece12',
  },
  {
    n: '03', cat: 'proteines',
    titre: 'Protéines & gains musculaires — Méta-analyse',
    auteur: 'Morton RW, Schoenfeld BJ, Helms E et al.',
    journal: 'British Journal of Sports Medicine',
    annee: 2018,
    stat: '1,62 g/kg', stat_label: 'seuil où les gains musculaires plafonnent',
    courte: 'Méta-analyse de 49 études (n=1 863). Au-delà de 1,62 g/kg/j, les apports supplémentaires en protéines n\'augmentent plus la masse musculaire. En déficit, la dose est relevée pour protéger le muscle.',
    formule: '1,6 g/kg (maintien)  ·  1,8 (masse)\n2,0 (recomposition)  ·  2,2 (perte de poids)',
    app: 'Objectifs protéiques personnalisés',
    doi: '10.1136/bjsports-2017-097608',
  },
  {
    n: '04', cat: 'nutrition',
    titre: 'Références nutritionnelles ANSES — Lipides',
    auteur: 'Agence nationale de sécurité sanitaire (ANSES)',
    journal: 'Rapport d\'expertise PNNS',
    annee: 2019,
    stat: '25–30 %', stat_label: 'des apports totaux recommandés en lipides',
    courte: 'Mise à jour officielle des repères nutritionnels français. Les lipides sont essentiels pour les hormones, le cerveau et les vitamines liposolubles. Ni trop, ni trop peu.',
    formule: 'Lipides (g) = kcal × 27 % ÷ 9\n28 % en perte de poids (soutien hormonal)',
    app: 'Objectifs lipidiques quotidiens',
    doi: 'anses.fr — Novembre 2019',
  },
  {
    n: '05', cat: 'hydratation',
    titre: 'Références européennes pour l\'eau (EFSA)',
    auteur: 'EFSA Panel on Dietetic Products, Nutrition & Allergies',
    journal: 'EFSA Journal',
    annee: 2010,
    stat: '35 ml/kg', stat_label: 'par jour pour les adultes actifs',
    courte: 'Valeurs de référence officielles pour l\'Union Européenne. L\'hydratation cible varie selon le poids — plus tu pèses et transpires, plus tu dois boire.',
    formule: 'Eau (ml) = Poids (kg) × 35\n→ arrondi à la centaine de ml',
    app: 'Objectif eau quotidien personnalisé',
    doi: '10.2903/j.efsa.2010.1459',
  },
  {
    n: '06', cat: 'aliments',
    titre: 'Nutri-Score — Notation A à E',
    auteur: 'Hercberg S, Touvier M, Salas-Salvadó J',
    journal: 'Journal of Urban Health',
    annee: 2017,
    stat: '7 pays', stat_label: 'européens ont adopté le Nutri-Score officiellement',
    courte: 'Validation du système de notation nutritionnelle A–E des aliments. Score calculé sur les éléments favorables (fibres, protéines, fruits) et défavorables (sucres, graisses saturées, sel).',
    formule: 'A (score ≤ −1)  ·  B (0–2)  ·  C (3–10)\nD (11–18)  ·  E (≥ 19)',
    app: 'Note A–E sur chaque produit scanné',
    doi: '10.1007/s11524-017-0137-y',
  },
  {
    n: '07', cat: 'aliments',
    titre: 'Classification NOVA — Transformation alimentaire',
    auteur: 'Monteiro CA, Cannon G, Levy RB et al.',
    journal: 'Public Health Nutrition',
    annee: 2019,
    stat: '+25 %', stat_label: 'de risque cardiovasculaire pour les ultra-transformés (G4)',
    courte: 'Classifie les aliments en 4 groupes selon leur degré de transformation industrielle. Les aliments ultra-transformés (G4) augmentent les risques de maladies, même à calories identiques.',
    formule: 'G1–2 : neutre\nG3 : signal négatif  ·  G4 : signal négatif fort',
    app: 'Pénalités dans le score qualité au scanner',
    doi: '10.1017/S1368980018003762',
  },
  {
    n: '08', cat: 'charge',
    titre: 'Session RPE — Méthode de mesure de la charge',
    auteur: 'Foster C, Florhaug JA, Franklin J et al.',
    journal: 'Journal of Strength & Conditioning Research',
    annee: 2001,
    stat: 'r = 0,89', stat_label: 'corrélation avec les données physiologiques objectives',
    courte: 'Valide la méthode sRPE : charge d\'entraînement = RPE ressenti × durée. Simple, sans capteur, et aussi fiable que la fréquence cardiaque ou le lactate pour quantifier l\'effort.',
    formule: 'Charge (UA) = RPE (1–10) × durée (min)\nCharge hebdo = Σ charges de la semaine',
    app: 'Suivi de la charge hebdomadaire par client',
    doi: '10.1519/00124278-200102000-00014',
  },
  {
    n: '09', cat: 'charge',
    titre: 'ACWR — Ratio charge aiguë / chronique',
    auteur: 'Gabbett TJ',
    journal: 'British Journal of Sports Medicine',
    annee: 2016,
    stat: '×2', stat_label: 'risque de blessure si ACWR > 1,5',
    courte: 'L\'ACWR compare la charge des 7 derniers jours à la moyenne des 4 dernières semaines. Un ratio entre 0,8 et 1,3 correspond à la zone verte : ni sous-entraîné, ni en surcharge.',
    formule: 'ACWR = Charge semaine N ÷ Moy.(4 sem.)\n< 0,8 sous-charge  ·  0,8–1,3 optimal  ·  > 1,5 risque',
    app: 'Code couleur charge d\'entraînement (coach)',
    doi: '10.1136/bjsports-2015-095788',
  },
  {
    n: '10', cat: 'wellness',
    titre: 'Questionnaire de bien-être — Détection surentraînement',
    auteur: 'Hooper SL, Mackinnon LT',
    journal: 'Sports Medicine',
    annee: 1995,
    stat: '2–3 sem.', stat_label: 'avant les marqueurs biologiques — détection précoce',
    courte: '4 indicateurs simples (sommeil, fatigue, stress, douleurs) suffisent à détecter le surentraînement avant les analyses de sang. Validé sur des nageurs de compétition de haut niveau.',
    formule: 'Score bien-être = (sommeil + fatigue + stress + douleurs) ÷ 4\n1 = très mauvais  ·  5 = excellent',
    app: 'Questionnaire wellness quotidien du client',
    doi: '10.2165/00007256-199519050-00004',
  },
  {
    n: '11', cat: 'wellness',
    titre: 'Échelle de Borg — Perception de l\'effort (RPE)',
    auteur: 'Borg GAV',
    journal: 'Medicine & Science in Sports & Exercise',
    annee: 1982,
    stat: 'r = 0,88', stat_label: 'corrélation avec la fréquence cardiaque',
    courte: 'La perception de l\'effort (RPE) est subjective mais scientifiquement corrélée aux données physiologiques. Elle intègre la fatigue, l\'acidose, la glycémie et l\'état psychologique — plus holistique que la FC seule.',
    formule: '1–2 très léger  ·  3–4 léger\n5–6 modéré  ·  7–8 difficile  ·  9–10 maximal',
    app: 'Note RPE après chaque séance',
    doi: '10.1249/00005768-198205000-00012',
  },
]

// ── Composant principal ────────────────────────────────────────────────────────

export default function SciencesClient() {
  const navigate   = useNavigate()
  const [cat, setCat]     = useState('all')
  const [open, setOpen]   = useState(null)

  const list = cat === 'all' ? ETUDES : ETUDES.filter(e => e.cat === cat)

  return (
    <div style={S.root}>

      {/* ── Header ── */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div style={S.headerBody}>
          <div style={S.headerEyebrow}>BASE SCIENTIFIQUE</div>
          <h1 style={S.headerTitle}>Les études derrière l'app</h1>
          <p style={S.headerSub}>
            Chaque algorithme — nutrition, charge d'entraînement, bien-être — s'appuie sur des recherches publiées dans des revues internationales à comité de lecture.
          </p>

          {/* Compteurs */}
          <div style={S.counters}>
            <Counter n="11" label="Études" />
            <div style={S.counterDiv} />
            <Counter n="7" label="Revues" />
            <div style={S.counterDiv} />
            <Counter n="1982–2019" label="Publications" />
          </div>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div style={S.filters}>
        {CATS.map(c => {
          const active = cat === c.key
          const color  = CAT_COLOR[c.key]
          return (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              style={{
                ...S.chip,
                background:  active ? '#1a1a1a' : 'white',
                borderColor: active ? '#1a1a1a' : '#e5e7eb',
                color:       active ? (c.key === 'charge' ? '#e4f816' : 'white') : '#6b7280',
              }}
            >
              {c.key !== 'all' && (
                <span style={{
                  display: 'inline-block',
                  width: 7, height: 7, borderRadius: '50%',
                  background: active ? (c.key === 'charge' ? '#e4f816' : 'rgba(255,255,255,0.6)') : (color?.fg || '#9ca3af'),
                  flexShrink: 0,
                }} />
              )}
              {c.label}
            </button>
          )
        })}
      </div>

      {/* ── Liste ── */}
      <div style={S.list}>
        {list.map(e => {
          const isOpen = open === e.n
          const c = CAT_COLOR[e.cat] || { fg: '#9ca3af', bg: '#f9fafb' }
          const catLabel = CATS.find(x => x.key === e.cat)?.label

          return (
            <div key={e.n} style={S.card}>

              {/* Ligne haute : numéro + catégorie */}
              <div style={S.cardTop}>
                <span style={S.cardNum}>{e.n}</span>
                <span style={{
                  ...S.catBadge,
                  background: e.cat === 'charge' ? '#1a1a1a' : c.bg,
                  color: c.fg,
                }}>
                  {catLabel}
                </span>
              </div>

              {/* Bouton principal (cliquable) */}
              <button
                onClick={() => setOpen(isOpen ? null : e.n)}
                style={S.cardBtn}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Titre */}
                  <p style={S.cardTitle}>{e.titre}</p>

                  {/* Auteur + journal */}
                  <p style={S.cardMeta}>
                    {e.auteur} · <em>{e.journal}</em>, {e.annee}
                  </p>

                  {/* Stat clé */}
                  <div style={S.statBox}>
                    <span style={{ ...S.statNum, color: c.fg }}>{e.stat}</span>
                    <span style={S.statLabel}>{e.stat_label}</span>
                  </div>
                </div>

                {/* Chevron */}
                <div style={{
                  ...S.chevron,
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8cdd4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>

              {/* Contenu étendu */}
              {isOpen && (
                <div style={S.cardDetail}>

                  {/* Séparateur */}
                  <div style={{ height: 1, background: '#f3f4f6', margin: '0 0 16px' }} />

                  {/* Explication */}
                  <p style={S.detailText}>{e.courte}</p>

                  {/* Formule */}
                  <div style={S.formulaBox}>
                    <div style={S.formulaLabel}>Formule utilisée</div>
                    {e.formule.split('\n').map((line, i) => (
                      <p key={i} style={{
                        ...S.formulaLine,
                        color: i === 0 ? '#e4f816' : 'rgba(228,248,22,0.55)',
                        marginTop: i === 0 ? 0 : 4,
                      }}>
                        {line}
                      </p>
                    ))}
                  </div>

                  {/* Utilisation + DOI */}
                  <div style={S.detailFooter}>
                    <div style={S.appUsage}>
                      <span style={S.appUsageDot} />
                      <span>Dans l'app : <strong>{e.app}</strong></span>
                    </div>
                    <div style={S.doiRow}>
                      <span style={S.doiLabel}>DOI</span>
                      <span style={S.doiVal}>{e.doi}</span>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <p style={S.footerText}>
          Ces références sont choisies pour leur rigueur méthodologique et leur reconnaissance dans la communauté scientifique internationale. Elles ne remplacent pas l'avis d'un professionnel de santé.
        </p>
      </div>

      <div style={{ height: 90 }} />
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function Counter({ n, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#e4f816', lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{label}</span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: '100dvh',
    background: '#f4f5f7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  // Header
  header: {
    background: 'linear-gradient(160deg, #111111 0%, #1c2333 100%)',
    padding: '0 0 28px',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute', top: 52, left: 16,
    width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', cursor: 'pointer', flexShrink: 0,
  },
  headerBody: {
    padding: '56px 20px 0 20px',
  },
  headerEyebrow: {
    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em',
    color: '#e4f816', marginBottom: 10,
  },
  headerTitle: {
    fontSize: '1.65rem', fontWeight: 900, color: 'white', margin: '0 0 10px',
    lineHeight: 1.15, letterSpacing: '-0.03em',
  },
  headerSub: {
    fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)',
    lineHeight: 1.65, margin: '0 0 24px',
  },
  counters: {
    display: 'flex', alignItems: 'center', gap: 20,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 14, padding: '14px 20px',
    border: '1px solid rgba(255,255,255,0.07)',
  },
  counterDiv: {
    width: 1, height: 28, background: 'rgba(255,255,255,0.1)',
  },

  // Filtres
  filters: {
    display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
    padding: '14px 16px',
    background: 'white',
    borderBottom: '1px solid #eef0f3',
    position: 'sticky', top: 0, zIndex: 40,
  },
  chip: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 999,
    border: '1.5px solid', fontSize: '0.73rem', fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    transition: 'all 0.15s',
  },

  // Liste
  list: {
    padding: '16px 14px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },

  // Card
  card: {
    background: 'white', borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  cardTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px 0',
  },
  cardNum: {
    fontSize: '0.62rem', fontWeight: 800, color: '#c8cdd4',
    letterSpacing: '0.06em',
  },
  catBadge: {
    padding: '3px 9px', borderRadius: 999,
    fontSize: '0.62rem', fontWeight: 800,
    letterSpacing: '0.03em',
  },
  cardBtn: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 14px 14px',
    width: '100%', background: 'none', border: 'none',
    cursor: 'pointer', textAlign: 'left',
  },
  cardTitle: {
    fontWeight: 800, fontSize: '0.92rem', color: '#111827',
    margin: '0 0 4px', lineHeight: 1.3, letterSpacing: '-0.01em',
  },
  cardMeta: {
    fontSize: '0.68rem', color: '#9ca3af', fontWeight: 500,
    margin: '0 0 10px', lineHeight: 1.5,
  },
  statBox: {
    display: 'flex', alignItems: 'baseline', gap: 6,
    background: '#f9fafb', borderRadius: 10, padding: '8px 12px',
  },
  statNum: {
    fontSize: '1.05rem', fontWeight: 900, lineHeight: 1, flexShrink: 0,
  },
  statLabel: {
    fontSize: '0.7rem', color: '#6b7280', fontWeight: 500, lineHeight: 1.35,
  },
  chevron: {
    flexShrink: 0, width: 26, height: 26, marginTop: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.2s ease',
  },

  // Détail
  cardDetail: {
    padding: '0 14px 16px',
  },
  detailText: {
    fontSize: '0.82rem', color: '#374151', lineHeight: 1.7,
    margin: '0 0 14px',
  },
  formulaBox: {
    background: '#111827', borderRadius: 12,
    padding: '12px 14px', marginBottom: 14,
  },
  formulaLabel: {
    fontSize: '0.6rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
  },
  formulaLine: {
    fontSize: '0.76rem', fontFamily: 'monospace',
    lineHeight: 1.5, margin: 0,
  },
  detailFooter: {
    display: 'flex', flexDirection: 'column', gap: 8,
    borderTop: '1px solid #f3f4f6', paddingTop: 12,
  },
  appUsage: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.4,
  },
  appUsageDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#e4f816', flexShrink: 0,
  },
  doiRow: {
    display: 'flex', gap: 8, alignItems: 'flex-start',
  },
  doiLabel: {
    fontSize: '0.6rem', fontWeight: 800, color: '#d1d5db',
    letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 4,
    background: '#f3f4f6', flexShrink: 0,
  },
  doiVal: {
    fontSize: '0.68rem', color: '#9ca3af', fontFamily: 'monospace',
    lineHeight: 1.5, wordBreak: 'break-all',
  },

  // Footer
  footer: {
    padding: '0 20px 20px',
  },
  footerText: {
    fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.65,
    textAlign: 'center', fontStyle: 'italic', margin: 0,
    background: 'white', borderRadius: 12, padding: '14px 16px',
    border: '1px solid #f0f0f0',
  },
}
