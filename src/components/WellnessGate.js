import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'
import { sendNotif, getCoachId } from '../notifs'

const QUESTIONS = [
  { key: 'sommeil',  label: 'Sommeil',  emoji: '🌙', desc: ['Très mauvais', 'Mauvais', 'Bien', 'Excellent'] },
  { key: 'fatigue',  label: 'Fatigue',  emoji: '⚡', desc: ['Épuisé', 'Fatigué', 'En forme', 'Top'] },
  { key: 'douleurs', label: 'Douleurs', emoji: '🤕', desc: ['Intenses', 'Présentes', 'Légères', 'Aucune'] },
  { key: 'stress',   label: 'Stress',   emoji: '🧘', desc: ['Très stressé', 'Stressé', 'Calme', 'Serein'] },
]
const COLORS = ['#ef4444', '#f97316', '#84cc16', '#22c55e']

function WellnessOverlay({ clientId, clientName, onDone }) {
  const [vals, setVals]     = useState({ sommeil: 0, fatigue: 0, douleurs: 0, stress: 0 })
  const [poids, setPoids]   = useState('')
  const [saving, setSaving] = useState(false)
  const allFilled = Object.values(vals).every(v => v > 0)

  async function submit() {
    if (!allFilled) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const payload = { client_id: clientId, date: today, ...vals }
    if (poids !== '' && !isNaN(parseFloat(poids))) payload.poids = parseFloat(poids)
    await supabase.from('wellness').upsert(payload, { onConflict: 'client_id,date' })
    try {
      const coachId = await getCoachId()
      await sendNotif(coachId, {
        titre: 'Nouveau wellness renseigné',
        corps: `${clientName || 'Un client'} a renseigné son bilan du jour`,
        type: 'wellness',
        lien: '/',
      })
    } catch (e) {
      console.error('sendNotif error:', e)
    }
    setSaving(false)
    onDone()
  }

  return (
    <div style={W.overlay}>
      <div style={W.card}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={W.subtitle}>Bilan du jour</p>
          <h2 style={W.title}>Comment tu vas ?</h2>
        </div>
        {QUESTIONS.map(q => (
          <div key={q.key} style={{ marginBottom: '1.1rem' }}>
            <p style={W.qLabel}>{q.emoji} {q.label}</p>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[1, 2, 3, 4].map(n => {
                const active = vals[q.key] === n
                return (
                  <button key={n} onClick={() => setVals(v => ({ ...v, [q.key]: n }))}
                    style={{ ...W.qBtn, background: active ? COLORS[n - 1] : 'white', border: `2px solid ${active ? COLORS[n - 1] : '#e5e7eb'}`, color: active ? 'white' : '#6b7280' }}>
                    <span style={{ fontSize: '1rem', fontWeight: '900' }}>{n}</span>
                    <span style={{ fontSize: '0.48rem', fontWeight: '600', lineHeight: 1.3, textAlign: 'center' }}>{q.desc[n - 1]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div style={{ marginBottom: '1.1rem' }}>
          <p style={W.qLabel}>⚖️ Poids <span style={{ fontWeight: '400', color: '#9ca3af', fontSize: '0.75rem' }}>(optionnel)</span></p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="number" placeholder="ex : 75.5" value={poids}
              onChange={e => setPoids(e.target.value)}
              style={{ flex: 1, padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '1rem', fontWeight: '700', outline: 'none', textAlign: 'center' }}
            />
            <span style={{ fontWeight: '700', color: '#9ca3af', fontSize: '0.9rem' }}>kg</span>
          </div>
        </div>
        <button onClick={submit} disabled={!allFilled || saving}
          style={{ ...W.submitBtn, background: allFilled ? '#333333' : '#e5e7eb', color: allFilled ? 'var(--accent-fg-dark)' : '#9ca3af', cursor: allFilled ? 'pointer' : 'default' }}>
          {saving ? 'Envoi...' : 'Valider mon bilan'}
        </button>
      </div>
    </div>
  )
}

const W = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' },
  card:      { background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 380, maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box' },
  subtitle:  { fontSize: '0.68rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.3rem' },
  title:     { fontSize: '1.4rem', fontWeight: '800', color: '#333333', margin: 0 },
  qLabel:    { fontSize: '0.85rem', fontWeight: '700', color: '#374151', margin: '0 0 0.45rem' },
  qBtn:      { flex: 1, padding: '0.5rem 0', borderRadius: 10, fontWeight: '700', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  submitBtn: { width: '100%', padding: '0.875rem', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: '700', marginTop: '0.75rem' },
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
      const today  = new Date().toISOString().slice(0, 10)
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
