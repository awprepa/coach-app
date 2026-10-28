import { useNavigate } from 'react-router-dom'
import { isoLocal } from '../utils/dates'

// Tableau de bord coach : suivi de la semaine des clients individuels
// (wellness, séances, cycle, abonnement) et résumé des joueurs par équipe.
// Ceux qui demandent de l'attention remontent en haut.

const OFFRES = {
  gratuit:              { label: 'Gratuit',        bg: '#f0fdf4', color: '#15803d' },
  essai:                { label: 'Essai',          bg: '#fff7ed', color: '#c2410c' },
  preparation_physique: { label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:             { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
  club:                 { label: 'Club',           bg: '#f0fdf4', color: '#15803d' },
}
const PALETTES = [
  { bg: '#dbeafe', text: '#1d4ed8' }, { bg: '#dcfce7', text: '#15803d' },
  { bg: '#fef9c3', text: '#a16207' }, { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#ede9fe', text: '#6d28d9' }, { bg: '#ffedd5', text: '#c2410c' },
]
const JOUR = 86400000
const moyenneW = w => (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4
const virgule = v => v.toFixed(1).replace('.', ',')
const joursDepuis = iso => Math.round((new Date(isoLocal() + 'T00:00:00') - new Date(iso + 'T00:00:00')) / JOUR)

function suivi(c, programmes, evenements) {
  const auj = isoLocal()
  // Wellness : dernier de la semaine, sinon ancienneté du dernier rempli
  const dernierW = [...(c.wellness_week || [])].sort((a, b) => b.date.localeCompare(a.date))[0]
  const wellness = dernierW
    ? { valeur: moyenneW(dernierW), quand: dernierW.date === auj ? "aujourd'hui" : joursDepuis(dernierW.date) === 1 ? 'hier' : `il y a ${joursDepuis(dernierW.date)} j` }
    : { absent: c.derniere_activite ? `aucun depuis ${joursDepuis(c.derniere_activite)} j` : 'jamais rempli', jours: c.derniere_activite ? joursDepuis(c.derniere_activite) : 99 }
  // Séances de la semaine : faites, manquées (jour passé non terminé), à venir
  const seances = evenements.filter(e => e.client_id === c.id && e.type === 'seance').sort((a, b) => a.date.localeCompare(b.date))
  const etats = seances.map(e => e.terminee ? 'fait' : e.date < auj ? 'rate' : 'avenir')
  // Cycle en cours
  const prog = programmes.find(p => {
    if (p.client_id !== c.id || !p.date_debut || !p.semaines) return false
    const ecart = (new Date(auj + 'T00:00:00') - new Date(p.date_debut + 'T00:00:00')) / JOUR
    return ecart >= 0 && ecart < p.semaines * 7
  })
  const cycle = prog ? { sem: Math.floor((new Date(auj + 'T00:00:00') - new Date(prog.date_debut + 'T00:00:00')) / JOUR / 7) + 1, total: prog.semaines, nom: prog.nom } : null
  // Abonnement
  const reste = c.date_fin ? Math.ceil((new Date(c.date_fin + 'T00:00:00') - new Date(auj + 'T00:00:00')) / JOUR) : null
  // Attention : séance manquée, wellness bas ou absent, abonnement qui se termine
  const attention =
    etats.filter(x => x === 'rate').length * 2 +
    (wellness.valeur != null && wellness.valeur <= 2 ? 3 : 0) +
    (wellness.absent && wellness.jours >= 3 ? 1 : 0) +
    (reste != null && reste <= 7 ? 2 : 0)
  return { c, wellness, etats, cycle, reste, attention }
}

export default function SuiviClients({ clients, programmes, evenements }) {
  const navigate = useNavigate()
  const lignes = clients.map(c => suivi(c, programmes, evenements))
    .sort((a, b) => b.attention - a.attention || a.c.prenom.localeCompare(b.c.prenom))

  return (
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.sectionTitle}>Clients individuels · suivi de la semaine</span>
          <button onClick={() => navigate('/clients')} style={S.miniBtn}>Gérer les clients</button>
        </div>
        {lignes.length === 0 ? <p style={S.empty}>Aucun client individuel actif.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>{['Client', 'Wellness', 'Séances cette semaine', 'Cycle', 'Abonnement'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {lignes.map(({ c, wellness, etats, cycle, reste }) => {
                  const o = OFFRES[c.offre]
                  const pal = PALETTES[((c.prenom?.charCodeAt(0) || 0) + (c.nom?.charCodeAt(0) || 0)) % PALETTES.length]
                  const faites = etats.filter(x => x === 'fait').length
                  const ratees = etats.filter(x => x === 'rate').length
                  const wCouleur = wellness.valeur == null ? '#6b7280' : wellness.valeur <= 2 ? '#b91c1c' : wellness.valeur <= 3 ? '#b45309' : '#15803d'
                  const abo = reste == null ? null : reste < 0 ? { t: 'Expiré', bg: '#f3f4f6', c: '#6b7280' } : reste <= 7 ? { t: `${reste} j`, bg: '#fef2f2', c: '#b91c1c' } : reste <= 30 ? { t: `${reste} j`, bg: '#fffbeb', c: '#92400e' } : { t: `${reste} j`, bg: '#f0fdf4', c: '#15803d' }
                  return (
                    <tr key={c.id} onClick={() => navigate(`/client/${c.id}`)} style={{ cursor: 'pointer' }}>
                      <td style={S.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                          {c.avatar_url
                            ? <img src={c.avatar_url} alt="" loading="lazy" style={{ ...S.ava, objectFit: 'cover' }} />
                            : <div style={{ ...S.ava, background: pal.bg, color: pal.text }}>{`${c.prenom?.[0] || ''}${c.nom?.[0] || ''}`.toUpperCase()}</div>}
                          <div style={{ minWidth: 0 }}>
                            <p style={S.nom}>{c.prenom} {c.nom}</p>
                            {o && <span style={{ ...S.offre, background: o.bg, color: o.color }}>{o.label}</span>}
                          </div>
                        </div>
                      </td>
                      <td style={S.td}>
                        {wellness.valeur != null
                          ? <><span style={{ ...S.val, color: wCouleur }}>{virgule(wellness.valeur)}</span> <span style={S.sous}>{wellness.quand}</span></>
                          : <span style={S.sous}>{wellness.absent}</span>}
                      </td>
                      <td style={S.td}>
                        {etats.length === 0 ? <span style={S.sous}>aucune prévue</span> : (
                          <>
                            <span style={S.points} aria-hidden="true">
                              {etats.map((x, i) => <i key={i} style={{ ...S.point, ...(x === 'fait' ? S.pointFait : x === 'rate' ? S.pointRate : null) }} />)}
                            </span>
                            <span style={S.val}>{faites}</span> / {etats.length}
                            {ratees > 0 && <span style={{ ...S.sous, color: '#b91c1c', fontWeight: 700 }}> · {ratees} manquée{ratees > 1 ? 's' : ''}</span>}
                          </>
                        )}
                      </td>
                      <td style={S.td}>
                        {cycle ? (
                          <span title={cycle.nom}>
                            <span style={S.barre}><i style={{ ...S.barreIn, width: `${Math.min(100, cycle.sem / cycle.total * 100)}%` }} /></span>
                            S{cycle.sem} / {cycle.total}
                          </span>
                        ) : <span style={S.sous}>aucun cycle en cours</span>}
                      </td>
                      <td style={S.td}>
                        {abo ? <span style={{ ...S.pill, background: abo.bg, color: abo.c }}>{abo.t}</span> : <span style={S.sous}>sans fin</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
  )
}

// Résumé des joueurs de groupe, par équipe
export function ResumeEquipes({ equipes }) {
  const navigate = useNavigate()
  return (
      <div style={S.card}>
        <div style={S.cardHead}><span style={S.sectionTitle}>Joueurs des groupes</span></div>
        {equipes.length === 0 ? <p style={S.empty}>Aucun groupe.</p> : equipes.map(e => (
          <div role="button" tabIndex={0} key={e.id} onClick={() => navigate(`/groupe/${e.id}`)} onKeyDown={ev => ev.key === 'Enter' && navigate(`/groupe/${e.id}`)} style={S.miniRow}>
            <div style={S.miniIco}>
              {e.logo ? <img src={e.logo} alt="" loading="lazy" style={{ width: 20, height: 20, objectFit: 'contain' }} /> : <span style={{ width: 12, height: 12, borderRadius: 4, background: e.couleur || '#9ca3af' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={S.miniName}>{e.nom}</p>
              <p style={S.miniSub}>
                {e.effectif} joueur{e.effectif > 1 ? 's' : ''} · {e.wellness} wellness aujourd'hui{e.moyenne != null ? ` · moyenne ${virgule(e.moyenne)}/4` : ''}{e.bas ? ` · ${e.bas} bas` : ''}
              </p>
            </div>
            <span style={S.chevron}>›</span>
          </div>
        ))}
      </div>
  )
}

// Styles repris de Dashboard.js (card, cardHead, sectionTitle, miniRow, pill…)
const S = {
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', paddingBottom: '0.35rem', minWidth: 0 },
  cardHead: { padding: '0.8rem 1rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' },
  sectionTitle: { fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  miniBtn: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  empty: { color: '#6b7280', fontSize: '0.82rem', padding: '0.5rem 1rem 0.9rem', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 680 },
  th: { fontSize: '0.6rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', padding: '0.45rem 1rem', borderTop: '1px solid #f3f4f6' },
  td: { padding: '0.6rem 1rem', borderTop: '1px solid #f6f7f8', fontSize: '0.82rem', color: '#333333', verticalAlign: 'middle' },
  ava: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: '800', flexShrink: 0 },
  nom: { margin: 0, fontWeight: 700, color: '#333333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  offre: { display: 'inline-block', marginTop: 2, padding: '0.05rem 0.45rem', borderRadius: 999, fontSize: '0.66rem', fontWeight: 700 },
  val: { fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  sous: { fontSize: '0.7rem', color: '#6b7280' },
  points: { display: 'inline-flex', gap: 3, verticalAlign: 'middle', marginRight: '0.4rem' },
  point: { width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb', display: 'block' },
  pointFait: { background: '#333333' },
  pointRate: { background: '#fff', boxShadow: 'inset 0 0 0 1.5px #b91c1c' },
  barre: { width: 70, height: 5, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle', marginRight: '0.4rem' },
  barreIn: { display: 'block', height: '100%', background: '#333333', borderRadius: 99 },
  pill: { borderRadius: 999, fontSize: '0.68rem', fontWeight: '800', padding: '0.15rem 0.5rem', whiteSpace: 'nowrap' },
  miniRow: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 1rem', cursor: 'pointer', borderTop: '1px solid #f6f7f8' },
  miniIco: { width: 28, height: 28, borderRadius: 7, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  miniName: { margin: 0, fontSize: '0.82rem', fontWeight: '700', color: '#333333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  miniSub: { margin: 0, fontSize: '0.7rem', color: '#6b7280' },
  chevron: { color: '#9ca3af', fontSize: '1.25rem' },
}
