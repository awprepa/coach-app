import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ClientBottomNav from '../../components/ClientBottomNav'
import { PageLoading } from '../../components/Skeleton'

export default function TestsClient() {
  const navigate = useNavigate()
  const [client, setClient]         = useState(null)
  const [types, setTypes]           = useState([])
  const [resultats, setResultats]   = useState({}) // { typeId: [résultats] }
  const [selectedType, setSelectedType] = useState(null)
  const [showForm, setShowForm]     = useState(false)
  const [newVal, setNewVal]         = useState('')
  const [newDate, setNewDate]       = useState(new Date().toISOString().slice(0, 10))
  const [newNotes, setNewNotes]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  async function init() {
    const { data: sess } = await supabase.auth.getSession()
    const user = sess?.session?.user
    if (!user) return

    const { data: clientData } = await supabase
      .from('clients').select('id, prenom, nom').eq('user_id', user.id).maybeSingle()
    if (!clientData) { setLoading(false); return }
    setClient(clientData)

    const { data: t } = await supabase.from('tests_types').select('*').order('created_at')
    if (!t || t.length === 0) { setLoading(false); return }
    setTypes(t)
    setSelectedType(t[0])

    const { data: r } = await supabase
      .from('tests_resultats').select('*')
      .eq('client_id', clientData.id)
      .order('date', { ascending: true })

    const map = {}
    t.forEach(type => {
      map[type.id] = (r || []).filter(res => res.test_type_id === type.id)
    })
    setResultats(map)
    setLoading(false)
  }

  async function submit() {
    if (!newVal || !selectedType || !client) return
    setSaving(true)
    const { data, error } = await supabase.from('tests_resultats').insert({
      test_type_id: selectedType.id,
      client_id: client.id,
      valeur: parseFloat(newVal),
      date: newDate,
      notes: newNotes || null,
    }).select().single()
    if (error) { alert(error.message); setSaving(false); return }

    setResultats(prev => ({
      ...prev,
      [selectedType.id]: [...(prev[selectedType.id] || []), data].sort((a, b) => a.date.localeCompare(b.date)),
    }))
    setNewVal(''); setNewNotes(''); setNewDate(new Date().toISOString().slice(0, 10))
    setShowForm(false)
    setSaving(false)
  }

  async function deleteResult(id) {
    if (!window.confirm('Supprimer ce résultat ?')) return
    await supabase.from('tests_resultats').delete().eq('id', id)
    setResultats(prev => ({
      ...prev,
      [selectedType.id]: prev[selectedType.id].filter(r => r.id !== id),
    }))
  }

  if (loading) return <PageLoading />

  const currentResults = selectedType ? (resultats[selectedType.id] || []) : []
  const graphData = currentResults.map(r => ({ date: r.date, valeur: Number(r.valeur) }))
  const best = currentResults.length ? Math.max(...currentResults.map(r => Number(r.valeur))) : null
  const last = currentResults.length ? currentResults[currentResults.length - 1] : null

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/client/accueil')} style={S.backBtn}>‹</button>
        <span style={S.logo}>AW<span style={{ color: '#e4f816' }}>prepa</span></span>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={S.sup}>Mes résultats</p>
          <h1 style={S.title}>Tests physiques</h1>
        </div>

        {types.length === 0 ? (
          <div style={S.emptyCard}>Aucun test configuré par ton coach pour le moment.</div>
        ) : (
          <>
            {/* Sélecteur de type */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {types.map(t => (
                <button key={t.id} onClick={() => { setSelectedType(t); setShowForm(false) }}
                  style={{ ...S.typeTab, background: selectedType?.id === t.id ? '#333333' : 'white', color: selectedType?.id === t.id ? '#e4f816' : '#6b7280', border: selectedType?.id === t.id ? 'none' : '1.5px solid #e5e7eb' }}>
                  {t.nom}{t.unite ? ` (${t.unite})` : ''}
                </button>
              ))}
            </div>

            {selectedType && (
              <>
                {/* Stats rapides */}
                {currentResults.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={S.statCard}>
                      <p style={S.statLabel}>Dernier</p>
                      <p style={S.statVal}>{last?.valeur}<span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 2 }}>{selectedType.unite}</span></p>
                    </div>
                    <div style={S.statCard}>
                      <p style={S.statLabel}>Meilleur</p>
                      <p style={S.statVal}>{best}<span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 2 }}>{selectedType.unite}</span></p>
                    </div>
                    <div style={S.statCard}>
                      <p style={S.statLabel}>Tests</p>
                      <p style={S.statVal}>{currentResults.length}</p>
                    </div>
                  </div>
                )}

                {/* Graphique */}
                {graphData.length >= 2 && (
                  <div style={S.card}>
                    <p style={S.cardLabel}>Progression</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={graphData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} formatter={v => [`${v} ${selectedType.unite || ''}`, 'Résultat']} />
                        <Line type="monotone" dataKey="valeur" stroke="#333333" strokeWidth={2.5} dot={{ r: 5, fill: '#e4f816', stroke: '#333333', strokeWidth: 2 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Formulaire ajout */}
                <div style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showForm ? '1rem' : 0 }}>
                    <p style={S.cardLabel}>Ajouter un résultat</p>
                    <button onClick={() => setShowForm(v => !v)} style={S.btn}>
                      {showForm ? '✕ Annuler' : '+ Nouveau'}
                    </button>
                  </div>
                  {showForm && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <label style={S.label}>Valeur {selectedType.unite ? `(${selectedType.unite})` : ''}</label>
                        <input type="number" step="0.01" value={newVal} onChange={e => setNewVal(e.target.value)}
                          placeholder="0" autoFocus style={S.input} />
                      </div>
                      <div>
                        <label style={S.label}>Date</label>
                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={S.input} />
                      </div>
                      <div>
                        <label style={S.label}>Notes (optionnel)</label>
                        <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Contexte, conditions…" style={S.input} />
                      </div>
                      <button onClick={submit} disabled={!newVal || saving}
                        style={{ ...S.btnPrimary, opacity: !newVal || saving ? 0.5 : 1 }}>
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Historique */}
                {currentResults.length > 0 && (
                  <div style={S.listCard}>
                    <p style={S.listHeader}>HISTORIQUE</p>
                    {[...currentResults].reverse().map((r, i) => (
                      <div key={r.id} style={{ ...S.listRow, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                        <div>
                          <p style={S.rowVal}>{r.valeur} <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: '600' }}>{selectedType.unite}</span></p>
                          <p style={S.rowDate}>
                            {new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            {r.notes && <span style={{ color: '#9ca3af' }}> · {r.notes}</span>}
                          </p>
                        </div>
                        <button onClick={() => deleteResult(r.id)} style={S.deleteBtn}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {currentResults.length === 0 && (
                  <div style={S.emptyCard}>Aucun résultat pour ce test. Ajoute ton premier !</div>
                )}
              </>
            )}
          </>
        )}
      </div>
      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:     { minHeight: '100vh', background: '#efefef', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  centered: { minHeight: '100vh', background: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:   { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:  { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '1.5rem', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  logo:     { color: 'white', fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.5px' },
  content:  { padding: '1.5rem', maxWidth: '480px', margin: '0 auto' },
  sup:      { color: '#9ca3af', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.25rem' },
  title:    { fontSize: '1.5rem', fontWeight: '800', color: '#333333', margin: 0 },
  typeTab:  { padding: '0.45rem 1rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' },
  statCard: { flex: 1, background: 'white', borderRadius: 12, padding: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center' },
  statLabel:{ fontSize: '0.62rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.25rem' },
  statVal:  { fontSize: '1.4rem', fontWeight: '900', color: '#333333', margin: 0 },
  card:     { background: 'white', borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  cardLabel:{ fontSize: '0.7rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  listCard: { background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '0.75rem' },
  listHeader:{ fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.1em', padding: '0.875rem 1.1rem 0.4rem', margin: 0 },
  listRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.1rem' },
  rowVal:   { fontSize: '1.1rem', fontWeight: '800', color: '#333333', margin: '0 0 0.1rem' },
  rowDate:  { fontSize: '0.75rem', color: '#6b7280', margin: 0 },
  emptyCard:{ background: 'white', borderRadius: 14, padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '0.75rem' },
  label:    { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' },
  input:    { width: '100%', padding: '0.65rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', color: '#333333', outline: 'none', boxSizing: 'border-box' },
  btn:      { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.35rem 0.85rem', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' },
  btnPrimary:{ width: '100%', padding: '0.875rem', background: '#333333', color: '#e4f816', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer' },
  deleteBtn:{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem' },
}
