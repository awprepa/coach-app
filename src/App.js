import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import AuthGate from './AuthGate'
import Clients from './pages/Clients'
import NouveauClient from './pages/NouveauClient'
import FicheClient from './pages/FicheClient'
import NouveauProgramme from './pages/NouveauProgramme'
import Programme from './pages/Programme'
import Seance from './pages/Seance'
import Login from './pages/Login'
import AccueilClient from './pages/AccueilClient'
import ProgrammeClient from './pages/client/ProgrammeClient'
import SeanceClient from './pages/client/SeanceClient'

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
              <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
                <Link to="/">Mes clients</Link>
                <Link to="/nouveau-client">Nouveau client</Link>
              </nav>
              <Clients />
            </>
          } />
          <Route path="/nouveau-client" element={
            <>
              <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
                <Link to="/">Mes clients</Link>
                <Link to="/nouveau-client">Nouveau client</Link>
              </nav>
              <NouveauClient />
            </>
          } />
          <Route path="/client/:id" element={
            <>
              <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
                <Link to="/">Mes clients</Link>
                <Link to="/nouveau-client">Nouveau client</Link>
              </nav>
              <FicheClient />
            </>
          } />
          <Route path="/client/:id/nouveau-programme" element={
            <>
              <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
                <Link to="/">Mes clients</Link>
                <Link to="/nouveau-client">Nouveau client</Link>
              </nav>
              <NouveauProgramme />
            </>
          } />
          <Route path="/programme/:id" element={
            <>
              <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
                <Link to="/">Mes clients</Link>
                <Link to="/nouveau-client">Nouveau client</Link>
              </nav>
              <Programme />
            </>
          } />
          <Route path="/seance/:id" element={
            <>
              <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
                <Link to="/">Mes clients</Link>
                <Link to="/nouveau-client">Nouveau client</Link>
              </nav>
              <Seance />
            </>
          } />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  )
}

export default App