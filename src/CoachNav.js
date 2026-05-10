import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

export default function CoachNav() {
  const navigate = useNavigate()
  const [newClients, setNewClients] = useState(0)

  useEffect(() => {
    supabase.from('clients').select('id', { count: 'exact', head: true })
      .eq('coach_notifie', false)
      .then(({ count }) => setNewClients(count || 0))
  }, [])

  async function handleLogout() {
    try { await supabase.auth.signOut() } catch (e) { console.error(e) }
    navigate('/login')
  }

  return (
    <nav style={{
      background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
      padding: '0 2rem',
      display: 'flex',
      alignItems: 'center',
      height: '60px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <Link to="/" style={{ color: 'white', fontWeight: '800', fontSize: '1.2rem', letterSpacing: '-0.5px', textDecoration: 'none', marginRight: '2.5rem' }}>
        AW<span style={{ color: '#e4f816' }}>prepa</span>
      </Link>
      <div style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
        <Link to="/" style={navLink}>
          Tableau de bord {newClients > 0 && <span style={{ background: '#e4f816', color: '#333333', borderRadius: '999px', fontSize: '0.65rem', fontWeight: '800', padding: '1px 6px', marginLeft: '4px' }}>{newClients}</span>}
        </Link>
        <Link to="/nouveau-client" style={navLink}>Nouveau client</Link>
        <Link to="/bibliotheque" style={navLink}>Bibliothèque</Link>
        <Link to="/gps" style={navLink}>GPS</Link>
        <Link to="/tests" style={navLink}>Tests</Link>
        <Link to="/messages" style={navLink}>💬 Messagerie</Link>
        <Link to="/charge" style={navLink}>📊 Charge</Link>
        <Link to="/paiements" style={navLink}>💳 Paiements</Link>
      </div>
      <button onClick={handleLogout} style={logoutBtn}>Déconnexion</button>
    </nav>
  )
}

const navLink = {
  color: 'rgba(255,255,255,0.7)', textDecoration: 'none',
  fontSize: '0.875rem', fontWeight: '500',
  padding: '0.4rem 0.875rem', borderRadius: '8px',
  transition: 'all 0.15s',
}

const logoutBtn = {
  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
  padding: '0.4rem 0.875rem', fontSize: '0.875rem',
  cursor: 'pointer', fontWeight: '500',
}
