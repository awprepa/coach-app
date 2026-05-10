import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

// Charge d'entraînement = RPE réel × durée estimée (on approx. 60 min par séance)
// Ou simplement somme des RPE réels par semaine (ACWR = charge aiguë / charge chronique)

export default function ChargeEntrainement() {
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [data, setData] = useState([]) // { semaine, rpe_reel, nb_seances, charge }[]
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, prenom, nom').order('nom')
      .then(({ data }) => setClients(data || []))
  }, [])

  const loadCharge = useCallback(async (clientId) => {
    setLoading(true)
    setData([])

    // 1. Récupérer tous les programmes du client
    const { data: progs } = await supabase
      .from('programmes')
      .select('id, nom, semaines, date_debut')
      .eq('client_id', clientId)

    if (!progs || progs.length === 0) { setLoading(false); return }

    // 2. Récupérer toutes les séances de ces programmes
    const progIds = progs.map(p => p.id)
    const { data: seances } = await supabase
      .from('seances')
      .select('id, programme_id')
      .in('programme_id', progIds)

    if (!seances || seances.length === 0) { setLoading(false); return }

    const seanceIds = seances.map(s => s.id)

    // 3. Récupérer tous les RPE de ces séances
    const { data: rpes } = await supabase
      .from('rpe_seances')
      .select('seance_id, semaine, rpe_reel')
      .in('seance_id', seanceIds)
      .not('rpe_reel', 'is', null)

    if (!rpes || rpes.length === 0) { setLoading(false); return }

    // 4. Regrouper par semaine relative (on construit un index seance → programme → date_debut)
    const seanceProg = {}
    seances.forEach(s => { seanceProg[s.id] = s.programme_id })
    const progInfo = {}
    progs.forEach(p => { progInfo[p.id] = p })

    // Construire les données par "semaine absolue" (numéro de semaine dans le programme)
    // Clé = progId + semaine
    const weekMap = {}
    rpes.forEach(r => {
      const progId = seanceProg[r.seance_id]
      const prog = progInfo[progId]
      if (!prog) return
      const key = `${progId}_S${r.semaine}`
      if (!weekMap[key]) {
        weekMap[key] = {
          key,
          prog_nom: prog.nom,
          semaine: r.semaine,
          date_debut: prog.date_debut,
          rpe_sum: 0,
          nb_seances: 0,
        }
      }
      weekMap[key].rpe_sum += parseFloat(r.rpe_reel) || 0
      weekMap[key].nb_seances += 1
    })

    // Calculer charge = RPE moyen × nb séances (proxy de charge hebdo)
    const rows = Object.values(weekMap).map(w => ({
      ...w,
      rpe_moy: w.nb_seances > 0 ? (w.rpe_sum / w.nb_seances) : 0,
      charge: w.rpe_sum, // charge totale = somme RPE
    })).sort((a, b) => {
      if (a.prog_nom !== b.prog_nom) return a.prog_nom.localeCompare(b.prog_nom)
      return a.semaine - b.semaine
    })

    setData(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedClient) loadCharge(selectedClient)
  }, [selectedClient, loadCharge])

  const maxCharge = Math.max(...data.map(d => d.charge), 1)

  // Calcul ACWR (Acute:Chronic Workload Ratio)
  function getACWR(rows, idx) {
    if (idx < 0) return null
    const acute = rows[idx]?.charge || 0
    const chronic = rows.slice(Math.max(0, idx - 3), idx + 1).reduce((s, r) => s + r.charge, 0) / Math.min(idx + 1, 4)
    if (!chronic) return null
    const ratio = acute / chronic
    return ratio.toFixed(2)
  }

  function acwrColor(ratio) {
    if (!ratio) return '#9ca3af'
    const r = parseFloat(ratio)
    if (r < 0.8) return '#3b82f6'  // sous-charge
    if (r <= 1.3) return '#22c55e'  // zone optimale
    if (r <= 1.5) return '#f59e0b'  // attention
    return '#ef4444'                // surcharge
  }

  function acwrLabel(ratio) {
    if (!ratio) return '—'
    const r = parseFloat(ratio)
    if (r < 0.8) return 'Sous-charge'
    if (r <= 1.3) return 'Optimal'
    if (r <= 1.5) return 'Attention'
    return 'Surcharge'
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.title}>Charge d'entraînement</div>
          <div style={S.subtitle}>Suivi de la charge hebdomadaire par client (RPE)</div>
        </div>
      </div>

      {/* Sélecteur client */}
      <div style={S.clientBar}>
        {clients.map(c => (
          <button key={c.id}
            style={{ ...S.clientBtn, ...(selectedClient === c.id ? S.clientBtnActive : {}) }}
            onClick={() => setSelectedClient(c.id)}>
            {c.prenom} {c.nom}
          </button>
        ))}
      </div>

      {!selectedClient && (
        <div style={S.emptyState}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
          <div style={{ fontWeight: '600', color: '#374151' }}>Sélectionne un client</div>
          <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' }}>pour voir sa charge d'entraînement</div>
        </div>
      )}

      {selectedClient && loading && <div style={S.empty}>Chargement…</div>}

      {selectedClient && !loading && data.length === 0 && (
        <div style={S.emptyState}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
          <div style={{ color: '#374151', fontWeight: '600' }}>Aucune donnée RPE</div>
          <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' }}>Le client doit renseigner son RPE après les séances</div>
        </div>
      )}

      {data.length > 0 && (
        <>
          {/* Graphe barres */}
          <div style={S.chartCard}>
            <div style={S.chartTitle}>Charge hebdomadaire (Σ RPE)</div>
            <div style={S.chartArea}>
              {data.map((d, idx) => {
                const h = Math.round((d.charge / maxCharge) * 160)
                const acwr = getACWR(data, idx)
                const color = acwrColor(acwr)
                return (
                  <div key={d.key} style={S.barGroup}>
                    <div style={S.barValue}>{d.charge.toFixed(0)}</div>
                    <div style={{ ...S.bar, height: `${h}px`, background: color }} title={`ACWR: ${acwr} — ${acwrLabel(acwr)}`} />
                    <div style={S.barLabel}>S{d.semaine}</div>
                    <div style={{ fontSize: '0.6rem', color: '#9ca3af', maxWidth: '40px', textAlign: 'center', lineHeight: 1.2 }}>{d.prog_nom.substring(0, 8)}</div>
                  </div>
                )
              })}
            </div>
            <div style={S.legend}>
              {[
                { color: '#3b82f6', label: 'Sous-charge (< 0.8)' },
                { color: '#22c55e', label: 'Optimal (0.8–1.3)' },
                { color: '#f59e0b', label: 'Attention (1.3–1.5)' },
                { color: '#ef4444', label: 'Surcharge (> 1.5)' },
              ].map(l => (
                <div key={l.label} style={S.legendItem}>
                  <div style={{ ...S.legendDot, background: l.color }} />
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tableau */}
          <div style={S.tableCard}>
            <table style={S.table}>
              <thead>
                <tr style={S.thead}>
                  <th style={S.th}>Programme</th>
                  <th style={S.th}>Semaine</th>
                  <th style={S.th}>Séances</th>
                  <th style={S.th}>RPE moyen</th>
                  <th style={S.th}>Charge totale</th>
                  <th style={S.th}>ACWR</th>
                  <th style={S.th}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d, idx) => {
                  const acwr = getACWR(data, idx)
                  const color = acwrColor(acwr)
                  return (
                    <tr key={d.key} style={S.tr}>
                      <td style={S.td}>{d.prog_nom}</td>
                      <td style={S.td}>Semaine {d.semaine}</td>
                      <td style={S.td}>{d.nb_seances}</td>
                      <td style={S.td}>{d.rpe_moy.toFixed(1)}/10</td>
                      <td style={{ ...S.td, fontWeight: '700' }}>{d.charge.toFixed(0)}</td>
                      <td style={{ ...S.td, fontWeight: '700', color }}>{acwr || '—'}</td>
                      <td style={S.td}>
                        <span style={{ ...S.pill, background: color + '20', color }}>
                          {acwrLabel(acwr)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const S = {
  page: { padding: '2rem', maxWidth: '1000px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: '0.875rem', color: '#6b7280', marginTop: '0.2rem' },
  clientBar: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' },
  clientBtn: { padding: '0.4rem 1rem', border: '1px solid #e5e7eb', borderRadius: '999px', background: 'white', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '500' },
  clientBtnActive: { background: '#333333', color: '#e4f816', border: '1px solid #333333', fontWeight: '700' },
  empty: { color: '#9ca3af', textAlign: 'center', padding: '3rem' },
  emptyState: { textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' },
  chartCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', marginBottom: '1rem' },
  chartTitle: { fontWeight: '700', color: '#111827', marginBottom: '1.25rem', fontSize: '0.95rem' },
  chartArea: { display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '200px', overflowX: 'auto', paddingBottom: '0.5rem' },
  barGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' },
  barValue: { fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' },
  bar: { width: '28px', borderRadius: '4px 4px 0 0', minHeight: '4px', transition: 'height 0.3s' },
  barLabel: { fontSize: '0.7rem', color: '#374151', marginTop: '4px', fontWeight: '600' },
  legend: { display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f3f4f6' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#6b7280' },
  legendDot: { width: '10px', height: '10px', borderRadius: '50%' },
  tableCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f9fafb' },
  th: { padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '0.75rem 1rem', fontSize: '0.875rem', color: '#374151' },
  pill: { padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600' },
}
