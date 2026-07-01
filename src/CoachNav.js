import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const ICONS = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  clients:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  calendar:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  book:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  gps:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  tests:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/></svg>,
  messages:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  paiements: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  factures:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>,
  nutrition: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
}

const NAV = [
  { to: '/',            icon: 'dashboard', label: 'Tableau de bord', end: true },
  { to: '/clients',     icon: 'clients',   label: 'Clients' },
  { to: '/bibliotheque',icon: 'book',      label: 'Bibliothèque' },
  { to: '/nutrition',   icon: 'nutrition', label: 'Nutrition' },
  { to: '/gps',         icon: 'gps',       label: 'GPS' },
  { to: '/tests',       icon: 'tests',     label: 'Tests' },
  { to: '/messages',    icon: 'messages',  label: 'Messagerie' },
  { to: '/factures',    icon: 'factures',  label: 'Facturation' },
]

export default function CoachNav() {
  const navigate = useNavigate()
  const [newClients, setNewClients] = useState(0)
  const [unreadMsgs, setUnreadMsgs] = useState(0)

  useEffect(() => {
    supabase.from('clients').select('id', { count: 'exact', head: true })
      .eq('coach_notifie', false)
      .then(({ count }) => setNewClients(count || 0))
  }, [])

  // Messages non lus reçus par le coach.
  // Realtime en priorité, complété par un rafraîchissement au focus/visibilité
  // et un poll léger (filet de sécurité si le realtime rate un événement).
  useEffect(() => {
    let coachId = null
    let channel = null
    let poll = null
    let alive = true

    async function refreshUnread() {
      if (!coachId || !alive) return
      // Même logique éprouvée que la page CoachMessages (évite tout souci
      // RLS lié au count/head) : on lit les messages du coach et on compte
      // ceux reçus non lus, côté client.
      const { data } = await supabase.from('messages')
        .select('from_id, to_id, lu')
        .or(`from_id.eq.${coachId},to_id.eq.${coachId}`)
      const n = (data || []).filter(m => m.to_id === coachId && !m.lu).length
      if (alive) setUnreadMsgs(n)
    }

    function onFocus() { refreshUnread() }
    function onVisible() { if (document.visibilityState === 'visible') refreshUnread() }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !alive) return
      coachId = user.id
      await refreshUnread()

      channel = supabase.channel('coachnav-messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, payload => {
          const row = payload.new || payload.old
          // Tout changement touchant le coach (nouveau message reçu, ou lu=true) → recompter
          if (row?.to_id === coachId) refreshUnread()
        })
        .subscribe()

      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', onVisible)
      poll = setInterval(refreshUnread, 20000)
    }

    init()
    return () => {
      alive = false
      if (channel) supabase.removeChannel(channel)
      if (poll) clearInterval(poll)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  async function handleLogout() {
    try { await supabase.auth.signOut() } catch (e) { console.error(e) }
    navigate('/login')
  }

  return (
    <nav className="coachnav">
      <style>{CSS}</style>
      <NavLink to="/" end className="coachnav-brand">
        <img src="/logo-noir.png" alt="AWprepa" className="coachnav-logo" />
      </NavLink>
      <div className="coachnav-items">
        {NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className="coachnav-link">
            <span className="coachnav-ico">{ICONS[item.icon]}</span>
            {item.label}
            {item.to === '/' && <span className="coachnav-badge" style={{visibility: newClients > 0 ? 'visible' : 'hidden'}}>{newClients}</span>}
            {item.to === '/messages' && unreadMsgs > 0 && <span className="coachnav-badge coachnav-badge-msg">{unreadMsgs}</span>}
          </NavLink>
        ))}
      </div>
      <button onClick={handleLogout} className="coachnav-logout">Déconnexion</button>
    </nav>
  )
}

const CSS = `
.coachnav{
  position:sticky;top:0;z-index:100;
  background:#fff;height:62px;display:flex;align-items:center;
  padding:0 22px;gap:22px;border-bottom:1px solid #e6e8ec;
  box-shadow:0 1px 0 rgba(0,0,0,0.02);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
.coachnav-brand{flex-shrink:0;display:flex;align-items:center;text-decoration:none;}
.coachnav-logo{height:38px;width:auto;display:block;}
.coachnav-items{display:flex;gap:2px;flex:1;flex-wrap:wrap;}
.coachnav-link{
  display:flex;align-items:center;gap:6px;
  color:#5b626c;text-decoration:none;font-size:0.85rem;font-weight:600;
  padding:8px 13px;border-radius:8px;transition:background .15s,color .15s;
  white-space:nowrap;
}
.coachnav-ico svg{width:16px;height:16px;display:block;}
.coachnav-link:hover{background:#f3f4f6;color:#333333;}
.coachnav-link.active{background:#333333;color:#fff;}
.coachnav-link.active .coachnav-ico svg{stroke:#e4f816;}
.coachnav-badge{
  background:#333333;color:#e4f816;border-radius:999px;
  font-size:0.62rem;font-weight:800;padding:1px 6px;margin-left:2px;
}
.coachnav-link.active .coachnav-badge{background:#e4f816;color:#333333;}
.coachnav-badge-msg{background:#dc2626;color:#fff;}
.coachnav-link.active .coachnav-badge-msg{background:#dc2626;color:#fff;}
.coachnav-logout{
  flex-shrink:0;background:#fff;color:#5b626c;
  border:1px solid #e6e8ec;border-radius:8px;
  padding:7px 14px;font-size:0.8rem;font-weight:600;cursor:pointer;
  transition:background .15s;
}
.coachnav-logout:hover{background:#f3f4f6;}
`
