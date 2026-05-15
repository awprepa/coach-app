/**
 * nutrition-transcribe-voice
 * POST { audio_base64: string, mime_type: string }
 * → { ok, text }
 *
 * Transcrit de l'audio en texte FR via Groq Whisper (gratuit, ~7000 req/jour).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_CT = { ...CORS, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "GROQ_API_KEY non configurée" }),
        { status: 500, headers: JSON_CT }
      );
    }

    const { audio_base64, mime_type = "audio/webm" } = await req.json();
    if (!audio_base64) {
      return new Response(
        JSON.stringify({ ok: false, error: "audio_base64 manquant" }),
        { headers: JSON_CT }
      );
    }

    // base64 → Uint8Array
    const binaryStr = atob(audio_base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Extension depuis le mime type
    const baseMime = mime_type.split(";")[0].trim();
    const ext = baseMime.includes("mp4") ? "mp4"
      : baseMime.includes("webm") ? "webm"
      : baseMime.includes("ogg")  ? "ogg"
      : baseMime.includes("wav")  ? "wav"
      : baseMime.includes("mpeg") ? "mp3"
      : "m4a";

    const blob = new Blob([bytes], { type: baseMime });

    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "fr");
    formData.append("response_format", "json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_KEY}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Quota Groq atteint — réessaie dans quelques secondes");
      throw new Error(`Whisper ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = (data.text ?? "").trim();

    if (!text) {
      return new Response(
        JSON.stringify({ ok: false, error: "Aucune parole détectée — réessaie" }),
        { headers: JSON_CT }
      );
    }

    return new Response(JSON.stringify({ ok: true, text }), { headers: JSON_CT });

  } catch (e) {
    console.error("[transcribe-voice]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: JSON_CT }
    );
  }
});
