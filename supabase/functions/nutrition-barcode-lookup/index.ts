import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Parse "150 g" → 150 */
function parseServing(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function normalizeFood(p: Record<string, unknown>, barcode: string) {
  const n = (p.nutriments ?? {}) as Record<string, number>;
  return {
    name:       (p.product_name as string) || (p.product_name_fr as string) || "Produit inconnu",
    brand:      (p.brands as string)?.split(",")[0]?.trim() || null,
    barcode,
    kcal_100:   n["energy-kcal_100g"]  ?? n["energy-kcal"]      ?? null,
    prot_100:   n["proteins_100g"]     ?? null,
    carbs_100:  n["carbohydrates_100g"]?? null,
    sugar_100:  n["sugars_100g"]       ?? null,
    fat_100:    n["fat_100g"]          ?? null,
    satfat_100: n["saturated-fat_100g"]?? null,
    fibre_100:  n["fiber_100g"]        ?? null,
    salt_100:   n["salt_100g"]         ?? null,
    nutri_score:(p.nutriscore_grade as string) ?? null,
    nova_group: p.nova_group ? parseInt(String(p.nova_group)) : null,
    eco_score:  (p.ecoscore_grade as string) ?? null,
    serving_g:  parseServing(p.serving_size as string),
    image_url:  (p.image_url as string) || (p.image_front_url as string) || null,
    source:     "openfoodfacts",
    source_id:  barcode,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { barcode } = await req.json();
    if (!barcode) {
      return new Response(
        JSON.stringify({ found: false, message: "barcode manquant" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check cache in nutrition_foods
    const { data: cached } = await supabase
      .from("nutrition_foods")
      .select("*")
      .eq("barcode", barcode)
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({ found: true, food: cached }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Open Food Facts
    const offUrl =
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json` +
      `?fields=product_name,product_name_fr,brands,nutriments,nutriscore_grade,nova_group,ecoscore_grade,serving_size,image_url,image_front_url,code`;
    const offRes = await fetch(offUrl, {
      headers: { "User-Agent": "AWprepa/1.0 (arthur.whry@gmail.com)" },
    });

    if (!offRes.ok) {
      return new Response(
        JSON.stringify({ found: false, message: "Erreur Open Food Facts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const offData = await offRes.json();
    if (offData.status !== 1 || !offData.product) {
      return new Response(
        JSON.stringify({ found: false, message: "Produit introuvable dans Open Food Facts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Normalize + insert in cache
    const food = normalizeFood(offData.product as Record<string, unknown>, barcode);
    const { data: inserted, error: insertErr } = await supabase
      .from("nutrition_foods")
      .insert(food)
      .select()
      .single();

    if (insertErr) {
      // Race condition ou colonne manquante — essaie le cache, sinon retourne quand même le produit
      const { data: retry } = await supabase
        .from("nutrition_foods")
        .select("*")
        .eq("barcode", barcode)
        .maybeSingle();
      // On retourne les données même non-cachées — ne jamais bloquer sur une erreur d'insert
      return new Response(
        JSON.stringify({ found: true, food: retry || food }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ found: true, food: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[barcode-lookup]", e);
    return new Response(
      JSON.stringify({ found: false, message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
