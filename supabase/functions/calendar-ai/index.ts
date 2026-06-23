/**
 * calendar-ai
 * POST { messages: {role,content}[], context: { groupe, phases, recentEvents, currentDate } }
 * → { ok, texte, evenements: Event[] }
 *
 * Arthur décrit ce qu'il veut, Gemini Flash retourne un JSON structuré
 * avec les événements à créer sur le calendrier groupe.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

interface Phase { label: string; debut: string; fin: string }
interface RecentEvent { date: string; type: string; titre: string | null; charge: string | null }
interface Context {
  groupe: { nom: string }
  phases: Phase[]
  recentEvents: RecentEvent[]
  currentDate: string
}

function buildSystem(ctx: Context): string {
  const phases = ctx.phases.length
    ? ctx.phases.map(p => `  - ${p.label} : ${p.debut} → ${p.fin}`).join("\n")
    : "  (aucune phase définie)"

  const recent = ctx.recentEvents.length
    ? ctx.recentEvents.slice(-20).map(e =>
        `  - ${e.date} | ${e.type}${e.titre ? " | " + e.titre : ""}${e.charge ? " | " + e.charge : ""}`
      ).join("\n")
    : "  (aucune séance récente)"

  return `Tu es l'assistant de planification d'Arthur, préparateur physique rugby.
Groupe : ${ctx.groupe.nom}
Aujourd'hui : ${ctx.currentDate}

PHASES DU CYCLE :
${phases}

SÉANCES DES 4 DERNIÈRES SEMAINES :
${recent}

VALEURS AUTORISÉES :
- type : "entrainement" | "match" | "muscu"
- charge : "Légère" | "Modérée" | "Haute"
- contact_intensite : 0 (sans contact) | 1 (léger) | 2 (contrôlé) | 3 (intense) | 4 (match)
- course_volume : "Sans course" | "Peu de course" | "Volume moyen" | "Gros volume"
- course_intensite : "Légère" | "Haute intensité" | "Très haute intensité" | "Vitesse maximale"
- themes_seance : chaîne libre avec les thèmes séparés par des virgules

RÈGLE ABSOLUE : réponds UNIQUEMENT avec ce JSON, rien d'autre :
{
  "texte": "Message court (1-2 phrases) résumant ce que tu vas créer ou répondant à la question",
  "evenements": [
    {
      "date": "YYYY-MM-DD",
      "type": "entrainement",
      "titre": null,
      "heure": null,
      "duree_min": null,
      "charge": null,
      "themes_seance": null,
      "contact_intensite": null,
      "course_volume": null,
      "course_intensite": null,
      "note": null
    }
  ]
}

Si Arthur pose une question sans demander de créer des séances, renvoie "evenements": [].
Si une info est inconnue, laisse null — n'invente pas.`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ ok: false, error: "Non authentifié" }), { status: 401, headers: JSON_CT })
  }
  const { createClient } = await import("npm:@supabase/supabase-js@2")
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return new Response(JSON.stringify({ ok: false, error: "Non authentifié" }), { status: 401, headers: JSON_CT })

  try {
    const { messages, context } = await req.json() as { messages: { role: string; content: string }[]; context: Context }
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY manquante")

    const systemText = buildSystem(context)

    // Construire le fil de conversation Gemini
    const contents = [
      // Tour d'amorçage pour injecter le system prompt
      { role: "user",  parts: [{ text: systemText }] },
      { role: "model", parts: [{ text: '{"texte":"Compris, prêt à planifier.","evenements":[]}' }] },
      ...messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    ]

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    })

    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"

    let parsed: { texte?: string; evenements?: unknown[] }
    try { parsed = JSON.parse(raw) } catch { parsed = { texte: raw, evenements: [] } }

    return new Response(
      JSON.stringify({ ok: true, texte: parsed.texte ?? "", evenements: parsed.evenements ?? [] }),
      { headers: JSON_CT },
    )
  } catch (e) {
    console.error("[calendar-ai]", e)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: JSON_CT })
  }
})
