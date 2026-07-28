import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import SchemaSVG from '../components/SchemaSVG'
import SchemaEditor from '../components/SchemaEditor'

const TYPES = [
  { key: 'intermittent_long', label: 'Intermittent long' },
  { key: 'intermittent_court', label: 'Intermittent court' },
  { key: 'agilite', label: 'Agilité' },
  { key: 'autre', label: 'Autre' },
]

export default function SchemasEntrainement() {
  const [schemas, setSchemas] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFiltre, setTypeFiltre] = useState('tous')
  const [editing, setEditing] = useState(null) // null=fermé, {}=nouveau, {...}=édition
  const [dupliquant, setDupliquant] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('schemas_entrainement').select('*').order('created_at', { ascending: false })
    setSchemas(data || [])
    setLoading(false)
  }

  async function dupliquer(schema) {
    setDupliquant(schema.id)
    const { error } = await supabase.from('schemas_entrainement').insert({
      nom: `${schema.nom} (copie)`,
      type_exercice: schema.type_exercice,
      description: schema.description,
      donnees: schema.donnees,
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
    if (typeFiltre !== 'tous' && s.type_exercice !== typeFiltre) return false
    if (search.trim() && !s.nom.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  return (
    <div style={S.page}>
      <div style={S.topRow}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un schéma…" style={S.search} />
        <button onClick={() => setEditing({})} style={S.newBtn}>+ Nouveau schéma</button>
      </div>

      <div style={S.filterRow}>
        <button onClick={() => setTypeFiltre('tous')} style={{ ...S.filterBtn, ...(typeFiltre === 'tous' ? S.filterBtnActive : {}) }}>Tous</button>
        {TYPES.map(t => (
          <button key={t.key} onClick={() => setTypeFiltre(t.key)} style={{ ...S.filterBtn, ...(typeFiltre === t.key ? S.filterBtnActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={S.empty}>Chargement…</p>
      ) : filtres.length === 0 ? (
        <p style={S.empty}>Aucun schéma. Crée-en un pour commencer.</p>
      ) : (
        <div style={S.grid}>
          {filtres.map(s => (
            <div key={s.id} style={S.card}>
              <div style={S.thumb} onClick={() => setEditing(s)}>
                <SchemaSVG donnees={s.donnees} />
              </div>
              <div style={S.cardBody}>
                <p style={S.cardNom}>{s.nom}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={S.cardType}>{TYPES.find(t => t.key === s.type_exercice)?.label || s.type_exercice}</span>
                  <span style={S.cardDate}>{new Date(s.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
                {s.description && <p style={S.cardDesc}>{s.description}</p>}
                <div style={S.cardActions}>
                  <button onClick={() => setEditing(s)} style={S.actionBtn}>✎ Modifier</button>
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

      {editing && (
        <SchemaEditor
          schema={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAll() }}
        />
      )}
    </div>
  )
}

const S = {
  page: { padding: '1.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  topRow: { display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 200, padding: '0.55rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.85rem', outline: 'none' },
  newBtn: { background: '#1f2937', color: '#fff', border: 'none', borderRadius: 10, padding: '0.55rem 1.1rem', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' },
  filterRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 },
  filterBtn: { padding: '5px 12px', borderRadius: 999, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' },
  filterBtnActive: { background: '#eef2ff', color: '#4338ca', borderColor: '#c7d2fe' },
  empty: { color: '#9ca3af', fontSize: '0.85rem', padding: '2rem 0', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  card: { background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #f0f0f0' },
  thumb: { cursor: 'pointer', borderBottom: '1px solid #f0f0f0', height: 140 },
  cardBody: { padding: '0.7rem 0.85rem' },
  cardNom: { fontWeight: 800, fontSize: '0.88rem', color: '#1f2937', margin: '0 0 4px' },
  cardType: { fontSize: '0.68rem', fontWeight: 700, color: '#6366f1', background: '#eef2ff', borderRadius: 6, padding: '1px 7px' },
  cardDate: { fontSize: '0.68rem', color: '#9ca3af' },
  cardDesc: { fontSize: '0.74rem', color: '#6b7280', margin: '6px 0 0', lineHeight: 1.4 },
  cardActions: { display: 'flex', gap: 10, marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 7 },
  actionBtn: { background: 'none', border: 'none', color: '#374151', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', padding: 0 },
}
