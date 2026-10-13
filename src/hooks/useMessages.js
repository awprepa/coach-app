import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../supabase'

const PAGE = 50

// Conversation entre deux utilisateurs (coach ↔ client).
// Charge les PAGE derniers messages, puis les plus anciens à la demande.
export function useMessages(myId, otherId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [hasMore, setHasMore]   = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const channelRef = useRef(null)

  const pairFilter = `and(from_id.eq.${myId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${myId})`
  const isPair = useCallback(m =>
    (m.from_id === myId && m.to_id === otherId) || (m.from_id === otherId && m.to_id === myId),
  [myId, otherId])

  useEffect(() => {
    if (!myId || !otherId) return
    fetchLatest()

    const channel = supabase.channel(`messages-${[myId, otherId].sort().join('-')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if (!isPair(m)) return
        setMessages(prev => {
          // Remplacer le message optimiste temporaire s'il existe
          const hasTemp = prev.some(p => p._temp && p.corps === m.corps && p.from_id === m.from_id)
          if (hasTemp) return prev.map(p => (p._temp && p.corps === m.corps && p.from_id === m.from_id) ? m : p)
          if (prev.some(p => p.id === m.id)) return prev
          return [...prev, m]
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if (!isPair(m)) return
        setMessages(prev => prev.map(p => p.id === m.id ? { ...p, ...m } : p))
      })
      .subscribe()

    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, otherId])

  async function fetchLatest() {
    setLoading(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(pairFilter)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    if (!error) {
      setMessages((data || []).slice().reverse())
      setHasMore((data || []).length === PAGE)
    }
    setLoading(false)
  }

  async function loadOlder() {
    const oldest = messages.find(m => !m._temp)
    if (!oldest || loadingOlder) return 0
    setLoadingOlder(true)
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(pairFilter)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE)
    setLoadingOlder(false)
    if (error) return 0
    const older = (data || []).slice().reverse()
    setMessages(prev => [...older, ...prev])
    setHasMore((data || []).length === PAGE)
    return older.length
  }

  async function sendMessage(corps, retryId = null) {
    if (!corps?.trim() || !myId || !otherId) return false
    const texte = corps.slice(0, 500)

    // Mise à jour optimiste immédiate (ou remise en attente d'un message en échec)
    const tempId = retryId || `temp-${Date.now()}`
    const tempMsg = {
      id: tempId, _temp: true,
      from_id: myId, to_id: otherId,
      corps: texte, lu: false,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => retryId
      ? prev.map(m => m.id === retryId ? tempMsg : m)
      : [...prev, tempMsg])

    const { error } = await supabase.from('messages')
      .insert([{ from_id: myId, to_id: otherId, corps: texte }])

    if (error) {
      // Le message reste affiché, marqué en échec, avec un bouton « Réessayer »
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _failed: true } : m))
      console.error('[useMessages] sendMessage error:', error.message)
      return false
    }
    // Le message temporaire reste affiché, le temps réel le remplace par la vraie ligne
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

  return { messages, loading, hasMore, loadingOlder, loadOlder, sendMessage, markRead, unread }
}
