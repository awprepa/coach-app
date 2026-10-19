import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  // La page occupe tout l'espace sous la barre de navigation
  const cadreRef = useRef(null)
  const [haut, setHaut] = useState(0)
  useLayoutEffect(() => {
    const maj = () => setHaut(cadreRef.current?.getBoundingClientRect().top + window.scrollY || 0)
    maj(); window.addEventListener('resize', maj)
    return () => window.removeEventListener('resize', maj)
  }, [loading])

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

  if (loading) return <div style={{ padding: '2rem' }}><p style={{ color: '#6b7280' }}>Chargement…</p></div>

  const entete = (
    <>
      <button onClick={quitter} style={S.btnBack}>← Bibliothèque</button>
      <input value={nom} onChange={e => { setNom(e.target.value); setModifie(true) }} placeholder="Nom du schéma" style={S.nom} />
      <select value={dossierId} onChange={e => { setDossierId(e.target.value); setModifie(true) }} style={S.select}>
        <option value="">Sans dossier</option>
        {dossiers.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
      </select>
      {erreur && <span style={S.erreur}>{erreur}</span>}
      {!modifie && !nouveau && !erreur && <span style={S.ok}>Enregistré</span>}
      <button onClick={enregistrer} disabled={saving} style={{ ...S.btnSave, opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </>
  )
  const infos = (
    <>
      <label style={S.label}>Description, consignes</label>
      <textarea value={description} onChange={e => { setDescription(e.target.value); setModifie(true) }}
        placeholder="Facultatif" rows={4} style={S.desc} />
      <p style={S.aide}>Pour l'utiliser avec un joueur : dans sa séance terrain, « + Depuis un schéma type », puis « Adapter les distances » avec sa VMI.</p>
    </>
  )

  return (
    <div ref={cadreRef} style={{ height: `calc(100vh - ${haut}px)`, minHeight: 560, margin: 0 }}>
      <SchemaTerrainEditor
        pleinEcran
        entete={entete}
        infos={infos}
        value={donnees.schema}
        onChange={next => { setDonnees(d => ({ ...d, schema: next })); setModifie(true) }}
      />
    </div>
  )
}

const S = {
  btnBack: { border: 'none', background: 'none', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '6px 4px', whiteSpace: 'nowrap' },
  nom: { flex: '1 1 220px', minWidth: 180, maxWidth: 420, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: 14, fontWeight: 800, color: '#1a1a1a', boxSizing: 'border-box' },
  select: { border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '6px 8px', fontSize: 13, fontWeight: 600, color: '#374151', background: '#fff' },
  btnSave: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' },
  ok: { fontSize: 12.5, color: '#6b7280', fontWeight: 600 },
  erreur: { fontSize: 12.5, color: '#dc2626', fontWeight: 600 },
  label: { fontSize: 11.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 },
  desc: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '7px 9px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' },
  aide: { fontSize: 12, color: '#6b7280', margin: '10px 0 0', lineHeight: 1.5 },
}
