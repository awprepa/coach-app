/**
 * nutrition-parse-voice
 * POST { text: string }
 * → { ok, repas_nom, items, total_kcal, total_prot_g, total_carbs_g, total_fat_g, note_ia }
 *
 * Utilise Groq (llama-3.1-8b-instant) pour le parsing.
 * Pour les produits de marque : lookup Open Food Facts pour les vraies valeurs.
 * Fallback Gemini si GROQ_API_KEY absent.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

const SYSTEM = `Tu es un expert en nutrition francophone. Tu réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans markdown.`;

function userPrompt(text: string): string {
  return `L'utilisateur a décrit son repas : "${text}"

Identifie chaque aliment. Pour les produits industriels/de marque connus (KitKat, Oreo, Coca-Cola, Danone, etc.), indique la marque dans le champ "brand" et utilise les vraies valeurs nutritionnelles officielles. Pour les aliments bruts, laisse "brand" à null.

Réponds UNIQUEMENT avec ce JSON valide :
{
  "repas_nom": "nom court du repas en français",
  "items": [
    {
      "name": "nom de l'aliment",
      "brand": "Marque ou null",
      "quantity": 41.5,
      "unit": "g",
      "kcal": 215,
      "prot_g": 2.8,
      "carbs_g": 26.6,
      "fat_g": 10.8
    }
  ],
  "total_kcal": 215,
  "total_prot_g": 2.8,
  "total_carbs_g": 26.6,
  "total_fat_g": 10.8,
  "note_ia": "Commentaire bref (1 phrase)"
}`;
}

// ── Open Food Facts lookup (pour les produits de marque) ────────────────────
interface NutriPer100 { kcal: number; prot_g: number; carbs_g: number; fat_g: number }

async function lookupOFacts(query: string): Promise<NutriPer100 | null> {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&action=process&json=1&page_size=1&fields=nutriments&sort_by=unique_scans_n`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const n = data.products?.[0]?.nutriments;
    if (!n) return null;
    const kcal = Number(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0);
    if (!kcal) return null;
    return {
      kcal,
      prot_g:  Number(n.proteins_100g    ?? 0),
      carbs_g: Number(n.carbohydrates_100g ?? 0),
      fat_g:   Number(n.fat_100g          ?? 0),
    };
  } catch {
    return null;
  }
}

// ── Groq (OpenAI-compatible) ─────────────────────────────────────────────────
async function callGroq(key: string, messages: unknown[]): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1024,
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

// ── Gemini (fallback) ─────────────────────────────────────────────────────────
async function callGemini(key: string, prompt: string): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
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

// ── Enrichissement avec Open Food Facts ──────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichItems(items: any[]): Promise<any[]> {
  return Promise.all(items.map(async (item) => {
    // Seulement pour les produits avec une marque connue
    if (!item.brand || item.brand === "null") return item;
    const query = `${item.name} ${item.brand}`;
    const real = await lookupOFacts(query);
    if (!real) return item;
    const qty = Number(item.quantity) || 100;
    const ratio = qty / 100;
    return {
      ...item,
      kcal:    Math.round(real.kcal    * ratio),
      prot_g:  Math.round(real.prot_g  * ratio * 10) / 10,
      carbs_g: Math.round(real.carbs_g * ratio * 10) / 10,
      fat_g:   Math.round(real.fat_g   * ratio * 10) / 10,
    };
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const GROQ_KEY   = Deno.env.get("GROQ_API_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GROQ_KEY && !GEMINI_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Aucune clé IA configurée (GROQ_API_KEY ou GEMINI_API_KEY)" }),
        { status: 500, headers: JSON_CT }
      );
    }

    const { text } = await req.json();
    if (!text?.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "text manquant" }), { headers: JSON_CT });
    }

    // 1. Parsing IA
    const parsed = GROQ_KEY
      ? await callGroq(GROQ_KEY, [
          { role: "system", content: SYSTEM },
          { role: "user",   content: userPrompt(text) },
        ])
      : await callGemini(GEMINI_KEY!, userPrompt(text));

    // 2. Enrichissement Open Food Facts pour les produits de marque
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(parsed.items) ? parsed.items : [];
    const enriched = await enrichItems(items);

    // 3. Recalcul des totaux après enrichissement
    const total_kcal    = Math.round(enriched.reduce((s, i) => s + (Number(i.kcal)    || 0), 0));
    const total_prot_g  = Math.round(enriched.reduce((s, i) => s + (Number(i.prot_g)  || 0), 0) * 10) / 10;
    const total_carbs_g = Math.round(enriched.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0) * 10) / 10;
    const total_fat_g   = Math.round(enriched.reduce((s, i) => s + (Number(i.fat_g)   || 0), 0) * 10) / 10;

    return new Response(JSON.stringify({
      ok: true,
      repas_nom:    parsed.repas_nom,
      items:        enriched,
      total_kcal,
      total_prot_g,
      total_carbs_g,
      total_fat_g,
      note_ia:      parsed.note_ia,
    }), { headers: JSON_CT });

  } catch (e) {
    console.error("[parse-voice]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
