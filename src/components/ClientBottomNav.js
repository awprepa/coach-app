import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function IconHome({ active }) {
  const s = active ? '#1a1a1a' : '#b0b8c1'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" />
      <path d="M9 21V13h6v8" />
    </svg>
  )
}

function IconProgramme({ active }) {
  const s = active ? '#1a1a1a' : '#b0b8c1'
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
  const s = active ? '#1a1a1a' : '#b0b8c1'
  const fill = active ? '#1a1a1a' : 'none'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Fourchette à 3 dents */}
      <path d="M6 2v6" />
      <path d="M9 2v6" />
      <path d="M12 2v6" />
      <path d="M9 8v14" />
      <path d="M6 2v6a3 3 0 0 0 6 0V2" fill={fill} />
      {/* Cuillère */}
      <path d="M17 22v-7" />
      <ellipse cx="17" cy="6" rx="3" ry="5" fill={fill} />
    </svg>
  )
}

function IconGPS({ active }) {
  const s = active ? '#1a1a1a' : '#b0b8c1'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.5 2 5.5 5 5.5 8.5c0 5 6.5 13.5 6.5 13.5S18.5 13.5 18.5 8.5C18.5 5 15.5 2 12 2z" />
      <circle cx="12" cy="8.5" r="2.5" fill={active ? '#1a1a1a' : 'none'} />
    </svg>
  )
}

function IconChat({ active }) {
  const s = active ? '#1a1a1a' : '#b0b8c1'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function ClientBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const p = location.pathname
  // Initialise depuis le cache sessionStorage → pas de flash au premier rendu
  const [offre, setOffre] = useState(() => sessionStorage.getItem('clientOffre') || null)

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

  // Récupère l'offre du client pour afficher GPS seulement en prépa physique
  useEffect(() => {
    async function fetchOffre() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return
      const { data: client } = await supabase
        .from('clients').select('offre').eq('user_id', userId).maybeSingle()
      if (client?.offre) {
        sessionStorage.setItem('clientOffre', client.offre)
        setOffre(client.offre)
      }
    }
    fetchOffre()
  }, [])

  if (kbOpen) return null

  const isHome      = p === '/' || p === '/client/accueil'
  const isProgramme = p.startsWith('/client/programme') || p.startsWith('/client/seance') || p === '/client/mon-programme'
  const isNutrition = p.startsWith('/client/nutrition')
  const isMessages  = p === '/client/messages'
  const isGPS       = p.startsWith('/client/gps')

  const isPrepaPhysique = offre === 'preparation_physique'

  const tabs = [
    { label: 'Accueil',   Icon: IconHome,      active: isHome,      to: '/' },
    { label: 'Programme', Icon: IconProgramme, active: isProgramme, to: '/client/mon-programme' },
    { label: 'Nutrition', Icon: IconNutrition, active: isNutrition, to: '/client/nutrition' },
    { label: 'Messages',  Icon: IconChat,      active: isMessages,  to: '/client/messages' },
    ...(isPrepaPhysique ? [{ label: 'GPS', Icon: IconGPS, active: isGPS, to: '/client/gps' }] : []),
  ]

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
      background: 'white',
      borderTop: '1px solid #f0f0f0',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.07)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Zone boutons */}
      <div style={{ display: 'flex' }}>
        {tabs.map(({ label, Icon, active, to, badge }) => (
          <button key={label} onClick={() => navigate(to)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: '5px', padding: '12px 0 10px',
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
            <div style={{
              width: 44, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 11, position: 'relative',
              background: active ? '#f0f0f0' : 'transparent',
              transition: 'background 0.15s',
            }}>
              <Icon active={active} />
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 4,
                  background: '#ef4444', color: 'white',
                  borderRadius: 999, fontSize: '0.52rem', fontWeight: '800',
                  minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', lineHeight: 1,
                }}>{badge > 9 ? '9+' : badge}</span>
              )}
            </div>
            <span style={{
              fontSize: '0.63rem', fontWeight: active ? '700' : '500',
              color: active ? '#1a1a1a' : '#b0b8c1',
              letterSpacing: '0.01em',
            }}>{label}</span>
          </button>
        ))}
      </div>
      {/* Zone safe-area iPhone (barre Apple) */}
      <div style={{ height: 'env(safe-area-inset-bottom)', minHeight: 16, background: 'white' }} />
    </div>
  )
}
