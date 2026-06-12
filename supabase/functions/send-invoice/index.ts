import nodemailer from "npm:nodemailer@6"

const GMAIL_USER = Deno.env.get("GMAIL_USER")!          // wehrey.arthur@gmail.com
const GMAIL_PASS = Deno.env.get("GMAIL_APP_PASSWORD")!  // mot de passe d'application Google

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
    const { to, subject, html, pdfBase64, pdfName, fromName } = await req.json()

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Champs manquants : to, subject, html" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    })

    const mailOptions: Record<string, unknown> = {
      from: `"${fromName || "AWprepa"}" <${GMAIL_USER}>`,
      to,
      subject,
      html,
    }

    if (pdfBase64 && pdfName) {
      mailOptions.attachments = [
        {
          filename: pdfName,
          content: pdfBase64,
          encoding: "base64",
        },
      ]
    }

    await transporter.sendMail(mailOptions)

    return new Response(JSON.stringify({ success: true }), {
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
