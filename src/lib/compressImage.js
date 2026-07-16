// ── Compression d'image avant upload ─────────────────────────────────────────
// Redimensionne à MAX px sur le plus grand côté et ré-encode en JPEG qualité Q.
// Une photo brute de téléphone (2–5 Mo) tombe ainsi à ~150–300 Ko, largement
// suffisant pour comparer une évolution physique — et le Storage Supabase tient
// alors des milliers de photos au lieu de quelques centaines.
// En cas d'échec (format exotique, navigateur récalcitrant), on renvoie le
// fichier d'origine pour ne jamais bloquer un envoi.

const MAX = 1280   // px sur le plus grand côté
const Q   = 0.8    // qualité JPEG

export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) return file
  try {
    const bitmap = await loadBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, MAX / Math.max(width, height))
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    if (bitmap.close) bitmap.close()

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', Q))
    if (!blob) return file
    // Si la « compression » a paradoxalement grossi le fichier, on garde l'original.
    if (blob.size >= file.size) return file
    return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file)
  }
  // Fallback : <img> + object URL
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = e => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}
