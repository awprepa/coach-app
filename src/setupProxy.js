// En local (npm start), sert le relais des logos FFR comme le fait Vercel en
// production (api/ffr-logo.js). Ce fichier n'est utilisé que par le serveur de dev.
const { relaisLogo } = require('../api/ffr-logo')

module.exports = function (app) {
  app.get('/api/ffr-logo', async (req, res) => {
    try {
      const out = await relaisLogo(req.query.u)
      if (out.status !== 200) { res.status(out.status).end(); return }
      res.set('Content-Type', out.type)
      res.status(200).send(out.body)
    } catch {
      res.status(502).end()
    }
  })
}
