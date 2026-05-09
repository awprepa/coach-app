import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
webpush.setVapidDetails("mailto:wehrey.arthur@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Répondre au preflight CORS sans lire le body
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.error("[send-push] ► invoquée, method:", req.method);
  try {
    const body = await req.json();
    console.error("[send-push] body reçu, record:", JSON.stringify(body?.record ?? null));

    const record = body?.record;
    if (!record) {
      console.error("[send-push] ⚠ record manquant dans le body");
      return new Response("no record", { status: 200, headers: corsHeaders });
    }

    console.error("[send-push] destinataire_id:", record.destinataire_id);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", record.destinataire_id);

    if (subErr) {
      console.error("[send-push] Erreur lecture push_subscriptions:", subErr);
      return new Response("db error", { status: 500, headers: corsHeaders });
    }

    console.error("[send-push] subscriptions trouvées:", subs?.length ?? 0);
    if (!subs?.length) return new Response("no subscription", { status: 200, headers: corsHeaders });

    const payload = JSON.stringify({
      titre: record.titre,
      corps: record.corps || "",
      lien: record.lien || "/",
    });

    const results = await Promise.allSettled(
      subs.map(({ subscription }) => webpush.sendNotification(subscription, payload))
    );

    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`[send-push] push #${i} échoué:`, r.reason);
      else console.error(`[send-push] push #${i} envoyé ✓`);
    });

    return new Response("sent", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[send-push] ✗ exception:", String(e));
    return new Response(String(e), { status: 500, headers: corsHeaders });
  }
});
