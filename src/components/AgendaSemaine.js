import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { isoLocal } from '../utils/dates'

// Résumé de la semaine en haut du tableau de bord coach : 7 jours, aujourd'hui
// en anthracite, jours passés grisés. Chaque jour liste les évènements des
// groupes (logo du club, matchs en rouge) et les séances des clients.
// Un clic sur un jour le choisit (détail affiché par le tableau de bord).

const NOMS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const LIBELLES = { match: 'Match', entrainement: 'Entraînement', muscu: 'Muscu', seance: 'Séance', competition: 'Compétition', repos: 'Repos', autre: 'Évènement' }
const VISIBLES = 3

function lundiDe(decalage) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + decalage * 7)
  return d
}

// Évènements d'une semaine, dans un format commun groupes / clients
export async function chargerSemaine(lundi) {
  const fin = new Date(lundi); fin.setDate(fin.getDate() + 6)
  const [debut, finIso] = [isoLocal(lundi), isoLocal(fin)]
  const [{ data: evs }, { data: gevs }] = await Promise.all([
    supabase.from('evenements').select('id, client_id, date, type, titre, terminee, seances(nom), clients(prenom, nom)')
      .gte('date', debut).lte('date', finIso),
    supabase.from('groupe_evenements').select('id, groupe_id, date, heure, type, titre, adversaire, domicile, terminee, groupes(nom, couleur, logo_url)')
      .gte('date', debut).lte('date', finIso),
  ])
  const liste = []
  ;(gevs || []).forEach(e => {
    const g = e.groupes || {}
    const titre = e.type === 'match'
      ? (e.adversaire ? `Match ${e.adversaire}` : (e.titre || 'Match')) + (e.domicile === false ? ' (ext.)' : '')
      : (e.titre || LIBELLES[e.type] || 'Évènement')
    liste.push({ id: 'g-' + e.id, groupe: true, date: e.date, heure: e.heure ? e.heure.slice(0, 5).replace(':', ' h ') : null, type: e.type, titre, qui: g.nom || 'Groupe', logo: g.logo_url, couleur: g.couleur, lien: `/groupe/${e.groupe_id}?tab=calendrier`, terminee: e.terminee })
  })
  ;(evs || []).forEach(e => {
    if (!e.client_id) return
    const c = e.clients || {}
    liste.push({ id: 'c-' + e.id, groupe: false, date: e.date, heure: null, type: e.type, titre: e.seances?.nom || e.titre || LIBELLES[e.type] || 'Évènement', qui: `${c.prenom || ''} ${(c.nom || '').charAt(0)}.`.trim(), prenom: c.prenom || '', lien: `/client/${e.client_id}`, terminee: e.terminee })
  })
  // Groupes d'abord (heure), puis clients
  return liste.sort((a, b) => (b.groupe - a.groupe) || (a.heure || '').localeCompare(b.heure || ''))
}

export function LogoMini({ src, couleur, size = 12 }) {
  return src
    ? <img src={src} alt="" loading="lazy" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 3, flexShrink: 0, marginRight: 4 }} />
    : <span style={{ width: size - 2, height: size - 2, borderRadius: 3, background: couleur || '#9ca3af', flexShrink: 0, marginRight: 4, display: 'inline-block' }} />
}

export default function AgendaSemaine({ jour, setJour, setEvenements }) {
  const [decalage, setDecalage] = useState(0)
  const [evts, setEvts] = useState([])
  const lundi = lundiDe(decalage)
  const lundiIso = isoLocal(lundi)
  const auj = isoLocal()

  useEffect(() => {
    let actif = true
    chargerSemaine(lundiDe(decalage)).then(l => { if (actif) { setEvts(l); setEvenements(l) } })
    return () => { actif = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decalage])

  const jours = NOMS.map((nom, i) => {
    const d = new Date(lundi); d.setDate(d.getDate() + i)
    return { nom, num: d.getDate(), iso: isoLocal(d) }
  })

  function changerSemaine(sens) {
    const nouveau = decalage + sens
    setDecalage(nouveau)
    // Le jour choisi suit : aujourd'hui sur la semaine en cours, sinon le lundi
    const l = lundiDe(nouveau)
    setJour(nouveau === 0 ? auj : isoLocal(l))
  }

  return (
    <div style={S.card}>
      <div style={S.tete}>
        <p style={S.titre}>Semaine du {lundi.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
        {decalage !== 0 && <button onClick={() => changerSemaine(-decalage)} style={S.lien}>Cette semaine</button>}
        <button onClick={() => changerSemaine(-1)} style={S.fleche} aria-label="Semaine précédente">‹</button>
        <button onClick={() => changerSemaine(1)} style={S.fleche} aria-label="Semaine suivante">›</button>
      </div>
      <div style={S.jours} key={lundiIso}>
        {jours.map(j => {
          const estAuj = j.iso === auj
          const passe = j.iso < auj
          const choisi = j.iso === jour
          const liste = evts.filter(e => e.date === j.iso)
          return (
            <button key={j.iso} onClick={() => setJour(j.iso)} aria-pressed={choisi}
              style={{ ...S.jour, ...(passe ? S.jourPasse : null), ...(estAuj ? S.jourAuj : null), ...(choisi && !estAuj ? S.jourChoisi : null) }}>
              <span style={{ ...S.nomJ, ...(estAuj ? { color: 'rgba(255,255,255,0.75)' } : null) }}>{j.nom}{estAuj ? " · aujourd'hui" : ''}</span>
              <span style={{ ...S.num, ...(passe ? { color: '#9ca3af' } : null), ...(estAuj ? { color: '#e4f816' } : null) }}>{j.num}</span>
              {liste.slice(0, VISIBLES).map(e => (
                <span key={e.id} style={{ ...S.ev, ...(estAuj ? S.evAuj : null), ...(e.type === 'match' ? (estAuj ? S.matchAuj : S.match) : null) }}>
                  {e.groupe && <LogoMini src={e.logo} couleur={e.couleur} />}
                  <span style={S.evTxt}>{e.groupe ? e.titre : `${e.prenom} · ${e.titre}`}</span>
                </span>
              ))}
              {liste.length > VISIBLES && <span style={{ ...S.plus, ...(estAuj ? { color: 'rgba(255,255,255,0.75)' } : null) }}>+ {liste.length - VISIBLES}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Styles repris de Dashboard.js (card, sectionTitle, miniBtn), rayons 10 / 16
const S = {
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', padding: '0.7rem 0.8rem 0.8rem', minWidth: 0 },
  tete: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0 0.2rem 0.55rem' },
  titre: { flex: 1, fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  lien: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
  fleche: { width: 30, height: 30, borderRadius: 7, border: 'none', background: '#f3f4f6', color: '#374151', fontSize: '1rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  jours: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(92px, 1fr))', gap: '0.35rem', overflowX: 'auto' },
  jour: { border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.45rem 0.5rem 0.5rem', background: '#fff', minHeight: 104, textAlign: 'left', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, cursor: 'pointer' },
  jourPasse: { background: '#fafafa' },
  jourAuj: { background: '#333333', borderColor: '#333333' },
  jourChoisi: { borderColor: '#333333' },
  nomJ: { fontSize: '0.66rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' },
  num: { fontSize: '1.15rem', fontWeight: 900, color: '#333333', lineHeight: 1 },
  ev: { display: 'flex', alignItems: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#374151', background: '#f3f4f6', borderRadius: 4, padding: '2px 5px', minWidth: 0 },
  evTxt: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  evAuj: { background: 'rgba(255,255,255,0.12)', color: '#fff' },
  match: { background: '#fef2f2', color: '#b91c1c' },
  matchAuj: { background: '#e4f816', color: '#333333' },
  plus: { fontSize: '0.66rem', fontWeight: 700, color: '#6b7280' },
}
