// Accessibilité transversale (activée une fois au démarrage, voir index.js) :
//  1. Entrée / Espace activent les éléments role="button" qui ne sont pas des
//     boutons natifs (cartes, pastilles, jours du calendrier…).
//  2. Les champs sans libellé reçoivent un nom accessible déduit de leur texte
//     d'exemple ou du texte qui les précède.
//  3. Les boutons ne contenant qu'une icône reçoivent un nom (title, sinon
//     libellé de l'icône).

const NATIFS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'])
const ICONES = {
  edit: 'Modifier', trash: 'Supprimer', send: 'Envoyer', folder: 'Dossier', 'folder-open': 'Dossier ouvert',
  search: 'Rechercher', camera: 'Prendre une photo', mic: 'Micro', image: 'Image', calendar: 'Calendrier',
  refresh: 'Actualiser', clock: 'Horaire', alert: 'Attention', check: 'Valider', x: 'Fermer',
  clipboard: 'Presse-papiers', link: 'Lien', bell: 'Notifications', download: 'Télécharger',
  upload: 'Envoyer un fichier', palette: 'Couleur', save: 'Enregistrer', star: 'Favori',
}

function texteCourt(el) {
  if (!el) return ''
  if (el.querySelector('input, select, textarea, button')) return ''
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
  return t.length > 0 && t.length <= 60 ? t : ''
}

function nomDuChamp(el) {
  if (el.placeholder) return el.placeholder
  let prev = el.previousElementSibling
  while (prev && !texteCourt(prev) && prev.previousElementSibling) prev = prev.previousElementSibling
  let t = texteCourt(prev)
  if (t) return t
  t = texteCourt(el.parentElement?.previousElementSibling)
  if (t) return t
  t = texteCourt(el.parentElement && !el.parentElement.querySelector('input:not([type=hidden]), select, textarea') ? el.parentElement : null)
  return t || el.name || ''
}

function completer(racine = document) {
  racine.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea').forEach(el => {
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.title || (el.labels && el.labels.length)) return
    const nom = nomDuChamp(el)
    if (nom) el.setAttribute('aria-label', nom)
  })
  racine.querySelectorAll('button:not([aria-label])').forEach(b => {
    if ((b.textContent || '').trim() || b.title) return
    const svg = b.querySelector('svg[data-icon]')
    const nom = svg && ICONES[svg.getAttribute('data-icon')]
    if (nom) b.setAttribute('aria-label', nom)
  })
}

export function installerAccessibilite() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = e.target
    if (!(el instanceof HTMLElement) || NATIFS.has(el.tagName) || el.getAttribute('role') !== 'button') return
    if (el !== e.target || el.isContentEditable) return
    e.preventDefault()
    el.click()
  })
  let minuterie = null
  const planifier = () => { clearTimeout(minuterie); minuterie = setTimeout(() => completer(), 250) }
  new MutationObserver(planifier).observe(document.body, { childList: true, subtree: true })
  planifier()
}
