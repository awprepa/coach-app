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

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })
    return () => cancelAnimationFrame(id)
  }, [])

  return {
    opacity:    visible ? 1 : 0,
    transform:  visible ? 'translateY(0)' : 'translateY(10px)',
    transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
  }
}
