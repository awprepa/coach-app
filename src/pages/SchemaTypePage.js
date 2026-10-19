import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import SchemaTerrainEditor from '../components/SchemaTerrainEditor'

// Bibliothèque > Schémas : création / modification d'un schéma type avec
// l'éditeur de terrain (distances réelles, course à la VMI, cadenas).
// Même format que les schémas types enregistrés depuis une séance terrain :
// schemas_entrainement.type_exercice = 'terrain', donnees = { bloc_nom, contenu, schema }.
export default function SchemaTypePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const nouveau = !id
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [dossierId, setDossierId] = useState('')
  const [dossiers, setDossiers] = useState([])
  const [donnees, setDonnees] = useState({ contenu: [], schema: null })
  const [loading, setLoading] = useState(!nouveau)
  const [saving, setSaving] = useState(false)
  const [modifie, setModifie] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    supabase.from('dossiers_schemas').select('*').order('nom').then(({ data }) => setDossiers(data || []))
    if (nouveau) return
    supabase.from('schemas_entrainement').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setNom(data.nom || '')
        setDescription(data.description || '')
        setDossierId(data.dossier_id || '')
        // Un ancien schéma (autre format) s'ouvre vide dans le nouvel éditeur
        setDonnees(data.type_exercice === 'terrain' ? (data.donnees || {}) : { contenu: [], schema: null })
      }
      setLoading(false)
    })
  }, [id, nouveau])

  // Prévenir avant de quitter avec des modifications non enregistrées
  useEffect(() => {
    if (!modifie) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [modifie])

  async function enregistrer() {
    if (!nom.trim()) { setErreur('Donne un nom au schéma.'); return }
    setSaving(true); setErreur(null)
    // Le schéma type garde les proportions et les réglages, pas la VMI d'un joueur
    const schema = donnees.schema
      ? { ...donnees.schema, course: donnees.schema.course ? { ...donnees.schema.course, vmi: null } : undefined }
      : null
    const payload = {
      nom: nom.trim(), description: description.trim() || null, dossier_id: dossierId || null,
      type_exercice: 'terrain', donnees: { ...donnees, bloc_nom: nom.trim(), schema },
      updated_at: new Date().toISOString(),
    }
    const { data, error } = nouveau
      ? await supabase.from('schemas_entrainement').insert(payload).select('id').single()
      : await supabase.from('schemas_entrainement').update(payload).eq('id', id).select('id').single()
    setSaving(false)
    if (error) { setErreur('Le schéma n’a pas été enregistré. Réessaie.'); return }
    setModifie(false)
    if (nouveau && data?.id) navigate(`/bibliotheque/schemas/${data.id}`, { replace: true })
  }

  function quitter() {
    if (modifie && !window.confirm('Quitter sans enregistrer les modifications ?')) return
    navigate('/bibliotheque?tab=schemas')
  }

  if (loading) return <div style={S.page}><p style={{ color: '#6b7280' }}>Chargement…</p></div>

  return (
    <div style={S.page}>
      <div style={S.head}>
        <button onClick={quitter} style={S.btnBack}>← Bibliothèque</button>
        <div style={{ flex: 1 }} />
        {erreur && <span style={S.erreur}>{erreur}</span>}
        {!modifie && !nouveau && <span style={S.ok}>Enregistré</span>}
        <button onClick={enregistrer} disabled={saving} style={{ ...S.btnSave, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div style={S.fields}>
        <input value={nom} onChange={e => { setNom(e.target.value); setModifie(true) }} placeholder="Nom du schéma (ex. Navettes 15-15 avec plaquage)" style={S.nom} />
        <select value={dossierId} onChange={e => { setDossierId(e.target.value); setModifie(true) }} style={S.select}>
          <option value="">Sans dossier</option>
          {dossiers.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
      </div>
      <textarea value={description} onChange={e => { setDescription(e.target.value); setModifie(true) }}
        placeholder="Description, consignes (facultatif)" rows={2} style={S.desc} />

      <SchemaTerrainEditor
        hauteur={640}
        value={donnees.schema}
        onChange={next => { setDonnees(d => ({ ...d, schema: next })); setModifie(true) }}
      />
      <p style={S.aide}>
        Pour l'utiliser avec un joueur : dans sa séance terrain, « + Depuis un schéma type », puis « Adapter les distances » avec sa VMI.
      </p>
    </div>
  )
}

const S = {
  page: { padding: '1.25rem 1.5rem 3rem', maxWidth: 1100, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' },
  btnBack: { border: 'none', background: 'none', color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', padding: 0 },
  btnSave: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.6rem 1.2rem', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' },
  ok: { fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 },
  erreur: { fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 },
  fields: { display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap' },
  nom: { flex: 1, minWidth: 220, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '1rem', fontWeight: 800, color: '#1a1a1a', boxSizing: 'border-box' },
  select: { border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.55rem 0.7rem', fontSize: '0.85rem', fontWeight: 600, color: '#374151', background: '#fff' },
  desc: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.6rem 0.8rem', fontSize: '0.88rem', fontFamily: 'inherit', marginBottom: '0.9rem', resize: 'vertical' },
  aide: { fontSize: '0.8rem', color: '#6b7280', marginTop: '0.75rem', lineHeight: 1.5 },
}
