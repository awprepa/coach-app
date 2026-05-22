/**
 * Extrait les N couleurs dominantes d'un fichier image via Canvas.
 * Ignore les pixels transparents, quasi-blancs et quasi-noirs.
 * Garantit que les couleurs retournées sont suffisamment distinctes.
 *
 * @param {File} file  — fichier image (PNG, JPG, WebP, SVG)
 * @param {number} count — nombre de couleurs à extraire (défaut 2)
 * @returns {Promise<string[]>} — tableau de codes hex ex: ['#e30613', '#1a1a1a']
 */
export function extractColorsFromImage(file, count = 2) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Redimensionner à 64×64 pour la performance
      const SIZE = 64
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, SIZE, SIZE)

      const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
      const buckets = {}

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]

        // Ignorer les pixels transparents
        if (a < 100) continue

        // Ignorer quasi-blanc (avg > 230) et quasi-noir (avg < 20)
        const avg = (r + g + b) / 3
        if (avg > 230 || avg < 20) continue

        // Quantiser par paliers de 24 pour regrouper les teintes proches
        const Q = 24
        const rq = Math.round(r / Q) * Q
        const gq = Math.round(g / Q) * Q
        const bq = Math.round(b / Q) * Q
        const key = `${rq}|${gq}|${bq}`
        buckets[key] = (buckets[key] || 0) + 1
      }

      // Trier par fréquence décroissante
      const sorted = Object.entries(buckets)
        .sort(([, a], [, b]) => b - a)
        .map(([key]) => {
          const [r, g, b] = key.split('|').map(Number)
          return { r, g, b }
        })

      // Sélectionner les couleurs suffisamment distinctes entre elles
      const MIN_DISTANCE = 90
      const selected = []

      for (const color of sorted) {
        if (selected.length >= count) break
        const tooClose = selected.some(sel => {
          return Math.sqrt(
            (color.r - sel.r) ** 2 +
            (color.g - sel.g) ** 2 +
            (color.b - sel.b) ** 2
          ) < MIN_DISTANCE
        })
        if (!tooClose) selected.push(color)
      }

      const hexColors = selected.map(({ r, g, b }) =>
        '#' + [r, g, b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('')
      )

      resolve(hexColors)
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve([]) }
    img.src = url
  })
}
