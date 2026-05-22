import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'

const OBJECTIFS = [
  { key: 'masse',         emoji: '💪', label: 'Prise de masse',          desc: 'Développer muscle et force' },
  { key: 'perte',         emoji: '🔥', label: 'Perte de poids',           desc: 'Brûler les graisses en douceur' },
  { key: 'maintien',      emoji: '⚖️', label: 'Maintien du poids',        desc: 'Garder ton poids actuel' },
  { key: 'recomposition', emoji: '🔄', label: 'Recomposition corporelle', desc: 'Perdre du gras, gagner du muscle' },
]

const ACTIVITES = [
  { key: 'sedentaire',  emoji: '🛋️', label: 'Sédentaire',         desc: 'Bureau, peu de mouvement au quotidien', mult: 1.2 },
  { key: 'leger',       emoji: '🚶', label: 'Légèrement actif',    desc: '1-3 entraînements / semaine', mult: 1.375 },
  { key: 'modere',      emoji: '🏃', label: 'Modérément actif',    desc: '3-5 entraînements / semaine', mult: 1.55 },
  { key: 'actif',       emoji: '🏋️', label: 'Très actif',          desc: '6-7 entraînements / semaine', mult: 1.725 },
  { key: 'tres_actif',  emoji: '⚡', label: 'Sportif intensif',    desc: 'Double entraînement ou travail physique', mult: 1.9 },
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
  const [physProfile,   setPhysProfile]   = useState(null)
  const [activeTab,     setActiveTab]     = useState('objectifs')
  const [scans,         setScans]         = useState([])
  const [scansLoading,  setScansLoading]  = useState(false)
  const [scanFilter,    setScanFilter]    = useState('all')

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

      const { data: goals } = await supabase.from('nutrition_goals').select('*')
        .eq('client_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (goals) setExistingGoals(goals)

      // Si premier accès et pas encore de profil physique → ouvrir le wizard directement
      if (isSetup && !profil?.objectif_physique) {
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

    const today = new Date().toISOString().split('T')[0]

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

  async function loadScans(cid) {
    setScansLoading(true)
    const { data } = await supabase
      .from('nutrition_scan_history')
      .select('*')
      .eq('client_id', cid)
      .order('scanned_at', { ascending: false })
      .limit(100)
    setScans(data || [])
    setScansLoading(false)
  }

  function handleTabChange(tab) {
    setActiveTab(tab)
    if (tab === 'historique' && scans.length === 0 && client) {
      loadScans(client.id)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button onClick={() => navigate(-1)} style={S.iconBtn}><ChevronLeft /></button>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem' }}>Mon profil nutritionnel</span>
          <div style={{ width: 34 }} />
        </div>
        <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>Chargement…</p>
      </div>
    )
  }

  // ── Wizard ────────────────────────────────────────────────────────────────────
  if (wizardOpen) {
    return (
      <div style={{ ...S.page, background: '#f5f5f5' }}>
        <div style={{ ...S.header, padding: '52px 16px 14px', gap: 10 }}>
          <button onClick={() => wizardStep > 0 ? setWizardStep(s => s - 1) : isSetup ? navigate('/client/accueil', { replace: true }) : setWizardOpen(false)} style={S.iconBtn}>
            <ChevronLeft />
          </button>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((wizardStep + 1) / 4) * 100}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 0.35s ease' }} />
          </div>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
            {wizardStep + 1}/4
          </span>
        </div>

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
                  <span style={{ fontSize: '1.9rem', flexShrink: 0 }}>{o.emoji}</span>
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
                <p style={S.wizSub}>Nécessaires pour calculer ton métabolisme de base (Mifflin-St Jeor 2005)</p>
              </div>
              <div style={S.card}>
                <label style={S.inputLabel}>Sexe biologique</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  {[{ key: 'homme', label: '♂ Homme' }, { key: 'femme', label: '♀ Femme' }].map(s => (
                    <button key={s.key} onClick={() => setSexe(s.key)} style={{
                      flex: 1, padding: '12px', borderRadius: 12, border: '2px solid',
                      borderColor: sexe === s.key ? '#1a1a1a' : '#e5e7eb',
                      background:  sexe === s.key ? '#1a1a1a' : '#f9fafb',
                      color:       sexe === s.key ? 'var(--accent)' : '#374151',
                      fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                    }}>{s.label}</button>
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
                  <span style={{ fontSize: '1.7rem', flexShrink: 0 }}>{a.emoji}</span>
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: activite === a.key ? 'var(--accent)' : '#1a1a1a', lineHeight: 1.2 }}>{a.label}</div>
                    <div style={{ fontSize: '0.74rem', color: activite === a.key ? 'rgba(228,248,22,0.65)' : '#9ca3af', marginTop: 3 }}>{a.desc}</div>
                    <div style={{ fontSize: '0.64rem', color: activite === a.key ? 'rgba(228,248,22,0.4)' : '#d1d5db', marginTop: 2, fontWeight: 600 }}>× {a.mult} BMR</div>
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
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Profil calculé</p>
                  <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.82rem', margin: '4px 0 0', lineHeight: 1.4 }}>
                    {OBJECTIFS.find(o => o.key === objectif)?.label} · {poids} kg · {sexe} · {age} ans
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', margin: '2px 0 0' }}>
                    {ACTIVITES.find(a => a.key === activite)?.label}
                  </p>
                </div>
                <div style={{ textAlign: 'center', padding: '14px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                  <p style={{ fontSize: '3.2rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-0.03em' }}>
                    {computed.kcal.toLocaleString('fr-FR')}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '5px 0 0' }}>kcal par jour</p>
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.62rem', margin: '6px 0 0' }}>BMR {computed.bmr} kcal · TDEE {computed.tdee} kcal</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                  <MacroCell label="Protéines" val={`${computed.prot_g}g`} color="#60a5fa" note={`${(computed.prot_g / parseFloat(poids)).toFixed(1)} g/kg`} />
                  <MacroCell label="Glucides"  val={`${computed.carbs_g}g`} color="#fbbf24" note={`${Math.round(computed.carbs_g * 4 / computed.kcal * 100)}% AET`} />
                  <MacroCell label="Lipides"   val={`${computed.fat_g}g`} color="#f87171" note={`${Math.round(computed.fat_g * 9 / computed.kcal * 100)}% AET`} />
                </div>
                <div style={{ background: 'rgba(96,165,250,0.12)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: '1.3rem' }}>💧</span>
                  <div>
                    <p style={{ fontWeight: 800, color: 'white', fontSize: '0.9rem', margin: 0 }}>{(computed.hydration_ml / 1000).toFixed(1)} L d'eau / jour</p>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.65rem', margin: '2px 0 0' }}>35 ml/kg de poids corporel · EFSA 2010</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <SourceBadge label="Mifflin-St Jeor 2005" />
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
                {saving ? 'Enregistrement…' : '✓ Valider et enregistrer'}
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
  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.iconBtn}><ChevronLeft /></button>
        <div>
          <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'white', margin: 0, lineHeight: 1.2 }}>Mon profil nutritionnel</p>
          <p style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.4)', margin: 0, fontWeight: 600 }}>Objectifs caloriques & macros</p>
        </div>
        <div style={{ width: 34 }} />
      </div>

      {/* Tab bar */}
      <div style={S.tabBar}>
        <button onClick={() => handleTabChange('objectifs')} style={activeTab === 'objectifs' ? S.tabActive : S.tab}>
          🎯 Objectifs
        </button>
        <button onClick={() => handleTabChange('historique')} style={activeTab === 'historique' ? S.tabActive : S.tab}>
          📦 Mes scans
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ── Onglet Objectifs ── */}
        {activeTab === 'objectifs' && (
          <>
            {saved && (
              <div style={{ background: '#dcfce7', borderRadius: 12, padding: '12px 16px', textAlign: 'center', color: '#16a34a', fontWeight: 700, fontSize: '0.9rem' }}>
                ✅ Objectifs enregistrés avec succès !
              </div>
            )}

            {existingGoals ? (
              <>
                <div style={S.goalsCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Objectifs nutritionnels</p>
                      {physProfile && (
                        <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.8rem', margin: '4px 0 0' }}>
                          {OBJECTIFS.find(o => o.key === physProfile.objectif)?.emoji}{' '}
                          {OBJECTIFS.find(o => o.key === physProfile.objectif)?.label} · {physProfile.poids} kg
                        </p>
                      )}
                    </div>
                    <button onClick={openWizard} style={S.recalcBtn}>Recalculer</button>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 0 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 14 }}>
                    <p style={{ fontSize: '2.9rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-0.03em' }}>
                      {(existingGoals.kcal_target || 0).toLocaleString('fr-FR')}
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 0' }}>kcal par jour</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    <MacroCell label="Protéines" val={`${existingGoals.prot_g || '–'}g`}  color="#60a5fa" />
                    <MacroCell label="Glucides"  val={`${existingGoals.carbs_g || '–'}g`} color="#fbbf24" />
                    <MacroCell label="Lipides"   val={`${existingGoals.fat_g || '–'}g`}   color="#f87171" />
                  </div>
                  {existingGoals.hydration_ml != null && (
                    <div style={{ background: 'rgba(96,165,250,0.1)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.1rem' }}>💧</span>
                      <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', fontWeight: 700 }}>
                        {(existingGoals.hydration_ml / 1000).toFixed(1)} L d'eau / jour
                      </span>
                    </div>
                  )}
                </div>

                {physProfile && (
                  <div style={S.card}>
                    <h3 style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '0.95rem', margin: '0 0 12px' }}>📊 Profil physique utilisé</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {physProfile.sexe    && <PhysRow icon="🧬" label="Sexe"     val={physProfile.sexe === 'homme' ? 'Homme' : 'Femme'} />}
                      {physProfile.age     && <PhysRow icon="🗓" label="Âge"      val={`${physProfile.age} ans`} />}
                      {physProfile.taille  && <PhysRow icon="📏" label="Taille"   val={`${physProfile.taille} cm`} />}
                      {physProfile.poids   && <PhysRow icon="⚖️" label="Poids"    val={`${physProfile.poids} kg`} />}
                      {physProfile.activite && (
                        <div style={{ gridColumn: '1/-1' }}>
                          <PhysRow icon="🏃" label="Activité" val={ACTIVITES.find(a => a.key === physProfile.activite)?.label} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
                      <SourceBadge label="Mifflin-St Jeor 2005" dark />
                      <SourceBadge label="Morton et al. 2018" dark />
                      <SourceBadge label="ANSES 2019" dark />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={S.emptyCard}>
                <p style={{ fontSize: '3rem', margin: '0 0 12px' }}>🎯</p>
                <h3 style={{ fontWeight: 800, color: '#1a1a1a', fontSize: '1.1rem', margin: '0 0 10px', letterSpacing: '-0.02em' }}>Définis tes objectifs nutritionnels</h3>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.65, margin: '0 0 18px', maxWidth: 280, textAlign: 'center' }}>
                  En 3 questions, un algorithme basé sur des études scientifiques calcule tes besoins quotidiens en kcal, protéines, glucides, lipides et hydratation.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 20 }}>
                  <SourceBadge label="Mifflin-St Jeor 2005" dark />
                  <SourceBadge label="Morton et al. 2018" dark />
                  <SourceBadge label="ANSES 2019" dark />
                  <SourceBadge label="EFSA 2010" dark />
                </div>
                <button onClick={openWizard} style={S.ctaBtn}>Calculer mes objectifs →</button>
              </div>
            )}
          </>
        )}

        {/* ── Onglet Historique scans ── */}
        {activeTab === 'historique' && (
          <>
            {scansLoading ? (
              <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem' }}>Chargement…</p>
            ) : scans.length === 0 ? (
              <div style={S.emptyCard}>
                <p style={{ fontSize: '3rem', margin: '0 0 12px' }}>📦</p>
                <h3 style={{ fontWeight: 800, color: '#1a1a1a', fontSize: '1rem', margin: '0 0 8px' }}>Aucun scan pour l'instant</h3>
                <p style={{ color: '#6b7280', fontSize: '0.83rem', textAlign: 'center', lineHeight: 1.5 }}>
                  Scanne le code-barres d'un produit depuis l'onglet Nutrition pour l'ajouter ici.
                </p>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <StatCard label="Scans" val={scans.length} />
                  <StatCard label="Note moy." val={(() => {
                    const gradeVal = { A: 1, B: 2, C: 3, D: 4, E: 5 }
                    const avg = scans.reduce((acc, s) => acc + (gradeVal[s.quality_grade] || 3), 0) / scans.length
                    return ['A','A','B','C','D','E'][Math.round(avg)] || 'B'
                  })()} color={GRADE_COLORS[(() => {
                    const gradeVal = { A: 1, B: 2, C: 3, D: 4, E: 5 }
                    const avg = scans.reduce((acc, s) => acc + (gradeVal[s.quality_grade] || 3), 0) / scans.length
                    return ['A','A','B','C','D','E'][Math.round(avg)] || 'B'
                  })()]} />
                  <StatCard label="À éviter" val={scans.filter(s => ['D','E'].includes(s.quality_grade)).length} color="#dc2626" />
                </div>

                {/* Filtres */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['all','Tous'],['good','Bons'],['bad','À éviter'],['week','7 jours']].map(([k, lbl]) => (
                    <button key={k} onClick={() => setScanFilter(k)}
                      style={{ padding: '6px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', borderColor: scanFilter === k ? '#1a1a1a' : '#e5e7eb', background: scanFilter === k ? '#1a1a1a' : 'white', color: scanFilter === k ? 'var(--accent)' : '#6b7280' }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {/* Liste */}
                {scans.filter(s => {
                  if (scanFilter === 'good') return ['A','B'].includes(s.quality_grade)
                  if (scanFilter === 'bad')  return ['C','D','E'].includes(s.quality_grade)
                  if (scanFilter === 'week') { const w = new Date(); w.setDate(w.getDate()-7); return new Date(s.scanned_at) >= w }
                  return true
                }).map(scan => (
                  <ScanCard key={scan.id} scan={scan} />
                ))}
              </>
            )}
          </>
        )}

        <div style={{ height: 20 }} />
      </div>

      <ClientBottomNav />
    </div>
  )
}

const GRADE_COLORS = { A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626' }

function formatScanDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return `Aujourd'hui · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return `Hier · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diff < 7)  return `Il y a ${diff} jours`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function StatCard({ label, val, color }) {
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '12px 10px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <p style={{ fontSize: '1.6rem', fontWeight: 900, color: color || '#1a1a1a', margin: 0, lineHeight: 1 }}>{val}</p>
      <p style={{ fontSize: '0.62rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 0' }}>{label}</p>
    </div>
  )
}

function ScanCard({ scan }) {
  const gradeColor = GRADE_COLORS[scan.quality_grade] || '#9ca3af'
  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {scan.image_url
        ? <img src={scan.image_url} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
        : <div style={{ width: 52, height: 52, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>📦</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <p style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1a1a1a', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scan.product_name || 'Produit inconnu'}
          </p>
          {scan.quality_grade && (
            <span style={{ background: gradeColor, color: 'white', fontWeight: 900, fontSize: '0.75rem', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
              {scan.quality_grade}
            </span>
          )}
        </div>
        {scan.brand && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '0 0 4px', fontWeight: 600 }}>{scan.brand}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          {scan.kcal_100g != null && <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 700 }}>{scan.kcal_100g} kcal</span>}
          {scan.prot_100g != null && <span style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 700 }}>P {scan.prot_100g}g</span>}
        </div>
        <p style={{ fontSize: '0.65rem', color: '#d1d5db', margin: '4px 0 0', fontWeight: 600 }}>{formatScanDate(scan.scanned_at)}</p>
      </div>
    </div>
  )
}

function MacroCell({ label, val, color, note }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
      <p style={{ fontSize: '1.2rem', fontWeight: 900, color, margin: 0, lineHeight: 1 }}>{val}</p>
      <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 0' }}>{label}</p>
      {note && <p style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', margin: '3px 0 0', fontWeight: 600 }}>{note}</p>}
    </div>
  )
}

function SourceBadge({ label, dark }) {
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999,
      background: dark ? '#f3f4f6' : 'rgba(255,255,255,0.1)',
      color:      dark ? '#6b7280'  : 'rgba(255,255,255,0.5)',
      fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.02em',
    }}>
      📚 {label}
    </span>
  )
}

function PhysRow({ icon, label, val }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}>
      <span style={{ fontSize: '0.9rem' }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1a1a1a', margin: '1px 0 0' }}>{val}</p>
      </div>
    </div>
  )
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
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
  wizSub:   { fontSize: '0.82rem', color: '#9ca3af', margin: '6px 0 0', lineHeight: 1.5 },
  bigCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'white', borderRadius: 16, padding: '16px', border: '2px solid #f3f4f6', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'border-color 0.15s, background 0.15s', width: '100%' },
  bigCardActive: { background: '#1a1a1a', borderColor: '#1a1a1a', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' },
  nextBtn: { width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: '#1a1a1a', color: 'var(--accent)', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', letterSpacing: '-0.01em', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' },
  ghostBtn: { width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', marginTop: -6 },
  resultsCard: { background: '#1a1a1a', borderRadius: 20, padding: '18px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  goalsCard: { background: '#1a1a1a', borderRadius: 20, padding: '18px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' },
  recalcBtn: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  emptyCard: { background: 'white', borderRadius: 20, padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  ctaBtn: { padding: '14px 28px', borderRadius: 14, border: 'none', background: '#1a1a1a', color: 'var(--accent)', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' },
  tabBar: { display: 'flex', background: 'white', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 88, zIndex: 50 },
  tab: { flex: 1, padding: '12px 8px', fontSize: '0.82rem', fontWeight: 700, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '2px solid transparent' },
  tabActive: { flex: 1, padding: '12px 8px', fontSize: '0.82rem', fontWeight: 800, color: '#1a1a1a', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '2px solid var(--accent)' },
  card: { background: 'white', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  inputLabel: { fontSize: '0.82rem', fontWeight: 700, color: '#374151', display: 'block' },
  numberInput: { flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', background: '#f9fafb', outline: 'none' },
  unit: { fontSize: '0.88rem', fontWeight: 700, color: '#9ca3af', minWidth: 30 },
}
