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
  const { error } = await supabase
    .from('notifications')
    .insert([{ destinataire_id: destinataireId, titre, corps, type, lien }])
  if (error) {
    console.error('[sendNotif] Erreur Supabase :', error.message, error)
    return { ok: false, reason: error.message }
  }
  return { ok: true }
}
