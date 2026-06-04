import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'

export default function CompetitionClient() {
  const [loading, setLoading]       = useState(true)
  const [groupes, setGroupes]       = useState([])   // groupes avec FFR
  const [activeGroupe, setActive]   = useState(null)
  const [matchs, setMatchs]         = useState([])
  const [classement, setClassement] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return

      const { data: client } = await supabase
        .from('clients').select('id').eq('user_id', userId).maybeSingle()
      if (!client) return

      // Groupes du client qui ont un lien FFR
      const { data: membres } = await supabase
        .from('groupe_membres').select('groupe_id').eq('client_id', client.id)
      if (!membres?.length) { setLoading(false); return }

      const groupeIds = membres.map(m => m.groupe_id)
      const { data: gs } = await supabase
        .from('groupes').select('id, nom, couleur, monclubhouse_url')
        .in('id', groupeIds).not('monclubhouse_url', 'is', null)
      setGroupes(gs || [])

      if (gs?.length) {
        setActive(gs[0])
        await loadFFR(gs[0].id)
      }
    } catch (e) {
      console.error('CompetitionClient:', e)
    } finally {
      setLoading(false)
    }
  }

  async function loadFFR(groupeId) {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('matchs_ffr').select('*').eq('groupe_id', groupeId).order('date_match'),
      supabase.from('classements_ffr').select('*').eq('groupe_id', groupeId).order('position'),
    ])
    setMatchs(m || [])
    setClassement(c || [])
  }

  const today = new Date().toISOString().slice(0, 10)
  const prochains = matchs.filter(m => m.date_match >= today)
  const resultats = matchs.filter(m => m.date_match < today).reverse()
  const prochain  = prochains[0]

  // Notre équipe dans le classement
  const ourNames = matchs
    .map(m => m.est_domicile === true ? m.equipe_dom : m.est_domicile === false ? m.equipe_ext : null)
    .filter(Boolean)
  const ourTeam = ourNames.length > 0
    ? ourNames.reduce((b, n) => ourNames.filter(v => v === n).length >= ourNames.filter(v => v === b).length ? n : b)
    : null
  const notreEquipe = ourTeam ? classement.find(c => c.equipe.toLowerCase() === ourTeam.toLowerCase()) : null

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
    return m.heure ? <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>🕐 {m.heure}</span> : null
  }

  function MatchCard({ m, big }) {
    const adv = m.est_domicile ? m.equipe_ext : m.est_domicile === false ? m.equipe_dom : (m.equipe_ext || m.equipe_dom)
    const logo = m.est_domicile ? m.logo_ext : m.est_domicile === false ? m.logo_dom : (m.logo_ext || m.logo_dom)
    const initials = (adv || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const joue = m.score_dom != null
    const win = joue && (m.est_domicile ? m.score_dom > m.score_ext : m.est_domicile === false ? m.score_ext > m.score_dom : null)
    const lose = joue && (m.est_domicile ? m.score_dom < m.score_ext : m.est_domicile === false ? m.score_ext < m.score_dom : null)
    const bg = big ? (joue ? (win ? '#16a34a' : lose ? '#dc2626' : '#64748b') : (activeGroupe?.couleur || '#1e40af')) : '#fff'

    if (big) return (
      <div style={{ background: `linear-gradient(155deg, ${bg}, color-mix(in srgb, ${bg} 60%, #000))`,
        borderRadius: 16, padding: '20px 18px', color: '#fff', marginBottom: 16 }}>
        <div style={{ fontSize: '.6rem', fontWeight: 800, opacity: .7, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
          Prochain match{m.journee ? ` · Journée ${m.journee}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, background: 'rgba(255,255,255,.18)',
            border: '2px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logo
              ? <img src={logo} alt={adv} style={{ width: 52, height: 52, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
              : null}
            <div style={{ width:'100%', height:'100%', display: logo ? 'none' : 'flex',
              alignItems:'center', justifyContent:'center', fontSize:'1.2rem', fontWeight:900 }}>{initials}</div>
          </div>
          <div>
            <div style={{ fontSize: '.72rem', opacity: .75, fontWeight: 600, marginBottom: 3 }}>vs</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, lineHeight: 1.2 }}>{adv}</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <ScoreOrHour m={m} />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ background: 'rgba(255,255,255,.18)', borderRadius: 7, padding: '3px 10px', fontSize: '.65rem', fontWeight: 700 }}>
            {fmtDate(m.date_match)}
          </span>
          {m.est_domicile != null && (
            <span style={{ background: '#e4f816', color: '#1a1a1a', borderRadius: 7, padding: '3px 10px', fontSize: '.65rem', fontWeight: 800 }}>
              {m.est_domicile ? '🏠 Domicile' : '✈️ Extérieur'}
            </span>
          )}
          {joue && <span style={{ background: 'rgba(255,255,255,.18)', borderRadius: 7, padding: '3px 10px', fontSize: '.65rem', fontWeight: 700 }}>
            {win ? '✅ Victoire' : lose ? '❌ Défaite' : '🤝 Nul'}
          </span>}
        </div>
      </div>
    )

    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8,
        border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f3f4f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {logo
            ? <img src={logo} alt={adv} style={{ width: 30, height: 30, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
            : null}
          <div style={{ width:'100%', height:'100%', display: logo ? 'none' : 'flex',
            alignItems:'center', justifyContent:'center', fontSize:'.75rem', fontWeight:900, color:'#6b7280' }}>{initials}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>vs {adv}</div>
          <div style={{ fontSize: '.7rem', color: '#6b7280', marginTop: 2 }}>
            {m.journee ? `J${m.journee} · ` : ''}{fmtDate(m.date_match)}
            {m.est_domicile != null ? ` · ${m.est_domicile ? '🏠' : '✈️'}` : ''}
          </div>
        </div>
        <ScoreOrHour m={m} />
      </div>
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  const gc = activeGroupe?.couleur || '#333333'

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6f8', paddingBottom: 100, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, #333333 0%, #1f2937 100%)`,
        padding: '18px 18px 16px', color: '#fff' }}>
        <div style={{ fontSize: '.62rem', fontWeight: 800, color: '#e4f816', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Compétition</div>
        {groupes.length > 1 ? (
          <select value={activeGroupe?.id || ''} onChange={async e => {
            const g = groupes.find(x => x.id === e.target.value)
            setActive(g); setMatchs([]); setClassement([])
            await loadFFR(g.id)
          }} style={{ fontWeight: 800, fontSize: '1rem', background: 'transparent', color: '#fff', border: 'none', outline: 'none', padding: 0, cursor: 'pointer' }}>
            {groupes.map(g => <option key={g.id} value={g.id} style={{ color: '#000' }}>{g.nom}</option>)}
          </select>
        ) : (
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{activeGroupe?.nom || 'Mon équipe'}</div>
        )}
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {groupes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏆</p>
            <p style={{ fontWeight: 700, color: '#374151', fontSize: '1rem' }}>Aucune compétition disponible</p>
            <p style={{ fontSize: '.85rem' }}>Ton coach n'a pas encore configuré de lien de compétition.</p>
          </div>
        ) : matchs.length === 0 && classement.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#9ca3af' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: 8 }}>📡</p>
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
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['#', '', 'Équipe', 'Pts', 'J', 'G', 'N', 'P', '+/-'].map(h => (
                            <th key={h} style={{ padding: '8px 8px', textAlign: h === 'Équipe' ? 'left' : 'center',
                              fontWeight: 700, color: '#9ca3af', fontSize: '.6rem', textTransform: 'uppercase',
                              letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {classement.map(c => {
                          const isOurs = notreEquipe?.equipe === c.equipe
                          const initials = c.equipe.split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                          return (
                            <tr key={c.equipe} style={{ background: isOurs ? `color-mix(in srgb, ${gc} 8%, #fff)` : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: isOurs ? gc : '#6b7280', fontSize: '.78rem' }}>{c.position}</td>
                              <td style={{ padding: '4px 4px', width: 28, textAlign: 'center' }}>
                                {c.logo
                                  ? <img src={c.logo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', display: 'block', margin: '0 auto' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                                  : null}
                                <div style={{ width: 22, height: 22, borderRadius: 4, background: '#f0f2f5', display: c.logo ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem', fontWeight: 800, color: '#6b7280', margin: '0 auto' }}>{initials}</div>
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
          </>
        )}
      </div>

      <ClientBottomNav />
    </div>
  )
}
