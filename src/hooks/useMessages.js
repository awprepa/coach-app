import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

export function useMessages(myId, otherId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!myId || !otherId) return
    fetchMessages()

    const channel = supabase.channel(`messages-${[myId, otherId].sort().join('-')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if (
          (m.from_id === myId && m.to_id === otherId) ||
          (m.from_id === otherId && m.to_id === myId)
        ) {
          // Remplacer le message optimiste temporaire s'il existe
          setMessages(prev => {
            const hasTemp = prev.some(p => p._temp && p.corps === m.corps && p.from_id === m.from_id)
            if (hasTemp) return prev.map(p => (p._temp && p.corps === m.corps && p.from_id === m.from_id) ? m : p)
            // Éviter les doublons
            if (prev.some(p => p.id === m.id)) return prev
            return [...prev, m]
          })
        }
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, otherId])

  async function fetchMessages() {
    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(from_id.eq.${myId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${myId})`)
      .order('created_at', { ascending: true })
      .limit(100)
    if (!error) setMessages(data || [])
    setLoading(false)
  }

  async function sendMessage(corps) {
    if (!corps?.trim() || !myId || !otherId) return false

    // Mise à jour optimiste immédiate
    const tempId = `temp-${Date.now()}`
    const tempMsg = {
      id: tempId, _temp: true,
      from_id: myId, to_id: otherId,
      corps: corps.slice(0, 500),
      lu: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])

    const { data, error } = await supabase.from('messages')
      .insert([{ from_id: myId, to_id: otherId, corps: corps.slice(0, 500) }])
      .select().single()

    if (error) {
      // Annuler le message optimiste si erreur
      setMessages(prev => prev.filter(m => m.id !== tempId))
      console.error('[useMessages] sendMessage error:', error.message)
      return false
    }
    // Remplacer le temp par la vraie donnée DB
    setMessages(prev => prev.map(m => m.id === tempId ? data : m))
    return true
  }

  async function markRead() {
    if (!myId || !otherId) return
    await supabase.from('messages')
      .update({ lu: true })
      .eq('to_id', myId)
      .eq('from_id', otherId)
      .eq('lu', false)
    setMessages(prev => prev.map(m => m.from_id === otherId && m.to_id === myId ? { ...m, lu: true } : m))
  }

  const unread = messages.filter(m => m.to_id === myId && !m.lu).length

  return { messages, loading, sendMessage, markRead, unread }
}
