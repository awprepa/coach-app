import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { sendPushOnly } from '../../notifs'
import Conversation from '../../components/Conversation'
import ClientBottomNav from '../../components/ClientBottomNav'
import Icon from '../../components/Icon'
import T from '../../theme/tokens'
import EnTeteClient from '../../components/EnTeteClient'

// Place de la barre d'onglets flottante (ClientBottomNav) : 20 px du bas
// + 68 px de barre + 8 px d'écart avec la zone de saisie
const NAV_H = 96

export default function MessagesClient() {
  const [clientId, setClientId] = useState(null)
  const [coachId,  setCoachId]  = useState(null)
  const [loadError, setLoadError] = useState(false)
  const blurTimer = useRef(null)
  const cadreRef = useRef(null)
  const saisieRef = useRef(false)
  const raf = useRef(null)

  // Place le cadre de la page : clavier ouvert → exactement la zone visible
  // au-dessus du clavier (visualViewport) ; sinon au-dessus de la barre d'onglets.
  // Écrit directement dans le style (sans re-rendu React) pour suivre iOS sans retard.
  const placer = useCallback(() => {
    const el = cadreRef.current
    if (!el) return
    const vv = window.visualViewport
    if (saisieRef.current && vv) {
      el.style.top = `${vv.offsetTop}px`
      el.style.height = `${vv.height}px`
      el.style.bottom = 'auto'
      el.style.paddingBottom = '0px'
    } else {
      // Jusqu'en bas de l'écran (même fond derrière la barre d'onglets)
      el.style.top = '0px'
      el.style.height = 'auto'
      el.style.bottom = '0px'
      el.style.paddingBottom = `${NAV_H}px`
    }
  }, [])
  // Pendant l'animation du clavier, on recale le cadre à chaque image
  const suivreClavier = useCallback(() => {
    cancelAnimationFrame(raf.current)
    const fin = performance.now() + 800
    const image = () => { placer(); if (performance.now() < fin) raf.current = requestAnimationFrame(image) }
    image()
  }, [placer])
  useEffect(() => {
    const vv = window.visualViewport
    placer()
    if (!vv) return
    vv.addEventListener('resize', placer)
    vv.addEventListener('scroll', placer)
    return () => { vv.removeEventListener('resize', placer); vv.removeEventListener('scroll', placer); cancelAnimationFrame(raf.current) }
  }, [placer])

  useEffect(() => {
    async function load() {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const userId = sess?.session?.user?.id
        if (!userId) { setLoadError(true); return }
        setClientId(userId)

        // Trouver le coach : d'abord via un message reçu, sinon via app_settings
        let foundCoachId = null
        const { data: msgRecu } = await supabase
          .from('messages').select('from_id').eq('to_id', userId).limit(1)
        if (msgRecu?.length) foundCoachId = msgRecu[0].from_id

        if (!foundCoachId) {
          const { data: setting } = await supabase
            .from('app_settings').select('value').eq('key', 'coach_user_id').maybeSingle()
          if (setting?.value) foundCoachId = setting.value
        }

        if (!foundCoachId) { setLoadError(true); return }
        setCoachId(foundCoachId)
      } catch (e) {
        console.error('[MessagesClient]', e)
        setLoadError(true)
      }
    }
    load()
  }, [])

  // Pendant la saisie, la barre d'onglets se cache : le fil occupe la zone visible
  // au-dessus du clavier. Sinon il s'arrête juste au-dessus de la barre d'onglets.
  function onFocusChange(focus) {
    clearTimeout(blurTimer.current)
    if (focus) { saisieRef.current = true; suivreClavier() }
    else blurTimer.current = setTimeout(() => { saisieRef.current = false; suivreClavier() }, 100)
  }

  return (
    <>
      <div ref={cadreRef} style={{ ...S.page, top: 0, bottom: 0, paddingBottom: NAV_H }}>
        <EnTeteClient titre="Arthur" sousTitre="Ton coach" actions={<img loading="lazy" src="/coach-avatar.png" alt="" style={S.avatar} />} />

        {loadError ? (
          <div style={S.centre}>
            <Icon name="message" size={36} style={{ color: T.color.muted }} />
            <p style={{ fontWeight: 700, color: T.color.ink, margin: '0.5rem 0 0.25rem' }}>Messagerie indisponible</p>
            <p style={{ color: T.color.muted, fontSize: T.size.md, margin: 0, textAlign: 'center', padding: '0 2rem' }}>
              Contacte ton coach pour activer la messagerie.
            </p>
          </div>
        ) : !clientId || !coachId ? (
          <div style={S.centre}><p style={{ color: T.color.muted, fontSize: T.size.md }}>Chargement…</p></div>
        ) : (
          <Conversation
            myId={clientId}
            otherId={coachId}
            onFocusChange={onFocusChange}
            flottant
            emptyText="Aucun message pour l’instant. Écris à ton coach."
            onAfterSend={corps => {
              sendPushOnly(coachId, { titre: "Message d'un client", corps, lien: `/messages?c=${clientId}` }).catch(() => {})
            }}
          />
        )}
      </div>
      <ClientBottomNav />
    </>
  )
}

const S = {
  page:   { position: 'fixed', left: 0, right: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.color.page, fontFamily: T.font.body, zIndex: 50 },
  header: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: T.color.headerBg, color: T.color.onDark },
  avatar: { width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgb(255 255 255 / .2)', flexShrink: 0 },
  nom:    { margin: 0, fontFamily: T.font.display, fontSize: T.size.xl, fontWeight: 700, lineHeight: 1.1, color: T.color.onDark },
  role:   { margin: 0, fontSize: T.size.sm, color: T.color.onDarkMuted },
  centre: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
}
