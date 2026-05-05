import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Clients from './pages/Clients'
import NouveauClient from './pages/NouveauClient'

function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '2rem' }}>
        <Link to="/">Mes clients</Link>
        <Link to="/nouveau-client">Nouveau client</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Clients />} />
        <Route path="/nouveau-client" element={<NouveauClient />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App