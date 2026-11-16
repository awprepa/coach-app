import { supabase } from '../supabase'

// Range les joueurs d'une équipe dans ses sous-groupes « Avants » et « 3/4 »
// selon le poste principal rempli dans l'app : 1 à 8 → Avants, 9 à 15 → 3/4.
// Les joueurs sans poste ne bougent pas. Renvoie les changements faits.
export async function rangerParPoste(equipeId, sousGroupes) {
  const av = (sousGroupes || []).find(g => /avant/i.test(g.nom))
  const tq = (sousGroupes || []).find(g => /3\s*\/\s*4|trois|quart/i.test(g.nom))
  if (!av || !tq) return []

  const { data: gm } = await supabase.from('groupe_membres').select('groupe_id, client_id')
    .in('groupe_id', [equipeId, av.id, tq.id])
  const membresEquipe = [...new Set((gm || []).filter(r => r.groupe_id === equipeId).map(r => r.client_id))]
  if (!membresEquipe.length) return []
  const dans = (gid, cid) => (gm || []).some(r => r.groupe_id === gid && r.client_id === cid)

  // Poste principal : fiches effectif du joueur (toutes équipes), poste marqué principal d'abord
  const { data: fiches } = await supabase.from('groupe_joueurs')
    .select('client_id, created_at, joueur_postes(poste, is_primary, rang)')
    .in('client_id', membresEquipe)
  const posteDe = {}
  const lignes = []
  ;(fiches || []).forEach(f => (f.joueur_postes || []).forEach(p => lignes.push({ ...p, client_id: f.client_id, created_at: f.created_at })))
  lignes.sort((a, b) => (b.is_primary === true) - (a.is_primary === true) || (a.rang ?? 999) - (b.rang ?? 999) || (b.created_at || '').localeCompare(a.created_at || ''))
  lignes.forEach(l => { if (posteDe[l.client_id] == null) posteDe[l.client_id] = l.poste })

  const changes = []
  for (const cid of membresEquipe) {
    const poste = posteDe[cid]
    const cible = poste >= 1 && poste <= 8 ? av : poste >= 9 && poste <= 15 ? tq : null
    if (!cible) continue
    const autre = cible === av ? tq : av
    if (dans(cible.id, cid) && !dans(autre.id, cid)) continue
    if (!dans(cible.id, cid)) {
      const { error } = await supabase.from('groupe_membres').insert({ groupe_id: cible.id, client_id: cid })
      if (error) { console.warn('[rangerParPoste]', error.message); continue }
    }
    if (dans(autre.id, cid)) {
      const { error } = await supabase.from('groupe_membres').delete().eq('groupe_id', autre.id).eq('client_id', cid)
      if (error) { console.warn('[rangerParPoste]', error.message); continue }
    }
    changes.push({ client_id: cid, sousGroupe: cible.nom })
  }
  return changes
}
