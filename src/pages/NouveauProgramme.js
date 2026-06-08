import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SeanceAIModal from '../components/SeanceAIModal'

export default function NouveauProgramme() {
  const { id: clientId, groupeId } = useParams()
  const id = clientId   // compat avec le reste du fichier (client context)
  const navigate = useNavigate()
  const [form, setForm] = useState({ nom: '', semaines: 4, date_debut: '' })
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [creating, setCreating] = useState(false)
  const [aiProgrammeId, setAiProgrammeId] = useState(null) // programme créé en attente de génération IA
  const [showImport, setShowImport] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)

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
    const payload = groupeId
      ? { ...form, groupe_id: groupeId, date_debut: form.date_debut || null }
      : { ...form, client_id: id, date_debut: form.date_debut || null }
    const { data: prog, error } = await supabase.from('programmes').insert([payload]).select().single()
    if (error) { alert(error.message); setCreating(false); return }

    // Appliquer le template si sélectionné
    if (selectedTemplate) {
      const seances = [...(selectedTemplate.programme_template_seances || [])]
        .sort((a, b) => a.jour - b.jour || a.ordre - b.ordre)

      for (const [idx, ts] of seances.entries()) {
        const { data: newSeance } = await supabase
          .from('seances')
          .insert({ programme_id: prog.id, nom: ts.nom, ordre: ts.ordre || idx + 1, echauffement: ts.echauffement || [] })
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
              progressions: ex.progressions || null,
              series_echauffement: ex.series_echauffement || null,
              media_url: ex.media_url || null,
            }))
          )
        }
        // RPE cibles
        const rpeCibles = ts.rpe_cibles || {}
        if (newSeance && Object.keys(rpeCibles).length > 0) {
          await supabase.from('rpe_seances').insert(
            Object.entries(rpeCibles).map(([sem, val]) => ({ seance_id: newSeance.id, semaine: parseInt(sem), rpe_cible: val }))
          )
        }
      }
    }

    navigate(`/programme/${prog.id}`)
  }

  async function handleImport() {
    setImportError('')
    let data
    try {
      data = JSON.parse(importJson.trim())
    } catch {
      setImportError('JSON invalide — vérifie la syntaxe.')
      return
    }
    if (!data.nom || !Array.isArray(data.seances)) {
      setImportError('Structure incorrecte — le JSON doit avoir "nom" et "seances".')
      return
    }
    setImporting(true)
    const payload = groupeId
      ? { nom: data.nom, semaines: data.semaines || 4, groupe_id: groupeId, date_debut: form.date_debut || null }
      : { nom: data.nom, semaines: data.semaines || 4, client_id: id, date_debut: form.date_debut || null }
    const { data: prog, error } = await supabase.from('programmes').insert([payload]).select().single()
    if (error) { setImportError(error.message); setImporting(false); return }

    for (const [idx, s] of data.seances.entries()) {
      const { data: newSeance } = await supabase
        .from('seances')
        .insert({ programme_id: prog.id, nom: s.nom, ordre: s.ordre || idx + 1 })
        .select().single()
      if (newSeance && Array.isArray(s.exercices) && s.exercices.length > 0) {
        const { error: exError } = await supabase.from('exercices').insert(
          s.exercices.map((ex, i) => ({
            seance_id: newSeance.id,
            nom: ex.nom || '',
            code: ex.code || '',
            series: ex.series || 3,
            repetitions: ex.repetitions || '8',
            tempo: ex.tempo || '',
            recuperation: ex.recuperation || '',
            type_intensite: ex.type_intensite || 'aucune',
            valeur_intensite: ex.valeur_intensite || null,
            ordre: ex.ordre || i + 1,
            progressions: ex.progressions || null,
          }))
        )
        if (exError) { setImportError(`Erreur exercices (${s.nom}) : ${exError.message}`); setImporting(false); return }
      }
    }
    setImporting(false)
    setShowImport(false)
    navigate(`/programme/${prog.id}`)
  }

  async function handleAI() {
    if (!form.nom.trim()) { alert('Donne un nom au cycle avant de générer.'); return }
    setCreating(true)
    const payload = groupeId
      ? { ...form, groupe_id: groupeId, date_debut: form.date_debut || null }
      : { ...form, client_id: id, date_debut: form.date_debut || null }
    const { data: prog, error } = await supabase.from('programmes').insert([payload]).select().single()
    if (error) { alert(error.message); setCreating(false); return }
    setCreating(false)
    setAiProgrammeId(prog.id)
  }

  return (
    <div style={styles.page}>
      <button onClick={() => groupeId ? navigate(`/groupe/${groupeId}`) : navigate(`/client/${id}`)} style={styles.backBtn}>← Retour</button>

      <div style={styles.header}>
        <h1 style={styles.title}>Nouveau cycle{groupeId ? ' de groupe' : ''}</h1>
        <p style={styles.subtitle}>{groupeId ? 'Programme template — pourra être envoyé à tous les membres' : 'Définissez les paramètres du cycle'}</p>
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

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => groupeId ? navigate(`/groupe/${groupeId}`) : navigate(`/client/${id}`)} style={styles.btnSecondary}>Annuler</button>
          <button type="submit" disabled={creating} style={{ ...styles.btnPrimary, opacity: creating ? 0.7 : 1 }}>
            {creating ? 'Création…' : selectedTemplate ? '📋 Créer depuis le template' : 'Créer le cycle'}
          </button>
          <button type="button" onClick={handleAI} disabled={creating} style={styles.btnAI}>
            ✨ Générer avec l'IA
          </button>
          <button type="button" onClick={() => { setShowImport(true); setImportJson(''); setImportError('') }} disabled={creating} style={styles.btnImport}>
            📥 Importer un JSON
          </button>
        </div>
      </form>

      {/* Modal import JSON */}
      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '1.5rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#111827' }}>📥 Importer un cycle JSON</h2>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 0.75rem' }}>
              Colle ici le JSON généré par Claude. Il sera importé directement dans l'app avec toutes les séances, exercices et progressions.
            </p>
            <textarea
              value={importJson}
              onChange={e => { setImportJson(e.target.value); setImportError('') }}
              placeholder={'{\n  "nom": "Cycle Force",\n  "semaines": 8,\n  "seances": [...]\n}'}
              style={{ width: '100%', height: 220, padding: '0.75rem', border: `1.5px solid ${importError ? '#ef4444' : '#e5e7eb'}`, borderRadius: 10, fontSize: '0.78rem', fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box', color: '#111827' }}
            />
            {importError && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '0.4rem 0 0' }}>⚠️ {importError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={() => setShowImport(false)} style={styles.btnSecondary}>Annuler</button>
              <button
                onClick={handleImport}
                disabled={importing || !importJson.trim()}
                style={{ ...styles.btnPrimary, opacity: (importing || !importJson.trim()) ? 0.6 : 1 }}
              >
                {importing ? 'Import en cours…' : '📥 Importer le cycle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aiProgrammeId && (
        <SeanceAIModal
          defaultMode="cycle"
          programmeId={aiProgrammeId}
          onClose={() => { setAiProgrammeId(null); navigate(`/programme/${aiProgrammeId}`) }}
          onCycleDone={() => navigate(`/programme/${aiProgrammeId}`)}
        />
      )}
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
  btnAI: { background: '#111827', color: '#e4f816', border: '1.5px solid rgba(228,248,22,0.35)', borderRadius: '12px', padding: '0.75rem 1.25rem', fontSize: '0.88rem', fontWeight: '800', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnImport: { background: 'white', color: '#374151', border: '1.5px solid #d1d5db', borderRadius: '12px', padding: '0.75rem 1.25rem', fontSize: '0.88rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
}
