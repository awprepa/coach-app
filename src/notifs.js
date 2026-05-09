import { supabase } from './supabase'

export async function getCoachId() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'coach_user_id').single()
  return data?.value || null
}

export async function sendNotif(destinataireId, { titre, corps = '', type = 'info', lien = '' }) {
  if (!destinataireId) {
    console.warn('[sendNotif] destinataireId manquant — notification non envoyée')
    return { ok: false, reason: 'no_id' }
  }

  // 1. Insérer la notification in-app
  const { data: notif, error } = await supabase
    .from('notifications')
    .insert([{ destinataire_id: destinataireId, titre, corps, type, lien }])
    .select().single()
  if (error) {
    console.error('[sendNotif] Erreur Supabase :', error.message, error)
    return { ok: false, reason: error.message }
  }

  // 2. Déclencher le push téléphone via la Edge Function
  try {
    await supabase.functions.invoke('send-push', {
      body: { record: notif },
    })
  } catch (e) {
    // Le push échoue silencieusement (Edge Function pas déployée, pas de subscription…)
    console.warn('[sendNotif] Push non envoyé :', e?.message)
  }

  return { ok: true }
}
