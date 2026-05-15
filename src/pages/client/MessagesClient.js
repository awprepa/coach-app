import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { useMessages } from '../../hooks/useMessages'
import { sendPushOnly } from '../../notifs'

const HEADER_H = 58
const NAV_H    = 82
const INPUT_H  = 62

/**
 * useInputBottom — lit window.visualViewport (fiable sur iOS 15+)
 * au lieu de focusin/focusout qui causait des sauts et des bugs de timing.
 * Quand le clavier est ouvert, retourne la hauteur du clavier.
 * Quand fermé, retourne NAV_H (au-dessus de la bottom nav).
 */
function useInputBottom() {
  const [bottom, setBottom] = useState(NAV_H)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function update() {
      // Décalage clavier = différence entre hauteur innerHeight et visual viewport
      const kbH = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setBottom(kbH > 80 ? kbH : NAV_H)
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return bottom
}

function ChatInner({ clientId, coachId }) {
  const { messages, loading, sendMessage, markRead } = useMessages(clientId, coachId)
  const [texte,     setTexte]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [sendError, setSendError] = useState(false)
  const bottomRef   = useRef(null)
  const inputRef    = useRef(null)
  const inputBottom = useInputBottom()
  const msgsBottom  = INPUT_H + inputBottom

  // Scroll vers le bas à chaque nouveau message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Marquer les messages comme lus
  useEffect(() => {
    if (clientId && coachId) markRead()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  const envoyer = useCallback(async () => {
    const corps = texte.trim()
    if (!corps || sending) return

    setSending(true)
    setSendError(false)
    setTexte('')

    try {
      const ok = await sendMessage(corps)
      if (ok) {
        // Push silencieux vers le coach (non bloquant)
        sendPushOnly(coachId, { titre: "Message d'un client", corps, lien: '/messages' })
          .catch(() => {}) // ne pas bloquer si ça échoue
      } else {
        // Restaurer le texte si l'envoi a échoué
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
        position: 'fixed',
        top: HEADER_H, left: 0, right: 0,
        bottom: msgsBottom,
        overflowY: 'auto',
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
          <p style={{ textAlign: 'center', color: '#d1d5db', fontSize: '0.82rem', padding: '2rem', lineHeight: 1.6 }}>
            Aucun message pour l'instant.{'\n'}Commence la conversation ! 👋
          </p>
        ) : messages.map(m => {
          const isMe = m.from_id === clientId
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
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
          position: 'fixed',
          bottom: inputBottom + INPUT_H + 8,
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
        position: 'fixed',
        left: 0, right: 0,
        bottom: inputBottom,
        zIndex: 90,
        background: 'white',
        borderTop: '1px solid #ebebeb',
        // Couvre toute la zone jusqu'en bas (safe area incluse)
        paddingBottom: inputBottom === NAV_H ? 0 : 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 0.75rem',
        minHeight: INPUT_H,
        boxSizing: 'border-box',
      }}>
        <input
          ref={inputRef}
          value={texte}
          onChange={e => setTexte(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              envoyer()
            }
          }}
          placeholder="Votre message…"
          maxLength={500}
          autoComplete="off"
          style={{
            flex: 1,
            padding: '0.6rem 0.9rem',
            border: '1.5px solid #e5e7eb',
            borderRadius: 999,
            fontSize: '0.9rem',
            outline: 'none',
            background: '#f9fafb',
            color: '#1a1a1a',
            lineHeight: 1.4,
            // Pas de box-shadow sur l'input — c'est ce qui causait les ombres visibles
            boxShadow: 'none',
            WebkitAppearance: 'none',
          }}
        />
        <button
          // onPointerDown + preventDefault : empêche l'input de perdre le focus
          // quand on tape "Envoyer" → le clavier reste ouvert, la barre ne bouge pas
          onPointerDown={e => e.preventDefault()}
          onClick={envoyer}
          disabled={!texte.trim() || sending}
          style={{
            width: 40, height: 40,
            borderRadius: '50%',
            background: texte.trim() && !sending ? '#333333' : '#e5e7eb',
            color: texte.trim() && !sending ? '#e4f816' : '#9ca3af',
            border: 'none',
            cursor: texte.trim() && !sending ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem', flexShrink: 0,
            transition: 'background 0.15s, color 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {sending ? '…' : '↑'}
        </button>
      </div>
    </>
  )
}

export default function MessagesClient() {
  const navigate   = useNavigate()
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
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: HEADER_H,
        background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
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
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e4f816', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '800', color: '#333' }}>
            A
          </div>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '0.95rem' }}>Arthur</span>
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* ── Contenu ────────────────────────────────────────────────── */}
      {loadError ? (
        <div style={{
          position: 'fixed', top: HEADER_H, left: 0, right: 0, bottom: NAV_H,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#f5f5f5', gap: '0.5rem',
        }}>
          <p style={{ fontSize: '2rem', margin: 0 }}>💬</p>
          <p style={{ fontWeight: '700', color: '#374151', margin: 0 }}>Messagerie indisponible</p>
          <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0, textAlign: 'center', padding: '0 2rem' }}>
            Contacte ton coach pour activer la messagerie.
          </p>
        </div>
      ) : !clientId || !coachId ? (
        <div style={{
          position: 'fixed', top: HEADER_H, left: 0, right: 0, bottom: NAV_H,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f5f5f5',
        }}>
          <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>Chargement…</p>
        </div>
      ) : (
        <ChatInner clientId={clientId} coachId={coachId} />
      )}

      <ClientBottomNav />
    </div>
  )
}
