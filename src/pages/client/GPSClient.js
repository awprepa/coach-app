import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'

const METRICS = [
  { key: 'distance',  label: 'Distance', unit: 'm' },
  { key: 'm_min',     label: 'm/min',    unit: '' },
  { key: 'vmax',      label: 'Vmax',     unit: 'km/h' },
  { key: 'nb_acc_25', label: 'Acc >2,5', unit: '' },
]

function ScoreBar({ value, max, color }) {
  if (value == null) return <span style={{ color: '#d1d5db', fontSize: '0.82rem' }}>—</span>
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1a1a1a', minWidth: 38, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

function diffColor(val, avg) {
  if (val == null || avg == null || avg === 0) return '#9ca3af'
  return val >= avg ? '#16a34a' : '#dc2626'
}

function diffLabel(val, avg) {
  if (val == null || avg == null || avg === 0) return null
  const diff = Math.round(((val - avg) / avg) * 100)
  return `${diff > 0 ? '+' : ''}${diff}%`
}

export default function GPSClient() {
  const navigate = useNavigate()
  const [rapports, setRapports] = useState([])
  const [clientId, setClientId] = useState(null)
  const [joueurKey, setJoueurKey] = useState(null) // "NOM Prenom" string matched to this client
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) { navigate('/login'); return }

      const { data: client } = await supabase
        .from('clients').select('id, prenom, nom').eq('user_id', userId).single()
      if (!client) { setLoading(false); return }
      setClientId(client.id)

      const { data: rpts } = await supabase
        .from('gps_rapports').select('id, nom, date, type, lignes')
        .order('date', { ascending: false })

      const all = rpts || []

      // Find the joueur key for this client (NOM Prenom format)
      // Look for a ligne with matching client_id
      let key = null
      for (const r of all) {
        const match = (r.lignes || []).find(l => l.client_id === client.id)
        if (match) { key = match.joueur; break }
      }
      // Fallback: match by name
      if (!key) {
        key = `${client.nom.toUpperCase()} ${client.prenom}`
      }
      setJoueurKey(key)
      setRapports(all)
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 80, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <p style={{ color: '#9ca3af' }}>Chargement...</p>
      <ClientBottomNav />
    </div>
  )

  // For each rapport, find the client's ligne (periode_num === 0) and compute group avg
  const sessions = rapports.map(r => {
    const totals = (r.lignes || []).filter(l => l.periode_num === 0)
    const moi = totals.find(l =>
      l.client_id === clientId ||
      (joueurKey && l.joueur?.trim().toUpperCase() === joueurKey?.trim().toUpperCase())
    )
    const autres = totals.filter(l => l !== moi)
    const avg = {}
    METRICS.forEach(({ key }) => {
      const vals = autres.map(l => l[key]).filter(v => typeof v === 'number')
      avg[key] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null
    })
    return { ...r, moi: moi || null, avg, totalJoueurs: totals.length }
  })

  // Max values across all sessions for bar scaling
  const maxVals = {}
  METRICS.forEach(({ key }) => {
    const all = sessions.flatMap(s => [s.moi?.[key], s.avg?.[key]]).filter(v => typeof v === 'number')
    maxVals[key] = all.length ? Math.max(...all) * 1.1 : 100
  })

  const BAR_COLORS = ['#333333', '#6366f1', '#f59e0b', '#10b981']

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <span style={S.headerTitle}>GPS</span>
        <div style={{ width: 60 }} />
      </div>

      <div style={S.content}>
        {sessions.length === 0 ? (
          <div style={S.empty}>
            <div style={{ marginBottom: '0.75rem' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.5 2 5.5 5 5.5 8.5c0 5 6.5 13.5 6.5 13.5S18.5 13.5 18.5 8.5C18.5 5 15.5 2 12 2z" />
                <circle cx="12" cy="8.5" r="2.5" />
              </svg>
            </div>
            <p style={{ fontWeight: '700', color: '#374151', margin: '0 0 0.3rem' }}>Aucune donnée GPS</p>
            <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>Tes données apparaîtront ici dès qu'elles seront importées.</p>
          </div>
        ) : selected ? (
          /* ── Détail session ── */
          (() => {
            const s = sessions.find(x => x.id === selected)
            if (!s) return null
            return (
              <div>
                <button onClick={() => setSelected(null)} style={S.backBtn}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Toutes les sessions
                </button>

                <div style={S.detailCard}>
                  <p style={{ margin: '0 0 0.2rem', fontWeight: '800', fontSize: '1rem', color: '#1a1a1a' }}>{s.nom}</p>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                    {new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {s.type && ` · ${s.type}`} · {s.totalJoueurs} joueur{s.totalJoueurs > 1 ? 's' : ''}
                  </p>

                  {!s.moi ? (
                    <div style={{ background: '#f9fafb', borderRadius: 10, padding: '1rem', textAlign: 'center' }}>
                      <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Tu n'as pas participé à cette session.</p>
                    </div>
                  ) : (
                    <>
                      {/* Légende */}
                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#333333' }} />
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#374151' }}>Toi</span>
                        </div>
                        {s.totalJoueurs > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#6366f1' }} />
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#374151' }}>Moyenne groupe</span>
                          </div>
                        )}
                      </div>

                      {/* Métriques */}
                      {METRICS.map(({ key, label, unit }, i) => {
                        const val = s.moi[key]
                        const avg = s.avg[key]
                        const diff = diffLabel(val, avg)
                        return (
                          <div key={key} style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#374151' }}>
                                {label}{unit ? ` (${unit})` : ''}
                              </span>
                              {diff && (
                                <span style={{ fontSize: '0.72rem', fontWeight: '700', color: diffColor(val, avg) }}>
                                  {diff} vs groupe
                                </span>
                              )}
                            </div>
                            <ScoreBar value={val} max={maxVals[key]} color={BAR_COLORS[0]} />
                            {s.totalJoueurs > 1 && avg != null && (
                              <div style={{ marginTop: '0.25rem' }}>
                                <ScoreBar value={avg} max={maxVals[key]} color={BAR_COLORS[1]} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              </div>
            )
          })()
        ) : (
          /* ── Liste sessions ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {sessions.map(s => {
              const hasData = !!s.moi
              return (
                <div key={s.id} onClick={() => setSelected(s.id)} style={{
                  ...S.sessionCard,
                  opacity: hasData ? 1 : 0.6,
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0 0 0.15rem', fontWeight: '700', fontSize: '0.9rem', color: '#1a1a1a' }}>{s.nom}</p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>
                      {new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {s.type && ` · ${s.type}`}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                    {hasData ? (
                      <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '700' }}>
                        ✓ Présent
                      </span>
                    ) : (
                      <span style={{ background: '#f3f4f6', color: '#9ca3af', padding: '0.2rem 0.55rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '600' }}>
                        Absent
                      </span>
                    )}
                    <span style={{ color: '#d1d5db', fontSize: '1.1rem' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:        { minHeight: '100vh', background: '#f0f0f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header:      { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo:        { color: 'white', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.5px' },
  headerTitle: { color: 'white', fontWeight: '700', fontSize: '0.95rem' },
  content:     { padding: '1rem' },
  empty:       { background: 'white', borderRadius: 16, padding: '3rem 1.5rem', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  sessionCard: { background: 'white', borderRadius: 14, padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  detailCard:  { background: 'white', borderRadius: 16, padding: '1.1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  backBtn:     { display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', padding: '0 0 0.85rem', marginLeft: '-0.1rem' },
}
