import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'
import Icon from '../../components/Icon'
import { isoLocal } from '../../utils/dates'
import EnTeteClient from '../../components/EnTeteClient'

const OBJECTIFS = [
  { key: 'masse', label: 'Prise de masse',          desc: 'Développer muscle et force' },
  { key: 'perte', label: 'Perte de poids',           desc: 'Brûler les graisses en douceur' },
  { key: 'maintien', label: 'Maintien du poids',        desc: 'Garder ton poids actuel' },
  { key: 'recomposition', label: 'Recomposition corporelle', desc: 'Perdre du gras, gagner du muscle' },
]

const ACTIVITES = [
  { key: 'sedentaire', label: 'Sédentaire',         desc: 'Bureau, peu de mouvement au quotidien', mult: 1.2 },
  { key: 'leger', label: 'Légèrement actif',    desc: '1-3 entraînements / semaine', mult: 1.375 },
  { key: 'modere', label: 'Modérément actif',    desc: '3-5 entraînements / semaine', mult: 1.55 },
  { key: 'actif', label: 'Très actif',          desc: '6-7 entraînements / semaine', mult: 1.725 },
  { key: 'tres_actif', label: 'Sportif intensif',    desc: 'Double entraînement ou travail physique', mult: 1.9 },
]

// ── Algorithme scientifique ───────────────────────────────────────────────────
// BMR  → Mifflin-St Jeor (Am J Clin Nutr, 2005)
// TDEE → Ainsworth et al. — multiplicateurs d'activité
// Prot → Morton et al. 2018 meta-analysis (Br J Sports Med)
// Lip  → ANSES 2019 (25–30 % AET)
// Eau  → EFSA 2010 (35 ml/kg/j)

function calculateGoals({ objectif, sexe, age, taille, poids, activite }) {
  const agN = parseFloat(age)
  const taN = parseFloat(taille)
  const poN = parseFloat(poids)

  const bmr = sexe === 'homme'
    ? 10 * poN + 6.25 * taN - 5 * agN + 5
    : 10 * poN + 6.25 * taN - 5 * agN - 161

  const multMap = { sedentaire: 1.2, leger: 1.375, modere: 1.55, actif: 1.725, tres_actif: 1.9 }
  const tdee = Math.round(bmr * (multMap[activite] || 1.55))

  const adjustMap = { masse: 300, perte: -400, maintien: 0, recomposition: 0 }
  const kcal = Math.round(tdee + (adjustMap[objectif] || 0))

  const protMap = { masse: 1.8, perte: 2.2, maintien: 1.6, recomposition: 2.0 }
  const prot_g = Math.round(poN * (protMap[objectif] || 1.6))

  const fatPct = objectif === 'perte' ? 0.28 : 0.27
  const fat_g  = Math.round((kcal * fatPct) / 9)

  const carbsKcal = kcal - prot_g * 4 - fat_g * 9
  const carbs_g   = Math.max(Math.round(carbsKcal / 4), 50)

  const hydration_ml = Math.round((poN * 35) / 100) * 100

  return { kcal, prot_g, carbs_g, fat_g, hydration_ml, bmr: Math.round(bmr), tdee }
}

export default function ProfilNutrition() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isSetup = searchParams.get('setup') === '1'
  const fadeStyle = usePageFade()

  const [client,       setClient]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState(null)

  const [wizardOpen,   setWizardOpen]   = useState(false)
  const [wizardStep,   setWizardStep]   = useState(0)

  const [objectif,     setObjectif]     = useState(null)
  const [sexe,         setSexe]         = useState(null)
  const [age,          setAge]          = useState('')
  const [taille,       setTaille]       = useState('')
  const [poids,        setPoids]        = useState('')
  const [activite,     setActivite]     = useState(null)

  const [existingGoals, setExistingGoals] = useState(null)
  const [planCoach,     setPlanCoach]     = useState(null)   // programme du coach en cours
  const [physProfile,   setPhysProfile]   = useState(null)
  const [explication,   setExplication]   = useState(false)

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      const email  = sess?.session?.user?.email
      if (!userId) { setLoading(false); return }

      let { data: c } = await supabase.from('clients').select('id, prenom').eq('user_id', userId).maybeSingle()
      if (!c && email) {
        const { data: c2 } = await supabase.from('clients').select('id, prenom').eq('email', email).maybeSingle()
        c = c2
      }
      if (!c) { setLoading(false); return }
      setClient(c)

      const { data: profil } = await supabase.from('nutrition_profile').select('*').eq('client_id', c.id).maybeSingle()
      if (profil?.objectif_physique) {
        const phys = {
          objectif: profil.objectif_physique,
          sexe:     profil.sexe,
          age:      profil.age_ans,
          taille:   profil.taille_cm,
          poids:    profil.poids_kg,
          activite: profil.niveau_activite,
        }
        setPhysProfile(phys)
        setObjectif(profil.objectif_physique)
        setSexe(profil.sexe)
        setAge(String(profil.age_ans || ''))
        setTaille(String(profil.taille_cm || ''))
        setPoids(String(profil.poids_kg || ''))
        setActivite(profil.niveau_activite)
      }

      // Programme du coach en cours : c'est lui qui fixe les objectifs, le joueur
      // ne les calcule pas lui-même.
      const today = isoLocal()
      const { data: plan } = await supabase.from('nutrition_plans')
        .select('id, nom, objectif_kcal, objectif_prot, objectif_carbs, objectif_fat')
        .eq('client_id', c.id).eq('statut', 'actif').lte('date_debut', today)
        .or(`date_fin.is.null,date_fin.gte.${today}`)
        .order('date_debut', { ascending: false }).limit(1).maybeSingle()
      if (plan) setPlanCoach(plan)

      const { data: goals } = await supabase.from('nutrition_goals').select('*')
        .eq('client_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (goals) setExistingGoals(goals)

      // Si premier accès et pas encore de profil physique → ouvrir le wizard directement
      if (isSetup && !plan && !profil?.objectif_physique) {
        setWizardOpen(true)
      }

      setLoading(false)
    }
    load()
  }, [isSetup])

  const computed =
    objectif && sexe && age && taille && poids && activite
      ? calculateGoals({ objectif, sexe, age, taille, poids, activite })
      : null

  const step0Valid = !!objectif
  const step1Valid = !!(sexe &&
    age    && parseFloat(age)    > 10  && parseFloat(age)    < 120 &&
    taille && parseFloat(taille) > 100 && parseFloat(taille) < 250 &&
    poids  && parseFloat(poids)  > 20  && parseFloat(poids)  < 300)
  const step2Valid = !!activite

  async function saveGoals() {
    if (!client || !computed) return
    setSaving(true); setError(null)

    const today = isoLocal()

    const { error: profErr } = await supabase.from('nutrition_profile').upsert({
      client_id:         client.id,
      objectif_physique: objectif,
      sexe,
      age_ans:           parseInt(age),
      taille_cm:         parseFloat(taille),
      poids_kg:          parseFloat(poids),
      niveau_activite:   activite,
      goals_source:      'auto',
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'client_id' })

    if (profErr) { setError('Erreur lors de la sauvegarde.'); setSaving(false); return }

    const { error: goalErr } = await supabase.from('nutrition_goals').insert({
      client_id:    client.id,
      kcal_target:  computed.kcal,
      prot_g:       computed.prot_g,
      carbs_g:      computed.carbs_g,
      fat_g:        computed.fat_g,
      hydration_ml: computed.hydration_ml,
      active_from:  today,
    })

    setSaving(false)
    if (goalErr) { setError('Erreur lors de la sauvegarde des objectifs.'); return }

    setExistingGoals({ kcal_target: computed.kcal, prot_g: computed.prot_g, carbs_g: computed.carbs_g, fat_g: computed.fat_g, hydration_ml: computed.hydration_ml, active_from: today, created_at: new Date().toISOString() })
    setPhysProfile({ objectif, sexe, age, taille, poids, activite })
    setWizardOpen(false); setWizardStep(0)
    setSaved(true)
    if (isSetup) {
      setTimeout(() => navigate('/client/nutrition', { replace: true }), 800)
    } else {
      setTimeout(() => setSaved(false), 3500)
    }
  }

  function openWizard() { setWizardStep(0); setWizardOpen(true) }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.page}>
        <EnTeteClient retour titre="Mes besoins" />
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '3rem' }}>Chargement…</p>
      </div>
    )
  }

  // ── Wizard ────────────────────────────────────────────────────────────────────
  if (wizardOpen) {
    return (
      <div style={{ ...S.page, background: '#f5f5f5' }}>
        <EnTeteClient retour={() => wizardStep > 0 ? setWizardStep(s => s - 1) : isSetup ? navigate('/client/accueil', { replace: true }) : setWizardOpen(false)}
          titre="Mes besoins" sousTitre={`Étape ${wizardStep + 1} sur 4`}>
          <div style={{ height: 4, margin: '0 16px 12px', background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((wizardStep + 1) / 4) * 100}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 0.35s ease' }} />
          </div>
        </EnTeteClient>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Step 0 : Objectif */}
          {wizardStep === 0 && (
            <>
              <div style={{ marginBottom: 4 }}>
                <h1 style={S.wizTitle}>Quel est ton objectif ?</h1>
                <p style={S.wizSub}>Choisis l'objectif principal de ta nutrition</p>
              </div>
              {OBJECTIFS.map(o => (
                <button key={o.key} onClick={() => setObjectif(o.key)}
                  style={{ ...S.bigCard, ...(objectif === o.key ? S.bigCardActive : {}) }}>
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: objectif === o.key ? 'var(--accent)' : '#1a1a1a', lineHeight: 1.2 }}>{o.label}</div>
                    <div style={{ fontSize: '0.76rem', color: objectif === o.key ? 'rgba(228,248,22,0.65)' : '#9ca3af', marginTop: 3 }}>{o.desc}</div>
                  </div>
                  {objectif === o.key && <CheckCircle />}
                </button>
              ))}
              <button onClick={() => step0Valid && setWizardStep(1)}
                style={{ ...S.nextBtn, opacity: step0Valid ? 1 : 0.38, marginTop: 6 }}>
                Continuer →
              </button>
            </>
          )}

          {/* Step 1 : Données physiques */}
          {wizardStep === 1 && (
            <>
              <div style={{ marginBottom: 4 }}>
                <h1 style={S.wizTitle}>Tes informations physiques</h1>
                <p style={S.wizSub}>Nécessaires pour calculer ton métabolisme de base (Mifflin-St Jeor 1990)</p>
              </div>
              <div style={S.card}>
                <label style={S.inputLabel}>Sexe biologique</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  {[{ key: 'homme', symbol: '♂︎', label: 'Homme' }, { key: 'femme', symbol: '♀︎', label: 'Femme' }].map(s => (
                    <button key={s.key} onClick={() => setSexe(s.key)} style={{
                      flex: 1, padding: '12px', borderRadius: 12, border: '2px solid',
                      borderColor: sexe === s.key ? '#1a1a1a' : '#e5e7eb',
                      background:  sexe === s.key ? '#333333' : '#f9fafb',
                      color:       sexe === s.key ? 'var(--accent)' : '#374151',
                      fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1,
                    }}>{s.symbol} {s.label}</button>
                  ))}
                </div>
              </div>
              {[
                { label: 'Âge', val: age, set: setAge, placeholder: '25', unit: 'ans', min: 10, max: 120 },
                { label: 'Taille', val: taille, set: setTaille, placeholder: '175', unit: 'cm', min: 100, max: 250 },
                { label: 'Poids actuel', val: poids, set: setPoids, placeholder: '70', unit: 'kg', min: 20, max: 300, decimal: true },
              ].map(f => (
                <div key={f.label} style={S.card}>
                  <label style={S.inputLabel}>{f.label}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <input type="number" inputMode={f.decimal ? 'decimal' : 'numeric'}
                      value={f.val} onChange={e => f.set(e.target.value)}
                      placeholder={f.placeholder} min={f.min} max={f.max}
                      style={S.numberInput} />
                    <span style={S.unit}>{f.unit}</span>
                  </div>
                </div>
              ))}
              <button onClick={() => step1Valid && setWizardStep(2)}
                style={{ ...S.nextBtn, opacity: step1Valid ? 1 : 0.38 }}>
                Continuer →
              </button>
            </>
          )}

          {/* Step 2 : Niveau d'activité */}
          {wizardStep === 2 && (
            <>
              <div style={{ marginBottom: 4 }}>
                <h1 style={S.wizTitle}>Ton niveau d'activité</h1>
                <p style={S.wizSub}>Prend en compte ton mode de vie global, pas seulement les entraînements</p>
              </div>
              {ACTIVITES.map(a => (
                <button key={a.key} onClick={() => setActivite(a.key)}
                  style={{ ...S.bigCard, ...(activite === a.key ? S.bigCardActive : {}) }}>
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: activite === a.key ? 'var(--accent)' : '#1a1a1a', lineHeight: 1.2 }}>{a.label}</div>
                    <div style={{ fontSize: '0.75rem', color: activite === a.key ? 'rgba(228,248,22,0.65)' : '#9ca3af', marginTop: 3 }}>{a.desc}</div>
                    <div style={{ fontSize: '0.75rem', color: activite === a.key ? 'rgba(228,248,22,0.4)' : '#d1d5db', marginTop: 2, fontWeight: 600 }}>× {a.mult} BMR</div>
                  </div>
                  {activite === a.key && <CheckCircle />}
                </button>
              ))}
              <button onClick={() => step2Valid && setWizardStep(3)}
                style={{ ...S.nextBtn, opacity: step2Valid ? 1 : 0.38, marginTop: 6 }}>
                Calculer mes objectifs →
              </button>
            </>
          )}

          {/* Step 3 : Résultats */}
          {wizardStep === 3 && computed && (
            <>
              <div style={{ marginBottom: 4 }}>
                <h1 style={S.wizTitle}>Tes objectifs nutritionnels</h1>
                <p style={S.wizSub}>Calculés sur la base d'études scientifiques récentes et validées</p>
              </div>
              <div style={S.resultsCard}>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Profil calculé</p>
                  <p style={{ color: 'var(--accent-fg)', fontWeight: 700, fontSize: '0.82rem', margin: '4px 0 0', lineHeight: 1.4 }}>
                    {OBJECTIFS.find(o => o.key === objectif)?.label} · {poids} kg · {sexe} · {age} ans
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', margin: '2px 0 0' }}>
                    {ACTIVITES.find(a => a.key === activite)?.label}
                  </p>
                </div>
                <div style={{ textAlign: 'center', padding: '14px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                  <p style={{ fontSize: '3.2rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-0.03em' }}>
                    {computed.kcal.toLocaleString('fr-FR')}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '5px 0 0' }}>kcal par jour</p>
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', margin: '6px 0 0' }}>BMR {computed.bmr} kcal · TDEE {computed.tdee} kcal</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                  <MacroCell label="Protéines" val={`${computed.prot_g}g`} color="#38bdf8" note={`${(computed.prot_g / parseFloat(poids)).toFixed(1)} g/kg`} />
                  <MacroCell label="Glucides"  val={`${computed.carbs_g}g`} color="#fbbf24" note={`${Math.round(computed.carbs_g * 4 / computed.kcal * 100)}% AET`} />
                  <MacroCell label="Lipides"   val={`${computed.fat_g}g`} color="#a78bfa" note={`${Math.round(computed.fat_g * 9 / computed.kcal * 100)}% AET`} />
                </div>
                <div style={{ background: 'rgba(96,165,250,0.12)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: '1.3rem' }}><Icon name="droplet" size={14} /></span>
                  <div>
                    <p style={{ fontWeight: 800, color: 'white', fontSize: '0.9rem', margin: 0 }}>{(computed.hydration_ml / 1000).toFixed(1)} L d'eau / jour</p>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', margin: '2px 0 0' }}>35 ml/kg de poids corporel · EFSA 2010</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <SourceBadge label="Mifflin-St Jeor 1990" />
                  <SourceBadge label="Morton et al. 2018" />
                  <SourceBadge label="ANSES 2019" />
                  <SourceBadge label="EFSA 2010" />
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <p style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '0.85rem', margin: '0 0 8px' }}>Comment c'est calculé ?</p>
                <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li style={{ fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.5 }}>
                    <strong>Kcal :</strong> Métabolisme de base (Mifflin-St Jeor, 2005) × {ACTIVITES.find(a => a.key === activite)?.mult}, {objectif === 'masse' ? '+ 300 kcal' : objectif === 'perte' ? '− 400 kcal' : 'sans ajustement'}
                  </li>
                  <li style={{ fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.5 }}>
                    <strong>Protéines :</strong> {poids} kg × {objectif === 'perte' ? '2,2' : objectif === 'masse' ? '1,8' : objectif === 'recomposition' ? '2,0' : '1,6'} g/kg (Morton et al. 2018)
                  </li>
                  <li style={{ fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.5 }}>
                    <strong>Lipides :</strong> {Math.round(computed.fat_g * 9 / computed.kcal * 100)}% des apports (ANSES 2019)
                  </li>
                  <li style={{ fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.5 }}>
                    <strong>Glucides :</strong> solde calorique restant
                  </li>
                </ul>
              </div>

              {error && <p style={{ color: '#dc2626', fontSize: '0.85rem', textAlign: 'center', fontWeight: 600 }}>{error}</p>}

              <button onClick={saveGoals} disabled={saving}
                style={{ ...S.nextBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Valider et enregistrer'}
              </button>
              <button onClick={() => setWizardStep(2)} style={S.ghostBtn}>← Modifier les réponses</button>
              <div style={{ height: 30 }} />
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Page principale ───────────────────────────────────────────────────────────
  // Une seule question : combien je dois manger par jour.
  const act = ACTIVITES.find(a => a.key === physProfile?.activite)
  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <EnTeteClient retour titre="Mes besoins" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 120px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {saved && (
          <div style={{ background: '#dcfce7', borderRadius: 12, padding: '12px 16px', textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: '0.9rem' }}>
            Besoins enregistrés
          </div>
        )}

        {planCoach ? (
          <>
            <div style={S.goalsCard}>
              <p style={S.surTitre}>Fixés par ton coach</p>
              <p style={{ color: 'white', fontWeight: 800, fontSize: '1rem', margin: '4px 0 0' }}>{planCoach.nom}</p>
              {planCoach.objectif_kcal ? (
                <Besoins kcal={planCoach.objectif_kcal} prot={planCoach.objectif_prot} gluc={planCoach.objectif_carbs} lip={planCoach.objectif_fat} />
              ) : null}
            </div>
            <div style={{ ...S.card, fontSize: '0.85rem', color: '#374151', lineHeight: 1.5 }}>
              Tes besoins peuvent changer selon le jour (entraînement, match, repos). Suis les plats prévus dans ton journal.
            </div>
            <button onClick={() => navigate('/client/nutrition/plan')} style={S.lienCarte}>
              Voir ma semaine et mes courses <Chevron />
            </button>
          </>
        ) : existingGoals ? (
          <>
            <div style={S.goalsCard}>
              <Besoins kcal={existingGoals.kcal_target || 0} prot={existingGoals.prot_g} gluc={existingGoals.carbs_g} lip={existingGoals.fat_g} />
              {existingGoals.hydration_ml != null && (
                <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Icon name="droplet" size={14} />
                  <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 700 }}>
                    {(existingGoals.hydration_ml / 1000).toFixed(1).replace('.', ',')} L d'eau par jour
                  </span>
                </div>
              )}
            </div>

            <div style={S.card}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 700, margin: '0 0 4px' }}>Calculé pour toi</p>
              {physProfile ? (
                <>
                  <p style={{ fontSize: '0.92rem', fontWeight: 800, color: '#1a1a1a', margin: 0 }}>
                    {OBJECTIFS.find(o => o.key === physProfile.objectif)?.label}
                  </p>
                  <p style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600, margin: '2px 0 0', lineHeight: 1.45 }}>
                    {[physProfile.sexe && (physProfile.sexe === 'homme' ? 'Homme' : 'Femme'),
                      physProfile.age && `${physProfile.age} ans`,
                      physProfile.taille && `${physProfile.taille} cm`,
                      physProfile.poids && `${physProfile.poids} kg`,
                      act?.label].filter(Boolean).join(' · ')}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '0.85rem', color: '#374151', margin: 0 }}>À partir de tes réponses au questionnaire.</p>
              )}
              <button onClick={openWizard} style={S.majBtn}>Mettre à jour mon poids ou mon objectif</button>
            </div>

            <div style={S.card}>
              <button onClick={() => setExplication(v => !v)} aria-expanded={explication}
                style={{ ...S.lienCarte, padding: 0, boxShadow: 'none', minHeight: 24 }}>
                Comment c'est calculé
                <span style={{ display: 'flex', transform: explication ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}><Chevron /></span>
              </button>
              {explication && (
                <>
                  <ul style={{ margin: '12px 0 0', padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li style={S.explLigne}>
                      <strong>Calories :</strong> ton métabolisme de base (formule de Mifflin-St Jeor) × {act ? String(act.mult).replace('.', ',') : 'ton niveau d\'activité'}
                      {physProfile?.objectif === 'masse' ? ', + 300 kcal' : physProfile?.objectif === 'perte' ? ', − 400 kcal' : ''}
                    </li>
                    <li style={S.explLigne}>
                      <strong>Protéines :</strong> {physProfile?.poids ? `${physProfile.poids} kg × ` : ''}{{ perte: '2,2', masse: '1,8', recomposition: '2,0' }[physProfile?.objectif] || '1,6'} g par kg
                    </li>
                    <li style={S.explLigne}><strong>Lipides :</strong> environ 27 % des calories</li>
                    <li style={S.explLigne}><strong>Glucides :</strong> le reste des calories</li>
                    <li style={S.explLigne}><strong>Eau :</strong> 35 ml par kg de poids</li>
                  </ul>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
                    <SourceBadge label="Mifflin-St Jeor 1990" dark />
                    <SourceBadge label="Morton et al. 2018" dark />
                    <SourceBadge label="ANSES 2019" dark />
                    <SourceBadge label="EFSA 2010" dark />
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={S.emptyCard}>
            <h3 style={{ fontWeight: 800, color: '#1a1a1a', fontSize: '1.1rem', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Calcule tes besoins</h3>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 18px', maxWidth: 280, textAlign: 'center' }}>
              En 3 questions, on calcule ce qu'il te faut par jour : calories, protéines, glucides, lipides et eau.
            </p>
            <button onClick={openWizard} style={S.ctaBtn}>Calculer mes besoins</button>
          </div>
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

function Besoins({ kcal, prot, gluc, lip }) {
  return (
    <>
      <div style={{ textAlign: 'center', padding: '10px 0 0' }}>
        <p style={{ fontSize: '2.6rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
          {Number(kcal).toLocaleString('fr-FR')}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 700, margin: '4px 0 0' }}>kcal par jour</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
        <MacroCell label="Protéines" val={`${prot || '–'} g`} color="#38bdf8" />
        <MacroCell label="Glucides"  val={`${gluc || '–'} g`} color="#fbbf24" />
        <MacroCell label="Lipides"   val={`${lip || '–'} g`}  color="#a78bfa" />
      </div>
    </>
  )
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  )
}

function MacroCell({ label, val, color, note }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.2rem', fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{val}</p>
      <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 0' }}>{label}</p>
      {note && <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', margin: '3px 0 0', fontWeight: 600 }}>{note}</p>}
    </div>
  )
}

function SourceBadge({ label, dark }) {
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999,
      background: dark ? '#f3f4f6' : 'rgba(255,255,255,0.1)',
      color:      dark ? '#6b7280'  : 'rgba(255,255,255,0.5)',
      fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  )
}

function CheckCircle() {
  return (
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  )
}

const S = {
  page: { minHeight: '100dvh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column' },
  header: { background: 'var(--header-bg)', padding: '52px 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 60 },
  iconBtn: { width: 34, height: 34, borderRadius: 999, background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 },
  wizTitle: { fontSize: '1.4rem', fontWeight: 900, color: '#1a1a1a', margin: 0, lineHeight: 1.2, letterSpacing: '-0.02em' },
  wizSub:   { fontSize: '0.82rem', color: '#6b7280', margin: '6px 0 0', lineHeight: 1.5 },
  bigCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'white', borderRadius: 16, padding: '16px', border: '2px solid #f3f4f6', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'border-color 0.15s, background 0.15s', width: '100%' },
  bigCardActive: { background: '#333333', borderColor: '#333333', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' },
  nextBtn: { width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: '#333333', color: 'var(--accent-fg)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', letterSpacing: '-0.01em', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' },
  ghostBtn: { width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', marginTop: -6 },
  resultsCard: { background: '#1a1a1a', borderRadius: 20, padding: '18px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  goalsCard: { background: '#1a1a1a', borderRadius: 20, padding: '18px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' },
  recalcBtn: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '5px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  emptyCard: { background: 'white', borderRadius: 20, padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  ctaBtn: { padding: '14px 28px', borderRadius: 14, border: 'none', background: '#333333', color: 'var(--accent-fg)', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' },
  surTitre: { color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 700, margin: 0 },
  lienCarte: { width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'white', border: 'none', borderRadius: 16, padding: '0 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontSize: '0.88rem', fontWeight: 700, color: '#374151', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  majBtn: { marginTop: 12, width: '100%', minHeight: 44, border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 12, fontSize: '0.85rem', fontWeight: 800, color: '#333333', cursor: 'pointer', fontFamily: 'inherit' },
  explLigne: { fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.5 },
  card: { background: 'white', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  inputLabel: { fontSize: '0.82rem', fontWeight: 700, color: '#374151', display: 'block' },
  numberInput: { flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', background: '#f9fafb', outline: 'none' },
  unit: { fontSize: '0.88rem', fontWeight: 700, color: '#6b7280', minWidth: 30 },
}
