import { useState, useEffect } from 'react'

/**
 * usePageFade — retourne un objet `style` à appliquer sur le wrapper principal de page.
 * La page apparaît en fondu depuis le bas dès le premier rendu (16 ms de délai pour
 * que le navigateur ait le temps de peindre l'état initial avant la transition).
 *
 * Usage :
 *   const fadeStyle = usePageFade()
 *   return <div style={{ ...S.page, ...fadeStyle }}>…</div>
 */
export default function usePageFade(duration = 220) {
  const [visible, setVisible] = useState(false)
  // Une fois l'animation finie, on retire complètement le transform : un
  // transform non nul fait du wrapper le référent des enfants `position: fixed`,
  // qui se positionnent alors par rapport à la page (souvent plus haute que
  // l'écran) au lieu de la fenêtre — une barre fixe se retrouvait hors écran.
  const [fini, setFini] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })
    const t = setTimeout(() => setFini(true), duration + 30)
    return () => { cancelAnimationFrame(id); clearTimeout(t) }
  }, [duration])

  if (fini) return { opacity: 1 }

  return {
    opacity:    visible ? 1 : 0,
    transform:  visible ? 'translateY(0)' : 'translateY(10px)',
    transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
  }
}
