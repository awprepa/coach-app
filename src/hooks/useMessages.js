import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

export function useMessages(myId, otherId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!myId || !otherId) return
    fetchMessages()

    // Realtime : nouveaux messages entre ces 2 utilisateurs
    const channel = supabase.channel(`messages-${[myId, otherId].sort().join('-')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if (
          (m.from_id === myId && m.to_id === otherId) ||
          (m.from_id === otherId && m.to_id === myId)
        ) {
          setMessages(prev => [...prev, m])
        }
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, otherId])

  async function fetchMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(from_id.eq.${myId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${myId})`)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages(data || [])
    setLoading(false)
  }

  async function sendMessage(corps) {
    if (!corps?.trim() || !myId || !otherId) return
    const { error } = await supabase.from('messages').insert([{
      from_id: myId,
      to_id: otherId,
      corps: corps.slice(0, 500),
    }])
    return !error
  }

  async function markRead() {
    if (!myId || !otherId) return
    await supabase.from('messages')
      .update({ lu: true })
      .eq('to_id', myId)
      .eq('from_id', otherId)
      .eq('lu', false)
  }

  const unread = messages.filter(m => m.to_id === myId && !m.lu).length

  return { messages, loading, sendMessage, markRead, unread }
}
