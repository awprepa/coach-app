import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function SeanceTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    supabase.from('seance_templates').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setTemplates(data || []); setLoading(false) })
  }, [])

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce modèle ?')) return
    const { error } = await supabase.from('seance_templates').delete().eq('id', id)
    if (!error) setTemplates(prev => prev.filter(t => t.id !== id))
  }

  if (loading) return <div style={S.centered}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>Modèles de séances</h1>
        <p style={S.subtitle}>{templates.length} modèle{templates.length > 1 ? 's' : ''} sauvegardé{templates.length > 1 ? 's' : ''}</p>
      </div>

      {templates.length === 0 ? (
        <div style={S.empty}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>📋</p>
          <p style={{ fontWeight: '700', color: '#374151', marginBottom: '0.35rem' }}>Aucun modèle</p>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Ouvre une séance et clique sur "Sauvegarder comme modèle".</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {templates.map(t => (
            <div key={t.id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                <div>
                  <p style={S.nom}>{t.nom}</p>
                  <p style={S.meta}>{t.exercices?.length || 0} exercice{(t.exercices?.length || 0) > 1 ? 's' : ''} · {new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button onClick={e => { e.stopPropagation(); supprimer(t.id) }} style={S.deleteBtn}>🗑️</button>
                  <span style={{ color: '#d1d5db', fontSize: '1.2rem', transform: expanded === t.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                </div>
              </div>

              {expanded === t.id && t.exercices?.length > 0 && (
                <div style={{ marginTop: '0.875rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {t.exercices.map((ex, i) => (
                    <div key={i} style={S.exRow}>
                      <span style={S.codeTag}>{ex.code}</span>
                      <span style={S.exNom}>{ex.nom}</span>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
                        {ex.series && <span style={S.chip}>{ex.series} séries</span>}
                        {ex.repetitions && <span style={S.chip}>{ex.repetitions} reps</span>}
                        {ex.recuperation && <span style={S.chip}>{ex.recuperation}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const S = {
  page:      { padding: '2rem', maxWidth: '700px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered:  { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:    { marginBottom: '1.5rem' },
  title:     { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle:  { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  empty:     { background: 'white', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  card:      { background: 'white', borderRadius: 14, padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  nom:       { fontWeight: '700', fontSize: '0.95rem', color: '#333333', margin: 0 },
  meta:      { color: '#9ca3af', fontSize: '0.78rem', margin: '0.2rem 0 0' },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.25rem' },
  exRow:     { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0' },
  codeTag:   { background: '#333333', color: '#e4f816', padding: '0.1rem 0.45rem', borderRadius: 6, fontSize: '0.7rem', fontWeight: '800', flexShrink: 0 },
  exNom:     { fontSize: '0.85rem', fontWeight: '600', color: '#374151' },
  chip:      { background: '#f3f4f6', color: '#6b7280', padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: '600' },
}
