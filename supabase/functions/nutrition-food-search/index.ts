// ── Recherche de produits de marque (Open Food Facts) ────────────────────────
// CIQUAL couvre les aliments génériques mais ignore les produits de marque et
// les variantes précises (skyr, whey, chocolat noir 90 %…). Open Food Facts les
// a, mais son API ne renvoie aucun en-tête CORS : impossible de l'appeler depuis
// le navigateur. D'où ce relais.
//
// Comme pour CIQUAL, aucune valeur n'est inventée : on renvoie ce que la fiche
// produit déclare, et les produits sans énergie sont écartés.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "AWprepa/1.0 (application de coaching sportif)";

type Produit = {
  code: string; nom: string; marque: string | null;
  kcal: number; proteines: number | null; glucides: number | null; lipides: number | null;
};

function normaliser(p: Record<string, unknown>): Produit | null {
  const n = (p.nutriments ?? {}) as Record<string, number>;
  const kcal = Number(n["energy-kcal_100g"]);
  const nom = String(p.product_name ?? "").trim();
  if (!nom || !Number.isFinite(kcal) || kcal <= 0) return null;   // fiche inexploitable
  const num = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
  };
  return {
    code: String(p.code ?? ""),
    nom,
    marque: String(p.brands ?? "").split(",")[0].trim() || null,
    kcal: Math.round(kcal * 10) / 10,
    proteines: num(n["proteins_100g"]),
    glucides:  num(n["carbohydrates_100g"]),
    lipides:   num(n["fat_100g"]),
  };
}

async function chercher(terme: string, franceUniquement: boolean): Promise<Produit[]> {
  const u = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  u.searchParams.set("search_terms", terme);
  u.searchParams.set("search_simple", "1");
  u.searchParams.set("action", "process");
  u.searchParams.set("json", "1");
  u.searchParams.set("page_size", "40");
  u.searchParams.set("fields", "product_name,brands,nutriments,code");
  if (franceUniquement) {
    u.searchParams.set("tagtype_0", "countries");
    u.searchParams.set("tag_contains_0", "contains");
    u.searchParams.set("tag_0", "france");
  }
  const res = await fetch(u.toString(), { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.products ?? []) as Record<string, unknown>[])
    .map(normaliser).filter((p): p is Produit => p !== null);
}

// Les résultats d'Open Food Facts sont bruités : on remonte ceux dont le nom
// contient réellement les mots cherchés.
function classer(produits: Produit[], terme: string): Produit[] {
  const mots = terme.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/\s+/).filter(m => m.length > 1);
  const score = (p: Produit) => {
    const nom = (p.nom + " " + (p.marque ?? "")).toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "");
    return mots.filter(m => nom.includes(m)).length;
  };
  const vus = new Set<string>();
  return produits
    .map(p => ({ p, s: score(p) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.nom.length - b.p.nom.length)
    .map(x => x.p)
    .filter(p => {                                   // dédoublonnage nom+marque
      const cle = (p.nom + "|" + (p.marque ?? "")).toLowerCase();
      if (vus.has(cle)) return false;
      vus.add(cle); return true;
    })
    .slice(0, 15);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { terme } = await req.json();
    if (!terme || String(terme).trim().length < 2) return json({ produits: [] });
    const t = String(terme).trim();

    // D'abord les produits vendus en France (bien plus pertinents ici), puis
    // élargissement si la moisson est trop maigre.
    let produits = classer(await chercher(t, true), t);
    if (produits.length < 5) {
      const elargi = classer(await chercher(t, false), t);
      const vus = new Set(produits.map(p => p.code));
      produits = [...produits, ...elargi.filter(p => !vus.has(p.code))].slice(0, 15);
    }
    return json({ produits });
  } catch (err: unknown) {
    return json({ produits: [], erreur: err instanceof Error ? err.message : String(err) }, 200);
  }
});
