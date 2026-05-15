import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'

const COACH_EMAIL = 'wehrey.arthur@gmail.com'

// Chemins publics (accessibles sans auth, jamais redirigés)
const PUBLIC_PATHS = ['/login', '/reset-password']

function redirect(navigate, user, path) {
  // Ne jamais rediriger depuis les pages publiques (login, reset-password)
  if (PUBLIC_PATHS.includes(path)) {
    // Si connecté normalement et pas en train de réinitialiser → rediriger vers l'app
    // (mais seulement sur /login, pas /reset-password qui doit rester accessible)
    if (user && path === '/login') {
      if (user.email === COACH_EMAIL) navigate('/')
      else navigate('/client/accueil')
    }
    return
  }
  if (!user) {
    navigate('/login')
  } else if (user.email === COACH_EMAIL) {
    // coach : OK partout sauf /client/*
  } else {
    // Client : OK sur /client/*, / → accueil client sinon
    if (!path.startsWith('/client/') && path !== '/') navigate('/client/accueil')
  }
}

export default function AuthGate({ children }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Si on est sur /reset-password → ne rien faire, laisser la page gérer
    if (window.location.pathname === '/reset-password') {
      setLoading(false)
      return
    }

    // 1. Vérifier la session existante d'abord (évite le flash /login sur deep link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      redirect(navigate, session?.user, window.location.pathname)
      setLoading(false)
    })

    // 2. Écouter les changements (logout, token refresh…)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Ne pas rediriger lors du premier INITIAL_SESSION (déjà géré par getSession)
      if (_event === 'INITIAL_SESSION') return
      // Flux de récupération → la page /reset-password gère elle-même
      if (_event === 'PASSWORD_RECOVERY') return
      redirect(navigate, session?.user, window.location.pathname)
    })

    return () => listener.subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return null
  return children
}
