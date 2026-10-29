import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import CoachNav from '../CoachNav'
import Dashboard from './Dashboard'

const COACH_EMAIL = 'wehrey.arthur@gmail.com'

export default function Home() {
  const [role, setRole] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data?.session?.user?.email
      setRole(email === COACH_EMAIL ? 'coach' : 'client')
    })
  }, [])

  if (!role) return null

  if (role === 'coach') return (
    <>
      <CoachNav />
      <Dashboard />
    </>
  )

  // Client : l'accueil est affiché par les onglets gardés ouverts (OngletsClient, App.js)
  return null
}
