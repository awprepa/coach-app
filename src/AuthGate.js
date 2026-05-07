import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const COACH_EMAIL = 'wehrey.arthur@gmail.com' 

export default function AuthGate({ children }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      const path = window.location.pathname

      if (!user) {
        if (path !== '/login') navigate('/login')
      } else if (user.email === COACH_EMAIL) {
        if (path === '/login') navigate('/')
      } else {
        if (!path.startsWith('/client/')) navigate('/client/accueil')
      }
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <p>Chargement...</p>
  return children
}