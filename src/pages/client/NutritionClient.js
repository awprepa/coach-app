import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'
import { isoLocal } from '../../utils/dates'
import EnTeteClient, { boutonEnTete } from '../../components/EnTeteClient'
import { useAuRetourOnglet } from '../../context/OngletContext'
import AjouterAliment from './AjouterAliment'

// ── Journal alimentaire ──────────────────────────────────────────────────────
// Écran d'accueil de l'onglet Nutrition. Il fonctionne SANS plan du coach : le
// client peut toujours noter ce qu'il mange. Les calories viennent de la table
// CIQUAL (ANSES), jamais d'une estimation.

// Les 4 repas de base sont toujours affichés ; les autres types (collation 2,
// autre) n'apparaissent que si le plan du coach en contient.
const REPAS_BASE = ['petit_dej', 'dejeuner', 'collation', 'diner']
const REPAS_LABEL = {
  petit_dej: 'Petit-déjeuner', dejeuner: 'Déjeuner', collation: 'Collation',
  diner: 'Dîner', collation_2: 'Collation 2', autre: 'Autre',
}
const REPAS_ORDRE = ['petit_dej', 'dejeuner', 'collation', 'collation_2', 'diner', 'autre']

// Jour du plan (cycle de 7 jours depuis sa date de début)
function numeroJourPlan(dateISO, plan) {
  if (!plan?.date_debut) return 1
  const diff = Math.floor((new Date(dateISO + 'T00:00:00') - new Date(plan.date_debut + 'T00:00:00')) / 86400000)
  return diff < 0 ? null : (diff % 7) + 1
}
const MACROS = [
  { k: 'prot_g',  l: 'Protéines', c: '#0ea5e9' },
  { k: 'carbs_g', l: 'Glucides',  c: '#f59e0b' },
  { k: 'fat_g',   l: 'Lipides',   c: '#8b5cf6' },
]
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// Objectif kcal d'un jour : celui du programme du coach (jour, sinon programme,
// sinon total des plats prévus), sans programme celui calculé par le joueur.
function objectifDuJour(iso, plan, joursPlan, goals) {
  const n = plan && iso >= plan.date_debut ? numeroJourPlan(iso, plan) : null
  if (n) {
    const j = joursPlan.find(x => x.jour_numero === n)
    return j?.objectif_kcal || plan.objectif_kcal ||
      (j?.nutrition_plan_meals || []).reduce((s, m) => s + (m.kcal || 0), 0) || null
  }
  const g = goals.filter(x => (x.active_from || '') <= iso).pop()
  return g?.kcal_target || null
}

// Calendrier du mois : choisir un jour à afficher dans le journal. Sous chaque
// jour noté, la part de l'objectif atteinte (en rouge si l'objectif est dépassé).
function Calendrier({ clientId, jour, plan, joursPlan, onChoisir, onFermer }) {
  const [mois, setMois] = useState(() => new Date(jour.getFullYear(), jour.getMonth(), 1))
  const [manges, setManges] = useState({})   // date → kcal
  const [goals, setGoals] = useState([])
  const debut = toISO(mois)
  const fin = toISO(new Date(mois.getFullYear(), mois.getMonth() + 1, 0))
  useEffect(() => {
    let annule = false
    // kcal des plats du programme, pour compter ceux que le joueur a cochés
    const kcalPlat = {}
    joursPlan.forEach(j => (j.nutrition_plan_meals || []).forEach(m => { kcalPlat[m.id] = m.kcal || 0 }))
    Promise.all([
      supabase.from('nutrition_meals').select('date, kcal').eq('client_id', clientId).gte('date', debut).lte('date', fin),
      supabase.from('nutrition_plan_logs').select('date, meal_id').eq('client_id', clientId).eq('statut', 'fait').gte('date', debut).lte('date', fin),
      supabase.from('nutrition_goals').select('kcal_target, active_from').eq('client_id', clientId).order('active_from'),
    ]).then(([a, b, g]) => {
      if (annule) return
      const t = {}
      ;(a.data || []).forEach(r => { t[r.date] = (t[r.date] || 0) + (r.kcal || 0) })
      ;(b.data || []).forEach(r => { t[r.date] = (t[r.date] || 0) + (kcalPlat[r.meal_id] || 0) })
      setManges(t)
      setGoals(g.data || [])
    })
    return () => { annule = true }
  }, [clientId, debut, fin, joursPlan])

  const auj = toISO(new Date())
  const choisi = toISO(jour)
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate()
  const decalage = (mois.getDay() + 6) % 7 // lundi en premier
  const cases = [...Array(decalage).fill(null), ...Array.from({ length: nbJours }, (_, i) => new Date(mois.getFullYear(), mois.getMonth(), i + 1))]
  const moisSuivantFutur = new Date(mois.getFullYear(), mois.getMonth() + 1, 1) > new Date()
  const changerMois = n => setMois(m => new Date(m.getFullYear(), m.getMonth() + n, 1))

  return (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-label="Choisir un jour">
        <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 10px' }} />
        <div style={S.calTete}>
          <button onClick={() => changerMois(-1)} style={S.calFleche} aria-label="Mois précédent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span style={S.calMois}>{MOIS[mois.getMonth()]} {mois.getFullYear()}</span>
          <button onClick={() => changerMois(1)} disabled={moisSuivantFutur} style={{ ...S.calFleche, opacity: moisSuivantFutur ? 0.25 : 1 }} aria-label="Mois suivant">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div style={S.calGrille}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => <span key={i} style={S.calJourSem}>{l}</span>)}
          {cases.map((d, i) => {
            if (!d) return <span key={i} />
            const iso = toISO(d)
            const futur = iso > auj
            const estChoisi = iso === choisi
            const kcal = manges[iso] || 0
            const obj = kcal ? objectifDuJour(iso, plan, joursPlan, goals) : null
            const pct = obj ? Math.round(kcal / obj * 100) : null
            const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
            return (
              <button key={i} disabled={futur} onClick={() => onChoisir(d)}
                aria-label={pct !== null ? `${date}, ${pct} % de l'objectif` : date}
                aria-current={estChoisi ? 'date' : undefined}
                style={{ ...S.calCase, opacity: futur ? 0.3 : 1, cursor: futur ? 'default' : 'pointer' }}>
                <span style={{ ...S.calNum, ...(iso === auj ? S.calAuj : {}), ...(estChoisi ? S.calChoisi : {}) }}>{d.getDate()}</span>
                <span style={{ ...S.calPct, color: pct > 100 ? '#dc2626' : '#6b7280' }}>
                  {pct !== null ? `${pct} %` : kcal ? '•' : ''}
                </span>
              </button>
            )
          })}
        </div>
        <button onClick={() => onChoisir(new Date())} style={S.calAujBtn}>Revenir à aujourd'hui</button>
      </div>
    </div>
  )
}

const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = n => Math.round(n || 0).toLocaleString('fr-FR')

export default function NutritionClient() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const fadeStyle = usePageFade()
  const [client, setClient]   = useState(null)
  const [jour, setJour]       = useState(new Date())
  const [repas, setRepas]     = useState([])
  const [goals, setGoals]     = useState(null)
  const [water, setWater]     = useState(0)
  const [loading, setLoading] = useState(true)
  // Plan du coach : ses repas prescrits s'affichent dans les mêmes sections que
  // les aliments ajoutés librement, au lieu d'une page séparée.
  const [plan, setPlan]       = useState(null)
  const [joursPlan, setJoursPlan] = useState([])
  const [logs, setLogs]       = useState([])
  const [coche, setCoche]     = useState(null)   // id du repas en cours d'envoi
  const [detailPlat, setDetailPlat] = useState(null) // repas prescrit dont on affiche le détail
  const [calendrier, setCalendrier] = useState(false)
  const [ajoutRepas, setAjoutRepas] = useState(null) // repas dont la fenêtre d'ajout est ouverte
  const [aRetirer, setARetirer] = useState(null)     // aliment dont la suppression attend confirmation
  const [message, setMessage] = useState(null)       // petit message en bas de l'écran
  const minuteurMsg = useRef(null)
  function afficher(texte) {
    clearTimeout(minuteurMsg.current)
    setMessage(texte)
    minuteurMsg.current = setTimeout(() => setMessage(null), 2600)
  }
  const ECHEC = "Pas enregistré. Vérifie ta connexion et réessaie."

  const iso = toISO(jour)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      let { data } = await supabase.from('clients').select('id, prenom').eq('user_id', user.id).maybeSingle()
      if (!data && user.email) {
        const r = await supabase.from('clients').select('id, prenom').eq('email', user.email).maybeSingle()
        data = r.data
      }
      setClient(data)
      if (!data) return
      // Plan actif éventuel (chargé une fois, il ne change pas d'un jour à l'autre)
      const today = isoLocal()
      const { data: p } = await supabase.from('nutrition_plans')
        .select('id, nom, date_debut, objectif_kcal, objectif_prot, objectif_carbs, objectif_fat').eq('client_id', data.id).eq('statut', 'actif')
        .lte('date_debut', today)
        .or(`date_fin.is.null,date_fin.gte.${today}`)
        .order('date_debut', { ascending: false }).limit(1).maybeSingle()
      if (p) {
        setPlan(p)
        const { data: jrs } = await supabase.from('nutrition_plan_days')
          .select('jour_numero, objectif_kcal, objectif_prot, objectif_carbs, objectif_fat, nutrition_plan_meals(id, meal_type, nom, kcal, prot_g, carbs_g, fat_g, recette, nutrition_plan_foods(id, nom, quantite_g, kcal, prot_g, carbs_g, fat_g, ordre))')
          .eq('plan_id', p.id).order('jour_numero')
        setJoursPlan(jrs || [])
      }
    })()
  }, [])

  const charger = useCallback(async (silencieux) => {
    if (!client) return
    if (silencieux !== true) setLoading(true)
    const [{ data: ms }, { data: g }, { data: w }, { data: lg }] = await Promise.all([
      supabase.from('nutrition_meals')
        .select('id, meal_type, kcal, prot_g, carbs_g, fat_g, nutrition_meal_items(id, name, quantity, unit, kcal, prot_g, carbs_g, fat_g, ordre)')
        .eq('client_id', client.id).eq('date', iso),
      supabase.from('nutrition_goals')
        .select('kcal_target, prot_g, carbs_g, fat_g')
        .eq('client_id', client.id).lte('active_from', iso)
        .order('active_from', { ascending: false }).limit(1),
      supabase.from('nutrition_water').select('ml').eq('client_id', client.id).eq('date', iso).maybeSingle(),
      plan
        ? supabase.from('nutrition_plan_logs').select('id, meal_id, statut')
            .eq('client_id', client.id).eq('plan_id', plan.id).eq('date', iso)
        : Promise.resolve({ data: [] }),
    ])
    setRepas(ms || [])
    setGoals(g?.[0] || null)
    setWater(w?.ml || 0)
    setLogs(lg || [])
    setLoading(false)
  }, [client, iso, plan])

  useEffect(() => { charger() }, [charger])

  // L'onglet reste ouvert en arrière-plan : si on regardait « aujourd'hui » et
  // que la date a changé (app laissée ouverte la nuit), on passe au nouveau jour
  // pour ne pas enregistrer le petit-déjeuner sur la veille.
  const aujourdhuiVu = useRef(toISO(new Date()))
  const suivreLeJour = useCallback(() => {
    const auj = toISO(new Date())
    if (auj === aujourdhuiVu.current) return false
    setJour(j => (toISO(j) === aujourdhuiVu.current ? new Date() : j))
    aujourdhuiVu.current = auj
    return true
  }, [])
  useAuRetourOnglet(() => { suivreLeJour(); charger(true) })
  useEffect(() => {
    const auRetour = () => { if (document.visibilityState === 'visible') suivreLeJour() }
    document.addEventListener('visibilitychange', auRetour)
    return () => document.removeEventListener('visibilitychange', auRetour)
  }, [suivreLeJour])

  // Retour de l'écran d'ajout : confirmation « ajouté »
  useEffect(() => {
    const ajout = location.state?.ajout
    if (!ajout) return
    afficher(ajout)
    charger(true)
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // Repas prescrits du jour + statut de chacun
  const jourNum   = plan ? numeroJourPlan(iso, plan) : null
  const planMeals = jourNum ? (joursPlan.find(j => j.jour_numero === jourNum)?.nutrition_plan_meals || []) : []
  const statutDe  = id => logs.find(l => l.meal_id === id)?.statut || null
  const jourPlan  = jourNum ? joursPlan.find(j => j.jour_numero === jourNum) : null

  // Le total du jour additionne les repas du plan cochés « mangé » ET les
  // aliments ajoutés librement : un seul chiffre, quelle que soit la source.
  const total = { kcal: 0, prot_g: 0, carbs_g: 0, fat_g: 0 }
  repas.forEach(m => {
    total.kcal    += m.kcal || 0
    total.prot_g  += Number(m.prot_g)  || 0
    total.carbs_g += Number(m.carbs_g) || 0
    total.fat_g   += Number(m.fat_g)   || 0
  })
  planMeals.forEach(pm => {
    if (statutDe(pm.id) !== 'fait') return
    total.kcal    += pm.kcal || 0
    total.prot_g  += Number(pm.prot_g)  || 0
    total.carbs_g += Number(pm.carbs_g) || 0
    total.fat_g   += Number(pm.fat_g)   || 0
  })

  // Sections à afficher : les 4 de base + celles que le plan ajoute.
  const typesAffiches = REPAS_ORDRE.filter(t =>
    REPAS_BASE.includes(t) || planMeals.some(m => m.meal_type === t) || repas.some(m => m.meal_type === t))

  async function cocherRepas(pm) {
    if (!plan || coche) return
    setCoche(pm.id)
    const existant = logs.find(l => l.meal_id === pm.id)
    if (existant?.statut === 'fait') {
      const { error } = await supabase.from('nutrition_plan_logs').delete().eq('id', existant.id)
      if (error) afficher(ECHEC)
      else setLogs(prev => prev.filter(l => l.id !== existant.id))
    } else if (existant) {
      const { error } = await supabase.from('nutrition_plan_logs').update({ statut: 'fait' }).eq('id', existant.id)
      if (error) afficher(ECHEC)
      else setLogs(prev => prev.map(l => l.id === existant.id ? { ...l, statut: 'fait' } : l))
    } else {
      // On conserve l'écriture dans nutrition_plan_logs : c'est elle qui
      // alimente le suivi d'adhérence côté coach.
      const { data } = await supabase.from('nutrition_plan_logs').insert({
        plan_id: plan.id, client_id: client.id, date: iso,
        jour_numero: jourNum, meal_id: pm.id, statut: 'fait',
      }).select('id, meal_id, statut').single()
      if (data) setLogs(prev => [...prev, data])
      else afficher(ECHEC)
    }
    setCoche(null)
  }
  // Avec un programme du coach, c'est lui qui fixe les objectifs (ceux du jour,
  // sinon ceux du programme). Sans programme, ceux que le joueur a calculés.
  const objectifs = plan
    ? {
        kcal_target: jourPlan?.objectif_kcal || plan.objectif_kcal ||
          planMeals.reduce((s, m) => s + (m.kcal || 0), 0) || null,
        prot_g:  jourPlan?.objectif_prot  || plan.objectif_prot  || null,
        carbs_g: jourPlan?.objectif_carbs || plan.objectif_carbs || null,
        fat_g:   jourPlan?.objectif_fat   || plan.objectif_fat   || null,
      }
    : goals
  const cible = objectifs?.kcal_target || null
  const pct = cible ? Math.min(1, total.kcal / cible) : 0
  const R = 47, CIRC = 2 * Math.PI * R

  async function majEau(delta) {
    const avant = water
    const ml = Math.max(0, water + delta)
    setWater(ml)
    const { error } = await supabase.from('nutrition_water').upsert(
      { client_id: client.id, date: iso, ml, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,date' })
    if (error) { setWater(avant); afficher(ECHEC) }
  }

  async function supprimerItem(mealId, itemId) {
    setARetirer(null)
    const { error } = await supabase.from('nutrition_meal_items').delete().eq('id', itemId)
    if (error) { afficher(ECHEC); return }
    const { data: restants } = await supabase.from('nutrition_meal_items')
      .select('kcal, prot_g, carbs_g, fat_g').eq('meal_id', mealId)
    if (!restants?.length) {
      await supabase.from('nutrition_meals').delete().eq('id', mealId)
    } else {
      const t = restants.reduce((s, i) => ({
        kcal: s.kcal + (i.kcal || 0), prot: s.prot + Number(i.prot_g || 0),
        carbs: s.carbs + Number(i.carbs_g || 0), fat: s.fat + Number(i.fat_g || 0),
      }), { kcal: 0, prot: 0, carbs: 0, fat: 0 })
      await supabase.from('nutrition_meals').update({
        kcal: Math.round(t.kcal), prot_g: t.prot.toFixed(1),
        carbs_g: t.carbs.toFixed(1), fat_g: t.fat.toFixed(1),
      }).eq('id', mealId)
    }
    charger(true)
    afficher('Aliment retiré')
  }

  function decale(n) { const d = new Date(jour); d.setDate(d.getDate() + n); setJour(d) }
  const estAujourdhui = iso === toISO(new Date())
  const labelJour = estAujourdhui ? "Aujourd'hui"
    : jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <EnTeteClient titre="Nutrition" actions={<>
        <button onClick={() => navigate('/client/nutrition/scans')} style={{ ...boutonEnTete, width: 'auto', padding: '0 13px 0 11px', gap: 6, fontSize: 13, fontWeight: 700 }}>
          <IconeQR taille={16} />
          Mes scans
        </button>
        <button onClick={() => navigate('/client/nutrition/profil')} style={boutonEnTete} aria-label="Mes besoins">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </button>
      </>}>
        <div style={S.dateBar}>
          <button onClick={() => decale(-1)} style={S.navBtn} aria-label="Jour précédent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button onClick={() => setCalendrier(true)} style={S.dateLabel} aria-label={`${labelJour}, ouvrir le calendrier`}>
            {labelJour}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
            </svg>
          </button>
          <button onClick={() => decale(1)} disabled={estAujourdhui}
            style={{ ...S.navBtn, opacity: estAujourdhui ? 0.25 : 1 }} aria-label="Jour suivant">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </EnTeteClient>

      <div style={S.body}>
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
              <svg width="108" height="108" viewBox="0 0 108 108" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="54" cy="54" r={R} fill="none" stroke="#eef1f4" strokeWidth="8" />
                {cible && (
                  <circle cx="54" cy="54" r={R} fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={CIRC} strokeDashoffset={CIRC - CIRC * pct} />
                )}
              </svg>
              {/* Total sur une ligne, objectif en dessous : tout tient dans le cercle */}
              <div style={S.ringCenter}>
                <div style={S.ringNum}>{fmt(total.kcal)}</div>
                <div style={S.ringLbl}>{cible ? `sur ${fmt(cible)}` : 'kcal'}</div>
                {cible && <div style={S.ringLbl}>kcal</div>}
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {MACROS.map(m => {
                const v = total[m.k], go = objectifs?.[m.k] ? Number(objectifs[m.k]) : null
                return (
                  <div key={m.k}>
                    <div style={S.macTop}>
                      <span style={S.macName}>{m.l}</span>
                      <span style={S.macVal}>{fmt(v)}{go ? ` / ${fmt(go)}` : ''} g</span>
                    </div>
                    <div style={S.bar}>
                      <div style={{ height: '100%', borderRadius: 99, background: m.c, width: `${go ? Math.min(100, v / go * 100) : 0}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {!cible && !plan && (
            <button onClick={() => navigate('/client/nutrition/profil')} style={S.hintGoal}>
              Pas encore d'objectif. Calcule tes besoins en 3 questions
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>

        {plan && (
          <button onClick={() => navigate('/client/nutrition/plan')} style={S.planBtn}>
            <span>Ma semaine et mes courses</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        {loading ? <p style={S.loading}>Chargement…</p> : typesAffiches.map(type => {
          const m = repas.find(x => x.meal_type === type)
          const items = (m?.nutrition_meal_items || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
          const prescrits = planMeals.filter(pm => pm.meal_type === type)
          const kcalSection = (m?.kcal || 0) +
            prescrits.reduce((s, pm) => s + (statutDe(pm.id) === 'fait' ? (pm.kcal || 0) : 0), 0)
          return (
            <div key={type} style={{ marginBottom: 12 }}>
              <div style={S.secHead}>
                <p style={S.secTitle}>{REPAS_LABEL[type] || type}</p>
                {kcalSection ? <span style={S.secKcal}>{fmt(kcalSection)} kcal</span> : null}
              </div>
              <div style={S.meal}>
                {/* Repas prévus par le coach — à cocher quand ils sont mangés */}
                {prescrits.map(pm => {
                  const fait = statutDe(pm.id) === 'fait'
                  return (
                    <div key={pm.id} style={S.prescrit}>
                      <button onClick={() => cocherRepas(pm)} disabled={!!coche}
                        aria-label={fait ? 'Décocher ce plat' : 'Valider ce plat'}
                        style={{ ...S.checkZone, cursor: coche ? 'default' : 'pointer' }}>
                        <span style={{ ...S.check, ...(fait ? S.checkOn : {}) }}>
                          {fait && (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          )}
                        </span>
                      </button>
                      <button onClick={() => setDetailPlat(pm)}
                        style={{ minWidth: 0, flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                        <p style={{ ...S.itemName, opacity: fait ? 1 : 0.75, textDecoration: 'underline', textDecorationColor: '#e5e7eb' }}>{pm.nom}</p>
                        <p style={S.itemQty}>Prévu par ton coach · voir le détail</p>
                      </button>
                      <span style={{ ...S.itemKcal, opacity: fait ? 1 : 0.45 }}>{fmt(pm.kcal)} kcal</span>
                    </div>
                  )
                })}
                {items.length ? items.map(it => (
                  <div key={it.id} style={S.item}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={S.itemName}>{it.name}</p>
                      <p style={S.itemQty}>{fmt(it.quantity)} {it.unit || 'g'}</p>
                    </div>
                    <span style={S.itemKcal}>{fmt(it.kcal)} kcal</span>
                    {aRetirer === it.id ? (
                      <button onClick={() => supprimerItem(m.id, it.id)} style={S.delConfirm}>Retirer</button>
                    ) : (
                      <button onClick={() => setARetirer(it.id)} style={S.del} aria-label={`Retirer ${it.name}`}>
                        <span style={S.delIco}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </span>
                      </button>
                    )}
                  </div>
                )) : (!prescrits.length && <p style={S.empty}>Rien pour l'instant</p>)}
                <button onClick={() => setAjoutRepas(type)} style={S.add}>
                  <span style={S.addIco}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                  Ajouter un aliment
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={S.waterIco}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M12 3s6 6.4 6 10.4A6 6 0 0 1 6 13.4C6 9.4 12 3 12 3z" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800 }}>Hydratation</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>
              {(water / 1000).toFixed(2).replace('.', ',')} L
              {!plan && goals?.hydration_ml ? ` / ${(goals.hydration_ml / 1000).toFixed(1).replace('.', ',')} L` : ''}
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => majEau(-250)} style={S.step} aria-label="Retirer un verre">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </button>
            <button onClick={() => majEau(250)} style={S.step} aria-label="Ajouter un verre">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        </div>

        {/* Dégagement : bouton scanner (96 px du bas + 52 px de haut) + une respiration */}
        <div style={{ height: 'calc(164px + env(safe-area-inset-bottom, 0px))' }} />
      </div>

      {/* Barre scanner fixe */}
      <div style={S.scanCta}>
        <button onClick={() => navigate('/client/nutrition/scanner', { state: { returnTo: '/client/nutrition' } })} style={S.scanCtaBtn}>
          <IconeQR taille={20} />
          Scanner un article
        </button>
      </div>

      {message && <div role="status" style={S.message}>{message}</div>}

      {ajoutRepas && (
        <AjouterAliment feuille repasInitial={ajoutRepas} dateInitiale={iso} onFermer={() => setAjoutRepas(null)}
          onAjoute={msg => { setAjoutRepas(null); afficher(msg); charger(true) }} />
      )}

      {calendrier && client && (
        <Calendrier clientId={client.id} jour={jour} plan={plan} joursPlan={joursPlan} onFermer={() => setCalendrier(false)}
          onChoisir={d => { setJour(d); setCalendrier(false) }} />
      )}

      {/* Détail d'un plat prescrit — quantités par ingrédient */}
      {detailPlat && (
        <div style={S.overlay} onClick={() => setDetailPlat(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 14px' }} />
            <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 2px', color: '#1a1a1a' }}>{detailPlat.nom}</p>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 14px' }}>
              {[detailPlat.kcal && `${fmt(detailPlat.kcal)} kcal`, detailPlat.prot_g && `P ${fmt(detailPlat.prot_g)}g`, detailPlat.carbs_g && `G ${fmt(detailPlat.carbs_g)}g`, detailPlat.fat_g && `L ${fmt(detailPlat.fat_g)}g`].filter(Boolean).join(' · ')}
            </p>
            {(detailPlat.nutrition_plan_foods || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...detailPlat.nutrition_plan_foods].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: '0.86rem', color: '#1a1a1a', fontWeight: 600 }}>{f.nom}</span>
                    <span style={{ fontSize: '0.82rem', color: '#4b5563', fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {f.quantite_g ? `${Math.round(f.quantite_g)} g` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>Pas de détail par ingrédient pour ce plat.</p>
            )}
            <button onClick={() => setDetailPlat(null)}
              style={{ marginTop: 16, width: '100%', minHeight: 50, background: '#333333', color: 'var(--accent)', border: 'none', borderRadius: 999, padding: '12px', fontSize: '0.86rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Fermer
            </button>
          </div>
        </div>
      )}

      <ClientBottomNav />
    </div>
  )
}

// QR code : trois carrés de repère et quelques modules, lisible même petit
function IconeQR({ taille }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
      <g fill="currentColor" stroke="none">
        <rect x="5.5" y="5.5" width="2" height="2" /><rect x="16.5" y="5.5" width="2" height="2" /><rect x="5.5" y="16.5" width="2" height="2" />
        <rect x="13" y="13" width="3" height="3" /><rect x="18" y="13" width="3" height="3" /><rect x="15.5" y="15.5" width="3" height="3" />
        <rect x="13" y="18" width="3" height="3" /><rect x="18" y="18" width="3" height="3" />
      </g>
    </svg>
  )
}

const S = {
  page:       { minHeight: '100dvh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  // Même variable de thème que la page du plan : les deux écrans doivent se
  // ressembler quand on passe de l'un à l'autre.
  header:     { background: 'var(--header-bg)', padding: '14px 16px 15px', position: 'sticky', top: 0, zIndex: 40 },
  headerRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle:{ color: 'white', fontWeight: 800, fontSize: '1.02rem' },
  icoBtn:     { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 },
  dateBar:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 0 8px' },
  dateLabel:  { color: 'white', fontSize: '0.85rem', fontWeight: 700, textTransform: 'capitalize', minWidth: 150, minHeight: 36, padding: '0 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' },
  navBtn:     { background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', padding: 0, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  body:       { padding: '14px' },
  card:       { background: 'white', borderRadius: 16, padding: 15, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 12 },
  ringCenter: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  ringNum:    { fontSize: '1.5rem', fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: 3 },
  ringLbl:    { fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', lineHeight: 1.25, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  macTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.75rem' },
  macName:    { fontWeight: 800, color: '#4b5563' },
  macVal:     { fontWeight: 700, color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
  bar:        { height: 6, background: '#eef1f4', borderRadius: 99, overflow: 'hidden', marginTop: 4 },
  hintGoal:   { margin: '10px 0 0', padding: '8px 0', minHeight: 44, width: '100%', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', borderTop: '1px solid #eef0f3', fontSize: '0.8rem', color: '#374151', fontWeight: 700, lineHeight: 1.45, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  planBtn:    { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#333333', color: 'var(--accent)', border: 'none', borderRadius: 14, padding: '12px 14px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' },
  secHead:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 7px' },
  secTitle:   { fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', letterSpacing: '0.09em', textTransform: 'uppercase', margin: 0 },
  secKcal:    { fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
  meal:       { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' },
  item:       { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px 11px 14px', borderBottom: '1px solid #eef0f3' },
  itemName:   { fontSize: '0.85rem', fontWeight: 700, margin: 0, lineHeight: 1.25 },
  itemQty:    { fontSize: '0.75rem', color: '#6b7280', margin: '2px 0 0', fontWeight: 600 },
  itemKcal:   { fontSize: '0.82rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  // Zone de 44 px autour d'une pastille de 28 px : facile à toucher sans grossir l'icône
  del:        { width: 44, height: 44, margin: '-8px -8px -8px 0', border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 },
  delIco:     { width: 28, height: 28, borderRadius: 8, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  delConfirm: { minHeight: 36, padding: '0 12px', borderRadius: 10, border: 'none', background: '#dc2626', color: 'white', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  empty:      { padding: '15px 14px', color: '#6b7280', fontSize: '0.79rem', fontWeight: 600, margin: 0 },
  add:        { width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', background: 'none', border: 'none', borderTop: '1px dashed #e2e6ea', padding: 11, fontSize: '0.8rem', fontWeight: 800, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  addIco:     { width: 22, height: 22, borderRadius: '50%', background: '#eef0f3', color: '#333333', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  prescrit:   { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'none', borderBottom: '1px solid #eef0f3', fontFamily: 'inherit' },
  checkZone:  { width: 44, height: 44, margin: '-10px -6px -10px -10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, flexShrink: 0 },
  check:      { width: 24, height: 24, borderRadius: 7, border: '2px solid #d1d5db', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'white' },
  checkOn:    { background: 'var(--accent)', borderColor: 'var(--accent)' },
  waterIco:   { width: 36, height: 36, borderRadius: 11, background: '#e8f4fd', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  step:       { width: 44, height: 44, borderRadius: 12, border: '1.5px solid #e5e7eb', background: 'white', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  // 96px = hauteur de la barre de navigation + une respiration : à 82px le
  // bouton la touchait presque (2px d'écart mesurés).
  scanCta:    { position: 'fixed', bottom: 'calc(96px + max(env(safe-area-inset-bottom, 0px), 0px))', left: 0, right: 0, padding: '0 14px', zIndex: 30 },
  scanCtaBtn: { width: '100%', padding: '0.9rem 1.25rem', background: '#333333', color: 'var(--accent)', border: 'none', borderRadius: 16, fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(0,0,0,0.18)' },
  message:    { position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(160px + env(safe-area-inset-bottom, 0px))', zIndex: 95, background: '#1a1a1a', color: 'white', borderRadius: 999, padding: '10px 18px', fontSize: '0.85rem', fontWeight: 700, boxShadow: '0 6px 20px rgba(0,0,0,0.22)', maxWidth: 'calc(100% - 40px)', textAlign: 'center' },
  loading:    { color: '#6b7280', fontSize: '0.85rem', fontWeight: 600 },
  calTete:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calMois:    { fontSize: '1rem', fontWeight: 800, color: '#1a1a1a', textTransform: 'capitalize' },
  calFleche:  { width: 44, height: 44, border: 'none', background: 'none', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  calGrille:  { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 2, textAlign: 'center' },
  calJourSem: { fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', padding: '4px 0 6px' },
  // Numéro dans un rond de 34 px, centré ; pourcentage sur une ligne fixe en dessous
  calCase:    { height: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 2, border: 'none', background: 'none', fontFamily: 'inherit', padding: '2px 0 0' },
  calNum:     { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
  calAuj:     { boxShadow: 'inset 0 0 0 1.5px #d1d5db' },
  calChoisi:  { background: '#333333', color: 'white', boxShadow: 'none' },
  calPct:     { height: 15, fontSize: '0.75rem', fontWeight: 700, lineHeight: '15px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  calAujBtn:  { marginTop: 14, width: '100%', minHeight: 50, border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 999, fontSize: '0.88rem', fontWeight: 800, color: '#333333', cursor: 'pointer', fontFamily: 'inherit' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  // Même marge (20 px) sur les côtés et en bas : le bouton du bas suit les bords de l'écran, comme la barre de navigation
  sheet:      { background: 'white', borderRadius: '24px 24px 0 0', padding: '14px 20px 20px', width: '100%', maxWidth: 500, maxHeight: '80vh', overflowY: 'auto' },
}
