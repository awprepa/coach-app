import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import { isoLocal } from '../../utils/dates'
import EnTeteClient from '../../components/EnTeteClient'
import useEtatMemorise from '../../hooks/useEtatMemorise'
import { useAuRetourOnglet } from '../../context/OngletContext'

export default function CompetitionClient() {
  const [loading, setLoading]       = useEtatMemorise('competition.loading', true)
  const [groupes, setGroupes]       = useEtatMemorise('competition.groupes', [])   // groupes avec FFR
  const [activeGroupe, setActive]   = useEtatMemorise('competition.activeGroupe', null)
  const [matchs, setMatchs]         = useEtatMemorise('competition.matchs', [])
  const [classement, setClassement] = useEtatMemorise('competition.classement', [])
  const [compIdx, setCompIdx]       = useEtatMemorise('competition.compIdx', 0)    // championnat affiché (ex. Fédérale 2 / Fédérale B)
  // Client en préparation physique sans groupe : il suit son équipe avec son propre lien
  const [perso, setPerso]           = useEtatMemorise('competition.perso', null) // { clientId, url } | null
  const [lien, setLien]             = useState('')
  const [edition, setEdition]       = useState(false)
  const [synchro, setSynchro]       = useState(false)
  const [erreurLien, setErreurLien] = useState(null)
  const [enregistrement, setEnregistrement] = useState(false)
  const [ongletMatchs, setOngletMatchs] = useState(null) // 'avenir' | 'resultats' ; null = selon les données
  // Une seule mise à jour à la fois : deux en parallèle inséraient le classement en double
  const synchroEnCours = useRef(null)

  useEffect(() => { load() }, [])
  useAuRetourOnglet(load)

  async function load() {
    try {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return

      const { data: client } = await supabase
        .from('clients').select('id, offre, monclubhouse_url').eq('user_id', userId).maybeSingle()
      if (!client) return

      // Groupes du client qui ont un lien FFR
      const { data: membres } = await supabase
        .from('groupe_membres').select('groupe_id').eq('client_id', client.id)
      const groupeIds = (membres || []).map(m => m.groupe_id)
      const { data: gs } = groupeIds.length
        ? await supabase
          .from('groupes').select('id, nom, couleur, monclubhouse_url, monclubhouse_competition')
          .in('id', groupeIds).not('monclubhouse_url', 'is', null)
        : { data: [] }
      setGroupes(gs || [])

      if (gs?.length) {
        setActive(gs[0])
        await loadFFR(gs[0].id)
      } else if (client.offre === 'preparation_physique') {
        setPerso({ clientId: client.id, url: client.monclubhouse_url || null })
        setLien(client.monclubhouse_url || '')
        if (client.monclubhouse_url) {
          const ffr = await loadFFR(client.id, 'client_id')
          // Données de plus de 6 h (ou aucune) : on relance la mise à jour en fond
          const derniere = ffr.classement[0]?.synced_at || ffr.matchs[0]?.synced_at
          if (!derniere || Date.now() - new Date(derniere).getTime() > 6 * 3600 * 1000) {
            synchroniser(client.id)
          }
        }
      }
    } catch (e) {
      console.error('CompetitionClient:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadFFR(id, colonne = 'groupe_id') {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('matchs_ffr').select('*').eq(colonne, id).order('date_match'),
      supabase.from('classements_ffr').select('*').eq(colonne, id).order('position'),
    ])
    // Filet de sécurité : une même équipe n'apparaît qu'une fois par championnat
    const vus = new Set()
    const cl = (c || []).filter(r => {
      const cle = `${r.competition || ''}|${r.equipe}`
      if (vus.has(cle)) return false
      vus.add(cle); return true
    })
    setMatchs(m || [])
    setClassement(cl)
    return { matchs: m || [], classement: cl }
  }

  // Récupère matchs et classement depuis Mon Clubhouse pour le lien du client
  function synchroniser(clientId) {
    if (!synchroEnCours.current) {
      synchroEnCours.current = lancerSynchro(clientId).finally(() => { synchroEnCours.current = null })
    }
    return synchroEnCours.current
  }

  async function lancerSynchro(clientId) {
    setSynchro(true)
    try {
      const { data } = await supabase.functions.invoke('sync-ffr', { body: { client_id: clientId } })
      const ffr = await loadFFR(clientId, 'client_id')
      return data?.ok && (ffr.matchs.length > 0 || ffr.classement.length > 0)
    } catch (e) {
      console.warn('[CompetitionClient] mise à jour impossible :', e?.message)
      return false
    } finally {
      setSynchro(false)
    }
  }

  async function enregistrerLien() {
    const url = lien.trim()
    if (!/^https:\/\/monclubhouse\.ffr\.fr\/clubs\/[^/]+/.test(url)) {
      setErreurLien('Ce lien ne vient pas de Mon Clubhouse. Il doit commencer par https://monclubhouse.ffr.fr/clubs/')
      return
    }
    if (enregistrement) return
    setErreurLien(null)
    setEnregistrement(true)
    const { error } = await supabase.from('clients').update({ monclubhouse_url: url }).eq('id', perso.clientId)
    if (error) { setEnregistrement(false); setErreurLien('Le lien n\u2019a pas été enregistré. Réessaie.'); return }
    setPerso(p => ({ ...p, url }))
    setEdition(false)
    setCompIdx(0)
    // Une mise à jour lancée à l'ouverture de la page porte sur l'ancien lien : on attend sa fin
    if (synchroEnCours.current) await synchroEnCours.current
    const ok = await synchroniser(perso.clientId)
    setEnregistrement(false)
    if (!ok) setErreurLien('Aucun match ni classement trouvé avec ce lien. Copie l\u2019adresse de la page de ton équipe (Compétitions, puis ton championnat).')
  }

  // Retire le lien : plus de matchs ni de classement affichés
  async function retirerLien() {
    const { error } = await supabase.from('clients').update({ monclubhouse_url: null }).eq('id', perso.clientId)
    if (error) { setErreurLien('Le lien n\u2019a pas été retiré. Réessaie.'); return }
    setPerso(p => ({ ...p, url: null }))
    setLien('')
    setMatchs([])
    setClassement([])
    setEdition(false)
    setErreurLien(null)
  }

  const today = isoLocal()
  const prochains = matchs.filter(m => m.date_match >= today)
  const resultats = matchs.filter(m => m.date_match < today).reverse()
  const prochain  = prochains[0]
  const onglet    = ongletMatchs || (prochains.length ? 'avenir' : 'resultats')

  // Un groupe peut suivre plusieurs championnats (ex. Fédérale 2 + Fédérale B) :
  // un classement par championnat, le principal en premier.
  const competitions = [...new Set(classement.map(c => c.competition || null))]
    .sort((a, b) => (b === (activeGroupe?.monclubhouse_competition || null)) - (a === (activeGroupe?.monclubhouse_competition || null)))
    .map(tag => {
      const rows = classement.filter(c => (c.competition || null) === tag)
      return { tag, rows, label: rows[0]?.competition_label || tag || 'Classement' }
    })
  const compActive = competitions[Math.min(compIdx, competitions.length - 1)]
  const classementAff = compActive?.rows || []

  // Notre équipe dans le classement
  const ourNames = matchs
    .map(m => m.est_domicile === true ? m.equipe_dom : m.est_domicile === false ? m.equipe_ext : null)
    .filter(Boolean)
  const ourTeam = ourNames.length > 0
    ? ourNames.reduce((b, n) => ourNames.filter(v => v === n).length >= ourNames.filter(v => v === b).length ? n : b)
    : null
  const notreEquipe = ourTeam ? classementAff.find(c => c.equipe.toLowerCase() === ourTeam.toLowerCase()) : null

  function ScoreOrHour({ m }) {
    if (m.score_dom != null) {
      const s = m.est_domicile ? `${m.score_dom} - ${m.score_ext}` : m.est_domicile === false ? `${m.score_ext} - ${m.score_dom}` : `${m.score_dom} - ${m.score_ext}`
      const win = m.est_domicile ? m.score_dom > m.score_ext : m.est_domicile === false ? m.score_ext > m.score_dom : null
      const lose = m.est_domicile ? m.score_dom < m.score_ext : m.est_domicile === false ? m.score_ext < m.score_dom : null
      const col = win ? '#16a34a' : lose ? '#dc2626' : '#64748b'
      return <span style={{ fontWeight: 900, fontSize: '1.1rem', color: col }}>{s}</span>
    }
    return m.heure ? <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{m.heure}</span> : null
  }

  // Notre équipe / l'adversaire d'un match. Notre logo = celui du groupe dans l'appli
  // (pas celui scrapé sur monclubhouse) : évite le logo adverse dupliqué quand le domicile est inconnu.
  function camps(m) {
    const dom = m.est_domicile
    return {
      notreNom:  dom === true ? m.equipe_dom : dom === false ? m.equipe_ext : (m.equipe_dom || m.equipe_ext),
      advNom:    dom === true ? m.equipe_ext : dom === false ? m.equipe_dom : (m.equipe_ext || m.equipe_dom),
      notreLogo: activeGroupe?.logo_url || (dom === true ? m.logo_dom : dom === false ? m.logo_ext : (m.logo_dom || m.logo_ext)),
      advLogo:   dom === true ? m.logo_ext : dom === false ? m.logo_dom : (m.logo_ext || m.logo_dom),
    }
  }

  // Score avec notre équipe en premier, et V / N / D
  function issue(m) {
    if (m.score_dom == null) return null
    const nous = m.est_domicile === false ? m.score_ext : m.score_dom
    const eux  = m.est_domicile === false ? m.score_dom : m.score_ext
    return { score: `${nous} – ${eux}`, res: m.est_domicile == null ? 'N' : nous > eux ? 'V' : nous < eux ? 'D' : 'N' }
  }

  function rang(nom) {
    const c = nom && classementAff.find(r => r.equipe.toLowerCase() === nom.toLowerCase())
    return c ? (Number(c.position) === 1 ? '1er' : `${c.position}e`) : null
  }

  function jourMois(iso) {
    const [y, mo, d] = iso.split('-')
    const dt = new Date(+y, +mo - 1, +d)
    return { jour: dt.getDate(), mois: dt.toLocaleDateString('fr-FR', { month: 'short' }), court: dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) }
  }

  function compteARebours(iso) {
    const [y, mo, d] = iso.split('-')
    const [ty, tm, td] = today.split('-')
    const n = Math.round((new Date(+y, +mo - 1, +d) - new Date(+ty, +tm - 1, +td)) / 86400000)
    return n <= 0 ? 'Aujourd’hui' : n === 1 ? 'Demain' : `Dans ${n} jours`
  }

  function EnTeteMatch({ m }) {
    const { notreNom, advNom, notreLogo, advLogo } = camps(m)
    const domicile = m.est_domicile !== false
    const gauche = domicile ? { nom: notreNom, logo: notreLogo, nous: true } : { nom: advNom, logo: advLogo }
    const droite = domicile ? { nom: advNom, logo: advLogo } : { nom: notreNom, logo: notreLogo, nous: true }
    const rangG = rang(gauche.nom), rangD = rang(droite.nom)
    const forme = resultats.map(issue).filter(Boolean).slice(0, 5).reverse()
    const d = jourMois(m.date_match)
    return (
      <div style={S.tete}>
        <p style={S.teteLabel}>
          <span>Prochain match{m.journee ? ` · J${m.journee}` : ''}</span>
          <span style={{ color: 'var(--accent)', letterSpacing: '.04em' }}>{compteARebours(m.date_match)}</span>
        </p>
        <div style={S.face}>
          {[gauche, null, droite].map((e, i) => e ? (
            <div key={i} style={S.equipe}>
              <Logo url={e.logo} nom={e.nom} taille={64} style={{ ...S.blason, ...(e.nous ? S.blasonNous : null) }} />
              <span style={S.equipeNom}>{e.nom}</span>
            </div>
          ) : (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={S.teteHeure}>{m.heure || 'VS'}</div>
              <div style={S.teteDate}>{d.court}</div>
            </div>
          ))}
        </div>
        <div style={S.puces}>
          {m.est_domicile != null && <span style={{ ...S.puce, background: 'var(--accent)', color: '#1a1a1a' }}>{m.est_domicile ? 'Domicile' : 'Extérieur'}</span>}
          {rangG && rangD && <span style={S.puce}>{rangG} contre {rangD}</span>}
        </div>
        {forme.length > 0 && (
          <div style={S.forme}>
            <p style={S.formeTexte}>Forme · {forme.length > 1 ? `${forme.length} derniers matchs` : 'dernier match'}</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {forme.map((f, i) => <span key={i} style={{ ...S.pastille, background: COULEUR_RES[f.res] }}>{f.res}</span>)}
            </div>
          </div>
        )}
      </div>
    )
  }

  function LigneMatch({ m }) {
    const { advNom, advLogo } = camps(m)
    const r = issue(m)
    const d = jourMois(m.date_match)
    return (
      <div style={S.ligneMatch}>
        <div style={S.caseJour}><b style={S.caseJourNum}>{d.jour}</b><small style={S.caseJourMois}>{d.mois}</small></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={S.advNom}><Logo url={advLogo} nom={advNom} taille={24} style={S.mini} /><span style={S.ellipse}>{advNom}</span></p>
          <small style={S.advInfo}>{[m.journee && `J${m.journee}`, m.est_domicile != null && (m.est_domicile ? 'Domicile' : 'Extérieur')].filter(Boolean).join(' · ')}</small>
        </div>
        {r ? (
          <span style={S.score}>{r.score}<span style={{ ...S.res, background: COULEUR_RES[r.res] }}>{r.res}</span></span>
        ) : m.heure ? <span style={S.heure}>{m.heure}</span> : null}
      </div>
    )
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f5f6f8' }}>
      <EnTeteClient titre="Compétition" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    </div>
  )


  return (
    <div style={{ minHeight: '100vh', background: '#f5f6f8', paddingBottom: 100, fontFamily: 'inherit' }}>
      {/* Header */}
      <EnTeteClient titre="Compétition" sousTitre={groupes.length > 1 ? null : (activeGroupe?.nom || (perso && ourTeam) || 'Mon équipe')}>
        {groupes.length > 1 && (
        <div style={{ padding: '0 16px 12px' }}>
          <select value={activeGroupe?.id || ''} onChange={async e => {
            const g = groupes.find(x => x.id === e.target.value)
            setActive(g); setMatchs([]); setClassement([]); setCompIdx(0)
            await loadFFR(g.id)
          }} style={{ fontWeight: 800, fontSize: '1rem', background: 'transparent', color: '#fff', border: 'none', outline: 'none', padding: 0, cursor: 'pointer' }}>
            {groupes.map(g => <option key={g.id} value={g.id} style={{ color: '#000' }}>{g.nom}</option>)}
          </select>
        </div>
        )}
      </EnTeteClient>

      {/* Prochain match : dans le prolongement de l'en-tête foncé */}
      {prochain && !(perso && (!perso.url || edition)) && <EnTeteMatch m={prochain} />}

      <div style={{ padding: '16px 16px 0' }}>
        {perso && (!perso.url || edition) ? (
          <div style={S.carteLien}>
            <p style={S.lienTitre}>Suis le classement de ton équipe</p>
            <p style={S.lienTexte}>
              Sur monclubhouse.ffr.fr, ouvre la page de ton club, puis Compétitions et le championnat de ton équipe. Copie l'adresse de la page et colle-la ici : matchs et classement se mettront à jour tout seuls.
            </p>
            <input value={lien} onChange={e => { setLien(e.target.value); setErreurLien(null) }} inputMode="url" autoCapitalize="none" autoCorrect="off"
              placeholder="https://monclubhouse.ffr.fr/clubs/…" style={S.lienInput} />
            {erreurLien && <p role="alert" style={S.lienErreur}>{erreurLien}</p>}
            <button onClick={enregistrerLien} disabled={!lien.trim() || synchro || enregistrement} style={{ ...S.lienBtn, opacity: !lien.trim() || synchro || enregistrement ? 0.5 : 1 }}>
              {synchro || enregistrement ? 'Récupération du classement…' : 'Enregistrer le lien'}
            </button>
            {edition && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button onClick={() => { setEdition(false); setLien(perso.url || ''); setErreurLien(null) }} style={S.lienAnnuler}>Annuler</button>
                {perso.url && <button onClick={retirerLien} style={{ ...S.lienAnnuler, color: '#dc2626' }}>Retirer le lien</button>}
              </div>
            )}
          </div>
        ) : perso && synchro && matchs.length === 0 && classement.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <p style={{ fontWeight: 700, color: '#374151' }}>Récupération du classement…</p>
          </div>
        ) : perso && matchs.length === 0 && classement.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <p style={{ fontWeight: 700, color: '#374151' }}>Aucun match trouvé</p>
            <p style={{ fontSize: '.85rem' }}>{erreurLien || 'Vérifie que le lien mène bien à la page du championnat de ton équipe.'}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              <button onClick={() => setEdition(true)} style={S.lienAnnuler}>Changer le lien</button>
              <button onClick={retirerLien} style={{ ...S.lienAnnuler, color: '#dc2626' }}>Retirer le lien</button>
            </div>
          </div>
        ) : groupes.length === 0 && !perso ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <p style={{ fontWeight: 700, color: '#374151', fontSize: '1rem' }}>Aucune compétition disponible</p>
            <p style={{ fontSize: '.85rem' }}>Ton coach n'a pas encore configuré de lien de compétition.</p>
          </div>
        ) : matchs.length === 0 && classement.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <p style={{ fontWeight: 700, color: '#374151' }}>Pas encore de données</p>
            <p style={{ fontSize: '.85rem' }}>Le coach doit synchroniser les données depuis l'onglet Compétition.</p>
          </div>
        ) : (
          <>
            {/* Classement */}
            {classement.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <div style={S.sec}><h2 style={S.secTitre}>Classement</h2>{competitions.length === 1 && compActive?.tag && <span style={S.secInfo}>{compActive.label}</span>}</div>
                {competitions.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, overflowX: 'auto' }}>
                    {competitions.map((cp, i) => {
                      const on = cp === compActive
                      return (
                        <button key={cp.tag || i} onClick={() => setCompIdx(i)}
                          style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
                            border: `1.5px solid ${on ? '#333333' : '#e5e7eb'}`, background: on ? '#333333' : '#fff', color: on ? 'var(--accent)' : '#6b7280' }}>
                          {cp.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={S.carte}>
                  {notreEquipe && (
                    <div style={S.resume}>
                      <div style={S.resumeCase}><b style={S.resumeVal}>{Number(notreEquipe.position) === 1 ? '1er' : `${notreEquipe.position}e`}</b><small style={S.resumeLabel}>Position</small></div>
                      <div style={S.resumeCase}><b style={S.resumeVal}>{notreEquipe.pts}</b><small style={S.resumeLabel}>Points</small></div>
                      <div style={S.resumeCase}><b style={{ ...S.resumeVal, color: Number(notreEquipe.diff) > 0 ? '#16a34a' : Number(notreEquipe.diff) < 0 ? '#dc2626' : '#1a1a1a' }}>{Number(notreEquipe.diff) > 0 ? '+' : ''}{notreEquipe.diff}</b><small style={S.resumeLabel}>Différence</small></div>
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          {['#', 'Équipe', 'J', 'G', 'N', 'P', '+/-', 'Pts'].map((h, i, t) => (
                            <th key={h} style={{ ...S.th, textAlign: h === 'Équipe' ? 'left' : 'center', paddingLeft: i === 0 ? 12 : 4, paddingRight: i === t.length - 1 ? 12 : 4 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {classementAff.map(c => {
                          const isOurs = notreEquipe?.equipe === c.equipe
                          const fond = isOurs ? { background: '#fafae6', color: '#1a1a1a' } : null
                          const diff = Number(c.diff)
                          return (
                            <tr key={c.equipe}>
                              <td style={{ ...S.td, ...fond, width: 28, paddingLeft: 12, fontWeight: 800, color: '#374151', boxShadow: isOurs ? 'inset 3px 0 0 #333333' : 'none' }}>{c.position}</td>
                              <td style={{ ...S.td, ...fond, textAlign: 'left', fontWeight: isOurs ? 800 : 600, color: '#1a1a1a', maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <Logo url={(isOurs && activeGroupe?.logo_url) || c.logo} nom={c.equipe} taille={24} style={{ ...S.mini, marginRight: 8, verticalAlign: 'middle' }} />{c.equipe}
                              </td>
                              <td style={{ ...S.td, ...fond }}>{c.joues}</td>
                              <td style={{ ...S.td, ...fond }}>{c.gagnes}</td>
                              <td style={{ ...S.td, ...fond }}>{c.nuls}</td>
                              <td style={{ ...S.td, ...fond }}>{c.perdus}</td>
                              <td style={{ ...S.td, ...fond, fontWeight: 700, color: diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#6b7280' }}>{diff > 0 ? '+' : ''}{c.diff}</td>
                              <td style={{ ...S.td, ...fond, paddingRight: 12, fontWeight: 900, color: '#1a1a1a' }}>{c.pts}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* Matchs : à venir / résultats */}
            {matchs.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <div style={S.sec}><h2 style={S.secTitre}>Matchs</h2></div>
                <div style={S.seg}>
                  {[['avenir', 'À venir'], ['resultats', 'Résultats']].map(([cle, label]) => (
                    <button key={cle} onClick={() => setOngletMatchs(cle)} style={{ ...S.segBtn, ...(onglet === cle ? S.segOn : null) }}>{label}</button>
                  ))}
                </div>
                <div style={S.carte}>
                  {(onglet === 'avenir' ? prochains : resultats).map((m, i) => (
                    <div key={m.id} style={{ borderTop: i ? '1px solid #f3f4f6' : 'none' }}><LigneMatch m={m} /></div>
                  ))}
                  {(onglet === 'avenir' ? prochains : resultats).length === 0 && (
                    <p style={S.vide}>{onglet === 'avenir' ? 'Aucun match à venir.' : 'Aucun résultat pour l’instant.'}</p>
                  )}
                </div>
              </section>
            )}

            {perso && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
                <button onClick={() => setEdition(true)} style={S.lienAnnuler}>Changer le lien</button>
                <button onClick={retirerLien} style={{ ...S.lienAnnuler, color: '#dc2626' }}>Retirer le lien</button>
              </div>
            )}
          </>
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const COULEUR_RES = { V: '#16a34a', D: '#dc2626', N: '#6b7280' }

// Logo d'équipe, initiales si pas d'image ou si elle ne charge pas
function Logo({ url, nom, taille, style }) {
  const [erreur, setErreur] = useState(false)
  const init = (nom || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span style={{ width: taille, height: taille, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, ...style }}>
      {url && !erreur
        ? <img loading="lazy" src={url} alt="" onError={() => setErreur(true)} style={{ width: taille - 8, height: taille - 8, objectFit: 'contain' }} />
        : init}
    </span>
  )
}

const S = {
  tete:        { background: 'var(--header-bg)', color: '#fff', padding: '4px 16px 20px', marginTop: -1 },
  teteLabel:   { margin: '0 0 12px', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.6)' },
  face:        { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 },
  equipe:      { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 0 },
  blason:      { borderRadius: 16, background: 'rgba(255,255,255,.1)', border: '1.5px solid rgba(255,255,255,.18)', fontWeight: 900, fontSize: 18, boxSizing: 'border-box' },
  blasonNous:  { border: '1.5px solid var(--accent)', color: 'var(--accent)' },
  equipeNom:   { fontSize: 13, fontWeight: 700, textAlign: 'center', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  teteHeure:   { fontSize: 24, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
  teteDate:    { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.7)', marginTop: 4, whiteSpace: 'nowrap' },
  puces:       { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  puce:        { borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,.1)', color: '#fff' },
  forme:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.1)' },
  formeTexte:  { margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.6)' },
  pastille:    { width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#fff' },
  sec:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 4px 8px' },
  secTitre:    { margin: 0, fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.08em' },
  secInfo:     { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  carte:       { background: '#fff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)', overflow: 'hidden' },
  resume:      { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid #f3f4f6' },
  resumeCase:  { padding: '12px 8px', textAlign: 'center' },
  resumeVal:   { display: 'block', fontSize: 22, fontWeight: 900, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 },
  resumeLabel: { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  table:       { width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' },
  th:          { fontSize: 12, fontWeight: 700, color: '#9ca3af', padding: '8px 4px', whiteSpace: 'nowrap' },
  td:          { padding: '0 4px', height: 44, textAlign: 'center', fontSize: 13, color: '#6b7280', borderTop: '1px solid #f3f4f6' },
  mini:        { borderRadius: 6, background: '#f3f4f6', fontSize: 12, fontWeight: 800, color: '#6b7280' },
  seg:         { display: 'flex', background: '#e9e9ea', borderRadius: 12, padding: 4, marginBottom: 8 },
  segBtn:      { flex: 1, border: 'none', background: 'none', borderRadius: 9, minHeight: 36, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#6b7280', cursor: 'pointer' },
  segOn:       { background: '#fff', color: '#333333', boxShadow: '0 1px 2px rgba(0,0,0,.08)' },
  ligneMatch:  { display: 'flex', alignItems: 'center', gap: 12, padding: 12 },
  caseJour:    { width: 44, height: 48, borderRadius: 12, background: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 },
  caseJourNum: { fontSize: 17, fontWeight: 900, color: '#333333' },
  caseJourMois:{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginTop: 3 },
  advNom:      { margin: 0, fontSize: 14, fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  ellipse:     { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  advInfo:     { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 3 },
  heure:       { fontSize: 14, fontWeight: 800, color: '#333333', fontVariantNumeric: 'tabular-nums', flexShrink: 0 },
  score:       { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums', flexShrink: 0 },
  res:         { width: 22, height: 22, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#fff' },
  vide:        { margin: 0, padding: 16, fontSize: 13, color: '#6b7280', textAlign: 'center' },
  carteLien:   { background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10 },
  lienTitre:   { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1a1a1a' },
  lienTexte:   { margin: 0, fontSize: '.85rem', color: '#6b7280', lineHeight: 1.5 },
  lienInput:   { width: '100%', minHeight: 44, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: '#1a1a1a', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' },
  lienErreur:  { margin: 0, fontSize: '.8rem', fontWeight: 600, color: '#dc2626', lineHeight: 1.4 },
  lienBtn:     { minHeight: 46, border: 'none', borderRadius: 12, background: '#333333', color: '#e4f816', fontSize: '.9rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  lienAnnuler: { minHeight: 44, border: 'none', background: 'none', color: '#6b7280', fontSize: '.82rem', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' },
}
