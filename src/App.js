import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import AuthGate from './AuthGate'
import { supabase } from './supabase'
import Clients from './pages/Clients'
import NouveauClient from './pages/NouveauClient'
import FicheClient from './pages/FicheClient'
import NouveauProgramme from './pages/NouveauProgramme'
import Programme from './pages/Programme'
import Seance from './pages/Seance'
import BibliothequeExercices from './pages/BibliothequeExercices'
import GPS from './pages/GPS'
import Login from './pages/Login'
import AccueilClient from './pages/AccueilClient'
import ProgrammeClient from './pages/client/ProgrammeClient'
import SeanceClient from './pages/client/SeanceClient'

function CoachNav() {
  const navigate = useNavigate()
  async function handleLogout() {
    try { await supabase.auth.signOut() } catch (e) { console.error(e) }
    navigate('/login')
  }
  return (
    <nav style={{
      background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
      padding: '0 2rem',
      display: 'flex',
      alignItems: 'center',
      height: '60px',
      gap: '0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <Link to="/" style={{ color: 'white', fontWeight: '800', fontSize: '1.2rem', letterSpacing: '-0.5px', textDecoration: 'none', marginRight: '2.5rem' }}>
        AW<span style={{ color: '#e4f816' }}>prepa</span>
      </Link>
      <div style={{ display: 'flex', gap: '0.25rem', flex: 1 }}>
        <Link to="/" style={navLink}>Clients</Link>
        <Link to="/nouveau-client" style={navLink}>+ Nouveau client</Link>
        <Link to="/bibliotheque" style={navLink}>Bibliothèque</Link>
        <Link to="/gps" style={navLink}>GPS</Link>
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

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route path="/client/programme/:id" element={<ProgrammeClient />} />
          <Route path="/client/seance/:id" element={<SeanceClient />} />
          <Route path="/login" element={<Login />} />
          <Route path="/client/accueil" element={<AccueilClient />} />
          <Route path="/" element={
            <>
              <CoachNav />
              <Clients />
            </>
          } />
          <Route path="/nouveau-client" element={
            <>
              <CoachNav />
              <NouveauClient />
            </>
          } />
          <Route path="/client/:id" element={
            <>
              <CoachNav />
              <FicheClient />
            </>
          } />
          <Route path="/client/:id/nouveau-programme" element={
            <>
              <CoachNav />
              <NouveauProgramme />
            </>
          } />
          <Route path="/programme/:id" element={
            <>
              <CoachNav />
              <Programme />
            </>
          } />
          <Route path="/seance/:id" element={
            <>
              <CoachNav />
              <Seance />
            </>
          } />
          <Route path="/bibliotheque" element={
            <>
              <CoachNav />
              <BibliothequeExercices />
            </>
          } />
          <Route path="/gps" element={
            <>
              <CoachNav />
              <GPS />
            </>
          } />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  )
}

export default App