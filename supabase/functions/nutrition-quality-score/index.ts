/**
 * nutrition-quality-score
 * POST { meals: Meal[], goals: Goals|null, water_ml: number }
 * → { ok, score, verdict, commentaire }
 *
 * Utilise Groq (llama-3.1-8b-instant) en priorité — 14 400 req/jour gratuit.
 * Fallback Gemini si GROQ_API_KEY absent.
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
    : `Aucun objectif personnalisé. Évalue la qualité nutritionnelle globale.`;

  return `Tu es un nutritionniste expert et rigoureux travaillant avec des sportifs de haut niveau. Évalue cette journée alimentaire avec précision — ne sois PAS trop indulgent.

${goalsBlock}

Consommé aujourd'hui :
- Calories : ${kcal} kcal
- Protéines : ${prot} g
- Glucides : ${carbs} g
- Lipides : ${fat} g
- Hydratation : ${water_ml} ml
- Nombre de repas : ${meals.length}

Barème de notation (sois strict) :
- 1-3 : journée nutritionnellement pauvre, objectifs très loin d'être atteints
- 4-5 : journée moyenne, écarts significatifs aux objectifs (>30%), améliorations importantes nécessaires
- 6-7 : journée correcte, quelques écarts mineurs (<20%) aux objectifs
- 8-9 : journée excellente, objectifs quasiment atteints
- 10 : journée parfaite (très rare)

Si les calories sont inférieures à 60% ou supérieures à 140% de l'objectif, la note ne peut PAS dépasser 5.
Si les protéines sont inférieures à 70% de l'objectif, enlève au moins 1,5 point.
Si l'hydratation est inférieure à 1000 ml, enlève 0,5 point.

Réponds UNIQUEMENT avec ce JSON valide (commentaire constructif, 1-2 phrases) :
{
  "score": 5.5,
  "verdict": "Journée moyenne",
  "commentaire": "Tes protéines sont insuffisantes par rapport à ton objectif. Ajoute une source protéique à chaque repas."
}`;
}

// ── Groq ─────────────────────────────────────────────────────────────────────
async function callGroq(key: string, messages: unknown[]): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 256,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Quota Groq atteint — réessaie dans quelques secondes");
    throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Gemini fallback ───────────────────────────────────────────────────────────
async function callGemini(key: string, prompt: string): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    }),
  });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    });
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("Quota Gemini dépassé — configure GROQ_API_KEY dans les secrets Supabase");
    throw new Error(`Gemini ${res.status}`);
  }
  const data = await res.json();
  return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const GROQ_KEY   = Deno.env.get("GROQ_API_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GROQ_KEY && !GEMINI_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Aucune clé IA configurée" }),
        { status: 500, headers: JSON_CT }
      );
    }

    const { meals, goals, water_ml = 0 } = await req.json();
    if (!meals?.length) {
      return new Response(JSON.stringify({ ok: false, error: "Aucun repas fourni" }), { headers: JSON_CT });
    }

    const prompt = buildPrompt(meals, goals, water_ml);
    const parsed = GROQ_KEY
      ? await callGroq(GROQ_KEY, [
          { role: "system", content: "Tu es un nutritionniste expert. Tu réponds UNIQUEMENT avec du JSON valide." },
          { role: "user",   content: prompt },
        ])
      : await callGemini(GEMINI_KEY!, prompt);

    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: JSON_CT });
  } catch (e) {
    console.error("[quality-score]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
