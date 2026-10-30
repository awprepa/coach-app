import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase'
import usePageFade from '../../hooks/usePageFade'
import { isoLocal } from '../../utils/dates'
import EnTeteClient from '../../components/EnTeteClient'

// ── Ajouter un aliment ───────────────────────────────────────────────────────
// Deux temps : on cherche l'aliment dans CIQUAL (table officielle ANSES), puis
// on règle la quantité en voyant les calories se recalculer. Aucune IA ici :
// les valeurs viennent de la base, le client choisit et confirme.

const REPAS_LABEL = {
  petit_dej: 'petit-déjeuner', dejeuner: 'déjeuner',
  collation: 'collation', diner: 'dîner',
}
// Libellés courts des boutons de choix du repas (tiennent sur une ligne)
const REPAS_COURT = { petit_dej: 'Petit-déj', dejeuner: 'Déjeuner', collation: 'Collation', diner: 'Dîner' }
const MACROS = [
  { k: 'proteines', l: 'Protéines', c: '#0ea5e9' },
  { k: 'glucides',  l: 'Glucides',  c: '#f59e0b' },
  { k: 'lipides',   l: 'Lipides',   c: '#8b5cf6' },
]
// Lignes du tableau nutritionnel : les détails (« dont… ») sous leur macro.
// Une ligne de détail n'apparaît que si la source de l'aliment la fournit.
const LIGNES = [
  MACROS[0],
  MACROS[1], { k: 'sucres',  l: 'dont sucres',  sous: true },
  MACROS[2], { k: 'satures', l: 'dont saturés', sous: true },
  { k: 'fibres', l: 'Fibres', sous: true, racine: true },
  { k: 'sel',    l: 'Sel',    sous: true, racine: true },
]
const DETAILS = ['sucres', 'satures', 'fibres', 'sel']
const num = v => v == null || v === '' ? null : Number(v)
const fmt = n => Math.round(n || 0).toLocaleString('fr-FR')
// Grammes de macros : une décimale sous 10 g (2,5 g), arrondi au-delà
const fmtG = n => (n || 0) < 10 ? (Math.round((n || 0) * 10) / 10).toLocaleString('fr-FR') : fmt(n)

// Repas proposé par défaut selon l'heure (après un scan, à 21 h, c'est le dîner)
function repasSelonHeure() {
  const h = new Date().getHours() + new Date().getMinutes() / 60
  if (h < 10.5) return 'petit_dej'
  if (h < 15)   return 'dejeuner'
  if (h < 18)   return 'collation'
  return 'diner'
}

// Appel direct de la fonction Edge plutôt que functions.invoke() : ce dernier
// ne transmettait pas le corps de la requête ici (la fonction recevait un terme
// vide et renvoyait donc toujours une liste vide).
async function appelFonction(nom, corps) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const res = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/${nom}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.REACT_APP_SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(corps),
  })
  return res.json().catch(() => null)
}

async function chercherMarques(terme) {
  const data = await appelFonction('nutrition-food-search', { terme })
  return data?.produits || []
}

// Deux usages : page entière (arrivée depuis le scanner) ou fenêtre ouverte par
// le « + » du journal (`feuille`), qui garde le journal visible derrière.
export default function AjouterAliment({ feuille, repasInitial, dateInitiale, onFermer, onAjoute }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const fadeStyle = usePageFade()
  const [params]  = useSearchParams()
  const [repas, setRepas] = useState(repasInitial || params.get('repas') || repasSelonHeure())
  const date  = dateInitiale || params.get('date')  || isoLocal()

  const [client, setClient]   = useState(null)
  const [terme, setTerme]     = useState('')
  const [resultats, setResultats] = useState([])
  const [marques, setMarques] = useState([])           // produits Open Food Facts
  const [chercheMarques, setChercheMarques] = useState(false)
  const [recents, setRecents] = useState([])
  const [scans, setScans]     = useState([])
  const [onglet, setOnglet]   = useState('recherche')  // recherche | recents | scans
  const [cherche, setCherche] = useState(false)
  const [choisi, setChoisi]   = useState(null)         // aliment sélectionné
  const [grammes, setGrammes] = useState(100)
  const [portions, setPortions] = useState([])
  const [envoi, setEnvoi]     = useState(false)
  const [erreur, setErreur]   = useState(null)
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

  // Arrivée depuis le scanner code-barres : le produit trouvé va direct à
  // l'écran quantité, sans repasser par la recherche.
  useEffect(() => {
    const f = location.state?.prefillFood
    if (feuille || !f) return
    setChoisi({
      nom: f.brand ? `${f.name} — ${f.brand}` : f.name,
      groupe: f.brand || 'Scanné',
      kcal: f.kcal_100 || 0,
      proteines: f.prot_100 || 0,
      glucides: f.carbs_100 || 0,
      lipides: f.fat_100 || 0,
      sucres: num(f.sugar_100), satures: num(f.satfat_100), fibres: num(f.fibre_100), sel: num(f.salt_100),
    })
    setGrammes(100)
    window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

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

  // Produits déjà scannés au code-barres.
  useEffect(() => {
    if (!client) return
    supabase.from('nutrition_scan_history')
      .select('*').eq('client_id', client.id)
      .order('scanned_at', { ascending: false }).limit(60)
      .then(({ data }) => setScans(data || []))
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
    // Aliment CIQUAL : la recherche ne renvoie que les macros, on complète avec le détail
    if (a.code && a.sucres === undefined) {
      supabase.from('ciqual_aliments').select('sucres, satures, fibres, sel').eq('code', a.code).maybeSingle()
        .then(({ data }) => data && setChoisi(c => c === a ? { ...a, sucres: num(data.sucres), satures: num(data.satures), fibres: num(data.fibres), sel: num(data.sel) } : c))
    }
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
      ...Object.fromEntries(DETAILS.map(k => [k, choisi?.[k] == null ? null : choisi[k] * r])),
    }
  }

  // Ajoute une liste d'aliments { nom, quantite, kcal, prot, gluc, lip } au repas
  // choisi, puis revient au journal avec une confirmation.
  async function ajouter(aliments, source, confirmation) {
    if (!client || envoi || !aliments.length) return
    setEnvoi(true); setErreur(null)
    try {
      // Un repas par (jour, type) : on le crée au premier aliment.
      const { data: existants, error: e0 } = await supabase.from('nutrition_meals')
        .select('id, kcal, prot_g, carbs_g, fat_g')
        .eq('client_id', client.id).eq('date', date).eq('meal_type', repas)
        .order('created_at').limit(1)
      if (e0) throw e0
      let m = existants?.[0]
      if (!m) {
        const { data: cree, error } = await supabase.from('nutrition_meals').insert({
          client_id: client.id, date, meal_type: repas, source,
          kcal: 0, prot_g: 0, carbs_g: 0, fat_g: 0,
        }).select('id, kcal, prot_g, carbs_g, fat_g').single()
        if (error) throw error
        m = cree
      }
      const { error: e1 } = await supabase.from('nutrition_meal_items').insert(aliments.map(a => ({
        meal_id: m.id, name: a.nom, quantity: a.quantite || null, unit: 'g',
        kcal: Math.round(a.kcal || 0), prot_g: (a.prot || 0).toFixed(1),
        carbs_g: (a.gluc || 0).toFixed(1), fat_g: (a.lip || 0).toFixed(1),
      })))
      if (e1) throw e1
      const somme = k => aliments.reduce((s, a) => s + (a[k] || 0), 0)
      const { error: e2 } = await supabase.from('nutrition_meals').update({
        kcal:    Math.round((m.kcal || 0) + somme('kcal')),
        prot_g:  (Number(m.prot_g || 0)  + somme('prot')).toFixed(1),
        carbs_g: (Number(m.carbs_g || 0) + somme('gluc')).toFixed(1),
        fat_g:   (Number(m.fat_g || 0)   + somme('lip')).toFixed(1),
      }).eq('id', m.id)
      if (e2) throw e2
      if (feuille) onAjoute(confirmation)
      else navigate('/client/nutrition', { replace: true, state: { ajout: confirmation } })
    } catch (err) {
      setEnvoi(false)
      setErreur("Pas enregistré. Vérifie ta connexion et réessaie.")
      console.error('[AjouterAliment]', err?.message)
    }
  }

  function enregistrer() {
    const g = parseFloat(grammes) || 0
    if (!choisi || g <= 0) return
    const t = calc()
    ajouter([{ nom: choisi.nom, quantite: g, kcal: t.kcal, prot: t.proteines, gluc: t.glucides, lip: t.lipides }],
      'manuel', `Ajouté au ${REPAS_LABEL[repas]}`)
  }

  const choixRepas = (
    <div style={S.repasRow}>
      {Object.entries(REPAS_COURT).map(([k, l]) => (
        <button key={k} onClick={() => setRepas(k)} aria-pressed={repas === k}
          style={{ ...S.repasChip, ...(repas === k ? S.repasChipOn : {}) }}>
          {l}
        </button>
      ))}
    </div>
  )
  const messageErreur = erreur && <p role="alert" style={S.erreur}>{erreur}</p>

  // Cadre commun : en-tête de page, ou fenêtre qui monte du bas avec ses boutons
  const cadre = (titre, retour, contenu) => feuille ? (
    <div style={S.overlay} onClick={onFermer}>
      <div style={S.feuille} onClick={e => e.stopPropagation()} role="dialog" aria-label={titre}>
        <div style={S.poignee} />
        <div style={S.feuilleTete}>
          {retour ? (
            <button onClick={retour} style={S.feuilleBtn} aria-label="Retour">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          ) : <span style={{ width: 44 }} />}
          <p style={S.feuilleTitre}>{titre}</p>
          <button onClick={onFermer} style={S.feuilleBtn} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {contenu}
      </div>
    </div>
  ) : (
    <div style={{ ...S.page, ...fadeStyle }}>
      <EnTeteClient retour={retour || '/client/nutrition'} titre={titre} />
      {contenu}
    </div>
  )

  const t = calc()
  const liste = onglet === 'recents' && !terme.trim() ? [] : resultats

  // ── Écran quantité ────────────────────────────────────────────────────────
  if (choisi) return cadre('Quantité', () => setChoisi(null), (<>
      <div style={S.body}>
        <p style={S.qNom}>{choisi.nom}</p>
        <p style={S.qSub}>{choisi.groupe} — {fmt(choisi.kcal)} kcal / 100 g</p>

        {choixRepas}

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
          <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#6b7280' }}>kcal</span>
        </div>
        {/* Valeurs nutritionnelles : pour 100 g et pour la quantité choisie */}
        <div style={S.tabCadre}>
        <table style={S.tabNutri}>
          <thead>
            <tr>
              <th style={{ ...S.tabTh, textAlign: 'left' }}></th>
              <th style={S.tabTh}>Pour 100 g</th>
              <th style={{ ...S.tabTh, color: '#1a1a1a' }}>Pour {fmt(parseFloat(grammes) || 0)} g</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={S.tabNom}>Calories</td>
              <td style={S.tabVal}>{fmt(choisi.kcal)} kcal</td>
              <td style={{ ...S.tabVal, ...S.tabValChoisi }}>{fmt(t.kcal)} kcal</td>
            </tr>
            {LIGNES.filter(m => !m.sous || choisi[m.k] != null).map(m => (
              <tr key={m.k}>
                <td style={m.racine ? { ...S.tabNom, paddingLeft: 28 } : m.sous ? { ...S.tabNom, ...S.tabNomSous } : S.tabNom}>{m.c && <span style={{ ...S.macPoint, background: m.c }} />}{m.l}</td>
                <td style={S.tabVal}>{fmtG(choisi[m.k])} g</td>
                <td style={{ ...S.tabVal, ...S.tabValChoisi }}>{fmtG(t[m.k])} g</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <div style={S.cta}>
        {messageErreur}
        <button onClick={enregistrer} disabled={envoi} style={S.ctaBtn}>
          {envoi ? 'Enregistrement…' : `Ajouter au ${REPAS_LABEL[repas]}`}
        </button>
      </div>
    </>))

  // ── Écran recherche ───────────────────────────────────────────────────────
  return cadre(`Ajouter au ${REPAS_LABEL[repas]}`, null, (<>
      <div style={{ padding: feuille ? '4px 14px 0' : '12px 14px 0' }}>
        <div style={S.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input value={terme} onChange={e => setTerme(e.target.value)} autoFocus
            placeholder="Rechercher un aliment…" style={S.searchInput} />
        </div>
        <div style={S.tabs}>
          {[{ v: 'recherche', l: 'Recherche' }, { v: 'recents', l: 'Récents' }, { v: 'scans', l: 'Mes scans' }].map(o => (
            <button key={o.v} onClick={() => setOnglet(o.v)}
              style={{ ...S.tab, ...(onglet === o.v ? S.tabOn : {}) }}>{o.l}</button>
          ))}
        </div>
      </div>

      <div style={S.list}>
        {onglet === 'scans' ? (
          (() => {
            const t = terme.trim().toLowerCase()
            const filtres = t ? scans.filter(s => (s.product_name || '').toLowerCase().includes(t) || (s.brand || '').toLowerCase().includes(t)) : scans
            return filtres.length ? filtres.map(s => (
              <button key={s.id} onClick={() => ouvrirQuantite({
                nom: s.brand ? `${s.product_name} — ${s.brand}` : s.product_name,
                groupe: s.brand || 'Scanné',
                kcal: s.kcal_100g || 0, proteines: s.prot_100g || 0,
                glucides: s.carbs_100g || 0, lipides: s.fat_100g || 0,
                sucres: num(s.sugar_100g), satures: num(s.satfat_100g), fibres: num(s.fiber_100g), sel: null,
              })} style={S.row}>
                <div style={{ minWidth: 0 }}>
                  <p style={S.rowNom}>{s.product_name}</p>
                  <p style={S.rowSub}>{s.brand || 'Scanné'}</p>
                </div>
                <div style={S.rowK}><b style={S.rowKNb}>{fmt(s.kcal_100g)}</b><i style={S.rowKUnit}>kcal / 100 g</i></div>
              </button>
            )) : <p style={S.vide}>{t ? 'Aucun scan ne correspond.' : "Aucun produit scanné pour l'instant."}</p>
          })()
        ) : onglet === 'recents' && !terme.trim() ? (
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
              <div style={S.rowK}><b style={S.rowKNb}>{fmt(r.kcal)}</b><i style={S.rowKUnit}>kcal</i></div>
            </button>
          )) : <p style={S.vide}>Aucun aliment récent pour l'instant.</p>
        ) : cherche ? (
          <p style={S.vide}>Recherche…</p>
        ) : !terme.trim() ? (
          <p style={S.vide}>Tape le nom d'un aliment pour le chercher.</p>
        ) : (liste.length || marques.length || chercheMarques) ? (
          <>
            {liste.length > 0 && (
              <>
                <p style={S.source}>Aliments courants</p>
                {liste.map(a => (
                  <button key={a.code} onClick={() => ouvrirQuantite(a)} style={S.row}>
                    <div style={{ minWidth: 0 }}>
                      <p style={S.rowNom}>{a.nom}</p>
                      <p style={S.rowSub}>{a.groupe}</p>
                    </div>
                    <div style={S.rowK}><b style={S.rowKNb}>{fmt(a.kcal)}</b><i style={S.rowKUnit}>kcal / 100 g</i></div>
                  </button>
                ))}
              </>
            )}

            <p style={{ ...S.source, marginTop: liste.length ? 14 : 0 }}>
              Produits de marque
            </p>
            {chercheMarques ? (
              <p style={{ ...S.vide, padding: '0.8rem' }}>Recherche des marques…</p>
            ) : marques.length ? marques.map(p => (
              <button key={p.code || p.nom} onClick={() => ouvrirQuantite({
                nom: p.marque ? `${p.nom} — ${p.marque}` : p.nom,
                groupe: p.marque || 'Produit de marque',
                kcal: p.kcal, proteines: p.proteines || 0,
                glucides: p.glucides || 0, lipides: p.lipides || 0,
                sucres: num(p.sucres), satures: num(p.satures), fibres: num(p.fibres), sel: num(p.sel),
              })} style={S.row}>
                <div style={{ minWidth: 0 }}>
                  <p style={S.rowNom}>{p.nom}</p>
                  <p style={{ ...S.rowSub, color: '#b45309' }}>{p.marque || 'Sans marque'}</p>
                </div>
                <div style={S.rowK}><b style={S.rowKNb}>{fmt(p.kcal)}</b><i style={S.rowKUnit}>kcal / 100 g</i></div>
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
    </>))
}

const S = {
  page:       { minHeight: '100dvh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column' },
  header:     { background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '14px 14px 15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headerTitle:{ color: 'white', fontWeight: 800, fontSize: '1rem', textAlign: 'center', flex: 1 },
  back:       { width: 34, height: 34, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.12)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 },
  search:     { display: 'flex', alignItems: 'center', gap: 9, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 13, padding: '10px 12px' },
  // 16 px : en dessous, iOS zoome tout l'écran quand on touche le champ
  searchInput:{ border: 'none', outline: 'none', fontSize: '1rem', fontFamily: 'inherit', width: '100%', background: 'none' },
  tabs:       { display: 'flex', gap: 7, padding: '11px 0 3px' },
  tab:        { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 99, padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  tabOn:      { background: '#333333', borderColor: '#333333', color: 'white' },
  list:       { flex: 1, overflowY: 'auto', padding: '8px 14px 20px' },
  source:     { fontSize: '0.75rem', color: '#6b7280', fontWeight: 700, padding: '2px 2px 8px', margin: 0 },
  row:        { width: '100%', display: 'flex', alignItems: 'center', gap: 11, background: 'white', borderRadius: 13, padding: '11px 13px', marginBottom: 7, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  rowNom:     { fontSize: '0.85rem', fontWeight: 700, margin: 0, lineHeight: 1.3 },
  rowSub:     { fontSize: '0.75rem', color: '#6b7280', margin: '2px 0 0', fontWeight: 600 },
  rowK:       { marginLeft: 'auto', textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 },
  rowKNb:     { fontSize: '0.95rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 },
  rowKUnit:   { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', fontStyle: 'normal' },
  macPoint:   { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 8, flexShrink: 0 },
  tabCadre:   { background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  tabNutri:   { width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' },
  tabTh:      { padding: '10px 12px', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textAlign: 'right', borderBottom: '1px solid #f3f4f6' },
  tabNom:     { padding: '10px 12px', fontSize: '0.85rem', fontWeight: 700, color: '#374151', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  tabVal:     { padding: '10px 12px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', textAlign: 'right', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  tabNomSous: { paddingLeft: 40, fontWeight: 600, color: '#6b7280' },
  tabValChoisi: { fontWeight: 800, color: '#1a1a1a' },
  vide:       { color: '#6b7280', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', padding: '2rem 1rem', lineHeight: 1.5 },
  body:       { flex: 1, overflowY: 'auto', padding: '16px 20px 90px' },
  qNom:       { fontSize: '1.12rem', fontWeight: 900, margin: '0 0 2px', lineHeight: 1.25 },
  qSub:       { fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, margin: '0 0 15px' },
  // Taille portée par le conteneur : sur téléphone, une règle globale force les
  // champs à max(16px, 1em) — 1em reprend donc ces 2rem au lieu de tomber à 16 px.
  qField:     { display: 'flex', alignItems: 'center', gap: 12, background: 'white', borderRadius: 15, padding: '13px 15px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', fontSize: '2rem' },
  qInput:     { border: 'none', outline: 'none', fontSize: '1em', fontWeight: 900, width: '100%', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', background: 'none' },
  qUnit:      { fontSize: '0.9rem', fontWeight: 800, color: '#6b7280', flexShrink: 0 },
  chips:      { display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 },
  chip:       { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 99, padding: '6px 13px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  qTot:       { display: 'flex', alignItems: 'baseline', gap: 7, margin: '19px 2px 12px' },
  // Même marge sur les côtés et en bas (20 px, ou la zone du geste d'accueil si elle est plus grande)
  cta:        { position: 'sticky', bottom: 0, padding: '12px 20px max(20px, env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(180deg, rgba(245,245,245,0) 0%, #f5f5f5 26%)' },
  ctaBtn:     { width: '100%', minHeight: 52, border: 'none', borderRadius: 999, padding: '0 16px', fontSize: '0.95rem', fontWeight: 800, background: '#333333', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' },
  repasRow:   { display: 'flex', gap: 6, marginBottom: 14 },
  repasChip:  { flex: 1, minHeight: 40, padding: '0 4px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'white', color: '#4b5563', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  erreur:     { margin: '0 0 8px', background: '#fee2e2', color: '#991b1b', borderRadius: 12, padding: '10px 12px', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  // Presque tout l'écran : avec le clavier ouvert, il reste de la place pour les résultats
  feuille:    { background: '#f5f5f5', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 500, height: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  poignee:    { width: 36, height: 4, background: '#d1d5db', borderRadius: 999, margin: '10px auto 2px', flexShrink: 0 },
  feuilleTete:{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', flexShrink: 0 },
  feuilleTitre:{ flex: 1, margin: 0, textAlign: 'center', fontSize: '1rem', fontWeight: 800, color: '#1a1a1a' },
  feuilleBtn: { width: 44, height: 44, border: 'none', background: 'none', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 },
  repasChipOn:{ background: '#333333', borderColor: '#333333', color: 'var(--accent-fg-dark)' },
}
