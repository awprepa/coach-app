import { supabase } from '../supabase'

// Un filtre .in() trop long dépasse la limite d'en-têtes HTTP/2 de Supabase et
// renvoie des données vides sans erreur : on découpe en lots.
const TAILLE_LOT_IN = 150

async function selectEnLots(table, cols, colonne, valeurs, filtres) {
  if (!valeurs.length) return []
  const lots = []
  for (let i = 0; i < valeurs.length; i += TAILLE_LOT_IN) lots.push(valeurs.slice(i, i + TAILLE_LOT_IN))
  const res = await Promise.all(lots.map(async lot => {
    let q = supabase.from(table).select(cols).in(colonne, lot)
    if (filtres) q = filtres(q)
    const { data, error } = await q
    if (error) { console.error(`[bilanClub] ${table}.${colonne}`, error.message); return [] }
    return data || []
  }))
  return res.flat()
}

// ── Dates (toujours en local, jamais toISOString) ────────────────────────────
export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dateDe(iso) { const [y, m, j] = iso.split('-').map(Number); return new Date(y, m - 1, j) }
function lundiDe(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7))
  return r
}
function numeroSemaineIso(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const j = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - j)
  const debut = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - debut) / 86400000 + 1) / 7)
}

export const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
export function libelleJour(iso) {
  const d = dateDe(iso)
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_LONG[d.getMonth()]}`
}
export function libelleCourt(iso) { const d = dateDe(iso); return `${d.getDate()} ${MOIS[d.getMonth()]}` }
function libelleSemaine(lundi, fin) {
  const d1 = lundi, d2 = fin
  const m1 = d1.getMonth() === d2.getMonth() ? '' : ' ' + MOIS[d1.getMonth()]
  return `S${numeroSemaineIso(lundi)} · ${d1.getDate()}${m1} au ${d2.getDate()} ${MOIS[d2.getMonth()]}`
}

// ── Séquences de jeu (oppositions) ───────────────────────────────────────────
export function formatDuree(sec) {
  if (!sec) return '0\''
  const m = Math.floor(sec / 60), s = sec % 60
  if (m === 0) return `${s}''`
  if (s === 0) return `${m}'`
  return `${m}'${String(s).padStart(2, '0')}`
}

// Découpe les séquences d'un bloc en séries (une série par bloc d'opposition),
// séparées par les séquences de type inter_bloc.
function seriesDeBloc(seqs) {
  const series = []
  let cur = []
  ;(seqs || []).forEach(s => {
    if (s.type === 'inter_bloc') { series.push(cur); cur = [] } else cur.push(s)
  })
  series.push(cur)
  return series.filter(s => s.length)
}

function resumeSerie(seqs, bloc, numero) {
  const jeu = seqs.filter(s => s.type === 'jeu')
  const recup = seqs.filter(s => s.type === 'recup')
  const durees = [...new Set(jeu.map(s => s.duree_sec || 0))]
  const seq = durees.length === 1
    ? `${jeu.length} de ${formatDuree(durees[0])}`
    : `${jeu.length} (${jeu.map(s => formatDuree(s.duree_sec)).join(' · ')})`
  const recDurees = [...new Set(recup.map(s => s.duree_sec || 0))]
  const recupTxt = recDurees.length ? recDurees.map(formatDuree).join(' à ') : (bloc.recup_inter_seq || '—')
  const themes = [...new Set(jeu.map(s => (s.theme || '').trim()).filter(Boolean))]
  const jeuSec = jeu.reduce((a, s) => a + (s.duree_sec || 0), 0)
  const totSec = jeuSec + recup.reduce((a, s) => a + (s.duree_sec || 0), 0)
  return {
    numero,
    effectif: bloc.effectif_desc || '',
    detail: [themes.join(' / '), bloc.conditions_jeu].filter(Boolean).join(' · '),
    sequences: seq, recup: recupTxt, jeuSec, totSec,
  }
}

function contenuTrame(blocs) {
  const lignes = []      // blocs standards : déroulé
  const oppositions = [] // blocs de séquences : tableau opposition
  let numero = 0
  let jeuTotal = 0
  ;(blocs || []).forEach(b => {
    if (b.bloc_type === 'sequences') {
      const lignesBloc = seriesDeBloc(b.sequences).map(s => resumeSerie(s, b, ++numero))
      lignesBloc.forEach(l => { jeuTotal += l.jeuSec })
      oppositions.push(...lignesBloc)
      lignes.push({ nom: b.nom || 'Opposition', duree: lignesBloc.reduce((a, l) => a + l.totSec, 0), contenu: `${lignesBloc.length} bloc${lignesBloc.length > 1 ? 's' : ''} · voir détail ci-dessous`, estOpposition: true })
    } else {
      lignes.push({
        nom: b.nom,
        duree: (parseInt(b.duree, 10) || 0) * 60,
        contenu: (b.exos || []).map(e => e.nom + (e.prescription ? ' · ' + e.prescription : '')).join(' ; '),
      })
    }
  })
  const totJeu = oppositions.reduce((a, l) => a + l.jeuSec, 0)
  const totTot = oppositions.reduce((a, l) => a + l.totSec, 0)
  return { lignes, oppositions, jeuTotal: totJeu || jeuTotal, totalOpposition: totTot }
}

const moyenne = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
const arrondi1 = v => v == null ? null : Math.round(v * 10) / 10

function libelleIntensite(ex) {
  const t = ex.type_intensite, v = ex.valeur_intensite
  if (!t || !v) return '—'
  if (t === 'Libre') return v
  return `${t} ${v}`
}

// ── Chargement + calcul ──────────────────────────────────────────────────────
export async function chargerBilan({ groupeId, debut, fin }) {
  const { data: groupe } = await supabase.from('groupes')
    .select('id, nom, couleur, couleur_secondaire, logo_url, parent_id').eq('id', groupeId).single()
  let club = null
  if (groupe.parent_id) {
    const { data } = await supabase.from('groupes').select('nom, couleur, couleur_secondaire, logo_url').eq('id', groupe.parent_id).maybeSingle()
    club = data
  }
  const identite = {
    nom: groupe.nom,
    clubNom: club?.nom || null,
    couleur: groupe.couleur || club?.couleur || '#184890',
    couleur2: groupe.couleur_secondaire || club?.couleur_secondaire || '#b42318',
    logo: groupe.logo_url || club?.logo_url || null,
  }

  const { data: membres } = await supabase.from('groupe_membres').select('client_id').eq('groupe_id', groupeId)
  const clientIds = (membres || []).map(m => m.client_id)
  const clients = await selectEnLots('clients', 'id, prenom, nom', 'id', clientIds)
  const nomClient = {}
  clients.forEach(c => { nomClient[c.id] = `${(c.prenom || '').charAt(0)}. ${c.nom || ''}`.trim() })
  const effectif = clientIds.length

  // Événements du groupe (entraînements + matchs) avec trame et documents
  const { data: evts } = await supabase.from('groupe_evenements')
    .select('id, date, heure, type, titre, adversaire, domicile, duree_min')
    .eq('groupe_id', groupeId).in('type', ['entrainement', 'match'])
    .gte('date', debut).lte('date', fin).order('date').order('heure')
  const evtIds = (evts || []).map(e => e.id)

  const blocsBruts = await selectEnLots('groupe_seance_blocs',
    '*, groupe_seance_exercices(*), groupe_seance_sequences(*)', 'evenement_id', evtIds)
  const blocsParEvt = {}
  blocsBruts.sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).forEach(b => {
    ;(blocsParEvt[b.evenement_id] ||= []).push({
      ...b,
      exos: (b.groupe_seance_exercices || []).sort((x, y) => (x.ordre || 0) - (y.ordre || 0)),
      sequences: (b.groupe_seance_sequences || []).sort((x, y) => (x.ordre || 0) - (y.ordre || 0)),
    })
  })
  const docs = await selectEnLots('groupe_evenement_documents', '*', 'evenement_id', evtIds)
  const docsParEvt = {}
  docs.sort((a, b) => a.ordre - b.ordre).forEach(d => { (docsParEvt[d.evenement_id] ||= []).push(d.image_url) })
  const rpes = await selectEnLots('groupe_seance_rpe', 'evenement_id, client_id, rpe_cardio, rpe_jambes, rpe_contact, absent', 'evenement_id', evtIds)
  const rpeParEvt = {}
  rpes.forEach(r => { (rpeParEvt[r.evenement_id] ||= []).push(r) })

  const terrain = (evts || []).map(e => {
    const reps = (rpeParEvt[e.id] || []).filter(r => !r.absent && r.rpe_cardio != null)
    const cardio = moyenne(reps.map(r => r.rpe_cardio))
    const jambes = moyenne(reps.map(r => r.rpe_jambes).filter(v => v != null))
    const contact = moyenne(reps.map(r => r.rpe_contact).filter(v => v != null))
    const rpe = reps.length ? moyenne(reps.map(r => moyenne([r.rpe_cardio, r.rpe_jambes, r.rpe_contact].filter(v => v != null)))) : null
    const trame = contenuTrame(blocsParEvt[e.id])
    return {
      id: e.id, date: e.date, type: e.type, titre: e.titre, adversaire: e.adversaire, domicile: e.domicile,
      duree: e.duree_min,
      presents: reps.length || null, rpe: arrondi1(rpe), cardio: arrondi1(cardio), jambes: arrondi1(jambes), contact: arrondi1(contact),
      documents: docsParEvt[e.id] || [],
      trame: trame.lignes.length ? trame : null,
      jeuSec: trame.jeuTotal,
    }
  })

  // Musculation : on part du PROGRAMME de chaque joueur (cycle, semaines, séances),
  // pas du calendrier — un joueur qui n'a rien saisi n'a aucun événement
  // calendrier, mais la séance était bien prévue. La date d'une séance = début
  // du cycle + 7 jours par semaine. Présent = au moins une série validée
  // (is_done) pour cette séance et cette semaine du programme.
  const progs = await selectEnLots('programmes', 'id, client_id, date_debut, semaines', 'client_id', clientIds)
  const progParId = {}
  progs.forEach(p => { progParId[p.id] = p })
  const seances = await selectEnLots('seances', 'id, programme_id, nom, ordre', 'programme_id', progs.map(p => p.id), q => q.eq('type', 'musculation'))
  const exos = await selectEnLots('exercices', 'id, seance_id, code, nom, series, repetitions, tempo, recuperation, type_intensite, valeur_intensite, ordre', 'seance_id', seances.map(x => x.id))
  const seanceDeExo = {}
  const exosParSeance = {}
  exos.sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).forEach(x => { seanceDeExo[x.id] = x.seance_id; (exosParSeance[x.seance_id] ||= []).push(x) })
  const suivi = await selectEnLots('serie_tracking', 'exercice_id, semaine', 'exercice_id', exos.map(x => x.id), q => q.eq('is_done', true))
  const faits = new Set()
  suivi.forEach(t => faits.add(`${seanceDeExo[t.exercice_id]}|${t.semaine}`))

  const aujourdhui = isoLocal(new Date())
  const groupesMuscu = {}
  seances.forEach(se => {
    const prog = progParId[se.programme_id]
    if (!prog?.date_debut) return
    for (let w = 1; w <= (prog.semaines || 0); w++) {
      const d = dateDe(prog.date_debut); d.setDate(d.getDate() + 7 * (w - 1))
      const date = isoLocal(d)
      if (date < debut || date > fin || date > aujourdhui) continue
      const g = (groupesMuscu[`${date}|${se.nom}`] ||= { date, nom: se.nom, clients: [], modele: se.id })
      g.clients.push({ id: prog.client_id, fait: faits.has(`${se.id}|${w}`) })
    }
  })
  const muscu = Object.values(groupesMuscu).map(g => {
    const presents = g.clients.filter(c => c.fait)
    return {
      date: g.date, nom: g.nom,
      presents: presents.length || null,
      absents: !presents.length ? [] : g.clients.filter(c => !c.fait).map(c => nomClient[c.id]).filter(Boolean).sort(),
      exercices: (exosParSeance[g.modele] || []).map(x => ({
        nom: (x.code ? x.code + ' · ' : '') + x.nom,
        seriesReps: [x.series, x.repetitions].filter(v => v != null && v !== '').join(' × ') || '—',
        tempo: x.tempo && x.tempo !== '-' ? x.tempo : '—',
        recup: x.recuperation || '—',
        intensite: libelleIntensite(x),
      })),
    }
  }).sort((a, b) => a.date.localeCompare(b.date))

  // Blessés (provisoire, en attendant la refonte) : actifs à une date donnée
  const { data: joueurs } = await supabase.from('groupe_joueurs').select('id').eq('groupe_id', groupeId)
  const joueurIds = (joueurs || []).map(j => j.id)
  const blessures = await selectEnLots('joueur_blessures', 'joueur_id, statut, date_debut, date_fin_reelle', 'joueur_id', joueurIds)
  const blessesAu = iso => blessures.filter(b => b.statut !== 'ok' && b.date_debut && b.date_debut <= iso && (!b.date_fin_reelle || b.date_fin_reelle > iso)).length
  const veille = new Date(dateDe(debut)); veille.setDate(veille.getDate() - 1)
  const blesses = { fin: blessesAu(fin), avant: blessesAu(isoLocal(veille)) }

  // Semaines (lundi → dimanche) couvrant la période
  const semaines = []
  for (let l = lundiDe(dateDe(debut)); l <= dateDe(fin); l.setDate(l.getDate() + 7)) {
    const lundi = new Date(l), dimanche = new Date(l); dimanche.setDate(dimanche.getDate() + 6)
    const a = isoLocal(lundi), b = isoLocal(dimanche)
    const entrainements = terrain.filter(t => t.type === 'entrainement' && t.date >= a && t.date <= b)
    const matchs = terrain.filter(t => t.type === 'match' && t.date >= a && t.date <= b)
    const mus = muscu.filter(m => m.date >= a && m.date <= b)
    const jours = {}
    mus.forEach(m => { (jours[m.date] ||= []).push({ kind: 'muscu', ...m }) })
    ;[...entrainements, ...matchs].forEach(t => { (jours[t.date] ||= []).push({ kind: t.type, ...t }) })
    semaines.push({
      cle: a, libelle: libelleSemaine(lundi, dimanche), debut: a, fin: b,
      muscu: { seances: mus.length, presents: arrondi1(moyenne(mus.map(m => m.presents).filter(v => v != null))) },
      entrainements: {
        nombre: entrainements.length,
        presents: arrondi1(moyenne(entrainements.map(t => t.presents).filter(v => v != null))),
        jeuSec: entrainements.reduce((a2, t) => a2 + t.jeuSec, 0),
        rpe: arrondi1(moyenne(entrainements.map(t => t.rpe).filter(v => v != null))),
      },
      matchs,
      jours: Object.keys(jours).sort().map(date => ({ date, items: jours[date] })),
    })
  }

  // Synthèse de la période
  const avecRpe = terrain.filter(t => t.rpe != null)
  return {
    identite, effectif, debut, fin, semaines,
    synthese: {
      seancesMuscu: muscu.length,
      presentsMuscu: arrondi1(moyenne(muscu.map(m => m.presents).filter(v => v != null))),
      rpeMoyen: arrondi1(moyenne(avecRpe.map(t => t.rpe))),
      blesses,
      courbeRpe: avecRpe.map(t => ({ date: t.date, rpe: t.rpe, type: t.type })),
    },
  }
}
