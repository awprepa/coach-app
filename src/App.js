import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Clients from './pages/Clients'
import NouveauClient from './pages/NouveauClient'
import FicheClient from './pages/FicheClient'
import NouveauProgramme from './pages/NouveauProgramme'
import Programme from './pages/Programme'
import Seance from './pages/Seance'

function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
        <Link to="/">Mes clients</Link>
        <Link to="/nouveau-client">Nouveau client</Link>
      </nav>
      <Routes>
        <Route path="/seance/:id" element={<Seance />} /><Route path="/seance/:id" element={<Seance />} />
        <Route path="/" element={<Clients />} />
        <Route path="/nouveau-client" element={<NouveauClient />} />
        <Route path="/client/:id" element={<FicheClient />} />
        <Route path="/client/:id/nouveau-programme" element={<NouveauProgramme />} />
        <Route path="/programme/:id" element={<Programme />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App