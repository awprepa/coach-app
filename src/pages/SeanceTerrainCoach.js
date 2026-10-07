import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SchemaTerrainEditor from '../components/SchemaTerrainEditor'

// Éditeur coach d'une séance terrain : une liste de blocs (A, B, C — même
// convention de lettrage que les séances muscu, réutilise `exercices.code`),
// chacun avec un contenu texte structuré (lignes critère + repos) et un schéma
// de terrain. Pas de séries/répétitions/poids — voir Seance.js qui bascule ici
// quand `seance.type === 'terrain'`.

function nextCode(blocs) {
  const lettres = blocs.map(b => (b.code || '').charAt(0)).filter(Boolean)
  const max = lettres.length ? Math.max(...lettres.map(l => l.charCodeAt(0) - 64)) : 0
  return String.fromCharCode(65 + max)
}

function parseDescription(texte) {
  const lignes = texte.split('\n').map(l => l.trim()).filter(Boolean)
  return lignes.map(ligne => {
    const m = ligne.match(/^(.*?)(?:\(([^)]+)\))?\s*r\s*=\s*([^\s].*)$/i)
    if (m) {
      const base = m[1].trim().replace(/[-–]\s*$/, '').trim()
      const critere = m[2] ? ` (${m[2].trim()})` : ''
      return { texte: base + critere, repos: 'r = ' + m[3].trim() }
    }
    return { texte: ligne, repos: null }
  })
}

export default function SeanceTerrainCoach({ id, seance }) {
  const navigate = useNavigate()
  const [nom, setNom] = useState(seance.nom || '')
  const [blocs, setBlocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [openSchemaId, setOpenSchemaId] = useState(null)
  const [genModal, setGenModal] = useState(null) // blocId en cours de description
  const [genText, setGenText] = useState('')
  const [genPreview, setGenPreview] = useState(null)

  useEffect(() => {
    supabase.from('exercices').select('*').eq('seance_id', id).order('ordre').then(({ data }) => {
      setBlocs(data || [])
      setLoading(false)
    })
  }, [id])

  async function sauvegarderNomSeance() {
    if (nom === seance.nom) return
    await supabase.from('seances').update({ nom }).eq('id', id)
  }

  async function ajouterBloc() {
    const bloc = {
      seance_id: id, code: nextCode(blocs), nom: 'Nouveau bloc',
      ordre: blocs.length + 1, contenu: [], schema: null,
    }
    const { data, error } = await supabase.from('exercices').insert([bloc]).select().single()
    if (error) { alert(error.message); return }
    setBlocs(prev => [...prev, data])
  }

  async function supprimerBloc(blocId) {
    if (!window.confirm('Supprimer ce bloc ?')) return
    await supabase.from('exercices').delete().eq('id', blocId)
    setBlocs(prev => prev.filter(b => b.id !== blocId))
    if (openSchemaId === blocId) setOpenSchemaId(null)
  }

  function updateBlocLocal(blocId, patch) {
    setBlocs(prev => prev.map(b => b.id === blocId ? { ...b, ...patch } : b))
  }
  async function saveBloc(blocId, patch) {
    await supabase.from('exercices').update(patch).eq('id', blocId)
  }

  function ajouterLigne(bloc) {
    const contenu = [...(bloc.contenu || []), { texte: '', repos: null }]
    updateBlocLocal(bloc.id, { contenu })
    saveBloc(bloc.id, { contenu })
  }
  function modifierLigne(bloc, idx, patch) {
    const contenu = (bloc.contenu || []).map((l, i) => i === idx ? { ...l, ...patch } : l)
    updateBlocLocal(bloc.id, { contenu })
  }
  function supprimerLigne(bloc, idx) {
    const contenu = (bloc.contenu || []).filter((_, i) => i !== idx)
    updateBlocLocal(bloc.id, { contenu })
    saveBloc(bloc.id, { contenu })
  }

  function genererBloc() {
    if (!genText.trim()) return
    setGenPreview(parseDescription(genText))
  }
  function insererGeneration() {
    const bloc = blocs.find(b => b.id === genModal)
    if (!bloc || !genPreview) return
    updateBlocLocal(bloc.id, { contenu: genPreview })
    saveBloc(bloc.id, { contenu: genPreview })
    setGenModal(null); setGenText(''); setGenPreview(null)
  }

  if (loading) return <div style={S.page}><p style={{ color: '#8a8f98' }}>Chargement…</p></div>

  return (
    <div style={S.page}>
      <div style={S.head}>
        <button onClick={() => navigate(-1)} style={S.btnBack}>← Retour</button>
        <input value={nom} onChange={e => setNom(e.target.value)} onBlur={sauvegarderNomSeance} style={S.nomInput} />
        <span style={S.badgeTerrain}>Séance terrain</span>
      </div>

      <div style={S.blocsList}>
        {blocs.map(bloc => (
          <div key={bloc.id} style={S.blocCard}>
            <div style={S.blocHead}>
              <input value={bloc.code || ''} onChange={e => updateBlocLocal(bloc.id, { code: e.target.value })}
                onBlur={() => saveBloc(bloc.id, { code: bloc.code })} style={S.codeInput} maxLength={2} />
              <input value={bloc.nom || ''} onChange={e => updateBlocLocal(bloc.id, { nom: e.target.value })}
                onBlur={() => saveBloc(bloc.id, { nom: bloc.nom })} style={S.blocNomInput} placeholder="Nom du bloc" />
              <button onClick={() => supprimerBloc(bloc.id)} style={S.btnIcon}>✕</button>
            </div>

            <button onClick={() => { setGenModal(bloc.id); setGenText(''); setGenPreview(null) }} style={S.btnGenerate}>
              ✦ Décrire ce bloc
            </button>

            <div style={S.lignesList}>
              {(bloc.contenu || []).map((ligne, i) => (
                <div key={i} style={S.ligneRow}>
                  <input value={ligne.texte} onChange={e => modifierLigne(bloc, i, { texte: e.target.value })}
                    onBlur={() => saveBloc(bloc.id, { contenu: bloc.contenu })} style={S.ligneTexteInput} placeholder="Critère / description" />
                  <input value={ligne.repos || ''} onChange={e => modifierLigne(bloc, i, { repos: e.target.value || null })}
                    onBlur={() => saveBloc(bloc.id, { contenu: bloc.contenu })} style={S.ligneReposInput} placeholder="r = ..." />
                  <button onClick={() => supprimerLigne(bloc, i)} style={S.btnIcon}>✕</button>
                </div>
              ))}
              <button onClick={() => ajouterLigne(bloc)} style={S.btnAddLigne}>+ Ligne</button>
            </div>

            <button onClick={() => setOpenSchemaId(openSchemaId === bloc.id ? null : bloc.id)} style={S.btnSchemaToggle}>
              {openSchemaId === bloc.id ? '▾ Masquer le schéma' : '▸ Schéma du terrain'}
            </button>
            {openSchemaId === bloc.id && (
              <SchemaTerrainEditor
                value={bloc.schema}
                onChange={next => { updateBlocLocal(bloc.id, { schema: next }); saveBloc(bloc.id, { schema: next }) }}
              />
            )}
          </div>
        ))}

        <button onClick={ajouterBloc} style={S.btnAddBloc}>+ Ajouter un bloc</button>
      </div>

      {genModal && (
        <div style={S.modalOverlay} onClick={() => setGenModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <p style={S.modalTitle}>Décrire ce bloc</p>
            <p style={S.modalSub}>Colle ou écris le bloc comme tu le fais d'habitude (critères, séries, repos) — il sera automatiquement découpé en lignes.</p>
            <textarea value={genText} onChange={e => setGenText(e.target.value)} style={S.genTextarea}
              placeholder={`1 navette avec passage au sol à chaque changement de direction (- de 1'15'') r = 30''\n2 navettes avec passage au sol à chaque départ (- de 3') r = 45''`} />
            <div style={S.modalActions}>
              <button onClick={() => setGenModal(null)} style={S.btnGhost}>Annuler</button>
              <button onClick={genererBloc} style={S.btnPrimarySm}>Générer les lignes</button>
            </div>
            {genPreview && (
              <div style={S.previewBlock}>
                <span style={S.previewTitle}>Aperçu ({genPreview.length} ligne{genPreview.length > 1 ? 's' : ''})</span>
                {genPreview.map((l, i) => (
                  <div key={i} style={S.previewLine}>
                    <span style={{ flex: 1 }}>{l.texte}</span>
                    {l.repos && <span style={S.previewRepos}>{l.repos}</span>}
                  </div>
                ))}
                <button onClick={insererGeneration} style={{ ...S.btnPrimarySm, marginTop: 8 }}>Insérer dans le bloc</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { padding: '1.25rem 1.5rem 3rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 760, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' },
  btnBack: { border: 'none', background: 'none', color: '#6b7280', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: 0 },
  nomInput: { flex: 1, minWidth: 160, border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '0.5rem 0.75rem', fontSize: '1rem', fontWeight: 800, color: '#1a1a1a' },
  badgeTerrain: { background: '#ecfccb', color: '#3f6212', fontSize: '0.72rem', fontWeight: 800, padding: '0.3rem 0.7rem', borderRadius: 999 },

  blocsList: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  blocCard: { background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1rem' },
  blocHead: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' },
  codeInput: { width: 42, textAlign: 'center', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.45rem 0', fontSize: '0.85rem', fontWeight: 800, color: '#1a1a1a' },
  blocNomInput: { flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.9rem', fontWeight: 700, color: '#1a1a1a' },
  btnIcon: { border: 'none', background: 'none', color: '#c4ccd4', fontSize: '0.9rem', cursor: 'pointer', padding: '0 0.3rem', flexShrink: 0 },

  btnGenerate: { border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: '0.78rem', fontWeight: 700, padding: '0.5rem 0.8rem', borderRadius: 9, cursor: 'pointer', marginBottom: '0.75rem' },

  lignesList: { display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' },
  ligneRow: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  ligneTexteInput: { flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem', color: '#1a1a1a' },
  ligneReposInput: { width: 90, border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.82rem', color: '#1a1a1a' },
  btnAddLigne: { alignSelf: 'flex-start', border: 'none', background: 'none', color: '#9ca3af', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: '0.2rem 0' },

  btnSchemaToggle: { border: 'none', background: 'none', color: '#6b7280', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: '0.3rem 0', marginBottom: '0.5rem' },

  btnAddBloc: { border: '1.5px dashed #d1d5db', background: 'none', color: '#9ca3af', fontSize: '0.85rem', fontWeight: 700, padding: '0.75rem', borderRadius: 12, cursor: 'pointer' },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' },
  modal: { width: 480, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'white', borderRadius: 16, padding: '1.25rem' },
  modalTitle: { fontWeight: 800, fontSize: '1rem', margin: '0 0 0.3rem', color: '#1a1a1a' },
  modalSub: { fontSize: '0.78rem', color: '#6b7280', margin: '0 0 0.75rem', lineHeight: 1.5 },
  genTextarea: { width: '100%', minHeight: 130, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.6rem 0.75rem', fontSize: '0.82rem', fontFamily: 'inherit', boxSizing: 'border-box' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' },
  btnGhost: { border: '1px solid #e5e7eb', background: 'none', color: '#6b7280', fontSize: '0.82rem', fontWeight: 700, padding: '0.5rem 0.9rem', borderRadius: 9, cursor: 'pointer' },
  btnPrimarySm: { border: 'none', background: '#e4f816', color: '#1f2937', fontSize: '0.82rem', fontWeight: 800, padding: '0.5rem 1rem', borderRadius: 9, cursor: 'pointer' },
  previewBlock: { marginTop: '1rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '0.75rem' },
  previewTitle: { fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.5rem' },
  previewLine: { display: 'flex', gap: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0', borderBottom: '1px solid #e5e7eb', color: '#1a1a1a' },
  previewRepos: { color: '#65a30d', fontWeight: 700, whiteSpace: 'nowrap' },
}
