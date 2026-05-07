import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const PALETTE_CATS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4']

function getAvatar(prenom, nom) {
  const initiales = `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase()
  const palettes = [
    { bg: '#dbeafe', text: '#1d4ed8' }, { bg: '#dcfce7', text: '#15803d' },
    { bg: '#fef9c3', text: '#a16207' }, { bg: '#fce7f3', text: '#9d174d' },
    { bg: '#ede9fe', text: '#6d28d9' }, { bg: '#ffedd5', text: '#c2410c' },
  ]
  const idx = ((prenom?.charCodeAt(0) || 0) + (nom?.charCodeAt(0) || 0)) % palettes.length
  return { initiales, ...palettes[idx] }
}

function getSubInfo(date_fin) {
  if (!date_fin) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const fin = new Date(date_fin + 'T00:00:00')
  const days = Math.ceil((fin - today) / (1000 * 60 * 60 * 24))
  if (days < 0)  return { color: '#9ca3af', bg: '#f3f4f6', label: 'Expiré' }
  if (days <= 7) return { color: '#dc2626', bg: '#fef2f2', label: `${days}j` }
  if (days <= 30) return { color: '#d97706', bg: '#fffbeb', label: `${days}j` }
  return { color: '#16a34a', bg: '#f0fdf4', label: `${days}j` }
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState(null)
  const [showCatForm, setShowCatForm] = useState(false)
  const [newCatNom, setNewCatNom] = useState('')
  const [newCatColor, setNewCatColor] = useState(PALETTE_CATS[0])
  const navigate = useNavigate()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchClients(); fetchCategories() }, [])

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*, categories(id, nom, couleur)')
      .order('created_at', { ascending: false })
    if (error) { console.log(error); setLoading(false); return }

    // Wellness du jour
    const today = new Date().toISOString().slice(0, 10)
    const { data: wData } = await supabase.from('wellness').select('*').eq('date', today)
    const withWellness = (data || []).map(c => ({
      ...c,
      wellness_today: wData?.find(w => w.client_id === c.id) || null,
    }))
    setClients(withWellness)
    setLoading(false)
  }

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('created_at')
    setCategories(data || [])
  }

  async function ajouterCategorie() {
    if (!newCatNom.trim()) return
    const { data, error } = await supabase
      .from('categories').insert([{ nom: newCatNom, couleur: newCatColor }]).select().single()
    if (error) { alert(error.message); return }
    setCategories([...categories, data])
    setNewCatNom('')
    setNewCatColor(PALETTE_CATS[0])
    setShowCatForm(false)
  }

  async function supprimerCategorie(catId) {
    if (!window.confirm('Supprimer cette catégorie ?')) return
    const { error } = await supabase.from('categories').delete().eq('id', catId)
    if (error) { alert(error.message); return }
    setCategories(categories.filter(c => c.id !== catId))
    if (activeCat === catId) setActiveCat(null)
  }

  const premium  = clients.filter(c => c.offre === 'suivi_premium').length
  const planSeul = clients.filter(c => c.offre === 'plan_seul').length

  const filtered = clients.filter(c => {
    const matchSearch = `${c.prenom} ${c.nom}`.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCat === null ? true : c.categorie_id === activeCat
    return matchSearch && matchCat
  })

  if (loading) return <div style={styles.loading}><p style={{ color: '#9ca3af' }}>Chargement...</p></div>

  return (
    <div style={styles.page}>
      {/* En-tête */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Mes clients</h1>
          <p style={styles.pageSubtitle}>{clients.length} client{clients.length > 1 ? 's' : ''} actif{clients.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => navigate('/nouveau-client')} style={styles.btnPrimary}>
          + Nouveau client
        </button>
      </div>

      {/* Recherche */}
      <div style={{ marginBottom: '1rem', position: 'relative' }}>
        <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}>🔍</span>
        <input
          type="text" placeholder="Rechercher un client..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.7rem 0.875rem 0.7rem 2.5rem', border: '1.5px solid #e5e7eb', borderRadius: '12px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', background: 'white' }}
        />
      </div>

      {/* Filtres catégories */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setActiveCat(null)}
          style={{ ...styles.catTab, background: activeCat === null ? '#333333' : 'white', color: activeCat === null ? '#e4f816' : '#6b7280', border: activeCat === null ? 'none' : '1.5px solid #e5e7eb' }}
        >
          Tous
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
            style={{
              ...styles.catTab,
              background: activeCat === cat.id ? cat.couleur : 'white',
              color: activeCat === cat.id ? 'white' : '#374151',
              border: activeCat === cat.id ? 'none' : `1.5px solid ${cat.couleur}`,
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeCat === cat.id ? 'rgba(255,255,255,0.7)' : cat.couleur, display: 'inline-block', flexShrink: 0 }} />
            {cat.nom}
            <span
              onClick={e => { e.stopPropagation(); supprimerCategorie(cat.id) }}
              style={{ marginLeft: '0.15rem', opacity: 0.5, fontSize: '0.7rem', cursor: 'pointer' }}
            >✕</span>
          </button>
        ))}

        {showCatForm ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <input
              autoFocus
              value={newCatNom}
              onChange={e => setNewCatNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && ajouterCategorie()}
              placeholder="Nom..."
              style={{ padding: '0.35rem 0.65rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.82rem', outline: 'none', width: 120 }}
            />
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {PALETTE_CATS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewCatColor(c)}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: newCatColor === c ? '2.5px solid #333333' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
                />
              ))}
            </div>
            <button onClick={ajouterCategorie} style={{ ...styles.btnPrimary, padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderRadius: '8px' }}>OK</button>
            <button onClick={() => setShowCatForm(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowCatForm(true)} style={{ ...styles.catTab, background: 'white', color: '#9ca3af', border: '1.5px dashed #d1d5db' }}>
            + Catégorie
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        {[
          { label: 'Clients actifs', value: clients.length },
          { label: 'Suivi premium', value: premium },
          { label: 'Plans seul', value: planSeul },
        ].map(stat => (
          <div key={stat.label} style={styles.statCard}>
            <p style={styles.statLabel}>{stat.label}</p>
            <p style={styles.statValue}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Liste */}
      <div style={styles.listCard}>
        <p style={styles.listHeader}>CLIENTS</p>
        {filtered.length === 0 ? (
          <p style={{ color: '#9ca3af', padding: '1.5rem', textAlign: 'center' }}>
            {search || activeCat ? 'Aucun client trouvé.' : "Aucun client pour l'instant."}
          </p>
        ) : (
          filtered.map((client, i) => {
            const av = getAvatar(client.prenom, client.nom)
            const sub = getSubInfo(client.date_fin)
            const cat = client.categories
            return (
              <div
                key={client.id}
                onClick={() => navigate(`/client/${client.id}`)}
                style={{ ...styles.listRow, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ ...styles.avatar, background: av.bg, color: av.text }}>{av.initiales}</div>
                    {cat && (
                      <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: cat.couleur, border: '2px solid white' }} />
                    )}
                  </div>
                  <div>
                    <p style={styles.clientName}>{client.prenom} {client.nom}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {client.objectif && <p style={{ ...styles.clientObjectif, margin: 0 }}>{client.objectif}</p>}
                      {cat && <span style={{ fontSize: '0.7rem', color: cat.couleur, fontWeight: '700' }}>· {cat.nom}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  {/* Badge wellness du jour */}
                  {(() => {
                    const w = client.wellness_today
                    if (!w) return null
                    const avg = (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4
                    const alert = avg <= 2
                    return (
                      <span title={`Sommeil ${w.sommeil} · Fatigue ${w.fatigue} · Douleurs ${w.douleurs} · Stress ${w.stress}`}
                        style={{ background: alert ? '#fef2f2' : '#f0fdf4', color: alert ? '#dc2626' : '#16a34a', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '700' }}>
                        {alert ? '⚠ ' : '✓ '}{avg.toFixed(1)}/4
                      </span>
                    )
                  })()}
                  {sub && (
                    <span style={{ background: sub.bg, color: sub.color, padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '700' }}>
                      {sub.label}
                    </span>
                  )}
                  <span style={{
                    ...styles.badge,
                    background: client.offre === 'suivi_premium' ? '#eff6ff' : '#f0fdf4',
                    color: client.offre === 'suivi_premium' ? '#1d4ed8' : '#15803d',
                  }}>
                    {client.offre === 'suivi_premium' ? 'Suivi premium' : 'Plan seul'}
                  </span>
                  <span style={styles.chevron}>›</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const styles = {
  loading: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  page: { padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  pageTitle: { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  pageSubtitle: { color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  btnPrimary: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '12px', padding: '0.7rem 1.25rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  catTab: { padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' },
  statCard: { background: '#f9fafb', borderRadius: '14px', padding: '1.25rem' },
  statLabel: { fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.5rem' },
  statValue: { fontSize: '2rem', fontWeight: '800', color: '#333333', margin: 0 },
  listCard: { background: 'white', borderRadius: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  listHeader: { fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.1em', padding: '1rem 1.5rem 0.5rem', margin: 0 },
  listRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', cursor: 'pointer' },
  avatar: { width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.875rem', flexShrink: 0 },
  clientName: { fontWeight: '700', fontSize: '0.95rem', color: '#333333', margin: '0 0 0.15rem' },
  clientObjectif: { color: '#9ca3af', fontSize: '0.8rem', margin: 0 },
  badge: { padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: '600' },
  chevron: { color: '#d1d5db', fontSize: '1.25rem' },
}
