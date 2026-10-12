import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import { formatRetour, getActiveBlessure } from '../../components/BlessureButton'
import { isLight } from './couleurs'
import { localISO } from './constants'

/* ── Effectif du groupe — organigramme rugby ── */
export function EffectifView({ groupeId, groupColor, openClientId, onOpened }) {
  const navigate = useNavigate()
  const [joueurs, setJoueurs] = useState([])    // groupe_joueurs avec leurs postes et blessure
  const [wellness, setWellness] = useState({})  // client_id → { score, poids, date } (dernière entrée)
  const [clientInfo, setClientInfo] = useState({ dateNaissance: {}, taille: {}, poids: {}, age: {} }) // client_id → valeur (fallback compte lié)
  const [recentEvents, setRecentEvents] = useState([]) // derniers événements du groupe (rappel, non personnalisé)
  const [editingVital, setEditingVital] = useState(null) // 'age' | 'taille' | 'poids' | null — édition manuelle en cours
  const [vitalDraft, setVitalDraft] = useState('')
  const [panelPos, setPanelPos] = useState(null)   // poste | null — panneau liste
  const [panelJoueur, setPanelJoueur] = useState(null) // joueur en édition
  const [addForm, setAddForm] = useState(false)
  const [newPrenom, setNewPrenom] = useState('')
  const [newNom, setNewNom] = useState('')
  const [newRang, setNewRang] = useState(1)
  const [editRang, setEditRang] = useState(1)
  const [editSecondaires, setEditSecondaires] = useState('')
  const [saving, setSaving] = useState(false)

  const POSTES_RUGBY = [
    { num:1, nom:'Pilier' },        { num:2, nom:'Talonneur' }, { num:3, nom:'Pilier' },
    { num:4, nom:'2e ligne' },      { num:5, nom:'2e ligne' },
    { num:6, nom:'3e ligne' },      { num:7, nom:'3e ligne' }, { num:8, nom:'3e ligne' },
    { num:9, nom:'Demi de mêlée' }, { num:10, nom:"Demi d'ouverture" },
    { num:12, nom:'Centre' },       { num:13, nom:'Centre' },
    { num:11, nom:'Ailier' },       { num:15, nom:'Arrière' }, { num:14, nom:'Ailier' },
  ]
  const FORMATION = [
    [1,2,3],[4,5],[6,7,8],[9,10],[12,13],[11,15,14]
  ]
  const ROW_LABELS = ['1ères lignes','2èmes lignes','3èmes lignes','Demis','Centres','Ailiers & Arrière']

  useEffect(() => { if (groupeId) fetchAll() }, [groupeId])

  async function fetchAll() {
    if (!groupeId) return
    // Joueurs + leurs postes
    const { data: jData } = await supabase
      .from('groupe_joueurs')
      .select('*, joueur_postes(*), joueur_blessures(*), joueur_tests_physiques(*)')
      .eq('groupe_id', groupeId)
    setJoueurs(jData || [])
    // Wellness — dernière entrée par client lié (score = moyenne des 4 dimensions /4)
    const clientIds = (jData || []).filter(j => j.client_id).map(j => j.client_id)
    if (clientIds.length > 0) {
      const { data: wData } = await supabase
        .from('wellness')
        .select('client_id, date, sommeil, fatigue, douleurs, stress, poids, created_at')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
      const wMap = {}
      for (const w of (wData || [])) {
        if (wMap[w.client_id]) continue
        const dims = [w.sommeil, w.fatigue, w.douleurs, w.stress].filter(v => v != null)
        const score = dims.length ? dims.reduce((a, b) => a + b, 0) / dims.length : null
        wMap[w.client_id] = { score, poids: w.poids ?? null, date: w.date }
      }
      setWellness(wMap)

      // Âge / taille / poids — fallback pour les joueurs avec compte lié,
      // depuis le profil nutritionnel qu'ils remplissent eux-mêmes.
      const [{ data: cData }, { data: npData }] = await Promise.all([
        supabase.from('clients').select('id, date_naissance').in('id', clientIds),
        supabase.from('nutrition_profile').select('client_id, taille_cm, poids_kg, age_ans').in('client_id', clientIds),
      ])
      const cMap = {}
      for (const c of (cData || [])) cMap[c.id] = c.date_naissance
      const npTailleMap = {}, npPoidsMap = {}, npAgeMap = {}
      for (const np of (npData || [])) {
        npTailleMap[np.client_id] = np.taille_cm
        npPoidsMap[np.client_id]  = np.poids_kg
        npAgeMap[np.client_id]    = np.age_ans
      }
      setClientInfo({ dateNaissance: cMap, taille: npTailleMap, poids: npPoidsMap, age: npAgeMap })
    } else {
      setWellness({})
      setClientInfo({ dateNaissance: {}, taille: {}, poids: {}, age: {} })
    }
    // Derniers événements du groupe — simple rappel, pas de pointage individuel
    const { data: evData } = await supabase
      .from('groupe_evenements')
      .select('id, date, type, titre, adversaire')
      .eq('groupe_id', groupeId)
      .lte('date', localISO())
      .order('date', { ascending: false })
      .limit(6)
    setRecentEvents(evData || [])
  }

  // Joueurs au poste P triés par rang
  function joueursAuPoste(poste) {
    return joueurs
      .filter(j => (j.joueur_postes || []).some(p => p.poste === poste))
      .map(j => ({
        ...j,
        rang: (j.joueur_postes || []).find(p => p.poste === poste)?.rang || 99,
        blessure: getActiveBlessure(j.joueur_blessures),
      }))
      .sort((a, b) => a.rang - b.rang)
  }

  function getStatut(j) { return j.blessure?.statut || 'ok' }
  function testsTries(j, type) {
    return (j?.joueur_tests_physiques || [])
      .filter(t => t.type === type)
      .sort((a, b) => b.date.localeCompare(a.date))
  }
  function dernierTest(j, type) { return testsTries(j, type)[0] || null }
  function getWellness(j) {
    if (!j.client_id) return null
    return wellness[j.client_id]?.score ?? null
  }
  function getWellnessInfo(j) {
    if (!j.client_id) return null
    return wellness[j.client_id] || null
  }
  function ageFromDate(d) {
    if (!d) return null
    const naiss = new Date(d + 'T00:00:00')
    const diff = Date.now() - naiss.getTime()
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000))
  }
  // Valeurs effectives : priorité au compte client lié (auto-rempli par le
  // joueur), puis au wellness pour le poids, puis à la saisie manuelle du
  // coach sur la fiche joueur — jamais de source qui écrase une autre en base,
  // seulement un ordre d'affichage.
  function effectiveAge(j) {
    const dn = (j.client_id && clientInfo.dateNaissance[j.client_id]) || j.date_naissance
    if (dn) return ageFromDate(dn)
    const npAge = j.client_id && clientInfo.age[j.client_id]
    return npAge || null
  }
  function effectiveTaille(j) {
    const t = (j.client_id && clientInfo.taille[j.client_id]) || j.taille_cm
    return t || null
  }
  function effectivePoids(j) {
    const w = getWellnessInfo(j)
    if (w?.poids) return { valeur: w.poids, source: 'wellness', date: w.date }
    const npPoids = j.client_id && clientInfo.poids[j.client_id]
    if (npPoids) return { valeur: npPoids, source: 'profil nutritionnel', date: null }
    if (j.poids_kg) return { valeur: j.poids_kg, source: 'manuel', date: null }
    return null
  }
  async function saveVitalManuel(j, champ, valeur) {
    const patch = champ === 'age'
      ? { date_naissance: valeur ? `${new Date().getFullYear() - Number(valeur)}-01-01` : null }
      : champ === 'taille' ? { taille_cm: valeur ? Number(valeur) : null }
      : { poids_kg: valeur ? Number(valeur) : null }
    await supabase.from('groupe_joueurs').update(patch).eq('id', j.id)
    setJoueurs(prev => prev.map(x => x.id === j.id ? { ...x, ...patch } : x))
    setPanelJoueur(prev => prev ? { ...prev, ...patch } : prev)
    setEditingVital(null)
  }
  function wColor(w) {
    if (w === null) return '#c4ccd4'
    if (w >= 3) return '#16a34a'
    if (w >= 2) return '#f59e0b'
    return '#dc2626'
  }
  function statutBorderColor(s) {
    if (s === 'ok')   return '#16a34a'
    if (s === 'cond') return '#f59e0b'
    if (s === 'out')  return '#dc2626'
    return '#d1d5db'
  }

  // Stats globales
  const nbOk   = joueurs.filter(j => getStatut(j) === 'ok').length
  const nbCond  = joueurs.filter(j => getStatut(j) === 'cond').length
  const nbOut   = joueurs.filter(j => getStatut(j) === 'out').length
  const wScores = joueurs.filter(j => getWellness(j) !== null).map(j => getWellness(j))
  const wMoy    = wScores.length > 0 ? (wScores.reduce((a,b)=>a+b,0)/wScores.length).toFixed(1) : null

  function openPanelPos(poste) {
    setPanelPos(poste)
    setAddForm(false)
    setNewPrenom(''); setNewNom(''); setNewRang(joueursAuPoste(poste).length + 1)
  }
  function openPanelJoueur(j, poste) {
    setPanelJoueur({ ...j, _poste: poste })
    setEditRang(j.rang)
    const secondaires = (j.joueur_postes || [])
      .filter(p => p.poste !== poste)
      .map(p => p.poste)
      .join(', ')
    setEditSecondaires(secondaires)
    setEditingVital(null)
    setVitalDraft('')
    setPanelPos(null)
  }

  // Ouverture directe du profil groupe depuis un autre écran (ex. la liste
  // Membres du tableau de bord) — évite de renvoyer vers la fiche client.
  const autoOpenedClientRef = useRef(null)
  useEffect(() => {
    if (!openClientId || autoOpenedClientRef.current === openClientId || !joueurs.length) return
    const match = joueurs.find(j => j.client_id === openClientId)
    if (!match) return
    autoOpenedClientRef.current = openClientId
    const postes = match.joueur_postes || []
    const primary = postes.find(p => p.is_primary) || postes[0]
    openPanelJoueur({ ...match, rang: primary?.rang || 99, blessure: getActiveBlessure(match.joueur_blessures) }, primary?.poste ?? null)
    onOpened?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openClientId, joueurs])

  // Le panneau joueur ne gère plus les blessures (elles se modifient dans
  // « Suivi blessures ») : on n'y enregistre que le poste (rang + secondaires).
  async function saveJoueur() {
    if (!panelJoueur) return
    setSaving(true)
    const joueurId = panelJoueur.id
    const posteRec = (panelJoueur.joueur_postes || []).find(p => p.poste === panelJoueur._poste)
    if (posteRec) {
      await supabase.from('joueur_postes').update({ rang: editRang }).eq('id', posteRec.id)
    }
    // Postes secondaires : liste de numéros séparés par des virgules
    const wanted = editSecondaires.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= 15 && n !== panelJoueur._poste)
    const current = (panelJoueur.joueur_postes || []).filter(p => p.poste !== panelJoueur._poste)
    for (const p of current) {
      if (!wanted.includes(p.poste)) await supabase.from('joueur_postes').delete().eq('id', p.id)
    }
    for (const n of wanted) {
      if (!current.some(p => p.poste === n)) {
        await supabase.from('joueur_postes').insert({ joueur_id: joueurId, poste: n, rang: 99, is_primary: false })
      }
    }
    setSaving(false)
    setPanelJoueur(null)
    fetchAll()
  }

  async function retirerDuGroupe() {
    if (!panelJoueur) return
    if (!window.confirm('Retirer ce joueur du groupe ? Sa fiche client et son historique restent intacts, il redevient un client individuel.')) return
    setSaving(true)
    await supabase.from('groupe_joueurs').delete().eq('id', panelJoueur.id)
    if (panelJoueur.client_id) {
      await supabase.from('groupe_membres').delete().eq('groupe_id', groupeId).eq('client_id', panelJoueur.client_id)
    }
    setSaving(false)
    setPanelJoueur(null)
    fetchAll()
  }

  async function addJoueur() {
    if (!newPrenom.trim() || !newNom.trim() || !panelPos) return
    setSaving(true)
    const { data: j } = await supabase.from('groupe_joueurs').insert({
      groupe_id: groupeId,
      prenom: newPrenom.trim(),
      nom: newNom.trim(),
    }).select().single()
    if (j) {
      await supabase.from('joueur_postes').insert({
        joueur_id: j.id,
        poste: panelPos,
        rang: newRang,
        is_primary: true,
      })
    }
    setSaving(false)
    setAddForm(false)
    setNewPrenom(''); setNewNom('')
    fetchAll()
  }

  const RANK_LABELS = ['①','②','③','④','⑤','⑥','⑦','⑧']

  // Rendu d'une carte de poste — tous les joueurs du poste sont affichés,
  // sans limite ni "+N autres" à ouvrir (cf. retour Arthur : voir tout le
  // monde d'un coup d'œil). Cliquer un joueur l'édite directement ;
  // cliquer ailleurs sur la carte ouvre le panneau (ajout de joueur).
  function PosteCard({ poste }) {
    const joueursPoste = joueursAuPoste(poste.num)

    return (
      <div role="button" tabIndex={0}
        onClick={() => openPanelPos(poste.num)}
        style={{ flex:1, maxWidth:300, borderRadius:11, overflow:'hidden',
          border:'2px solid #e5e7eb', cursor:'pointer',
          boxShadow:'0 1px 3px rgba(0,0,0,0.08)',
          transition:'box-shadow 0.15s, transform 0.12s' }}
        onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.08)' }}
      >
        {/* En-tête */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 13px', background:'#1f2937' }}>
          <span style={{ fontSize:'1.3rem', fontWeight:900, color:'#e4f816', minWidth:26 }}>{poste.num}</span>
          <span style={{ fontSize:'0.7rem', fontWeight:700, color: '#6b7280' }}>{poste.nom}</span>
        </div>
        {/* Corps */}
        <div style={{ background:'#f9fafb', padding:9, display:'flex', flexDirection:'column', gap:6 }}>
          {joueursPoste.map((j, i) => {
            const s = getStatut(j)
            const w = getWellness(j)
            return (
              <div key={j.id} onClick={e => { e.stopPropagation(); openPanelJoueur(j, poste.num) }}
                style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 11px',
                borderRadius:8, background:'#fff', border: `1.5px solid ${statutBorderColor(s)}`, minHeight:38 }}>
                <span style={{ fontSize:'0.72rem', color:'#c4ccd4', fontWeight:700, minWidth:16 }}>
                  {RANK_LABELS[i]}
                </span>
                <span style={{ fontSize:'0.9rem', fontWeight:800, color:'#1f2937', flex:1,
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {j.prenom} {j.nom}
                </span>
                {w !== null && (
                  <span style={{ fontSize:'0.78rem', fontWeight:900, color:wColor(w), minWidth:26, textAlign:'right' }}>
                    {w.toFixed(1)}
                  </span>
                )}
                <span style={{ width:9, height:9, borderRadius:'50%', background:statutBorderColor(s), flexShrink:0 }} />
              </div>
            )
          })}
          {joueursPoste.length === 0 && (
            <div style={{ fontSize:'0.76rem', color:'#c4ccd4', fontStyle:'italic', textAlign:'center', padding:'9px 0' }}>
              Non assigné
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); openPanelPos(poste.num); setAddForm(true) }}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4,
              padding:'7px', borderRadius:6, border:'1px dashed #d1d5db',
              fontSize:'0.72rem', color:'#c4ccd4', cursor:'pointer', background:'transparent', width:'100%',
              marginTop:2, transition:'all 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=groupColor; e.currentTarget.style.color=groupColor }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#d1d5db'; e.currentTarget.style.color='#c4ccd4' }}
          >
            ＋ Ajouter
          </button>
        </div>
      </div>
    )
  }

  const inputStyle = { width:'100%', border:'1.5px solid #e5e7eb', borderRadius:9, padding:'8px 11px', fontSize:'0.8rem', color:'#1f2937', outline:'none', marginBottom:7, fontFamily:'inherit' }

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* Légende */}
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap',
        background:'#fff', borderRadius:8, padding:'7px 12px', fontSize:'0.68rem', marginBottom:10,
        boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        {[['#16a34a','Disponible'],['#f59e0b','Avec conditions'],['#dc2626','Indisponible']].map(([c,l]) => (
          <span key={l} style={{ display:'flex', alignItems:'center', gap:4, color:'#4b5563' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:c, flexShrink:0 }} />
            {l}
          </span>
        ))}
        <span style={{ color:'#c4ccd4', margin:'0 2px' }}>·</span>
        <span style={{ color: '#6b7280', fontSize:'0.66rem' }}>Barre à gauche = statut · chiffre = wellness /4 · ① ② = hiérarchie au poste</span>
      </div>

      {/* Terrain */}
      <div style={{ background:'#fff', borderRadius:12, padding:'14px 10px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
        <div style={{ textAlign:'center', fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em',
          color:'#c4ccd4', textTransform:'uppercase', marginBottom:12 }}>
          ⬆ Direction d'attaque
        </div>

        {FORMATION.map((row, rIdx) => (
          <div key={rIdx} style={{ marginBottom: rIdx < FORMATION.length-1 ? 7 : 0 }}>
            <div style={{ fontSize:'0.58rem', color:'#c4ccd4', fontWeight:700, letterSpacing:'0.08em',
              textTransform:'uppercase', textAlign:'center', marginBottom:4 }}>
              {ROW_LABELS[rIdx]}
            </div>
            <div style={{ display:'flex', justifyContent:'center', gap:8 }}>
              {row.map(num => {
                const poste = POSTES_RUGBY.find(p => p.num === num)
                return <PosteCard key={num} poste={poste} />
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display:'flex', background:'#fff', borderRadius:10, overflow:'hidden',
        boxShadow:'0 1px 4px rgba(0,0,0,0.07)', marginTop:10 }}>
        {[
          [joueurs.length, groupColor, 'Joueurs'],
          [nbOk,   '#16a34a', 'Disponibles'],
          [nbCond, '#f59e0b', 'Conditions'],
          [nbOut,  '#dc2626', 'Indisponibles'],
          [wMoy !== null ? wMoy : '—', '#9ca3af', 'Wellness moy. /4'],
        ].map(([val, color, lbl], i) => (
          <div key={lbl} style={{ flex:1, padding:'9px 6px', textAlign:'center',
            borderRight: i < 4 ? '1px solid #f0f2f5' : 'none' }}>
            <div style={{ fontSize:'1.1rem', fontWeight:900, color }}>{val}</div>
            <div style={{ fontSize:'0.6rem', color: '#6b7280', fontWeight:600, textTransform:'uppercase', marginTop:1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* ─── Panneau liste joueurs au poste ─── */}
      {panelPos && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'3vh 16px' }}
          onClick={e => { if (e.target === e.currentTarget) setPanelPos(null) }}>
          <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:460,
            padding:'18px 18px 22px', maxHeight:'88vh', overflowY:'auto' }}>
            <div style={{ width:32, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 16px' }} />
            <div style={{ fontSize:'0.95rem', fontWeight:900, color:'#1f2937', marginBottom:2 }}>
              Poste {panelPos} — {POSTES_RUGBY.find(p=>p.num===panelPos)?.nom}
            </div>
            <div style={{ fontSize:'0.75rem', color:'#6b7280', marginBottom:16 }}>
              Cliquer sur un joueur pour modifier son statut
            </div>

            {joueursAuPoste(panelPos).map((j, i) => {
              const s = getStatut(j)
              const stBg = { ok:'#f0fdf4', cond:'#fffbeb', out:'#fef2f2' }[s]
              const stLbl = { ok:'Dispo', cond:'Cond.', out:'Blessé' }[s]
              const stBadgeBg = { ok:'#dcfce7', cond:'#fef3c7', out:'#fee2e2' }[s]
              const stBadgeColor = { ok:'#15803d', cond:'#b45309', out:'#b91c1c' }[s]
              return (
                <div role="button" tabIndex={0} key={j.id}
                  onClick={() => openPanelJoueur(j, panelPos)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                    background:stBg, borderRadius:9, marginBottom:5,
                    border: `1.5px solid ${statutBorderColor(s)}`, cursor:'pointer' }}>
                  <span style={{ fontSize:'0.66rem', fontWeight:900, color: '#6b7280', minWidth:14 }}>{RANK_LABELS[i]}</span>
                  <span style={{ fontSize:'0.83rem', fontWeight:800, flex:1 }}>{j.prenom} {j.nom}</span>
                  {j.client_id && getWellness(j) !== null && (
                    <span style={{ fontSize:'0.7rem', fontWeight:900, color:wColor(getWellness(j)) }}>
                      {getWellness(j).toFixed(1)}/4
                    </span>
                  )}
                  <span style={{ fontSize:'0.64rem', padding:'2px 7px', borderRadius:7,
                    fontWeight:700, background:stBadgeBg, color:stBadgeColor }}>{stLbl}</span>
                </div>
              )
            })}

            <button
              onClick={() => setAddForm(f => !f)}
              style={{ width:'100%', padding:'9px', border:'2px dashed #c4ccd4', borderRadius:9,
                background:'transparent', color:'#6b7280', fontSize:'0.78rem', fontWeight:700,
                cursor:'pointer', marginTop:4, fontFamily:'inherit' }}>
              ＋ Ajouter un joueur à ce poste
            </button>

            {addForm && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:'0.65rem', fontWeight:800, letterSpacing:'0.08em', color: '#6b7280', textTransform:'uppercase', marginBottom:7 }}>Nouveau joueur</div>
                <input style={inputStyle} placeholder="Prénom" aria-label="Prénom" value={newPrenom} onChange={e=>setNewPrenom(e.target.value)} />
                <input style={inputStyle} placeholder="Nom de famille" aria-label="Nom de famille" value={newNom} onChange={e=>setNewNom(e.target.value)} />
                <input style={{...inputStyle}} type="number" placeholder="Rang (1 = titulaire)" aria-label="Rang (1 = titulaire)" value={newRang} min={1} onChange={e=>setNewRang(Number(e.target.value))} />
                <p style={{ fontSize:'0.68rem', color: '#6b7280', marginBottom:10 }}>
                  Si ce joueur crée un compte avec ce nom exact, il sera automatiquement lié.
                </p>
                <button onClick={addJoueur} disabled={saving}
                  style={{ width:'100%', padding:'11px', background:groupColor, color: isLight(groupColor)?'#1a1a1a':'#fff',
                    border:'none', borderRadius:11, fontSize:'0.86rem', fontWeight:900, cursor:'pointer', fontFamily:'inherit' }}>
                  {saving ? '...' : '➕ Ajouter le joueur'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Panneau édition joueur ─── */}
      {panelJoueur && (() => {
        const age = effectiveAge(panelJoueur)
        const taille = effectiveTaille(panelJoueur)
        const poidsInfo = effectivePoids(panelJoueur)
        const wInfo = getWellnessInfo(panelJoueur)
        const initiales = `${(panelJoueur.prenom||'')[0]||''}${(panelJoueur.nom||'')[0]||''}`.toUpperCase()
        const EVT_COLOR = { entrainement:'#dc2626', muscu:'#6366f1', match:'#2563eb', collectif:'#98a2ad' }
        const EVT_LABEL = { entrainement:'Entraînement', muscu:'Musculation', match:'Match', collectif:'Collectif' }

        function VitalTile({ champ, label, valeur, unite, sub }) {
          const editing = editingVital === champ
          return (
            <div role="button" tabIndex={0} style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px', cursor: editing ? 'default' : 'pointer' }}
              onClick={() => { if (!editing) { setEditingVital(champ); setVitalDraft(valeur ?? '') } }}>
              <div style={{ fontSize:'0.6rem', fontWeight:800, letterSpacing:'0.05em', color: '#6b7280', textTransform:'uppercase', marginBottom:5 }}>{label}</div>
              {editing ? (
                <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                  <input autoFocus type="number" value={vitalDraft} onChange={e=>setVitalDraft(e.target.value)}
                    style={{ width:0, flex:1, minWidth:0, border:'1.5px solid #1f2937', borderRadius:6, padding:'3px 5px', fontSize:'0.85rem', fontFamily:'inherit', outline:'none' }} />
                  <button onClick={() => saveVitalManuel(panelJoueur, champ, vitalDraft)}
                    style={{ background:'#1f2937', color:'#fff', border:'none', borderRadius:6, padding:'0 8px', fontSize:'0.7rem', fontWeight:800, cursor:'pointer' }}>OK</button>
                </div>
              ) : valeur != null ? (
                <>
                  <div style={{ fontSize:'1.05rem', fontWeight:900, color:'#1a1a1a' }}>{valeur}<span style={{ fontSize:'0.65rem', fontWeight:700, color: '#6b7280', marginLeft:2 }}>{unite}</span></div>
                  {sub && <div style={{ fontSize:'0.62rem', color: '#6b7280', marginTop:2, fontWeight:600 }}>{sub}</div>}
                </>
              ) : (
                <div style={{ fontSize:'0.85rem', color: '#6b7280', fontWeight:700 }}>—</div>
              )}
            </div>
          )
        }

        return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'3vh 16px' }}
          onClick={e => { if (e.target === e.currentTarget) setPanelJoueur(null) }}>
          <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:520,
            maxHeight:'94vh', overflowY:'auto', boxShadow:'0 24px 70px rgba(0,0,0,.35)' }}>

            {/* En-tête */}
            <div style={{ background:'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding:'18px 20px', display:'flex', alignItems:'center', gap:13 }}>
              <div style={{ width:46, height:46, borderRadius:11, background:'rgba(228,248,22,.15)', border:'1.5px solid rgba(228,248,22,.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#e4f816', fontWeight:900, fontSize:'.95rem', flexShrink:0 }}>{initiales}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ color:'#fff', fontSize:'1.05rem', fontWeight:900, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{panelJoueur.prenom} {panelJoueur.nom}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, flexWrap:'wrap' }}>
                  {panelJoueur._poste != null && (
                    <span style={{ fontSize:'.65rem', fontWeight:800, padding:'2px 8px', borderRadius:99, background:'rgba(255,255,255,.14)', color:'#fff' }}>
                      {panelJoueur._poste} · {POSTES_RUGBY.find(p=>p.num===panelJoueur._poste)?.nom}
                    </span>
                  )}
                  {panelJoueur.client_id && (
                    <button
                      onClick={() => navigate(`/client/${panelJoueur.client_id}`)}
                      title="Ouvrir la fiche client complète"
                      style={{ fontSize:'.65rem', fontWeight:800, padding:'2px 8px', borderRadius:99, background:'rgba(74,222,128,.18)', color:'#86efac', display:'flex', alignItems:'center', gap:4, border:'none', cursor:'pointer', font:'inherit' }}
                    >
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ade80' }} />Compte lié · Voir la fiche →
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => setPanelJoueur(null)} style={{ background:'rgba(255,255,255,.12)', border:'none', color:'#fff', width:32, height:32, borderRadius:9, fontSize:'1.1rem', cursor:'pointer', flexShrink:0 }}>×</button>
            </div>

            <div style={{ padding:'16px 18px 18px' }}>
              {(() => {
                const secLbl = { fontSize:'0.6rem', fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:'#9aa1ac', margin:'0 0 8px' }
                const bl = panelJoueur.blessure
                const statutInfo = bl?.statut === 'out'
                  ? { l:'Indisponible', bg:'#fbe9e9', c:'#b91c1c', bd:'#dc2626' }
                  : bl?.statut === 'cond'
                  ? { l:'Aménagé', bg:'#fdf0dc', c:'#b45309', bd:'#d97706' }
                  : { l:'Disponible', bg:'#e7f6ec', c:'#15803d', bd:'#16a34a' }
                return (
                <>
              {/* ── Mesures ── */}
              <div style={{ marginBottom:16 }}>
              <p style={secLbl}>Mesures</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
                <VitalTile champ="age" label="Âge" valeur={age} unite="ans" />
                <VitalTile champ="taille" label="Taille" valeur={taille} unite="cm" />
                <VitalTile champ="poids" label="Poids" valeur={poidsInfo?.valeur ?? null} unite="kg"
                  sub={poidsInfo ? (
                    poidsInfo.source === 'wellness' ? `via wellness · ${new Date(poidsInfo.date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}`
                    : poidsInfo.source === 'profil nutritionnel' ? 'via profil nutritionnel'
                    : 'saisie manuelle'
                  ) : null} />
                <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:12, padding:'10px 12px' }}>
                  <div style={{ fontSize:'0.6rem', fontWeight:800, letterSpacing:'0.05em', color: '#6b7280', textTransform:'uppercase', marginBottom:5 }}>Dernier wellness</div>
                  {wInfo?.score != null ? (
                    <>
                      <div style={{ fontSize:'1.05rem', fontWeight:900, color:'#16a34a' }}>{wInfo.score.toFixed(1)}<span style={{ fontSize:'0.65rem', fontWeight:700, color: '#6b7280', marginLeft:2 }}>/4</span></div>
                      <div style={{ fontSize:'0.62rem', color: '#6b7280', marginTop:2, fontWeight:600 }}>{new Date(wInfo.date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>
                    </>
                  ) : <div style={{ fontSize:'0.85rem', color: '#6b7280', fontWeight:700 }}>—</div>}
                </div>
              </div>
              </div>

              {/* ── Disponibilité (lecture seule — se modifie dans Suivi blessures) ── */}
              <div style={{ marginBottom:16 }}>
                <p style={secLbl}>Disponibilité</p>
                <div style={{ border:'1px solid #e6e8ec', borderRadius:12, padding:'12px 14px', background:'#fbfbfc' }}>
                  <span style={{ display:'inline-block', fontSize:'0.72rem', fontWeight:800, padding:'3px 10px', borderRadius:99, background:statutInfo.bg, color:statutInfo.c, border:`1.5px solid ${statutInfo.bd}44` }}>{statutInfo.l}</span>
                  {bl && bl.statut !== 'ok' ? (
                    <div style={{ marginTop:8, fontSize:'0.8rem', color:'#374151', lineHeight:1.5 }}>
                      {(bl.zone_precise || bl.description) && <div style={{ fontWeight:700, color:'#1a1a1a' }}>{bl.zone_precise || bl.description}</div>}
                      {bl.zone_precise && bl.description && bl.description !== bl.zone_precise && <div style={{ color:'#6b7280' }}>{bl.description}</div>}
                      {(formatRetour(bl.date_retour_prevue) || bl.duree_estimee) && (
                        <div style={{ marginTop:2, fontSize:'0.72rem', color:'#b45309', fontWeight:700 }}>{formatRetour(bl.date_retour_prevue) || bl.duree_estimee}</div>
                      )}
                      {(bl.restrictions || []).length > 0 && (
                        <div style={{ marginTop:4, fontSize:'0.72rem', color:'#6b7280' }}>Restrictions : {bl.restrictions.join(', ')}</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop:8, fontSize:'0.76rem', color:'#9aa1ac' }}>Aucune blessure ni restriction en cours.</div>
                  )}
                  <p style={{ margin:'10px 0 0', fontSize:'0.7rem', color:'#9aa1ac' }}>
                    Statut, blessure et protocole de reprise se gèrent dans l'onglet <strong style={{ color:'#6b7280' }}>Suivi blessures</strong> du groupe.
                  </p>
                </div>
              </div>

              {/* ── Poste (modifiable) ── */}
              <div style={{ marginBottom:16 }}>
                <p style={secLbl}>Poste</p>
                <div style={{ display:'flex', gap:8 }}>
                  <div style={{ flex:'0 0 84px' }}>
                    <label style={{ display:'block', fontSize:'0.62rem', fontWeight:700, color:'#6b7280', marginBottom:3 }}>Rang</label>
                    <input style={{ ...inputStyle, marginBottom:0 }} type="number" min={1} value={editRang} onChange={e=>setEditRang(Number(e.target.value))} />
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ display:'block', fontSize:'0.62rem', fontWeight:700, color:'#6b7280', marginBottom:3 }}>Postes secondaires</label>
                    <input style={{ ...inputStyle, marginBottom:0 }} placeholder="ex : 1, 3" aria-label="ex : 1, 3" value={editSecondaires} onChange={e=>setEditSecondaires(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* ── Tests physiques (lecture seule — saisie dans l'onglet Tests physiques) ── */}
              <div style={{ marginBottom:16 }}>
                <p style={secLbl}>Tests physiques</p>
                {['vmi','vma','30m','50m'].some(t => dernierTest(panelJoueur, t)) ? (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                    {[['vmi','VMI','km/h'], ['vma','VMA','km/h'], ['30m','30m','s'], ['50m','50m','s']].map(([type,label,unite]) => {
                      const dernier = dernierTest(panelJoueur, type)
                      return (
                        <div key={type} style={{ background:'#f7f8fa', border:'1px solid #e6e8ec', borderRadius:10, padding:'8px 6px', textAlign:'center' }}>
                          <div style={{ fontSize:'0.56rem', fontWeight:800, color:'#6b7280', textTransform:'uppercase' }}>{label}</div>
                          {dernier ? (
                            <>
                              <div style={{ fontSize:'0.9rem', fontWeight:800, color:'#1a1a1a', marginTop:2 }}>{dernier.valeur}<span style={{ fontSize:'0.55rem', fontWeight:700, color: '#6b7280' }}>{unite}</span></div>
                              <div style={{ fontSize:'0.54rem', color: '#6b7280', marginTop:2 }}>{new Date(dernier.date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>
                            </>
                          ) : <div style={{ fontSize:'0.85rem', color: '#6b7280', fontWeight:700, marginTop:2 }}>—</div>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize:'0.76rem', color:'#9aa1ac', margin:0 }}>Aucun résultat. Ajoute-les dans l'onglet <strong style={{ color:'#6b7280' }}>Tests physiques</strong> du groupe.</p>
                )}
              </div>

              {/* ── Derniers événements du groupe (rappel) ── */}
              <div>
                <p style={secLbl}>Derniers événements du groupe</p>
                {recentEvents.length ? (
                  <div style={{ border:'1px solid #e6e8ec', borderRadius:10, overflow:'hidden' }}>
                    {recentEvents.map(ev => (
                      <div key={ev.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 11px', borderTop:'1px solid #f1f2f4', background:'#fff' }}>
                        <span style={{ width:7, height:7, borderRadius:'50%', background:EVT_COLOR[ev.type]||'#9ca3af', flexShrink:0 }} />
                        <span style={{ fontSize:'0.72rem', fontWeight:700, color:'#1a1a1a', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {ev.type === 'match' ? `Match${ev.adversaire ? ' · ' + ev.adversaire : ''}` : (ev.titre || EVT_LABEL[ev.type] || ev.type)}
                        </span>
                        <span style={{ fontSize:'0.64rem', color: '#6b7280', fontWeight:600, flexShrink:0 }}>
                          {new Date(ev.date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ fontSize:'0.72rem', color:'#c4ccd4', fontStyle:'italic', margin:0 }}>Aucun événement récent.</p>}
              </div>
                </>
                )
              })()}
            </div>

            <div style={{ display:'flex', gap:8, padding:'12px 18px', borderTop:'1px solid #e6e8ec', background:'#fafbfc' }}>
              <button onClick={retirerDuGroupe} disabled={saving}
                style={{ background:'none', border:'1px solid #fbe9e9', color:'#dc2626', borderRadius:10, padding:'10px 14px', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                Retirer du groupe
              </button>
              <button onClick={saveJoueur} disabled={saving}
                style={{ flex:1, padding:'10px', background:groupColor,
                  color: isLight(groupColor)?'#1a1a1a':'#fff',
                  border:'none', borderRadius:10, fontSize:'0.85rem', fontWeight:800,
                  cursor:'pointer', fontFamily:'inherit' }}>
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
