import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import CalculateurIntensite from '../../components/CalculateurIntensite'
import DocumentsEvenement from '../../components/DocumentsEvenement'
import SchemaSVG from '../../components/SchemaSVG'
import SchemaTerrainView from '../../components/SchemaTerrainView'

import { CONTACT_LEVELS, COURSE_INTENSITES, COURSE_VOLUMES, CREATE_TYPES, HAS_BLOCS, MATCH_CATEGORIES, STYLE_COLORS, THEMES_SEANCE, TYPES } from './constants'
import { generateBlocPalette } from './couleurs'
import { calcDureeBloc, calcJeuEffectif, formatSeqDur, parseDurMin } from './seqHelpers'
import { Sm } from './styles'

// Schéma de la bibliothèque : nouveau format (éditeur de terrain) ou ancien
function ApercuSchema({ donnees }) {
  return donnees?.schema
    ? <SchemaTerrainView value={donnees.schema} />
    : <SchemaSVG donnees={donnees} showDistances={false} />
}

/* ── SeanceModal — plein écran, remplace l'ancien panneau latéral ── */
export function SeanceModal({
  panel, groupColor, groupeId, couleurSecondaire, closePanel, setForm,
  addBloc, updateBloc, deleteBloc,
  addExo, updateExo, deleteExo,
  saveEvent, deleteEvent, saving,
  removeSeq, addSeqToState, patchSeqInState, setBlocSeqs, addSeqBeforeInterBloc,
  reloadBlocs,
}) {
  const BLOC_COLORS = generateBlocPalette(groupColor, couleurSecondaire)
  function blocColor(idx, intervenant) {
    if (intervenant === 'prepa')  return '#b45309'
    if (intervenant === 'coachs') return '#1d4ed8'
    if (intervenant === 'both')   return '#1a1a1a'
    return BLOC_COLORS[idx % BLOC_COLORS.length]
  }
  const { form } = panel
  const hasBlocs = HAS_BLOCS.includes(form.type) || form.type === 'collectif'
  const totalMin = Number(form.duree_min) || 0

  // ── Vue d'ensemble : miniature de schéma + volume par groupe de niveau,
  // affichés directement dans la carte du bloc sans ouvrir le panneau
  // "Schéma & intensité" (cahier des charges section 5).
  const [schemaOverview, setSchemaOverview] = useState({}) // blocId -> [{niveauId, niveauNom, niveauCouleur, schemaId, schemaDonnees, volumeM}]
  const [schemaOverviewRefresh, setSchemaOverviewRefresh] = useState(0)
  const seqBlocIds = (panel.blocs || []).map(b => b.id)
  const seqBlocIdsKey = seqBlocIds.slice().sort().join(',')
  useEffect(() => {
    if (!seqBlocIds.length || !groupeId) { setSchemaOverview({}); return }
    let cancelled = false
    ;(async () => {
      const [{ data: attachments }, { data: niveauxData }] = await Promise.all([
        supabase.from('exercice_groupe_schemas').select('*').in('bloc_id', seqBlocIds),
        supabase.from('groupes_niveau').select('id, nom, couleur').eq('groupe_id', groupeId),
      ])
      if (cancelled || !attachments?.length) { if (!cancelled) setSchemaOverview({}); return }
      const schemaIds = [...new Set(attachments.map(a => a.schema_id).filter(Boolean))]
      const { data: schemas } = schemaIds.length
        ? await supabase.from('schemas_entrainement').select('id, donnees').in('id', schemaIds)
        : { data: [] }
      if (cancelled) return
      const niveauById = Object.fromEntries((niveauxData || []).map(n => [n.id, n]))
      const schemaById = Object.fromEntries((schemas || []).map(s => [s.id, s]))
      const map = {}
      attachments.forEach(a => {
        const niveau = a.niveau_id ? niveauById[a.niveau_id] : null
        ;(map[a.bloc_id] ||= []).push({
          niveauId: a.niveau_id,
          niveauNom: niveau?.nom || 'Tous',
          niveauCouleur: niveau?.couleur || '#9ca3af',
          schemaDonnees: a.schema_id ? schemaById[a.schema_id]?.donnees : null,
          volumeM: a.resultat?.volumeM ?? null,
        })
      })
      setSchemaOverview(map)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seqBlocIdsKey, groupeId, schemaOverviewRefresh])

  // ── Niveaux & intensité — colonne persistante (remplace le panneau popup) ──
  const [activeNiveauBlocId, setActiveNiveauBlocId] = useState(null)
  const activeNiveauBloc = (panel.blocs || []).find(b => b.id === activeNiveauBlocId) || null
  const [niveauxRail, setNiveauxRail] = useState({ niveaux: [], schemas: [], attachments: [], loading: false })
  const [calcNiveau, setCalcNiveau] = useState(null)
  const seqBlocsList = (panel.blocs || [])
  const seqBlocsListKey = seqBlocsList.map(b => b.id).join(',')
  useEffect(() => {
    if (!seqBlocsList.find(b => b.id === activeNiveauBlocId)) {
      setActiveNiveauBlocId(seqBlocsList[0]?.id || null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seqBlocsListKey])
  useEffect(() => {
    if (!activeNiveauBlocId || !groupeId) { setNiveauxRail({ niveaux: [], schemas: [], attachments: [], loading: false }); return }
    let cancelled = false
    setNiveauxRail(r => ({ ...r, loading: true }))
    ;(async () => {
      const [{ data: n }, { data: s }, { data: a }] = await Promise.all([
        supabase.from('groupes_niveau').select('*').eq('groupe_id', groupeId).order('ordre'),
        supabase.from('schemas_entrainement').select('id, nom, donnees').order('nom'),
        supabase.from('exercice_groupe_schemas').select('*').eq('bloc_id', activeNiveauBlocId),
      ])
      if (cancelled) return
      setNiveauxRail({ niveaux: n || [], schemas: s || [], attachments: a || [], loading: false })
    })()
    return () => { cancelled = true }
  }, [activeNiveauBlocId, groupeId])
  function niveauAttachmentFor(niveauId) {
    return niveauxRail.attachments.find(a => a.niveau_id === niveauId) || null
  }
  async function setNiveauSchema(niveauId, schemaId) {
    const existing = niveauAttachmentFor(niveauId)
    if (existing) {
      if (!schemaId && !existing.resultat) {
        await supabase.from('exercice_groupe_schemas').delete().eq('id', existing.id)
        setNiveauxRail(r => ({ ...r, attachments: r.attachments.filter(a => a.id !== existing.id) }))
      } else {
        await supabase.from('exercice_groupe_schemas').update({ schema_id: schemaId || null, updated_at: new Date().toISOString() }).eq('id', existing.id)
        setNiveauxRail(r => ({ ...r, attachments: r.attachments.map(a => a.id === existing.id ? { ...a, schema_id: schemaId || null } : a) }))
      }
    } else if (schemaId) {
      const { data, error } = await supabase.from('exercice_groupe_schemas')
        .insert({ bloc_id: activeNiveauBlocId, niveau_id: niveauId, schema_id: schemaId }).select().single()
      if (!error) setNiveauxRail(r => ({ ...r, attachments: [...r.attachments, data] }))
    }
    setSchemaOverviewRefresh(k => k + 1)
  }
  async function retirerNiveauAttachment(niveauId) {
    const existing = niveauAttachmentFor(niveauId)
    if (!existing) return
    await supabase.from('exercice_groupe_schemas').delete().eq('id', existing.id)
    setNiveauxRail(r => ({ ...r, attachments: r.attachments.filter(a => a.id !== existing.id) }))
    setSchemaOverviewRefresh(k => k + 1)
  }
  async function appliquerCalculNiveau(niveau, { parametres, resultat }) {
    const existing = niveauAttachmentFor(niveau.id)
    if (existing) {
      await supabase.from('exercice_groupe_schemas').update({ parametres_calcul: parametres, resultat, updated_at: new Date().toISOString() }).eq('id', existing.id)
      setNiveauxRail(r => ({ ...r, attachments: r.attachments.map(a => a.id === existing.id ? { ...a, parametres_calcul: parametres, resultat } : a) }))
    } else {
      const { data, error } = await supabase.from('exercice_groupe_schemas')
        .insert({ bloc_id: activeNiveauBlocId, niveau_id: niveau.id, parametres_calcul: parametres, resultat }).select().single()
      if (!error) setNiveauxRail(r => ({ ...r, attachments: [...r.attachments, data] }))
    }
    setCalcNiveau(null)
    setSchemaOverviewRefresh(k => k + 1)
  }

  // ── Réordonnancement des blocs par glisser-déposer ──
  const dragBlocRef = useRef(null)
  function reorderBlocs(fromId, targetId) {
    if (!fromId || fromId === targetId) return
    const sorted = [...panel.blocs].sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
    const fromIdx = sorted.findIndex(b => b.id === fromId)
    const toIdx = sorted.findIndex(b => b.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...sorted]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    reordered.forEach((b, i) => { if ((b.ordre || 0) !== i + 1) updateBloc(b.id, { ordre: i + 1 }) })
  }

  // ── Durée des blocs "séquences" (jeu/récup) : toujours dérivée de leurs
  // séquences, jamais saisie à la main — élimine la désynchronisation entre
  // le chrono affiché dans le bloc et le détail jeu/récup à l'intérieur.
  function sumSeqMin(seqs) { return Math.round((seqs || []).reduce((a, s) => a + (s.duree_sec || 0), 0) / 60) }
  useEffect(() => {
    (panel.blocs || []).forEach(b => {
      if (b.bloc_type === 'sequences') {
        const computed = String(sumSeqMin(b.sequences))
        if (b.duree !== computed) updateBloc(b.id, { duree: computed })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.blocs])

  // ── Récupération inter-blocs ──
  const [recupEditBloc, setRecupEditBloc] = useState(null)
  const [recupDraft, setRecupDraft]       = useState('')

  // Blocs triés + startMin cumulatif
  const sortedBlocs = [...panel.blocs].sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
  let cursor = 0
  const blocsWithPos = sortedBlocs.map(b => {
    const dur = parseDurMin(b.duree) ?? 0
    const start = cursor
    cursor += dur
    return { ...b, startMin: start, durationMin: dur }
  })
  const usedMin = blocsWithPos.reduce((s, b) => s + b.durationMin, 0)

  // ── Séquences ──
  const evtId = panel.evt?.id
  const [selectedSeqId, setSelectedSeqId] = useState(null)
  const dragSeqId = React.useRef(null)

  async function addSequence(blocId, type = 'jeu') {
    const bloc = (panel.blocs || []).find(b => b.id === blocId)
    const maxOrdre = (bloc?.sequences || []).reduce((m, s) => Math.max(m, s.ordre || 0), 0)
    const payload = { bloc_id: blocId, type, theme: type === 'jeu' ? '' : 'Récup.', duree_sec: type === 'jeu' ? 90 : 35, ordre: maxOrdre + 1 }
    // Ajout optimiste immédiat
    const tmpId = `tmp-${Date.now()}`
    addSeqToState?.(blocId, { id: tmpId, ...payload })
    setSelectedSeqId(tmpId)
    const { data } = await supabase.from('groupe_seance_sequences').insert(payload).select().single()
    if (data) {
      setBlocSeqs?.(blocId, seqs => seqs.map(s => s.id === tmpId ? data : s))
      setSelectedSeqId(data.id)
    }
  }
  async function updateSequence(seqId, patch) {
    patchSeqInState?.(seqId, patch)   // UI instantanée
    await supabase.from('groupe_seance_sequences').update(patch).eq('id', seqId)
  }
  async function addNouvelleSerie(blocId) {
    const bloc = (panel.blocs || []).find(b => b.id === blocId)
    const maxOrdre = (bloc?.sequences || []).reduce((m, s) => Math.max(m, s.ordre || 0), 0)
    const interPayload = { bloc_id: blocId, type: 'inter_bloc', ordre: maxOrdre + 1, duree_sec: 180, theme: 'Récup série' }
    const jeuPayload   = { bloc_id: blocId, type: 'jeu',        ordre: maxOrdre + 2, duree_sec: 90,  theme: '' }
    // Ajout optimiste
    const tmpInter = `tmp-inter-${Date.now()}`, tmpJeu = `tmp-jeu-${Date.now()}`
    addSeqToState?.(blocId, { id: tmpInter, ...interPayload })
    addSeqToState?.(blocId, { id: tmpJeu,   ...jeuPayload   })
    // Sync DB
    const { data: d1 } = await supabase.from('groupe_seance_sequences').insert(interPayload).select().single()
    const { data: d2 } = await supabase.from('groupe_seance_sequences').insert(jeuPayload).select().single()
    // Remplace IDs temporaires
    if (d1 || d2) {
      setBlocSeqs(blocId, seqs => seqs.map(s =>
        s.id === tmpInter && d1 ? d1 :
        s.id === tmpJeu   && d2 ? d2 : s
      ))
    }
  }

  async function deleteSequence(blocId, seqId) {
    if (!seqId || !blocId) return
    setSelectedSeqId(null)
    removeSeq?.(blocId, seqId)   // UI instantanée
    await supabase.from('groupe_seance_sequences').delete().eq('id', seqId)
  }
  async function reorderSequences(blocId, fromId, toId) {
    const bloc = (panel.blocs || []).find(b => b.id === blocId)
    if (!bloc) return
    const seqs = [...(bloc.sequences || [])].sort((a, b) => a.ordre - b.ordre)
    const fromIdx = seqs.findIndex(s => s.id === fromId)
    const toIdx   = seqs.findIndex(s => s.id === toId)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    const reordered = [...seqs]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    // Mise à jour locale instantanée
    setBlocSeqs?.(blocId, reordered.map((s, i) => ({ ...s, ordre: i + 1 })))
    // Sync DB (await pour garantir l'exécution)
    await Promise.all(reordered.map((s, i) =>
      supabase.from('groupe_seance_sequences').update({ ordre: i + 1 }).eq('id', s.id)
    ))
  }

  async function addBlocSequences() {
    if (!panel?.evt) { alert("Enregistre d'abord la séance pour lui ajouter un déroulé."); return }
    const { data: nb } = await supabase.from('groupe_seance_blocs')
      .select('ordre', { count:'exact' }).eq('evenement_id', evtId)
    const ordre = Math.max(0, ...((nb || []).map(b => b.ordre || 0))) + 1
    await supabase.from('groupe_seance_blocs').insert({
      evenement_id: evtId, nom:'Opposition', duree:'30', ordre,
      bloc_type:'sequences', conditions_jeu:'Plaqué / Touché', recup_inter_seq:"30'' à 45''"
    })
    reloadBlocs?.()
  }

  // Libellé de la date
  const dateLabel = form.date ? (() => {
    const [y, m, d] = form.date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  })() : 'Nouvel événement'


  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,23,.55)', zIndex: 110 }} onClick={closePanel} />

      {/* Modal — onKeyDown stopPropagation empêche les raccourcis calendrier (Cmd+C/V) de se déclencher depuis la modale */}
      <div onKeyDown={e => e.stopPropagation()} style={{ position: 'fixed', top: 18, bottom: 18, left: '50%', transform: 'translateX(-50%)', width: 'min(97vw, 1500px)', zIndex: 111, background: '#f5f6f8', borderRadius: 20, boxShadow: '0 32px 100px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div>
            <div style={{ color: '#fff', fontSize: '.95rem', fontWeight: 800, textTransform: 'capitalize' }}>{dateLabel}</div>
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.68rem', marginTop: 1 }}>
              {panel.mode === 'create' ? 'Nouvel événement' : 'Modifier l\'événement'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {CREATE_TYPES.map(k => (
              <button key={k} onClick={() => setForm({ type: k })} style={{ background: form.type === k ? '#e4f816' : 'rgba(255,255,255,.1)', border: 'none', color: form.type === k ? '#333' : 'rgba(255,255,255,.55)', borderRadius: 8, padding: '5px 13px', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer' }}>
                {TYPES[k].label}
              </button>
            ))}
          </div>
          <button onClick={closePanel} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body 2 colonnes */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: hasBlocs ? '300px 1fr 320px' : '1fr', overflow: 'hidden', minHeight: 0 }}>

          {/* ── Colonne formulaire ── */}
          <div style={{ background: '#fff', borderRight: hasBlocs ? '1px solid #e0e3e8' : 'none', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

            <div style={Sm.section}>
              <div style={Sm.sTitle}>Horaire</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={Sm.fLabel}>Heure</div>
                  <input type="time" value={form.heure} onChange={e => setForm({ heure: e.target.value })} style={Sm.input} />
                </div>
                {form.type !== 'match' && (
                  <div style={{ flex: 1 }}>
                    <div style={Sm.fLabel}>Durée totale (min)</div>
                    <input type="number" value={form.duree_min} onChange={e => setForm({ duree_min: e.target.value })} style={{ ...Sm.input, borderColor: '#7c3aed', background: '#f5f3ff', color: '#5b21b6', fontWeight: 900, textAlign: 'center', fontSize: '.9rem' }} />
                  </div>
                )}
              </div>
              {hasBlocs && usedMin > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: '.65rem', fontWeight: 700, color: usedMin === totalMin ? '#9aa1ac' : '#b45309' }}>
                    Σ blocs : {usedMin} min{usedMin !== totalMin ? ` (écart avec la durée totale)` : ''}
                  </span>
                  {usedMin !== totalMin && (
                    <button onClick={() => setForm({ duree_min: String(usedMin) })}
                      style={{ background: 'none', border: '1px solid #b45309', color: '#b45309', borderRadius: 6, padding: '1px 7px', fontSize: '.63rem', fontWeight: 700, cursor: 'pointer' }}>
                      Synchroniser
                    </button>
                  )}
                </div>
              )}
            </div>

            {hasBlocs && evtId && form.type !== 'collectif' && (
              <div style={Sm.section}>
                <div style={Sm.sTitle}>Document joint</div>
                <DocumentsEvenement evenementId={evtId} />
              </div>
            )}

            <div style={Sm.section}>
              <div style={Sm.sTitle}>{TYPES[form.type]?.label || 'Détails'}</div>

              {form.type === 'match' && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Adversaire</div>
                    <input value={form.adversaire} onChange={e => setForm({ adversaire: e.target.value })} placeholder="ex. Montauban" style={Sm.input} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Catégorie</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {MATCH_CATEGORIES.map(c => (
                        <button key={c} onClick={() => setForm({ categorie: c })} style={{ ...Sm.chip, ...(form.categorie === c ? { background: '#1a1a1a', color: '#e4f816', borderColor: '#1a1a1a' } : {}) }}>{c}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={Sm.fLabel}>Lieu</div>
                      <select value={form.domicile ? '1' : '0'} onChange={e => setForm({ domicile: e.target.value === '1' })} style={Sm.input}>
                        <option value="1">Domicile</option><option value="0">Extérieur</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={Sm.fLabel}>Journée</div>
                      <input value={form.journee} onChange={e => setForm({ journee: e.target.value })} placeholder="ex. J12" style={Sm.input} />
                    </div>
                  </div>
                </>
              )}

              {form.type === 'entrainement' && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Thèmes</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', border: '1.5px solid #e4e7ec', borderRadius: 8, padding: '6px 8px', background: '#f8f9fb' }}>
                      {(form.themes_seance || '').split(',').map(s => s.trim()).filter(Boolean).map(t => (
                        <span key={t} style={{ background: '#1a1a1a', color: '#e4f816', fontSize: '.66rem', fontWeight: 800, borderRadius: 5, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {t}
                          <span role="button" tabIndex={0} onClick={() => {
                            const cur = (form.themes_seance || '').split(',').map(s => s.trim()).filter(Boolean)
                            setForm({ themes_seance: cur.filter(x => x !== t).join(', ') })
                          }} style={{ cursor: 'pointer', opacity: .7 }}>×</span>
                        </span>
                      ))}
                      <select value="" onChange={e => {
                        if (!e.target.value) return
                        const cur = (form.themes_seance || '').split(',').map(s => s.trim()).filter(Boolean)
                        setForm({ themes_seance: [...cur, e.target.value].join(', ') })
                      }} style={{ border: 'none', background: 'none', outline: 'none', fontSize: '.7rem', color: '#9aa1ac', fontFamily: 'inherit', flex: 1, minWidth: 70 }}>
                        <option value="">+ ajouter…</option>
                        {THEMES_SEANCE.filter(t => !(form.themes_seance || '').split(',').map(s => s.trim()).includes(t)).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Type d'entraînement</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {Object.entries(STYLE_COLORS).map(([label, color]) => {
                        const active = form.style === label
                        return (
                          <button key={label} onClick={() => setForm({ style: active ? '' : label })}
                            style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: `2px solid ${active ? color : '#e5e7eb'}`, background: active ? color : 'white', color: active ? '#fff' : '#6b7280', fontSize: '.7rem', fontWeight: 800, cursor: 'pointer', outline: 'none', transition: 'all .15s' }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={Sm.fLabel}>Titre (optionnel)</div>
                    <input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Travail d'appuis" style={Sm.input} />
                  </div>
                </>
              )}

              {form.type === 'muscu' && (
                <div style={{ marginBottom: 10 }}>
                  <div style={Sm.fLabel}>Titre</div>
                  <input value={form.titre} onChange={e => setForm({ titre: e.target.value })} placeholder="ex. Force max bas du corps" style={Sm.input} />
                </div>
              )}
            </div>

            <div style={Sm.section}>
              <div style={Sm.sTitle}>Lieu</div>
              <input value={form.lieu} onChange={e => setForm({ lieu: e.target.value })} placeholder="Terrain, salle…" style={Sm.input} />
            </div>

            <div style={Sm.section}>
              <div style={Sm.sTitle}>Note</div>
              <textarea value={form.note} onChange={e => setForm({ note: e.target.value })} rows={3} style={{ ...Sm.input, resize: 'none', height: 72 }} />
            </div>
          </div>

          {/* ── Colonne blocs ── */}
          {hasBlocs && (
            <div style={{ background: '#fafbfc', borderRight: '1px solid #e0e3e8', overflowY: 'auto' }}>
              <div style={{ padding: '14px 16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
                  <div style={Sm.sTitle}>Blocs</div>
                  <div style={{ display:'flex', gap:5 }}>
                    <button onClick={addBloc} style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer' }}>+ Bloc</button>
                    <button onClick={addBlocSequences} style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: '.68rem', fontWeight: 800, cursor: 'pointer' }}>+ Déroulé jeu</button>
                  </div>
                </div>

                {panel.mode === 'create' && panel.blocs.length === 0 && (
                  <p style={{ fontSize: '.72rem', color: '#9aa1ac', fontStyle: 'italic' }}>Enregistre la séance d'abord.</p>
                )}

                {blocsWithPos.map((bloc, idx) => {
                  const color = blocColor(idx, bloc.intervenant)
                  const groups = {}
                  for (const exo of (bloc.exos || [])) {
                    const g = exo.groupe_label?.trim() || ''
                    ;(groups[g] ||= []).push(exo)
                  }
                  const gKeys = Object.keys(groups)
                  const hasGroups = gKeys.length > 1 || (gKeys.length === 1 && gKeys[0] !== '')
                  const isLast = idx === blocsWithPos.length - 1
                  const editingRecup = recupEditBloc === bloc.id
                  return (
                    <div key={bloc.id}>
                    <div style={{ marginBottom: 0, border: `1.5px solid ${color}35`, borderRadius: 10, overflow: 'hidden' }}>
                      {/* Tête colorée */}
                      <div style={{ background: color, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          draggable
                          onDragStart={() => { dragBlocRef.current = bloc.id }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); reorderBlocs(dragBlocRef.current, bloc.id) }}
                          title="Glisser pour réordonner"
                          style={{ cursor: 'grab', color: 'rgba(255,255,255,.6)', fontSize: '.8rem', lineHeight: 1, flexShrink: 0, letterSpacing: '-1px' }}>⠿⠿</span>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,.25)', color: '#fff', fontSize: '.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                        <input value={bloc.nom} onChange={e => updateBloc(bloc.id, { nom: e.target.value })} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '.78rem', fontWeight: 800, fontFamily: 'inherit', minWidth: 0 }} placeholder="Nom du bloc…" />
                        {bloc.intervenant && (
                          <span style={{ background: 'rgba(255,255,255,.28)', color: '#fff', fontSize: '.58rem', fontWeight: 900, borderRadius: 5, padding: '2px 7px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            {bloc.intervenant === 'prepa' ? 'Prépa physique' : bloc.intervenant === 'both' ? 'PP + Coachs' : 'Coachs'}
                          </span>
                        )}
                        {bloc.bloc_type === 'sequences' ? (
                          <span title="Calculée automatiquement à partir des séquences jeu/récup"
                            style={{ width: 44, background: 'rgba(0,0,0,.2)', color: '#fff', borderRadius: 5, padding: '2px 5px', fontSize: '.75rem', fontWeight: 900, textAlign: 'center', flexShrink: 0 }}>
                            {bloc.durationMin || 0}
                          </span>
                        ) : (
                          <input
                            type="number" min={5}
                            value={bloc.durationMin || ''}
                            onChange={e => { const v = parseInt(e.target.value); if (v >= 1) updateBloc(bloc.id, { duree: String(v) }) }}
                            style={{ width: 44, border: 'none', background: 'rgba(0,0,0,.2)', color: '#fff', borderRadius: 5, padding: '2px 5px', fontSize: '.75rem', fontWeight: 900, textAlign: 'center', outline: 'none', fontFamily: 'inherit', flexShrink: 0 }}
                          />
                        )}
                        <span style={{ color: 'rgba(255,255,255,.65)', fontSize: '.62rem', fontWeight: 700, flexShrink: 0 }}>min</span>
                        <button onClick={() => setActiveNiveauBlocId(bloc.id)} title="Voir dans Niveaux & intensité"
                          style={{ background: activeNiveauBlocId === bloc.id ? '#fff' : 'rgba(255,255,255,.18)', border: 'none', color: activeNiveauBlocId === bloc.id ? color : '#fff', borderRadius: 4, width: 20, height: 18, fontSize: '.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1, fontWeight: 900 }}>▦</button>
                        <button onClick={() => deleteBloc(bloc.id)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 5, width: 20, height: 20, fontSize: '.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                      </div>

                      {/* Intervenant du bloc */}
                      <div style={{ padding: '5px 10px', background: '#f5f6f8', borderBottom: '1px solid #edf0f3', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '.57rem', fontWeight: 900, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 }}>Géré par</span>
                        {[
                          { key: 'prepa', label: 'Prépa physique', color: '#b45309' },
                          { key: 'coachs', label: 'Coachs', color: '#1d4ed8' },
                        ].map(opt => {
                          const cur = bloc.intervenant
                          const active = cur === opt.key || cur === 'both'
                          const toggle = () => {
                            const other = opt.key === 'prepa' ? 'coachs' : 'prepa'
                            let next
                            if (cur === opt.key)  next = null
                            else if (cur === other) next = 'both'
                            else if (cur === 'both') next = other
                            else next = opt.key
                            updateBloc(bloc.id, { intervenant: next })
                          }
                          return (
                            <button key={opt.key}
                              onClick={toggle}
                              style={{ background: active ? opt.color : 'white', color: active ? '#fff' : '#6b7280', border: `1.5px solid ${active ? opt.color : '#e5e7eb'}`, borderRadius: 6, padding: '2px 9px', fontSize: '.63rem', fontWeight: 800, cursor: 'pointer', outline: 'none', transition: 'all .1s' }}>
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>

                      {/* Planification intensité (entrainement uniquement) */}
                      {panel.form?.type === 'entrainement' && (
                        <div style={{ padding: '8px 10px', background: '#fafbfc', borderBottom: '1px solid #f0f2f5', display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {/* Contact 0-4 */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: '.57rem', fontWeight: 900, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '.06em', width: 54, flexShrink: 0, paddingTop: 3 }}>Contact</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {CONTACT_LEVELS.map((cl, i) => {
                                  const active = bloc.contact_intensite === i
                                  return (
                                    <button key={i} title={cl.desc} onClick={() => updateBloc(bloc.id, { contact_intensite: active ? null : i })}
                                      style={{ width: 24, height: 24, borderRadius: 6, border: active ? '2px solid #1a1a1a' : '1.5px solid #d1d5db', background: active ? '#1a1a1a' : 'white', color: active ? '#e4f816' : '#374151', fontSize: '.72rem', fontWeight: 900, cursor: 'pointer', outline: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .1s' }}>
                                      {i}
                                    </button>
                                  )
                                })}
                              </div>
                              {bloc.contact_intensite != null && (
                                <span style={{ fontSize: '.6rem', color: '#6b7280', fontWeight: 600 }}>
                                  {CONTACT_LEVELS[bloc.contact_intensite]?.label} — <span style={{ fontWeight: 400, fontStyle: 'italic' }}>{CONTACT_LEVELS[bloc.contact_intensite]?.desc}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Volume course */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '.57rem', fontWeight: 900, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '.06em', width: 54, flexShrink: 0 }}>Volume</span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {COURSE_VOLUMES.map(v => (
                                <button key={v} onClick={() => updateBloc(bloc.id, { course_volume: bloc.course_volume === v ? null : v })}
                                  style={{ ...Sm.chip, padding: '3px 8px', fontSize: '.62rem', ...(bloc.course_volume === v ? { background: '#1a1a1a', color: '#e4f816', borderColor: '#1a1a1a' } : {}) }}>
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Intensité course */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '.57rem', fontWeight: 900, color: '#9aa1ac', textTransform: 'uppercase', letterSpacing: '.06em', width: 54, flexShrink: 0 }}>Intensité</span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {COURSE_INTENSITES.map(v => (
                                <button key={v} onClick={() => updateBloc(bloc.id, { course_intensite: bloc.course_intensite === v ? null : v })}
                                  style={{ ...Sm.chip, padding: '3px 8px', fontSize: '.62rem', ...(bloc.course_intensite === v ? { background: '#1a1a1a', color: '#e4f816', borderColor: '#1a1a1a' } : {}) }}>
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bloc séquences */}
                      {bloc.bloc_type === 'sequences' && (
                        <div style={{ padding:'8px 12px 12px' }}>
                          {/* Stats rapides */}
                          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                            {[
                              ['Jeu effectif', calcJeuEffectif(bloc.sequences), '#2f6f76'],
                              ['Total', calcDureeBloc(bloc.sequences), '#6b7280'],
                              bloc.conditions_jeu ? ['Conditions', bloc.conditions_jeu, '#92400e'] : null,
                            ].filter(Boolean).map(([lbl,val,color2]) => (
                              <span key={lbl} style={{ fontSize:'0.68rem', fontWeight:800, color:color2, background: color2+'15', padding:'2px 7px', borderRadius:6 }}>
                                {lbl} : {val}
                              </span>
                            ))}
                          </div>

                          {/* Vue d'ensemble schémas/volumes — aperçu sans ouvrir le panneau */}
                          {(schemaOverview[bloc.id] || []).length > 0 && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                              {schemaOverview[bloc.id].map((o, i) => (
                                <div key={o.niveauId ?? `tous-${i}`} style={{ display:'flex', alignItems:'center', gap:5, background:'#f5f6f8', border:`1px solid ${o.niveauCouleur}55`, borderRadius:7, padding:'3px 7px 3px 5px' }}>
                                  {o.schemaDonnees && (
                                    <div style={{ width:20, height:20, borderRadius:4, overflow:'hidden', border:'1px solid #e0e3e8', flexShrink:0, background:'#fff' }}>
                                      <ApercuSchema donnees={o.schemaDonnees} />
                                    </div>
                                  )}
                                  <span style={{ width:7, height:7, borderRadius:'50%', background:o.niveauCouleur, flexShrink:0 }} />
                                  <span style={{ fontSize:'.63rem', fontWeight:800, color:'#374151' }}>{o.niveauNom}</span>
                                  {o.volumeM != null && (
                                    <span style={{ fontSize:'.6rem', fontWeight:700, color:'#6b7280' }}>· {o.volumeM} m</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Séries — une ligne par série, séparateur récup entre */}
                          {(() => {
                            function splitSeries(seqs) {
                              const out = []; let cur = []
                              seqs.forEach(s => {
                                if (s.type === 'inter_bloc') { out.push({ seqs: cur, interAfter: s }); cur = [] }
                                else cur.push(s)
                              })
                              out.push({ seqs: cur, interAfter: null })
                              return out
                            }
                            const series = splitSeries(bloc.sequences || [])
                            const chipStyle = (isJeu, isSelected) => ({
                              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                              borderRadius:7, padding:'5px 4px', flexShrink:0, minHeight:46,
                              width: isJeu ? 80 : 52, cursor:'grab',
                              background: isSelected ? (isJeu?'#93c5fd':'#86efac') : (isJeu?'#bfdbfe':'#bbf7d0'),
                              border: `${isSelected?2:1.5}px solid ${isJeu?'#60a5fa':'#4ade80'}`,
                              outline: isSelected ? `2px solid ${isJeu?'#60a5fa':'#4ade80'}` : 'none',
                              outlineOffset:1, transition:'background 0.1s', userSelect:'none',
                            })
                            return (
                              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                                {series.map(({ seqs, interAfter }, sIdx) => (
                                  <div key={sIdx}>
                                    {/* Ligne de chips pour cette série */}
                                    <div style={{ display:'flex', alignItems:'center', gap:2, overflowX:'auto', paddingBottom:2, flexWrap:'nowrap', minHeight:52 }}>
                                      {seqs.map((seq, si) => {
                                        const isJeu = seq.type === 'jeu'
                                        const isSelected = selectedSeqId === seq.id
                                        return (
                                          <React.Fragment key={seq.id}>
                                            <div role="button" tabIndex={0}
                                              draggable
                                              onDragStart={e => { dragSeqId.current = seq.id; e.dataTransfer.effectAllowed='move' }}
                                              onDragOver={e => e.preventDefault()}
                                              onDrop={e => { e.preventDefault(); reorderSequences(bloc.id, dragSeqId.current, seq.id) }}
                                              onClick={() => setSelectedSeqId(isSelected ? null : seq.id)}
                                              style={chipStyle(isJeu, isSelected)}>
                                              <span style={{ fontSize:'0.58rem', color:'#c4ccd4', marginBottom:1 }}>⠿</span>
                                              <span style={{ fontSize:'0.65rem', fontWeight:900, color: isJeu?'#1e3a5f':'#14532d' }}>
                                                {formatSeqDur(seq.duree_sec)}
                                              </span>
                                              {seq.theme && <span style={{ fontSize:'0.52rem', fontWeight:800, color: isJeu?'#1d4ed8':'#15803d', textAlign:'center', textTransform:'uppercase', marginTop:1, lineHeight:1.1, maxWidth:72, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                                {seq.theme}
                                              </span>}
                                            </div>
                                            {si < seqs.length-1 && <span style={{ color: '#9ca3af', fontSize:'0.7rem', padding:'0 1px', flexShrink:0 }}>›</span>}
                                          </React.Fragment>
                                        )
                                      })}
                                      {/* Boutons + pour cette série */}
                                      {seqs.length > 0 && <span style={{ color: '#9ca3af', fontSize:'0.7rem', padding:'0 3px' }}>›</span>}
                                      <button
                                        onClick={() => interAfter ? addSeqBeforeInterBloc?.(bloc.id,'jeu',interAfter.id) : addSequence(bloc.id,'jeu')}
                                        style={{ padding:'3px 7px', minHeight:46, borderRadius:7, border:'1.5px dashed #93c5fd', background:'transparent', color:'#60a5fa', fontSize:'0.6rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                                        + Séq.
                                      </button>
                                      <button
                                        onClick={() => interAfter ? addSeqBeforeInterBloc?.(bloc.id,'recup',interAfter.id) : addSequence(bloc.id,'recup')}
                                        style={{ padding:'3px 7px', minHeight:46, borderRadius:7, border:'1.5px dashed #86efac', background:'transparent', color:'#22c55e', fontSize:'0.6rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                                        + Récup
                                      </button>
                                    </div>
                                    {/* Séparateur inter_bloc (cliquable pour éditer) */}
                                    {interAfter && (
                                      <div role="button" tabIndex={0}
                                        onClick={() => setSelectedSeqId(selectedSeqId === interAfter.id ? null : interAfter.id)}
                                        style={{ display:'flex', alignItems:'center', gap:8, background: selectedSeqId===interAfter.id?'#fcd34d':'#fef3c7', border:`1.5px solid ${selectedSeqId===interAfter.id?'#f59e0b':'#fde68a'}`, borderRadius:7, padding:'5px 12px', cursor:'pointer', marginTop:2, userSelect:'none' }}>
                                        <span style={{ fontSize:'0.68rem', fontWeight:900, color:'#78350f' }}>÷ Récup inter-série</span>
                                        <span style={{ fontSize:'0.75rem', fontWeight:900, color:'#92400e' }}>{formatSeqDur(interAfter.duree_sec)}</span>
                                        <span style={{ fontSize:'0.58rem', color:'#d97706', marginLeft:'auto' }}>cliquer pour modifier</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {/* Bouton nouvelle série */}
                                <button onClick={() => addNouvelleSerie(bloc.id)}
                                  style={{ alignSelf:'flex-start', padding:'4px 10px', height:32, borderRadius:7, border:'1.5px dashed #f59e0b', background:'transparent', color:'#d97706', fontSize:'0.62rem', fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', marginTop:2 }}>
                                  ÷ Nouvelle série
                                </button>
                              </div>
                            )
                          })()}

                          {/* Éditeur inline de la séquence sélectionnée */}
                          {selectedSeqId && (bloc.sequences||[]).find(s => s.id === selectedSeqId) && (() => {
                            const seq = (bloc.sequences||[]).find(s => s.id === selectedSeqId)
                            const isJeu = seq.type === 'jeu'
                            const isInterBloc = seq.type === 'inter_bloc'
                            const editorBg = isInterBloc ? '#fffbeb' : isJeu ? '#eff6ff' : '#f0fdf4'
                            const editorBorder = isInterBloc ? '#fcd34d' : isJeu ? '#bfdbfe' : '#bbf7d0'
                            const seqInpStyle = { border:'1.5px solid #e5e7eb', borderRadius:7, padding:'5px 8px', fontSize:'0.75rem', fontFamily:'inherit', color:'#1f2937', outline:'none', background:'#fff' }
                            return (
                              <div key={seq.id} style={{ marginTop:8, background: editorBg, borderRadius:9, padding:'10px 12px', border:`1.5px solid ${editorBorder}`, display:'flex', flexWrap:'wrap', gap:8, alignItems:'flex-end' }}>
                                {/* Type — masqué pour inter_bloc */}
                                {!isInterBloc && (
                                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                  <span style={{ fontSize:'0.6rem', fontWeight:700, color: '#6b7280', textTransform:'uppercase', letterSpacing:'0.05em' }}>Type</span>
                                  <div style={{ display:'flex', gap:4 }}>
                                    {[['jeu','Séquence'],['recup','Récup.']].map(([v,l]) => (
                                      <button key={v} onClick={() => updateSequence(seq.id, { type:v })}
                                        style={{ padding:'4px 8px', borderRadius:6, border:`1.5px solid ${seq.type===v?(v==='jeu'?'#3b82f6':'#22c55e'):'#e5e7eb'}`, fontSize:'0.65rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                                          background: seq.type===v ? (v==='jeu'?'#dbeafe':'#dcfce7') : '#fff',
                                          color: seq.type===v ? (v==='jeu'?'#1d4ed8':'#15803d') : '#6b7280' }}>
                                        {l}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                )}
                                {isInterBloc && (
                                  <span style={{ fontSize:'0.72rem', fontWeight:800, color:'#92400e', alignSelf:'center' }}>÷ Récup inter-série</span>
                                )}
                                {/* Thème — masqué pour inter_bloc */}
                                {!isInterBloc && (
                                <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1, minWidth:100 }}>
                                  <span style={{ fontSize:'0.6rem', fontWeight:700, color: '#6b7280', textTransform:'uppercase', letterSpacing:'0.05em' }}>Thème</span>
                                  <input
                                    style={seqInpStyle}
                                    defaultValue={seq.theme || ''}
                                    placeholder={isJeu ? 'FIGHT, CONDITIONNÉ…' : 'Récupération'}
                                    onBlur={e => updateSequence(seq.id, { theme: e.target.value })}
                                  />
                                </div>
                                )}
                                {/* Durée */}
                                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                                  <span style={{ fontSize:'0.6rem', fontWeight:700, color: '#6b7280', textTransform:'uppercase', letterSpacing:'0.05em' }}>Durée — {formatSeqDur(seq.duree_sec)}</span>
                                  {/* Presets rapides */}
                                  <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                                    {[30,45,60,75,90,105,120,150,180,240,300].map(sec => (
                                      <button key={sec} onClick={() => updateSequence(seq.id, { duree_sec: sec })}
                                        style={{ padding:'3px 6px', borderRadius:6, fontSize:'0.62rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                                          border: seq.duree_sec===sec ? '2px solid #6366f1' : '1.5px solid #e5e7eb',
                                          background: seq.duree_sec===sec ? '#eef2ff' : '#fff',
                                          color: seq.duree_sec===sec ? '#4338ca' : '#6b7280' }}>
                                        {formatSeqDur(sec)}
                                      </button>
                                    ))}
                                  </div>
                                  {/* Saisie libre en secondes */}
                                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                    <input
                                      key={seq.duree_sec}
                                      style={{ ...seqInpStyle, width:64, textAlign:'center' }}
                                      type="number" min={5} placeholder="sec" aria-label="sec"
                                      defaultValue={seq.duree_sec || ''}
                                      onBlur={e => { const v = parseInt(e.target.value); if (v >= 5) updateSequence(seq.id, { duree_sec: v }) }}
                                    />
                                    <span style={{ fontSize:'0.65rem', color: '#6b7280' }}>secondes</span>
                                  </div>
                                </div>
                                {/* Supprimer */}
                                <button onClick={() => deleteSequence(bloc.id, seq.id)}
                                  style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontSize:'0.68rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-end' }}>
                                  Supprimer
                                </button>
                                <button onClick={() => setSelectedSeqId(null)}
                                  style={{ padding:'5px 8px', borderRadius:7, border:'1.5px solid #e5e7eb', background:'#fff', color:'#6b7280', fontSize:'0.68rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-end' }}>
                                  Fermer
                                </button>
                              </div>
                            )
                          })()}

                          {/* Footer infos bloc */}
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8, fontSize:'0.7rem', alignItems:'center' }}>
                            <span style={{ color: '#6b7280' }}>Conditions :</span>
                            <input
                              defaultValue={bloc.conditions_jeu || ''}
                              onBlur={e => updateBloc(bloc.id, { conditions_jeu: e.target.value })}
                              placeholder="Plaqué / Touché…"
                              style={{ border:'1px solid #e5e7eb', borderRadius:6, padding:'2px 7px', fontSize:'0.7rem', fontFamily:'inherit', color:'#1f2937', outline:'none', width:140 }}
                            />
                            <span style={{ color: '#6b7280', marginLeft:6 }}>Effectif :</span>
                            <input
                              defaultValue={bloc.effectif_desc || ''}
                              onBlur={e => updateBloc(bloc.id, { effectif_desc: e.target.value })}
                              placeholder="8c8, 7c7…"
                              style={{ border:'1px solid #e5e7eb', borderRadius:6, padding:'2px 7px', fontSize:'0.7rem', fontFamily:'inherit', color:'#1f2937', outline:'none', width:120 }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Aperçu schémas/volumes du bloc — même mécanisme que les blocs séquences */}
                      {bloc.bloc_type !== 'sequences' && (schemaOverview[bloc.id] || []).length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 10px 0' }}>
                          {schemaOverview[bloc.id].map((o, i) => (
                            <div key={o.niveauId ?? `tous-${i}`} style={{ display:'flex', alignItems:'center', gap:5, background:'#f5f6f8', border:`1px solid ${o.niveauCouleur}55`, borderRadius:7, padding:'3px 7px 3px 5px' }}>
                              {o.schemaDonnees && (
                                <div style={{ width:20, height:20, borderRadius:4, overflow:'hidden', border:'1px solid #e0e3e8', flexShrink:0, background:'#fff' }}>
                                  <ApercuSchema donnees={o.schemaDonnees} />
                                </div>
                              )}
                              <span style={{ width:7, height:7, borderRadius:'50%', background:o.niveauCouleur, flexShrink:0 }} />
                              <span style={{ fontSize:'.63rem', fontWeight:800, color:'#374151' }}>{o.niveauNom}</span>
                              {o.volumeM != null && (
                                <span style={{ fontSize:'.6rem', fontWeight:700, color:'#6b7280' }}>· {o.volumeM} m</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Exercices */}
                      {bloc.bloc_type !== 'sequences' && <div style={{ background: color + '0a', padding: '6px 8px 7px' }}>
                        {hasGroups ? (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                            {gKeys.map(gk => (
                              <div key={gk} style={{ flex: 1, borderRadius: 7, overflow: 'hidden', border: `1px solid ${color}25` }}>
                                {gk && <div style={{ fontSize: '.55rem', fontWeight: 900, textTransform: 'uppercase', color: '#fff', background: color + 'cc', padding: '2px 7px', textAlign: 'center' }}>{gk}</div>}
                                <div style={{ padding: '3px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {groups[gk].map(exo => (
                                    <div key={exo.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 5, padding: '3px 6px', border: `1px solid ${color}18` }}>
                                      <input key={`nom-${exo.id}`} defaultValue={exo.nom} onBlur={e => updateExo(bloc.id, exo.id, { nom: e.target.value })} placeholder="Exercice…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '.68rem', fontWeight: 700, color: '#1a1a1a', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                                      <input key={`pres-${exo.id}`} defaultValue={exo.prescription || ''} onBlur={e => updateExo(bloc.id, exo.id, { prescription: e.target.value })} placeholder="Charge…" style={{ width: 58, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.63rem', color: '#1a1a1a', padding: '1px 4px', outline: 'none', fontFamily: 'inherit' }} />
                                      <input key={`grp-${exo.id}`} defaultValue={exo.groupe_label || ''} onBlur={e => updateExo(bloc.id, exo.id, { groupe_label: e.target.value })} placeholder="Grp…" title="Groupe (ex: Avants, Arrières…)" style={{ width: 44, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.6rem', color: '#6b7280', padding: '1px 3px', outline: 'none', fontFamily: 'inherit' }} />
                                      <button onClick={() => deleteExo(bloc.id, exo.id)} style={{ background: 'none', border: 'none', color: '#c4c8d0', fontSize: '.85rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 5 }}>
                            {(bloc.exos || []).map(exo => (
                              <div key={exo.id} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', borderRadius: 6, padding: '4px 8px', border: `1px solid ${color}20` }}>
                                <input key={`nom-${exo.id}`} defaultValue={exo.nom} onBlur={e => updateExo(bloc.id, exo.id, { nom: e.target.value })} placeholder="Exercice…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '.7rem', fontWeight: 600, color: '#1a1a1a', outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                                <input key={`pres-${exo.id}`} defaultValue={exo.prescription || ''} onBlur={e => updateExo(bloc.id, exo.id, { prescription: e.target.value })} placeholder="Charge…" style={{ width: 66, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.65rem', color: '#1a1a1a', padding: '2px 5px', outline: 'none', fontFamily: 'inherit' }} />
                                <input key={`grp-${exo.id}`} defaultValue={exo.groupe_label || ''} onBlur={e => updateExo(bloc.id, exo.id, { groupe_label: e.target.value })} placeholder="Groupe…" title="Groupe (ex: Avants, Arrières…)" style={{ width: 58, border: '1px solid #e4e7ec', borderRadius: 4, fontSize: '.62rem', color: '#6b7280', padding: '2px 5px', outline: 'none', fontFamily: 'inherit' }} />
                                <button onClick={() => deleteExo(bloc.id, exo.id)} style={{ background: 'none', border: 'none', color: '#c4c8d0', fontSize: '.85rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={() => addExo(bloc.id)} style={{ width: '100%', background: 'none', border: `1.5px dashed ${color}50`, borderRadius: 6, color: color, fontSize: '.65rem', fontWeight: 700, padding: '4px', cursor: 'pointer', textAlign: 'center' }}>+ Exercice</button>
                      </div>}
                    </div>
                    {!isLast && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#f5f6f8' }}>
                        <div style={{ flex: 1, height: 1, background: '#e0e3e8' }} />
                        {editingRecup ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input autoFocus type="number" min={1} max={60} value={recupDraft} onChange={e => setRecupDraft(e.target.value)} style={{ width: 38, border: '1.5px solid #1a1a1a', borderRadius: 5, padding: '2px 5px', fontSize: '.68rem', fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} placeholder="min" />
                            <span style={{ fontSize: '.62rem', color: '#6b7280', fontWeight: 600 }}>min récup</span>
                            <button onClick={async () => { const v = parseInt(recupDraft); if (v > 0) { await updateBloc(bloc.id, { recup_apres: v }) } setRecupEditBloc(null); setRecupDraft('') }} style={{ background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 5, padding: '2px 8px', fontSize: '.65rem', fontWeight: 800, cursor: 'pointer' }}>OK</button>
                            <button onClick={() => { setRecupEditBloc(null); setRecupDraft('') }} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 5, padding: '2px 8px', fontSize: '.65rem', fontWeight: 700, cursor: 'pointer', color: '#6b7280' }}>Annuler</button>
                          </div>
                        ) : bloc.recup_apres ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: '.62rem', color: '#374151', fontWeight: 700, background: '#e5e7eb', borderRadius: 5, padding: '2px 8px' }}>{bloc.recup_apres} min</span>
                            <button onClick={() => { setRecupEditBloc(bloc.id); setRecupDraft(String(bloc.recup_apres)) }} style={{ background: 'none', border: 'none', fontSize: '.6rem', color: '#6b7280', cursor: 'pointer', padding: 0 }}>Modifier</button>
                            <button onClick={async () => { await updateBloc(bloc.id, { recup_apres: null }) }} style={{ background: 'none', border: 'none', fontSize: '.65rem', color: '#ef4444', cursor: 'pointer', padding: 0 }}>✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setRecupEditBloc(bloc.id); setRecupDraft('') }} style={{ background: 'none', border: '1.5px dashed #d1d5db', borderRadius: 6, padding: '2px 10px', fontSize: '.62rem', fontWeight: 700, color: '#9aa1ac', cursor: 'pointer' }}>+ Récup</button>
                        )}
                        <div style={{ flex: 1, height: 1, background: '#e0e3e8' }} />
                      </div>
                    )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Colonne Niveaux & intensité ── */}
          {hasBlocs && (
            <div style={{ background: '#fff', borderLeft: '1px solid #e0e3e8', overflowY: 'auto', padding: '16px 14px' }}>
              <div style={Sm.sTitle}>Niveaux & intensité</div>

              {!activeNiveauBloc ? (
                <p style={{ fontSize: '.72rem', color: '#9aa1ac', fontStyle: 'italic' }}>
                  Ajoute un bloc pour lui rattacher des schémas et un calcul d'intensité par groupe de niveau.
                </p>
              ) : (
                <>
                  <div style={{ fontSize: '.68rem', color: '#9aa1ac', fontWeight: 700, marginBottom: 12 }}>
                    Bloc sélectionné : <b style={{ color: '#1a1a1a' }}>{activeNiveauBloc.nom}</b>
                  </div>

                  {seqBlocsList.length > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                      {seqBlocsList.map(b => (
                        <button key={b.id} onClick={() => setActiveNiveauBlocId(b.id)}
                          style={{ ...Sm.chip, padding: '3px 9px', fontSize: '.64rem', ...(b.id === activeNiveauBlocId ? { background: '#1a1a1a', color: '#e4f816', borderColor: '#1a1a1a' } : {}) }}>
                          {b.nom}
                        </button>
                      ))}
                    </div>
                  )}

                  {niveauxRail.loading ? (
                    <p style={{ fontSize: '.72rem', color: '#9aa1ac' }}>Chargement…</p>
                  ) : (
                    [{ id: null, nom: 'Tous les niveaux', couleur: '#9ca3af' }, ...niveauxRail.niveaux].map(niveau => {
                      const a = niveauAttachmentFor(niveau.id)
                      const schema = a?.schema_id ? niveauxRail.schemas.find(s => s.id === a.schema_id) : null
                      return (
                        <div key={niveau.id ?? 'tous'} style={{ border: '1.5px solid #e5e7eb', borderRadius: 11, padding: 11, marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: niveau.couleur, flexShrink: 0 }} />
                            <span style={{ fontWeight: 800, fontSize: '.8rem', color: '#1f2937' }}>{niveau.nom}</span>
                            {niveau.valeur_ref != null && <span style={{ fontSize: '.66rem', color: '#9aa1ac', marginLeft: 'auto' }}>{niveau.valeur_ref} km/h</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                            {schema && (
                              <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                                <ApercuSchema donnees={schema.donnees} />
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <select value={a?.schema_id || ''} onChange={e => setNiveauSchema(niveau.id, e.target.value)}
                                style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 7, padding: '5px 7px', fontSize: '.72rem', outline: 'none', fontFamily: 'inherit', background: '#fff' }}>
                                <option value="">Aucun schéma</option>
                                {niveauxRail.schemas.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                              </select>
                              {niveau.id != null && (
                                a?.resultat ? (
                                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: '.66rem', color: '#374151', background: '#f9fafb', borderRadius: 7, padding: '6px 8px', fontWeight: 700, flexWrap: 'wrap' }}>
                                    <span>{a.resultat.distance} m · {a.resultat.temps} s · {a.resultat.repsTotal} rép. · {a.resultat.volumeM} m total</span>
                                    <button onClick={() => setCalcNiveau(niveau)} style={{ background: 'none', border: 'none', color: '#4338ca', fontSize: '.66rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Modifier</button>
                                  </div>
                                ) : niveau.valeur_ref != null ? (
                                  <button onClick={() => setCalcNiveau(niveau)} style={{ marginTop: 6, padding: '5px 9px', borderRadius: 7, border: '1.5px dashed #d1d5db', background: 'none', color: '#374151', fontSize: '.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Calculer l'intensité</button>
                                ) : (
                                  <p style={{ fontSize: '.66rem', color: '#9aa1ac', margin: '6px 0 0' }}>Pas de VMI/VMA de référence</p>
                                )
                              )}
                            </div>
                            {a && <button onClick={() => retirerNiveauAttachment(niveau.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '.66rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>Retirer</button>}
                          </div>
                        </div>
                      )
                    })
                  )}
                </>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ background: '#fff', borderTop: '1px solid #e0e3e8', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {panel.mode === 'edit' && <button onClick={deleteEvent} disabled={saving} style={{ background: 'none', border: '1.5px solid #fecaca', color: '#ef4444', borderRadius: 8, padding: '7px 16px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>}
          <button onClick={closePanel} style={{ marginLeft: 'auto', background: '#f3f4f6', border: 'none', color: '#6b7280', borderRadius: 8, padding: '7px 18px', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>Fermer</button>
          <button onClick={saveEvent} disabled={saving} style={{ background: '#1a1a1a', border: 'none', color: '#e4f816', borderRadius: 8, padding: '8px 26px', fontSize: '.78rem', fontWeight: 800, cursor: 'pointer' }}>
            {saving ? '…' : panel.mode === 'create' ? 'Créer' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {calcNiveau && (
        <CalculateurIntensite
          niveaux={[calcNiveau]}
          groupColor={groupColor}
          onClose={() => setCalcNiveau(null)}
          onApply={(niveau, payload) => appliquerCalculNiveau(niveau, payload)}
        />
      )}
    </>
  )
}
