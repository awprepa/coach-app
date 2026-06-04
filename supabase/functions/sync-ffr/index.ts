/**
 * sync-ffr — synchronise les matchs et classements depuis monclubhouse.ffr.fr
 *
 * POST body (optionnel) : { groupe_id: "uuid" }  → sync un seul groupe
 * Sans body              → sync tous les groupes avec un monclubhouse_url
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

// ── Helpers HTML/JSON ──────────────────────────────────────────────────────────

function extractNextData(html: string): any | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** Cherche récursivement la première valeur vérifiant pred (max profondeur 10) */
function deepFind(obj: any, pred: (v: any) => boolean, depth = 0): any {
  if (depth > 10 || obj === null || obj === undefined) return null;
  if (pred(obj)) return obj;
  if (typeof obj !== "object") return null;
  const entries = Array.isArray(obj) ? obj.entries() : Object.entries(obj);
  for (const [, v] of entries) {
    const found = deepFind(v, pred, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

/** Détecte un objet "match-like" */
function isMatchLike(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const keys = Object.keys(o).map(k => k.toLowerCase());
  const hasTeam = keys.some(k =>
    ["club", "team", "equipe", "domicile", "exterieur", "home", "away", "recevant", "visiteur"].some(t => k.includes(t))
  );
  const hasDate = keys.some(k =>
    ["date", "jour", "day", "schedule"].some(t => k.includes(t))
  );
  return hasTeam && hasDate;
}

/** Détecte un objet "standings-like" */
function isStandingsLike(o: any): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const keys = Object.keys(o).map(k => k.toLowerCase());
  const hasPos = keys.some(k => ["position", "rank", "classement", "place", "rang"].some(t => k.includes(t)));
  const hasPts = keys.some(k => ["point", "pts", "score"].some(t => k.includes(t)));
  const hasTeam = keys.some(k => ["club", "team", "equipe", "nom", "name"].some(t => k.includes(t)));
  return hasPos && hasPts && hasTeam;
}

function findMatchArray(data: any): any[] {
  const arr = deepFind(data, v => Array.isArray(v) && v.length > 0 && isMatchLike(v[0]));
  return arr || [];
}

function findStandingsArray(data: any): any[] {
  const arr = deepFind(data, v => Array.isArray(v) && v.length > 0 && isStandingsLike(v[0]));
  return arr || [];
}

/** Résumé des clés (pour debug si aucune donnée trouvée) */
function summarizeKeys(obj: any, depth = 0, maxDepth = 3): string {
  if (depth > maxDepth || !obj || typeof obj !== "object") return typeof obj;
  if (Array.isArray(obj)) return `Array(${obj.length})[${summarizeKeys(obj[0], depth + 1, maxDepth)}]`;
  return "{" + Object.keys(obj).map(k => `${k}:${summarizeKeys(obj[k], depth + 1, maxDepth)}`).join(", ") + "}";
}

// ── Parsers ────────────────────────────────────────────────────────────────────

/** "14/09/2025" ou "2025-09-14" → "2025-09-14" */
function parseDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const fr = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  const iso = s.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v));
  return isNaN(n) ? null : n;
}

function getStr(obj: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function getNestedStr(obj: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (!v) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "object") {
      const name = v.nom || v.name || v.libelle || v.label || v.titre || v.short_name || "";
      if (name) return String(name).trim();
    }
  }
  return "";
}

interface MatchParsed {
  journee: string;
  date_match: string | null;
  heure: string | null;
  equipe_dom: string;
  equipe_ext: string;
  score_dom: number | null;
  score_ext: number | null;
  est_domicile: boolean | null;
}

function parseMatch(m: any, clubSlug: string): MatchParsed | null {
  // Extraire équipe domicile
  const domObj =
    m.clubRecevant || m.clubDomicile || m.equipeDomicile || m.domicile ||
    m.homeTeam || m.homeClub || m.home || m.club1 || m.team1 || null;
  const extObj =
    m.clubVisiteur || m.clubExterieur || m.equipeExterieure || m.exterieur ||
    m.awayTeam || m.awayClub || m.away || m.club2 || m.team2 || null;

  const getDomName = () =>
    getNestedStr(m, "clubRecevant", "clubDomicile", "equipeDomicile") ||
    (domObj ? (typeof domObj === "string" ? domObj : getStr(domObj, "nom", "name", "libelle", "label", "shortName", "short_name")) : "");

  const getExtName = () =>
    getNestedStr(m, "clubVisiteur", "clubExterieur", "equipeExterieure") ||
    (extObj ? (typeof extObj === "string" ? extObj : getStr(extObj, "nom", "name", "libelle", "label", "shortName", "short_name")) : "");

  const equipe_dom = getDomName();
  const equipe_ext = getExtName();

  if (!equipe_dom && !equipe_ext) return null;

  // Détecter domicile/extérieur
  const clubParts = clubSlug.split("-").slice(0, 2); // e.g. ["lombez", "samatan"]
  const domSlug = (domObj as any)?.slug || (domObj as any)?.id || "";
  const extSlug = (extObj as any)?.slug || (extObj as any)?.id || "";

  let est_domicile: boolean | null = null;
  if (domSlug && clubParts.every(p => domSlug.toLowerCase().includes(p))) est_domicile = true;
  else if (extSlug && clubParts.every(p => extSlug.toLowerCase().includes(p))) est_domicile = false;
  else if (equipe_dom && clubParts.every(p => equipe_dom.toLowerCase().includes(p))) est_domicile = true;
  else if (equipe_ext && clubParts.every(p => equipe_ext.toLowerCase().includes(p))) est_domicile = false;

  const dateRaw =
    m.date || m.dateMatch || m.matchDate || m.dateRencontre || m.schedule?.date || m.jour || "";
  const heureRaw =
    m.heure || m.time || m.heureDebut || m.kickoff || m.schedule?.time || null;

  const journeeRaw = m.journee || m.journeeNum || m.round || m.matchday || m.poule || m.numero || "";

  return {
    journee: String(journeeRaw || ""),
    date_match: parseDate(String(dateRaw)),
    heure: heureRaw ? String(heureRaw).slice(0, 5) : null,
    equipe_dom,
    equipe_ext,
    score_dom: parseNum(m.scoreDomicile ?? m.scoreRecevant ?? m.scoreHome ?? m.score1 ?? m.home_score ?? null),
    score_ext: parseNum(m.scoreExterieur ?? m.scoreVisiteur ?? m.scoreAway ?? m.score2 ?? m.away_score ?? null),
    est_domicile,
  };
}

interface StandingsParsed {
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
}

function parseStanding(s: any): StandingsParsed | null {
  const teamObj = s.club || s.equipe || s.team || null;
  const equipe = teamObj
    ? (typeof teamObj === "string" ? teamObj : getStr(teamObj, "nom", "name", "libelle", "label", "shortName"))
    : getStr(s, "nom", "name", "libelle", "label", "equipe");

  if (!equipe) return null;

  return {
    position: parseNum(s.position || s.rank || s.rang || s.classement || s.place) ?? 0,
    equipe,
    pts: parseNum(s.points || s.pts || s.totalPoints || s.pointsTotal) ?? 0,
    joues: parseNum(s.joues || s.played || s.matchsJoues || s.matchesPlayed || s.nbMatchs) ?? 0,
    diff: parseNum(s.diff || s.difference || s.pointsDiff || s.differenceDePoints || s.pointsDifference) ?? 0,
    gagnes: parseNum(s.gagnes || s.won || s.victoires || s.nbVictoires) ?? 0,
    nuls: parseNum(s.nuls || s.drawn || s.nulls || s.nbNuls) ?? 0,
    perdus: parseNum(s.perdus || s.lost || s.defaites || s.nbDefaites) ?? 0,
    bonus_off: parseNum(s.bonusOffensif || s.bonusOff || s.bo || s.bonusAttaque || s.bonusEssai) ?? 0,
    bonus_def: parseNum(s.bonusDefensif || s.bonusDef || s.bd || s.bonusDefense) ?? 0,
  };
}

// ── Sync d'un groupe ───────────────────────────────────────────────────────────

async function syncGroupe(groupeId: string, url: string) {
  const baseUrl = url.replace(/\/$/, "");
  const clubSlugMatch = url.match(/\/clubs\/([^/]+)\//);
  const clubSlug = clubSlugMatch?.[1] || "";

  const logs: string[] = [`Sync groupe ${groupeId}, club: ${clubSlug}`];
  let matchCount = 0, standingsCount = 0;
  const errors: string[] = [];

  // ── Calendrier ────────────────────────────────────────────────────────────
  try {
    const calRes = await fetch(`${baseUrl}/calendrier-resultats`, {
      headers: { "User-Agent": "Mozilla/5.0 AWprepa/1.0" },
    });
    const calHtml = await calRes.text();
    const calData = extractNextData(calHtml);

    if (!calData) {
      errors.push("Impossible d'extraire __NEXT_DATA__ du calendrier");
    } else {
      const matchArr = findMatchArray(calData);
      if (matchArr.length === 0) {
        errors.push(`Aucun tableau de matchs trouvé. Structure pageProps: ${summarizeKeys(calData?.props?.pageProps, 0, 2)}`);
      } else {
        logs.push(`Trouvé ${matchArr.length} matchs`);
        const rows = matchArr
          .map(m => parseMatch(m, clubSlug))
          .filter((m): m is MatchParsed => m !== null && (m.equipe_dom !== "" || m.equipe_ext !== ""))
          .map(m => ({ ...m, groupe_id: groupeId, synced_at: new Date().toISOString() }));

        if (rows.length > 0) {
          // Supprimer les anciens matchs puis réinsérer (upsert sur la contrainte unique)
          const { error } = await supabase
            .from("matchs_ffr")
            .upsert(rows, { onConflict: "groupe_id,date_match,equipe_dom,equipe_ext" });
          if (error) errors.push(`Erreur insertion matchs: ${error.message}`);
          else matchCount = rows.length;
        }
      }
    }
  } catch (e) {
    errors.push(`Erreur fetch calendrier: ${String(e)}`);
  }

  // ── Classement ────────────────────────────────────────────────────────────
  try {
    const clsRes = await fetch(`${baseUrl}/classements`, {
      headers: { "User-Agent": "Mozilla/5.0 AWprepa/1.0" },
    });
    const clsHtml = await clsRes.text();
    const clsData = extractNextData(clsHtml);

    if (!clsData) {
      errors.push("Impossible d'extraire __NEXT_DATA__ du classement");
    } else {
      const standArr = findStandingsArray(clsData);
      if (standArr.length === 0) {
        errors.push(`Aucun tableau de classement trouvé. Structure pageProps: ${summarizeKeys(clsData?.props?.pageProps, 0, 2)}`);
      } else {
        logs.push(`Trouvé ${standArr.length} équipes au classement`);
        const rows = standArr
          .map(parseStanding)
          .filter((s): s is StandingsParsed => s !== null && s.equipe !== "")
          .map(s => ({ ...s, groupe_id: groupeId, synced_at: new Date().toISOString() }));

        if (rows.length > 0) {
          // Supprimer l'ancien classement du groupe puis réinsérer
          await supabase.from("classements_ffr").delete().eq("groupe_id", groupeId);
          const { error } = await supabase.from("classements_ffr").insert(rows);
          if (error) errors.push(`Erreur insertion classement: ${error.message}`);
          else standingsCount = rows.length;
        }
      }
    }
  } catch (e) {
    errors.push(`Erreur fetch classement: ${String(e)}`);
  }

  return { groupeId, matchCount, standingsCount, errors, logs };
}

// ── Handler principal ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const targetGroupeId: string | null = body?.groupe_id || null;

    const query = supabase
      .from("groupes")
      .select("id, monclubhouse_url")
      .not("monclubhouse_url", "is", null)
      .neq("monclubhouse_url", "");

    if (targetGroupeId) (query as any).eq("id", targetGroupeId);

    const { data: groupes, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    const results = [];
    for (const g of groupes || []) {
      const result = await syncGroupe(g.id, g.monclubhouse_url);
      results.push(result);
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
