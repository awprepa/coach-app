import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  // Vérifier le JWT avec la clé anon
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  // Client admin (service role) pour les suppressions
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Trouver le client_id
    const { data: clientRow } = await admin
      .from("clients")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (clientRow) {
      // 2. Supprimer les photos du bucket (meal-photos)
      const { data: photos } = await admin
        .from("nutrition_meals")
        .select("photo_url")
        .eq("client_id", clientRow.id)
        .not("photo_url", "is", null);

      if (photos && photos.length > 0) {
        const paths = photos
          .map((p: { photo_url: string }) => {
            const parts = p.photo_url.split("/meal-photos/");
            return parts[1] || null;
          })
          .filter(Boolean) as string[];
        if (paths.length > 0) {
          await admin.storage.from("meal-photos").remove(paths);
        }
      }

      // 3. Supprimer la ligne client → cascade vers toutes les autres tables
      await admin.from("clients").delete().eq("id", clientRow.id);
    }

    // 4. Supprimer le compte auth
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
