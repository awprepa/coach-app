import React from 'react'
import { iso } from './constants'

// ── CompetitionTab ─────────────────────────────────────────────────────────────
export function CompetitionTab({ matchs, classement, groupColor, groupeNom, syncing, lastSync, onSync }) {
  const today = new Date().toISOString().slice(0, 10)

  // Identifier notre équipe depuis les matchs (est_domicile → equipe_dom/ext)
  // Méthode fiable : prend le nom le plus fréquent parmi "notre côté" dans chaque match
  const ourNames = matchs
    .map(m => m.est_domicile === true ? m.equipe_dom : m.est_domicile === false ? m.equipe_ext : null)
    .filter(Boolean)
  const ourTeamName = ourNames.length > 0
    ? ourNames.reduce((best, name) => ourNames.filter(v => v === name).length >= ourNames.filter(v => v === best).length ? name : best)
    : null
  const notreEquipe = ourTeamName
    ? classement.find(c => c.equipe.toLowerCase() === ourTeamName.toLowerCase())
    : null

  // Prochains matchs (futurs)
  const prochains = matchs.filter(m => m.date_match >= today)
  // Tous les résultats (passés), du plus récent au plus ancien
  const resultats = matchs.filter(m => m.date_match < today).reverse()

  const fmtDate = iso => {
    if (!iso) return ''
    const [y, mo, d] = iso.split('-')
    return `${d}/${mo}/${y}`
  }
  const fmtScore = m => {
    if (m.score_dom == null) return null
    if (m.est_domicile) return `${m.score_dom} - ${m.score_ext}`
    if (m.est_domicile === false) return `${m.score_ext} - ${m.score_dom}`
    return `${m.score_dom} - ${m.score_ext}`
  }
  const gagné = m => {
    if (m.score_dom == null) return null
    if (m.est_domicile) return m.score_dom > m.score_ext
    if (m.est_domicile === false) return m.score_ext > m.score_dom
    return null
  }
  const opponent = m => m.est_domicile ? m.equipe_ext : m.est_domicile === false ? m.equipe_dom : (m.equipe_ext || m.equipe_dom)

  const prochain = prochains[0]

  return (
    <div style={{ padding: '0 0 32px' }}>

      {/* ── Header sync ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 0' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280' }}>
            {lastSync ? `Dernière sync : ${new Date(lastSync).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Pas encore synchronisé'}
          </p>
        </div>
        <button onClick={onSync} disabled={syncing}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20,
            border: 'none', background: groupColor, color: '#fff', fontWeight: 700, fontSize: '0.8rem',
            cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.7 : 1 }}>
          {syncing ? 'Sync...' : 'Synchroniser'}
        </button>
      </div>

      {classement.length === 0 && matchs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
          <p style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Aucune donnée chargée</p>
          <p style={{ fontSize: '0.82rem' }}>Clique sur "Synchroniser" pour charger les matchs et le classement depuis monclubhouse.ffr.fr</p>
        </div>
      ) : (<>

        {/* ── Prochain match ── */}
        {prochain && (
          <div style={{ background: `linear-gradient(135deg, ${groupColor}, color-mix(in srgb, ${groupColor} 70%, #1e1b4b))`,
            borderRadius: 14, padding: '16px 18px', marginBottom: 20, color: '#fff' }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.62rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', opacity: 0.75 }}>
              Prochain match{prochain.journee ? ` · J${prochain.journee}` : ''}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 900 }}>{opponent(prochain)}</p>
            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.9 }}>
              {fmtDate(prochain.date_match)}{prochain.heure ? ` · ${prochain.heure}` : ''}
              {' · '}{prochain.est_domicile ? 'Domicile' : prochain.est_domicile === false ? 'Extérieur' : ''}
            </p>
          </div>
        )}

        {/* ── Classement ── */}
        {classement.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b7280' }}>Classement</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['#','','Équipe','Pts','J','G','N','P','+/-','BO','BD'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Équipe' ? 'left' : 'center',
                        fontWeight: 700, color: '#6b7280', fontSize: '0.65rem', textTransform: 'uppercase',
                        letterSpacing: '.05em', whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classement.map(c => {
                    const isOurs = notreEquipe?.equipe === c.equipe
                    return (
                      <tr key={c.equipe}
                        style={{ background: isOurs ? `color-mix(in srgb, ${groupColor} 10%, #fff)` : 'transparent',
                          borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700,
                          color: isOurs ? groupColor : '#374151' }}>{c.position}</td>
                        <td style={{ padding: '4px 6px', textAlign: 'center', width: 28 }}>
                          {c.logo
                            ? <img loading="lazy" src={c.logo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', display: 'block', margin: '0 auto' }} onError={e => e.target.style.display='none'} />
                            : null}
                        </td>
                        <td style={{ padding: '7px 8px', fontWeight: isOurs ? 800 : 500,
                          color: isOurs ? groupColor : '#1f2937',
                          borderLeft: isOurs ? `3px solid ${groupColor}` : '3px solid transparent',
                          maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.equipe}
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 800, color: isOurs ? groupColor : '#1f2937' }}>{c.pts}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#6b7280' }}>{c.joues}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{c.gagnes}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#6b7280' }}>{c.nuls}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>{c.perdus}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: c.diff >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{c.diff > 0 ? '+' : ''}{c.diff}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#6b7280' }}>{c.bonus_off}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#6b7280' }}>{c.bonus_def}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Résultats récents ── */}
        {resultats.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b7280' }}>Derniers résultats</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {resultats.map(m => {
                const g = gagné(m); const score = fmtScore(m)
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 10, background: g === true ? '#f0fdf4' : g === false ? '#fef2f2' : '#f9fafb',
                    border: `1px solid ${g === true ? '#bbf7d0' : g === false ? '#fecaca' : '#e5e7eb'}` }}>
                    <span style={{ fontSize: '0.7rem', color: '#6b7280', minWidth: 60 }}>{fmtDate(m.date_match)}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: '0.78rem', color: '#1f2937' }}>{opponent(m)}</span>
                    {score && <span style={{ fontWeight: 800, fontSize: '0.82rem', color: g === true ? '#16a34a' : g === false ? '#dc2626' : '#374151' }}>{score}</span>}
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280' }}>{m.est_domicile ? 'dom' : m.est_domicile === false ? 'ext' : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Prochains matchs ── */}
        {prochains.length > 1 && (
          <div>
            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b7280' }}>Prochains matchs</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prochains.slice(1).map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 10, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280', minWidth: 60 }}>{fmtDate(m.date_match)}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: '0.78rem', color: '#1f2937' }}>{opponent(m)}</span>
                  {m.heure && <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>{m.heure}</span>}
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280' }}>{m.est_domicile ? 'Dom.' : m.est_domicile === false ? 'Ext.' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </>)}
    </div>
  )
}
