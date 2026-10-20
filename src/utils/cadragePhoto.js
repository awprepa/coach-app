// Recadrage automatique des photos d'évolution : repère le corps (MediaPipe
// Pose, gratuit, calcul dans le navigateur, aucune photo envoyée ailleurs)
// pour afficher chaque photo à la même échelle et au même endroit.
//
// Référence d'échelle : la longueur du buste (milieu des épaules → milieu des
// hanches). Elle est visible sur presque toutes les photos, même quand les
// pieds ou le haut de la tête sont coupés.

// Chargée depuis le CDN au moment de l'utiliser (pas intégrée à l'app : son
// code déclenche un avertissement que la compilation Vercel traite en erreur).
const VERSION = '1.0.1'
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`
const WASM = `${CDN}/wasm`
const MODELE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task'

// Placement cible dans le cadre (fractions de sa hauteur / largeur)
export const CIBLE = { buste: 0.25, epaulesY: 0.3, centreX: 0.5 }
// Format du cadre de comparaison (largeur / hauteur)
export const FORMAT = 3 / 4

let detecteurP = null
function detecteur() {
  if (!detecteurP) {
    detecteurP = (async () => {
      const { FilesetResolver, PoseLandmarker } = await import(/* webpackIgnore: true */ `${CDN}/vision_bundle.mjs`)
      const fichiers = await FilesetResolver.forVisionTasks(WASM)
      return PoseLandmarker.createFromOptions(fichiers, {
        baseOptions: { modelAssetPath: MODELE },
        runningMode: 'IMAGE',
        numPoses: 1,
      })
    })().catch(e => { detecteurP = null; throw e })
  }
  return detecteurP
}

// Renvoie { cx, ey, buste } en fractions de l'image (centre du corps en x,
// hauteur des épaules, longueur du buste), et la taille de l'image ; ou null
// si aucun corps n'est repéré.
export async function detecterCorps(url) {
  const d = await detecteur()
  const blob = await (await fetch(url)).blob()
  const img = await createImageBitmap(blob)
  const res = d.detect(img)
  const lm = res?.landmarks?.[0]
  const largeur = img.width, hauteur = img.height
  img.close?.()
  if (!lm) return null
  const [eg, ed, hg, hd] = [lm[11], lm[12], lm[23], lm[24]] // épaules et hanches
  if (![eg, ed, hg, hd].every(Boolean)) return null
  const ey = (eg.y + ed.y) / 2, hy = (hg.y + hd.y) / 2
  const buste = hy - ey
  if (!(buste > 0.03)) return null
  const cx = (eg.x + ed.x + hg.x + hd.x) / 4
  return { cx, ey, buste, largeur, hauteur }
}

// Style de l'image dans un cadre de format FORMAT pour placer le corps à la
// cible. Tout est en pourcentage du cadre : le rendu suit la taille de l'écran.
export function styleRecadre(c) {
  const hImg = CIBLE.buste / c.buste                          // hauteur de l'image, en hauteurs de cadre
  const lImg = hImg * (c.largeur / c.hauteur) / FORMAT          // largeur de l'image, en largeurs de cadre
  return {
    position: 'absolute', maxWidth: 'none',
    height: `${hImg * 100}%`, width: `${lImg * 100}%`,
    left: `${(CIBLE.centreX - c.cx * lImg) * 100}%`,
    top: `${(CIBLE.epaulesY - c.ey * hImg) * 100}%`,
  }
}
