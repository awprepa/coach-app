// La base renvoie au plus 1000 lignes par requête : au-delà, les lignes en trop
// sont ignorées sans erreur (ex. un joueur avec 1500 séries perdait ses plus
// anciennes, et donc ses records). On lit par paquets jusqu'au bout.
// `requete` : fonction qui construit la requête (avec un .order stable).
export async function toutesLesLignes(requete, taille = 1000) {
  const lignes = []
  for (let page = 0; page < 50; page++) {
    const { data, error } = await requete().range(page * taille, (page + 1) * taille - 1)
    if (error) return { data: lignes, error }
    // Hors ligne, le cache local ignore range() et renvoie tout d'un coup
    if (page === 0 && (data?.length || 0) > taille) return { data, error: null }
    lignes.push(...(data || []))
    if (!data || data.length < taille) break
  }
  return { data: lignes, error: null }
}
