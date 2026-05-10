import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const COACH_EMAIL = 'wehrey.arthur@gmail.com'

function redirect(navigate, user, path) {
  if (!user) {
    if (path !== '/login') navigate('/login')
  } else if (user.email === COACH_EMAIL) {
    if (path === '/login') navigate('/')
  } else {
    // Client : OK sur /client/*, sur / ou sur /login → accueil client
    if (!path.startsWith('/client/') && path !== '/') navigate('/client/accueil')
    if (path === '/login') navigate('/client/accueil')
  }
}

export default function AuthGate({ children }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Vérifier la session existante d'abord (évite le flash /login sur deep link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      redirect(navigate, session?.user, window.location.pathname)
      setLoading(false)
    })

    // 2. Écouter les changements (logout, token refresh…)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Ne pas rediriger lors du premier INITIAL_SESSION (déjà géré par getSession)
      if (_event === 'INITIAL_SESSION') return
      redirect(navigate, session?.user, window.location.pathname)
    })

    return () => listener.subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return null
  return children
}
