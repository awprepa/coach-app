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
import Bibliotheque from './pages/Bibliotheque'
import GPS from './pages/GPS'
import Tests from './pages/Tests'
import Login from './pages/Login'
import ProgrammeClient from './pages/client/ProgrammeClient'
import SeanceClient from './pages/client/SeanceClient'
import TestsClient from './pages/client/TestsClient'
import MonProgrammeClient from './pages/client/MonProgrammeClient'
import WellnessClient from './pages/client/WellnessClient'
import GPSClient from './pages/client/GPSClient'
import SeanceProjection from './pages/SeanceProjection'
import ImportClientExcel from './pages/ImportClientExcel'
import NotificationsClient from './pages/client/NotificationsClient'
import MessagesClient from './pages/client/MessagesClient'
import CoachMessages from './pages/CoachMessages'
import ChargeEntrainement from './pages/ChargeEntrainement'
import Paiements from './pages/Paiements'
import { NotifProvider } from './context/NotifContext'
import { TimerProvider } from './context/TimerContext'
import GlobalTimerBubble from './components/GlobalTimerBubble'

function WithNav({ children }) {
  return <><CoachNav />{children}</>
}

// Entoure toutes les pages client avec le provider de notifs (un seul channel Realtime)
function WithNotifs({ children }) {
  return <NotifProvider>{children}</NotifProvider>
}

function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <TimerProvider>
        <GlobalTimerBubble />
        <Routes>
          {/* Client-facing — enveloppés dans NotifProvider pour un seul channel Realtime */}
          <Route path="/client/programme/:id"  element={<WithNotifs><ProgrammeClient /></WithNotifs>} />
          <Route path="/client/seance/:id"     element={<WithNotifs><SeanceClient /></WithNotifs>} />
          <Route path="/client/tests"          element={<WithNotifs><TestsClient /></WithNotifs>} />
          <Route path="/client/wellness"       element={<WithNotifs><WellnessClient /></WithNotifs>} />
          <Route path="/client/gps"            element={<WithNotifs><GPSClient /></WithNotifs>} />
          <Route path="/client/mon-programme"  element={<WithNotifs><MonProgrammeClient /></WithNotifs>} />
          <Route path="/client/accueil"        element={<WithNotifs><Home /></WithNotifs>} />
          <Route path="/client/notifications"  element={<WithNotifs><NotificationsClient /></WithNotifs>} />
          <Route path="/client/messages"       element={<WithNotifs><MessagesClient /></WithNotifs>} />
          <Route path="/login"                 element={<Login />} />

          {/* Unified home — coach voit Dashboard, client voit AccueilClient */}
          <Route path="/" element={<WithNotifs><Home /></WithNotifs>} />

          {/* Coach-only */}
          <Route path="/clients"                      element={<WithNav><Clients /></WithNav>} />
          <Route path="/nouveau-client"               element={<WithNav><NouveauClient /></WithNav>} />
          <Route path="/client/:id"                   element={<WithNav><FicheClient /></WithNav>} />
          <Route path="/client/:id/nouveau-programme"  element={<WithNav><NouveauProgramme /></WithNav>} />
          <Route path="/client/:id/import-excel"      element={<WithNav><ImportClientExcel /></WithNav>} />
          <Route path="/programme/:id"                element={<WithNav><Programme /></WithNav>} />
          <Route path="/seance/:id"                   element={<WithNav><Seance /></WithNav>} />
          <Route path="/seance/:id/projection"        element={<SeanceProjection />} />
          <Route path="/bibliotheque"                 element={<WithNav><Bibliotheque /></WithNav>} />
          <Route path="/gps"                          element={<WithNav><GPS /></WithNav>} />
          <Route path="/tests"                        element={<WithNav><Tests /></WithNav>} />
          <Route path="/messages"                     element={<WithNav><CoachMessages /></WithNav>} />
          <Route path="/charge"                       element={<WithNav><ChargeEntrainement /></WithNav>} />
          <Route path="/paiements"                    element={<WithNav><Paiements /></WithNav>} />
        </Routes>
        </TimerProvider>
      </AuthGate>
    </BrowserRouter>
  )
}

export default App
