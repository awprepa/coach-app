import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { isoLocal } from '../utils/dates'

const OFFRES = {
  essai:                { label: 'Essai',         bg: '#fff7ed', color: '#c2410c' },
  preparation_physique: { label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:             { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
  club:                 { label: 'Club',           bg: '#f0fdf4', color: '#15803d' },
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function NutritionCoach() {
  const navigate = useNavigate()
  const [clients,  setClients]  = useState([])
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [groupes,  setGroupes]  = useState([])   // équipes : { id, nom, ids: [clientId] }
  const [ouverts,  setOuverts]  = useState({})   // groupeId -> déplié
  const [historique, setHistorique] = useState(null) // client dont on affiche l'adhérence par semaine

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: allClients } = await supabase
        .from('clients')
        .select('id, prenom, nom, offre')
        .order('prenom', { ascending: true })

      if (!allClients || allClients.length === 0) {
        setClients([]); setEnriched([]); setLoading(false); return
      }
      setClients(allClients)
      const ids = allClients.map(c => c.id)

      // Groupes : équipes (et clubs qui ont des membres en propre), pas les
      // sous-groupes, dont les joueurs font déjà partie de leur équipe.
      const [{ data: gs }, { data: gms }] = await Promise.all([
        supabase.from('groupes').select('id, nom, type, parent_id'),
        supabase.from('groupe_membres').select('groupe_id, client_id'),
      ])
      const parNom = Object.fromEntries((gs || []).map(g => [g.id, g]))
      const membres = {}
      for (const m of (gms || [])) (membres[m.groupe_id] ||= []).push(m.client_id)
      const blocs = (gs || [])
        .filter(g => g.type !== 'sous_groupe' && (membres[g.id] || []).length)
        .map(g => ({
          id: g.id,
          nom: g.parent_id && parNom[g.parent_id] ? `${parNom[g.parent_id].nom} · ${g.nom}` : g.nom,
          ids: membres[g.id],
        }))
        .sort((a, b) => a.nom.localeCompare(b.nom))
      setGroupes(blocs)
      const today = isoLocal()

      // Plans par client (actif + total)
      const { data: allPlans } = await supabase
        .from('nutrition_plans')
        .select('client_id, statut, nom, date_debut, date_fin')
        .in('client_id', ids)

      const plansMap = {}
      for (const p of (allPlans || [])) {
        if (!plansMap[p.client_id]) plansMap[p.client_id] = { total: 0, actif: null }
        plansMap[p.client_id].total++
        const isValidActif = p.statut === 'actif' && p.date_debut <= today && (!p.date_fin || p.date_fin >= today)
        // Si plusieurs plans "actif" se chevauchent (ex. le suivant programmé à
        // l'avance), on garde celui dont le début est le plus récent.
        const actuel = plansMap[p.client_id].actif
        if (isValidActif && (!actuel || p.date_debut > actuel.date_debut)) plansMap[p.client_id].actif = p
      }

      // Adhérence 7 derniers jours (plan logs)
      const from7 = isoLocal(new Date(Date.now() - 6 * 86400000))
      const { data: recentLogs } = await supabase
        .from('nutrition_plan_logs')
        .select('client_id, statut, meal_id')
        .in('client_id', ids)
        .gte('date', from7)
        .lte('date', today)

      const adherMap = {}
      for (const l of (recentLogs || [])) {
        if (!adherMap[l.client_id]) adherMap[l.client_id] = { total: 0, ok: 0 }
        if (l.meal_id !== null) {
          adherMap[l.client_id].total++
          if (l.statut === 'fait' || l.statut === 'hors_plan') adherMap[l.client_id].ok++
        }
      }

      const result = allClients.map(c => ({
        ...c,
        plans:   plansMap[c.id] || { total: 0, actif: null },
        adher7:  adherMap[c.id] && adherMap[c.id].total > 0
          ? Math.round(adherMap[c.id].ok / adherMap[c.id].total * 100)
          : null,
        logsCount7: adherMap[c.id]?.total || 0,
      }))

      setEnriched(result)
      setLoading(false)
    }
    load()
  }, [])

  // Coachés : clients hors groupe, ou qui ont (eu) un plan nutritionnel
  const enGroupe = useMemo(() => new Set(groupes.flatMap(g => g.ids)), [groupes])
  const q = search.trim().toLowerCase()
  const correspond = c => !q || `${c.prenom} ${c.nom}`.toLowerCase().includes(q) || `${c.nom} ${c.prenom}`.toLowerCase().includes(q)
  const trier = list => [...list.filter(c => c.plans.actif), ...list.filter(c => !c.plans.actif)]
  const displayed = useMemo(() => trier(enriched.filter(c => (!enGroupe.has(c.id) || c.plans.total > 0) && correspond(c))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enriched, enGroupe, q])
  const parId = useMemo(() => Object.fromEntries(enriched.map(c => [c.id, c])), [enriched])

  const nbAvecPlan = enriched.filter(c => c.plans.actif).length

  return (
    <div style={S.page}>
      <div style={S.inner}>

        <div style={S.header}>
          <h1 style={S.title}>Plans nutrition</h1>
          <p style={S.subtitle}>
            {clients.length} client{clients.length !== 1 ? 's' : ''} ·{' '}
            {nbAvecPlan} avec plan actif
          </p>
        </div>

        <div style={S.searchWrapper}>
          <span style={S.searchIcon}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client…"
            style={S.searchInput}
          />
          {search && <button onClick={() => setSearch('')} style={S.searchClear}>×</button>}
        </div>

        {!loading && <div style={S.sectionTitre}>Coachés · {displayed.length}</div>}
        {loading ? (
          <div style={S.emptyState}>Chargement…</div>
        ) : displayed.length === 0 ? (
          <div style={S.emptyState}>
            {search ? 'Aucun coaché ne correspond.' : 'Aucun coaché.'}
          </div>
        ) : (
          <div style={S.grid}>
            {displayed.map(client => {
              const { actif, total } = client.plans
              return (
                <div role="button" tabIndex={0}
                  key={client.id}
                  onClick={() => navigate(`/nutrition/${client.id}`)}
                  style={S.card}
                >
                  {/* Nom + offre */}
                  <div style={S.cardTop}>
                    <div style={S.clientName}>{client.prenom} {client.nom}</div>
                    {client.offre && OFFRES[client.offre] && (
                      <span style={{ ...S.offreBadge, background: OFFRES[client.offre].bg, color: OFFRES[client.offre].color }}>
                        {OFFRES[client.offre].label}
                      </span>
                    )}
                  </div>

                  {/* Plan actif */}
                  {actif ? (
                    <div style={S.planActif}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={S.planDot} />
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#166534' }}>{actif.nom}</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: 2, paddingLeft: 14 }}>
                        {actif.date_debut ? `Depuis le ${formatDate(actif.date_debut)}` : 'Plan en cours'}
                        {total > 1 && ` · ${total} plans au total`}
                      </div>
                    </div>
                  ) : (
                    <div style={S.noPlan}>
                      {total > 0
                        ? `${total} plan${total > 1 ? 's' : ''} — aucun actif`
                        : 'Aucun plan nutritionnel'}
                    </div>
                  )}

                  {/* Adhérence 7 jours */}
                  {client.adher7 !== null && (
                    <div role="button" tabIndex={0} title="Voir l'adhérence semaine par semaine"
                      onClick={e => { e.stopPropagation(); setHistorique(client) }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setHistorique(client) } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '6px 8px', margin: '4px -8px 0', borderRadius: 8, cursor: 'pointer', background: '#fafafa' }}>
                      <div style={{ flex: 1, height: 4, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 999,
                          background: client.adher7 >= 80 ? '#16a34a' : client.adher7 >= 50 ? '#d97706' : '#ef4444',
                          width: `${client.adher7}%`,
                        }} />
                      </div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: client.adher7 >= 80 ? '#16a34a' : client.adher7 >= 50 ? '#d97706' : '#ef4444', flexShrink: 0 }}>
                        {client.adher7}% / 7j
                      </span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#374151', textDecoration: 'underline', textUnderlineOffset: 2, flexShrink: 0 }}>Historique</span>
                    </div>
                  )}

                  {/* Flèche */}
                  <div style={S.arrow}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Groupes : repliés, un bloc par équipe */}
        {!loading && groupes.length > 0 && (
          <>
            <div style={{ ...S.sectionTitre, marginTop: '2rem' }}>Groupes</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groupes.map(g => {
                const joueurs = g.ids.map(id => parId[id]).filter(Boolean).filter(correspond)
                  .sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`))
                if (q && !joueurs.length) return null
                const avecPlan = joueurs.filter(c => c.plans.actif).length
                const ouvert = ouverts[g.id] || !!q
                return (
                  <div key={g.id} style={S.groupe}>
                    <button onClick={() => setOuverts(o => ({ ...o, [g.id]: !o[g.id] }))} style={S.groupeHead} aria-expanded={ouvert}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a', flex: 1, textAlign: 'left' }}>{g.nom}</span>
                      <span style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>
                        {joueurs.length} joueur{joueurs.length > 1 ? 's' : ''} · {avecPlan ? `${avecPlan} avec plan actif` : 'aucun plan actif'}
                      </span>
                    </button>
                    {ouvert && (
                      <div style={S.groupeGrille}>
                        {joueurs.map(c => (
                          <button key={c.id} onClick={() => navigate(`/nutrition/${c.id}`)} style={S.joueur}>
                            <span style={{ fontWeight: 700, color: '#1a1a1a', flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.prenom} {c.nom}</span>
                            <span style={{ fontSize: '0.75rem', color: c.plans.actif ? '#166534' : '#9ca3af', fontWeight: 600, flexShrink: 0 }}>
                              {c.plans.actif ? 'Plan actif' : c.plans.total ? `${c.plans.total} plan${c.plans.total > 1 ? 's' : ''}` : 'Aucun plan'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      {historique && <AdherenceSemaines client={historique} onClose={() => setHistorique(null)} />}
    </div>
  )
}

// ── Adhérence semaine par semaine, depuis le premier plan du client ──
// Pour chaque jour couvert par un plan (actif ou archivé), on compte les repas
// prévus ce jour-là et ceux que le client a cochés (fait ou remplacé).
function lundiDe(iso) {
  const d = new Date(iso + 'T00:00:00'); const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow); return isoLocal(d)
}
function AdherenceSemaines({ client, onClose }) {
  const [semaines, setSemaines] = useState(null)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    (async () => {
      const { data: plans } = await supabase.from('nutrition_plans')
        .select('id, nom, statut, date_debut, date_fin, nutrition_plan_days(jour_numero, nutrition_plan_meals(id))')
        .eq('client_id', client.id).in('statut', ['actif', 'archive']).not('date_debut', 'is', null)
      const { data: logs } = await supabase.from('nutrition_plan_logs')
        .select('date, meal_id, statut').eq('client_id', client.id).not('meal_id', 'is', null)
      const coches = new Set((logs || []).filter(l => l.statut === 'fait' || l.statut === 'hors_plan').map(l => `${l.date}|${l.meal_id}`))
      const sautes = new Set((logs || []).filter(l => l.statut === 'saute').map(l => `${l.date}|${l.meal_id}`))
      const ps = (plans || []).sort((a, b) => a.date_debut.localeCompare(b.date_debut))
      if (!ps.length) { setSemaines([]); return }
      const today = isoLocal()
      const parSemaine = {}
      for (let d = new Date(ps[0].date_debut + 'T00:00:00'); isoLocal(d) <= today; d.setDate(d.getDate() + 1)) {
        const iso = isoLocal(d)
        // Plan en vigueur ce jour : le plus récent commencé, non terminé
        const plan = ps.filter(p => p.date_debut <= iso && (!p.date_fin || p.date_fin >= iso)).pop()
        if (!plan) continue
        const n = Math.floor((new Date(iso + 'T00:00:00') - new Date(plan.date_debut + 'T00:00:00')) / 86400000) % 7 + 1
        const meals = plan.nutrition_plan_days?.find(j => j.jour_numero === n)?.nutrition_plan_meals || []
        const sem = (parSemaine[lundiDe(iso)] ||= { lundi: lundiDe(iso), prevus: 0, faits: 0, sautes: 0, plans: new Set() })
        sem.plans.add(plan.nom)
        meals.forEach(m => {
          sem.prevus++
          if (coches.has(`${iso}|${m.id}`)) sem.faits++
          else if (sautes.has(`${iso}|${m.id}`)) sem.sautes++
        })
      }
      setSemaines(Object.values(parSemaine).filter(s => s.prevus > 0).sort((a, b) => b.lundi.localeCompare(a.lundi)))
    })()
  }, [client.id])

  const fmt = iso => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const fin = iso => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 6); return isoLocal(d) }
  const couleur = pct => pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  const total = (semaines || []).reduce((t, s) => ({ p: t.p + s.prevus, f: t.f + s.faits }), { p: 0, f: 0 })

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#1a1a1a' }}>Adhérence de {client.prenom} {client.nom}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6b7280' }}>
              Repas cochés sur les repas prévus par le plan, semaine par semaine.
              {total.p > 0 && ` Depuis le début : ${Math.round(total.f / total.p * 100)} % (${total.f} sur ${total.p}).`}
            </p>
          </div>
          <button onClick={onClose} style={S.btnFermer}>Fermer</button>
        </div>
        {semaines === null ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Chargement…</p>
        ) : semaines.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Aucune semaine couverte par un plan daté.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {semaines.map(s => {
              const pct = Math.round(s.faits / s.prevus * 100)
              const enCours = s.lundi === lundiDe(isoLocal())
              return (
                <div key={s.lundi} style={S.semaine}>
                  <div style={{ width: 150, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{fmt(s.lundi)} – {fmt(fin(s.lundi))}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[...s.plans].join(', ')}>
                      {enCours ? 'Semaine en cours · ' : ''}{[...s.plans].join(', ')}
                    </div>
                  </div>
                  <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: couleur(pct), borderRadius: 999 }} />
                  </div>
                  <div style={{ width: 120, flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: couleur(pct), fontVariantNumeric: 'tabular-nums' }}>{pct} %</span>
                    <div style={{ fontSize: 12, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      {s.faits} sur {s.prevus} repas{s.sautes ? ` · ${s.sautes} sauté${s.sautes > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: 'white', borderRadius: 16, padding: '1.4rem 1.5rem', width: '100%', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  btnFermer: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' },
  semaine: { display: 'flex', alignItems: 'center', gap: 16, padding: '11px 0', borderBottom: '1px solid #f3f4f6' },
  page: { background: '#fafafa', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  inner: { maxWidth: 1600, margin: '0 auto', padding: '2rem 2.5rem' },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.6rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 4px', letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.875rem', color: '#6b7280', margin: 0, fontWeight: 500 },
  searchWrapper: { position: 'relative', marginBottom: '1.25rem', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 14, pointerEvents: 'none', display: 'flex', alignItems: 'center', top: 0, bottom: 0 },
  searchInput: {
    width: '100%', padding: '11px 42px 11px 40px', border: '1.5px solid #e5e7eb',
    borderRadius: 12, fontSize: '0.92rem', color: '#1a1a1a', background: 'white',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  },
  searchClear: { position: 'absolute', right: 12, background: 'none', border: 'none', color: '#6b7280', fontSize: '1.2rem', fontWeight: 700, cursor: 'pointer', lineHeight: 1, padding: '0 4px' },
  sectionTitre: { fontSize: '0.75rem', fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' },
  groupe: { background: 'white', border: '1.5px solid #f0f0f0', borderRadius: 14, overflow: 'hidden' },
  groupeHead: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  groupeGrille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6, padding: '0 18px 16px' },
  joueur: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 10, cursor: 'pointer', fontSize: '0.86rem', fontFamily: 'inherit' },
  emptyState: { textAlign: 'center', color: '#6b7280', padding: '3rem 0', fontSize: '0.95rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 },
  card: {
    background: 'white', borderRadius: 16, padding: '16px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', cursor: 'pointer',
    border: '1.5px solid #f0f0f0', position: 'relative',
    transition: 'box-shadow 0.15s, transform 0.1s',
  },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  clientName: { fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.01em', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  offreBadge: { padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' },
  planActif: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 10px', marginBottom: 6 },
  planDot: { width: 7, height: 7, borderRadius: '50%', background: '#16a34a', display: 'inline-block', flexShrink: 0 },
  noPlan: { fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic', marginBottom: 6 },
  arrow: { position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' },
}
