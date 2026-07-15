import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { canSwitch, switchAccount } from '../accountSwitch'

const OFFRES = {
  essai:               'Essai',
  preparation_physique:'Prépa physique',
  coaching:            'Coaching',
}

export default function ClientProfileMenu({ client, avatarUrl, onClose }) {
  const navigate = useNavigate()
  const [switchEmail, setSwitchEmail] = useState(null) // bascule réservée aux comptes d'Arthur

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data?.session?.user?.email
      if (email && canSwitch(email)) setSwitchEmail(email)
    })
  }, [])

  async function handleLogout() {
    onClose()
    try { await supabase.auth.signOut() } catch (e) { console.error(e) }
    navigate('/login')
  }

  function go(path) { onClose(); navigate(path) }

  const initiales = `${client?.prenom?.[0] || ''}${client?.nom?.[0] || ''}`.toUpperCase()

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'rgba(0,0,0,0.25)',
      }} />

      <div style={{
        position: 'fixed', top: 60, right: 14, zIndex: 160,
        width: 250, background: 'white', borderRadius: 18,
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>

        {/* Header */}
        <div style={{ padding: '1.1rem 1.1rem 0.85rem', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" style={{
                width: 42, height: 42, borderRadius: '50%',
                objectFit: 'cover', flexShrink: 0,
                border: '2px solid var(--accent-stripe)',
              }} />
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: '#333333', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '800', fontSize: '0.95rem', flexShrink: 0,
              }}>{initiales}</div>
            )}
            <div>
              <p style={{ margin: 0, fontWeight: '800', fontSize: '0.9rem', color: '#1a1a1a' }}>
                {client?.prenom} {client?.nom}
              </p>
              {client?.offre && (
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: '#9ca3af', fontWeight: '600' }}>
                  {OFFRES[client.offre] || client.offre}
                </p>
              )}
            </div>
          </div>
          {client?.objectif && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.4, fontStyle: 'italic' }}>
              "{client.objectif}"
            </p>
          )}
        </div>

        {/* Items */}
        <div style={{ padding: '0.4rem 0' }}>
          <MenuItem icon={<IconProfil />} label="Mon profil" onClick={() => go('/client/profil')} />
          <MenuItem icon={<IconWellness />} label="Mon wellness" onClick={() => go('/client/wellness')} />
          <MenuItem icon={<IconTests />} label="Mes tests" onClick={() => go('/client/tests')} />
          <MenuItem icon={<IconSciences />} label="Base scientifique" onClick={() => go('/client/sciences')} />
        </div>

        <div style={{ borderTop: '1px solid #f3f4f6', padding: '0.4rem 0' }}>
          {switchEmail && (
            <MenuItem icon={<IconSwitch />} label="Passer sur mon compte coach"
              onClick={() => { onClose(); switchAccount(switchEmail) }} />
          )}
          <MenuItem icon={<IconLogout />} label="Se déconnecter" onClick={handleLogout} danger />
        </div>
      </div>
    </>
  )
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.65rem 1.1rem', background: 'none', border: 'none',
      cursor: 'pointer', textAlign: 'left',
    }}
      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      <span style={{ color: danger ? '#ef4444' : '#6b7280', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: danger ? '#ef4444' : '#1a1a1a' }}>
        {label}
      </span>
    </button>
  )
}

function IconProfil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}
function IconWellness() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
function IconTests() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
function IconSciences() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}
function IconSwitch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}
function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
