import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

// Références scientifiques :
// - ACWR (Acute:Chronic Workload Ratio) — Gabbett TJ (2016) : zone optimale 0.8–1.3
// - Monotonie d'entraînement — Foster C (1998) : charge moy / écart-type ; >2.0 = risque
// - Strain d'entraînement — Foster C (1998) : charge × monotonie
// - Tonnage ACWR — Hulin BT et al. (2016) : charge externe (kg × reps)

export default function ChargeEntrainement() {
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, prenom, nom').order('nom')
      .then(({ data }) => setClients(data || []))
  }, [])

  const loadCharge = useCallback(async (clientId) => {
    setLoading(true)
    setData([])

    // 1. Programmes du client
    const { data: progs } = await supabase
      .from('programmes')
      .select('id, nom, semaines, date_debut')
      .eq('client_id', clientId)

    if (!progs || progs.length === 0) { setLoading(false); return }

    const progIds = progs.map(p => p.id)
    const progInfo = {}
    progs.forEach(p => { progInfo[p.id] = p })

    // 2. Séances
    const { data: seances } = await supabase
      .from('seances')
      .select('id, programme_id')
      .in('programme_id', progIds)

    if (!seances || seances.length === 0) { setLoading(false); return }

    const seanceIds = seances.map(s => s.id)
    const seanceProg = {}
    seances.forEach(s => { seanceProg[s.id] = s.programme_id })

    // 3. RPE par séance
    const { data: rpes } = await supabase
      .from('rpe_seances')
      .select('seance_id, semaine, rpe_reel')
      .in('seance_id', seanceIds)
      .not('rpe_reel', 'is', null)

    if (!rpes || rpes.length === 0) { setLoading(false); return }

    // 4. Tonnage (charge externe) via exercices + serie_tracking
    const tonnageMap = {} // key → tonnage total en kg
    const { data: exercices } = await supabase
      .from('exercices')
      .select('id, seance_id')
      .in('seance_id', seanceIds)

    if (exercices && exercices.length > 0) {
      const exIds = exercices.map(e => e.id)
      const exSeance = {}
      exercices.forEach(e => { exSeance[e.id] = e.seance_id })

      const { data: trackings } = await supabase
        .from('serie_tracking')
        .select('exercice_id, semaine, poids, reps_reelles, is_done')
        .in('exercice_id', exIds)
        .eq('is_done', true)

      if (trackings) {
        trackings.forEach(t => {
          const poids = parseFloat(t.poids) || 0
          const reps = parseFloat(t.reps_reelles) || 0
          if (poids <= 0 || reps <= 0) return
          const seanceId = exSeance[t.exercice_id]
          const progId = seanceProg[seanceId]
          if (!progId) return
          const key = `${progId}_S${t.semaine}`
          if (!tonnageMap[key]) tonnageMap[key] = 0
          tonnageMap[key] += poids * reps
        })
      }
    }

    // 5. Wellness (fatigue + douleurs) par date
    const wellnessMap = {}
    const { data: wellness } = await supabase
      .from('wellness')
      .select('date, fatigue, douleurs')
      .eq('client_id', clientId)
      .not('fatigue', 'is', null)

    if (wellness) {
      wellness.forEach(w => { wellnessMap[w.date] = w })
    }

    // 6. Construire la structure RPE par semaine
    const weekMap = {}
    const weekRpeDetails = {} // key → tableau de RPE par séance

    rpes.forEach(r => {
      const progId = seanceProg[r.seance_id]
      const prog = progInfo[progId]
      if (!prog) return
      const key = `${progId}_S${r.semaine}`
      if (!weekMap[key]) {
        weekMap[key] = {
          key, prog_nom: prog.nom, prog_id: progId,
          semaine: r.semaine, date_debut: prog.date_debut,
          rpe_sum: 0, nb_seances: 0,
        }
        weekRpeDetails[key] = []
      }
      weekMap[key].rpe_sum += parseFloat(r.rpe_reel) || 0
      weekMap[key].nb_seances += 1
      weekRpeDetails[key].push(parseFloat(r.rpe_reel) || 0)
    })

    // 7. Calculer les indicateurs scientifiques pour chaque semaine
    const rows = Object.values(weekMap).map(w => {
      const rpe_moy = w.nb_seances > 0 ? w.rpe_sum / w.nb_seances : 0
      const charge = w.rpe_sum

      // Monotonie (Foster 1998) : charge moy / écart-type journalier
      // On modélise les 7 jours : jours entraînés = RPE séance, jours de repos = 0
      const nbRest = Math.max(0, 7 - w.nb_seances)
      const dailyLoads = [...weekRpeDetails[w.key], ...Array(nbRest).fill(0)]
      const mean7 = dailyLoads.reduce((s, v) => s + v, 0) / 7
      const variance7 = dailyLoads.reduce((s, v) => s + (v - mean7) ** 2, 0) / 7
      const sd7 = Math.sqrt(variance7)
      const monotonie = sd7 > 0 ? mean7 / sd7 : null

      // Tonnage (charge externe kg)
      const tonnage = tonnageMap[w.key] || 0

      // Wellness : moyenne (fatigue + douleurs) / 2 sur les 7 jours de la semaine
      let wellnessScore = null
      if (w.date_debut) {
        const weekStart = new Date(w.date_debut)
        weekStart.setDate(weekStart.getDate() + (w.semaine - 1) * 7)
        const dayScores = []
        for (let d = 0; d < 7; d++) {
          const dd = new Date(weekStart)
          dd.setDate(dd.getDate() + d)
          const dateStr = dd.toISOString().split('T')[0]
          const entry = wellnessMap[dateStr]
          if (entry && (entry.fatigue || entry.douleurs)) {
            const val = ((entry.fatigue || 0) + (entry.douleurs || 0)) / 2
            dayScores.push(val)
          }
        }
        if (dayScores.length > 0) {
          wellnessScore = dayScores.reduce((s, v) => s + v, 0) / dayScores.length
        }
      }

      return { ...w, rpe_moy, charge, monotonie, tonnage, wellnessScore }
    }).sort((a, b) => {
      if (a.prog_nom !== b.prog_nom) return a.prog_nom.localeCompare(b.prog_nom)
      return a.semaine - b.semaine
    })

    setData(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedClient) loadCharge(selectedClient)
  }, [selectedClient, loadCharge])

  // ─── Calculs scientifiques ──────────────────────────────────────────────────

  // ACWR RPE (charge interne) — rolling 4 semaines
  function getACWR(rows, idx) {
    if (idx < 0) return null
    const acute = rows[idx]?.charge || 0
    const chronic = rows.slice(Math.max(0, idx - 3), idx + 1).reduce((s, r) => s + r.charge, 0) / Math.min(idx + 1, 4)
    if (!chronic) return null
    return (acute / chronic).toFixed(2)
  }

  // ACWR Tonnage (charge externe) — rolling 4 semaines
  function getTonnageACWR(rows, idx) {
    if (idx < 0) return null
    const acute = rows[idx]?.tonnage || 0
    if (acute === 0) return null
    const window = rows.slice(Math.max(0, idx - 3), idx + 1)
    if (!window.some(r => r.tonnage > 0)) return null
    const chronic = window.reduce((s, r) => s + r.tonnage, 0) / Math.min(idx + 1, 4)
    if (!chronic) return null
    return (acute / chronic).toFixed(2)
  }

  // Training Strain = charge × monotonie (Foster 1998)
  function getStrain(row) {
    if (row.monotonie === null || row.monotonie === undefined) return null
    return Math.round(row.charge * row.monotonie)
  }

  // ─── Couleurs & labels ──────────────────────────────────────────────────────

  function acwrColor(ratio) {
    if (!ratio) return '#9ca3af'
    const r = parseFloat(ratio)
    if (r < 0.8) return '#3b82f6'
    if (r <= 1.3) return '#22c55e'
    if (r <= 1.5) return '#f59e0b'
    return '#ef4444'
  }

  function acwrLabel(ratio) {
    if (!ratio) return '—'
    const r = parseFloat(ratio)
    if (r < 0.8) return 'Sous-charge'
    if (r <= 1.3) return 'Optimal'
    if (r <= 1.5) return 'Attention'
    return 'Surcharge'
  }

  function monotonyColor(m) {
    if (m === null || m === undefined) return '#9ca3af'
    if (m < 1.5) return '#22c55e'
    if (m < 2.0) return '#f59e0b'
    return '#ef4444'
  }

  function monotonyLabel(m) {
    if (m === null || m === undefined) return '—'
    if (m < 1.5) return 'Varié'
    if (m < 2.0) return 'Attention'
    return 'Monotone'
  }

  function strainColor(s) {
    if (s === null) return '#9ca3af'
    if (s < 4000) return '#22c55e'
    if (s < 6000) return '#f59e0b'
    return '#ef4444'
  }

  function wellnessColor(score) {
    if (score === null || score === undefined) return '#9ca3af'
    if (score <= 2) return '#22c55e'   // fatigue/douleurs faibles = bonne récup
    if (score <= 3.5) return '#f59e0b'
    return '#ef4444'
  }

  function wellnessLabel(score) {
    if (score === null || score === undefined) return '—'
    if (score <= 2) return 'Bonne récup'
    if (score <= 3.5) return 'Fatigue modérée'
    return 'Fatigue élevée'
  }

  // Indice de risque global (composite)
  function getRiskLevel(row, idx, rows) {
    const acwr = parseFloat(getACWR(rows, idx)) || 0
    const tACWR = parseFloat(getTonnageACWR(rows, idx)) || 0
    const mono = row.monotonie || 0
    const wellness = row.wellnessScore

    let redFlags = 0
    let orangeFlags = 0

    if (acwr > 1.5) redFlags++
    else if (acwr > 1.3) orangeFlags++

    if (tACWR > 1.5) redFlags++
    else if (tACWR > 1.3) orangeFlags++

    if (mono >= 2.0) redFlags++
    else if (mono >= 1.5) orangeFlags++

    if (wellness !== null) {
      if (wellness > 4) redFlags++
      else if (wellness > 3.5) orangeFlags++
    }

    if (redFlags >= 1 || orangeFlags >= 2) return redFlags >= 1 ? 'red' : 'red'
    if (orangeFlags >= 1) return 'orange'
    return 'green'
  }

  const maxCharge = Math.max(...data.map(d => d.charge), 1)
  const lastIdx = data.length - 1
  const lastRow = data[lastIdx]

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.title}>Charge d'entraînement</div>
          <div style={S.subtitle}>Suivi RPE · Tonnage · Monotonie · Risque de blessure</div>
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
          {/* ── Indicateurs dernière semaine ── */}
          {lastRow && (
            <div style={S.indicateursSection}>
              <div style={S.indicateursTitle}>
                Dernière semaine enregistrée — {lastRow.prog_nom} · Semaine {lastRow.semaine}
              </div>
              <div style={S.indicateursGrid}>

                {/* ACWR RPE */}
                {(() => {
                  const acwr = getACWR(data, lastIdx)
                  const color = acwrColor(acwr)
                  return (
                    <div style={S.indCard}>
                      <div style={S.indLabel}>ACWR interne</div>
                      <div style={{ ...S.indValue, color }}>{acwr || '—'}</div>
                      <div style={{ ...S.indBadge, background: color + '20', color }}>{acwrLabel(acwr)}</div>
                      <div style={S.indRef}>Gabbett 2016 · Zone optimale 0.8–1.3</div>
                    </div>
                  )
                })()}

                {/* ACWR Tonnage */}
                {(() => {
                  const tACWR = getTonnageACWR(data, lastIdx)
                  if (!tACWR) return null
                  const color = acwrColor(tACWR)
                  return (
                    <div style={S.indCard}>
                      <div style={S.indLabel}>ACWR tonnage</div>
                      <div style={{ ...S.indValue, color }}>{tACWR}</div>
                      <div style={{ ...S.indBadge, background: color + '20', color }}>{acwrLabel(tACWR)}</div>
                      <div style={S.indRef}>Hulin 2016 · {Math.round(lastRow.tonnage).toLocaleString('fr-FR')} kg cette sem.</div>
                    </div>
                  )
                })()}

                {/* Monotonie */}
                {lastRow.monotonie !== null && (() => {
                  const color = monotonyColor(lastRow.monotonie)
                  return (
                    <div style={S.indCard}>
                      <div style={S.indLabel}>Monotonie</div>
                      <div style={{ ...S.indValue, color }}>{lastRow.monotonie.toFixed(2)}</div>
                      <div style={{ ...S.indBadge, background: color + '20', color }}>{monotonyLabel(lastRow.monotonie)}</div>
                      <div style={S.indRef}>Foster 1998 · Risque si &gt; 2.0</div>
                    </div>
                  )
                })()}

                {/* Strain */}
                {lastRow.monotonie !== null && (() => {
                  const strain = getStrain(lastRow)
                  const color = strainColor(strain)
                  return (
                    <div style={S.indCard}>
                      <div style={S.indLabel}>Strain</div>
                      <div style={{ ...S.indValue, color }}>{strain !== null ? strain.toLocaleString('fr-FR') : '—'}</div>
                      <div style={{ ...S.indBadge, background: color + '20', color }}>
                        {strain < 4000 ? 'Faible' : strain < 6000 ? 'Modéré' : 'Élevé'}
                      </div>
                      <div style={S.indRef}>Foster 1998 · Charge × Monotonie</div>
                    </div>
                  )
                })()}

                {/* Wellness */}
                {lastRow.wellnessScore !== null && lastRow.wellnessScore !== undefined && (() => {
                  const color = wellnessColor(lastRow.wellnessScore)
                  return (
                    <div style={S.indCard}>
                      <div style={S.indLabel}>Récupération</div>
                      <div style={{ ...S.indValue, color }}>
                        {lastRow.wellnessScore.toFixed(1)}
                        <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>/5</span>
                      </div>
                      <div style={{ ...S.indBadge, background: color + '20', color }}>{wellnessLabel(lastRow.wellnessScore)}</div>
                      <div style={S.indRef}>Fatigue + douleurs moy. (wellness)</div>
                    </div>
                  )
                })()}
              </div>

              {/* Feu tricolore global */}
              {(() => {
                const risk = getRiskLevel(lastRow, lastIdx, data)
                const config = {
                  green:  { color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', label: 'Risque faible', desc: 'La charge est bien équilibrée. Continuez sur cette lancée.' },
                  orange: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '⚠️', label: 'Vigilance', desc: 'Certains indicateurs méritent attention. Surveiller la récupération.' },
                  red:    { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🚨', label: 'Risque élevé', desc: 'Plusieurs signaux d\'alarme. Envisager une semaine de décharge.' },
                }[risk]
                return (
                  <div style={{ background: config.bg, border: `1.5px solid ${config.border}`, borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.875rem' }}>
                    <div style={{ fontSize: '1.75rem', lineHeight: 1 }}>{config.icon}</div>
                    <div>
                      <div style={{ fontWeight: '700', color: config.color, fontSize: '0.95rem' }}>{config.label}</div>
                      <div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.15rem' }}>{config.desc}</div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Graphe barres ── */}
          <div style={S.chartCard}>
            <div style={S.chartTitle}>Charge hebdomadaire (Σ RPE) — colorée par ACWR</div>
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

          {/* ── Tableau détaillé ── */}
          <div style={S.tableCard}>
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr style={S.thead}>
                    <th style={S.th}>Programme</th>
                    <th style={S.th}>Sem.</th>
                    <th style={S.th}>Séances</th>
                    <th style={S.th}>RPE moy.</th>
                    <th style={S.th}>Charge</th>
                    <th style={S.th}>ACWR RPE</th>
                    <th style={S.th}>Tonnage</th>
                    <th style={S.th}>ACWR T.</th>
                    <th style={S.th}>Monotonie</th>
                    <th style={S.th}>Strain</th>
                    <th style={S.th}>Risque</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d, idx) => {
                    const acwr = getACWR(data, idx)
                    const tACWR = getTonnageACWR(data, idx)
                    const strain = getStrain(d)
                    const risk = getRiskLevel(d, idx, data)
                    const riskConfig = {
                      green:  { color: '#22c55e', label: '✅ OK' },
                      orange: { color: '#f59e0b', label: '⚠️ Vigilance' },
                      red:    { color: '#ef4444', label: '🚨 Risque' },
                    }[risk]
                    return (
                      <tr key={d.key} style={S.tr}>
                        <td style={S.td}>{d.prog_nom}</td>
                        <td style={S.td}>S{d.semaine}</td>
                        <td style={S.td}>{d.nb_seances}</td>
                        <td style={S.td}>{d.rpe_moy.toFixed(1)}</td>
                        <td style={{ ...S.td, fontWeight: '700' }}>{d.charge.toFixed(0)}</td>
                        <td style={{ ...S.td, fontWeight: '700', color: acwrColor(acwr) }}>{acwr || '—'}</td>
                        <td style={S.td}>{d.tonnage > 0 ? Math.round(d.tonnage).toLocaleString('fr-FR') + ' kg' : '—'}</td>
                        <td style={{ ...S.td, fontWeight: '600', color: acwrColor(tACWR) }}>{tACWR || '—'}</td>
                        <td style={{ ...S.td, fontWeight: '600', color: monotonyColor(d.monotonie) }}>
                          {d.monotonie !== null ? d.monotonie.toFixed(2) : '—'}
                        </td>
                        <td style={{ ...S.td, color: strainColor(strain) }}>
                          {strain !== null ? strain.toLocaleString('fr-FR') : '—'}
                        </td>
                        <td style={{ ...S.td, fontWeight: '700', color: riskConfig.color, whiteSpace: 'nowrap' }}>
                          {riskConfig.label}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Références scientifiques ── */}
          <div style={S.refsCard}>
            <div style={S.refsTitle}>📚 Bases scientifiques</div>
            <div style={S.refsList}>
              <div style={S.refItem}>
                <span style={S.refBullet}>•</span>
                <span><strong>ACWR interne (RPE)</strong> — Gabbett TJ (2016). Rapport charge aiguë / charge chronique (4 sem.). Zone optimale 0.8–1.3 ; au-delà de 1.5, le risque de blessure double.</span>
              </div>
              <div style={S.refItem}>
                <span style={S.refBullet}>•</span>
                <span><strong>ACWR tonnage (charge externe)</strong> — Hulin BT et al. (2016). Volume en kg × reps. Complète l'ACWR RPE en mesurant la contrainte mécanique réelle.</span>
              </div>
              <div style={S.refItem}>
                <span style={S.refBullet}>•</span>
                <span><strong>Monotonie d'entraînement</strong> — Foster C (1998). Charge moy. journalière / Écart-type. Au-dessus de 2.0 : manque de variation = risque de surentraînement.</span>
              </div>
              <div style={S.refItem}>
                <span style={S.refBullet}>•</span>
                <span><strong>Strain d'entraînement</strong> — Foster C (1998). Charge hebdo × Monotonie. Indicateur du stress physiologique cumulé sur la semaine.</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const S = {
  page: { padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: '0.875rem', color: '#6b7280', marginTop: '0.2rem' },
  clientBar: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' },
  clientBtn: { padding: '0.4rem 1rem', border: '1px solid #e5e7eb', borderRadius: '999px', background: 'white', color: '#6b7280', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '500' },
  clientBtnActive: { background: '#333333', color: '#e4f816', border: '1px solid #333333', fontWeight: '700' },
  empty: { color: '#9ca3af', textAlign: 'center', padding: '3rem' },
  emptyState: { textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' },

  // Indicateurs scientifiques
  indicateursSection: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' },
  indicateursTitle: { fontWeight: '700', color: '#111827', fontSize: '0.9rem', marginBottom: '0.875rem' },
  indicateursGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '0.75rem' },
  indCard: { background: '#f9fafb', borderRadius: '10px', padding: '0.875rem', border: '1px solid #f3f4f6' },
  indLabel: { fontSize: '0.7rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' },
  indValue: { fontSize: '1.6rem', fontWeight: '800', color: '#111827', marginBottom: '0.35rem', lineHeight: 1 },
  indBadge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '600', marginBottom: '0.4rem' },
  indRef: { fontSize: '0.67rem', color: '#9ca3af', lineHeight: 1.4 },

  // Graphe
  chartCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', marginBottom: '1rem', overflow: 'hidden' },
  chartTitle: { fontWeight: '700', color: '#111827', marginBottom: '1.25rem', fontSize: '0.95rem' },
  chartArea: { display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '240px', overflowX: 'auto', overflowY: 'visible', paddingBottom: '0.5rem', paddingTop: '1.5rem' },
  barGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' },
  barValue: { fontSize: '0.65rem', color: '#6b7280', marginBottom: '2px' },
  bar: { width: '28px', borderRadius: '4px 4px 0 0', minHeight: '4px', transition: 'height 0.3s' },
  barLabel: { fontSize: '0.7rem', color: '#374151', marginTop: '4px', fontWeight: '600' },
  legend: { display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f3f4f6' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#6b7280' },
  legendDot: { width: '10px', height: '10px', borderRadius: '50%' },

  // Tableau
  tableCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f9fafb' },
  th: { padding: '0.65rem 0.875rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '0.7rem 0.875rem', fontSize: '0.83rem', color: '#374151' },
  pill: { padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600' },

  // Références
  refsCard: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.25rem' },
  refsTitle: { fontWeight: '700', color: '#374151', fontSize: '0.85rem', marginBottom: '0.75rem' },
  refsList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  refItem: { display: 'flex', gap: '0.5rem', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 },
  refBullet: { color: '#9ca3af', flexShrink: 0 },
}
