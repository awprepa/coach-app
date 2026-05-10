import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY

export function usePush() {
  const [permission, setPermission] = useState(Notification.permission)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) return
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(async sub => {
        if (sub) {
          setSubscribed(true)
          // Vérifier que la subscription est bien enregistrée en base (peut être perdue après update SW)
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: existing } = await supabase
              .from('push_subscriptions').select('id').eq('user_id', user.id)
            if (!existing?.length) {
              // Subscription présente dans le browser mais absente en base → re-sauvegarder
              await supabase.from('push_subscriptions').upsert([{
                user_id: user.id,
                subscription: sub.toJSON()
              }], { onConflict: 'user_id' })
              console.log('[usePush] Subscription re-sauvegardée en base après update SW')
            }
          }
        } else {
          setSubscribed(false)
        }
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
        const { error } = await supabase.from('push_subscriptions').upsert([{
          user_id: user.id,
          subscription: sub.toJSON()
        }], { onConflict: 'user_id' })
        if (error) console.error('[usePush] Erreur sauvegarde subscription :', error.message, error)
        else console.log('[usePush] Subscription sauvegardée en base ✓', sub.endpoint)
      }
      setPermission('granted')
      setSubscribed(true)
      return true
    } catch (e) {
      console.error('[usePush] Erreur subscribe :', e?.message, e)
      setPermission('denied')
      return false
    }
  }

  async function requestAndSubscribe() {
    // Si déjà accordé, subscribe directement sans re-demander
    if (Notification.permission === 'granted') return subscribe()
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
