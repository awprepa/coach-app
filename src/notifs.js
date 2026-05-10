import { supabase } from './supabase'

export async function getCoachId() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'coach_user_id').maybeSingle()
  return data?.value || null
}

export async function sendNotif(destinataireId, { titre, corps = '', type = 'info', lien = '' }) {
  if (!destinataireId) {
    console.warn('[sendNotif] destinataireId manquant — notification non envoyée')
    return { ok: false, reason: 'no_id' }
  }

  // 1. Insérer la notification in-app (sans .select() pour éviter le blocage RLS en lecture)
  const { error } = await supabase
    .from('notifications')
    .insert([{ destinataire_id: destinataireId, titre, corps, type, lien }])
  if (error) {
    console.error('[sendNotif] Erreur Supabase :', error.message, error)
    return { ok: false, reason: error.message }
  }

  // 2. Déclencher le push téléphone via la Edge Function
  // On reconstruit le payload avec les données connues (pas besoin de relire la DB)
  try {
    const { data: fnData, error: fnError } = await supabase.functions.invoke('send-push', {
      body: JSON.stringify({ record: { destinataire_id: destinataireId, titre, corps, type, lien } }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (fnError) console.error('[sendNotif] Edge Function erreur :', fnError)
    else console.log('[sendNotif] Edge Function réponse :', fnData)
  } catch (e) {
    console.warn('[sendNotif] Push non envoyé :', e?.message)
  }

  return { ok: true }
}

// Push uniquement — sans entrée dans l'onglet 🔔 (utilisé pour les messages)
export async function sendPushOnly(destinataireId, { titre, corps = '', lien = '' }) {
  if (!destinataireId) return
  try {
    await supabase.functions.invoke('send-push', {
      body: JSON.stringify({ record: { destinataire_id: destinataireId, titre, corps, type: 'info', lien } }),
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.warn('[sendPushOnly] Push non envoyé :', e?.message)
  }
}
