import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { PageLoading } from '../components/Skeleton'

// ─── Formules 1RM (identique à ProgressionClient) ────────────────────────────

function getFormulaConfig(nom) {
  const n = (nom || '').toLowerCase()
  if (n.includes('soulevé') || n.includes('deadlift') || n.includes('sdt') ||
      n.includes('roumain') || n.includes('sumo') || n.includes('jefferson'))
    return { formula: 'weight_dependent', correction: 0.06 }
  if (n.includes('couché') || n.includes('bench') || n.includes('incliné') || n.includes('décliné'))
    return { formula: 'lombardi', correction: 0 }
  if (n.includes('squat') && !n.includes('face pull'))
    return { formula: 'weight_dependent', correction: 0 }
  if (n.includes('militaire') || n.includes('overhead') || n.includes('ohp') ||
      n.includes('push press') || n.includes('push jerk'))
    return { formula: 'weight_dependent', correction: 0 }
  if (n.includes('hip thrust') || n.includes('pont fessier'))
    return { formula: 'weight_dependent', correction: 0 }
  if (n.includes('leg press') || (n.includes('presse') && n.includes('jambe')))
    return { formula: 'weight_dependent', correction: 0 }
  if ((n.includes('traction') || n.includes('pull-up') || n.includes('chin')) && n.includes('lest'))
    return { formula: 'weight_dependent', correction: 0 }
  return null
}

function calculate1RM(w, r, formula, correction = 0) {
  if (!w || !r || w <= 0 || r <= 0 || r > 15) return null
  if (r === 1) return w * (1 + (correction || 0))
  let rm
  if (formula === 'weight_dependent') {
    const denom = -2.55 + 4.58 * Math.log(w)
    rm = (denom <= 0 || w < 20)
      ? w * (1 + r / 30)
      : w * (1 + Math.pow(r - 1, 0.85) / denom)
  } else if (formula === 'lombardi') {
    rm = w * Math.pow(r, 0.10)
  } else {
    rm = w * (1 + r / 30)
  }
  if (correction) rm = rm * (1 + correction)
  return Math.round(rm * 2) / 2
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function avg(arr) {
  if (!arr.length) return null
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
}

function formatMois(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function moisCourant() {
  const now = new Date()
  return {
    debut: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    fin:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
    label: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
  }
}

function today() {
  return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Composants UI ───────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <h2 style={S.sectionTitle}>{children}</h2>
  )
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={S.kpiCard}>
      <div style={{ ...S.kpiValue, color: color || '#1a1a1a' }}>{value}</div>
      <div style={S.kpiLabel}>{label}</div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
    </div>
  )
}

function Badge({ children, color = '#e4f816', bg = '#1f2937' }) {
  return (
    <span style={{ background: bg, color, borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px' }}>
      {children}
    </span>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function RapportClient() {
  const { clientId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [rapport, setRapport]   = useState(null)
  const [commentaire, setCommentaire] = useState('')

  const mois = moisCourant()

  // ── Chargement de toutes les données ─────────────────────────────────────

  useEffect(() => {
    if (!clientId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function load() {
    try {
      setLoading(true)

      // ── 1. Client ──────────────────────────────────────────────────────────
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('id, prenom, nom, offre, date_debut')
        .eq('id', clientId)
        .maybeSingle()
      if (clientErr || !client) { setError('Client introuvable'); setLoading(false); return }

      // ── 2. Programmes → le plus récent ─────────────────────────────────────
      const { data: progs } = await supabase
        .from('programmes')
        .select('id, nom, semaines, date_debut, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
      const prog = progs?.[0] || null

      // ── 3. Séances + serie_tracking ───────────────────────────────────────
      let seances = []
      let seriesValides = []
      let exercicesNoms = {}  // exercice_id → nom
      let seanceIds = []

      if (prog) {
        const { data: _seances } = await supabase
          .from('seances')
          .select('id, nom, ordre')
          .eq('programme_id', prog.id)
          .order('ordre')
        seances = _seances || []
        seanceIds = seances.map(s => s.id)

        if (seanceIds.length) {
          // Exercices (pour 1RM)
          const { data: exs } = await supabase
            .from('exercices')
            .select('id, nom, seance_id')
            .in('seance_id', seanceIds)
          ;(exs || []).forEach(e => { exercicesNoms[e.id] = e.nom })

          const exIds = (exs || []).map(e => e.id)

          if (exIds.length) {
            // Serie_tracking du mois courant
            const { data: series } = await supabase
              .from('serie_tracking')
              .select('exercice_id, semaine, poids, reps_reelles, valide, is_done')
              .in('exercice_id', exIds)
              .eq('valide', true)
              .gt('poids', 0)
              .gt('reps_reelles', 0)
              .lte('reps_reelles', 15)
            seriesValides = series || []
          }
        }
      }

      // Déterminer les semaines du mois courant par rapport à date_debut
      let semainesDuMois = new Set()
      if (prog) {
        const dateDebut = new Date((prog.date_debut || prog.created_at) + 'T00:00:00')
        const debutMois = new Date(mois.debut + 'T00:00:00')
        const finMois   = new Date(mois.fin   + 'T00:00:00')
        for (let sem = 1; sem <= (prog.semaines || 52); sem++) {
          const semDate = new Date(dateDebut)
          semDate.setDate(semDate.getDate() + (sem - 1) * 7)
          if (semDate >= debutMois && semDate <= finMois) semainesDuMois.add(sem)
        }
      }

      // Compliance : séances avec ≥ 1 set validé ce mois
      const seancesAvecData = new Set(
        seriesValides
          .filter(s => semainesDuMois.has(s.semaine))
          .map(s => {
            // retrouver la seance_id via exercicesNoms n'est pas possible ici
            // on approxime : nb d'exercices uniques touchés / nb total séances
            return s.exercice_id
          })
      )
      // Compliance simplifiée : séances où ≥ 1 set existe ce mois / total séances du programme
      const setsParSeance = {}
      seriesValides
        .filter(s => semainesDuMois.has(s.semaine))
        .forEach(s => {
          // Remonter à la séance via exercicesNoms → seance_id
          // On ne peut pas sans un join supplémentaire. On utilise un proxy : exercice_id unique par séance
          const ex = s.exercice_id
          if (!setsParSeance[ex]) setsParSeance[ex] = 0
          setsParSeance[ex]++
        })

      // Compliance réelle via séances avec des données
      const seancesAvecSeries = new Set()
      if (seanceIds.length) {
        // Reconstruire map exercice_id → seance_id
        const { data: exsFull } = await supabase
          .from('exercices')
          .select('id, seance_id')
          .in('seance_id', seanceIds)
        const exToSeance = {}
        ;(exsFull || []).forEach(e => { exToSeance[e.id] = e.seance_id })
        seriesValides
          .filter(s => semainesDuMois.has(s.semaine))
          .forEach(s => {
            const sid = exToSeance[s.exercice_id]
            if (sid) seancesAvecSeries.add(sid)
          })
      }
      const totalSeances   = seances.length * (semainesDuMois.size || 1)
      const seancesReelles = seancesAvecSeries.size
      const compliance     = totalSeances > 0
        ? Math.round((seancesReelles / totalSeances) * 100)
        : null

      // ── 4. RPE séances du mois ────────────────────────────────────────────
      let rpeMoyen = null
      if (seanceIds.length) {
        const { data: rpeRows } = await supabase
          .from('rpe_seances')
          .select('seance_id, semaine, rpe_reel')
          .in('seance_id', seanceIds)
          .not('rpe_reel', 'is', null)
        const rpesMois = (rpeRows || [])
          .filter(r => semainesDuMois.has(r.semaine))
          .map(r => r.rpe_reel)
        rpeMoyen = avg(rpesMois)
      }

      // ── 5. 1RM début vs fin du mois ───────────────────────────────────────
      // Exercices avec formule 1RM — comparer première et dernière semaine du mois
      const semDebut = Math.min(...[...semainesDuMois])
      const semFin   = Math.max(...[...semainesDuMois])
      const exAvecFormule = Object.entries(exercicesNoms)
        .filter(([id, nom]) => getFormulaConfig(nom))

      const progressionExos = []
      exAvecFormule.forEach(([exId, nom]) => {
        const cfg = getFormulaConfig(nom)
        // Sets de début de mois (première semaine du mois)
        const setsDebut = seriesValides.filter(s => s.exercice_id === exId && s.semaine === semDebut)
        const setsFin   = seriesValides.filter(s => s.exercice_id === exId && s.semaine === semFin)
        if (!setsDebut.length && !setsFin.length) return

        const rm1 = (sets) => sets.reduce((max, s) => {
          const rm = calculate1RM(s.poids, s.reps_reelles, cfg.formula, cfg.correction)
          return rm !== null && rm > max ? rm : max
        }, 0) || null

        const rmDebut = rm1(setsDebut)
        const rmFin   = rm1(setsFin)
        if (!rmDebut && !rmFin) return

        progressionExos.push({
          nom,
          rmDebut: rmDebut || null,
          rmFin:   rmFin   || null,
          delta:   (rmDebut && rmFin) ? Math.round((rmFin - rmDebut) * 2) / 2 : null,
        })
      })

      // Trier : les plus grandes progressions en premier
      progressionExos.sort((a, b) => (b.delta || 0) - (a.delta || 0))

      // ── 6. Nutrition ──────────────────────────────────────────────────────
      const { data: nutGoals } = await supabase
        .from('nutrition_goals')
        .select('kcal_target, prot_g, carbs_g, fat_g')
        .eq('client_id', clientId)
        .order('active_from', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nutMoyen = null
      let joursLogges = 0
      if (nutGoals) {
        const { data: meals } = await supabase
          .from('nutrition_meals')
          .select('date, kcal, prot_g')
          .eq('client_id', clientId)
          .gte('date', mois.debut)
          .lte('date', mois.fin)
        if (meals?.length) {
          const joursDist = new Set(meals.map(m => m.date))
          joursLogges = joursDist.size
          const kcalParJour = {}
          const protParJour = {}
          meals.forEach(m => {
            kcalParJour[m.date] = (kcalParJour[m.date] || 0) + (m.kcal || 0)
            protParJour[m.date] = (protParJour[m.date] || 0) + (m.prot_g || 0)
          })
          nutMoyen = {
            kcal:      avg(Object.values(kcalParJour)),
            proteines: avg(Object.values(protParJour)),
          }
        }
      }

      // ── 7. Wellness du mois ───────────────────────────────────────────────
      const { data: wellnessRows } = await supabase
        .from('wellness')
        .select('date, energie, humeur, sommeil, poids')
        .eq('client_id', clientId)
        .gte('date', mois.debut)
        .lte('date', mois.fin)
        .order('date')

      let wellnessMoyen = null
      let poidsDebut = null, poidsFin = null
      if (wellnessRows?.length) {
        wellnessMoyen = {
          energie:  avg(wellnessRows.filter(w => w.energie).map(w => w.energie)),
          sommeil:  avg(wellnessRows.filter(w => w.sommeil).map(w => w.sommeil)),
          humeur:   avg(wellnessRows.filter(w => w.humeur).map(w => w.humeur)),
        }
        const avecPoids = wellnessRows.filter(w => w.poids)
        if (avecPoids.length) {
          poidsDebut = avecPoids[0].poids
          poidsFin   = avecPoids[avecPoids.length - 1].poids
        }
      }

      setRapport({
        client,
        prog,
        compliance,
        seancesReelles,
        totalSeances,
        rpeMoyen,
        progressionExos: progressionExos.slice(0, 8),
        nutGoals,
        nutMoyen,
        joursLogges,
        wellnessMoyen,
        poidsDebut,
        poidsFin,
        moisLabel: mois.label,
      })

    } catch (e) {
      console.error('[RapportClient]', e)
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) return <PageLoading />

  if (error) return (
    <div style={S.errorPage}>
      <button onClick={() => navigate(-1)} style={S.backBtn}>← Retour</button>
      <p style={{ color: '#6b7280' }}>{error}</p>
    </div>
  )

  if (!rapport) return null
  const { client, prog, compliance, seancesReelles, totalSeances, rpeMoyen,
          progressionExos, nutGoals, nutMoyen, joursLogges,
          wellnessMoyen, poidsDebut, poidsFin, moisLabel } = rapport

  const poidsDelta = (poidsDebut && poidsFin)
    ? Math.round((poidsFin - poidsDebut) * 10) / 10
    : null

  return (
    <div style={S.page}>
      {/* ── Style @media print ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          #rapport-print { box-shadow: none !important; border-radius: 0 !important; }
          @page { margin: 1cm; }
        }
      `}</style>

      {/* ── Barre d'actions (non imprimée) ────────────────────────────────── */}
      <div className="no-print" style={S.actionBar}>
        <button onClick={() => navigate(-1)} style={S.backBtn}>← Retour</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load()} style={S.refreshBtn} title="Recharger">
            🔄
          </button>
          <button onClick={() => window.print()} style={S.printBtn}>
            🖨️ Imprimer / Exporter PDF
          </button>
        </div>
      </div>

      {/* ── Rapport imprimable ─────────────────────────────────────────────── */}
      <div id="rapport-print" style={S.rapport}>

        {/* En-tête */}
        <div style={S.rapportHeader}>
          <div style={S.rapportHeaderLeft}>
            <img src="/logo-blanc.png" alt="AWprepa" style={{ height: 36, width: 'auto', display: 'block' }} />
            <div>
              <p style={S.rapportSubtitle}>Rapport mensuel</p>
              <h1 style={S.rapportNomClient}>
                {client.prenom} {client.nom}
              </h1>
              <p style={S.rapportPeriode}>{moisLabel}</p>
            </div>
          </div>
          <div style={S.rapportHeaderRight}>
            {prog && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', marginBottom: 4 }}>Programme</div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>{prog.nom}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem', marginTop: 4 }}>
                  {prog.semaines} semaines
                </div>
              </div>
            )}
            <div style={S.offreBadge}>
              {client.offre === 'preparation_physique' ? 'Prépa physique'
               : client.offre === 'coaching' ? 'Coaching'
               : 'Essai'}
            </div>
          </div>
        </div>

        {/* ── Section Entraînement ───────────────────────────────────────── */}
        <div style={S.rapportBody}>
          <SectionTitle>🏋️ Entraînement</SectionTitle>
          <div style={S.kpiRow}>
            <KpiCard
              label="Compliance"
              value={compliance !== null ? `${compliance}%` : '—'}
              sub={compliance !== null ? `${seancesReelles} / ${totalSeances} séances` : 'Pas de données'}
              color={compliance >= 80 ? '#16a34a' : compliance >= 60 ? '#d97706' : '#dc2626'}
            />
            <KpiCard
              label="RPE moyen"
              value={rpeMoyen !== null ? `${rpeMoyen}/10` : '—'}
              sub={rpeMoyen !== null
                ? rpeMoyen >= 8 ? 'Intensité élevée'
                  : rpeMoyen >= 6 ? 'Intensité modérée'
                  : 'Intensité légère'
                : 'Non renseigné'}
              color={rpeMoyen >= 8 ? '#dc2626' : rpeMoyen >= 6 ? '#d97706' : '#16a34a'}
            />
            <KpiCard
              label="Séances"
              value={seancesReelles || '—'}
              sub="réalisées ce mois"
            />
          </div>

          {/* ── Progression 1RM ───────────────────────────────────────────── */}
          {progressionExos.length > 0 && (
            <>
              <h3 style={S.subTitle}>Progression des charges</h3>
              <div style={S.tableWrapper}>
                <table style={S.table}>
                  <thead>
                    <tr style={S.tableHead}>
                      <th style={{ ...S.th, textAlign: 'left' }}>Exercice</th>
                      <th style={S.th}>Début du mois</th>
                      <th style={S.th}>Fin du mois</th>
                      <th style={S.th}>Évolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progressionExos.map((ex, i) => (
                      <tr key={i} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{ex.nom}</td>
                        <td style={{ ...S.td, textAlign: 'center', color: '#6b7280' }}>
                          {ex.rmDebut ? `${ex.rmDebut} kg` : '—'}
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          {ex.rmFin ? `${ex.rmFin} kg` : '—'}
                        </td>
                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 700,
                          color: ex.delta > 0 ? '#16a34a' : ex.delta < 0 ? '#dc2626' : '#6b7280' }}>
                          {ex.delta !== null
                            ? `${ex.delta > 0 ? '+' : ''}${ex.delta} kg`
                            : '—'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={S.tableNote}>* 1RM estimé (SportRxiv 2024 / Lombardi 1989) — fiable sur 3–8 reps</p>
              </div>
            </>
          )}

          {progressionExos.length === 0 && (
            <p style={S.emptyNote}>Pas encore assez de données pour calculer la progression 1RM ce mois.</p>
          )}
        </div>

        {/* ── Section Nutrition ─────────────────────────────────────────────── */}
        {nutGoals && (
          <div style={S.rapportSection}>
            <SectionTitle>🥗 Nutrition</SectionTitle>
            <div style={S.kpiRow}>
              <KpiCard
                label="Kcal moyen/jour"
                value={nutMoyen?.kcal ? `${Math.round(nutMoyen.kcal)} kcal` : '—'}
                sub={nutGoals.kcal_target ? `Objectif : ${nutGoals.kcal_target} kcal` : 'Pas d\'objectif'}
                color={
                  nutMoyen?.kcal && nutGoals.kcal_target
                    ? Math.abs(nutMoyen.kcal - nutGoals.kcal_target) < nutGoals.kcal_target * 0.1
                      ? '#16a34a'
                      : '#d97706'
                    : '#1a1a1a'
                }
              />
              <KpiCard
                label="Protéines moy/j"
                value={nutMoyen?.proteines ? `${Math.round(nutMoyen.proteines)} g` : '—'}
                sub={nutGoals.prot_g ? `Objectif : ${nutGoals.prot_g} g` : ''}
                color={
                  nutMoyen?.proteines && nutGoals.prot_g
                    ? nutMoyen.proteines >= nutGoals.prot_g * 0.9 ? '#16a34a' : '#d97706'
                    : '#1a1a1a'
                }
              />
              <KpiCard
                label="Jours loggés"
                value={joursLogges || '—'}
                sub={`sur ~${new Date(mois.fin).getDate()} jours`}
                color={joursLogges >= 20 ? '#16a34a' : joursLogges >= 12 ? '#d97706' : '#dc2626'}
              />
            </div>
          </div>
        )}

        {/* ── Section Wellness ──────────────────────────────────────────────── */}
        {wellnessMoyen && (
          <div style={S.rapportSection}>
            <SectionTitle>💚 Wellness</SectionTitle>
            <div style={S.kpiRow}>
              <KpiCard
                label="Énergie moyenne"
                value={wellnessMoyen.energie !== null ? `${wellnessMoyen.energie}/4` : '—'}
                sub={scoreLabel('energie', wellnessMoyen.energie)}
                color={wellnessMoyen.energie >= 3 ? '#16a34a' : wellnessMoyen.energie >= 2 ? '#d97706' : '#dc2626'}
              />
              <KpiCard
                label="Sommeil moyen"
                value={wellnessMoyen.sommeil !== null ? `${wellnessMoyen.sommeil}/4` : '—'}
                sub={scoreLabel('sommeil', wellnessMoyen.sommeil)}
                color={wellnessMoyen.sommeil >= 3 ? '#16a34a' : wellnessMoyen.sommeil >= 2 ? '#d97706' : '#dc2626'}
              />
              <KpiCard
                label="Poids"
                value={poidsFin ? `${poidsFin} kg` : '—'}
                sub={poidsDelta !== null
                  ? `${poidsDelta > 0 ? '+' : ''}${poidsDelta} kg ce mois`
                  : poidsDebut ? `Début : ${poidsDebut} kg` : 'Non renseigné'}
                color={poidsDelta !== null ? '#1a1a1a' : '#6b7280'}
              />
            </div>
          </div>
        )}

        {/* ── Zone commentaire coach ────────────────────────────────────────── */}
        <div style={S.rapportSection}>
          <SectionTitle>📝 Commentaire coach</SectionTitle>
          <textarea
            className="no-print"
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
            placeholder="Ajoute tes observations, recommandations ou points à travailler pour ce client…"
            rows={5}
            style={S.textarea}
          />
          {/* Version imprimée du commentaire (visible seulement à l'impression) */}
          {commentaire && (
            <div className="print-only" style={{ display: 'none' }}>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151', whiteSpace: 'pre-wrap' }}>
                {commentaire}
              </p>
            </div>
          )}
          {/* Si pas de commentaire mais on veut quand même une zone à l'impression */}
          <div style={S.commentairePrint}>
            {commentaire
              ? <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151', margin: 0, whiteSpace: 'pre-wrap' }}>{commentaire}</p>
              : <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', margin: 0 }}>Aucun commentaire</p>
            }
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={S.rapportFooter}>
          <span>AWprepa</span>
          <span>·</span>
          <span>Généré le {today()}</span>
          <span>·</span>
          <span>{client.prenom} {client.nom} — {moisLabel}</span>
        </div>

      </div>
    </div>
  )
}

// ─── Utilitaire label wellness ────────────────────────────────────────────────

function scoreLabel(key, v) {
  if (!v) return ''
  const labels = {
    energie:  ['', 'Épuisé', 'Fatigué', 'En forme', 'Top'],
    sommeil:  ['', 'Très mauvais', 'Mauvais', 'Bien', 'Excellent'],
    humeur:   ['', 'Déprimé', 'Moyen', 'Bien', 'Excellent'],
  }
  const rounded = Math.round(v)
  return labels[key]?.[rounded] || ''
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh',
    background: '#f1f5f9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    paddingBottom: 40,
  },

  errorPage: {
    minHeight: '100vh',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 16, fontFamily: '-apple-system, sans-serif',
  },

  // Barre d'actions
  actionBar: {
    position: 'sticky', top: 0, zIndex: 90,
    background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)',
    padding: '12px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },

  backBtn: {
    background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8,
    color: 'white', fontWeight: 600, fontSize: '0.85rem',
    padding: '8px 14px', cursor: 'pointer',
  },
  refreshBtn: {
    background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8,
    padding: '8px 12px', cursor: 'pointer', fontSize: '1rem',
  },
  printBtn: {
    background: '#e4f816', border: 'none', borderRadius: 8,
    color: '#1a1a1a', fontWeight: 700, fontSize: '0.88rem',
    padding: '8px 16px', cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(228,248,22,0.3)',
  },

  // Rapport
  rapport: {
    maxWidth: 860,
    margin: '24px auto',
    background: 'white',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },

  // En-tête rapport
  rapportHeader: {
    background: 'linear-gradient(135deg, #1a1a1a 0%, #1f2937 60%, #111827 100%)',
    padding: '28px 32px',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 20,
    borderBottom: '3px solid #e4f816',
  },
  rapportHeaderLeft: {
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  rapportHeaderRight: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10,
  },
  logo: {
    color: 'white', fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.5px',
  },
  rapportSubtitle: {
    color: '#e4f816', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase', margin: '0 0 4px',
  },
  rapportNomClient: {
    color: 'white', fontWeight: 900, fontSize: '1.6rem', margin: '0 0 4px', lineHeight: 1.1,
  },
  rapportPeriode: {
    color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: 0,
  },
  offreBadge: {
    background: 'rgba(228,248,22,0.15)', color: '#e4f816',
    borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
    padding: '4px 12px', border: '1px solid rgba(228,248,22,0.3)',
  },

  // Corps
  rapportBody: {
    padding: '24px 28px 0',
  },
  rapportSection: {
    padding: '0 28px',
    borderTop: '1px solid #f1f5f9',
    paddingTop: 20,
    marginTop: 0,
  },

  // Titres de section
  sectionTitle: {
    fontSize: '0.85rem', fontWeight: 800, color: '#374151',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    margin: '0 0 16px', paddingBottom: 8,
    borderBottom: '2px solid #f1f5f9',
  },
  subTitle: {
    fontSize: '0.82rem', fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    margin: '20px 0 12px',
  },

  // KPI
  kpiRow: {
    display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
  },
  kpiCard: {
    flex: '1 1 140px',
    background: '#f8fafc', borderRadius: 14,
    padding: '14px 16px',
    border: '1px solid #e2e8f0',
  },
  kpiValue: {
    fontSize: '1.4rem', fontWeight: 900, lineHeight: 1.1, marginBottom: 4,
  },
  kpiLabel: {
    fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2,
  },
  kpiSub: {
    fontSize: '0.78rem', color: '#6b7280',
  },

  // Tableau
  tableWrapper: {
    overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0',
    marginBottom: 20,
  },
  table: {
    width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem',
  },
  tableHead: {
    background: '#f8fafc',
  },
  th: {
    padding: '10px 14px', fontWeight: 700, color: '#6b7280',
    fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0',
  },
  td: {
    padding: '10px 14px', color: '#374151', borderBottom: '1px solid #f1f5f9',
  },
  trEven: { background: 'white' },
  trOdd:  { background: '#f8fafc' },
  tableNote: {
    fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic',
    padding: '6px 14px 10px', margin: 0,
  },

  emptyNote: {
    fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic', marginBottom: 20,
  },

  // Textarea commentaire
  textarea: {
    width: '100%', borderRadius: 12, border: '1px solid #e2e8f0',
    padding: '12px 16px', fontSize: '0.88rem', lineHeight: 1.6,
    fontFamily: 'inherit', resize: 'vertical', color: '#374151',
    background: '#f8fafc', outline: 'none', boxSizing: 'border-box',
    minHeight: 100,
  },
  commentairePrint: {
    display: 'none',  // Masqué à l'écran, affiché en print via @media print ci-dessous
    padding: '12px 16px', background: '#f8fafc', borderRadius: 12,
    border: '1px solid #e2e8f0', minHeight: 80,
  },

  // Footer
  rapportFooter: {
    borderTop: '1px solid #f1f5f9',
    padding: '16px 28px',
    display: 'flex', gap: 12, alignItems: 'center',
    fontSize: '0.75rem', color: '#9ca3af',
    marginTop: 8,
  },
}

// Injecter le style print pour la zone commentaire
if (typeof document !== 'undefined') {
  const existing = document.getElementById('rapport-print-style')
  if (!existing) {
    const st = document.createElement('style')
    st.id = 'rapport-print-style'
    st.textContent = `
      @media print {
        textarea.no-print { display: none !important; }
        [id="rapport-print"] [style*="display: none"] { display: block !important; }
        .no-print { display: none !important; }
      }
    `
    document.head.appendChild(st)
  }
}
