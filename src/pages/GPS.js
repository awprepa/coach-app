import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer
} from 'recharts'

// ── MÉTRIQUES DISPONIBLES ──────────────────────────────────────────────────
const METRICS = [
  { key: 'distance',     label: 'Distance',        unit: 'm',     group: 'Volume',   def: true  },
  { key: 'duree',        label: 'Durée',            unit: '',      group: 'Volume',   def: true  },
  { key: 'm_min',        label: 'm/min',            unit: '',      group: 'Volume',   def: true  },
  { key: 'dist_marche',  label: 'Dist. marchée',    unit: 'm',     group: 'Volume',   def: false },
  { key: 'vmax',         label: 'Vmax',             unit: 'km/h',  group: 'Vitesse',  def: true  },
  { key: 'dist_v20',     label: 'Dist >20 km/h',    unit: 'm',     group: 'Vitesse',  def: true  },
  { key: 'dist_v21',     label: 'Dist >21 km/h',    unit: 'm',     group: 'Vitesse',  def: false },
  { key: 'dist_v29',     label: 'Dist >29 km/h',    unit: 'm',     group: 'Vitesse',  def: false },
  { key: 'player_load',  label: 'Player Load',      unit: '',      group: 'Charge',   def: true  },
  { key: 'pl_min',       label: 'PL/min',           unit: '',      group: 'Charge',   def: false },
  { key: 'nb_acc_25',    label: 'Nb Acc >2,5',      unit: '',      group: 'Acc/Déc',  def: true  },
  { key: 'nb_dec_25',    label: 'Nb Déc >2,5',      unit: '',      group: 'Acc/Déc',  def: true  },
  { key: 'nb_acc_35',    label: 'Nb Acc >3,5',      unit: '',      group: 'Acc/Déc',  def: false },
  { key: 'dist_acc_25',  label: 'Dist Acc >2,5',    unit: 'm',     group: 'Acc/Déc',  def: false },
  { key: 'fc_max',       label: 'FC Max',           unit: 'bpm',   group: 'Cardio',   def: true  },
  { key: 'fc_moy',       label: 'FC Moy',           unit: 'bpm',   group: 'Cardio',   def: true  },
]

const GROUPS = ['Volume', 'Vitesse', 'Charge', 'Acc/Déc', 'Cardio']

// Colonnes Catapult → clés métriques
const COL_MAP = {
  'Player Name':                               '_joueur',
  'Period Name':                               '_periode_nom',
  'Period Number':                             '_periode_num',
  'Distance':                                  'distance',
  'D seance':                                  'duree',
  'm/min':                                     'm_min',
  'Distance marchée':                          'dist_marche',
  'VMax':                                      'vmax',
  'Total Player Load':                         'player_load',
  'Player Load Per Minute':                    'pl_min',
  'FC Max':                                    'fc_max',
  'FC Moy':                                    'fc_moy',
  'Nb Acc > 2,5':                              'nb_acc_25',
  'Nb Decel > 2,5':                            'nb_dec_25',
  'Nb Acc > 3,5':                              'nb_acc_35',
  'Distance Acc > 2,5':                        'dist_acc_25',
  'Distance accéleration > 2,5 m/s² (m)':     'dist_acc_25',
  'Distance > 20 km/h':                        'dist_v20',
  'Dist > 21 km/h + (m)':                      'dist_v21',
  'Distance > 29 km/h':                        'dist_v29',
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function formatDuration(val) {
  if (!val && val !== 0) return '—'
  if (typeof val === 'string' && val.includes(':')) return val
  if (val instanceof Date) {
    const h = val.getUTCHours(), m = val.getUTCMinutes(), s = val.getUTCSeconds()
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }
  if (typeof val === 'number') {
    const t = Math.round(val * 86400)
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }
  return String(val)
}

function round2(v) { return typeof v === 'number' ? Math.round(v * 10) / 10 : v }

function parseSheet(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })
  if (!data || data.length < 2) return []
  const headers = data[0]
  const colIdx = {}
  headers.forEach((h, i) => { if (h && COL_MAP[h]) colIdx[COL_MAP[h]] = i })
  const rows = []
  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    const joueur = colIdx['_joueur'] !== undefined ? row[colIdx['_joueur']] : null
    if (!joueur) continue
    const obj = { joueur }
    obj.periode_nom = colIdx['_periode_nom'] !== undefined ? String(row[colIdx['_periode_nom']] || '') : ''
    obj.periode_num = colIdx['_periode_num'] !== undefined ? Number(row[colIdx['_periode_num']] ?? 0) : 0
    METRICS.forEach(({ key }) => {
      if (colIdx[key] !== undefined) {
        let v = row[colIdx[key]]
        if (key === 'duree') v = formatDuration(v)
        else v = round2(v)
        obj[key] = (v === null || v === undefined) ? null : v
      }
    })
    rows.push(obj)
  }
  return rows
}

function deriveSessionInfo(sheetName, fileName) {
  // e.g. "s10-rugby-volume-u16-04032025"
  const match = sheetName?.match(/(\d{2})(\d{2})(\d{4})$/)
  if (match) {
    const date = `${match[3]}-${match[2]}-${match[1]}`
    const type = sheetName.includes('vitesse') ? 'Vitesse' : sheetName.includes('volume') ? 'Volume' : ''
    return { date, type, nom: sheetName }
  }
  return { date: new Date().toISOString().slice(0, 10), type: '', nom: fileName.replace(/\.[^.]+$/, '') }
}

async function parseFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sessions = []
  for (const sName of wb.SheetNames) {
    if (['TDB', 'BDD'].includes(sName)) continue
    const ws = wb.Sheets[sName]
    const lignes = parseSheet(ws)
    if (!lignes.length) continue
    const info = deriveSessionInfo(sName, file.name)
    sessions.push({ ...info, lignes })
  }
  // Single sheet or CSV
  if (!sessions.length) {
    const ws = wb.Sheets[wb.SheetNames[0]]
    const lignes = parseSheet(ws)
    if (lignes.length) {
      sessions.push({ date: new Date().toISOString().slice(0, 10), type: '', nom: file.name.replace(/\.[^.]+$/, ''), lignes })
    }
  }
  return sessions
}

const BAR_COLORS = ['#e4f816', '#60a5fa', '#f472b6', '#34d399', '#fb923c', '#a78bfa', '#f87171']

// ── COMPOSANT PRINCIPAL ────────────────────────────────────────────────────
export default function GPS() {
  const [rapports, setRapports]         = useState([])
  const [selected, setSelected]         = useState(null)
  const [mode, setMode]                 = useState('tableau')      // tableau | graphiques | comparer
  const [showPeriodes, setShowPeriodes] = useState(false)
  const [visibleMetrics, setVisible]    = useState(() => METRICS.filter(m => m.def).map(m => m.key))
  const [showMetaCfg, setShowMetaCfg]   = useState(false)
  const [sortCol, setSortCol]           = useState(null)
  const [sortDir, setSortDir]           = useState('asc')
  const [chartMetric, setChartMetric]   = useState('distance')
  const [cmpSessions, setCmpSessions]   = useState([])
  const [cmpJoueurs, setCmpJoueurs]     = useState([])
  const [cmpMetric, setCmpMetric]       = useState('distance')
  const [cmpType, setCmpType]           = useState('bar')          // bar | line
  const [importing, setImporting]       = useState(false)
  const [preview, setPreview]           = useState(null)           // sessions parsed avant sauvegarde
  const [clients, setClients]           = useState([])
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true)
    const [{ data: rpts }, { data: cls }] = await Promise.all([
      supabase.from('gps_rapports').select('id,nom,date,type,created_at,lignes').order('date', { ascending: false }),
      supabase.from('clients').select('id,prenom,nom'),
    ])
    setRapports(rpts || [])
    setClients(cls || [])
    setLoading(false)
  }

  function matchClient(joueur) {
    if (!joueur) return null
    const parts = joueur.trim().split(/\s+/)
    if (parts.length < 2) return null
    const [nom, ...prenomParts] = parts
    const prenom = prenomParts.join(' ')
    return clients.find(c =>
      c.nom?.toUpperCase() === nom.toUpperCase() &&
      c.prenom?.toUpperCase() === prenom.toUpperCase()
    ) || null
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    try {
      const sessions = await parseFile(file)
      setPreview(sessions)
    } catch (err) {
      alert('Erreur de lecture : ' + err.message)
    }
    setImporting(false)
    e.target.value = ''
  }

  async function sauvegarderPreview() {
    if (!preview?.length) return
    setImporting(true)
    for (const s of preview) {
      const lignes = s.lignes.map(l => ({ ...l, client_id: matchClient(l.joueur)?.id || null }))
      const { data, error } = await supabase.from('gps_rapports').insert({ nom: s.nom, date: s.date, type: s.type, lignes }).select().single()
      if (!error && data) setRapports(prev => [data, ...prev])
    }
    setPreview(null)
    setImporting(false)
  }

  async function supprimerRapport(id) {
    if (!window.confirm('Supprimer ce rapport ?')) return
    await supabase.from('gps_rapports').delete().eq('id', id)
    setRapports(r => r.filter(x => x.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  // Lignes filtrées selon toggle total/périodes
  const lignes = selected?.lignes || []
  const lignesFiltrees = showPeriodes
    ? lignes.filter(l => l.periode_num > 0)
    : lignes.filter(l => l.periode_num === 0)

  // Tri
  const lignesTri = [...lignesFiltrees].sort((a, b) => {
    if (!sortCol) return 0
    const va = a[sortCol] ?? -Infinity, vb = b[sortCol] ?? -Infinity
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
  })

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  // Joueurs uniques dans la session sélectionnée
  const joueurs = [...new Set(lignes.filter(l => l.periode_num === 0).map(l => l.joueur))]

  // Données graphiques session
  const chartData = lignesFiltrees
    .filter(l => l[chartMetric] != null)
    .map(l => ({ name: l.joueur.split(' ')[0] + '\n' + l.joueur.split(' ').slice(1).join(' '), val: l[chartMetric], periode: l.periode_nom }))

  // ── Données comparaison ────────────────────────────────────────────────
  const cmpRapportsList = rapports.filter(r => r.id !== selected?.id)
  const allCmpJoueurs   = [...new Set(
    [selected, ...rapports.filter(r => cmpSessions.includes(r.id))]
      .filter(Boolean)
      .flatMap(r => (r.lignes || []).filter(l => l.periode_num === 0).map(l => l.joueur))
  )]

  const cmpData = (() => {
    const sessions = [selected, ...rapports.filter(r => cmpSessions.includes(r.id))].filter(Boolean)
    const joueursToShow = cmpJoueurs.length ? cmpJoueurs : allCmpJoueurs.slice(0, 8)
    if (cmpType === 'bar') {
      return joueursToShow.map(j => {
        const obj = { name: j.split(' ')[0] }
        sessions.forEach(s => {
          const l = (s.lignes || []).find(x => x.joueur === j && x.periode_num === 0)
          obj[s.nom] = l?.[cmpMetric] ?? null
        })
        return obj
      })
    } else {
      // Line: X = sessions, series = joueurs
      return sessions.map(s => {
        const obj = { name: s.nom.slice(0, 20) }
        joueursToShow.forEach(j => {
          const l = (s.lignes || []).find(x => x.joueur === j && x.periode_num === 0)
          obj[j.split(' ')[0]] = l?.[cmpMetric] ?? null
        })
        return obj
      })
    }
  })()

  const cmpSessionsList = [selected, ...rapports.filter(r => cmpSessions.includes(r.id))].filter(Boolean)

  const metricInfo = k => METRICS.find(m => m.key === k) || { label: k, unit: '' }

  // ── RENDU ──────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* ── SIDEBAR ── */}
      <div style={S.sidebar}>
        <div style={S.sideHeader}>
          <span style={S.sideTitle}>Rapports GPS</span>
          <label style={S.uploadBtn}>
            {importing ? '…' : '+ Importer'}
            <input type="file" accept=".csv,.xlsx,.xlsm,.xls" onChange={handleFile} style={{ display: 'none' }} />
          </label>
        </div>

        {/* PREVIEW avant sauvegarde */}
        {preview && (
          <div style={S.previewBox}>
            <div style={S.previewTitle}>Aperçu — {preview.length} session(s)</div>
            {preview.map((s, i) => (
              <div key={i} style={S.previewRow}>
                <div style={{ fontWeight: '700', fontSize: '0.8rem' }}>{s.nom}</div>
                <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{s.date} · {s.lignes.length} lignes</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button onClick={sauvegarderPreview} style={S.btnSave}>Sauvegarder</button>
              <button onClick={() => setPreview(null)} style={S.btnCancel}>Annuler</button>
            </div>
          </div>
        )}

        {loading ? <p style={S.dimText}>Chargement…</p> : null}

        <div style={S.sideList}>
          {rapports.map(r => (
            <div key={r.id} onClick={() => { setSelected(r); setMode('tableau') }}
              style={{ ...S.sideItem, ...(selected?.id === r.id ? S.sideItemActive : {}) }}>
              <div style={S.sideItemName}>{r.nom}</div>
              <div style={S.sideItemMeta}>
                {r.date} {r.type ? `· ${r.type}` : ''}
                · {r.lignes?.filter(l => l.periode_num === 0).length || 0} joueurs
              </div>
              <button onClick={e => { e.stopPropagation(); supprimerRapport(r.id) }} style={S.deleteBtn}>✕</button>
            </div>
          ))}
          {!loading && !rapports.length && <p style={S.dimText}>Aucun rapport. Importez un fichier Catapult.</p>}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={S.main}>
        {!selected ? (
          <div style={S.empty}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#374151' }}>Données GPS</div>
            <div style={{ color: '#9ca3af', marginTop: '0.5rem' }}>Importez un rapport Catapult ou sélectionnez une session</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={S.mainHeader}>
              <div>
                <div style={S.mainTitle}>{selected.nom}</div>
                <div style={S.mainMeta}>{selected.date}{selected.type ? ` · ${selected.type}` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Toggle total / périodes */}
                <div style={S.toggle}>
                  <button onClick={() => setShowPeriodes(false)} style={{ ...S.toggleBtn, ...(showPeriodes ? {} : S.toggleActive) }}>Session</button>
                  <button onClick={() => setShowPeriodes(true)}  style={{ ...S.toggleBtn, ...(showPeriodes ? S.toggleActive : {}) }}>Périodes</button>
                </div>
                <button onClick={() => setShowMetaCfg(v => !v)} style={S.cfgBtn}>⚙ Métriques</button>
              </div>
            </div>

            {/* Config métriques */}
            {showMetaCfg && (
              <div style={S.metaCfg}>
                {GROUPS.map(g => (
                  <div key={g} style={{ marginBottom: '0.75rem' }}>
                    <div style={S.metaGroup}>{g}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.3rem' }}>
                      {METRICS.filter(m => m.group === g).map(m => (
                        <label key={m.key} style={{ ...S.metaChip, ...(visibleMetrics.includes(m.key) ? S.metaChipOn : {}) }}>
                          <input type="checkbox" checked={visibleMetrics.includes(m.key)}
                            onChange={e => setVisible(v => e.target.checked ? [...v, m.key] : v.filter(k => k !== m.key))}
                            style={{ display: 'none' }} />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div style={S.tabs}>
              {['tableau', 'graphiques', 'comparer'].map(t => (
                <button key={t} onClick={() => setMode(t)}
                  style={{ ...S.tab, ...(mode === t ? S.tabActive : {}) }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* ── TABLEAU ── */}
            {mode === 'tableau' && (
              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, ...S.thSticky }}>Joueur</th>
                      {showPeriodes && <th style={S.th}>Période</th>}
                      {visibleMetrics.map(k => {
                        const m = metricInfo(k)
                        return (
                          <th key={k} style={{ ...S.th, cursor: 'pointer' }} onClick={() => toggleSort(k)}>
                            {m.label}{m.unit ? ` (${m.unit})` : ''}
                            {sortCol === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {lignesTri.map((l, i) => {
                      const client = matchClient(l.joueur)
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                          <td style={{ ...S.td, ...S.tdSticky, fontWeight: '600' }}>
                            {l.joueur}
                            {client && <span style={S.clientBadge}>✓</span>}
                          </td>
                          {showPeriodes && <td style={S.td}>{l.periode_nom}</td>}
                          {visibleMetrics.map(k => (
                            <td key={k} style={{ ...S.td, textAlign: 'right' }}>
                              {l[k] != null ? l[k] : <span style={{ color: '#d1d5db' }}>—</span>}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                    {/* Ligne moyenne */}
                    {!showPeriodes && (
                      <tr style={{ background: '#111827', fontWeight: '700' }}>
                        <td style={{ ...S.td, ...S.tdSticky, color: '#e4f816', background: '#111827' }}>MOYENNE</td>
                        {visibleMetrics.map(k => {
                          const vals = lignesFiltrees.map(l => l[k]).filter(v => typeof v === 'number')
                          const avg = vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null
                          return <td key={k} style={{ ...S.td, textAlign: 'right', color: '#e4f816' }}>{avg ?? '—'}</td>
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── GRAPHIQUES ── */}
            {mode === 'graphiques' && (
              <div style={S.chartSection}>
                <div style={S.chartToolbar}>
                  <span style={S.dimText}>Métrique :</span>
                  <select value={chartMetric} onChange={e => setChartMetric(e.target.value)} style={S.select}>
                    {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}{m.unit ? ` (${m.unit})` : ''}</option>)}
                  </select>
                </div>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <Tooltip formatter={(v) => [v, metricInfo(chartMetric).label]} />
                    <Bar dataKey="val" fill="#e4f816" radius={[4, 4, 0, 0]} name={metricInfo(chartMetric).label} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── COMPARER ── */}
            {mode === 'comparer' && (
              <div style={S.cmpSection}>
                <div style={S.cmpConfig}>
                  {/* Sessions à comparer */}
                  <div style={S.cmpBlock}>
                    <div style={S.cmpBlockTitle}>Sessions à comparer</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <span style={S.cmpFixed}>{selected.nom} (actuelle)</span>
                      {cmpRapportsList.map(r => (
                        <label key={r.id} style={{ ...S.metaChip, ...(cmpSessions.includes(r.id) ? S.metaChipOn : {}) }}>
                          <input type="checkbox" checked={cmpSessions.includes(r.id)}
                            onChange={e => setCmpSessions(v => e.target.checked ? [...v, r.id] : v.filter(x => x !== r.id))}
                            style={{ display: 'none' }} />
                          {r.nom}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Joueurs */}
                  <div style={S.cmpBlock}>
                    <div style={S.cmpBlockTitle}>Joueurs <span style={S.dimText}>(vide = tous)</span></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {allCmpJoueurs.map(j => (
                        <label key={j} style={{ ...S.metaChip, ...(cmpJoueurs.includes(j) ? S.metaChipOn : {}) }}>
                          <input type="checkbox" checked={cmpJoueurs.includes(j)}
                            onChange={e => setCmpJoueurs(v => e.target.checked ? [...v, j] : v.filter(x => x !== j))}
                            style={{ display: 'none' }} />
                          {j.split(' ')[0]}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Métrique + type */}
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={S.cmpBlock}>
                      <div style={S.cmpBlockTitle}>Métrique</div>
                      <select value={cmpMetric} onChange={e => setCmpMetric(e.target.value)} style={S.select}>
                        {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}{m.unit ? ` (${m.unit})` : ''}</option>)}
                      </select>
                    </div>
                    <div style={S.cmpBlock}>
                      <div style={S.cmpBlockTitle}>Type</div>
                      <div style={S.toggle}>
                        <button onClick={() => setCmpType('bar')}  style={{ ...S.toggleBtn, ...(cmpType === 'bar'  ? S.toggleActive : {}) }}>Barres</button>
                        <button onClick={() => setCmpType('line')} style={{ ...S.toggleBtn, ...(cmpType === 'line' ? S.toggleActive : {}) }}>Courbes</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Graphique comparaison */}
                <ResponsiveContainer width="100%" height={360}>
                  {cmpType === 'bar' ? (
                    <BarChart data={cmpData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} angle={-20} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <Tooltip />
                      <Legend />
                      {cmpSessionsList.map((s, i) => (
                        <Bar key={s.id} dataKey={s.nom} fill={BAR_COLORS[i % BAR_COLORS.length]} radius={[3, 3, 0, 0]} />
                      ))}
                    </BarChart>
                  ) : (
                    <LineChart data={cmpData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} angle={-20} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <Tooltip />
                      <Legend />
                      {(cmpJoueurs.length ? cmpJoueurs : allCmpJoueurs.slice(0, 8)).map((j, i) => (
                        <Line key={j} type="monotone" dataKey={j.split(' ')[0]}
                          stroke={BAR_COLORS[i % BAR_COLORS.length]} strokeWidth={2}
                          dot={{ r: 4 }} connectNulls />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const S = {
  page:          { display: 'flex', minHeight: '100vh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  sidebar:       { width: '280px', minWidth: '280px', background: '#111827', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1f2937' },
  sideHeader:    { padding: '1.25rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2937' },
  sideTitle:     { color: 'white', fontWeight: '800', fontSize: '0.95rem' },
  uploadBtn:     { background: '#e4f816', color: '#111827', border: 'none', borderRadius: '8px', padding: '0.4rem 0.8rem', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' },
  sideList:      { flex: 1, overflowY: 'auto', padding: '0.5rem' },
  sideItem:      { padding: '0.75rem 0.85rem', borderRadius: '10px', marginBottom: '0.25rem', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' },
  sideItemActive:{ background: 'rgba(228,248,22,0.1)', border: '1px solid rgba(228,248,22,0.3)' },
  sideItemName:  { color: 'white', fontWeight: '700', fontSize: '0.82rem', marginBottom: '0.2rem', paddingRight: '1.5rem' },
  sideItemMeta:  { color: '#6b7280', fontSize: '0.73rem' },
  deleteBtn:     { position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'transparent', border: 'none', color: '#4b5563', fontSize: '0.75rem', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' },
  previewBox:    { margin: '0.75rem', background: '#1f2937', borderRadius: '10px', padding: '0.9rem' },
  previewTitle:  { color: '#e4f816', fontWeight: '700', fontSize: '0.8rem', marginBottom: '0.5rem' },
  previewRow:    { marginBottom: '0.4rem', paddingBottom: '0.4rem', borderBottom: '1px solid #374151' },
  btnSave:       { flex: 1, background: '#e4f816', color: '#111827', border: 'none', borderRadius: '7px', padding: '0.4rem', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' },
  btnCancel:     { flex: 1, background: '#374151', color: 'white', border: 'none', borderRadius: '7px', padding: '0.4rem', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' },
  dimText:       { color: '#6b7280', fontSize: '0.8rem', padding: '1rem', textAlign: 'center' },
  main:          { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  empty:         { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' },
  mainHeader:    { background: 'linear-gradient(135deg,#111827,#1f2937)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' },
  mainTitle:     { color: 'white', fontWeight: '800', fontSize: '1.1rem', marginBottom: '0.2rem' },
  mainMeta:      { color: '#9ca3af', fontSize: '0.8rem' },
  toggle:        { display: 'flex', background: 'rgba(255,255,255,0.07)', borderRadius: '8px', padding: '3px' },
  toggleBtn:     { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.55)', padding: '0.3rem 0.8rem', borderRadius: '6px', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' },
  toggleActive:  { background: '#e4f816', color: '#111827' },
  cfgBtn:        { background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '8px', padding: '0.4rem 0.9rem', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' },
  metaCfg:       { background: 'white', borderBottom: '1px solid #e5e7eb', padding: '1rem 1.5rem' },
  metaGroup:     { fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' },
  metaChip:      { display: 'inline-block', padding: '0.25rem 0.65rem', borderRadius: '999px', border: '1.5px solid #e5e7eb', fontSize: '0.78rem', fontWeight: '600', color: '#374151', cursor: 'pointer', userSelect: 'none' },
  metaChipOn:    { background: '#111827', color: '#e4f816', borderColor: '#111827' },
  tabs:          { display: 'flex', background: 'white', borderBottom: '1px solid #e5e7eb', padding: '0 1.5rem' },
  tab:           { background: 'transparent', border: 'none', borderBottom: '2.5px solid transparent', color: '#6b7280', fontWeight: '600', fontSize: '0.875rem', padding: '0.85rem 1rem', cursor: 'pointer' },
  tabActive:     { color: '#111827', borderBottomColor: '#e4f816' },
  tableWrap:     { flex: 1, overflow: 'auto', padding: '1rem 1.5rem' },
  table:         { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th:            { background: '#f9fafb', padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: '700', fontSize: '0.75rem', color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' },
  thSticky:      { position: 'sticky', left: 0, zIndex: 2, background: '#f9fafb' },
  td:            { padding: '0.55rem 0.75rem', borderBottom: '1px solid #f3f4f6', color: '#111827', whiteSpace: 'nowrap' },
  tdSticky:      { position: 'sticky', left: 0, zIndex: 1, background: 'inherit' },
  clientBadge:   { marginLeft: '0.4rem', fontSize: '0.65rem', color: '#10b981', fontWeight: '700' },
  chartSection:  { flex: 1, padding: '1.5rem', overflow: 'auto' },
  chartToolbar:  { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' },
  select:        { border: '1.5px solid #e5e7eb', borderRadius: '8px', padding: '0.4rem 0.7rem', fontSize: '0.85rem', background: 'white', color: '#111827', fontWeight: '600' },
  cmpSection:    { flex: 1, padding: '1.5rem', overflow: 'auto' },
  cmpConfig:     { background: 'white', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '1rem' },
  cmpBlock:      { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  cmpBlockTitle: { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' },
  cmpFixed:      { display: 'inline-block', padding: '0.25rem 0.65rem', borderRadius: '999px', background: '#111827', color: '#e4f816', fontSize: '0.78rem', fontWeight: '700' },
}
