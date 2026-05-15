/**
 * nutrition-analyze-photo
 * POST { photo_base64: string, mime_type?: string }
 * → { ok, repas_nom, items, total_kcal, total_prot_g, total_carbs_g, total_fat_g, confiance, note_ia }
 *
 * Utilise Groq Vision (llama-3.2-11b-vision-preview) en priorité — gratuit.
 * Fallback Gemini si GROQ_API_KEY absent.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

const VISION_PROMPT = `Tu es un expert en nutrition. Analyse cette photo de repas.
Identifie chaque aliment visible, estime les quantités et valeurs nutritionnelles.
Sois précis mais conservateur dans tes estimations.

Réponds UNIQUEMENT avec ce JSON valide (sans texte autour) :
{
  "repas_nom": "nom court du repas en français",
  "items": [
    { "name": "nom de l'aliment", "quantity": 150, "unit": "g", "kcal": 200, "prot_g": 15.0, "carbs_g": 20.0, "fat_g": 5.0 }
  ],
  "total_kcal": 350,
  "total_prot_g": 25.0,
  "total_carbs_g": 30.0,
  "total_fat_g": 8.0,
  "confiance": "élevé",
  "note_ia": "Commentaire court en français (1 phrase)"
}

Les valeurs "unit" acceptées : "g", "ml", "pièce".
Si tu ne peux pas identifier un aliment, utilise "Aliment non identifié".`;

// ── Groq Vision ───────────────────────────────────────────────────────────────
async function callGroqVision(key: string, base64: string, mimeType: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Quota Groq atteint — réessaie dans quelques secondes");
    throw new Error(`Groq Vision ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Gemini Vision (fallback) ──────────────────────────────────────────────────
async function callGeminiVision(key: string, base64: string, mimeType: string): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: VISION_PROMPT },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: VISION_PROMPT },
          ],
        }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("Quota Gemini dépassé — configure GROQ_API_KEY dans les secrets Supabase");
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text);
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

    const { photo_base64, mime_type = "image/jpeg" } = await req.json();
    if (!photo_base64) {
      return new Response(JSON.stringify({ ok: false, error: "photo_base64 manquant" }), { headers: JSON_CT });
    }

    const result = GROQ_KEY
      ? await callGroqVision(GROQ_KEY, photo_base64, mime_type)
      : await callGeminiVision(GEMINI_KEY!, photo_base64, mime_type);

    return new Response(JSON.stringify({ ok: true, ...result }), { headers: JSON_CT });
  } catch (e) {
    console.error("[analyze-photo]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
