import { lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthGate from './AuthGate'
import CoachNav from './CoachNav'
import { NotifProvider } from './context/NotifContext'
import { TimerProvider } from './context/TimerContext'
import GlobalTimerBubble from './components/GlobalTimerBubble'

// ── Pages chargées immédiatement (Auth critique) ──────────────────────────────
import Login from './pages/Login'
import Home  from './pages/Home'

// ── Pages client — lazy (jamais vues par le coach) ───────────────────────────
const ProgrammeClient      = lazy(() => import('./pages/client/ProgrammeClient'))
const SeanceClient         = lazy(() => import('./pages/client/SeanceClient'))
const TestsClient          = lazy(() => import('./pages/client/TestsClient'))
const WellnessClient       = lazy(() => import('./pages/client/WellnessClient'))
const GPSClient            = lazy(() => import('./pages/client/GPSClient'))
const MonProgrammeClient   = lazy(() => import('./pages/client/MonProgrammeClient'))
const NotificationsClient  = lazy(() => import('./pages/client/NotificationsClient'))
const MessagesClient       = lazy(() => import('./pages/client/MessagesClient'))
const NutritionClient      = lazy(() => import('./pages/client/NutritionClient'))
const AjouterRepas         = lazy(() => import('./pages/client/AjouterRepas'))
const HistoriqueNutrition  = lazy(() => import('./pages/client/HistoriqueNutrition'))
const ProfilNutrition      = lazy(() => import('./pages/client/ProfilNutrition'))
const ScannerArticle       = lazy(() => import('./pages/client/ScannerArticle'))
const HistoriqueScans      = lazy(() => import('./pages/client/HistoriqueScans'))
const SciencesClient       = lazy(() => import('./pages/client/SciencesClient'))
const MentionsLegales      = lazy(() => import('./pages/client/MentionsLegales'))

// ── Pages coach — lazy (jamais vues par le client) ───────────────────────────
const Clients              = lazy(() => import('./pages/Clients'))
const NouveauClient        = lazy(() => import('./pages/NouveauClient'))
const FicheClient          = lazy(() => import('./pages/FicheClient'))
const NouveauProgramme     = lazy(() => import('./pages/NouveauProgramme'))
const Programme            = lazy(() => import('./pages/Programme'))
const Seance               = lazy(() => import('./pages/Seance'))
const Bibliotheque         = lazy(() => import('./pages/Bibliotheque'))
const GPS                  = lazy(() => import('./pages/GPS'))
const Tests                = lazy(() => import('./pages/Tests'))
const ResetPassword        = lazy(() => import('./pages/ResetPassword'))
const SeanceProjection     = lazy(() => import('./pages/SeanceProjection'))
const ImportClientExcel    = lazy(() => import('./pages/ImportClientExcel'))
const CoachMessages        = lazy(() => import('./pages/CoachMessages'))
const ChargeEntrainement   = lazy(() => import('./pages/ChargeEntrainement'))
const Paiements            = lazy(() => import('./pages/Paiements'))
// ── Wrappers ──────────────────────────────────────────────────────────────────
function WithNav({ children }) {
  return <><CoachNav />{children}</>
}

function WithNotifs({ children }) {
  return <NotifProvider>{children}</NotifProvider>
}

// Fallback minimaliste — évite un flash blanc prolongé
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh', background: '#efefef',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid #e5e7eb', borderTopColor: '#1a1a1a',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// Gestion des erreurs de chargement de chunk (après nouveau déploiement)
class ChunkErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError(err) {
    // Chunk introuvable (hash périmé après déploiement) → reload forcé
    if (err?.name === 'ChunkLoadError' || err?.message?.includes('Loading chunk')) {
      window.location.reload(true)
    }
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', gap: 12 }}>
        <span style={{ fontSize: '2rem' }}>⚠️</span>
        <p style={{ fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Une erreur est survenue</p>
        <button onClick={() => window.location.reload(true)} style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 800, cursor: 'pointer' }}>
          Recharger la page
        </button>
      </div>
    )
    return this.props.children
  }
}

function App() {
  return (
    <BrowserRouter>
      <ChunkErrorBoundary>
      <AuthGate>
        <TimerProvider>
          <GlobalTimerBubble />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ── Client ── */}
              <Route path="/client/programme/:id"        element={<WithNotifs><ProgrammeClient /></WithNotifs>} />
              <Route path="/client/seance/:id"           element={<WithNotifs><SeanceClient /></WithNotifs>} />
              <Route path="/client/tests"                element={<WithNotifs><TestsClient /></WithNotifs>} />
              <Route path="/client/wellness"             element={<WithNotifs><WellnessClient /></WithNotifs>} />
              <Route path="/client/gps"                  element={<WithNotifs><GPSClient /></WithNotifs>} />
              <Route path="/client/mon-programme"        element={<WithNotifs><MonProgrammeClient /></WithNotifs>} />
              <Route path="/client/accueil"              element={<WithNotifs><Home /></WithNotifs>} />
              <Route path="/client/notifications"        element={<WithNotifs><NotificationsClient /></WithNotifs>} />
              <Route path="/client/messages"             element={<WithNotifs><MessagesClient /></WithNotifs>} />
              <Route path="/client/nutrition"            element={<WithNotifs><NutritionClient /></WithNotifs>} />
              <Route path="/client/nutrition/ajouter"    element={<WithNotifs><AjouterRepas /></WithNotifs>} />
              <Route path="/client/nutrition/historique" element={<WithNotifs><HistoriqueNutrition /></WithNotifs>} />
              <Route path="/client/nutrition/profil"     element={<WithNotifs><ProfilNutrition /></WithNotifs>} />
              <Route path="/client/nutrition/scanner"    element={<WithNotifs><ScannerArticle /></WithNotifs>} />
              <Route path="/client/nutrition/scans"      element={<WithNotifs><HistoriqueScans /></WithNotifs>} />
              <Route path="/client/sciences"             element={<WithNotifs><SciencesClient /></WithNotifs>} />
              <Route path="/client/mentions-legales"    element={<MentionsLegales />} />

              {/* ── Auth ── */}
              <Route path="/login"          element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* ── Home (coach → Dashboard, client → AccueilClient) ── */}
              <Route path="/" element={<WithNotifs><Home /></WithNotifs>} />

              {/* ── Coach ── */}
              <Route path="/clients"                     element={<WithNav><Clients /></WithNav>} />
              <Route path="/nouveau-client"              element={<WithNav><NouveauClient /></WithNav>} />
              <Route path="/client/:id"                  element={<WithNav><FicheClient /></WithNav>} />
              <Route path="/client/:id/nouveau-programme" element={<WithNav><NouveauProgramme /></WithNav>} />
              <Route path="/client/:id/import-excel"     element={<WithNav><ImportClientExcel /></WithNav>} />
              <Route path="/programme/:id"               element={<WithNav><Programme /></WithNav>} />
              <Route path="/seance/:id"                  element={<WithNav><Seance /></WithNav>} />
              <Route path="/seance/:id/projection"       element={<SeanceProjection />} />
              <Route path="/bibliotheque"                element={<WithNav><Bibliotheque /></WithNav>} />
              <Route path="/gps"                         element={<WithNav><GPS /></WithNav>} />
              <Route path="/tests"                       element={<WithNav><Tests /></WithNav>} />
              <Route path="/messages"                    element={<WithNav><CoachMessages /></WithNav>} />
              <Route path="/charge"                      element={<WithNav><ChargeEntrainement /></WithNav>} />
              <Route path="/paiements"                   element={<WithNav><Paiements /></WithNav>} />
            </Routes>
          </Suspense>
        </TimerProvider>
      </AuthGate>
      </ChunkErrorBoundary>
    </BrowserRouter>
  )
}

export default App
