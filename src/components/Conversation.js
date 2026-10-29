import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useMessages } from '../hooks/useMessages'
import Icon from './Icon'
import T from '../theme/tokens'
import { useOngletActif } from '../context/OngletContext'

// Fil de discussion partagé coach ↔ client : s'ouvre directement sur le dernier
// message, charge l'historique à la demande, séparateurs de date, statut « Lu ».

function libelleJour(iso) {
  const d = new Date(iso)
  const auj = new Date(); auj.setHours(0, 0, 0, 0)
  const jour = new Date(d); jour.setHours(0, 0, 0, 0)
  const diff = Math.round((auj - jour) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Hier'
  return d.toLocaleDateString('fr-FR', {
    weekday: diff < 7 ? 'long' : undefined,
    day: 'numeric', month: 'long',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

export default function Conversation({ myId, otherId, onAfterSend, onFocusChange, emptyText = 'Aucun message pour l’instant. Écris le premier.' }) {
  const { messages, loading, hasMore, loadingOlder, loadOlder, sendMessage, markRead } = useMessages(myId, otherId)
  const [texte, setTexte] = useState('')
  const [nouveaux, setNouveaux] = useState(false)
  const scrollRef = useRef(null)
  const actif = useOngletActif()
  const inputRef  = useRef(null)
  const premierAffichage = useRef(true)
  const dernierId = useRef(null)
  const hauteurAvantHistorique = useRef(null)

  const auBas = () => {
    const el = scrollRef.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  const allerEnBas = useCallback((behavior = 'auto') => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
    setNouveaux(false)
  }, [])

  // Quand la zone de la conversation change de hauteur (clavier qui s'ouvre ou
  // se ferme), on reste calé sur le dernier message si on y était
  const colleEnBas = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(() => { if (colleEnBas.current) el.scrollTop = el.scrollHeight })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Positionnement : ouverture directe en bas, sans défilement visible ;
  // ensuite on ne descend tout seul que si on est déjà en bas (ou si c'est mon message).
  useLayoutEffect(() => {
    if (loading) return
    const el = scrollRef.current
    if (!el) return
    if (hauteurAvantHistorique.current != null) {
      el.scrollTop += el.scrollHeight - hauteurAvantHistorique.current
      hauteurAvantHistorique.current = null
      return
    }
    const dernier = messages[messages.length - 1]
    if (premierAffichage.current) {
      el.scrollTop = el.scrollHeight
      premierAffichage.current = false
    } else if (dernier && dernier.id !== dernierId.current) {
      if (dernier.from_id === myId || auBas()) allerEnBas('smooth')
      else setNouveaux(true)
    }
    dernierId.current = dernier?.id || null
  }, [messages, loading, myId, allerEnBas])

  // Marquer comme lus les messages reçus (seulement quand la conversation est affichée)
  useEffect(() => {
    if (actif && myId && otherId && messages.some(m => m.to_id === myId && !m.lu)) markRead()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, actif])

  // Retour sur l'onglet Messages : on se replace sur le dernier message
  useLayoutEffect(() => {
    if (actif && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [actif])

  async function voirPrecedents() {
    hauteurAvantHistorique.current = scrollRef.current?.scrollHeight ?? null
    const n = await loadOlder()
    if (!n) hauteurAvantHistorique.current = null
  }

  function autosize(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  async function envoyer() {
    const corps = texte.trim()
    if (!corps) return
    setTexte('')
    if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.focus() }
    const ok = await sendMessage(corps)
    if (ok && onAfterSend) onAfterSend(corps)
  }

  async function reessayer(m) {
    const ok = await sendMessage(m.corps, m.id)
    if (ok && onAfterSend) onAfterSend(m.corps)
  }

  // Statut affiché seulement sous mon dernier message
  const monDernier = [...messages].reverse().find(m => m.from_id === myId)

  let jourPrecedent = null
  return (
    <div style={S.wrap}>
      <div ref={scrollRef} style={S.scroll} onScroll={() => { colleEnBas.current = auBas(); if (nouveaux && colleEnBas.current) setNouveaux(false) }}>
        {loading ? (
          <p style={S.info}>Chargement…</p>
        ) : messages.length === 0 ? (
          <div style={S.empty}>
            <Icon name="message" size={36} style={{ color: T.color.muted }} />
            <p style={{ margin: '0.6rem 0 0', fontSize: T.size.md, color: T.color.muted, lineHeight: 1.5 }}>{emptyText}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <button onClick={voirPrecedents} disabled={loadingOlder} style={S.olderBtn}>
                {loadingOlder ? 'Chargement…' : 'Voir les messages précédents'}
              </button>
            )}
            {messages.map(m => {
              const isMe = m.from_id === myId
              const jour = new Date(m.created_at).toDateString()
              const separateur = jour !== jourPrecedent
              jourPrecedent = jour
              return (
                <div key={m.id}>
                  {separateur && <div style={S.sep}><span style={S.sepLabel}>{libelleJour(m.created_at)}</span></div>}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ ...S.bubble, ...(isMe ? S.bubbleMe : S.bubbleOther), opacity: m._temp && !m._failed ? 0.7 : 1 }}>
                      <p style={S.corps}>{m.corps}</p>
                      <p style={{ ...S.heure, color: isMe ? 'rgb(255 255 255 / .7)' : T.color.muted, textAlign: 'right' }}>
                        {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {m._failed ? (
                      <button onClick={() => reessayer(m)} style={S.failed}>
                        <Icon name="alert" size={14} />Non envoyé · Réessayer
                      </button>
                    ) : isMe && m.id === monDernier?.id && (
                      <span style={S.statut}>{m._temp ? 'Envoi…' : m.lu ? 'Lu' : 'Envoyé'}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {nouveaux && (
        <button onClick={() => allerEnBas('smooth')} style={S.newPill}>
          <Icon name="arrow-down" size={14} />Nouveau message
        </button>
      )}

      <div style={S.inputBar}>
        <textarea
          ref={inputRef}
          value={texte}
          onChange={e => { setTexte(e.target.value); autosize(e.target) }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer() } }}
          onFocus={() => { colleEnBas.current = true; allerEnBas(); onFocusChange?.(true) }}
          onBlur={() => onFocusChange?.(false)}
          placeholder="Écris un message…"
          aria-label="Message"
          maxLength={500}
          rows={1}
          autoComplete="off"
          style={S.input}
        />
        <button
          onPointerDown={e => e.preventDefault()}
          onMouseDown={e => e.preventDefault()}
          onClick={envoyer}
          disabled={!texte.trim()}
          aria-label="Envoyer"
          style={{ ...S.send, background: texte.trim() ? T.color.ink : T.color.soft, color: texte.trim() ? T.color.signal : T.color.muted, cursor: texte.trim() ? 'pointer' : 'default' }}
        >
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  )
}

const S = {
  wrap:     { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: T.font.body, background: T.color.page },
  scroll:   { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.75rem 0.85rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 6, WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' },
  info:     { textAlign: 'center', color: T.color.muted, fontSize: T.size.md, padding: '2rem', margin: 0 },
  empty:    { margin: 'auto', textAlign: 'center', padding: '2rem', maxWidth: 260 },
  olderBtn: { alignSelf: 'center', minHeight: 36, padding: '0 14px', margin: '0 0 6px', borderRadius: T.radius.pill, border: `1px solid ${T.color.line}`, background: T.color.card, color: T.color.ink, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 600, cursor: 'pointer' },
  sep:      { display: 'flex', justifyContent: 'center', margin: '10px 0 6px' },
  sepLabel: { fontSize: T.size.xs, fontWeight: 600, color: T.color.muted, background: T.color.soft, padding: '3px 10px', borderRadius: T.radius.pill },
  bubble:   { maxWidth: '80%', padding: '0.5rem 0.8rem 0.4rem', borderRadius: 16 },
  bubbleMe: { background: T.color.ink, color: T.color.card, borderBottomRightRadius: 4 },
  bubbleOther: { background: T.color.card, color: T.color.ink, borderBottomLeftRadius: 4, boxShadow: T.shadow.card },
  corps:    { margin: 0, fontSize: T.size.base, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  heure:    { margin: '2px 0 0', fontSize: 11 },
  statut:   { fontSize: T.size.xs, color: T.color.muted, margin: '3px 4px 0' },
  failed:   { display: 'inline-flex', alignItems: 'center', gap: 4, margin: '4px 0 0', minHeight: 32, padding: '0 6px', background: 'none', border: 'none', color: T.color.danger, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 600, cursor: 'pointer' },
  newPill:  { position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 74, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: T.radius.pill, border: 'none', background: T.color.ink, color: T.color.signal, fontFamily: T.font.body, fontSize: T.size.sm, fontWeight: 700, boxShadow: T.shadow.float, cursor: 'pointer', zIndex: 2 },
  inputBar: { flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 12px', background: T.color.card, borderTop: `1px solid ${T.color.line}` },
  input:    { flex: 1, minHeight: T.touch, maxHeight: 120, padding: '11px 14px', border: `1.5px solid ${T.color.line}`, borderRadius: 22, background: T.color.page, color: T.color.ink, fontFamily: T.font.body, fontSize: T.size.lg, lineHeight: 1.35, resize: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' },
  send:     { width: T.touch, height: T.touch, borderRadius: '50%', border: 'none', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'background .15s' },
}
