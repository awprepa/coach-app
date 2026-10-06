import { supabase } from '../supabase'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Place automatiquement une séance de programme sur le calendrier personnel
// du client le jour où il la fait réellement (poids/reps saisis, série
// validée, bloc terminé...), si elle n'y a pas déjà été placée — manuellement
// par le client, ou par un appel précédent — pour cette semaine du programme.
// Fire-and-forget : n'importe jamais le flux de sauvegarde appelant si ça échoue.
export function autoPlacerSeanceSurCalendrier(clientId, seanceId, semaine) {
  if (!clientId || !seanceId || !semaine) return
  ;(async () => {
    try {
      const { data: dejaCetteSemaine } = await supabase
        .from('evenements')
        .select('id')
        .eq('client_id', clientId)
        .eq('seance_id', seanceId)
        .eq('semaine', semaine)
        .maybeSingle()
      if (dejaCetteSemaine) return

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
        .maybeSingle()
      if (dejaAujourdhui) return

      await supabase.from('evenements').insert([{
        client_id: clientId,
        date: today,
        type: 'seance',
        seance_id: seanceId,
        source: 'client',
        semaine,
        // Le calendrier rouvre la séance sur semaine_override (cf. Calendrier.js
        // onViewSeance) plutôt que de la recalculer depuis la date — sans ça,
        // un jour réel décalé par rapport au créneau théorique rouvrirait la
        // mauvaise semaine.
        semaine_override: semaine,
      }])
    } catch (e) {
      console.warn('[autoPlacerSeanceSurCalendrier]', e.message)
    }
  })()
}
