import { createContext, useContext, useState, useRef, useEffect } from 'react'
import { sendPushOnly } from '../notifs'

const TimerCtx = createContext(null)

export function TimerProvider({ children }) {
  const [timerEndsAt, setTimerEndsAt] = useState(null) // timestamp ms
  const [timerTotal, setTimerTotal]   = useState(0)    // durée initiale (s)
  const [timerSecs, setTimerSecs]     = useState(0)    // restant (s)
  const [seanceId, setSeanceId]       = useState(null)
  const [clientIdRef] = useState({ current: null })    // ref mutable pour sendPush

  const intervalRef = useRef(null)
  const notifRef    = useRef(null)

  function startTimer(secs, cId, sId) {
    clearInterval(intervalRef.current)
    clearTimeout(notifRef.current)

    const endsAt = Date.now() + secs * 1000
    clientIdRef.current = cId
    setTimerEndsAt(endsAt)
    setTimerTotal(secs)
    setTimerSecs(secs)
    setSeanceId(sId)

    // Push notif à la fin (si l'app est en arrière-plan)
    if (cId) {
      notifRef.current = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          sendPushOnly(cId, {
            titre: '🔔 Récupération terminée',
            corps: "C'est reparti !",
            lien: `/client/seance/${sId}`,
          })
        }
      }, secs * 1000)
    }

    // Tick toutes les 500ms — on recalcule depuis endsAt pour rester précis
    // même si iOS throttle les intervals en background
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
    clearTimeout(notifRef.current)
    setTimerEndsAt(null)
    setTimerTotal(0)
    setTimerSecs(0)
  }

  // Quand l'app revient au premier plan, recalcule immédiatement le temps restant
  useEffect(() => {
    function onVisible() {
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
    clearTimeout(notifRef.current)
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
