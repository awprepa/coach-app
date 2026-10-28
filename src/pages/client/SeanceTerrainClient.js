import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import SchemaTerrainView from '../../components/SchemaTerrainView'
import ChronoIntermittent from '../../components/ChronoIntermittent'
import { Jauge, RANGE_CSS } from '../../components/RpeGate'
import { autoPlacerSeanceSurCalendrier } from '../../utils/autoPlacerSeance'
import { lireIntermittent, passagesPlots, PLOTS } from '../../utils/intermittents'
import { arrondiDemi } from '../../utils/courseVmi'

function getSemaineActuelle(dateDebut) {
  if (!dateDebut) return 1
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.ceil((diffJours + 1) / 7))
}

const virgule = v => String(Math.round(v * 10) / 10).replace('.', ',')
const metres = v => `${virgule(arrondiDemi(v))} m`
const milliers = v => Math.round(v).toLocaleString('fr-FR')
const aDessin = s => s && (s.plots?.length > 0 || s.arrows?.length > 0)
// Plot vers lequel mène le trajet k (1 = premier aller)
const plotDuTrajet = k => (k % 2 === 0 ? PLOTS.depart : PLOTS.demiTour)
// La ligne de consigne générée par « Ajouter un intermittent » reprend les
// chiffres du coach : côté joueur, ils sont recalculés, on ne la montre pas.
const consignesCoach = bloc => (bloc.contenu || []).filter(l => l.texte && !/% VMI ·/.test(l.texte))

// Vue client d'une séance terrain : résumé (distance, durée), blocs à cocher
// (gammes ligne par ligne), blocs d'intermittent avec chiffres recalculés à la
// VMI du joueur, plots de couleurs différentes, fiche détaillée, chrono, et
// RPE ressenti sur la même jauge que les entraînements de groupe.
export default function SeanceTerrainClient({ id, seance }) {
  const navigate = useNavigate()
  const [blocs, setBlocs] = useState([])
  const [validations, setValidations] = useState({}) // exercice_id -> true
  const [lignesFaites, setLignesFaites] = useState({}) // exercice_id -> [index]
  const [ouverts, setOuverts] = useState({}) // blocs terminés rouverts
  const [rpe, setRpe] = useState(null) // { id, rpe_reel } | null
  const [vmiJoueur, setVmiJoueur] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openSchemaId, setOpenSchemaId] = useState(null)
  const [detail, setDetail] = useState(null) // bloc affiché en détail
  const [chrono, setChrono] = useState(null) // bloc dont le chrono est ouvert
  const rpeTimer = useRef(null)

  const semaineActuelle = getSemaineActuelle(seance?.programmes?.date_debut)
  const clientId = seance?.programmes?.client_id
  const cleLignes = `terrain_lignes_${id}_${semaineActuelle}`

  useEffect(() => {
    (async () => {
      const { data: exos } = await supabase.from('exercices').select('*').eq('seance_id', id).order('ordre')
      setBlocs(exos || [])

      const exIds = (exos || []).map(e => e.id)
      if (exIds.length) {
        const { data: vals } = await supabase
          .from('bloc_terrain_validations').select('exercice_id, valide')
          .in('exercice_id', exIds).eq('semaine', semaineActuelle)
        const map = {}
        ;(vals || []).forEach(v => { map[v.exercice_id] = v.valide })
        setValidations(map)
      }

      const { data: r } = await supabase
        .from('rpe_seances').select('id, rpe_reel').eq('seance_id', id).eq('semaine', semaineActuelle).maybeSingle()
      setRpe(r || null)

      // VMI du joueur : son dernier test 30-15 (s'il est dans un groupe testé)
      if (clientId) {
        const { data: fiches } = await supabase.from('groupe_joueurs').select('id').eq('client_id', clientId)
        const ids = (fiches || []).map(f => f.id)
        if (ids.length) {
          const { data: tests } = await supabase.from('joueur_tests_physiques').select('valeur, date')
            .in('joueur_id', ids).eq('type', '30-15').order('date', { ascending: false }).limit(1)
          const v = Number(tests?.[0]?.valeur)
          if (v > 0) setVmiJoueur(v)
        }
      }

      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, semaineActuelle])

  // Lignes cochées : gardées sur le téléphone, le temps de la séance
  useEffect(() => {
    try { setLignesFaites(JSON.parse(localStorage.getItem(cleLignes) || '{}')) } catch (e) { /* stockage indisponible */ }
  }, [cleLignes])

  async function validerBloc(blocId, valide) {
    setValidations(prev => ({ ...prev, [blocId]: valide }))
    setOuverts(prev => ({ ...prev, [blocId]: false }))
    await supabase.from('bloc_terrain_validations')
      .upsert({ exercice_id: blocId, semaine: semaineActuelle, valide }, { onConflict: 'exercice_id,semaine' })
    if (valide) autoPlacerSeanceSurCalendrier(clientId, id, semaineActuelle)
  }

  function cocherLigne(bloc, i) {
    const faites = lignesFaites[bloc.id] || []
    const nouv = faites.includes(i) ? faites.filter(x => x !== i) : [...faites, i]
    const map = { ...lignesFaites, [bloc.id]: nouv }
    setLignesFaites(map)
    try { localStorage.setItem(cleLignes, JSON.stringify(map)) } catch (e) { /* stockage indisponible */ }
    // Toutes les lignes cochées : le bloc est terminé
    if (nouv.length === (bloc.contenu || []).length && !validations[bloc.id]) validerBloc(bloc.id, true)
  }

  // La jauge bouge en continu : on enregistre une fois le doigt posé
  function changerRpe(value) {
    setRpe(prev => ({ ...(prev || {}), rpe_reel: value }))
    clearTimeout(rpeTimer.current)
    rpeTimer.current = setTimeout(() => saveRpe(value), 600)
  }
  async function saveRpe(value) {
    const { data: exist } = await supabase
      .from('rpe_seances').select('id').eq('seance_id', id).eq('semaine', semaineActuelle).maybeSingle()
    if (exist?.id) await supabase.from('rpe_seances').update({ rpe_reel: value }).eq('id', exist.id)
    else await supabase.from('rpe_seances').insert([{ seance_id: id, semaine: semaineActuelle, rpe_reel: value }])
    autoPlacerSeanceSurCalendrier(clientId, id, semaineActuelle)
  }

  if (loading) return <div style={S.page}><p style={{ color: '#6b7280', textAlign: 'center', padding: '3rem' }}>Chargement…</p></div>

  // Résumé de la séance
  const infos = Object.fromEntries(blocs.map(b => [b.id, lireIntermittent(b.schema, vmiJoueur)]))
  const inters = Object.values(infos).filter(Boolean)
  const distance = inters.reduce((s, i) => s + (i.total != null ? i.total * i.reps : 0), 0)
  const secondes = inters.reduce((s, i) => s + i.reps * i.effort + (i.reps - 1) * i.recup, 0)
  const faits = blocs.filter(b => validations[b.id]).length
  const plots = Math.max(0, ...blocs.map(b => b.schema?.plots?.length || 0))
  const resume = [
    [`${blocs.length} bloc${blocs.length > 1 ? 's' : ''}`, `${faits} terminé${faits > 1 ? 's' : ''}`],
    distance > 0 && [`${milliers(distance)} m`, 'en intermittent'],
    secondes > 0 && [`≈ ${Math.max(1, Math.round(secondes / 60))} min`, "d'intermittent"],
  ].filter(Boolean)

  const btnTermine = (bloc) => (
    <button onClick={() => validerBloc(bloc.id, !validations[bloc.id])} style={{ ...S.btnFini, ...(validations[bloc.id] ? S.btnFiniOn : null) }}>
      {validations[bloc.id] ? 'Terminé' : 'Bloc terminé'}
    </button>
  )

  return (
    <div style={S.page}>
      <style>{RANGE_CSS}</style>
      <div style={S.header}>
        <div style={S.headTop}>
          <button onClick={() => navigate(-1)} style={S.iconBtn} aria-label="Retour">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={S.headerTitle}>{seance.nom}</div>
            <div style={S.headerSub}>Séance terrain · Semaine {semaineActuelle}</div>
          </div>
        </div>
        <div style={{ ...S.resume, gridTemplateColumns: `repeat(${resume.length}, 1fr)` }}>
          {resume.map(([v, l], i) => (
            <div key={i} style={{ ...S.resumeCase, ...(i > 0 ? S.resumeSep : null) }}>
              <b style={S.resumeVal}>{v}</b><span style={S.resumeLab}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={S.content}>
        {plots > 0 && (
          <div style={S.materiel}>
            <span style={{ ...S.pastille, background: PLOTS.depart.color }} />
            <span style={{ ...S.pastille, background: PLOTS.demiTour.color, marginLeft: -4 }} />
            Matériel : {plots} plot{plots > 1 ? 's' : ''}
          </div>
        )}

        {blocs.map(bloc => {
          const valide = !!validations[bloc.id]
          const info = infos[bloc.id]
          const lignes = bloc.contenu || []
          const nbFaites = (lignesFaites[bloc.id] || []).length
          const replie = valide && !ouverts[bloc.id]

          const tete = (
            <button onClick={() => (replie ? setOuverts(p => ({ ...p, [bloc.id]: true })) : info ? setDetail(bloc) : valide && setOuverts(p => ({ ...p, [bloc.id]: false })))} style={S.blocHead}>
              <span style={S.blocCode}>{bloc.code}</span>
              <span style={S.blocNom}>{bloc.nom}</span>
              <span style={S.blocMeta}>
                {info ? `≈ ${Math.max(1, Math.round((info.reps * info.effort + (info.reps - 1) * info.recup) / 60))} min` : lignes.length > 0 && !valide ? `${nbFaites} / ${lignes.length}` : null}
                {info && !replie && <span style={S.chevron}>›</span>}
              </span>
            </button>
          )

          if (replie) {
            return (
              <div key={bloc.id} style={{ ...S.blocCard, ...S.blocCardDone }}>
                {tete}
                <p style={S.blocFait}>Bloc terminé</p>
              </div>
            )
          }

          return (
            <div key={bloc.id} style={{ ...S.blocCard, ...(valide ? S.blocCardDone : null) }}>
              {tete}

              {info ? (
                <>
                  {info.navette ? (
                    <>
                      <div style={S.chiffres}>
                        <div style={{ ...S.chiffre, ...S.chiffreCle }}>
                          <b style={{ ...S.chiffreVal, color: '#e4f816' }}>{info.ligne != null ? metres(info.ligne) : '—'}</b>
                          <span style={{ ...S.chiffreLab, color: 'rgba(255,255,255,0.68)' }}>{info.cdd > 0 ? 'entre les 2 plots' : 'en ligne droite'}</span>
                        </div>
                        <div style={S.chiffre}><b style={S.chiffreVal}>{info.reps} × {info.effort} s</b><span style={S.chiffreLab}>effort, récup {info.recup} s</span></div>
                        <div style={S.chiffre}><b style={S.chiffreVal}>{info.cdd + 1} trajet{info.cdd > 0 ? 's' : ''}</b><span style={S.chiffreLab}>{info.cdd} demi-tour{info.cdd > 1 ? 's' : ''}</span></div>
                        <div style={S.chiffre}><b style={S.chiffreVal}>{info.vitesse ? `${virgule(info.vitesse * 3.6)} km/h` : `${info.intensite} %`}</b><span style={S.chiffreLab}>{info.vitesse ? 'ton allure' : 'de ta VMI'}</span></div>
                      </div>
                      <button onClick={() => setDetail(bloc)} style={S.miniBtn} aria-label="Voir le détail du bloc">
                        <MiniNavette ligne={info.ligne} cdd={info.cdd} />
                      </button>
                      <p style={S.repere}>
                        <b>Repère :</b>{' '}
                        {info.cdd === 1
                          ? `demi-tour au plot bleu vers ${virgule(info.tTrajet)} s, retour au plot jaune à ${info.effort} s.`
                          : info.cdd > 1
                          ? `un plot toutes les ${virgule(info.tTrajet + 1)} s environ (${virgule(info.tTrajet)} s de course, 1 s de demi-tour). Tu finis les ${info.effort} s au plot ${plotDuTrajet(info.cdd + 1).nom}.`
                          : `${info.ligne != null ? metres(info.ligne) : 'la ligne'} en ${info.effort} s, du plot jaune au plot bleu.`}
                      </p>
                    </>
                  ) : (
                    <>
                      {aDessin(bloc.schema) && <div style={{ padding: '0 14px' }}><SchemaTerrainView value={bloc.schema} /></div>}
                      {consignesCoach(bloc).map((l, i) => <p key={i} style={S.repere}>{l.texte}</p>)}
                    </>
                  )}
                  <div style={S.actions}>
                    <button onClick={() => setChrono(bloc)} style={S.btnChrono}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>
                      Lancer le chrono
                    </button>
                    {btnTermine(bloc)}
                  </div>
                </>
              ) : (
                <>
                  {lignes.length > 0 && (
                    <ul style={S.lignes}>
                      {lignes.map((ligne, i) => {
                        const ok = (lignesFaites[bloc.id] || []).includes(i)
                        return (
                          <li key={i}>
                            <button onClick={() => cocherLigne(bloc, i)} style={{ ...S.ligne, ...(ok ? S.ligneOk : null) }} aria-pressed={ok}>
                              <span style={{ ...S.coche, ...(ok ? S.cocheOk : null) }}>
                                {ok && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12 10 17 19 7" /></svg>}
                              </span>
                              <span style={{ flex: 1 }}>{ligne.texte}</span>
                              {ligne.repos && <span style={S.ligneRepos}>{ligne.repos}</span>}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {aDessin(bloc.schema) && (
                    <div style={{ padding: '0 14px' }}>
                      <button onClick={() => setOpenSchemaId(openSchemaId === bloc.id ? null : bloc.id)} style={S.btnSchemaToggle}>
                        {openSchemaId === bloc.id ? 'Masquer le schéma' : 'Voir le schéma'}
                      </button>
                      {openSchemaId === bloc.id && <SchemaTerrainView value={bloc.schema} style={{ marginBottom: '0.75rem' }} />}
                    </div>
                  )}
                  <div style={S.actions}>{btnTermine(bloc)}</div>
                </>
              )}
            </div>
          )
        })}

        <div style={S.rpeCard}>
          <p style={S.rpeLabel}>Intensité ressentie de la séance</p>
          <Jauge value={rpe?.rpe_reel != null ? Math.round(rpe.rpe_reel) : null} onChange={changerRpe} />
        </div>

        <div style={{ height: 90 }} />
      </div>

      {detail && infos[detail.id] && (
        <DetailBloc bloc={detail} info={infos[detail.id]} onClose={() => setDetail(null)} onChrono={() => { setDetail(null); setChrono(detail) }} />
      )}
      {chrono && infos[chrono.id] && (
        <ChronoIntermittent
          titre={`${chrono.code} · ${chrono.nom}`}
          info={infos[chrono.id]}
          onClose={() => setChrono(null)}
          onTermine={() => validerBloc(chrono.id, true)}
        />
      )}

      <ClientBottomNav />
    </div>
  )
}

// Navette dessinée à plat : plot jaune (départ), plot bleu (demi-tour)
function MiniNavette({ ligne, cdd }) {
  return (
    <svg viewBox="0 0 320 96" style={{ display: 'block', width: '100%' }} aria-hidden="true">
      <defs>
        <pattern id="navette-gazon" width="40" height="96" patternUnits="userSpaceOnUse"><rect width="20" height="96" fill="#3d7a37" /><rect x="20" width="20" height="96" fill="#44843d" /></pattern>
        <marker id="navette-fl" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10z" fill="#fff" /></marker>
      </defs>
      <rect width="320" height="96" fill="url(#navette-gazon)" />
      <line x1="62" y1={cdd > 0 ? 38 : 46} x2="252" y2={cdd > 0 ? 38 : 46} stroke="#fff" strokeWidth="2.5" markerEnd="url(#navette-fl)" />
      {cdd > 0 && <line x1="258" y1="54" x2="68" y2="54" stroke="#fff" strokeWidth="2.5" strokeDasharray="7 5" markerEnd="url(#navette-fl)" />}
      <circle cx="56" cy="46" r="8" fill={PLOTS.depart.color} stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
      <circle cx="264" cy="46" r="8" fill={PLOTS.demiTour.color} stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
      <text x="56" y="80" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">Départ</text>
      <text x="264" y="80" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">{cdd > 0 ? 'Demi-tour' : 'Arrivée'}</text>
      {ligne != null && <text x="160" y="24" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800">{metres(ligne)}</text>}
    </svg>
  )
}

// Fiche d'un bloc d'intermittent : schéma en grand, déroulé, passages aux plots
function DetailBloc({ bloc, info, onClose, onChrono }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Plots du schéma aux couleurs départ / demi-tour
  const schema = info.navette
    ? { ...bloc.schema, plots: bloc.schema.plots.map((p, i) => ({ ...p, color: i === 0 ? PLOTS.depart.color : PLOTS.demiTour.color })) }
    : bloc.schema
  const passages = passagesPlots(info)
  const consignes = consignesCoach(bloc)
  const tour = info.effort + info.recup

  return (
    <div style={S.feuille} role="dialog" aria-label={bloc.nom}>
      <div style={S.feuilleTete}>
        <span style={S.blocCode}>{bloc.code}</span>
        <p style={S.feuilleTitre}>{bloc.nom}</p>
        <button onClick={onClose} style={S.fermer} aria-label="Fermer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div style={S.feuilleCorps}>
        {aDessin(schema) && <SchemaTerrainView value={schema} consigne={false} style={{ borderRadius: 0 }} />}
        <div style={S.content}>
          <div style={S.section}>
            <p style={S.sectionTitre}>Une répétition</p>
            <div style={S.frise}>
              <div style={{ ...S.friseE, flex: info.effort }}>{info.effort} s effort</div>
              {info.recup > 0 && <div style={{ ...S.friseR, flex: info.recup }}>{info.recup} s récup</div>}
            </div>
            <div style={S.friseLeg}><span>0 s</span><span>{tour >= 60 ? `${virgule(tour / 60)} min` : `${tour} s`}</span></div>
          </div>

          {info.navette && (
            <div style={S.section}>
              <p style={S.sectionTitre}>Quand passer les plots</p>
              <ul style={S.passages}>
                <li style={S.passage}><span style={S.passageT}>0 s</span><span style={{ ...S.pastille, background: PLOTS.depart.color }} />Départ, plot jaune</li>
                {passages.map((t, i) => {
                  const p = plotDuTrajet(i + 1)
                  return <li key={i} style={S.passage}><span style={S.passageT}>{virgule(t)} s</span><span style={{ ...S.pastille, background: p.color }} />Demi-tour au plot {p.nom}</li>
                })}
                <li style={S.passage}><span style={S.passageT}>{info.effort} s</span><span style={{ ...S.pastille, background: plotDuTrajet(info.cdd + 1).color }} />Plot {plotDuTrajet(info.cdd + 1).nom}, récup</li>
              </ul>
            </div>
          )}

          <div style={S.section}>
            <p style={S.sectionTitre}>Au total</p>
            <div style={{ ...S.chiffres, margin: 0 }}>
              <div style={S.chiffre}><b style={S.chiffreVal}>{info.reps} rép.</b><span style={S.chiffreLab}>≈ {Math.max(1, Math.round((info.reps * tour - info.recup) / 60))} min</span></div>
              <div style={S.chiffre}><b style={S.chiffreVal}>{info.total != null ? `${milliers(info.total * info.reps)} m` : '—'}</b><span style={S.chiffreLab}>de course</span></div>
              <div style={S.chiffre}><b style={S.chiffreVal}>{info.vitesse ? `${virgule(info.vitesse * 3.6)} km/h` : `${info.intensite} %`}</b><span style={S.chiffreLab}>{info.vitesse ? 'ton allure' : 'de ta VMI'}</span></div>
              <div style={S.chiffre}><b style={S.chiffreVal}>{info.vmi ? `${virgule(info.vmi)} km/h` : '—'}</b><span style={S.chiffreLab}>{info.vmi ? 'VMI' : 'VMI non renseignée'}</span></div>
            </div>
          </div>

          {consignes.length > 0 && (
            <div style={S.section}>
              <p style={S.sectionTitre}>Consigne du coach</p>
              {consignes.map((l, i) => <p key={i} style={S.consigne}>{l.texte}{l.repos ? ` · ${l.repos}` : ''}</p>)}
            </div>
          )}

          <button onClick={onChrono} style={{ ...S.btnChrono, width: '100%', flex: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>
            Lancer le chrono
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: '#f4f4f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { padding: '0.75rem 1rem 1rem', background: 'var(--header-bg, linear-gradient(135deg, #333333 0%, #1f2937 100%))', color: 'white' },
  headTop: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  iconBtn: { width: 44, height: 44, marginLeft: -12, background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  headerTitle: { color: 'white', fontWeight: 800, fontSize: 17 },
  headerSub: { color: 'rgba(255,255,255,0.68)', fontSize: 12.5, marginTop: 2 },
  resume: { display: 'grid', marginTop: 14, background: 'rgba(255,255,255,0.08)', borderRadius: 12 },
  resumeCase: { padding: '10px 12px', minWidth: 0 },
  resumeSep: { borderLeft: '1px solid rgba(255,255,255,0.12)' },
  resumeVal: { display: 'block', fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  resumeLab: { fontSize: 12, color: 'rgba(255,255,255,0.68)' },

  content: { padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  materiel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', padding: '0 2px' },
  pastille: { width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(0,0,0,0.25)', display: 'inline-block', flexShrink: 0 },

  blocCard: { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  blocCardDone: { background: '#f7fee7', boxShadow: 'none', border: '1.5px solid #d9f99d' },
  blocHead: { width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '14px 14px 10px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  blocCode: { background: '#1f2937', color: '#e4f816', fontSize: 12, fontWeight: 800, width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  blocNom: { fontWeight: 800, fontSize: 15, color: '#1a1a1a', flex: 1, minWidth: 0 },
  blocMeta: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#6b7280', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  chevron: { fontSize: 18, color: '#9ca3af', lineHeight: 1 },
  blocFait: { margin: '-4px 0 0', padding: '0 14px 14px 50px', fontSize: 13, fontWeight: 700, color: '#3f6212' },

  chiffres: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#f3f4f6', margin: '0 14px', borderRadius: 12, overflow: 'hidden' },
  chiffre: { background: '#fafafa', padding: '10px 12px', minWidth: 0 },
  chiffreCle: { background: '#1f2937' },
  chiffreVal: { display: 'block', fontSize: 17, fontWeight: 800, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' },
  chiffreLab: { fontSize: 12, color: '#6b7280' },
  miniBtn: { display: 'block', width: 'calc(100% - 28px)', margin: '12px 14px 0', padding: 0, border: 'none', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: 'none' },
  repere: { margin: '10px 14px 0', fontSize: 13, color: '#374151', lineHeight: 1.45 },

  actions: { display: 'flex', gap: 8, padding: '12px 14px 14px' },
  btnChrono: { flex: 1, minHeight: 46, border: 'none', borderRadius: 12, background: '#333333', color: '#e4f816', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit' },
  btnFini: { flex: '0 0 auto', minHeight: 46, border: 'none', borderRadius: 12, background: '#f3f4f6', color: '#374151', fontSize: 14, fontWeight: 800, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit' },
  btnFiniOn: { background: '#65a30d', color: 'white' },

  lignes: { listStyle: 'none', margin: 0, padding: '0 6px 0' },
  ligne: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 8px', border: 'none', borderTop: '1px solid #f3f4f6', background: 'none', textAlign: 'left', fontSize: 14, color: '#374151', lineHeight: 1.35, cursor: 'pointer', fontFamily: 'inherit' },
  ligneOk: { color: '#9ca3af' },
  coche: { width: 22, height: 22, borderRadius: 7, border: '1.5px solid #d1d5db', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' },
  cocheOk: { background: '#65a30d', borderColor: '#65a30d' },
  ligneRepos: { color: '#65a30d', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' },
  btnSchemaToggle: { border: 'none', background: 'none', color: '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '0.6rem 0', minHeight: 44, fontFamily: 'inherit' },

  rpeCard: { background: 'white', borderRadius: 16, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  rpeLabel: { fontWeight: 800, fontSize: 14, color: '#1a1a1a', margin: '0 0 0.7rem' },

  feuille: { position: 'fixed', inset: 0, zIndex: 1000, background: '#f4f4f5', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  feuilleTete: { display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px', background: 'white', borderBottom: '1px solid #f3f4f6' },
  feuilleTitre: { margin: 0, flex: 1, fontSize: 16, fontWeight: 800, color: '#1a1a1a' },
  fermer: { width: 44, height: 44, marginRight: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' },
  feuilleCorps: { flex: 1, overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom)' },
  section: { background: 'white', borderRadius: 16, padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  sectionTitre: { margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#374151' },
  frise: { display: 'flex', height: 34, borderRadius: 8, overflow: 'hidden', fontSize: 12, fontWeight: 800 },
  friseE: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1f2937', color: '#e4f816' },
  friseR: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', color: '#374151' },
  friseLeg: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginTop: 6, fontVariantNumeric: 'tabular-nums' },
  passages: { listStyle: 'none', margin: 0, padding: 0 },
  passage: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, borderTop: '1px solid #f3f4f6', fontSize: 14, color: '#1a1a1a' },
  passageT: { width: 50, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  consigne: { margin: '0 0 4px', fontSize: 14, color: '#374151', lineHeight: 1.5 },
}
