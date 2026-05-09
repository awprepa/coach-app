import { supabase } from './supabase'

export async function getCoachId() {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'coach_user_id').single()
  return data?.value || null
}

export async function sendNotif(destinataireId, { titre, corps = '', type = 'info', lien = '' }) {
  if (!destinataireId) return
  await supabase.from('notifications').insert([{ destinataire_id: destinataireId, titre, corps, type, lien }])
}
