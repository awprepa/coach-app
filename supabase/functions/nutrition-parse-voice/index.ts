/**
 * nutrition-parse-voice
 * POST { text: string }
 * → { ok, repas_nom, items, total_kcal, total_prot_g, total_carbs_g, total_fat_g, note_ia }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

function buildPrompt(text: string): string {
  return `Tu es un expert en nutrition francophone. Un utilisateur a décrit son repas à voix haute.
Transcription : "${text}"

Identifie chaque aliment mentionné, estime les quantités si non précisées (portion standard), et calcule les valeurs nutritionnelles.

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
  "note_ia": "Commentaire bref sur ce repas (1 phrase)"
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

    const { text } = await req.json();
    if (!text?.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "text manquant" }),
        { headers: JSON_CT }
      );
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(text) }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");

    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: JSON_CT });
  } catch (e) {
    console.error("[parse-voice]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
