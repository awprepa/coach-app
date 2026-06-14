import { lazy, Suspense, Component, useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import AuthGate from './AuthGate'
import CoachNav from './CoachNav'
import APP_VERSION from './version'
import { syncDown, _flushQueue, pendingCount } from './supabase'
import { NotifProvider } from './context/NotifContext'
import { TimerProvider } from './context/TimerContext'
import { ClientThemeProvider } from './context/ClientThemeContext'
import GlobalTimerBubble from './components/GlobalTimerBubble'
import InstallGuide, { shouldShowInstall, markInstalled } from './components/InstallGuide'

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
const CompetitionClient    = lazy(() => import('./pages/client/CompetitionClient'))
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
const FicheGroupe          = lazy(() => import('./pages/FicheGroupe'))
const Factures             = lazy(() => import('./pages/Factures'))
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
    { icon: '🌐', text: <span>Puis <strong style={{ color: '#fff' }}>"Ouvrir dans un navigateur externe"</strong></span> },
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

        {/* Icône app — logo blanc sur fond noir */}
        <div style={{
          width: 72, height: 72, borderRadius: 18, background: '#1a1a1a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16,
        }}>
          <img src="/logo-blanc.png" alt="AWprepa" style={{ height: 52, width: 'auto', display: 'block' }} />
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

// ── Mur d'installation iOS Safari — bloque totalement l'app si non installée ──
function IOSInstallWall() {
  const ua         = navigator.userAgent || ''
  const isIOS      = /iPhone|iPad|iPod/i.test(ua)
  const isInApp    = /Instagram|FBAN|FBAV|TikTok|BytedanceWebview/i.test(ua)
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches

  // Afficher seulement sur iOS Safari, non installé, hors in-app browser
  if (!isIOS || isStandalone || isInApp) return null

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99990,
      background: '#1a1a1a',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px 28px calc(env(safe-area-inset-bottom) + 32px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Logo */}
      <img src="/logo-blanc.png" alt="AWprepa" style={{ height: 64, width: 'auto', marginBottom: 32 }} />

      <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 10, lineHeight: 1.25 }}>
        Installe l'app pour<br />accéder à ton coaching
      </p>
      <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.5, marginBottom: 36, maxWidth: 280 }}>
        AWprepa fonctionne uniquement en tant qu'application installée.
      </p>

      {/* Étapes */}
      <div style={{
        width: '100%', maxWidth: 340,
        background: 'rgba(255,255,255,0.06)', borderRadius: 16,
        padding: '16px 18px', marginBottom: 32,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
          3 étapes pour installer
        </p>
        {/* Étape 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={SW.num}><span>1</span></div>
          <div>
            <p style={SW.stepTitle}>Appuie sur <strong style={{ color: '#e4f816' }}>•••</strong> en bas de Safari</p>
            <p style={SW.stepSub}>Le bouton avec trois points dans la barre de navigation</p>
          </div>
        </div>
        {/* Étape 2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={SW.num}><span>2</span></div>
          <div>
            <p style={SW.stepTitle}>Appuie sur <strong style={{ color: '#e4f816' }}>"Partager"</strong></p>
            <p style={SW.stepSub}>Dans le menu qui s'affiche</p>
          </div>
        </div>
        {/* Étape 3 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={SW.num}><span>3</span></div>
          <div>
            <p style={SW.stepTitle}>Choisis <strong style={{ color: '#e4f816' }}>"Sur l'écran d'accueil"</strong></p>
            <p style={SW.stepSub}>Puis appuie sur "Ajouter" en haut à droite</p>
          </div>
        </div>
      </div>

      {/* Flèche animée → pointe vers le bouton natif Safari en bas */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', margin: 0 }}>
          Le bouton ••• est ici ↓
        </p>
        <div style={{ animation: 'bounceDown 1.2s ease-in-out infinite' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e4f816" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
          </svg>
        </div>
      </div>
      <style>{`@keyframes bounceDown { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }`}</style>
    </div>,
    document.body
  )
}

const SW = {
  num: {
    width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(228,248,22,0.12)', border: '1.5px solid rgba(228,248,22,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    fontSize: '0.85rem', fontWeight: 800, color: '#e4f816',
  },
  stepTitle: { fontSize: '0.85rem', fontWeight: 600, color: '#fff', margin: '0 0 2px' },
  stepSub:   { fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.35 },
}

// ── Guide installation PWA — Android uniquement (iOS est géré par IOSInstallWall) ─
function GlobalInstallGuide() {
  const ua         = navigator.userAgent || ''
  const isIOS      = /iPhone|iPad|iPod/i.test(ua)
  const [show, setShow]               = useState(false)
  const [deferredPrompt, setDeferred] = useState(null)

  useEffect(() => {
    if (isIOS) return  // iOS → géré par IOSInstallWall
    const handler = (e) => { e.preventDefault(); setDeferred(e) }
    window.addEventListener('beforeinstallprompt', handler)
    const timer = setTimeout(() => {
      if (shouldShowInstall()) setShow(true)
    }, 2000)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
  }, [isIOS])

  if (!show) return null
  return (
    <InstallGuide
      deferredPrompt={deferredPrompt}
      onDone={() => { markInstalled(); setShow(false) }}
      onLater={() => { markInstalled(); setShow(false) }}
    />
  )
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
  return (
    <>
      <CoachNav />
      <OfflineBanner />
      {children}
      <div style={{ textAlign: 'center', padding: '18px 0 10px', color: '#c0c4cc', fontSize: '0.68rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', letterSpacing: '.03em' }}>
        AWprepa v{APP_VERSION}
      </div>
    </>
  )
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
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err) {
    // Chunk introuvable (hash périmé après déploiement) → reload forcé une seule fois
    if (err?.name === 'ChunkLoadError' || err?.message?.includes('Loading chunk')) {
      if (!sessionStorage.getItem('chunk_reload')) {
        sessionStorage.setItem('chunk_reload', '1')
        window.location.reload(true)
      }
    }
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

function OfflineBanner() {
  const [online, setOnline]   = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [show, setShow]       = useState(false)
  const timerRef              = useRef(null)
  const wasShowingRef         = useRef(false)

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount())
  }, [])

  // Affiche le bandeau dès qu'il se passe quelque chose ; cache après 1,5 s une fois tout synchronisé
  useEffect(() => {
    const isDone = online && !syncing && pending === 0
    if (!isDone) {
      clearTimeout(timerRef.current)
      wasShowingRef.current = true
      setShow(true)
    } else if (wasShowingRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setShow(false)
        wasShowingRef.current = false
      }, 1500)
    }
  }, [online, syncing, pending])

  useEffect(() => {
    // Au démarrage : flush + sync uniquement s'il y a des actions en attente
    if (navigator.onLine) {
      pendingCount().then(n => {
        if (n > 0) setSyncing(true)
        _flushQueue()
          .then(() => syncDown())
          .finally(() => { setSyncing(false); refreshPending() })
      })
    }

    const onOnline  = () => { setOnline(true);  refreshPending() }
    const onOffline = () => { setOnline(false);  refreshPending() }
    const onQueue   = () => refreshPending()
    const onSynced  = () => { setSyncing(false); refreshPending() }

    window.addEventListener('online',           onOnline)
    window.addEventListener('offline',          onOffline)
    window.addEventListener('aw:queue-updated', onQueue)
    window.addEventListener('aw:synced',        onSynced)
    return () => {
      window.removeEventListener('online',           onOnline)
      window.removeEventListener('offline',          onOffline)
      window.removeEventListener('aw:queue-updated', onQueue)
      window.removeEventListener('aw:synced',        onSynced)
      clearTimeout(timerRef.current)
    }
  }, [refreshPending])

  if (!show) return null

  return (
    <div style={{
      background: online ? (syncing ? '#1d4ed8' : '#15803d') : '#b45309',
      color: '#fff', fontSize: '0.78rem', fontWeight: 600,
      textAlign: 'center', padding: '0.35rem 1rem',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {!online
        ? `📴 Hors ligne${pending > 0 ? ` — ${pending} action${pending > 1 ? 's' : ''} en attente` : ''}`
        : syncing
          ? '🔄 Synchronisation en cours…'
          : '✓ Synchronisé'
      }
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <BanniereNavigateur />
      <IOSInstallWall />
      <GlobalInstallGuide />
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
              <Route path="/client/competition"          element={<WithNotifs><CompetitionClient /></WithNotifs>} />
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
              <Route path="/groupe/:id"                  element={<WithNav><FicheGroupe /></WithNav>} />
              <Route path="/groupe/:groupeId/nouveau-programme" element={<WithNav><NouveauProgramme /></WithNav>} />
              <Route path="/factures"                        element={<WithNav><Factures /></WithNav>} />
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
