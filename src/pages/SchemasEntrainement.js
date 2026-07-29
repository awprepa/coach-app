import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SchemaSVG from '../components/SchemaSVG'

export default function SchemasEntrainement() {
  const navigate = useNavigate()
  const [schemas, setSchemas] = useState([])
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dossierActif, setDossierActif] = useState('tous') // 'tous' | 'sans' | <id>
  const [dupliquant, setDupliquant] = useState(null)
  const [nouveauDossier, setNouveauDossier] = useState(null) // null=fermé, ''=formulaire ouvert

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s }, { data: d }] = await Promise.all([
      supabase.from('schemas_entrainement').select('*').order('created_at', { ascending: false }),
      supabase.from('dossiers_schemas').select('*').order('nom'),
    ])
    setSchemas(s || [])
    setDossiers(d || [])
    setLoading(false)
  }

  async function creerDossier() {
    const nom = (nouveauDossier || '').trim()
    if (!nom) { setNouveauDossier(null); return }
    const { error } = await supabase.from('dossiers_schemas').insert({ nom })
    setNouveauDossier(null)
    if (error) { alert(error.message); return }
    fetchAll()
  }

  async function supprimerDossier(id) {
    if (!window.confirm('Supprimer ce dossier ? Les schémas qu\'il contient ne seront pas supprimés.')) return
    await supabase.from('dossiers_schemas').delete().eq('id', id)
    if (dossierActif === id) setDossierActif('tous')
    fetchAll()
  }

  async function deplacerVersDossier(schemaId, dossierId) {
    await supabase.from('schemas_entrainement').update({ dossier_id: dossierId || null }).eq('id', schemaId)
    setSchemas(prev => prev.map(s => s.id === schemaId ? { ...s, dossier_id: dossierId || null } : s))
  }

  async function dupliquer(schema) {
    setDupliquant(schema.id)
    const { error } = await supabase.from('schemas_entrainement').insert({
      nom: `${schema.nom} (copie)`,
      description: schema.description,
      donnees: schema.donnees,
      dossier_id: schema.dossier_id,
    })
    setDupliquant(null)
    if (error) { alert(error.message); return }
    fetchAll()
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce schéma de la bibliothèque ?')) return
    await supabase.from('schemas_entrainement').delete().eq('id', id)
    setSchemas(prev => prev.filter(s => s.id !== id))
  }

  const filtres = schemas.filter(s => {
    if (dossierActif === 'sans' && s.dossier_id) return false
    if (dossierActif !== 'tous' && dossierActif !== 'sans' && s.dossier_id !== dossierActif) return false
    if (search.trim() && !s.nom.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  return (
    <div style={S.page}>
      <div style={S.topRow}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un schéma…" style={S.search} />
        <button onClick={() => navigate('/bibliotheque/schemas/nouveau')} style={S.newBtn}>+ Nouveau schéma</button>
      </div>

      <div style={S.filterRow}>
        <button onClick={() => setDossierActif('tous')} style={{ ...S.filterBtn, ...(dossierActif === 'tous' ? S.filterBtnActive : {}) }}>Tous</button>
        <button onClick={() => setDossierActif('sans')} style={{ ...S.filterBtn, ...(dossierActif === 'sans' ? S.filterBtnActive : {}) }}>Sans dossier</button>
        {dossiers.map(d => (
          <button key={d.id} onClick={() => setDossierActif(d.id)} style={{ ...S.filterBtn, ...(dossierActif === d.id ? S.filterBtnActive : {}) }}>
            📁 {d.nom}
          </button>
        ))}
        {nouveauDossier === null ? (
          <button onClick={() => setNouveauDossier('')} style={S.filterBtnAdd}>+ Dossier</button>
        ) : (
          <span style={S.newDossierRow}>
            <input autoFocus value={nouveauDossier} onChange={e => setNouveauDossier(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') creerDossier(); if (e.key === 'Escape') setNouveauDossier(null) }}
              placeholder="Nom du dossier" style={S.newDossierInput} />
            <button onClick={creerDossier} style={S.newDossierValider}>OK</button>
          </span>
        )}
        {dossierActif !== 'tous' && dossierActif !== 'sans' && (
          <button onClick={() => supprimerDossier(dossierActif)} style={S.filterBtnDelete}>✕ Supprimer ce dossier</button>
        )}
      </div>

      {loading ? (
        <p style={S.empty}>Chargement…</p>
      ) : filtres.length === 0 ? (
        <p style={S.empty}>Aucun schéma. Crée-en un pour commencer.</p>
      ) : (
        <div style={S.grid}>
          {filtres.map(s => (
            <div key={s.id} style={S.card}>
              <div style={S.thumb} onClick={() => navigate(`/bibliotheque/schemas/${s.id}`)}>
                <SchemaSVG donnees={s.donnees} />
              </div>
              <div style={S.cardBody}>
                <p style={S.cardNom}>{s.nom}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <select value={s.dossier_id || ''} onChange={e => deplacerVersDossier(s.id, e.target.value)} style={S.dossierSelect}>
                    <option value="">Sans dossier</option>
                    {dossiers.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                  </select>
                  <span style={S.cardDate}>{new Date(s.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
                {s.description && <p style={S.cardDesc}>{s.description}</p>}
                <div style={S.cardActions}>
                  <button onClick={() => navigate(`/bibliotheque/schemas/${s.id}`)} style={S.actionBtn}>✎ Modifier</button>
                  <button onClick={() => dupliquer(s)} disabled={dupliquant === s.id} style={S.actionBtn}>
                    {dupliquant === s.id ? '…' : '⧉ Dupliquer'}
                  </button>
                  <button onClick={() => supprimer(s.id)} style={{ ...S.actionBtn, color: '#dc2626' }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const S = {
  page: { padding: '1.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  topRow: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 200, padding: '0.55rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', outline: 'none' },
  newBtn: { background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.55rem 1.1rem', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' },
  filterRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' },
  filterBtn: { padding: '5px 12px', borderRadius: 999, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  filterBtnActive: { background: '#333333', color: '#e4f816', borderColor: '#333333' },
  filterBtnAdd: { padding: '5px 12px', borderRadius: 999, border: '1.5px dashed #d1d5db', background: '#fff', color: '#374151', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  filterBtnDelete: { padding: '5px 12px', borderRadius: 999, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  newDossierRow: { display: 'flex', gap: 4, alignItems: 'center' },
  newDossierInput: { padding: '5px 10px', borderRadius: 999, border: '1.5px solid #e5e7eb', fontSize: '0.75rem', outline: 'none', width: 130 },
  newDossierValider: { padding: '5px 10px', borderRadius: 999, border: 'none', background: '#333333', color: '#e4f816', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' },
  empty: { color: '#9ca3af', fontSize: '0.85rem', padding: '2rem 0', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  card: { background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #f0f0f0' },
  thumb: { cursor: 'pointer', borderBottom: '1px solid #f0f0f0', height: 140 },
  cardBody: { padding: '0.7rem 0.85rem' },
  cardNom: { fontWeight: 800, fontSize: '0.88rem', color: '#1f2937', margin: '0 0 4px' },
  dossierSelect: { fontSize: '0.68rem', fontWeight: 700, color: '#374151', background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '2px 4px', maxWidth: 130 },
  cardDate: { fontSize: '0.68rem', color: '#9ca3af', whiteSpace: 'nowrap' },
  cardDesc: { fontSize: '0.74rem', color: '#6b7280', margin: '6px 0 0', lineHeight: 1.4 },
  cardActions: { display: 'flex', gap: 10, marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 7 },
  actionBtn: { background: 'none', border: 'none', color: '#374151', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: 0 },
}
