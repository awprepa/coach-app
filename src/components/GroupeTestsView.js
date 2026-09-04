import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const TYPE_LABELS = { vmi: 'VMI', vma: 'VMA', '30m': '30m', '50m': '50m', '30-15': '30-15 IFT' }
const TYPE_UNITS  = { vmi: 'km/h', vma: 'km/h', '30m': 's', '50m': 's', '30-15': '' }

function formatDateShort(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
function formatDateFull(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Suivi des tests physiques d'équipe (VMI/VMA/30m/50m/30-15 IFT…) : tableau
// des derniers résultats de tous les joueurs, courbe d'évolution du groupe,
// courbe d'évolution par joueur, et ajout manuel de résultats (avec date
// libre, pour pouvoir saisir un test après coup à sa vraie date).
export default function GroupeTestsView({ groupeId, accent }) {
  const [joueurs, setJoueurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ joueur_id: '', type: '', valeur: '', date: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [groupeId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('groupe_joueurs')
      .select('id, prenom, nom, joueur_tests_physiques(*)')
      .eq('groupe_id', groupeId)
      .order('nom')
    setJoueurs(data || [])
    setLoading(false)
  }

  const availableTypes = useMemo(() => {
    const set = new Set()
    joueurs.forEach(j => (j.joueur_tests_physiques || []).forEach(t => set.add(t.type)))
    return Object.keys(TYPE_LABELS).filter(t => set.has(t))
  }, [joueurs])

  useEffect(() => {
    if (!selectedType && availableTypes.length > 0) setSelectedType(availableTypes[0])
  }, [availableTypes, selectedType])

  // Tableau des derniers résultats, triés du meilleur au moins bon
  const rows = useMemo(() => {
    if (!selectedType) return []
    return joueurs
      .map(j => {
        const tests = (j.joueur_tests_physiques || [])
          .filter(t => t.type === selectedType)
          .sort((a, b) => b.date.localeCompare(a.date))
        return { joueur: j, tests, latest: tests[0] || null }
      })
      .filter(r => r.latest)
      .sort((a, b) => parseFloat(b.latest.valeur) - parseFloat(a.latest.valeur))
  }, [joueurs, selectedType])

  // Évolution du groupe : moyenne à chaque date où au moins un test existe
  const groupChartData = useMemo(() => {
    if (!selectedType) return []
    const byDate = {}
    joueurs.forEach(j => (j.joueur_tests_physiques || []).forEach(t => {
      if (t.type !== selectedType) return
      ;(byDate[t.date] ||= []).push(parseFloat(t.valeur))
    }))
    return Object.entries(byDate)
      .map(([date, vals]) => ({ date, moyenne: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2), n: vals.length }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [joueurs, selectedType])

  useEffect(() => {
    if (rows.length === 0) return
    if (!rows.find(r => r.joueur.id === selectedPlayerId)) setSelectedPlayerId(rows[0].joueur.id)
  }, [rows, selectedPlayerId])

  const playerChartData = useMemo(() => {
    if (!selectedType || !selectedPlayerId) return []
    const j = joueurs.find(j => j.id === selectedPlayerId)
    if (!j) return []
    return (j.joueur_tests_physiques || [])
      .filter(t => t.type === selectedType)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(t => ({ date: t.date, valeur: parseFloat(t.valeur) }))
  }, [joueurs, selectedType, selectedPlayerId])

  function openAdd(joueurId) {
    setAddForm({ joueur_id: joueurId || '', type: selectedType || availableTypes[0] || 'vmi', valeur: '', date: new Date().toISOString().slice(0, 10), notes: '' })
    setShowAdd(true)
  }

  async function submitAdd() {
    if (!addForm.joueur_id || !addForm.type || addForm.valeur === '' || !addForm.date) return
    setSaving(true)
    const { error } = await supabase.from('joueur_tests_physiques').insert({
      joueur_id: addForm.joueur_id,
      type: addForm.type,
      valeur: parseFloat(String(addForm.valeur).replace(',', '.')),
      date: addForm.date,
      notes: addForm.notes || null,
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowAdd(false)
    if (!selectedType) setSelectedType(addForm.type)
    load()
  }

  async function supprimerTest(testId) {
    if (!window.confirm('Supprimer ce résultat ?')) return
    await supabase.from('joueur_tests_physiques').delete().eq('id', testId)
    load()
  }

  const unit = selectedType ? TYPE_UNITS[selectedType] : ''

  return (
    <div>
      <div style={S.head}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {Object.keys(TYPE_LABELS).map(t => {
            const has = availableTypes.includes(t)
            const active = selectedType === t
            return (
              <button key={t} onClick={() => has && setSelectedType(t)} disabled={!has}
                style={{
                  ...S.chip,
                  background: active ? accent : has ? 'white' : '#f9fafb',
                  color: active ? '#1a1a1a' : has ? '#374151' : '#d1d5db',
                  borderColor: active ? accent : '#e5e7eb',
                  cursor: has ? 'pointer' : 'default',
                }}>
                {TYPE_LABELS[t]}
              </button>
            )
          })}
        </div>
        <button onClick={() => openAdd(null)} style={{ ...S.btnAdd, background: accent, borderColor: accent }}>+ Ajouter un résultat</button>
      </div>

      {loading ? (
        <p style={S.empty}>Chargement…</p>
      ) : !selectedType ? (
        <div style={S.panel}>
          <p style={S.empty}>Aucun test physique enregistré pour ce groupe pour l'instant.</p>
        </div>
      ) : (
        <>
          {/* ── Tableau des résultats ── */}
          <div style={{ ...S.panel, marginBottom: '1.25rem' }}>
            <div style={S.panelHead}><span style={S.panelLabel}>Résultats · {TYPE_LABELS[selectedType]}{unit ? ` (${unit})` : ''}</span></div>
            {rows.length === 0 ? (
              <p style={S.empty}>Aucun résultat pour ce test.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      {['Joueur', 'Dernier résultat', 'Date', ''].map((h, i) => (
                        <th key={i} style={{ textAlign: i === 1 ? 'center' : 'left', padding: '0.5rem 1rem', fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const isOpen = expandedId === r.joueur.id
                      return (
                        <Fragment key={r.joueur.id}>
                          <tr onClick={() => setExpandedId(isOpen ? null : r.joueur.id)} style={{ cursor: r.tests.length > 1 ? 'pointer' : 'default' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f3f4f6', fontWeight: 700, color: '#1a1a1a' }}>
                              {r.joueur.prenom} {r.joueur.nom}
                            </td>
                            <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center', fontWeight: 800, color: accent === '#e4f816' ? '#727a0b' : accent }}>
                              {r.latest.valeur}{unit ? ` ${unit}` : ''}
                            </td>
                            <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>
                              {formatDateFull(r.latest.date)}
                            </td>
                            <td style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f3f4f6', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {r.tests.length > 1 && <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 700, marginRight: '0.6rem' }}>{r.tests.length} résultats {isOpen ? '▲' : '▼'}</span>}
                              <button onClick={e => { e.stopPropagation(); openAdd(r.joueur.id) }} style={S.btnMini}>+ Résultat</button>
                            </td>
                          </tr>
                          {isOpen && r.tests.map(t => (
                            <tr key={t.id} style={{ background: '#fafafa' }}>
                              <td style={{ padding: '0.4rem 1rem 0.4rem 2.25rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.78rem', color: '#9ca3af' }}>Historique</td>
                              <td style={{ padding: '0.4rem 1rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>{t.valeur}{unit ? ` ${unit}` : ''}</td>
                              <td style={{ padding: '0.4rem 1rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.78rem', color: '#9ca3af' }}>{formatDateFull(t.date)}</td>
                              <td style={{ padding: '0.4rem 1rem', borderBottom: '1px solid #f3f4f6', textAlign: 'right' }}>
                                <button onClick={e => { e.stopPropagation(); supprimerTest(t.id) }} style={S.btnDeleteMini}>Supprimer</button>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Graphiques ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }} className="gtv-charts">
            <style>{`@media (max-width: 900px){ .gtv-charts{ grid-template-columns:1fr !important; } }`}</style>

            <div style={S.panel}>
              <div style={S.panelHead}><span style={S.panelLabel}>Évolution du groupe</span></div>
              <div style={{ padding: '0 1rem 1rem' }}>
                {groupChartData.length < 2 ? (
                  <p style={S.empty}>Il faut au moins 2 dates de test pour tracer une évolution.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={groupChartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={40} domain={['dataMin - 1', 'dataMax + 1']} />
                      <Tooltip
                        formatter={(v, k, p) => [`${v}${unit ? ' ' + unit : ''} (moy. sur ${p.payload.n})`, 'Moyenne']}
                        labelFormatter={formatDateFull}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: '0.78rem' }}
                      />
                      <Line type="monotone" dataKey="moyenne" stroke={accent} strokeWidth={2.5} dot={{ r: 3, fill: accent }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div style={S.panel}>
              <div style={S.panelHead}>
                <span style={S.panelLabel}>Évolution par joueur</span>
                <select value={selectedPlayerId || ''} onChange={e => setSelectedPlayerId(e.target.value)} style={S.selectSmall}>
                  {rows.map(r => <option key={r.joueur.id} value={r.joueur.id}>{r.joueur.prenom} {r.joueur.nom}</option>)}
                </select>
              </div>
              <div style={{ padding: '0 1rem 1rem' }}>
                {playerChartData.length < 2 ? (
                  <p style={S.empty}>Ce joueur a besoin d'au moins 2 résultats pour tracer une évolution.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={playerChartData} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                      <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={40} domain={['dataMin - 1', 'dataMax + 1']} />
                      <Tooltip
                        formatter={v => [`${v}${unit ? ' ' + unit : ''}`, TYPE_LABELS[selectedType]]}
                        labelFormatter={formatDateFull}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: '0.78rem' }}
                      />
                      <Line type="monotone" dataKey="valeur" stroke={accent} strokeWidth={2.5} dot={{ r: 3, fill: accent }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modale ajout résultat ── */}
      {showAdd && (
        <div style={S.overlay} onClick={() => setShowAdd(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Ajouter un résultat</p>

            <label style={S.label}>Joueur</label>
            <select value={addForm.joueur_id} onChange={e => setAddForm(f => ({ ...f, joueur_id: e.target.value }))} style={{ ...S.input, width: '100%', marginBottom: '0.75rem' }}>
              <option value="">— Choisir —</option>
              {joueurs.map(j => <option key={j.id} value={j.id}>{j.prenom} {j.nom}</option>)}
            </select>

            <label style={S.label}>Test</label>
            <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))} style={{ ...S.input, width: '100%', marginBottom: '0.75rem' }}>
              {Object.entries(TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Résultat{unit ? ` (${TYPE_UNITS[addForm.type]})` : ''}</label>
                <input value={addForm.valeur} onChange={e => setAddForm(f => ({ ...f, valeur: e.target.value }))} placeholder="ex : 18,5" style={{ ...S.input, width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Date</label>
                <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} style={{ ...S.input, width: '100%' }} />
              </div>
            </div>

            <label style={S.label}>Note (optionnel)</label>
            <input value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="ex : test réalisé en intérieur" style={{ ...S.input, width: '100%', marginBottom: '1rem' }} />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowAdd(false)} style={S.btnSecondary}>Annuler</button>
              <button onClick={submitAdd} disabled={saving} style={{ ...S.btnPrimary, background: accent, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.1rem' },
  chip: { border: '1.5px solid #e5e7eb', borderRadius: 999, padding: '0.4rem 0.9rem', fontSize: '0.82rem', fontWeight: 700 },
  btnAdd: { border: '1.5px solid transparent', color: '#1a1a1a', borderRadius: 10, padding: '0.55rem 1rem', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnMini: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', borderRadius: 8, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  btnDeleteMini: { border: 'none', background: 'transparent', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  panel: { background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.9rem 1.1rem 0.7rem' },
  panelLabel: { fontSize: '0.65rem', fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' },
  selectSmall: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.3rem 0.5rem', fontSize: '0.76rem', fontWeight: 700, color: '#374151', background: 'white', outline: 'none' },
  empty: { fontSize: '0.82rem', color: '#9ca3af', padding: '1rem 1.1rem', margin: 0, textAlign: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: 'white', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalTitle: { fontSize: '1.05rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 1.1rem' },
  label: { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' },
  input: { padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#1a1a1a' },
  btnSecondary: { flex: 1, background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' },
  btnPrimary: { flex: 1, color: '#1a1a1a', border: 'none', borderRadius: 10, padding: '0.65rem', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' },
}
