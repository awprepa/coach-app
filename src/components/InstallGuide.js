import { createPortal } from 'react-dom'

const LS_KEY = 'awprepa_install_seen_v4'
const IN_APP_RE = /Instagram|FBAN|FBAV|TikTok|BytedanceWebview/i

export function shouldShowInstall() {
  // Pas dans un navigateur intégré (Instagram/TikTok ont leur propre sheet)
  if (IN_APP_RE.test(navigator.userAgent)) return false
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  return !isStandalone && !localStorage.getItem(LS_KEY)
}

export function markInstalled() {
  localStorage.setItem(LS_KEY, '1')
}

export default function InstallGuide({ onDone, onLater, deferredPrompt }) {
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
  const canDirectInstall = !!deferredPrompt

  async function handleInstall() {
    if (canDirectInstall) {
      deferredPrompt.prompt()
      try { await deferredPrompt.userChoice } catch (_) {}
      onDone()
    } else if (navigator.share) {
      try { await navigator.share({ title: 'AWprepa', url: window.location.href }) } catch (_) {}
      // iOS : ne pas fermer, l'utilisateur doit encore taper "Sur l'écran d'accueil"
    }
  }

  return createPortal(
    <>
      {/* Overlay flouté */}
      <div onClick={onLater} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
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

        {/* Icône app */}
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: '#1a1a1a', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)',
          overflow: 'hidden',
        }}>
          <img src="/logo-blanc.png" alt="AWprepa" style={{ height: 52, width: 'auto', display: 'block' }} />
        </div>

        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: 6, textAlign: 'center' }}>
          Installer AWprepa
        </p>
        <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.5, marginBottom: 22, maxWidth: 270 }}>
          {canDirectInstall
            ? "Accède à ton coaching directement depuis ton écran d'accueil."
            : "Accède à ton coaching directement depuis ton écran d'accueil, sans passer par Safari."}
        </p>

        {/* Étapes iOS uniquement */}
        {isIOS && !canDirectInstall && (
          <div style={{
            width: '100%', background: 'rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '12px 14px', marginBottom: 16,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
              Comment faire
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={S.stepIcon}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </div>
              <p style={S.stepText}>Appuie sur <strong style={{ color: '#fff' }}>Partager</strong> en bas de Safari</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={S.stepIcon}><span style={{ fontSize: '0.9rem' }}>➕</span></div>
              <p style={S.stepText}>Puis <strong style={{ color: '#fff' }}>"Sur l'écran d'accueil"</strong></p>
            </div>
          </div>
        )}

        {/* Bouton principal */}
        <button onClick={handleInstall} style={{
          width: '100%', height: 52,
          background: '#e4f816', color: '#1a1a1a',
          border: 'none', borderRadius: 14,
          fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: 8,
        }}>
          {canDirectInstall ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Installer l'application
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Ouvrir le menu Partager
            </>
          )}
        </button>

        <button onClick={onLater} style={{
          background: 'none', border: 'none',
          color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem',
          fontWeight: 500, cursor: 'pointer', padding: '8px',
        }}>
          Plus tard
        </button>
      </div>
    </>,
    document.body
  )
}

const S = {
  stepIcon: {
    width: 30, height: 30, borderRadius: 8,
    background: 'rgba(255,255,255,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepText: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.35, margin: 0 },
}
