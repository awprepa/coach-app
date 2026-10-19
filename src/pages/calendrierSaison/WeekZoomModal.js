import React, { useEffect, useRef, useState } from 'react'
import { FitScale } from './FitScale'
import { COURSE_INTENSITES, COURSE_VOLUMES, GROUP_COLORS, STYLE_COLORS, TYPES, localISO, matchCatColor } from './constants'
import { generateBlocPalette } from './couleurs'
import { calcDureeBloc, calcJeuEffectif, formatSeqDur, parseDurMin } from './seqHelpers'
import { S } from './styles'
import { MatchCardShare, MatchCardWeek } from './matchCards'
import { exporterImage } from './exportImage'

export function WeekZoomModal({ weekZoom, groupe, onClose, onNavigate }) {
  const groupColor = groupe?.couleur || '#2f6f76'
  const { wkNum, startISO, days, blocsMap, notreNom, competition } = weekZoom
  const todayISO = localISO()
  const DOW_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
  const [dayPreview, setDayPreview] = useState(null) // { evt, blocs, dateLabel }
  const [dayFull, setDayFull] = useState(null) // { day }

  // Période affichée (dates locales : toISOString décalait la fin d'un jour)
  const [sy, sm, sd] = startISO.split('-').map(Number)
  const debutSem = new Date(sy, sm - 1, sd)
  const finSem = new Date(sy, sm - 1, sd + 6)
  const plage = debutSem.getMonth() === finSem.getMonth()
    ? `${debutSem.getDate()} au ${finSem.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `${debutSem.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${finSem.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`

  // Export en image : la fiche (ou la carte du match) est rendue hors écran à
  // sa taille réelle, sans boutons, puis convertie en PNG.
  const [aExporter, setAExporter] = useState(null) // { type: 'semaine' } | { type: 'match', evt }
  const [exportEnCours, setExportEnCours] = useState(false)
  const [exportErreur, setExportErreur] = useState(null)
  const exportRef = useRef(null)
  const slug = (groupe?.nom || 'groupe').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  function exporterMatch(evt) { setExportErreur(null); setExportEnCours(true); setAExporter({ type: 'match', evt }) }
  function exporterSemaine() { setExportErreur(null); setExportEnCours(true); setAExporter({ type: 'semaine' }) }
  useEffect(() => {
    if (!aExporter || !exportRef.current) return
    const nom = aExporter.type === 'match'
      ? `match-${aExporter.evt.date_match}-${slug}.png`
      : `semaine-${wkNum}-${slug}.png`
    exporterImage(exportRef.current, nom, aExporter.type === 'match' ? 4 : 2)
      .catch(e => { console.error('[export image]', e); setExportErreur('L\u2019image n\u2019a pas pu être créée. Réessaie.') })
      .finally(() => { setAExporter(null); setExportEnCours(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aExporter])
  const btnImage = sombre => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    borderRadius: 8, padding: '7px 12px', opacity: exportEnCours ? 0.6 : 1,
    background: sombre ? 'rgba(255,255,255,.1)' : '#fff', color: sombre ? '#fff' : '#1a1a1a',
    border: sombre ? '1.5px solid rgba(255,255,255,.3)' : '1.5px solid #333',
  })
  const IcoTelecharger = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>
  )

  // Seulement les jours avec séances ou matchs FFR
  const activeDays = days.filter(d => d.events.length > 0)
  const allEvts = days.flatMap(d => d.events)
  const nbMatch = allEvts.filter(e => e.type === 'match' || e.type === 'ffr_match').length
  const nbTrain = allEvts.filter(e => e.type === 'entrainement').length
  const nbMuscu = allEvts.filter(e => e.type === 'muscu').length

  // Fermer sur Échap
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function evtColor(evt) {
    const type = typeof evt === 'string' ? evt : evt?.type
    if (type === 'match' || type === 'ffr_match') return groupColor
    if (type === 'muscu') return '#b08769'
    if (type === 'entrainement') {
      const s = typeof evt === 'object' ? evt?.style : null
      return STYLE_COLORS[s] || '#6b94a3'
    }
    return '#9aa1ac'
  }

  // Palette dérivée des couleurs du club
  const BLOC_COLORS = generateBlocPalette(groupColor, groupe?.couleur_secondaire)
  function blocColor(idx, intervenant) {
    if (intervenant === 'prepa')  return '#b45309'
    if (intervenant === 'coachs') return '#1d4ed8'
    if (intervenant === 'both')   return '#1a1a1a'
    return BLOC_COLORS[idx % BLOC_COLORS.length]
  }

  // Parse la durée d'un bloc en minutes (ex: "30 min", "1h30", "45")
  function parseDurMin(s) {
    if (!s) return null
    const str = String(s).toLowerCase().trim()
    const hm = str.match(/(\d+)\s*h\s*(\d*)/)
    if (hm) return parseInt(hm[1]) * 60 + parseInt(hm[2] || 0)
    const m = str.match(/(\d+)\s*m/)
    if (m) return parseInt(m[1])
    // format "5'" ou "55'" (apostrophe ou prime)
    const apos = str.match(/^(\d+)\s*['′']/)
    if (apos) return parseInt(apos[1])
    const n = str.match(/^(\d+)$/)
    if (n) return parseInt(n[1])
    return null
  }

  function EventContent({ evt, wide }) {
    const color = evtColor(evt)
    const blocs = blocsMap[evt.id] || []
    const [openSeqs, setOpenSeqs] = useState(new Set())
    const toggleSeqs = id => setOpenSeqs(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
    // En vue "large" (aperçu du jour), les séquences sont toujours dépliées —
    // assez de place pour les montrer sans avoir à cliquer. On le force ici plutôt
    // que via l'état initial, car les blocs peuvent arriver après le premier rendu.
    const isSeqExpanded = id => wide || openSeqs.has(id)

    // ── Match FFR (depuis monclubhouse) ──────────────────────────────────────
    if (evt.type === 'ffr_match') {
      const joue = evt.score_dom != null && evt.score_ext != null
      const gagné = joue && (evt.est_domicile ? evt.score_dom > evt.score_ext : evt.est_domicile === false ? evt.score_ext > evt.score_dom : false)
      const perdu = joue && (evt.est_domicile ? evt.score_dom < evt.score_ext : evt.est_domicile === false ? evt.score_ext < evt.score_dom : false)
      const bg = joue ? (gagné ? '#16a34a' : perdu ? '#dc2626' : '#64748b') : groupColor

      // Domicile → notre logo = logo_dom, adverse = logo_ext
      // Extérieur → notre logo = logo_ext, adverse = logo_dom
      const notreEquipeNom  = evt.est_domicile === true  ? evt.equipe_dom : evt.est_domicile === false ? evt.equipe_ext : (evt.equipe_dom || evt.equipe_ext)
      const advEquipeNom    = evt.est_domicile === true  ? evt.equipe_ext : evt.est_domicile === false ? evt.equipe_dom : (evt.equipe_ext || evt.equipe_dom)
      // Notre logo = celui du groupe dans l'appli (uploadé par le coach), pas celui scrapé sur
      // monclubhouse — évite aussi que le logo adverse se retrouve dupliqué des deux côtés quand
      // le domicile/extérieur n'a pas pu être déterminé (logo_dom et logo_ext retombent alors sur
      // la même valeur via les replis ci-dessous).
      const notreLogoUrl    = groupe?.logo_url || (evt.est_domicile === true ? evt.logo_dom : evt.est_domicile === false ? evt.logo_ext : (evt.logo_dom || evt.logo_ext))
      const advLogoUrl      = evt.est_domicile === true  ? evt.logo_ext   : evt.est_domicile === false ? evt.logo_dom   : (evt.logo_ext || evt.logo_dom)
      const notreInitials   = (notreEquipeNom || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
      const advInitials     = (advEquipeNom || '?').split(/[\s-]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

      // Disposition : domicile → notre logo gauche / adverse droite ; extérieur → adverse gauche / notre logo droite
      const logoGauche  = evt.est_domicile !== false ? notreLogoUrl  : advLogoUrl
      const logoDroite  = evt.est_domicile !== false ? advLogoUrl    : notreLogoUrl
      const nomGauche   = evt.est_domicile !== false ? notreEquipeNom : advEquipeNom
      const nomDroite   = evt.est_domicile !== false ? advEquipeNom   : notreEquipeNom
      const initGauche  = evt.est_domicile !== false ? notreInitials  : advInitials
      const initDroite  = evt.est_domicile !== false ? advInitials    : notreInitials

      const score = joue
        ? (evt.est_domicile ? `${evt.score_dom} – ${evt.score_ext}` : evt.est_domicile === false ? `${evt.score_ext} – ${evt.score_dom}` : `${evt.score_dom} – ${evt.score_ext}`)
        : null

      function LogoBadge({ url, initials, size = 72 }) {
        return (
          <div style={{ width: size, height: size, borderRadius: 16, background: 'rgba(255,255,255,.15)',
            border: '2px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {url
              ? <img loading="lazy" src={url} alt={initials} style={{ width: size - 10, height: size - 10, objectFit: 'contain' }}
                  onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
              : null}
            <div style={{ width: '100%', height: '100%', display: url ? 'none' : 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: size > 60 ? '1.3rem' : '0.9rem', fontWeight: 900 }}>{initials}</div>
          </div>
        )
      }

      return (
        /* flex:1 → remplit toute la hauteur de la colonne jour */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          background: `linear-gradient(155deg, ${bg} 0%, color-mix(in srgb, ${bg} 60%, #000) 100%)`,
          borderRadius: 14, padding: '16px 14px', color: '#fff', minHeight: 160 }}>

          {/* Badge compétition */}
          <div style={{ fontSize: '.6rem', fontWeight: 800, opacity: .7, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
            Match FFR{evt.journee ? ` · Journée ${evt.journee}` : ''}
          </div>

          {/* Corps centré : logos face à face */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center', paddingBottom: 6 }}>
            {/* Ligne logos + VS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}>
              {/* Logo gauche */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
                <LogoBadge url={logoGauche} initials={initGauche} size={68} />
                <div style={{ fontSize: '.6rem', fontWeight: 700, opacity: .85, textAlign: 'center', lineHeight: 1.2,
                  maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomGauche}</div>
              </div>
              {/* VS central */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {score
                  ? <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '.03em', lineHeight: 1 }}>{score}</div>
                  : <div style={{ fontSize: '.78rem', fontWeight: 900, opacity: .9, letterSpacing: '.05em' }}>VS</div>}
                {!score && evt.heure && <div style={{ fontSize: '.65rem', opacity: .75, fontWeight: 600 }}>{evt.heure}</div>}
              </div>
              {/* Logo droite */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
                <LogoBadge url={logoDroite} initials={initDroite} size={68} />
                <div style={{ fontSize: '.6rem', fontWeight: 700, opacity: .85, textAlign: 'center', lineHeight: 1.2,
                  maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomDroite}</div>
              </div>
            </div>
          </div>

          {/* Chips infos */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {evt.est_domicile != null && (
              <span style={{ background: '#e4f816', color: '#1a1a1a', borderRadius: 7, padding: '4px 10px', fontSize: '.65rem', fontWeight: 800 }}>
                {evt.est_domicile ? 'Domicile' : 'Extérieur'}
              </span>
            )}
            {joue && (
              <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 7, padding: '4px 10px', fontSize: '.65rem', fontWeight: 700 }}>
                {gagné ? 'Victoire' : perdu ? 'Défaite' : 'Match nul'}
              </span>
            )}
          </div>
        </div>
      )
    }

    if (evt.type === 'match') {
      const mc = matchCatColor(evt.categorie, groupColor)
      return (
        <div style={{ background: `linear-gradient(135deg, ${mc}, ${mc}cc)`, borderRadius: 11, padding: '12px 13px', color: '#fff', textAlign: 'center', marginBottom: 2 }}>
          {evt.categorie && <div style={{ fontSize: '.6rem', fontWeight: 700, opacity: .65, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Match · {evt.categorie}{evt.journee ? ` · ${evt.journee}` : ''}</div>}
          <div style={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1.15, marginBottom: 8 }}>{evt.adversaire ? `vs ${evt.adversaire}` : evt.titre || 'Match'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
            {evt.heure && <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 5, padding: '2px 7px', fontSize: '.6rem', fontWeight: 700 }}>{String(evt.heure).slice(0, 5)}</span>}
            {evt.domicile != null && <span style={{ background: '#e4f816', color: '#333', borderRadius: 5, padding: '2px 7px', fontSize: '.6rem', fontWeight: 700 }}>{evt.domicile ? 'Domicile' : 'Extérieur'}</span>}
            {evt.lieu && <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 5, padding: '2px 7px', fontSize: '.6rem', fontWeight: 700 }}>{evt.lieu}</span>}
          </div>
        </div>
      )
    }

    // Libellé principal de la séance
    const evtLabel = evt.type === 'entrainement' ? (evt.style || evt.titre || 'Entraînement')
      : evt.type === 'muscu' ? (evt.titre || 'Musculation')
      : (evt.titre || TYPES[evt.type]?.label || 'Séance')

    // ── Carte unique englobant toute la séance ──────────────────────────────
    return (
      <div style={{ border: `2px solid ${color}35`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>

        {/* En-tête séance (bandeau coloré) */}
        <div style={{ background: color, padding: '11px 14px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 800, color: 'rgba(255,255,255,.65)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>
              {TYPES[evt.type]?.label || evt.type}
            </div>
            <div style={{ fontSize: '.95rem', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>{evtLabel}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            {evt.heure && (
              <span style={{ fontSize: '.8rem', fontWeight: 900, color: '#fff', background: 'rgba(0,0,0,.22)', borderRadius: 6, padding: '3px 8px', letterSpacing: '.01em' }}>
                {String(evt.heure).slice(0, 5)}
              </span>
            )}
            {evt.duree_min && (
              <span style={{ fontSize: '.68rem', background: 'rgba(255,255,255,.25)', color: '#fff', borderRadius: 5, padding: '2px 7px', fontWeight: 800 }}>
                {evt.duree_min} min
              </span>
            )}
            {blocs.length > 0 && (
              <button
                onClick={() => setDayPreview({ evt, blocs })}
                style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.35)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 }}>
                Aperçu complet ↗
              </button>
            )}
          </div>
        </div>

        {/* Indicateurs globaux contact/course — max des blocs */}
        {blocs.length > 0 && evt.type === 'entrainement' && (() => {
          const maxCI = blocs.reduce((m, b) => b.contact_intensite != null ? Math.max(m, b.contact_intensite) : m, -1)
          const maxVI = blocs.reduce((m, b) => { const i = COURSE_VOLUMES.indexOf(b.course_volume); return i > m ? i : m }, -1)
          const maxII = blocs.reduce((m, b) => { const i = COURSE_INTENSITES.indexOf(b.course_intensite); return i > m ? i : m }, -1)
          if (maxCI < 0 && maxVI < 0 && maxII < 0) return null
          return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '5px 12px', background: '#f5f6f8', borderBottom: '1px solid #eceef1' }}>
              {maxCI >= 0 && (
                <span style={{ fontSize: '.57rem', fontWeight: 800, background: '#dc262618', color: '#b91c1c', border: '1px solid #dc262630', borderRadius: 4, padding: '2px 7px' }}>
                  Contact {maxCI}/4
                </span>
              )}
              {maxVI >= 0 && (
                <span style={{ fontSize: '.57rem', fontWeight: 800, background: '#2563eb22', color: '#1d4ed8', border: '1px solid #2563eb44', borderRadius: 4, padding: '2px 7px' }}>
                  Vol. {COURSE_VOLUMES[maxVI]}
                </span>
              )}
              {maxII >= 0 && (
                <span style={{ fontSize: '.57rem', fontWeight: 800, background: '#7c3aed22', color: '#6d28d9', border: '1px solid #7c3aed44', borderRadius: 4, padding: '2px 7px' }}>
                  {COURSE_INTENSITES[maxII]}
                </span>
              )}
            </div>
          )
        })()}

        {/* Phases (blocs) */}
        {blocs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(() => {
              const totalMins = blocs.reduce((sum, b) => sum + (parseDurMin(b.duree) || 0), 0)
              const PX_PER_MIN = wide ? 5 : 2.5
              const MAX_TOTAL = wide ? 999999 : 220
              const rawH = totalMins * PX_PER_MIN
              const scale = rawH > MAX_TOTAL ? MAX_TOTAL / rawH : 1
              return blocs.map((bloc, idx) => {
              const bc = blocColor(idx, bloc.intervenant)
              const mins = parseDurMin(bloc.duree)
              const h = mins ? Math.max(20, Math.round(mins * PX_PER_MIN * scale)) : 40

              const byGroup = {}
              for (const exo of (bloc.exos || [])) {
                const g = exo.groupe_label?.trim() || ''
                ;(byGroup[g] ||= []).push(exo)
              }
              const groupKeys = Object.keys(byGroup)
              const hasGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== '')

              return (
                <div key={bloc.id} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e6e8ec' }}>
                  {/* En-tête phase */}
                  <div style={{ padding: '7px 12px', background: bc + '18', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: bc, color: '#fff', fontSize: '.7rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 1px 4px ${bc}55` }}>{idx + 1}</span>
                    <span style={{ fontSize: '.78rem', fontWeight: 800, color: '#1a1a1a', flex: 1 }}>{bloc.nom}</span>
                    {bloc.intervenant && (
                      <span style={{ fontSize: '.58rem', fontWeight: 900, color: '#fff', background: bc, borderRadius: 5, padding: '2px 7px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {bloc.intervenant === 'prepa' ? 'Prépa physique' : bloc.intervenant === 'both' ? 'PP + Coachs' : 'Coachs'}
                      </span>
                    )}
                    {bloc.duree && <span style={{ fontSize: '.67rem', fontWeight: 900, color: '#fff', background: bc, borderRadius: 5, padding: '2px 8px', flexShrink: 0 }}>{bloc.duree}</span>}
                  </div>
                  {/* Séquences — aperçu repliable */}
                  {bloc.bloc_type === 'sequences' && (() => {
                    const seqs = bloc.sequences || []
                    let jeuCount = 0
                    const jeuNum = {}
                    seqs.forEach(s => { if (s.type === 'jeu') { jeuCount++; jeuNum[s.id] = jeuCount } })
                    const expanded = isSeqExpanded(bloc.id)
                    return (
                      <div style={{ background: '#eef3fb' }}>
                        {/* Ligne résumé cliquable */}
                        <button onClick={() => toggleSeqs(bloc.id)} style={{ width:'100%', background:'none', border:'none', cursor:'pointer', padding:'4px 8px', display:'flex', gap:5, alignItems:'center', textAlign:'left' }}>
                          <span style={{ fontSize:'.58rem', fontWeight:800, color:'#2c5faa', flexShrink:0 }}>Jeu {calcJeuEffectif(seqs)}</span>
                          <span style={{ fontSize:'.55rem', color:'#9db8d8' }}>·</span>
                          <span style={{ fontSize:'.55rem', fontWeight:600, color:'#6a8aaa', flexShrink:0 }}>{calcDureeBloc(seqs)}</span>
                          {bloc.conditions_jeu && <>
                            <span style={{ fontSize:'.55rem', color:'#9db8d8' }}>·</span>
                            <span style={{ fontSize:'.55rem', fontWeight:700, color:'#92400e', background:'#fef3c7', borderRadius:3, padding:'0 4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{bloc.conditions_jeu}</span>
                          </>}
                          <span style={{ marginLeft:'auto', fontSize:'.65rem', color:'#6a8aaa', transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform .15s', flexShrink:0 }}>›</span>
                        </button>
                        {/* Détail séquences */}
                        {expanded && (
                          <div style={{ padding:'0 8px 6px', display:'flex', flexDirection:'column', gap:3 }}>
                            {seqs.map(seq => seq.type === 'jeu' ? (
                              <div key={seq.id} style={{ background:'#fff', border:'1px solid #c4d8f0', borderRadius:6, padding:'3px 7px', display:'flex', alignItems:'center', gap:6 }}>
                                <div style={{ width:14, height:14, borderRadius:'50%', background:'#2c5faa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.48rem', fontWeight:900, color:'#fff', flexShrink:0 }}>{jeuNum[seq.id]}</div>
                                <div style={{ flex:1, fontSize:'.6rem', fontWeight:700, color:'#1e2d3d', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{seq.theme || '—'}</div>
                                <div style={{ fontSize:'.6rem', fontWeight:900, color:'#b03030', flexShrink:0 }}>{formatSeqDur(seq.duree_sec)}</div>
                              </div>
                            ) : seq.type === 'inter_bloc' ? (
                              <div key={seq.id} style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 0' }}>
                                <div style={{ flex:1, height:1, background:'#a3c4e8' }} />
                                <span style={{ fontSize:'.52rem', fontWeight:800, color:'#2c5faa', background:'#dce8f8', borderRadius:10, padding:'1px 7px', whiteSpace:'nowrap' }}>Récup · {formatSeqDur(seq.duree_sec)}</span>
                                <div style={{ flex:1, height:1, background:'#a3c4e8' }} />
                              </div>
                            ) : (
                              <div key={seq.id} style={{ display:'flex', alignItems:'center', gap:4, padding:'1px 0' }}>
                                <div style={{ flex:1, height:1, background:'#b8d8c8' }} />
                                <span style={{ fontSize:'.5rem', fontWeight:700, color:'#2e7d4f', fontStyle:'italic', whiteSpace:'nowrap' }}>récup {formatSeqDur(seq.duree_sec)}</span>
                                <div style={{ flex:1, height:1, background:'#b8d8c8' }} />
                              </div>
                            ))}
                            {bloc.effectif_desc && <span style={{ fontSize:'.55rem', color: '#6b7280', fontStyle:'italic' }}>{bloc.effectif_desc}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Exercices — toujours affichés (au minimum les noms), jamais masqués */}
                  {bloc.bloc_type !== 'sequences' && bloc.exos?.length > 0 && (
                    h < 40
                    /* Bloc court → liste compacte sur une ligne, scrollable si besoin */
                    ? <div style={{ maxHeight: Math.max(h, 22), overflowY: 'auto', padding: '3px 8px', background: bc + '08', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {bloc.exos.map(exo => (
                          <div key={exo.id} style={{ fontSize: '.62rem', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {exo.nom}{exo.prescription ? ` · ${exo.prescription}` : ''}
                          </div>
                        ))}
                      </div>
                    : <div style={{ height: h, overflow: 'hidden', padding: '5px 8px 6px', background: bc + '08', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {hasGroups ? (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${groupKeys.length}, 1fr)`, gap: 5, alignItems: 'stretch' }}>
                          {groupKeys.map(g => (
                            <div key={g} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${bc}30`, display: 'flex', flexDirection: 'column' }}>
                              {g && <div style={{ fontSize: '.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', color: '#fff', background: bc + 'bb', padding: '3px 8px', textAlign: 'center', flexShrink: 0 }}>{g}</div>}
                              <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 3, background: bc + '08', flex: 1 }}>
                                {byGroup[g].map(exo => (
                                  <div key={exo.id} style={{ background: '#fff', borderRadius: 5, padding: '3px 7px', border: `1px solid ${bc}25` }}>
                                    <div style={{ fontSize: '.67rem', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.25 }}>{exo.nom}</div>
                                    {exo.prescription && <div style={{ fontSize: '.62rem', color: bc, fontWeight: 800, marginTop: 1 }}>{exo.prescription}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {bloc.exos.map(exo => (
                            <div key={exo.id} style={{ background: '#fff', borderRadius: 6, padding: '4px 8px', border: `1px solid ${bc}25`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#1a1a1a', flex: 1, lineHeight: 1.25 }}>{exo.nom}</span>
                              {exo.prescription && <span style={{ fontSize: '.62rem', color: '#fff', fontWeight: 800, flexShrink: 0, background: bc, borderRadius: 4, padding: '1px 5px' }}>{exo.prescription}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {bloc.bloc_type !== 'sequences' && !bloc.exos?.length && (
                    <div style={{ height: h, background: bc + '08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: bc, opacity: 0.5, fontStyle: 'italic' }}>{bloc.nom}</span>
                    </div>
                  )}
                </div>
              )
            })
            })()}
          </div>
        ) : (
          /* Pas de blocs */
          <div style={{ padding: '10px 13px' }}>
            {(evt.lieu || evt.note) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                {evt.lieu && <span style={{ fontSize: '.65rem', color: '#5b626c' }}>{evt.lieu}</span>}
                {evt.note && <span style={{ fontSize: '.65rem', color: '#7a8290', fontStyle: 'italic' }}>{evt.note}</span>}
              </div>
            )}
            <div style={{ color: '#c4ccd4', fontSize: '.65rem', fontStyle: 'italic' }}>Aucun déroulé renseigné</div>
          </div>
        )}
      </div>
    )
  }

  // ── Colonne d'un jour : agenda des séances (heure au début de chaque bloc,
  //    hauteur selon la durée), charge en bas, carte du match ──
  const PAL_IV = {
    prepa:  { bg: '#fafcdf', bord: '#b9c70a', label: 'Prépa physique' },
    coachs: { bg: '#eaf1f8', bord: '#2f5f8a', label: 'Coachs' },
    both:   { bg: '#ffffff', bord: '#1a1a1a', label: 'Prépa + coachs' },
  }
  const PAL_ALT = ['#6b7280', '#b6bac1']
  const CONTACT_MOTS = ['Aucun contact', 'Ceinturé / bloqué', 'Contact contrôlé', 'Plein contact', 'Opposition libre']

  function heureA(debut, plus) {
    if (!debut) return plus === 0 ? 'Début' : `+${plus} min`
    const [h, m] = String(debut).slice(0, 5).split(':').map(Number)
    const t = h * 60 + m + plus
    return `${Math.floor(t / 60) % 24}:${String(t % 60).padStart(2, '0')}`
  }

  function SessionAgenda({ evt }) {
    const blocs = blocsMap[evt.id] || []
    const evtLabel = evt.type === 'entrainement' ? (evt.style || evt.titre || 'Entraînement')
      : evt.type === 'muscu' ? (evt.titre || 'Musculation')
      : (evt.titre || TYPES[evt.type]?.label || 'Séance')
    const mins = blocs.map(b => parseDurMin(b.duree) || 0)
    const totalBlocs = mins.reduce((a, b) => a + b, 0)
    const total = totalBlocs || evt.duree_min || 0
    const debut = evt.heure ? String(evt.heure).slice(0, 5) : null
    let t = 0
    const departs = mins.map(m => { const x = t; t += m; return x })

    // Charge de la séance : la valeur la plus haute de ses blocs, et où elle arrive
    const pic = (val) => {
      let best = -1, at = -1
      blocs.forEach((b, k) => { const v = val(b); if (v != null && v > best) { best = v; at = k } })
      return best < 0 ? null : { val: best, bloc: blocs[at], heure: heureA(debut, departs[at]) }
    }
    const pc = pic(b => b.contact_intensite)
    const pv = pic(b => { const i = COURSE_VOLUMES.indexOf(b.course_volume); return i < 0 ? null : i })
    const pi = pic(b => { const i = COURSE_INTENSITES.indexOf(b.course_intensite); return i < 0 ? null : i })
    const ligneCharge = (k, note, mot, p) => (
      <div style={{ display: 'grid', gridTemplateColumns: '80px 38px 1fr', gap: '0 8px', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #e0e0e0', fontSize: 13 }}>
        <span style={{ color: '#6b7280', fontWeight: 700 }}>{k}</span>
        <span style={{ fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{note}/4</span>
        <span style={{ fontWeight: 700, color: '#333' }}>{mot}</span>
        <span style={{ gridColumn: 3, color: '#6b7280', fontSize: 12, fontWeight: 600 }}>{p.bloc.nom}, {debut ? 'à ' : ''}{p.heure}</span>
      </div>
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{TYPES[evt.type]?.label || 'Séance'}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>{evtLabel}</div>
          </div>
          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {debut
              ? <><b style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{total ? `${debut} – ${heureA(debut, total)}` : debut}</b>{total > 0 && <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>{total} min</span>}</>
              : <>{total > 0 && <b style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{total} min</b>}<span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>Heure non renseignée</span></>}
          </div>
        </div>

        {blocs.length > 0 && (
          <button data-noexport onClick={() => setDayPreview({ evt, blocs })}
            style={{ alignSelf: 'flex-start', fontSize: 13, fontWeight: 700, color: '#333', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
            Voir le déroulé détaillé
          </button>
        )}

        {blocs.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '62px 1fr', columnGap: 10 }}>
            {blocs.map((b, k) => {
              const iv = PAL_IV[b.intervenant]
              const bord = iv ? iv.bord : PAL_ALT[k % 2]
              return (
                <React.Fragment key={b.id}>
                  <span style={{ whiteSpace: 'nowrap', fontSize: 13, fontWeight: 800, color: '#333', fontVariantNumeric: 'tabular-nums', paddingTop: 7, borderTop: '1px solid #8a8a8a', marginBottom: 4 }}>{heureA(debut, departs[k])}</span>
                  <div style={{ minHeight: Math.max(34, mins[k] * 3.2), background: iv ? iv.bg : '#fff', borderLeft: `4px solid ${bord}`, borderRadius: '0 8px 8px 0', padding: '7px 11px', marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25, color: '#1a1a1a' }}>{b.nom}</span>
                      {mins[k] > 0 && <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: '#1a1a1a' }}>{mins[k]} min</span>}
                    </div>
                    {iv && <span style={{ fontSize: 12, fontWeight: 700, color: '#4b5563' }}>{iv.label}</span>}
                  </div>
                </React.Fragment>
              )
            })}
            {totalBlocs > 0 && <span style={{ whiteSpace: 'nowrap', fontSize: 13, fontWeight: 800, color: '#6b7280', paddingTop: 7, borderTop: '1px solid #cfcfcf' }}>{heureA(debut, totalBlocs)}</span>}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            {evt.lieu && <div>{evt.lieu}</div>}
            {evt.note && <div style={{ fontStyle: 'italic' }}>{evt.note}</div>}
            <div>Aucun déroulé renseigné</div>
          </div>
        )}

        {evt.type === 'entrainement' && blocs.length > 0 && (
          (pc || pv || pi) ? (
            <div style={{ borderTop: '1px solid #cfcfcf' }}>
              {pc && ligneCharge('Contact', pc.val, CONTACT_MOTS[pc.val] || '', pc)}
              {pv && ligneCharge('Course', pv.val + 1, COURSE_VOLUMES[pv.val], pv)}
              {pi && ligneCharge('Intensité', pi.val + 1, COURSE_INTENSITES[pi.val], pi)}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, border: '1px dashed #cfcfcf', borderRadius: 10, padding: '9px 11px' }}>Charge non renseignée pour cette séance</div>
          )
        )}
      </div>
    )
  }

  function MatchSimple({ evt }) {
    const [, mm, dd] = evt.date.split('-').map(Number)
    return (
      <div style={{ background: '#161616', color: '#fff', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ background: matchCatColor(evt.categorie, groupColor), padding: '10px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          Match{evt.categorie ? ` · ${evt.categorie}` : ''} · {dd}/{String(mm).padStart(2, '0')}
        </div>
        <div style={{ padding: '16px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{evt.adversaire ? `contre ${evt.adversaire}` : (evt.titre || 'Match')}</div>
          {evt.heure && <div style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: 8 }}>{String(evt.heure).slice(0, 5)}</div>}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', fontWeight: 600, marginTop: 4 }}>
            {[evt.domicile === true ? 'À domicile' : evt.domicile === false ? 'À l’extérieur' : null, evt.lieu].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
    )
  }

  function DayColumn({ day, pourImage }) {
    const [yy, mm, dd] = day.date.split('-').map(Number)
    const moisCourt = new Date(yy, mm - 1, dd).toLocaleDateString('fr-FR', { month: 'short' })
    const aMatch = day.events.some(e => e.type === 'ffr_match' || e.type === 'match')
    return (
      <div style={{ flex: aMatch ? '0 0 330px' : '1 1 0', minWidth: aMatch ? 330 : 280, padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16, background: '#f2f2f2', borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 10, borderBottom: '1px solid #cfcfcf' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a' }}>
            {DOW_FR[day.dow]} <small style={{ fontWeight: 600, color: '#6b7280', fontSize: 14, marginLeft: 4 }}>{dd} {moisCourt}</small>
          </span>
          {!pourImage && day.date === todayISO && <span style={{ fontSize: 12, fontWeight: 800, background: '#e4f816', color: '#333', borderRadius: 4, padding: '1px 6px' }}>Aujourd'hui</span>}
          {!pourImage && (
            <button data-noexport onClick={() => setDayFull({ day })}
              style={{ fontSize: 13, fontWeight: 700, color: '#333', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
              Voir la journée
            </button>
          )}
        </div>
        {day.events.map(evt => (
          <div key={evt.id}>
            {evt.type === 'ffr_match' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                <MatchCardWeek m={evt} groupe={groupe} notreNom={notreNom} competition={competition} journee={evt._journee} />
                {!pourImage && (
                  <button data-noexport onClick={() => exporterMatch(evt)} disabled={exportEnCours} style={btnImage(false)}>
                    <IcoTelecharger /> Image du match
                  </button>
                )}
              </div>
            ) : evt.type === 'match' ? (
              <MatchSimple evt={evt} />
            ) : (
              <SessionAgenda evt={evt} />
            )}
          </div>
        ))}
      </div>
    )
  }

  // Fiche de la semaine (affichée dans la fenêtre, et rendue hors écran pour l'export)
  function FicheSemaine({ pourImage }) {
    return (
      <div style={{ background: '#f2f2f2', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", color: '#1a1a1a' }}>
        {pourImage && (
          <div style={{ background: '#333', color: '#fff', padding: '14px 18px' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Semaine {wkNum}{groupe?.nom ? ` · ${groupe.nom}` : ''}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', marginTop: 2 }}>{plage}</div>
          </div>
        )}
        {/* Jours séparés par une gouttière plus foncée */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, padding: 8, background: '#d9d9d9' }}>
          {activeDays.map(day => <DayColumn key={day.date} day={day} pourImage={pourImage} />)}
        </div>
        <Legende />
      </div>
    )
  }

  function Legende() {
    return (
      <div style={{ display: 'flex', gap: '8px 18px', flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#4b5563', fontWeight: 600, padding: '10px 18px', borderTop: '1px solid #e0e0e0' }}>
        {Object.values(PAL_IV).map(v => (
          <span key={v.label}><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, marginRight: 6, verticalAlign: -2, background: v.bord }} />{v.label}</span>
        ))}
        <span>
          {PAL_ALT.map(c => <span key={c} style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, marginRight: 4, verticalAlign: -2, background: c }} />)}
          <span style={{ marginLeft: 2 }}>Intervenant non renseigné</span>
        </span>
        <span>Charge : valeur la plus haute de la séance, notée sur 4</span>
      </div>
    )
  }

  /* ── SeanceBody — le corps "fiche tableau" d'une séance (blocs/séquences/totaux),
       réutilisé par DayPreviewModal (une séance) et DayFullModal (toute la journée) ── */
  function SeanceBody({ evt, blocs }) {
    // Découpe un tableau de séquences en séries (split à chaque inter_bloc)
    function splitSeries(seqs) {
      const series = []; let cur = []
      seqs.forEach(s => {
        if (s.type === 'inter_bloc') { series.push({ seqs: cur, interAfter: s }); cur = [] }
        else cur.push(s)
      })
      series.push({ seqs: cur, interAfter: null })
      return series
    }

    // Pré-calcul : numérotation des blocs (séries) et totaux
    let serieCounter = 0
    const processedBlocs = blocs.map((bloc, bidx) => {
      const bc2 = blocColor(bidx, bloc.intervenant)
      if (bloc.bloc_type !== 'sequences') return { kind: 'std', bloc, bc2 }
      const series = splitSeries(bloc.sequences || []).map(s => ({ ...s, num: ++serieCounter }))
      return { kind: 'seq', bloc, bc2, series }
    })

    // Pour représenter la durée des blocs standards par une barre proportionnelle
    // (sans forcer une case vide en hauteur quand il n'y a pas d'exercices).
    const stdDurations = processedBlocs.filter(i => i.kind === 'std').map(i => parseDurMin(i.bloc.duree) || 0)
    const maxStdDur = Math.max(1, ...stdDurations)

    // Totaux généraux (jeu + total hors inter_bloc)
    let grandJeu = 0, grandTotal = 0
    blocs.forEach(b => {
      if (b.bloc_type !== 'sequences') return
      ;(b.sequences || []).forEach(s => {
        if (s.type === 'jeu')   { grandJeu += s.duree_sec || 0; grandTotal += s.duree_sec || 0 }
        if (s.type === 'recup') grandTotal += s.duree_sec || 0
      })
    })

    const COL_BLOC = 58, COL_EFF = 110, COL_STAT = 62, COL_COND = 90
    const cellBorder = '1px solid #cbd5e1'

    return (
      <>
            {processedBlocs.map((item, itemIdx) => {
              const nextItem = processedBlocs[itemIdx + 1]
              if (item.kind === 'std') {
                /* Blocs standards (échauffement, retour au calme…) */
                const { bloc } = item
                // Regroupe les exercices par étiquette de groupe (ex: "Avants"/"Arrières")
                // pour les afficher en colonnes gauche→droite plutôt qu'en liste mélangée.
                const byGroup = {}
                for (const exo of (bloc.exos || [])) {
                  const g = exo.groupe_label?.trim() || ''
                  ;(byGroup[g] ||= []).push(exo)
                }
                const groupKeys = Object.keys(byGroup)
                const hasGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== '')
                const iv = bloc.intervenant === 'prepa' ? { c:'#b45309', t:'#fdf2e6', l:'Prépa physique' }
                  : bloc.intervenant === 'coachs' ? { c:'#1d4ed8', t:'#eaf0fd', l:'Coachs' }
                  : bloc.intervenant === 'both'   ? { c:'#52606d', t:'#eef1f3', l:'PP + Coachs' }
                  : null
                return (
                  <div key={bloc.id} style={{ marginBottom:8, borderRadius:10, overflow:'hidden', border:cellBorder, display:'flex' }}>
                    <div style={{ width:4, flexShrink:0, background: iv ? iv.c : '#cbd5e1' }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px' }}>
                        <span style={{ fontSize:'.88rem', fontWeight:800, color:'#161b22', flex:1 }}>{bloc.nom}</span>
                        {iv && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'.62rem', fontWeight:800, letterSpacing:'.03em', textTransform:'uppercase', borderRadius:6, padding:'3px 8px', flexShrink:0, background:iv.t, color:iv.c }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background:iv.c, flexShrink:0 }} />
                            {iv.l}
                          </span>
                        )}
                        {bloc.duree && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'.74rem', fontWeight:900, color:'#1e3a8a', background:'#e8f0fd', border:'1px solid #c7d9f7', borderRadius:6, padding:'3px 9px', flexShrink:0 }}>
                            {bloc.duree} min
                          </span>
                        )}
                      </div>
                      {/* Barre proportionnelle à la durée, relative au bloc le plus long de la séance */}
                      {parseDurMin(bloc.duree) > 0 && (
                        <div style={{ height:4, background:'#edf0f3', margin:'0 12px 10px' }}>
                          <div style={{ height:'100%', width:`${Math.max(6, (parseDurMin(bloc.duree)/maxStdDur)*100)}%`, background: iv ? iv.c : '#94a3b8', borderRadius:2 }} />
                        </div>
                      )}
                      {!hasGroups && (bloc.exos||[]).length > 0 && (
                        <div style={{ display:'flex', gap:7, flexWrap:'wrap', padding:'0 12px 10px' }}>
                          {bloc.exos.map(e => (
                            <span key={e.id} style={{ fontSize:'.74rem', fontWeight:600, color:'#26313f', background:'#eef1f5', border:'1px solid #d7dde4', borderRadius:'4px 7px 7px 4px', padding:'5px 10px 5px 8px' }}>
                              {e.nom}{e.prescription ? ' · '+e.prescription : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {hasGroups && (
                        <div style={{ display:'grid', gridTemplateColumns:`repeat(${groupKeys.length}, 1fr)`, borderTop:'1px solid #edf0f3' }}>
                          {groupKeys.map((g, gi) => {
                            const gc = GROUP_COLORS[gi % GROUP_COLORS.length]
                            return (
                              <div key={g} style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:7, borderLeft: gi > 0 ? '1px solid #edf0f3' : 'none' }}>
                                {g && <div style={{ fontSize:'.6rem', fontWeight:800, letterSpacing:'.07em', textTransform:'uppercase', color:gc, paddingBottom:6, marginBottom:2, borderBottom:`2px solid ${gc}` }}>{g}</div>}
                                {byGroup[g].map(e => (
                                  <span key={e.id} style={{ fontSize:'.74rem', fontWeight:600, color:'#26313f', background:gc+'12', border:`1px solid ${gc}35`, borderRadius:'4px 7px 7px 4px', padding:'5px 10px 5px 8px' }}>
                                    {e.nom}{e.prescription ? ' · '+e.prescription : ''}
                                  </span>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              /* Blocs séquences — format tableau */
              const { bloc, series } = item
              const hasMultipleSeries = series.length > 1
              // Entête colonnes
              const seqHeaderInfo = bloc.recup_inter_seq ? `(récup entre séq : ${bloc.recup_inter_seq})` : ''
              // Séparateur récup entre blocs (affiché après ce bloc, sauf si dernier)
              const showRecupAfter = nextItem != null && bloc.recup_inter_seq

              return (
                <React.Fragment key={bloc.id}>
                <div style={{ marginBottom: showRecupAfter ? 0 : 20, border:cellBorder, borderRadius: showRecupAfter ? '10px 10px 0 0' : 10, overflow:'hidden' }}>

                  {/* Titre du bloc (bandeau bleu) */}
                  <div style={{ background:'#7ba7d4', padding:'7px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:'.82rem', fontWeight:900, color:'#fff' }}>{bloc.nom}</span>
                    {seqHeaderInfo && <span style={{ fontSize:'.65rem', color:'rgba(255,255,255,.8)', fontStyle:'italic' }}>{seqHeaderInfo}</span>}
                  </div>

                  {/* Ligne d'en-têtes colonnes */}
                  <div style={{ display:'flex', background:'#e8f0f8', borderBottom:cellBorder, fontSize:'.6rem', fontWeight:800, color:'#374151', textTransform:'uppercase', letterSpacing:'.05em' }}>
                    <div style={{ width:COL_BLOC, flexShrink:0, padding:'5px 6px', borderRight:cellBorder, textAlign:'center' }}>Bloc</div>
                    <div style={{ width:COL_EFF, flexShrink:0, padding:'5px 6px', borderRight:cellBorder }}>Effectif</div>
                    <div style={{ flex:1, padding:'5px 10px', borderRight:cellBorder, textAlign:'center' }}>Temps des séquences</div>
                    <div style={{ width:COL_STAT, flexShrink:0, padding:'5px 4px', borderRight:cellBorder, textAlign:'center' }}>Jeu eff.</div>
                    <div style={{ width:COL_STAT, flexShrink:0, padding:'5px 4px', borderRight:cellBorder, textAlign:'center' }}>Total</div>
                    <div style={{ width:COL_COND, flexShrink:0, padding:'5px 6px', textAlign:'center' }}>Conditions</div>
                  </div>

                  {/* Lignes séries */}
                  {series.map(({ seqs, interAfter, num }, si) => {
                    const jeuSeqs = seqs.filter(s => s.type === 'jeu')
                    const jeuSec  = jeuSeqs.reduce((a,s) => a+(s.duree_sec||0), 0)
                    const totSec  = seqs.reduce((a,s) => a+(s.duree_sec||0), 0)
                    return (
                      <React.Fragment key={num}>
                        {/* Ligne de la série */}
                        <div style={{ display:'flex', alignItems:'stretch', borderBottom: (interAfter || si < series.length-1) ? cellBorder : 'none', minHeight:'max(52px, 8vh)' }}>
                          {/* Label Bloc N */}
                          <div style={{ width:COL_BLOC, flexShrink:0, background:'#f6c344', display:'flex', alignItems:'center', justifyContent:'center', borderRight:cellBorder, padding:'6px 4px' }}>
                            <span style={{ fontSize:'.7rem', fontWeight:900, color:'#78350f', textAlign:'center', lineHeight:1.3 }}>Bloc {num}</span>
                          </div>
                          {/* Effectif */}
                          <div style={{ width:COL_EFF, flexShrink:0, background:'#f0f4f8', display:'flex', alignItems:'center', borderRight:cellBorder, padding:'6px 8px' }}>
                            <span style={{ fontSize:'.64rem', fontWeight:700, color:'#374151', lineHeight:1.4 }}>{bloc.effectif_desc || ''}</span>
                          </div>
                          {/* Séquences jeu + récup intercalées */}
                          <div style={{ flex:1, display:'flex', alignItems:'stretch', borderRight:cellBorder }}>
                            {seqs.length === 0
                              ? <div style={{ flex:1, background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:'.65rem', color: '#6b7280', fontStyle:'italic' }}>—</span></div>
                              : seqs.map((seq, i) => {
                                const isJeu = seq.type === 'jeu'
                                return (
                                  <div key={seq.id} style={{
                                    flex: Math.max(seq.duree_sec || 0, 1),
                                    background: isJeu ? '#c8e6a0' : '#fef3c7',
                                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                                    padding:'4px 3px',
                                    borderRight: i < seqs.length-1 ? `1px solid ${isJeu?'#a3d977':'#fde68a'}` : 'none',
                                    textAlign:'center',
                                  }}>
                                    <span style={{ fontSize: isJeu?'.75rem':'.68rem', fontWeight:900, color: isJeu?'#1a4a0a':'#78350f' }}>{formatSeqDur(seq.duree_sec)}</span>
                                    {seq.theme && <span style={{ fontSize:'.6rem', fontWeight:800, color: isJeu?'#2d5a16':'#92400e', textTransform:'uppercase', marginTop:1, lineHeight:1.2 }}>{seq.theme}</span>}
                                    {!isJeu && <span style={{ fontSize:'.52rem', color:'#d97706', fontStyle:'italic' }}>récup</span>}
                                  </div>
                                )
                              })
                            }
                          </div>
                          {/* Jeu effectif */}
                          <div style={{ width:COL_STAT, flexShrink:0, background:'#f5c6b0', display:'flex', alignItems:'center', justifyContent:'center', borderRight:cellBorder, padding:'4px' }}>
                            <span style={{ fontSize:'.78rem', fontWeight:900, color:'#7c2d12' }}>{formatSeqDur(jeuSec)}</span>
                          </div>
                          {/* Total */}
                          <div style={{ width:COL_STAT, flexShrink:0, background:'#b8d0ee', display:'flex', alignItems:'center', justifyContent:'center', borderRight:cellBorder, padding:'4px' }}>
                            <span style={{ fontSize:'.78rem', fontWeight:900, color:'#1e3a8a' }}>{formatSeqDur(totSec)}</span>
                          </div>
                          {/* Conditions */}
                          <div style={{ width:COL_COND, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', padding:'4px 6px', textAlign:'center' }}>
                            <span style={{ fontSize:'.67rem', fontWeight:700, color:'#374151' }}>{bloc.conditions_jeu || '—'}</span>
                          </div>
                        </div>

                        {/* Récup inter-série */}
                        {interAfter && (
                          <div style={{ display:'flex', alignItems:'center', background:'#fef9c3', borderBottom:cellBorder, padding:'5px 14px' }}>
                            <span style={{ fontSize:'.72rem', fontWeight:800, color:'#78350f' }}>Récup {formatSeqDur(interAfter.duree_sec)}</span>
                          </div>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
                {/* Récup entre blocs */}
                {showRecupAfter && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fef9c3', border:cellBorder, borderTop:'none', borderRadius:'0 0 10px 10px', padding:'6px 16px', marginBottom:20 }}>
                    <span style={{ fontSize:'.65rem', fontWeight:900, color:'#92400e', textTransform:'uppercase', letterSpacing:'.05em' }}>Récup entre blocs</span>
                    <span style={{ fontSize:'.8rem', fontWeight:900, color:'#78350f' }}>· {bloc.recup_inter_seq}</span>
                  </div>
                )}
                </React.Fragment>
              )
            })}

            {/* ── Totaux généraux ── */}
            {serieCounter > 0 && (
              <div style={{ display:'flex', justifyContent:'flex-end', gap:24, paddingTop:8, borderTop:'2px solid #e5e7eb' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'.58rem', fontWeight:700, color: '#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>Jeu effectif</div>
                  <div style={{ fontSize:'.95rem', fontWeight:900, color:'#7c2d12' }}>{formatSeqDur(grandJeu)}</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'.58rem', fontWeight:700, color: '#6b7280', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>Temps total</div>
                  <div style={{ fontSize:'.95rem', fontWeight:900, color:'#1e3a8a' }}>{formatSeqDur(grandTotal)}</div>
                </div>
              </div>
            )}
      </>
    )
  }

  /* ── DayPreviewModal — fiche séance style tableau (une séance) ── */
  function DayPreviewModal({ evt, blocs }) {
    const evtLabel = evt.type === 'entrainement' ? (evt.style || evt.titre || 'Entraînement')
      : evt.type === 'muscu' ? (evt.titre || 'Musculation')
      : (evt.titre || TYPES[evt.type]?.label || 'Séance')

    return (
      <>
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:120 }} onClick={() => setDayPreview(null)} />
        <div style={{ position:'fixed', top:'4vh', left:'50%', transform:'translateX(-50%)', width:'min(960px, 96vw)', maxHeight:'90vh', zIndex:121, background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 28px 90px rgba(0,0,0,.5)', display:'flex', flexDirection:'column' }}>

          {/* ── Header bleu séance ── */}
          <div style={{ background:'#5b8ab8', padding:'12px 18px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'.6rem', fontWeight:700, color:'rgba(255,255,255,.7)', textTransform:'uppercase', letterSpacing:'.07em' }}>{TYPES[evt.type]?.label || evt.type}</div>
              <div style={{ fontSize:'1.05rem', fontWeight:900, color:'#fff' }}>{evtLabel}</div>
            </div>
            {evt.heure && <span style={{ fontSize:'.9rem', fontWeight:900, color:'#fff', background:'rgba(0,0,0,.2)', borderRadius:7, padding:'4px 10px' }}>{String(evt.heure).slice(0,5)}</span>}
            <button onClick={() => setDayPreview(null)} style={{ background:'rgba(255,255,255,.18)', border:'none', color:'#fff', borderRadius:8, width:30, height:30, fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'inherit' }}>×</button>
          </div>

          {/* ── Corps — mis à l'échelle pour tout tenir sans scroller ── */}
          <FitScale>
            <SeanceBody evt={evt} blocs={blocs} />
          </FitScale>
        </div>
      </>
    )
  }

  /* ── DayFullModal — toutes les séances d'un même jour, empilées ── */
  function DayFullModal({ day }) {
    const [yy, mm, dd] = day.date.split('-').map(Number)
    const dateLabel = new Date(yy, mm - 1, dd).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

    return (
      <>
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:130 }} onClick={() => setDayFull(null)} />
        <div style={{ position:'fixed', top:'4vh', left:'50%', transform:'translateX(-50%)', width:'min(920px, 96vw)', maxHeight:'92vh', zIndex:131, background:'#f5f6f8', borderRadius:16, overflow:'hidden', boxShadow:'0 28px 90px rgba(0,0,0,.5)', display:'flex', flexDirection:'column' }}>

          {/* ── Header jour ── */}
          <div style={{ background:'#333', padding:'12px 18px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <div style={{ flex:1, fontSize:'.95rem', fontWeight:900, color:'#fff', textTransform:'capitalize' }}>{dateLabel}</div>
            <button onClick={() => setDayFull(null)} style={{ background:'rgba(255,255,255,.18)', border:'none', color:'#fff', borderRadius:8, width:30, height:30, fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'inherit' }}>×</button>
          </div>

          {/* ── Corps : toutes les séances du jour, même rendu que le résumé de semaine mais en large ── */}
          <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:16 }}>
            {day.events.length === 0 ? (
              <p style={{ textAlign:'center', color:'#9aa1ac', fontSize:'.85rem' }}>Rien de prévu ce jour.</p>
            ) : day.events.map(evt => (
              <EventContent key={evt.id} evt={evt} wide />
            ))}
          </div>
        </div>
      </>
    )
  }

  const btnNav = { background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const resume = [nbTrain && `${nbTrain} entraînement${nbTrain > 1 ? 's' : ''}`, nbMuscu && `${nbMuscu} muscu`, nbMatch && `${nbMatch} match${nbMatch > 1 ? 's' : ''}`].filter(Boolean).join(', ')

  return (
    <>
      {dayPreview && <DayPreviewModal evt={dayPreview.evt} blocs={dayPreview.blocs} />}
      {dayFull && <DayFullModal day={dayFull.day} />}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,23,.55)', zIndex: 110 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: '70px', left: '2vw', right: '2vw', bottom: '2vh', zIndex: 111, background: '#f2f2f2', borderRadius: 16, boxShadow: '0 32px 100px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* En-tête */}
        <div style={{ background: '#333', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', flexShrink: 0 }}>
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>Semaine {wkNum}</div>
            <div style={{ color: 'rgba(255,255,255,.72)', fontSize: 13, marginTop: 2 }}>{plage}{resume ? ` · ${resume}` : ''}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {exportErreur && <span style={{ color: '#fecaca', fontSize: 13, fontWeight: 600 }}>{exportErreur}</span>}
            {activeDays.length > 0 && (
              <button onClick={exporterSemaine} disabled={exportEnCours} style={btnImage(true)}>
                <IcoTelecharger /> {exportEnCours ? 'Création de l\u2019image…' : 'Enregistrer l\u2019image'}
              </button>
            )}
            <button onClick={() => onNavigate(-1)} style={btnNav}>Semaine {wkNum - 1}</button>
            <button onClick={() => onNavigate(1)} style={btnNav}>Semaine {wkNum + 1}</button>
            <button onClick={onClose} style={btnNav}>Fermer</button>
          </div>
        </div>

        {/* Jours */}
        {activeDays.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 15 }}>Aucune séance cette semaine</div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <div style={{ minWidth: 'max-content' }}>
              <FicheSemaine />
            </div>
          </div>
        )}
      </div>

      {/* Rendu hors écran pour l'export en image */}
      {aExporter && (
        <div style={{ position: 'fixed', left: -100000, top: 0, zIndex: -1 }} aria-hidden="true">
          {aExporter.type === 'match' ? (
            <div ref={exportRef} style={{ display: 'inline-block' }}>
              <MatchCardShare m={aExporter.evt} groupe={groupe} notreNom={notreNom} competition={competition} journee={aExporter.evt._journee} />
            </div>
          ) : (
            <div ref={exportRef} style={{ width: 1600 }}>
              <FicheSemaine pourImage />
            </div>
          )}
        </div>
      )}
    </>
  )
}
