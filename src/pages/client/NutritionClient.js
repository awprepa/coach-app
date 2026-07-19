import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import usePageFade from '../../hooks/usePageFade'

// ── Journal alimentaire ──────────────────────────────────────────────────────
// Écran d'accueil de l'onglet Nutrition. Il fonctionne SANS plan du coach : le
// client peut toujours noter ce qu'il mange. Les calories viennent de la table
// CIQUAL (ANSES), jamais d'une estimation.

const REPAS = [
  { v: 'petit_dej', l: 'Petit-déjeuner' },
  { v: 'dejeuner',  l: 'Déjeuner' },
  { v: 'collation', l: 'Collation' },
  { v: 'diner',     l: 'Dîner' },
]
const MACROS = [
  { k: 'prot_g',  l: 'Protéines', c: '#0ea5e9' },
  { k: 'carbs_g', l: 'Glucides',  c: '#f59e0b' },
  { k: 'fat_g',   l: 'Lipides',   c: '#8b5cf6' },
]
const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmt = n => Math.round(n || 0).toLocaleString('fr-FR')

export default function NutritionClient() {
  const navigate  = useNavigate()
  const fadeStyle = usePageFade()
  const [client, setClient]   = useState(null)
  const [jour, setJour]       = useState(new Date())
  const [repas, setRepas]     = useState([])
  const [goals, setGoals]     = useState(null)
  const [water, setWater]     = useState(0)
  const [aPlan, setAPlan]     = useState(false)
  const [loading, setLoading] = useState(true)

  const iso = toISO(jour)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      let { data } = await supabase.from('clients').select('id, prenom').eq('user_id', user.id).maybeSingle()
      if (!data && user.email) {
        const r = await supabase.from('clients').select('id, prenom').eq('email', user.email).maybeSingle()
        data = r.data
      }
      setClient(data)
    })()
  }, [])

  const charger = useCallback(async () => {
    if (!client) return
    setLoading(true)
    const [{ data: ms }, { data: g }, { data: w }, { data: plans }] = await Promise.all([
      supabase.from('nutrition_meals')
        .select('id, meal_type, kcal, prot_g, carbs_g, fat_g, nutrition_meal_items(id, name, quantity, unit, kcal, prot_g, carbs_g, fat_g, ordre)')
        .eq('client_id', client.id).eq('date', iso),
      supabase.from('nutrition_goals')
        .select('kcal_target, prot_g, carbs_g, fat_g')
        .eq('client_id', client.id).lte('active_from', iso)
        .order('active_from', { ascending: false }).limit(1),
      supabase.from('nutrition_water').select('ml').eq('client_id', client.id).eq('date', iso).maybeSingle(),
      supabase.from('nutrition_plans').select('id').eq('client_id', client.id).limit(1),
    ])
    setRepas(ms || [])
    setGoals(g?.[0] || null)
    setWater(w?.ml || 0)
    setAPlan(!!plans?.length)
    setLoading(false)
  }, [client, iso])

  useEffect(() => { charger() }, [charger])

  const total = { kcal: 0, prot_g: 0, carbs_g: 0, fat_g: 0 }
  repas.forEach(m => {
    total.kcal    += m.kcal || 0
    total.prot_g  += Number(m.prot_g)  || 0
    total.carbs_g += Number(m.carbs_g) || 0
    total.fat_g   += Number(m.fat_g)   || 0
  })
  const cible = goals?.kcal_target || null
  const pct = cible ? Math.min(1, total.kcal / cible) : 0
  const R = 41, CIRC = 2 * Math.PI * R

  async function majEau(delta) {
    const ml = Math.max(0, water + delta)
    setWater(ml)
    await supabase.from('nutrition_water').upsert(
      { client_id: client.id, date: iso, ml, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,date' })
  }

  async function supprimerItem(mealId, itemId) {
    await supabase.from('nutrition_meal_items').delete().eq('id', itemId)
    const { data: restants } = await supabase.from('nutrition_meal_items')
      .select('kcal, prot_g, carbs_g, fat_g').eq('meal_id', mealId)
    if (!restants?.length) {
      await supabase.from('nutrition_meals').delete().eq('id', mealId)
    } else {
      const t = restants.reduce((s, i) => ({
        kcal: s.kcal + (i.kcal || 0), prot: s.prot + Number(i.prot_g || 0),
        carbs: s.carbs + Number(i.carbs_g || 0), fat: s.fat + Number(i.fat_g || 0),
      }), { kcal: 0, prot: 0, carbs: 0, fat: 0 })
      await supabase.from('nutrition_meals').update({
        kcal: Math.round(t.kcal), prot_g: t.prot.toFixed(1),
        carbs_g: t.carbs.toFixed(1), fat_g: t.fat.toFixed(1),
      }).eq('id', mealId)
    }
    charger()
  }

  function decale(n) { const d = new Date(jour); d.setDate(d.getDate() + n); setJour(d) }
  const estAujourdhui = iso === toISO(new Date())
  const labelJour = estAujourdhui ? "Aujourd'hui"
    : jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <div style={S.header}>
        <div style={S.headerRow}>
          <span style={S.headerTitle}>Nutrition</span>
          <button onClick={() => navigate('/client/nutrition/profil')} style={S.icoBtn} aria-label="Mon profil">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>
        </div>
        <div style={S.dateBar}>
          <button onClick={() => decale(-1)} style={S.navBtn} aria-label="Jour précédent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span style={S.dateLabel}>{labelJour}</span>
          <button onClick={() => decale(1)} disabled={estAujourdhui}
            style={{ ...S.navBtn, opacity: estAujourdhui ? 0.25 : 1 }} aria-label="Jour suivant">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div style={S.body}>
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
              <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="48" cy="48" r={R} fill="none" stroke="#eef1f4" strokeWidth="9" />
                {cible && (
                  <circle cx="48" cy="48" r={R} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={CIRC} strokeDashoffset={CIRC - CIRC * pct} />
                )}
              </svg>
              <div style={S.ringCenter}>
                <div style={S.ringNum}>{fmt(total.kcal)}</div>
                <div style={S.ringLbl}>{cible ? `/ ${fmt(cible)} KCAL` : 'KCAL'}</div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {MACROS.map(m => {
                const v = total[m.k], go = goals?.[m.k] ? Number(goals[m.k]) : null
                return (
                  <div key={m.k}>
                    <div style={S.macTop}>
                      <span style={S.macName}>{m.l}</span>
                      <span style={S.macVal}>{fmt(v)}{go ? ` / ${fmt(go)}` : ''} g</span>
                    </div>
                    <div style={S.bar}>
                      <div style={{ height: '100%', borderRadius: 99, background: m.c, width: `${go ? Math.min(100, v / go * 100) : (v > 0 ? 100 : 0)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          {!cible && <p style={S.hintGoal}>Pas d'objectif défini — tu vois ce que tu as mangé. Ton coach peut en fixer un.</p>}
        </div>

        {aPlan && (
          <button onClick={() => navigate('/client/nutrition/plan')} style={S.planBtn}>
            <span>Voir le plan de mon coach</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        )}

        {loading ? <p style={S.loading}>Chargement…</p> : REPAS.map(r => {
          const m = repas.find(x => x.meal_type === r.v)
          const items = (m?.nutrition_meal_items || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
          return (
            <div key={r.v} style={{ marginBottom: 12 }}>
              <div style={S.secHead}>
                <p style={S.secTitle}>{r.l}</p>
                {m?.kcal ? <span style={S.secKcal}>{fmt(m.kcal)} kcal</span> : null}
              </div>
              <div style={S.meal}>
                {items.length ? items.map(it => (
                  <div key={it.id} style={S.item}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={S.itemName}>{it.name}</p>
                      <p style={S.itemQty}>{fmt(it.quantity)} {it.unit || 'g'}</p>
                    </div>
                    <span style={S.itemKcal}>{fmt(it.kcal)} kcal</span>
                    <button onClick={() => supprimerItem(m.id, it.id)} style={S.del} aria-label="Retirer">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </div>
                )) : <p style={S.empty}>Rien pour l'instant</p>}
                <button onClick={() => navigate(`/client/nutrition/aliment?repas=${r.v}&date=${iso}`)} style={S.add}>
                  <span style={S.addIco}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                  Ajouter un aliment
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={S.waterIco}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M12 3s6 6.4 6 10.4A6 6 0 0 1 6 13.4C6 9.4 12 3 12 3z" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800 }}>Hydratation</p>
            <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: '#9ca3af', fontWeight: 600 }}>
              {(water / 1000).toFixed(2).replace('.', ',')} L
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => majEau(-250)} style={S.step} aria-label="Retirer un verre">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </button>
            <button onClick={() => majEau(250)} style={S.step} aria-label="Ajouter un verre">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
        </div>

        <div style={{ height: 96 }} />
      </div>

      {/* Barre scanner fixe — identique à celle de la page du plan */}
      <div style={S.scanCta}>
        <button onClick={() => navigate('/client/nutrition/scanner', { state: { returnTo: '/client/nutrition' } })} style={S.scanCtaBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><line x1="14" y1="14" x2="14" y2="21" /><line x1="14" y1="14" x2="21" y2="14" />
          </svg>
          Scanner un article
        </button>
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page:       { minHeight: '100dvh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 90 },
  // Même variable de thème que la page du plan : les deux écrans doivent se
  // ressembler quand on passe de l'un à l'autre.
  header:     { background: 'var(--header-bg)', padding: '14px 16px 15px', position: 'sticky', top: 0, zIndex: 40 },
  headerRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle:{ color: 'white', fontWeight: 800, fontSize: '1.02rem' },
  icoBtn:     { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 },
  dateBar:    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 11 },
  dateLabel:  { color: 'white', fontSize: '0.82rem', fontWeight: 700, textTransform: 'capitalize', minWidth: 130, textAlign: 'center' },
  navBtn:     { background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', padding: 2, display: 'flex' },
  body:       { padding: '14px' },
  card:       { background: 'white', borderRadius: 16, padding: 15, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 12 },
  ringCenter: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  ringNum:    { fontSize: '1.42rem', fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  ringLbl:    { fontSize: '0.53rem', fontWeight: 800, color: '#9ca3af', letterSpacing: '0.04em', marginTop: 3, whiteSpace: 'nowrap' },
  macTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.74rem' },
  macName:    { fontWeight: 800, color: '#4b5563' },
  macVal:     { fontWeight: 700, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' },
  bar:        { height: 6, background: '#eef1f4', borderRadius: 99, overflow: 'hidden', marginTop: 4 },
  hintGoal:   { margin: '12px 0 0', fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, lineHeight: 1.45 },
  planBtn:    { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: '#1a1a1a', color: 'var(--accent)', border: 'none', borderRadius: 14, padding: '12px 14px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' },
  secHead:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 7px' },
  secTitle:   { fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', letterSpacing: '0.09em', textTransform: 'uppercase', margin: 0 },
  secKcal:    { fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
  meal:       { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' },
  item:       { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px 11px 14px', borderBottom: '1px solid #eef0f3' },
  itemName:   { fontSize: '0.85rem', fontWeight: 700, margin: 0, lineHeight: 1.25 },
  itemQty:    { fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0', fontWeight: 600 },
  itemKcal:   { fontSize: '0.82rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  del:        { width: 26, height: 26, borderRadius: 8, border: 'none', background: '#f3f4f6', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 },
  empty:      { padding: '15px 14px', color: '#9ca3af', fontSize: '0.79rem', fontWeight: 600, margin: 0 },
  add:        { width: '100%', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', background: 'none', border: 'none', borderTop: '1px dashed #e2e6ea', padding: 11, fontSize: '0.8rem', fontWeight: 800, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  addIco:     { width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  waterIco:   { width: 36, height: 36, borderRadius: 11, background: '#e8f4fd', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  step:       { width: 32, height: 32, borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'white', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  scanCta:    { position: 'fixed', bottom: 'calc(82px + max(env(safe-area-inset-bottom, 0px), 0px))', left: 0, right: 0, padding: '0 14px', zIndex: 30 },
  scanCtaBtn: { width: '100%', padding: '0.9rem 1.25rem', background: '#1a1a1a', color: 'var(--accent)', border: 'none', borderRadius: 16, fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', fontFamily: 'inherit', boxShadow: '0 6px 20px rgba(0,0,0,0.18)' },
  loading:    { color: '#9ca3af', fontSize: '0.85rem', fontWeight: 600 },
}
