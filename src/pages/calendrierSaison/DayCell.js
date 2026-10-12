import React from 'react'
import { DOW, STYLE_COLORS, TYPES, iso, matchCatColor } from './constants'
import { S } from './styles'

// Une journée de la grille saison. Composant mémoïsé : survoler / sélectionner
// un jour ne redessine que les cases dont l'état change (avant, les 372 cases
// étaient redessinées à chaque mouvement de souris). Les actions passent par
// `h`, un objet stable (voir CalendrierSaison.js).

function ContenuJour({ evs, ffr, y, m, d, groupColor, draggingId, h }) {
  if (!evs.length && !ffr.length) return <div style={{ flex: 1 }} />
  return (
    /* position:relative → les overlays absolus FFR sont relatifs à ce wrapper */
    <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
      {/* Matchs FFR : position:absolute → aucun impact sur la hauteur de la cellule */}
      {ffr.map(fm => {
        const adversaire = fm.est_domicile ? fm.equipe_ext : fm.est_domicile === false ? fm.equipe_dom : (fm.equipe_ext || fm.equipe_dom)
        const joue = fm.score_dom != null && fm.score_ext != null
        const scoreAff = joue
          ? (fm.est_domicile ? `${fm.score_dom}-${fm.score_ext}` : fm.est_domicile === false ? `${fm.score_ext}-${fm.score_dom}` : `${fm.score_dom}-${fm.score_ext}`)
          : fm.heure || ''
        const gagne = joue && (fm.est_domicile ? fm.score_dom > fm.score_ext : fm.est_domicile === false ? fm.score_ext > fm.score_dom : false)
        const perdu = joue && (fm.est_domicile ? fm.score_dom < fm.score_ext : fm.est_domicile === false ? fm.score_ext < fm.score_dom : false)
        const bg = joue ? (gagne ? '#16a34a' : perdu ? '#dc2626' : '#64748b') : '#1e40af'
        const logoAdv = fm.est_domicile ? fm.logo_ext : fm.est_domicile === false ? fm.logo_dom : (fm.logo_ext || fm.logo_dom)
        return (
          <div role="button" tabIndex={0} key={fm.id}
            title={`Match FFR${fm.journee ? ' · J' + fm.journee : ''} · ${fm.equipe_dom} vs ${fm.equipe_ext} — Cliquer pour détails`}
            onClick={() => h.weekZoom(iso(y, m, d))}
            style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 1,
              background: bg, color: '#fff', fontWeight: 800, fontSize: '0.55rem',
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '0 4px', overflow: 'hidden', whiteSpace: 'nowrap',
              borderLeft: '3px solid rgba(255,255,255,0.35)', cursor: 'pointer',
            }}>
            {logoAdv && <img loading="lazy" src={logoAdv} alt="" style={{ width: 13, height: 13, objectFit: 'contain', flexShrink: 0, borderRadius: 2 }} onError={e => { e.target.style.display = 'none' }} />}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>vs {adversaire || 'Match'}</span>
            {scoreAff && <small style={{ fontSize: '0.48rem', opacity: 0.9, flexShrink: 0 }}>{scoreAff}</small>}
          </div>
        )
      })}
      {/* Évènements du groupe (flux normal, derrière l'overlay FFR si présent) */}
      {evs.map(e => {
        const T = TYPES[e.type] || TYPES.autre
        // Évènement hérité d'un groupe parent : lecture seule (aperçu), ni menu
        // contextuel ni déplacement — à modifier depuis son groupe d'origine.
        const onCtx = e._inherited ? undefined : ev => h.evtContext(ev, e)
        const onEvtClick = () => h.evtClick(e)
        const dragProps = e._inherited ? {} : {
          draggable: true,
          onMouseDown: ev => h.evtMouseDown(ev, e),
          onDragStart: ev => { ev.stopPropagation(); h.dragStart(e); ev.dataTransfer.effectAllowed = 'move' },
          onDragEnd: () => h.dragEnd(),
        }
        const dragOpacity = draggingId === e.id ? 0.4 : 1
        const curseur = e._inherited ? 'pointer' : 'grab'
        if (e.type === 'match') {
          const mc = matchCatColor(e.categorie, groupColor)
          return (
            <div role="button" tabIndex={0} key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title={`Match${e.categorie ? ' · ' + e.categorie : ''}${e._inherited ? ' (groupe principal)' : ''}`}
              style={{ background: mc, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', display: 'flex', justifyContent: 'space-between', gap: 4, cursor: curseur, overflow: 'hidden', whiteSpace: 'nowrap', opacity: dragOpacity }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.adversaire || e.titre || 'Match'}</span>
              {e.domicile != null && <small style={{ fontSize: '0.5rem', fontWeight: 700, opacity: 0.9 }}>{e.domicile ? 'dom' : 'ext'}</small>}
            </div>
          )
        }
        if (e.type === 'recup') {
          return <div role="button" tabIndex={0} key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title="Récup" style={{ flex: 1, minHeight: 20, cursor: curseur, opacity: dragOpacity }} />
        }
        if (e.type === 'test') {
          return <div role="button" tabIndex={0} key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title={`Tests${e._inherited ? ' (groupe principal)' : ''}`} style={{ background: groupColor, color: '#fff', fontWeight: 800, fontSize: '0.6rem', padding: '0 5px', lineHeight: '20px', cursor: curseur, overflow: 'hidden', whiteSpace: 'nowrap', opacity: dragOpacity }}>{e.titre || T.label}</div>
        }
        const neutral = T.neutral
        // la musculation garde sa couleur propre pour se distinguer des entraînements
        const teinte = e.type === 'muscu' ? T.color : groupColor
        const txt = e.type === 'entrainement' ? (e.style || e.titre || T.label) : (e.titre || T.short || T.label)
        const styleColor = e.type === 'entrainement' ? STYLE_COLORS[e.style] : null
        return (
          <div role="button" tabIndex={0} key={e.id} {...dragProps} onClick={onEvtClick} onContextMenu={onCtx} title={`${T.label}${e._inherited ? ' (groupe principal)' : ''}`}
            style={{
              fontSize: '0.6rem', fontWeight: 700, padding: '0 5px', lineHeight: '20px', cursor: curseur,
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', opacity: dragOpacity,
              color: styleColor ? '#fff' : neutral ? '#5b626c' : '#3a4049',
              background: styleColor || (neutral ? '#f0f2f5' : `color-mix(in srgb, ${teinte} 12%, #fff)`),
              borderLeft: `3px ${e._inherited ? 'dashed' : 'solid'} ${styleColor || (neutral ? '#c4ccd4' : `color-mix(in srgb, ${teinte} 65%, #fff)`)}`,
            }}>
            {txt}
          </div>
        )
      })}
    </div>
  )
}

function DayCellBase({
  y, m, d, dISO, dow, evs, ffr, groupColor, h,
  vacIn, vacStart, vacLabel, isToday, isPastDay, weekStart, wkNum,
  selected, dropOver, dragActive, draggingId,
}) {
  return (
    <div style={weekStart && d !== 1 ? S.weekSep : null}>
      {weekStart && (
        <div
          style={{ ...S.weekTag, ...(isPastDay ? S.weekTagPast : null), cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); h.weekZoom(dISO) }}
          title="Voir le détail de cette semaine"
        >S{wkNum}</div>
      )}
      {vacIn && vacStart && <div style={S.vacband}>{vacLabel}</div>}
      <div
        onMouseDown={e => h.dayMouseDown(e, dISO)}
        onMouseEnter={() => h.dayMouseEnter(dISO)}
        onDoubleClick={e => h.dayDoubleClick(e, dISO)}
        onContextMenu={e => h.dayContext(e, dISO)}
        onDragOver={dragActive ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; h.dragOver(dISO) }) : undefined}
        onDrop={dragActive ? (e => { e.preventDefault(); h.drop(dISO) }) : undefined}
        style={{
          ...S.drow,
          ...(isPastDay ? S.drowPast : null),
          ...(vacIn ? S.drowVac : null),
          ...(isToday ? S.drowToday : null),
          ...(dropOver ? S.drowDrop : null),
          ...(selected ? S.drowSel : null),
          userSelect: 'none',
        }}>
        <div style={{ ...S.dnum, ...(isPastDay ? S.dnumPast : null) }}>{d}</div>
        <div style={S.ddow}>{DOW[dow]}</div>
        <ContenuJour evs={evs} ffr={ffr} y={y} m={m} d={d} groupColor={groupColor} draggingId={draggingId} h={h} />
      </div>
    </div>
  )
}

export const DayCell = React.memo(DayCellBase)
