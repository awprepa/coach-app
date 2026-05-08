import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthGate from './AuthGate'
import CoachNav from './CoachNav'
import Home from './pages/Home'
import Clients from './pages/Clients'
import NouveauClient from './pages/NouveauClient'
import FicheClient from './pages/FicheClient'
import NouveauProgramme from './pages/NouveauProgramme'
import Programme from './pages/Programme'
import Seance from './pages/Seance'
import BibliothequeExercices from './pages/BibliothequeExercices'
import GPS from './pages/GPS'
import Tests from './pages/Tests'
import SeanceTemplates from './pages/SeanceTemplates'
import Login from './pages/Login'
import ProgrammeClient from './pages/client/ProgrammeClient'
import SeanceClient from './pages/client/SeanceClient'
import TestsClient from './pages/client/TestsClient'
import MonProgrammeClient from './pages/client/MonProgrammeClient'
import WellnessClient from './pages/client/WellnessClient'
import GPSClient from './pages/client/GPSClient'

function WithNav({ children }) {
  return <><CoachNav />{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          {/* Client-facing */}
          <Route path="/client/programme/:id" element={<ProgrammeClient />} />
          <Route path="/client/seance/:id"    element={<SeanceClient />} />
          <Route path="/client/tests"         element={<TestsClient />} />
          <Route path="/client/wellness"      element={<WellnessClient />} />
          <Route path="/client/gps"           element={<GPSClient />} />
          <Route path="/client/mon-programme" element={<MonProgrammeClient />} />
          <Route path="/client/accueil"       element={<Home />} />
          <Route path="/login"                element={<Login />} />

          {/* Unified home — coach sees Dashboard, client sees AccueilClient */}
          <Route path="/" element={<Home />} />

          {/* Coach-only */}
          <Route path="/clients"                      element={<WithNav><Clients /></WithNav>} />
          <Route path="/nouveau-client"               element={<WithNav><NouveauClient /></WithNav>} />
          <Route path="/client/:id"                   element={<WithNav><FicheClient /></WithNav>} />
          <Route path="/client/:id/nouveau-programme" element={<WithNav><NouveauProgramme /></WithNav>} />
          <Route path="/programme/:id"                element={<WithNav><Programme /></WithNav>} />
          <Route path="/seance/:id"                   element={<WithNav><Seance /></WithNav>} />
          <Route path="/bibliotheque"                 element={<WithNav><BibliothequeExercices /></WithNav>} />
          <Route path="/gps"                          element={<WithNav><GPS /></WithNav>} />
          <Route path="/tests"                        element={<WithNav><Tests /></WithNav>} />
          <Route path="/modeles"                      element={<WithNav><SeanceTemplates /></WithNav>} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  )
}

export default App
