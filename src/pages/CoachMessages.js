import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Conversation from '../components/Conversation'
import { sendPushOnly } from '../notifs'
import ClientPicker from '../components/ClientPicker'
import Icon from '../components/Icon'
import T from '../theme/tokens'

function useEstMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 820)
  useEffect(() => {
    const on = () => setM(window.innerWidth <= 820)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return m
}

function heureCourte(iso) {
  const d = new Date(iso)
  const auj = new Date()
  if (d.toDateString() === auj.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const hier = new Date(); hier.setDate(auj.getDate() - 1)
  if (d.toDateString() === hier.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function CoachMessages() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const estMobile = useEstMobile()
  const [coachId, setCoachId]         = useState(null)
  const [conversations, setConversations] = useState([]) // [{ clientId, ficheId, nom, prenom, lastMsg, lastAt, lastFromMe, unread }]
  const [selected, setSelected]       = useState(() => params.get('c'))
  const [newConvExclude, setNewConvExclude] = useState(new Set())
  const [showNew, setShowNew]         = useState(false)
  const [recherche, setRecherche]     = useState('')
  const [loading, setLoading]         = useState(true)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const loadConversations = useCallback(async (cId) => {
    const id = cId || coachId
    if (!id) return

    // Récupérer tous les messages impliquant le coach
    const { data: msgs } = await supabase
      .from('messages')
      .select('from_id, to_id, corps, created_at, lu')
      .or(`from_id.eq.${id},to_id.eq.${id}`)
      .order('created_at', { ascending: false })

    if (!msgs?.length) { setConversations(prev => prev.filter(c => !c.lastMsg)); return }

    // Grouper par interlocuteur
    const byClient = {}
    for (const m of msgs) {
      const partnerId = m.from_id === id ? m.to_id : m.from_id
      if (!byClient[partnerId]) {
        byClient[partnerId] = { lastMsg: m.corps, lastAt: m.created_at, lastFromMe: m.from_id === id, unread: 0 }
      }
      // Non-lus reçus par le coach (la conversation ouverte est lue en direct)
      if (m.to_id === id && !m.lu && partnerId !== selectedRef.current) byClient[partnerId].unread++
    }

    const clientIds = Object.keys(byClient)
    const { data: clients } = await supabase
      .from('clients')
      .select('id, user_id, nom, prenom')
      .in('user_id', clientIds)

    const clientMap = {}
    for (const c of clients || []) clientMap[c.user_id] = c

    setConversations(prev => {
      const liste = clientIds.map(cid => ({
        clientId: cid,
        ficheId:  clientMap[cid]?.id || null,
        nom:      clientMap[cid]?.nom   || 'Inconnu',
        prenom:   clientMap[cid]?.prenom || '',
        ...byClient[cid],
      }))
      // Garder les nouvelles conversations encore vides
      const vides = prev.filter(c => !c.lastMsg && !byClient[c.clientId])
      return [...vides, ...liste]
    })
  }, [coachId])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCoachId(user.id)
      await loadConversations(user.id)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Liste à jour en temps réel (nouveau message reçu ou envoyé)
  useEffect(() => {
    if (!coachId) return
    const ch = supabase.channel('coach-messages-liste')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadConversations())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [coachId, loadConversations])

  // Lien direct depuis une notification : /messages?c=<user_id>
  useEffect(() => {
    const c = params.get('c')
    if (c && c !== selected) setSelected(c)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  async function openNewConv() {
    // Exclure les clients sans compte (user_id null) et ceux qui ont déjà une conversation
    const { data: clients } = await supabase.from('clients').select('id, user_id')
    const existingIds = new Set(conversations.map(c => c.clientId))
    const exclude = new Set((clients || []).filter(c => !c.user_id || existingIds.has(c.user_id)).map(c => c.id))
    setNewConvExclude(exclude)
    setShowNew(v => !v)
  }

  function selectConversation(clientId) {
    setSelected(clientId)
    setShowNew(false)
    setParams(clientId ? { c: clientId } : {}, { replace: true })
    setConversations(prev => prev.map(c => c.clientId === clientId ? { ...c, unread: 0 } : c))
  }

  function startNewConv(c) {
    setConversations(prev => {
      if (prev.some(x => x.clientId === c.user_id)) return prev
      return [{ clientId: c.user_id, ficheId: c.id, nom: c.nom, prenom: c.prenom, lastMsg: '', lastAt: new Date().toISOString(), unread: 0 }, ...prev]
    })
    selectConversation(c.user_id)
  }

  const q = recherche.trim().toLowerCase()
  const visibles = conversations
    .filter(c => !q || `${c.prenom} ${c.nom}`.toLowerCase().includes(q))
    .sort((a, b) => (b.unread > 0) - (a.unread > 0) || new Date(b.lastAt) - new Date(a.lastAt))
  const selectedConv = conversations.find(c => c.clientId === selected)
  const totalNonLus = conversations.reduce((s, c) => s + c.unread, 0)

  if (loading) return (
    <div style={S.page}><p style={{ textAlign: 'center', color: T.color.muted, padding: '4rem' }}>Chargement…</p></div>
  )

  const liste = (
    <aside style={{ ...S.sidebar, ...(estMobile ? S.sidebarMobile : {}) }}>
      <div style={S.sideHeader}>
        <h1 style={S.sideTitle}>Messagerie{totalNonLus > 0 && <span style={S.titreBadge}>{totalNonLus}</span>}</h1>
        <button onClick={openNewConv} style={S.newBtn} aria-expanded={showNew}>
          <Icon name="plus" size={16} />Nouveau
        </button>
      </div>

      {showNew && (
        <div style={S.newPanel}>
          <p style={S.newLabel}>Écrire à :</p>
          <ClientPicker
            clientFields="id, user_id, prenom, nom"
            excludeIds={newConvExclude}
            onChange={(_, c) => c && startNewConv(c)}
            placeholder="Choisir un client…"
          />
        </div>
      )}

      <div style={S.searchWrap}>
        <Icon name="search" size={16} style={{ color: T.color.muted }} />
        <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un client" aria-label="Rechercher un client" style={S.search} />
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visibles.length === 0 && (
          <p style={{ padding: '1.5rem 1rem', color: T.color.muted, fontSize: T.size.md, textAlign: 'center', margin: 0 }}>
            {q ? 'Aucun client trouvé.' : 'Aucune conversation. Clique sur « Nouveau » pour en démarrer une.'}
          </p>
        )}
        {visibles.map(c => {
          const actif = selected === c.clientId
          return (
            <button key={c.clientId} onClick={() => selectConversation(c.clientId)}
              style={{ ...S.convItem, ...(actif && !estMobile ? S.convItemActive : {}) }} aria-current={actif ? 'true' : undefined}>
              <span style={S.convAvatar}>{(c.prenom?.[0] || c.nom?.[0] || '?').toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={S.convTop}>
                  <span style={{ ...S.convName, fontWeight: c.unread > 0 ? 700 : 600 }}>{c.prenom} {c.nom}</span>
                  <span style={S.convTime}>{c.lastMsg ? heureCourte(c.lastAt) : ''}</span>
                </span>
                <span style={S.convBottom}>
                  <span style={{ ...S.convLast, color: c.unread > 0 ? T.color.ink : T.color.muted, fontWeight: c.unread > 0 ? 600 : 400 }}>
                    {c.lastMsg ? `${c.lastFromMe ? 'Toi : ' : ''}${c.lastMsg}` : 'Nouvelle conversation'}
                  </span>
                  {c.unread > 0 && <span style={S.badge} aria-label={`${c.unread} non lus`}>{c.unread}</span>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )

  const fil = (
    <section style={S.main}>
      {!selected ? (
        <div style={S.emptyState}>
          <Icon name="message" size={36} style={{ color: T.color.muted }} />
          <p style={{ fontWeight: 700, color: T.color.ink, margin: '0.6rem 0 0.25rem' }}>Choisis une conversation</p>
          <p style={{ color: T.color.muted, fontSize: T.size.md, margin: 0 }}>Ou clique sur « Nouveau » pour écrire à un client.</p>
        </div>
      ) : (
        <>
          <div style={S.chatHeader}>
            {estMobile && (
              <button onClick={() => selectConversation(null)} style={S.backBtn} aria-label="Retour aux conversations">
                <Icon name="chevron-right" size={20} style={{ transform: 'rotate(180deg)' }} />
              </button>
            )}
            <span style={S.chatAvatar}>{(selectedConv?.prenom?.[0] || selectedConv?.nom?.[0] || '?').toUpperCase()}</span>
            <span style={S.chatName}>{selectedConv ? `${selectedConv.prenom} ${selectedConv.nom}` : '…'}</span>
            {selectedConv?.ficheId && (
              <button onClick={() => navigate(`/client/${selectedConv.ficheId}`)} style={S.ficheBtn}>
                <Icon name="user" size={16} />Fiche
              </button>
            )}
          </div>
          {coachId && (
            <Conversation
              key={selected}
              myId={coachId}
              otherId={selected}
              emptyText="Aucun message. Écris le premier."
              onAfterSend={msg => {
                sendPushOnly(selected, { titre: 'Message de Arthur', corps: msg, lien: '/client/messages' })
              }}
            />
          )}
        </>
      )}
    </section>
  )

  return (
    <div style={S.page}>
      <div style={{ ...S.layout, ...(estMobile ? S.layoutMobile : {}) }}>
        {estMobile ? (selected ? fil : liste) : <>{liste}{fil}</>}
      </div>
    </div>
  )
}

const S = {
  page:       { background: T.color.page, fontFamily: T.font.body, color: T.color.ink, padding: '1.25rem' },
  layout:     { display: 'flex', gap: '1rem', maxWidth: 1180, margin: '0 auto', height: 'calc(100dvh - 60px - 2.5rem)' },
  layoutMobile: { height: 'calc(100dvh - 60px - 2.5rem)' },
  sidebar:    { width: 320, flexShrink: 0, background: T.color.card, borderRadius: T.radius.card, boxShadow: T.shadow.card, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  sidebarMobile: { width: '100%' },
  sideHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1rem 0.6rem' },
  sideTitle:  { display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: T.size.xxl, color: T.color.ink },
  titreBadge: { fontFamily: T.font.body, fontSize: T.size.xs, fontWeight: 700, background: T.color.signal, color: T.color.ink, borderRadius: T.radius.pill, padding: '2px 8px' },
  newBtn:     { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', background: T.color.ink, color: T.color.signal, border: 'none', borderRadius: T.radius.control, fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 700, cursor: 'pointer' },
  newPanel:   { padding: '0.75rem 1rem', borderTop: `1px solid ${T.color.line}`, background: T.color.page },
  newLabel:   { fontSize: T.size.sm, color: T.color.muted, margin: '0 0 0.5rem', fontWeight: 600 },
  searchWrap: { display: 'flex', alignItems: 'center', gap: 8, margin: '0.25rem 1rem 0.6rem', padding: '0 12px', minHeight: 40, borderRadius: T.radius.control, border: `1.5px solid ${T.color.line}`, background: T.color.card },
  search:     { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: T.font.body, fontSize: T.size.md, color: T.color.ink },
  convItem:   { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '10px 1rem', background: T.color.card, border: 'none', borderTop: `1px solid ${T.color.soft}`, cursor: 'pointer', textAlign: 'left', fontFamily: T.font.body },
  convItemActive: { background: T.color.page, boxShadow: `inset 3px 0 0 ${T.color.ink}` },
  convAvatar: { width: 40, height: 40, borderRadius: '50%', background: T.color.ink, color: T.color.signal, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: T.size.md, flexShrink: 0 },
  convTop:    { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  convName:   { fontSize: T.size.base, color: T.color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  convTime:   { fontSize: T.size.xs, color: T.color.muted, flexShrink: 0 },
  convBottom: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 },
  convLast:   { flex: 1, minWidth: 0, fontSize: T.size.md, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge:      { background: T.color.signal, color: T.color.ink, borderRadius: T.radius.pill, fontSize: T.size.xs, fontWeight: 700, minWidth: 20, height: 20, padding: '0 6px', display: 'grid', placeItems: 'center', flexShrink: 0 },
  main:       { flex: 1, minWidth: 0, background: T.color.card, borderRadius: T.radius.card, boxShadow: T.shadow.card, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem' },
  chatHeader: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 60, padding: '8px 12px 8px 16px', borderBottom: `1px solid ${T.color.line}`, background: T.color.card, flexShrink: 0 },
  backBtn:    { width: T.touch, height: T.touch, marginLeft: -8, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: T.color.ink, cursor: 'pointer', flexShrink: 0 },
  chatAvatar: { width: 36, height: 36, borderRadius: '50%', background: T.color.ink, color: T.color.signal, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: T.size.sm, flexShrink: 0 },
  chatName:   { flex: 1, minWidth: 0, fontFamily: T.font.display, fontWeight: 700, fontSize: T.size.xl, color: T.color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ficheBtn:   { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 12px', background: T.color.card, color: T.color.ink, border: `1.5px solid ${T.color.line}`, borderRadius: T.radius.control, fontFamily: T.font.body, fontSize: T.size.md, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
}
