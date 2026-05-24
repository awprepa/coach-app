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

const CAT = {
  metabolisme:  { fg: '#fb923c', bg: '#fff7ed', dot: '#fb923c' },
  proteines:    { fg: '#60a5fa', bg: '#eff6ff', dot: '#60a5fa' },
  nutrition:    { fg: '#4ade80', bg: '#f0fdf4', dot: '#4ade80' },
  hydratation:  { fg: '#22d3ee', bg: '#ecfeff', dot: '#22d3ee' },
  aliments:     { fg: '#c084fc', bg: '#faf5ff', dot: '#c084fc' },
  charge:       { fg: 'var(--accent)', bg: '#1f2937', dot: 'var(--accent)' },
  wellness:     { fg: '#f472b6', bg: '#fdf2f8', dot: '#f472b6' },
}

const ETUDES = [
  {
    n: '01', cat: 'metabolisme',
    titre: 'Formule de Mifflin-St Jeor',
    auteur: 'Mifflin MD, St Jeor ST et al.',
    journal: 'Am J Clin Nutr',
    annee: 1990,
    stat: '±5 %',
    stat_label: "d'erreur vs calorimétrie indirecte",
    courte: 'La formule la plus précise pour estimer le métabolisme de repos (BMR) à partir du sexe, âge, taille et poids. Validée sur 498 adultes, recommandée par l\'Academy of Nutrition and Dietetics. Base de tous les calculs caloriques de l\'app.',
    formule: 'Homme : 10×poids + 6,25×taille − 5×âge + 5\nFemme : 10×poids + 6,25×taille − 5×âge − 161',
    app: 'Calcul du BMR → objectifs caloriques',
    doi: '10.1093/ajcn/51.2.241',
  },
  {
    n: '02', cat: 'metabolisme',
    titre: 'Compendium des activités physiques',
    auteur: 'Ainsworth BE, Haskell WL et al.',
    journal: 'Med Sci Sports Exerc',
    annee: 2011,
    stat: '×1,2 → ×1,9',
    stat_label: 'plage des multiplicateurs d\'activité (PAL)',
    courte: 'Répertoire mondial de plus de 800 activités et leur coût énergétique (valeur MET). Les multiplicateurs PAL convertissent le BMR en dépense énergétique totale réelle (TDEE).',
    formule: 'TDEE = BMR × PAL\nSédentaire 1,2 · Léger 1,375 · Modéré 1,55 · Actif 1,725 · Intensif 1,9',
    app: 'Multiplicateurs d\'activité → TDEE',
    doi: '10.1249/MSS.0b013e31821ece12',
  },
  {
    n: '03', cat: 'proteines',
    titre: 'Protéines & gains musculaires',
    auteur: 'Morton RW, Schoenfeld BJ, Helms E et al.',
    journal: 'Br J Sports Med',
    annee: 2018,
    stat: '1,62 g/kg',
    stat_label: 'seuil au-delà duquel les gains musculaires plafonnent',
    courte: 'Méta-analyse de 49 études randomisées (n=1 863). Au-delà de 1,62 g/kg/j, les protéines supplémentaires n\'augmentent plus la masse musculaire. En déficit calorique, la dose est relevée pour limiter la fonte musculaire.',
    formule: '1,6 g/kg · maintien\n1,8 g/kg · prise de masse\n2,0 g/kg · recomposition\n2,2 g/kg · perte de poids',
    app: 'Objectifs protéiques personnalisés',
    doi: '10.1136/bjsports-2017-097608',
  },
  {
    n: '04', cat: 'nutrition',
    titre: 'Références nutritionnelles ANSES — Lipides',
    auteur: 'Agence nationale de sécurité sanitaire (ANSES)',
    journal: 'Rapport PNNS',
    annee: 2019,
    stat: '25–30 %',
    stat_label: 'des apports totaux recommandés en lipides',
    courte: 'Mise à jour officielle des repères nutritionnels français. Les lipides sont essentiels pour les hormones, le cerveau et l\'absorption des vitamines A, D, E, K. L\'app utilise 27 % comme valeur centrale, portée à 28 % en perte de poids.',
    formule: 'Lipides (g) = kcal × 27 % ÷ 9\n28 % en perte de poids (soutien hormonal)',
    app: 'Objectifs lipidiques quotidiens',
    doi: 'anses.fr — Novembre 2019',
  },
  {
    n: '05', cat: 'hydratation',
    titre: 'Références européennes pour l\'eau',
    auteur: 'EFSA Panel on Dietetic Products & Allergies',
    journal: 'EFSA Journal',
    annee: 2010,
    stat: '35 ml/kg',
    stat_label: 'par jour pour les adultes actifs',
    courte: 'Valeurs de référence officielles de l\'Union Européenne pour l\'hydratation. L\'objectif est personnalisé selon le poids corporel : plus tu pèses et transpires, plus ta cible est élevée.',
    formule: 'Eau (ml) = Poids (kg) × 35\n→ arrondi à la centaine de ml',
    app: 'Objectif eau quotidien personnalisé',
    doi: '10.2903/j.efsa.2010.1459',
  },
  {
    n: '06', cat: 'aliments',
    titre: 'Nutri-Score — Notation A à E',
    auteur: 'Hercberg S, Touvier M, Salas-Salvadó J',
    journal: 'J Urban Health',
    annee: 2017,
    stat: '7 pays',
    stat_label: 'européens ont adopté le Nutri-Score officiellement',
    courte: 'Validation du système de notation nutritionnelle A–E des aliments. Le score est calculé à partir des éléments favorables (fibres, protéines, fruits) et défavorables (sucres, graisses saturées, sel, énergie).',
    formule: 'A (score ≤ −1) · B (0–2) · C (3–10)\nD (11–18) · E (≥ 19)',
    app: 'Note A–E sur chaque produit scanné',
    doi: '10.1007/s11524-017-0137-y',
  },
  {
    n: '07', cat: 'aliments',
    titre: 'Classification NOVA — Transformation alimentaire',
    auteur: 'Monteiro CA, Cannon G, Levy RB et al.',
    journal: 'Public Health Nutr',
    annee: 2019,
    stat: '+25 %',
    stat_label: 'risque cardiovasculaire pour les ultra-transformés (G4)',
    courte: 'Classifie les aliments en 4 groupes selon leur degré de transformation industrielle. Les ultra-transformés augmentent les risques de maladies même à calories équivalentes.',
    formule: 'G1–2 : neutre\nG3 : signal négatif\nG4 (ultra-transformé) : signal négatif fort',
    app: 'Pénalités dans le score qualité au scanner',
    doi: '10.1017/S1368980018003762',
  },
  {
    n: '08', cat: 'charge',
    titre: 'Session RPE — Mesure de la charge',
    auteur: 'Foster C, Florhaug JA, Franklin J et al.',
    journal: 'J Strength Cond Res',
    annee: 2001,
    stat: 'r = 0,89',
    stat_label: 'corrélation avec les données physiologiques objectives',
    courte: 'Valide la méthode sRPE : charge = RPE ressenti × durée. Aussi fiable que la fréquence cardiaque ou le lactate pour quantifier l\'effort, sans aucun capteur.',
    formule: 'Charge (UA) = RPE (1–10) × durée (min)\nCharge hebdo = Σ charges de la semaine',
    app: 'Suivi de la charge hebdomadaire',
    doi: '10.1519/00124278-200102000-00014',
  },
  {
    n: '09', cat: 'charge',
    titre: 'ACWR — Ratio charge aiguë / chronique',
    auteur: 'Gabbett TJ',
    journal: 'Br J Sports Med',
    annee: 2016,
    stat: '×2',
    stat_label: 'risque de blessure si ACWR > 1,5',
    courte: 'L\'ACWR compare la charge des 7 derniers jours à la moyenne des 4 dernières semaines. Zone verte 0,8–1,3 : ni sous-entraîné, ni en surcharge. Au-delà de 1,5 : risque de blessure doublé.',
    formule: 'ACWR = Charge semaine N ÷ Moy. 4 semaines\n< 0,8 sous-charge · 0,8–1,3 optimal · > 1,5 risque',
    app: 'Code couleur charge d\'entraînement',
    doi: '10.1136/bjsports-2015-095788',
  },
  {
    n: '10', cat: 'wellness',
    titre: 'Détection du surentraînement par questionnaire',
    auteur: 'Hooper SL, Mackinnon LT',
    journal: 'Sports Medicine',
    annee: 1995,
    stat: '2–3 sem.',
    stat_label: 'avant les marqueurs biologiques — détection précoce',
    courte: '4 indicateurs simples (sommeil, fatigue, stress, douleurs) détectent le surentraînement bien avant les analyses sanguines. Validé sur des nageurs de compétition de haut niveau.',
    formule: 'Score = (sommeil + fatigue + stress + douleurs) ÷ 4\n1 = très mauvais · 5 = excellent',
    app: 'Questionnaire wellness quotidien',
    doi: '10.2165/00007256-199519050-00004',
  },
  {
    n: '11', cat: 'wellness',
    titre: 'Échelle de Borg — Perception de l\'effort',
    auteur: 'Borg GAV',
    journal: 'Med Sci Sports Exerc',
    annee: 1982,
    stat: 'r = 0,88',
    stat_label: 'corrélation avec la fréquence cardiaque',
    courte: 'La perception de l\'effort est subjective mais scientifiquement corrélée aux données physiologiques. Elle intègre fatigue, acidose et état psychologique — plus holistique que la fréquence cardiaque seule.',
    formule: '1–2 très léger · 3–4 léger · 5–6 modéré\n7–8 difficile · 9 très difficile · 10 maximal',
    app: 'Note RPE après chaque séance',
    doi: '10.1249/00005768-198205000-00012',
  },
  {
    n: '12', cat: 'charge',
    titre: 'Estimation du 1RM — Formule poids-dépendante',
    auteur: 'Marcus et al.',
    journal: 'SportRxiv (preprint peer-reviewed)',
    annee: 2024,
    stat: '303 494',
    stat_label: 'séries near-failure analysées sur 388 exercices',
    courte: 'La plus grande étude à ce jour sur l\'estimation du 1RM. Constat clé : la précision des formules classiques (Epley, Brzycki…) dépend du poids utilisé. La nouvelle formule log-linéaire, calibrée sur des centaines de milliers de séries réelles, est significativement plus précise pour les charges modérées à lourdes (3–8 reps).',
    formule: '1RM = w × (1 + (r−1)^0,85 / (−2,55 + 4,58 × ln(w)))\nFiable entre 3 et 8 reps',
    app: 'Formule principale pour Squat, Soulevé de terre, OHP, Hip Thrust',
    doi: 'doi.org/10.51224/SRXIV.453',
  },
  {
    n: '13', cat: 'charge',
    titre: 'Estimation du 1RM — Formule Lombardi (Bench)',
    auteur: 'Lombardi VP',
    journal: 'Weight Training for Advanced Athletes',
    annee: 1989,
    stat: '±2–3 %',
    stat_label: 'd\'erreur sur bench press entre 2 et 10 reps',
    courte: 'La formule Lombardi (1RM = poids × reps^0,10) surpasse les formules Epley et Brzycki pour le développé couché spécifiquement. Validée par plusieurs études comparatives sur des athlètes de force : sa courbure plus douce correspond mieux à la relation poids-reps du bench press.',
    formule: '1RM = w × r^0,10\nOptimale pour le développé couché (couché, incliné, décliné)',
    app: 'Formule dédiée pour tous les développés couchés',
    doi: 'ISBN 0-9621410-0-2',
  },
  {
    n: '14', cat: 'charge',
    titre: 'Échelle RPE/RIR & Correction du 1RM',
    auteur: 'Helms ER, Zourdos MC, Taber C et al.',
    journal: 'J Strength Cond Res / Int J Sport Physiol Perform',
    annee: 2016,
    stat: '~3 %',
    stat_label: 'de 1RM supplémentaire par rep en réserve (RIR)',
    courte: 'Travaux de Helms et Zourdos (2016–2023) validant que chaque rep en réserve (RIR = 10 − RPE) correspond à environ 3 % d\'intensité supplémentaire. Exemple : une série à RPE 8 (2 reps en réserve) représente ~94 % du 1RM réel. Cette correction permet d\'ajuster l\'estimation 1RM selon l\'effort réel fourni.',
    formule: 'Facteur = max(0,85 ; 1 − RIR × 0,03)\n1RM corrigé = 1RM estimé × Facteur\nRIR = 10 − RPE',
    app: 'Correction RPE automatique sur l\'estimation 1RM',
    doi: '10.1519/JSC.0000000000001276',
  },
]

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SciencesClient() {
  const navigate = useNavigate()
  const [cat,  setCat]  = useState('all')
  const [open, setOpen] = useState(null)

  const list = cat === 'all' ? ETUDES : ETUDES.filter(e => e.cat === cat)

  return (
    <div style={S.root}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={S.header}>

        {/* Rangée bouton retour — propre, pas de position absolute */}
        <div style={S.headerNav}>
          <button onClick={() => navigate(-1)} style={S.backBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Corps texte */}
        <div style={S.headerBody}>
          <p style={S.eyebrow}>BASE SCIENTIFIQUE</p>
          <h1 style={S.h1}>Les études derrière l'app</h1>
          <p style={S.headerSub}>
            Chaque algorithme — nutrition, charge d'entraînement, bien-être —
            s'appuie sur des recherches publiées dans des revues internationales
            à comité de lecture.
          </p>

          {/* Compteurs */}
          <div style={S.counters}>
            <Ctr n="11" label="Études" />
            <div style={S.sep} />
            <Ctr n="7" label="Revues" />
            <div style={S.sep} />
            <Ctr n="1982–2019" label="Période" />
          </div>
        </div>
      </div>

      {/* ── Filtres (sticky) ──────────────────────────────────────────────── */}
      <div style={S.filters}>
        {CATS.map(c => {
          const active = cat === c.key
          const color  = CAT[c.key]
          return (
            <button
              key={c.key}
              onClick={() => { setCat(c.key); setOpen(null) }}
              style={{
                ...S.chip,
                background:  active ? '#1a1a1a' : 'white',
                borderColor: active ? '#1a1a1a' : '#e5e7eb',
                color:       active ? (c.key === 'charge' ? 'var(--accent)' : 'white') : '#6b7280',
              }}
            >
              {c.key !== 'all' && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: active ? 'rgba(255,255,255,0.5)' : color?.dot,
                }} />
              )}
              {c.label}
            </button>
          )
        })}
      </div>

      {/* ── Liste ────────────────────────────────────────────────────────── */}
      <div style={S.list}>
        {list.map(e => {
          const isOpen = open === e.n
          const c      = CAT[e.cat] || { fg: '#9ca3af', bg: '#f9fafb' }
          const catLabel = CATS.find(x => x.key === e.cat)?.label || ''

          return (
            <div key={e.n} style={S.card}>

              {/* Toute la partie cliquable : numéro + badge + contenu + chevron */}
              <button
                onClick={() => setOpen(isOpen ? null : e.n)}
                style={S.cardBtn}
              >
                {/* Bande colorée gauche */}
                <div style={{ ...S.colorBar, background: c.fg }} />

                {/* Contenu */}
                <div style={S.cardInner}>

                  {/* Ligne haute : numéro + catégorie */}
                  <div style={S.cardTopRow}>
                    <span style={S.cardNum}>{e.n}</span>
                    <span style={{
                      ...S.catChip,
                      background: e.cat === 'charge' ? '#1f2937' : c.bg,
                      color: c.fg,
                    }}>
                      {catLabel}
                    </span>
                  </div>

                  {/* Titre */}
                  <p style={S.cardTitle}>{e.titre}</p>

                  {/* Auteur · journal · année */}
                  <p style={S.cardMeta}>
                    {e.auteur}&ensp;·&ensp;<em>{e.journal}</em>,&ensp;{e.annee}
                  </p>

                  {/* Stat clé */}
                  <div style={S.statRow}>
                    <span style={{ ...S.statNum, color: c.fg }}>{e.stat}</span>
                    <span style={S.statLabel}>{e.stat_label}</span>
                  </div>

                </div>

                {/* Chevron */}
                <div style={{
                  ...S.chevron,
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="#c8cdd4" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </button>

              {/* ── Détail ── */}
              {isOpen && (
                <div style={S.detail}>
                  <div style={S.detailDivider} />

                  {/* Explication */}
                  <p style={S.detailText}>{e.courte}</p>

                  {/* Formule */}
                  <div style={S.formulaBox}>
                    <p style={S.formulaLabel}>FORMULE UTILISÉE</p>
                    {e.formule.split('\n').map((line, i) => (
                      <p key={i} style={{
                        ...S.formulaLine,
                        color: i === 0 ? 'var(--accent)' : 'rgba(228,248,22,0.5)',
                        marginTop: i === 0 ? 0 : 5,
                      }}>
                        {line}
                      </p>
                    ))}
                  </div>

                  {/* Utilisation + DOI */}
                  <div style={S.detailMeta}>
                    <div style={S.appRow}>
                      <span style={{ ...S.appDot, background: c.fg }} />
                      <span style={S.appText}>
                        <strong>Dans l'app : </strong>{e.app}
                      </span>
                    </div>
                    <div style={S.doiRow}>
                      <span style={S.doiTag}>DOI</span>
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
          Ces références sont sélectionnées pour leur rigueur méthodologique et leur
          reconnaissance dans la communauté scientifique internationale. Elles ne
          remplacent pas l'avis d'un professionnel de santé.
        </p>
      </div>

      <div style={{ height: 40 }} />
    </div>
  )
}

// ── Sous-composant ────────────────────────────────────────────────────────────
function Ctr({ n, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-fg)', lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: '100dvh',
    background: '#f0f2f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  // ── Header
  header: {
    background: 'linear-gradient(160deg, #0f1117 0%, #1c2333 100%)',
  },
  headerNav: {
    padding: '52px 16px 0',          // respecte safe-area iOS
  },
  backBtn: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(255,255,255,0.09)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
  },
  headerBody: {
    padding: '14px 20px 28px',
  },
  eyebrow: {
    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.16em',
    color: 'var(--accent-fg)', margin: '0 0 10px',
  },
  h1: {
    fontSize: '1.65rem', fontWeight: 900, color: 'white',
    margin: '0 0 10px', lineHeight: 1.15, letterSpacing: '-0.03em',
  },
  headerSub: {
    fontSize: '0.82rem', color: 'rgba(255,255,255,0.42)',
    lineHeight: 1.65, margin: '0 0 20px',
  },
  counters: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 14, padding: '14px 16px',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  sep: {
    width: 1, height: 26, background: 'rgba(255,255,255,0.1)',
  },

  // ── Filtres
  filters: {
    display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
    padding: '12px 14px',
    background: 'white',
    borderBottom: '1px solid #eaecf0',
    position: 'sticky', top: 0, zIndex: 40,
  },
  chip: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 999,
    border: '1.5px solid', fontSize: '0.72rem', fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    transition: 'all 0.15s',
  },

  // ── Liste
  list: {
    padding: '14px 12px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },

  // ── Card
  card: {
    background: 'white',
    borderRadius: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    overflow: 'hidden',
  },
  cardBtn: {
    display: 'flex', alignItems: 'stretch',
    width: '100%', background: 'none', border: 'none',
    cursor: 'pointer', textAlign: 'left', padding: 0,
  },
  colorBar: {
    width: 4, flexShrink: 0,
  },
  cardInner: {
    flex: 1, minWidth: 0,
    padding: '12px 10px 14px 12px',
  },
  cardTopRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardNum: {
    fontSize: '0.6rem', fontWeight: 800, color: '#c8cdd4', letterSpacing: '0.06em',
  },
  catChip: {
    padding: '2px 8px', borderRadius: 999,
    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.03em',
  },
  cardTitle: {
    fontWeight: 800, fontSize: '0.9rem', color: '#111827',
    margin: '0 0 4px', lineHeight: 1.3, letterSpacing: '-0.01em',
  },
  cardMeta: {
    fontSize: '0.67rem', color: '#9ca3af', fontWeight: 500,
    margin: '0 0 10px', lineHeight: 1.5,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  statRow: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    background: '#f9fafb', borderRadius: 10, padding: '8px 10px',
  },
  statNum: {
    fontSize: '1rem', fontWeight: 900, lineHeight: 1.1, flexShrink: 0,
  },
  statLabel: {
    fontSize: '0.68rem', color: '#6b7280', fontWeight: 500,
    lineHeight: 1.35, paddingTop: 1,
  },
  chevron: {
    width: 38, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.2s ease',
  },

  // ── Détail
  detail: {
    padding: '0 14px 16px 16px',
  },
  detailDivider: {
    height: 1, background: '#f3f4f6', margin: '0 0 14px',
  },
  detailText: {
    fontSize: '0.81rem', color: '#374151', lineHeight: 1.7,
    margin: '0 0 14px',
  },
  formulaBox: {
    background: '#111827', borderRadius: 12,
    padding: '12px 14px', marginBottom: 14,
    overflow: 'hidden',
  },
  formulaLabel: {
    fontSize: '0.56rem', fontWeight: 800, color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px',
  },
  formulaLine: {
    fontSize: '0.74rem', fontFamily: 'ui-monospace, monospace',
    lineHeight: 1.5, margin: 0,
    wordBreak: 'break-word',
  },
  detailMeta: {
    display: 'flex', flexDirection: 'column', gap: 8,
    borderTop: '1px solid #f3f4f6', paddingTop: 12,
  },
  appRow: {
    display: 'flex', alignItems: 'flex-start', gap: 7,
  },
  appDot: {
    width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
  },
  appText: {
    fontSize: '0.74rem', color: '#6b7280', lineHeight: 1.5,
  },
  doiRow: {
    display: 'flex', gap: 7, alignItems: 'flex-start',
  },
  doiTag: {
    fontSize: '0.58rem', fontWeight: 800, color: '#9ca3af',
    letterSpacing: '0.08em', padding: '2px 6px',
    background: '#f3f4f6', borderRadius: 4, flexShrink: 0,
  },
  doiVal: {
    fontSize: '0.67rem', color: '#9ca3af',
    fontFamily: 'ui-monospace, monospace',
    lineHeight: 1.5, wordBreak: 'break-all',
  },

  // ── Footer
  footer: {
    padding: '4px 14px 16px',
  },
  footerText: {
    fontSize: '0.72rem', color: '#9ca3af', lineHeight: 1.65,
    textAlign: 'center', fontStyle: 'italic', margin: 0,
    background: 'white', borderRadius: 12, padding: '14px 16px',
    border: '1px solid #eaecf0',
  },
}
