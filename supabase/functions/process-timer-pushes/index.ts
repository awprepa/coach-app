// Edge Function déclenchée toutes les minutes par Supabase Cron
// Envoie les pushs de fin de récupération programmés par TimerContext

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
webpush.setVapidDetails("mailto:wehrey.arthur@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (_req) => {
  console.log("[process-timer-pushes] ► déclenchée");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Récupérer toutes les pushs dues (send_at dans le passé, pas encore envoyées)
  const { data: duePushes, error } = await supabase
    .from("timer_pushes")
    .select("*")
    .lte("send_at", new Date().toISOString())
    .is("sent_at", null);

  if (error) {
    console.error("[process-timer-pushes] Erreur lecture:", error);
    return new Response("db error", { status: 500 });
  }

  if (!duePushes?.length) {
    console.log("[process-timer-pushes] Aucune push due");
    return new Response("ok", { status: 200 });
  }

  console.log(`[process-timer-pushes] ${duePushes.length} push(es) à envoyer`);

  for (const push of duePushes) {
    // Marquer comme envoyé AVANT d'envoyer (évite les doublons si la fonction est appelée en parallèle)
    const { error: updateErr } = await supabase
      .from("timer_pushes")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", push.id)
      .is("sent_at", null); // clause de sécurité anti-doublon

    if (updateErr) {
      console.error("[process-timer-pushes] Erreur update:", updateErr);
      continue;
    }

    // Récupérer les subscriptions push de l'utilisateur
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", push.user_id);

    if (!subs?.length) {
      console.log(`[process-timer-pushes] Pas de subscription pour ${push.user_id}`);
      continue;
    }

    const payload = JSON.stringify({
      titre: push.titre,
      corps: push.corps,
      lien:  push.lien,
    });

    const results = await Promise.allSettled(
      subs.map(({ subscription }) => webpush.sendNotification(subscription, payload))
    );

    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`[process-timer-pushes] push #${i} échoué:`, r.reason);
      else console.log(`[process-timer-pushes] push #${i} envoyé ✓`);
    });
  }

  // Nettoyage : supprimer les lignes envoyées depuis plus de 24h
  await supabase.from("timer_pushes")
    .delete()
    .not("sent_at", "is", null)
    .lt("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return new Response("ok", { status: 200 });
});
