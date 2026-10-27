import { useState } from 'react'
import NotifIcon from './NotifIcon'
import { isoLocal } from '../utils/dates'

// Fil de notifications du tableau de bord coach.
// - Classées par jour (Aujourd'hui, Hier, puis la date).
// - La routine est regroupée : une ligne par équipe et par jour pour les
//   wellness, une ligne par équipe et par jour pour les RPE (notes + absences).
//   Le reste (blessures, wellness bas, notes de séance, séances, records…) reste
//   une ligne par notification.
// - Filtres : toutes, individuels, puis un filtre par club.
// - Logo du club devant le nom des joueurs d'un groupe, équipe écrite à côté.

const ROUTINE = { wellness: 'wellness', rpe: 'rpe', rpe_absence: 'rpe' }
const NOMS_VISIBLES = 8

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
  const [ouverts, setOuverts] = useState({})

  const parId = Object.fromEntries(groupes.map(g => [g.id, g]))
  const clientParId = Object.fromEntries(clients.map(c => [c.id, c]))
  const clubDe = g => { let x = g; while (x?.parent_id && parId[x.parent_id]) x = parId[x.parent_id]; return x }
  // Logo affiché : celui de l'équipe, sinon celui d'un groupe parent
  const logoDe = g => { let x = g; while (x && !x.logo_url && x.parent_id) x = parId[x.parent_id]; return x?.logo_url ? x : g }
  const effectif = {}
  Object.values(equipeDe).forEach(g => { if (g) effectif[g.id] = (effectif[g.id] || 0) + 1 })

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

  // Regroupement de la routine, par jour
  const jours = []
  const parJour = {}
  visibles.forEach(i => {
    if (!parJour[i.jour]) { parJour[i.jour] = []; jours.push(i.jour) }
    const famille = ROUTINE[i.n.type]
    const liste = parJour[i.jour]
    if (famille) {
      const cle = `${famille}:${i.equipe?.id || i.population || 'autre'}`
      const lot = liste.find(x => x.cle === cle)
      if (lot) { lot.items.push(i); return }
      liste.push({ cle, famille, equipe: i.equipe, items: [i] })
    } else {
      liste.push({ cle: i.n.id, items: [i] })
    }
  })

  function ouvrir(i) {
    markRead(i.n.id)
    if (i.n.lien && i.n.lien.startsWith('/')) onOuvrir(i.n.lien)
  }
  function basculer(lot) {
    lot.items.forEach(i => { if (!i.n.lu) markRead(i.n.id) })
    setOuverts(o => ({ ...o, [lot.cle]: !o[lot.cle] }))
  }

  const nomCourt = c => c ? `${c.prenom} ${(c.nom || '').charAt(0)}.` : null
  // Nom du joueur d'une notification de routine : fiche client, sinon début du titre
  const joueurDe = i => nomCourt(clientParId[i.clientId]) || sansTiret(i.n.titre).replace(/ (a noté|était absent).*$/, '')

  function ligneSimple(i) {
    const nl = estNonLue(i.n)
    return (
      <div role="button" tabIndex={0} key={i.n.id} onClick={() => ouvrir(i)} onKeyDown={e => e.key === 'Enter' && ouvrir(i)}
        style={{ ...S.row, background: nl ? '#fafff0' : '#fff', cursor: i.n.lien ? 'pointer' : 'default' }}>
        <NotifIcon type={i.n.type} size={32} />
        <div style={S.txt}>
          <p style={{ ...S.t, fontWeight: nl ? 700 : 500 }}>
            {i.equipe && <LogoGroupe groupe={logoDe(i.equipe)} />}
            {sansTiret(i.n.titre)}
            {i.equipe && <span style={S.equipe}>{i.equipe.nom}</span>}
          </p>
          {i.n.corps && <p style={S.c}>{sansTiret(i.n.corps)}</p>}
        </div>
        <span style={S.h}>{heure(i.n.created_at)}</span>
        {nl && <span style={S.point} />}
      </div>
    )
  }

  function ligneLot(lot, jour) {
    if (lot.items.length === 1) return ligneSimple(lot.items[0])
    const nl = lot.items.some(i => estNonLue(i.n))
    const ouvert = !!ouverts[lot.cle]
    const auj = jour === isoLocal()
    const nomEquipe = lot.equipe?.nom || (lot.items[0].population === 'indiv' ? 'Individuels' : '')
    let titre, detail, chips
    if (lot.famille === 'wellness') {
      // Joueurs distincts ; moyenne et « bas » seulement pour aujourd'hui (wellness du jour connu)
      const ids = [...new Set(lot.items.map(i => i.clientId).filter(Boolean))]
      const moyennes = auj ? ids.map(id => {
        const w = clientParId[id]?.wellness_today
        return w ? (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 : null
      }) : []
      const connues = moyennes.filter(v => v != null)
      const bas = connues.filter(v => v <= 2).length
      const total = lot.equipe ? effectif[lot.equipe.id] : null
      titre = `Wellness · ${nomEquipe}`
      detail = [
        `${ids.length} réponse${ids.length > 1 ? 's' : ''}${total ? ` sur ${total}` : ''}`,
        connues.length ? `moyenne ${(connues.reduce((a, b) => a + b, 0) / connues.length).toFixed(1).replace('.', ',')}/4` : null,
        bas ? `${bas} bas` : null,
      ].filter(Boolean).join(' · ')
      chips = ids.map((id, k) => {
        const v = moyennes[k]
        return { cle: id, id, texte: `${nomCourt(clientParId[id]) || 'Joueur'}${v != null ? ` ${v.toFixed(1).replace('.', ',')}` : ''}`, bas: v != null && v <= 2 }
      })
    } else {
      const notes = lot.items.filter(i => i.n.type === 'rpe')
      const absents = lot.items.filter(i => i.n.type === 'rpe_absence')
      titre = `RPE · ${nomEquipe}`
      detail = [`${notes.length} note${notes.length > 1 ? 's' : ''}`, absents.length ? `${absents.length} absent${absents.length > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')
      chips = lot.items.map(i => ({ cle: i.n.id, id: i.clientId, lien: i.n.lien, texte: `${joueurDe(i)}${i.n.type === 'rpe_absence' ? ' · absent' : ''}`, bas: false }))
    }
    const premiere = lot.items[lot.items.length - 1].n.created_at
    const montres = ouvert ? chips : chips.slice(0, NOMS_VISIBLES)
    return (
      <div key={lot.cle} style={{ ...S.row, background: nl ? '#fafff0' : '#fff' }}>
        <NotifIcon type={lot.famille === 'wellness' ? 'wellness' : 'rpe'} size={32} />
        <div style={S.txt}>
          <button onClick={() => basculer(lot)} style={S.lotBtn} aria-expanded={ouvert}>
            <p style={{ ...S.t, fontWeight: nl ? 700 : 500 }}>
              {lot.equipe && <LogoGroupe groupe={logoDe(lot.equipe)} />}{titre}
            </p>
            <p style={S.c}>{detail}</p>
          </button>
          <div style={S.noms}>
            {montres.map(ch => (
              <button key={ch.cle} onClick={() => onOuvrir(ch.id ? `/client/${ch.id}` : ch.lien)}
                style={{ ...S.nom, ...(ch.bas ? S.nomBas : null) }}>{ch.texte}</button>
            ))}
            {!ouvert && chips.length > NOMS_VISIBLES && (
              <button onClick={() => basculer(lot)} style={S.nom}>+ {chips.length - NOMS_VISIBLES}</button>
            )}
          </div>
        </div>
        <span style={S.h}>depuis {heure(premiere)}</span>
        {nl && <span style={S.point} />}
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
          {parJour[j].map(lot => ligneLot(lot, j))}
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
  equipe: { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginLeft: '0.35rem' },
  c: { margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.45 },
  h: { fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 },
  point: { width: 7, height: 7, borderRadius: '50%', background: '#e4f816', boxShadow: '0 0 0 1.5px #333333', flexShrink: 0, marginTop: 5 },
  lotBtn: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' },
  noms: { display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' },
  nom: { fontSize: '0.72rem', fontWeight: 700, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 999, padding: '0.15rem 0.55rem', cursor: 'pointer', fontFamily: 'inherit' },
  nomBas: { background: '#fef2f2', color: '#b91c1c' },
  pied: { display: 'flex', justifyContent: 'center', padding: '0.6rem 1rem 0.4rem', borderTop: '1px solid #f6f7f8' },
  vide: { color: '#6b7280', fontSize: '0.82rem', padding: '0.5rem 1rem 0.9rem', margin: 0 },
}
