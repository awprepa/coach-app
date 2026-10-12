import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import CalculateurIntensite from '../../components/CalculateurIntensite'
import { isLight } from './couleurs'

/* ── Groupes de niveau (VMI/VMA) ── */
export function GroupesNiveauView({ groupeId, groupColor }) {
  const [joueurs, setJoueurs] = useState([])   // groupe_joueurs + joueur_tests_physiques
  const [niveaux, setNiveaux] = useState([])   // groupes_niveau + groupes_niveau_membres
  const [creating, setCreating] = useState(false)
  const [newNom, setNewNom] = useState('')
  const [newCritere, setNewCritere] = useState('vmi')
  const [pickerNiveau, setPickerNiveau] = useState(null) // niveau en édition d'effectif
  const [editingRef, setEditingRef] = useState(null)     // niveau_id en cours d'édition manuelle
  const [refInput, setRefInput] = useState('')
  const [showCalculateur, setShowCalculateur] = useState(false)

  const COULEURS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2']
  const inputStyle = { width:'100%', border:'1.5px solid #e5e7eb', borderRadius:9, padding:'8px 11px', fontSize:'0.8rem', color:'#1f2937', outline:'none', marginBottom:7, fontFamily:'inherit' }

  useEffect(() => { if (groupeId) fetchAll() }, [groupeId])

  async function fetchAll() {
    if (!groupeId) return
    const [{ data: jData }, { data: nData }] = await Promise.all([
      supabase.from('groupe_joueurs').select('*, joueur_tests_physiques(*)').eq('groupe_id', groupeId),
      supabase.from('groupes_niveau').select('*, groupes_niveau_membres(joueur_id)').eq('groupe_id', groupeId).order('ordre'),
    ])
    setJoueurs(jData || [])
    setNiveaux(nData || [])
  }

  function dernierTest(joueurId, critere) {
    const j = joueurs.find(x => x.id === joueurId)
    const tests = (j?.joueur_tests_physiques || []).filter(t => t.type === critere).sort((a, b) => b.date.localeCompare(a.date))
    return tests[0]?.valeur ?? null
  }

  function membresDe(niveau) {
    return (niveau.groupes_niveau_membres || []).map(m => m.joueur_id)
  }

  function calculerMoyenne(niveau) {
    const ids = membresDe(niveau)
    const vals = ids.map(id => dernierTest(id, niveau.critere)).filter(v => v != null).map(Number)
    if (!vals.length) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }

  async function creerNiveau() {
    if (!newNom.trim()) return
    const { data, error } = await supabase.from('groupes_niveau').insert({
      groupe_id: groupeId, nom: newNom.trim(), critere: newCritere,
      couleur: COULEURS[niveaux.length % COULEURS.length], ordre: niveaux.length,
    }).select('*, groupes_niveau_membres(joueur_id)').single()
    if (error) { alert(error.message); return }
    setNiveaux(prev => [...prev, data])
    setNewNom(''); setCreating(false)
  }

  async function supprimerNiveau(id) {
    if (!window.confirm('Supprimer ce groupe de niveau ?')) return
    await supabase.from('groupes_niveau').delete().eq('id', id)
    setNiveaux(prev => prev.filter(n => n.id !== id))
  }

  async function toggleMembre(niveau, joueurId) {
    const membres = membresDe(niveau)
    const present = membres.includes(joueurId)
    if (present) {
      await supabase.from('groupes_niveau_membres').delete().eq('niveau_id', niveau.id).eq('joueur_id', joueurId)
    } else {
      await supabase.from('groupes_niveau_membres').insert({ niveau_id: niveau.id, joueur_id: joueurId })
    }
    const nouveauxMembres = present ? membres.filter(id => id !== joueurId) : [...membres, joueurId]
    const nouveauNiveau = { ...niveau, groupes_niveau_membres: nouveauxMembres.map(joueur_id => ({ joueur_id })) }
    // Recalcul auto de la valeur de référence si pas ajustée manuellement
    if (niveau.valeur_ref_auto) {
      const ids = nouveauxMembres
      const vals = ids.map(id => dernierTest(id, niveau.critere)).filter(v => v != null).map(Number)
      const moy = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
      nouveauNiveau.valeur_ref = moy
      await supabase.from('groupes_niveau').update({ valeur_ref: moy }).eq('id', niveau.id)
    }
    setNiveaux(prev => prev.map(n => n.id === niveau.id ? nouveauNiveau : n))
    setPickerNiveau(nouveauNiveau)
  }

  async function enregistrerRefManuelle(niveau) {
    const valeur = parseFloat(refInput)
    if (!valeur) return
    await supabase.from('groupes_niveau').update({ valeur_ref: valeur, valeur_ref_auto: false }).eq('id', niveau.id)
    setNiveaux(prev => prev.map(n => n.id === niveau.id ? { ...n, valeur_ref: valeur, valeur_ref_auto: false } : n))
    setEditingRef(null)
  }

  async function reactiverAuto(niveau) {
    const moy = calculerMoyenne(niveau)
    await supabase.from('groupes_niveau').update({ valeur_ref: moy, valeur_ref_auto: true }).eq('id', niveau.id)
    setNiveaux(prev => prev.map(n => n.id === niveau.id ? { ...n, valeur_ref: moy, valeur_ref_auto: true } : n))
  }

  return (
    <div>
      {niveaux.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button onClick={() => setShowCalculateur(true)}
            style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: groupColor, color: isLight(groupColor) ? '#1a1a1a' : '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer' }}>
            Calculateur d'intensité
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        {niveaux.map(niveau => {
          const membres = membresDe(niveau)
          return (
            <div key={niveau.id} style={{ width: 230, background: '#fff', borderRadius: 14, padding: 14, border: `1.5px solid ${niveau.couleur}33`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: niveau.couleur, flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1f2937' }}>{niveau.nom}</span>
                </div>
                <button onClick={() => supprimerNiveau(niveau.id)} style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {niveau.critere.toUpperCase()} de référence
              </div>
              {editingRef === niveau.id ? (
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input type="number" step="0.1" autoFocus value={refInput} onChange={e => setRefInput(e.target.value)}
                    style={{ ...inputStyle, marginBottom: 0, flex: 1, padding: '6px 8px' }} />
                  <button onClick={() => enregistrerRefManuelle(niveau)} style={{ padding: '0 10px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>OK</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#1f2937' }}>
                    {niveau.valeur_ref != null ? `${niveau.valeur_ref}` : '—'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>km/h</span>
                  <button onClick={() => { setEditingRef(niveau.id); setRefInput(niveau.valeur_ref || '') }}
                    style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', marginLeft: 'auto' }}>
                    ✎ ajuster
                  </button>
                </div>
              )}
              {!niveau.valeur_ref_auto && (
                <button onClick={() => reactiverAuto(niveau)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.65rem', cursor: 'pointer', padding: 0, marginBottom: 8, textDecoration: 'underline' }}>
                  ajusté à la main · recalculer auto
                </button>
              )}
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {membres.length} joueur{membres.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {membres.slice(0, 6).map(id => {
                  const j = joueurs.find(x => x.id === id)
                  return j ? <span key={id} style={{ fontSize: '0.68rem', background: '#f3f4f6', borderRadius: 6, padding: '2px 6px', color: '#374151' }}>{j.prenom}</span> : null
                })}
                {membres.length > 6 && <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>+{membres.length - 6}</span>}
              </div>
              <button onClick={() => setPickerNiveau(niveau)}
                style={{ width: '100%', padding: '6px', borderRadius: 8, border: '1.5px dashed #d1d5db', background: 'none', color: '#6b7280', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                Gérer les joueurs
              </button>
            </div>
          )
        })}

        {/* Carte création */}
        <div style={{ width: 230, background: '#f9fafb', borderRadius: 14, padding: 14, border: '1.5px dashed #d1d5db' }}>
          {creating ? (
            <>
              <input placeholder="Nom (ex: G3)" aria-label="Nom (ex: G3)" value={newNom} onChange={e => setNewNom(e.target.value)}
                style={{ ...inputStyle, marginBottom: 8 }} autoFocus />
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {['vmi', 'vma'].map(c => (
                  <button key={c} onClick={() => setNewCritere(c)}
                    style={{ flex: 1, padding: '6px', borderRadius: 8, border: `1.5px solid ${newCritere === c ? groupColor : '#e5e7eb'}`,
                      background: newCritere === c ? groupColor : '#fff', color: newCritere === c ? '#fff' : '#6b7280',
                      fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}>
                    {c.toUpperCase()}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setCreating(false)} style={{ flex: 1, padding: 7, borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', color: '#6b7280', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>Annuler</button>
                <button onClick={creerNiveau} style={{ flex: 1, padding: 7, borderRadius: 8, border: 'none', background: groupColor, color: isLight(groupColor) ? '#1a1a1a' : '#fff', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>Créer</button>
              </div>
            </>
          ) : (
            <button onClick={() => setCreating(true)}
              style={{ width: '100%', height: '100%', minHeight: 90, background: 'none', border: 'none', color: '#6b7280', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}>
              ＋ Nouveau groupe de niveau
            </button>
          )}
        </div>
      </div>

      {/* Panel de gestion des joueurs d'un niveau */}
      {pickerNiveau && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}
          onClick={e => { if (e.target === e.currentTarget) setPickerNiveau(null) }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 460, padding: '18px 18px 36px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ width: 32, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#1f2937', marginBottom: 2 }}>{pickerNiveau.nom}</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 14 }}>Tape un joueur pour l'ajouter/retirer</div>
            {joueurs.slice().sort((a, b) => a.nom.localeCompare(b.nom)).map(j => {
              const dans = membresDe(pickerNiveau).includes(j.id)
              const val = dernierTest(j.id, pickerNiveau.critere)
              return (
                <div key={j.id} onClick={() => toggleMembre(pickerNiveau, j.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 10px', borderRadius: 10,
                    background: dans ? '#eef2ff' : 'transparent', cursor: 'pointer', marginBottom: 2 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: dans ? 800 : 600, color: dans ? '#4338ca' : '#374151' }}>
                    {j.prenom} {j.nom}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                    {val != null ? `${val} km/h` : '—'} {dans && '✓'}
                  </span>
                </div>
              )
            })}
            <button onClick={() => setPickerNiveau(null)}
              style={{ width: '100%', padding: '11px', background: groupColor, color: isLight(groupColor) ? '#1a1a1a' : '#fff',
                border: 'none', borderRadius: 11, fontSize: '0.86rem', fontWeight: 900, cursor: 'pointer', marginTop: 12, fontFamily: 'inherit' }}>
              Terminé
            </button>
          </div>
        </div>
      )}

      {niveaux.length === 0 && !creating && (
        <div style={{ fontSize: '0.82rem', color: '#6b7280', padding: '1.5rem 0' }}>
          Aucun groupe de niveau. Crée-en un pour regrouper des joueurs par VMI/VMA sur un exercice.
        </div>
      )}

      {showCalculateur && (
        <CalculateurIntensite niveaux={niveaux} groupColor={groupColor} onClose={() => setShowCalculateur(false)} />
      )}
    </div>
  )
}
