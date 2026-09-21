// Classement complet d'un groupe, avec un onglet par équipe FFR suivie
// (équipe principale + équipe espoirs si configurée sur le groupe).
import { useState } from 'react'

function labelFor(tag, competitionLabel, isEspoirs) {
  if (competitionLabel) return competitionLabel
  if (isEspoirs) return 'Espoirs'
  return tag || 'Classement'
}

export default function GroupeClassementView({ groupe, classementFFR, accent }) {
  const [activeIdx, setActiveIdx] = useState(0)

  const mainTag = groupe.monclubhouse_competition || null
  const espoirsTag = groupe.monclubhouse_competition_espoirs || null

  const groups = []
  const mainRows = classementFFR.filter(c => (c.competition || null) === mainTag)
  if (mainRows.length > 0) {
    groups.push({ tag: mainTag, rows: mainRows, label: labelFor(mainTag, mainRows[0]?.competition_label, false) })
  }
  if (espoirsTag) {
    const espoirsRows = classementFFR.filter(c => c.competition === espoirsTag)
    if (espoirsRows.length > 0) {
      groups.push({ tag: espoirsTag, rows: espoirsRows, label: labelFor(espoirsTag, espoirsRows[0]?.competition_label, true) })
    }
  }

  if (groups.length === 0) {
    return <p style={{ fontSize: '0.85rem', color: '#9ca3af', padding: '2rem 0', textAlign: 'center' }}>Pas encore de classement synchronisé.</p>
  }
  const current = groups[Math.min(activeIdx, groups.length - 1)]

  return (
    <div>
      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.1rem' }}>
          {groups.map((g, i) => (
            <button key={g.tag || i} onClick={() => setActiveIdx(i)}
              style={{
                padding: '0.5rem 1.1rem', borderRadius: 999, fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer',
                border: `1.5px solid ${i === activeIdx ? accent : '#e5e7eb'}`,
                background: i === activeIdx ? accent + '18' : '#fff',
                color: i === activeIdx ? accent : '#6b7280',
              }}>
              {g.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              {['#', 'Équipe', 'J', 'G', 'N', 'P', 'Diff', 'Bo', 'Bd', 'Pts'].map((h, i) => (
                <th key={i} style={{ padding: '0.65rem 0.6rem', fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i === 1 ? 'left' : 'center' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {current.rows.map((c, i) => {
              const isOurs = c.equipe?.toLowerCase().includes(groupe.nom.toLowerCase()) || groupe.nom.toLowerCase().includes(c.equipe?.toLowerCase() || '')
              // Notre ligne : logo uploadé dans l'appli plutôt que celui scrapé sur monclubhouse.
              const logoAff = (isOurs && groupe?.logo_url) || c.logo
              return (
                <tr key={c.equipe + i} style={{ background: isOurs ? accent + '14' : 'transparent', borderBottom: '1px solid #f6f6f6' }}>
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: isOurs ? accent : '#9ca3af' }}>{c.position}</td>
                  <td style={{ padding: '0.55rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {logoAff
                      ? <img src={logoAff} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
                      : <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#f3f4f6', color: '#9ca3af', fontSize: '0.55rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.equipe?.slice(0, 2).toUpperCase()}</span>
                    }
                    <span style={{ fontSize: '0.82rem', fontWeight: isOurs ? 800 : 700, color: isOurs ? accent : '#333' }}>{c.equipe}</span>
                  </td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{c.joues}</td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{c.gagnes}</td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{c.nuls}</td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{c.perdus}</td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{c.diff > 0 ? `+${c.diff}` : c.diff}</td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{c.bonus_off}</td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>{c.bonus_def}</td>
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 900, color: isOurs ? accent : '#1a1a1a' }}>{c.pts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
