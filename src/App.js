import { lazy, Suspense, Component, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
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
const MonProgrammeClient        = lazy(() => import('./pages/client/MonProgrammeClient'))
const SeancePonctuelleClient    = lazy(() => import('./pages/client/SeancePonctuelleClient'))
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
const CGV                  = lazy(() => import('./pages/CGV'))

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
const FicheGroupe          = lazy(() => import('./pages/FicheGroupe'))
// ── Bannière navigateur intégré (Instagram / TikTok) ─────────────────────────
function BanniereNavigateur() {
  const location       = useLocation()
  const ua             = navigator.userAgent
  const isInAppBrowser = /Instagram|FBAN|FBAV|TikTok/i.test(ua)
  const isIOS          = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid      = /Android/i.test(ua)
  const isStandalone   = window.navigator.standalone === true ||
                         window.matchMedia('(display-mode: standalone)').matches
  const isLoginPage    = location.pathname === '/login'

  // ── Cas 1 : navigateur intégré Instagram / TikTok ────────────────────────
  const [inAppFerme, setInAppFerme] = useState(false)

  // ── Cas 2 : Safari iOS / Chrome Android (pas encore installé comme PWA) ──
  const lsKey = 'awprepa_safari_banner_dismissed'
  function lsGet(k)    { try { return localStorage.getItem(k) }    catch (_e) { return null } }
  function lsSet(k, v) { try { localStorage.setItem(k, v) }        catch (_e) {} }

  const [safariFerme, setSafariFerme] = useState(() => lsGet(lsKey) === '1')

  function dismissSafari() { lsSet(lsKey, '1'); setSafariFerme(true) }

  // In-app browser → bannière haute jaune
  if (isInAppBrowser && !inAppFerme) {
    const message = isIOS
      ? "Navigateur Instagram/TikTok détecté. Appuyez sur ··· puis « Ouvrir dans Safari » pour accéder à AWPrepa correctement."
      : "Navigateur Instagram/TikTok détecté. Appuyez sur ··· puis « Ouvrir dans Chrome » pour accéder à AWPrepa correctement."
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
        background: '#FEF9C3', padding: '12px 16px',
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
      }}>
        <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>⚠️</span>
        <p style={{ margin: 0, flex: 1, fontSize: '13px', color: '#1a1a1a', lineHeight: '1.5' }}>
          {message}
        </p>
        <button onClick={() => setInAppFerme(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#555', flexShrink: 0, padding: '0 0 0 6px', lineHeight: 1 }}
          aria-label="Fermer">✕</button>
      </div>
    )
  }

  // Safari iOS (ou Android Chrome), pas en standalone, pas sur /login, bannière non fermée
  const showInstallBanner = !isInAppBrowser && !isStandalone && !safariFerme && !isLoginPage && (isIOS || isAndroid)
  if (!showInstallBanner) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
      background: '#1a1a1a', color: 'white',
      padding: '14px 16px 20px',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo192.png" alt="AWPrepa"
            style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: '14px', color: '#e4f816' }}>AWprepa</p>
            <p style={{ margin: 0, fontSize: '11px', color: '#9ca3af' }}>Installer l'application</p>
          </div>
        </div>
        <button onClick={dismissSafari}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', padding: '0 4px', lineHeight: 1 }}
          aria-label="Fermer">✕</button>
      </div>

      {/* Étapes */}
      {isIOS ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={stepStyle}>
            <span style={numStyle}>1</span>
            <span style={txtStyle}>Appuyez sur le bouton <strong style={{ color: '#e4f816' }}>Partager ⬆</strong> en bas de Safari</span>
          </div>
          <div style={stepStyle}>
            <span style={numStyle}>2</span>
            <span style={txtStyle}>Faites défiler et choisissez <strong style={{ color: '#e4f816' }}>« Sur l'écran d'accueil »</strong></span>
          </div>
          <div style={stepStyle}>
            <span style={numStyle}>3</span>
            <span style={txtStyle}>Appuyez sur <strong style={{ color: '#e4f816' }}>Ajouter</strong> en haut à droite</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={stepStyle}>
            <span style={numStyle}>1</span>
            <span style={txtStyle}>Appuyez sur le menu <strong style={{ color: '#e4f816' }}>⋮</strong> en haut à droite de Chrome</span>
          </div>
          <div style={stepStyle}>
            <span style={numStyle}>2</span>
            <span style={txtStyle}>Choisissez <strong style={{ color: '#e4f816' }}>« Ajouter à l'écran d'accueil »</strong></span>
          </div>
        </div>
      )}
    </div>
  )
}

const stepStyle = {
  display: 'flex', alignItems: 'flex-start', gap: '10px',
  background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px',
}
const numStyle = {
  width: 20, height: 20, borderRadius: '50%', background: '#e4f816',
  color: '#1a1a1a', fontWeight: 900, fontSize: '11px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
}
const txtStyle = { fontSize: '13px', color: '#e5e7eb', lineHeight: 1.45 }

// ── Scroll en haut à chaque changement de route ───────────────────────────────
// Désactive le scroll restoration natif du navigateur (qui mémorise la position
// d'une page scrollée et la restaure à la navigation suivante)
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    // Reset sur tous les conteneurs possibles (window + html + body)
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [pathname])
  return null
}

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
      <ScrollToTop />
      <BanniereNavigateur />
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
              <Route path="/client/mon-programme"           element={<WithNotifs><MonProgrammeClient /></WithNotifs>} />
              <Route path="/client/seance-ponctuelle/:id" element={<WithNotifs><SeancePonctuelleClient /></WithNotifs>} />
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
              <Route path="/cgv"            element={<CGV />} />

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
              <Route path="/groupe/:id"                  element={<WithNav><FicheGroupe /></WithNav>} />
              <Route path="/groupe/:groupeId/nouveau-programme" element={<WithNav><NouveauProgramme /></WithNav>} />
            </Routes>
          </Suspense>
        </TimerProvider>
      </AuthGate>
      </ChunkErrorBoundary>
    </BrowserRouter>
  )
}

export default App
