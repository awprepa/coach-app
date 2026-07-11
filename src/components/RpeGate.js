import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'

// ── Session-RPE différencié (échelle CR-10, 0-10) — 3 dimensions rugby ────────
const DIMS = [
  { key: 'rpe_cardio',  label: 'Cardio / souffle' },
  { key: 'rpe_jambes',  label: 'Jambes (musculaire)' },
  { key: 'rpe_contact', label: 'Contact / haut du corps' },
]

// Descripteurs CR-10 (ancrages)
const DESC = ['Repos', 'Très facile', 'Facile', 'Assez facile', 'Modéré',
  'Un peu dur', 'Dur', 'Très dur', 'Très très dur', 'Presque max', 'Maximal']

// Couleur du vert (facile) au rouge (maximal) selon la note 0-10
function noteColor(n) {
  if (n <= 2) return '#22c55e'
  if (n <= 4) return '#84cc16'
  if (n <= 6) return '#eab308'
  if (n <= 8) return '#f97316'
  return '#ef4444'
}

function Echelle({ value, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: 11 }, (_, n) => {
          const active = value === n
          const col = noteColor(n)
          return (
            <button key={n} onClick={() => onChange(n)}
              style={{
                flex: 1, minWidth: 0, height: 38, borderRadius: 7, cursor: 'pointer', padding: 0,
                border: `1.5px solid ${active ? col : '#e5e7eb'}`,
                background: active ? col : 'white',
                color: active ? 'white' : '#6b7280',
                fontWeight: 800, fontSize: '0.8rem',
              }}>
              {n}
            </button>
          )
        })}
      </div>
      {value != null && (
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', fontWeight: 700, color: noteColor(value) }}>
          {value} — {DESC[value]}
        </p>
      )}
    </div>
  )
}

function RpeOverlay({ clientId, evenement, onDone }) {
  const [vals, setVals]     = useState({ rpe_cardio: null, rpe_jambes: null, rpe_contact: null })
  const [commentaire, setCommentaire] = useState('')
  const [saving, setSaving] = useState(false)
  const allFilled = DIMS.every(d => vals[d.key] != null)

  async function submit() {
    if (!allFilled || saving) return
    setSaving(true)
    await supabase.from('groupe_seance_rpe').upsert({
      evenement_id: evenement.id,
      client_id:    clientId,
      ...vals,
      commentaire:  commentaire.trim() || null,
    }, { onConflict: 'evenement_id,client_id' })
    setSaving(false)
    onDone()
  }

  const dateLabel = new Date(evenement.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={W.overlay}>
      <div style={W.card}>
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <p style={W.subtitle}>Intensité de l'entraînement</p>
          <h2 style={W.title}>{evenement.titre || 'Entraînement'}</h2>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0.25rem 0 0', textTransform: 'capitalize' }}>{dateLabel}</p>
        </div>

        <p style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5, margin: '0 0 1.25rem', textAlign: 'center' }}>
          Note ton effort ressenti de 0 (repos) à 10 (maximal) pour chaque dimension.
        </p>

        {DIMS.map(d => (
          <div key={d.key} style={{ marginBottom: '1.2rem' }}>
            <p style={W.qLabel}>{d.label}</p>
            <Echelle value={vals[d.key]} onChange={n => setVals(v => ({ ...v, [d.key]: n }))} />
          </div>
        ))}

        <div style={{ marginBottom: '1rem' }}>
          <p style={W.qLabel}>Commentaire <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.75rem' }}>(optionnel)</span></p>
          <textarea
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            placeholder="Une remarque sur la séance ? (facultatif)"
            rows={2}
            maxLength={400}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical', outline: 'none' }}
          />
        </div>

        <button onClick={submit} disabled={!allFilled || saving}
          style={{ ...W.submitBtn, background: allFilled ? '#333333' : '#e5e7eb', color: allFilled ? 'var(--accent-fg-dark)' : '#9ca3af', cursor: allFilled ? 'pointer' : 'default' }}>
          {saving ? 'Envoi...' : 'Valider ma note'}
        </button>
        <button onClick={onDone} disabled={saving}
          style={{ width: '100%', marginTop: '0.5rem', background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: '0.4rem' }}>
          Plus tard
        </button>
      </div>
    </div>
  )
}

const W = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' },
  card:      { background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 380, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' },
  subtitle:  { fontSize: '0.68rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.3rem' },
  title:     { fontSize: '1.25rem', fontWeight: '800', color: '#333333', margin: 0 },
  qLabel:    { fontSize: '0.85rem', fontWeight: '700', color: '#374151', margin: '0 0 0.5rem' },
  submitBtn: { width: '100%', padding: '0.875rem', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: '700', marginTop: '0.5rem' },
}

export default function RpeGate({ children }) {
  const [show, setShow]       = useState(false)
  const [clientId, setClientId] = useState(null)
  const [evenement, setEvenement] = useState(null)
  const [lsKey, setLsKey]     = useState(null)

  useEffect(() => {
    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return
        const userId = session.user.id

        // Throttle : le gate est monté à chaque navigation — on ne refait la
        // vérification (4-5 requêtes) qu'au plus toutes les 5 min par session
        // d'app. Une ouverture fraîche de l'app vérifie toujours (sessionStorage).
        const throttleKey = `rpe_check_${userId}`
        const last = parseInt(sessionStorage.getItem(throttleKey) || '0')
        if (Date.now() - last < 5 * 60 * 1000) return
        sessionStorage.setItem(throttleKey, String(Date.now()))

        // Lookup client (le coach n'est pas dans clients → pas de gate)
        let { data: client } = await supabase.from('clients').select('id').eq('user_id', userId).maybeSingle()
        if (!client && session.user.email) {
          const res = await supabase.from('clients').select('id').eq('email', session.user.email).maybeSingle()
          client = res.data
        }
        if (!client) return

        // Groupes du joueur
        const { data: membres } = await supabase.from('groupe_membres').select('groupe_id').eq('client_id', client.id)
        const groupeIds = (membres || []).map(m => m.groupe_id)
        if (!groupeIds.length) return

        // Séances terrain récentes (3 derniers jours), passées ou du jour
        const today = new Date().toISOString().slice(0, 10)
        const from3 = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)
        const { data: evs } = await supabase
          .from('groupe_evenements')
          .select('id, titre, date, type')
          .in('groupe_id', groupeIds)
          .eq('type', 'entrainement')
          .gte('date', from3).lte('date', today)
          .order('date', { ascending: false })
        if (!evs?.length) return

        // Déjà notées par ce joueur ?
        const { data: notes } = await supabase
          .from('groupe_seance_rpe').select('evenement_id').eq('client_id', client.id)
          .in('evenement_id', evs.map(e => e.id))
        const notedIds = new Set((notes || []).map(n => n.evenement_id))

        // Première séance non notée et non reportée aujourd'hui
        for (const ev of evs) {
          if (notedIds.has(ev.id)) continue
          const key = `rpe_shown_${userId}_${ev.id}_${today}`
          if (localStorage.getItem(key)) continue
          setLsKey(key)
          setClientId(client.id)
          setEvenement(ev)
          setShow(true)
          return
        }
      } catch (e) {
        console.error('[RpeGate]', e)
      }
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
      {show && clientId && evenement && createPortal(
        <RpeOverlay clientId={clientId} evenement={evenement} onDone={handleDone} />,
        document.body
      )}
    </>
  )
}
