/**
 * nutrition-quality-score
 * POST { meals: Meal[], goals: Goals|null, water_ml: number }
 * → { ok, score, verdict, commentaire }
 *
 * Le score est calculé localement (déterministe, fiable).
 * L'IA (Groq / Gemini) génère uniquement le commentaire personnalisé.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

interface Meal  { name?: string; kcal?: number; prot_g?: number; carbs_g?: number; fat_g?: number }
interface Goals { kcal_target?: number; prot_g?: number; carbs_g?: number; fat_g?: number; hydration_ml?: number }

function sum(meals: Meal[], key: keyof Meal): number {
  return meals.reduce((acc, m) => acc + (Number(m[key]) || 0), 0);
}

// ── Score calculé localement (déterministe) ───────────────────────────────────
function computeScore(meals: Meal[], goals: Goals | null, water_ml: number): number {
  const kcal  = sum(meals, "kcal");
  const prot  = sum(meals, "prot_g");
  const carbs = sum(meals, "carbs_g");
  const fat   = sum(meals, "fat_g");

  let score = 7.0;

  if (goals) {
    // ── Calories ──────────────────────────────────────────────────────────────
    if (goals.kcal_target && goals.kcal_target > 0) {
      const pct = kcal / goals.kcal_target;
      if      (pct < 0.40) score -= 3.5;
      else if (pct < 0.55) score -= 2.5;
      else if (pct < 0.70) score -= 1.5;
      else if (pct < 0.85) score -= 0.5;
      else if (pct > 1.50) score -= 2.5;
      else if (pct > 1.30) score -= 1.5;
      else if (pct > 1.15) score -= 0.5;
      else if (pct >= 0.90 && pct <= 1.10) score += 0.5; // zone parfaite
    }

    // ── Protéines (très important pour les sportifs) ───────────────────────
    if (goals.prot_g && goals.prot_g > 0) {
      const pct = prot / goals.prot_g;
      if      (pct < 0.40) score -= 3.0;
      else if (pct < 0.55) score -= 2.0;
      else if (pct < 0.70) score -= 1.5;
      else if (pct < 0.85) score -= 0.5;
      else if (pct >= 0.95) score += 0.5; // objectif atteint
    }

    // ── Glucides ──────────────────────────────────────────────────────────────
    if (goals.carbs_g && goals.carbs_g > 0) {
      const pct = carbs / goals.carbs_g;
      if      (pct > 1.60) score -= 1.0;
      else if (pct > 1.30) score -= 0.5;
      else if (pct < 0.40) score -= 0.5;
    }

    // ── Lipides ───────────────────────────────────────────────────────────────
    if (goals.fat_g && goals.fat_g > 0) {
      const pct = fat / goals.fat_g;
      if      (pct > 1.80) score -= 1.0;
      else if (pct > 1.40) score -= 0.5;
    }
  } else {
    // Pas d'objectifs : évaluation qualitative sur macros absolues
    const total_macro_kcal = prot * 4 + carbs * 4 + fat * 9;
    if (total_macro_kcal > 0) {
      const protPct = (prot * 4) / total_macro_kcal;
      if      (protPct >= 0.30) score += 0.5;
      else if (protPct < 0.12)  score -= 1.0;
      const fatPct = (fat * 9) / total_macro_kcal;
      if (fatPct > 0.50) score -= 0.5;
    }
    if (kcal < 1000) score -= 1.5;
    if (kcal > 3500) score -= 1.0;
  }

  // ── Hydratation ──────────────────────────────────────────────────────────────
  const waterTarget = goals?.hydration_ml ?? 2000;
  const waterPct = water_ml / waterTarget;
  if      (water_ml < 500)   score -= 1.5;
  else if (water_ml < 1000)  score -= 1.0;
  else if (water_ml < 1500)  score -= 0.5;
  else if (waterPct >= 1.0)  score += 0.3;

  // ── Nombre de repas ──────────────────────────────────────────────────────────
  const nbMeals = meals.length;
  if      (nbMeals <= 1) score -= 0.5;
  else if (nbMeals >= 3) score += 0.2;

  return Math.round(Math.max(1, Math.min(10, score)) * 10) / 10;
}

function verdictFromScore(score: number): string {
  if (score >= 9)   return "Journée parfaite 🏆";
  if (score >= 7.5) return "Très bonne journée";
  if (score >= 6)   return "Bonne journée";
  if (score >= 4.5) return "Journée correcte";
  if (score >= 3)   return "Journée à améliorer";
  return "Journée difficile";
}

// ── Prompt pour commentaire IA uniquement ─────────────────────────────────────
function buildCommentairePrompt(
  meals: Meal[],
  goals: Goals | null,
  water_ml: number,
  score: number,
): string {
  const kcal  = Math.round(sum(meals, "kcal"));
  const prot  = Math.round(sum(meals, "prot_g") * 10) / 10;
  const carbs = Math.round(sum(meals, "carbs_g") * 10) / 10;
  const fat   = Math.round(sum(meals, "fat_g") * 10) / 10;

  const goalsBlock = goals
    ? `Objectifs : ${goals.kcal_target ?? "?"}kcal · P:${goals.prot_g ?? "?"}g · G:${goals.carbs_g ?? "?"}g · L:${goals.fat_g ?? "?"}g · Eau:${goals.hydration_ml ?? 2000}ml`
    : "Pas d'objectifs personnalisés.";

  const realized = `Consommé : ${kcal}kcal · P:${prot}g · G:${carbs}g · L:${fat}g · Eau:${water_ml}ml`;

  return `Tu es un nutritionniste du sport. La journée de cet athlète a reçu un score de ${score}/10.

${goalsBlock}
${realized}

Donne UN conseil ultra-concis (1 phrase max, direct, actionnable) qui explique pourquoi ce score et comment améliorer.
Sois précis sur les chiffres (ex: "Il te manque Xg de protéines").
Réponds en français, UNIQUEMENT avec ce JSON :
{"commentaire": "Ta phrase de conseil ici."}`;
}

// ── Groq ─────────────────────────────────────────────────────────────────────
async function callGroq(key: string, messages: unknown[]): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.6,
      max_tokens: 120,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.commentaire ?? "";
}

// ── Gemini fallback ───────────────────────────────────────────────────────────
async function callGemini(key: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
  return parsed.commentaire ?? "";
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { meals, goals, water_ml = 0 } = await req.json();
    if (!meals?.length) {
      return new Response(JSON.stringify({ ok: false, error: "Aucun repas fourni" }), { headers: JSON_CT });
    }

    // 1. Score calculé localement — déterministe
    const score   = computeScore(meals, goals, water_ml);
    const verdict = verdictFromScore(score);

    // 2. Commentaire IA (optionnel — ne fait pas échouer si indisponible)
    let commentaire = "";
    try {
      const GROQ_KEY   = Deno.env.get("GROQ_API_KEY");
      const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
      const prompt = buildCommentairePrompt(meals, goals, water_ml, score);

      if (GROQ_KEY) {
        commentaire = await callGroq(GROQ_KEY, [
          { role: "system", content: "Tu es un nutritionniste du sport. Réponds uniquement en JSON." },
          { role: "user",   content: prompt },
        ]);
      } else if (GEMINI_KEY) {
        commentaire = await callGemini(GEMINI_KEY, prompt);
      }
    } catch (e) {
      console.warn("[quality-score] commentaire IA échoué:", e);
      commentaire = "Continue sur cette lancée et veille à bien répartir tes apports sur la journée.";
    }

    return new Response(
      JSON.stringify({ ok: true, score, verdict, commentaire }),
      { headers: JSON_CT },
    );
  } catch (e) {
    console.error("[quality-score]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT },
    );
  }
});
