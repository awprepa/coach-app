import { useState } from 'react'
import BibliothequeExercices from './BibliothequeExercices'
import EchauffementsTemplates from './EchauffementsTemplates'
import SeanceTemplates from './SeanceTemplates'
import CycleTemplates from './CycleTemplates'

const TABS = [
  { key: 'exercices',      label: 'Exercices' },
  { key: 'echauffements',  label: 'Échauffements' },
  { key: 'modeles',        label: 'Modèles de séances' },
  { key: 'cycles',         label: 'Templates de cycles' },
]

export default function Bibliotheque() {
  const [tab, setTab] = useState('exercices')

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Barre d'onglets */}
      <div style={S.tabBar}>
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
