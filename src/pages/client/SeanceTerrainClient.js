import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'
import ClientBottomNav from '../../components/ClientBottomNav'
import SchemaTerrainView from '../../components/SchemaTerrainView'
import { autoPlacerSeanceSurCalendrier } from '../../utils/autoPlacerSeance'

function getSemaineActuelle(dateDebut) {
  if (!dateDebut) return 1
  const debut = new Date(dateDebut)
  const diffJours = Math.floor((new Date() - debut) / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.ceil((diffJours + 1) / 7))
}

// Vue client d'une séance terrain : blocs en lecture (texte + schéma), un
// bouton "Bloc terminé" par bloc (pas de détail série par série, à la
// différence des séances muscu) et un RPE ressenti global en bas — réutilise
// rpe_seances, déjà utilisé par les séances muscu.
export default function SeanceTerrainClient({ id, seance }) {
  const navigate = useNavigate()
  const [blocs, setBlocs] = useState([])
  const [validations, setValidations] = useState({}) // exercice_id -> true
  const [rpe, setRpe] = useState(null) // { id, rpe_reel } | null
  const [loading, setLoading] = useState(true)
  const [openSchemaId, setOpenSchemaId] = useState(null)

  const semaineActuelle = getSemaineActuelle(seance?.programmes?.date_debut)
  const clientId = seance?.programmes?.client_id

  useEffect(() => {
    (async () => {
      const { data: exos } = await supabase.from('exercices').select('*').eq('seance_id', id).order('ordre')
      setBlocs(exos || [])

      const exIds = (exos || []).map(e => e.id)
      if (exIds.length) {
        const { data: vals } = await supabase
          .from('bloc_terrain_validations').select('exercice_id, valide')
          .in('exercice_id', exIds).eq('semaine', semaineActuelle)
        const map = {}
        ;(vals || []).forEach(v => { map[v.exercice_id] = v.valide })
        setValidations(map)
      }

      const { data: r } = await supabase
        .from('rpe_seances').select('id, rpe_reel').eq('seance_id', id).eq('semaine', semaineActuelle).maybeSingle()
      setRpe(r || null)

      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, semaineActuelle])

  async function toggleBloc(blocId) {
    const dejaValide = !!validations[blocId]
    setValidations(prev => ({ ...prev, [blocId]: !dejaValide }))
    await supabase.from('bloc_terrain_validations')
      .upsert({ exercice_id: blocId, semaine: semaineActuelle, valide: !dejaValide }, { onConflict: 'exercice_id,semaine' })
    if (!dejaValide) autoPlacerSeanceSurCalendrier(clientId, id, semaineActuelle)
  }

  async function saveRpe(value) {
    const cleanVal = value ? parseFloat(value) : null
    if (rpe?.id) {
      await supabase.from('rpe_seances').update({ rpe_reel: cleanVal }).eq('id', rpe.id)
      setRpe(prev => ({ ...prev, rpe_reel: cleanVal }))
    } else {
      const { data } = await supabase.from('rpe_seances').insert([{ seance_id: id, semaine: semaineActuelle, rpe_reel: cleanVal }]).select().single()
      if (data) setRpe(data)
    }
    autoPlacerSeanceSurCalendrier(clientId, id, semaineActuelle)
  }

  if (loading) return <div style={S.page}><p style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem' }}>Chargement…</p></div>

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={() => navigate(-1)} style={S.iconBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div>
          <div style={S.headerTitle}>{seance.nom}</div>
          <div style={S.headerSub}>Séance terrain · Semaine {semaineActuelle}</div>
        </div>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.content}>
        {blocs.map(bloc => {
          const valide = !!validations[bloc.id]
          return (
            <div key={bloc.id} style={{ ...S.blocCard, ...(valide ? S.blocCardDone : {}) }}>
              <div style={S.blocHead}>
                <span style={S.blocCode}>{bloc.code}</span>
                <span style={S.blocNom}>{bloc.nom}</span>
              </div>

              <div style={S.lignesList}>
                {(bloc.contenu || []).map((ligne, i) => (
                  <div key={i} style={S.ligneRow}>
                    <span style={S.ligneTexte}>{ligne.texte}</span>
                    {ligne.repos && <span style={S.ligneRepos}>{ligne.repos}</span>}
                  </div>
                ))}
              </div>

              {bloc.schema && (bloc.schema.plots?.length > 0 || bloc.schema.arrows?.length > 0) && (
                <>
                  <button onClick={() => setOpenSchemaId(openSchemaId === bloc.id ? null : bloc.id)} style={S.btnSchemaToggle}>
                    {openSchemaId === bloc.id ? '▾ Masquer le schéma' : '▸ Voir le schéma'}
                  </button>
                  {openSchemaId === bloc.id && <SchemaTerrainView value={bloc.schema} style={{ marginBottom: '0.75rem' }} />}
                </>
              )}

              <button onClick={() => toggleBloc(bloc.id)} style={{ ...S.btnValider, ...(valide ? S.btnValiderOn : {}) }}>
                {valide ? '✓ Bloc terminé' : 'Marquer le bloc terminé'}
              </button>
            </div>
          )
        })}

        <div style={S.rpeCard}>
          <p style={S.rpeLabel}>RPE ressenti de la séance</p>
          <div style={S.rpeRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button key={n} onClick={() => saveRpe(n)} style={{ ...S.rpeBtn, ...(rpe?.rpe_reel === n ? S.rpeBtnOn : {}) }}>{n}</button>
            ))}
          </div>
        </div>

        <div style={{ height: 90 }} />
      </div>

      <ClientBottomNav />
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: '#f4f4f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '1rem 1.1rem', background: 'linear-gradient(135deg, #333333 0%, #1f2937 100%)' },
  iconBtn: { width: 32, height: 32, background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  headerTitle: { color: 'white', fontWeight: 800, fontSize: '0.95rem', textAlign: 'center' },
  headerSub: { color: '#9ca3af', fontSize: '0.72rem', textAlign: 'center', marginTop: 2 },

  content: { padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' },

  blocCard: { background: 'white', borderRadius: 16, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  blocCardDone: { background: '#f7fee7', boxShadow: 'none', border: '1.5px solid #d9f99d' },
  blocHead: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' },
  blocCode: { background: '#1f2937', color: '#e4f816', fontSize: '0.75rem', fontWeight: 800, width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  blocNom: { fontWeight: 800, fontSize: '0.95rem', color: '#1a1a1a' },

  lignesList: { display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.75rem' },
  ligneRow: { display: 'flex', alignItems: 'baseline', gap: '0.6rem', fontSize: '0.84rem', color: '#374151', lineHeight: 1.45 },
  ligneTexte: { flex: 1 },
  ligneRepos: { color: '#65a30d', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' },

  btnSchemaToggle: { border: 'none', background: 'none', color: '#6b7280', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: '0.2rem 0', marginBottom: '0.5rem' },

  btnValider: { width: '100%', border: 'none', background: '#f3f4f6', color: '#374151', fontSize: '0.85rem', fontWeight: 800, padding: '0.7rem', borderRadius: 12, cursor: 'pointer' },
  btnValiderOn: { background: '#65a30d', color: 'white' },

  rpeCard: { background: 'white', borderRadius: 16, padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  rpeLabel: { fontWeight: 800, fontSize: '0.88rem', color: '#1a1a1a', margin: '0 0 0.7rem' },
  rpeRow: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' },
  rpeBtn: { width: 32, height: 32, borderRadius: 9, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' },
  rpeBtnOn: { background: '#1f2937', color: '#e4f816', borderColor: '#1f2937' },
}
