import React, { useRef, useState, useLayoutEffect } from 'react'

/* ── FitScale — réduit son contenu pour qu'il tienne toujours dans la hauteur
     disponible, sans jamais scroller (utilisé par l'aperçu du jour). ── */
export function FitScale({ children }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const fit = () => {
      const outer = outerRef.current, inner = innerRef.current
      if (!outer || !inner) return
      const availH = outer.clientHeight, availW = outer.clientWidth
      if (!availH || !availW) return
      // Mesure le contenu à l'échelle 1 (largeur non contrainte) pour capter
      // un éventuel débordement horizontal (tableau de séquences trop large)
      // en plus du débordement vertical.
      const prevWidth = inner.style.width
      inner.style.width = 'max-content'
      const neededH = inner.scrollHeight
      const neededW = inner.scrollWidth
      inner.style.width = prevWidth
      const scaleH = neededH > availH ? availH / neededH : 1
      const scaleW = neededW > availW ? availW / neededW : 1
      setScale(Math.max(0.4, Math.min(scaleH, scaleW, 1)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (outerRef.current) ro.observe(outerRef.current)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [children])

  return (
    <div ref={outerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '16px' }}>
      <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: `${100 / scale}%` }}>
        {children}
      </div>
    </div>
  )
}
