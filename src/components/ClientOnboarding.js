import { useState, useEffect } from 'react'

const STORAGE_KEY = 'aw_client_onboarded_v1'

const STEPS = [
  {
    emoji: '👋',
    title: 'Bienvenue dans ton espace !',
    desc: 'Arthur a préparé cet espace pour suivre ta progression. Voici un rapide tour des fonctionnalités.',
  },
  {
    emoji: '🏠',
    title: 'Accueil',
    desc: 'Vue d\'ensemble de ta semaine : prochaines séances, résumé nutrition du jour, et bien-être.',
    tab: 'accueil',
  },
  {
    emoji: '💪',
    title: 'Programme',
    desc: 'Retrouve et réalise tes séances d\'entraînement. Tu peux logguer tes poids et valider chaque série.',
    tab: 'programme',
  },
  {
    emoji: '🥗',
    title: 'Nutrition',
    desc: 'Suis tes repas au quotidien : scan code-barres, photo IA, saisie manuelle ou vocal.',
    tab: 'nutrition',
  },
  {
    emoji: '📊',
    title: 'Tests & Wellness',
    desc: 'Remplis tes indicateurs de bien-être chaque jour (sommeil, fatigue…) pour que ton coach ajuste ta charge.',
    tab: 'wellness',
  },
]

export default function ClientOnboarding() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) setVisible(true)
  }, [])

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  return (
    <div style={S.overlay}>
      <div style={S.card}>
        {/* Barre de progression */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 999,
              background: i <= step ? '#e4f816' : 'rgba(255,255,255,0.15)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Contenu */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>{current.emoji}</div>
          <h2 style={{ color: 'white', fontWeight: 900, fontSize: '1.25rem', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            {current.title}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0, maxWidth: 280, margin: '0 auto' }}>
            {current.desc}
          </p>
        </div>

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={S.btnSecondary}>
              ←
            </button>
          )}
          <button
            onClick={() => isLast ? finish() : setStep(s => s + 1)}
            style={S.btnPrimary}
          >
            {isLast ? 'C\'est parti ! 🚀' : 'Suivant →'}
          </button>
        </div>

        {/* Passer */}
        {!isLast && (
          <button onClick={finish} style={S.skipBtn}>
            Passer l'intro
          </button>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 500,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    padding: '0 0 0',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  },
  card: {
    background: '#1a1a1a',
    borderRadius: '24px 24px 0 0',
    padding: '24px 24px calc(28px + env(safe-area-inset-bottom, 0px))',
    width: '100%',
    maxWidth: 480,
    boxSizing: 'border-box',
  },
  btnPrimary: {
    flex: 1, padding: '14px', border: 'none', borderRadius: 14,
    background: '#e4f816', color: '#1a1a1a',
    fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
  },
  btnSecondary: {
    padding: '14px 18px', border: '1.5px solid rgba(255,255,255,0.15)',
    borderRadius: 14, background: 'transparent', color: 'rgba(255,255,255,0.6)',
    fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
  },
  skipBtn: {
    width: '100%', marginTop: 12, background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', cursor: 'pointer',
    fontWeight: 600, padding: '4px',
  },
}
