import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../../supabase'
import usePageFade from '../../hooks/usePageFade'
import { isoLocal } from '../../utils/dates'
import EnTeteClient from '../../components/EnTeteClient'

// ── Ajouter un aliment ───────────────────────────────────────────────────────
// Deux temps : on cherche l'aliment dans CIQUAL (table officielle ANSES), puis
// on règle la quantité en voyant les calories se recalculer. Deux raccourcis en
// plus : la photo de l'assiette (analysée par l'IA, quantités modifiables) et la
// saisie à la main, pour un plat qui n'existe dans aucune base.

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

// Repas proposé par défaut selon l'heure (après un scan, à 21 h, c'est le dîner)
function repasSelonHeure() {
  const h = new Date().getHours() + new Date().getMinutes() / 60
  if (h < 10.5) return 'petit_dej'
  if (h < 15)   return 'dejeuner'
  if (h < 18)   return 'collation'
  return 'diner'
}

// Photo réduite (1024 px max) avant l'envoi : plus rapide, sous la limite de la fonction
function compresserPhoto(fichier, cote = 1024) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onerror = reject
    lecteur.onload = e => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > cote || height > cote) {
          if (width > height) { height = Math.round(height * cote / width); width = cote }
          else                { width  = Math.round(width  * cote / height); height = cote }
        }
        const c = document.createElement('canvas')
        c.width = width; c.height = height
        c.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1])
      }
      img.src = e.target.result
    }
    lecteur.readAsDataURL(fichier)
  })
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

export default function AjouterAliment() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const fadeStyle = usePageFade()
  const [params]  = useSearchParams()
  const [repas, setRepas] = useState(params.get('repas') || repasSelonHeure())
  const date  = params.get('date')  || isoLocal()

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
  const [mode, setMode]       = useState(null)         // null | 'photo' | 'manuel'
  // Photo de l'assiette
  const [analyse, setAnalyse] = useState(false)
  const [photoErreur, setPhotoErreur] = useState(null)
  const [plat, setPlat]       = useState(null)         // { nom, items: [...] }
  // Saisie à la main
  const [manuel, setManuel]   = useState({ nom: '', quantite: '', kcal: '', prot: '', gluc: '', lip: '' })
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
    if (!f) return
    setChoisi({
      nom: f.brand ? `${f.name} — ${f.brand}` : f.name,
      groupe: f.brand || 'Scanné',
      kcal: f.kcal_100 || 0,
      proteines: f.prot_100 || 0,
      glucides: f.carbs_100 || 0,
      lipides: f.fat_100 || 0,
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
      navigate('/client/nutrition', { replace: true, state: { ajout: confirmation } })
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

  // ── Photo de l'assiette ──────────────────────────────────────────────────
  async function analyserPhoto(e) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    setMode('photo'); setPlat(null); setPhotoErreur(null); setAnalyse(true)
    try {
      const base64 = await compresserPhoto(fichier)
      const data = await appelFonction('nutrition-analyze-photo', { photo_base64: base64, mime_type: 'image/jpeg' })
      if (!data?.ok || !data.items?.length) throw new Error('vide')
      setPlat({
        nom: data.repas_nom || 'Mon assiette',
        items: data.items.map(i => {
          const q = Number(i.quantity) || 100
          // Valeurs pour 100 g : les quantités restent modifiables ensuite
          return { nom: i.name, quantite: q, k100: (Number(i.kcal) || 0) / q * 100,
            p100: (Number(i.prot_g) || 0) / q * 100, g100: (Number(i.carbs_g) || 0) / q * 100, l100: (Number(i.fat_g) || 0) / q * 100 }
        }),
      })
    } catch {
      setPhotoErreur("L'analyse n'a pas marché. Reprends la photo de plus près, ou saisis le plat à la main.")
    }
    setAnalyse(false)
  }
  const valeursPlat = (plat?.items || []).map(i => {
    const r = (parseFloat(i.quantite) || 0) / 100
    return { nom: i.nom, quantite: parseFloat(i.quantite) || 0, kcal: i.k100 * r, prot: i.p100 * r, gluc: i.g100 * r, lip: i.l100 * r }
  })
  const totalPlat = valeursPlat.reduce((s, i) => s + i.kcal, 0)

  // ── Saisie à la main ─────────────────────────────────────────────────────
  const num = v => parseFloat(String(v).replace(',', '.')) || 0
  const manuelValide = manuel.nom.trim() && num(manuel.kcal) > 0
  function enregistrerManuel() {
    if (!manuelValide) return
    ajouter([{ nom: manuel.nom.trim(), quantite: num(manuel.quantite) || null, kcal: num(manuel.kcal),
      prot: num(manuel.prot), gluc: num(manuel.gluc), lip: num(manuel.lip) }],
      'manuel', `Ajouté au ${REPAS_LABEL[repas]}`)
  }

  const choixRepas = (
    <div style={S.repasRow}>
      {Object.entries(REPAS_LABEL).map(([k, l]) => (
        <button key={k} onClick={() => setRepas(k)} style={{ ...S.repasChip, ...(repas === k ? S.repasChipOn : {}) }}>
          {l}
        </button>
      ))}
    </div>
  )
  const messageErreur = erreur && <p role="alert" style={S.erreur}>{erreur}</p>

  const t = calc()
  const liste = onglet === 'recents' && !terme.trim() ? [] : resultats

  // ── Écran quantité ────────────────────────────────────────────────────────
  if (choisi) return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <EnTeteClient retour={() => setChoisi(null)} titre="Quantité" />
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
        {messageErreur}
        <button onClick={enregistrer} disabled={envoi} style={S.ctaBtn}>
          {envoi ? 'Enregistrement…' : `Ajouter au ${REPAS_LABEL[repas]}`}
        </button>
      </div>
    </div>
  )

  // ── Écran photo de l'assiette ─────────────────────────────────────────────
  if (mode === 'photo') return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <EnTeteClient retour={() => setMode(null)} titre="Photo de mon assiette" />
      <div style={S.body}>
        {analyse ? (
          <div style={S.attente}>
            <div style={S.roue} />
            <p style={{ ...S.vide, padding: '1rem 0 0' }}>Analyse de ton assiette…</p>
            <style>{`@keyframes aw-spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : photoErreur ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <p style={S.vide}>{photoErreur}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={S.ctaBtn}>Reprendre une photo
                <input type="file" accept="image/*" capture="environment" onChange={analyserPhoto} style={{ display: 'none' }} />
              </label>
              <button onClick={() => setMode('manuel')} style={S.secondaire}>Saisir à la main</button>
            </div>
          </div>
        ) : plat && (
          <>
            <p style={S.qNom}>{plat.nom}</p>
            <p style={S.qSub}>Estimation de l'IA. Corrige les quantités si besoin.</p>
            {choixRepas}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {plat.items.map((it, i) => (
                <div key={i} style={{ ...S.row, cursor: 'default' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={S.rowNom}>{it.nom}</p>
                    <p style={S.rowSub}>{fmt(valeursPlat[i].kcal)} kcal</p>
                  </div>
                  <div style={S.qPetit}>
                    <input type="number" inputMode="decimal" value={it.quantite} aria-label={`Quantité de ${it.nom} en grammes`}
                      onChange={e => setPlat(p => ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, quantite: e.target.value } : x) }))}
                      style={S.qPetitInput} />
                    <span style={S.qUnit}>g</span>
                  </div>
                  <button onClick={() => setPlat(p => ({ ...p, items: p.items.filter((_, j) => j !== i) }))}
                    style={S.retirer} aria-label={`Retirer ${it.nom}`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div style={S.qTot}>
              <b style={{ fontSize: '1.9rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmt(totalPlat)}</b>
              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#6b7280' }}>kcal au total</span>
            </div>
          </>
        )}
      </div>
      {plat && !analyse && !photoErreur && (
        <div style={S.cta}>
          {messageErreur}
          <button onClick={() => ajouter(valeursPlat.filter(i => i.quantite > 0), 'photo_ai', `Assiette ajoutée au ${REPAS_LABEL[repas]}`)}
            disabled={envoi || !valeursPlat.some(i => i.quantite > 0)} style={S.ctaBtn}>
            {envoi ? 'Enregistrement…' : `Ajouter au ${REPAS_LABEL[repas]}`}
          </button>
        </div>
      )}
    </div>
  )

  // ── Écran saisie à la main ────────────────────────────────────────────────
  if (mode === 'manuel') {
    const champ = (cle, label, props = {}) => (
      <label style={S.champ}>
        <span style={S.champLabel}>{label}</span>
        <input value={manuel[cle]} onChange={e => setManuel(m => ({ ...m, [cle]: e.target.value }))}
          className="aw-champ" style={S.champInput} {...props} />
      </label>
    )
    return (
      <div style={{ ...S.page, ...fadeStyle }}>
        <EnTeteClient retour={() => setMode(null)} titre="Saisie à la main" />
        <style>{`.aw-champ::placeholder { color: #9ca3af; font-weight: 600 }`}</style>
        <div style={S.body}>
          {choixRepas}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {champ('nom', 'Nom du plat', { placeholder: 'Lasagnes du club', autoFocus: true })}
            <div style={{ display: 'flex', gap: 10 }}>
              {champ('kcal', 'Calories (kcal)', { type: 'number', inputMode: 'decimal', placeholder: '650' })}
              {champ('quantite', 'Quantité (g, facultatif)', { type: 'number', inputMode: 'decimal', placeholder: '350' })}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {champ('prot', 'Protéines (g)', { type: 'number', inputMode: 'decimal' })}
              {champ('gluc', 'Glucides (g)', { type: 'number', inputMode: 'decimal' })}
              {champ('lip', 'Lipides (g)', { type: 'number', inputMode: 'decimal' })}
            </div>
            <p style={S.qSub}>Les calories sont souvent indiquées sur l'emballage ou le menu. Les macros sont facultatives.</p>
          </div>
        </div>
        <div style={S.cta}>
          {messageErreur}
          <button onClick={enregistrerManuel} disabled={envoi || !manuelValide}
            style={{ ...S.ctaBtn, opacity: manuelValide ? 1 : 0.4 }}>
            {envoi ? 'Enregistrement…' : `Ajouter au ${REPAS_LABEL[repas]}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Écran recherche ───────────────────────────────────────────────────────
  return (
    <div style={{ ...S.page, ...fadeStyle }}>
      <EnTeteClient retour="/client/nutrition" titre={`Ajouter au ${REPAS_LABEL[repas]}`} />

      <div style={{ padding: '12px 14px 0' }}>
        <div style={S.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input value={terme} onChange={e => setTerme(e.target.value)} autoFocus
            placeholder="Rechercher un aliment…" style={S.searchInput} />
        </div>
        <div style={S.raccourcis}>
          <label style={S.raccourci}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
            </svg>
            Photo du repas
            <input type="file" accept="image/*" capture="environment" onChange={analyserPhoto} style={{ display: 'none' }} />
          </label>
          <button onClick={() => setMode('manuel')} style={S.raccourci}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" />
            </svg>
            Saisie à la main
          </button>
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
              })} style={S.row}>
                <div style={{ minWidth: 0 }}>
                  <p style={S.rowNom}>{s.product_name}</p>
                  <p style={S.rowSub}>{s.brand || 'Scanné'}</p>
                </div>
                <div style={S.rowK}><b>{fmt(s.kcal_100g)}</b><i>kcal / 100 g</i></div>
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
              <div style={S.rowK}><b>{fmt(r.kcal)}</b><i>kcal</i></div>
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
                    <div style={S.rowK}><b>{fmt(a.kcal)}</b><i>kcal / 100 g</i></div>
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
          <>
            <p style={S.vide}>Aucun aliment trouvé. Essaie un autre mot, ou saisis-le à la main.</p>
            <button onClick={() => { setManuel(m => ({ ...m, nom: terme.trim() })); setMode('manuel') }} style={S.secondaire}>
              Saisir « {terme.trim()} » à la main
            </button>
          </>
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
  // 16 px : en dessous, iOS zoome tout l'écran quand on touche le champ
  searchInput:{ border: 'none', outline: 'none', fontSize: '1rem', fontFamily: 'inherit', width: '100%', background: 'none' },
  tabs:       { display: 'flex', gap: 7, padding: '11px 0 3px' },
  tab:        { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 99, padding: '6px 14px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  tabOn:      { background: '#1a1a1a', borderColor: '#1a1a1a', color: 'white' },
  list:       { flex: 1, overflowY: 'auto', padding: '8px 14px 20px' },
  source:     { fontSize: '0.75rem', color: '#6b7280', fontWeight: 700, padding: '2px 2px 8px', margin: 0 },
  row:        { width: '100%', display: 'flex', alignItems: 'center', gap: 11, background: 'white', borderRadius: 13, padding: '11px 13px', marginBottom: 7, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  rowNom:     { fontSize: '0.85rem', fontWeight: 700, margin: 0, lineHeight: 1.3 },
  rowSub:     { fontSize: '0.75rem', color: '#6b7280', margin: '2px 0 0', fontWeight: 600 },
  rowK:       { marginLeft: 'auto', textAlign: 'right', flexShrink: 0 },
  vide:       { color: '#6b7280', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', padding: '2rem 1rem', lineHeight: 1.5 },
  body:       { flex: 1, overflowY: 'auto', padding: '16px 14px 90px' },
  qNom:       { fontSize: '1.12rem', fontWeight: 900, margin: '0 0 2px', lineHeight: 1.25 },
  qSub:       { fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, margin: '0 0 15px' },
  qField:     { display: 'flex', alignItems: 'center', gap: 12, background: 'white', borderRadius: 15, padding: '13px 15px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  qInput:     { border: 'none', outline: 'none', fontSize: '2rem', fontWeight: 900, width: '100%', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums', background: 'none' },
  qUnit:      { fontSize: '0.9rem', fontWeight: 800, color: '#6b7280', flexShrink: 0 },
  chips:      { display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 },
  chip:       { border: '1.5px solid #e5e7eb', background: 'white', borderRadius: 99, padding: '6px 13px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', cursor: 'pointer', fontFamily: 'inherit' },
  qTot:       { display: 'flex', alignItems: 'baseline', gap: 7, margin: '19px 2px 12px' },
  macTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.75rem' },
  macName:    { fontWeight: 800, color: '#4b5563' },
  macVal:     { fontWeight: 700, color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
  bar:        { height: 6, background: '#eef1f4', borderRadius: 99, overflow: 'hidden', marginTop: 4 },
  cta:        { position: 'sticky', bottom: 0, padding: '12px 14px calc(16px + env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(180deg, rgba(245,245,245,0) 0%, #f5f5f5 26%)' },
  ctaBtn:     { width: '100%', border: 'none', borderRadius: 15, padding: 15, fontSize: '0.95rem', fontWeight: 800, background: '#1a1a1a', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', display: 'block', boxSizing: 'border-box', textAlign: 'center' },
  repasRow:   { display: 'flex', gap: 6, marginBottom: 14 },
  repasChip:  { flex: 1, padding: '8px 4px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'white', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' },
  raccourcis: { display: 'flex', gap: 8, marginTop: 10 },
  raccourci:  { flex: 1, minHeight: 44, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 13, padding: '8px 10px', fontSize: '0.8rem', fontWeight: 800, color: '#1a1a1a', cursor: 'pointer', fontFamily: 'inherit' },
  secondaire: { width: '100%', minHeight: 48, border: '1.5px solid #e5e7eb', borderRadius: 15, background: 'white', color: '#1a1a1a', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  erreur:     { margin: '0 0 8px', background: '#fee2e2', color: '#991b1b', borderRadius: 12, padding: '10px 12px', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center' },
  attente:    { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0' },
  roue:       { width: 36, height: 36, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#1a1a1a', animation: 'aw-spin 0.7s linear infinite' },
  qPetit:     { display: 'flex', alignItems: 'center', gap: 4, background: '#f5f5f5', borderRadius: 10, padding: '0 8px', flexShrink: 0 },
  qPetitInput:{ width: 56, minHeight: 40, border: 'none', outline: 'none', background: 'none', fontSize: '1rem', fontWeight: 800, textAlign: 'right', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' },
  retirer:    { width: 44, height: 44, margin: '-8px -8px -8px 0', border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 },
  champ:      { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  champLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#6b7280' },
  champInput: { width: '100%', boxSizing: 'border-box', minHeight: 46, border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '10px 12px', fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit', background: 'white', outline: 'none' },
  repasChipOn:{ background: '#1a1a1a', borderColor: '#1a1a1a', color: 'var(--accent-fg-dark)' },
}
