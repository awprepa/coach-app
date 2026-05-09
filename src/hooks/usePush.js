import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY

export function usePush() {
  const [permission, setPermission] = useState(Notification.permission)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub)
      })
    })
  }, [])

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return false
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('push_subscriptions').upsert([{
          user_id: user.id,
          subscription: sub.toJSON()
        }], { onConflict: 'user_id' })
      }
      setPermission('granted')
      setSubscribed(true)
      return true
    } catch {
      setPermission('denied')
      return false
    }
  }

  async function requestAndSubscribe() {
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm === 'granted') return subscribe()
    return false
  }

  return { permission, subscribed, requestAndSubscribe }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}
