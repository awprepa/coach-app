/**
 * nutrition-quality-score
 * POST { meals: Meal[], goals: Goals|null, water_ml: number }
 * → { ok, score, verdict, commentaire }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

interface Meal  { kcal?: number; prot_g?: number; carbs_g?: number; fat_g?: number }
interface Goals { kcal_target?: number; prot_g?: number; carbs_g?: number; fat_g?: number; hydration_ml?: number }

function sum(meals: Meal[], key: keyof Meal): number {
  return meals.reduce((acc, m) => acc + (Number(m[key]) || 0), 0);
}

function buildPrompt(meals: Meal[], goals: Goals | null, water_ml: number): string {
  const kcal  = Math.round(sum(meals, "kcal"));
  const prot  = Math.round(sum(meals, "prot_g") * 10) / 10;
  const carbs = Math.round(sum(meals, "carbs_g") * 10) / 10;
  const fat   = Math.round(sum(meals, "fat_g") * 10) / 10;

  const goalsBlock = goals
    ? `Objectifs du jour :
- Calories : ${goals.kcal_target ?? "non défini"} kcal
- Protéines : ${goals.prot_g ?? "non défini"} g
- Glucides : ${goals.carbs_g ?? "non défini"} g
- Lipides : ${goals.fat_g ?? "non défini"} g
- Hydratation : ${goals.hydration_ml ?? 2000} ml`
    : `Aucun objectif personnalisé défini. Évalue la qualité nutritionnelle globale.`;

  return `Tu es un nutritionniste expert et bienveillant. Évalue la journée alimentaire de cet athlète.

${goalsBlock}

Consommé aujourd'hui :
- Calories : ${kcal} kcal
- Protéines : ${prot} g
- Glucides : ${carbs} g
- Lipides : ${fat} g
- Hydratation : ${water_ml} ml
- Nombre de repas : ${meals.length}

Donne une note de 0 à 10 (décimale permise), un verdict court (3-5 mots) et un commentaire personnalisé encourageant de 1-2 phrases maximum en français.

Réponds UNIQUEMENT avec ce JSON valide :
{
  "score": 7.5,
  "verdict": "Bonne journée !",
  "commentaire": "Tes protéines sont bien réparties. Pense à t'hydrater un peu plus demain."
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "GEMINI_API_KEY non configurée" }),
        { status: 500, headers: JSON_CT }
      );
    }

    const { meals, goals, water_ml = 0 } = await req.json();
    if (!meals?.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "Aucun repas fourni" }),
        { headers: JSON_CT }
      );
    }

    const G_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    const G_BODY = JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(meals, goals, water_ml) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 } });
    let res = await fetch(G_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: G_BODY });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      res = await fetch(G_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: G_BODY });
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      const isQuota = errBody.includes("quota") || errBody.includes("RESOURCE_EXHAUSTED");
      if (res.status === 429) throw new Error(isQuota ? "Quota journalier Gemini dépassé" : "Trop de requêtes — réessaie");
      throw new Error(`Gemini ${res.status}`);
    }
    const data = await res.json();
    const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");

    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: JSON_CT });
  } catch (e) {
    console.error("[quality-score]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
