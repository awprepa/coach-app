import { useCallback, useRef } from 'react'
import { levelFromXp } from '../data/xpSystem'

// ─── Bulle éphémère de gain d'XP ────────────────────────────────────────────
//
// Concept validé par Arthur sur un prototype (bulle éphémère, couleurs de la
// carte "Niveau de compte", bulle d'XP qui vole du bouton jusqu'à la carte et
// s'y fait absorber avec un impact). Réservé aux clients hors groupe.
//
// Usage : <XpBulleStyles /> une fois dans l'arbre (injecte les keyframes),
// puis const triggerXp = useXpBulle() et triggerXp(boutonEl, montant, totalXpAvant).
// Tout le rendu est fait en DOM impératif (document.body.appendChild), hors de
// l'arbre React, pour rester fidèle au prototype et ne jamais interférer avec
// le state React de la page séance.

export default function XpBulleStyles() {
  return (
    <style>{`
      .xp-bulle-toast{
        position:fixed; z-index:2000;
        left:50%; top:78px;
        transform:translate(-50%,-10px) scale(0.9);
        border-radius:12px;
        min-width:150px;
        opacity:0;
        pointer-events:none;
      }
      .xp-bulle-play{ animation:xpBulleLife 1900ms cubic-bezier(.22,.9,.3,1) forwards; }
      @keyframes xpBulleLife{
        0%{   opacity:0; transform:translate(-50%,-10px) scale(0.9); }
        12%{  opacity:1; transform:translate(-50%,0) scale(1); }
        78%{  opacity:1; transform:translate(-50%,0) scale(1); }
        100%{ opacity:0; transform:translate(-50%,-8px) scale(0.94); }
      }
      .xp-bulle-inner{
        position:relative;
        background:linear-gradient(120deg,#1b2a52 0%,#24407a 55%,#2f5aa8 100%);
        border-radius:14px;
        padding:0.6rem 0.85rem;
        box-shadow:0 10px 26px rgba(15,25,55,0.35);
        display:flex; align-items:center; gap:0.65rem;
        overflow:hidden;
        transform-origin:center;
      }
      .xp-bulle-inner::before{
        content:""; position:absolute; inset:-50% -10% auto auto; width:100px; height:100px;
        background:radial-gradient(circle,rgba(255,255,255,0.14),transparent 70%);
      }
      .xp-bulle-catch{ animation:xpBulleCatch 460ms cubic-bezier(.34,1.56,.64,1); }
      @keyframes xpBulleCatch{
        0%{   transform:scale(1);    box-shadow:0 10px 26px rgba(15,25,55,0.35); }
        40%{  transform:scale(1.07); box-shadow:0 0 0 8px rgba(228,248,22,0.22), 0 10px 26px rgba(15,25,55,0.35); }
        100%{ transform:scale(1);    box-shadow:0 10px 26px rgba(15,25,55,0.35); }
      }
      .xp-bulle-ringWrap{ position:relative; width:48px; height:48px; flex-shrink:0; }
      .xp-bulle-ringWrap svg{ transform:rotate(-90deg); }
      .xp-bulle-ringBg{ fill:none; stroke:rgba(255,255,255,0.18); stroke-width:5; }
      .xp-bulle-ringFg{ fill:none; stroke:#e4f816; stroke-width:5; stroke-linecap:round; transition:stroke-dashoffset 850ms cubic-bezier(.22,.9,.3,1); }
      .xp-bulle-ringNum{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.9rem; font-weight:900; color:#fff; }
      .xp-bulle-txt{ position:relative; display:flex; flex-direction:column; gap:0.12rem; min-width:0; }
      .xp-bulle-lbl{ font-size:0.56rem; font-weight:800; color:rgba(255,255,255,0.55); text-transform:uppercase; letter-spacing:0.06em; white-space:nowrap; }
      .xp-bulle-gain{ font-size:0.98rem; font-weight:900; color:#e4f816; white-space:nowrap; opacity:0; transition:opacity 200ms ease; }
      .xp-bulle-shown{ opacity:1; }
      .xp-bulle-xp{ font-size:0.62rem; font-weight:700; color:rgba(255,255,255,0.6); font-variant-numeric:tabular-nums; white-space:nowrap; }

      .xp-bulle-bubble{
        position:fixed; z-index:2010;
        width:28px; height:28px;
        border-radius:50%;
        background:linear-gradient(135deg,#2f5aa8,#1b2a52);
        border:1.5px solid #e4f816;
        color:#e4f816;
        font-size:0.55rem; font-weight:900;
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 12px rgba(15,25,55,0.4);
        pointer-events:none;
        transform:translate(-50%,-50%) scale(0.4);
        opacity:0;
        animation:xpBulleFly 780ms cubic-bezier(.3,.7,.35,1) forwards;
      }
      @keyframes xpBulleFly{
        0%{   opacity:0; transform:translate(-50%,-50%) translate(0,0) scale(0.4); }
        18%{  opacity:1; transform:translate(-50%,-50%) translate(0,-8px) scale(1.1); }
        80%{  opacity:1; transform:translate(-50%,-50%) translate(calc(var(--dx) * 0.94),calc(var(--dy) * 0.94)) scale(0.85); }
        100%{ opacity:0; transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) scale(0.05); }
      }

      .xp-bulle-flash{
        position:fixed; z-index:2005;
        width:14px; height:14px;
        border-radius:50%;
        background:radial-gradient(circle, rgba(255,255,255,0.95), rgba(228,248,22,0.55) 45%, rgba(228,248,22,0) 72%);
        transform:translate(-50%,-50%) scale(0.3);
        opacity:0;
        pointer-events:none;
        animation:xpBulleFlash 460ms ease-out forwards;
      }
      @keyframes xpBulleFlash{
        0%{   opacity:0; transform:translate(-50%,-50%) scale(0.3); }
        22%{  opacity:1; transform:translate(-50%,-50%) scale(1.5); }
        100%{ opacity:0; transform:translate(-50%,-50%) scale(2.8); }
      }
      .xp-bulle-particle{
        position:fixed; z-index:2005;
        width:4px; height:4px;
        border-radius:50%;
        background:#e4f816;
        box-shadow:0 0 4px rgba(228,248,22,0.7);
        transform:translate(-50%,-50%);
        opacity:0;
        pointer-events:none;
        animation:xpBulleParticle 460ms ease-out forwards;
      }
      @keyframes xpBulleParticle{
        0%{   opacity:0; transform:translate(-50%,-50%) translate(0,0) scale(1); }
        18%{  opacity:1; }
        100%{ opacity:0; transform:translate(-50%,-50%) translate(var(--px),var(--py)) scale(0.3); }
      }

      .xp-bulle-lvlup{
        position:fixed; z-index:2000;
        top:78px; left:50%;
        transform:translate(-50%,-8px);
        background:rgba(20,20,22,0.92);
        color:#fff;
        font-size:0.74rem; font-weight:800;
        padding:0.42rem 0.85rem;
        border-radius:999px;
        opacity:0; white-space:nowrap;
        box-shadow:0 6px 18px rgba(0,0,0,0.25);
        pointer-events:none;
      }
      .xp-bulle-lvlup-play{ animation:xpBulleLvlUp 1700ms ease-out forwards; }
      @keyframes xpBulleLvlUp{
        0%{   opacity:0; transform:translate(-50%,-8px); }
        14%{  opacity:1; transform:translate(-50%,0); }
        82%{  opacity:1; transform:translate(-50%,0); }
        100%{ opacity:0; transform:translate(-50%,-6px); }
      }

      @media (prefers-reduced-motion: reduce){
        .xp-bulle-toast,.xp-bulle-bubble,.xp-bulle-flash,.xp-bulle-particle,.xp-bulle-lvlup,.xp-bulle-inner,.xp-bulle-ringFg{
          animation-duration:1ms !important; transition-duration:1ms !important;
        }
      }
    `}</style>
  )
}

function spawnImpact(x, y) {
  const flash = document.createElement('div')
  flash.className = 'xp-bulle-flash'
  flash.style.left = x + 'px'; flash.style.top = y + 'px'
  document.body.appendChild(flash)
  flash.addEventListener('animationend', () => flash.remove())

  const n = 6
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + (Math.random() * 0.5 - 0.25)
    const dist = 16 + Math.random() * 12
    const p = document.createElement('div')
    p.className = 'xp-bulle-particle'
    p.style.left = x + 'px'; p.style.top = y + 'px'
    p.style.setProperty('--px', (Math.cos(angle) * dist) + 'px')
    p.style.setProperty('--py', (Math.sin(angle) * dist) + 'px')
    document.body.appendChild(p)
    p.addEventListener('animationend', function () { this.remove() })
  }
}

function flyBubble(fromEl, targetEl, amount, onLand) {
  if (!fromEl?.getBoundingClientRect || !targetEl) { onLand(); return }
  const from = fromEl.getBoundingClientRect()
  const to = targetEl.getBoundingClientRect()
  const sx = from.left + from.width / 2, sy = from.top + from.height / 2
  const ex = to.left + to.width / 2, ey = to.top + to.height * 0.35
  const bubble = document.createElement('div')
  bubble.className = 'xp-bulle-bubble'
  bubble.textContent = '+' + amount
  bubble.style.left = sx + 'px'; bubble.style.top = sy + 'px'
  bubble.style.setProperty('--dx', (ex - sx) + 'px')
  bubble.style.setProperty('--dy', (ey - sy) + 'px')
  document.body.appendChild(bubble)
  bubble.addEventListener('animationend', () => {
    bubble.remove()
    spawnImpact(ex, ey)
    onLand()
  })
}

function playLevelUpToast(level) {
  const toast = document.createElement('div')
  toast.className = 'xp-bulle-lvlup xp-bulle-lvlup-play'
  toast.textContent = 'Niveau supérieur · Nv. ' + level
  document.body.appendChild(toast)
  toast.addEventListener('animationend', () => toast.remove())
}

function runXpBulle(fromEl, amount, totalXpBefore) {
  return new Promise(resolve => {
    if (!fromEl || typeof document === 'undefined' || !amount) { resolve(); return }

    const before = levelFromXp(totalXpBefore)
    const after = levelFromXp(totalXpBefore + amount)
    const fromPct = Math.max(0, Math.min(100, (before.xp / before.xpForNextLevel) * 100))
    const crossedLevel = after.level > before.level
    const toPct = crossedLevel ? 100 : Math.max(0, Math.min(100, (after.xp / after.xpForNextLevel) * 100))
    const toXpTxt = Math.min(before.xp + amount, before.xpForNextLevel) + ' / ' + before.xpForNextLevel + ' XP'

    const R = 19
    const C = 2 * Math.PI * R
    const fromOffset = C * (1 - fromPct / 100)
    const toOffset = C * (1 - toPct / 100)

    const toast = document.createElement('div')
    toast.className = 'xp-bulle-toast xp-bulle-play'
    toast.innerHTML =
      '<div class="xp-bulle-inner">' +
        '<div class="xp-bulle-ringWrap">' +
          '<svg width="48" height="48" viewBox="0 0 48 48">' +
            '<circle class="xp-bulle-ringBg" cx="24" cy="24" r="' + R + '"></circle>' +
            '<circle class="xp-bulle-ringFg" cx="24" cy="24" r="' + R + '" style="stroke-dasharray:' + C + 'px; stroke-dashoffset:' + fromOffset + 'px"></circle>' +
          '</svg>' +
          '<div class="xp-bulle-ringNum">' + before.level + '</div>' +
        '</div>' +
        '<div class="xp-bulle-txt">' +
          '<span class="xp-bulle-lbl">Niveau ' + before.level + '</span>' +
          '<span class="xp-bulle-gain">+' + amount + ' XP</span>' +
          '<span class="xp-bulle-xp">' + before.xp + ' / ' + before.xpForNextLevel + ' XP</span>' +
        '</div>' +
      '</div>'
    document.body.appendChild(toast)
    const inner = toast.querySelector('.xp-bulle-inner')
    const gainTxt = toast.querySelector('.xp-bulle-gain')
    const ring = toast.querySelector('.xp-bulle-ringFg')
    const xpTxt = toast.querySelector('.xp-bulle-xp')

    let done = false
    function finish() {
      if (done) return
      done = true
      toast.remove()
      if (crossedLevel) playLevelUpToast(after.level)
      resolve()
    }
    toast.addEventListener('animationend', e => { if (e.target === toast) finish() })
    // Filet de sécurité si l'onglet passe en arrière-plan et gèle les animations
    setTimeout(finish, 2600)

    setTimeout(() => {
      flyBubble(fromEl, inner, amount, () => {
        inner.classList.add('xp-bulle-catch')
        gainTxt.classList.add('xp-bulle-shown')
        xpTxt.textContent = toXpTxt
        requestAnimationFrame(() => requestAnimationFrame(() => {
          ring.style.strokeDashoffset = toOffset + 'px'
        }))
      })
    }, 140)
  })
}

/** Renvoie une fonction trigger(fromEl, amount, totalXpBefore) qui joue
 *  l'animation. Les appels rapprochés sont mis en file pour ne jamais
 *  superposer deux bulles. */
export function useXpBulle() {
  const queueRef = useRef(Promise.resolve())
  return useCallback((fromEl, amount, totalXpBefore) => {
    queueRef.current = queueRef.current.then(() => runXpBulle(fromEl, amount, totalXpBefore))
  }, [])
}
