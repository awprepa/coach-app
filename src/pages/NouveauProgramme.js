import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function NouveauProgramme() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ nom: '', semaines: 4, date_debut: '' })
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    supabase.from('programme_templates')
      .select('*, programme_template_seances(*)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTemplates(data || []))
  }, [])

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  function choisirTemplate(t) {
    setSelectedTemplate(t)
    setForm(f => ({ ...f, nom: t.nom, semaines: t.semaines }))
    setShowTemplates(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setCreating(true)
    const payload = { ...form, client_id: id, date_debut: form.date_debut || null }
    const { data: prog, error } = await supabase.from('programmes').insert([payload]).select().single()
    if (error) { alert(error.message); setCreating(false); return }

    // Appliquer le template si sélectionné
    if (selectedTemplate) {
      const seances = [...(selectedTemplate.programme_template_seances || [])]
        .sort((a, b) => a.jour - b.jour || a.ordre - b.ordre)

      for (const [idx, ts] of seances.entries()) {
        const { data: newSeance } = await supabase
          .from('seances')
          .insert({ programme_id: prog.id, nom: ts.nom, ordre: ts.ordre || idx + 1 })
          .select().single()
        if (newSeance && ts.exercices?.length > 0) {
          await supabase.from('exercices').insert(
            ts.exercices.map(ex => ({
              seance_id: newSeance.id,
              code: ex.code, nom: ex.nom, series: ex.series,
              repetitions: ex.repetitions, tempo: ex.tempo,
              recuperation: ex.recuperation, type_intensite: ex.type_intensite,
              valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
              bibliotheque_id: ex.bibliotheque_id || null,
            }))
          )
        }
      }
    }

    navigate(`/programme/${prog.id}`)
  }

  return (
    <div style={styles.page}>
      <button onClick={() => navigate(`/client/${id}`)} style={styles.backBtn}>← Retour</button>

      <div style={styles.header}>
        <h1 style={styles.title}>Nouveau cycle</h1>
        <p style={styles.subtitle}>Définissez les paramètres du cycle</p>
      </div>

      {/* Sélecteur de template */}
      {templates.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setShowTemplates(v => !v)}
            style={{ ...styles.btnSecondary, width: '100%', justifyContent: 'center', display: 'flex', gap: '0.5rem' }}
          >
            📋 {selectedTemplate ? `Template : ${selectedTemplate.nom}` : 'Partir d\'un template'}
            <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>{showTemplates ? '▲' : '▼'}</span>
          </button>

          {showTemplates && (
            <div style={{ background: 'white', borderRadius: 12, border: '1.5px solid #e5e7eb', marginTop: '0.5rem', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => choisirTemplate(t)}
                  style={{ padding: '0.875rem 1rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: '700', fontSize: '0.88rem', color: '#111827' }}>{t.nom}</p>
                    {t.description && <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: '#9ca3af' }}>{t.description}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <span style={{ background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '0.2rem 0.55rem', fontSize: '0.74rem', fontWeight: '600' }}>{t.semaines} sem.</span>
                    <span style={{ background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '0.2rem 0.55rem', fontSize: '0.74rem', fontWeight: '600' }}>🏋️ {(t.programme_template_seances || []).length}</span>
                  </div>
                </div>
              ))}
              <div
                onClick={() => { setSelectedTemplate(null); setShowTemplates(false) }}
                style={{ padding: '0.7rem 1rem', cursor: 'pointer', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center' }}
              >
                Commencer sans template
              </div>
            </div>
          )}

          {selectedTemplate && (
            <div style={{ marginTop: '0.5rem', background: '#f0fdf4', borderRadius: 10, padding: '0.6rem 0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: '600' }}>
                ✓ {(selectedTemplate.programme_template_seances || []).length} séance{(selectedTemplate.programme_template_seances || []).length > 1 ? 's' : ''} + exercices seront copiés
              </span>
              <button onClick={() => setSelectedTemplate(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.card}>
        <div style={styles.field}>
          <label style={styles.label}>Nom du cycle *</label>
          <input
            name="nom" value={form.nom} onChange={handleChange}
            required placeholder="ex: Cycle 1 — Force"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Date de début</label>
          <input
            name="date_debut" type="date" value={form.date_debut} onChange={handleChange}
            style={styles.input}
          />
          <p style={styles.weeksHint}>Utilisée pour afficher le cycle sur le calendrier</p>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Nombre de semaines</label>
          <div style={styles.weeksGrid}>
            {[2,3,4,5,6,7,8,10,12].map(n => (
              <button
                key={n} type="button"
                onClick={() => setForm({ ...form, semaines: n })}
                style={{
                  ...styles.weekBtn,
                  background: form.semaines == n ? '#333333' : 'white',
                  color: form.semaines == n ? '#e4f816' : '#374151',
                  border: `1.5px solid ${form.semaines == n ? '#333333' : '#e5e7eb'}`,
                  fontWeight: form.semaines == n ? '700' : '500',
                }}
              >{n}</button>
            ))}
          </div>
          <p style={styles.weeksHint}>{form.semaines} semaine{form.semaines > 1 ? 's' : ''} sélectionnée{form.semaines > 1 ? 's' : ''}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={() => navigate(`/client/${id}`)} style={styles.btnSecondary}>Annuler</button>
          <button type="submit" disabled={creating} style={{ ...styles.btnPrimary, opacity: creating ? 0.7 : 1 }}>
            {creating ? 'Création…' : selectedTemplate ? '📋 Créer depuis le template' : 'Créer le cycle'}
          </button>
        </div>
      </form>
    </div>
  )
}

const styles = {
  page: { padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  subtitle: { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  card: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  field: { marginBottom: '1.25rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' },
  input: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  weeksGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  weekBtn: { width: '48px', height: '48px', borderRadius: '10px', fontSize: '0.9rem', cursor: 'pointer' },
  weeksHint: { color: '#9ca3af', fontSize: '0.8rem', marginTop: '0.6rem' },
  btnPrimary: { flex: 1, background: '#333333', color: '#e4f816', border: 'none', borderRadius: '12px', padding: '0.75rem 1.5rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '12px', padding: '0.75rem 1.5rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
}
