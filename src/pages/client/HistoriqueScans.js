import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

const GRADE_COLOR = { A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626' }

function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return `Aujourd'hui · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return `Hier · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diff < 7)  return `Il y a ${diff} jours · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export default function HistoriqueScans() {
  const navigate  = useNavigate()
  const [scans, setScans]       = useState([])
  const [filter, setFilter]     = useState('all')  // 'all' | 'good' | 'bad' | 'week'
  const [loading, setLoading]   = useState(true)
  const [clientId, setClientId] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }
      const { data: c } = await supabase.from('clients').select('id').eq('user_id', session.user.id).maybeSingle()
      if (!c) { setLoading(false); return }
      setClientId(c.id)

      const { data } = await supabase
        .from('nutrition_scan_history')
        .select('*')
        .eq('client_id', c.id)
        .order('scanned_at', { ascending: false })
        .limit(100)
      setScans(data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Filtrage
  const filtered = scans.filter(s => {
    if (filter === 'good') return ['A', 'B'].includes(s.quality_grade)
    if (filter === 'bad')  return ['C', 'D', 'E'].includes(s.quality_grade)
    if (filter === 'week') {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      return new Date(s.scanned_at) >= weekAgo
    }
    return true
  })

  // Stats globales
  const total = scans.length
  const avgGrade = (() => {
    if (!scans.length) return '—'
    const gradeVal = { A: 1, B: 2, C: 3, D: 4, E: 5 }
    const avg = scans.reduce((acc, s) => acc + (gradeVal[s.quality_grade] || 3), 0) / scans.length
    const grades = ['A', 'A', 'B', 'C', 'D', 'E']
    return grades[Math.round(avg)] || 'B'
  })()
  const toAvoid = scans.filter(s => ['D', 'E'].includes(s.quality_grade)).length

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.iconBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p style={{ color: 'white', fontWeight: 800, fontSize: '1.05rem', margin: 0, lineHeight: 1.2 }}>
            Mes scans
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.68rem', fontWeight: 600, margin: 0 }}>
            Notes nutritionnelles
          </p>
        </div>
        <button
          onClick={() => navigate('/client/nutrition/scanner')}
          style={{ ...S.iconBtn, background: 'var(--accent)', color: '#1a1a1a' }}
          aria-label="Nouveau scan"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <line x1="14" y1="14" x2="14" y2="14" strokeWidth="3" />
            <line x1="17" y1="14" x2="21" y2="14" />
            <line x1="21" y1="17" x2="21" y2="21" />
            <line x1="17" y1="21" x2="21" y2="21" />
            <line x1="14" y1="17" x2="14" y2="21" />
          </svg>
        </button>
      </div>

      <div style={S.content}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem', fontSize: '0.9rem' }}>Chargement…</p>
        ) : (
          <>
            {/* Stats banner */}
            {total > 0 && (
              <div style={S.statsBanner}>
                <StatItem val={total} lbl="Articles scannés" />
                <div style={S.statDiv} />
                <StatItem val={avgGrade} lbl="Note moyenne" color={GRADE_COLOR[avgGrade] || 'white'} />
                <div style={S.statDiv} />
                <StatItem val={toAvoid} lbl="À éviter" />
              </div>
            )}

            {/* Filtres */}
            {total > 0 && (
              <div style={S.filterRow}>
                {[
                  { key: 'all',  label: 'Tous' },
                  { key: 'good', label: '⭐ Note A-B' },
                  { key: 'bad',  label: '⚠️ Note C-E' },
                  { key: 'week', label: 'Cette semaine' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{
                      ...S.filterChip,
                      ...(filter === f.key ? S.filterChipActive : {}),
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Liste */}
            {filtered.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                  {total === 0 ? '📦' : '🔍'}
                </p>
                <p style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: '0.4rem' }}>
                  {total === 0 ? 'Aucun scan pour l\'instant' : 'Aucun résultat'}
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                  {total === 0
                    ? 'Scanne un article pour voir sa note nutritionnelle.'
                    : 'Essaie un autre filtre.'}
                </p>
                {total === 0 && (
                  <button
                    onClick={() => navigate('/client/nutrition/scanner')}
                    style={S.btnPrimary}
                  >
                    ▦ Scanner un article
                  </button>
                )}
              </div>
            )}

            {filtered.map(scan => {
              const gc = GRADE_COLOR[scan.quality_grade] || '#9ca3af'
              const score = scan.quality_score
              return (
                <div key={scan.id} style={S.scanCard}>
                  <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                    {/* Image produit */}
                    <div style={{
                      width: 52, height: 52, borderRadius: 12,
                      background: '#f3f4f6', flexShrink: 0, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.5rem',
                    }}>
                      {scan.image_url
                        ? <img src={scan.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : '🛒'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Nom + grade */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1a1a1a', margin: '0 0 2px', lineHeight: 1.2 }}>
                            {scan.product_name}
                          </p>
                          {scan.brand && (
                            <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, margin: 0 }}>
                              {scan.brand}
                            </p>
                          )}
                        </div>
                        {scan.quality_grade && (
                          <div style={{
                            width: 34, height: 34, borderRadius: 10,
                            background: gc, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 900, fontSize: '1rem',
                          }}>
                            {scan.quality_grade}
                          </div>
                        )}
                      </div>

                      {/* Macros */}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {scan.kcal_100g != null && <Chip label={`${Math.round(scan.kcal_100g)} kcal`} bg="#fef9c3" color="#92400e" />}
                        {scan.prot_100g  != null && <Chip label={`P ${Math.round(scan.prot_100g)}g`}  bg="#dbeafe" color="#1e40af" />}
                        {scan.carbs_100g != null && <Chip label={`G ${Math.round(scan.carbs_100g)}g`} bg="#fef3c7" color="#92400e" />}
                        {scan.fat_100g   != null && <Chip label={`L ${Math.round(scan.fat_100g)}g`}   bg="#fee2e2" color="#991b1b" />}
                      </div>

                      {/* Score bar */}
                      {score != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.55rem' }}>
                          <span style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 600, width: 40, flexShrink: 0 }}>
                            Qualité
                          </span>
                          <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${score * 10}%`,
                              background: gc, borderRadius: 999,
                            }} />
                          </div>
                          <span style={{ fontSize: '0.62rem', fontWeight: 800, color: gc, width: 22, textAlign: 'right', flexShrink: 0 }}>
                            {score.toFixed(1)}
                          </span>
                        </div>
                      )}

                      {/* Date */}
                      <p style={{ fontSize: '0.62rem', color: '#d1d5db', fontWeight: 600, margin: '0.45rem 0 0' }}>
                        {formatDate(scan.scanned_at)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        <div style={{ height: 30 }} />
      </div>
    </div>
  )
}

function StatItem({ val, lbl, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 }}>
      <span style={{ fontSize: '1.3rem', fontWeight: 900, color: color || 'var(--accent)', lineHeight: 1 }}>
        {val}
      </span>
      <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
        {lbl}
      </span>
    </div>
  )
}

function Chip({ label, bg, color }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999,
      background: bg, color,
      fontSize: '0.63rem', fontWeight: 700,
    }}>
      {label}
    </span>
  )
}

const S = {
  page: {
    minHeight: '100vh', background: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
    padding: '1.1rem 1.25rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, zIndex: 60,
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 999,
    background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white',
  },
  content: { padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  statsBanner: {
    background: '#1a1a1a', borderRadius: 16,
    padding: '0.9rem 1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-around',
  },
  statDiv: { width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch' },
  filterRow: {
    display: 'flex', gap: 8, overflowX: 'auto',
    scrollbarWidth: 'none', padding: '2px 0',
  },
  filterChip: {
    padding: '6px 14px', borderRadius: 999,
    border: '1.5px solid #e5e7eb', background: 'white',
    fontSize: '0.74rem', fontWeight: 700, color: '#6b7280',
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  filterChipActive: {
    background: '#1a1a1a', borderColor: '#1a1a1a', color: 'var(--accent)',
  },
  scanCard: {
    background: 'white', borderRadius: 16, padding: '0.95rem 1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  btnPrimary: {
    padding: '0.85rem 2rem', borderRadius: 14,
    border: 'none', background: '#1a1a1a', color: 'var(--accent)',
    fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
  },
}
