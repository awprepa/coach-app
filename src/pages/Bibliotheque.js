import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import BibliothequeExercices from './BibliothequeExercices'
import EchauffementsTemplates from './EchauffementsTemplates'
import SeanceTemplates from './SeanceTemplates'
import CycleTemplates from './CycleTemplates'
import SciencesNutrition from '../components/SciencesNutrition'

const TABS = [
  { key: 'exercices',      label: 'Exercices' },
  { key: 'echauffements',  label: 'Échauffements' },
  { key: 'modeles',        label: 'Modèles de séances' },
  { key: 'cycles',         label: 'Templates de cycles' },
  { key: 'sciences',       label: '📚 Sciences' },
]

export default function Bibliotheque() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab')
    return TABS.some(x => x.key === t) ? t : 'exercices'
  })

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && TABS.some(x => x.key === t)) setTab(t)
  }, [searchParams])

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Adaptations mobile — aucune règle au-dessus de 820px */}
      <style>{`
        @media (max-width: 820px){
          .bib-tabs{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;padding:0.6rem 0.9rem;}
          .bib-tabs button{white-space:nowrap;flex-shrink:0;}
          .bib-tabs{scrollbar-width:none;}
          .bib-tabs::-webkit-scrollbar{display:none;}
        }
      `}</style>
      {/* Barre d'onglets */}
      <div style={S.tabBar} className="bib-tabs">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ ...S.tabBtn, ...(tab === t.key ? S.tabBtnActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{ display: tab === 'exercices' ? 'block' : 'none' }}>
        <BibliothequeExercices />
      </div>
      <div style={{ display: tab === 'echauffements' ? 'block' : 'none' }}>
        <EchauffementsTemplates />
      </div>
      <div style={{ display: tab === 'modeles' ? 'block' : 'none' }}>
        <SeanceTemplates />
      </div>
      <div style={{ display: tab === 'cycles' ? 'block' : 'none' }}>
        <CycleTemplates />
      </div>
      {tab === 'sciences' && (
        <SciencesNutrition coachMode={true} />
      )}
    </div>
  )
}

const S = {
  tabBar: {
    display: 'flex',
    gap: '0.25rem',
    padding: '0.75rem 1.5rem',
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
  },
  tabBtn: {
    padding: '0.45rem 1.1rem',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  tabBtnActive: {
    background: '#333333',
    color: '#e4f816',
    fontWeight: '700',
  },
}
