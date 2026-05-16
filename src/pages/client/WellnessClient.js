import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const INDICATORS = [
  { key: 'sommeil',  label: 'Sommeil',  emoji: '🌙' },
  { key: 'fatigue',  label: 'Fatigue',  emoji: '⚡' },
  { key: 'douleurs', label: 'Douleurs', emoji: '🩹' },
  { key: 'stress',   label: 'Stress',   emoji: '🧠' },
]

function scoreColor(v) {
  if (!v) return '#e5e7eb'
  if (v <= 1) return '#ef4444'
  if (v <= 2) return '#f97316'
  if (v <= 3) return '#eab308'
  return '#22c55e'
}

const LABELS = {
  sommeil:  ['', 'Très mauvais', 'Mauvais', 'Bien', 'Excellent'],
  fatigue:  ['', 'Épuisé', 'Fatigué', 'En forme', 'Top'],
  douleurs: ['', 'Intenses', 'Présentes', 'Légères', 'Aucune'],
  stress:   ['', 'Très stressé', 'Stressé', 'Calme', 'Serein'],
}

export default function WellnessClient() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('bilan') // 'bilan' | 'poids'
  const [clientId, setClientId] = useState(null)
  const [weightInput, setWeightInput] = useState('')
  const [savingWeight, setSavingWeight] = useState(false)
  const [weightSaved, setWeightSaved] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return
      const { data: client } = await supabase.from('clients').select('id').eq('user_id', userId).maybeSingle()
      if (!client) return
      setClientId(client.id)
      const { data } = await supabase.from('wellness')
        .select('*').eq('client_id', client.id)
        .order('date', { ascending: false }).limit(60)
      const entries = data || []
      setEntries(entries)
      // Pré-remplir le poids si déjà renseigné aujourd'hui
      const todayEntry = entries.find(e => e.date === today)
      if (todayEntry?.poids) setWeightInput(String(todayEntry.poids))
      setLoading(false)
    }
    load()
  }, [])

  async function saveWeight() {
    const val = parseFloat(weightInput)
    if (!val || val < 20 || val > 300 || !clientId) return
    setSavingWeight(true)
    const todayEntry = entries.find(e => e.date === today)
    if (todayEntry) {
      // Entrée existante → update uniquement le poids
      await supabase.from('wellness').update({ poids: val }).eq('id', todayEntry.id)
      setEntries(prev => prev.map(e => e.id === todayEntry.id ? { ...e, poids: val } : e))
    } else {
      // Pas de bilan aujourd'hui → créer entrée poids seul
      const { data: newEntry } = await supabase.from('wellness')
        .upsert({ client_id: clientId, date: today, poids: val }, { onConflict: 'client_id,date' })
        .select().maybeSingle()
      if (newEntry) setEntries(prev => [newEntry, ...prev])
    }
    setSavingWeight(false)
    setWeightSaved(true)
    setTimeout(() => setWeightSaved(false), 2000)
  }

  // Bilan : entrées avec au moins un indicateur renseigné
  const bilanEntries = entries.filter(e => e.sommeil || e.fatigue || e.douleurs || e.stress)
  const latest = bilanEntries[0]
  const poidsEntries = entries.filter(e => e.poids != null).reverse()

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={S.headerTitle}>Mon wellness</span>
        <div style={{ width: 32 }} />
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', background: '#f3f4f6', margin: '1rem', borderRadius: 12, padding: 3, gap: 3 }}>
        {[{ k: 'bilan', l: '❤️ Bilan' }, { k: 'poids', l: '⚖️ Poids' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: '0.5rem', border: 'none', borderRadius: 9, fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer',
            background: tab === t.k ? 'white' : 'transparent',
            color: tab === t.k ? '#333333' : '#9ca3af',
            boxShadow: tab === t.k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}>{t.l}</button>
        ))}
      </div>

      <div style={S.content}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>Chargement...</p>
        ) : tab === 'bilan' ? (
          bilanEntries.length === 0 ? (
            <div style={S.empty}>
              <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>❤️</p>
              <p style={{ fontWeight: '700', color: '#374151' }}>Aucune donnée wellness</p>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Remplis ton bilan quotidien depuis l'accueil.</p>
            </div>
          ) : (
          <>
            {/* Dernière entrée */}
            {latest && (
              <div style={{ background: 'white', borderRadius: 16, padding: '1.1rem', marginBottom: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: latest.date === today ? '2px solid #e4f816' : '2px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <p style={{ margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#1a1a1a' }}>
                    {latest.date === today ? "Aujourd'hui" : new Date(latest.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {latest.poids && <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#6b7280' }}>⚖️ {latest.poids} kg</span>}
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: scoreColor(Math.round((latest.sommeil + latest.fatigue + latest.douleurs + latest.stress) / 4)) }}>
                      {((latest.sommeil + latest.fatigue + latest.douleurs + latest.stress) / 4).toFixed(1)}/4
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {INDICATORS.map(({ key, label, emoji }) => (
                    <div key={key} style={{ background: '#f9fafb', borderRadius: 10, padding: '0.55rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.9rem' }}>{emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '0.62rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' }}>{label}</p>
                        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: '700', color: scoreColor(latest[key]) }}>{LABELS[key][latest[key]]}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1,2,3,4].map(v => (
                          <div key={v} style={{ width: 5, height: 14, borderRadius: 2, background: v <= latest[key] ? scoreColor(latest[key]) : '#e5e7eb' }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique */}
            {bilanEntries.length > 1 && (
              <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ padding: '0.65rem 1rem', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                  <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Historique</p>
                </div>
                <div style={{ padding: '0.25rem 0' }}>
                  {bilanEntries.slice(1).map(w => {
                    const avg = (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4
                    return (
                      <div key={w.id} style={{ display: 'flex', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: '1px solid #f9fafb', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: '600', minWidth: 60 }}>
                          {new Date(w.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </span>
                        <div style={{ flex: 1, display: 'flex', gap: '0.35rem' }}>
                          {INDICATORS.map(({ key }) => (
                            <div key={key} style={{ display: 'flex', gap: 2 }}>
                              {[1,2,3,4].map(v => (
                                <div key={v} style={{ width: 4, height: 12, borderRadius: 2, background: v <= w[key] ? scoreColor(w[key]) : '#e5e7eb' }} />
                              ))}
                            </div>
                          ))}
                        </div>
                        {w.poids && <span style={{ fontSize: '0.7rem', color: '#6b7280', minWidth: 40 }}>⚖️{w.poids}</span>}
                        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: scoreColor(Math.round(avg)), minWidth: 28, textAlign: 'right' }}>
                          {avg.toFixed(1)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
          )
        ) : (
          /* Onglet Poids */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* ── Saisie du poids du jour ── */}
            <div style={{ background: 'white', borderRadius: 16, padding: '1.1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '2px solid #e4f816' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: '700', fontSize: '0.9rem', color: '#1a1a1a' }}>
                ⚖️ Poids du jour
              </p>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="300"
                  placeholder="ex : 75.5"
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveWeight()}
                  style={{
                    flex: 1, padding: '0.65rem 0.9rem', border: '1.5px solid #e5e7eb',
                    borderRadius: 12, fontSize: '1rem', color: '#1a1a1a',
                    outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none',
                  }}
                />
                <span style={{ fontSize: '0.9rem', color: '#6b7280', fontWeight: '600', flexShrink: 0 }}>kg</span>
                <button
                  onClick={saveWeight}
                  disabled={savingWeight || !weightInput}
                  style={{
                    padding: '0.65rem 1.1rem', border: 'none', borderRadius: 12,
                    background: weightSaved ? '#22c55e' : '#333333',
                    color: weightSaved ? 'white' : '#e4f816',
                    fontWeight: '700', fontSize: '0.88rem', cursor: 'pointer',
                    flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  {savingWeight ? '…' : weightSaved ? '✓ Enregistré' : 'Enregistrer'}
                </button>
              </div>
              {entries.find(e => e.date === today)?.poids && !weightSaved && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                  Poids actuel du jour : {entries.find(e => e.date === today).poids} kg
                </p>
              )}
            </div>

            {poidsEntries.length === 0 ? (
            <div style={S.empty}>
              <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>⚖️</p>
              <p style={{ fontWeight: '700', color: '#374151' }}>Aucune donnée de poids</p>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Enregistre ton premier poids ci-dessus.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Stat rapide */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {[
                  { label: 'Actuel', val: `${poidsEntries[poidsEntries.length - 1].poids} kg` },
                  { label: 'Minimum', val: `${Math.min(...poidsEntries.map(e => e.poids))} kg` },
                  { label: 'Maximum', val: `${Math.max(...poidsEntries.map(e => e.poids))} kg` },
                ].map(s => (
                  <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '0.75rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <p style={{ margin: 0, fontSize: '0.62rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase' }}>{s.label}</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '1rem', fontWeight: '800', color: '#333' }}>{s.val}</p>
                  </div>
                ))}
              </div>

              {/* Graphique */}
              <div style={{ background: 'white', borderRadius: 14, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Évolution du poids</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={poidsEntries} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v) => [`${v} kg`, 'Poids']}
                      labelFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} />
                    <Line type="monotone" dataKey="poids" stroke="#333333" strokeWidth={2.5} dot={{ fill: '#e4f816', r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Historique poids */}
              <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ padding: '0.65rem 1rem', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                  <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Historique</p>
                </div>
                {[...poidsEntries].reverse().map(w => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 1rem', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: '600' }}>
                      {new Date(w.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#333' }}>{w.poids} kg</span>
                  </div>
                ))}
              </div>
            </div>
          )
        }
        </div>
      )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:      { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1rem 1rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:     { background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center' },
  headerTitle: { color: 'white', fontWeight: '800', fontSize: '1rem' },
  content:     { padding: '0 1rem 1rem' },
  empty:       { background: 'white', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
}
