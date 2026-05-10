import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
webpush.setVapidDetails("mailto:wehrey.arthur@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (_req) => {
  console.error("[wellness-reminder] ► déclenchée");
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Exclure le coach de l'envoi
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "coach_user_id")
      .maybeSingle();
    const coachId = setting?.value;

    // Récupérer toutes les subscriptions push des clients
    let query = supabase.from("push_subscriptions").select("user_id, subscription");
    if (coachId) query = query.neq("user_id", coachId);
    const { data: subs, error } = await query;

    if (error) {
      console.error("[wellness-reminder] Erreur lecture subscriptions:", error);
      return new Response("db error", { status: 500 });
    }

    console.error("[wellness-reminder] subscriptions trouvées:", subs?.length ?? 0);
    if (!subs?.length) return new Response("no subscriptions", { status: 200 });

    const payload = JSON.stringify({
      titre: "Comment tu vas ce matin ?",
      corps: "Renseigne ton wellness maintenant.",
      lien: "/client/accueil",
    });

    const results = await Promise.allSettled(
      subs.map(({ subscription }) => webpush.sendNotification(subscription, payload))
    );

    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`[wellness-reminder] push #${i} échoué:`, r.reason);
      else console.error(`[wellness-reminder] push #${i} envoyé ✓`);
    });

    return new Response(`envoyé à ${subs.length} client(s)`, { status: 200 });
  } catch (e) {
    console.error("[wellness-reminder] exception:", String(e));
    return new Response(String(e), { status: 500 });
  }
});
