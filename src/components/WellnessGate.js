import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import { sendNotif, getCoachId } from '../notifs'
import BlessureButton from './BlessureButton'
import { isoLocal } from '../utils/dates'
import T from '../theme/tokens'

const QUESTIONS = [
  { key: 'sommeil',  label: 'Sommeil',  desc: ['Très mauvais', 'Mauvais', 'Bien', 'Excellent'] },
  { key: 'fatigue',  label: 'Fatigue',  desc: ['Épuisé', 'Fatigué', 'En forme', 'Top'] },
  { key: 'douleurs', label: 'Douleurs', desc: ['Intenses', 'Présentes', 'Légères', 'Aucune'] },
  { key: 'stress',   label: 'Stress',   desc: ['Très stressé', 'Stressé', 'Calme', 'Serein'] },
]

function WellnessOverlay({ clientId, clientName, onDone }) {
  const [vals, setVals]     = useState({ sommeil: 0, fatigue: 0, douleurs: 0, stress: 0 })
  const [poids, setPoids]   = useState('')
  const [saving, setSaving] = useState(false)
  const allFilled = Object.values(vals).every(v => v > 0)

  async function submit() {
    if (!allFilled) return
    setSaving(true)
    const today = isoLocal()
    const payload = { client_id: clientId, date: today, ...vals }
    if (poids !== '' && !isNaN(parseFloat(poids))) payload.poids = parseFloat(poids)
    await supabase.from('wellness').upsert(payload, { onConflict: 'client_id,date' })
    // Garde le profil nutritionnel à jour avec le dernier poids déclaré,
    // pour que la fiche client / groupe affiche toujours le poids le plus récent.
    if (payload.poids) {
      await supabase.from('nutrition_profile')
        .upsert({ client_id: clientId, poids_kg: payload.poids }, { onConflict: 'client_id' })
    }
    try {
      const coachId = await getCoachId()
      await sendNotif(coachId, {
        titre: 'Nouveau wellness renseigné',
        corps: `${clientName || 'Un client'} a renseigné son bilan du jour`,
        type: 'wellness',
        lien: `/client/${clientId}`,
      })
      // Alerte séparée si une note individuelle est basse (≤ 2/4) — même si
      // la moyenne globale reste correcte, ça peut cacher un signal fort.
      const basses = QUESTIONS.filter(q => vals[q.key] <= 2).map(q => `${q.label} ${vals[q.key]}/4`)
      if (basses.length > 0) {
        await sendNotif(coachId, {
          titre: `Wellness bas — ${clientName || 'Un client'}`,
          corps: `${basses.join(', ')} (seuil ≤ 2/4)`,
          type: 'wellness_alerte',
          lien: `/client/${clientId}`,
        })
      }
    } catch (e) {
      console.error('sendNotif error:', e)
    }
    setSaving(false)
    onDone()
  }

  return (
    <div style={W.overlay}>
      <div style={W.card}>
        <div style={{ textAlign: 'center', marginBottom: '0.6rem' }}>
          <p style={W.subtitle}>Bilan du jour</p>
          <h2 style={W.title}>Comment vas-tu ?</h2>
        </div>
        {QUESTIONS.map((q, i) => (
          <div key={q.key} style={{ padding: '0.55rem 0', borderTop: i === 0 ? 'none' : `1px solid ${T.color.line}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
              <span style={W.qLabel}>{q.label}</span>
              <span style={{ fontSize: T.size.sm, fontWeight: 600, color: T.color.ink }}>{vals[q.key] > 0 ? q.desc[vals[q.key] - 1] : ''}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
              {[1, 2, 3, 4].map(n => {
                const active = vals[q.key] === n
                return (
                  <button key={n} onClick={() => setVals(v => ({ ...v, [q.key]: n }))}
                    aria-pressed={active} aria-label={`${q.label} ${n} sur 4, ${q.desc[n - 1]}`}
                    style={{ ...W.qBtn, background: active ? T.color.ink : T.color.card, border: `1.5px solid ${active ? T.color.ink : T.color.line}`, color: active ? T.color.signal : T.color.ink }}>
                    {n}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: T.size.xs, color: T.color.muted }}>
              <span>{q.desc[0]}</span><span>{q.desc[3]}</span>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0', borderTop: `1px solid ${T.color.line}`, marginBottom: '0.6rem' }}>
          <p style={{ ...W.qLabel, flex: 1 }}>Poids <span style={{ fontWeight: 400, color: T.color.muted, fontSize: T.size.sm }}>(optionnel)</span></p>
          <input
            type="number" placeholder="75.5" aria-label="Poids en kg" value={poids}
            onChange={e => setPoids(e.target.value)}
            style={{ width: 96, height: T.touch, padding: '0 0.6rem', border: `1.5px solid ${T.color.line}`, borderRadius: T.radius.control, fontFamily: T.font.display, fontSize: T.size.xl, fontWeight: 700, textAlign: 'center', boxSizing: 'border-box' }}
          />
          <span style={{ fontWeight: 600, color: T.color.muted, fontSize: T.size.md }}>kg</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 0.6rem' }}>
          <BlessureButton clientId={clientId} compact visible />
        </div>

        <button onClick={submit} disabled={!allFilled || saving}
          style={{ ...W.submitBtn, background: allFilled ? T.color.ink : T.color.soft, color: allFilled ? T.color.signal : T.color.muted, cursor: allFilled ? 'pointer' : 'default' }}>
          {saving ? 'Envoi...' : 'Valider mon bilan'}
        </button>
      </div>
    </div>
  )
}

const W = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgb(20 20 20 / .88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: T.font.body },
  card:      { background: T.color.card, borderRadius: T.radius.card, padding: '1.1rem 1.25rem', width: '100%', maxWidth: 380, maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto', boxSizing: 'border-box', color: T.color.ink },
  subtitle:  { fontSize: T.size.sm, fontWeight: 600, color: T.color.muted, margin: '0 0 0.2rem' },
  title:     { fontFamily: T.font.display, fontSize: T.size.xxl, fontWeight: 700, lineHeight: 1.15, color: T.color.ink, margin: 0 },
  qLabel:    { fontSize: T.size.base, fontWeight: 600, color: T.color.ink, margin: 0 },
  qBtn:      { height: 40, borderRadius: T.radius.control, fontFamily: T.font.display, fontSize: T.size.lg, fontWeight: 700, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' },
  submitBtn: { ...T.btnPrimary, height: 48, marginTop: 0 },
}

export default function WellnessGate({ children }) {
  const [show, setShow]         = useState(false)
  const [clientInfo, setClientInfo] = useState(null) // { id, prenom, nom }
  const [lsKey, setLsKey]       = useState(null)

  useEffect(() => {
    if (new Date().getHours() < 7) return
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const userId = session.user.id
      const today  = isoLocal()
      const key    = `wellness_shown_${userId}_${today}`

      if (localStorage.getItem(key)) return

      // Lookup client (coach n'est pas dans la table clients)
      let { data: clientData } = await supabase
        .from('clients').select('id, prenom, nom').eq('user_id', userId).maybeSingle()
      if (!clientData && session.user.email) {
        const res = await supabase.from('clients').select('id, prenom, nom').eq('email', session.user.email).maybeSingle()
        clientData = res.data
      }
      if (!clientData) return // utilisateur coach, on ne montre pas le wellness

      const { data: w } = await supabase
        .from('wellness').select('id').eq('client_id', clientData.id).eq('date', today).limit(1).maybeSingle()

      if (w) {
        localStorage.setItem(key, '1')
        return
      }

      setLsKey(key)
      setClientInfo(clientData)
      setShow(true)
    }
    check()
  }, [])

  function handleDone() {
    if (lsKey) localStorage.setItem(lsKey, '1')
    setShow(false)
  }

  return (
    <>
      {children}
      {show && clientInfo && createPortal(
        <WellnessOverlay
          clientId={clientInfo.id}
          clientName={`${clientInfo.prenom} ${clientInfo.nom}`}
          onDone={handleDone}
        />,
        document.body
      )}
    </>
  )
}
