import { useEffect, useRef, useState } from 'react'
import { useMessages } from '../hooks/useMessages'

export default function ChatBox({ myId, otherId, myLabel = 'Moi', onAfterSend }) {
  const { messages, loading, sendMessage, markRead } = useMessages(myId, otherId)
  const [texte, setTexte] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (myId && otherId) markRead()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  async function envoyer() {
    if (!texte.trim()) return
    setSending(true)
    const corps = texte
    setTexte('') // vider immédiatement pour UX
    sendMessage(corps) // fire-and-forget, l'optimistic update gère l'affichage
    if (onAfterSend) onAfterSend() // toujours notifier, indépendamment du résultat DB
    setSending(false)
  }

  if (loading) return <p style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '1rem', textAlign: 'center' }}>Chargement…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 300 }}>
      {/* Zone messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 380 }}>
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#d1d5db', fontSize: '0.82rem', padding: '2rem' }}>Aucun message. Commencez la conversation !</p>
        ) : (
          messages.map(m => {
            const isMe = m.from_id === myId
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%',
                  background: isMe ? '#333333' : 'white',
                  color: isMe ? 'white' : '#333333',
                  padding: '0.5rem 0.8rem',
                  borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  border: isMe ? 'none' : '1px solid #f3f4f6',
                }}>
                  <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.corps}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.62rem', opacity: 0.5, textAlign: isMe ? 'right' : 'left' }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {isMe && (m.lu ? ' ✓✓' : ' ✓')}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Zone saisie */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', borderTop: '1px solid #f3f4f6', background: 'white' }}>
        <input
          value={texte}
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), envoyer())}
          placeholder="Votre message… (max 500 car.)"
          maxLength={500}
          style={{ flex: 1, padding: '0.55rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', outline: 'none' }}
        />
        <button
          onClick={envoyer}
          disabled={!texte.trim() || sending}
          style={{ background: texte.trim() ? '#333333' : '#e5e7eb', color: texte.trim() ? '#e4f816' : '#9ca3af', border: 'none', borderRadius: 10, padding: '0.55rem 1rem', fontWeight: '700', fontSize: '0.85rem', cursor: texte.trim() ? 'pointer' : 'default' }}
        >{sending ? '…' : '↑'}</button>
      </div>
    </div>
  )
}
