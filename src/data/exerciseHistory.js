import { supabase } from '../supabase'

// Version "légère" du chargement d'historique d'exercices (pour le calcul d'XP
// uniquement — pas de formule 1RM, pas de RPE). Utilisée par les widgets qui
// n'ont besoin que de {date, poids, reps} par exercice, comme le résumé de
// niveau sur l'accueil client. La page Progression a sa propre version plus
// riche (avec 1RM estimé, etc.) et n'utilise pas ce module.

/** Retourne { [nomExercice]: [{date, poids, reps}] } pour tout l'historique du client. */
export async function loadClientAllSets(clientId) {
  const { data: progs } = await supabase
    .from('programmes')
    .select('id, date_debut, created_at')
    .eq('client_id', clientId)
  if (!progs?.length) return {}

  const progIds = progs.map(p => p.id)
  const progMap = Object.fromEntries(progs.map(p => [p.id, p]))

  const { data: seances } = await supabase
    .from('seances')
    .select('id, programme_id')
    .in('programme_id', progIds)
  if (!seances?.length) return {}

  const seanceIds = seances.map(s => s.id)
  const seanceProg = Object.fromEntries(seances.map(s => [s.id, s.programme_id]))

  const { data: exercices } = await supabase
    .from('exercices')
    .select('id, nom, seance_id')
    .in('seance_id', seanceIds)
  if (!exercices?.length) return {}

  const exIds = exercices.map(e => e.id)
  const exMap = Object.fromEntries(exercices.map(e => [e.id, e]))

  const { data: series } = await supabase
    .from('serie_tracking')
    .select('exercice_id, semaine, poids, reps_reelles, created_at')
    .in('exercice_id', exIds)
    .not('poids', 'is', null)
    .not('reps_reelles', 'is', null)
    .lt('serie', 1000)

  const byName = {}
  ;(series || []).forEach(s => {
    const ex = exMap[s.exercice_id]
    if (!ex) return

    const poids = parseFloat(String(s.poids).replace(',', '.'))
    const reps = parseInt(s.reps_reelles)
    if (isNaN(poids) || isNaN(reps) || poids <= 0 || reps <= 0 || reps > 20) return

    let dateStr
    if (s.created_at) {
      const d = new Date(s.created_at)
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
    ;(byName[nom] ||= []).push({ date: dateStr, poids, reps })
  })

  return byName
}

/** Poids de corps le plus récent connu pour un client (wellness en priorité, sinon profil nutrition). */
export async function loadClientBodyweight(clientId) {
  const [{ data: lastWellness }, { data: profile }] = await Promise.all([
    supabase.from('wellness').select('poids').eq('client_id', clientId).not('poids', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_profile').select('poids_kg').eq('client_id', clientId).maybeSingle(),
  ])
  return lastWellness?.poids || (profile?.poids_kg ? parseFloat(profile.poids_kg) : null) || null
}
