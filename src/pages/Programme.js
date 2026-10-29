import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ImportExcel from './ImportExcel'
import { sendNotif } from '../notifs'
import Icon from '../components/Icon'

export default function Programme() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [programme, setProgramme] = useState(null)
  const [seances, setSeances] = useState([])
  const [loading, setLoading] = useState(true)
  // Nom de la nouvelle séance, un champ par colonne (musculation / terrain)
  const [nouvelleSeance, setNouvelleSeance] = useState({ musculation: '', terrain: '' })
  const [enEdition, setEnEdition] = useState(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState([])
  const [showImport, setShowImport] = useState(false)
  const [nomEdition, setNomEdition] = useState('')
  const [editProgramme, setEditProgramme] = useState(false)
  const [formProgramme, setFormProgramme] = useState({ nom: '', semaines: 4, date_debut: '', description: '' })
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
      .from('programmes').select('*, clients(prenom, nom), groupes(id, nom, couleur), programme_templates!programmes_bibliotheque_template_id_fkey(nom, description)').eq('id', id).single()
    if (error) console.error(error)
    else { setProgramme(data); setFormProgramme({ nom: data.nom, semaines: data.semaines, date_debut: data.date_debut || '', description: data.programme_templates?.description || '' }) }
    setLoading(false)
  }

  async function fetchSeances() {
    const { data, error } = await supabase
      .from('seances').select('*, exercices(count)').eq('programme_id', id).order('ordre', { ascending: true })
    if (error) console.error(error)
    else setSeances(data)
  }

  async function ajouterSeance(e, type) {
    e.preventDefault()
    const nom = nouvelleSeance[type].trim()
    if (!nom) return
    const { data, error } = await supabase
      .from('seances').insert([{ programme_id: id, nom, ordre: seances.length + 1, type }]).select().single()
    if (error) { alert(error.message); return }
    setSeances([...seances, data])
    setNouvelleSeance(n => ({ ...n, [type]: '' }))
    // Notifier le client (sans objet pour un brouillon bibliothèque, sans client)
    if (!programme.client_id) return
    try {
      const { data: clientData } = await supabase
        .from('clients')
        .select('user_id, prenom')
        .eq('id', programme.client_id)
        .single()
      if (clientData?.user_id) {
        const result = await sendNotif(clientData.user_id, {
          titre: `Nouvelle séance : ${nom}`,
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

  // Échange la séance avec sa voisine de la même colonne (musculation ou
  // terrain) : les séances de l'autre colonne gardent leur place.
  async function deplacerSeance(index, targetIndex) {
    if (targetIndex < 0 || targetIndex >= seances.length) return
    const arr = [...seances]
    ;[arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]]
    // Renumérote proprement 1..n — robuste même si les ordres étaient nuls ou
    // dupliqués (ex. séances créées par assignation/import).
    const renum = arr.map((s, i) => ({ ...s, ordre: i + 1 }))
    setSeances(renum)  // mise à jour immédiate de l'écran
    // Persiste en base (seulement les séances dont l'ordre a changé)
    for (let i = 0; i < renum.length; i++) {
      if (seances[i]?.id !== renum[i].id || seances[i]?.ordre !== renum[i].ordre) {
        await supabase.from('seances').update({ ordre: renum[i].ordre }).eq('id', renum[i].id)
      }
    }
  }

  async function supprimerSeance(seanceId) {
    if (!window.confirm('Supprimer cette séance et tous ses exercices ?')) return
    const { error } = await supabase.from('seances').delete().eq('id', seanceId)
    if (error) alert(error.message)
    else setSeances(seances.filter(s => s.id !== seanceId))
  }

  async function sauvegarderProgramme() {
    const semaines   = formProgramme.semaines
    const dateDebut  = formProgramme.date_debut || null
    const { error } = await supabase.from('programmes').update({ nom: formProgramme.nom, semaines, date_debut: dateDebut }).eq('id', id)
    if (error) { alert(error.message); return }

    // Programme de groupe (le « modèle ») → aligner toutes les copies des membres
    // sur la même durée et la même date de début, pour que tout le monde commence
    // et finisse en même temps.
    const estModeleDeGroupe = programme?.groupe_id && !programme?.template_id
    if (estModeleDeGroupe) {
      const { data: copies, error: ce } = await supabase.from('programmes')
        .update({ semaines, date_debut: dateDebut })
        .eq('template_id', id)
        .select('id')
      if (ce) alert("Le programme est enregistré, mais les copies des membres n'ont pas pu être mises à jour : " + ce.message)
      else if (copies?.length) alert(`Programme enregistré. ${copies.length} membre${copies.length > 1 ? 's' : ''} réaligné${copies.length > 1 ? 's' : ''} sur la même période.`)
    }

    setProgramme({ ...programme, ...formProgramme })
    setEditProgramme(false)
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
      .from('seances').insert([{
        programme_id: id, nom: template.nom, ordre: seances.length + 1,
        echauffement: template.echauffement?.length > 0 ? template.echauffement : [],
      }]).select().single()
    if (error) { alert(error.message); return }
    if (template.exercices?.length > 0) {
      const exInserts = template.exercices.map(ex => ({
        seance_id: newSeance.id, code: ex.code, nom: ex.nom, series: ex.series,
        repetitions: ex.repetitions, tempo: ex.tempo, recuperation: ex.recuperation,
        type_intensite: ex.type_intensite, valeur_intensite: ex.valeur_intensite,
        ordre: ex.ordre, bibliotheque_id: ex.bibliotheque_id || null,
        progressions: ex.progressions || null,
        series_echauffement: ex.series_echauffement || null,
        media_url: ex.media_url || null,
      }))
      await supabase.from('exercices').insert(exInserts)
    }
    // RPE cibles
    const rpeCibles = template.rpe_cibles || {}
    if (Object.keys(rpeCibles).length > 0) {
      await supabase.from('rpe_seances').insert(
        Object.entries(rpeCibles).map(([sem, val]) => ({ seance_id: newSeance.id, semaine: parseInt(sem), rpe_cible: val }))
      )
    }
    setSeances(prev => [...prev, newSeance])
    setShowTemplates(false)
  }

  async function testerPushClient() {
    try {
      const { data: clientData } = await supabase
        .from('clients').select('user_id, prenom').eq('id', programme.client_id).single()

      if (!clientData?.user_id) {
        showToast('clients.user_id est null — le client doit ouvrir l\'app une fois', false)
        return
      }

      // Envoyer directement (la Edge Function vérifie la subscription côté serveur avec service_role)
      showToast('Envoi en cours…', true)
      const result = await sendNotif(clientData.user_id, {
        titre: 'Test push',
        corps: 'Si tu vois cette notification sur ton téléphone, les push fonctionnent !',
        type: 'info',
        lien: '/client/notifications',
      })
      if (result?.ok) showToast('✓ Notif envoyée — vérifie le téléphone', true)
      else showToast(`Échec : ${result?.reason}`, false)
    } catch (e) {
      showToast(`Erreur : ${e.message}`, false)
    }
  }

  async function supprimerProgramme() {
    if (!window.confirm('Supprimer ce cycle et toutes ses séances ?')) return
    const { error } = await supabase.from('programmes').delete().eq('id', id)
    if (error) alert(error.message)
    else if (programme.groupe_id) navigate(`/groupe/${programme.groupe_id}`)
    else if (programme.client_id) navigate(`/client/${programme.client_id}`)
    else navigate('/bibliotheque')
  }

  // Construit les lignes programme_template_seances (exercices + échauffement +
  // cardio + RPE cibles) à partir des vraies séances de CE programme. Utilisé à
  // la fois pour créer un nouveau template et pour resynchroniser un brouillon
  // bibliothèque vers son template existant.
  async function construireLignesTemplate(templateId) {
    if (seances.length === 0) return []
    const seanceIds = seances.map(s => s.id)

    const [{ data: exos }, { data: seancesData }, { data: rpeData }] = await Promise.all([
      supabase.from('exercices').select('*').in('seance_id', seanceIds).order('ordre', { ascending: true }),
      supabase.from('seances').select('id, type, echauffement, cardio_debut, cardio_fin, cardio_blocs').in('id', seanceIds),
      supabase.from('rpe_seances').select('seance_id, semaine, rpe_cible').in('seance_id', seanceIds).not('rpe_cible', 'is', null),
    ])

    const bySeance = {}
    ;(exos || []).forEach(ex => {
      if (!bySeance[ex.seance_id]) bySeance[ex.seance_id] = []
      bySeance[ex.seance_id].push({
        code: ex.code, nom: ex.nom, series: ex.series,
        repetitions: ex.repetitions, tempo: ex.tempo,
        recuperation: ex.recuperation, type_intensite: ex.type_intensite,
        valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
        bibliotheque_id: ex.bibliotheque_id || null,
        progressions: ex.progressions?.length > 0 ? ex.progressions : null,
        series_echauffement: ex.series_echauffement?.length > 0 ? ex.series_echauffement : null,
        media_url: ex.media_url || null,
        contenu: ex.contenu || null,
        schema: ex.schema || null,
      })
    })

    const echauffMap = {}
    const cardioMap = {}
    const typeMap = {}
    ;(seancesData || []).forEach(s => {
      typeMap[s.id] = s.type || 'musculation'
      echauffMap[s.id] = s.echauffement || []
      cardioMap[s.id] = { cardio_debut: s.cardio_debut || null, cardio_fin: s.cardio_fin || null, cardio_blocs: s.cardio_blocs || [] }
    })

    const rpeMap = {}
    ;(rpeData || []).forEach(r => {
      if (!rpeMap[r.seance_id]) rpeMap[r.seance_id] = {}
      rpeMap[r.seance_id][r.semaine] = r.rpe_cible
    })

    return seances.map((s, idx) => ({
      template_id: templateId,
      nom: s.nom,
      type: typeMap[s.id] || 'musculation',
      jour: idx + 1,
      ordre: s.ordre || idx + 1,
      exercices: bySeance[s.id] || [],
      echauffement: echauffMap[s.id] || [],
      rpe_cibles: rpeMap[s.id] || {},
      cardio_debut: cardioMap[s.id]?.cardio_debut || null,
      cardio_fin: cardioMap[s.id]?.cardio_fin || null,
      cardio_blocs: cardioMap[s.id]?.cardio_blocs || [],
    }))
  }

  async function sauvegarderCommeTemplate() {
    if (!templateForm.nom.trim()) return
    setSavingTemplate(true)
    try {
      const { data: tpl, error: tplErr } = await supabase
        .from('programme_templates')
        .insert({ nom: templateForm.nom.trim(), semaines: programme.semaines, description: templateForm.description || null })
        .select('id').single()
      if (tplErr) throw tplErr

      const lignes = await construireLignesTemplate(tpl.id)
      if (lignes.length > 0) await supabase.from('programme_template_seances').insert(lignes)

      setShowSaveTemplate(false)
      showToast(`Template "${templateForm.nom}" enregistré ✓`, true)
    } catch (e) {
      showToast(`Erreur : ${e.message}`, false)
    }
    setSavingTemplate(false)
  }

  // Resynchronise un brouillon bibliothèque vers son template existant
  // (programme_templates.bibliotheque_template_id) : nom/semaines/description +
  // toutes les séances (delete-all + reinsert, comme dans CycleTemplates.js).
  async function sauvegarderDansBibliotheque(silent = false) {
    const templateId = programme.bibliotheque_template_id
    if (!templateId) return
    setSavingTemplate(true)
    try {
      await supabase.from('programme_templates')
        .update({ nom: programme.nom, semaines: programme.semaines, description: formProgramme.description || null })
        .eq('id', templateId)

      const lignes = await construireLignesTemplate(templateId)
      await supabase.from('programme_template_seances').delete().eq('template_id', templateId)
      if (lignes.length > 0) await supabase.from('programme_template_seances').insert(lignes)

      if (!silent) showToast('Enregistré dans la bibliothèque ✓', true)
    } catch (e) {
      if (!silent) showToast(`Erreur : ${e.message}`, false)
      else console.warn('[bibliotheque] synchronisation auto échouée :', e)
    }
    setSavingTemplate(false)
  }

  // Filet de sécurité : un brouillon bibliothèque n'est fiable que si on ne
  // dépend PAS uniquement du clic sur "Enregistrer dans la bibliothèque"
  // (un coach peut fermer l'onglet, faire retour arrière, etc. sans cliquer).
  // On resynchronise donc aussi silencieusement à chaque sortie de la page.
  const saveOnLeaveRef = useRef(() => {})
  saveOnLeaveRef.current = () => { if (programme?.bibliotheque_template_id) sauvegarderDansBibliotheque(true) }
  useEffect(() => {
    return () => { saveOnLeaveRef.current() }
  }, [])

  if (loading) return <div style={styles.loading}><p style={{ color: '#6b7280' }}>Chargement...</p></div>
  if (!programme) return <div style={styles.loading}><p style={{ color: '#6b7280' }}>Programme introuvable.</p></div>

  if (showImport) return (
    <ImportExcel
      programmeId={id}
      semaines={programme.semaines}
      onClose={() => setShowImport(false)}
      onImported={() => { setShowImport(false); fetchSeances() }}
    />
  )

  // Deux colonnes : musculation et terrain. Le numéro du jour reste celui de
  // l'ordre dans le cycle.
  const COLONNES = [
    { type: 'musculation', titre: 'Musculation', icone: 'dumbbell', placeholder: 'Nouvelle séance de musculation' },
    { type: 'terrain', titre: 'Terrain', icone: 'terrain', placeholder: 'Nouvelle séance terrain' },
  ]
  const typeDe = s => (s.type === 'terrain' ? 'terrain' : 'musculation')
  const nbExos = s => s.exercices?.[0]?.count || 0

  return (
    <div style={styles.page}>
      {/* Toast confirmation notification */}
      {notifToast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: notifToast.ok ? '#333333' : '#dc2626',
          color: notifToast.ok ? '#e4f816' : 'white',
          padding: '0.65rem 1.25rem', borderRadius: 12,
          fontSize: '0.85rem', fontWeight: '700',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          zIndex: 999, whiteSpace: 'nowrap',
        }}>
          {notifToast.msg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={async () => {
          if (programme.bibliotheque_template_id) {
            await sauvegarderDansBibliotheque(true)
            navigate('/bibliotheque')
          }
          else if (programme.groupe_id && !programme.template_id) navigate(`/groupe/${programme.groupe_id}`)
          else if (programme.template_id) navigate(`/groupe/${programme.groupe_id}`)
          else navigate(`/client/${programme.client_id}`)
        }} style={styles.backBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          Retour
        </button>
        {programme.client_id && (
          <button onClick={testerPushClient} style={styles.btnGhost}>Test push</button>
        )}
      </div>

      {/* En-tête programme */}
      {editProgramme ? (
        <div style={styles.card}>
          <p style={{ ...styles.sectionTitle, marginBottom: '1rem' }}>Modifier le cycle</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={styles.label}>Nom</label>
              <input value={formProgramme.nom} onChange={e => setFormProgramme({ ...formProgramme, nom: e.target.value })} style={styles.input} />
            </div>
            {programme.bibliotheque_template_id ? (
              <div>
                <label style={styles.label}>Description (optionnel)</label>
                <input value={formProgramme.description} onChange={e => setFormProgramme({ ...formProgramme, description: e.target.value })} style={styles.input} placeholder="Niveau, objectifs, particularités…" />
              </div>
            ) : (
              <div>
                <label style={styles.label}>Date de début</label>
                <input type="date" value={formProgramme.date_debut} onChange={e => setFormProgramme({ ...formProgramme, date_debut: e.target.value })} style={styles.input} />
              </div>
            )}
            <div>
              <label style={styles.label}>Semaines</label>
              <select value={formProgramme.semaines} onChange={e => setFormProgramme({ ...formProgramme, semaines: e.target.value })} style={styles.select}>
                {[2,3,4,5,6,7,8,10,12].map(n => <option key={n} value={n}>{n} semaines</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setEditProgramme(false)} style={styles.btnSecondary}>Annuler</button>
            <button onClick={sauvegarderProgramme} style={styles.btnPrimary}>Sauvegarder</button>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              {/* Contexte : brouillon bibliothèque, template de groupe ou copie de groupe */}
              {(programme.bibliotheque_template_id || programme.groupe_id) && (
                <span style={{ ...styles.metaBadge, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                  {programme.groupe_id && <span style={{ width: 8, height: 8, borderRadius: '50%', background: programme.groupes?.couleur || '#6b7280' }} />}
                  {programme.bibliotheque_template_id ? 'Brouillon bibliothèque'
                    : programme.template_id ? `Copie de groupe · ${programme.groupes?.nom}`
                    : `Groupe · ${programme.groupes?.nom}`}
                </span>
              )}
              {programme.clients && <p style={styles.clientLabel}>{programme.clients.prenom} {programme.clients.nom}</p>}
              <h1 style={styles.progTitle}>{programme.nom}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <span style={styles.metaBadge}>{programme.semaines} semaines</span>
                <span style={styles.metaBadge}>{seances.length} séance{seances.length > 1 ? 's' : ''}</span>
                {programme.date_debut && <span style={styles.metaBadge}>Début le {new Date(programme.date_debut + 'T00:00:00').toLocaleDateString('fr-FR')}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setEditProgramme(true)} style={styles.btnSecondary}>Modifier</button>
              {programme.bibliotheque_template_id ? (
                <button
                  onClick={sauvegarderDansBibliotheque}
                  disabled={savingTemplate}
                  style={{ ...styles.btnPrimary, opacity: savingTemplate ? 0.7 : 1 }}
                >
                  {savingTemplate ? 'Enregistrement…' : 'Enregistrer dans la bibliothèque'}
                </button>
              ) : (
                <>
                  <button onClick={() => { setTemplateForm({ nom: programme.nom, description: '' }); setShowSaveTemplate(true) }} style={styles.btnSecondary}>Enregistrer comme modèle</button>
                  <button onClick={supprimerProgramme} style={styles.btnDanger}>Supprimer le cycle</button>
                </>
              )}
            </div>
          </div>

          {/* Enregistrer comme template */}
          {!programme.bibliotheque_template_id && showSaveTemplate && (
            <div style={{ marginTop: '1.25rem', background: '#f9fafb', borderRadius: 12, border: '1.5px solid #e5e7eb', padding: '1rem', maxWidth: 640 }}>
              <p style={{ ...styles.sectionTitle, marginBottom: '0.75rem' }}>Enregistrer comme modèle de cycle</p>
              <div style={{ marginBottom: '0.65rem' }}>
                <label style={styles.label}>Nom du modèle *</label>
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
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
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

      {/* Séances : une colonne par type */}
      <div style={styles.colonnes}>
        {COLONNES.map(col => {
          const liste = seances.map((s, i) => ({ s, i })).filter(({ s }) => typeDe(s) === col.type)
          const nbTotal = liste.reduce((n, { s }) => n + nbExos(s), 0)
          return (
            <section key={col.type} style={styles.colonne}>
              <div style={styles.colTete}>
                <span style={styles.colIcone}>
                  {col.icone === 'dumbbell' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" /></svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M12 5v14" /><circle cx="12" cy="12" r="2.5" /></svg>
                  )}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={styles.colTitre}>{col.titre}</p>
                  <p style={styles.colSous}>
                    {liste.length} séance{liste.length > 1 ? 's' : ''}
                    {col.type === 'musculation' && nbTotal > 0 && ` · ${nbTotal} exercice${nbTotal > 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              <div style={{ flex: 1 }}>
                {liste.length === 0 ? (
                  <p style={styles.vide}>Aucune séance {col.type === 'terrain' ? 'terrain' : 'de musculation'}.</p>
                ) : liste.map(({ s: seance, i }, k) => {
                  const precedente = liste[k - 1]?.i
                  const suivante = liste[k + 1]?.i
                  return (
                    <div key={seance.id} style={styles.seanceRow}>
                      {enEdition === seance.id ? (
                        <>
                          <input
                            value={nomEdition}
                            onChange={e => setNomEdition(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sauvegarderSeance(seance.id); if (e.key === 'Escape') setEnEdition(null) }}
                            style={{ ...styles.input, flex: 1 }}
                            autoFocus
                          />
                          <button onClick={() => sauvegarderSeance(seance.id)} style={styles.iconBtn} aria-label="Enregistrer le nom"><Icon name="check" size={16} /></button>
                          <button onClick={() => setEnEdition(null)} style={styles.iconBtn} aria-label="Annuler"><Icon name="x" size={16} /></button>
                        </>
                      ) : (
                        <>
                          <div style={styles.orderBtns}>
                            <button onClick={() => deplacerSeance(i, precedente)} disabled={precedente === undefined} aria-label="Monter"
                              style={{ ...styles.orderBtn, opacity: precedente === undefined ? 0.25 : 1 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 15l6-6 6 6" /></svg>
                            </button>
                            <button onClick={() => deplacerSeance(i, suivante)} disabled={suivante === undefined} aria-label="Descendre"
                              style={{ ...styles.orderBtn, opacity: suivante === undefined ? 0.25 : 1 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
                            </button>
                          </div>
                          <div role="button" tabIndex={0} onClick={() => navigate(`/seance/${seance.id}`)}
                            onKeyDown={e => { if (e.key === 'Enter') navigate(`/seance/${seance.id}`) }}
                            style={styles.seanceCard}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                            <span style={styles.seanceOrdre}>Jour {i + 1}</span>
                            <span style={{ minWidth: 0 }}>
                              <span style={styles.seanceNom}>{seance.nom}</span>
                              {col.type === 'musculation' && (
                                <span style={styles.seanceSous}>{nbExos(seance)} exercice{nbExos(seance) > 1 ? 's' : ''}</span>
                              )}
                            </span>
                          </div>
                          <button onClick={() => { setEnEdition(seance.id); setNomEdition(seance.nom) }} style={styles.iconBtn} aria-label="Renommer"><Icon name="edit" size={16} /></button>
                          <button onClick={() => supprimerSeance(seance.id)} style={styles.iconBtn} aria-label="Supprimer"><Icon name="trash" size={16} /></button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              <form onSubmit={e => ajouterSeance(e, col.type)} style={styles.addForm}>
                <input
                  value={nouvelleSeance[col.type]}
                  onChange={e => setNouvelleSeance(n => ({ ...n, [col.type]: e.target.value }))}
                  placeholder={col.placeholder}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button type="submit" style={styles.btnPrimary}>Ajouter</button>
              </form>
              {col.type === 'musculation' && (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={ouvrirTemplates} style={styles.btnGhost}>Depuis un modèle</button>
                    <button type="button" onClick={() => setShowImport(true)} style={styles.btnGhost}>Importer un fichier Excel</button>
                  </div>
                  {/* Panel modèles */}
                  {showTemplates && (
                    <div style={{ marginTop: '0.75rem', background: 'white', borderRadius: 12, border: '1.5px solid #e5e7eb', overflow: 'hidden' }}>
                      <div style={{ padding: '0.5rem 0.5rem 0.5rem 1rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={styles.sectionTitle}>Choisir un modèle</p>
                        <button onClick={() => setShowTemplates(false)} style={styles.iconBtn} aria-label="Fermer"><Icon name="x" size={16} /></button>
                      </div>
                      {templates.length === 0 ? (
                        <p style={{ color: '#6b7280', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>Aucun modèle sauvegardé.</p>
                      ) : (
                        templates.map(t => (
                          <div role="button" tabIndex={0} key={t.id} onClick={() => chargerTemplate(t)}
                            style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                          >
                            <div>
                              <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#333333' }}>{t.nom}</p>
                              <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{t.exercices?.length || 0} exercice{(t.exercices?.length || 0) > 1 ? 's' : ''}</p>
                            </div>
                            <Icon name="chevron-right" size={18} style={{ color: '#9ca3af' }} />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  loading: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page: { padding: '2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0.5rem 0.5rem 0', fontFamily: 'inherit' },
  card: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  clientLabel: { fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' },
  progTitle: { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  metaBadge: { background: '#f3f4f6', color: '#374151', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '600' },
  sectionTitle: { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  colonnes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem', marginTop: '1rem', alignItems: 'start' },
  colonne: { background: 'white', borderRadius: 16, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' },
  colTete: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0 0 1rem 0.25rem', borderBottom: '1px solid #f3f4f6', marginBottom: '0.5rem' },
  colIcone: { width: 40, height: 40, borderRadius: 10, background: '#333333', color: '#e4f816', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  colTitre: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#333333' },
  colSous: { margin: '2px 0 0', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280' },
  vide: { color: '#6b7280', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0', margin: 0 },
  seanceRow: { display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0' },
  seanceCard: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: 10, padding: '0.5rem', cursor: 'pointer', background: 'none' },
  seanceOrdre: { fontSize: '0.75rem', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 56, flexShrink: 0 },
  seanceNom: { display: 'block', fontWeight: '700', fontSize: '0.92rem', color: '#333333' },
  seanceSous: { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginTop: 2 },
  addForm: { display: 'flex', gap: '0.5rem', marginTop: '0.75rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input: { padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box', width: '100%', fontFamily: 'inherit' },
  select: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', background: 'white' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnGhost: { background: 'none', color: '#6b7280', border: 'none', borderRadius: '10px', padding: '0.5rem 0.5rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  btnDanger: { background: 'none', color: '#dc2626', border: 'none', borderRadius: '10px', padding: '0.65rem 0.75rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  iconBtn: { width: 36, height: 36, background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 },
  orderBtns: { display: 'flex', flexDirection: 'column', flexShrink: 0 },
  orderBtn: { width: 28, height: 20, background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
}
