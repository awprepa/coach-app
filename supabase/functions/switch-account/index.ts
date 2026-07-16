// ── switch-account ───────────────────────────────────────────────────────────
// Bascule fiable entre les 2 comptes d'Arthur (coach ↔ client) sur son appareil.
// Principe : au lieu de stocker/rejouer des jetons (fragile — Supabase invalide un
// refresh token dès qu'il est réutilisé), on génère une session NEUVE à chaque
// bascule via l'API admin. Réservé STRICTEMENT aux 2 emails d'Arthur : la fonction
// vérifie que l'appelant est déjà connecté à l'un d'eux avant de délivrer l'autre.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allowlist en dur : seuls ces 2 comptes peuvent basculer l'un vers l'autre.
const ALLOWED = ["wehrey.arthur@gmail.com", "a.r.t.h.u.r@outlook.fr"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const url  = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1. Identifier l'appelant à partir de son JWT.
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user?.email) return json({ error: "unauthorized" }, 401);

  // 2. Réservé strictement aux 2 comptes d'Arthur.
  const email = user.email.toLowerCase();
  if (!ALLOWED.includes(email)) return json({ error: "forbidden" }, 403);

  const target = ALLOWED[0] === email ? ALLOWED[1] : ALLOWED[0];

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 3. Générer un lien magique pour le compte cible (n'envoie PAS d'email) →
    //    on en extrait le token hashé.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkErr || !tokenHash) throw linkErr || new Error("generateLink: pas de token");

    // 4. Échanger ce token contre une session NEUVE (client isolé, sans persistance).
    const verifier = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verifyData, error: verifyErr } = await verifier.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (verifyErr || !verifyData?.session) throw verifyErr || new Error("verifyOtp: pas de session");

    // On renvoie la session COMPLÈTE : le client l'écrit directement dans son
    // stockage (persistance garantie, sans dépendre du timing de setSession).
    const s = verifyData.session;
    return json({
      email: target,
      session: {
        access_token:  s.access_token,
        refresh_token: s.refresh_token,
        expires_at:    s.expires_at,
        expires_in:    s.expires_in,
        token_type:    s.token_type,
        user:          s.user,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
