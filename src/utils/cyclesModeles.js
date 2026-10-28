import { supabase } from '../supabase'

// Cycles de la bibliothèque (programme_templates) envoyés à des clients.
// - copierSeanceModele : crée chez un client une séance du modèle (exercices,
//   échauffement, cardio, RPE cibles).
// - mettreAJourCopies : ajoute aux programmes déjà envoyés les séances ajoutées
//   au modèle depuis, sans toucher aux séances existantes ni à ce que les
//   clients ont rempli.

export async function copierSeanceModele(programmeId, ts, ordre) {
  const { data: seance, error } = await supabase.from('seances').insert({
    programme_id: programmeId, nom: ts.nom, ordre: ordre ?? ts.ordre, type: ts.type || 'musculation',
    echauffement: ts.echauffement || [],
    cardio_debut: ts.cardio_debut || null, cardio_fin: ts.cardio_fin || null, cardio_blocs: ts.cardio_blocs || [],
  }).select().single()
  if (error || !seance) throw new Error(error?.message || 'Séance non créée')
  if (ts.exercices?.length > 0) {
    await supabase.from('exercices').insert(ts.exercices.map(ex => ({
      seance_id: seance.id,
      code: ex.code, nom: ex.nom, series: ex.series,
      repetitions: ex.repetitions, tempo: ex.tempo,
      recuperation: ex.recuperation, type_intensite: ex.type_intensite,
      valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
      bibliotheque_id: ex.bibliotheque_id || null,
      progressions: ex.progressions || null,
      series_echauffement: ex.series_echauffement || null,
      media_url: ex.media_url || null,
      contenu: ex.contenu || null,
      schema: ex.schema || null,
    })))
  }
  const rpe = ts.rpe_cibles || {}
  if (Object.keys(rpe).length > 0) {
    await supabase.from('rpe_seances').insert(
      Object.entries(rpe).map(([sem, val]) => ({ seance_id: seance.id, semaine: parseInt(sem), rpe_cible: val }))
    )
  }
  return seance
}

// Une séance du modèle est déjà chez le client s'il a une séance de même nom
// ou à la même place dans le cycle (les séances du modèle sont recréées à
// chaque enregistrement : on ne peut pas se fier à leur identifiant).
const norm = s => (s || '').trim().toLowerCase()
export function seancesManquantes(seancesModele, seancesClient) {
  const noms = new Set(seancesClient.map(s => norm(s.nom)))
  const ordres = new Set(seancesClient.map(s => s.ordre))
  return seancesModele.filter(ts => !noms.has(norm(ts.nom)) && !ordres.has(ts.ordre))
}

// Programmes envoyés depuis ce modèle, avec leurs séances
export async function copiesDuModele(templateId) {
  const { data } = await supabase.from('programmes')
    .select('id, nom, client_id, clients(prenom, nom), seances(id, nom, ordre)')
    .eq('modele_id', templateId).not('client_id', 'is', null)
  return data || []
}

// Ajoute à chaque programme envoyé les séances du modèle qui lui manquent.
// Renvoie, par client, les séances ajoutées.
export async function mettreAJourCopies(templateId) {
  const [{ data: modele }, copies] = await Promise.all([
    supabase.from('programme_template_seances').select('*').eq('template_id', templateId).order('ordre'),
    copiesDuModele(templateId),
  ])
  const rapport = []
  for (const p of copies) {
    const manquantes = seancesManquantes(modele || [], p.seances || [])
    for (const ts of manquantes) await copierSeanceModele(p.id, ts, ts.ordre)
    rapport.push({ client: p.clients ? `${p.clients.prenom} ${p.clients.nom}` : 'Client', ajoutees: manquantes.map(t => t.nom.trim()) })
  }
  return rapport
}
