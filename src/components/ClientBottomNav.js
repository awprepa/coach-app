import { useLocation, useNavigate } from 'react-router-dom'

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

function IconGPS({ active }) {
  const s = active ? '#1a1a1a' : '#b0b8c1'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.5 2 5.5 5 5.5 8.5c0 5 6.5 13.5 6.5 13.5S18.5 13.5 18.5 8.5C18.5 5 15.5 2 12 2z" />
      <circle cx="12" cy="8.5" r="2.5" fill={active ? '#1a1a1a' : 'none'} />
    </svg>
  )
}

export default function ClientBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const p = location.pathname

  const isHome      = p === '/' || p === '/client/accueil'
  const isProgramme = p.startsWith('/client/programme') || p.startsWith('/client/seance') || p === '/client/mon-programme'
  const isGPS       = p.startsWith('/client/gps')

  const tabs = [
    { label: 'Accueil',     Icon: IconHome,      active: isHome,      to: '/' },
    { label: 'Programme',   Icon: IconProgramme, active: isProgramme, to: '/client/mon-programme' },
    { label: 'GPS',         Icon: IconGPS,       active: isGPS,       to: '/client/gps' },
  ]

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90,
      background: 'white',
      borderTop: '1px solid #f0f0f0',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.07)',
      display: 'flex',
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
    }}>
      {tabs.map(({ label, Icon, active, to }) => (
        <button key={label} onClick={() => navigate(to)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '5px', padding: '18px 0',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
          <div style={{
            width: 44, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10,
            background: active ? '#f0f0f0' : 'transparent',
            transition: 'background 0.15s',
          }}>
            <Icon active={active} />
          </div>
          <span style={{
            fontSize: '0.67rem', fontWeight: active ? '700' : '500',
            color: active ? '#1a1a1a' : '#b0b8c1',
            letterSpacing: '0.01em',
          }}>{label}</span>
        </button>
      ))}
    </div>
  )
}
