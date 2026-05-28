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

    // ── 1. Rappel wellness ─────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    // Trouver quels clients ont déjà soumis leur wellness aujourd'hui
    const userIds = subs.map((s: any) => s.user_id);
    const { data: clients } = await supabase
      .from("clients").select("id, user_id").in("user_id", userIds);

    const clientMap: Record<string, string> = {}; // user_id → client_id
    (clients || []).forEach((c: any) => { clientMap[c.user_id] = c.id; });

    const clientIds = Object.values(clientMap);
    const { data: wellnessDone } = clientIds.length
      ? await supabase.from("wellness").select("client_id").in("client_id", clientIds).eq("date", today)
      : { data: [] };
    const wellnessDoneSet = new Set((wellnessDone || []).map((w: any) => w.client_id));

    const wellnessPayload = JSON.stringify({
      titre: "Comment tu vas ce matin ?",
      corps: "Renseigne ton wellness maintenant.",
      lien: "/client/accueil",
    });

    const wellnessResults = await Promise.allSettled(
      subs
        .filter((s: any) => {
          const cid = clientMap[s.user_id];
          return !cid || !wellnessDoneSet.has(cid); // envoyer si pas encore soumis
        })
        .map(({ subscription }: any) => webpush.sendNotification(subscription, wellnessPayload))
    );

    wellnessResults.forEach((r, i) => {
      if (r.status === "rejected") console.error(`[wellness-reminder] wellness push #${i} échoué:`, r.reason);
      else console.error(`[wellness-reminder] wellness push #${i} envoyé ✓`);
    });

    // ── 2. Rappel nutrition (uniquement clients avec objectifs mais sans repas aujourd'hui) ──
    if (clientIds.length) {
      // Clients ayant des objectifs actifs
      const { data: goalsData } = await supabase
        .from("nutrition_goals").select("client_id")
        .in("client_id", clientIds)
        .or(`active_to.is.null,active_to.gte.${today}`);
      const clientsWithGoals = new Set((goalsData || []).map((g: any) => g.client_id));

      // Clients ayant déjà loggé un repas aujourd'hui
      const { data: mealsData } = await supabase
        .from("nutrition_meals").select("client_id")
        .in("client_id", [...clientsWithGoals])
        .eq("date", today);
      const clientsWithMeals = new Set((mealsData || []).map((m: any) => m.client_id));

      const nutritionPayload = JSON.stringify({
        titre: "🥗 N'oublie pas ton suivi nutrition",
        corps: "Log ton premier repas de la journée.",
        lien: "/client/nutrition",
      });

      // Construire user_id → client_id inverse
      const clientToUser: Record<string, string> = {};
      (clients || []).forEach((c: any) => { clientToUser[c.id] = c.user_id; });

      const nutritionTargets = subs.filter((s: any) => {
        const cid = clientMap[s.user_id];
        return cid && clientsWithGoals.has(cid) && !clientsWithMeals.has(cid);
      });

      if (nutritionTargets.length) {
        const nutritionResults = await Promise.allSettled(
          nutritionTargets.map(({ subscription }: any) => webpush.sendNotification(subscription, nutritionPayload))
        );
        nutritionResults.forEach((r, i) => {
          if (r.status === "rejected") console.error(`[wellness-reminder] nutrition push #${i} échoué:`, r.reason);
          else console.error(`[wellness-reminder] nutrition push #${i} envoyé ✓`);
        });
        console.error(`[wellness-reminder] rappel nutrition envoyé à ${nutritionTargets.length} client(s)`);
      }
    }

    // ── 3. Rappel événements du jour (séances, matchs, etc.) ────────────────
    if (clientIds.length) {
      // Récupérer tous les événements non terminés d'aujourd'hui pour chaque client
      const { data: eventsData } = await supabase
        .from("evenements")
        .select("client_id, titre, type, seance_id, seances(nom)")
        .in("client_id", clientIds)
        .eq("date", today)
        .or("terminee.is.null,terminee.eq.false");

      // Grouper par client
      const eventsByClient: Record<string, any[]> = {};
      (eventsData || []).forEach((ev: any) => {
        if (!eventsByClient[ev.client_id]) eventsByClient[ev.client_id] = [];
        eventsByClient[ev.client_id].push(ev);
      });

      const clientToUser: Record<string, string> = {};
      (clients || []).forEach((c: any) => { clientToUser[c.id] = c.user_id; });

      const eventTargets = subs.filter((s: any) => {
        const cid = clientMap[s.user_id];
        return cid && eventsByClient[cid]?.length > 0;
      });

      if (eventTargets.length) {
        const eventResults = await Promise.allSettled(
          eventTargets.map((s: any) => {
            const cid = clientMap[s.user_id];
            const evs = eventsByClient[cid] || [];
            const count = evs.length;
            // Construire un message résumant les événements
            const labels = evs.map((ev: any) => {
              if (ev.seances?.nom) return ev.seances.nom;
              if (ev.titre) return ev.titre;
              return ev.type === "match" ? "Match" : "Séance";
            });
            const corps = count === 1
              ? `Tu as "${labels[0]}" aujourd'hui. C'est le moment de te préparer !`
              : `Tu as ${count} événements aujourd'hui : ${labels.slice(0, 2).join(", ")}${count > 2 ? "…" : ""}.`;
            const payload = JSON.stringify({
              titre: "📅 Programme du jour",
              corps,
              lien: "/client/mon-programme",
            });
            return webpush.sendNotification(s.subscription, payload);
          })
        );
        eventResults.forEach((r, i) => {
          if (r.status === "rejected") console.error(`[wellness-reminder] event push #${i} échoué:`, r.reason);
          else console.error(`[wellness-reminder] event push #${i} envoyé ✓`);
        });
        console.error(`[wellness-reminder] rappel événements envoyé à ${eventTargets.length} client(s)`);
      }
    }

    return new Response(`envoyé à ${subs.length} client(s)`, { status: 200 });
  } catch (e) {
    console.error("[wellness-reminder] exception:", String(e));
    return new Response(String(e), { status: 500 });
  }
});
