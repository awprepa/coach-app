import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ImportExcel from './ImportExcel'
import { sendNotif } from '../notifs'

export default function Programme() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [programme, setProgramme] = useState(null)
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)
  const [nouvelleSeance, setNouvelleSeance] = useState('')
  const [enEdition, setEnEdition] = useState(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [nomEdition, setNomEdition] = useState('')
  const [editProgramme, setEditProgramme] = useState(false)
  const [formProgramme, setFormProgramme] = useState({ nom: '', semaines: 4, date_debut: '' })
  const [notifToast, setNotifToast] = useState(null) // { msg, ok }
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateForm, setTemplateForm] = useState({ nom: '', description: '' })
  const [savingTemplate, setSavingTemplate] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProgramme(); fetchSeances() }, [])

  function showToast(msg, ok) {
    setNotifToast({ msg, ok })
    setTimeout(() => setNotifToast(null), 3500)
  }

  async function fetchProgramme() {
    const { data, error } = await supabase
      .from('programmes').select('*, clients(prenom, nom), groupes(id, nom, couleur)').eq('id', id).single()
    if (error) console.log(error)
    else { setProgramme(data); setFormProgramme({ nom: data.nom, semaines: data.semaines, date_debut: data.date_debut || '' }) }
    setLoading(false)
  }

  async function fetchSeances() {
    const { data, error } = await supabase
      .from('seances').select('*').eq('programme_id', id).order('ordre', { ascending: true })
    if (error) console.log(error)
    else setSeances(data)
  }

  async function ajouterSeance(e) {
    e.preventDefault()
    if (!nouvelleSeance.trim()) return
    const { data, error } = await supabase
      .from('seances').insert([{ programme_id: id, nom: nouvelleSeance, ordre: seances.length + 1 }]).select().single()
    if (error) { alert(error.message); return }
    setSeances([...seances, data])
    setNouvelleSeance('')
    // Notifier le client
    try {
      const { data: clientData } = await supabase
        .from('clients')
        .select('user_id, prenom')
        .eq('id', programme.client_id)
        .single()
      if (clientData?.user_id) {
        const result = await sendNotif(clientData.user_id, {
          titre: `Nouvelle séance : ${nouvelleSeance}`,
          corps: `Ton coach a ajouté une séance à ton programme ${programme.nom}`,
          type: 'seance',
          lien: '/client/mon-programme',
        })
        if (result?.ok) {
          showToast('Notification envoyée au client ✓', true)
        } else {
          showToast(`Notif non envoyée : ${result?.reason || 'erreur'}`, false)
        }
      } else {
        showToast('Le client doit ouvrir l\'app une fois pour activer les notifs', false)
      }
    } catch (e) {
      console.error('[Programme] sendNotif error:', e)
    }
  }

  async function sauvegarderSeance(seanceId) {
    const { error } = await supabase.from('seances').update({ nom: nomEdition }).eq('id', seanceId)
    if (error) alert(error.message)
    else { setSeances(seances.map(s => s.id === seanceId ? { ...s, nom: nomEdition } : s)); setEnEdition(null) }
  }

  async function deplacerSeance(index, direction) {
    const newSeances = [...seances]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= newSeances.length) return
    const a = newSeances[index]
    const b = newSeances[targetIndex]
    // Échanger les ordres
    const [ordreA, ordreB] = [a.ordre, b.ordre]
    await supabase.from('seances').update({ ordre: ordreB }).eq('id', a.id)
    await supabase.from('seances').update({ ordre: ordreA }).eq('id', b.id)
    newSeances[index] = { ...a, ordre: ordreB }
    newSeances[targetIndex] = { ...b, ordre: ordreA }
    newSeances.sort((x, y) => x.ordre - y.ordre)
    setSeances(newSeances)
  }

  async function supprimerSeance(seanceId) {
    if (!window.confirm('Supprimer cette séance et tous ses exercices ?')) return
    const { error } = await supabase.from('seances').delete().eq('id', seanceId)
    if (error) alert(error.message)
    else setSeances(seances.filter(s => s.id !== seanceId))
  }

  async function sauvegarderProgramme() {
    const { error } = await supabase.from('programmes').update({ nom: formProgramme.nom, semaines: formProgramme.semaines, date_debut: formProgramme.date_debut || null }).eq('id', id)
    if (error) alert(error.message)
    else { setProgramme({ ...programme, ...formProgramme }); setEditProgramme(false) }
  }

  async function ouvrirTemplates() {
    if (templates.length === 0) {
      const { data } = await supabase.from('seance_templates').select('*').order('created_at', { ascending: false })
      setTemplates(data || [])
    }
    setShowTemplates(true)
  }

  async function chargerTemplate(template) {
    const { data: newSeance, error } = await supabase
      .from('seances').insert([{ programme_id: id, nom: template.nom, ordre: seances.length + 1 }]).select().single()
    if (error) { alert(error.message); return }
    if (template.exercices?.length > 0) {
      const exInserts = template.exercices.map(ex => ({
        seance_id: newSeance.id, code: ex.code, nom: ex.nom, series: ex.series,
        repetitions: ex.repetitions, tempo: ex.tempo, recuperation: ex.recuperation,
        type_intensite: ex.type_intensite, valeur_intensite: ex.valeur_intensite,
        ordre: ex.ordre, bibliotheque_id: ex.bibliotheque_id || null,
      }))
      await supabase.from('exercices').insert(exInserts)
    }
    setSeances(prev => [...prev, newSeance])
    setShowTemplates(false)
  }

  async function testerPushClient() {
    try {
      const { data: clientData } = await supabase
        .from('clients').select('user_id, prenom').eq('id', programme.client_id).single()

      if (!clientData?.user_id) {
        showToast('❌ clients.user_id est null — le client doit ouvrir l\'app une fois', false)
        return
      }

      // Envoyer directement (la Edge Function vérifie la subscription côté serveur avec service_role)
      showToast('⏳ Envoi en cours…', true)
      const result = await sendNotif(clientData.user_id, {
        titre: '🧪 Test push',
        corps: 'Si tu vois cette notification sur ton téléphone, les push fonctionnent !',
        type: 'info',
        lien: '/client/notifications',
      })
      if (result?.ok) showToast('✓ Notif envoyée — vérifie le téléphone', true)
      else showToast(`❌ ${result?.reason}`, false)
    } catch (e) {
      showToast(`❌ Erreur : ${e.message}`, false)
    }
  }

  async function supprimerProgramme() {
    if (!window.confirm('Supprimer ce cycle et toutes ses séances ?')) return
    const { error } = await supabase.from('programmes').delete().eq('id', id)
    if (error) alert(error.message)
    else if (programme.groupe_id) navigate(`/groupe/${programme.groupe_id}`)
    else navigate(`/client/${programme.client_id}`)
  }

  async function sauvegarderCommeTemplate() {
    if (!templateForm.nom.trim()) return
    setSavingTemplate(true)
    try {
      // 1. Créer le template
      const { data: tpl, error: tplErr } = await supabase
        .from('programme_templates')
        .insert({ nom: templateForm.nom.trim(), semaines: programme.semaines, description: templateForm.description || null })
        .select('id').single()
      if (tplErr) throw tplErr

      // 2. Pour chaque séance, récupérer ses exercices et insérer dans programme_template_seances
      if (seances.length > 0) {
        const { data: exos } = await supabase
          .from('exercices')
          .select('*')
          .in('seance_id', seances.map(s => s.id))
          .order('ordre', { ascending: true })

        const bySeance = {}
        ;(exos || []).forEach(ex => {
          if (!bySeance[ex.seance_id]) bySeance[ex.seance_id] = []
          bySeance[ex.seance_id].push({
            code: ex.code, nom: ex.nom, series: ex.series,
            repetitions: ex.repetitions, tempo: ex.tempo,
            recuperation: ex.recuperation, type_intensite: ex.type_intensite,
            valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
            bibliotheque_id: ex.bibliotheque_id || null,
          })
        })

        await supabase.from('programme_template_seances').insert(
          seances.map((s, idx) => ({
            template_id: tpl.id,
            nom: s.nom,
            jour: idx + 1,
            ordre: s.ordre || idx + 1,
            exercices: bySeance[s.id] || [],
          }))
        )
      }

      setShowSaveTemplate(false)
      showToast(`Template "${templateForm.nom}" enregistré ✓`, true)
    } catch (e) {
      showToast(`Erreur : ${e.message}`, false)
    }
    setSavingTemplate(false)
  }

  if (loading) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>
  if (!programme) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Programme introuvable.</p></div>

  if (showImport) return (
    <ImportExcel
      programmeId={id}
      semaines={programme.semaines}
      onClose={() => setShowImport(false)}
      onImported={() => { setShowImport(false); fetchSeances() }}
    />
  )

  return (
    <div style={styles.page}>
      {/* Toast confirmation notification */}
      {notifToast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: notifToast.ok ? '#111827' : '#dc2626',
          color: notifToast.ok ? '#e4f816' : 'white',
          padding: '0.65rem 1.25rem', borderRadius: 12,
          fontSize: '0.85rem', fontWeight: '700',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          zIndex: 999, whiteSpace: 'nowrap',
        }}>
          {notifToast.msg}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => {
          if (programme.groupe_id && !programme.template_id) navigate(`/groupe/${programme.groupe_id}`)
          else if (programme.template_id) navigate(`/groupe/${programme.groupe_id}`)
          else navigate(`/client/${programme.client_id}`)
        }} style={styles.backBtn}>← Retour</button>
        <button onClick={testerPushClient} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.35rem 0.75rem', fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer' }}>
          🧪 Test push
        </button>
      </div>

      {/* En-tête programme */}
      {editProgramme ? (
        <div style={styles.card}>
          <p style={styles.sectionTitle}>Modifier le cycle</p>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Nom</label>
            <input value={formProgramme.nom} onChange={e => setFormProgramme({ ...formProgramme, nom: e.target.value })} style={styles.input} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Date de début</label>
            <input type="date" value={formProgramme.date_debut} onChange={e => setFormProgramme({ ...formProgramme, date_debut: e.target.value })} style={styles.input} />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={styles.label}>Semaines</label>
            <select value={formProgramme.semaines} onChange={e => setFormProgramme({ ...formProgramme, semaines: e.target.value })} style={styles.select}>
              {[2,3,4,5,6,7,8,10,12].map(n => <option key={n} value={n}>{n} semaines</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setEditProgramme(false)} style={styles.btnSecondary}>Annuler</button>
            <button onClick={sauvegarderProgramme} style={styles.btnPrimary}>Sauvegarder</button>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          {/* Titre selon contexte groupe ou individuel */}
          {programme.groupe_id && !programme.template_id && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: (programme.groupes?.couleur || '#6366f1') + '18', border: `1px solid ${(programme.groupes?.couleur || '#6366f1')}44`, borderRadius: 999, padding: '0.2rem 0.75rem', marginBottom: '0.6rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: programme.groupes?.couleur || '#6366f1', display: 'inline-block' }} />
              <span style={{ fontSize: '0.7rem', fontWeight: '800', color: programme.groupes?.couleur || '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Template · {programme.groupes?.nom}</span>
            </div>
          )}
          {programme.template_id && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 999, padding: '0.2rem 0.75rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Copie de groupe · {programme.groupes?.nom}</span>
            </div>
          )}
          {programme.clients && <p style={styles.clientLabel}>{programme.clients.prenom} {programme.clients.nom}</p>}
          <h1 style={styles.progTitle}>{programme.nom}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <span style={styles.metaBadge}>{programme.semaines} semaines</span>
            <span style={styles.metaBadge}>{seances.length} séance{seances.length > 1 ? 's' : ''}</span>
            {programme.date_debut && <span style={styles.metaBadge}>Début : {new Date(programme.date_debut + 'T00:00:00').toLocaleDateString('fr-FR')}</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => setEditProgramme(true)} style={styles.btnSecondary}>Modifier</button>
            <button onClick={() => { setTemplateForm({ nom: programme.nom, description: '' }); setShowSaveTemplate(true) }} style={styles.btnSecondary}>💾 Template</button>
            <button onClick={supprimerProgramme} style={styles.btnDanger}>Supprimer</button>
          </div>

          {/* Modale enregistrer comme template */}
          {showSaveTemplate && (
            <div style={{ marginTop: '1rem', background: '#f9fafb', borderRadius: 12, border: '1.5px solid #e5e7eb', padding: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: '700', fontSize: '0.82rem', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                💾 Enregistrer comme template de cycle
              </p>
              <div style={{ marginBottom: '0.65rem' }}>
                <label style={styles.label}>Nom du template *</label>
                <input
                  value={templateForm.nom}
                  onChange={e => setTemplateForm(f => ({ ...f, nom: e.target.value }))}
                  style={styles.input}
                  placeholder="ex: Prépa physique générale 8 semaines"
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={styles.label}>Description (optionnel)</label>
                <input
                  value={templateForm.description}
                  onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                  style={styles.input}
                  placeholder="Niveau, objectifs, particularités…"
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                {seances.length} séance{seances.length > 1 ? 's' : ''} · {programme.semaines} semaines — les exercices seront inclus
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setShowSaveTemplate(false)} style={styles.btnSecondary}>Annuler</button>
                <button
                  onClick={sauvegarderCommeTemplate}
                  disabled={savingTemplate || !templateForm.nom.trim()}
                  style={{ ...styles.btnPrimary, opacity: savingTemplate ? 0.7 : 1 }}
                >
                  {savingTemplate ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Séances */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={styles.sectionHeader}>
          <p style={styles.sectionTitle}>Séances</p>
        </div>

        {seances.length === 0 ? (
          <div style={styles.emptyCard}>Aucune séance. Ajoutez-en une ci-dessous.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
            {seances.map((seance, i) => (
              <div key={seance.id} style={styles.seanceRow}>
                {enEdition === seance.id ? (
                  <>
                    <input
                      value={nomEdition}
                      onChange={e => setNomEdition(e.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                      autoFocus
                    />
                    <button onClick={() => sauvegarderSeance(seance.id)} style={styles.btnPrimary}>✓</button>
                    <button onClick={() => setEnEdition(null)} style={styles.btnSecondary}>✕</button>
                  </>
                ) : (
                  <>
                    <div style={styles.orderBtns}>
                      <button onClick={() => deplacerSeance(i, -1)} disabled={i === 0} style={{ ...styles.orderBtn, opacity: i === 0 ? 0.2 : 1 }}>↑</button>
                      <button onClick={() => deplacerSeance(i, 1)} disabled={i === seances.length - 1} style={{ ...styles.orderBtn, opacity: i === seances.length - 1 ? 0.2 : 1 }}>↓</button>
                    </div>
                    <div
                      onClick={() => navigate(`/seance/${seance.id}`)}
                      style={{ ...styles.seanceCard, borderLeft: `4px solid ${i === 0 ? '#e4f816' : '#e5e7eb'}` }}
                    >
                      <span style={styles.seanceOrdre}>Jour {i + 1}</span>
                      <span style={styles.seanceNom}>{seance.nom}</span>
                    </div>
                    <button onClick={() => { setEnEdition(seance.id); setNomEdition(seance.nom) }} style={styles.iconBtn}>✏️</button>
                    <button onClick={() => supprimerSeance(seance.id)} style={styles.iconBtn}>🗑️</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={ajouterSeance}>
          <div style={styles.addForm}>
            <input
              value={nouvelleSeance}
              onChange={e => setNouvelleSeance(e.target.value)}
              placeholder="ex: Séance A — Lower body"
              style={{ ...styles.input, flex: 1 }}
            />
            <button type="submit" style={styles.btnPrimary}>+ Ajouter</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={ouvrirTemplates} style={{ ...styles.btnSecondary, fontSize: '0.8rem', padding: '0.5rem 0.875rem' }}>📋 Depuis un modèle</button>
            <button type="button" onClick={() => setShowImport(true)} style={{ ...styles.btnSecondary, fontSize: '0.8rem', padding: '0.5rem 0.875rem' }}>⬆ Importer Excel</button>
          </div>
        </form>

        {/* Panel modèles */}
        {showTemplates && (
          <div style={{ marginTop: '0.75rem', background: 'white', borderRadius: 14, border: '1.5px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Choisir un modèle</p>
              <button onClick={() => setShowTemplates(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
            {templates.length === 0 ? (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>Aucun modèle sauvegardé.</p>
            ) : (
              templates.map(t => (
                <div key={t.id} onClick={() => chargerTemplate(t)}
                  style={{ padding: '0.875rem 1rem', borderBottom: '1px solid #f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}
                >
                  <div>
                    <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#333333' }}>{t.nom}</p>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>{t.exercices?.length || 0} exercice{(t.exercices?.length || 0) > 1 ? 's' : ''}</p>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: '1.2rem' }}>›</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  loading: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page: { padding: '2rem', maxWidth: '700px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' },
  card: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  clientLabel: { fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' },
  progTitle: { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  metaBadge: { background: '#f3f4f6', color: '#374151', padding: '0.25rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '600' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle: { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  emptyCard: { background: 'white', borderRadius: '14px', padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  seanceRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  seanceCard: { flex: 1, display: 'flex', alignItems: 'center', gap: '0.875rem', background: 'white', borderRadius: '12px', padding: '0.875rem 1rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  seanceOrdre: { fontSize: '0.75rem', fontWeight: '800', color: '#9ca3af', minWidth: '20px' },
  seanceNom: { fontWeight: '600', fontSize: '0.9rem', color: '#333333' },
  addForm: { display: 'flex', gap: '0.75rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input: { padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box', width: '100%' },
  select: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', background: 'white' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  btnDanger: { background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  iconBtn: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' },
  orderBtns: { display: 'flex', flexDirection: 'column', gap: '2px' },
  orderBtn: { background: 'white', border: '1.5px solid #e5e7eb', borderRadius: '6px', padding: '0.2rem 0.45rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', color: '#374151', lineHeight: 1 },
}
