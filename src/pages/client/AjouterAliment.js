import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../supabase'
import usePageFade from '../../hooks/usePageFade'

// ── Ajouter un aliment ───────────────────────────────────────────────────────
// Deux temps : on cherche l'aliment dans CIQUAL (table officielle ANSES), puis
// on règle la quantité en voyant les calories se recalculer. Aucune IA ici :
// les valeurs viennent de la base, le client choisit et confirme.

const REPAS_LABEL = {
  petit_dej: 'petit-déjeuner', dejeuner: 'déjeuner',
  collation: 'collation', diner: 'dîner',
}
const MACROS = [
  { k: 'proteines', l: 'Protéines', c: '#0ea5e9' },
  { k: 'glucides',  l: 'Glucides',  c: '#f59e0b' },
  { k: 'lipides',   l: 'Lipides',   c: '#8b5cf6' },
]
const fmt = n => Math.round(n || 0).toLocaleString('fr-FR')

// Appel direct de la fonction Edge plutôt que functions.invoke() : ce dernier
// ne transmettait pas le corps de la requête ici (la fonction recevait un terme
// vide et renvoyait donc toujours une liste vide).
async function chercherMarques(terme) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const res = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/nutrition-food-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.REACT_APP_SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ terme }),
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => null)
  return data?.produits || []
}

export default function AjouterAliment() {
  const navigate  = useNavigate()
  const fadeStyle = usePageFade()
  const [params]  = useSearchParams()
  const repas = params.get('repas') || 'dejeuner'
  const date  = params.get('date')  || new Date().toISOString().slice(0, 10)

  const [client, setClient]   = useState(null)
  const [terme, setTerme]     = useState('')
  const [resultats, setResultats] = useState([])
  const [marques, setMarques] = useState([])           // produits Open Food Facts
  const [chercheMarques, setChercheMarques] = useState(false)
  const [recents, setRecents] = useState([])
  const [onglet, setOnglet]   = useState('recherche')  // recherche | recents
  const [cherche, setCherche] = useState(false)
  const [choisi, setChoisi]   = useState(null)         // aliment sélectionné
  const [grammes, setGrammes] = useState(100)
  const [portions, setPortions] = useState([])
  const [envoi, setEnvoi]     = useState(false)
  const debounce = useRef(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      let { data } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (!data && user.email) {
        const r = await supabase.from('clients').select('id').eq('email', user.email).maybeSingle()
        data = r.data
      }
      setClient(data)
    })()
  }, [])

  // Aliments déjà consommés : on mange souvent la même chose.
  useEffect(() => {
    if (!client) return
    (async () => {
      const { data } = await supabase.from('nutrition_meal_items')
        .select('name, quantity, unit, kcal, prot_g, carbs_g, fat_g, nutrition_meals!inner(client_id)')
        .eq('nutrition_meals.client_id', client.id)
        .order('id', { ascending: false }).limit(60)
      const vus = new Set(); const uniques = []
      for (const it of (data || [])) {
        if (vus.has(it.name)) continue
        vus.add(it.name); uniques.push(it)
        if (uniques.length >= 12) break
      }
      setRecents(uniques)
    })()
  }, [client])

  // Deux sources complémentaires : CIQUAL pour les aliments génériques, Open
  // Food Facts pour les marques et les variantes précises (skyr, chocolat 90 %,
  // whey…) que CIQUAL ne contient pas.
  const chercher = useCallback(async (t) => {
    const terme = t.trim()
    if (!terme) { setResultats([]); setMarques([]); return }
    setCherche(true); setChercheMarques(true)

    supabase.rpc('rechercher_aliment', { terme, nb: 25 })
      .then(({ data }) => setResultats(data || []))
      .finally(() => setCherche(false))

    // Les marques arrivent plus tard (appel réseau externe) : on n'attend pas
    // pour afficher les résultats CIQUAL.
    chercherMarques(terme)
      .then(setMarques)
      .catch(() => setMarques([]))
      .finally(() => setChercheMarques(false))
  }, [])

  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => chercher(terme), 250)
    return () => clearTimeout(debounce.current)
  }, [terme, chercher])

  async function ouvrirQuantite(a) {
    setChoisi(a)
    setGrammes(100)
    // Portions courantes correspondant à cet aliment (« 1 banane » = 120 g).
    const { data } = await supabase.from('portions_usuelles').select('motif, grammes, libelle')
    const nom = (a.nom || '').toLowerCase()
    setPortions((data || []).filter(p => nom.includes(p.motif.toLowerCase())))
  }

  const calc = () => {
    const r = (parseFloat(grammes) || 0) / 100
    return {
      kcal: (choisi?.kcal || 0) * r,
      proteines: (choisi?.proteines || 0) * r,
      glucides: (choisi?.glucides || 0) * r,
      lipides: (choisi?.lipides || 0) * r,
    }
  }

  async function enregistrer() {
    if (!client || !choisi || envoi) return
    const g = parseFloat(grammes) || 0
    if (g <= 0) return
    setEnvoi(true)
    const t = calc()
    try {
      // Un repas par (jour, type) : on le crée au premier aliment.
      let { data: m } = await supabase.from('nutrition_meals')
        .select('id, kcal, prot_g, carbs_g, fat_g')
        .eq('client_id', client.id).eq('date', date).eq('meal_type', repas).maybeSingle()
      if (!m) {
        const { data: cree, error } = await supabase.from('nutrition_meals').insert({
          client_id: client.id, date, meal_type: repas, source: 'manuel',
          kcal: 0, prot_g: 0, carbs_g: 0, fat_g: 0,
        }).select('id, kcal, prot_g, carbs_g, fat_g').single()
        if (error) throw error
        m = cree
      }
      const { error: e1 } = await supabase.from('nutrition_meal_items').insert({
        meal_id: m.id, name: choisi.nom, quantity: g, unit: 'g',
        kcal: Math.round(t.kcal), prot_g: t.proteines.toFixed(1),
        carbs_g: t.glucides.toFixed(1), fat_g: t.lipides.toFixed(1),
      })
      if (e1) throw e1
      const { error: e2 } = await supabase.from('nutrition_meals').update({
        kcal:    Math.round((m.kcal || 0) + t.kcal),
        prot_g:  (Number(m.prot_g || 0)  + t.proteines).toFixed(1),
        carbs_g: (Number(m.carbs_g || 0) + t.glucides).toFixed(1),
        fat_g:   (Number(m.fat_g || 0)   + t.lipides).toFixed(1),
      }).eq('id', m.id)
      if (e2) throw e2
      navigate('/client/nutrition', { replace: true })
    } catch (err) {
      setEnvoi(false)
      alert("L'aliment n'a pas pu être enregistré. Réessaie.")
      console.error('[AjouterAliment]', err?.message)
    }
  }

  const t = calc()
  const liste = onglet === 'recents' && !terme.trim() ? [] : resultats

  // ── Écran quantité ────────────────────────────────────────────────────────
  if (choisi) return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <div style={S.header}>
        <button onClick={() => setChoisi(null)} style={S.back} aria-label="Retour">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span style={S.headerTitle}>Quantité</span>
        <div style={{ width: 34 }} />
      </div>
      <div style={S.body}>
        <p style={S.qNom}>{choisi.nom}</p>
        <p style={S.qSub}>{choisi.groupe} — {fmt(choisi.kcal)} kcal / 100 g</p>

        <div style={S.qField}>
          <input type="number" inputMode="decimal" value={grammes} autoFocus
            onChange={e => setGrammes(e.target.value)} style={S.qInput} />
          <span style={S.qUnit}>g</span>
        </div>

        <div style={S.chips}>
          {(portions.length
            ? portions.map(p => ({ g: Number(p.grammes), l: `1 ${p.libelle}` }))
            : [50, 100, 150, 200].map(g => ({ g, l: `${g} g` }))
          ).map((p, i) => (
            <button key={i} onClick={() => setGrammes(p.g)} style={S.chip}>{p.l}</button>
          ))}
        </div>

        <div style={S.qTot}>
          <b style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(t.kcal)}</b>
          <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#9ca3af' }}>kcal</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {MACROS.map(m => (
            <div key={m.k}>
              <div style={S.macTop}>
                <span style={S.macName}>{m.l}</span>
                <span style={S.macVal}>{fmt(t[m.k])} g</span>
              </div>
              <div style={S.bar}><div style={{ height: '100%', borderRadius: 99, background: m.c, width: t[m.k] > 0 ? '100%' : '0%' }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div style={S.cta}>
        <button onClick={enregistrer} disabled={envoi} style={S.ctaBtn}>
          {envoi ? 'Enregistrement…' : `Ajouter au ${REPAS_LABEL[repas]}`}
        </button>
      </div>
    </div>
  )

  // ── Écran recherche ───────────────────────────────────────────────────────
  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <div style={S.header}>
        <button onClick={() => navigate('/client/nutrition')} style={S.back} aria-label="Retour">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span style={S.headerTitle}>Ajouter au {REPAS_LABEL[repas]}</span>
        <div style={{ width: 34 }} />
      </div>

      <div style={{ padding: '12px 14px 0' }}>
        <div style={S.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input value={terme} onChange={e => setTerme(e.target.value)} autoFocus
            placeholder="Rechercher un aliment…" style={S.searchInput} />
        </div>
        <div style={S.tabs}>
          {[{ v: 'recherche', l: 'Recherche' }, { v: 'recents', l: 'Récents' }].map(o => (
            <button key={o.v} onClick={() => setOnglet(o.v)}
              style={{ ...S.tab, ...(onglet === o.v ? S.tabOn : {}) }}>{o.l}</button>
          ))}
        </div>
      </div>

      <div style={S.list}>
        {onglet === 'recents' && !terme.trim() ? (
          recents.length ? recents.map((r, i) => (
            <button key={i} onClick={() => ouvrirQuantite({
              nom: r.name, groupe: 'Déjà consommé',
              kcal: r.quantity ? (r.kcal || 0) / (r.quantity / 100) : r.kcal,
              proteines: r.quantity ? Number(r.prot_g || 0) / (r.quantity / 100) : 0,
              glucides:  r.quantity ? Number(r.carbs_g || 0) / (r.quantity / 100) : 0,
              lipides:   r.quantity ? Number(r.fat_g || 0) / (r.quantity / 100) : 0,
            })} style={S.row}>
              <div style={{ minWidth: 0 }}>
                <p style={S.rowNom}>{r.name}</p>
                <p style={S.rowSub}>Déjà consommé — {fmt(r.quantity)} {r.unit || 'g'}</p>
              </div>
              <div style={S.rowK}><b>{fmt(r.kcal)}</b><i>kcal</i></div>
            </button>
          )) : <p style={S.vide}>Aucun aliment récent pour l'instant.</p>
        ) : cherche ? (
          <p style={S.vide}>Recherche…</p>
        ) : !terme.trim() ? (
          <p style={S.vide}>Tape le nom d'un aliment pour le chercher dans la table CIQUAL.</p>
        ) : (liste.length || marques.length || chercheMarques) ? (
          <>
            {liste.length > 0 && (
              <>
                <p style={S.source}>Aliments génériques — table CIQUAL (ANSES)</p>
                {liste.map(a => (
                  <button key={a.code} onClick={() => ouvrirQuantite(a)} style={S.row}>
                    <div style={{ minWidth: 0 }}>
                      <p style={S.rowNom}>{a.nom}</p>
                      <p style={S.rowSub}>{a.groupe}</p>
                    </div>
                    <div style={S.rowK}><b>{fmt(a.kcal)}</b><i>kcal / 100 g</i></div>
                  </button>
                ))}
              </>
            )}

            <p style={{ ...S.source, marginTop: liste.length ? 14 : 0 }}>
              Produits de marque — Open Food Facts
            </p>
            {chercheMarques ? (
              <p style={{ ...S.vide, padding: '0.8rem' }}>Recherche des marques…</p>
            ) : marques.length ? marques.map(p => (
              <button key={p.code || p.nom} onClick={() => ouvrirQuantite({
                nom: p.marque ? `${p.nom} — ${p.marque}` : p.nom,
                groupe: p.marque || 'Produit de marque',
                kcal: p.kcal, proteines: p.proteines || 0,
                glucides: p.glucides || 0, lipides: p.lipides || 0,
              })} style={S.row}>
                <div style={{ minWidth: 0 }}>
                  <p style={S.rowNom}>{p.nom}</p>
                  <p style={{ ...S.rowSub, color: '#b45309' }}>{p.marque || 'Sans marque'}</p>
                </div>
                <div style={S.rowK}><b>{fmt(p.kcal)}</b><i>kcal / 100 g</i></div>
              </button>
            )) : (
              <p style={{ ...S.vide, padding: '0.8rem' }}>Aucun produit de marque trouvé.</p>
            )}
          </>
        ) : (
          <p style={S.vide}>Aucun aliment trouvé. Essaie un autre mot.</p>
        )}
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

const S = {
  page:       { minHeight: '100dvh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column' },
  header:     { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '14px 14px 15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headerTitle:{ color: 'white', fontWeight: 800, fontSize: '1rem', textAlign: 'center', flex: 1 },
  back:       { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 },
  search:     { display: 'flex', alignItems: 'center', gap: 9, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 13, padding: '10px 12px' },
  searchInput:{ border: 'none', outline: 'none', fontSize: '0.88rem', fontFamily: 'inherit', width: '100%', background: 'none' },
  tabs:       { display: 'flex', gap: 7, padding: '11px 0 3px' },
  tab:        { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 99, padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  tabOn:      { background: '#1a1a1a', borderColor: '#1a1a1a', color: 'white' },
  list:       { flex: 1, overflowY: 'auto', padding: '8px 14px 20px' },
  source:     { fontSize: '0.65rem', color: '#b6bdc4', fontWeight: 700, padding: '2px 2px 8px', margin: 0 },
  row:        { width: '100%', display: 'flex', alignItems: 'center', gap: 11, background: 'white', borderRadius: 13, padding: '11px 13px', marginBottom: 7, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  rowNom:     { fontSize: '0.85rem', fontWeight: 700, margin: 0, lineHeight: 1.3 },
  rowSub:     { fontSize: '0.71rem', color: '#9ca3af', margin: '2px 0 0', fontWeight: 600 },
  rowK:       { marginLeft: 'auto', textAlign: 'right', flexShrink: 0 },
  vide:       { color: '#9ca3af', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', padding: '2rem 1rem', lineHeight: 1.5 },
  body:       { flex: 1, overflowY: 'auto', padding: '16px 14px 90px' },
  qNom:       { fontSize: '1.12rem', fontWeight: 900, margin: '0 0 2px', lineHeight: 1.25 },
  qSub:       { fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, margin: '0 0 15px' },
  qField:     { display: 'flex', alignItems: 'center', gap: 12, background: 'white', borderRadius: 15, padding: '13px 15px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  qInput:     { border: 'none', outline: 'none', fontSize: '2rem', fontWeight: 900, width: '100%', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', background: 'none' },
  qUnit:      { fontSize: '0.9rem', fontWeight: 800, color: '#9ca3af', flexShrink: 0 },
  chips:      { display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 },
  chip:       { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 99, padding: '6px 13px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  qTot:       { display: 'flex', alignItems: 'baseline', gap: 7, margin: '19px 2px 12px' },
  macTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.74rem' },
  macName:    { fontWeight: 800, color: '#4b5563' },
  macVal:     { fontWeight: 700, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' },
  bar:        { height: 6, background: '#eef1f4', borderRadius: 99, overflow: 'hidden', marginTop: 4 },
  cta:        { position: 'sticky', bottom: 0, padding: '12px 14px 16px', background: 'linear-gradient(180deg, rgba(245,245,245,0) 0%, #f5f5f5 26%)' },
  ctaBtn:     { width: '100%', border: 'none', borderRadius: 15, padding: 15, fontSize: '0.95rem', fontWeight: 800, background: '#1a1a1a', color: '#e4f816', cursor: 'pointer', fontFamily: 'inherit' },
}
