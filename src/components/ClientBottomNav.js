import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import T from '../theme/tokens'

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

export default function ClientBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const p = location.pathname
  // Initialise depuis le cache sessionStorage → pas de flash au premier rendu
  const [offre, setOffre] = useState(() => {
    const cached = localStorage.getItem('aw_client_offre')
    const cachedAt = parseInt(localStorage.getItem('aw_client_offre_at') || '0', 10)
    return (cached && Date.now() - cachedAt < 24 * 60 * 60 * 1000) ? cached : null
  })

  // Se cache dès qu'un input/textarea est focus — fonctionne sur toutes les pages
  const [kbOpen, setKbOpen] = useState(false)
  useEffect(() => {
    const show = () => setTimeout(() => setKbOpen(false), 80)
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

  // Récupère l'offre du client — cache localStorage 24h pour éviter une requête à chaque navigation
  const [userId, setUserId] = useState(null)
  useEffect(() => {
    async function fetchOffre() {
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess?.session?.user?.id
      if (uid) setUserId(uid)

      const cached = localStorage.getItem('aw_client_offre')
      const cachedAt = parseInt(localStorage.getItem('aw_client_offre_at') || '0', 10)
      const TTL = 24 * 60 * 60 * 1000 // 24h
      if (cached && Date.now() - cachedAt < TTL) {
        setOffre(cached)
        return
      }
      if (!uid) return
      const { data: client } = await supabase
        .from('clients').select('offre').eq('user_id', uid).maybeSingle()
      if (client?.offre) {
        localStorage.setItem('aw_client_offre', client.offre)
        localStorage.setItem('aw_client_offre_at', String(Date.now()))
        setOffre(client.offre)
      }
    }
    fetchOffre()
  }, [])

  // Pastille messages non lus — refetch au changement de page (la page Messages marque comme lu à l'ouverture) + Realtime
  const [unreadMsg, setUnreadMsg] = useState(0)
  useEffect(() => {
    if (!userId) return
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
  }, [userId, location.pathname])

  if (kbOpen) return null

  const isHome        = p === '/' || p === '/client/accueil'
  const isProgramme   = p.startsWith('/client/programme') || p.startsWith('/client/seance') || p === '/client/mon-programme'
  const isNutrition   = p.startsWith('/client/nutrition')
  const isMessages    = p === '/client/messages'
  const isGPS         = p.startsWith('/client/gps')
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

  return createPortal(
    <nav aria-label="Navigation principale" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
      background: T.color.card,
      borderTop: `1px solid ${T.color.line}`,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: T.font.body,
    }}>
      {/* Zone boutons */}
      <div style={{ display: 'flex', overflow: 'hidden', maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {tabs.map(({ label, Icon, active, to, badge }) => (
          <button key={label} onClick={() => navigate(to)} aria-current={active ? 'page' : undefined}
            aria-label={badge > 0 ? `${label}, ${badge} non lus` : undefined}
            style={{
              flex: 1, minWidth: 0, minHeight: 56, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 4, padding: '8px 2px 6px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? T.color.ink : T.color.muted,
            }}>
            <div style={{
              width: 48, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: T.radius.pill, position: 'relative',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-text)' : 'inherit',
              transition: 'background 0.15s',
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
              fontSize: T.size.xs, fontWeight: active ? 700 : 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
            }}>{label}</span>
          </button>
        ))}
      </div>
      {/* Zone safe-area iPhone (barre Apple) */}
      <div style={{ height: 'env(safe-area-inset-bottom)', minHeight: 12, background: T.color.card }} />
    </nav>,
    document.body
  )
}
