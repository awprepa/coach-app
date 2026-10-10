import { supabase } from '../supabase'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Clés déjà traitées (ou en cours) dans cette session : une même séance déclenche
// cette fonction à chaque sauvegarde de série, souvent en parallèle — sans ce
// garde, plusieurs appels passent le test « existe déjà ? » avant qu'aucun
// n'ait fini d'insérer et créent chacun une ligne.
const dejaTraites = new Set()

// Place automatiquement une séance de programme sur le calendrier personnel
// du client le jour où il la fait réellement (poids/reps saisis, série
// validée, bloc terminé...), si elle n'y a pas déjà été placée — manuellement
// par le client, ou par un appel précédent — pour cette semaine du programme.
// Fire-and-forget : n'importe jamais le flux de sauvegarde appelant si ça échoue.
export function autoPlacerSeanceSurCalendrier(clientId, seanceId, semaine) {
  if (!clientId || !seanceId || !semaine) return
  const cle = `${clientId}|${seanceId}|${semaine}`
  if (dejaTraites.has(cle)) return
  dejaTraites.add(cle)
  ;(async () => {
    try {
      // limit(1) et non maybeSingle() : maybeSingle() renvoie une erreur (donc
      // aucune donnée) dès qu'il existe plusieurs lignes, ce qui faisait croire
      // à tort qu'il n'y en avait aucune.
      const { data: dejaCetteSemaine } = await supabase
        .from('evenements')
        .select('id')
        .eq('client_id', clientId)
        .eq('seance_id', seanceId)
        .eq('semaine', semaine)
        .limit(1)
      if (dejaCetteSemaine?.length) return

      // Garde-fou pour les événements plus anciens, placés avant l'ajout de la
      // colonne `semaine` (donc sans valeur) : si un événement existe déjà
      // aujourd'hui pour cette séance, ne pas en recréer un second.
      const today = todayISO()
      const { data: dejaAujourdhui } = await supabase
        .from('evenements')
        .select('id')
        .eq('client_id', clientId)
        .eq('seance_id', seanceId)
        .eq('date', today)
        .limit(1)
      if (dejaAujourdhui?.length) return

      // `titre` est NOT NULL en base — Calendrier.js l'ignore pour les
      // événements de type séance (il affiche seances(nom) via jointure) mais
      // il faut quand même lui donner une valeur à l'insertion.
      const { data: sea } = await supabase.from('seances').select('nom').eq('id', seanceId).maybeSingle()

      const { error } = await supabase.from('evenements').insert([{
        client_id: clientId,
        date: today,
        type: 'seance',
        titre: sea?.nom || 'Séance',
        seance_id: seanceId,
        source: 'client',
        semaine,
        // Le calendrier rouvre la séance sur semaine_override (cf. Calendrier.js
        // onViewSeance) plutôt que de la recalculer depuis la date — sans ça,
        // un jour réel décalé par rapport au créneau théorique rouvrirait la
        // mauvaise semaine.
        semaine_override: semaine,
      }])
      // 23505 = l'index unique de la base a refusé un doublon : c'est le résultat voulu.
      if (error && error.code !== '23505') {
        dejaTraites.delete(cle)
        console.warn('[autoPlacerSeanceSurCalendrier]', error.message)
      }
    } catch (e) {
      dejaTraites.delete(cle)
      console.warn('[autoPlacerSeanceSurCalendrier]', e.message)
    }
  })()
}
