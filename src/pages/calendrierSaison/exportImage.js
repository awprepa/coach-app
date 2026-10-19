// Export d'un bloc de la page en image PNG haute définition.
// Sur téléphone : feuille de partage (WhatsApp, Photos…) ; sinon téléchargement.
import { toBlob } from 'html-to-image'

export async function exporterImage(node, nomFichier, pixelRatio = 3) {
  // Deux passes : la première charge les images dans le cache,
  // la seconde produit une image complète (contournement connu de Safari).
  // Police système : pas de police web à intégrer (skipFonts).
  await toBlob(node, { pixelRatio, cacheBust: false, skipFonts: true }).catch(() => null)
  const blob = await toBlob(node, { pixelRatio, cacheBust: false, skipFonts: true })
  if (!blob) throw new Error('Image vide')
  const fichier = new File([blob], nomFichier, { type: 'image/png' })

  const tactile = window.matchMedia?.('(pointer: coarse)').matches
  if (tactile && navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier] }); return } catch (e) { if (e?.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nomFichier
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
