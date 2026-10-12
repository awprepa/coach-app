import React from 'react'

/* ── Palette de blocs dérivée des couleurs du club ── */
export function hexToHsl(hex) {
  const h = (hex || '#2f6f76').replace('#', '')
  let r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  let hh = 0, s = 0, l = (max+min)/2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d/(2-max-min) : d/(max+min)
    if (max===r) hh = (g-b)/d + (g<b?6:0)
    else if (max===g) hh = (b-r)/d + 2
    else hh = (r-g)/d + 4
    hh /= 6
  }
  return [hh*360, s*100, l*100]
}
export function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  const hue2rgb = (p,q,t) => { if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p }
  let r, g, b
  if (s === 0) { r=g=b=l } else {
    const q = l<0.5?l*(1+s):l+s-l*s, p = 2*l-q
    r = hue2rgb(p,q,h+1/3); g = hue2rgb(p,q,h); b = hue2rgb(p,q,h-1/3)
  }
  return '#' + [r,g,b].map(x => Math.round(x*255).toString(16).padStart(2,'0')).join('')
}
export function isLight(hex) { const [,, l] = hexToHsl(hex || '#2f6f76'); return l > 55 }
export function generateBlocPalette(primary, secondary) {
  const p = primary || '#2f6f76'
  const [ph, ps, pl] = hexToHsl(p)
  const clL = l => Math.min(Math.max(l, 28), 62) // lisibilité : ni trop clair ni trop foncé
  if (secondary && secondary !== primary) {
    const [sh, ss, sl] = hexToHsl(secondary)
    return [
      hslToHex(ph, ps, clL(pl)),
      hslToHex(ph, Math.max(ps-15,20), clL(pl+14)),
      hslToHex(sh, ss, clL(sl)),
      hslToHex(sh, Math.max(ss-15,20), clL(sl+14)),
      hslToHex((ph+25)%360, ps*0.9, clL(pl-8)),
      hslToHex((ph-25+360)%360, ps*0.9, clL(pl+6)),
      hslToHex((sh+25)%360, ss*0.9, clL(sl-8)),
      hslToHex((sh-25+360)%360, ss*0.9, clL(sl+6)),
    ]
  }
  // Couleur unique → rotation de teinte
  return [0,45,90,135,180,225,270,315].map(delta =>
    hslToHex((ph+delta)%360, Math.max(ps*0.9,35), clL(delta % 90 === 0 ? pl : pl+8))
  )
}
