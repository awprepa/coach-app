import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    // Réservé au coach : sans ce contrôle, n'importe quel utilisateur connecté
    // (un athlète) pouvait envoyer un e-mail quelconque depuis le compte d'envoi.
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    })
    const { data: estCoach } = await sb.rpc("is_coach")
    if (estCoach !== true) {
      return new Response(JSON.stringify({ error: "Réservé au coach" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const { to, subject, html, pdfBase64, pdfName, fromName } = await req.json()

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Champs manquants : to, subject, html" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const payload: Record<string, unknown> = {
      from: `${fromName || "AWprepa"} <onboarding@resend.dev>`,
      to: [to],
      subject,
      html,
    }

    if (pdfBase64 && pdfName) {
      payload.attachments = [
        {
          filename: pdfName,
          content: pdfBase64,
        },
      ]
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error("[send-invoice] Resend error:", data)
      return new Response(JSON.stringify({ error: data?.message || "Erreur Resend" }), {
        status: res.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  } catch (e) {
    console.error("[send-invoice] Erreur:", e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})
