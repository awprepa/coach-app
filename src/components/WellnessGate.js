import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import { sendNotif, getCoachId } from '../notifs'
import BlessureButton from './BlessureButton'
import { isoLocal } from '../utils/dates'

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
          <div key={q.key} style={{ padding: '0.55rem 0', borderTop: i === 0 ? 'none' : '1px solid #ececec' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
              <span style={W.qLabel}>{q.label}</span>
              <span style={{ fontSize: '0.74rem', color: '#8a8a8a' }}>{vals[q.key] > 0 ? q.desc[vals[q.key] - 1] : ''}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
              {[1, 2, 3, 4].map(n => {
                const active = vals[q.key] === n
                return (
                  <button key={n} onClick={() => setVals(v => ({ ...v, [q.key]: n }))}
                    style={{ ...W.qBtn, background: active ? '#222222' : 'white', border: `1px solid ${active ? '#222222' : '#e3e3e3'}`, color: active ? 'white' : '#555555' }}>
                    {n}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: '0.7rem', color: '#9a9a9a' }}>
              <span>{q.desc[0]}</span><span>{q.desc[3]}</span>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0', borderTop: '1px solid #ececec', marginBottom: '0.6rem' }}>
          <p style={{ ...W.qLabel, flex: 1 }}>Poids <span style={{ fontWeight: '400', color: '#9a9a9a', fontSize: '0.75rem' }}>(optionnel)</span></p>
          <input
            type="number" placeholder="75.5" aria-label="Poids en kg" value={poids}
            onChange={e => setPoids(e.target.value)}
            style={{ width: 96, padding: '0.45rem 0.6rem', border: '1px solid #e3e3e3', borderRadius: 10, fontSize: '1rem', fontWeight: '700', outline: 'none', textAlign: 'center' }}
          />
          <span style={{ fontWeight: '700', color: '#6b7280', fontSize: '0.9rem' }}>kg</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 0.6rem' }}>
          <BlessureButton clientId={clientId} compact visible />
        </div>

        <button onClick={submit} disabled={!allFilled || saving}
          style={{ ...W.submitBtn, background: allFilled ? '#222222' : '#ececec', color: allFilled ? 'white' : '#9a9a9a', cursor: allFilled ? 'pointer' : 'default' }}>
          {saving ? 'Envoi...' : 'Valider mon bilan'}
        </button>
      </div>
    </div>
  )
}

const W = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  card:      { background: 'white', borderRadius: 20, padding: '1.1rem 1.25rem', width: '100%', maxWidth: 380, maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto', boxSizing: 'border-box' },
  subtitle:  { fontSize: '0.7rem', fontWeight: '700', color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.3rem' },
  title:     { fontSize: '1.2rem', fontWeight: '700', color: '#222222', margin: 0 },
  qLabel:    { fontSize: '0.88rem', fontWeight: '700', color: '#222222', margin: 0 },
  qBtn:      { height: 36, borderRadius: 10, fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' },
  submitBtn: { width: '100%', padding: '0.75rem', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: '700', marginTop: 0 },
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
