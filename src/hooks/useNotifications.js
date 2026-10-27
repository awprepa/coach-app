import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

export function useNotifications() {
  const [notifs, setNotifs] = useState([])
  const [userId, setUserId] = useState(null)
  const [limite, setLimite] = useState(50)
  const [toutCharge, setToutCharge] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    if (!userId) return

    // Realtime
    const channel = supabase
      .channel(`notifs-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `destinataire_id=eq.${userId}`,
        },
        payload => {
          setNotifs(prev => [payload.new, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // Charger les dernières notifications (50, puis plus avec chargerPlus)
  useEffect(() => {
    if (!userId) return
    supabase
      .from('notifications')
      .select('*')
      .eq('destinataire_id', userId)
      .order('created_at', { ascending: false })
      .limit(limite)
      .then(({ data }) => { setNotifs(data || []); setToutCharge((data || []).length < limite) })
  }, [userId, limite])

  const chargerPlus = useCallback(() => setLimite(l => l + 150), [])

  const markRead = useCallback(async (id) => {
    await supabase.from('notifications').update({ lu: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n))
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    await supabase.from('notifications').update({ lu: true }).eq('destinataire_id', userId).eq('lu', false)
    setNotifs(prev => prev.map(n => ({ ...n, lu: true })))
  }, [userId])

  const unread = notifs.filter(n => !n.lu).length

  return { notifs, unread, markRead, markAllRead, chargerPlus, toutCharge }
}
