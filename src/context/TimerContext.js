import { createContext, useContext, useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'

const TimerCtx = createContext(null)

export function TimerProvider({ children }) {
  const [timerEndsAt, setTimerEndsAt] = useState(null) // timestamp ms
  const [timerTotal, setTimerTotal]   = useState(0)    // durée initiale (s)
  const [timerSecs, setTimerSecs]     = useState(0)    // restant (s)
  const [seanceId, setSeanceId]       = useState(null)
  const [clientIdRef] = useState({ current: null })    // ref mutable pour annulation

  const intervalRef    = useRef(null)
  const seanceIdRef    = useRef(null)
  const timerPushIdRef = useRef(null)  // id de la ligne timer_pushes en cours

  async function startTimer(secs, cId, sId) {
    clearInterval(intervalRef.current)
    // Annuler toute push serveur précédente pour ce client/séance
    if (timerPushIdRef.current) {
      supabase.from('timer_pushes').delete().eq('id', timerPushIdRef.current).then(() => {})
      timerPushIdRef.current = null
    }

    const endsAt = Date.now() + secs * 1000
    clientIdRef.current = cId
    seanceIdRef.current = sId
    setTimerEndsAt(endsAt)
    setTimerTotal(secs)
    setTimerSecs(secs)
    setSeanceId(sId)

    // ── Push serveur (fiable même si iOS tue l'app) ───────────────────────
    // Une Edge Function cron lit cette table toutes les minutes et envoie la push
    if (cId) {
      const sendAt = new Date(endsAt).toISOString()
      supabase.from('timer_pushes').insert({
        user_id:   cId,
        seance_id: sId || null,
        send_at:   sendAt,
        titre:     '🔔 Récupération terminée',
        corps:     "C'est reparti !",
        lien:      `/client/seance/${sId}`,
      }).select('id').single().then(({ data }) => {
        if (data?.id) timerPushIdRef.current = data.id
      })
    }

    // Tick toutes les 500ms — recalcule depuis endsAt pour rester précis
    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
      setTimerSecs(remaining)
      if (remaining === 0) {
        clearInterval(intervalRef.current)
        if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300])
      }
    }, 500)
  }

  function stopTimer() {
    clearInterval(intervalRef.current)
    // Annuler la push serveur si le chrono est arrêté manuellement
    if (timerPushIdRef.current) {
      supabase.from('timer_pushes').delete().eq('id', timerPushIdRef.current).then(() => {})
      timerPushIdRef.current = null
    }
    setTimerEndsAt(null)
    setTimerTotal(0)
    setTimerSecs(0)
  }

  // Quand l'app revient au premier plan, recalcule le temps restant
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (!timerEndsAt) return
      const remaining = Math.max(0, Math.round((timerEndsAt - Date.now()) / 1000))
      setTimerSecs(remaining)
      if (remaining === 0) {
        clearInterval(intervalRef.current)
        stopTimer()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerEndsAt])

  useEffect(() => () => {
    clearInterval(intervalRef.current)
  }, [])

  const isRunning = timerEndsAt !== null && timerSecs > 0
  const isDone    = timerEndsAt !== null && timerSecs === 0

  return (
    <TimerCtx.Provider value={{ timerSecs, timerTotal, isRunning, isDone, seanceId, startTimer, stopTimer }}>
      {children}
    </TimerCtx.Provider>
  )
}

export const useTimer = () => useContext(TimerCtx)
