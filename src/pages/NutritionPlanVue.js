import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'

// Vue complète d'un plan nutritionnel, format ordinateur : une ligne par repas,
// une colonne par jour, avec les aliments, les quantités et les macros.
// Un clic sur un repas ouvre sa recette et le détail de chaque aliment.

const MEAL_LABELS = {
  petit_dej: 'Petit-déjeuner', dejeuner: 'Déjeuner', collation: 'Collation',
  diner: 'Dîner', collation_2: 'Collation 2',
}
const STATUTS = { brouillon: 'Brouillon', actif: 'Actif', archive: 'Archivé' }
const TYPES_JOUR = { entrainement: 'Entraînement', repos: 'Repos', match: 'Match' }

const n = v => (v == null || v === '' ? null : Number(v))
const r0 = v => Math.round(v || 0)
function dateFr(iso) {
  return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null
}
// Macros d'un repas : celles du repas, sinon la somme de ses aliments
function macrosRepas(m) {
  const foods = m.nutrition_plan_foods || []
  const somme = k => foods.reduce((s, f) => s + (n(f[k]) || 0), 0)
  return {
    kcal: n(m.kcal) ?? somme('kcal'), prot: n(m.prot_g) ?? somme('prot_g'),
    carbs: n(m.carbs_g) ?? somme('carbs_g'), fat: n(m.fat_g) ?? somme('fat_g'),
  }
}

export default function NutritionPlanVue() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [client, setClient] = useState(null)
  const [jours, setJours] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null) // { repas, jour }

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from('nutrition_plans').select('*').eq('id', planId).single(),
        supabase.from('nutrition_plan_days').select('*, nutrition_plan_meals(*, nutrition_plan_foods(*))').eq('plan_id', planId).order('jour_numero'),
      ])
      setPlan(p || null)
      setJours((d || []).map(j => ({
        ...j,
        repas: (j.nutrition_plan_meals || []).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
          .map(m => ({ ...m, foods: (m.nutrition_plan_foods || []).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)) })),
      })))
      if (p?.client_id) {
        const { data: c } = await supabase.from('clients').select('id, prenom, nom').eq('id', p.client_id).single()
        setClient(c || null)
      }
      setLoading(false)
    })()
  }, [planId])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setDetail(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (loading) return <div style={S.page}><p style={{ color: '#6b7280' }}>Chargement…</p></div>
  if (!plan) return <div style={S.page}><p style={{ color: '#6b7280' }}>Plan introuvable.</p></div>

  // Lignes : un type de repas par ligne, dans l'ordre moyen où ils apparaissent
  const ordres = {}
  jours.forEach(j => j.repas.forEach(m => { (ordres[m.meal_type] ||= []).push(m.ordre ?? 0) }))
  const lignes = Object.keys(ordres).sort((a, b) => {
    const moy = t => ordres[t].reduce((s, v) => s + v, 0) / ordres[t].length
    return moy(a) - moy(b)
  })

  const totaux = jours.map(j => j.repas.reduce((t, m) => {
    const x = macrosRepas(m)
    return { kcal: t.kcal + (x.kcal || 0), prot: t.prot + (x.prot || 0), carbs: t.carbs + (x.carbs || 0), fat: t.fat + (x.fat || 0) }
  }, { kcal: 0, prot: 0, carbs: 0, fat: 0 }))

  const objectifs = [
    plan.objectif_kcal && `${plan.objectif_kcal} kcal`,
    plan.objectif_prot && `P ${r0(plan.objectif_prot)} g`,
    plan.objectif_carbs && `G ${r0(plan.objectif_carbs)} g`,
    plan.objectif_fat && `L ${r0(plan.objectif_fat)} g`,
  ].filter(Boolean).join(' · ')

  return (
    <div style={S.page}>
      <div style={S.head}>
        <button onClick={() => navigate(plan.client_id ? `/nutrition/${plan.client_id}` : '/nutrition')} style={S.btnBack}>
          ← {client ? `${client.prenom} ${client.nom}` : 'Nutrition'}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={S.titre}>{plan.nom}</h1>
          <p style={S.sous}>
            {[STATUTS[plan.statut] || plan.statut,
              plan.date_debut ? `du ${dateFr(plan.date_debut)}${plan.date_fin ? ` au ${dateFr(plan.date_fin)}` : ''}` : 'sans dates',
              objectifs ? `objectif par jour : ${objectifs}` : null].filter(Boolean).join(' · ')}
          </p>
          {plan.description && <p style={S.desc}>{plan.description}</p>}
        </div>
        <button onClick={() => navigate(`/nutrition/plan/${plan.id}`)} style={S.btnModifier}>Modifier le plan</button>
      </div>

      {jours.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Ce plan n'a encore aucun jour.</p>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, ...S.colRepas }} />
                {jours.map(j => (
                  <th key={j.id} style={S.th}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>{j.label || `Jour ${j.jour_numero}`}</div>
                    {j.type_jour && <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 2 }}>{TYPES_JOUR[j.type_jour] || j.type_jour}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map(type => (
                <tr key={type}>
                  <th style={{ ...S.thLigne, ...S.colRepas }}>{MEAL_LABELS[type] || type}</th>
                  {jours.map(j => {
                    const repasDuJour = j.repas.filter(m => m.meal_type === type)
                    return (
                      <td key={j.id} style={S.td}>
                        {repasDuJour.length === 0 ? <span style={{ color: '#c4c8ce' }}>–</span> : repasDuJour.map(m => {
                          const x = macrosRepas(m)
                          return (
                            <button key={m.id} onClick={() => setDetail({ repas: m, jour: j })} style={S.repas} title="Voir la recette et le détail">
                              <span style={S.repasNom}>{m.nom}</span>
                              {m.foods.length > 0 && (
                                <span style={S.aliments}>
                                  {m.foods.map(f => (
                                    <span key={f.id} style={{ display: 'block' }}>
                                      {n(f.quantite_g) != null && <b style={{ fontWeight: 700 }}>{r0(f.quantite_g)} g </b>}{f.nom}
                                    </span>
                                  ))}
                                </span>
                              )}
                              <span style={S.macros}>{r0(x.kcal)} kcal · P {r0(x.prot)} · G {r0(x.carbs)} · L {r0(x.fat)}</span>
                            </button>
                          )
                        })}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <th style={{ ...S.thLigne, ...S.colRepas, borderBottom: 'none' }}>Total du jour</th>
                {jours.map((j, i) => {
                  const t = totaux[i]
                  const obj = n(j.objectif_kcal) ?? n(plan.objectif_kcal)
                  const ecart = obj ? r0(t.kcal - obj) : null
                  return (
                    <td key={j.id} style={{ ...S.td, borderBottom: 'none', background: '#fafafa' }}>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' }}>{r0(t.kcal)} kcal</div>
                      {obj && (
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: Math.abs(ecart) <= obj * 0.05 ? '#6b7280' : '#b45309', marginTop: 2 }}>
                          objectif {obj} kcal{ecart ? ` (${ecart > 0 ? '+' : ''}${ecart})` : ''}
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                        P {r0(t.prot)} g · G {r0(t.carbs)} g · L {r0(t.fat)} g
                      </div>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p style={S.legende}>P : protéines · G : glucides · L : lipides. Clique sur un repas pour voir sa recette.</p>

      {detail && (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {detail.jour.label || `Jour ${detail.jour.jour_numero}`} · {MEAL_LABELS[detail.repas.meal_type] || detail.repas.meal_type}
                </div>
                <h2 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.3 }}>{detail.repas.nom}</h2>
              </div>
              <button onClick={() => setDetail(null)} style={S.btnFermer}>Fermer</button>
            </div>

            {detail.repas.foods.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginBottom: 14 }}>
                <thead>
                  <tr>{['Aliment', 'Quantité', 'kcal', 'P', 'G', 'L'].map(h => <th key={h} style={S.thMini}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {detail.repas.foods.map(f => (
                    <tr key={f.id}>
                      <td style={S.tdMini}>{f.nom}</td>
                      <td style={S.tdMiniNum}>{n(f.quantite_g) != null ? `${r0(f.quantite_g)} g` : '–'}</td>
                      <td style={S.tdMiniNum}>{r0(f.kcal)}</td>
                      <td style={S.tdMiniNum}>{r0(f.prot_g)}</td>
                      <td style={S.tdMiniNum}>{r0(f.carbs_g)}</td>
                      <td style={S.tdMiniNum}>{r0(f.fat_g)}</td>
                    </tr>
                  ))}
                  {(() => { const x = macrosRepas(detail.repas); return (
                    <tr>
                      <td style={{ ...S.tdMini, fontWeight: 800, borderBottom: 'none' }}>Total</td><td style={{ ...S.tdMiniNum, borderBottom: 'none' }} />
                      <td style={{ ...S.tdMiniNum, fontWeight: 800, borderBottom: 'none' }}>{r0(x.kcal)}</td>
                      <td style={{ ...S.tdMiniNum, fontWeight: 800, borderBottom: 'none' }}>{r0(x.prot)}</td>
                      <td style={{ ...S.tdMiniNum, fontWeight: 800, borderBottom: 'none' }}>{r0(x.carbs)}</td>
                      <td style={{ ...S.tdMiniNum, fontWeight: 800, borderBottom: 'none' }}>{r0(x.fat)}</td>
                    </tr>
                  ) })()}
                </tbody>
              </table>
            )}

            {detail.repas.recette && (
              <>
                <div style={S.labelModal}>Recette</div>
                <p style={S.texte}>{detail.repas.recette}</p>
              </>
            )}
            {detail.repas.notes && (
              <>
                <div style={S.labelModal}>Notes</div>
                <p style={S.texte}>{detail.repas.notes}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { padding: '1.75rem 2.5rem 3rem', maxWidth: 1800, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fafafa', minHeight: '100vh', boxSizing: 'border-box' },
  head: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: '1.25rem', flexWrap: 'wrap' },
  btnBack: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13.5, fontWeight: 700, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  titre: { margin: 0, fontSize: 24, fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.01em' },
  sous: { margin: '4px 0 0', fontSize: 14, color: '#6b7280', fontWeight: 500 },
  desc: { margin: '8px 0 0', fontSize: 14, color: '#374151', lineHeight: 1.5, maxWidth: '90ch' },
  btnModifier: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },

  tableWrap: { overflowX: 'auto', background: 'white', border: '1.5px solid #f0f0f0', borderRadius: 14 },
  table: { width: '100%', minWidth: 1250, borderCollapse: 'collapse', tableLayout: 'fixed' },
  colRepas: { width: 130 },
  th: { textAlign: 'left', padding: '14px 12px', borderBottom: '2px solid #e5e7eb', verticalAlign: 'bottom', background: 'white', position: 'sticky', top: 0 },
  thLigne: { textAlign: 'left', padding: '12px 12px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top', fontSize: 13, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em', background: '#fafafa' },
  td: { padding: '10px 10px', borderBottom: '1px solid #f0f0f0', borderLeft: '1px solid #f5f5f5', verticalAlign: 'top' },
  repas: { display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', background: 'none', border: '1px solid transparent', borderRadius: 10, padding: 6, margin: -6, cursor: 'pointer', fontFamily: 'inherit' },
  repasNom: { fontSize: 13.5, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.3 },
  aliments: { fontSize: 12.5, color: '#374151', lineHeight: 1.45 },
  macros: { fontSize: 12, color: '#6b7280', fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  legende: { fontSize: 12.5, color: '#6b7280', marginTop: 10 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: 'white', borderRadius: 16, padding: '1.4rem 1.5rem', width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  btnFermer: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' },
  thMini: { textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#6b7280', padding: '6px 6px', borderBottom: '1.5px solid #e5e7eb' },
  tdMini: { padding: '7px 6px', borderBottom: '1px solid #f3f4f6', color: '#1a1a1a' },
  tdMiniNum: { padding: '7px 6px', borderBottom: '1px solid #f3f4f6', color: '#374151', fontVariantNumeric: 'tabular-nums' },
  labelModal: { fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', margin: '6px 0 6px' },
  texte: { margin: '0 0 12px', fontSize: 14, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
}
