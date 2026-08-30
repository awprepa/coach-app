import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'

// Sépare les clients en deux ensembles pour tous les sélecteurs de client
// côté coach : les clients "individuels" (dans aucun groupe) affichés en
// liste normale, et les groupes (avec leurs membres, sous-groupes remontés
// dans le groupe racine) affichés à part — pour éviter qu'une grosse équipe
// ne noie la liste des clients individuels.
export default function useClientsEtGroupes(clientFields = 'id, prenom, nom') {
  const [individuels, setIndividuels] = useState([])
  const [groupes, setGroupes] = useState([]) // [{ id, nom, couleur, membres: [client,...] }]
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: clients }, { data: gs }, { data: membres }] = await Promise.all([
      supabase.from('clients').select(clientFields).order('prenom'),
      supabase.from('groupes').select('id, nom, couleur, parent_id').order('nom'),
      supabase.from('groupe_membres').select('client_id, groupe_id'),
    ])
    const allClients = clients || []
    const allGroupes = gs || []
    const clientById = {}
    allClients.forEach(c => { clientById[c.id] = c })

    // groupe_id → [client_id]
    const membresParGroupe = {}
    ;(membres || []).forEach(m => { (membresParGroupe[m.groupe_id] ||= []).push(m.client_id) })

    // Remonte un groupe (sous-groupe compris) vers son groupe racine, pour
    // regrouper les membres d'un sous-groupe sous le club/groupe parent.
    const racineDe = (groupeId) => {
      const g = allGroupes.find(x => x.id === groupeId)
      return g?.parent_id || groupeId
    }

    const membresIdsParRacine = {}
    Object.entries(membresParGroupe).forEach(([gid, ids]) => {
      const racine = racineDe(gid)
      const set = (membresIdsParRacine[racine] ||= new Set())
      ids.forEach(id => set.add(id))
    })

    const groupesRacine = allGroupes.filter(g => !g.parent_id)
    const groupesResult = groupesRacine
      .map(g => ({
        id: g.id,
        nom: g.nom,
        couleur: g.couleur,
        membres: [...(membresIdsParRacine[g.id] || [])]
          .map(id => clientById[id])
          .filter(Boolean)
          .sort((a, b) => (a.prenom || '').localeCompare(b.prenom || '')),
      }))
      .filter(g => g.membres.length > 0)

    const memberIdsAll = new Set((membres || []).map(m => m.client_id))
    setIndividuels(allClients.filter(c => !memberIdsAll.has(c.id)))
    setGroupes(groupesResult)
    setLoading(false)
  }, [clientFields])

  useEffect(() => { load() }, [load])

  return { individuels, groupes, loading, reload: load }
}
