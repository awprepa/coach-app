import { useEffect, useState } from 'react'
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
    setMatchs(m || [])
    setClassement(c || [])
    return { matchs: m || [], classement: c || [] }
  }

  // Récupère matchs et classement depuis Mon Clubhouse pour le lien du client
  async function synchroniser(clientId) {
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
    setErreurLien(null)
    const { error } = await supabase.from('clients').update({ monclubhouse_url: url }).eq('id', perso.clientId)
    if (error) { setErreurLien('Le lien n\u2019a pas été enregistré. Réessaie.'); return }
    setPerso(p => ({ ...p, url }))
    setEdition(false)
    setCompIdx(0)
    const ok = await synchroniser(perso.clientId)
    if (!ok) setErreurLien('Aucun match ni classement trouvé avec ce lien. Copie l\u2019adresse de la page de ton équipe (Compétitions, puis ton championnat).')
  }

  const today = isoLocal()
  const prochains = matchs.filter(m => m.date_match >= today)
  const resultats = matchs.filter(m => m.date_match < today).reverse()
  const prochain  = prochains[0]

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

  function fmtDate(iso) {
    if (!iso) return ''
    const [y, mo, d] = iso.split('-')
    return new Date(+y, +mo - 1, +d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  }

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

  function LogoBadge({ url, initials, size = 52 }) {
    return (
      <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.2),
        background: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0 }}>
        {url
          ? <img loading="lazy" src={url} alt={initials} style={{ width: size - 8, height: size - 8, objectFit: 'contain' }}
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
          : null}
        <div style={{ width:'100%', height:'100%', display: url ? 'none' : 'flex',
          alignItems:'center', justifyContent:'center',
          fontSize: size > 40 ? '1.1rem' : '.7rem', fontWeight:900 }}>{initials}</div>
      </div>
    )
  }

  function MatchCard({ m, big }) {
    const joue = m.score_dom != null
    const win  = joue && (m.est_domicile ? m.score_dom > m.score_ext : m.est_domicile === false ? m.score_ext > m.score_dom : null)
    const lose = joue && (m.est_domicile ? m.score_dom < m.score_ext : m.est_domicile === false ? m.score_ext < m.score_dom : null)
    const bg = big ? (joue ? (win ? '#16a34a' : lose ? '#dc2626' : '#64748b') : (activeGroupe?.couleur || '#1e40af')) : '#fff'

    // Logos : dom = logo_dom / ext = logo_ext ; notre équipe selon est_domicile.
    // Notre logo = celui du groupe dans l'appli (pas celui scrapé sur monclubhouse) — évite
    // aussi le logo adverse dupliqué des deux côtés quand le domicile/extérieur est inconnu.
    const notreNom  = m.est_domicile === true  ? m.equipe_dom : m.est_domicile === false ? m.equipe_ext : (m.equipe_dom || m.equipe_ext)
    const advNom    = m.est_domicile === true  ? m.equipe_ext : m.est_domicile === false ? m.equipe_dom : (m.equipe_ext || m.equipe_dom)
    const notreLogo = activeGroupe?.logo_url || (m.est_domicile === true ? m.logo_dom : m.est_domicile === false ? m.logo_ext : (m.logo_dom || m.logo_ext))
    const advLogo   = m.est_domicile === true  ? m.logo_ext   : m.est_domicile === false ? m.logo_dom   : (m.logo_ext || m.logo_dom)
    const notreInit = (notreNom || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const advInit   = (advNom || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

    // Disposition : domicile → notre logo gauche / adverse droite ; extérieur → adverse gauche / notre droite
    const logoG  = m.est_domicile !== false ? notreLogo : advLogo
    const logoD  = m.est_domicile !== false ? advLogo   : notreLogo
    const nomG   = m.est_domicile !== false ? notreNom  : advNom
    const nomD   = m.est_domicile !== false ? advNom    : notreNom
    const initG  = m.est_domicile !== false ? notreInit : advInit
    const initD  = m.est_domicile !== false ? advInit   : notreInit

    const scoreStr = joue
      ? (m.est_domicile ? `${m.score_dom} - ${m.score_ext}` : m.est_domicile === false ? `${m.score_ext} - ${m.score_dom}` : `${m.score_dom} - ${m.score_ext}`)
      : null

    if (big) return (
      <div style={{ background: `linear-gradient(155deg, ${bg}, color-mix(in srgb, ${bg} 60%, #000))`,
        borderRadius: 16, padding: '16px 14px', color: '#fff', marginBottom: 16 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 800, opacity: .7, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
          Prochain match{m.journee ? ` · Journée ${m.journee}` : ''}
        </div>

        {/* Logos face à face */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
          {/* Logo gauche */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
            <LogoBadge url={logoG} initials={initG} size={60} />
            <div style={{ fontSize: '0.7rem', fontWeight: 700, opacity: .85, textAlign: 'center', lineHeight: 1.2,
              maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomG}</div>
          </div>
          {/* Score / VS */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            {scoreStr
              ? <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '.03em', lineHeight: 1 }}>{scoreStr}</div>
              : <>
                  <div style={{ fontSize: '.82rem', fontWeight: 900, opacity: .9, letterSpacing: '.05em' }}>VS</div>
                  {m.heure && <div style={{ fontSize: '0.7rem', opacity: .75 }}>{m.heure}</div>}
                </>
            }
          </div>
          {/* Logo droite */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
            <LogoBadge url={logoD} initials={initD} size={60} />
            <div style={{ fontSize: '0.7rem', fontWeight: 700, opacity: .85, textAlign: 'center', lineHeight: 1.2,
              maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomD}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          <span style={{ background: 'rgba(255,255,255,.18)', borderRadius: 7, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700 }}>
            {fmtDate(m.date_match)}
          </span>
          {m.est_domicile != null && (
            <span style={{ background: '#e4f816', color: '#1a1a1a', borderRadius: 7, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 800 }}>
              {m.est_domicile ? 'Domicile' : 'Extérieur'}
            </span>
          )}
          {joue && <span style={{ background: 'rgba(255,255,255,.18)', borderRadius: 7, padding: '3px 10px', fontSize: '0.7rem', fontWeight: 700 }}>
            {win ? 'Victoire' : lose ? 'Défaite' : 'Nul'}
          </span>}
        </div>
      </div>
    )

    // Carte compacte (liste résultats / calendrier)
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', marginBottom: 8,
        border: '1px solid #e5e7eb' }}>
        {/* Logos compacts côte à côte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Logo G */}
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoG
              ? <img loading="lazy" src={logoG} alt={initG} style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
              : null}
            <div style={{ width:'100%', height:'100%', display: logoG ? 'none' : 'flex',
              alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight:900, color:'#6b7280' }}>{initG}</div>
          </div>
          {/* Score ou VS */}
          <div style={{ fontSize: '.75rem', fontWeight: 800, color: scoreStr ? (win ? '#16a34a' : lose ? '#dc2626' : '#64748b') : '#9ca3af',
            flexShrink: 0, minWidth: 32, textAlign: 'center' }}>
            {scoreStr || 'VS'}
          </div>
          {/* Logo D */}
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoD
              ? <img loading="lazy" src={logoD} alt={initD} style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
              : null}
            <div style={{ width:'100%', height:'100%', display: logoD ? 'none' : 'flex',
              alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight:900, color:'#6b7280' }}>{initD}</div>
          </div>
          {/* Infos texte */}
          <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
            <div style={{ fontWeight: 700, fontSize: '.82rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{advNom}</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: 1 }}>
              {m.journee ? `J${m.journee} · ` : ''}{fmtDate(m.date_match)}
              {m.est_domicile != null ? ` · ${m.est_domicile ? 'Dom.' : 'Ext.'}` : ''}
            </div>
          </div>
          {!scoreStr && m.heure && <span style={{ fontSize: '.7rem', color: '#6b7280', fontWeight: 600, flexShrink: 0 }}>{m.heure}</span>}
        </div>
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

  const gc = activeGroupe?.couleur || '#333333'

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
            <button onClick={enregistrerLien} disabled={!lien.trim() || synchro} style={{ ...S.lienBtn, opacity: !lien.trim() || synchro ? 0.5 : 1 }}>
              {synchro ? 'Récupération du classement…' : 'Enregistrer le lien'}
            </button>
            {edition && <button onClick={() => { setEdition(false); setLien(perso.url || ''); setErreurLien(null) }} style={S.lienAnnuler}>Annuler</button>}
          </div>
        ) : perso && synchro && matchs.length === 0 && classement.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <p style={{ fontWeight: 700, color: '#374151' }}>Récupération du classement…</p>
          </div>
        ) : perso && matchs.length === 0 && classement.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <p style={{ fontWeight: 700, color: '#374151' }}>Aucun match trouvé</p>
            <p style={{ fontSize: '.85rem' }}>{erreurLien || 'Vérifie que le lien mène bien à la page du championnat de ton équipe.'}</p>
            <button onClick={() => setEdition(true)} style={S.lienAnnuler}>Changer le lien</button>
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
            {/* Prochain match */}
            {prochain && <MatchCard m={prochain} big />}

            {/* Classement */}
            {classement.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase',
                  letterSpacing: '.08em', color: '#6b7280' }}>Classement</p>
                {competitions.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
                    {competitions.map((cp, i) => {
                      const on = cp === compActive
                      return (
                        <button key={cp.tag || i} onClick={() => setCompIdx(i)}
                          style={{ padding: '0.45rem 0.95rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                            border: `1.5px solid ${on ? gc : '#e5e7eb'}`, background: on ? `color-mix(in srgb, ${gc} 10%, #fff)` : '#fff', color: on ? gc : '#6b7280' }}>
                          {cp.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['#', '', 'Équipe', 'Pts', 'J', 'G', 'N', 'P', '+/-'].map(h => (
                            <th key={h} style={{ padding: '8px 8px', textAlign: h === 'Équipe' ? 'left' : 'center',
                              fontWeight: 700, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase',
                              letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {classementAff.map(c => {
                          const isOurs = notreEquipe?.equipe === c.equipe
                          const initials = c.equipe.split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                          const logoAff = (isOurs && activeGroupe?.logo_url) || c.logo
                          return (
                            <tr key={c.equipe} style={{ background: isOurs ? `color-mix(in srgb, ${gc} 8%, #fff)` : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: isOurs ? gc : '#6b7280', fontSize: '.78rem' }}>{c.position}</td>
                              <td style={{ padding: '4px 4px', width: 28, textAlign: 'center' }}>
                                {logoAff
                                  ? <img loading="lazy" src={logoAff} alt="" style={{ width: 22, height: 22, objectFit: 'contain', display: 'block', margin: '0 auto' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                                  : null}
                                <div style={{ width: 22, height: 22, borderRadius: 4, background: '#f0f2f5', display: logoAff ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#6b7280', margin: '0 auto' }}>{initials}</div>
                              </td>
                              <td style={{ padding: '8px 8px', fontWeight: isOurs ? 800 : 500, color: isOurs ? gc : '#1f2937',
                                borderLeft: isOurs ? `3px solid ${gc}` : '3px solid transparent',
                                maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.78rem' }}>{c.equipe}</td>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: isOurs ? 800 : 600, color: isOurs ? gc : '#1f2937', fontSize: '.82rem' }}>{c.pts}</td>
                              <td style={{ padding: '8px', textAlign: 'center', color: '#6b7280', fontSize: '.75rem' }}>{c.joues}</td>
                              <td style={{ padding: '8px', textAlign: 'center', color: '#16a34a', fontWeight: 600, fontSize: '.75rem' }}>{c.gagnes}</td>
                              <td style={{ padding: '8px', textAlign: 'center', color: '#6b7280', fontSize: '.75rem' }}>{c.nuls}</td>
                              <td style={{ padding: '8px', textAlign: 'center', color: '#dc2626', fontWeight: 600, fontSize: '.75rem' }}>{c.perdus}</td>
                              <td style={{ padding: '8px', textAlign: 'center', color: Number(c.diff) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: '.75rem' }}>{Number(c.diff) > 0 ? '+' : ''}{c.diff}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Résultats passés */}
            {resultats.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b7280' }}>Résultats</p>
                {resultats.map(m => <MatchCard key={m.id} m={m} />)}
              </div>
            )}

            {/* Matchs à venir */}
            {prochains.slice(1).length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b7280' }}>Calendrier à venir</p>
                {prochains.slice(1).map(m => <MatchCard key={m.id} m={m} />)}
              </div>
            )}

            {perso && (
              <button onClick={() => setEdition(true)} style={{ ...S.lienAnnuler, display: 'block', margin: '0 auto 16px' }}>
                Changer le lien Mon Clubhouse
              </button>
            )}
          </>
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  carteLien:   { background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10 },
  lienTitre:   { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1a1a1a' },
  lienTexte:   { margin: 0, fontSize: '.85rem', color: '#6b7280', lineHeight: 1.5 },
  lienInput:   { width: '100%', minHeight: 44, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: '#1a1a1a', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' },
  lienErreur:  { margin: 0, fontSize: '.8rem', fontWeight: 600, color: '#dc2626', lineHeight: 1.4 },
  lienBtn:     { minHeight: 46, border: 'none', borderRadius: 12, background: '#333333', color: '#e4f816', fontSize: '.9rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  lienAnnuler: { minHeight: 44, border: 'none', background: 'none', color: '#6b7280', fontSize: '.82rem', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' },
}
