import { createClient } from "npm:@supabase/supabase-js@2";

// Appelée toutes les 15 min par pg_cron. Repère les entraînements de groupe
// pour lesquels la fenêtre de notation RPE vient de s'ouvrir (même règle que
// RpeGate côté client : dès l'heure de début si elle est connue, sinon dès le
// lendemain) et notifie le coach une seule fois par entraînement, pour qu'il
// puisse vérifier que la notation est bien accessible aux joueurs.
Deno.serve(async (_req) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: coachSetting } = await supabase
      .from("app_settings").select("value").eq("key", "coach_user_id").maybeSingle();
    const coachId = coachSetting?.value;
    if (!coachId) return new Response("no coach", { status: 200 });

    const now = new Date();
    const from2 = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const { data: evs, error } = await supabase
      .from("groupe_evenements")
      .select("id, groupe_id, titre, date, heure")
      .eq("type", "entrainement")
      .eq("rpe_ouverture_notifiee", false)
      .gte("date", from2)
      .lte("date", today);
    if (error) {
      console.error("[rpe-window-notify] lecture événements:", error);
      return new Response("db error", { status: 500 });
    }
    if (!evs?.length) return new Response("rien à notifier", { status: 200 });

    const ouverte = evs.filter((ev: any) => {
      if (ev.date < today) return true; // jour passé : forcément ouverte
      if (!ev.heure) return false;      // aujourd'hui sans horaire : ouvre demain
      const [h, m] = ev.heure.split(":").map(Number);
      const debut = new Date(`${ev.date}T00:00:00`);
      debut.setHours(h, m || 0, 0, 0);
      return now.getTime() >= debut.getTime();
    });
    if (!ouverte.length) return new Response("aucune fenêtre ouverte", { status: 200 });

    const groupeIds = [...new Set(ouverte.map((e: any) => e.groupe_id))];
    const { data: groupes } = await supabase
      .from("groupes").select("id, nom").in("id", groupeIds);
    const groupeNom: Record<string, string> = {};
    (groupes || []).forEach((g: any) => { groupeNom[g.id] = g.nom; });

    for (const ev of ouverte) {
      const dateLabel = new Date(`${ev.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
      const nom = groupeNom[ev.groupe_id] || "Groupe";
      const titre = `Notation RPE ouverte — ${nom}`;
      const corps = `${ev.titre || "Entraînement"} du ${dateLabel} : les joueurs peuvent noter.`;
      const lien = `/groupe/${ev.groupe_id}`;

      const { error: insErr } = await supabase.from("notifications").insert([
        { destinataire_id: coachId, titre, corps, type: "rpe_ouverture", lien },
      ]);
      if (insErr) { console.error("[rpe-window-notify] insert notif:", insErr); continue; }

      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ record: { destinataire_id: coachId, titre, corps, lien } }),
        });
      } catch (e) {
        console.warn("[rpe-window-notify] push échoué:", String(e));
      }

      await supabase.from("groupe_evenements").update({ rpe_ouverture_notifiee: true }).eq("id", ev.id);
    }

    return new Response(`notifié pour ${ouverte.length} entraînement(s)`, { status: 200 });
  } catch (e) {
    console.error("[rpe-window-notify] exception:", String(e));
    return new Response(String(e), { status: 500 });
  }
});
