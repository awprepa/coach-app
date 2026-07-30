import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import SchemaSVG from './SchemaSVG'
import CalculateurIntensite from './CalculateurIntensite'

// Phase 6 — attache à un exercice de séance un schéma graphique et/ou un
// calcul d'intensité, par groupe de niveau. Une ligne "Tous les niveaux"
// (niveau_id=null) permet d'attacher juste un schéma commun sans chiffrage
// (le chiffrage dépend forcément de la VMA/VMI propre à chaque niveau).
export default function ExerciceSchemaPanel({ exerciceId, exerciceNom, groupeId, groupColor, onClose }) {
  const [niveaux, setNiveaux] = useState([])
  const [schemas, setSchemas] = useState([])
  const [attachments, setAttachments] = useState([]) // exercice_groupe_schemas rows
  const [loading, setLoading] = useState(true)
  const [calcNiveau, setCalcNiveau] = useState(null) // niveau en cours de calcul

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: n }, { data: s }, { data: a }] = await Promise.all([
      groupeId ? supabase.from('groupes_niveau').select('*').eq('groupe_id', groupeId).order('ordre') : Promise.resolve({ data: [] }),
      supabase.from('schemas_entrainement').select('id, nom, donnees').order('nom'),
      supabase.from('exercice_groupe_schemas').select('*').eq('exercice_id', exerciceId),
    ])
    setNiveaux(n || [])
    setSchemas(s || [])
    setAttachments(a || [])
    setLoading(false)
  }

  function attachmentFor(niveauId) {
    return attachments.find(a => a.niveau_id === niveauId) || null
  }

  async function setSchemaFor(niveauId, schemaId) {
    const existing = attachmentFor(niveauId)
    if (existing) {
      if (!schemaId && !existing.resultat) {
        await supabase.from('exercice_groupe_schemas').delete().eq('id', existing.id)
        setAttachments(prev => prev.filter(a => a.id !== existing.id))
      } else {
        await supabase.from('exercice_groupe_schemas').update({ schema_id: schemaId || null, updated_at: new Date().toISOString() }).eq('id', existing.id)
        setAttachments(prev => prev.map(a => a.id === existing.id ? { ...a, schema_id: schemaId || null } : a))
      }
    } else if (schemaId) {
      const { data, error } = await supabase.from('exercice_groupe_schemas')
        .insert({ exercice_id: exerciceId, niveau_id: niveauId, schema_id: schemaId }).select().single()
      if (!error) setAttachments(prev => [...prev, data])
    }
  }

  async function retirer(niveauId) {
    const existing = attachmentFor(niveauId)
    if (!existing) return
    await supabase.from('exercice_groupe_schemas').delete().eq('id', existing.id)
    setAttachments(prev => prev.filter(a => a.id !== existing.id))
  }

  async function appliquerCalcul(niveau, { parametres, resultat }) {
    const existing = attachmentFor(niveau.id)
    if (existing) {
      await supabase.from('exercice_groupe_schemas').update({ parametres_calcul: parametres, resultat, updated_at: new Date().toISOString() }).eq('id', existing.id)
      setAttachments(prev => prev.map(a => a.id === existing.id ? { ...a, parametres_calcul: parametres, resultat } : a))
    } else {
      const { data, error } = await supabase.from('exercice_groupe_schemas')
        .insert({ exercice_id: exerciceId, niveau_id: niveau.id, parametres_calcul: parametres, resultat }).select().single()
      if (!error) setAttachments(prev => [...prev, data])
    }
    setCalcNiveau(null)
  }

  const lignes = [{ id: null, nom: 'Tous les niveaux', couleur: '#9ca3af' }, ...niveaux]

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>
        <div style={S.header}>
          <div>
            <span style={{ fontWeight: 900, fontSize: '1rem', color: '#1f2937' }}>Schéma & intensité</span>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>{exerciceNom || 'Exercice'}</p>
          </div>
          <button onClick={onClose} style={S.closeBtn}>×</button>
        </div>

        {loading ? (
          <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Chargement…</p>
        ) : !groupeId ? (
          <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Groupe introuvable pour cette séance.</p>
        ) : (
          <div style={S.lignes}>
            {lignes.map(niveau => {
              const a = attachmentFor(niveau.id)
              const schema = a?.schema_id ? schemas.find(s => s.id === a.schema_id) : null
              return (
                <div key={niveau.id ?? 'tous'} style={S.ligne}>
                  <div style={S.ligneHeader}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: niveau.couleur, flexShrink: 0 }} />
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1f2937' }}>{niveau.nom}</span>
                    {niveau.valeur_ref != null && <span style={S.ligneSub}>{niveau.valeur_ref} km/h</span>}
                  </div>

                  <div style={S.ligneBody}>
                    {schema && (
                      <div style={S.thumb}><SchemaSVG donnees={schema.donnees} showDistances={false} /></div>
                    )}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <select value={a?.schema_id || ''} onChange={e => setSchemaFor(niveau.id, e.target.value)} style={S.select}>
                        <option value="">Aucun schéma</option>
                        {schemas.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                      </select>

                      {niveau.id != null && (
                        a?.resultat ? (
                          <div style={S.calcSummary}>
                            <span>{a.resultat.distance} m · {a.resultat.temps} s · {a.resultat.repsTotal} rép. · {a.resultat.volumeM} m total</span>
                            <button onClick={() => setCalcNiveau(niveau)} style={S.linkBtn}>Modifier</button>
                          </div>
                        ) : niveau.valeur_ref != null ? (
                          <button onClick={() => setCalcNiveau(niveau)} style={S.calcBtn}>Calculer l'intensité</button>
                        ) : (
                          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '6px 0 0' }}>Pas de VMI/VMA de référence</p>
                        )
                      )}
                    </div>

                    {a && <button onClick={() => retirer(niveau.id)} style={S.removeBtn}>Retirer</button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {calcNiveau && (
        <CalculateurIntensite
          niveaux={[calcNiveau]}
          groupColor={groupColor}
          onClose={() => setCalcNiveau(null)}
          onApply={(niveau, payload) => appliquerCalcul(niveau, payload)}
        />
      )}
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 650, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
  modal: { background: '#fff', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '88vh', overflowY: 'auto', padding: '1.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 },
  lignes: { display: 'flex', flexDirection: 'column', gap: 10 },
  ligne: { border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 10 },
  ligneHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  ligneSub: { fontSize: '0.7rem', color: '#9ca3af', marginLeft: 4 },
  ligneBody: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  thumb: { width: 60, height: 60, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', flexShrink: 0 },
  select: { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  calcBtn: { marginTop: 6, padding: '6px 10px', borderRadius: 8, border: '1.5px dashed #d1d5db', background: 'none', color: '#374151', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  calcSummary: { marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: '#374151', background: '#f9fafb', borderRadius: 8, padding: '6px 8px', flexWrap: 'wrap' },
  linkBtn: { background: 'none', border: 'none', color: '#4338ca', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0 },
  removeBtn: { background: 'none', border: 'none', color: '#dc2626', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
}
