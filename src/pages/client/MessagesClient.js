import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { useMessages } from '../../hooks/useMessages'
import { sendPushOnly } from '../../notifs'

const HEADER_H = 56

// ── Hook viewport : suit le clavier via l'API visualViewport ───────────────────
// Sur mobile, le clavier ne redimensionne pas correctement `100dvh`. On lit la
// hauteur réelle visible et le décalage haut pour garder le chat au-dessus du
// clavier, au pixel près.
function useVisualViewport() {
  const [vp, setVp] = useState({
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    offsetTop: 0,
    keyboardOpen: false,
  })
  const maxH = useRef(typeof window !== 'undefined' ? window.innerHeight : 0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      // La plus grande hauteur observée = état clavier fermé (référence fiable,
      // contrairement à window.innerHeight qui bouge selon les appareils).
      if (vv.height > maxH.current) maxH.current = vv.height
      const keyboardOpen = vv.height < maxH.current - 120
      setVp({ height: vv.height, offsetTop: vv.offsetTop, keyboardOpen })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return vp
}

function ChatInner({ clientId, coachId, inputInset }) {
  const { messages, loading, sendMessage, markRead } = useMessages(clientId, coachId)
  const [texte,     setTexte]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [sendError, setSendError] = useState(false)
  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  // Scroll vers le bas à chaque nouveau message
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Marquer les messages comme lus
  useEffect(() => {
    if (clientId && coachId) markRead()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  // Auto-resize du textarea
  function autosize(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const envoyer = useCallback(async () => {
    const corps = texte.trim()
    if (!corps || sending) return

    setSending(true)
    setSendError(false)
    setTexte('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.focus()   // garder le clavier ouvert
    }

    try {
      const ok = await sendMessage(corps)
      if (ok) {
        sendPushOnly(coachId, { titre: "Message d'un client", corps, lien: '/messages' })
          .catch(() => {})
      } else {
        setTexte(corps)
        setSendError(true)
        setTimeout(() => setSendError(false), 3000)
      }
    } catch {
      setTexte(corps)
      setSendError(true)
      setTimeout(() => setSendError(false), 3000)
    } finally {
      setSending(false)
    }
  }, [texte, sending, sendMessage, coachId])

  return (
    <>
      {/* ── Zone des messages ──────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
        background: '#f5f5f5',
        padding: '0.75rem 0.75rem 0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        WebkitOverflowScrolling: 'touch',
      }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '2rem' }}>
            Chargement…
          </p>
        ) : messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#c0c4cc', padding: '2rem' }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.6rem' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6 }}>
              Aucun message pour l'instant.<br />Commence la conversation.
            </p>
          </div>
        ) : messages.map(m => {
          const isMe = m.from_id === clientId
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '0.45rem' }}>
              {!isMe && (
                <img src="/coach-avatar.png" alt="Coach" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid #e5e7eb' }} />
              )}
              <div style={{
                maxWidth: '78%',
                background: isMe ? '#333333' : 'white',
                color: isMe ? 'white' : '#333333',
                padding: '0.5rem 0.85rem',
                borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.07)',
                border: isMe ? 'none' : '1px solid #efefef',
                opacity: m._temp ? 0.65 : 1,
                transition: 'opacity 0.2s',
              }}>
                <p style={{
                  margin: 0, fontSize: '0.9rem', lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.corps}
                </p>
                <p style={{
                  margin: '0.25rem 0 0', fontSize: '0.62rem',
                  opacity: 0.45, textAlign: isMe ? 'right' : 'left',
                }}>
                  {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  {isMe && (m.lu ? ' ✓✓' : ' ✓')}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {/* ── Toast erreur d'envoi ────────────────────────────────────── */}
      {sendError && (
        <div style={{
          position: 'absolute',
          bottom: 72,
          left: '50%', transform: 'translateX(-50%)',
          background: '#dc2626', color: 'white',
          padding: '0.4rem 0.9rem', borderRadius: 20,
          fontSize: '0.75rem', fontWeight: 700,
          zIndex: 95, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          Erreur d'envoi — réessaie
        </div>
      )}

      {/* ── Barre de saisie ────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        background: 'white',
        borderTop: '1px solid #efefef',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '0.55rem',
        padding: `0.55rem 0.9rem calc(0.55rem + ${inputInset}px)`,
        boxSizing: 'border-box',
      }}>
        <textarea
          ref={inputRef}
          value={texte}
          onChange={e => { setTexte(e.target.value); autosize(e.target) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              envoyer()
            }
          }}
          placeholder="Écris un message…"
          maxLength={500}
          rows={1}
          autoComplete="off"
          style={{
            flex: 1,
            padding: '0.6rem 1rem',
            border: 'none',
            borderRadius: 20,
            fontSize: '0.92rem',
            outline: 'none',
            background: '#f0f0f0',
            color: '#1a1a1a',
            lineHeight: 1.4,
            resize: 'none',
            maxHeight: 120,
            fontFamily: 'inherit',
            WebkitAppearance: 'none',
          }}
        />
        <button
          onPointerDown={e => e.preventDefault()}
          onClick={envoyer}
          disabled={!texte.trim() || sending}
          style={{
            width: 42, height: 42,
            borderRadius: '50%',
            background: texte.trim() && !sending ? 'var(--header-bg)' : '#e5e7eb',
            color: texte.trim() && !sending ? 'var(--accent)' : '#b0b7c3',
            border: 'none',
            cursor: texte.trim() && !sending ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.18s, color 0.18s',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: texte.trim() && !sending ? '0 3px 10px rgba(0,0,0,0.22)' : 'none',
          }}
        >
          {sending ? (
            <span style={{ fontSize: '0.85rem' }}>…</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
      </div>
    </>
  )
}

export default function MessagesClient() {
  const navigate   = useNavigate()
  const vp         = useVisualViewport()
  const [clientId, setClientId] = useState(null)
  const [coachId,  setCoachId]  = useState(null)
  const [loadError, setLoadError] = useState(false)

  // Décalage bas pour passer au-dessus du home indicator iPhone (comme Insta/Snap),
  // uniquement dans l'app installée sur iOS et clavier fermé — sinon aucun espace ajouté.
  const iosStandalone  = typeof navigator !== 'undefined' && navigator.standalone === true
  const inputInset     = iosStandalone && !vp.keyboardOpen ? 34 : 0

  useEffect(() => {
    async function load() {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const userId = sess?.session?.user?.id
        if (!userId) { setLoadError(true); return }
        setClientId(userId)

        // Trouver le coach : d'abord via un message reçu, sinon via app_settings
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
    <div style={{
      position: 'fixed',
      top: vp.offsetTop,
      left: 0, right: 0,
      height: vp.height,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#f5f5f5',
      zIndex: 200,
    }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        height: HEADER_H,
        background: 'var(--header-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1rem',
        zIndex: 100,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', WebkitTapHighlightColor: 'transparent' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <img src="/coach-avatar.png" alt="Coach" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.25)', flexShrink: 0 }} />
          <span style={{ color: 'white', fontWeight: '700', fontSize: '0.95rem' }}>Arthur</span>
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* ── Contenu ────────────────────────────────────────────────── */}
      {loadError ? (
        <div style={{
          flex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#f5f5f5', gap: '0.5rem',
        }}>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p style={{ fontWeight: '700', color: '#374151', margin: 0 }}>Messagerie indisponible</p>
          <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0, textAlign: 'center', padding: '0 2rem' }}>
            Contacte ton coach pour activer la messagerie.
          </p>
        </div>
      ) : !clientId || !coachId ? (
        <div style={{
          flex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f5f5f5',
        }}>
          <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>Chargement…</p>
        </div>
      ) : (
        <ChatInner clientId={clientId} coachId={coachId} inputInset={inputInset} />
      )}
    </div>
  )
}
