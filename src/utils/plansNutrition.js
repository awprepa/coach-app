import { supabase } from '../supabase'
import { MASTER_PROMPT } from '../pages/NutritionPlanEditor'

// Outils communs pour réutiliser un plan nutritionnel : le charger en entier,
// le copier vers un client, ou préparer un prompt pour en créer un similaire.

export async function chargerPlanComplet(planId) {
  const [{ data: plan }, { data: jours }] = await Promise.all([
    supabase.from('nutrition_plans').select('*').eq('id', planId).single(),
    supabase.from('nutrition_plan_days').select('*, nutrition_plan_meals(*, nutrition_plan_foods(*))').eq('plan_id', planId).order('jour_numero'),
  ])
  return { plan, jours: jours || [] }
}

const parOrdre = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)

// Plan au format d'import JSON (celui du prompt maître)
export function planVersJson(plan, jours) {
  const n = v => (v == null || v === '' ? undefined : Number(v))
  return {
    nom: plan.nom,
    description: plan.description || undefined,
    objectif_kcal_base: n(plan.objectif_kcal), objectif_prot: n(plan.objectif_prot),
    objectif_carbs: n(plan.objectif_carbs), objectif_fat: n(plan.objectif_fat),
    jours: jours.map(j => ({
      jour_numero: j.jour_numero, label: j.label, type_jour: j.type_jour || 'standard', objectif_kcal: n(j.objectif_kcal),
      repas: (j.nutrition_plan_meals || []).slice().sort(parOrdre).map(m => ({
        type: m.meal_type, nom: m.nom, kcal: n(m.kcal), prot_g: n(m.prot_g), carbs_g: n(m.carbs_g), fat_g: n(m.fat_g),
        recette: m.recette || undefined, notes: m.notes || undefined,
        aliments: (m.nutrition_plan_foods || []).slice().sort(parOrdre).map(f => ({
          nom: f.nom, quantite_g: n(f.quantite_g), kcal: n(f.kcal), prot_g: n(f.prot_g), carbs_g: n(f.carbs_g), fat_g: n(f.fat_g), fibre_g: n(f.fibre_g),
        })),
      })),
    })),
  }
}

// Copie exacte d'un plan (jours, repas, aliments) vers un client, en brouillon
// et sans dates. Renvoie l'id du nouveau plan, ou lève une erreur.
export async function dupliquerPlan(sourcePlan, jours, clientId) {
  const { data: nouveau, error } = await supabase.from('nutrition_plans').insert({
    client_id: clientId,
    nom: `${sourcePlan.nom} (copie)`,
    description: sourcePlan.description,
    date_debut: null, date_fin: null,
    statut: 'brouillon',
    objectif_kcal: sourcePlan.objectif_kcal, objectif_prot: sourcePlan.objectif_prot,
    objectif_carbs: sourcePlan.objectif_carbs, objectif_fat: sourcePlan.objectif_fat,
  }).select('id').single()
  if (error || !nouveau) throw new Error(error?.message || 'Copie impossible')
  for (const d of jours) {
    const { data: jour } = await supabase.from('nutrition_plan_days').insert({
      plan_id: nouveau.id, jour_numero: d.jour_numero, label: d.label, type_jour: d.type_jour,
      objectif_kcal: d.objectif_kcal, objectif_prot: d.objectif_prot,
      objectif_carbs: d.objectif_carbs, objectif_fat: d.objectif_fat,
    }).select('id').single()
    if (!jour) continue
    for (const m of (d.nutrition_plan_meals || [])) {
      const { data: repas } = await supabase.from('nutrition_plan_meals').insert({
        day_id: jour.id, meal_type: m.meal_type, nom: m.nom, ordre: m.ordre,
        kcal: m.kcal, prot_g: m.prot_g, carbs_g: m.carbs_g, fat_g: m.fat_g,
        recette: m.recette, notes: m.notes,
      }).select('id').single()
      if (!repas) continue
      const foods = m.nutrition_plan_foods || []
      if (foods.length) {
        await supabase.from('nutrition_plan_foods').insert(foods.map(f => ({
          meal_id: repas.id, nom: f.nom, quantite_g: f.quantite_g, ordre: f.ordre,
          kcal: f.kcal, prot_g: f.prot_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fibre_g: f.fibre_g,
        })))
      }
    }
  }
  return nouveau.id
}

// Prompt « plan similaire » : le plan de référence + les consignes du coach,
// avec la structure et les règles du prompt maître (même format d'import).
export function promptPlanSimilaire(json, consignes) {
  const structure = MASTER_PROMPT.slice(MASTER_PROMPT.indexOf('STRUCTURE JSON EXACTE'), MASTER_PROMPT.indexOf('RÈGLES ABSOLUES')).trim()
  const regles = MASTER_PROMPT.slice(MASTER_PROMPT.indexOf('RÈGLES ABSOLUES'), MASTER_PROMPT.indexOf('PROFIL DU CLIENT')).trim()
  return `Tu es un diététicien expert en nutrition sportive. Voici un plan nutritionnel que j'ai déjà utilisé avec un client (plan de référence, au format JSON). Crée un NOUVEAU plan similaire : même logique, même style de repas et d'organisation (batch cooking, aliments simples, recettes du même niveau), en appliquant les modifications demandées ci-dessous. Tout ce qui n'est pas concerné par ces modifications doit rester proche du plan de référence.

MODIFICATIONS DEMANDÉES :
${consignes.trim() || '[Écris ici ce qui change : calories, objectif, profil du client, aliments à exclure ou à ajouter…]'}

PLAN DE RÉFÉRENCE :
${JSON.stringify(json, null, 1)}

${structure}

${regles}
- Recalcule toutes les quantités, calories et macros pour qu'elles soient cohérentes avec les modifications demandées.

Réponds UNIQUEMENT avec le JSON brut du nouveau plan. Pas de markdown, pas d'explication, pas de texte avant ou après. Commence directement par { et termine par }.`
}
