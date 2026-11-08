import { useState } from 'react'
import NotifIcon from './NotifIcon'
import { isoLocal } from '../utils/dates'

// Fil de notifications du tableau de bord coach.
// - Classées par jour (Aujourd'hui, Hier, puis la date).
// - Une ligne par notification : icône, titre, détail, heure (modèle d'origine,
//   plus lisible que l'ancien regroupement par équipe).
// - Filtres : toutes, individuels, puis un filtre par club.
// - Logo du club devant le nom des joueurs d'un groupe, équipe écrite à côté.

function lienId(lien, type) {
  const m = (lien || '').match(new RegExp(`^/${type}/([0-9a-f-]{36})`))
  return m ? m[1] : null
}

function libelleJour(iso) {
  const auj = isoLocal()
  const hier = new Date(); hier.setDate(hier.getDate() - 1)
  if (iso === auj) return "Aujourd'hui"
  if (iso === isoLocal(hier)) return 'Hier'
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

const heure = iso => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
const sansTiret = t => (t || '').replace(/\s+—\s+/g, ' · ')

export function LogoGroupe({ groupe, size = 16 }) {
  if (!groupe) return null
  return groupe.logo_url
    ? <img src={groupe.logo_url} alt="" loading="lazy" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 4, flexShrink: 0, verticalAlign: -3, marginRight: '0.35rem' }} />
    : <span style={{ display: 'inline-block', width: size - 4, height: size - 4, borderRadius: 4, background: groupe.couleur || '#9ca3af', flexShrink: 0, verticalAlign: -1, marginRight: '0.35rem' }} />
}

// clients : [{ id, prenom, nom, wellness_today }]
// groupes : tous les groupes ; equipeDe : client_id → groupe (équipe du joueur)
export default function FilNotifications({ notifs, estNonLue, markRead, markAllRead, onOuvrir, clients, groupes, equipeDe, chargerPlus, peutChargerPlus }) {
  const [filtre, setFiltre] = useState('toutes')

  const parId = Object.fromEntries(groupes.map(g => [g.id, g]))
  const clubDe = g => { let x = g; while (x?.parent_id && parId[x.parent_id]) x = parId[x.parent_id]; return x }
  // Logo affiché : celui de l'équipe, sinon celui d'un groupe parent
  const logoDe = g => { let x = g; while (x && !x.logo_url && x.parent_id) x = parId[x.parent_id]; return x?.logo_url ? x : g }

  // Infos utiles de chaque notification
  const infos = notifs.map(n => {
    const clientId = lienId(n.lien, 'client')
    let equipe = (lienId(n.lien, 'groupe') && parId[lienId(n.lien, 'groupe')]) || (clientId ? equipeDe[clientId] : null)
    if (equipe?.type === 'sous_groupe' && parId[equipe.parent_id]) equipe = parId[equipe.parent_id]
    const club = equipe ? clubDe(equipe) : null
    const population = club ? club.id : clientId ? 'indiv' : null
    return { n, clientId, equipe, club, population, jour: isoLocal(new Date(n.created_at)) }
  })

  // Filtres : individuels + un par club présent dans les notifications chargées
  const clubs = []
  infos.forEach(i => { if (i.club && !clubs.find(c => c.id === i.club.id)) clubs.push(i.club) })
  const nonLues = pop => infos.filter(i => estNonLue(i.n) && (pop === 'toutes' || i.population === pop)).length
  const visibles = infos.filter(i => filtre === 'toutes' || i.population === filtre)

  // Classement par jour
  const jours = []
  const parJour = {}
  visibles.forEach(i => {
    if (!parJour[i.jour]) { parJour[i.jour] = []; jours.push(i.jour) }
    parJour[i.jour].push(i)
  })

  function ouvrir(i) {
    markRead(i.n.id)
    if (i.n.lien && i.n.lien.startsWith('/')) onOuvrir(i.n.lien)
  }
  function ligneSimple(i) {
    const nl = estNonLue(i.n)
    return (
      <div role="button" tabIndex={0} key={i.n.id} onClick={() => ouvrir(i)} onKeyDown={e => e.key === 'Enter' && ouvrir(i)}
        style={{ ...S.row, background: nl ? '#fafff0' : '#fff', cursor: i.n.lien ? 'pointer' : 'default' }}>
        <NotifIcon type={i.n.type} size={32} />
        <div style={S.txt}>
          <p style={{ ...S.t, fontWeight: nl ? 700 : 500 }}>
            {sansTiret(i.n.titre)}
          </p>
          {i.n.corps && <p style={S.c}>{sansTiret(i.n.corps)}</p>}
        </div>
        <span style={{ ...S.h, ...(nl ? S.hNonLue : null) }}>{heure(i.n.created_at)}</span>
      </div>
    )
  }

  const total = nonLues('toutes')
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <p style={S.sectionTitle}>Notifications{total > 0 && <span style={S.badge}>{total}</span>}</p>
        {total > 0 && <button onClick={markAllRead} style={S.miniBtn}>Tout marquer comme lu</button>}
      </div>
      {(clubs.length > 0 || infos.some(i => i.population === 'indiv')) && (
        <div style={S.filtres}>
          {[{ id: 'toutes', nom: 'Toutes' }, { id: 'indiv', nom: 'Individuels' }, ...clubs].map(f => {
            const on = filtre === f.id
            const n = nonLues(f.id)
            return (
              <button key={f.id} onClick={() => setFiltre(f.id)} style={{ ...S.catTab, ...(on ? S.catTabOn : null) }}>
                {f.parent_id === null && <LogoGroupe groupe={logoDe(f)} />}
                {f.nom}{n > 0 && <span style={{ fontWeight: 800 }}>{n}</span>}
              </button>
            )
          })}
        </div>
      )}

      {jours.length === 0 && <p style={S.vide}>{filtre === 'toutes' ? 'Aucune notification.' : 'Aucune notification pour ce filtre.'}</p>}
      {jours.map(j => (
        <div key={j}>
          <p style={S.jour}>{libelleJour(j)}</p>
          {parJour[j].map(ligneSimple)}
        </div>
      ))}

      {peutChargerPlus && (
        <div style={S.pied}><button onClick={chargerPlus} style={S.miniBtn}>Voir les notifications plus anciennes</button></div>
      )}
    </div>
  )
}

// Styles repris de Dashboard.js (card, cardHead, sectionTitle, miniBtn, catTab, navBadge)
const S = {
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', paddingBottom: '0.35rem' },
  cardHead: { padding: '0.8rem 1rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' },
  sectionTitle: { fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  badge: { background: '#e4f816', color: '#333333', borderRadius: 999, fontSize: '0.62rem', fontWeight: '800', padding: '1px 7px', marginLeft: '0.4rem', verticalAlign: 1 },
  miniBtn: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  filtres: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap', padding: '0.2rem 1rem 0.7rem' },
  catTab: { display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.8rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb', fontFamily: 'inherit' },
  catTabOn: { background: '#333333', color: '#e4f816', borderColor: '#333333' },
  jour: { fontSize: '0.7rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.7rem 1rem 0.3rem', borderTop: '1px solid #f6f7f8', margin: 0 },
  row: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.7rem 1rem', borderTop: '1px solid #f6f7f8' },
  txt: { flex: 1, minWidth: 0 },
  t: { margin: 0, fontSize: '0.85rem', color: '#1a1a1a' },
  c: { margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.45 },
  h: { fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 },
  hNonLue: { color: '#333333', fontWeight: 800 },
  pied: { display: 'flex', justifyContent: 'center', padding: '0.6rem 1rem 0.4rem', borderTop: '1px solid #f6f7f8' },
  vide: { color: '#6b7280', fontSize: '0.82rem', padding: '0.5rem 1rem 0.9rem', margin: 0 },
}
