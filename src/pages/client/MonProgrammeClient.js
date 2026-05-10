import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'

function isCycleTermine(prog) {
  if (!prog.date_debut) return false
  const fin = new Date(prog.date_debut + 'T00:00:00')
  fin.setDate(fin.getDate() + prog.semaines * 7)
  return fin < new Date()
}

export default function MonProgrammeClient() {
  const navigate = useNavigate()

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
      else navigate('/', { replace: true })
    }
    redirect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 110 }}>
      <p style={{ color: '#9ca3af', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>Chargement...</p>
      <ClientBottomNav />
    </div>
  )
}
