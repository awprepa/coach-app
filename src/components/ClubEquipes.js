import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { getActiveBlessure } from './BlessureButton'
import { isoLocal } from '../utils/dates'

// Page d'un club : une carte par équipe (sous-groupes, prochain entraînement,
// joueurs, wellness du jour, blessés). Le club ne porte ni calendrier, ni
// classement, ni effectif : tout vit dans les équipes.
export default function ClubEquipes({ club, equipes, onCree }) {
  const navigate = useNavigate()
  const [infos, setInfos] = useState({}) // { equipeId: { joueurs, wellness, blesses, prochain, sousGroupes: [{ nom, n }] } }
  const [ajout, setAjout] = useState(false)
  const [nom, setNom] = useState('')

  useEffect(() => { charger() }, [equipes]) // eslint-disable-line

  async function charger() {
    const ids = equipes.map(e => e.id)
    if (!ids.length) { setInfos({}); return }
    const today = isoLocal()
    const [{ data: sgs }, { data: membres }, { data: evts }] = await Promise.all([
      supabase.from('groupes').select('id, nom, parent_id').in('parent_id', ids).order('created_at'),
      supabase.from('groupe_membres').select('groupe_id, client_id').in('groupe_id', ids),
      supabase.from('groupe_evenements').select('groupe_id, date, heure').in('groupe_id', ids)
        .eq('type', 'entrainement').gte('date', today).order('date').order('heure'),
    ])
    const sgIds = (sgs || []).map(s => s.id)
    const [{ data: sgMembres }, { data: joueurs }, { data: wellness }] = await Promise.all([
      sgIds.length ? supabase.from('groupe_membres').select('groupe_id, client_id').in('groupe_id', sgIds) : { data: [] },
      supabase.from('groupe_joueurs').select('groupe_id, client_id, prenom, nom, joueur_blessures(statut, date_debut)')
        .in('groupe_id', [...ids, ...sgIds]),
      supabase.from('wellness').select('client_id').eq('date', today)
        .in('client_id', [...new Set((membres || []).map(m => m.client_id))]),
    ])
    const remplis = new Set((wellness || []).map(w => w.client_id))
    const equipeDe = id => sgs?.find(s => s.id === id)?.parent_id || id
    const res = {}
    for (const e of equipes) {
      const cl = (membres || []).filter(m => m.groupe_id === e.id).map(m => m.client_id)
      const blesses = new Set((joueurs || [])
        .filter(j => equipeDe(j.groupe_id) === e.id && getActiveBlessure(j.joueur_blessures))
        .map(j => j.client_id || `${j.prenom} ${j.nom}`))
      res[e.id] = {
        joueurs: cl.length,
        wellness: cl.filter(c => remplis.has(c)).length,
        blesses: blesses.size,
        prochain: (evts || []).find(ev => ev.groupe_id === e.id) || null,
        sousGroupes: (sgs || []).filter(s => s.parent_id === e.id)
          .map(s => ({ id: s.id, nom: s.nom, n: (sgMembres || []).filter(m => m.groupe_id === s.id).length })),
      }
    }
    setInfos(res)
  }

  async function creer() {
    if (!nom.trim()) return
    const { error } = await supabase.from('groupes').insert([{
      nom: nom.trim(), type: 'equipe', parent_id: club.id,
      couleur: club.couleur || null, couleur_secondaire: club.couleur_secondaire || null, logo_url: club.logo_url || null,
    }])
    if (error) { alert(error.message); return }
    setNom(''); setAjout(false)
    onCree()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
      {equipes.map(e => {
        const i = infos[e.id]
        return (
          <div key={e.id} role="button" tabIndex={0} className="club-carte" onClick={() => navigate(`/groupe/${e.id}`)}
            onKeyDown={ev => (ev.key === 'Enter' || ev.key === ' ') && navigate(`/groupe/${e.id}`)} style={S.carte}>
            <div>
              <p style={S.eyebrow}>Équipe</p>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#1a1a1a' }}>{e.nom}</h2>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', minHeight: 22 }}>
              {i && (i.sousGroupes.length
                ? i.sousGroupes.map(s => <span key={s.id} style={S.puce}>{s.nom} · {s.n}</span>)
                : <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Pas de sous-groupe</span>)}
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: i?.prochain ? '#dc2626' : '#d1d5db', flexShrink: 0 }} />
              {i?.prochain ? `Entraînement · ${dateCourte(i.prochain.date)}${i.prochain.heure ? ` · ${i.prochain.heure.slice(0, 5).replace(':', 'h')}` : ''}` : 'Aucun entraînement prévu'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
              <Stat v={i?.joueurs} l="joueurs" />
              <Stat v={i?.wellness} sur={i?.joueurs} l="wellness du jour" />
              <Stat v={i?.blesses} l={i?.blesses > 1 ? 'blessés' : 'blessé'} />
            </div>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#333333', textDecoration: 'underline', textUnderlineOffset: 3 }}>Ouvrir l'équipe</span>
          </div>
        )
      })}
      {ajout ? (
        <div style={{ ...S.carte, cursor: 'default', justifyContent: 'center' }}>
          <input autoFocus value={nom} onChange={e => setNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && creer()}
            placeholder="Nom de l'équipe..." style={S.input} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={creer} style={S.btnPrimary}>Créer</button>
            <button onClick={() => { setAjout(false); setNom('') }} style={S.btnSecondary}>Annuler</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAjout(true)} style={{ ...S.btnAdd, minHeight: 120 }}>+ Nouvelle équipe</button>
      )}
      <style>{`.club-carte:hover{border-color:#333333 !important}`}</style>
    </div>
  )
}

function Stat({ v, sur, l }) {
  return (
    <div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1a1a1a', lineHeight: 1 }}>
        {v ?? '–'}{sur != null && <span style={{ fontSize: '0.9rem', color: '#6b7280' }}> /{sur}</span>}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, marginTop: '0.25rem' }}>{l}</div>
    </div>
  )
}

function dateCourte(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

const S = {
  carte: { background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '1.25rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'border-color .15s' },
  eyebrow: { margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.12em' },
  puce: { fontSize: '0.72rem', fontWeight: 700, color: '#374151', background: '#f3f4f6', borderRadius: 999, padding: '0.15rem 0.55rem' },
  input: { padding: '0.6rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' },
  btnPrimary: { background: '#333', color: '#e4f816', border: 'none', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  btnAdd: { background: 'white', color: '#6b7280', border: '1.5px dashed #d1d5db', borderRadius: 14, padding: '0.65rem 1.25rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', width: '100%', textAlign: 'center', fontFamily: 'inherit' },
}
