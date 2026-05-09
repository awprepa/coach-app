import { useNavigate } from 'react-router-dom'
import { useNotifCtx } from '../../context/NotifContext'
import ClientBottomNav from '../../components/ClientBottomNav'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Il y a ${days}j`
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function typeIcon(type) {
  if (type === 'wellness')   return '💪'
  if (type === 'seance')     return '📋'
  if (type === 'programme')  return '🏋️'
  return '🔔'
}

export default function NotificationsClient() {
  const navigate = useNavigate()
  const { notifs, unread, markRead, markAllRead } = useNotifCtx()

  async function handleClick(notif) {
    if (!notif.lu) await markRead(notif.id)
    navigate(notif.lien || '/')
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>←</button>
        <h1 style={S.title}>Notifications</h1>
        {unread > 0 && (
          <button onClick={markAllRead} style={S.markAllBtn}>Tout marquer lu</button>
        )}
        {unread === 0 && <div style={{ width: 90 }} />}
      </div>

      {/* Liste */}
      <div style={S.list}>
        {notifs.length === 0 ? (
          <div style={S.empty}>
            <span style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔔</span>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Aucune notification</p>
          </div>
        ) : (
          notifs.map(notif => (
            <div key={notif.id} onClick={() => handleClick(notif)} style={{ ...S.item, background: notif.lu ? '#f9fafb' : 'white' }}>
              <span style={S.icon}>{typeIcon(notif.type)}</span>
              <div style={S.itemContent}>
                <p style={{ ...S.itemTitle, fontWeight: notif.lu ? '500' : '700' }}>{notif.titre}</p>
                {notif.corps && <p style={S.itemBody}>{notif.corps}</p>}
                <p style={S.itemDate}>{timeAgo(notif.created_at)}</p>
              </div>
              {!notif.lu && <span style={S.dot} />}
            </div>
          ))
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:      { background: 'white', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 10 },
  backBtn:     { background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#333', padding: '0.25rem 0.5rem', borderRadius: 8 },
  title:       { fontSize: '1rem', fontWeight: '700', color: '#333', margin: 0 },
  markAllBtn:  { background: 'none', border: 'none', color: '#6366f1', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', padding: '0.25rem 0' },
  list:        { padding: '0.75rem' },
  empty:       { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', textAlign: 'center' },
  item:        { display: 'flex', alignItems: 'flex-start', gap: '0.875rem', padding: '1rem 1.1rem', borderRadius: 14, marginBottom: '0.5rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  icon:        { fontSize: '1.4rem', flexShrink: 0, marginTop: 2 },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle:   { fontSize: '0.9rem', color: '#333', margin: '0 0 0.2rem' },
  itemBody:    { fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.3rem', lineHeight: 1.4 },
  itemDate:    { fontSize: '0.72rem', color: '#9ca3af', margin: 0 },
  dot:         { width: 8, height: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0, marginTop: 6 },
}
