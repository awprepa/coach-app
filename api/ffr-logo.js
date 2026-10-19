// Relais des logos d'équipes du site FFR (monclubhouse). Le site FFR n'autorise
// pas l'app à réutiliser ses images dans une image générée (export PNG de la
// semaine ou du match) : servies depuis notre domaine, elles passent.
// Seules les images de ce site sont acceptées (pas de relais ouvert).
const HOTE = 'api-web.monclubhouse.ffr.fr'

async function relaisLogo(u) {
  let url
  try { url = new URL(u) } catch { return { status: 400 } }
  if (url.protocol !== 'https:' || url.hostname !== HOTE) return { status: 400 }
  const r = await fetch(url.toString())
  const type = r.headers.get('content-type') || ''
  if (!r.ok || !type.startsWith('image/')) return { status: 404 }
  return { status: 200, type, body: Buffer.from(await r.arrayBuffer()) }
}

module.exports = async (req, res) => {
  try {
    const out = await relaisLogo(req.query.u)
    if (out.status !== 200) { res.status(out.status).end(); return }
    res.setHeader('Content-Type', out.type)
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800')
    res.status(200).send(out.body)
  } catch {
    res.status(502).end()
  }
}
module.exports.relaisLogo = relaisLogo
