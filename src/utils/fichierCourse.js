// Lecture d'un fichier de course GPX (export Strava, Garmin, Coros, Suunto…)
// ou TCX, directement dans le navigateur. On en garde un résumé : distance,
// durée, dénivelé positif, allure, fréquence cardiaque et un tracé simplifié
// pour le dessin. Le fichier lui-même n'est ni envoyé ni stocké.

const R = 6371000
function distance(a, b) {
  const rad = x => x * Math.PI / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Tous les éléments d'un nom donné, quel que soit leur préfixe (gpxtpx:hr, ns3:hr…)
const parNom = (racine, nom) => [...racine.getElementsByTagName('*')].filter(e => e.localName === nom)
const texte = (racine, nom) => parNom(racine, nom)[0]?.textContent?.trim()

function points(doc) {
  const gpx = parNom(doc, 'trkpt')
  if (gpx.length) {
    return gpx.map(p => ({
      lat: parseFloat(p.getAttribute('lat')), lon: parseFloat(p.getAttribute('lon')),
      ele: parseFloat(texte(p, 'ele')), t: Date.parse(texte(p, 'time') || ''), fc: parseFloat(texte(p, 'hr')),
    }))
  }
  // TCX
  return parNom(doc, 'Trackpoint').map(p => ({
    lat: parseFloat(texte(p, 'LatitudeDegrees')), lon: parseFloat(texte(p, 'LongitudeDegrees')),
    ele: parseFloat(texte(p, 'AltitudeMeters')), t: Date.parse(texte(p, 'Time') || ''),
    fc: parseFloat(texte(parNom(p, 'HeartRateBpm')[0] || p, 'Value')),
  }))
}

// Garde au plus `max` points pour le tracé, à pas régulier
function simplifier(pts, max = 250) {
  if (pts.length <= max) return pts
  const pas = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * pas)])
}

export async function lireFichierCourse(fichier) {
  const xml = await fichier.text()
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Fichier illisible. Utilise un fichier GPX ou TCX.')
  const pts = points(doc).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (pts.length < 2) throw new Error('Aucun parcours trouvé dans ce fichier.')

  let dist = 0, deniv = 0, eleRef = Number.isFinite(pts[0].ele) ? pts[0].ele : null
  for (let i = 1; i < pts.length; i++) {
    dist += distance(pts[i - 1], pts[i])
    // Dénivelé positif, en ignorant les variations de moins de 2 m (bruit du GPS)
    const e = pts[i].ele
    if (Number.isFinite(e)) {
      if (eleRef == null) eleRef = e
      else if (e - eleRef >= 2) { deniv += e - eleRef; eleRef = e }
      else if (eleRef - e >= 2) eleRef = e
    }
  }
  const temps = pts.map(p => p.t).filter(Number.isFinite)
  const duree = temps.length >= 2 ? Math.round((temps[temps.length - 1] - temps[0]) / 1000) : null
  const fcs = pts.map(p => p.fc).filter(v => Number.isFinite(v) && v > 30)

  return {
    distance_m: Math.round(dist),
    duree_s: duree,
    denivele_m: Math.round(deniv),
    allure_s_km: duree && dist > 50 ? Math.round(duree / (dist / 1000)) : null,
    fc_moy: fcs.length ? Math.round(fcs.reduce((s, v) => s + v, 0) / fcs.length) : null,
    fc_max: fcs.length ? Math.max(...fcs) : null,
    debut: temps.length ? new Date(temps[0]).toISOString() : null,
    nom: texte(doc, 'name') || null,
    trace: simplifier(pts).map(p => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]),
  }
}

// ── Mise en forme ──
export function fmtDistance(m) { return m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${m} m` }
export function fmtDuree(s) {
  if (!s && s !== 0) return null
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(sec).padStart(2, '0')}`
}
export function fmtAllure(s) { return s ? `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}" /km` : null }
