import { createClient } from "npm:@supabase/supabase-js@2";

// ── Calendrier ICS dynamique ──────────────────────────────────────────────────
// GET /calendar-ics?client_id=<uuid>
// Retourne un fichier .ics avec tous les événements du client.
// Utilisé comme lien d'abonnement webcal — Apple/Google Calendar poll cette URL
// et synchronise automatiquement (ajouts ET suppressions).
// Sécurité : le client_id est un UUID v4 (non-devinable).

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pad(n: number) { return String(n).padStart(2, "0"); }

function formatICSDate(dateStr: string): string {
  // dateStr = "YYYY-MM-DD" → "YYYYMMDD"
  return dateStr.replace(/-/g, "");
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function escapeICS(str: string): string {
  return (str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function generateICS(events: any[], clientPrenom: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AWprepa//AWprepa//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:AWprepa — ${escapeICS(clientPrenom)}`,
    "X-WR-CALDESC:Calendrier d'entraînement AWprepa",
    "X-PUBLISHED-TTL:PT6H",   // Apple Calendar re-poll toutes les 6h
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
  ];

  for (const ev of events) {
    const evLines = [
      "BEGIN:VEVENT",
      `UID:awprepa-${ev.id}@awprepa.com`,
      `DTSTART;VALUE=DATE:${formatICSDate(ev.date)}`,
      `DTEND;VALUE=DATE:${nextDay(ev.date)}`,
      `SUMMARY:${escapeICS(ev.titre)}`,
      `CATEGORIES:${escapeICS(ev.type || "seance")}`,
    ];
    if (ev.description) evLines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
    evLines.push("END:VEVENT");
    lines.push(...evLines);
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey" },
    });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id");

  if (!clientId) {
    return new Response("Paramètre client_id manquant", { status: 400 });
  }

  // Utilise la service role key pour accéder aux données sans auth utilisateur
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Vérifier que le client existe et récupérer son prénom
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, prenom, nom")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError || !client) {
    return new Response("Client introuvable", { status: 404 });
  }

  // Récupérer tous ses événements
  const { data: events, error: evError } = await supabase
    .from("evenements")
    .select("id, titre, date, type, description")
    .eq("client_id", clientId)
    .order("date", { ascending: true });

  if (evError) {
    return new Response("Erreur serveur", { status: 500 });
  }

  const ics = generateICS(events || [], client.prenom || "");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="awprepa-${client.prenom?.toLowerCase() || "calendrier"}.ics"`,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
