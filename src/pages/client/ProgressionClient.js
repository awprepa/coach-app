import { useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'
import usePageFade from '../../hooks/usePageFade'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

// ─── Formules 1RM ────────────────────────────────────────────────────────────

/** Détecte si un exercice est unilatéral (un seul membre à la fois).
 *  Pour ces exercices, le 1RM bilatéral n'est pas comparable → pas d'estimation. */
function isUnilateral(nom) {
  const n = (nom || '').toLowerCase()
  return (
    n.includes('unilatéral') || n.includes('unilateral') || n.includes('uni ') ||
    n.includes('1 jambe') || n.includes('une jambe') || n.includes('un bras') ||
    n.includes('1 bras') || n.includes('single') || n.includes('alternée') ||
    n.includes('alterné') || n.includes('bulgare') || n.includes('bulgarian') ||
    n.includes('split squat') || n.includes('pistol') || n.includes('single leg') ||
    n.includes('sl ') || // "SL RDL", "SL hip thrust"…
    // Fentes/lunges = unilatéral par nature
    n.includes('fente') || n.includes('lunge')
  )
}

/** Détermine la formule 1RM selon le nom de l'exercice.
 *  Retourne null si pas d'estimation pertinente :
 *  - exercice isolation / monoarticulaire
 *  - exercice unilatéral (charge non comparable au bilan bilatéral) */
function getFormulaConfig(nom) {
  // Unilatéral → jamais d'estimation 1RM (charge non comparable)
  if (isUnilateral(nom)) return null

  const n = (nom || '').toLowerCase()

  // Soulevé de terre / Deadlift — correction +6% (biais mécanique documenté)
  if (
    n.includes('soulevé') || n.includes('souleve') ||
    n.includes('deadlift') || n.includes('sdt') ||
    n.includes('roumain') || n.includes('sumo') || n.includes('jefferson') ||
    n.includes('rdl') || n.includes('good morning')
  )
    return { formula: 'weight_dependent', correction: 0.06, label: 'SportRxiv 2024 +6%' }

  // Développé couché / Bench → Lombardi 1989 (meilleur pour bench)
  if (
    n.includes('couché') || n.includes('couche') ||
    n.includes('bench') || n.includes('décliné') || n.includes('decline')
  )
    return { formula: 'lombardi', correction: 0, label: 'Lombardi 1989' }

  // Squat et variantes bilatérales
  if (n.includes('squat') || n.includes('hack squat') || n.includes('goblet'))
    return { formula: 'weight_dependent', correction: 0, label: 'SportRxiv 2024' }

  // Développé militaire / OHP bilatéral
  if (
    n.includes('militaire') || n.includes('overhead') || n.includes('ohp') ||
    n.includes('push press') || n.includes('push jerk')
  )
    return { formula: 'weight_dependent', correction: 0, label: 'SportRxiv 2024' }

  // Haltérophilie
  if (
    n.includes('arraché') || n.includes('snatch') ||
    n.includes('épaulé') || n.includes('epaule') ||
    n.includes('clean') || n.includes('jerk')
  )
    return { formula: 'weight_dependent', correction: 0, label: 'SportRxiv 2024' }

  // Hip thrust / Pont fessier bilatéral
  if (
    n.includes('hip thrust') || n.includes('pont fessier') || n.includes('hip extension')
  )
    return { formula: 'weight_dependent', correction: 0, label: 'SportRxiv 2024' }

  // Leg press / Presse jambes (bilatérale)
  if (n.includes('leg press') || (n.includes('presse') && n.includes('jambe')))
    return { formula: 'weight_dependent', correction: 0, label: 'SportRxiv 2024' }

  // Tractions lestées uniquement (bodyweight non lestées → non pertinent)
  if (
    (n.includes('traction') || n.includes('pull-up') || n.includes('pull up') || n.includes('chin')) &&
    (n.includes('lest') || n.includes('charg'))
  )
    return { formula: 'weight_dependent', correction: 0, label: 'SportRxiv 2024' }

  // Tirage vertical / horizontal bilatéral — formule valide
  if (
    (n.includes('tirage') || n.includes('rowing') || n.includes('row')) &&
    !n.includes('unilatéral') && !n.includes('unilateral')
  )
    return { formula: 'weight_dependent', correction: 0, label: 'SportRxiv 2024' }

  // Isolation, câbles, machines monoarticulaires → pas d'estimation
  return null
}

/** Calcule le 1RM estimé à partir du poids et des reps.
 *  Retourne null si les valeurs sont invalides ou hors plage. */
function calculate1RM(w, r, formula, correction = 0) {
  if (!w || !r || w <= 0 || r <= 0) return null
  // Lombardi (bench) : fiable jusqu'à 5 reps seulement
  if (formula === 'lombardi' && r > 5) return null
  // Autres formules : on exclut au-delà de 10 reps (trop incertaines sans RPE)
  if (formula !== 'lombardi' && r > 10) return null
  if (r === 1) return w * (1 + (correction || 0))

  let rm
  if (formula === 'weight_dependent') {
    // SportRxiv 2024 — calibré sur 303 494 séries near-failure, 388 exercices
    const denominator = -2.55 + 4.58 * Math.log(w)
    if (denominator <= 0 || w < 20) {
      // Fallback Epley si poids trop léger pour la formule log
      rm = w * (1 + r / 30)
    } else {
      rm = w * (1 + Math.pow(r - 1, 0.85) / denominator)
    }
  } else if (formula === 'lombardi') {
    // Lombardi 1989 — meilleur pour bench press
    rm = w * Math.pow(r, 0.10)
  } else {
    // Epley fallback universel
    rm = w * (1 + r / 30)
  }

  if (correction) rm = rm * (1 + correction)
  return Math.round(rm * 2) / 2  // arrondi au 0.5 kg
}

/** Correction RPE selon Helms/Zourdos 2016-2023.
 *  Chaque RIR supplémentaire → +3% sur l'estimation 1RM.
 *  Ex : RPE 7 (3 RIR) → ×1.09 ; RPE 6 (4 RIR) → ×1.12. */
function applyRpeCorrection(rm, rpe) {
  if (!rpe || rpe >= 10) return rm
  const rir = 10 - rpe
  if (rir <= 0) return rm
  // Effort sub-maximal → le vrai 1RM est PLUS élevé qu'estimé à partir des reps
  const corr = 1 + rir * 0.03
  return Math.round(rm * corr * 2) / 2
}

// ─── Groupe musculaire (pour le tri des chips) ────────────────────────────────

const GROUPE_ORDER = ['jambes', 'dos', 'pectoraux', 'epaules', 'bras', 'autres']

function getGroupeMusculaire(nom) {
  const n = (nom || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents pour les comparaisons

  // Jambes / Postérieur de cuisse / Fessiers
  if (
    n.includes('squat') || n.includes('leg press') || n.includes('presse') ||
    n.includes('leg curl') || n.includes('leg extension') || n.includes('fente') ||
    n.includes('hip thrust') || n.includes('pont fessier') || n.includes('hip extension') ||
    n.includes('souleve') || n.includes('deadlift') || n.includes('sdt') ||
    n.includes('roumain') || n.includes('sumo') || n.includes('jefferson') ||
    n.includes('rdl') || n.includes('good morning') || n.includes('mollet') ||
    n.includes('calf') || n.includes('ischio')
  ) return 'jambes'

  // Dos
  if (
    n.includes('traction') || n.includes('pull-up') || n.includes('pull up') ||
    n.includes('chin') || n.includes('tirage') || n.includes('rowing') ||
    n.includes('row') || n.includes('back extension') || n.includes('hyperextension') ||
    n.includes('grande dorsale') || n.includes('lat ') || n.includes('lats') ||
    n.includes('low row') || n.includes('seated row')
  ) return 'dos'

  // Pectoraux
  if (
    n.includes('bench') || n.includes('couche') || n.includes('developpe') ||
    n.includes('pec') || n.includes('dips') || n.includes('ecarte') ||
    n.includes('fly') || n.includes('chest') || n.includes('incline') ||
    n.includes('decline')
  ) return 'pectoraux'

  // Épaules
  if (
    n.includes('militaire') || n.includes('overhead') || n.includes('ohp') ||
    n.includes('push press') || n.includes('push jerk') || n.includes('elevation') ||
    n.includes('lateral') || n.includes('epaule') || n.includes('shoulder') ||
    n.includes('upright') || n.includes('oiseau') || n.includes('face pull') ||
    n.includes('arriere') || n.includes('rear delt')
  ) return 'epaules'

  // Bras
  if (
    n.includes('curl') || n.includes('tricep') || n.includes('bicep') ||
    n.includes('extension bras') || n.includes('marteau') || n.includes('preacher') ||
    n.includes('dip') || n.includes('skull') || n.includes('barre front') ||
    n.includes('kickback') || n.includes('close grip')
  ) return 'bras'

  return 'autres'
}

/** Tri principal des exercices :
 *  1. Groupe musculaire (Jambes → Dos → Pectoraux → Épaules → Bras → Autres)
 *  2. Dans chaque groupe : polyarticulaires avec formule 1RM en premier
 *  3. Alphabétique à égalité */
function sortExercices(exNames, exercicesData) {
  return [...exNames].sort((a, b) => {
    const ga = GROUPE_ORDER.indexOf(getGroupeMusculaire(a))
    const gb = GROUPE_ORDER.indexOf(getGroupeMusculaire(b))
    if (ga !== gb) return ga - gb

    // Dans le même groupe : polyarticulaire (formule 1RM) en premier
    const fa = exercicesData[a]?.config ? 0 : 1
    const fb = exercicesData[b]?.config ? 0 : 1
    if (fa !== fb) return fa - fb

    // Alphabétique
    return a.localeCompare(b, 'fr')
  })
}

// ─── Formatage dates ──────────────────────────────────────────────────────────

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Tooltip Recharts personnalisé ───────────────────────────────────────────

function CustomTooltip({ active, payload, label, hasFormula }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{
      background: '#1a1a1a', borderRadius: 10, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', fontSize: '0.82rem',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>{formatDateFull(label)}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 700, marginBottom: 2 }}>
          {p.name} : <span style={{ color: 'white' }}>{p.value} kg</span>
        </div>
      ))}
    </div>
  )
}

// ─── Skeleton pour la page ───────────────────────────────────────────────────

function ProgressionSkeleton() {
  return (
    <div style={{ animation: 'aw-spin 0s linear' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#333 0%,#1f2937 100%)', padding: '52px 20px 20px', borderLeft: '4px solid rgba(228,248,22,0.5)', marginBottom: 0 }}>
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 6, height: 20, width: 120, marginBottom: 8 }} />
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 12, width: 200 }} />
      </div>
      {/* Chips */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px', overflowX: 'auto' }}>
        {[100, 120, 90, 110, 80].map((w, i) => (
          <div key={i} style={{ background: '#e5e7eb', borderRadius: 20, height: 32, width: w, flexShrink: 0 }} className="aw-skeleton" />
        ))}
      </div>
      {/* Cards */}
      <div style={{ padding: '0 16px', display: 'flex', gap: 10, marginBottom: 16 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, background: 'white', borderRadius: 14, padding: '14px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ background: '#f0f0f0', borderRadius: 4, height: 10, width: '60%', marginBottom: 8 }} className="aw-skeleton" />
            <div style={{ background: '#e0e0e0', borderRadius: 6, height: 22, width: '80%' }} className="aw-skeleton" />
          </div>
        ))}
      </div>
      {/* Graphe */}
      <div style={{ margin: '0 16px', background: 'white', borderRadius: 16, height: 240, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} className="aw-skeleton" />
      <style>{`@keyframes aw-shimmer { 0% { background-position: -400px 0 } 100% { background-position: 400px 0 } } .aw-skeleton { background: linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%); background-size: 800px 100%; animation: aw-shimmer 1.4s infinite linear; }`}</style>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ProgressionClient() {
  const fadeStyle = usePageFade()

  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [exercicesData, setExercicesData] = useState({})
  const [selected, setSelected]     = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  // ── Chargement des données ────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)

        // 1. Résolution client (pattern standard AccueilClient)
        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) { setError('Non connecté'); setLoading(false); return }

        let client = null
        const { data: byUserId } = await supabase
          .from('clients').select('id,prenom,nom')
          .eq('user_id', user.id).maybeSingle()
        if (byUserId?.id) {
          client = byUserId
        } else {
          const { data: byEmail } = await supabase
            .from('clients').select('id,prenom,nom')
            .eq('email', user.email).maybeSingle()
          client = byEmail
        }
        if (!client?.id) { setError('Client introuvable'); setLoading(false); return }

        // 2. Programmes du client
        const { data: progs } = await supabase
          .from('programmes')
          .select('id, date_debut, created_at, semaines')
          .eq('client_id', client.id)
        if (!progs?.length) { setLoading(false); return }

        const progIds = progs.map(p => p.id)
        // Map programme_id → { date_debut, created_at }
        const progMap = Object.fromEntries(progs.map(p => [p.id, p]))

        // 3. Séances
        const { data: seances } = await supabase
          .from('seances')
          .select('id, programme_id')
          .in('programme_id', progIds)
        if (!seances?.length) { setLoading(false); return }

        const seanceIds = seances.map(s => s.id)
        // Map seance_id → programme_id
        const seanceProg = Object.fromEntries(seances.map(s => [s.id, s.programme_id]))

        // 4. Exercices
        const { data: exercices, error: exercicesError } = await supabase
          .from('exercices')
          .select('id, nom, seance_id')
          .in('seance_id', seanceIds)
        if (exercicesError) console.error('[Progression] exercices error:', exercicesError)
        if (!exercices?.length) { setLoading(false); return }

        const exIds = exercices.map(e => e.id)
        // Map exercice_id → { nom, seance_id }
        const exMap = Object.fromEntries(exercices.map(e => [e.id, e]))

        // 5. Serie_tracking : toutes les séries avec poids ET reps renseignés
        // On n'utilise ni is_done ni valide car ces colonnes peuvent être null ou false
        // sur les anciennes séances. On se base uniquement sur la présence des données.
        // Note : poids est une colonne TEXT — on ne filtre pas avec .gt() car PostgreSQL
        // tenterait de caster en numeric et planterait sur "102,5" (virgule fr).
        // Le filtrage numérique se fait en JS après parsing.
        const { data: series, error: seriesError } = await supabase
          .from('serie_tracking')
          .select('exercice_id, semaine, serie, poids, reps_reelles, valide, is_done, created_at')
          .in('exercice_id', exIds)
          .not('poids', 'is', null)
          .not('reps_reelles', 'is', null)
          .lt('serie', 1000)  // exclure les séries d'échauffement (serie >= 1000)

        if (seriesError) console.error('[Progression] series error:', seriesError)

        // 6. Charges / RPE par exercice et semaine
        const { data: charges } = await supabase
          .from('charges')
          .select('exercice_id, semaine, rpe_reel')
          .in('exercice_id', exIds)

        // Map RPE : exercice_id + semaine → rpe_reel
        const rpeMap = {}
        ;(charges || []).forEach(c => {
          rpeMap[`${c.exercice_id}_${c.semaine}`] = c.rpe_reel
        })

        // ── Transformation des données ──────────────────────────────────────

        // Regrouper par nom d'exercice
        // Pour chaque date, on garde le meilleur 1RM et le poids max brut
        const byName = {}  // { nomEx: { config, pointsByDate: {date: {rm, poids}}, rawSets: [...] } }

        ;(series || []).forEach(s => {
          const ex = exMap[s.exercice_id]
          if (!ex) return

          // Convertir et valider poids + reps
          // poids est TEXT et peut contenir une virgule fr (ex: "102,5") → remplacer par "."
          const poids = parseFloat(String(s.poids).replace(',', '.'))
          const reps  = parseInt(s.reps_reelles)
          if (isNaN(poids) || isNaN(reps) || poids <= 0 || reps <= 0 || reps > 20) return
          // Remplacer s.poids et s.reps_reelles par les valeurs numériques propres
          s = { ...s, poids, reps_reelles: reps }

          // Date réelle de la séance : on utilise created_at (date exacte où la série a été saisie).
          // Si created_at est absent, on calcule depuis date_debut + semaine (fallback).
          let dateStr
          if (s.created_at) {
            // Convertir le timestamp UTC en date locale (ex: "2025-05-15T20:30:00+00:00" → "2025-05-15" en UTC+2)
            const d = new Date(s.created_at)
            dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          } else {
            const progId = seanceProg[ex.seance_id]
            const prog = progMap[progId]
            if (!prog || !s.semaine || s.semaine <= 0) return
            const dateDebutStr = prog.date_debut ? prog.date_debut : (prog.created_at || '').slice(0, 10)
            if (!dateDebutStr) return
            const [yy, mm, dd] = dateDebutStr.split('-').map(Number)
            const weekDate = new Date(Date.UTC(yy, mm - 1, dd + (s.semaine - 1) * 7, 12))
            dateStr = weekDate.toISOString().split('T')[0]
          }

          const nom = ex.nom || 'Exercice'
          if (!byName[nom]) {
            byName[nom] = {
              config: getFormulaConfig(nom),
              pointsByDate: {},
              rawSets: [],
              direct1RepByDate: {},  // meilleur poids × 1 rep par date (1RM réel)
            }
          }

          // 1RM estimé avec correction RPE éventuelle
          const cfg = byName[nom].config
          let rm = null
          if (cfg) {
            const rmBase = calculate1RM(s.poids, s.reps_reelles, cfg.formula, cfg.correction)
            const rpe = rpeMap[`${s.exercice_id}_${s.semaine}`]
            rm = rmBase !== null ? applyRpeCorrection(rmBase, rpe) : null
          }

          // Mettre à jour le meilleur point de la date
          const prev = byName[nom].pointsByDate[dateStr]
          const betterRm  = rm  !== null && (prev?.rm  === undefined || rm  > (prev.rm  || 0))
          const betterPds = s.poids > (prev?.poids || 0)
          byName[nom].pointsByDate[dateStr] = {
            date:  dateStr,
            rm:    betterRm  ? rm  : (prev?.rm  ?? null),
            poids: betterPds ? s.poids : (prev?.poids || 0),
          }

          // Conserver le set avec le poids max par date pour "Dernières séances"
          const prevRaw = byName[nom].rawSets.find(r => r.date === dateStr)
          if (!prevRaw) {
            byName[nom].rawSets.push({ date: dateStr, poids: s.poids, reps: s.reps_reelles, rm })
          } else if (s.poids > prevRaw.poids) {
            prevRaw.poids = s.poids
            prevRaw.reps  = s.reps_reelles
            prevRaw.rm    = rm
          }

          // Tracker séparément le meilleur 1RM direct (reps == 1)
          if (reps === 1) {
            const prev1 = byName[nom].direct1RepByDate[dateStr]
            if (!prev1 || poids > prev1) byName[nom].direct1RepByDate[dateStr] = poids
          }
        })

        // Construire la structure finale : seulement exercices avec ≥ 2 points de données
        const result = {}
        Object.entries(byName).forEach(([nom, d]) => {
          const points = Object.values(d.pointsByDate)
            .sort((a, b) => a.date.localeCompare(b.date))
          if (points.length < 1) return  // Aucune donnée
          // Construire la liste chronologique des 1RM directs (r=1, triée par date)
          const direct1RepPoints = Object.entries(d.direct1RepByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, poids]) => ({ date, poids }))
          result[nom] = {
            config: d.config,
            points,
            rawSets: d.rawSets.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
            direct1RepPoints,
          }
        })

        setExercicesData(result)

        // Sélectionner en priorité : exercice avec formule 1RM ET le plus de points
        const keys = Object.keys(result)
        const bestKey = keys
          .sort((a, b) => {
            const aHas = result[a].config ? 1 : 0
            const bHas = result[b].config ? 1 : 0
            if (bHas !== aHas) return bHas - aHas
            return result[b].points.length - result[a].points.length
          })[0]
        if (bestKey) setSelected(bestKey)

      } catch (e) {
        console.error('[ProgressionClient]', e)
        setError('Erreur lors du chargement')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Données de l'exercice sélectionné ────────────────────────────────────

  const currentData = useMemo(() => {
    if (!selected || !exercicesData[selected]) return null
    return exercicesData[selected]
  }, [selected, exercicesData])

  // Métriques calculées
  const metrics = useMemo(() => {
    if (!currentData) return null
    const { config, points, rawSets, direct1RepPoints = [] } = currentData

    const lastPoint  = points[points.length - 1]
    const firstPoint = points[0]

    if (config) {
      // Mode 1RM
      const rmPoints = points.filter(p => p.rm !== null)
      const currentRm = rmPoints.length ? rmPoints[rmPoints.length - 1].rm : null
      const maxRm     = rmPoints.reduce((max, p) => p.rm > max ? p.rm : max, 0)

      // 1RM réel = meilleur poids soulevé pour 1 rep (test direct)
      const best1RepRM = direct1RepPoints.length
        ? Math.max(...direct1RepPoints.map(p => p.poids))
        : null

      // Progression : comparer premier et dernier 1RM direct si ≥2 points
      let progression = null
      let progressionSource = 'estimée'
      if (direct1RepPoints.length >= 2) {
        progression = Math.round(
          (direct1RepPoints[direct1RepPoints.length - 1].poids - direct1RepPoints[0].poids) * 2
        ) / 2
        progressionSource = 'tests directs'
      } else if (rmPoints.length >= 2) {
        const ref = rmPoints.length >= 3 ? rmPoints[1] : rmPoints[0]
        progression = Math.round((currentRm - ref.rm) * 2) / 2
        progressionSource = 'estimée'
      }

      // Warning si majorité > 5 reps (Lombardi non fiable au-delà)
      const repsGt5 = rawSets.filter(s => s.reps > 5).length
      const showWarning = repsGt5 > rawSets.length * 0.5

      return {
        mode: '1rm',
        currentRm,
        best1RepRM,
        progression,
        progressionSource,
        nbSeances: rawSets.length,
        maxRm,
        showWarning,
      }
    } else {
      // Mode poids max
      const poidsMax = points.reduce((max, p) => p.poids > max ? p.poids : max, 0)
      const volumeTotal = rawSets.reduce((acc, s) => acc + s.poids * s.reps, 0)
      return {
        mode: 'poids',
        poidsMax,
        volumeTotal: Math.round(volumeTotal),
        nbSeances: points.length,
      }
    }
  }, [currentData])

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return <ProgressionSkeleton />

  if (error) return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: '2rem' }}>⚠️</span>
      <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>{error}</p>
      <ClientBottomNav />
    </div>
  )

  const exNames = sortExercices(Object.keys(exercicesData), exercicesData)

  if (!exNames.length) return (
    <div style={{ ...S.page, ...fadeStyle }}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.headerTitle}>📈 Progression</h1>
        <p style={S.headerSub}>Évolution de tes performances</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, minHeight: 'calc(100vh - 160px)', padding: '2rem' }}>
        <span style={{ fontSize: '3rem' }}>💪</span>
        <p style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1a1a1a', margin: 0 }}>Aucune donnée encore</p>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
          Commence ta première séance pour voir ta progression ici 💪
        </p>
      </div>
      <ClientBottomNav />
    </div>
  )

  const cfg    = currentData?.config
  const points = currentData?.points || []

  // Données graphe : pour Recharts
  const chartData = points.map(p => ({
    date:  p.date,
    rm:    p.rm,
    poids: p.poids,
  }))

  // Max 1RM pour ReferenceLine
  const maxRm = metrics?.maxRm || null

  // 5 derniers sets
  const derniersSets = (currentData?.rawSets || []).slice(0, 5)

  return (
    <div style={{ ...S.page, ...fadeStyle }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <h1 style={S.headerTitle}>📈 Progression</h1>
        <p style={S.headerSub}>Évolution de tes performances</p>
      </div>

      {/* ── Sélecteur d'exercice ───────────────────────────────────────────── */}
      <ExercicePicker
        exNames={exNames}
        exercicesData={exercicesData}
        selected={selected}
        open={pickerOpen}
        onOpen={() => setPickerOpen(true)}
        onClose={() => setPickerOpen(false)}
        onSelect={nom => { setSelected(nom); setPickerOpen(false) }}
      />

      {/* ── Métriques ──────────────────────────────────────────────────────── */}
      {metrics && (
        <div style={S.metricsRow}>
          {metrics.mode === '1rm' ? (
            <>
              <MetricCard
                label={metrics.best1RepRM !== null ? '1RM réel' : '1RM estimé'}
                value={
                  metrics.best1RepRM !== null
                    ? `${metrics.best1RepRM} kg`
                    : metrics.currentRm !== null ? `${metrics.currentRm} kg` : '—'
                }
                accent
              />
              {metrics.best1RepRM !== null ? (
                <MetricCard
                  label="1RM estimé"
                  value={metrics.currentRm !== null ? `${metrics.currentRm} kg` : '—'}
                />
              ) : (
                <MetricCard
                  label={metrics.progressionSource === 'tests directs' ? 'Progression' : 'Tendance'}
                  value={
                    metrics.progression !== null
                      ? `${metrics.progression > 0 ? '+' : ''}${metrics.progression} kg`
                      : '—'
                  }
                  positive={metrics.progression > 0}
                  negative={metrics.progression < 0}
                />
              )}
              <MetricCard
                label={metrics.progressionSource === 'tests directs' ? 'Progression' : 'Record'}
                value={
                  metrics.progressionSource === 'tests directs' && metrics.progression !== null
                    ? `${metrics.progression > 0 ? '+' : ''}${metrics.progression} kg`
                    : metrics.maxRm ? `${metrics.maxRm} kg` : '—'
                }
                positive={metrics.progressionSource === 'tests directs' && metrics.progression > 0}
                negative={metrics.progressionSource === 'tests directs' && metrics.progression < 0}
              />
            </>
          ) : (
            <>
              <MetricCard
                label="Poids max"
                value={metrics.poidsMax ? `${metrics.poidsMax} kg` : '—'}
                accent
              />
              <MetricCard
                label="Volume total"
                value={metrics.volumeTotal ? `${(metrics.volumeTotal / 1000).toFixed(1)}t` : '—'}
              />
              <MetricCard label="Séances" value={metrics.nbSeances} />
            </>
          )}
        </div>
      )}

      {/* ── Warning reps > 8 ────────────────────────────────────────────────── */}
      {metrics?.showWarning && (
        <div style={S.warningBanner}>
          ⚠️ La plupart de tes séries dépassent 5 reps — l'estimation 1RM suppose un effort maximal (RPE 10). Si les séries n'étaient pas à l'échec, le 1RM réel peut être inférieur.
        </div>
      )}

      {/* ── Graphe Recharts ─────────────────────────────────────────────────── */}
      {chartData.length >= 2 && (
        <div style={S.chartCard}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                unit=" kg"
                width={46}
              />
              <Tooltip content={<CustomTooltip hasFormula={!!cfg} />} />

              {/* Ligne 1RM estimé (jaune accent, si formule) */}
              {cfg && (
                <Line
                  type="monotone"
                  dataKey="rm"
                  name="1RM estimé"
                  stroke="var(--chip-text, #e4f816)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: 'var(--chip-text, #e4f816)', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              )}

              {/* Ligne poids brut (grise, pointillée) */}
              <Line
                type="monotone"
                dataKey="poids"
                name="Poids max"
                stroke="#9ca3af"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />

              {/* ReferenceLine sur le 1RM max atteint */}
              {cfg && maxRm && (
                <ReferenceLine
                  y={maxRm}
                  stroke="var(--chip-text, #e4f816)"
                  strokeDasharray="6 3"
                  strokeOpacity={0.4}
                  strokeWidth={1}
                />
              )}
            </LineChart>
          </ResponsiveContainer>

          {/* Note scientifique */}
          <p style={S.sciNote}>
            {cfg
              ? `Formule ${cfg.label} · ${cfg.formula === 'lombardi' ? 'Fiable 1–5 reps à effort maximal' : 'Fiable 1–8 reps à effort maximal'}`
              : 'Progression du poids utilisé (1RM non estimé pour cet exercice)'
            }
          </p>
        </div>
      )}

      {/* ── Dernières séances ───────────────────────────────────────────────── */}
      {derniersSets.length > 0 && (
        <div style={S.section}>
          <h2 style={S.sectionTitle}>Dernières séances</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {derniersSets.map((s, i) => (
              <div key={i} style={S.setRow}>
                <span style={S.setDate}>{formatDateFull(s.date)}</span>
                <div style={S.setRight}>
                  <span style={S.setPoids}>{s.poids} kg × {s.reps}</span>
                  {s.rm !== null && (
                    <span style={S.setRm}>≈ {s.rm} kg 1RM</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Padding bottom pour la bottom nav */}
      <div style={{ height: 100 }} />
      <ClientBottomNav />
    </div>
  )
}

// ─── Composant ExercicePicker ────────────────────────────────────────────────

const GROUPE_LABELS = {
  jambes:    'Jambes',
  dos:       'Dos',
  pectoraux: 'Pectoraux',
  epaules:   'Épaules',
  bras:      'Bras',
  autres:    'Autres',
}

function ExercicePicker({ exNames, exercicesData, selected, open, onOpen, onClose, onSelect }) {
  const groupe = selected ? getGroupeMusculaire(selected) : null
  const groupeLabel = groupe ? GROUPE_LABELS[groupe] : null
  const hasFormula = selected && exercicesData[selected]?.config

  // Regrouper les exercices
  const groups = {}
  exNames.forEach(nom => {
    const g = getGroupeMusculaire(nom)
    if (!groups[g]) groups[g] = []
    groups[g].push(nom)
  })

  return (
    <>
      {/* Bouton déclencheur */}
      <button onClick={onOpen} style={{
        margin: '10px 16px 4px',
        width: 'calc(100% - 32px)',
        background: 'white',
        border: '1.5px solid #e5e7eb',
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {groupeLabel && (
            <span style={{
              fontSize: '0.62rem', fontWeight: 800, color: 'var(--chip-text)',
              background: 'var(--chip-bg)', borderRadius: 6,
              padding: '2px 7px', flexShrink: 0, textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>{groupeLabel}</span>
          )}
          <span style={{
            fontSize: '0.88rem', fontWeight: 700, color: '#1a1a1a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {selected || 'Choisir un exercice'}
          </span>
          {hasFormula && (
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af',
              flexShrink: 0,
            }}>1RM</span>
          )}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Bottom sheet */}
      {open && createPortal(
        <>
          <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.35)',
          }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
            background: 'white',
            borderRadius: '20px 20px 0 0',
            maxHeight: '72vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}>
            {/* Handle + titre */}
            <div style={{ padding: '12px 20px 8px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 10px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' }}>
                  Choisir un exercice
                </span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.1rem', cursor: 'pointer', padding: 4 }}>✕</button>
              </div>
            </div>

            {/* Liste groupée scrollable */}
            <div style={{ overflowY: 'auto', padding: '8px 0 32px', WebkitOverflowScrolling: 'touch' }}>
              {GROUPE_ORDER.filter(g => groups[g]?.length).map(g => (
                <div key={g}>
                  {/* Label groupe */}
                  <div style={{
                    padding: '10px 20px 4px',
                    fontSize: '0.65rem', fontWeight: 800,
                    color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    {GROUPE_LABELS[g]}
                  </div>
                  {/* Exercices du groupe */}
                  {groups[g].map(nom => {
                    const isSelected = nom === selected
                    const hasF = exercicesData[nom]?.config
                    return (
                      <button key={nom} onClick={() => onSelect(nom)} style={{
                        width: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 20px',
                        background: isSelected ? 'rgba(228,248,22,0.1)' : 'none',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        borderLeft: isSelected ? '3px solid var(--accent-stripe)' : '3px solid transparent',
                      }}>
                        <span style={{
                          fontSize: '0.875rem', fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? '#1a1a1a' : '#374151',
                        }}>{nom}</span>
                        {hasF
                          ? <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--accent-fg)', background: '#f0fdf4', borderRadius: 5, padding: '1px 6px' }}>1RM</span>
                          : <span style={{ fontSize: '0.62rem', color: '#d1d5db' }}>poids</span>
                        }
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}

// ─── Composant MetricCard ─────────────────────────────────────────────────────

function MetricCard({ label, value, accent, positive, negative }) {
  let valueColor = '#1a1a1a'
  if (positive) valueColor = '#16a34a'
  if (negative) valueColor = '#dc2626'
  if (accent)   valueColor = 'var(--accent-fg, #1a1a1a)'

  return (
    <div style={S.metricCard}>
      <span style={S.metricLabel}>{label}</span>
      <span style={{ ...S.metricValue, color: valueColor }}>{value}</span>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    background: '#f5f5f5',
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  // Header
  header: {
    background: 'var(--header-bg)',
    padding: '52px 20px 20px',
    borderLeft: '4px solid var(--accent-stripe)',
  },
  headerTitle: {
    color: 'var(--accent-fg-dark)',
    fontWeight: 900,
    fontSize: '1.15rem',
    margin: '0 0 2px',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.78rem',
    margin: 0,
  },

  // Chips
  chipsWrapper: {
    display: 'flex',
    gap: 6,
    padding: '14px 16px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
    alignItems: 'center',
  },
  groupLabel: {
    fontSize: '0.62rem',
    fontWeight: 800,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    whiteSpace: 'nowrap',
    paddingLeft: 4,
  },
  chip: {
    flexShrink: 0,
    border: 'none',
    borderRadius: 20,
    padding: '6px 14px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  },
  chipActive: {
    background: 'var(--chip-bg)',
    color: 'var(--chip-text)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  chipInactive: {
    background: 'white',
    color: '#6b7280',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },

  // Métriques
  metricsRow: {
    display: 'flex',
    gap: 10,
    padding: '0 16px 14px',
  },
  metricCard: {
    flex: 1,
    background: 'white',
    borderRadius: 14,
    padding: '12px 10px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  metricLabel: {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metricValue: {
    fontSize: '1.1rem',
    fontWeight: 800,
    lineHeight: 1.1,
  },

  // Warning
  warningBanner: {
    margin: '0 16px 14px',
    background: '#fef9c3',
    border: '1px solid #fbbf24',
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: '0.78rem',
    color: '#92400e',
    lineHeight: 1.5,
  },

  // Graphe
  chartCard: {
    margin: '0 16px 16px',
    background: 'white',
    borderRadius: 16,
    padding: '16px 4px 12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sciNote: {
    margin: '8px 12px 0',
    fontSize: '0.7rem',
    color: '#9ca3af',
    fontStyle: 'italic',
  },

  // Section dernières séances
  section: {
    margin: '0 16px 16px',
    background: 'white',
    borderRadius: 16,
    padding: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: '#374151',
    margin: '0 0 12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  setRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: '#f9fafb',
    borderRadius: 10,
  },
  setDate: {
    fontSize: '0.78rem',
    color: '#6b7280',
    flex: 1,
  },
  setRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  setPoids: {
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#1a1a1a',
  },
  setRm: {
    fontSize: '0.72rem',
    color: 'var(--accent-fg, #6b7280)',
    fontWeight: 600,
  },
}
