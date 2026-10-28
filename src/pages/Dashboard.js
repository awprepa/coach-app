import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useNotifications } from '../hooks/useNotifications'
import { useAutoRefresh } from '../hooks/useAutoRefresh'
import FilNotifications, { LogoGroupe } from '../components/FilNotifications'
import AgendaSemaine, { LogoMini } from '../components/AgendaSemaine'
import SuiviClients, { ResumeEquipes } from '../components/SuiviClients'
import Icon from '../components/Icon'
import { isoLocal } from '../utils/dates'

// Tableau de bord coach, sur une seule page :
// - en haut, le résumé de la semaine (un clic sur un jour l'affiche à droite) ;
// - les notifications (regroupées), le jour choisi et « À traiter » ;
// - le suivi de la semaine des clients individuels et le résumé des équipes.

function getWeekBounds() {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: isoLocal(monday), end: isoLocal(sunday) }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { notifs, markRead, markAllRead, chargerPlus, toutCharge } = useNotifications()
  // Reste surligné tant que le coach n'a pas quitté cette page, même après
  // avoir cliqué dessus (marquer comme lu ne doit pas faire disparaître le
  // surlignage tout de suite — sinon on perd de vue ce qu'on vient de lire).
  const stillHighlighted = useRef(new Set()).current
  notifs.forEach(n => { if (!n.lu) stillHighlighted.add(n.id) })
  const [loading, setLoading]         = useState(true)
  const [clients, setClients]         = useState([])
  const [weekEvents, setWeekEvents]   = useState([])
  const [programmes, setProgrammes]   = useState([])
  const [groupes, setGroupes]         = useState([])
  const [membresGroupes, setMembresGroupes] = useState([]) // lignes groupe_membres (client_id, groupe_id)
  const [jour, setJour]               = useState(isoLocal()) // jour choisi dans le résumé de la semaine
  const [evtsSemaine, setEvtsSemaine] = useState([])

  // Phase 3 : rafraîchit le tableau de bord si le SW détecte des données à jour
  useAutoRefresh(() => fetchAll())

  useEffect(() => {
    fetchAll()
    // Enregistrer l'ID du coach dans app_settings
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('app_settings').upsert([{ key: 'coach_user_id', value: user.id }], { onConflict: 'key' })
      }
    })
    // Realtime : nouvelles entrées wellness
    const channel = supabase.channel('wellness-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wellness' },
        payload => {
          setClients(prev => prev.map(c =>
            c.id === payload.new.client_id ? { ...c, coach_notifie: false } : c
          ))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchAll() {
    const today = isoLocal()
    const { start, end } = getWeekBounds()

    const [
      { data: clientsData },
      { data: wData },
      { data: wLastData },
      { data: evts },
      { data: progsData },
      { data: groupesData },
      { data: membresData },
    ] = await Promise.all([
      supabase.from('clients').select('*').order('prenom'),
      supabase.from('wellness').select('*').gte('date', start).lte('date', end),
      // Dernier wellness rempli tous historiques confondus (pas juste cette semaine)
      supabase.from('wellness').select('client_id, date').order('date', { ascending: false }),
      supabase.from('evenements').select('*, clients(prenom, nom)')
        .gte('date', start).lte('date', end).order('date', { ascending: true }),
      supabase.from('programmes').select('id, client_id, nom, semaines, date_debut'),
      supabase.from('groupes').select('*').order('created_at'),
      supabase.from('groupe_membres').select('client_id, groupe_id'),
    ])

    const lastWellnessMap = {}
    for (const w of (wLastData || [])) { if (!lastWellnessMap[w.client_id]) lastWellnessMap[w.client_id] = w.date }

    const withWellness = (clientsData || []).map(c => {
      const wWeek = (wData || []).filter(w => w.client_id === c.id)
      const wToday = wWeek.find(w => w.date === today) || null
      return { ...c, wellness_today: wToday, wellness_week: wWeek, derniere_activite: lastWellnessMap[c.id] || null }
    })

    setClients(withWellness)
    setWeekEvents(evts || [])
    setProgrammes(progsData || [])
    setGroupes(groupesData || [])
    setMembresGroupes(membresData || [])
    setLoading(false)
  }

  async function marquerVu(clientId) {
    await supabase.from('clients').update({ coach_notifie: true }).eq('id', clientId)
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, coach_notifie: true } : c))
  }

  if (loading) return <div style={S.centered}><p style={{ color: '#6b7280' }}>Chargement...</p></div>

  // Exclure les clients inactifs de tous les calculs du dashboard
  const clientsActifs = clients.filter(c => c.actif !== false)

  // Alertes
  const wellnessAlertes = clientsActifs.filter(c => {
    const w = c.wellness_today
    if (!w) return false
    return (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 <= 2
  }).map(c => {
    const w = c.wellness_today
    return { ...c, avg: (w.sommeil + w.fatigue + w.douleurs + w.stress) / 4 }
  })

  const todayDate = new Date(); todayDate.setHours(0,0,0,0)
  const expirations = clientsActifs.filter(c => {
    if (!c.date_fin) return false
    const fin = new Date(c.date_fin + 'T00:00:00')
    const days = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 7
  }).map(c => {
    const fin = new Date(c.date_fin + 'T00:00:00')
    return { ...c, daysLeft: Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24)) }
  })

  // Programmes se terminant dans les 7 prochains jours (client actif uniquement)
  const progFinBientot = programmes.filter(p => {
    if (!p.date_debut) return false
    if (!clientsActifs.find(c => c.id === p.client_id)) return false
    const fin = new Date(p.date_debut + 'T00:00:00')
    fin.setDate(fin.getDate() + p.semaines * 7)
    const days = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    return days >= 0 && days <= 7
  }).map(p => {
    const fin = new Date(p.date_debut + 'T00:00:00')
    fin.setDate(fin.getDate() + p.semaines * 7)
    const daysLeft = Math.ceil((fin - todayDate) / (1000 * 60 * 60 * 24))
    const client = clientsActifs.find(c => c.id === p.client_id)
    return { ...p, daysLeft, clientNom: `${client.prenom} ${client.nom}`, clientId: p.client_id }
  })

  // Clients sans wellness depuis 3+ jours (actifs uniquement)
  const trois = new Date(todayDate); trois.setDate(trois.getDate() - 3)
  const troisStr = isoLocal(trois)
  const sansWellness = clientsActifs.filter(c => {
    const lastEntry = c.wellness_week?.sort((a, b) => b.date.localeCompare(a.date))[0]
    return !lastEntry || lastEntry.date < troisStr
  })

  const nouveaux = clientsActifs.filter(c => c.coach_notifie === false)
  const totalAlertes = wellnessAlertes.length + expirations.length + nouveaux.length + progFinBientot.length

  // Équipe de chaque joueur de groupe : l'équipe plutôt que le sous-groupe
  // (Avants, 3/4…) ou le club, pour l'afficher à côté de son nom
  const parIdGroupe = Object.fromEntries(groupes.map(g => [g.id, g]))
  const equipeDe = {}
  const rang = g => g.type === 'equipe' ? 3 : g.type === 'sous_groupe' ? 2 : 1
  for (const m of membresGroupes) {
    let g = parIdGroupe[m.groupe_id]
    if (!g) continue
    if (g.type === 'sous_groupe' && parIdGroupe[g.parent_id]) g = parIdGroupe[g.parent_id]
    const actuel = equipeDe[m.client_id]
    if (!actuel || rang(g) > rang(actuel)) equipeDe[m.client_id] = g
  }
  const avecLogo = g => { while (g && !g.logo_url && g.parent_id && parIdGroupe[g.parent_id]) g = parIdGroupe[g.parent_id]; return g }
  // Logo du club (ou de l'équipe) devant le nom d'un joueur de groupe
  function logoMembre(clientId, size = 14) {
    const g = avecLogo(equipeDe[clientId])
    return g ? <LogoGroupe groupe={g} size={size} /> : null
  }

  // Clients individuels (pas membres d'un groupe, actifs)
  const clientsIndividuels = clientsActifs.filter(c => !equipeDe[c.id])

  // Résumé par équipe : effectif, wellness du jour, moyenne, wellness bas
  const parEquipe = {}
  clientsActifs.forEach(c => {
    const g = equipeDe[c.id]
    if (!g) return
    const e = parEquipe[g.id] ||= { id: g.id, nom: g.nom, couleur: g.couleur, logo: avecLogo(g)?.logo_url, effectif: 0, vals: [] }
    e.effectif++
    if (c.wellness_today) { const w = c.wellness_today; e.vals.push((w.sommeil + w.fatigue + w.douleurs + w.stress) / 4) }
  })
  const equipes = Object.values(parEquipe)
    .map(e => ({ ...e, wellness: e.vals.length, moyenne: e.vals.length ? e.vals.reduce((a, b) => a + b, 0) / e.vals.length : null, bas: e.vals.filter(v => v <= 2).length }))
    .sort((a, b) => a.nom.localeCompare(b.nom))

  // Jour choisi dans le résumé de la semaine
  const evtsJour = evtsSemaine.filter(e => e.date === jour)
  const titreJour = new Date(jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={S.page}>
      {/* Adaptations mobile — aucune règle au-dessus de 820px */}
      <style>{`
        @media (max-width: 1100px){
          .dash-grille{grid-template-columns:1fr !important;}
        }
        @media (max-width: 820px){
          .dash-haut{grid-template-columns:1fr !important;}
          .dash-actions{flex-direction:row !important;align-items:center !important;justify-content:flex-start !important;}
        }
      `}</style>

      <div style={S.haut} className="dash-haut">
        <AgendaSemaine jour={jour} setJour={setJour} setEvenements={setEvtsSemaine} />
        <div style={S.actions} className="dash-actions">
          {totalAlertes > 0 && <span style={S.alertBadge}>{totalAlertes} à traiter</span>}
          <button style={S.btnPrimary} onClick={() => navigate('/nouveau-client')}>+ Nouveau client</button>
        </div>
      </div>

      <div style={S.grille} className="dash-grille">
        <FilNotifications
          notifs={notifs}
          estNonLue={n => stillHighlighted.has(n.id)}
          markRead={markRead}
          markAllRead={() => { stillHighlighted.clear(); markAllRead() }}
          onOuvrir={lien => navigate(lien)}
          clients={clients}
          groupes={groupes}
          equipeDe={equipeDe}
          chargerPlus={chargerPlus}
          peutChargerPlus={!toutCharge}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
          <SuiviClients clients={clientsIndividuels} programmes={programmes} evenements={weekEvents} />

          <div style={S.grille3}>
          {/* Jour choisi dans le résumé de la semaine */}
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={S.sectionTitle}>{titreJour}</span>
              {evtsJour.length > 0 && <span style={{ ...S.pill, background: '#f3f4f6', color: '#374151' }}>{evtsJour.length}</span>}
            </div>
            {evtsJour.length === 0 ? (
              <p style={S.empty}>Rien de prévu ce jour-là.</p>
            ) : evtsJour.map(ev => (
              <div role="button" tabIndex={0} key={ev.id} onClick={() => navigate(ev.lien)} onKeyDown={e => e.key === 'Enter' && navigate(ev.lien)} style={S.miniRow}>
                <div style={S.miniIco}>
                  {ev.groupe ? <LogoMini src={ev.logo} couleur={ev.couleur} size={18} /> : <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#374151' }}>{(ev.prenom || '?').charAt(0)}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={S.miniName}>{ev.titre}</p>
                  <p style={S.miniSub}>{ev.qui}{ev.heure ? ` · ${ev.heure}` : ''}</p>
                </div>
                {ev.terminee && <span style={{ ...S.pill, background: '#f0fdf4', color: '#15803d' }}>Fait</span>}
                <span style={S.chevron}>›</span>
              </div>
            ))}
          </div>

          {/* Alertes — à traiter en priorité */}
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={S.sectionTitle}>À traiter</span>
              {totalAlertes > 0 && <span style={{ ...S.pill, background: '#fef2f2', color: '#b91c1c' }}>{totalAlertes}</span>}
            </div>
            {totalAlertes === 0 && <p style={S.empty}>Rien à traiter aujourd'hui.</p>}
            {wellnessAlertes.map(c => (
              <div key={'w' + c.id} style={{ ...S.miniRow, cursor: 'default' }}>
                <div style={{ ...S.miniAva, background: '#fef2f2', color: '#b91c1c' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{logoMembre(c.id)}{c.prenom} {c.nom}</p><p style={S.miniSub}>Wellness bas · {c.avg.toFixed(1).replace('.', ',')}/4</p></div>
                <button style={S.miniBtnDark} onClick={() => navigate('/messages')}>Message</button>
                <button style={S.miniBtn} onClick={() => navigate(`/client/${c.id}`)}>Voir</button>
              </div>
            ))}
            {expirations.map(c => (
              <div key={'e' + c.id} style={{ ...S.miniRow, cursor: 'default' }}>
                <div style={{ ...S.miniAva, background: '#fffbeb', color: '#92400e' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{logoMembre(c.id)}{c.prenom} {c.nom}</p><p style={S.miniSub}>Abonnement expire {c.daysLeft === 0 ? "aujourd'hui" : `dans ${c.daysLeft} j`}</p></div>
                <button style={S.miniBtn} onClick={() => navigate(`/client/${c.id}`)}>Voir</button>
              </div>
            ))}
            {nouveaux.map(c => (
              <div key={'n' + c.id} style={{ ...S.miniRow, cursor: 'default' }}>
                <div style={{ ...S.miniAva, background: '#ede9fe', color: '#6d28d9' }}>{c.prenom?.[0]}{c.nom?.[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{logoMembre(c.id)}{c.prenom} {c.nom}</p><p style={S.miniSub}>Nouveau client</p></div>
                <button style={S.miniBtnDark} onClick={() => navigate(`/client/${c.id}`)}>Voir</button>
                <button style={S.miniBtn} onClick={() => marquerVu(c.id)}>Vu</button>
              </div>
            ))}
            {progFinBientot.map(p => (
              <div role="button" tabIndex={0} key={'p' + p.id} onClick={() => navigate(`/client/${p.clientId}`)} style={S.miniRow}>
                <div style={{ ...S.miniAva, background: '#e0f2fe', color: '#0284c7' }}><Icon name="clipboard" size={14} /></div>
                <div style={{ flex: 1, minWidth: 0 }}><p style={S.miniName}>{logoMembre(p.clientId)}{p.clientNom}</p><p style={S.miniSub}>Cycle « {p.nom} » · fin dans {p.daysLeft} j</p></div>
                <span style={S.chevron}>›</span>
              </div>
            ))}
            {sansWellness.length > 0 && (
              <div style={{ ...S.miniRow, cursor: 'default' }}>
                <div style={S.miniIco}><Icon name="bell" size={14} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={S.miniName}>{sansWellness.length} sans wellness depuis 3 j ou plus</p>
                  <p style={S.miniSub}>{sansWellness.slice(0, 3).map(c => c.prenom).join(', ')}{sansWellness.length > 3 ? ` +${sansWellness.length - 3}` : ''}</p>
                </div>
              </div>
            )}
          </div>

          <ResumeEquipes equipes={equipes} />
          </div>
        </div>
      </div>
    </div>
  )
}

const S = {
  page:        { padding: '2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  centered:    { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  haut:        { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '1rem', alignItems: 'stretch', marginBottom: '1rem' },
  actions:     { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.6rem', padding: '0.2rem 0' },
  grille:      { display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(0, 1.9fr)', gap: '1rem', alignItems: 'start' },
  grille3:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', alignItems: 'start' },
  card:        { background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', paddingBottom: '0.35rem' },
  cardHead:    { padding: '0.8rem 1rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty:       { color: '#6b7280', fontSize: '0.82rem', padding: '0.5rem 1rem 0.9rem', margin: 0 },
  miniRow:     { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 1rem', cursor: 'pointer', borderTop: '1px solid #f6f7f8' },
  miniIco:     { width: 28, height: 28, borderRadius: 7, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 },
  miniAva:     { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: '800', flexShrink: 0 },
  miniName:    { margin: 0, fontSize: '0.82rem', fontWeight: '700', color: '#333333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  miniSub:     { margin: 0, fontSize: '0.7rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  miniBtn:     { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  miniBtnDark: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 7, padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 },
  pill:        { borderRadius: 999, fontSize: '0.68rem', fontWeight: '800', padding: '0.15rem 0.5rem', whiteSpace: 'nowrap', flexShrink: 0 },
  alertBadge:  { background: '#fef2f2', color: '#b91c1c', padding: '0.3rem 0.75rem', borderRadius: 999, fontSize: '0.78rem', fontWeight: '800', whiteSpace: 'nowrap' },
  btnPrimary:  { background: '#333333', color: '#e4f816', border: 'none', borderRadius: '10px', padding: '0.6rem 1rem', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  sectionTitle:{ fontSize: '0.72rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  chevron:     { color: '#9ca3af', fontSize: '1.25rem' },
}
