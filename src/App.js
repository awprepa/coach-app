import { lazy, Suspense, Component, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import AuthGate from './AuthGate'
import CoachNav from './CoachNav'
import { NotifProvider } from './context/NotifContext'
import { TimerProvider } from './context/TimerContext'
import { ClientThemeProvider } from './context/ClientThemeContext'
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
const ProgressionClient    = lazy(() => import('./pages/client/ProgressionClient'))
const MentionsLegales      = lazy(() => import('./pages/client/MentionsLegales'))
const ProfilClient         = lazy(() => import('./pages/client/ProfilClient'))
const CGV                  = lazy(() => import('./pages/CGV'))

// ── Pages coach — lazy (jamais vues par le client) ───────────────────────────
const Clients              = lazy(() => import('./pages/Clients'))
const NouveauClient        = lazy(() => import('./pages/NouveauClient'))
const FicheClient          = lazy(() => import('./pages/FicheClient'))
const RapportClient        = lazy(() => import('./pages/RapportClient'))
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
// ── Navigateur intégré Instagram / TikTok — bottom sheet ─────────────────────
function InAppBrowserSheet({ onDismiss }) {
  const ua         = navigator.userAgent
  const isIOS      = /iPhone|iPad|iPod/i.test(ua)
  const isInstagram = /Instagram/i.test(ua)
  const isTikTok    = /TikTok|BytedanceWebview|musical_ly/i.test(ua)

  const appName = isInstagram ? 'Instagram' : isTikTok ? 'TikTok' : 'cette app'
  const browserName = isIOS ? 'Safari' : 'Chrome'

  // Étapes selon plateforme
  const steps = isIOS ? [
    { icon: '···', text: <span>Appuie sur <strong style={{ color: '#fff' }}>···</strong> en haut à droite</span> },
    { icon: '🌐', text: <span>Puis <strong style={{ color: '#fff' }}>"Ouvrir dans Safari"</strong></span> },
  ] : [
    { icon: '···', text: <span>Appuie sur <strong style={{ color: '#fff' }}>⋮</strong> en haut à droite</span> },
    { icon: '🌐', text: <span>Puis <strong style={{ color: '#fff' }}>"Ouvrir dans Chrome"</strong></span> },
  ]

  return createPortal(
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      }} />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: '#1e1e1e',
        borderRadius: '24px 24px 0 0',
        padding: '12px 24px calc(env(safe-area-inset-bottom) + 32px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        {/* Poignée */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', marginBottom: 24 }} />

        {/* Icône app — fond jaune + logo noir, visible dans tous les navigateurs */}
        <div style={{
          width: 72, height: 72, borderRadius: 18, background: '#e4f816',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', overflow: 'hidden', marginBottom: 16,
        }}>
          <img src="/logo-noir.png" alt="AWprepa" style={{ width: '85%', height: '85%', objectFit: 'contain' }} />
        </div>

        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: 6, textAlign: 'center' }}>
          Ouvre dans {browserName}
        </p>
        <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.5, marginBottom: 22, maxWidth: 270 }}>
          Le navigateur d'{appName} ne supporte pas toutes les fonctionnalités de l'app.
        </p>

        {/* Étapes */}
        <div style={{
          width: '100%', background: 'rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '12px 14px', marginBottom: 20,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            Comment faire
          </p>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: '0.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)',
              }}>{s.icon}</div>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.35, margin: 0 }}>{s.text}</p>
            </div>
          ))}
        </div>

        <button onClick={onDismiss} style={{
          background: 'none', border: 'none',
          color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem',
          fontWeight: 500, cursor: 'pointer', padding: '8px',
        }}>
          Continuer quand même
        </button>
      </div>
    </>,
    document.body
  )
}

// ── BanniereNavigateur — rendu conditionnel selon contexte ────────────────────
function BanniereNavigateur() {
  const ua             = navigator.userAgent
  const isInAppBrowser = /Instagram|FBAN|FBAV|TikTok|BytedanceWebview/i.test(ua)
  const [inAppFerme, setInAppFerme] = useState(false)

  if (isInAppBrowser && !inAppFerme) {
    return <InAppBrowserSheet onDismiss={() => setInAppFerme(true)} />
  }

  return null
}

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
      <ClientThemeProvider>
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
              <Route path="/client/progression"          element={<WithNotifs><ProgressionClient /></WithNotifs>} />
              <Route path="/client/profil"              element={<WithNotifs><ProfilClient /></WithNotifs>} />
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
              <Route path="/rapport/:clientId"           element={<WithNav><RapportClient /></WithNav>} />
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
      </ClientThemeProvider>
      </ChunkErrorBoundary>
    </BrowserRouter>
  )
}

export default App
