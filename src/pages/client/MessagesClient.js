import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { useMessages } from '../../hooks/useMessages'
import { sendPushOnly } from '../../notifs'

const HEADER_H = 58
const INPUT_H  = 60
const NAV_H    = 82

// Détecte si le clavier est ouvert via focus/blur — fiable sur iOS Safari
function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onFocus = () => setOpen(true)
    const onBlur  = () => setTimeout(() => setOpen(false), 50)
    window.addEventListener('focusin',  onFocus)
    window.addEventListener('focusout', onBlur)
    return () => {
      window.removeEventListener('focusin',  onFocus)
      window.removeEventListener('focusout', onBlur)
    }
  }, [])
  return open
}

function ChatInner({ clientId, coachId }) {
  const { messages, loading, sendMessage, markRead } = useMessages(clientId, coachId)
  const [texte, setTexte]   = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const keyboardOpen = useKeyboardOpen()

  // Clavier ouvert → barre à bottom:0 (iOS la place juste au-dessus du clavier)
  // Clavier fermé  → barre au-dessus de la bottom nav
  const inputBottom = keyboardOpen ? 0 : NAV_H
  const msgsBottom  = INPUT_H + (keyboardOpen ? 0 : NAV_H)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (clientId && coachId) markRead()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  async function envoyer() {
    if (!texte.trim()) return
    setSending(true)
    const corps = texte
    setTexte('')
    sendMessage(corps)
    sendPushOnly(coachId, { titre: "Message d'un client", corps, lien: '/messages' })
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <>
      {/* ── Messages ──────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        top: HEADER_H,
        left: 0, right: 0,
        bottom: msgsBottom,
        overflowY: 'auto',
        background: '#f5f5f5',
        padding: '0.75rem 0.75rem 0.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '2rem' }}>Chargement…</p>
        ) : messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#d1d5db', fontSize: '0.82rem', padding: '2rem' }}>Aucun message. Commence la conversation !</p>
        ) : messages.map(m => {
          const isMe = m.from_id === clientId
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '78%',
                background: isMe ? '#333333' : 'white',
                color: isMe ? 'white' : '#333333',
                padding: '0.5rem 0.8rem',
                borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: isMe ? 'none' : '1px solid #efefef',
              }}>
                <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.corps}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.62rem', opacity: 0.5, textAlign: isMe ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  {isMe && (m.lu ? ' ✓✓' : ' ✓')}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Barre de saisie ───────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        left: 0, right: 0,
        bottom: inputBottom,
        height: INPUT_H,
        background: 'white',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0 0.75rem',
        zIndex: 89,
      }}>
        <input
          ref={inputRef}
          value={texte}
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), envoyer())}
          placeholder="Votre message…"
          maxLength={500}
          style={{
            flex: 1,
            padding: '0.55rem 0.875rem',
            border: '1.5px solid #e5e7eb',
            borderRadius: 999,
            fontSize: '0.88rem',
            outline: 'none',
            background: '#f9fafb',
          }}
        />
        <button
          onClick={envoyer}
          disabled={!texte.trim() || sending}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: texte.trim() ? '#333333' : '#e5e7eb',
            color: texte.trim() ? '#e4f816' : '#9ca3af',
            border: 'none', cursor: texte.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', flexShrink: 0,
          }}
        >{sending ? '…' : '↑'}</button>
      </div>
    </>
  )
}

export default function MessagesClient() {
  const navigate = useNavigate()
  const [clientId, setClientId] = useState(null)
  const [coachId,  setCoachId]  = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const userId = sess?.session?.user?.id
        if (!userId) { setLoadError(true); return }
        setClientId(userId)

        let foundCoachId = null
        const { data: msgRecu } = await supabase
          .from('messages').select('from_id').eq('to_id', userId).limit(1)
        if (msgRecu?.length) foundCoachId = msgRecu[0].from_id

        if (!foundCoachId) {
          const { data: setting } = await supabase
            .from('app_settings').select('value').eq('key', 'coach_user_id').maybeSingle()
          if (setting?.value) foundCoachId = setting.value
        }

        if (!foundCoachId) { setLoadError(true); return }
        setCoachId(foundCoachId)
      } catch (e) {
        console.error('[MessagesClient]', e)
        setLoadError(true)
      }
    }
    load()
  }, [])

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: HEADER_H,
        background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1rem',
        zIndex: 100,
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e4f816', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#333' }}>A</div>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '0.95rem' }}>Arthur</span>
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* ── Contenu ──────────────────────────────────────────────── */}
      {loadError ? (
        <div style={{ position: 'fixed', top: HEADER_H, left: 0, right: 0, bottom: NAV_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', gap: '0.5rem' }}>
          <p style={{ fontSize: '1.5rem', margin: 0 }}>💬</p>
          <p style={{ fontWeight: '700', color: '#374151', margin: 0 }}>Messagerie indisponible</p>
          <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>Contacte ton coach pour activer la messagerie.</p>
        </div>
      ) : !clientId || !coachId ? (
        <div style={{ position: 'fixed', top: HEADER_H, left: 0, right: 0, bottom: NAV_H, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
          <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>Chargement…</p>
        </div>
      ) : (
        <ChatInner clientId={clientId} coachId={coachId} />
      )}

      <ClientBottomNav />
    </div>
  )
}
