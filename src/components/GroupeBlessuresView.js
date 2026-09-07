import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { parseDureeToDate, formatRetour } from './BlessureButton'

const ZONES_PRECISES = ['Cheville', 'Genou', 'Ischio-jambiers', 'Mollet', 'Cuisse', 'Épaule', 'Dos', 'Tête / Cou', 'Poignet / Main', 'Autre']
const TYPES_LESION = [
  { v: 'entorse', label: 'Entorse' },
  { v: 'claquage', label: 'Claquage' },
  { v: 'contracture', label: 'Contracture' },
  { v: 'dechirure', label: 'Déchirure' },
  { v: 'tendinite', label: 'Tendinite' },
  { v: 'fracture', label: 'Fracture' },
  { v: 'commotion', label: 'Commotion' },
  { v: 'autre', label: 'Autre' },
]
const MECANISMES = [{ v: 'contact', label: 'Contact' }, { v: 'non_contact', label: 'Non-contact' }]
const GRAVITES = [{ v: 'grade_1', label: 'Grade I' }, { v: 'grade_2', label: 'Grade II' }, { v: 'grade_3', label: 'Grade III' }]
const GRAVITE_COLOR = { grade_1: '#d97706', grade_2: '#dc2626', grade_3: '#991b1b' }
const NIVEAUX = [
  { v: 'repos_total', label: 'Repos total' },
  { v: 'course_seule', label: 'Course seule' },
  { v: 'sans_contact', label: 'Sans contact' },
  { v: 'entrainement_complet', label: 'Entraîn. complet' },
]
const STEP_LABELS = [...NIVEAUX.map(n => n.label), 'Apte match']

// Même mapping poste (numéro de maillot) → nom que FicheGroupe.js / CalendrierSaison.js
const POSTE_NOMS = {
  1: 'Pilier', 2: 'Talonneur', 3: 'Pilier',
  4: '2e ligne', 5: '2e ligne',
  6: '3e ligne', 7: '3e ligne', 8: '3e ligne',
  9: 'Demi de mêlée', 10: "Demi d'ouverture",
  12: 'Centre', 13: 'Centre',
  11: 'Ailier', 15: 'Arrière', 14: 'Ailier',
}
// Ordre "feuille de match" pour le tri par poste
const POSTE_ORDER = ['Pilier', 'Talonneur', '2e ligne', '3e ligne', 'Demi de mêlée', "Demi d'ouverture", 'Centre', 'Ailier', 'Arrière']

// Niveaux de zoom du calendrier historique = largeur totale de la frise en px
// px: null = occupe toute la largeur disponible du panneau (pas de scroll horizontal)
const ZOOM_LEVELS = [
  { px: null, label: 'Saison' },
  { px: 1500, label: '~2 mois' },
  { px: 2400, label: '~1 mois' },
  { px: 4200, label: '~2 semaines' },
]

function posteLabel(j) {
  const postes = j.joueur_postes || []
  const primary = postes.find(p => p.is_primary) || postes[0]
  return primary ? (POSTE_NOMS[primary.poste] || `Poste ${primary.poste}`) : 'Non renseigné'
}
// Couleur stable par joueur (basée sur sa position dans l'effectif, indépendante du tri en cours)
function colorForIndex(i) {
  return `hsl(${(i * 47) % 360} 62% 42%)`
}

function stepIndex(episode) {
  if (episode.statut === 'ok') return 4
  const idx = NIVEAUX.findIndex(n => n.v === episode.niveau)
  return idx >= 0 ? idx : 0
}
function joursDepuis(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.round((new Date() - new Date(dateStr + 'T00:00:00')) / 86400000))
}
function dureeEpisode(ep) {
  const fin = ep.date_fin_reelle || new Date().toISOString().slice(0, 10)
  return Math.max(0, Math.round((new Date(fin + 'T00:00:00') - new Date(ep.date_debut + 'T00:00:00')) / 86400000))
}
function formatDateFull(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function initiales(prenom, nom) {
  return `${(prenom || '?')[0] || ''}${(nom || '?')[0] || ''}`.toUpperCase()
}
function labelLesion(ep) {
  const t = TYPES_LESION.find(t => t.v === ep.type_lesion)?.label
  const parts = [t, ep.zone_precise].filter(Boolean)
  if (parts.length) return parts.join(' · ')
  return ep.description || 'Blessure'
}

// Suggestion automatique de protocole selon la zone/le type — le coach peut
// toujours changer manuellement dans le formulaire.
const ZONE_TO_PROTO_GUESS = {
  'Cheville': 'entorse_cheville',
  'Genou': 'genou_lcm',
  'Ischio-jambiers': 'lesion_musculaire',
  'Mollet': 'lesion_musculaire',
  'Cuisse': 'lesion_musculaire',
  'Épaule': 'epaule',
  'Dos': 'cotes_lombaires',
  'Tête / Cou': 'cervical',
  'Poignet / Main': 'poignet_main',
  'Autre': null,
}
function guessProtocoleSlug(typeLesion, zonePrecise) {
  if (typeLesion === 'commotion') return 'commotion'
  if (typeLesion === 'fracture') return 'fracture'
  return ZONE_TO_PROTO_GUESS[zonePrecise] || null
}
// Page "Suivi blessures" d'un groupe : blessés actuels avec palier de reprise,
// indisponibilités en cours, calendrier historique de tout l'effectif, stats
// de saison, historique détaillé par joueur, et déclaration/édition d'un
// épisode côté coach.
export default function GroupeBlessuresView({ groupeId, accent }) {
  const [joueurs, setJoueurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { episode?, joueurId } — présent = modale ouverte
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [showRecidives, setShowRecidives] = useState(false)
  const [sortMode, setSortMode] = useState('nom') // 'nom' | 'poste' — tri du calendrier historique
  const [zoomIdx, setZoomIdx] = useState(0)       // index dans ZOOM_LEVELS
  const [filterMode, setFilterMode] = useState('tous') // 'tous' | 'saison' | 'actuel' — filtre du calendrier historique
  const [protocoles, setProtocoles] = useState([])
  const [protoModal, setProtoModal] = useState(null) // null | {mode:'list'} | {mode:'edit', id, nom, paliers}
  const [testsPanel, setTestsPanel] = useState(null) // { ep, joueur, tests, checked } — checklist avant de changer de palier

  useEffect(() => { load(); loadProtocoles() }, [groupeId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('groupe_joueurs')
      .select('id, prenom, nom, joueur_postes(poste, is_primary), joueur_blessures(*)')
      .eq('groupe_id', groupeId)
      .order('nom')
    setJoueurs(data || [])
    setLoading(false)
  }

  async function loadProtocoles() {
    const { data } = await supabase.from('blessure_protocoles').select('*').order('nom')
    setProtocoles(data || [])
  }

  const currentCases = useMemo(() => {
    const cases = []
    joueurs.forEach(j => (j.joueur_blessures || []).forEach(ep => {
      if (ep.statut !== 'ok') cases.push({ joueur: j, ep })
    }))
    return cases.sort((a, b) => joursDepuis(b.ep.date_debut) - joursDepuis(a.ep.date_debut))
  }, [joueurs])

  const allEpisodes = useMemo(() => {
    const list = []
    joueurs.forEach(j => (j.joueur_blessures || []).forEach(ep => list.push({ joueur: j, ep })))
    return list.sort((a, b) => (b.ep.date_debut || '').localeCompare(a.ep.date_debut || ''))
  }, [joueurs])

  const zoneStats = useMemo(() => {
    const counts = {}
    allEpisodes.forEach(({ ep }) => {
      const z = ep.zone_precise || (ep.zone === 'haut' ? 'Haut du corps' : ep.zone === 'bas' ? 'Bas du corps' : 'Général')
      counts[z] = (counts[z] || 0) + 1
    })
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const max = rows[0]?.[1] || 1
    return { rows, max }
  }, [allEpisodes])

  const saisonStats = useMemo(() => {
    const joursCumules = allEpisodes.reduce((s, { ep }) => s + dureeEpisode(ep), 0)
    const dureeMoyenne = allEpisodes.length ? Math.round(joursCumules / allEpisodes.length) : 0
    const retourProche = currentCases.filter(({ ep }) => {
      if (!ep.date_retour_prevue) return false
      const j = Math.ceil((new Date(ep.date_retour_prevue + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
      return j >= 0 && j <= 7
    }).length
    // Récidive = même joueur, même zone, plus d'un épisode
    const parJoueurZone = {}
    allEpisodes.forEach(({ joueur, ep }) => {
      const zoneKey = ep.zone_precise || (ep.zone === 'haut' ? 'Haut du corps' : ep.zone === 'bas' ? 'Bas du corps' : 'Général')
      const key = joueur.id + '|' + zoneKey
      ;(parJoueurZone[key] ||= { joueur, zone: zoneKey, episodes: [] }).episodes.push(ep)
    })
    const groupesRecidive = Object.values(parJoueurZone).filter(g => g.episodes.length > 1)
      .map(g => ({ ...g, episodes: g.episodes.sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || '')) }))
    return {
      joursCumules, dureeMoyenne, retourProche,
      recidives: groupesRecidive.length,
      groupesRecidive,
      joueursJamaisBlesses: joueurs.length - new Set(allEpisodes.map(e => e.joueur.id)).size,
    }
  }, [allEpisodes, currentCases, joueurs])

  // Plage de la saison complète (1er juillet → 30 juin), affichée en entier
  // même sur sa partie future — pour se projeter sur les blessures longues.
  const seasonRange = useMemo(() => {
    const now = new Date()
    const anneeDebut = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
    const START = new Date(anneeDebut, 6, 1)
    const END = new Date(anneeDebut + 1, 6, 1)
    return { START, END, totalDays: (END - START) / 86400000, today: now }
  }, [])

  // Effectif complet (blessés ou non) avec poste et couleur stable, pour le
  // calendrier historique — l'ordre de la couleur/index ne dépend pas du tri.
  const rosterGantt = useMemo(() => {
    // Ignore les fiches vides (créées sans prénom ni nom) — sinon elles
    // apparaissent comme des lignes sans nom en tête du calendrier.
    return joueurs
      .filter(j => (j.prenom || '').trim() || (j.nom || '').trim())
      .map((j, i) => ({
        joueur: j,
        poste: posteLabel(j),
        color: colorForIndex(i),
        episodes: [...(j.joueur_blessures || [])].sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || '')),
      }))
  }, [joueurs])

  const historique = useMemo(() => {
    const q = search.trim().toLowerCase()
    return joueurs
      .filter(j => (j.joueur_blessures || []).length > 0)
      .filter(j => !q || `${j.prenom} ${j.nom}`.toLowerCase().includes(q))
      .map(j => ({ joueur: j, episodes: [...j.joueur_blessures].sort((a, b) => (b.date_debut || '').localeCompare(a.date_debut || '')) }))
      .sort((a, b) => (b.episodes[0]?.date_debut || '').localeCompare(a.episodes[0]?.date_debut || ''))
  }, [joueurs, search])

  function openDeclare(joueurId) {
    const zone_precise = ZONES_PRECISES[0], type_lesion = 'entorse'
    const guess = protocoles.find(p => p.slug === guessProtocoleSlug(type_lesion, zone_precise))
    setModal({
      joueurId: joueurId || '', episodeId: null,
      zone_precise, type_lesion, mecanisme: '', gravite: '',
      niveau: 'repos_total', description: '', duree_estimee: '', date_retour_prevue: '',
      date_debut: new Date().toISOString().slice(0, 10),
      protocole_id: guess?.id || '', protocoleTouched: false,
    })
  }
  function openEdit(joueur, ep) {
    setModal({
      joueurId: joueur.id, episodeId: ep.id,
      zone_precise: ep.zone_precise || '', type_lesion: ep.type_lesion || 'entorse', mecanisme: ep.mecanisme || '', gravite: ep.gravite || '',
      niveau: ep.niveau || 'repos_total', description: ep.description || '', duree_estimee: ep.duree_estimee || '',
      date_retour_prevue: ep.date_retour_prevue || '', date_debut: ep.date_debut,
      protocole_id: ep.protocole_id || '', protocoleTouched: true,
    })
  }
  // Ré-évalue la suggestion de protocole quand zone/type changent, sauf si le
  // coach a déjà choisi un protocole manuellement dans le formulaire ouvert.
  function updateModalZoneType(patch) {
    setModal(m => {
      const next = { ...m, ...patch }
      if (!m.protocoleTouched) {
        const guess = protocoles.find(p => p.slug === guessProtocoleSlug(next.type_lesion, next.zone_precise))
        next.protocole_id = guess?.id || ''
      }
      return next
    })
  }

  async function submitModal() {
    if (!modal.joueurId) return
    setSaving(true)
    const parsed = parseDureeToDate(modal.duree_estimee)
    const payload = {
      statut: 'out',
      zone: 'general',
      zone_precise: modal.zone_precise || null,
      type_lesion: modal.type_lesion || null,
      mecanisme: modal.mecanisme || null,
      gravite: modal.gravite || null,
      niveau: modal.niveau,
      description: modal.description.trim() || null,
      duree_estimee: modal.duree_estimee.trim() || null,
      date_retour_prevue: parsed || modal.date_retour_prevue || null,
      protocole_id: modal.protocole_id || null,
      updated_at: new Date().toISOString(),
    }
    if (modal.episodeId) {
      await supabase.from('joueur_blessures').update(payload).eq('id', modal.episodeId)
    } else {
      await supabase.from('joueur_blessures').insert({ joueur_id: modal.joueurId, date_debut: modal.date_debut, ...payload })
    }
    setSaving(false)
    setModal(null)
    load()
  }

  // Tests à valider pour le palier en cours de l'épisode, selon son protocole.
  function testsDuPalier(ep) {
    const proto = protocoles.find(p => p.id === ep.protocole_id)
    return proto?.paliers?.[ep.niveau]?.tests || []
  }

  function demanderPalierSuivant(joueur, ep) {
    const tests = testsDuPalier(ep)
    if (tests.length === 0) { avancerPalier(ep); return }
    setTestsPanel({ joueur, ep, tests, checked: ep.tests_valides?.[ep.niveau] || [] })
  }

  async function avancerPalier(ep, testsValidesPalier) {
    const idx = NIVEAUX.findIndex(n => n.v === ep.niveau)
    const tests_valides = testsValidesPalier ? { ...(ep.tests_valides || {}), [ep.niveau]: testsValidesPalier } : ep.tests_valides
    if (idx < 0 || idx >= NIVEAUX.length - 1) {
      await marquerApte(ep, tests_valides)
      return
    }
    await supabase.from('joueur_blessures').update({ niveau: NIVEAUX[idx + 1].v, tests_valides, updated_at: new Date().toISOString() }).eq('id', ep.id)
    setTestsPanel(null)
    load()
  }

  async function marquerApte(ep, tests_valides) {
    await supabase.from('joueur_blessures')
      .update({ statut: 'ok', date_fin_reelle: new Date().toISOString().slice(0, 10), tests_valides: tests_valides ?? ep.tests_valides, updated_at: new Date().toISOString() })
      .eq('id', ep.id)
    setTestsPanel(null)
    load()
  }

  return (
    <div>
      <div style={S.head}>
        <p style={S.headSub}>{loading ? 'Chargement…' : `${currentCases.length} joueur${currentCases.length > 1 ? 's' : ''} blessé${currentCases.length > 1 ? 's' : ''} actuellement`}</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setProtoModal({ mode: 'list' })} style={S.btnSecondaryPill}>Protocoles de reprise</button>
          <button onClick={() => openDeclare(null)} style={{ ...S.btnPrimary, background: accent }}>+ Déclarer une blessure</button>
        </div>
      </div>

      {/* ── Blessés actuellement + Indisponibilités en cours ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }} className="gbv-stats">
        <style>{`@media (max-width: 820px){ .gbv-stats{ grid-template-columns:1fr !important; } }`}</style>

        <div style={S.panel}>
          <div style={S.panelHead}><span style={S.panelLabel}>Blessés actuellement</span><span style={S.panelCount}>{currentCases.length} joueur{currentCases.length > 1 ? 's' : ''}</span></div>
          {currentCases.length === 0 ? (
            <p style={S.empty}>Personne n'est blessé pour l'instant.</p>
          ) : (
            <div style={S.caseGrid}>
              {currentCases.map(({ joueur, ep }) => {
                const idx = stepIndex(ep)
                return (
                  <div key={ep.id} style={S.case}>
                    <div style={S.caseTop}>
                      <div style={S.avatar}>{initiales(joueur.prenom, joueur.nom)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={S.caseName}>{joueur.prenom} {joueur.nom}</p>
                        <p style={S.caseMeta}>
                          {labelLesion(ep)}
                          {ep.gravite && (
                            <span style={{ ...S.sevBadge, background: (GRAVITE_COLOR[ep.gravite] || '#6b7280') + '18', color: GRAVITE_COLOR[ep.gravite] || '#6b7280', borderColor: (GRAVITE_COLOR[ep.gravite] || '#6b7280') + '44' }}>
                              {GRAVITES.find(g => g.v === ep.gravite)?.label}
                            </span>
                          )}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={S.daysOutNum}>{joursDepuis(ep.date_debut)}</div>
                        <div style={S.daysOutLbl}>jours</div>
                      </div>
                    </div>

                    {ep.description && labelLesion(ep) !== ep.description && (
                      <p style={S.caseDesc}>{ep.description}</p>
                    )}
                    {ep.protocole_id && (
                      <p style={S.protoTag}>Protocole : {protocoles.find(p => p.id === ep.protocole_id)?.nom || '—'}</p>
                    )}

                    <div style={S.paliers}>
                      {STEP_LABELS.map((lbl, i) => (
                        <div key={i} style={S.pal}>
                          <div style={{
                            ...S.palDot,
                            ...(i < idx ? { background: accent, borderColor: accent, color: 'white' }
                              : i === idx ? { borderColor: accent, color: accent, boxShadow: `0 0 0 3px ${accent}22` } : {}),
                          }}>
                            {i < idx ? '✓' : i + 1}
                          </div>
                          {i < STEP_LABELS.length - 1 && (
                            <div style={{ ...S.palLine, ...(i < idx ? { background: accent } : {}) }} />
                          )}
                          <span style={{ ...S.palLbl, ...(i === idx ? { color: accent, fontWeight: 800 } : {}) }}>{lbl}</span>
                        </div>
                      ))}
                    </div>

                    <div style={S.caseFoot}>
                      <span style={S.caseReturn}>{formatRetour(ep.date_retour_prevue) || 'Retour non estimé'}</span>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => openEdit(joueur, ep)} style={S.btnGhost}>Modifier</button>
                        <button onClick={() => demanderPalierSuivant(joueur, ep)} style={S.btnGhost}>{idx >= NIVEAUX.length - 1 ? 'Marquer apte' : 'Palier suivant'}</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={S.panel}>
          <div style={S.panelHead}><span style={S.panelLabel}>Indisponibilités en cours</span><span style={S.panelCount}>{currentCases.length} joueur{currentCases.length > 1 ? 's' : ''}</span></div>
          {currentCases.length === 0 ? (
            <p style={S.empty}>Aucune indisponibilité en cours.</p>
          ) : (
            <div style={S.indispoList}>
              {currentCases.map(({ joueur, ep }) => (
                <div key={ep.id} style={S.indispoRow} onClick={() => openEdit(joueur, ep)}>
                  <div style={S.avatarSmall}>{initiales(joueur.prenom, joueur.nom)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={S.indispoName}>{joueur.prenom} {joueur.nom}</p>
                    <p style={S.indispoZone}>{labelLesion(ep)}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={S.indispoDaysNum}>{joursDepuis(ep.date_debut)}</div>
                    <div style={S.indispoDaysLbl}>jours</div>
                    <p style={S.indispoRetour}>{formatRetour(ep.date_retour_prevue) || 'retour indéterminé'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Calendrier historique : tout l'effectif, précis au jour, saison complète ── */}
      <div style={{ ...S.panel, marginBottom: '1.25rem' }}>
        <div style={{ ...S.panelHead, flexWrap: 'wrap' }}>
          <span style={S.panelLabel}>Historique des blessures</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
            <div style={S.filterBtns}>
              {[['tous', 'Tout l’effectif'], ['saison', 'Blessés cette saison'], ['actuel', 'Blessés actuellement']].map(([v, lbl], i, arr) => (
                <button key={v} onClick={() => setFilterMode(v)}
                  style={{ ...S.filterBtn, ...(i === arr.length - 1 ? { borderRight: 'none' } : {}), ...(filterMode === v ? { background: accent, color: '#1a1a1a' } : {}) }}>
                  {lbl}
                </button>
              ))}
            </div>
            <div style={S.zoomCtrl}>
              <button onClick={() => setZoomIdx(z => Math.max(0, z - 1))} disabled={zoomIdx === 0} style={S.zoomBtn}>−</button>
              <span style={S.zoomLbl}>{ZOOM_LEVELS[zoomIdx].label}</span>
              <button onClick={() => setZoomIdx(z => Math.min(ZOOM_LEVELS.length - 1, z + 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1} style={S.zoomBtn}>+</button>
            </div>
          </div>
        </div>
        <div style={{ padding: '0 1.1rem 1.1rem' }}>
          <GanttHistorique roster={rosterGantt} seasonRange={seasonRange} sortMode={sortMode} setSortMode={setSortMode}
            filterMode={filterMode} zoomPx={ZOOM_LEVELS[zoomIdx].px} accent={accent} onEdit={openEdit} />
        </div>
      </div>

      {/* ── Stats de saison ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }} className="gbv-stats">
        <style>{`@media (max-width: 820px){ .gbv-stats{ grid-template-columns:1fr !important; } }`}</style>

        <div style={S.panel}>
          <div style={S.panelHead}><span style={S.panelLabel}>Répartition par zone · saison</span></div>
          <div style={{ paddingBottom: '0.6rem' }}>
            {zoneStats.rows.length === 0 ? <p style={S.empty}>Aucune donnée pour l'instant.</p> : zoneStats.rows.map(([zone, n]) => (
              <div key={zone} style={S.zoneRow}>
                <span style={S.zoneLbl}>{zone}</span>
                <div style={S.zoneTrack}><div style={{ ...S.zoneFill, width: `${(n / zoneStats.max) * 100}%`, background: accent }} /></div>
                <span style={S.zoneVal}>{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={S.panel}>
          <div style={S.panelHead}><span style={S.panelLabel}>Chiffres de la saison</span></div>
          <div>
            <div style={S.statLine}><span style={S.statLbl}>Blessés actuellement</span><span style={S.statVal}>{currentCases.length}</span></div>
            <div style={S.statLine}><span style={S.statLbl}>Retour prévu sous 7 jours</span><span style={S.statVal}>{saisonStats.retourProche}</span></div>
            <div style={S.statLine}><span style={S.statLbl}>Jours d'indispo cumulés</span><span style={S.statVal}>{saisonStats.joursCumules}</span></div>
            <div style={S.statLine}><span style={S.statLbl}>Durée moyenne d'arrêt</span><span style={S.statVal}>{saisonStats.dureeMoyenne} jour{saisonStats.dureeMoyenne > 1 ? 's' : ''}</span></div>
            <div style={{ ...S.statLine, cursor: saisonStats.recidives > 0 ? 'pointer' : 'default' }} onClick={() => saisonStats.recidives > 0 && setShowRecidives(v => !v)}>
              <span style={S.statLbl}>Blessures avec récidive</span>
              <span style={{ ...S.statVal, color: saisonStats.recidives > 0 ? accent : undefined, textDecoration: saisonStats.recidives > 0 ? 'underline' : 'none' }}>
                {saisonStats.recidives}{saisonStats.recidives > 0 ? (showRecidives ? ' ▲' : ' ▾') : ''}
              </span>
            </div>
            {showRecidives && saisonStats.groupesRecidive.length > 0 && (
              <div style={{ padding: '0.2rem 1.2rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {saisonStats.groupesRecidive.map((g, i) => (
                  <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.8rem', fontWeight: 800 }}>{g.joueur.prenom} {g.joueur.nom} <span style={{ fontWeight: 600, color: '#6b7280' }}>· {g.zone}</span></p>
                    {g.episodes.map(ep => (
                      <div key={ep.id} onClick={() => openEdit(g.joueur, ep)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#6b7280', padding: '0.15rem 0', cursor: 'pointer' }}>
                        <span>{formatDateFull(ep.date_debut)}{ep.date_fin_reelle ? ` – ${formatDateFull(ep.date_fin_reelle)}` : ep.statut !== 'ok' ? ' – en cours' : ''}</span>
                        <span>{dureeEpisode(ep)} j</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div style={S.statLine}><span style={S.statLbl}>Joueurs jamais blessés</span><span style={S.statVal}>{saisonStats.joueursJamaisBlesses} / {joueurs.length}</span></div>
          </div>
        </div>
      </div>

      {/* ── Historique par joueur ── */}
      <details style={{ ...S.panel, padding: 0 }}>
        <summary style={S.histSummary}>
          <span style={S.panelLabel}>Historique par joueur</span>
          <span style={S.panelCount}>{historique.length} joueur{historique.length > 1 ? 's' : ''} avec un historique · déplier</span>
        </summary>
        <div style={{ padding: '0 1.2rem 0.9rem', maxWidth: 620 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un joueur…" style={S.searchInput} />
        </div>
        {historique.length === 0 ? (
          <p style={S.empty}>Aucun historique de blessure pour ce groupe.</p>
        ) : historique.map(({ joueur, episodes }) => (
          <div key={joueur.id} style={{ padding: '0.6rem 1.2rem', borderTop: '1px solid #f3f4f6', maxWidth: 620 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <div style={S.histAvatar}>{initiales(joueur.prenom, joueur.nom)}</div>
              <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>{joueur.prenom} {joueur.nom}</span>
              <span style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{episodes.length} blessure{episodes.length > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', paddingLeft: '2.5rem' }}>
              {episodes.map(ep => (
                <div key={ep.id} onClick={() => openEdit(joueur, ep)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.76rem', cursor: 'pointer' }}>
                  <span style={{ color: '#9ca3af', width: 170, flexShrink: 0 }}>
                    {formatDateFull(ep.date_debut)}{ep.date_fin_reelle ? ` – ${formatDateFull(ep.date_fin_reelle)}` : ep.statut !== 'ok' ? ' – en cours' : ''}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600 }}>
                    {labelLesion(ep)}{ep.gravite ? ` (${GRAVITES.find(g => g.v === ep.gravite)?.label})` : ''}
                  </span>
                  <span style={{ color: '#6b7280' }}>{dureeEpisode(ep)} j</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </details>

      {/* ── Modale déclarer/modifier ── */}
      {modal && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>{modal.episodeId ? 'Modifier la blessure' : 'Déclarer une blessure'}</p>

            {!modal.episodeId && (
              <>
                <label style={S.label}>Joueur</label>
                <select value={modal.joueurId} onChange={e => setModal(m => ({ ...m, joueurId: e.target.value }))} style={{ ...S.input, width: '100%', marginBottom: '0.75rem' }}>
                  <option value="">— Choisir —</option>
                  {joueurs.map(j => <option key={j.id} value={j.id}>{j.prenom} {j.nom}</option>)}
                </select>
              </>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Zone touchée</label>
                <select value={modal.zone_precise} onChange={e => updateModalZoneType({ zone_precise: e.target.value })} style={{ ...S.input, width: '100%' }}>
                  {ZONES_PRECISES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Type de lésion</label>
                <select value={modal.type_lesion} onChange={e => updateModalZoneType({ type_lesion: e.target.value })} style={{ ...S.input, width: '100%' }}>
                  {TYPES_LESION.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <label style={S.label}>Protocole de reprise</label>
            <select value={modal.protocole_id} onChange={e => setModal(m => ({ ...m, protocole_id: e.target.value, protocoleTouched: true }))} style={{ ...S.input, width: '100%', marginBottom: '0.75rem' }}>
              <option value="">Aucun (protocole générique)</option>
              {protocoles.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Mécanisme</label>
                <select value={modal.mecanisme} onChange={e => setModal(m => ({ ...m, mecanisme: e.target.value }))} style={{ ...S.input, width: '100%' }}>
                  <option value="">—</option>
                  {MECANISMES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Gravité</label>
                <select value={modal.gravite} onChange={e => setModal(m => ({ ...m, gravite: e.target.value }))} style={{ ...S.input, width: '100%' }}>
                  <option value="">—</option>
                  {GRAVITES.map(g => <option key={g.v} value={g.v}>{g.label}</option>)}
                </select>
              </div>
            </div>

            <label style={S.label}>Palier de reprise actuel</label>
            <select value={modal.niveau} onChange={e => setModal(m => ({ ...m, niveau: e.target.value }))} style={{ ...S.input, width: '100%', marginBottom: '0.75rem' }}>
              {NIVEAUX.map(n => <option key={n.v} value={n.v}>{n.label}</option>)}
            </select>

            <label style={S.label}>Description</label>
            <textarea value={modal.description} onChange={e => setModal(m => ({ ...m, description: e.target.value }))} rows={2}
              placeholder="Ex : entorse cheville gauche à l'entraînement" style={{ ...S.input, width: '100%', marginBottom: '0.75rem', resize: 'vertical', fontFamily: 'inherit' }} />

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.35rem' }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Durée estimée</label>
                <input value={modal.duree_estimee} onChange={e => setModal(m => ({ ...m, duree_estimee: e.target.value }))} placeholder="ex : 3 semaines" style={{ ...S.input, width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Retour prévu le</label>
                <input type="date" value={parseDureeToDate(modal.duree_estimee) || modal.date_retour_prevue} onChange={e => setModal(m => ({ ...m, date_retour_prevue: e.target.value }))} style={{ ...S.input, width: '100%' }} />
              </div>
            </div>
            <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0 0 1rem' }}>Survenue le {formatDateFull(modal.date_debut)}</p>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setModal(null)} style={S.btnSecondary}>Annuler</button>
              <button onClick={submitModal} disabled={saving || !modal.joueurId} style={{ ...S.btnPrimary, flex: 1, background: accent, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checklist de tests avant de changer de palier ── */}
      {testsPanel && (
        <div style={S.overlay} onClick={() => setTestsPanel(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>
              Avant de passer à « {stepIndex(testsPanel.ep) >= NIVEAUX.length - 1 ? 'Apte match' : NIVEAUX[stepIndex(testsPanel.ep) + 1]?.label} »
            </p>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 1rem' }}>
              {testsPanel.joueur.prenom} {testsPanel.joueur.nom} — coche les tests validés (informatif, tu peux passer au palier suivant sans tout cocher).
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.1rem' }}>
              {testsPanel.tests.map(t => (
                <label key={t.id} style={S.testCheckRow}>
                  <input type="checkbox" checked={testsPanel.checked.includes(t.id)}
                    onChange={e => setTestsPanel(tp => ({ ...tp, checked: e.target.checked ? [...tp.checked, t.id] : tp.checked.filter(id => id !== t.id) }))} />
                  <span>
                    <span style={S.testCheckNom}>{t.nom}</span>
                    <span style={S.testCheckCritere}>{t.critere}</span>
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setTestsPanel(null)} style={S.btnSecondary}>Annuler</button>
              <button onClick={() => avancerPalier(testsPanel.ep, testsPanel.checked)} style={{ ...S.btnPrimary, flex: 1, background: accent }}>
                {stepIndex(testsPanel.ep) >= NIVEAUX.length - 1 ? 'Marquer apte' : 'Passer au palier suivant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Éditeur de protocoles de reprise ── */}
      {protoModal?.mode === 'list' && (
        <div style={S.overlay} onClick={() => setProtoModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Protocoles de reprise</p>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0 0 1rem' }}>
              Protocole par type de blessure : contenu de chaque palier et tests à valider avant de passer au suivant. Tu peux ajouter, modifier ou supprimer un test, ou le déplacer vers un autre palier.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
              {protocoles.map(p => (
                <div key={p.id} style={S.protoListRow}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: '0.84rem' }}>{p.nom}</p>
                    {p.description && <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>{p.description}</p>}
                  </div>
                  <button onClick={() => setProtoModal({ mode: 'edit', id: p.id, nom: p.nom, paliers: JSON.parse(JSON.stringify(p.paliers || {})) })} style={S.btnGhost}>Modifier</button>
                </div>
              ))}
            </div>
            <button onClick={() => setProtoModal(null)} style={S.btnSecondary}>Fermer</button>
          </div>
        </div>
      )}

      {protoModal?.mode === 'edit' && (
        <div style={S.overlay} onClick={() => setProtoModal(null)}>
          <div style={{ ...S.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>{protoModal.nom}</p>
            {NIVEAUX.map((niv, ni) => {
              const palier = protoModal.paliers[niv.v] || { description: '', tests: [] }
              function updatePalier(patch) {
                setProtoModal(pm => ({ ...pm, paliers: { ...pm.paliers, [niv.v]: { ...pm.paliers[niv.v], ...patch } } }))
              }
              function updateTest(ti, patch) {
                updatePalier({ tests: palier.tests.map((t, i) => i === ti ? { ...t, ...patch } : t) })
              }
              function removeTest(ti) {
                updatePalier({ tests: palier.tests.filter((_, i) => i !== ti) })
              }
              function addTest() {
                updatePalier({ tests: [...palier.tests, { id: `t${Date.now()}`, nom: '', critere: '' }] })
              }
              function moveTest(ti, dir) {
                const targetNiv = NIVEAUX[ni + dir]
                if (!targetNiv) return
                const test = palier.tests[ti]
                setProtoModal(pm => {
                  const src = pm.paliers[niv.v]
                  const dst = pm.paliers[targetNiv.v] || { description: '', tests: [] }
                  return {
                    ...pm,
                    paliers: {
                      ...pm.paliers,
                      [niv.v]: { ...src, tests: src.tests.filter((_, i) => i !== ti) },
                      [targetNiv.v]: { ...dst, tests: [...dst.tests, test] },
                    },
                  }
                })
              }
              return (
                <div key={niv.v} style={S.protoPalierBlock}>
                  <p style={S.protoPalierTitle}>{niv.label}</p>
                  <textarea value={palier.description || ''} onChange={e => updatePalier({ description: e.target.value })} rows={2}
                    placeholder="Ce qui se travaille à ce palier…" style={{ ...S.input, width: '100%', marginBottom: '0.6rem', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.8rem' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    {palier.tests.map((t, ti) => (
                      <div key={t.id} style={S.protoTestRow}>
                        <input value={t.nom} onChange={e => updateTest(ti, { nom: e.target.value })} placeholder="Nom du test" style={{ ...S.input, flex: '1 1 40%', fontSize: '0.76rem' }} />
                        <input value={t.critere} onChange={e => updateTest(ti, { critere: e.target.value })} placeholder="Critère de réussite" style={{ ...S.input, flex: '1 1 40%', fontSize: '0.76rem' }} />
                        <button onClick={() => moveTest(ti, -1)} disabled={ni === 0} style={S.protoTestBtn} title="Déplacer au palier précédent">↑</button>
                        <button onClick={() => moveTest(ti, 1)} disabled={ni === NIVEAUX.length - 1} style={S.protoTestBtn} title="Déplacer au palier suivant">↓</button>
                        <button onClick={() => removeTest(ti)} style={{ ...S.protoTestBtn, color: '#dc2626' }} title="Supprimer">✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={addTest} style={S.btnGhost}>+ Ajouter un test</button>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={() => setProtoModal({ mode: 'list' })} style={S.btnSecondary}>Annuler</button>
              <button
                onClick={async () => {
                  await supabase.from('blessure_protocoles').update({ paliers: protoModal.paliers, updated_at: new Date().toISOString() }).eq('id', protoModal.id)
                  await loadProtocoles()
                  setProtoModal({ mode: 'list' })
                }}
                style={{ ...S.btnPrimary, flex: 1, background: accent }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Calendrier historique de tout l'effectif : une ligne par joueur, une
// couleur par joueur, positionné au jour près sur la saison complète
// (affichée jusqu'à son terme même si elle n'est pas encore passée, pour
// se projeter sur les blessures longues). Tri par clic sur les en-têtes de
// colonne, zoom horizontal via ZOOM_LEVELS.
function GanttHistorique({ roster, seasonRange, sortMode, setSortMode, filterMode, zoomPx, accent, onEdit }) {
  const { START, END, totalDays, today } = seasonRange
  const rosterFiltre = filterMode === 'actuel' ? roster.filter(r => r.episodes.some(ep => ep.statut !== 'ok'))
    : filterMode === 'saison' ? roster.filter(r => r.episodes.length > 0)
    : roster
  const fmtShort = d => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  const pct = d => Math.max(0, Math.min(100, ((d - START) / 86400000 / totalDays) * 100))

  const monthTicks = []
  {
    let d = new Date(seasonRange.START)
    while (d < END) {
      // Format court ("juil. '25") pour ne pas se superposer quand beaucoup
      // de mois sont visibles (zoom "Saison").
      const label = `${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')} ’${String(d.getFullYear()).slice(-2)}`
      monthTicks.push({ left: pct(d), label })
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    }
  }
  const weekTicks = []
  {
    let d = new Date(START)
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7)) // premier lundi
    while (d < END) { weekTicks.push(pct(new Date(d))); d.setDate(d.getDate() + 7) }
  }

  let rows
  if (sortMode === 'poste') {
    const postesPresents = [...new Set(rosterFiltre.map(r => r.poste))]
    const ordered = [...POSTE_ORDER.filter(p => postesPresents.includes(p)), ...postesPresents.filter(p => !POSTE_ORDER.includes(p)).sort()]
    rows = ordered.map(poste => ({ poste, joueurs: rosterFiltre.filter(r => r.poste === poste).sort((a, b) => a.joueur.nom.localeCompare(b.joueur.nom)) }))
  } else {
    rows = [{ poste: null, joueurs: [...rosterFiltre].sort((a, b) => a.joueur.nom.localeCompare(b.joueur.nom)) }]
  }

  function Row({ r }) {
    const { joueur, poste, color, episodes } = r
    return (
      <div style={S.gRow}>
        <div style={S.gName}>
          <span style={{ ...S.gNameTxt, color }}>{joueur.prenom} {joueur.nom}</span>
          <span style={S.gPoste}>{poste}</span>
        </div>
        <div style={S.gTrack}>
          {weekTicks.map((l, i) => <div key={i} style={{ ...S.gGridline, left: `${l}%` }} />)}
          {episodes.map(ep => {
            const d0 = new Date(ep.date_debut + 'T00:00:00')
            const d1 = ep.date_fin_reelle ? new Date(ep.date_fin_reelle + 'T00:00:00') : today
            const left = pct(d0), width = Math.max(0.4, pct(d1) - pct(d0))
            const enCours = ep.statut !== 'ok'
            const dates = `${fmtShort(d0)} → ${ep.date_fin_reelle ? fmtShort(new Date(ep.date_fin_reelle + 'T00:00:00')) : fmtShort(today) + ' (en cours)'}`
            return (
              <div key={ep.id} onClick={() => onEdit(joueur, ep)}
                style={{ ...S.gBar, left: `${left}%`, width: `${width}%`, background: color, opacity: enCours ? 1 : 0.45 }}
                title={`${joueur.prenom} ${joueur.nom} — ${labelLesion(ep)} : ${dates}`}>
                {width > 7 && <span style={S.gBarLbl}>{labelLesion(ep)} · {dates}</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={S.gWrap}>
      <div style={zoomPx ? { width: Math.max(zoomPx, 700) } : { width: '100%' }}>
        <div style={S.gHead}>
          <div style={S.gNameCol}>
            <button onClick={() => setSortMode('nom')} style={{ ...S.gColSort, ...(sortMode === 'nom' ? { color: '#1a1a1a' } : {}) }}>Joueur <span style={S.gSortArrow}>▾</span></button>
            <button onClick={() => setSortMode('poste')} style={{ ...S.gColSort, marginLeft: 'auto', ...(sortMode === 'poste' ? { color: '#1a1a1a' } : {}) }}>Poste <span style={S.gSortArrow}>▾</span></button>
          </div>
          <div style={S.gTimeCol}>
            {weekTicks.map((l, i) => <div key={i} style={{ ...S.gWeekTick, left: `${l}%` }} />)}
            {monthTicks.map((m, i) => (
              <div key={i}>
                <div style={{ ...S.gMonthTick, left: `${m.left}%` }} />
                <span style={{ ...S.gMonthLbl, left: `calc(${m.left}% + 5px)` }}>{m.label}</span>
              </div>
            ))}
            <div style={{ ...S.gTodayLine, left: `${pct(today)}%`, borderColor: accent }} title="Aujourd'hui" />
          </div>
        </div>

        {rosterFiltre.length === 0 ? (
          <p style={{ ...S.empty, padding: '0.9rem 0.6rem' }}>Aucun joueur ne correspond à ce filtre.</p>
        ) : rows.map(({ poste, joueurs }) => (
          <div key={poste || 'all'}>
            {poste && <div style={S.gPosGroupLbl}>{poste}</div>}
            {joueurs.map(r => <Row key={r.joueur.id} r={r} />)}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '0.6rem' }}>
        {rosterFiltre.filter(r => r.episodes.length).map(r => (
          <span key={r.joueur.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#6b7280', fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />{r.joueur.prenom} {r.joueur.nom}
          </span>
        ))}
      </div>
      <p style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 600, margin: '0.4rem 0 0' }}>
        Une couleur par joueur (nom et barres) · opacité pleine = blessure en cours, atténuée = guérie · barres positionnées au jour près
      </p>
    </div>
  )
}

const S = {
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.1rem' },
  headSub: { margin: 0, fontSize: '0.82rem', color: '#6b7280', fontWeight: 700 },
  btnPrimary: { color: '#1a1a1a', border: 'none', borderRadius: 10, padding: '0.6rem 1.05rem', fontSize: '0.84rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { flex: 1, background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', borderRadius: 8, padding: '0.32rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondaryPill: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', borderRadius: 10, padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },

  protoTag: { fontSize: '0.68rem', color: '#6b7280', fontWeight: 700, margin: '0.35rem 0 0' },
  testCheckRow: { display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.8rem', cursor: 'pointer' },
  testCheckNom: { display: 'block', fontWeight: 700 },
  testCheckCritere: { display: 'block', fontSize: '0.72rem', color: '#6b7280', marginTop: 2 },
  protoListRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', border: '1px solid #f3f4f6', borderRadius: 10, padding: '0.6rem 0.8rem' },
  protoPalierBlock: { borderTop: '1px solid #f3f4f6', paddingTop: '0.8rem', marginTop: '0.8rem' },
  protoPalierTitle: { fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.4rem' },
  protoTestRow: { display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' },
  protoTestBtn: { border: '1px solid #e5e7eb', background: 'white', borderRadius: 6, width: 26, height: 26, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', color: '#374151' },

  panel: { background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.9rem 1.1rem 0.7rem' },
  panelLabel: { fontSize: '0.65rem', fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' },
  panelCount: { fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af' },
  empty: { fontSize: '0.82rem', color: '#9ca3af', padding: '0.5rem 1.1rem 1.1rem', margin: 0 },

  caseGrid: { display: 'flex', flexDirection: 'column', gap: '0.7rem', padding: '0 1.1rem 1.1rem' },
  case: { border: '1px solid #f3f4f6', borderRadius: 12, padding: '0.85rem 0.9rem 0.9rem' },
  caseTop: { display: 'flex', alignItems: 'flex-start', gap: '0.65rem' },
  avatar: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: 800, flexShrink: 0, background: '#fee2e2', color: '#dc2626' },
  caseName: { fontSize: '0.86rem', fontWeight: 800, margin: 0 },
  caseMeta: { fontSize: '0.74rem', color: '#6b7280', margin: '0.1rem 0 0' },
  caseDesc: { fontSize: '0.72rem', color: '#9ca3af', margin: '0.35rem 0 0', lineHeight: 1.4 },
  sevBadge: { fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.03em', padding: '0.12rem 0.45rem', borderRadius: 999, border: '1px solid', marginLeft: '0.35rem', whiteSpace: 'nowrap' },
  daysOutNum: { fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 },
  daysOutLbl: { fontSize: '0.56rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },

  paliers: { display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: '0.6rem' },
  pal: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' },
  palDot: { width: 18, height: 18, borderRadius: '50%', border: '2px solid #e5e7eb', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 900, zIndex: 1, color: '#9ca3af' },
  palLine: { position: 'absolute', top: 8, left: '50%', width: '100%', height: 2, background: '#e5e7eb', zIndex: 0 },
  palLbl: { fontSize: '0.58rem', color: '#9ca3af', fontWeight: 700, marginTop: 4, textAlign: 'center', lineHeight: 1.15, maxWidth: 58 },

  caseFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.7rem', flexWrap: 'wrap', gap: '0.4rem' },
  caseReturn: { fontSize: '0.72rem', color: '#6b7280' },

  indispoList: { display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0 1.1rem 1.1rem' },
  indispoRow: { display: 'flex', alignItems: 'center', gap: '0.65rem', border: '1px solid #f3f4f6', borderRadius: 10, padding: '0.55rem 0.7rem', cursor: 'pointer' },
  avatarSmall: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, flexShrink: 0, background: '#fee2e2', color: '#dc2626' },
  indispoName: { fontSize: '0.8rem', fontWeight: 800, margin: 0 },
  indispoZone: { fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, margin: '0.1rem 0 0' },
  indispoDaysNum: { fontSize: '1.02rem', fontWeight: 900, color: '#dc2626', lineHeight: 1 },
  indispoDaysLbl: { fontSize: '0.58rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' },
  indispoRetour: { fontSize: '0.64rem', color: '#059669', fontWeight: 700, margin: '0.15rem 0 0' },

  filterBtns: { display: 'flex', gap: 0, border: '1.5px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' },
  filterBtn: { background: 'white', color: '#6b7280', border: 'none', borderRight: '1.5px solid #e5e7eb', font: 'inherit', fontSize: '0.68rem', fontWeight: 700, padding: '0.35rem 0.6rem', cursor: 'pointer', whiteSpace: 'nowrap' },
  zoomCtrl: { display: 'flex', alignItems: 'center', gap: 8 },
  zoomBtn: { width: 24, height: 24, border: '1.5px solid #e5e7eb', borderRadius: 6, background: 'white', color: '#1a1a1a', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  zoomLbl: { fontSize: '0.66rem', color: '#9ca3af', fontWeight: 700, minWidth: 64, textAlign: 'center' },

  gWrap: { overflowX: 'auto', border: '1px solid #f3f4f6', borderRadius: 6 },
  gHead: { display: 'flex', borderBottom: '1px solid #f3f4f6', background: '#fafafa' },
  gNameCol: { flex: '0 0 190px', display: 'flex', alignItems: 'center', borderRight: '1px solid #f3f4f6', padding: '0 0.6rem' },
  gColSort: { background: 'none', border: 'none', font: 'inherit', fontSize: '0.62rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer', padding: '0.4rem 0', display: 'flex', alignItems: 'center', gap: 3 },
  gSortArrow: { fontSize: '0.56rem', opacity: 0.6 },
  gTimeCol: { flex: 1, position: 'relative', height: 28 },
  gMonthTick: { position: 'absolute', top: 0, bottom: 0, borderLeft: '1px solid #e5e7eb' },
  gMonthLbl: { position: 'absolute', top: 6, fontSize: '0.62rem', fontWeight: 800, color: '#6b7280', whiteSpace: 'nowrap' },
  gWeekTick: { position: 'absolute', top: 17, bottom: 0, borderLeft: '1px dashed #f3f4f6' },
  gTodayLine: { position: 'absolute', top: 0, bottom: 0, borderLeft: '2px solid', zIndex: 2 },
  gPosGroupLbl: { padding: '0.28rem 0.6rem', fontSize: '0.6rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  gRow: { display: 'flex', alignItems: 'center', height: 30, borderBottom: '1px solid #f3f4f6' },
  gName: { flex: '0 0 190px', padding: '0 0.6rem', borderRight: '1px solid #f3f4f6', height: '100%', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' },
  gNameTxt: { fontWeight: 800, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  gPoste: { fontSize: '0.6rem', color: '#9ca3af', fontWeight: 700, flexShrink: 0, marginLeft: 'auto', paddingLeft: 4 },
  gTrack: { flex: 1, position: 'relative', height: '100%' },
  gGridline: { position: 'absolute', top: 0, bottom: 0, borderLeft: '1px solid #f3f4f6' },
  gBar: { position: 'absolute', height: 16, top: 7, borderRadius: 2, border: '1px solid rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', overflow: 'hidden', cursor: 'pointer' },
  gBarLbl: { fontSize: '0.58rem', fontWeight: 800, color: 'white', padding: '0 5px', whiteSpace: 'nowrap' },

  zoneRow: { display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 1.2rem' },
  zoneLbl: { width: 96, flexShrink: 0, fontSize: '0.78rem', fontWeight: 700 },
  zoneTrack: { flex: 1, height: 8, borderRadius: 999, background: '#f3f4f6', overflow: 'hidden' },
  zoneFill: { height: '100%', borderRadius: 999 },
  zoneVal: { width: 20, textAlign: 'right', flexShrink: 0, fontSize: '0.76rem', fontWeight: 800 },

  statLine: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1.2rem', borderTop: '1px solid #f3f4f6' },
  statLbl: { fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 },
  statVal: { fontSize: '0.86rem', fontWeight: 800 },

  histSummary: { listStyle: 'none', cursor: 'pointer', padding: '0.9rem 1.1rem 0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  histAvatar: { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, background: '#f3f4f6', color: '#6b7280', flexShrink: 0 },
  searchInput: { width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: 'white', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' },
  modalTitle: { fontSize: '1.05rem', fontWeight: 800, color: '#1a1a1a', margin: '0 0 1.1rem' },
  label: { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' },
  input: { padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', color: '#1a1a1a', background: 'white' },
}
