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

const SYSTEM = `Tu es un expert en nutrition du sport francophone. Tu réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans markdown.`;

function userPrompt(text: string): string {
  return `L'utilisateur a décrit son repas : "${text}"

═══ VALEURS NUTRITIONNELLES DE RÉFÉRENCE (pour 100 g) ═══
Viandes/Poissons :
- Poulet grillé/rôti : 165 kcal | P:31 G:0 L:3.6
- Steak bœuf (5% MG) : 145 kcal | P:22 G:0 L:6
- Steak haché (15% MG) : 235 kcal | P:17 G:0 L:18
- Saumon : 208 kcal | P:20 G:0 L:13
- Thon au naturel : 116 kcal | P:26 G:0 L:1
- Œuf entier : 155 kcal | P:13 G:1 L:11

Féculents (cuits) :
- Riz blanc cuit : 130 kcal | P:2.7 G:28 L:0.3
- Pâtes cuites : 158 kcal | P:5.8 G:31 L:0.9
- Pomme de terre cuite : 87 kcal | P:1.9 G:20 L:0.1
- Quinoa cuit : 120 kcal | P:4.4 G:21 L:1.9
- Pain blanc/baguette : 265 kcal | P:9 G:51 L:3
- Pain complet : 247 kcal | P:9 G:45 L:3

Légumes :
- Légumes verts (brocoli, courgette, haricots…) : 30 kcal | P:2 G:4 L:0.3
- Salade verte : 15 kcal | P:1.5 G:1.5 L:0.2
- Tomate : 18 kcal | P:0.9 G:3.5 L:0.2
- Carottes : 41 kcal | P:0.9 G:9.6 L:0.2

Produits laitiers :
- Yaourt nature : 61 kcal | P:3.5 G:4.7 L:3.3
- Fromage blanc 0% : 44 kcal | P:7.5 G:4 L:0.2
- Emmental/Gruyère : 380 kcal | P:28 G:0 L:30

Matières grasses :
- Huile d'olive/tournesol : 900 kcal | P:0 G:0 L:100
- Beurre : 750 kcal | P:0.6 G:0.4 L:83

Divers :
- Lentilles cuites : 116 kcal | P:9 G:20 L:0.4
- Pois chiches cuits : 164 kcal | P:8.9 G:27 L:2.6
- Avocat : 160 kcal | P:2 G:9 L:15
- Banane : 89 kcal | P:1.1 G:23 L:0.3

═══ RÈGLES ═══
1. Utilise les valeurs de référence ci-dessus pour les aliments bruts courants
2. Pour les produits industriels/de marque (KitKat, Oreo, Coca-Cola, Danone, etc.), indique la marque dans "brand" et utilise les vraies valeurs officielles
3. Pour les aliments bruts, laisse "brand" à null
4. Si aucune quantité n'est précisée, estime une portion réaliste (ex: 150g de viande, 100g de féculents cuits)
5. Les valeurs kcal/macros doivent être calculées pour la quantité indiquée (pas pour 100g)
6. Les TOTAUX doivent être la SOMME EXACTE des items

Réponds UNIQUEMENT avec ce JSON valide :
{
  "repas_nom": "nom court du repas en français",
  "items": [
    {
      "name": "nom de l'aliment",
      "brand": null,
      "quantity": 150,
      "unit": "g",
      "kcal": 248,
      "prot_g": 46.5,
      "carbs_g": 0.0,
      "fat_g": 5.4
    }
  ],
  "total_kcal": 248,
  "total_prot_g": 46.5,
  "total_carbs_g": 0.0,
  "total_fat_g": 5.4,
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
      model: "llama-3.3-70b-versatile",
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
