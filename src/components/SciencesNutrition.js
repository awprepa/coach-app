import { useState } from 'react'

// ── Catalogue complet des études scientifiques utilisées dans l'app ───────────
// Partagé entre ProfilNutrition (client) et Bibliotheque (coach).
// Prop coachMode={true} affiche les détails techniques complets + DOI.

const CATEGORIES = [
  { key: 'all',         label: 'Toutes' },
  { key: 'metabolisme', label: 'Métabolisme' },
  { key: 'proteines',   label: 'Protéines' },
  { key: 'nutrition',   label: 'Nutrition' },
  { key: 'hydratation', label: 'Hydratation' },
  { key: 'aliments',    label: 'Aliments' },
  { key: 'charge',      label: 'Charge' },
  { key: 'wellness',    label: 'Bien-être' },
]

const CAT_COLOR = {
  metabolisme:  '#f97316',
  proteines:    '#3b82f6',
  nutrition:    '#22c55e',
  hydratation:  '#06b6d4',
  aliments:     '#a855f7',
  charge:       '#e4f816',
  wellness:     '#ec4899',
}

const CAT_BG = {
  metabolisme:  '#fff7ed',
  proteines:    '#eff6ff',
  nutrition:    '#f0fdf4',
  hydratation:  '#ecfeff',
  aliments:     '#faf5ff',
  charge:       '#fefce8',
  wellness:     '#fdf2f8',
}

const ETUDES = [
  // ── MÉTABOLISME ────────────────────────────────────────────────────────────
  {
    id: 1,
    cat: 'metabolisme',
    emoji: '🔥',
    titre_fr: 'Formule de Mifflin-St Jeor — Métabolisme de base',
    titre_en: 'A new predictive equation for resting energy expenditure in healthy individuals',
    auteurs: 'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO',
    journal: 'American Journal of Clinical Nutrition',
    annee: 1990,
    doi: '10.1093/ajcn/51.2.241',
    chiffre_cle: '±5 % d\'erreur vs calorimétrie indirecte',
    usage_app: 'Calcul du métabolisme de base (BMR) → point de départ de tous les objectifs caloriques dans l\'onglet Objectifs',
    explication_client: 'Ton corps consomme de l\'énergie même au repos pour faire battre ton cœur, respirer, maintenir ta température. Cette formule, la plus précise pour le grand public, estime cette dépense minimale à partir de ton sexe, âge, taille et poids.',
    detail_coach: 'Étude prospective sur n=498 adultes (251 H, 247 F). Comparée aux formules Harris-Benedict (1919), Owen (1986) et Cunningham (1991), Mifflin-St Jeor présente la plus faible erreur systématique (MAE ≈ 131 kcal/j). C\'est la référence recommandée par l\'Academy of Nutrition and Dietetics depuis 2012. Limites : moins précise chez les sujets très obèses (IMC > 40) et les athlètes de haut niveau (masse musculaire élevée sous-estimée).',
    formule: 'Homme : 10×poids(kg) + 6,25×taille(cm) − 5×âge + 5\nFemme : 10×poids(kg) + 6,25×taille(cm) − 5×âge − 161',
  },
  {
    id: 2,
    cat: 'metabolisme',
    emoji: '⚡',
    titre_fr: 'Compendium des activités physiques (MET)',
    titre_en: '2011 Compendium of Physical Activities: A Second Update of Codes and MET Values',
    auteurs: 'Ainsworth BE, Haskell WL, Herrmann SD, Meckes N, Bassett DR Jr, Tudor-Locke C, et al.',
    journal: 'Medicine & Science in Sports & Exercise',
    annee: 2011,
    doi: '10.1249/MSS.0b013e31821ece12',
    chiffre_cle: '×1,2 à ×1,9 selon le niveau d\'activité',
    usage_app: 'Multiplicateurs d\'activité (PAL) appliqués au BMR pour calculer la dépense énergétique totale (TDEE)',
    explication_client: 'Ton BMR seul ne suffit pas : une personne sédentaire et un athlète du même poids n\'ont pas les mêmes besoins. Ce compendium mondial répertorie plus de 800 activités et leur coût énergétique pour calculer ta vraie dépense quotidienne.',
    detail_coach: 'Référence internationale pour les valeurs MET (Metabolic Equivalent of Task). Les PAL (Physical Activity Level) utilisés : sédentaire 1,2 / légèrement actif 1,375 / modérément actif 1,55 / très actif 1,725 / extrêmement actif 1,9. Cohérents avec FAO/WHO/UNU (2004). Limites : PAL standardisés — ne tiennent pas compte des variations individuelles de thermogenèse adaptative.',
    formule: 'TDEE = BMR × PAL\nPAL : 1,2 (sédentaire) → 1,9 (sportif intensif)',
  },
  // ── PROTÉINES ───────────────────────────────────────────────────────────────
  {
    id: 3,
    cat: 'proteines',
    emoji: '💪',
    titre_fr: 'Protéines & gains musculaires — Méta-analyse',
    titre_en: 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults',
    auteurs: 'Morton RW, Murphy KT, McKellar SR, Schoenfeld BJ, Henselmans M, Helms E, et al.',
    journal: 'British Journal of Sports Medicine',
    annee: 2018,
    doi: '10.1136/bjsports-2017-097608',
    chiffre_cle: '1,62 g/kg/j = seuil au-delà duquel les gains plafonnent',
    usage_app: 'Objectifs protéiques : 1,6 g/kg (maintien) · 1,8 g/kg (masse) · 2,0 g/kg (recompo) · 2,2 g/kg (perte)',
    explication_client: 'Les protéines construisent et réparent tes muscles. Cette méta-analyse de 49 études est la référence mondiale pour savoir exactement combien en manger selon ton objectif. Pas assez = fonte musculaire. Trop = inutile et coûteux.',
    detail_coach: 'Méta-analyse de 49 RCTs (n=1 863, ≥6 semaines d\'entraînement en résistance). Résultat principal : l\'effet sur la masse maigre plafonne à 1,62 g/kg/j (95 % CI : 1,03–2,20 g/kg/j). Au-delà, pas de gain significatif supplémentaire (p>0,05). En période de déficit, les valeurs sont relevées (Helms 2014 : 2,3–3,1 g/kg) pour limiter le catabolisme. L\'app intègre un safety margin de ~0,2 g/kg sur les valeurs hautes.',
    formule: 'Protéines (g) = Poids (kg) × coefficient\n1,6 (maintien) / 1,8 (masse) / 2,0 (recompo) / 2,2 (perte)',
  },
  // ── NUTRITION ──────────────────────────────────────────────────────────────
  {
    id: 4,
    cat: 'nutrition',
    emoji: '🥑',
    titre_fr: 'Références nutritionnelles ANSES — Lipides',
    titre_en: 'Actualisation des repères du PNNS : révision des repères de consommations alimentaires pour les adultes',
    auteurs: 'Agence nationale de sécurité sanitaire de l\'alimentation, de l\'environnement et du travail (ANSES)',
    journal: 'Rapport d\'expertise collective ANSES',
    annee: 2019,
    doi: 'anses.fr/fr/content/les-references-nutritionnelles',
    chiffre_cle: '25–30 % des apports énergétiques totaux en lipides',
    usage_app: 'Calcul des besoins en lipides : 27 % des kcal totaux (28 % en perte de poids)',
    explication_client: 'Les graisses ne font pas grossir en soi — elles sont essentielles pour tes hormones, ton cerveau et l\'absorption des vitamines A, D, E, K. L\'ANSES recommande 25 à 30 % de tes calories sous forme de bonnes graisses.',
    detail_coach: 'PNNS 2019 mis à jour. Pour les lipides : 25–30 % AET, avec attention à la qualité (AGS < 12 % AET, ratio oméga-6/oméga-3 proche de 4:1, éviter les acides gras trans). L\'app utilise 27 % comme valeur centrale, 28 % en déficit pour préserver l\'axe HPA et la synthèse stéroïdienne. En prise de masse, 27 % évite un excès de stockage lipidique.',
    formule: 'Lipides (g) = kcal × 27 % ÷ 9\n(28 % si objectif perte de poids)',
  },
  // ── HYDRATATION ────────────────────────────────────────────────────────────
  {
    id: 5,
    cat: 'hydratation',
    emoji: '💧',
    titre_fr: 'Références européennes pour l\'hydratation (EFSA)',
    titre_en: 'Scientific Opinion on Dietary Reference Values for water',
    auteurs: 'EFSA Panel on Dietetic Products, Nutrition, and Allergies (NDA)',
    journal: 'EFSA Journal',
    annee: 2010,
    doi: '10.2903/j.efsa.2010.1459',
    chiffre_cle: '35 ml/kg/j pour les adultes actifs',
    usage_app: 'Objectif hydratation quotidien = Poids (kg) × 35 ml (arrondi à 100 ml)',
    explication_client: 'L\'eau régule ta température, transporte les nutriments et soutient la récupération musculaire. L\'autorité européenne de sécurité alimentaire recommande une hydratation personnalisée selon le poids : plus tu pèses et transpires, plus tu dois boire.',
    detail_coach: 'Valeurs de référence diététiques (DRV) pour l\'UE. Adequate Intake (AI) : femmes adultes 2,0 L/j, hommes 2,5 L/j (≈80 % boissons, ≈20 % aliments). Pour les individus actifs, la recommandation monte à 35 ml/kg/j. Note : ne tient pas compte de la transpiration induite par l\'entraînement (+500 ml/h d\'effort intense recommandé en sus).',
    formule: 'Eau (ml) = Poids (kg) × 35\n(arrondi à la centaine)',
  },
  // ── ALIMENTS ───────────────────────────────────────────────────────────────
  {
    id: 6,
    cat: 'aliments',
    emoji: '🏷️',
    titre_fr: 'Nutri-Score — Notation nutritionnelle A–E',
    titre_en: 'The Nutri-Score: A Science-Based Front-of-Pack Nutrition Label to Prevent Obesity',
    auteurs: 'Hercberg S, Touvier M, Salas-Salvadó J',
    journal: 'Journal of Urban Health',
    annee: 2017,
    doi: '10.1007/s11524-017-0137-y',
    chiffre_cle: 'Adopté officiellement par 7 pays européens',
    usage_app: 'Note A–E affichée lors du scan de produits alimentaires (code-barres) — basée sur Open Food Facts ou recalculée localement',
    explication_client: 'Quand tu scannes un produit, la note A–E résume sa qualité nutritionnelle instantanément. A = excellent, E = à éviter. Ce système est officiellement reconnu par la France, la Belgique, l\'Espagne, l\'Allemagne, la Suisse, les Pays-Bas et le Luxembourg.',
    detail_coach: 'Score brut calculé sur éléments négatifs (énergie, AGS, sucres, sodium) moins éléments positifs (fruits/légumes/légumineuses, fibres, protéines). Échelle : A (score ≤ −1), B (0–2), C (3–10), D (11–18), E (≥ 19). Dans l\'app, quand le Nutri-Score Open Food Facts est absent, un score approché est calculé localement à partir des macros + NOVA. Validation européenne : Deschasaux 2020 (Plos Medicine, n=521 324) — corrélation significative Nutri-Score/mortalité cardiovasculaire (HR=0,76 pour Nutri-A vs Nutri-E).',
    formule: 'Score = Σ pts négatifs − Σ pts positifs\nA ≤ −1 · B ≤ 2 · C ≤ 10 · D ≤ 18 · E > 18',
  },
  {
    id: 7,
    cat: 'aliments',
    emoji: '🔬',
    titre_fr: 'Classification NOVA — Transformation alimentaire',
    titre_en: 'Ultra-processed foods: what they are and how to identify them',
    auteurs: 'Monteiro CA, Cannon G, Levy RB, Moubarac JC, Louzada ML, Rauber F, et al.',
    journal: 'Public Health Nutrition',
    annee: 2019,
    doi: '10.1017/S1368980018003762',
    chiffre_cle: 'Groupe 4 (ultra-transformé) → +25 % risque MCV',
    usage_app: 'Groupes NOVA 3–4 = pénalités dans le score de qualité au scanner (signal négatif indépendant des macros)',
    explication_client: 'La façon dont un aliment est fabriqué est aussi importante que ses macros. Les aliments ultra-transformés (chips, sodas, plats industriels) contiennent des additifs qui augmentent les risques de maladies, même à calories identiques.',
    detail_coach: '4 groupes NOVA : 1 = non transformés (légumes, viandes fraîches) · 2 = ingrédients culinaires (huile, sel, sucre) · 3 = transformés (conserves, fromages, charcuterie artisanale) · 4 = ultra-transformés (additifs multiples, reconstructions industrielles). Méta-analyses : Srour 2019 (BMJ, +14 % cancer), Rico-Campà 2019 (+62 % mortalité toutes causes pour +10 % aliments G4), Lane 2021 (+53 % dépression). L\'app utilise le NOVA group fourni par Open Food Facts.',
    formule: 'G1–2 : 0 pénalité qualité\nG3 : −1 pt · G4 : −2 pts',
  },
  // ── CHARGE D'ENTRAÎNEMENT ──────────────────────────────────────────────────
  {
    id: 8,
    cat: 'charge',
    emoji: '📊',
    titre_fr: 'Session RPE (sRPE) — Mesure de la charge d\'entraînement',
    titre_en: 'A new approach to monitoring exercise training',
    auteurs: 'Foster C, Florhaug JA, Franklin J, Gottschall L, Hrovatin LA, Parker S, et al.',
    journal: 'Journal of Strength and Conditioning Research',
    annee: 2001,
    doi: '10.1519/00124278-200102000-00014',
    chiffre_cle: 'Charge = RPE × durée (min) — corrélation r=0,89 avec puissance physiologique',
    usage_app: 'Calcul de la charge hebdomadaire de chaque client dans la page Charge d\'entraînement (Σ RPE par semaine)',
    explication_client: 'Après chaque séance, ton RPE (ressenti d\'effort de 1 à 10) multiplié par la durée donne une mesure fiable de ta charge d\'entraînement. Simple, validé scientifiquement et sans capteurs.',
    detail_coach: 'Étude de validation sur 16 athlètes (cyclisme, natation, musculation). La méthode sRPE (RPE × durée en minutes) corrèle fortement avec les mesures physiologiques (fréquence cardiaque, lactate, consommation O₂) : r=0,89. Avantage : applicable à tous les sports, sans équipement. Limites : mesure subjective, sensible à l\'humeur et au contexte. L\'app utilise une version simplifiée (Σ RPE hebdo) comme proxy de charge globale.',
    formule: 'Charge séance = RPE (1-10) × durée (min)\nCharge hebdo = Σ charges des séances',
  },
  {
    id: 9,
    cat: 'charge',
    emoji: '⚠️',
    titre_fr: 'ACWR — Ratio charge aiguë/chronique et prévention des blessures',
    titre_en: 'The training—injury prevention paradox: should athletes be training smarter and harder?',
    auteurs: 'Gabbett TJ',
    journal: 'British Journal of Sports Medicine',
    annee: 2016,
    doi: '10.1136/bjsports-2015-095788',
    chiffre_cle: 'ACWR 0,8–1,3 = zone optimale · >1,5 = risque blessure ×2',
    usage_app: 'Calcul de l\'ACWR et code couleur dans la page Charge d\'entraînement : bleu (sous-charge) · vert (optimal) · orange (attention) · rouge (surcharge)',
    explication_client: 'L\'ACWR compare ta charge des 7 derniers jours à ta charge habituelle des 4 dernières semaines. Trop monter trop vite augmente le risque de blessure. L\'objectif : rester dans la zone verte (0,8–1,3).',
    detail_coach: 'Revue narrative de 30+ études en sports collectifs (rugby, AFL, cricket, football). Concept clé : la charge chronique est "protectrice" — un athlète bien conditionné supporte de plus grandes charges sans se blesser. ACWR > 1,5 → risque de blessure multiplié par 2 (Hulin 2016, Br J Sports Med). Zone "sweet spot" : 0,8–1,3. Critique récente (Impellizzeri 2020) : corrélation charge/blessure plus faible hors sports collectifs. L\'app utilise 1 semaine = aiguë, 4 semaines = chronique.',
    formule: 'ACWR = Charge semaine N ÷ Moyenne(4 semaines)\n< 0,8 = sous-charge · 0,8–1,3 = optimal · > 1,5 = surcharge',
  },
  // ── CHARGE — GPS & Z-scores ────────────────────────────────────────────────
  {
    id: 12,
    cat: 'charge',
    emoji: '📡',
    titre_fr: 'Z-scores individuels GPS — Limites de référence statistiques',
    titre_en: 'Making Meaningful Inferences About Magnitudes',
    auteurs: 'Batterham AM, Hopkins WG',
    journal: 'Sportscience / International Journal of Sports Physiology and Performance',
    annee: 2006,
    doi: '10.1123/ijspp.1.1.50',
    chiffre_cle: 'Z = (valeur − µ) / σ · ±1 SD normal · ±2 SD vigilance · >±2 alarme',
    usage_app: 'GPS — Analyse individuelle dans Charge d\'entraînement : chaque métrique GPS du joueur est comparée à sa propre baseline historique via Z-score. Minimum 5 séances requis.',
    explication_client: 'Au lieu de comparer ta distance à un standard générique, on compare ta performance GPS d\'aujourd\'hui à TON historique. Si tu es à +2 SD (écarts-types), tu as réalisé une session bien au-dessus de ta normale — ce qui peut être positif (progression) ou un signal de surcharge si combiné à d\'autres indicateurs.',
    detail_coach: 'Approche "individual statistical reference limits" (Batterham & Hopkins 2006). Z-score = (valeur actuelle − moyenne historique) / écart-type historique. Cette méthode est supérieure aux seuils absolus car elle est normalisée à l\'individu : un joueur qui court habituellement 12 km et en fait 14 km (Z=+2) est dans une situation différente d\'un joueur qui fait sa normale de 14 km. Zones : |Z|≤1 = normale (68 % des sessions), +1<Z≤+2 = progression / charge élevée, −2≤Z<−1 = régression / attention, |Z|>2 = alarme (2,5 % des sessions au hasard). Minimum 5 séances pour calculer µ et σ significatifs.',
    formule: 'Z = (x_actuelle − µ_historique) / σ_historique\n|Z| ≤ 1 : Normal · |Z| ≤ 2 : Vigilance · |Z| > 2 : Alarme',
  },
  {
    id: 13,
    cat: 'charge',
    emoji: '🏃',
    titre_fr: 'GPS — Métriques de charge externe en sports collectifs',
    titre_en: 'Training Loads and Player Monitoring in High-Level Football: Current Practice and Perceptions',
    auteurs: 'Akenhead R, Nassis GP',
    journal: 'International Journal of Sports Physiology and Performance',
    annee: 2016,
    doi: '10.1123/ijspp.2015-0331',
    chiffre_cle: 'Distance >20 km/h, Player Load, accél. >2,5 m/s² : métriques les plus utilisées',
    usage_app: 'Métriques GPS suivies dans l\'Analyse individuelle : distance totale, Vmax, Player Load, distance >20 km/h, accélérations et décélérations >2,5 m/s²',
    explication_client: 'Le GPS enregistre bien plus que la distance : la vitesse maximale, les efforts intenses, les changements de direction explosifs et la charge biomécanique globale. Ensemble, ces données donnent une image précise de ce que ton corps a vraiment subi pendant la séance.',
    detail_coach: 'Enquête sur 37 clubs de football haut niveau (29 pays). Métriques les plus utilisées en pratique : distance totale (97 %), Player Load (78 %), distance haute intensité (73 %), accélérations (62 %). Player Load (somme des accélérations tridimensionnelles) est un proxy validé de la charge biomécanique. Les accélérations/décélérations >2,5 m/s² sont identifiées comme les métriques les plus corrélées au risque de blessure musculaire (Dalen 2019 ; Bowen 2017). La distance >20 km/h est le seuil standard pour la haute intensité dans les sports collectifs (Buchheit 2014).',
    formule: 'Player Load = Σ √(ΔAx² + ΔAy² + ΔAz²) / 100\n(somme des vecteurs d\'accélération triaxiaux)',
  },
  // ── BIEN-ÊTRE ──────────────────────────────────────────────────────────────
  {
    id: 10,
    cat: 'wellness',
    emoji: '😴',
    titre_fr: 'Questionnaire de bien-être — Détection du surentraînement',
    titre_en: 'Monitoring overtraining in athletes: recommendations',
    auteurs: 'Hooper SL, Mackinnon LT',
    journal: 'Sports Medicine',
    annee: 1995,
    doi: '10.2165/00007256-199519050-00004',
    chiffre_cle: '4 indicateurs : sommeil, fatigue, stress, douleurs musculaires',
    usage_app: 'Questionnaire wellness quotidien du client (4 items notés 1–5), suivi graphique et alertes de surentraînement',
    explication_client: 'Te noter chaque jour sur 4 critères (sommeil, fatigue, stress, douleurs) permet de détecter le surentraînement avant qu\'il ne provoque une blessure ou une chute de performances. C\'est simple, rapide et scientifiquement validé.',
    detail_coach: 'Étude longitudinale sur nageurs de compétition (n=14). Les 4 items (sleep quality, fatigue, stress, muscle soreness) sur échelle de Likert détectent le surentraînement 2–3 semaines avant les marqueurs biologiques. Validation ultérieure : McLean 2010 (r=-0,63 avec performances compétitives). L\'app adapte l\'échelle à 5 niveaux (vs 7 original) pour la simplicité mobile.',
    formule: 'Score wellness = (sommeil + fatigue + stress + douleurs) ÷ 4\n(1 = très mauvais · 5 = excellent)',
  },
  {
    id: 11,
    cat: 'wellness',
    emoji: '🎯',
    titre_fr: 'Échelle de Borg — Perception de l\'effort (RPE)',
    titre_en: 'Psychophysical bases of perceived exertion',
    auteurs: 'Borg GAV',
    journal: 'Medicine & Science in Sports & Exercise',
    annee: 1982,
    doi: '10.1249/00005768-198205000-00012',
    chiffre_cle: 'Corrélation r=0,88 avec fréquence cardiaque',
    usage_app: 'Note RPE saisie par le client après chaque séance (échelle 1–10 adaptée de Foster 2001, dérivée de Borg)',
    explication_client: 'Le RPE (Rating of Perceived Exertion) est ton ressenti d\'effort après la séance, de 1 (effort très léger) à 10 (effort maximal). Bien qu\'il soit subjectif, il est scientifiquement corrélé aux données physiologiques objectives comme la fréquence cardiaque.',
    detail_coach: 'L\'échelle originale de Borg va de 6 à 20 (corrélée linéairement à la FC : RPE × 10 ≈ FC). La version CR10 (Category-Ratio 0–10) a été popularisée par Foster (2001) pour sa simplicité. Corrélation avec VO₂ : r=0,84 (Noble 1983). La perception d\'effort intègre plusieurs paramètres : acidose, température centrale, glycémie, statut psychologique — ce qui en fait un indicateur plus holistique que la FC seule.',
    formule: '1–2 = très léger · 3–4 = léger\n5–6 = modéré · 7–8 = difficile\n9 = très difficile · 10 = maximal',
  },
]

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SciencesNutrition({ coachMode = false }) {
  const [catFilter, setCatFilter] = useState('all')
  const [expanded,  setExpanded]  = useState(null)

  const filtered = catFilter === 'all' ? ETUDES : ETUDES.filter(e => e.cat === catFilter)

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f5f5f5' }}>

      {/* Bannière intro */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #1f2937 100%)',
        padding: coachMode ? '20px 24px 18px' : '18px 16px 16px',
      }}>
        <p style={{ color: '#e4f816', fontWeight: 800, fontSize: '0.95rem', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
          📚 Base scientifique de l'app
        </p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.76rem', margin: '0 0 12px', lineHeight: 1.6 }}>
          {coachMode
            ? `${ETUDES.length} études et références officielles fondent les algorithmes de l'application — nutrition, charge d'entraînement et bien-être. Références complètes avec DOI.`
            : `Tes objectifs et ton suivi sont calculés à partir de ${ETUDES.length} études publiées dans des revues internationales à comité de lecture.`}
        </p>
        {/* Compteurs par catégorie */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIES.filter(c => c.key !== 'all').map(c => {
            const count = ETUDES.filter(e => e.cat === c.key).length
            const color = CAT_COLOR[c.key]
            return (
              <span key={c.key} style={{
                padding: '2px 8px', borderRadius: 999,
                background: color + '22', color,
                fontSize: '0.63rem', fontWeight: 700,
                border: `1px solid ${color}44`,
              }}>
                {count} {c.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Filtres */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
        padding: '10px 16px',
        background: 'white',
        borderBottom: '1px solid #f3f4f6',
      }}>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCatFilter(c.key)}
            style={{
              padding: '5px 12px', borderRadius: 999, border: '1.5px solid',
              fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background:  catFilter === c.key ? '#1a1a1a' : 'white',
              borderColor: catFilter === c.key ? '#1a1a1a' : '#e5e7eb',
              color:       catFilter === c.key ? '#e4f816' : '#6b7280',
              flexShrink: 0,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Liste des études */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {filtered.map(etude => {
          const color  = CAT_COLOR[etude.cat]
          const bg     = CAT_BG[etude.cat]
          const isOpen = expanded === etude.id

          return (
            <div key={etude.id} style={{
              background: 'white', borderRadius: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              overflow: 'hidden',
              border: '1px solid #f3f4f6',
            }}>
              {/* En-tête */}
              <button
                onClick={() => setExpanded(isOpen ? null : etude.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '13px 14px',
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', borderLeft: `4px solid ${color}`,
                }}
              >
                <span style={{ fontSize: '1.4rem', flexShrink: 0, lineHeight: 1.1 }}>{etude.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: '0.87rem', color: '#1a1a1a', margin: 0, lineHeight: 1.35 }}>
                    {etude.titre_fr}
                  </p>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '3px 0 0', fontWeight: 600 }}>
                    {etude.auteurs.split(',')[0]}{etude.auteurs.includes(',') ? ' et al.' : ''} · {etude.annee} · {etude.journal.length > 35 ? etude.journal.slice(0, 35) + '…' : etude.journal}
                  </p>
                  <span style={{
                    display: 'inline-block', marginTop: 6,
                    padding: '2px 8px', borderRadius: 999,
                    background: color + '18', color, fontSize: '0.64rem', fontWeight: 800,
                  }}>
                    {etude.chiffre_cle}
                  </span>
                </div>
                <span style={{
                  color: '#d1d5db', fontSize: '0.9rem', flexShrink: 0, marginTop: 4,
                  transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
                }}>
                  ▾
                </span>
              </button>

              {/* Détail (accordéon) */}
              {isOpen && (
                <div style={{ padding: '0 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12 }} />

                  {/* Explication accessible */}
                  <div style={{ background: bg || '#f9fafb', borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ fontSize: '0.8rem', color: '#374151', margin: 0, lineHeight: 1.65 }}>
                      {etude.explication_client}
                    </p>
                  </div>

                  {/* Utilisation dans l'app */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.85rem', flexShrink: 0 }}>📱</span>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, lineHeight: 1.55 }}>
                      <span style={{ fontWeight: 700, color: '#374151' }}>Dans l'app : </span>
                      {etude.usage_app}
                    </p>
                  </div>

                  {/* Formule */}
                  {etude.formule && (
                    <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '10px 14px' }}>
                      {etude.formule.split('\n').map((line, i) => (
                        <p key={i} style={{
                          fontSize: '0.73rem', color: i === 0 ? '#e4f816' : 'rgba(228,248,22,0.6)',
                          margin: i === 0 ? 0 : '3px 0 0', lineHeight: 1.4,
                          fontFamily: 'monospace',
                        }}>
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Méthodologie (coach uniquement) */}
                  {coachMode && (
                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', borderLeft: `3px solid ${color}` }}>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, color, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Méthodologie & nuances
                      </p>
                      <p style={{ fontSize: '0.76rem', color: '#374151', margin: 0, lineHeight: 1.65 }}>
                        {etude.detail_coach}
                      </p>
                    </div>
                  )}

                  {/* Référence complète */}
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <p style={{ fontSize: '0.67rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>Auteurs : </span>
                      {etude.auteurs}
                    </p>
                    <p style={{ fontSize: '0.67rem', color: '#9ca3af', margin: 0 }}>
                      <span style={{ fontWeight: 700 }}>Référence : </span>
                      {etude.journal}, {etude.annee}
                    </p>
                    {coachMode && (
                      <p style={{ fontSize: '0.67rem', color: '#9ca3af', margin: 0 }}>
                        <span style={{ fontWeight: 700 }}>DOI : </span>
                        {etude.doi}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <div style={{ height: coachMode ? 24 : 100 }} />
      </div>
    </div>
  )
}
