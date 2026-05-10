import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import ChatBox from '../../components/ChatBox'
import { sendNotif } from '../../notifs'

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
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={S.headerTitle}>💬 Messages</span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        {loadError ? (
          <div style={{ background: 'white', borderRadius: 14, padding: '2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>💬</p>
            <p style={{ fontWeight: '700', color: '#374151', margin: '0 0 0.25rem' }}>Messagerie indisponible</p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Contacte ton coach pour activer la messagerie.</p>
          </div>
        ) : !clientId || !coachId ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem', fontSize: '0.88rem' }}>Chargement…</p>
        ) : (
          <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '0.75rem 1rem', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#333333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#e4f816' }}>C</div>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#333' }}>Votre coach</p>
            </div>
            <ChatBox
              myId={clientId}
              otherId={coachId}
              myLabel="Moi"
              onAfterSend={() => sendNotif(coachId, {
                titre: '💬 Message d\'un client',
                corps: 'Tu as reçu un nouveau message',
                type: 'info',
                lien: '/',
              })}
            />
          </div>
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:      { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:     { background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' },
  headerTitle: { color: 'white', fontWeight: '800', fontSize: '1rem' },
  content:     { padding: '1rem' },
}
