const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Renvoie l'adresse IP publique de l'appelant, telle que vue par le proxy
// Supabase (x-forwarded-for). Utilisé pour horodater les signatures
// électroniques (conditions générales + contrats) sans dépendre d'un
// service tiers.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return new Response(JSON.stringify({ ip }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
