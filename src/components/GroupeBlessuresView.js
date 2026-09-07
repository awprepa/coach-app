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
// Numéro de semaine (entier) depuis une date de référence, arrondie au lundi
function semaineDepuis(date, refLundi) {
  return Math.floor((date - refLundi) / (7 * 86400000))
}
function lundiDe(d) {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day))
  r.setHours(0, 0, 0, 0)
  return r
}

// Page "Suivi blessures" d'un groupe : blessés actuels avec palier de reprise,
// frise de qui est indisponible, stats de saison, historique complet par
// joueur, et déclaration/édition d'un épisode côté coach.
export default function GroupeBlessuresView({ groupeId, accent }) {
  const [joueurs, setJoueurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { episode?, joueurId } — présent = modale ouverte
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [showRecidives, setShowRecidives] = useState(false)

  useEffect(() => { load() }, [groupeId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('groupe_joueurs')
      .select('id, prenom, nom, joueur_blessures(*)')
      .eq('groupe_id', groupeId)
      .order('nom')
    setJoueurs(data || [])
    setLoading(false)
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

  // Frise : une colonne par semaine calendaire, de la 1ère blessure de la
  // saison à aujourd'hui — chaque colonne porte la date de son lundi, pour
  // qu'on puisse vraiment situer une barre dans le temps.
  const frise = useMemo(() => {
    if (!allEpisodes.length) return null
    const dates = allEpisodes.map(({ ep }) => new Date(ep.date_debut + 'T00:00:00'))
    const debutLundi = lundiDe(new Date(Math.min(...dates)))
    const aujourdhui = new Date()
    const nbSemaines = Math.max(1, semaineDepuis(aujourdhui, debutLundi) + 1)
    const cols = Array.from({ length: nbSemaines }, (_, i) => {
      const d = new Date(debutLundi); d.setDate(d.getDate() + i * 7)
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    })
    const semaineAujourdhui = semaineDepuis(aujourdhui, debutLundi)

    const joueursAvec = [...new Map(allEpisodes.map(({ joueur }) => [joueur.id, joueur])).values()]
    const bars = joueursAvec.map(joueur => {
      const episodes = (joueur.joueur_blessures || []).map(ep => {
        const s = semaineDepuis(new Date(ep.date_debut + 'T00:00:00'), debutLundi)
        const e = ep.date_fin_reelle ? semaineDepuis(new Date(ep.date_fin_reelle + 'T00:00:00'), debutLundi) : semaineAujourdhui
        return { colStart: Math.max(0, s), colEnd: Math.max(Math.max(0, s), e), actif: ep.statut !== 'ok', ep }
      })
      return { joueur, episodes }
    }).sort((a, b) => Math.min(...a.episodes.map(e => e.colStart)) - Math.min(...b.episodes.map(e => e.colStart)))

    return { cols, nbSemaines, semaineAujourdhui, bars }
  }, [allEpisodes])

  const historique = useMemo(() => {
    const q = search.trim().toLowerCase()
    return joueurs
      .filter(j => (j.joueur_blessures || []).length > 0)
      .filter(j => !q || `${j.prenom} ${j.nom}`.toLowerCase().includes(q))
      .map(j => ({ joueur: j, episodes: [...j.joueur_blessures].sort((a, b) => (b.date_debut || '').localeCompare(a.date_debut || '')) }))
      .sort((a, b) => (b.episodes[0]?.date_debut || '').localeCompare(a.episodes[0]?.date_debut || ''))
  }, [joueurs, search])

  function openDeclare(joueurId) {
    setModal({
      joueurId: joueurId || '', episodeId: null,
      zone_precise: ZONES_PRECISES[0], type_lesion: 'entorse', mecanisme: '', gravite: '',
      niveau: 'repos_total', description: '', duree_estimee: '', date_retour_prevue: '',
      date_debut: new Date().toISOString().slice(0, 10),
    })
  }
  function openEdit(joueur, ep) {
    setModal({
      joueurId: joueur.id, episodeId: ep.id,
      zone_precise: ep.zone_precise || '', type_lesion: ep.type_lesion || 'entorse', mecanisme: ep.mecanisme || '', gravite: ep.gravite || '',
      niveau: ep.niveau || 'repos_total', description: ep.description || '', duree_estimee: ep.duree_estimee || '',
      date_retour_prevue: ep.date_retour_prevue || '', date_debut: ep.date_debut,
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

  async function avancerPalier(ep) {
    const idx = NIVEAUX.findIndex(n => n.v === ep.niveau)
    if (idx < 0 || idx >= NIVEAUX.length - 1) {
      await marquerApte(ep)
      return
    }
    await supabase.from('joueur_blessures').update({ niveau: NIVEAUX[idx + 1].v, updated_at: new Date().toISOString() }).eq('id', ep.id)
    load()
  }

  async function marquerApte(ep) {
    await supabase.from('joueur_blessures')
      .update({ statut: 'ok', date_fin_reelle: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .eq('id', ep.id)
    load()
  }

  return (
    <div>
      <div style={S.head}>
        <p style={S.headSub}>{loading ? 'Chargement…' : `${currentCases.length} joueur${currentCases.length > 1 ? 's' : ''} blessé${currentCases.length > 1 ? 's' : ''} actuellement`}</p>
        <button onClick={() => openDeclare(null)} style={{ ...S.btnPrimary, background: accent }}>+ Déclarer une blessure</button>
      </div>

      {/* ── Blessés actuellement ── */}
      <div style={{ ...S.panel, marginBottom: '1.25rem' }}>
        <div style={S.panelHead}><span style={S.panelLabel}>Blessés actuellement</span><span style={S.panelCount}>{currentCases.length} joueur{currentCases.length > 1 ? 's' : ''}</span></div>
        {currentCases.length === 0 ? (
          <p style={S.empty}>Personne n'est blessé pour l'instant.</p>
        ) : (
          <div style={S.caseGrid}>
            {currentCases.map(({ joueur, ep }) => {
              const idx = stepIndex(ep)
              const pct = (idx / (STEP_LABELS.length - 1)) * 100
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

                  <div style={S.stepperCompact}>
                    <div style={S.stepperTrack}><div style={{ ...S.stepperFill, width: `${pct}%`, background: accent }} /></div>
                    <span style={{ ...S.stepperLbl, color: accent }}>{STEP_LABELS[idx]} · {idx + 1}/{STEP_LABELS.length}</span>
                  </div>

                  <div style={S.caseFoot}>
                    <span style={S.caseReturn}>{formatRetour(ep.date_retour_prevue) || 'Retour non estimé'}</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button onClick={() => openEdit(joueur, ep)} style={S.btnGhost}>Modifier</button>
                      <button onClick={() => avancerPalier(ep)} style={S.btnGhost}>{idx >= NIVEAUX.length - 1 ? 'Marquer apte' : 'Palier suivant'}</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Frise ── */}
      {frise && frise.bars.length > 0 && (
        <div style={{ ...S.panel, marginBottom: '1.25rem' }}>
          <div style={S.panelHead}>
            <span style={S.panelLabel}>Qui est indisponible, et depuis quand</span>
            <span style={S.panelCount}>1 colonne = 1 semaine</span>
          </div>
          <div style={{ padding: '0.3rem 1.2rem 1.1rem', overflowX: 'auto' }}>
            {(() => {
              const colW = 34
              const nameW = 140
              const gridTemplate = `${nameW}px repeat(${frise.nbSemaines}, ${colW}px)`
              return (
                <div style={{ minWidth: nameW + frise.nbSemaines * colW }}>
                  <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, marginBottom: '0.5rem' }}>
                    <span />
                    {frise.cols.map((label, i) => (
                      <span key={i} style={{ fontSize: '0.56rem', fontWeight: 700, color: i === frise.semaineAujourdhui ? accent : '#9ca3af', textAlign: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 46, whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  {frise.bars.map(({ joueur, episodes }) => (
                    <div key={joueur.id} style={{ display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'center', height: 26 }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '0.5rem' }}>{joueur.prenom} {joueur.nom}</span>
                      {frise.cols.map((_, i) => (
                        <div key={i} style={{
                          height: 16, margin: '0 1px', borderRadius: 3,
                          background: episodes.some(e => i >= e.colStart && i <= e.colEnd)
                            ? (episodes.find(e => i >= e.colStart && i <= e.colEnd).actif ? '#dc2626' : '#f59e0b')
                            : (i === frise.semaineAujourdhui ? '#f3f4f6' : 'transparent'),
                        }} />
                      ))}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.7rem', paddingTop: '0.6rem', borderTop: '1px solid #f3f4f6' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#dc2626' }} />Blessure en cours</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} />Blessure passée</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

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
        <div style={{ padding: '0 1.2rem 0.9rem' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un joueur…" style={S.searchInput} />
        </div>
        {historique.length === 0 ? (
          <p style={S.empty}>Aucun historique de blessure pour ce groupe.</p>
        ) : historique.map(({ joueur, episodes }) => (
          <div key={joueur.id} style={{ padding: '0.6rem 1.2rem', borderTop: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <div style={S.histAvatar}>{initiales(joueur.prenom, joueur.nom)}</div>
              <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>{joueur.prenom} {joueur.nom}</span>
              <span style={{ fontSize: '0.74rem', color: '#9ca3af' }}>{episodes.length} blessure{episodes.length > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', paddingLeft: '2.5rem' }}>
              {episodes.map(ep => (
                <div key={ep.id} onClick={() => openEdit(joueur, ep)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.76rem', cursor: 'pointer' }}>
                  <span style={{ color: '#9ca3af', width: 190, flexShrink: 0 }}>
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
                <select value={modal.zone_precise} onChange={e => setModal(m => ({ ...m, zone_precise: e.target.value }))} style={{ ...S.input, width: '100%' }}>
                  {ZONES_PRECISES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Type de lésion</label>
                <select value={modal.type_lesion} onChange={e => setModal(m => ({ ...m, type_lesion: e.target.value }))} style={{ ...S.input, width: '100%' }}>
                  {TYPES_LESION.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
            </div>

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
    </div>
  )
}

const S = {
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.1rem' },
  headSub: { margin: 0, fontSize: '0.82rem', color: '#6b7280', fontWeight: 700 },
  btnPrimary: { color: '#1a1a1a', border: 'none', borderRadius: 10, padding: '0.6rem 1.05rem', fontSize: '0.84rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' },
  btnSecondary: { flex: 1, background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.65rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', borderRadius: 8, padding: '0.32rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },

  panel: { background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.9rem 1.1rem 0.7rem' },
  panelLabel: { fontSize: '0.65rem', fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' },
  panelCount: { fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af' },
  empty: { fontSize: '0.82rem', color: '#9ca3af', padding: '0.5rem 1.1rem 1.1rem', margin: 0 },

  caseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem', padding: '0 1.1rem 1.1rem' },
  case: { border: '1px solid #f3f4f6', borderRadius: 12, padding: '0.85rem 0.9rem 0.9rem' },
  caseTop: { display: 'flex', alignItems: 'flex-start', gap: '0.65rem' },
  avatar: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: 800, flexShrink: 0, background: '#fee2e2', color: '#dc2626' },
  caseName: { fontSize: '0.86rem', fontWeight: 800, margin: 0 },
  caseMeta: { fontSize: '0.74rem', color: '#6b7280', margin: '0.1rem 0 0' },
  caseDesc: { fontSize: '0.72rem', color: '#9ca3af', margin: '0.35rem 0 0', lineHeight: 1.4 },
  sevBadge: { fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.03em', padding: '0.12rem 0.45rem', borderRadius: 999, border: '1px solid', marginLeft: '0.35rem', whiteSpace: 'nowrap' },
  daysOutNum: { fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 },
  daysOutLbl: { fontSize: '0.56rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },

  stepperCompact: { marginTop: '0.7rem' },
  stepperTrack: { height: 5, borderRadius: 999, background: '#f3f4f6', overflow: 'hidden' },
  stepperFill: { height: '100%', borderRadius: 999 },
  stepperLbl: { display: 'block', fontSize: '0.66rem', fontWeight: 700, marginTop: '0.3rem' },

  caseFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.7rem', flexWrap: 'wrap', gap: '0.4rem' },
  caseReturn: { fontSize: '0.72rem', color: '#6b7280' },

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
