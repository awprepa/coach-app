// ─── Système de niveaux / XP ────────────────────────────────────────────────
//
// Deux niveaux distincts des rangs de force (Fer→Champion, basés sur le 1RM) :
// ceux-ci mesurent l'effort cumulé dans le temps, pas la force actuelle.
//
// XP par série = répétitions × (poids de la série ÷ poids de référence) × 10
// Le poids de référence est CONFIRMÉ (pas juste le record instantané) : un
// nouveau record ne devient la référence qu'après avoir été refait lors d'une
// 2e séance différente. Entre-temps, les séries à ce nouveau poids rapportent
// un bonus (ratio > 100%) car comparées à l'ancienne référence, plus basse.
// Pour les exercices au poids du corps (pompes, tractions non lestées), le
// "poids" de la série est remplacé par le poids de corps du client s'il est
// nul ou absent.

const XP_BASE = 10
const RATIO_CAP = 1.5 // évite qu'une série aberrante (erreur de saisie) ne génère un pic d'XP

/** Calcule l'XP total généré par l'historique complet d'un exercice.
 *  allSets : [{ date, poids, reps }], dans n'importe quel ordre.
 *  bodyweightKg : utilisé comme poids de série par défaut si poids est 0/absent
 *  (exercices au poids du corps). */
export function computeExerciseXp(allSets, bodyweightKg) {
  if (!allSets?.length) return 0

  const effectiveSets = allSets.map(s => ({
    ...s,
    poids: s.poids > 0 ? s.poids : (bodyweightKg || 0),
  })).filter(s => s.poids > 0 && s.reps > 0)
  if (!effectiveSets.length) return 0

  // Regroupe par séance (date)
  const byDate = {}
  effectiveSets.forEach(s => {
    ;(byDate[s.date] ||= []).push(s)
  })
  const dates = Object.keys(byDate).sort()

  let confirmedRef = null
  let pendingWeight = null
  let pendingCount = 0
  let totalXp = 0

  dates.forEach(date => {
    const setsThisDate = byDate[date]
    const sessionMax = Math.max(...setsThisDate.map(s => s.poids))
    if (confirmedRef === null) confirmedRef = sessionMax // toute première séance = référence initiale

    // XP de cette séance, calculé avec la référence CONFIRMÉE avant mise à jour
    setsThisDate.forEach(s => {
      const ratio = Math.min(RATIO_CAP, s.poids / confirmedRef)
      totalXp += s.reps * ratio * XP_BASE
    })

    // Mise à jour de la référence après coup (ne s'applique qu'aux séances suivantes)
    if (sessionMax > confirmedRef) {
      if (pendingWeight !== null && sessionMax >= pendingWeight) {
        pendingCount++
      } else {
        pendingWeight = sessionMax
        pendingCount = 1
      }
      if (pendingCount >= 2) {
        confirmedRef = pendingWeight
        pendingWeight = null
        pendingCount = 0
      }
    }
  })

  return Math.round(totalXp)
}

/** XP nécessaire pour passer du niveau `level` à `level + 1`. */
function xpStep(level) {
  return Math.round(40 * Math.pow(level, 1.4))
}

/** Convertit un total d'XP en {level, xpIntoLevel, xpForNextLevel}. */
export function levelFromXp(totalXp) {
  let level = 1
  let xp = Math.max(0, totalXp || 0)
  while (true) {
    const need = xpStep(level)
    if (xp < need) return { level, xp: Math.round(xp), xpForNextLevel: need, totalXp: Math.round(totalXp || 0) }
    xp -= need
    level++
  }
}

/** Récupère, pour un client, l'historique de séries de TOUS ses exercices
 *  (tous cycles confondus), regroupé par nom d'exercice — même requêtes,
 *  même repli date_debut+semaine et même conversion de date locale que
 *  ProgressionClient.js, pour que le total d'XP affiché en séance corresponde
 *  exactement à celui de la page Progression (date_debut/semaines vivent sur
 *  `programmes`, pas sur `seances` — piège à ne pas reproduire).
 *  Chaque set porte aussi une `key` (exercice_id-semaine-serie) unique par
 *  série réelle, pour permettre de la remplacer plutôt que la dupliquer si
 *  elle est dévalidée puis revalidée.
 *  Retourne { [nom]: { allSets: [{date,poids,reps,key}] } }. */
export async function fetchExerciceSetsByName(supabase, clientId) {
  const byName = {}
  if (!clientId) return byName

  const { data: progs } = await supabase.from('programmes').select('id, date_debut, created_at, semaines').eq('client_id', clientId)
  if (!progs?.length) return byName
  const progIds = progs.map(p => p.id)
  const progMap = Object.fromEntries(progs.map(p => [p.id, p]))

  const { data: seances } = await supabase.from('seances').select('id, programme_id').in('programme_id', progIds)
  if (!seances?.length) return byName
  const seanceIds = seances.map(s => s.id)
  const seanceProg = Object.fromEntries(seances.map(s => [s.id, s.programme_id]))

  const { data: exos } = await supabase.from('exercices').select('id, nom, seance_id').in('seance_id', seanceIds)
  if (!exos?.length) return byName
  const exIds = exos.map(e => e.id)
  const exoMap = Object.fromEntries(exos.map(e => [e.id, e]))

  const { data: series } = await supabase
    .from('serie_tracking')
    .select('exercice_id, semaine, serie, poids, reps_reelles, created_at')
    .in('exercice_id', exIds)
    .not('poids', 'is', null)
    .not('reps_reelles', 'is', null)
    .lt('serie', 1000) // exclut les séries d'échauffement

  ;(series || []).forEach(s => {
    const exo = exoMap[s.exercice_id]
    if (!exo) return
    const poids = parseFloat(String(s.poids).replace(',', '.'))
    const reps = parseInt(s.reps_reelles)
    if (isNaN(poids) || isNaN(reps) || poids <= 0 || reps <= 0 || reps > 20) return

    let dateStr
    if (s.created_at) {
      // Timestamp UTC → date locale (ex: "2025-05-15T22:30:00Z" → "2025-05-16" en UTC+2)
      const d = new Date(s.created_at)
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    } else {
      const prog = progMap[seanceProg[exo.seance_id]]
      if (!prog || !s.semaine || s.semaine <= 0) return
      const dateDebutStr = prog.date_debut ? prog.date_debut : (prog.created_at || '').slice(0, 10)
      if (!dateDebutStr) return
      const [yy, mm, dd] = dateDebutStr.split('-').map(Number)
      const weekDate = new Date(Date.UTC(yy, mm - 1, dd + (s.semaine - 1) * 7, 12))
      dateStr = weekDate.toISOString().split('T')[0]
    }

    const key = `${s.exercice_id}-${s.semaine}-${s.serie}`
    ;(byName[exo.nom] ||= { allSets: [] }).allSets.push({ date: dateStr, poids, reps, key })
  })

  return byName
}

/** Somme l'XP de tous les groupes d'exercices d'un `byName` (voir
 *  fetchExerciceSetsByName) — le total global affiché sur Progression. */
export function totalXpFromByName(byName, bodyweightKg) {
  return Object.values(byName || {}).reduce((sum, d) => sum + computeExerciseXp(d.allSets, bodyweightKg), 0)
}
