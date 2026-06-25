import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

// Références scientifiques :
// - ACWR (Acute:Chronic Workload Ratio) — Gabbett TJ (2016) : zone optimale 0.8–1.3
// - Monotonie d'entraînement — Foster C (1998) : charge moy / écart-type ; >2.0 = risque
// - Strain d'entraînement — Foster C (1998) : charge × monotonie
// - Tonnage ACWR — Hulin BT et al. (2016) : charge externe (kg × reps)
// - GPS Z-scores — Batterham & Hopkins (2006) : limites de référence individuelles par Z-score

// ── Métriques GPS à analyser ──────────────────────────────────────────────────
const GPS_Z_METRICS = [
  { key: 'distance',    label: 'Distance',          unit: 'm',    icon: '📏' },
  { key: 'vmax',        label: 'Vitesse max',        unit: 'km/h', icon: '⚡' },
  { key: 'player_load', label: 'Player Load',        unit: '',     icon: '🔋' },
  { key: 'dist_v20',    label: 'Dist. > 20 km/h',   unit: 'm',    icon: '🏃' },
  { key: 'nb_acc_25',   label: 'Accélérations',      unit: '',     icon: '🚀' },
  { key: 'nb_dec_25',   label: 'Décélérations',      unit: '',     icon: '🛑' },
]

export default function ChargeEntrainement() {
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [gpsZData, setGpsZData] = useState(null)   // null=not loaded, false=no data
  const [gpsZLoading, setGpsZLoading] = useState(false)

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

  // ─── GPS Z-scores ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (selectedClient && clients.length > 0) loadGpsZScores(selectedClient, clients)
  }, [selectedClient, clients]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGpsZScores(clientId, clientsList) {
    setGpsZLoading(true)
    setGpsZData(null)

    const client = clientsList.find(c => c.id === clientId)
    if (!client) { setGpsZLoading(false); return }

    // Format GPS : "NOM Prenom" (nom en majuscules en premier)
    const clientKey = `${client.nom} ${client.prenom}`.toUpperCase()

    const { data: rapports } = await supabase
      .from('gps_rapports')
      .select('id, nom, date, lignes')
      .order('date', { ascending: true })

    if (!rapports || rapports.length === 0) {
      setGpsZData(false)
      setGpsZLoading(false)
      return
    }

    // Collecter les données de ce joueur sur toutes les séances
    const sessions = []
    rapports.forEach(r => {
      const lignes = r.lignes || []
      // periode_num === 0 = totaux de la séance entière
      const ligne = lignes.find(l =>
        (l.joueur || '').toUpperCase() === clientKey && l.periode_num === 0
      )
      if (!ligne) return
      const metrics = {}
      GPS_Z_METRICS.forEach(({ key }) => {
        const val = parseFloat(ligne[key])
        if (!isNaN(val) && val > 0) metrics[key] = val
      })
      if (Object.keys(metrics).length > 0) {
        sessions.push({ date: r.date, nom: r.nom, metrics })
      }
    })

    if (sessions.length === 0) {
      setGpsZData(false)
      setGpsZLoading(false)
      return
    }

    // Calcul Z-scores pour la dernière séance (Batterham & Hopkins 2006)
    const last = sessions[sessions.length - 1]
    const zScores = {}

    GPS_Z_METRICS.forEach(({ key }) => {
      const values = sessions.map(s => s.metrics[key]).filter(v => v !== undefined)
      const current = last.metrics[key]
      const n = values.length

      if (n < 5) {
        zScores[key] = { z: null, mean: null, sd: null, current, n, insufficient: true }
        return
      }

      const mean = values.reduce((s, v) => s + v, 0) / n
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
      const sd = Math.sqrt(variance)

      if (sd === 0 || current === undefined) {
        zScores[key] = { z: null, mean, sd, current, n }
        return
      }

      const z = (current - mean) / sd
      zScores[key] = { z: parseFloat(z.toFixed(2)), mean: parseFloat(mean.toFixed(1)), sd: parseFloat(sd.toFixed(1)), current, n }
    })

    setGpsZData({ zScores, lastDate: last.date, lastNom: last.nom, nbSessions: sessions.length, clientName: `${client.prenom} ${client.nom}` })
    setGpsZLoading(false)
  }

  // Zone Z-score (Batterham & Hopkins : ±1 SD normal, ±2 SD vigilance, >±2 alarme)
  function zZone(z) {
    if (z === null || z === undefined) return null
    if (Math.abs(z) <= 1) return { color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', label: 'Normal' }
    if (z > 1 && z <= 2)  return { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: '📈', label: 'Progression' }
    if (z >= -2 && z < -1) return { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '📉', label: 'Attention' }
    return { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🚨', label: 'Alarme' }
  }

  function formatVal(val, unit) {
    if (val === undefined || val === null) return '—'
    const v = parseFloat(val)
    if (isNaN(v)) return '—'
    const formatted = v >= 1000 ? v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : v % 1 === 0 ? v.toString() : v.toFixed(1)
    return unit ? `${formatted} ${unit}` : formatted
  }

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

      {/* ── GPS — Analyse individuelle Z-scores (indépendant des données RPE) ── */}
      {selectedClient && !loading && (
        <>
          {gpsZLoading && (
            <div style={{ ...S.indicateursSection, color: '#9ca3af', fontSize: '0.85rem' }}>
              📡 Chargement des données GPS…
            </div>
          )}

          {!gpsZLoading && gpsZData && (
            <div style={S.indicateursSection}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={S.indicateursTitle}>
                    📡 GPS — Analyse individuelle · {gpsZData.clientName}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.1rem' }}>
                    Dernière séance : {gpsZData.lastNom || gpsZData.lastDate} · {gpsZData.nbSessions} séances analysées
                  </div>
                </div>
                <div style={{ padding: '3px 10px', borderRadius: 999, background: '#f0fdf4', color: '#22c55e', fontSize: '0.68rem', fontWeight: 700, border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>
                  Z-score individuel
                </div>
              </div>

              <div style={S.indicateursGrid}>
                {GPS_Z_METRICS.map(({ key, label, unit, icon }) => {
                  const d = gpsZData.zScores[key]
                  if (!d) return null

                  if (d.insufficient) {
                    return (
                      <div key={key} style={{ ...S.indCard, opacity: 0.65 }}>
                        <div style={S.indLabel}>{icon} {label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.25rem' }}>
                          Données insuffisantes
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#d1d5db', marginTop: '0.3rem' }}>
                          {d.n} séance{d.n > 1 ? 's' : ''} · min. 5 requises
                        </div>
                      </div>
                    )
                  }

                  if (d.z === null) {
                    return (
                      <div key={key} style={{ ...S.indCard, opacity: 0.65 }}>
                        <div style={S.indLabel}>{icon} {label}</div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Pas de donnée</div>
                      </div>
                    )
                  }

                  const zone = zZone(d.z)
                  return (
                    <div key={key} style={{ ...S.indCard, background: zone.bg, border: `1px solid ${zone.border}` }}>
                      <div style={{ ...S.indLabel, color: '#6b7280' }}>{icon} {label}</div>
                      <div style={{ ...S.indValue, color: zone.color }}>
                        {d.z > 0 ? '+' : ''}{d.z}
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500 }}> SD</span>
                      </div>
                      <div style={{ ...S.indBadge, background: zone.color + '20', color: zone.color }}>
                        {zone.icon} {zone.label}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.3rem', lineHeight: 1.4 }}>
                        {formatVal(d.current, unit)} · moy. {formatVal(d.mean, unit)}
                      </div>
                      <div style={S.indRef}>{d.n} séances · ±1SD = {formatVal(d.sd, unit)}</div>
                    </div>
                  )
                })}
              </div>

              {/* Légende zones */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
                {[
                  { icon: '✅', label: 'Normal (±1 SD)',          color: '#22c55e' },
                  { icon: '📈', label: 'Progression (+1→+2 SD)',  color: '#3b82f6' },
                  { icon: '📉', label: 'Attention (−2→−1 SD)',    color: '#f59e0b' },
                  { icon: '🚨', label: 'Alarme (> ±2 SD)',        color: '#ef4444' },
                ].map(z => (
                  <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: '#6b7280' }}>
                    <span>{z.icon}</span>
                    <span style={{ color: z.color, fontWeight: 600 }}>{z.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.4rem' }}>
                Batterham &amp; Hopkins (2006) · Comparaison du joueur à lui-même sur l'ensemble de ses séances GPS
              </div>
            </div>
          )}
        </>
      )}

      {data.length > 0 && (
        <>
          {/* ── Indicateurs dernière semaine ── */}
          {lastRow && (
            <div style={S.indicateursSection}>
              <div style={S.indicateursTitle}>
                {(() => {
                  const currentSem = lastRow.date_debut
                    ? Math.min(
                        lastRow.prog_semaines || 99,
                        Math.max(1, Math.floor((Date.now() - new Date(lastRow.date_debut + 'T00:00:00')) / (7 * 86400000)) + 1)
                      )
                    : null
                  return <>
                    {lastRow.prog_nom}
                    {currentSem ? <> · <strong>Semaine actuelle : S{currentSem}</strong></> : null}
                    <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>(dernier enregistrement : S{lastRow.semaine})</span>
                  </>
                })()}
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
              <div style={S.refItem}>
                <span style={S.refBullet}>•</span>
                <span><strong>GPS — Z-scores individuels</strong> — Batterham &amp; Hopkins (2006). Limites de référence statistiques individuelles : Z = (valeur − µ) / σ. Zones : ±1 SD normal, ±2 SD vigilance, &gt;±2 alarme. Minimum 5 séances requis.</span>
              </div>
              <div style={S.refItem}>
                <span style={S.refBullet}>•</span>
                <span><strong>GPS — Suivi de charge externe</strong> — Akenhead R &amp; Nassis GP (2016). Player Load, distance haute vitesse, accélérations/décélérations : indicateurs validés du stress mécanique en sports collectifs.</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Logique de couleur charges par exercice ───────────────────────────────────
function weightLevel(poids, maxPoids) {
  if (!poids || !maxPoids) return 0
  const pct = poids / maxPoids
  if (pct < 0.84) return 1
  if (pct < 0.88) return 2
  if (pct < 0.93) return 3
  if (pct < 0.98) return 4
  return 5
}
const LEVEL_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#84cc16', '#16a34a']
const PR_COLOR = '#15803d'

async function loadExerciseWeights(cid) {
  const { data: progs } = await supabase
    .from('programmes')
    .select('id, nom, semaines, date_debut')
    .eq('client_id', cid)
    .order('created_at', { ascending: false })
  if (!progs?.length) return null

  // Prefer active programme (has date_debut, not yet terminated), fall back to most recent
  const now = new Date()
  const prog = progs.find(p => {
    if (!p.date_debut) return false
    const fin = new Date(p.date_debut + 'T00:00:00')
    fin.setDate(fin.getDate() + p.semaines * 7)
    return fin >= now
  }) || progs[0]

  // Séances avec nom et ordre
  const { data: seances } = await supabase
    .from('seances')
    .select('id, nom, ordre')
    .eq('programme_id', prog.id)
    .order('ordre', { ascending: true })
  if (!seances?.length) return null
  const seanceIds = seances.map(s => s.id)
  const seanceMap = {}
  seances.forEach(s => { seanceMap[s.id] = s })

  // Exercices avec ordre
  const { data: exos } = await supabase
    .from('exercices')
    .select('id, nom, seance_id, ordre, repetitions')
    .in('seance_id', seanceIds)
    .order('ordre', { ascending: true })
  if (!exos?.length) return null

  const exIds = exos.map(e => e.id)
  const exoMap = {}
  exos.forEach(e => { exoMap[e.id] = e })

  // ── Source 1 : table `charges` (le "petit tableau" rempli par le client) ──
  const { data: chargesRows } = await supabase
    .from('charges')
    .select('exercice_id, semaine, charge, rpe_reel')
    .in('exercice_id', exIds)

  // chargesMap[exId][sem] = { poids, rpe_reel }
  const chargesMap = {}
  ;(chargesRows || []).forEach(c => {
    const poids = parseFloat(c.charge)
    if (!poids || poids <= 0 || !c.semaine) return
    if (!chargesMap[c.exercice_id]) chargesMap[c.exercice_id] = {}
    chargesMap[c.exercice_id][c.semaine] = { poids, rpe_reel: c.rpe_reel }
  })

  // ── Source 2 : series validées (fallback) ──
  const { data: series, error: seriesError } = await supabase
    .from('serie_tracking')
    .select('exercice_id, semaine, poids, reps_reelles, valide, is_done')
    .in('exercice_id', exIds)
    .not('poids', 'is', null)
    .lt('serie', 1000)
  if (seriesError) { console.error('[loadExerciseWeights] serie_tracking error:', seriesError); return null }

  // Nombre de reps prescrit (borne basse si plage type "8-10")
  const repsCible = (repsStr) => {
    if (repsStr == null) return null
    const m = String(repsStr).match(/\d+/)
    return m ? parseInt(m[0]) : null
  }
  const num = (p) => parseFloat(String(p).replace(',', '.'))

  // trackingValidMax[exId][sem] = { poids, reps } — max poids d'une série valide.
  // trackingAny[exId][sem] = true si l'exercice a été réellement tenté (is_done !== false).
  //   is_done=false = brouillon auto-sauvegardé, pas encore validé → ne bloque pas charges table.
  //
  // Règle de validité :
  //   valide=true  → série réussie (✓ vert) → compter
  //   valide=false → série échouée (⚠ jaune) → ne pas compter
  //   valide=null  → données legacy : valide uniquement si reps_reelles saisies et ≥ cible
  //                  (reps_reelles=null sur entrée legacy = non confirmé → ne pas compter)
  const trackingValidMax = {}
  const trackingAny = {}
  ;(series || []).forEach(s => {
    const poids = num(s.poids)
    if (!poids || isNaN(poids) || !s.semaine) return
    const exId = s.exercice_id, sem = s.semaine
    // is_done=false = brouillon auto-save (saveSerieField) sans validation → ne compte pas
    if (s.is_done !== false) {
      if (!trackingAny[exId]) trackingAny[exId] = {}
      trackingAny[exId][sem] = true
    }
    const cible = repsCible(exoMap[exId]?.repetitions)
    let isValid
    if (s.valide === true) isValid = true
    else if (s.valide === false) isValid = false
    else {
      // Legacy (valide=null) : exige que les reps soient renseignées et atteintes
      isValid = s.reps_reelles != null && (cible == null || s.reps_reelles >= cible)
    }
    if (!isValid) return
    if (!trackingValidMax[exId]) trackingValidMax[exId] = {}
    if (!trackingValidMax[exId][sem] || poids > trackingValidMax[exId][sem].poids) {
      trackingValidMax[exId][sem] = { poids, reps: s.reps_reelles }
    }
  })

  // RPE de séance
  const { data: rpeSeances } = await supabase
    .from('rpe_seances')
    .select('seance_id, semaine, rpe_reel')
    .in('seance_id', seanceIds)
    .not('rpe_reel', 'is', null)

  let rpeData = []
  if (rpeSeances?.length) {
    const maxSem = Math.max(...rpeSeances.map(r => r.semaine))
    rpeData = rpeSeances.filter(r => r.semaine === maxSem).map(r => r.rpe_reel)
  }
  const rpeMoyen = rpeData.length ? (rpeData.reduce((s, v) => s + parseFloat(v), 0) / rpeData.length).toFixed(1) : null

  // ── Fusion : charges en priorité, serie_tracking en fallback ──
  const byId = {}

  // Parcourir tous les exercices ayant au moins une donnée
  // Les clés sont des UUIDs (strings) — surtout pas .map(Number) !
  const allExIds = new Set([
    ...Object.keys(chargesMap),
    ...Object.keys(trackingAny),
  ])

  allExIds.forEach(exId => {
    const exo = exoMap[exId]
    if (!exo) return
    // Les semaines sont des entiers — .map(Number) est correct ici
    const allSems = new Set([
      ...Object.keys(chargesMap[exId] || {}).map(Number),
      ...Object.keys(trackingAny[exId] || {}).map(Number),
    ])
    if (!allSems.size) return

    const entry = {
      id: exo.id, nom: exo.nom,
      seance_id: exo.seance_id, ordre: exo.ordre ?? 999,
      weeks: {}, allTimeMax: 0,
    }

    allSems.forEach(sem => {
      const valid   = trackingValidMax[exId]?.[sem]
      const logged  = trackingAny[exId]?.[sem]
      const fromCharges = chargesMap[exId]?.[sem]

      let poids, reps
      if (valid) {
        // Reps prescrites atteintes → on affiche le poids réel
        poids = valid.poids
        reps  = valid.reps
      } else if (logged) {
        // Exercice tenté mais reps prescrites non atteintes (ex : test 1RM raté)
        // → on n'affiche rien, même si une valeur existe dans `charges`
        return
      } else if (fromCharges) {
        // Aucune série loguée cette semaine → on fait confiance au tableau manuel
        poids = fromCharges.poids
        reps  = null
      }
      if (!poids) return

      entry.weeks[sem] = { poids, reps }
      if (poids > entry.allTimeMax) entry.allTimeMax = poids
    })

    if (Object.keys(entry.weeks).length > 0) byId[exId] = entry
  })

  // Semaines présentes (toutes sources confondues)
  const allWeeks = [...new Set([
    ...Object.values(chargesMap).flatMap(m => Object.keys(m).map(Number)),
    ...(series || []).map(s => s.semaine),
  ])].sort((a, b) => a - b)

  if (!allWeeks.length) return null

  const totalSemaines = prog.semaines || allWeeks[allWeeks.length - 1] || 1
  const lastWeek = allWeeks[allWeeks.length - 1]

  // ── Tri par séance (ordre) puis par exercice (ordre) ──
  const result = Object.values(byId).sort((a, b) => {
    const sA = seanceMap[a.seance_id]?.ordre ?? 999
    const sB = seanceMap[b.seance_id]?.ordre ?? 999
    if (sA !== sB) return sA - sB
    return a.ordre - b.ordre
  })

  // Groupement par séance pour l'affichage
  const seancesWithExos = seances
    .filter(s => result.some(e => e.seance_id === s.id))
    .map(s => ({ ...s, exercises: result.filter(e => e.seance_id === s.id) }))

  return { exercises: result, seancesWithExos, allWeeks, lastWeek, totalSemaines, rpeMoyen, progNom: prog.nom }
}

export function ChargePanel({ clientId, clientPrenom, clientNom }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [gpsZData, setGpsZData] = useState(null)
  const [gpsZLoading, setGpsZLoading] = useState(false)
  const [exWeightData, setExWeightData] = useState(null)
  const [exWeightLoading, setExWeightLoading] = useState(false)
  const [histoOpen, setHistoOpen] = useState({})
  const [histoData, setHistoData] = useState({})
  const [histoLoading, setHistoLoading] = useState({})

  async function toggleExoHistory(exoId) {
    const isOpen = histoOpen[exoId]
    setHistoOpen(prev => ({ ...prev, [exoId]: !isOpen }))
    if (!isOpen && !histoData[exoId]) {
      setHistoLoading(prev => ({ ...prev, [exoId]: true }))
      const { data } = await supabase
        .from('serie_tracking')
        .select('serie, semaine, poids, reps_reelles, valide')
        .eq('exercice_id', exoId)
        .eq('is_done', true)
        .lt('serie', 1000)
        .order('semaine')
        .order('serie')
      const grouped = {}
      ;(data || []).forEach(r => {
        if (!grouped[r.semaine]) grouped[r.semaine] = []
        grouped[r.semaine].push(r)
      })
      setHistoData(prev => ({ ...prev, [exoId]: grouped }))
      setHistoLoading(prev => ({ ...prev, [exoId]: false }))
    }
  }

  const loadCharge = useCallback(async (cid) => {
    setLoading(true)
    setData([])
    const { data: progs } = await supabase.from('programmes').select('id, nom, semaines, date_debut').eq('client_id', cid)
    if (!progs || progs.length === 0) { setLoading(false); return }
    const progIds = progs.map(p => p.id)
    const progInfo = {}
    progs.forEach(p => { progInfo[p.id] = p })
    const { data: seances } = await supabase.from('seances').select('id, programme_id').in('programme_id', progIds)
    if (!seances || seances.length === 0) { setLoading(false); return }
    const seanceIds = seances.map(s => s.id)
    const seanceProg = {}
    seances.forEach(s => { seanceProg[s.id] = s.programme_id })
    const { data: rpes } = await supabase.from('rpe_seances').select('seance_id, semaine, rpe_reel').in('seance_id', seanceIds).not('rpe_reel', 'is', null)
    if (!rpes || rpes.length === 0) { setLoading(false); return }
    const tonnageMap = {}
    const { data: exercices } = await supabase.from('exercices').select('id, seance_id').in('seance_id', seanceIds)
    if (exercices && exercices.length > 0) {
      const exIds = exercices.map(e => e.id)
      const exSeance = {}
      exercices.forEach(e => { exSeance[e.id] = e.seance_id })
      const { data: trackings } = await supabase.from('serie_tracking').select('exercice_id, semaine, poids, reps_reelles, is_done').in('exercice_id', exIds).eq('is_done', true)
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
    const wellnessMap = {}
    const { data: wellness } = await supabase.from('wellness').select('date, fatigue, douleurs').eq('client_id', cid).not('fatigue', 'is', null)
    if (wellness) { wellness.forEach(w => { wellnessMap[w.date] = w }) }
    const weekMap = {}
    const weekRpeDetails = {}
    rpes.forEach(r => {
      const progId = seanceProg[r.seance_id]
      const prog = progInfo[progId]
      if (!prog) return
      const key = `${progId}_S${r.semaine}`
      if (!weekMap[key]) {
        weekMap[key] = { key, prog_nom: prog.nom, prog_id: progId, semaine: r.semaine, date_debut: prog.date_debut, prog_semaines: prog.semaines, rpe_sum: 0, nb_seances: 0 }
        weekRpeDetails[key] = []
      }
      weekMap[key].rpe_sum += parseFloat(r.rpe_reel) || 0
      weekMap[key].nb_seances += 1
      weekRpeDetails[key].push(parseFloat(r.rpe_reel) || 0)
    })
    const rows = Object.values(weekMap).map(w => {
      const rpe_moy = w.nb_seances > 0 ? w.rpe_sum / w.nb_seances : 0
      const charge = w.rpe_sum
      const nbRest = Math.max(0, 7 - w.nb_seances)
      const dailyLoads = [...weekRpeDetails[w.key], ...Array(nbRest).fill(0)]
      const mean7 = dailyLoads.reduce((s, v) => s + v, 0) / 7
      const variance7 = dailyLoads.reduce((s, v) => s + (v - mean7) ** 2, 0) / 7
      const sd7 = Math.sqrt(variance7)
      const monotonie = sd7 > 0 ? mean7 / sd7 : null
      const tonnage = tonnageMap[w.key] || 0
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
            dayScores.push(((entry.fatigue || 0) + (entry.douleurs || 0)) / 2)
          }
        }
        if (dayScores.length > 0) wellnessScore = dayScores.reduce((s, v) => s + v, 0) / dayScores.length
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
    if (clientId) {
      setData([])
      setGpsZData(null)
      setExWeightData(null)
      loadCharge(clientId)
      setExWeightLoading(true)
      loadExerciseWeights(clientId).then(result => {
        setExWeightData(result)
        setExWeightLoading(false)
      }).catch(err => {
        console.error('[ChargePanel] loadExerciseWeights error:', err)
        setExWeightData(null)
        setExWeightLoading(false)
      })
    }
  }, [clientId, loadCharge])

  useEffect(() => {
    if (!clientId || !clientPrenom || !clientNom) return
    setGpsZLoading(true)
    setGpsZData(null)
    const clientKey = `${clientNom} ${clientPrenom}`.toUpperCase()
    supabase.from('gps_rapports').select('id, nom, date, lignes').order('date', { ascending: true }).then(({ data: rapports }) => {
      if (!rapports || rapports.length === 0) { setGpsZData(false); setGpsZLoading(false); return }
      const sessions = []
      rapports.forEach(r => {
        const lignes = r.lignes || []
        const ligne = lignes.find(l => (l.joueur || '').toUpperCase() === clientKey && l.periode_num === 0)
        if (!ligne) return
        const metrics = {}
        GPS_Z_METRICS.forEach(({ key }) => { const val = parseFloat(ligne[key]); if (!isNaN(val) && val > 0) metrics[key] = val })
        if (Object.keys(metrics).length > 0) sessions.push({ date: r.date, nom: r.nom, metrics })
      })
      if (sessions.length === 0) { setGpsZData(false); setGpsZLoading(false); return }
      const last = sessions[sessions.length - 1]
      const zScores = {}
      GPS_Z_METRICS.forEach(({ key }) => {
        const values = sessions.map(s => s.metrics[key]).filter(v => v !== undefined)
        const current = last.metrics[key]
        const n = values.length
        if (n < 5) { zScores[key] = { z: null, mean: null, sd: null, current, n, insufficient: true }; return }
        const mean = values.reduce((s, v) => s + v, 0) / n
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
        const sd = Math.sqrt(variance)
        if (sd === 0 || current === undefined) { zScores[key] = { z: null, mean, sd, current, n }; return }
        const z = (current - mean) / sd
        zScores[key] = { z: parseFloat(z.toFixed(2)), mean: parseFloat(mean.toFixed(1)), sd: parseFloat(sd.toFixed(1)), current, n }
      })
      setGpsZData({ zScores, lastDate: last.date, lastNom: last.nom, nbSessions: sessions.length, clientName: `${clientPrenom} ${clientNom}` })
      setGpsZLoading(false)
    })
  }, [clientId, clientPrenom, clientNom])

  function zZone(z) {
    if (z === null || z === undefined) return null
    if (Math.abs(z) <= 1) return { color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', label: 'Normal' }
    if (z > 1 && z <= 2)  return { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: '📈', label: 'Progression' }
    if (z >= -2 && z < -1) return { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '📉', label: 'Attention' }
    return { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🚨', label: 'Alarme' }
  }
  function formatVal(val, unit) {
    if (val === undefined || val === null) return '—'
    const v = parseFloat(val)
    if (isNaN(v)) return '—'
    const formatted = v >= 1000 ? v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : v % 1 === 0 ? v.toString() : v.toFixed(1)
    return unit ? `${formatted} ${unit}` : formatted
  }
  function getACWR(rows, idx) {
    if (idx < 0) return null
    const acute = rows[idx]?.charge || 0
    const chronic = rows.slice(Math.max(0, idx - 3), idx + 1).reduce((s, r) => s + r.charge, 0) / Math.min(idx + 1, 4)
    if (!chronic) return null
    return (acute / chronic).toFixed(2)
  }
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
  function getStrain(row) {
    if (row.monotonie === null || row.monotonie === undefined) return null
    return Math.round(row.charge * row.monotonie)
  }
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
    if (score <= 2) return '#22c55e'
    if (score <= 3.5) return '#f59e0b'
    return '#ef4444'
  }
  function wellnessLabel(score) {
    if (score === null || score === undefined) return '—'
    if (score <= 2) return 'Bonne récup'
    if (score <= 3.5) return 'Fatigue modérée'
    return 'Fatigue élevée'
  }
  function getRiskLevel(row, idx, rows) {
    const acwr = parseFloat(getACWR(rows, idx)) || 0
    const tACWR = parseFloat(getTonnageACWR(rows, idx)) || 0
    const mono = row.monotonie || 0
    const wellness = row.wellnessScore
    let redFlags = 0, orangeFlags = 0
    if (acwr > 1.5) redFlags++; else if (acwr > 1.3) orangeFlags++
    if (tACWR > 1.5) redFlags++; else if (tACWR > 1.3) orangeFlags++
    if (mono >= 2.0) redFlags++; else if (mono >= 1.5) orangeFlags++
    if (wellness !== null) { if (wellness > 4) redFlags++; else if (wellness > 3.5) orangeFlags++ }
    if (redFlags >= 1 || orangeFlags >= 2) return redFlags >= 1 ? 'red' : 'red'
    if (orangeFlags >= 1) return 'orange'
    return 'green'
  }

  const maxCharge = Math.max(...data.map(d => d.charge), 1)
  const lastIdx = data.length - 1
  const lastRow = data[lastIdx]

  return (
    <div style={{ padding: '0.5rem 0' }}>

      {/* ── Suivi des charges par exercice ── */}
      {exWeightLoading && (
        <div style={{ ...S.indicateursSection, color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem' }}>
          🏋️ Chargement des charges par exercice…
        </div>
      )}

      {!exWeightLoading && exWeightData && exWeightData.exercises && exWeightData.exercises.length > 0 && (() => {
        const { exercises, seancesWithExos, allWeeks, lastWeek, totalSemaines, rpeMoyen, progNom } = exWeightData
        const nbExtraCols = 5 // Max | Sér./Reps | Évolution | Prog. % | PR

        // KPIs
        const exosCetteSemaine = exercises.filter(e => e.weeks[lastWeek]).length
        const prCount = exercises.filter(e => {
          const keys = Object.keys(e.weeks).map(Number).sort((a, b) => a - b)
          const myLast = keys[keys.length - 1]
          const w = myLast !== undefined ? e.weeks[myLast] : null
          return w && parseFloat(w.poids) >= e.allTimeMax
        }).length
        const chargesLastWeek = exercises.filter(e => e.weeks[lastWeek]).map(e => e.weeks[lastWeek].poids)
        const chargeMaxMoy = chargesLastWeek.length
          ? (chargesLastWeek.reduce((s, v) => s + v, 0) / chargesLastWeek.length).toFixed(1)
          : null
        const tonnageSemaine = exercises.reduce((sum, e) => {
          const w = e.weeks[lastWeek]
          if (!w) return sum
          return sum + (parseFloat(w.poids) || 0) * (parseFloat(w.reps) || 1)
        }, 0)

        // Helper : rendu d'une ligne exercice
        const renderExoRow = (exo) => {
          // Dernière semaine où CET exercice a été fait (directement depuis ses propres clés)
          const exoWeeks = Object.keys(exo.weeks).map(Number).sort((a, b) => a - b)
          const myLastWeek = exoWeeks[exoWeeks.length - 1]
          const myFirstWeek = exoWeeks[0]
          const currentW = myLastWeek !== undefined ? exo.weeks[myLastWeek] : null
          const firstW = myFirstWeek !== undefined ? exo.weeks[myFirstWeek] : null
          const isPR = currentW && parseFloat(currentW.poids) >= exo.allTimeMax
          // Première semaine où le PR actuel a été atteint (seule semaine qui affiche l'étoile)
          const prWeek = exoWeeks.find(w => parseFloat(exo.weeks[w]?.poids) >= exo.allTimeMax)
          let evo = null
          if (currentW && firstW && myLastWeek !== myFirstWeek) evo = parseFloat(currentW.poids) - parseFloat(firstW.poids)
          let progPct = null
          if (currentW && firstW && parseFloat(firstW.poids) > 0) {
            progPct = (((parseFloat(currentW.poids) - parseFloat(firstW.poids)) / parseFloat(firstW.poids)) * 100).toFixed(1)
          }
          const isHistoOpen = histoOpen[exo.id]
          return [
            <tr key={exo.id} style={{ borderBottom: isHistoOpen ? 'none' : '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'white', maxWidth: 180, overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', maxWidth: 160 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{exo.nom}</span>
                  <button onClick={() => toggleExoHistory(exo.id)}
                    style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                    {isHistoOpen ? 'Masquer' : 'Historique'}
                  </button>
                </div>
              </td>
              {allWeeks.map(w => {
                const wd = exo.weeks[w]
                if (!wd) return <td key={w} style={{ padding: '0.4rem 0.3rem', textAlign: 'center' }}><span style={{ color: '#d1d5db', fontSize: '0.7rem' }}>—</span></td>
                const level = weightLevel(wd.poids, exo.allTimeMax)
                const isCellPR = wd.poids >= exo.allTimeMax
                const isCellPRFirst = isCellPR && w === prWeek // étoile uniquement sur la 1re semaine du PR
                const bg = isCellPR ? PR_COLOR : (LEVEL_COLORS[level] || '#e5e7eb')
                return (
                  <td key={w} style={{ padding: '0.4rem 0.3rem', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 54, height: 36, borderRadius: 8, background: bg, color: '#fff', fontWeight: 700, fontSize: '0.78rem', position: 'relative' }}>
                      {wd.poids}
                      {isCellPRFirst && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 8, color: '#fff' }}>★</span>}
                    </div>
                  </td>
                )
              })}
              <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{exo.allTimeMax} kg</td>
              <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center', color: '#6b7280', whiteSpace: 'nowrap' }}>{currentW?.reps ? `×${currentW.reps}` : '—'}</td>
              <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center' }}>
                {evo === null ? <span style={{ color: '#d1d5db', fontSize: '0.7rem' }}>—</span>
                  : evo > 0 ? <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '2px 7px', fontWeight: 700, fontSize: '0.75rem' }}>+{evo} kg</span>
                  : evo < 0 ? <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 7px', fontWeight: 700, fontSize: '0.75rem' }}>{evo} kg</span>
                  : <span style={{ background: '#f5f5f5', color: '#aaa', borderRadius: 6, padding: '2px 7px', fontWeight: 700, fontSize: '0.75rem' }}>= 0</span>}
              </td>
              <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center' }}>
                {progPct !== null
                  ? <span style={{ fontWeight: 700, color: parseFloat(progPct) >= 0 ? '#15803d' : '#991b1b', fontSize: '0.78rem' }}>{parseFloat(progPct) >= 0 ? '+' : ''}{progPct}%</span>
                  : <span style={{ color: '#d1d5db', fontSize: '0.7rem' }}>—</span>}
              </td>
              <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center' }}>
                {isPR
                  ? myLastWeek === prWeek
                    ? <span style={{ background: PR_COLOR, color: '#fff', borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: '0.72rem' }}>★ PR</span>
                    : <span style={{ background: PR_COLOR, color: '#fff', borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: '0.72rem' }}>PR</span>
                  : <span style={{ color: '#d1d5db', fontSize: '0.7rem' }}>—</span>}
              </td>
            </tr>,
            isHistoOpen && (
              <tr key={`histo-${exo.id}`} style={{ background: '#f9fafb', borderBottom: '2px solid #f3f4f6' }}>
                <td colSpan={1 + allWeeks.length + nbExtraCols} style={{ padding: '0.75rem 1rem' }}>
                  {histoLoading[exo.id] ? (
                    <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>Chargement…</span>
                  ) : (() => {
                    const grouped = histoData[exo.id] || {}
                    const sems = Object.keys(grouped).map(Number).sort((a, b) => a - b)
                    if (!sems.length) return <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>Aucune série enregistrée.</span>
                    return (
                      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                        {sems.map(sem => {
                          const rows = grouped[sem] || []
                          const poidsVals = rows.map(r => parseFloat(r.poids)).filter(Boolean)
                          const poidsLabel = !poidsVals.length ? '—'
                            : poidsVals.every(p => p === poidsVals[0]) ? `${poidsVals[0]} kg`
                            : `${Math.min(...poidsVals)}–${Math.max(...poidsVals)} kg`
                          return (
                            <div key={sem} style={{ minWidth: 90 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                                <span style={{ background: '#e5e7eb', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 800, color: '#374151' }}>S{sem}</span>
                                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{poidsLabel}</span>
                              </div>
                              {rows.map((r, ri) => (
                                <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.18rem' }}>
                                  <span style={{ fontSize: '0.6rem', color: '#d1d5db', width: 14, flexShrink: 0 }}>{r.serie}</span>
                                  <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '0.78rem' }}>{r.poids ? `${r.poids} kg` : '—'}</span>
                                  <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>{r.reps_reelles ? `×${r.reps_reelles}` : ''}</span>
                                  <span style={{ marginLeft: 'auto', color: r.valide ? '#22c55e' : '#d1d5db', fontSize: '0.65rem', flexShrink: 0 }}>{r.valide ? '✓' : ''}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </td>
              </tr>
            ),
          ]
        }

        return (
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e8e8f0', padding: '1.25rem', marginBottom: '1rem' }}>
            {/* Titre + badge semaine */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem' }}>🏋️ Suivi des charges par exercice</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.1rem' }}>{progNom}</div>
              </div>
              <div style={{ padding: '3px 10px', borderRadius: 999, background: '#eff6ff', color: '#3b82f6', fontSize: '0.68rem', fontWeight: 700, border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                Semaine {lastWeek} / {totalSemaines}
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.625rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Exercices trackés', value: exosCetteSemaine, color: '#3b82f6' },
                { label: 'PRs cette semaine', value: prCount, color: '#15803d' },
                { label: 'Charge max moy.', value: chargeMaxMoy ? `${chargeMaxMoy} kg` : '—', color: '#f97316' },
                { label: 'Tonnage sem.', value: tonnageSemaine > 0 ? `${Math.round(tonnageSemaine).toLocaleString('fr-FR')} kg` : '—', color: '#7c3aed' },
                { label: 'RPE moyen', value: rpeMoyen || '—', color: '#ef4444' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '0.75rem', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>{kpi.label}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Tableau groupé par séance */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '0.55rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: '#888', borderBottom: '1px solid #e8e8f0', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fafafa' }}>Exercice</th>
                    {allWeeks.map(w => (
                      <th key={w} style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: w === lastWeek ? '#3b82f6' : '#888', borderBottom: '1px solid #e8e8f0', whiteSpace: 'nowrap', background: w === lastWeek ? '#eff6ff' : '#fafafa' }}>
                        S{w}
                      </th>
                    ))}
                    <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#888', borderBottom: '1px solid #e8e8f0', whiteSpace: 'nowrap', background: '#fafafa' }}>Max</th>
                    <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#888', borderBottom: '1px solid #e8e8f0', whiteSpace: 'nowrap', background: '#fafafa' }}>Reps</th>
                    <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#888', borderBottom: '1px solid #e8e8f0', whiteSpace: 'nowrap', background: '#fafafa' }}>Évolution S1</th>
                    <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#888', borderBottom: '1px solid #e8e8f0', whiteSpace: 'nowrap', background: '#fafafa' }}>Prog. %</th>
                    <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: '#888', borderBottom: '1px solid #e8e8f0', whiteSpace: 'nowrap', background: '#fafafa' }}>PR</th>
                  </tr>
                </thead>
                <tbody>
                  {(seancesWithExos || [{ nom: null, exercises }]).map((seance, si) => (
                    <>
                      {/* En-tête séance */}
                      {seance.nom && (
                        <tr key={`seance-header-${seance.id ?? si}`}>
                          <td colSpan={1 + allWeeks.length + nbExtraCols}
                            style={{ padding: '0.45rem 0.75rem', background: '#f0f4ff', borderTop: si > 0 ? '2px solid #dde3f4' : undefined, borderBottom: '1px solid #dde3f4', position: 'sticky', left: 0 }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#3b5bdb', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                              📋 {seance.nom}
                            </span>
                          </td>
                        </tr>
                      )}
                      {/* Lignes exercices */}
                      {seance.exercises.map(exo => renderExoRow(exo))}
                      {/* Mini récap par séance */}
                      <tr key={`recap-${seance.id ?? si}`} style={{ background: '#fafbff' }}>
                        <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', position: 'sticky', left: 0, background: '#fafbff' }}>moy.</td>
                        {allWeeks.map(w => {
                          const vals = seance.exercises.map(e => e.weeks[w]?.poids).filter(Boolean)
                          if (!vals.length) return <td key={w} style={{ padding: '0.3rem 0.3rem', textAlign: 'center', color: '#d1d5db', fontSize: '0.68rem' }}>—</td>
                          const moy = (vals.reduce((s, v) => s + parseFloat(v), 0) / vals.length).toFixed(1)
                          return <td key={w} style={{ padding: '0.3rem 0.3rem', textAlign: 'center', fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}>{moy}</td>
                        })}
                        <td colSpan={nbExtraCols} />
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Légende couleurs */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginRight: '0.25rem' }}>% du max :</span>
              {[
                { color: '#ef4444', label: '< 84%' },
                { color: '#f97316', label: '84–88%' },
                { color: '#eab308', label: '88–93%' },
                { color: '#84cc16', label: '93–98%' },
                { color: '#16a34a', label: '≥ 98%' },
                { color: PR_COLOR, label: 'PR ★' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: '#6b7280' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color, flexShrink: 0 }} />
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {loading && <div style={S.empty}>Chargement…</div>}

      {!loading && !exWeightLoading && data.length === 0 && !exWeightData && !gpsZLoading && !gpsZData && (
        <div style={S.emptyState}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
          <div style={{ color: '#374151', fontWeight: '600' }}>Aucune donnée</div>
          <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginTop: '0.25rem' }}>Le client doit renseigner son RPE et ses charges après les séances</div>
        </div>
      )}

      {/* GPS */}
      {!loading && (
        <>
          {gpsZLoading && <div style={{ ...S.indicateursSection, color: '#9ca3af', fontSize: '0.85rem' }}>📡 Chargement des données GPS…</div>}
          {!gpsZLoading && gpsZData && (
            <div style={S.indicateursSection}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={S.indicateursTitle}>📡 GPS — Analyse individuelle · {gpsZData.clientName}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.1rem' }}>Dernière séance : {gpsZData.lastNom || gpsZData.lastDate} · {gpsZData.nbSessions} séances analysées</div>
                </div>
                <div style={{ padding: '3px 10px', borderRadius: 999, background: '#f0fdf4', color: '#22c55e', fontSize: '0.68rem', fontWeight: 700, border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>Z-score individuel</div>
              </div>
              <div style={S.indicateursGrid}>
                {GPS_Z_METRICS.map(({ key, label, unit, icon }) => {
                  const d = gpsZData.zScores[key]
                  if (!d) return null
                  if (d.insufficient) return (
                    <div key={key} style={{ ...S.indCard, opacity: 0.65 }}>
                      <div style={S.indLabel}>{icon} {label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic', marginTop: '0.25rem' }}>Données insuffisantes</div>
                      <div style={{ fontSize: '0.62rem', color: '#d1d5db', marginTop: '0.3rem' }}>{d.n} séance{d.n > 1 ? 's' : ''} · min. 5 requises</div>
                    </div>
                  )
                  if (d.z === null) return (
                    <div key={key} style={{ ...S.indCard, opacity: 0.65 }}>
                      <div style={S.indLabel}>{icon} {label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Pas de donnée</div>
                    </div>
                  )
                  const zone = zZone(d.z)
                  return (
                    <div key={key} style={{ ...S.indCard, background: zone.bg, border: `1px solid ${zone.border}` }}>
                      <div style={{ ...S.indLabel, color: '#6b7280' }}>{icon} {label}</div>
                      <div style={{ ...S.indValue, color: zone.color }}>{d.z > 0 ? '+' : ''}{d.z}<span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500 }}> SD</span></div>
                      <div style={{ ...S.indBadge, background: zone.color + '20', color: zone.color }}>{zone.icon} {zone.label}</div>
                      <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.3rem', lineHeight: 1.4 }}>{formatVal(d.current, unit)} · moy. {formatVal(d.mean, unit)}</div>
                      <div style={S.indRef}>{d.n} séances · ±1SD = {formatVal(d.sd, unit)}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
                {[{icon:'✅',label:'Normal (±1 SD)',color:'#22c55e'},{icon:'📈',label:'Progression (+1→+2 SD)',color:'#3b82f6'},{icon:'📉',label:'Attention (−2→−1 SD)',color:'#f59e0b'},{icon:'🚨',label:'Alarme (> ±2 SD)',color:'#ef4444'}].map(z=>(
                  <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: '#6b7280' }}><span>{z.icon}</span><span style={{ color: z.color, fontWeight: 600 }}>{z.label}</span></div>
                ))}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.4rem' }}>Batterham &amp; Hopkins (2006) · Comparaison du joueur à lui-même sur l'ensemble de ses séances GPS</div>
            </div>
          )}
        </>
      )}

      {data.length > 0 && (
        <>
          {lastRow && (
            <div style={S.indicateursSection}>
              <div style={S.indicateursTitle}>Dernière semaine enregistrée — {lastRow.prog_nom} · Semaine {lastRow.semaine}</div>
              <div style={S.indicateursGrid}>
                {(() => { const acwr = getACWR(data, lastIdx); const color = acwrColor(acwr); return (<div style={S.indCard}><div style={S.indLabel}>ACWR interne</div><div style={{ ...S.indValue, color }}>{acwr || '—'}</div><div style={{ ...S.indBadge, background: color + '20', color }}>{acwrLabel(acwr)}</div><div style={S.indRef}>Gabbett 2016 · Zone optimale 0.8–1.3</div></div>) })()}
                {(() => { const tACWR = getTonnageACWR(data, lastIdx); if (!tACWR) return null; const color = acwrColor(tACWR); return (<div style={S.indCard}><div style={S.indLabel}>ACWR tonnage</div><div style={{ ...S.indValue, color }}>{tACWR}</div><div style={{ ...S.indBadge, background: color + '20', color }}>{acwrLabel(tACWR)}</div><div style={S.indRef}>Hulin 2016 · {Math.round(lastRow.tonnage).toLocaleString('fr-FR')} kg cette sem.</div></div>) })()}
                {lastRow.monotonie !== null && (() => { const color = monotonyColor(lastRow.monotonie); return (<div style={S.indCard}><div style={S.indLabel}>Monotonie</div><div style={{ ...S.indValue, color }}>{lastRow.monotonie.toFixed(2)}</div><div style={{ ...S.indBadge, background: color + '20', color }}>{monotonyLabel(lastRow.monotonie)}</div><div style={S.indRef}>Foster 1998 · Risque si &gt; 2.0</div></div>) })()}
                {lastRow.monotonie !== null && (() => { const strain = getStrain(lastRow); const color = strainColor(strain); return (<div style={S.indCard}><div style={S.indLabel}>Strain</div><div style={{ ...S.indValue, color }}>{strain !== null ? strain.toLocaleString('fr-FR') : '—'}</div><div style={{ ...S.indBadge, background: color + '20', color }}>{strain < 4000 ? 'Faible' : strain < 6000 ? 'Modéré' : 'Élevé'}</div><div style={S.indRef}>Foster 1998 · Charge × Monotonie</div></div>) })()}
                {lastRow.wellnessScore !== null && lastRow.wellnessScore !== undefined && (() => { const color = wellnessColor(lastRow.wellnessScore); return (<div style={S.indCard}><div style={S.indLabel}>Récupération</div><div style={{ ...S.indValue, color }}>{lastRow.wellnessScore.toFixed(1)}<span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>/5</span></div><div style={{ ...S.indBadge, background: color + '20', color }}>{wellnessLabel(lastRow.wellnessScore)}</div><div style={S.indRef}>Fatigue + douleurs moy. (wellness)</div></div>) })()}
              </div>
              {(() => {
                const risk = getRiskLevel(lastRow, lastIdx, data)
                const config = { green: { color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', label: 'Risque faible', desc: 'La charge est bien équilibrée. Continuez sur cette lancée.' }, orange: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '⚠️', label: 'Vigilance', desc: 'Certains indicateurs méritent attention. Surveiller la récupération.' }, red: { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🚨', label: 'Risque élevé', desc: "Plusieurs signaux d'alarme. Envisager une semaine de décharge." } }[risk]
                return (<div style={{ background: config.bg, border: `1.5px solid ${config.border}`, borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.875rem' }}><div style={{ fontSize: '1.75rem', lineHeight: 1 }}>{config.icon}</div><div><div style={{ fontWeight: '700', color: config.color, fontSize: '0.95rem' }}>{config.label}</div><div style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.15rem' }}>{config.desc}</div></div></div>)
              })()}
            </div>
          )}
          <div style={S.chartCard}>
            <div style={S.chartTitle}>Charge hebdomadaire (Σ RPE) — colorée par ACWR</div>
            <div style={S.chartArea}>
              {data.map((d, idx) => {
                const h = Math.round((d.charge / maxCharge) * 160)
                const acwr = getACWR(data, idx)
                const color = acwrColor(acwr)
                return (<div key={d.key} style={S.barGroup}><div style={S.barValue}>{d.charge.toFixed(0)}</div><div style={{ ...S.bar, height: `${h}px`, background: color }} title={`ACWR: ${acwr} — ${acwrLabel(acwr)}`} /><div style={S.barLabel}>S{d.semaine}</div><div style={{ fontSize: '0.6rem', color: '#9ca3af', maxWidth: '40px', textAlign: 'center', lineHeight: 1.2 }}>{d.prog_nom.substring(0, 8)}</div></div>)
              })}
            </div>
            <div style={S.legend}>{[{color:'#3b82f6',label:'Sous-charge (< 0.8)'},{color:'#22c55e',label:'Optimal (0.8–1.3)'},{color:'#f59e0b',label:'Attention (1.3–1.5)'},{color:'#ef4444',label:'Surcharge (> 1.5)'}].map(l=>(<div key={l.label} style={S.legendItem}><div style={{...S.legendDot,background:l.color}}/><span>{l.label}</span></div>))}</div>
          </div>
          <div style={S.tableCard}>
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead><tr style={S.thead}><th style={S.th}>Programme</th><th style={S.th}>Sem.</th><th style={S.th}>Séances</th><th style={S.th}>RPE moy.</th><th style={S.th}>Charge</th><th style={S.th}>ACWR RPE</th><th style={S.th}>Tonnage</th><th style={S.th}>ACWR T.</th><th style={S.th}>Monotonie</th><th style={S.th}>Strain</th><th style={S.th}>Risque</th></tr></thead>
                <tbody>
                  {data.map((d, idx) => {
                    const acwr = getACWR(data, idx)
                    const tACWR = getTonnageACWR(data, idx)
                    const strain = getStrain(d)
                    const risk = getRiskLevel(d, idx, data)
                    const riskConfig = { green: { color: '#22c55e', label: '✅ OK' }, orange: { color: '#f59e0b', label: '⚠️ Vigilance' }, red: { color: '#ef4444', label: '🚨 Risque' } }[risk]
                    return (<tr key={d.key} style={S.tr}><td style={S.td}>{d.prog_nom}</td><td style={S.td}>S{d.semaine}</td><td style={S.td}>{d.nb_seances}</td><td style={S.td}>{d.rpe_moy.toFixed(1)}</td><td style={{ ...S.td, fontWeight: '700' }}>{d.charge.toFixed(0)}</td><td style={{ ...S.td, fontWeight: '700', color: acwrColor(acwr) }}>{acwr || '—'}</td><td style={S.td}>{d.tonnage > 0 ? Math.round(d.tonnage).toLocaleString('fr-FR') + ' kg' : '—'}</td><td style={{ ...S.td, fontWeight: '600', color: acwrColor(tACWR) }}>{tACWR || '—'}</td><td style={{ ...S.td, fontWeight: '600', color: monotonyColor(d.monotonie) }}>{d.monotonie !== null ? d.monotonie.toFixed(2) : '—'}</td><td style={{ ...S.td, color: strainColor(strain) }}>{strain !== null ? strain.toLocaleString('fr-FR') : '—'}</td><td style={{ ...S.td, fontWeight: '700', color: riskConfig.color, whiteSpace: 'nowrap' }}>{riskConfig.label}</td></tr>)
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div style={S.refsCard}>
            <div style={S.refsTitle}>📚 Bases scientifiques</div>
            <div style={S.refsList}>
              <div style={S.refItem}><span style={S.refBullet}>•</span><span><strong>ACWR interne (RPE)</strong> — Gabbett TJ (2016). Rapport charge aiguë / charge chronique (4 sem.). Zone optimale 0.8–1.3 ; au-delà de 1.5, le risque de blessure double.</span></div>
              <div style={S.refItem}><span style={S.refBullet}>•</span><span><strong>ACWR tonnage (charge externe)</strong> — Hulin BT et al. (2016). Volume en kg × reps. Complète l'ACWR RPE en mesurant la contrainte mécanique réelle.</span></div>
              <div style={S.refItem}><span style={S.refBullet}>•</span><span><strong>Monotonie d'entraînement</strong> — Foster C (1998). Charge moy. journalière / Écart-type. Au-dessus de 2.0 : manque de variation = risque de surentraînement.</span></div>
              <div style={S.refItem}><span style={S.refBullet}>•</span><span><strong>Strain d'entraînement</strong> — Foster C (1998). Charge hebdo × Monotonie. Indicateur du stress physiologique cumulé sur la semaine.</span></div>
              <div style={S.refItem}><span style={S.refBullet}>•</span><span><strong>GPS — Z-scores individuels</strong> — Batterham &amp; Hopkins (2006). Limites de référence statistiques individuelles : Z = (valeur − µ) / σ. Zones : ±1 SD normal, ±2 SD vigilance, &gt;±2 alarme. Minimum 5 séances requis.</span></div>
              <div style={S.refItem}><span style={S.refBullet}>•</span><span><strong>GPS — Suivi de charge externe</strong> — Akenhead R &amp; Nassis GP (2016). Player Load, distance haute vitesse, accélérations/décélérations : indicateurs validés du stress mécanique en sports collectifs.</span></div>
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
