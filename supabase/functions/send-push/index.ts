import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
webpush.setVapidDetails("mailto:wehrey.arthur@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const record = body.record;
    if (!record) return new Response("no record", { status: 200 });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", record.destinataire_id);

    if (!subs?.length) return new Response("no subscription", { status: 200 });

    const payload = JSON.stringify({
      titre: record.titre,
      corps: record.corps || "",
      lien: record.lien || "/",
    });

    await Promise.allSettled(
      subs.map(({ subscription }) => webpush.sendNotification(subscription, payload))
    );

    return new Response("sent", { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
