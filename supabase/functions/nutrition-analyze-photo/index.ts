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

const VISION_PROMPT = `Tu es un nutritionniste du sport expert en analyse de photos de repas. Ton objectif est de donner des valeurs PRÉCISES et RÉALISTES.

═══ MÉTHODE D'ESTIMATION DES QUANTITÉS ═══
Utilise ces repères visuels pour estimer les grammes :
- Assiette standard = 26 cm de diamètre (repère de base)
- Paume de main = ~120-150 g de viande/poisson
- Poing fermé = ~150-200 g de féculents cuits (riz, pâtes)
- Pouce = ~15 g de fromage, beurre ou sauce
- Cuillère à soupe bombée = 15-20 g (huile = 10 ml ≈ 9 g)
- Tranche de pain standard = 30-35 g
- Œuf entier = 55-60 g
- Verre de jus / lait = 200-250 ml
- Pot de yaourt = 125 g

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

Légumes (cuits ou crus) :
- Légumes verts (brocoli, courgette, haricots...) : 25-35 kcal | P:2 G:4 L:0.3
- Salade verte : 15 kcal | P:1.5 G:1.5 L:0.2
- Tomate : 18 kcal | P:0.9 G:3.5 L:0.2
- Carottes : 41 kcal | P:0.9 G:9.6 L:0.2

Produits laitiers :
- Yaourt nature : 61 kcal | P:3.5 G:4.7 L:3.3
- Fromage blanc 0% : 44 kcal | P:7.5 G:4 L:0.2
- Emmental/Gruyère : 380 kcal | P:28 G:0 L:30
- Camembert : 300 kcal | P:20 G:0 L:24

Matières grasses :
- Huile d'olive/tournesol : 900 kcal | P:0 G:0 L:100
- Beurre : 750 kcal | P:0.6 G:0.4 L:83

Divers :
- Lentilles cuites : 116 kcal | P:9 G:20 L:0.4
- Pois chiches cuits : 164 kcal | P:8.9 G:27 L:2.6
- Avocat : 160 kcal | P:2 G:9 L:15
- Banane : 89 kcal | P:1.1 G:23 L:0.3

═══ INSTRUCTIONS ═══
1. Identifie CHAQUE aliment visible séparément
2. Estime la quantité avec les repères ci-dessus
3. Calcule kcal/macros depuis les valeurs de référence × quantité
4. Les TOTAUX doivent être la SOMME EXACTE des items
5. confiance = "élevé" si photo claire et aliments identifiables / "moyen" si estimation difficile / "faible" si photo trop floue

Réponds UNIQUEMENT avec ce JSON valide (sans texte autour) :
{
  "repas_nom": "nom court du repas en français",
  "items": [
    { "name": "nom précis de l'aliment", "quantity": 150, "unit": "g", "kcal": 248, "prot_g": 46.5, "carbs_g": 0.0, "fat_g": 5.4 }
  ],
  "total_kcal": 248,
  "total_prot_g": 46.5,
  "total_carbs_g": 0.0,
  "total_fat_g": 5.4,
  "confiance": "élevé",
  "note_ia": "Commentaire nutritionnel en 1 phrase (ex: richesse en protéines, aliment à surveiller)"
}

Les valeurs "unit" acceptées : "g", "ml", "pièce".
Si un aliment n'est pas identifiable, note "Aliment non identifié" et estime à 100 kcal par défaut.`;

// ── Groq Vision ───────────────────────────────────────────────────────────────
async function callGroqVision(key: string, base64: string, mimeType: string, note?: string): Promise<Record<string, unknown>> {
  const prompt = note
    ? `${VISION_PROMPT}\n\n⚠️ PRÉCISION UTILISATEUR : "${note}"\nTiens compte de cette information pour ajuster ou compléter ton analyse (ajoute des éléments manquants, modifie les quantités, corrige les aliments, etc.).`
    : VISION_PROMPT
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
            { type: "text", text: prompt },
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
async function callGeminiVision(key: string, base64: string, mimeType: string, note?: string): Promise<Record<string, unknown>> {
  const prompt = note
    ? `${VISION_PROMPT}\n\n⚠️ PRÉCISION UTILISATEUR : "${note}"\nTiens compte de cette information pour ajuster ou compléter ton analyse.`
    : VISION_PROMPT
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  })
  let res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
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

  // ── Vérification JWT — rejette les appels non authentifiés ───────────────
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ ok: false, error: "Non authentifié" }), { status: 401, headers: JSON_CT })
  }
  {
    const { createClient } = await import("npm:@supabase/supabase-js@2")
    const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: _u } } = await _sb.auth.getUser()
    if (!_u) return new Response(JSON.stringify({ ok: false, error: "Non authentifié" }), { status: 401, headers: JSON_CT })
  }

  try {
    const GROQ_KEY   = Deno.env.get("GROQ_API_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GROQ_KEY && !GEMINI_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Aucune clé IA configurée" }),
        { status: 500, headers: JSON_CT }
      );
    }

    const { photo_base64, mime_type = "image/jpeg", note_utilisateur } = await req.json();
    if (!photo_base64 || photo_base64.length > 2_000_000) {
      return new Response(JSON.stringify({ ok: false, error: !photo_base64 ? "photo_base64 manquant" : "Image trop volumineuse (max ~1.5 Mo)" }), { status: 400, headers: JSON_CT })
    }

    const result = GROQ_KEY
      ? await callGroqVision(GROQ_KEY, photo_base64, mime_type, note_utilisateur)
      : await callGeminiVision(GEMINI_KEY!, photo_base64, mime_type, note_utilisateur);

    // Recalcul des totaux côté serveur depuis les items (ne pas faire confiance au modèle)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(result.items) ? result.items : [];
    const total_kcal    = Math.round(items.reduce((s, i) => s + (Number(i.kcal)    || 0), 0));
    const total_prot_g  = Math.round(items.reduce((s, i) => s + (Number(i.prot_g)  || 0), 0) * 10) / 10;
    const total_carbs_g = Math.round(items.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0) * 10) / 10;
    const total_fat_g   = Math.round(items.reduce((s, i) => s + (Number(i.fat_g)   || 0), 0) * 10) / 10;

    return new Response(JSON.stringify({
      ok: true,
      repas_nom:    result.repas_nom,
      items,
      total_kcal,
      total_prot_g,
      total_carbs_g,
      total_fat_g,
      confiance:    result.confiance,
      note_ia:      result.note_ia,
    }), { headers: JSON_CT });
  } catch (e) {
    console.error("[analyze-photo]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
