import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import ChatBox from '../../components/ChatBox'
import { sendPushOnly } from '../../notifs'

export default function MessagesClient() {
  const navigate = useNavigate()
  const [clientId, setClientId] = useState(null)
  const [coachId, setCoachId]   = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const userId = sess?.session?.user?.id
        if (!userId) { setLoadError(true); return }
        setClientId(userId)

        let foundCoachId = null

        // 1. Chercher le coachId dans les messages déjà reçus (le plus fiable)
        const { data: msgRecu } = await supabase
          .from('messages').select('from_id').eq('to_id', userId).limit(1)
        if (msgRecu?.length) {
          foundCoachId = msgRecu[0].from_id
        }

        // 2. Fallback : app_settings
        if (!foundCoachId) {
          const { data: setting } = await supabase
            .from('app_settings').select('value').eq('key', 'coach_user_id').maybeSingle()
          if (setting?.value) foundCoachId = setting.value
        }

        if (!foundCoachId) {
          setLoadError(true)
          return
        }
        setCoachId(foundCoachId)
      } catch (e) {
        console.error('[MessagesClient] erreur load :', e)
        setLoadError(true)
      }
    }
    load()
  }, [])

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={S.avatar}>A</div>
          <span style={S.headerTitle}>Arthur</span>
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* Zone chat : flex: 1 → prend tout l'espace restant entre header et bottom nav */}
      <div style={S.chatZone}>
        {loadError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.5rem' }}>
            <p style={{ fontSize: '1.5rem', margin: 0 }}>💬</p>
            <p style={{ fontWeight: '700', color: '#374151', margin: 0 }}>Messagerie indisponible</p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>Contacte ton coach pour activer la messagerie.</p>
          </div>
        ) : !clientId || !coachId ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p style={{ color: '#9ca3af', fontSize: '0.88rem' }}>Chargement…</p>
          </div>
        ) : (
          <ChatBox
            myId={clientId}
            otherId={coachId}
            myLabel="Moi"
            fullscreen
            onAfterSend={(msg) => sendPushOnly(coachId, {
              titre: 'Message d\'un client',
              corps: msg,
              lien: '/messages',
            })}
          />
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:       { height: '100dvh', display: 'flex', flexDirection: 'column', background: 'white', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  header:     { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  backBtn:    { background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' },
  avatar:     { width: 30, height: 30, borderRadius: '50%', background: '#e4f816', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#333333' },
  headerTitle:{ color: 'white', fontWeight: '700', fontSize: '0.95rem' },
  chatZone:   { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', paddingBottom: 65 },
}
