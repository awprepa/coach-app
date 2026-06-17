import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Calendrier from '../components/Calendrier'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ChargePanel } from './ChargeEntrainement'
import { CGV_CONTENU } from './CGV'


const OFFRES = {
  gratuit:             { label: 'Gratuit',         bg: '#f0fdf4', color: '#15803d' },
  essai:               { label: 'Essai',  bg: '#fff7ed', color: '#c2410c' },
  preparation_physique:{ label: 'Prépa physique',  bg: '#eff6ff', color: '#1d4ed8' },
  coaching:            { label: 'Coaching',        bg: '#f5f3ff', color: '#6d28d9' },
}
function offreLabel(offre) { return OFFRES[offre]?.label || offre }
function offreBadge(offre) { const o = OFFRES[offre]; return o ? { background: o.bg, color: o.color } : {} }

function getAvatar(prenom, nom) {
  const initiales = `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase()
  const palettes = [
    { bg: '#dbeafe', text: '#1d4ed8' }, { bg: '#dcfce7', text: '#15803d' },
    { bg: '#fef9c3', text: '#a16207' }, { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#ede9fe', text: '#6d28d9' }, { bg: '#ffedd5', text: '#c2410c' },
  ]
  const idx = ((prenom?.charCodeAt(0) || 0) + (nom?.charCodeAt(0) || 0)) % palettes.length
  return { initiales, ...palettes[idx] }
}

function isCycleTermine(prog) {
  if (!prog.date_debut) return false
  const fin = new Date(prog.date_debut + 'T00:00:00')
  fin.setDate(fin.getDate() + prog.semaines * 7)
  return fin < new Date()
}

const INDICATORS = [
  { key: 'sommeil',  label: 'Sommeil',  emoji: '🌙' },
  { key: 'fatigue',  label: 'Fatigue',  emoji: '⚡' },
  { key: 'douleurs', label: 'Douleurs', emoji: '🩹' },
  { key: 'stress',   label: 'Stress',   emoji: '🧠' },
]

function scoreColor(v) {
  if (!v) return '#e5e7eb'
  if (v <= 1) return '#ef4444'
  if (v <= 2) return '#f97316'
  if (v <= 3) return '#eab308'
  return '#22c55e'
}

function scoreLabel(key, v) {
  const labels = {
    sommeil:  ['', 'Très mauvais', 'Mauvais', 'Bien', 'Excellent'],
    fatigue:  ['', 'Épuisé', 'Fatigué', 'En forme', 'Top'],
    douleurs: ['', 'Intense', 'Présentes', 'Légères', 'Aucune'],
    stress:   ['', 'Très stressé', 'Stressé', 'Calme', 'Très calme'],
  }
  return labels[key]?.[v] || v
}

export default function FicheClient() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [programmes, setCycles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({})
  const [categories, setCategories] = useState([])
  const [seances, setSeances] = useState([])
  const [showPastCycles, setShowPastCycles] = useState(false)
  const [wellness, setWellness] = useState([])
  const [showAllWellness, setShowAllWellness] = useState(false)
  const [activeTab, setActiveTab] = useState('suivi') // 'suivi' | 'perf' | 'nutrition'
  const [contratData, setContratData] = useState(null)
  const [showContratModal, setShowContratModal] = useState(false)
  const [progression, setProgression] = useState([]) // charges max par exercice/semaine
  const [selectedExo, setSelectedExo] = useState(null)
  const [dupliquerLoading, setDupliquerLoading] = useState(null)
  const [nutritionPlan, setNutritionPlan]     = useState(null)  // null=pas chargé, false=aucun plan actif
  const [nutritionAdher, setNutritionAdher]   = useState([])   // 7 derniers jours
  const [nutritionProfile, setNutritionProfile] = useState(null)
  const [seancesClient, setSeancesClient] = useState([])
  const [showAllSeancesClient, setShowAllSeancesClient] = useState(false)
  const [notesCoach, setNotesCoach] = useState('')
  const [notesSaved, setNotesSaved] = useState(true)
  const [notesSavedAt, setNotesSavedAt] = useState(null)


  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchClient(); fetchCycles(); fetchCategories(); fetchWellness(); fetchSeancesClient(); fetchContrat() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchContrat() {
    const { data } = await supabase.from('acceptations_contrat')
      .select('created_at, version_contrat, formule')
      .eq('client_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    setContratData(data || null)
  }

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('created_at')
    setCategories(data || [])
  }

  async function fetchWellness() {
    const { data } = await supabase.from('wellness')
      .select('*').eq('client_id', id)
      .order('date', { ascending: false }).limit(60)
    setWellness(data || [])
  }

  async function sauvegarderNotesCoach(val) {
    await supabase.from('clients').update({ notes_coach: val || null }).eq('id', id)
    setNotesSaved(true)
    setNotesSavedAt(new Date())
  }

  async function fetchSeancesClient() {
    const { data } = await supabase.from('evenements')
      .select('*, seances_libres_exercices(id, nom, ordre, seances_libres_series(num_serie, poids, reps))')
      .eq('client_id', id).eq('source', 'client')
      .order('date', { ascending: false }).limit(50)
    setSeancesClient(data || [])
  }

  async function fetchClient() {
    const { data, error } = await supabase.from('clients').select('*, categories(id, nom, couleur)').eq('id', id).single()
    if (error) console.log(error)
    else { setClient(data); setForm(data); setNotesCoach(data.notes_coach || '') }
    setLoading(false)
  }

  async function fetchCycles() {
    const { data, error } = await supabase.from('programmes').select('*').eq('client_id', id).order('created_at', { ascending: false })
    if (error) { console.log(error); return }
    setCycles(data)
    const active = data.filter(p => !isCycleTermine(p))
    if (active.length > 0) {
      const { data: seancesData } = await supabase
        .from('seances').select('id, nom, ordre')
        .in('programme_id', active.map(p => p.id))
        .order('ordre', { ascending: true })
      setSeances(seancesData || [])
    }
  }

  async function sauvegarderClient() {
    // Si l'offre change, on remet offre_confirmee_at à null
    // pour que le client re-confirme son abonnement à la prochaine connexion
    const offreChangee = form.offre !== client.offre
    const { error } = await supabase.from('clients').update({
      prenom: form.prenom, nom: form.nom, email: form.email,
      telephone: form.telephone, objectif: form.objectif,
      offre: form.offre, engagement_mois: form.engagement_mois || null,
      date_debut: form.date_debut, date_fin: form.date_fin,
      notes: form.notes, categorie_id: form.categorie_id || null,
      ...(offreChangee ? { offre_confirmee_at: null } : {}),
    }).eq('id', id)
    if (error) alert(error.message)
    else { await fetchClient(); setEditMode(false) }
  }

  async function supprimerClient() {
    if (!window.confirm('Supprimer ce client et toutes ses données ?')) return
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) alert(error.message)
    else navigate('/')
  }

  async function inviterClient() {
    if (!client.email) { alert('Ce client n\'a pas d\'email renseigné.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(client.email, {
      redirectTo: window.location.origin + '/login'
    })
    if (error) alert(error.message)
    else alert(`Email envoyé à ${client.email}`)
  }

  async function dupliquerProgramme(prog) {
    if (!window.confirm(`Dupliquer le cycle "${prog.nom}" ?`)) return
    setDupliquerLoading(prog.id)
    try {
      // 1. Créer le nouveau programme
      const { data: newProg, error: e1 } = await supabase.from('programmes')
        .insert([{ client_id: id, nom: prog.nom + ' (copie)', semaines: prog.semaines, date_debut: null }])
        .select().single()
      if (e1) throw e1

      // 2. Récupérer les séances originales
      const { data: seancesOrig } = await supabase.from('seances')
        .select('*').eq('programme_id', prog.id).order('ordre')

      for (const s of (seancesOrig || [])) {
        // 3. Créer la séance
        const { data: newSeance, error: e2 } = await supabase.from('seances')
          .insert([{ programme_id: newProg.id, nom: s.nom, ordre: s.ordre, echauffement: s.echauffement }])
          .select().single()
        if (e2) throw e2
        if (!newSeance) throw new Error('Erreur création séance')

        // 4. Récupérer et copier les exercices
        const { data: exos } = await supabase.from('exercices')
          .select('*').eq('seance_id', s.id).order('ordre')

        for (const ex of (exos || [])) {
          const { data: newEx, error: e3 } = await supabase.from('exercices')
            .insert([{ seance_id: newSeance.id, code: ex.code, nom: ex.nom, series: ex.series, repetitions: ex.repetitions, tempo: ex.tempo, recuperation: ex.recuperation, type_intensite: ex.type_intensite, valeur_intensite: ex.valeur_intensite, ordre: ex.ordre, bibliotheque_id: ex.bibliotheque_id }])
            .select().single()
          if (e3) throw e3

          // 5. Copier les charges
          const { data: charges } = await supabase.from('charges').select('*').eq('exercice_id', ex.id)
          if (charges?.length) {
            await supabase.from('charges').insert(charges.map(c => ({ exercice_id: newEx.id, semaine: c.semaine, charge: c.charge, rpe_reel: c.rpe_reel })))
          }
        }
      }
      await fetchCycles()
      alert(`Cycle "${newProg.nom}" créé avec succès !`)
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
    setDupliquerLoading(null)
  }

  async function fetchProgression() {
    // Récupère toutes les séries trackées pour ce client pour dessiner les courbes de progression
    const { data: progs } = await supabase.from('programmes').select('id').eq('client_id', id)
    if (!progs?.length) return
    const { data: seancesAll } = await supabase.from('seances').select('id, nom').in('programme_id', progs.map(p => p.id))
    if (!seancesAll?.length) return
    const { data: exosAll } = await supabase.from('exercices').select('id, nom, code, seance_id').in('seance_id', seancesAll.map(s => s.id))
    if (!exosAll?.length) return
    const { data: tracking } = await supabase.from('serie_tracking').select('exercice_id, semaine, poids, valide').in('exercice_id', exosAll.map(e => e.id)).eq('valide', true)
    if (!tracking?.length) return

    // Grouper par nom d'exercice → max poids par semaine
    const byExo = {}
    tracking.forEach(t => {
      const exo = exosAll.find(e => e.id === t.exercice_id)
      if (!exo || !t.poids) return
      const key = exo.nom
      if (!byExo[key]) byExo[key] = {}
      const sem = `S${t.semaine}`
      if (!byExo[key][sem] || parseFloat(t.poids) > parseFloat(byExo[key][sem])) byExo[key][sem] = t.poids
    })

    // Convertir en tableau pour Recharts
    const result = Object.entries(byExo).map(([nom, semaines]) => ({
      nom,
      data: Object.entries(semaines).sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)))
        .map(([sem, poids]) => ({ semaine: sem, poids }))
    })).filter(e => e.data.length >= 2) // au moins 2 points pour une courbe

    setProgression(result)
  }

  async function fetchNutrition() {
    setNutritionPlan(null)
    setNutritionAdher([])
    const today = new Date().toISOString().slice(0, 10)
    const from7  = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

    const [planRes, profileRes] = await Promise.all([
      supabase.from('nutrition_plans')
        .select('id, nom, statut, date_debut, date_fin, nutrition_plan_days(id, jour, type_jour, nutrition_plan_meals(id, nom, meal_type, kcal, prot_g, carbs_g, fat_g))')
        .eq('client_id', id).eq('statut', 'actif')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('nutrition_profile').select('*').eq('client_id', id).maybeSingle(),
    ])

    setNutritionProfile(profileRes.data)

    const plan = planRes.data
    if (!plan) { setNutritionPlan(false); setNutritionAdher([]); return }
    setNutritionPlan(plan)

    const { data: logs } = await supabase
      .from('nutrition_plan_logs')
      .select('date, statut, meal_id, hors_plan_kcal')
      .eq('client_id', id)
      .gte('date', from7).lte('date', today)

    function getDayNum(dateISO) {
      if (!plan.date_debut) return 1
      const diff = Math.floor((new Date(dateISO + 'T00:00:00') - new Date(plan.date_debut + 'T00:00:00')) / 86400000)
      if (diff < 0) return null
      return (diff % 7) + 1
    }

    const adher = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      const dayNum  = getDayNum(d)
      const planDay = dayNum ? (plan.nutrition_plan_days || []).find(pd => pd.jour === dayNum) : null
      const planMeals = planDay?.nutrition_plan_meals || []
      const dayLogs   = (logs || []).filter(l => l.date === d)
      const planLogs  = dayLogs.filter(l => l.meal_id !== null)
      const extraLogs = dayLogs.filter(l => l.meal_id === null)
      const fait     = planLogs.filter(l => l.statut === 'fait').length
      const horsplan = planLogs.filter(l => l.statut === 'hors_plan').length
      const saute    = planLogs.filter(l => l.statut === 'saute').length
      const total    = planMeals.length
      const kcalPrevu = planMeals.reduce((s, m) => s + (m.kcal || 0), 0)
      // fait → kcal du plan meal ; hors_plan → hors_plan_kcal (ou plan meal) ; extra → hors_plan_kcal
      const kcalMange =
        planLogs.filter(l => l.statut === 'fait')
          .reduce((s, l) => s + (planMeals.find(m => m.id === l.meal_id)?.kcal || 0), 0)
        + planLogs.filter(l => l.statut === 'hors_plan')
          .reduce((s, l) => s + (l.hors_plan_kcal ?? planMeals.find(m => m.id === l.meal_id)?.kcal ?? 0), 0)
        + extraLogs.reduce((s, l) => s + (l.hors_plan_kcal || 0), 0)
      const adherPct = total > 0 ? Math.round((fait + horsplan) / total * 100) : null
      adher.push({ date: d, fait, horsplan, saute, total, kcalPrevu, kcalMange, adherPct })
    }
    setNutritionAdher(adher)
  }

  if (loading) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>
  if (!client) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Client introuvable.</p></div>

  const av = getAvatar(client.prenom, client.nom)

  return (
    <div style={styles.page}>
      <button onClick={() => navigate('/')} style={styles.backBtn}>← Retour</button>

      {editMode ? (
        <div style={styles.card}>
          <p style={styles.sectionTitle}>Modifier le client</p>
          <div style={styles.row2}>
            <EditField label="Prénom" value={form.prenom} onChange={v => setForm({ ...form, prenom: v })} />
            <EditField label="Nom" value={form.nom} onChange={v => setForm({ ...form, nom: v })} />
          </div>
          <div style={styles.row2}>
            <EditField label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
            <EditField label="Téléphone" value={form.telephone} onChange={v => setForm({ ...form, telephone: v })} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Offre</label>
            <select value={form.offre} onChange={e => {
              const updated = { ...form, offre: e.target.value, engagement_mois: null }
              if (e.target.value === 'essai') {
                const base = updated.date_debut || new Date().toISOString().slice(0, 10)
                const fin = new Date(base + 'T00:00:00')
                fin.setMonth(fin.getMonth() + 1)
                updated.date_fin = fin.toISOString().slice(0, 10)
              }
              setForm(updated)
            }} style={styles.select}>
              <option value="gratuit">Gratuit</option>
              <option value="essai">Essai</option>
              <option value="preparation_physique">Préparation physique</option>
              <option value="coaching">Coaching</option>
            </select>
          </div>
          {['coaching', 'preparation_physique'].includes(form.offre) && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={styles.label}>Engagement</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[
                  { val: null, label: 'Sans engagement' },
                  { val: 1,    label: '1 mois' },
                  { val: 3,    label: '3 mois' },
                  { val: 6,    label: '6 mois' },
                ].map(opt => {
                  const active = (form.engagement_mois || null) === opt.val
                  return (
                    <button key={String(opt.val)} type="button" onClick={() => {
                      const base = form.date_debut || new Date().toISOString().slice(0, 10)
                      let date_fin = form.date_fin || null
                      if (opt.val) {
                        const fin = new Date(base + 'T00:00:00')
                        fin.setMonth(fin.getMonth() + opt.val)
                        date_fin = fin.toISOString().slice(0, 10)
                      }
                      setForm({ ...form, engagement_mois: opt.val, date_fin })
                    }} style={{
                      flex: 1, padding: '0.5rem 0.25rem', border: '1.5px solid',
                      borderColor: active ? '#333' : '#e5e7eb',
                      background: active ? '#333' : 'white',
                      color: active ? '#e4f816' : '#374151',
                      borderRadius: 10, fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer',
                    }}>{opt.label}</button>
                  )
                })}
              </div>
            </div>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Catégorie</label>
            <select value={form.categorie_id || ''} onChange={e => setForm({ ...form, categorie_id: e.target.value || null })} style={styles.select}>
              <option value="">— Aucune —</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.nom}</option>)}
            </select>
          </div>
          <div style={styles.row2}>
            <EditField label="Date début" type="date" value={form.date_debut || ''} onChange={v => setForm({ ...form, date_debut: v })} />
            <EditField label="Date fin" type="date" value={form.date_fin || ''} onChange={v => setForm({ ...form, date_fin: v })} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={styles.label}>Objectif</label>
            <textarea value={form.objectif || ''} onChange={e => setForm({ ...form, objectif: e.target.value })} rows={3} style={styles.textarea} />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={styles.label}>Notes</label>
            <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={styles.textarea} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setEditMode(false)} style={styles.btnSecondary}>Annuler</button>
            <button onClick={sauvegarderClient} style={styles.btnPrimary}>Sauvegarder</button>
          </div>
        </div>
      ) : (
        <>
          {/* Profil */}
          <div style={styles.profileCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
              {client.avatar_url
                ? <img src={client.avatar_url} alt={client.prenom} style={{ ...styles.avatar, objectFit: 'cover' }} />
                : <div style={{ ...styles.avatar, background: av.bg, color: av.text }}>{av.initiales}</div>
              }
              <div>
                <h1 style={styles.clientName}>{client.prenom} {client.nom}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ ...styles.badge, ...offreBadge(client.offre) }}>
                    {offreLabel(client.offre)}
                  </span>
                  {client.categories && (
                    <span style={{ ...styles.badge, background: client.categories.couleur + '22', color: client.categories.couleur, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: client.categories.couleur }} />
                      {client.categories.nom}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={styles.infoGrid}>
              {client.email && <InfoItem label="Email" value={client.email} />}
              {client.telephone && <InfoItem label="Téléphone" value={client.telephone} />}
              {client.date_debut && <InfoItem label="Début" value={client.date_debut} />}
              {client.date_fin && <InfoItem label="Fin" value={client.date_fin} />}
              <div style={{ gridColumn: 'auto' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.2rem' }}>Contrat</p>
                {contratData ? (
                  <button onClick={() => setShowContratModal(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.9rem', color: '#16a34a', fontWeight: 700, textAlign: 'left', textDecoration: 'underline dotted' }}>
                    Signé le {new Date(contratData.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </button>
                ) : (
                  <p style={{ fontSize: '0.9rem', color: '#ef4444', fontWeight: 700, margin: 0 }}>Non signé</p>
                )}
              </div>
              {client.objectif && <InfoItem label="Objectif" value={client.objectif} full />}
              {client.notes && <InfoItem label="Notes" value={client.notes} full />}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button onClick={() => setEditMode(true)} style={styles.btnSecondary}>Modifier</button>
              <button onClick={inviterClient} style={styles.btnSecondary}>Inviter par email</button>
              <button onClick={supprimerClient} style={styles.btnDanger}>Supprimer</button>
            </div>
          </div>

          {/* ── Notes coach ── */}
          <div style={{ ...styles.card, marginTop: '1rem', border: '1.5px solid #fef08a', background: '#fefce8' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '1rem' }}>📝</span>
              <p style={{ ...styles.sectionTitle, margin: 0 }}>Notes entretiens</p>
              <span style={{ marginLeft: 'auto', fontSize: '0.65rem', fontWeight: '700', color: '#a16207', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 999, padding: '0.1rem 0.5rem' }}>🔒 Visible uniquement par toi</span>
            </div>
            <textarea
              value={notesCoach}
              onChange={e => { setNotesCoach(e.target.value); setNotesSaved(false) }}
              onBlur={e => sauvegarderNotesCoach(e.target.value)}
              placeholder={`Notes sur ${client.prenom} — entretiens, observations, points à suivre…`}
              rows={6}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.75rem', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: '0.88rem', lineHeight: 1.6, outline: 'none', resize: 'vertical', background: 'white', fontFamily: 'inherit', color: '#333' }}
            />
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: '#a16207' }}>
              {notesSaved
                ? notesSavedAt
                  ? `✓ Sauvegardé à ${notesSavedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                  : '✓ Sauvegardé'
                : '● Non sauvegardé — quitte le champ pour sauvegarder'}
            </p>
          </div>
        </>
      )}

      {/* Onglets navigation */}
      <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 3, gap: 3, marginTop: '1.5rem' }}>
        {[
          { k: 'suivi', l: 'Suivi', icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          )},
          { k: 'perf', l: 'Entraînement', icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M6.5 6.5h11M6.5 17.5h11M3 10h3v4H3zM18 10h3v4h-3zM6.5 12h11"/>
            </svg>
          )},
          { k: 'nutrition', l: 'Nutrition', icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M4 11h16"/><path d="M5 11c0 5 2 8 7 8s7-3 7-8"/>
              <path d="M9 7 Q10 5 9 3"/><path d="M12 7 Q13 5 12 3"/><path d="M15 7 Q16 5 15 3"/>
            </svg>
          )},
        ].map(t => (
          <button key={t.k} onClick={() => {
            setActiveTab(t.k)
            if (t.k === 'perf' && progression.length === 0) fetchProgression()
            if (t.k === 'nutrition') fetchNutrition()
          }} style={{
            flex: 1, padding: '0.45rem 0.5rem', border: 'none', borderRadius: 9, fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer',
            background: activeTab === t.k ? 'white' : 'transparent',
            color: activeTab === t.k ? '#333333' : '#9ca3af',
            boxShadow: activeTab === t.k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>{t.icon}{t.l}</button>
        ))}
      </div>

      {/* Onglet Entraînement — Charge + Progression */}
      {activeTab === 'perf' && client && (
        <div style={{ marginTop: '1rem' }}>
          <ChargePanel clientId={id} clientPrenom={client.prenom} clientNom={client.nom} />
          {progression.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <p style={{ ...styles.sectionTitle, margin: 0 }}>Progression des charges</p>
                <select
                  value={selectedExo || progression[0]?.nom}
                  onChange={e => setSelectedExo(e.target.value)}
                  style={{ fontSize: '0.8rem', fontWeight: 700, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '4px 8px', background: 'white', color: '#333', cursor: 'pointer', maxWidth: 200 }}
                >
                  {progression.map(({ nom }) => <option key={nom} value={nom}>{nom}</option>)}
                </select>
              </div>
              {(() => {
                const exo = progression.find(p => p.nom === (selectedExo || progression[0]?.nom))
                if (!exo) return null
                const { nom, data } = exo
                return (
                  <div style={{ background: 'white', borderRadius: 14, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="semaine" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} domain={['auto', 'auto']} unit=" kg" />
                        <Tooltip formatter={(v) => [`${v} kg`, nom]} />
                        <Line type="monotone" dataKey="poids" stroke="#333333" strokeWidth={2.5}
                          dot={{ fill: '#e4f816', r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Début : <strong style={{ color: '#333' }}>{data[0]?.poids} kg</strong></span>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>→</span>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Actuel : <strong style={{ color: data[data.length-1]?.poids > data[0]?.poids ? '#16a34a' : '#dc2626' }}>{data[data.length-1]?.poids} kg</strong></span>
                      {data[data.length-1]?.poids > data[0]?.poids && (
                        <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: '700' }}>+{(data[data.length-1]?.poids - data[0]?.poids).toFixed(1)} kg ↑</span>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Onglet Suivi */}
      {activeTab === 'suivi' && <>

      {/* Cycles */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={styles.sectionHeader}>
          <p style={styles.sectionTitle}>Cycles</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => navigate(`/rapport/${id}`)} style={styles.btnSecondary} title="Rapport mensuel PDF">
              📄 Rapport
            </button>
            <button onClick={() => navigate(`/client/${id}/import-excel`)} style={styles.btnSecondary} title="Importer depuis Excel">
              📥 Excel
            </button>
            <button onClick={() => navigate(`/client/${id}/nouveau-programme`)} style={styles.btnPrimary}>
              + Nouveau
            </button>
          </div>
        </div>
        {(() => {
          const actifs   = programmes.filter(p => !isCycleTermine(p))
          const termines = programmes.filter(p => isCycleTermine(p))
          const visibles = showPastCycles ? programmes : actifs
          return (
            <>
              {visibles.length === 0 && !showPastCycles ? (
                <div style={styles.emptyCard}>Aucun cycle en cours.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {visibles.map((prog, i) => {
                    const termine = isCycleTermine(prog)
                    const loading = dupliquerLoading === prog.id
                    return (
                      <div key={prog.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div onClick={() => navigate(`/programme/${prog.id}`)} style={{
                          ...styles.progCard, flex: 1,
                          borderLeft: `4px solid ${termine ? '#d1d5db' : i === 0 ? '#e4f816' : '#e5e7eb'}`,
                          opacity: termine ? 0.6 : 1,
                        }}>
                          <div>
                            <p style={styles.progNom}>{prog.nom}</p>
                            <p style={styles.progMeta}>
                              {prog.semaines} semaines
                              {termine && <span style={{ marginLeft: '0.5rem', color: '#9ca3af' }}>· Terminé</span>}
                            </p>
                          </div>
                          <span style={styles.chevron}>›</span>
                        </div>
                        <button
                          onClick={() => dupliquerProgramme(prog)}
                          disabled={loading}
                          title="Dupliquer ce cycle"
                          style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '0.5rem 0.65rem', cursor: 'pointer', fontSize: '0.85rem', color: '#6b7280', flexShrink: 0 }}
                        >{loading ? '⏳' : '⧉'}</button>
                      </div>
                    )
                  })}
                </div>
              )}
              {termines.length > 0 && (
                <button
                  onClick={() => setShowPastCycles(v => !v)}
                  style={{ marginTop: '0.75rem', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem 0', fontWeight: '600' }}
                >
                  {showPastCycles ? '↑ Masquer les cycles passés' : `↓ Voir les cycles passés (${termines.length})`}
                </button>
              )}
            </>
          )
        })()}
      </div>

      {/* Planification */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={styles.sectionHeader}>
          <p style={styles.sectionTitle}>Planification</p>
        </div>
        <div style={styles.calendarCard}>
          <Calendrier
            clientId={id}
            readOnly={false}
            programmeDebut={programmes[0]?.date_debut || client.date_debut}
            programmeSemaines={programmes[0]?.semaines || 8}
            seances={seances}
            onViewSeance={sid => navigate(`/seance/${sid}`)}
          />
        </div>
      </div>

      {/* ── Séances ajoutées par le client ──────────────────────────────── */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={styles.sectionHeader}>
          <p style={styles.sectionTitle}>👤 Séances ajoutées par {client.prenom}</p>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '600' }}>
            {seancesClient.length} séance{seancesClient.length > 1 ? 's' : ''}
          </span>
        </div>

        {seancesClient.length === 0 ? (
          <div style={styles.emptyCard}>Aucune séance ajoutée par {client.prenom} pour l'instant.</div>
        ) : (() => {
          const EVENT_TYPES_MAP = {
            seance:       { label: 'Séance',        bg: '#333333', text: '#e4f816' },
            entrainement: { label: 'Entraînement',  bg: '#f97316', text: 'white' },
            match:        { label: 'Match',         bg: '#e4f816', text: '#333333' },
            combat:       { label: 'Combat',        bg: '#dc2626', text: 'white' },
            competition:  { label: 'Compétition',   bg: '#7c3aed', text: 'white' },
            repos:        { label: 'Repos',         bg: '#e5e7eb', text: '#6b7280' },
            autre:        { label: 'Autre',         bg: '#f0fdfa', text: '#0f766e' },
          }
          const visible = showAllSeancesClient ? seancesClient : seancesClient.slice(0, 5)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {visible.map(ev => {
                const ts = EVENT_TYPES_MAP[ev.type] || EVENT_TYPES_MAP.seance
                const dateLabel = new Date(ev.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                const exs = (ev.seances_libres_exercices || []).sort((a, b) => a.ordre - b.ordre)
                return (
                  <div key={ev.id} style={{ background: 'white', borderRadius: 12, border: '1.5px solid #f3f4f6', padding: '0.75rem 1rem' }}>
                    {/* En-tête */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <span style={{ background: ts.bg, color: ts.text, fontSize: '0.68rem', fontWeight: '800', padding: '3px 8px', borderRadius: 6, flexShrink: 0, marginTop: 2 }}>
                        {ts.label}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: '700', fontSize: '0.88rem', color: '#1a1a1a' }}>{ev.titre}</p>
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>{dateLabel}</p>
                        {ev.description && (
                          <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.4 }}>{ev.description}</p>
                        )}
                      </div>
                    </div>
                    {/* Exercices */}
                    {exs.length > 0 && (
                      <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {exs.map(ex => {
                          const series = (ex.seances_libres_series || []).sort((a, b) => a.num_serie - b.num_serie)
                          return (
                            <div key={ex.id}>
                              <p style={{ margin: '0 0 0.2rem', fontWeight: '700', fontSize: '0.8rem', color: '#374151' }}>{ex.nom}</p>
                              {series.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                  {series.map(s => (
                                    <span key={s.num_serie} style={{ background: '#f3f4f6', borderRadius: 6, padding: '2px 7px', fontSize: '0.72rem', color: '#6b7280', fontWeight: 600 }}>
                                      {s.poids != null ? `${s.poids} kg` : '—'} × {s.reps != null ? s.reps : '—'}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {seancesClient.length > 5 && (
                <button
                  onClick={() => setShowAllSeancesClient(v => !v)}
                  style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.82rem', cursor: 'pointer', padding: '0.25rem 0', fontWeight: '600' }}
                >
                  {showAllSeancesClient ? '↑ Réduire' : `↓ Voir toutes (${seancesClient.length})`}
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {/* Wellness */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={styles.sectionHeader}>
          <p style={styles.sectionTitle}>Wellness</p>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '600' }}>
            {wellness.length} entrée{wellness.length > 1 ? 's' : ''}
          </span>
        </div>

        {wellness.length === 0 ? (
          <div style={styles.emptyCard}>Aucune donnée wellness pour ce client.</div>
        ) : (() => {
          const today = new Date().toISOString().slice(0, 10)
          const latest = wellness[0]
          const isToday = latest.date === today
          const avg = (latest.sommeil + latest.fatigue + latest.douleurs + latest.stress) / 4
          const visible = showAllWellness ? wellness : wellness.slice(0, 14)

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              {/* Dernière entrée mise en avant */}
              <div style={{ background: 'white', borderRadius: 16, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: isToday ? '1.5px solid #e4f816' : '1.5px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#333' }}>
                      {isToday ? "Aujourd'hui" : new Date(latest.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    {isToday && <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>{latest.date}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {latest.poids && <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 999 }}>⚖️ {latest.poids} kg</span>}
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: scoreColor(Math.round(avg)) }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151' }}>{avg.toFixed(1)}/4</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  {INDICATORS.map(({ key, label, emoji }) => (
                    <div key={key} style={{ background: '#f9fafb', borderRadius: 10, padding: '0.6rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem' }}>{emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: '700', color: scoreColor(latest[key]) }}>{scoreLabel(key, latest[key])}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[1,2,3,4].map(v => (
                          <div key={v} style={{ width: 6, height: 18, borderRadius: 3, background: v <= latest[key] ? scoreColor(latest[key]) : '#e5e7eb' }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Historique */}
              {wellness.length > 1 && (
                <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ padding: '0.65rem 1rem', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Historique</p>
                  </div>
                  {/* Légende colonnes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 48px 36px', gap: '0.25rem', padding: '0.4rem 1rem', borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                    <span style={styles.colLabel}>Date</span>
                    {INDICATORS.map(i => <span key={i.key} style={styles.colLabel}>{i.emoji}</span>)}
                    <span style={styles.colLabel}>⚖️ kg</span>
                    <span style={styles.colLabel}>Moy.</span>
                  </div>
                  {visible.slice(1).map(w => {
                    const a = (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4
                    return (
                      <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 48px 36px', gap: '0.25rem', padding: '0.5rem 1rem', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '600' }}>
                          {new Date(w.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                        {INDICATORS.map(({ key }) => (
                          <div key={key} style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            {[1,2,3,4].map(v => (
                              <div key={v} style={{ width: 5, height: 14, borderRadius: 2, background: v <= w[key] ? scoreColor(w[key]) : '#e5e7eb' }} />
                            ))}
                          </div>
                        ))}
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: '600' }}>{w.poids ?? '—'}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: scoreColor(Math.round(a)) }}>{a.toFixed(1)}</span>
                      </div>
                    )
                  })}
                  {wellness.length > 15 && (
                    <button onClick={() => setShowAllWellness(v => !v)}
                      style={{ width: '100%', background: 'none', border: 'none', padding: '0.65rem', fontSize: '0.8rem', color: '#9ca3af', cursor: 'pointer', fontWeight: '600', borderTop: '1px solid #f3f4f6' }}>
                      {showAllWellness ? '↑ Voir moins' : `↓ Voir tout (${wellness.length - 1} entrées)`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      </> /* fin onglet profil */}

      {/* ─── Onglet Nutrition ─────────────────────────────────────────── */}
      {activeTab === 'nutrition' && (
        <div style={{ marginTop: '1rem' }}>

          {/* ── Plan actif ── */}
          {nutritionPlan === null ? (
            <div style={{ ...styles.emptyCard, marginBottom: '0.75rem' }}>Chargement…</div>
          ) : nutritionPlan === false ? (
            <div style={{ ...styles.emptyCard, marginBottom: '0.75rem' }}>
              Aucun plan nutritionnel actif.{' '}
              <button onClick={() => navigate(`/nutrition/${id}`)} style={{ background: 'none', border: 'none', color: '#6d28d9', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}>
                Créer un plan →
              </button>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: 14, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <p style={{ ...styles.sectionTitle, margin: 0 }}>Plan actif</p>
                <button onClick={() => navigate(`/nutrition/${id}`)} style={{ background: 'none', border: 'none', color: '#6d28d9', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '0.78rem' }}>
                  Modifier →
                </button>
              </div>
              <div style={{ background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '0.75rem 1rem' }}>
                <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a', margin: '0 0 3px' }}>{nutritionPlan.nom}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0 }}>
                  {nutritionPlan.date_debut ? `Depuis le ${new Date(nutritionPlan.date_debut + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : 'Plan en cours'}
                  {' · '}{(nutritionPlan.nutrition_plan_days || []).length} jours définis
                </p>
              </div>
            </div>
          )}

          {/* ── Adhérence 7 jours ── */}
          {nutritionAdher.length > 0 && (
            <div style={{ background: 'white', borderRadius: 14, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <p style={{ ...styles.sectionTitle, margin: 0 }}>Adhérence — 7 derniers jours</p>
                {(() => {
                  const withData = nutritionAdher.filter(d => d.total > 0)
                  if (!withData.length) return null
                  const avg = Math.round(withData.reduce((s, d) => s + (d.adherPct || 0), 0) / withData.length)
                  return (
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: avg >= 80 ? '#16a34a' : avg >= 50 ? '#d97706' : '#ef4444' }}>
                      {avg}% moy.
                    </span>
                  )
                })()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {nutritionAdher.map(({ date, fait, horsplan, saute, total, kcalPrevu, kcalMange, adherPct }) => {
                  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
                  const isToday  = date === new Date().toISOString().slice(0, 10)
                  const noData   = total === 0 || (fait + horsplan + saute) === 0
                  const dotColor = noData ? '#d1d5db' : adherPct >= 80 ? '#16a34a' : adherPct >= 50 ? '#d97706' : '#ef4444'
                  return (
                    <div key={date} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{ fontSize: '0.7rem', color: isToday ? '#1a1a1a' : '#6b7280', fontWeight: isToday ? 700 : 400, width: 74, flexShrink: 0 }}>{dayLabel}</span>
                      <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                        {total > 0 && (
                          <>
                            <div style={{ height: '100%', width: `${fait / total * 100}%`, background: '#16a34a' }} />
                            <div style={{ height: '100%', width: `${horsplan / total * 100}%`, background: '#d97706' }} />
                            <div style={{ height: '100%', width: `${saute / total * 100}%`, background: '#ef4444' }} />
                          </>
                        )}
                      </div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: dotColor, width: 34, textAlign: 'right', flexShrink: 0 }}>
                        {noData ? '—' : `${adherPct}%`}
                      </span>
                      {kcalPrevu > 0 && (
                        <span style={{ fontSize: '0.65rem', color: '#9ca3af', width: 70, textAlign: 'right', flexShrink: 0 }}>
                          {kcalMange > 0 ? `${Math.round(kcalMange)} kcal` : '—'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                {[{ color: '#16a34a', label: 'Fait' }, { color: '#d97706', label: 'Hors plan' }, { color: '#ef4444', label: 'Sauté' }].map(({ color, label }) => (
                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: '#6b7280' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />{label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Profil nutritionnel ── */}
          {nutritionProfile ? (
            <div style={{ background: 'white', borderRadius: 14, padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <p style={{ ...styles.sectionTitle, marginBottom: '0.75rem' }}>Profil nutritionnel</p>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.6rem' }}>
                  Données physiques
                </p>
                {(nutritionProfile.poids_kg || nutritionProfile.taille_cm || nutritionProfile.age_ans) ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                      {nutritionProfile.poids_kg  && <InfoItem label="Poids"  value={`${nutritionProfile.poids_kg} kg`} />}
                      {nutritionProfile.taille_cm && <InfoItem label="Taille" value={`${nutritionProfile.taille_cm} cm`} />}
                      {nutritionProfile.age_ans   && <InfoItem label="Âge"    value={`${nutritionProfile.age_ans} ans`} />}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                      {nutritionProfile.sexe && <InfoItem label="Sexe" value={nutritionProfile.sexe === 'homme' ? '♂ Homme' : '♀ Femme'} />}
                      {nutritionProfile.niveau_activite && <InfoItem label="Activité" value={{ sedentaire: 'Sédentaire', leger: 'Légèrement actif', modere: 'Modérément actif', actif: 'Actif', tres_actif: 'Très actif' }[nutritionProfile.niveau_activite] || nutritionProfile.niveau_activite} />}
                      {nutritionProfile.objectif_physique && <InfoItem label="Objectif" value={{ masse: 'Prise de masse', perte: 'Perte de poids', maintien: 'Maintien', recomposition: 'Recomposition' }[nutritionProfile.objectif_physique] || nutritionProfile.objectif_physique} full />}
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>Questionnaire physique non renseigné.</p>
                )}
              </div>
              {(nutritionProfile.regime || nutritionProfile.allergenes?.length > 0 || nutritionProfile.exclusions?.length > 0 || nutritionProfile.notes) && (
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.6rem' }}>
                    Préférences alimentaires
                  </p>
                  <div style={styles.infoGrid}>
                    {nutritionProfile.regime && <InfoItem label="Régime" value={nutritionProfile.regime} />}
                    {nutritionProfile.allergenes?.length > 0 && <InfoItem label="Allergènes" value={nutritionProfile.allergenes.join(', ')} full />}
                    {nutritionProfile.exclusions?.length > 0 && <InfoItem label="Exclusions" value={nutritionProfile.exclusions.join(', ')} full />}
                    {nutritionProfile.notes && <InfoItem label="Notes" value={nutritionProfile.notes} full />}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={styles.emptyCard}>Le client n'a pas encore renseigné son profil nutritionnel.</div>
          )}
        </div>
      )}

      {/* ── Modal contrat ── */}
      {showContratModal && contratData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }} onClick={() => setShowContratModal(false)}>
          <div style={{ background: 'white', borderRadius: 18, padding: '1.75rem', maxWidth: 620, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: '1.05rem', color: '#166534', margin: '0 0 4px' }}>Contrat signé électroniquement</p>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
                  {new Date(contratData.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {contratData.formule ? ` · ${contratData.formule}` : ''}
                  {` · v${contratData.version_contrat || '1.0'}`}
                </p>
              </div>
              <button onClick={() => setShowContratModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 1rem' }}>Conditions générales acceptées</p>
              {CGV_CONTENU.map((section, i) => (
                <div key={i} style={{ marginBottom: '1rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#333', margin: '0 0 0.25rem' }}>{section.titre}</p>
                  <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{section.texte}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function InfoItem({ label, value, full, valueStyle }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.2rem' }}>{label}</p>
      <p style={{ fontSize: '0.9rem', color: '#333333', margin: 0, ...valueStyle }}>{value}</p>
    </div>
  )
}

function EditField({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{ marginBottom: '1rem', flex: 1 }}>
      <label style={styles.label}>{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} style={styles.input} />
    </div>
  )
}

const styles = {
  loading: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page: { padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: '0.9rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem' },
  card: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  profileCard: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  avatar: { width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1.1rem', flexShrink: 0 },
  clientName: { fontSize: '1.4rem', fontWeight: '800', color: '#333333', margin: '0 0 0.4rem' },
  badge: { padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: '600' },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', padding: '1rem 0', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle: { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  emptyCard: { background: 'white', borderRadius: '14px', padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  progCard: { background: 'white', borderRadius: '14px', padding: '1rem 1.25rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  progNom: { fontWeight: '700', fontSize: '0.95rem', color: '#333333', margin: '0 0 0.2rem' },
  progMeta: { color: '#9ca3af', fontSize: '0.8rem', margin: 0 },
  chevron: { color: '#d1d5db', fontSize: '1.25rem' },
  calendarCard: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  row2: { display: 'flex', gap: '1rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  input: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', background: 'white', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '0.7rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', color: '#333333', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  btnDanger: { background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: '10px', padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  colLabel:  { fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
}
