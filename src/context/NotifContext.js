import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

const NotifCtx = createContext({
  notifs: [], unread: 0,
  markRead: () => {}, markAllRead: () => {},
})

export function NotifProvider({ children }) {
  const [notifs, setNotifs]   = useState([])
  const [userId, setUserId]   = useState(null)
  const [ready,  setReady]    = useState(false)

  // Récupérer l'utilisateur courant
  useEffect(() => {
    supabase.auth.getUser()
      .then(result => {
        const user = result?.data?.user
        if (user) setUserId(user.id)
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  // Charger les notifs + Realtime une seule fois
  useEffect(() => {
    if (!userId) return

    // Chargement initial
    supabase
      .from('notifications')
      .select('*')
      .eq('destinataire_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setNotifs(data || []))
      .catch(() => {}) // table peut ne pas exister encore

    // Realtime — un seul channel pour toute l'app
    const channel = supabase
      .channel(`notifs-global-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `destinataire_id=eq.${userId}`,
        },
        payload => setNotifs(prev => [payload.new, ...prev])
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const markRead = useCallback(async (id) => {
    await supabase.from('notifications').update({ lu: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n))
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    await supabase.from('notifications').update({ lu: true })
      .eq('destinataire_id', userId).eq('lu', false)
    setNotifs(prev => prev.map(n => ({ ...n, lu: true })))
  }, [userId])

  const unread = notifs.filter(n => !n.lu).length

  return (
    <NotifCtx.Provider value={{ notifs, unread, markRead, markAllRead, ready }}>
      {children}
    </NotifCtx.Provider>
  )
}

export function useNotifCtx() {
  return useContext(NotifCtx)
}
