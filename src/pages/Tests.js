import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const LINE_COLORS = ['#333333', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

const labelStyle = { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }
const inputStyle = { width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 9, fontSize: '0.875rem', color: '#333333', outline: 'none', boxSizing: 'border-box' }

export default function Tests() {
  const [types, setTypes]           = useState([])
  const [clients, setClients]       = useState([])
  const [resultats, setResultats]   = useState([])
  const [selectedType, setSelectedType] = useState(null)
  const [showAddType, setShowAddType]   = useState(false)
  const [newTypeNom, setNewTypeNom]     = useState('')
  const [newTypeUnite, setNewTypeUnite] = useState('')
  const [showAddResult, setShowAddResult] = useState(false)
  const [newResult, setNewResult] = useState({ client_id: '', valeur: '', date: new Date().toISOString().slice(0, 10), notes: '' })
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  async function init() {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('tests_types').select('*').order('created_at'),
      supabase.from('clients').select('id, prenom, nom').order('nom'),
    ])
    setTypes(t || [])
    setClients(c || [])
    if (t && t.length > 0) {
      setSelectedType(t[0])
      await fetchResultats(t[0].id)
    }
    setLoading(false)
  }

  async function fetchResultats(typeId) {
    const { data } = await supabase
      .from('tests_resultats')
      .select('*, clients(prenom, nom)')
      .eq('test_type_id', typeId)
      .order('date', { ascending: true })
    setResultats(data || [])
  }

  async function addType() {
    if (!newTypeNom.trim()) return
    const { data, error } = await supabase
      .from('tests_types').insert({ nom: newTypeNom.trim(), unite: newTypeUnite.trim() || null }).select().single()
    if (error) { alert(error.message); return }
    const updated = [...types, data]
    setTypes(updated)
    setSelectedType(data)
    await fetchResultats(data.id)
    setNewTypeNom(''); setNewTypeUnite(''); setShowAddType(false)
  }

  async function deleteType(id) {
    if (!window.confirm('Supprimer ce type de test et tous ses résultats ?')) return
    await supabase.from('tests_types').delete().eq('id', id)
    const updated = types.filter(t => t.id !== id)
    setTypes(updated)
    if (selectedType?.id === id) {
      if (updated.length > 0) { setSelectedType(updated[0]); await fetchResultats(updated[0].id) }
      else { setSelectedType(null); setResultats([]) }
    }
  }

  async function addResult() {
    if (!newResult.client_id || !newResult.valeur || !selectedType) return
    const { error } = await supabase.from('tests_resultats').insert({
      test_type_id: selectedType.id,
      client_id: newResult.client_id,
      valeur: parseFloat(newResult.valeur),
      date: newResult.date,
      notes: newResult.notes || null,
    })
    if (error) { alert(error.message); return }
    await fetchResultats(selectedType.id)
    setNewResult({ client_id: '', valeur: '', date: new Date().toISOString().slice(0, 10), notes: '' })
    setShowAddResult(false)
  }

  async function deleteResult(id) {
    if (!window.confirm('Supprimer ce résultat ?')) return
    await supabase.from('tests_resultats').delete().eq('id', id)
    setResultats(resultats.filter(r => r.id !== id))
  }

  // Données graphique : une ligne par client, X = date
  const clientNames = [...new Set(resultats.map(r => r.clients ? `${r.clients.prenom} ${r.clients.nom}` : ''))]
  const allDates = [...new Set(resultats.map(r => r.date))].sort()
  const graphData = allDates.map(date => {
    const point = { date }
    resultats.filter(r => r.date === date).forEach(r => {
      if (r.clients) point[`${r.clients.prenom} ${r.clients.nom}`] = Number(r.valeur)
    })
    return point
  })

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>Chargement...</div>

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.pageTitle}>Tests physiques</h1>
          <p style={S.pageSubtitle}>{types.length} type{types.length > 1 ? 's' : ''} de test</p>
        </div>
      </div>

      {/* Onglets types de tests */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        {types.map(t => (
          <div key={t.id} style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              onClick={async () => { setSelectedType(t); await fetchResultats(t.id) }}
              style={{ ...S.typeTab, background: selectedType?.id === t.id ? '#333333' : '#f3f4f6', color: selectedType?.id === t.id ? '#e4f816' : '#6b7280' }}>
              {t.nom}{t.unite ? ` (${t.unite})` : ''}
            </button>
            <button onClick={() => deleteType(t.id)}
              style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: '#f3f4f6', border: 'none', color: '#9ca3af', fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
          </div>
        ))}

        {showAddType ? (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input autoFocus value={newTypeNom} onChange={e => setNewTypeNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addType()}
              placeholder="Nom du test..." style={{ padding: '0.4rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none', width: 140 }} />
            <input value={newTypeUnite} onChange={e => setNewTypeUnite(e.target.value)}
              placeholder="Unité (kg, s, m…)" style={{ padding: '0.4rem 0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: '0.85rem', outline: 'none', width: 130 }} />
            <button onClick={addType} style={S.btnSm}>OK</button>
            <button onClick={() => setShowAddType(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowAddType(true)} style={S.addTypeBtn}>+ Nouveau test</button>
        )}
      </div>

      {!selectedType ? (
        <div style={S.emptyCard}>Crée un type de test pour commencer.</div>
      ) : (
        <>
          {/* Formulaire ajout résultat */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAddResult ? '1rem' : 0 }}>
              <p style={S.cardLabel}>Ajouter un résultat</p>
              <button onClick={() => setShowAddResult(v => !v)} style={S.btnSm}>
                {showAddResult ? '✕ Annuler' : '+ Ajouter'}
              </button>
            </div>
            {showAddResult && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Client</label>
                  <select value={newResult.client_id} onChange={e => setNewResult(v => ({ ...v, client_id: e.target.value }))} style={inputStyle}>
                    <option value="">Sélectionner…</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Valeur {selectedType.unite ? `(${selectedType.unite})` : ''}</label>
                  <input type="number" step="0.01" value={newResult.valeur} onChange={e => setNewResult(v => ({ ...v, valeur: e.target.value }))} placeholder="0" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={newResult.date} onChange={e => setNewResult(v => ({ ...v, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <input value={newResult.notes} onChange={e => setNewResult(v => ({ ...v, notes: e.target.value }))} placeholder="Optionnel" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <button onClick={addResult} style={S.btnPrimary}>Enregistrer</button>
                </div>
              </div>
            )}
          </div>

          {/* Graphique évolution */}
          {graphData.length >= 2 && (
            <div style={S.card}>
              <p style={S.cardLabel}>Évolution</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={graphData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit={selectedType.unite ? ` ${selectedType.unite}` : ''} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '0.8rem' }} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  {clientNames.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Liste des résultats */}
          <div style={S.listCard}>
            <p style={S.listHeader}>RÉSULTATS · {resultats.length}</p>
            {resultats.length === 0 ? (
              <p style={{ color: '#9ca3af', padding: '1.5rem', textAlign: 'center' }}>Aucun résultat pour ce test.</p>
            ) : (
              [...resultats].reverse().map((r, i) => (
                <div key={r.id} style={{ ...S.listRow, borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <div>
                    <p style={S.clientName}>{r.clients?.prenom} {r.clients?.nom}</p>
                    <p style={S.clientSub}>
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {r.notes && <span style={{ color: '#9ca3af' }}> · {r.notes}</span>}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={S.valeur}>
                      {r.valeur}
                      {selectedType.unite && <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginLeft: 2 }}>{selectedType.unite}</span>}
                    </span>
                    <button onClick={() => deleteResult(r.id)} style={S.deleteBtn}>✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

const S = {
  page:        { padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  pageHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  pageTitle:   { fontSize: '1.75rem', fontWeight: '800', color: '#333333', margin: 0 },
  pageSubtitle:{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' },
  typeTab:     { padding: '0.45rem 1rem', borderRadius: '999px', border: 'none', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' },
  addTypeBtn:  { padding: '0.45rem 1rem', borderRadius: '999px', border: '1.5px dashed #d1d5db', background: 'white', color: '#9ca3af', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' },
  card:        { background: 'white', borderRadius: 16, padding: '1.25rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  cardLabel:   { fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  listCard:    { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  listHeader:  { fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', letterSpacing: '0.1em', padding: '1rem 1.5rem 0.5rem', margin: 0 },
  listRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.5rem' },
  clientName:  { fontWeight: '700', fontSize: '0.9rem', color: '#333333', margin: '0 0 0.1rem' },
  clientSub:   { fontSize: '0.78rem', color: '#6b7280', margin: 0 },
  valeur:      { fontSize: '1.2rem', fontWeight: '800', color: '#333333' },
  emptyCard:   { background: 'white', borderRadius: 16, padding: '2rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  btnPrimary:  { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.7rem', width: '100%', fontWeight: '700', fontSize: '0.9rem', cursor: 'pointer' },
  btnSm:       { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '0.35rem 0.85rem', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' },
  deleteBtn:   { background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem' },
}
