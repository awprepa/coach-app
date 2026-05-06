import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'

const COACH_EMAIL = 'wehrey.arthur@gmail.com' 

export default function AuthGate({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()
    const { data: listener } = supabase.auth.onAuthStateChange(() => checkUser())
    return () => listener.subscription.unsubscribe()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    const publicPaths = ['/login']

    if (!user) {
      if (!publicPaths.includes(location.pathname)) navigate('/login')
    } else if (user.email === COACH_EMAIL) {
      if (location.pathname === '/login') navigate('/')
    } else {
      if (!location.pathname.startsWith('/client/')) navigate('/client/accueil')
    }
    setLoading(false)
  }

  if (loading) return <p>Chargement...</p>
  return children
}