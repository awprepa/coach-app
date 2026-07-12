import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import ChatBox from '../components/ChatBox'
import { sendPushOnly } from '../notifs'

export default function CoachMessages() {
  const [coachId, setCoachId]         = useState(null)
  const [conversations, setConversations] = useState([]) // [{ clientId, nom, prenom, lastMsg, lastAt, unread }]
  const [selected, setSelected]       = useState(null)   // clientId sélectionné
  const [allClients, setAllClients]   = useState([])     // pour démarrer une nouvelle conv
  const [showNew, setShowNew]         = useState(false)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCoachId(user.id)
      await loadConversations(user.id)
      setLoading(false)
    }
    init()
  }, [])

  const loadConversations = useCallback(async (cId) => {
    const id = cId || coachId
    if (!id) return

    // Récupérer tous les messages impliquant le coach
    const { data: msgs } = await supabase
      .from('messages')
      .select('from_id, to_id, corps, created_at, lu')
      .or(`from_id.eq.${id},to_id.eq.${id}`)
      .order('created_at', { ascending: false })

    if (!msgs?.length) { setConversations([]); return }

    // Grouper par interlocuteur
    const byClient = {}
    for (const m of msgs) {
      const partnerId = m.from_id === id ? m.to_id : m.from_id
      if (!byClient[partnerId]) {
        byClient[partnerId] = { lastMsg: m.corps, lastAt: m.created_at, unread: 0 }
      }
      // Compter non-lus reçus par le coach
      if (m.to_id === id && !m.lu) byClient[partnerId].unread++
    }

    // Récupérer les infos clients
    const clientIds = Object.keys(byClient)
    const { data: clients } = await supabase
      .from('clients')
      .select('user_id, nom, prenom')
      .in('user_id', clientIds)

    const clientMap = {}
    for (const c of clients || []) clientMap[c.user_id] = c

    const convList = clientIds
      .map(cid => ({
        clientId: cid,
        nom:      clientMap[cid]?.nom   || 'Inconnu',
        prenom:   clientMap[cid]?.prenom || '',
        lastMsg:  byClient[cid].lastMsg,
        lastAt:   byClient[cid].lastAt,
        unread:   byClient[cid].unread,
      }))
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))

    setConversations(convList)
  }, [coachId])

  async function openNewConv() {
    // Charger tous les clients qui n'ont pas encore de conversation
    const { data: clients } = await supabase.from('clients').select('user_id, nom, prenom').not('user_id', 'is', null)
    const existingIds = new Set(conversations.map(c => c.clientId))
    setAllClients((clients || []).filter(c => !existingIds.has(c.user_id)))
    setShowNew(true)
  }

  function selectConversation(clientId) {
    setSelected(clientId)
    setShowNew(false)
    // Marquer comme lu localement
    setConversations(prev => prev.map(c => c.clientId === clientId ? { ...c, unread: 0 } : c))
  }

  function startNewConv(clientId, nom, prenom) {
    // Ajouter à la liste si pas encore présente
    setConversations(prev => {
      if (prev.some(c => c.clientId === clientId)) return prev
      return [{ clientId, nom, prenom, lastMsg: '', lastAt: new Date().toISOString(), unread: 0 }, ...prev]
    })
    setSelected(clientId)
    setShowNew(false)
  }

  const selectedConv = conversations.find(c => c.clientId === selected)

  if (loading) return (
    <div style={S.page}>
      <p style={{ textAlign: 'center', color: '#9ca3af', padding: '4rem' }}>Chargement…</p>
    </div>
  )

  return (
    <div style={S.page}>
      {/* Adaptations mobile — aucune règle au-dessus de 820px */}
      <style>{`
        @media (max-width: 820px){
          .cm-layout{flex-direction:column !important;height:auto !important;}
          .cm-sidebar{width:100% !important;max-height:38vh;}
          .cm-main{min-height:55vh;}
        }
      `}</style>
      <div style={S.layout} className="cm-layout">
        {/* Colonne gauche — liste des conversations */}
        <div style={S.sidebar} className="cm-sidebar">
          <div style={S.sideHeader}>
            <span style={S.sideTitle}>💬 Messagerie</span>
            <button onClick={openNewConv} style={S.newBtn} title="Nouvelle conversation">＋</button>
          </div>

          {showNew && allClients.length > 0 && (
            <div style={S.newPanel}>
              <p style={S.newLabel}>Démarrer une conversation avec :</p>
              {allClients.map(c => (
                <button key={c.user_id} onClick={() => startNewConv(c.user_id, c.nom, c.prenom)} style={S.newClientBtn}>
                  {c.prenom} {c.nom}
                </button>
              ))}
            </div>
          )}
          {showNew && allClients.length === 0 && (
            <p style={{ padding: '0.75rem 1rem', color: '#9ca3af', fontSize: '0.8rem' }}>Tous les clients ont déjà une conversation.</p>
          )}

          {conversations.length === 0 && !showNew && (
            <p style={{ padding: '1rem', color: '#9ca3af', fontSize: '0.82rem', textAlign: 'center' }}>Aucune conversation.<br />Cliquez sur ＋ pour en démarrer une.</p>
          )}

          {conversations.map(c => (
            <button
              key={c.clientId}
              onClick={() => selectConversation(c.clientId)}
              style={{ ...S.convItem, ...(selected === c.clientId ? S.convItemActive : {}) }}
            >
              <div style={S.convAvatar}>{(c.prenom?.[0] || c.nom?.[0] || '?').toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={S.convName}>{c.prenom} {c.nom}</span>
                  {c.unread > 0 && <span style={S.badge}>{c.unread}</span>}
                </div>
                <p style={S.convLast}>{c.lastMsg || <em>Nouvelle conversation</em>}</p>
                {c.lastAt && (
                  <p style={S.convTime}>
                    {new Date(c.lastAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    {' '}
                    {new Date(c.lastAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Zone principale — ChatBox */}
        <div style={S.main} className="cm-main">
          {!selected ? (
            <div style={S.emptyState}>
              <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>💬</p>
              <p style={{ fontWeight: '700', color: '#374151', margin: '0 0 0.25rem' }}>Sélectionnez une conversation</p>
              <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Ou cliquez sur ＋ pour en démarrer une nouvelle.</p>
            </div>
          ) : (
            <>
              <div style={S.chatHeader}>
                <div style={S.chatAvatar}>
                  {(selectedConv?.prenom?.[0] || selectedConv?.nom?.[0] || '?').toUpperCase()}
                </div>
                <span style={S.chatName}>{selectedConv?.prenom} {selectedConv?.nom}</span>
              </div>
              {coachId && selected && (
                <ChatBox
                  key={selected}
                  myId={coachId}
                  otherId={selected}
                  myLabel="Coach"
                  onAfterSend={(msg) => {
                    sendPushOnly(selected, {
                      titre: 'Message de Arthur',
                      corps: msg,
                      lien: '/client/messages',
                    })
                    // Rafraîchir la liste des conversations pour mettre à jour le lastMsg
                    setTimeout(() => loadConversations(), 1000)
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const S = {
  page: {
    minHeight: '100vh',
    background: '#f0f0f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: '1.5rem',
  },
  layout: {
    display: 'flex',
    gap: '1rem',
    maxWidth: 1100,
    margin: '0 auto',
    height: 'calc(100vh - 120px)',
  },
  sidebar: {
    width: 280,
    flexShrink: 0,
    background: 'white',
    borderRadius: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  sideHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem',
    borderBottom: '1px solid #f3f4f6',
  },
  sideTitle: {
    fontWeight: '800',
    fontSize: '1rem',
    color: '#333',
  },
  newBtn: {
    background: '#333',
    color: '#e4f816',
    border: 'none',
    borderRadius: 8,
    width: 30,
    height: 30,
    fontSize: '1.1rem',
    fontWeight: '800',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  newPanel: {
    padding: '0.75rem',
    borderBottom: '1px solid #f3f4f6',
    background: '#f9fafb',
  },
  newLabel: {
    fontSize: '0.78rem',
    color: '#6b7280',
    margin: '0 0 0.5rem',
    fontWeight: '600',
  },
  newClientBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '0.4rem 0.6rem',
    fontSize: '0.83rem',
    cursor: 'pointer',
    marginBottom: '0.25rem',
    color: '#333',
    fontWeight: '600',
  },
  convItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    padding: '0.75rem 1rem',
    background: 'white',
    border: 'none',
    borderBottom: '1px solid #f3f4f6',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  convItemActive: {
    background: '#f0fdf4',
    borderLeft: '3px solid #333',
  },
  convAvatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#333',
    color: '#e4f816',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '0.85rem',
    flexShrink: 0,
  },
  convName: {
    fontWeight: '700',
    fontSize: '0.88rem',
    color: '#333',
  },
  convLast: {
    margin: '0.1rem 0 0',
    fontSize: '0.76rem',
    color: '#9ca3af',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 170,
  },
  convTime: {
    margin: '0.15rem 0 0',
    fontSize: '0.7rem',
    color: '#d1d5db',
  },
  badge: {
    background: '#e4f816',
    color: '#333',
    borderRadius: '999px',
    fontSize: '0.65rem',
    fontWeight: '800',
    padding: '1px 6px',
  },
  main: {
    flex: 1,
    background: 'white',
    borderRadius: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.75rem 1rem',
    background: '#f9fafb',
    borderBottom: '1px solid #f3f4f6',
  },
  chatAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: '#333',
    color: '#e4f816',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '0.75rem',
  },
  chatName: {
    fontWeight: '700',
    fontSize: '0.9rem',
    color: '#333',
  },
}
