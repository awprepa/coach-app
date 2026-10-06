import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { PageLoading } from '../components/Skeleton'

const MAX_SEMAINES_AFFICHEES = 8

function getSemaineActuelle(dateDebut) {
  if (!dateDebut) return 1
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.ceil((diffJours + 1) / 7))
}

function initiales(prenom, nom) {
  return ((prenom?.[0] || '') + (nom?.[0] || '')).toUpperCase() || '?'
}

function initialesGroupe(nom) {
  const mots = (nom || '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[1][0]).toUpperCase()
}

// Construit club > équipes > sous-groupes à partir de la liste plate, pour le
// menu déroulant groupé. Un club (type 'club') n'est jamais sélectionnable —
// c'est un simple "lobby" d'affichage pour ses équipes.
function construireArborescence(groupes) {
  const parNom = (a, b) => (a.nom || '').localeCompare(b.nom || '')
  const clubs = groupes.filter(g => g.type === 'club').sort(parNom).map(club => ({
    ...club,
    equipes: groupes
      .filter(g => g.type === 'equipe' && g.parent_id === club.id)
      .sort(parNom)
      .map(equipe => ({
        ...equipe,
        sousGroupes: groupes.filter(g => g.type === 'sous_groupe' && g.parent_id === equipe.id).sort(parNom),
      })),
  }))
  const equipesAutonomes = groupes
    .filter(g => g.type === 'equipe' && !g.parent_id)
    .sort(parNom)
    .map(equipe => ({
      ...equipe,
      sousGroupes: groupes.filter(g => g.type === 'sous_groupe' && g.parent_id === equipe.id).sort(parNom),
    }))
  return { clubs, equipesAutonomes }
}

// Fil d'ariane "Club › Équipe › Sous-groupe" pour le groupe sélectionné.
function cheminGroupe(groupeId, groupes) {
  const byId = Object.fromEntries(groupes.map(g => [g.id, g]))
  const chemin = []
  let courant = byId[groupeId]
  while (courant) {
    chemin.unshift(courant)
    courant = courant.parent_id ? byId[courant.parent_id] : null
  }
  return chemin
}

function formatDateEntree(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

export default function ChargesGroupes() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [groupes, setGroupes] = useState([])
  const [groupeId, setGroupeId] = useState(searchParams.get('groupe') || '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [exercices, setExercices] = useState([])     // [{ nom, ordre }] distincts, triés
  const [exerciceActif, setExerciceActif] = useState('')
  const [semaines, setSemaines] = useState([1])       // colonnes affichées
  const [lignes, setLignes] = useState([])            // [{ client, mesExos }]
  const [bestMap, setBestMap] = useState({})          // `${exercice_id}_${semaine}` → { poids, reps }

  // Référentiels : liste des groupes pour le menu déroulant (club > équipe >
  // sous-groupe). Un club n'est jamais sélectionné par défaut (type 'club'
  // écarté) — on démarre sur sa première équipe le cas échéant.
  useEffect(() => {
    supabase.from('groupes').select('id, nom, parent_id, type, logo_url').order('nom').then(({ data }) => {
      const all = data || []
      setGroupes(all)
      if (!groupeId && all.length > 0) {
        const premiereSelectionnable = all.find(g => g.type === 'equipe' || g.type === 'sous_groupe') || all[0]
        setGroupeId(premiereSelectionnable.id)
        setSearchParams({ groupe: premiereSelectionnable.id }, { replace: true })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ferme le menu déroulant au clic en dehors.
  useEffect(() => {
    function onClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const changerGroupe = (id) => {
    setGroupeId(id)
    setSearchParams({ groupe: id }, { replace: true })
    setPickerOpen(false)
  }

  // Chargement des charges du groupe sélectionné : membres → programme actif
  // de chacun → séances → exercices → séries validées (serie_tracking).
  const loadGroupe = useCallback(async (id) => {
    if (!id) return
    setLoading(true)
    setExercices([])
    setLignes([])

    const { data: membres } = await supabase.from('groupe_membres').select('client_id').eq('groupe_id', id)
    const clientIds = (membres || []).map(m => m.client_id)
    if (clientIds.length === 0) { setLoading(false); return }

    const { data: clients } = await supabase.from('clients').select('id, prenom, nom').in('id', clientIds)
    const clientById = {}
    ;(clients || []).forEach(c => { clientById[c.id] = c })

    // Programme actif = le plus récent par client.
    const { data: progs } = await supabase
      .from('programmes')
      .select('id, client_id, semaines, date_debut, created_at')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
    const progByClient = {}
    ;(progs || []).forEach(p => { if (!progByClient[p.client_id]) progByClient[p.client_id] = p })

    const progIds = Object.values(progByClient).map(p => p.id)
    if (progIds.length === 0) { setLoading(false); return }

    const { data: seances } = await supabase.from('seances').select('id, programme_id').in('programme_id', progIds)
    const progBySeance = {}
    ;(seances || []).forEach(s => { progBySeance[s.id] = s.programme_id })
    const seanceIds = (seances || []).map(s => s.id)
    if (seanceIds.length === 0) { setLoading(false); return }

    const { data: exos } = await supabase.from('exercices').select('id, nom, seance_id, ordre').in('seance_id', seanceIds)
    const exIds = (exos || []).map(e => e.id)
    if (exIds.length === 0) { setLoading(false); return }

    const { data: trackings } = await supabase
      .from('serie_tracking')
      .select('exercice_id, semaine, poids, reps_reelles, created_at')
      .in('exercice_id', exIds)
      .eq('is_done', true)

    // Liste des exercices distincts (par nom), ordonnés selon leur position
    // dans la séance pour retrouver l'ordre du programme.
    const ordreParNom = {}
    ;(exos || []).forEach(e => {
      if (!(e.nom in ordreParNom) || e.ordre < ordreParNom[e.nom]) ordreParNom[e.nom] = e.ordre
    })
    const nomsExercices = Object.keys(ordreParNom).sort((a, b) => ordreParNom[a] - ordreParNom[b])
    setExercices(nomsExercices)
    setExerciceActif(prev => nomsExercices.includes(prev) ? prev : (nomsExercices[0] || ''))

    // Semaine courante par client (pour calibrer les colonnes affichées).
    let semaineMax = 1
    clientIds.forEach(cid => {
      const p = progByClient[cid]
      if (!p) return
      const sActuelle = Math.min(getSemaineActuelle(p.date_debut), p.semaines || 999)
      if (sActuelle > semaineMax) semaineMax = sActuelle
    })
    semaineMax = Math.min(semaineMax, MAX_SEMAINES_AFFICHEES)
    const colonnes = Array.from({ length: semaineMax }, (_, i) => i + 1)
    setSemaines(colonnes)

    // meilleure charge (poids le + lourd) par exercice_id + semaine
    const best = {} // `${exercice_id}_${semaine}` → { poids, reps }
    ;(trackings || []).forEach(t => {
      const poids = parseFloat(t.poids)
      const reps = parseFloat(t.reps_reelles)
      if (!(poids > 0)) return
      const key = `${t.exercice_id}_${t.semaine}`
      if (!best[key] || poids > best[key].poids) best[key] = { poids, reps: reps || null, date: t.created_at || null }
    })

    // exercice_id → { nom, seance_id } pour relier aux clients
    const exoById = {}
    ;(exos || []).forEach(e => { exoById[e.id] = e })

    // Pour chaque client, retrouver ses propres exercices (par nom) et
    // construire la ligne [valeur_S1, valeur_S2, ...].
    const rows = clientIds.map(cid => {
      const client = clientById[cid]
      const prog = progByClient[cid]
      if (!client || !prog) return null
      const mesExos = (exos || []).filter(e => progBySeance[e.seance_id] === prog.id)
      return { client, mesExos }
    }).filter(Boolean)

    setLignes(rows.map(r => ({ client: r.client, mesExos: r.mesExos })))
    setBestMap(best)
    setLoading(false)
  }, [])

  useEffect(() => { if (groupeId) loadGroupe(groupeId) }, [groupeId, loadGroupe])

  function valeurPour(ligne, nomExercice, semaine) {
    const exo = ligne.mesExos.find(e => e.nom === nomExercice)
    if (!exo) return null
    return bestMap[`${exo.id}_${semaine}`] || null
  }

  const groupeActuel = groupes.find(g => g.id === groupeId)
  const { clubs, equipesAutonomes } = construireArborescence(groupes)
  const chemin = cheminGroupe(groupeId, groupes)
  const cheminLabel = chemin.map(g => g.nom).join(' › ')

  return (
    <div style={S.page}>
      <div style={S.head}>
        <div>
          <h1 style={S.h1}>Charges</h1>
          <p style={S.sub}>Poids utilisés et progression par exercice</p>
        </div>

        <div style={S.picker} ref={pickerRef}>
          <button onClick={() => setPickerOpen(o => !o)} style={S.pickerBtn}>
            {groupeActuel?.logo_url
              ? <img src={groupeActuel.logo_url} alt="" style={S.pickerLogo} />
              : <span style={S.pickerLogoFallback}>{initialesGroupe(groupeActuel?.nom)}</span>}
            <span style={S.pickerLabel}>{cheminLabel || 'Choisir un groupe'}</span>
            <IcoChevronDown />
          </button>

          {pickerOpen && (
            <div style={S.pickerMenu}>
              {clubs.map(club => (
                <div key={club.id} style={S.pickerClubBlock}>
                  <div style={S.pickerClubHead}>
                    {club.logo_url
                      ? <img src={club.logo_url} alt="" style={S.pickerClubLogo} />
                      : <span style={S.pickerClubLogoFallback}>{initialesGroupe(club.nom)}</span>}
                    <span style={S.pickerClubNom}>{club.nom}</span>
                  </div>
                  {club.equipes.length === 0 ? (
                    <p style={S.pickerVide}>Aucune équipe pour l'instant.</p>
                  ) : club.equipes.map(equipe => (
                    <div key={equipe.id}>
                      <button
                        onClick={() => changerGroupe(equipe.id)}
                        style={{ ...S.pickerEquipe, ...(equipe.id === groupeId ? S.pickerOptionOn : {}) }}
                      >
                        {equipe.nom}
                      </button>
                      {equipe.sousGroupes.map(sg => (
                        <button
                          key={sg.id}
                          onClick={() => changerGroupe(sg.id)}
                          style={{ ...S.pickerSousGroupe, ...(sg.id === groupeId ? S.pickerOptionOn : {}) }}
                        >
                          {sg.nom}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}

              {equipesAutonomes.length > 0 && (
                <div style={S.pickerClubBlock}>
                  {equipesAutonomes.map(equipe => (
                    <div key={equipe.id}>
                      <button
                        onClick={() => changerGroupe(equipe.id)}
                        style={{ ...S.pickerEquipe, ...(equipe.id === groupeId ? S.pickerOptionOn : {}) }}
                      >
                        {equipe.nom}
                      </button>
                      {equipe.sousGroupes.map(sg => (
                        <button
                          key={sg.id}
                          onClick={() => changerGroupe(sg.id)}
                          style={{ ...S.pickerSousGroupe, ...(sg.id === groupeId ? S.pickerOptionOn : {}) }}
                        >
                          {sg.nom}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && <PageLoading />}

      {!loading && exercices.length === 0 && (
        <p style={S.empty}>Aucun exercice suivi pour ce groupe pour l'instant.</p>
      )}

      {!loading && exercices.length > 0 && (
        <>
          <div style={S.exRow}>
            {exercices.map(nom => (
              <button
                key={nom}
                onClick={() => setExerciceActif(nom)}
                style={{ ...S.exChip, ...(nom === exerciceActif ? S.exChipOn : {}) }}
              >
                {nom}
              </button>
            ))}
          </div>

          <div style={S.contentHead}>
            <h2 style={S.h2}>{exerciceActif} — progression par semaine</h2>
            <span style={S.weekInfo}>{lignes.length} joueur{lignes.length > 1 ? 's' : ''}{cheminLabel ? ` · ${cheminLabel}` : ''}</span>
          </div>

          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, textAlign: 'left' }}>Joueur</th>
                  {semaines.map(s => (
                    <th key={s} style={{ ...S.th, ...(s === semaines[semaines.length - 1] ? S.thLast : {}) }}>S{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(ligne => {
                  const valeurs = semaines.map(s => valeurPour(ligne, exerciceActif, s))
                  const premiere = valeurs.find(v => v)
                  const derniere = valeurs[valeurs.length - 1]
                  const delta = (premiere && derniere && premiere.poids > 0)
                    ? Math.round((derniere.poids - premiere.poids) / premiere.poids * 100)
                    : null
                  return (
                    <tr key={ligne.client.id}>
                      <td style={{ ...S.td, textAlign: 'left' }}>
                        <div style={S.player}>
                          <div style={S.avatar}>{initiales(ligne.client.prenom, ligne.client.nom)}</div>
                          <span style={S.playerName}>{ligne.client.prenom} {ligne.client.nom}</span>
                        </div>
                      </td>
                      {valeurs.map((v, i) => {
                        const isLast = i === valeurs.length - 1
                        return (
                          <td key={i} style={S.td}>
                            {!v ? (
                              <span style={S.cellEmpty}>—</span>
                            ) : (
                              <div style={S.cellWrap}>
                                <div style={S.cell}>
                                  <span style={S.cellPoids}>{v.poids}kg</span>
                                  {v.reps && <span style={S.cellReps}>×{v.reps}</span>}
                                  {formatDateEntree(v.date) && <span style={S.cellDate}>{formatDateEntree(v.date)}</span>}
                                </div>
                                {isLast && delta != null && (
                                  <span style={{ ...S.delta, ...(delta > 0 ? S.deltaUp : S.deltaFlat) }}>
                                    {delta > 0 ? '+' : ''}{delta}%
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p style={S.legend}>
            Charge affichée = série la plus lourde validée cette semaine-là, avec la date de saisie. La pastille compare la dernière semaine à la première disponible. (Les entrées antérieures à l'ajout de l'horodatage n'affichent pas de date.)
          </p>
        </>
      )}
    </div>
  )
}

function IcoChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const S = {
  page: { padding: '1.25rem 1.5rem 2rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.1rem' },
  h1: { margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#111' },
  sub: { margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#8a8f98', fontWeight: 500 },
  empty: { fontSize: '0.86rem', color: '#8a8f98', fontWeight: 500 },

  picker: { position: 'relative' },
  pickerBtn: { display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '6px 12px 6px 6px', background: 'white', color: '#1a1a1a', cursor: 'pointer', fontFamily: 'inherit' },
  pickerLogo: { width: 26, height: 26, borderRadius: 7, objectFit: 'contain', border: '1px solid #eceef1', flexShrink: 0 },
  pickerLogoFallback: { width: 26, height: 26, borderRadius: 7, background: '#f2f3f5', color: '#6b7280', fontSize: '0.64rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pickerLabel: { fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' },

  pickerMenu: { position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 260, maxHeight: 420, overflowY: 'auto', background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: '0.5rem', zIndex: 20 },
  pickerClubBlock: { marginBottom: '0.4rem' },
  pickerClubHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.5rem' },
  pickerClubLogo: { width: 22, height: 22, borderRadius: 6, objectFit: 'contain', border: '1px solid #eceef1', flexShrink: 0 },
  pickerClubLogoFallback: { width: 22, height: 22, borderRadius: 6, background: '#f2f3f5', color: '#6b7280', fontSize: '0.58rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pickerClubNom: { fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' },
  pickerVide: { fontSize: '0.76rem', color: '#c7cbd1', padding: '0.2rem 0.8rem 0.5rem' },
  pickerEquipe: { display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.8rem', borderRadius: 8, border: 'none', background: 'none', fontSize: '0.86rem', fontWeight: 700, color: '#1a1a1a', cursor: 'pointer', fontFamily: 'inherit' },
  pickerSousGroupe: { display: 'block', width: '100%', textAlign: 'left', padding: '0.45rem 0.8rem 0.45rem 1.6rem', borderRadius: 8, border: 'none', background: 'none', fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' },
  pickerOptionOn: { background: '#e4f816', color: '#1f2937' },

  exRow: { display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.2rem', marginBottom: '1rem' },
  exChip: { flexShrink: 0, padding: '8px 14px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700, background: '#f9fafb', color: '#6b7280', border: '1.5px solid #e5e7eb', whiteSpace: 'nowrap', cursor: 'pointer' },
  exChipOn: { background: '#e4f816', color: '#1f2937', borderColor: '#e4f816' },

  contentHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' },
  h2: { margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111' },
  weekInfo: { fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600 },

  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid #e5e7eb', background: 'white' },
  table: { borderCollapse: 'collapse', width: '100%', minWidth: 480 },
  th: { background: '#f9fafb', fontSize: '0.64rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.7rem 0.85rem', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' },
  thLast: { color: '#111' },
  td: { padding: '0.7rem 0.85rem', textAlign: 'center', borderBottom: '1px solid #f1f2f4', fontVariantNumeric: 'tabular-nums' },

  player: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, background: '#f3f4f6', color: '#6b7280', fontSize: '0.68rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  playerName: { fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', color: '#1a1a1a' },

  cellWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cell: { display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 },
  cellPoids: { fontSize: '0.86rem', fontWeight: 800, color: '#111' },
  cellReps: { fontSize: '0.66rem', color: '#9ca3af' },
  cellDate: { fontSize: '0.6rem', color: '#c7cbd1', fontWeight: 500, marginTop: 1 },
  cellEmpty: { fontSize: '0.86rem', color: '#d1d5db', fontWeight: 600 },

  delta: { display: 'inline-flex', alignItems: 'center', fontSize: '0.66rem', fontWeight: 800, padding: '2px 7px', borderRadius: 999 },
  deltaUp: { background: '#ecfdf3', color: '#16a34a' },
  deltaFlat: { background: '#f3f4f6', color: '#9ca3af' },

  legend: { marginTop: '0.9rem', fontSize: '0.76rem', color: '#9ca3af', lineHeight: 1.5 },
}
