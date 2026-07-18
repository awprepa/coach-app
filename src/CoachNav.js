import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase, maybeSyncDown } from './supabase'
import { canSwitch, switchAccount } from './accountSwitch'

const ICONS = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  clients:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  groupes:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
  plus:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>,
  calendar:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  book:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  gps:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  tests:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/></svg>,
  messages:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  paiements: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  factures:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></svg>,
  nutrition: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
}

// Entrées principales, toujours visibles dans la barre.
const NAV = [
  { to: '/',            icon: 'dashboard', label: 'Tableau de bord', end: true },
  { to: '/clients',     icon: 'clients',   label: 'Clients' },
  { to: '/groupes',     icon: 'groupes',   label: 'Groupes' },
  { to: '/agenda',      icon: 'calendar',  label: 'Agenda' },
  { to: '/bibliotheque',icon: 'book',      label: 'Bibliothèque' },
  { to: '/nutrition',   icon: 'nutrition', label: 'Nutrition' },
  { to: '/messages',    icon: 'messages',  label: 'Messagerie' },
]

// Entrées secondaires : regroupées sous « Plus » sur desktop (la barre tenait
// sur 2 lignes et débordait de sa hauteur fixe avec 10 entrées). Sur mobile
// elles restent à plat dans le menu hamburger, qui a la place.
const NAV_PLUS = [
  { to: '/gps',      icon: 'gps',      label: 'GPS' },
  { to: '/tests',    icon: 'tests',    label: 'Tests' },
  { to: '/factures', icon: 'factures', label: 'Facturation' },
]

export default function CoachNav() {
  const navigate = useNavigate()
  const [newClients, setNewClients] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)   // menu mobile (hamburger)
  // Menu « Plus » (desktop). Rendu dans un portail : la barre défile en
  // horizontal (overflow-x), ce qui rognerait un menu positionné à l'intérieur.
  const [plusOpen, setPlusOpen] = useState(false)
  const [plusPos, setPlusPos]   = useState({ top: 0, left: 0 })
  const plusBtnRef = useRef(null)
  const location = useLocation()
  const plusActif = NAV_PLUS.some(i => location.pathname.startsWith(i.to))

  function ouvrirPlus() {
    const r = plusBtnRef.current?.getBoundingClientRect()
    if (r) setPlusPos({ top: r.bottom + 6, left: r.left })
    setPlusOpen(o => !o)
  }
  const [switchEmail, setSwitchEmail] = useState(null) // email si bascule possible (comptes d'Arthur)
  const [unreadMsgs, setUnreadMsgs] = useState(0)

  useEffect(() => {
    supabase.from('clients').select('id', { count: 'exact', head: true })
      .eq('coach_notifie', false)
      .then(({ count }) => setNewClients(count || 0))
    // Warm sync : remplit la base locale pour le hors-ligne (Phase 3)
    maybeSyncDown().catch(() => {})
    // Bascule de compte : proposée uniquement sur les comptes d'Arthur
    supabase.auth.getSession().then(({ data }) => {
      const email = data?.session?.user?.email
      if (email && canSwitch(email)) setSwitchEmail(email)
    })
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
    try { await supabase.auth.signOut({ scope: 'local' }) } catch (e) { console.error(e) }
    navigate('/login')
  }

  return (
    <nav className="coachnav">
      <style>{CSS}</style>
      <NavLink to="/" end className="coachnav-brand">
        <img src="/logo-noir.png" alt="AWprepa" className="coachnav-logo" />
      </NavLink>
      <div className={`coachnav-items${menuOpen ? ' open' : ''}`}>
        {NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className="coachnav-link" onClick={() => setMenuOpen(false)}>
            <span className="coachnav-ico">{ICONS[item.icon]}</span>
            {item.label}
            {item.to === '/' && <span className="coachnav-badge" style={{visibility: newClients > 0 ? 'visible' : 'hidden'}}>{newClients}</span>}
            {item.to === '/messages' && unreadMsgs > 0 && <span className="coachnav-badge coachnav-badge-msg">{unreadMsgs}</span>}
          </NavLink>
        ))}
        {/* Secondaires : menu « Plus » sur desktop… */}
        <div className="coachnav-plus">
          <button
            ref={plusBtnRef}
            className={`coachnav-link coachnav-plus-btn${plusActif ? ' active' : ''}`}
            onClick={ouvrirPlus}
            aria-expanded={plusOpen}
          >
            <span className="coachnav-ico">{ICONS.plus}</span>
            Plus
          </button>
        </div>

        {/* …et à plat dans le menu mobile, qui a la place. */}
        {NAV_PLUS.map(item => (
          <NavLink key={item.to} to={item.to} className="coachnav-link coachnav-link-plus" onClick={() => setMenuOpen(false)}>
            <span className="coachnav-ico">{ICONS[item.icon]}</span>
            {item.label}
          </NavLink>
        ))}

        {switchEmail && (
          <button onClick={() => switchAccount(switchEmail)} className="coachnav-logout coachnav-logout-m" style={{ marginTop: 10, background: '#333', color: '#e4f816', borderColor: '#333' }}>
            ⇄ Passer sur mon compte client
          </button>
        )}
        <button onClick={handleLogout} className="coachnav-logout coachnav-logout-m">Déconnexion</button>
      </div>
      <button
        className="coachnav-burger"
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Menu"
      >
        {(newClients > 0 || unreadMsgs > 0) && !menuOpen && <span className="coachnav-burger-dot" />}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          {menuOpen
            ? <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>
            : <><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></>}
        </svg>
      </button>
      {switchEmail && (
        <button onClick={() => switchAccount(switchEmail)} className="coachnav-logout coachnav-logout-d" title="Passer sur mon compte client">⇄ Client</button>
      )}
      <button onClick={handleLogout} className="coachnav-logout coachnav-logout-d">Déconnexion</button>

      {plusOpen && createPortal(
        <>
          <div className="coachnav-plus-backdrop" onClick={() => setPlusOpen(false)} />
          <div className="coachnav-plus-menu" style={{ top: plusPos.top, left: plusPos.left }}>
            {NAV_PLUS.map(item => (
              <NavLink key={item.to} to={item.to} className="coachnav-plus-item" onClick={() => setPlusOpen(false)}>
                <span className="coachnav-ico">{ICONS[item.icon]}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </>,
        document.body
      )}
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
/* nowrap + défilement : la barre a une hauteur fixe, un retour à la ligne la
   ferait déborder (bug observé à 1280px avec 10 entrées). */
.coachnav-items{display:flex;gap:2px;flex:1;flex-wrap:nowrap;min-width:0;
  overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;}
.coachnav-items::-webkit-scrollbar{display:none;}
.coachnav-link{
  display:flex;align-items:center;gap:5px;flex-shrink:0;
  color:#5b626c;text-decoration:none;font-size:0.82rem;font-weight:600;
  padding:8px 10px;border-radius:8px;transition:background .15s,color .15s;
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
.coachnav-badge-msg{background:#e4f816;color:#333333;}
.coachnav-link.active .coachnav-badge-msg{background:#e4f816;color:#333333;}
.coachnav-logout{
  flex-shrink:0;background:#fff;color:#5b626c;
  border:1px solid #e6e8ec;border-radius:8px;
  padding:7px 14px;font-size:0.8rem;font-weight:600;cursor:pointer;
  transition:background .15s;
}
.coachnav-logout:hover{background:#f3f4f6;}
/* ── Menu « Plus » (desktop) ────────────────────────────────────────────── */
.coachnav-plus{position:relative;display:flex;align-items:center;}
.coachnav-plus-btn{
  border:none;background:transparent;cursor:pointer;font-family:inherit;
}
.coachnav-plus-btn.active{background:#333333;color:#fff;}
.coachnav-plus-btn.active .coachnav-ico svg{stroke:#e4f816;}
.coachnav-plus-backdrop{position:fixed;inset:0;z-index:110;}
.coachnav-plus-menu{
  position:fixed;z-index:120;
  background:#fff;border:1px solid #e6e8ec;border-radius:10px;
  box-shadow:0 10px 30px rgba(0,0,0,0.14);padding:5px;min-width:178px;
  display:flex;flex-direction:column;gap:2px;
}
.coachnav-plus-item{
  display:flex;align-items:center;gap:8px;
  color:#5b626c;text-decoration:none;font-size:0.85rem;font-weight:600;
  padding:9px 12px;border-radius:8px;white-space:nowrap;
}
.coachnav-plus-item:hover{background:#f3f4f6;color:#333333;}
.coachnav-plus-item.active{background:#333333;color:#fff;}
.coachnav-plus-item.active .coachnav-ico svg{stroke:#e4f816;}
/* Les secondaires à plat n'existent que dans le menu mobile */
.coachnav-link-plus{display:none;}

/* Hamburger + déconnexion mobile : inexistants sur desktop */
.coachnav-burger{display:none;}
.coachnav-logout-m{display:none;}

/* ── Mobile uniquement (≤820px) — le desktop au-dessus est strictement inchangé ── */
@media (max-width: 820px){
  .coachnav{padding:0 14px;gap:12px;justify-content:space-between;}
  .coachnav-items{display:none;}
  .coachnav-items.open{
    display:flex;flex-direction:column;gap:2px;
    position:absolute;top:62px;left:0;right:0;
    background:#fff;border-bottom:1px solid #e6e8ec;
    padding:10px 12px 14px;box-shadow:0 14px 30px rgba(0,0,0,0.12);
    max-height:calc(100dvh - 62px);overflow-y:auto;
  }
  .coachnav-items.open .coachnav-link{padding:12px 14px;font-size:0.95rem;}
  /* Sur mobile : tout à plat dans le hamburger, pas de sous-menu « Plus » */
  .coachnav-plus{display:none;}
  .coachnav-link-plus{display:flex;}
  .coachnav-logout-d{display:none;}
  .coachnav-logout-m{display:block;margin-top:10px;width:100%;padding:11px;}
  .coachnav-burger{
    display:flex;align-items:center;justify-content:center;position:relative;
    width:42px;height:42px;flex-shrink:0;background:#fff;
    border:1px solid #e6e8ec;border-radius:10px;color:#333;cursor:pointer;
  }
  .coachnav-burger svg{width:20px;height:20px;}
  .coachnav-burger-dot{
    position:absolute;top:7px;right:7px;width:8px;height:8px;border-radius:50%;
    background:#e4f816;border:1.5px solid #333;
  }
}
`
