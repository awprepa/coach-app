import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'

// ─── Prompt maître IA ─────────────────────────────────────────────────────────
export const MASTER_PROMPT = `Tu es un diététicien expert en nutrition sportive. Génère un plan nutritionnel complet au format JSON strict.

STRUCTURE JSON EXACTE (respecte chaque champ) :
{
  "nom": "Nom du plan",
  "description": "Description courte du plan",
  "objectif_kcal_base": 2400,
  "objectif_prot": 180,
  "objectif_carbs": 270,
  "objectif_fat": 75,
  "jours": [
    {
      "jour_numero": 1,
      "label": "Lundi — Jour d'entraînement",
      "type_jour": "entrainement",
      "objectif_kcal": 2600,
      "repas": [
        {
          "type": "petit_dej",
          "nom": "Nom du repas",
          "kcal": 520,
          "prot_g": 35,
          "carbs_g": 60,
          "fat_g": 12,
          "recette": "Instructions de préparation en 2-4 phrases claires.",
          "aliments": [
            { "nom": "Flocons d'avoine", "quantite_g": 80, "kcal": 296, "prot_g": 10, "carbs_g": 54, "fat_g": 5, "fibre_g": 8 },
            { "nom": "Banane", "quantite_g": 100, "kcal": 89, "prot_g": 1, "carbs_g": 23, "fat_g": 0, "fibre_g": 2.6 }
          ]
        }
      ]
    }
  ]
}

RÈGLES ABSOLUES :
- "type" doit être exactement : petit_dej | dejeuner | collation | diner | collation_2
- "type_jour" doit être exactement : standard | entrainement | repos | competition | custom
- Génère exactement 7 jours (jour_numero de 1 à 7)
- Les macros des aliments doivent être cohérentes avec le total du repas (±5%)
- Les macros des repas doivent être cohérentes avec l'objectif_kcal du jour (±50 kcal)
- Jours d'entraînement : +10 à +15% de calories vs jours de repos
- Inclus une recette réaliste pour chaque repas (pas "mélanger les ingrédients")
- Respecte strictement les allergies/exclusions du profil
- Varie les aliments sur les 7 jours (pas le même repas tous les jours)

PROFIL DU CLIENT :
- Objectif : [OBJECTIF : ex. prise de masse / perte de gras / maintien / préparation combat]
- Poids : [POIDS] kg | Taille : [TAILLE] cm | Âge : [AGE] ans | Sexe : [HOMME/FEMME]
- Activité physique : [NIVEAU : ex. 5 séances/semaine musculation + 2 cardio]
- Allergies / intolérances : [ex. lactose, gluten, noix — ou "aucune"]
- Aliments exclus : [ex. viande rouge, alcool — ou "aucun"]
- Goûts et préférences : [ex. cuisine méditerranéenne, pas de poisson, aime le riz]
- Notes spéciales : [ex. boxeur en camp de préparation, 3 semaines avant combat, descente en catégorie]

Réponds UNIQUEMENT avec le JSON brut. Pas de markdown, pas d'explication, pas de texte avant ou après. Commence directement par { et termine par }.`

// ─── Validation JSON ──────────────────────────────────────────────────────────
const VALID_TYPES     = ['petit_dej', 'dejeuner', 'collation', 'diner', 'collation_2']
const VALID_JOUR_TYPE = ['standard', 'entrainement', 'repos', 'competition', 'custom']

function validateJSON(obj) {
  if (!obj || typeof obj !== 'object') return 'Le JSON doit être un objet'
  if (!obj.nom || typeof obj.nom !== 'string') return "Champ 'nom' manquant ou invalide"
  if (!Array.isArray(obj.jours) || obj.jours.length === 0) return "Champ 'jours' manquant ou vide"
  for (const [i, jour] of obj.jours.entries()) {
    if (!jour.jour_numero) return `Jour ${i + 1} : champ 'jour_numero' manquant`
    if (!jour.label) return `Jour ${i + 1} : champ 'label' manquant`
    if (!VALID_JOUR_TYPE.includes(jour.type_jour)) return `Jour ${i + 1} : 'type_jour' invalide (${jour.type_jour})`
    if (!Array.isArray(jour.repas)) return `Jour ${i + 1} : champ 'repas' manquant`
    for (const [j, repas] of jour.repas.entries()) {
      if (!VALID_TYPES.includes(repas.type)) return `Jour ${i + 1} repas ${j + 1} : 'type' invalide (${repas.type})`
      if (!repas.nom) return `Jour ${i + 1} repas ${j + 1} : champ 'nom' manquant`
      if (!Array.isArray(repas.aliments)) return `Jour ${i + 1} repas ${j + 1} : 'aliments' manquant`
    }
  }
  return null
}

const MEAL_LABELS = {
  petit_dej: 'Petit-déj', dejeuner: 'Déjeuner', collation: 'Collation',
  diner: 'Dîner', collation_2: 'Collation 2',
}

const TYPE_JOUR_CONFIG = {
  standard:     { label: 'Standard',     color: '#374151' },
  entrainement: { label: 'Entraînement', color: '#1d4ed8' },
  repos:        { label: 'Repos',        color: '#16a34a' },
  competition:  { label: 'Compétition',  color: '#dc2626' },
  custom:       { label: 'Personnalisé', color: '#7c3aed' },
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function NutritionPlanEditor() {
  const { planId } = useParams()
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId')
  const navigate = useNavigate()
  const isNew = planId === 'new'

  const [tab, setTab] = useState(isNew ? 'import' : 'import')
  const [plan, setPlan] = useState(null)
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)

  // Formulaire de base
  const [form, setForm] = useState({ nom: '', description: '', date_debut: '', date_fin: '', objectif_kcal: '', objectif_prot: '', objectif_carbs: '', objectif_fat: '' })

  // Import JSON
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState(null)
  const [jsonPreview, setJsonPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)

  // Edition
  const [days, setDays] = useState([])
  const [loadingDays, setLoadingDays] = useState(false)
  const [expandedDay, setExpandedDay] = useState(null)
  const [editingFood, setEditingFood] = useState(null) // { mealId, food }
  const [editingMeal, setEditingMeal] = useState(null) // { dayId, meal }

  // Copie du prompt
  const [promptCopied, setPromptCopied] = useState(false)

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) {
      if (clientId) loadClient(clientId)
      return
    }
    async function loadPlan() {
      const { data: p } = await supabase.from('nutrition_plans').select('*').eq('id', planId).single()
      if (!p) { navigate(-1); return }
      setPlan(p)
      setForm({
        nom: p.nom || '', description: p.description || '',
        date_debut: p.date_debut || '', date_fin: p.date_fin || '',
        objectif_kcal: p.objectif_kcal || '', objectif_prot: p.objectif_prot || '',
        objectif_carbs: p.objectif_carbs || '', objectif_fat: p.objectif_fat || '',
      })
      loadClient(p.client_id)
      setLoading(false)
    }
    loadPlan()
  }, [planId, isNew, clientId])

  async function loadClient(id) {
    const { data: c } = await supabase.from('clients').select('id, prenom, nom').eq('id', id).single()
    setClient(c)
  }

  // ── Chargement des jours (tab Édition) ───────────────────────────────────
  const loadDays = useCallback(async (pid) => {
    setLoadingDays(true)
    const { data: daysData } = await supabase
      .from('nutrition_plan_days')
      .select(`*, nutrition_plan_meals(*, nutrition_plan_foods(*))`)
      .eq('plan_id', pid)
      .order('jour_numero')
    setDays(daysData || [])
    setLoadingDays(false)
  }, [])

  useEffect(() => {
    if (tab === 'edit' && plan) loadDays(plan.id)
  }, [tab, plan, loadDays])

  // ── Validation JSON ───────────────────────────────────────────────────────
  function handleValidateJSON() {
    setJsonError(null)
    setJsonPreview(null)
    let parsed
    try { parsed = JSON.parse(jsonText.trim()) } catch (e) { setJsonError('JSON invalide : ' + e.message); return }
    const err = validateJSON(parsed)
    if (err) { setJsonError(err); return }
    setJsonPreview(parsed)
  }

  // ── Import JSON → Supabase ────────────────────────────────────────────────
  async function handleImport() {
    if (!jsonPreview) return
    setImporting(true)

    const cid = isNew ? clientId : plan?.client_id

    // 1. Créer ou mettre à jour le plan
    let planId_
    if (isNew) {
      const { data: newPlan, error } = await supabase.from('nutrition_plans').insert({
        client_id: cid,
        nom: jsonPreview.nom,
        description: jsonPreview.description || null,
        objectif_kcal: jsonPreview.objectif_kcal_base || null,
        objectif_prot: jsonPreview.objectif_prot || null,
        objectif_carbs: jsonPreview.objectif_carbs || null,
        objectif_fat: jsonPreview.objectif_fat || null,
        statut: 'brouillon',
      }).select().single()
      if (error) { alert(error.message); setImporting(false); return }
      planId_ = newPlan.id
      setPlan(newPlan)
    } else {
      // Supprimer les anciens jours (cascade supprime meals+foods)
      await supabase.from('nutrition_plan_days').delete().eq('plan_id', plan.id)
      await supabase.from('nutrition_plans').update({
        nom: jsonPreview.nom,
        description: jsonPreview.description || null,
        objectif_kcal: jsonPreview.objectif_kcal_base || null,
        objectif_prot: jsonPreview.objectif_prot || null,
        objectif_carbs: jsonPreview.objectif_carbs || null,
        objectif_fat: jsonPreview.objectif_fat || null,
      }).eq('id', plan.id)
      planId_ = plan.id
    }

    // 2. Insérer les jours
    for (const jour of jsonPreview.jours) {
      const { data: dayRow } = await supabase.from('nutrition_plan_days').insert({
        plan_id: planId_,
        jour_numero: jour.jour_numero,
        label: jour.label,
        type_jour: jour.type_jour || 'standard',
        objectif_kcal: jour.objectif_kcal || null,
      }).select().single()
      if (!dayRow) continue

      // 3. Insérer les repas
      for (const [idx, repas] of (jour.repas || []).entries()) {
        const { data: mealRow } = await supabase.from('nutrition_plan_meals').insert({
          day_id: dayRow.id,
          meal_type: repas.type,
          nom: repas.nom,
          ordre: idx,
          kcal: repas.kcal || null,
          prot_g: repas.prot_g || null,
          carbs_g: repas.carbs_g || null,
          fat_g: repas.fat_g || null,
          recette: repas.recette || null,
          notes: repas.notes || null,
        }).select().single()
        if (!mealRow) continue

        // 4. Insérer les aliments
        const foods = (repas.aliments || []).map((a, i) => ({
          meal_id: mealRow.id,
          nom: a.nom,
          quantite_g: a.quantite_g || null,
          kcal: a.kcal || null,
          prot_g: a.prot_g || null,
          carbs_g: a.carbs_g || null,
          fat_g: a.fat_g || null,
          fibre_g: a.fibre_g || null,
          ordre: i,
        }))
        if (foods.length > 0) await supabase.from('nutrition_plan_foods').insert(foods)
      }
    }

    setImporting(false)
    setImportDone(true)
    setJsonPreview(null)
    setJsonText('')
    if (isNew) navigate(`/nutrition/plan/${planId_}`, { replace: true })
    else { loadDays(plan.id); setTab('edit') }
  }

  // ── Sauvegarder les infos du plan ─────────────────────────────────────────
  async function savePlanInfo() {
    if (!plan) return
    setSaving(true)
    await supabase.from('nutrition_plans').update({
      nom: form.nom,
      description: form.description || null,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
      objectif_kcal: form.objectif_kcal ? Number(form.objectif_kcal) : null,
      objectif_prot: form.objectif_prot ? Number(form.objectif_prot) : null,
      objectif_carbs: form.objectif_carbs ? Number(form.objectif_carbs) : null,
      objectif_fat: form.objectif_fat ? Number(form.objectif_fat) : null,
    }).eq('id', plan.id)
    setPlan(p => ({ ...p, ...form }))
    setSaving(false)
  }

  // ── Changer le statut ─────────────────────────────────────────────────────
  async function changeStatut(statut) {
    if (!plan) return
    await supabase.from('nutrition_plans').update({ statut }).eq('id', plan.id)
    setPlan(p => ({ ...p, statut }))
  }

  // ── Copier le prompt ──────────────────────────────────────────────────────
  function copyPrompt() {
    navigator.clipboard.writeText(MASTER_PROMPT).then(() => {
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2500)
    })
  }

  // ── Edition d'un aliment ──────────────────────────────────────────────────
  async function saveFood(mealId, food) {
    if (food.id) {
      await supabase.from('nutrition_plan_foods').update({
        nom: food.nom, quantite_g: food.quantite_g || null,
        kcal: food.kcal || null, prot_g: food.prot_g || null,
        carbs_g: food.carbs_g || null, fat_g: food.fat_g || null,
      }).eq('id', food.id)
    } else {
      await supabase.from('nutrition_plan_foods').insert({ meal_id: mealId, ...food })
    }
    loadDays(plan.id)
    setEditingFood(null)
  }

  async function deleteFood(foodId) {
    await supabase.from('nutrition_plan_foods').delete().eq('id', foodId)
    loadDays(plan.id)
    setEditingFood(null)
  }

  // ── Edition d'un repas ────────────────────────────────────────────────────
  async function saveMeal(meal) {
    await supabase.from('nutrition_plan_meals').update({
      nom: meal.nom, recette: meal.recette || null, notes: meal.notes || null,
    }).eq('id', meal.id)
    loadDays(plan.id)
    setEditingMeal(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', fontFamily: 'system-ui' }}>Chargement…</div>

  const cid = isNew ? clientId : plan?.client_id
  const planStatut = plan?.statut || 'brouillon'

  return (
    <div style={S.page}>
      <div style={S.inner}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: '1.5rem' }}>
          <button onClick={() => navigate(cid ? `/nutrition/${cid}` : '/nutrition')} style={S.backBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isNew ? (
              <h1 style={S.title}>Nouveau plan nutritionnel</h1>
            ) : (
              <>
                <h1 style={{ ...S.title, marginBottom: 4 }}>{plan?.nom || 'Plan sans nom'}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {client && <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>{client.prenom} {client.nom}</span>}
                  {plan?.date_debut && <span style={{ fontSize: '0.73rem', color: '#9ca3af' }}>• {formatDate(plan.date_debut)}{plan.date_fin ? ` → ${formatDate(plan.date_fin)}` : ''}</span>}
                </div>
              </>
            )}
          </div>

          {/* Statut + actions */}
          {!isNew && plan && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {['brouillon', 'actif', 'archive'].map(s => (
                <button key={s} onClick={() => changeStatut(s)} style={{
                  ...S.statutBtn,
                  background: planStatut === s ? '#1a1a1a' : '#f3f4f6',
                  color: planStatut === s ? 'white' : '#6b7280',
                }}>
                  {s === 'brouillon' ? 'Brouillon' : s === 'actif' ? 'Actif' : 'Archivé'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Infos plan (si existant) ────────────────────────────────── */}
        {!isNew && plan && (
          <div style={S.infoCard}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label style={S.label}>Nom du plan</label>
                <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={S.input} placeholder="Optionnel" />
              </div>
              <div>
                <label style={S.label}>Date début</label>
                <input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Date fin</label>
                <input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} style={S.input} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
              {[
                { key: 'objectif_kcal', label: 'Kcal/j' },
                { key: 'objectif_prot', label: 'Prot (g)' },
                { key: 'objectif_carbs', label: 'Gluc (g)' },
                { key: 'objectif_fat', label: 'Lip (g)' },
              ].map(f => (
                <div key={f.key}>
                  <label style={S.label}>{f.label}</label>
                  <input type="number" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} placeholder="—" />
                </div>
              ))}
            </div>
            <button onClick={savePlanInfo} disabled={saving} style={S.saveBtn}>
              {saving ? 'Sauvegarde…' : '✓ Enregistrer les infos'}
            </button>
          </div>
        )}

        {/* ── Onglets ─────────────────────────────────────────────────── */}
        <div style={S.tabs}>
          {[
            { key: 'import', label: 'Import IA' },
            ...(!isNew ? [{ key: 'edit', label: 'Édition' }] : []),
            { key: 'prompt', label: 'Prompt IA' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              ...S.tab,
              background: tab === t.key ? '#1a1a1a' : 'white',
              color: tab === t.key ? 'white' : '#6b7280',
              borderColor: tab === t.key ? '#1a1a1a' : '#e5e7eb',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB : IMPORT IA                                               */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'import' && (
          <div>
            {importDone && (
              <div style={{ background: '#dcfce7', border: '1.5px solid #86efac', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>
                ✓ Plan importé avec succès ! Tu peux maintenant l'éditer dans l'onglet Édition.
              </div>
            )}

            <p style={{ fontSize: '0.83rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              Génère un plan dans ChatGPT ou Claude avec le prompt de l'onglet "Prompt IA", puis colle le JSON ici.
            </p>

            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); setJsonError(null); setJsonPreview(null) }}
              placeholder='Colle le JSON ici…  {"nom": "Plan nutrition", "jours": [...]}'
              style={S.textarea}
              spellCheck={false}
            />

            {jsonError && (
              <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>
                ✕ {jsonError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
              <button onClick={handleValidateJSON} disabled={!jsonText.trim()} style={{ ...S.saveBtn, flex: 1 }}>
                Valider le JSON
              </button>
              {jsonText && <button onClick={() => { setJsonText(''); setJsonError(null); setJsonPreview(null) }} style={S.cancelBtn}>Effacer</button>}
            </div>

            {/* Prévisualisation */}
            {jsonPreview && (
              <div style={S.previewCard}>
                <div style={S.previewHeader}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ✓ JSON valide — Aperçu
                  </span>
                </div>
                <div style={{ padding: '1rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a1a', marginBottom: 4 }}>{jsonPreview.nom}</div>
                  {jsonPreview.description && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 8 }}>{jsonPreview.description}</div>}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    {[
                      jsonPreview.objectif_kcal_base && `${jsonPreview.objectif_kcal_base} kcal`,
                      jsonPreview.objectif_prot && `P ${jsonPreview.objectif_prot}g`,
                      jsonPreview.objectif_carbs && `G ${jsonPreview.objectif_carbs}g`,
                      jsonPreview.objectif_fat && `L ${jsonPreview.objectif_fat}g`,
                    ].filter(Boolean).map((v, i) => (
                      <span key={i} style={{ fontSize: '0.72rem', fontWeight: 700, background: '#f3f4f6', padding: '3px 10px', borderRadius: 20, color: '#374151' }}>{v}</span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {jsonPreview.jours.map(jour => (
                      <div key={jour.jour_numero} style={{ background: '#f9fafb', borderRadius: 10, padding: '8px 12px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.83rem', color: '#1a1a1a', marginBottom: 3 }}>
                          <span style={{ color: TYPE_JOUR_CONFIG[jour.type_jour]?.color || '#374151', marginRight: 6 }}>●</span>
                          J{jour.jour_numero} — {jour.label}
                          {jour.objectif_kcal && <span style={{ color: '#9ca3af', fontWeight: 500, marginLeft: 6 }}>{jour.objectif_kcal} kcal</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {jour.repas.map((r, i) => (
                            <span key={i} style={{ fontSize: '0.68rem', background: 'white', border: '1px solid #e5e7eb', padding: '2px 8px', borderRadius: 10, color: '#6b7280', fontWeight: 600 }}>
                              {MEAL_LABELS[r.type] || r.type} · {r.aliments?.length || 0} aliments
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: '0 1rem 1rem' }}>
                  <button onClick={handleImport} disabled={importing} style={{ ...S.saveBtn, width: '100%', background: '#16a34a' }}>
                    {importing ? 'Importation en cours…' : `Importer ce plan (${jsonPreview.jours.length} jours)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB : ÉDITION                                                 */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'edit' && !isNew && (
          <div>
            {loadingDays ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0' }}>Chargement…</div>
            ) : days.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0' }}>
                Aucun jour défini. Importe d'abord un JSON via l'onglet "Import IA".
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {days.map(day => (
                  <DayAccordion
                    key={day.id}
                    day={day}
                    expanded={expandedDay === day.id}
                    onToggle={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                    onEditFood={(mealId, food) => setEditingFood({ mealId, food })}
                    onEditMeal={(meal) => setEditingMeal({ meal })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB : PROMPT IA                                               */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {tab === 'prompt' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: '0.97rem', color: '#1a1a1a', margin: '0 0 3px' }}>
                  Prompt maître — Génération de plan nutrition
                </p>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                  Copie ce prompt dans ChatGPT ou Claude, remplis le profil du client, et colle le JSON résultant dans l'onglet "Import IA".
                </p>
              </div>
              <button onClick={copyPrompt} style={{ ...S.saveBtn, flexShrink: 0, marginLeft: 12, background: promptCopied ? '#16a34a' : '#1a1a1a' }}>
                {promptCopied ? '✓ Copié !' : 'Copier'}
              </button>
            </div>
            <div style={S.promptBox}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.72rem', lineHeight: 1.6, color: '#374151', fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}>
                {MASTER_PROMPT}
              </pre>
            </div>
            <button onClick={copyPrompt} style={{ ...S.saveBtn, width: '100%', marginTop: '0.75rem', background: promptCopied ? '#16a34a' : '#1a1a1a' }}>
              {promptCopied ? '✓ Prompt copié dans le presse-papier !' : 'Copier le prompt complet'}
            </button>
          </div>
        )}
      </div>

      {/* ── Modal édition aliment ──────────────────────────────────── */}
      {editingFood && (
        <FoodEditModal
          mealId={editingFood.mealId}
          food={editingFood.food}
          onSave={saveFood}
          onDelete={deleteFood}
          onClose={() => setEditingFood(null)}
        />
      )}

      {/* ── Modal édition repas ────────────────────────────────────── */}
      {editingMeal && (
        <MealEditModal
          meal={editingMeal.meal}
          onSave={saveMeal}
          onClose={() => setEditingMeal(null)}
        />
      )}
    </div>
  )
}

// ─── Accordion jour ───────────────────────────────────────────────────────────
function DayAccordion({ day, expanded, onToggle, onEditFood, onEditMeal }) {
  const tc = TYPE_JOUR_CONFIG[day.type_jour] || TYPE_JOUR_CONFIG.standard
  const totalKcal = (day.nutrition_plan_meals || []).reduce((s, m) => s + (m.kcal || 0), 0)

  return (
    <div style={S.dayCard}>
      <button onClick={onToggle} style={S.dayHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tc.color, flexShrink: 0 }} />
          <div>
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1a1a1a' }}>J{day.jour_numero} — {day.label}</span>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 1 }}>
              {tc.label} · {(day.nutrition_plan_meals || []).length} repas
              {totalKcal > 0 && ` · ${totalKcal} kcal`}
            </div>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: '0.75rem 1rem 1rem', borderTop: '1px solid #f3f4f6' }}>
          {(day.nutrition_plan_meals || []).length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.78rem', margin: 0, fontStyle: 'italic' }}>Aucun repas</p>
          ) : (
            (day.nutrition_plan_meals || [])
              .sort((a, b) => a.ordre - b.ordre)
              .map(meal => (
                <MealBlock key={meal.id} meal={meal} onEditFood={onEditFood} onEditMeal={onEditMeal} />
              ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Bloc repas ───────────────────────────────────────────────────────────────
function MealBlock({ meal, onEditFood, onEditMeal }) {
  const [showRecette, setShowRecette] = useState(false)
  return (
    <div style={{ marginBottom: '0.875rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: '0.83rem', color: '#1a1a1a' }}>{MEAL_LABELS[meal.meal_type]} — {meal.nom}</span>
          <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>
            {[meal.kcal && `${meal.kcal} kcal`, meal.prot_g && `P ${meal.prot_g}g`, meal.carbs_g && `G ${meal.carbs_g}g`, meal.fat_g && `L ${meal.fat_g}g`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {meal.recette && (
            <button onClick={() => setShowRecette(v => !v)} style={S.smallBtn} title="Recette">📋</button>
          )}
          <button onClick={() => onEditMeal(meal)} style={S.smallBtn} title="Modifier repas">✏️</button>
          <button onClick={() => onEditFood(meal.id, null)} style={{ ...S.smallBtn, background: '#f0fdf4', color: '#16a34a' }} title="Ajouter aliment">+</button>
        </div>
      </div>

      {showRecette && meal.recette && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: 6, fontSize: '0.73rem', color: '#92400e', lineHeight: 1.5 }}>
          {meal.recette}
        </div>
      )}

      {(meal.nutrition_plan_foods || []).sort((a, b) => a.ordre - b.ordre).map(food => (
        <div key={food.id} style={S.foodRow} onClick={() => onEditFood(meal.id, food)}>
          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#374151', flex: 1 }}>{food.nom}</span>
          <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
            {food.quantite_g ? `${food.quantite_g}g` : ''}{food.kcal ? ` · ${food.kcal} kcal` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Modal édition aliment ────────────────────────────────────────────────────
function FoodEditModal({ mealId, food, onSave, onDelete, onClose }) {
  const isNew = !food?.id
  const [f, setF] = useState({
    nom: food?.nom || '', quantite_g: food?.quantite_g || '', kcal: food?.kcal || '',
    prot_g: food?.prot_g || '', carbs_g: food?.carbs_g || '', fat_g: food?.fat_g || '',
  })

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1rem' }} />
        <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 1rem', color: '#1a1a1a' }}>
          {isNew ? '+ Ajouter un aliment' : '✏️ Modifier l\'aliment'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={S.label}>Nom</label>
            <input value={f.nom} onChange={e => setF(p => ({ ...p, nom: e.target.value }))} style={S.input} placeholder="Ex: Flocons d'avoine" autoFocus />
          </div>
          <div>
            <label style={S.label}>Quantité (g)</label>
            <input type="number" value={f.quantite_g} onChange={e => setF(p => ({ ...p, quantite_g: e.target.value }))} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Calories (kcal)</label>
            <input type="number" value={f.kcal} onChange={e => setF(p => ({ ...p, kcal: e.target.value }))} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Protéines (g)</label>
            <input type="number" value={f.prot_g} onChange={e => setF(p => ({ ...p, prot_g: e.target.value }))} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Glucides (g)</label>
            <input type="number" value={f.carbs_g} onChange={e => setF(p => ({ ...p, carbs_g: e.target.value }))} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Lipides (g)</label>
            <input type="number" value={f.fat_g} onChange={e => setF(p => ({ ...p, fat_g: e.target.value }))} style={S.input} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isNew && <button onClick={() => onDelete(food.id)} style={{ ...S.cancelBtn, background: '#fee2e2', color: '#dc2626' }}>Supprimer</button>}
          <button onClick={onClose} style={S.cancelBtn}>Annuler</button>
          <button onClick={() => onSave(mealId, { ...f, ...(food?.id ? { id: food.id } : {}) })} disabled={!f.nom} style={S.saveBtn}>
            {isNew ? 'Ajouter' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal édition repas ──────────────────────────────────────────────────────
function MealEditModal({ meal, onSave, onClose }) {
  const [f, setF] = useState({ nom: meal.nom || '', recette: meal.recette || '', notes: meal.notes || '' })
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1rem' }} />
        <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 1rem', color: '#1a1a1a' }}>✏️ Modifier le repas</p>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={S.label}>Nom du repas</label>
          <input value={f.nom} onChange={e => setF(p => ({ ...p, nom: e.target.value }))} style={S.input} />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={S.label}>Recette / Instructions</label>
          <textarea value={f.recette} onChange={e => setF(p => ({ ...p, recette: e.target.value }))} style={{ ...S.input, minHeight: 80, resize: 'vertical' }} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={S.label}>Notes</label>
          <input value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} style={S.input} placeholder="Optionnel" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={S.cancelBtn}>Annuler</button>
          <button onClick={() => onSave({ ...meal, ...f })} style={S.saveBtn}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: { background: '#fafafa', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  inner: { maxWidth: 800, margin: '0 auto', padding: '2rem 1.25rem' },
  backBtn: {
    width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e5e7eb',
    background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#374151', flexShrink: 0,
  },
  title: { fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' },
  statutBtn: { fontSize: '0.72rem', fontWeight: 700, padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer' },
  infoCard: { background: 'white', borderRadius: 16, padding: '1rem 1.25rem', border: '1.5px solid #f0f0f0', marginBottom: '1.25rem' },
  label: { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem',
    border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', outline: 'none',
    color: '#1a1a1a', background: 'white', fontFamily: 'inherit',
  },
  tabs: { display: 'flex', gap: 6, marginBottom: '1.25rem', flexWrap: 'wrap' },
  tab: { padding: '0.5rem 0.875rem', borderRadius: 8, border: '1.5px solid', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  textarea: {
    width: '100%', boxSizing: 'border-box', minHeight: 180, padding: '0.75rem',
    border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.8rem', fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    resize: 'vertical', outline: 'none', color: '#374151', marginBottom: '0.75rem',
  },
  saveBtn: {
    padding: '0.7rem 1.25rem', background: '#1a1a1a', color: 'white',
    border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
  },
  cancelBtn: {
    padding: '0.7rem 1rem', background: '#f3f4f6', color: '#374151',
    border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
  },
  previewCard: { background: 'white', border: '1.5px solid #86efac', borderRadius: 14 },
  previewHeader: { background: '#f0fdf4', borderRadius: '14px 14px 0 0', padding: '0.6rem 1rem', borderBottom: '1px solid #86efac' },
  promptBox: {
    background: '#1a1a1a', borderRadius: 14, padding: '1.25rem',
    maxHeight: 480, overflowY: 'auto',
    border: '1.5px solid #374151',
  },
  dayCard: { background: 'white', borderRadius: 14, border: '1.5px solid #f0f0f0', overflow: 'hidden' },
  dayHeader: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
  },
  foodRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
    background: '#f9fafb', borderRadius: 8, marginBottom: 3, cursor: 'pointer',
  },
  smallBtn: {
    width: 26, height: 26, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb',
    cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end',
  },
  sheet: {
    background: 'white', borderRadius: '22px 22px 0 0',
    padding: '1rem 1.25rem 2rem', width: '100%', boxSizing: 'border-box',
    maxHeight: '85vh', overflowY: 'auto',
  },
}
