/**
 * nutrition-analyze-photo
 * POST { photo_base64: string, mime_type?: string }
 * → { ok, repas_nom, items, total_kcal, total_prot_g, total_carbs_g, total_fat_g, confiance, note_ia }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

const PROMPT = `Tu es un expert en nutrition. Analyse cette photo de repas.
Identifie chaque aliment visible et estime les quantités et valeurs nutritionnelles.
Sois précis mais conservateur dans tes estimations.

Réponds UNIQUEMENT avec ce JSON valide (sans texte autour) :
{
  "repas_nom": "nom court du repas en français",
  "items": [
    {
      "name": "nom de l'aliment",
      "quantity": 150,
      "unit": "g",
      "kcal": 200,
      "prot_g": 15.0,
      "carbs_g": 20.0,
      "fat_g": 5.0
    }
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

async function callGemini(key: string, parts: unknown[]) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(text);
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

    const { photo_base64, mime_type = "image/jpeg" } = await req.json();
    if (!photo_base64) {
      return new Response(
        JSON.stringify({ ok: false, error: "photo_base64 manquant" }),
        { headers: JSON_CT }
      );
    }

    const result = await callGemini(GEMINI_KEY, [
      { inlineData: { mimeType: mime_type, data: photo_base64 } },
      { text: PROMPT },
    ]);

    return new Response(JSON.stringify({ ok: true, ...result }), { headers: JSON_CT });
  } catch (e) {
    console.error("[analyze-photo]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
