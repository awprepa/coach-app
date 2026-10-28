/**
 * usePageFade — retourne un objet `style` à appliquer sur le wrapper principal de page.
 * Désormais vide : les pages s'affichent sans fondu (voir ci-dessous).
 *
 * Usage :
 *   const fadeStyle = usePageFade()
 *   return <div style={{ ...S.page, ...fadeStyle }}>…</div>
 */
export default function usePageFade() {
  // Plus de fondu à l'arrivée sur une page : la page partait d'un écran vide à
  // chaque changement d'onglet (effet de flash). Elle s'affiche maintenant tout de suite.
  return {}
}
