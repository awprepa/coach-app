import { supabase } from '../../supabase'

// ── Accès aux déroulés (blocs / exercices / séquences) d'évènements de groupe ──

function assemblerBlocs(rows) {
  return (rows || []).map(b => ({
    ...b,
    exos: (b.groupe_seance_exercices || []).sort((a, z) => a.ordre - z.ordre),
    sequences: (b.groupe_seance_sequences || []).sort((a, z) => a.ordre - z.ordre),
  }))
}

// Une seule requête pour plusieurs évènements → { [evenement_id]: blocs[] }
export async function loadBlocsPour(evtIds) {
  const ids = [...new Set(evtIds)]
  const map = {}
  ids.forEach(id => { map[id] = [] })
  if (!ids.length) return map
  const { data, error } = await supabase.from('groupe_seance_blocs')
    .select('*, groupe_seance_exercices(*), groupe_seance_sequences(*)')
    .in('evenement_id', ids).order('ordre')
  if (error) { console.error('[loadBlocsPour]', error.message); return map }
  assemblerBlocs(data).forEach(b => { (map[b.evenement_id] ||= []).push(b) })
  return map
}

export async function loadBlocs(evtId) {
  const map = await loadBlocsPour([evtId])
  return map[evtId] || []
}

// Copie complète d'un déroulé vers un autre évènement : tous les champs des
// blocs (opposition : effectif, conditions, récup…), leurs exercices (avec
// libellé de groupe) et leurs séquences de jeu. Insertions groupées.
export async function dupliquerBlocs(newEvtId, blocs) {
  if (!blocs?.length) return
  const lignes = blocs.map(b => ({
    evenement_id: newEvtId, nom: b.nom, duree: b.duree || '', ordre: b.ordre,
    bloc_type: b.bloc_type || 'standard', conditions_jeu: b.conditions_jeu || null,
    recup_inter_seq: b.recup_inter_seq || null, effectif_desc: b.effectif_desc || null,
    contact_intensite: b.contact_intensite ?? null, course_volume: b.course_volume || null,
    course_intensite: b.course_intensite || null, recup_apres: b.recup_apres ?? null,
    intervenant: b.intervenant || null,
  }))
  const { data: nouveaux, error } = await supabase.from('groupe_seance_blocs').insert(lignes).select('id, ordre')
  if (error || !nouveaux) { console.error('[dupliquerBlocs]', error?.message); return }
  // on retrouve le bloc d'origine par son rang d'insertion (ordre peut se répéter)
  const exos = [], seqs = []
  blocs.forEach((b, i) => {
    const nid = nouveaux[i]?.id
    if (!nid) return
    ;(b.exos || []).forEach(x => exos.push({ bloc_id: nid, nom: x.nom, prescription: x.prescription || '', detail: x.detail || '', ordre: x.ordre, groupe_label: x.groupe_label || null }))
    ;(b.sequences || []).forEach(s => seqs.push({ bloc_id: nid, type: s.type, theme: s.theme || null, duree_sec: s.duree_sec ?? null, ordre: s.ordre }))
  })
  if (exos.length) await supabase.from('groupe_seance_exercices').insert(exos)
  if (seqs.length) await supabase.from('groupe_seance_sequences').insert(seqs)
}

// Copie des documents joints (images) : les fichiers sont dupliqués dans le
// stockage pour que la suppression de l'original ne casse pas la copie.
export async function dupliquerDocuments(fromEvtId, toEvtId) {
  const { data: docs } = await supabase.from('groupe_evenement_documents').select('*').eq('evenement_id', fromEvtId).order('ordre')
  for (const d of docs || []) {
    const chemin = `${toEvtId}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('groupe-documents').copy(d.storage_path, chemin)
    if (error) { console.error('[dupliquerDocuments]', error.message); continue }
    const { data: { publicUrl } } = supabase.storage.from('groupe-documents').getPublicUrl(chemin)
    await supabase.from('groupe_evenement_documents').insert({ evenement_id: toEvtId, image_url: publicUrl, storage_path: chemin, ordre: d.ordre })
  }
}
