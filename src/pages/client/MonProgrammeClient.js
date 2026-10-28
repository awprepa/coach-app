import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'
import usePageFade from '../../hooks/usePageFade'
import T from '../../theme/tokens'
import EnTeteClient from '../../components/EnTeteClient'
import useEtatMemorise from '../../hooks/useEtatMemorise'

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

  const [derniere, setDerniere] = useEtatMemorise('monprogramme.destination', null)

  useEffect(() => {
    // Onglet déjà ouvert il y a peu : on va directement au programme
    if (derniere && Date.now() - derniere.at < 10 * 60 * 1000) { navigate(derniere.chemin, { replace: true }); return }
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

      const list = progs || []
      const vraisActifs = list.filter(p => p.date_debut && !isCycleTermine(p))
      const todayD = new Date()
      const dejaCommence = vraisActifs.filter(p => new Date(p.date_debut + 'T00:00:00') <= todayD)
      const active = dejaCommence.length > 0 ? dejaCommence[0]
        : vraisActifs.length > 0 ? vraisActifs[0]
        : list.find(p => !p.date_debut)
      if (active) {
        setDerniere({ chemin: `/client/programme/${active.id}`, at: Date.now() })
        navigate(`/client/programme/${active.id}`, { replace: true })
      }
      else setNoProg(true)
    }
    redirect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!noProg) return <PageLoading entete />

  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <EnTeteClient titre="Mon programme" />
      <div style={S.content}>
        <div style={S.emptyCard}>
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
  page: { background: T.color.page, minHeight: '100vh', fontFamily: T.font.body, color: T.color.ink },
  header: {
    background: T.color.headerBg,
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'sticky', top: 0, zIndex: 60,
  },
  headerTitle: { fontFamily: T.font.display, fontSize: T.size.xl, fontWeight: 700, color: T.color.onDark },
  content: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 130px)', padding: '1.5rem' },
  emptyCard: {
    ...T.card, padding: '2.5rem 2rem',
    textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
    maxWidth: 320,
  },
  emptyTitle: { fontFamily: T.font.display, fontWeight: 700, fontSize: T.size.xl, color: T.color.ink, margin: '0.5rem 0 0' },
  emptyText: { fontSize: T.size.md, color: T.color.muted, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' },
}
