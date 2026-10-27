import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// Fiche client > onglet Entraînement : les notes laissées par le client en fin
// de séance (seance_commentaires), toutes séances confondues, les plus récentes
// d'abord. Un clic ouvre la séance.
const VISIBLES = 4

export default function NotesSeancesClient({ clientId }) {
  const navigate = useNavigate()
  const [notes, setNotes] = useState(null)
  const [tout, setTout] = useState(false)

  useEffect(() => {
    let actif = true
    supabase.from('seance_commentaires')
      .select('id, semaine, texte, non_effectuee, created_at, seances!inner(id, nom, programmes!inner(nom, client_id))')
      .eq('seances.programmes.client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (actif) setNotes((data || []).filter(n => (n.texte || '').trim() || n.non_effectuee))
      })
    return () => { actif = false }
  }, [clientId])

  if (!notes?.length) return null
  const liste = tout ? notes : notes.slice(0, VISIBLES)

  return (
    <div style={S.carte}>
      <div style={S.tete}>
        <p style={S.titre}>Notes de séance</p>
        <span style={S.compte}>{notes.length}</span>
      </div>
      {liste.map(n => (
        <button key={n.id} onClick={() => navigate(`/seance/${n.seances.id}`)} style={S.ligne}>
          <span style={S.meta}>
            <span style={S.sem}>S{n.semaine}</span>
            <span style={S.seance}>{n.seances.nom}</span>
            <span style={S.date}>{new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
          </span>
          {n.non_effectuee && <span style={S.nonFaite}>Séance non effectuée</span>}
          {(n.texte || '').trim() && <span style={S.texte}>{n.texte.trim()}</span>}
        </button>
      ))}
      {notes.length > VISIBLES && (
        <button onClick={() => setTout(v => !v)} style={S.plus}>
          {tout ? 'Afficher moins' : `Voir les ${notes.length} notes`}
        </button>
      )}
    </div>
  )
}

const S = {
  carte: { background: 'white', borderRadius: 14, padding: '1rem 1.1rem 0.6rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1.5rem' },
  tete: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' },
  titre: { margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' },
  compte: { fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 999, padding: '1px 8px' },
  ligne: { display: 'flex', flexDirection: 'column', gap: '0.2rem', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid #f3f4f6', padding: '0.65rem 0', cursor: 'pointer', fontFamily: 'inherit' },
  meta: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0 },
  sem: { flexShrink: 0, fontSize: '0.78rem', fontWeight: 800, color: '#333333' },
  seance: { flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 700, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  date: { flexShrink: 0, fontSize: '0.75rem', color: '#6b7280' },
  nonFaite: { fontSize: '0.78rem', fontWeight: 700, color: '#dc2626' },
  texte: { fontSize: '0.88rem', color: '#1a1a1a', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  plus: { width: '100%', background: 'none', border: 'none', borderTop: '1px solid #f3f4f6', padding: '0.7rem 0 0.4rem', fontSize: '0.8rem', fontWeight: 700, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
}
