import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import T from '../theme/tokens'
import { COACH_EMAIL } from '../accountSwitch'

function IconHome({ active }) {
  const s = 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" />
      <path d="M9 21V13h6v8" />
    </svg>
  )
}

function IconProgramme({ active }) {
  const s = 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="9" y1="7"  x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="13" y2="15" />
    </svg>
  )
}

function IconNutrition({ active }) {
  const s = 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Bol */}
      <path d="M4 11h16" />
      <path d="M5 11c0 5 2 8 7 8s7-3 7-8" />
      {/* Vapeur */}
      <path d="M9 7 Q10 5 9 3" />
      <path d="M12 7 Q13 5 12 3" />
      <path d="M15 7 Q16 5 15 3" />
    </svg>
  )
}

function IconGPS({ active }) {
  const s = 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.5 2 5.5 5 5.5 8.5c0 5 6.5 13.5 6.5 13.5S18.5 13.5 18.5 8.5C18.5 5 15.5 2 12 2z" />
      <circle cx="12" cy="8.5" r="2.5" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}

function IconChat({ active }) {
  const s = 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconTrophy({ active }) {
  const s = 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H3V5h3" />
      <path d="M18 9h3V5h-3" />
      <path d="M6 5h12v6a6 6 0 0 1-12 0V5z" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  )
}

// Les pages client déclarent encore <ClientBottomNav /> : la vraie barre
// (BarreClient) est montée une seule fois dans App, pour qu'elle ne disparaisse
// pas à chaque changement de page et que l'onglet actif glisse d'un onglet à l'autre.
export default function ClientBottomNav() {
  return null
}

// Pages où la barre est affichée (mêmes pages qu'avant)
const AVEC_BARRE = [
  /^\/$/, /^\/client\/accueil$/, /^\/client\/mon-programme$/, /^\/client\/programme\//, /^\/client\/seance\//,
  /^\/client\/nutrition(\/(plan|profil|historique))?$/, /^\/client\/messages$/, /^\/client\/competition$/,
  /^\/client\/gps$/, /^\/client\/progression$/, /^\/client\/notifications$/, /^\/client\/tests$/,
  /^\/client\/profil$/, /^\/client\/wellness$/, /^\/client\/photos$/,
]

const MARGE = 20 // même distance au bas et aux côtés de l'écran

export function BarreClient() {
  const location = useLocation()
  const navigate = useNavigate()
  const p = location.pathname
  // Initialise depuis le cache sessionStorage → pas de flash au premier rendu
  const [offre, setOffre] = useState(() => {
    const cached = localStorage.getItem('aw_client_offre')
    const cachedAt = parseInt(localStorage.getItem('aw_client_offre_at') || '0', 10)
    return (cached && Date.now() - cachedAt < 24 * 60 * 60 * 1000) ? cached : null
  })
  const [appuye, setAppuye] = useState(null)

  // Se cache dès qu'un input/textarea est focus — fonctionne sur toutes les pages
  const [kbOpen, setKbOpen] = useState(false)
  useEffect(() => {
    // Réaffichée seulement si plus aucun champ n'a le focus (après un envoi, le
    // champ de message reprend le focus aussitôt : la barre doit rester cachée)
    const estChamp = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    const show = () => setTimeout(() => { if (!estChamp(document.activeElement)) setKbOpen(false) }, 80)
    const hide = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        setKbOpen(true)
      }
    }
    window.addEventListener('focusin',  hide)
    window.addEventListener('focusout', show)
    return () => {
      window.removeEventListener('focusin',  hide)
      window.removeEventListener('focusout', show)
    }
  }, [])

  // Compte connecté (suit la connexion et la bascule coach ↔ client)
  const [userId, setUserId] = useState(null)
  const [estCoach, setEstCoach] = useState(false)
  useEffect(() => {
    const appliquer = session => {
      setUserId(session?.user?.id || null)
      setEstCoach(session?.user?.email === COACH_EMAIL)
    }
    supabase.auth.getSession().then(({ data }) => appliquer(data?.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => appliquer(session))
    return () => subscription.unsubscribe()
  }, [])

  // Récupère l'offre du client — cache localStorage 24h pour éviter une requête à chaque navigation
  useEffect(() => {
    if (!userId || estCoach) return
    async function fetchOffre() {
      const cached = localStorage.getItem('aw_client_offre')
      const cachedAt = parseInt(localStorage.getItem('aw_client_offre_at') || '0', 10)
      const TTL = 24 * 60 * 60 * 1000 // 24h
      if (cached && Date.now() - cachedAt < TTL) {
        setOffre(cached)
        return
      }
      const { data: client } = await supabase
        .from('clients').select('offre').eq('user_id', userId).maybeSingle()
      if (client?.offre) {
        localStorage.setItem('aw_client_offre', client.offre)
        localStorage.setItem('aw_client_offre_at', String(Date.now()))
        setOffre(client.offre)
      }
    }
    fetchOffre()
  }, [userId, estCoach])

  // Pastille messages non lus — refetch au changement de page (la page Messages marque comme lu à l'ouverture) + Realtime
  const [unreadMsg, setUnreadMsg] = useState(0)
  useEffect(() => {
    if (!userId || estCoach) return
    async function fetchUnread() {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('to_id', userId)
        .eq('lu', false)
      setUnreadMsg(count || 0)
    }
    fetchUnread()

    const channel = supabase
      .channel(`bottomnav-messages-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `to_id=eq.${userId}` }, fetchUnread)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, estCoach, location.pathname])

  if (kbOpen || !userId || estCoach || !AVEC_BARRE.some(r => r.test(p))) return null

  const isHome        = p === '/' || p === '/client/accueil'
  const isProgramme   = p.startsWith('/client/programme') || p.startsWith('/client/seance') || p === '/client/mon-programme'
  const isNutrition   = p.startsWith('/client/nutrition')
  const isMessages    = p === '/client/messages'
  const isCompetition = p.startsWith('/client/competition')

  const isPrepaPhysique = offre === 'preparation_physique'

  const tabs = [
    { label: 'Accueil',   Icon: IconHome,      active: isHome,        to: '/' },
    { label: 'Programme', Icon: IconProgramme, active: isProgramme,   to: '/client/mon-programme' },
    { label: 'Nutrition', Icon: IconNutrition, active: isNutrition,   to: '/client/nutrition' },
    { label: 'Messages',  Icon: IconChat,      active: isMessages,    to: '/client/messages', badge: unreadMsg },
    ...(isPrepaPhysique ? [
      { label: 'Compét.', Icon: IconTrophy, active: isCompetition, to: '/client/competition' },
    ] : []),
  ]
  const n = tabs.length
  const actif = tabs.findIndex(t => t.active)
  // La case active s'élargit pour que son libellé tienne dans la pastille
  const LARGE = 1.25
  const total = n + (actif < 0 ? 0 : LARGE - 1)
  const ressort = '0.38s cubic-bezier(.3, 1.2, .5, 1)'

  return createPortal(
    // Barre flottante, à la même distance du bas et des côtés de l'écran
    <nav aria-label="Navigation principale" className="aw-barre" style={{
      position: 'fixed', zIndex: 90,
      left: MARGE, right: MARGE, bottom: MARGE,
      maxWidth: 520, margin: '0 auto',
      // Verre dépoli : laisse deviner (flouté) ce qui défile derrière
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(18px) saturate(1.6)', WebkitBackdropFilter: 'blur(18px) saturate(1.6)',
      border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: T.radius.pill,
      boxShadow: T.shadow.float,
      fontFamily: T.font.body,
    }}>
      <style>{`
        @keyframes aw-barre-pop { 0% { transform: scale(0.86) } 55% { transform: scale(1.12) } 100% { transform: scale(1) } }
        @media (prefers-reduced-motion: reduce) { .aw-barre * { transition: none !important; animation: none !important } }
      `}</style>
      <div style={{ display: 'flex', position: 'relative', padding: 4 }}>
        {/* Pastille grise (reflet en haut) qui entoure toute la case de l'onglet actif : glisse d'un onglet à l'autre */}
        <div aria-hidden style={{
          position: 'absolute', top: 4, bottom: 4,
          width: `calc((100% - 8px) * ${LARGE / total})`,
          left: `calc(4px + (100% - 8px) * ${Math.max(actif, 0) / total})`,
          borderRadius: T.radius.pill, background: 'rgba(0,0,0,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.04)',
          opacity: actif < 0 ? 0 : 1,
          transition: `left ${ressort}, width ${ressort}, opacity 0.2s`,
        }} />
        {tabs.map(({ label, Icon, active, to, badge }, i) => (
          <button key={label} onClick={() => { if (!active) navigate(to) }} aria-current={active ? 'page' : undefined}
            aria-label={badge > 0 ? `${label}, ${badge} non lus` : undefined}
            onPointerDown={() => setAppuye(i)} onPointerUp={() => setAppuye(null)}
            onPointerLeave={() => setAppuye(null)} onPointerCancel={() => setAppuye(null)}
            style={{
              flex: active ? LARGE : 1, minWidth: 0, minHeight: 56, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '6px 0 5px', position: 'relative',
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? T.color.ink : T.color.muted,
              WebkitTapHighlightColor: 'transparent',
              transform: appuye === i ? 'scale(0.9)' : 'scale(1)',
              transition: `transform 0.18s cubic-bezier(.3, 1.4, .5, 1), color 0.2s, flex-grow ${ressort}`,
            }}>
            <div key={active ? 'on' : 'off'} style={{
              width: 48, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              color: active ? 'var(--accent)' : 'inherit',
              // léger contour sombre pour que le jaune reste lisible sur la pastille claire
              filter: active ? 'drop-shadow(0 0 0.6px rgba(0,0,0,0.55))' : undefined,
              animation: active ? 'aw-barre-pop 0.38s ease-out' : undefined,
            }}>
              <Icon active={active} />
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: 2,
                  background: T.color.danger, color: T.color.card,
                  borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700,
                  minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px', lineHeight: 1,
                }}>{badge > 9 ? '9+' : badge}</span>
              )}
            </div>
            <span style={{
              fontSize: T.size.xs, fontWeight: 500,
              whiteSpace: 'nowrap', letterSpacing: '-0.01em',
            }}>{label}</span>
          </button>
        ))}
      </div>
    </nav>,
    document.body
  )
}
