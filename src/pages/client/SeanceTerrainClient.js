import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import SchemaTerrainView from '../../components/SchemaTerrainView'
import ChronoIntermittent from '../../components/ChronoIntermittent'
import { Jauge, RANGE_CSS } from '../../components/RpeGate'
import { autoPlacerSeanceSurCalendrier } from '../../utils/autoPlacerSeance'
import { getCoachId, sendNotif } from '../../notifs'
import { isoLocal } from '../../utils/dates'
import { lireIntermittent, passagesPlots, PLOTS, formatIR, nomIR, distanceNavette } from '../../utils/intermittents'
import { arrondiDemi } from '../../utils/courseVmi'
import EnTeteClient from '../../components/EnTeteClient'

function getSemaineActuelle(dateDebut) {
  if (!dateDebut) return 1
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.ceil((diffJours + 1) / 7))
}

const virgule = v => String(Math.round(v * 10) / 10).replace('.', ',')
const metres = v => `${virgule(arrondiDemi(v))} m`
const milliers = v => Math.round(v).toLocaleString('fr-FR')
// Durée d'un bloc d'intermittent (navettes × (effort + récup))
const dureeBloc = i => {
  const sec = i.reps * (i.effort + i.recup)
  return sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)} min ${sec % 60} s`
}
const aDessin = s => s && (s.plots?.length > 0 || s.arrows?.length > 0)
// Plot vers lequel mène le trajet k (1 = premier aller)
const plotDuTrajet = k => (k % 2 === 0 ? PLOTS.depart : PLOTS.demiTour)
// La ligne de consigne générée par « Ajouter un intermittent » reprend les
// chiffres du coach : côté joueur, ils sont recalculés, on ne la montre pas.
const consignesCoach = bloc => (bloc.contenu || []).filter(l => l.texte && !/% VMI ·/.test(l.texte))

// Vue client d'une séance terrain : résumé (distance, durée), blocs, blocs
// d'intermittent avec chiffres recalculés à la VMI du joueur, plots de couleurs
// différentes, fiche détaillée, chrono, puis RPE (même jauge que les
// entraînements de groupe), commentaire et bouton « Séance terminée ».
export default function SeanceTerrainClient({ id, seance }) {
  const navigate = useNavigate()
  const [blocs, setBlocs] = useState([])
  const [validations, setValidations] = useState({}) // exercice_id -> true
  const [ouverts, setOuverts] = useState({}) // blocs terminés rouverts
  const [rpe, setRpe] = useState(null) // note 0-10 | null
  const [commentaire, setCommentaire] = useState('')
  const [enregistre, setEnregistre] = useState(null) // { rpe, texte } déjà enregistrés | null
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [vmiJoueur, setVmiJoueur] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openSchemaId, setOpenSchemaId] = useState(null)
  const [detail, setDetail] = useState(null) // bloc affiché en détail
  const [chrono, setChrono] = useState(null) // bloc dont le chrono est ouvert

  const semaineActuelle = getSemaineActuelle(seance?.programmes?.date_debut)
  const clientId = seance?.programmes?.client_id

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
      const { data: com } = await supabase
        .from('seance_commentaires').select('texte').eq('seance_id', id).eq('semaine', semaineActuelle).maybeSingle()
      const note = r?.rpe_reel != null ? Math.round(r.rpe_reel) : null
      setRpe(note)
      setCommentaire(com?.texte || '')
      if (note != null || com?.texte) setEnregistre({ rpe: note, texte: com?.texte || '' })

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

  async function validerBloc(blocId, valide) {
    setValidations(prev => ({ ...prev, [blocId]: valide }))
    setOuverts(prev => ({ ...prev, [blocId]: false }))
    await supabase.from('bloc_terrain_validations')
      .upsert({ exercice_id: blocId, semaine: semaineActuelle, valide }, { onConflict: 'exercice_id,semaine' })
    if (valide) autoPlacerSeanceSurCalendrier(clientId, id, semaineActuelle)
  }

  // « Séance terminée » / « Enregistrer les modifications » : RPE + commentaire
  async function terminer() {
    if (rpe == null || saving) return
    setSaving(true); setMessage(null)
    const premiere = !enregistre
    const texte = commentaire.trim()
    const { data: exist } = await supabase
      .from('rpe_seances').select('id').eq('seance_id', id).eq('semaine', semaineActuelle).maybeSingle()
    const { error } = exist?.id
      ? await supabase.from('rpe_seances').update({ rpe_reel: rpe }).eq('id', exist.id)
      : await supabase.from('rpe_seances').insert([{ seance_id: id, semaine: semaineActuelle, rpe_reel: rpe }])
    if (!error && (texte || enregistre?.texte)) {
      await supabase.from('seance_commentaires')
        .upsert({ seance_id: id, semaine: semaineActuelle, texte }, { onConflict: 'seance_id,semaine' })
    }
    setSaving(false)
    if (error) { setMessage({ ok: false, texte: 'Pas enregistré. Vérifie ta connexion et réessaie.' }); return }
    autoPlacerSeanceSurCalendrier(clientId, id, semaineActuelle)
    if (texte && texte !== (enregistre?.texte || '')) notifierCoach(`a laissé une note`, `${seance.nom} · S${semaineActuelle} : « ${texte.length > 120 ? texte.slice(0, 117) + '…' : texte} »`, 'note_seance', `/seance/${id}`)
    if (premiere) marquerTerminee()
    setEnregistre({ rpe, texte })
    setMessage({ ok: true, texte: premiere ? 'Séance enregistrée. Bien joué !' : 'Modifications enregistrées.' })
  }

  async function notifierCoach(action, corps, type, lien) {
    try {
      const coachId = await getCoachId()
      if (!coachId) return
      const { data: c } = clientId ? await supabase.from('clients').select('prenom, nom').eq('id', clientId).maybeSingle() : { data: null }
      const nom = c ? `${c.prenom} ${c.nom || ''}`.trim() : 'Un client'
      sendNotif(coachId, { titre: `${nom} ${action}`, corps, type, lien })
    } catch (e) { console.warn('[SeanceTerrainClient] notification non envoyée :', e?.message) }
  }

  // Séance du calendrier passée en « terminée », comme pour la musculation
  async function marquerTerminee() {
    try {
      const hier = new Date(); hier.setDate(hier.getDate() - 1)
      const { data: ev } = await supabase.from('evenements').select('id')
        .eq('seance_id', id).eq('terminee', false).gte('date', isoLocal(hier))
        .order('date', { ascending: true }).limit(1).maybeSingle()
      if (ev?.id) await supabase.from('evenements').update({ terminee: true }).eq('id', ev.id).eq('terminee', false)
      notifierCoach('a terminé une séance', `${seance.nom} · S${semaineActuelle} · RPE ${rpe}`, 'seance', clientId ? `/client/${clientId}` : '/')
    } catch (e) { console.warn('[SeanceTerrainClient] séance non marquée terminée :', e?.message) }
  }

  if (loading) return <div style={S.page}><p style={{ color: '#6b7280', textAlign: 'center', padding: '3rem' }}>Chargement…</p></div>

  const infos = Object.fromEntries(blocs.map(b => [b.id, lireIntermittent(b.schema, vmiJoueur)]))

  const btnTermine = (bloc) => (
    <button onClick={() => validerBloc(bloc.id, !validations[bloc.id])} style={{ ...S.btnFini, ...(validations[bloc.id] ? S.btnFiniOn : null) }}>
      {validations[bloc.id] ? 'Terminé' : 'Bloc terminé'}
    </button>
  )

  return (
    <div style={S.page}>
      <style>{RANGE_CSS}</style>
      <EnTeteClient retour titre={seance.nom} sousTitre={`Séance terrain · Semaine ${semaineActuelle}`} />
      <div style={S.content}>
        {blocs.map(bloc => {
          const valide = !!validations[bloc.id]
          const info = infos[bloc.id]
          const lignes = bloc.contenu || []
          const replie = valide && !ouverts[bloc.id]

          const tete = (
            <button onClick={() => (replie ? setOuverts(p => ({ ...p, [bloc.id]: true })) : info ? setDetail(bloc) : valide && setOuverts(p => ({ ...p, [bloc.id]: false })))} style={S.blocHead}>
              <span style={S.blocCode}>{bloc.code}</span>
              <span style={S.blocNom}>{info ? nomIR(bloc.nom) : bloc.nom}</span>
              <span style={S.blocMeta}>
                {info ? dureeBloc(info) : null}
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
                      <Cases items={[
                        [`${distanceNavette(info)} en ${info.effort}″`, info.cdd > 0 ? 'entre les 2 plots' : 'en ligne droite', true],
                        [`${info.reps} × ${formatIR(info.effort, info.recup)}`, `${dureeBloc(info)} au total`],
                        info.vitesse && [`${virgule(info.vitesse * 3.6)} km/h`, 'ton allure'],
                      ]} />
                      <button onClick={() => setDetail(bloc)} style={S.miniBtn} aria-label="Voir le détail du bloc">
                        <MiniNavette ligne={info.ligne} cdd={info.cdd} />
                      </button>
                      <p style={S.repere}>
                        <b>{info.reps} navette{info.reps > 1 ? 's' : ''}</b> : {info.effort}″ de course, {info.recup}″ de récup.
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
                      {lignes.map((ligne, i) => (
                        <li key={i} style={S.ligne}>
                          <span style={{ flex: 1 }}>{ligne.texte}</span>
                          {ligne.repos && <span style={S.ligneRepos}>{ligne.repos}</span>}
                        </li>
                      ))}
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
          <Jauge value={rpe} onChange={v => { setRpe(v); setMessage(null) }} />
          <p style={{ ...S.rpeLabel, margin: '1.1rem 0 0.5rem' }}>Commentaire <span style={S.facultatif}>(facultatif)</span></p>
          <textarea value={commentaire} onChange={e => { setCommentaire(e.target.value); setMessage(null) }}
            placeholder="Comment s'est passée la séance ?" rows={3} maxLength={600} style={S.commentaire} />
          <button onClick={terminer} disabled={rpe == null || saving}
            style={{ ...S.btnTerminer, ...(rpe == null || saving ? S.btnTerminerOff : null) }}>
            {saving ? 'Enregistrement…' : enregistre ? 'Enregistrer les modifications' : 'Séance terminée'}
          </button>
          {rpe == null && !message && <p style={S.aide}>Note l'intensité pour terminer la séance.</p>}
          {message && <p role="status" style={{ ...S.aide, ...(message.ok ? S.aideOk : S.aideErreur) }}>{message.texte}</p>}
        </div>

        <div style={{ height: 90 }} />
      </div>

      {detail && infos[detail.id] && (
        <DetailBloc bloc={detail} info={infos[detail.id]} onClose={() => setDetail(null)} onChrono={() => { setDetail(null); setChrono(detail) }} />
      )}
      {chrono && infos[chrono.id] && (
        <ChronoIntermittent
          titre={`${chrono.code} · ${nomIR(chrono.nom)}`}
          info={infos[chrono.id]}
          onClose={() => setChrono(null)}
          onTermine={() => validerBloc(chrono.id, true)}
        />
      )}

      <ClientBottomNav />
    </div>
  )
}

// Cases de chiffres sur 2 colonnes. Une case marquée « pleine » prend toute la
// largeur ; s'il reste un nombre impair de cases, la dernière aussi (jamais de case vide)
function Cases({ items, marge }) {
  const cases = items.filter(Boolean)
  const demi = cases.filter(c => !c[2])
  const pleine = c => c[2] || (demi.length % 2 && c === demi[demi.length - 1])
  return (
    <div style={{ ...S.chiffres, ...(marge != null ? { margin: marge } : null) }}>
      {cases.map((c, i) => (
        <div key={i} style={{ ...S.chiffre, ...(pleine(c) ? { gridColumn: '1 / -1' } : null) }}>
          <b style={S.chiffreVal}>{c[0]}</b><span style={S.chiffreLab}>{c[1]}</span>
        </div>
      ))}
    </div>
  )
}

// Navette en vue de dessus, façon tableau de coach : coupelles (plot jaune au
// départ, bleu au demi-tour), course en épingle (aller, demi-tour, retour) et
// cote de distance sous les plots
function MiniNavette({ ligne, cdd }) {
  const A = 60, B = 260
  const coupelle = (x, c) => (
    <g>
      <ellipse cx={x} cy={48} rx={10} ry={4.5} fill="rgba(0,0,0,0.18)" transform="translate(0 3)" />
      <ellipse cx={x} cy={48} rx={10} ry={4.5} fill={c} />
      <ellipse cx={x} cy={46.5} rx={4} ry={1.8} fill="rgba(0,0,0,0.28)" />
    </g>
  )
  const parcours = cdd > 0
    ? `M ${A + 12} 40 L ${B - 6} 40 A 8 8 0 0 1 ${B - 6} 56 L ${A + 12} 56`
    : `M ${A + 12} 40 L ${B - 12} 40`
  return (
    <svg viewBox="0 0 320 100" style={{ display: 'block', width: '100%' }} aria-hidden="true">
      <defs>
        <marker id="navette-fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 1 9 5 0 9z" fill="#ffffff" /></marker>
      </defs>
      <rect width="320" height="100" fill="#3b7a3a" />
      <path d={parcours} fill="none" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" markerEnd="url(#navette-fl)" />
      {coupelle(A, PLOTS.depart.color)}
      {coupelle(B, PLOTS.demiTour.color)}
      <text x={A} y={24} textAnchor="middle" fill="#ffffff" fontSize="11.5" fontWeight="600">Départ</text>
      <text x={B} y={24} textAnchor="middle" fill="#ffffff" fontSize="11.5" fontWeight="600">{cdd > 0 ? 'Demi-tour' : 'Arrivée'}</text>
      {cdd > 1 && <text x={(A + B) / 2} y={32} textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="800">{(cdd + 1) % 2 ? `× ${cdd + 1} trajets` : `× ${(cdd + 1) / 2}`}</text>}
      {ligne != null && (
        <g stroke="rgba(255,255,255,0.75)" strokeWidth="1">
          <line x1={A} y1={78} x2={B} y2={78} />
          <line x1={A} y1={73} x2={A} y2={83} />
          <line x1={B} y1={73} x2={B} y2={83} />
          <rect x={(A + B) / 2 - 26} y={70} width={52} height={16} fill="#3b7a3a" stroke="none" />
          <text x={(A + B) / 2} y={82} textAnchor="middle" fill="#ffffff" stroke="none" fontSize="12" fontWeight="600">{metres(ligne)}</text>
        </g>
      )}
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
        <p style={S.feuilleTitre}>{nomIR(bloc.nom)}</p>
        <button onClick={onClose} style={S.fermer} aria-label="Fermer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div style={S.feuilleCorps}>
        {aDessin(schema) && <SchemaTerrainView value={schema} consigne={false} zoom style={{ borderRadius: 0 }} />}
        <div style={S.content}>
          <div style={S.section}>
            <p style={S.sectionTitre}>Une navette</p>
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
            <Cases marge={0} items={[
              [`${info.reps} navette${info.reps > 1 ? 's' : ''}`, `${dureeBloc(info)} au total`],
              [info.total != null ? `${milliers(info.total * info.reps)} m` : '—', 'de course'],
              info.vitesse && [`${virgule(info.vitesse * 3.6)} km/h`, 'ton allure'],
              info.vmi && [`${virgule(info.vmi)} km/h`, 'ta VMI'],
            ]} />
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
  // En-tête collé en haut (comme Programme/Accueil) : sous l'encoche, toujours le fond sombre et jamais la page grise
  header: { position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--header-bg, linear-gradient(135deg, #333333 0%, #1f2937 100%))', color: 'white' },
  iconBtn: { width: 44, height: 44, marginLeft: -12, background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  headerTitle: { color: 'white', fontWeight: 800, fontSize: 17 },
  headerSub: { color: 'rgba(255,255,255,0.68)', fontSize: 12.5, marginTop: 2 },

  content: { padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
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
  chiffreVal: { display: 'block', fontSize: 17, fontWeight: 800, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' },
  chiffreLab: { fontSize: 12, color: '#6b7280' },
  miniBtn: { display: 'block', width: 'calc(100% - 28px)', margin: '12px 14px 0', padding: 0, border: 'none', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: 'none' },
  repere: { margin: '10px 14px 0', fontSize: 13, color: '#374151', lineHeight: 1.45 },

  actions: { display: 'flex', gap: 8, padding: '12px 14px 14px' },
  btnChrono: { flex: 1, minHeight: 46, border: 'none', borderRadius: 12, background: '#333333', color: '#e4f816', fontSize: 14, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit' },
  btnFini: { flex: '0 0 auto', minHeight: 46, border: 'none', borderRadius: 12, background: '#f3f4f6', color: '#374151', fontSize: 14, fontWeight: 800, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit' },
  btnFiniOn: { background: '#65a30d', color: 'white' },

  lignes: { listStyle: 'none', margin: 0, padding: '0 6px 0' },
  ligne: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 8px', borderTop: '1px solid #f3f4f6', fontSize: 14, color: '#374151', lineHeight: 1.4 },
  ligneRepos: { color: '#65a30d', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' },
  btnSchemaToggle: { border: 'none', background: 'none', color: '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '0.6rem 0', minHeight: 44, fontFamily: 'inherit' },

  rpeCard: { background: 'white', borderRadius: 16, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  rpeLabel: { fontWeight: 800, fontSize: 14, color: '#1a1a1a', margin: '0 0 0.7rem' },
  facultatif: { fontWeight: 400, fontSize: 12.5, color: '#6b7280' },
  commentaire: { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical', color: '#1a1a1a' },
  btnTerminer: { width: '100%', marginTop: '0.9rem', minHeight: 50, border: 'none', borderRadius: 12, background: '#333333', color: '#e4f816', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
  btnTerminerOff: { background: '#f3f4f6', color: '#6b7280', cursor: 'default' },
  aide: { margin: '0.6rem 0 0', fontSize: 13, color: '#6b7280', textAlign: 'center' },
  aideOk: { color: '#3f6212', fontWeight: 700 },
  aideErreur: { color: '#dc2626', fontWeight: 700 },

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
