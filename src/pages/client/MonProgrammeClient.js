import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'
import usePageFade from '../../hooks/usePageFade'

function isCycleTermine(prog) {
  if (!prog.date_debut) return false
  const fin = new Date(prog.date_debut + 'T00:00:00')
  fin.setDate(fin.getDate() + prog.semaines * 7)
  return fin < new Date()
}

export default function MonProgrammeClient() {
  const navigate = useNavigate()
  const fadeStyle = usePageFade()
  const [noProg, setNoProg] = useState(false)

  useEffect(() => {
    async function redirect() {
      const { data } = await supabase.auth.getSession()
      const userId = data?.session?.user?.id
      if (!userId) { navigate('/login'); return }

      const { data: client } = await supabase
        .from('clients').select('id').eq('user_id', userId).maybeSingle()
      if (!client) { navigate('/'); return }

      const { data: progs } = await supabase
        .from('programmes').select('id, date_debut, semaines')
        .eq('client_id', client.id).order('created_at', { ascending: false })

      const active = (progs || []).find(p => !isCycleTermine(p))
      if (active) navigate(`/client/programme/${active.id}`, { replace: true })
      else setNoProg(true)
    }
    redirect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!noProg) return <PageLoading />

  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <div style={S.header}>
        <span style={S.headerTitle}>Mon programme</span>
      </div>
      <div style={S.content}>
        <div style={S.emptyCard}>
          <span style={{ fontSize: '3rem' }}>📋</span>
          <p style={S.emptyTitle}>Aucun programme assigné</p>
          <p style={S.emptyText}>
            Ton coach n'a pas encore créé de programme pour toi.{'\n'}
            Il apparaîtra ici dès qu'il sera disponible.
          </p>
        </div>
      </div>
      <ClientBottomNav />
    </div>
  )
}

const S = {
  page: { background: '#f5f5f5', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: {
    background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'sticky', top: 0, zIndex: 60,
  },
  headerTitle: { fontSize: '1.05rem', fontWeight: 800, color: 'white' },
  content: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 130px)', padding: '1.5rem' },
  emptyCard: {
    background: 'white', borderRadius: 20, padding: '2.5rem 2rem',
    textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    maxWidth: 320,
  },
  emptyTitle: { fontWeight: 800, fontSize: '1.05rem', color: '#1a1a1a', margin: '0.5rem 0 0' },
  emptyText: { fontSize: '0.85rem', color: '#9ca3af', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' },
}
