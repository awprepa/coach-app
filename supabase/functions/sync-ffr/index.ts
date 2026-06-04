/**
 * sync-ffr — synchronise matchs et classements depuis monclubhouse.ffr.fr
 *
 * La structure réelle du site (Next.js App Router / RSC) :
 *   Calendrier : clé "calendarResultsData" → objet par journée { "1": { listTitle, listData:[...] } }
 *   Classement : clé "rankingData"         → tableau [{ position, classementId, competitionEquipeId }]
 *
 * POST body (optionnel) : { groupe_id: "uuid" }  → sync un seul groupe
 * Sans body              → sync tous les groupes avec monclubhouse_url
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Extraction depuis le HTML RSC ───────────────────────────────────────────────

/**
 * Extrait un objet JSON commençant par { ou [ depuis une position dans le HTML.
 * Gère les caractères échappés JavaScript (backslash + char suivant).
 */
function extractBracketed(html: string, startIdx: number): string | null {
  const opener = html[startIdx];
  const closer = opener === "{" ? "}" : opener === "[" ? "]" : null;
  if (!closer) return null;

  let depth = 0;
  let i = startIdx;
  while (i < html.length) {
    if (html[i] === "\\") { i += 2; continue; } // skip escaped char
    if (html[i] === opener) depth++;
    else if (html[i] === closer) {
      depth--;
      if (depth === 0) return html.slice(startIdx, i + 1);
    }
    i++;
  }
  return null;
}

/**
 * Trouve une clé dans le HTML RSC et extrait la valeur JSON qui suit.
 * Le HTML contient des guillemets échappés (\") autour des clés.
 */
function extractKeyValue(html: string, key: string): any | null {
  const marker = `${key}\\":`;
  const idx = html.indexOf(marker);
  if (idx < 0) return null;

  const valueStart = idx + marker.length;
  // Skip whitespace
  let vi = valueStart;
  while (vi < html.length && html[vi] === " ") vi++;

  const raw = extractBracketed(html, vi);
  if (!raw) return null;

  // Unescape: \" → "  et \/ → /
  const unescaped = raw
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, "")
    .replace(/\\t/g, " ");

  try {
    return JSON.parse(unescaped);
  } catch {
    return null;
  }
}

// ── Parsers spécifiques ─────────────────────────────────────────────────────────

interface MatchRow {
  groupe_id: string;
  journee: string;
  date_match: string | null;
  heure: string | null;
  equipe_dom: string;
  equipe_ext: string;
  score_dom: number | null;
  score_ext: number | null;
  est_domicile: boolean | null;
  synced_at: string;
}

interface StandingRow {
  groupe_id: string;
  position: number;
  equipe: string;
  pts: number;
  joues: number;
  diff: number;
  gagnes: number;
  nuls: number;
  perdus: number;
  bonus_off: number;
  bonus_def: number;
  synced_at: string;
}

/** Détermine si notre club est l'équipe locale (domicile) en comparant le slug */
function isOurTeamLocal(localNom: string, clubSlug: string): boolean {
  const parts = clubSlug.toLowerCase().split("-").filter(p => p.length > 3);
  const nom = localNom.toLowerCase();
  return parts.length > 0 && parts.every(p => nom.includes(p));
}

function parseCalendar(data: Record<string, any>, groupeId: string, clubSlug: string): MatchRow[] {
  const rows: MatchRow[] = [];
  const now = new Date().toISOString();

  for (const [, journee] of Object.entries(data)) {
    const j = journee as any;
    const titre = String(j.listTitle || "").replace("J ", "");

    for (const match of (j.listData || [])) {
      const local = match.competitionEquipeLocaleId || {};
      const visiteur = match.competitionEquipeVisiteuseId || {};
      const scoreLocal = match.rencontreResultatLocaleId?.pointsDeMarque ?? null;
      const scoreVisit = match.rencontreResultatVisiteuseId?.pointsDeMarque ?? null;

      const localNom: string = local.nomEdito || local.nom || "";
      const visiteurNom: string = visiteur.nomEdito || visiteur.nom || "";

      const est_domicile = isOurTeamLocal(localNom, clubSlug) ? true
        : isOurTeamLocal(visiteurNom, clubSlug) ? false
        : null;

      // dateEffective: "2025-09-14T15:30:00.000Z"
      const dateEffective: string = match.dateEffective || "";
      const date_match = dateEffective ? dateEffective.slice(0, 10) : null;
      const heure = dateEffective ? dateEffective.slice(11, 16) : null;

      rows.push({
        groupe_id: groupeId,
        journee: titre,
        date_match,
        heure,
        equipe_dom: localNom,
        equipe_ext: visiteurNom,
        score_dom: scoreLocal !== undefined ? scoreLocal : null,
        score_ext: scoreVisit !== undefined ? scoreVisit : null,
        est_domicile,
        synced_at: now,
      });
    }
  }

  return rows;
}

function parseStandings(data: any[], groupeId: string): StandingRow[] {
  const now = new Date().toISOString();
  return data
    .map((entry: any) => {
      const cls = entry.classementId || {};
      const equipeObj = entry.competitionEquipeId || {};
      const equipe: string = equipeObj.nomEdito || equipeObj.nom || "";
      if (!equipe) return null;
      return {
        groupe_id: groupeId,
        position: Number(entry.position) || 0,
        equipe,
        pts: Number(cls.pointTerrain) || 0,
        joues: Number(cls.joues) || 0,
        diff: Number(cls.goalAverage) || 0,
        gagnes: Number(cls.gagnes) || 0,
        nuls: Number(cls.nuls) || 0,
        perdus: Number(cls.perdus) || 0,
        bonus_off: Number(cls.bonusOffensif) || 0,
        bonus_def: Number(cls.bonusDefensif) || 0,
        synced_at: now,
      } as StandingRow;
    })
    .filter((r): r is StandingRow => r !== null);
}

// ── Sync d'un groupe ─────────────────────────────────────────────────────────────

async function syncGroupe(groupeId: string, url: string) {
  const baseUrl = url.replace(/\/$/, "");
  const clubSlugMatch = url.match(/\/clubs\/([^/]+)\//);
  const clubSlug = clubSlugMatch?.[1] || "";

  const logs: string[] = [`club: ${clubSlug}`];
  const errors: string[] = [];
  let matchCount = 0, standingsCount = 0;

  const headers = { "User-Agent": "Mozilla/5.0 (compatible; AWprepa/1.0)" };

  // ── Calendrier ────────────────────────────────────────────────────────────────
  try {
    const html = await (await fetch(`${baseUrl}/calendrier-resultats`, { headers })).text();
    const calData = extractKeyValue(html, "calendarResultsData");

    if (!calData) {
      errors.push("calendarResultsData introuvable dans le HTML");
    } else {
      const rows = parseCalendar(calData, groupeId, clubSlug);
      logs.push(`${rows.length} matchs parsés`);

      if (rows.length > 0) {
        // Supprimer les anciens et réinsérer
        await supabase.from("matchs_ffr").delete().eq("groupe_id", groupeId);
        const { error } = await supabase.from("matchs_ffr").insert(rows);
        if (error) errors.push(`Insert matchs: ${error.message}`);
        else matchCount = rows.length;
      }
    }
  } catch (e) {
    errors.push(`Erreur calendrier: ${String(e)}`);
  }

  // ── Classement ────────────────────────────────────────────────────────────────
  try {
    const html = await (await fetch(`${baseUrl}/classements`, { headers })).text();
    const rankData = extractKeyValue(html, "rankingData");

    if (!rankData || !Array.isArray(rankData)) {
      errors.push("rankingData introuvable ou non-array");
    } else {
      const rows = parseStandings(rankData, groupeId);
      logs.push(`${rows.length} équipes parsées`);

      if (rows.length > 0) {
        await supabase.from("classements_ffr").delete().eq("groupe_id", groupeId);
        const { error } = await supabase.from("classements_ffr").insert(rows);
        if (error) errors.push(`Insert classement: ${error.message}`);
        else standingsCount = rows.length;
      }
    }
  } catch (e) {
    errors.push(`Erreur classement: ${String(e)}`);
  }

  return { groupeId, matchCount, standingsCount, errors, logs };
}

// ── Handler ───────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const targetId: string | null = body?.groupe_id || null;

    let q = supabase
      .from("groupes")
      .select("id, monclubhouse_url")
      .not("monclubhouse_url", "is", null)
      .neq("monclubhouse_url", "");
    if (targetId) q = q.eq("id", targetId);

    const { data: groupes, error } = await q;
    if (error) throw error;

    const results = [];
    for (const g of groupes || []) {
      results.push(await syncGroupe(g.id, g.monclubhouse_url));
    }

    return new Response(JSON.stringify({ ok: true, synced: results.length, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
