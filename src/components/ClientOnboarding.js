import AppLogo from './AppLogo'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'aw_client_onboarded_v1'

// ── Mini-illustrations SVG pour chaque slide ─────────────────────────────────

function IlluAccueil() {
  return (
    <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', background: '#f5f5f5', marginBottom: 18 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#333 0%,#1f2937 100%)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, color: '#1d4ed8' }}>TH</div>
        <div>
          <div style={{ color: 'white', fontWeight: 700, fontSize: '0.65rem' }}>Bonjour Thomas 👋</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.55rem' }}>Semaine 3</div>
        </div>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Carte séance */}
        <div style={{ background: 'white', borderRadius: 10, padding: '8px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.55rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Prochaine séance</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1a1a1a' }}>💪 Séance A — Haut du corps</div>
        </div>
        {/* Carte nutrition */}
        <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent)', lineHeight: 1 }}>1 840</div>
          <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>kcal aujourd'hui</div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 999, marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '72%', background: 'var(--accent)', borderRadius: 999 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function IlluProgramme() {
  return (
    <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', background: '#f5f5f5', marginBottom: 18 }}>
      <div style={{ background: 'linear-gradient(135deg,#333 0%,#1f2937 100%)', padding: '10px 14px' }}>
        <div style={{ color: 'white', fontWeight: 800, fontSize: '0.7rem' }}>Programme</div>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { name: 'Développé couché', sets: '4×8', weight: '80 kg', done: true },
          { name: 'Tirage barre', sets: '3×10', weight: '60 kg', done: true },
          { name: 'Épaules haltères', sets: '3×12', weight: '—', done: false },
        ].map((ex, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 8, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: ex.done ? 'var(--accent)' : '#f3f4f6', border: ex.done ? 'none' : '1.5px solid #e5e7eb', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {ex.done && <div style={{ fontSize: '0.5rem' }}>✓</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1a1a1a' }}>{ex.name}</div>
              <div style={{ fontSize: '0.52rem', color: '#9ca3af' }}>{ex.sets} · {ex.weight}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IlluNutrition() {
  return (
    <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', background: '#f5f5f5', marginBottom: 18 }}>
      <div style={{ background: 'linear-gradient(135deg,#333 0%,#1f2937 100%)', padding: '10px 14px' }}>
        <div style={{ color: 'white', fontWeight: 800, fontSize: '0.7rem' }}>Nutrition</div>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Carte résumé sombre */}
        <div style={{ background: '#1a1a1a', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--accent)', lineHeight: 1 }}>1 840</div>
              <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.4)' }}>kcal mangés</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white' }}>360</div>
              <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.35)' }}>restants</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'Prot', pct: 80, color: '#60a5fa' },
              { label: 'Gluc', pct: 65, color: '#fbbf24' },
              { label: 'Lip',  pct: 90, color: '#f87171' },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.4)', width: 20 }}>{m.label}</span>
                <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: m.pct + '%', background: m.color, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Barre scanner */}
        <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: '0.65rem' }}>▦</div>
          <div style={{ fontSize: '0.58rem', color: 'var(--accent)', fontWeight: 700 }}>Scanner un article</div>
        </div>
      </div>
    </div>
  )
}

function IlluWellness() {
  return (
    <div style={{ width: '100%', borderRadius: 14, overflow: 'hidden', background: '#f5f5f5', marginBottom: 18 }}>
      <div style={{ background: 'linear-gradient(135deg,#333 0%,#1f2937 100%)', padding: '10px 14px' }}>
        <div style={{ color: 'white', fontWeight: 800, fontSize: '0.7rem' }}>Wellness du jour</div>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { emoji: '🌙', label: 'Sommeil', val: 3, color: '#6366f1' },
          { emoji: '⚡', label: 'Fatigue', val: 2, color: '#f59e0b' },
          { emoji: '🩹', label: 'Douleurs', val: 4, color: '#22c55e' },
          { emoji: '🧠', label: 'Stress', val: 3, color: '#ec4899' },
        ].map(item => (
          <div key={item.label} style={{ background: 'white', borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem' }}>{item.emoji}</span>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#374151', width: 44 }}>{item.label}</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1,2,3,4].map(v => (
                <div key={v} style={{ width: 10, height: 16, borderRadius: 3, background: v <= item.val ? item.color : '#e5e7eb' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IlluWelcome() {
  return (
    <div style={{ width: '100%', borderRadius: 14, background: '#1a1a1a', padding: '28px 16px', marginBottom: 18, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '2.2rem', marginBottom: 14 }}>👋</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white', letterSpacing: '-0.03em', marginBottom: 4 }}>
        <AppLogo size={180} />
      </div>
      <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.35)' }}>Ta plateforme de coaching sportif</div>
    </div>
  )
}

const STEPS = [
  {
    title: 'Bienvenue dans ton espace !',
    desc: 'Cet espace a été préparé pour suivre ta progression. Voici un rapide tour des fonctionnalités.',
    Illustration: IlluWelcome,
  },
  {
    title: 'Accueil',
    desc: "Retrouve tes prochaines séances, ton résumé nutrition et tes indicateurs de bien-être en un coup d'œil.",
    Illustration: IlluAccueil,
  },
  {
    title: 'Programmes',
    desc: 'Retrouve tes programmes et tes séances, et remplis tes poids au fil des semaines.',
    Illustration: IlluProgramme,
  },
  {
    title: 'Nutrition',
    desc: "Tracke tes calories, scanne tes articles, prends en photo tes plats — l'intelligence artificielle fait le reste.",
    Illustration: IlluNutrition,
  },
  {
    title: 'Tests & Wellness',
    desc: 'Remplis ton wellness chaque jour — ton coach voit tes données en temps réel et adapte ta charge en conséquence.',
    Illustration: IlluWellness,
  },
]

// ── Composant principal ───────────────────────────────────────────────────────

export default function ClientOnboarding() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) setVisible(true)
  }, [])

  // Revenir en haut de la card à chaque changement de slide
  useEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0
  }, [step])

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  const { title, desc, Illustration } = STEPS[step]
  const isLast = step === STEPS.length - 1

  // createPortal → contourne le transform CSS du parent (usePageFade)
  // et positionne l'overlay par rapport au vrai viewport
  return createPortal(
    <div style={S.overlay}>
      <div ref={cardRef} style={S.card}>

        {/* Barre de progression */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 999,
              background: i <= step ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
              transition: 'background 0.35s',
            }} />
          ))}
        </div>

        {/* Illustration */}
        <Illustration />

        {/* Texte */}
        <h2 style={{ color: 'white', fontWeight: 900, fontSize: '1.1rem', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          {title}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.84rem', lineHeight: 1.6, margin: '0 0 20px' }}>
          {desc}
        </p>

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={S.btnSecondary}>←</button>
          )}
          <button onClick={() => isLast ? finish() : setStep(s => s + 1)} style={S.btnPrimary}>
            {isLast ? "C'est parti ! 🚀" : 'Suivant →'}
          </button>
        </div>

        {!isLast && (
          <button onClick={finish} style={S.skipBtn}>Passer l'intro</button>
        )}
      </div>
    </div>,
    document.body
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.80)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'flex-end',
  },
  card: {
    background: '#1a1a1a',
    borderRadius: '24px 24px 0 0',
    padding: '22px 20px calc(28px + env(safe-area-inset-bottom, 0px))',
    width: '100%',
    boxSizing: 'border-box',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  btnPrimary: {
    flex: 1, padding: '14px', border: 'none', borderRadius: 14,
    background: 'var(--accent)', color: '#1a1a1a',
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
    fontWeight: 600, padding: '4px', textAlign: 'center',
  },
}
