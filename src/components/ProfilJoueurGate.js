import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'

// ── Onboarding profil joueur (date de naissance, taille, poids, postes) ──────
// Blocage dur (même esprit que WellnessGate) mais one-shot : une fois le
// profil complet, on ne redemande plus jamais (pas de reset quotidien).

const POSTES_RUGBY = [
  { num: 1, nom: 'Pilier' }, { num: 2, nom: 'Talonneur' }, { num: 3, nom: 'Pilier' },
  { num: 4, nom: '2e ligne' }, { num: 5, nom: '2e ligne' },
  { num: 6, nom: '3e ligne' }, { num: 7, nom: '3e ligne' }, { num: 8, nom: '3e ligne' },
  { num: 9, nom: 'Demi de mêlée' }, { num: 10, nom: "Demi d'ouverture" },
  { num: 11, nom: 'Ailier' }, { num: 12, nom: 'Centre' }, { num: 13, nom: 'Centre' },
  { num: 14, nom: 'Ailier' }, { num: 15, nom: 'Arrière' },
]

function ProfilOverlay({ clientId, prenom, nom, groupeIds, gjByGroupe, onDone }) {
  const [jj, setJj] = useState('')
  const [mm, setMm] = useState('')
  const [aaaa, setAaaa] = useState('')
  const [taille, setTaille] = useState('')
  const [poids, setPoids] = useState('')
  const [postes, setPostes] = useState([]) // numéros sélectionnés, ordre = priorité (1er = principal)
  const [saving, setSaving] = useState(false)
  const dateValide = jj.length > 0 && mm.length > 0 && aaaa.length === 4
    && Number(jj) >= 1 && Number(jj) <= 31 && Number(mm) >= 1 && Number(mm) <= 12
  const dateNaissance = dateValide ? `${aaaa}-${String(mm).padStart(2, '0')}-${String(jj).padStart(2, '0')}` : ''
  const allFilled = dateNaissance && taille && poids && postes.length > 0

  const mmRef = useRef(null)
  const aaaaRef = useRef(null)

  // Passe automatiquement au champ suivant dès que le nombre de chiffres
  // attendu est atteint (JJ → MM → AAAA), pour ne pas avoir à taper Tab/entrée.
  function numField(setter, max, nextRef) {
    return e => {
      const v = e.target.value.replace(/\D/g, '').slice(0, max)
      setter(v)
      if (v.length === max && nextRef?.current) nextRef.current.focus()
    }
  }

  function togglePoste(num) {
    setPostes(prev => {
      if (prev.includes(num)) return prev.filter(n => n !== num)
      if (prev.length >= 3) return prev
      return [...prev, num]
    })
  }

  async function submit() {
    if (!allFilled) return
    setSaving(true)
    await supabase.from('clients').update({ date_naissance: dateNaissance }).eq('id', clientId)
    await supabase.from('nutrition_profile')
      .upsert({ client_id: clientId, taille_cm: Number(taille), poids_kg: Number(poids) }, { onConflict: 'client_id' })
    // Postes : remplace la sélection dans chaque groupe dont le joueur est membre —
    // crée sa fiche effectif (groupe_joueurs) au passage si elle n'existe pas encore.
    for (const groupeId of groupeIds) {
      let gjId = gjByGroupe[groupeId]
      if (!gjId) {
        const { data: newGj } = await supabase.from('groupe_joueurs')
          .insert({ groupe_id: groupeId, client_id: clientId, prenom: prenom || '', nom: nom || '' })
          .select('id').maybeSingle()
        gjId = newGj?.id
      }
      if (!gjId) continue
      await supabase.from('joueur_postes').delete().eq('joueur_id', gjId)
      await supabase.from('joueur_postes').insert(
        postes.map((num, i) => ({ joueur_id: gjId, poste: num, rang: 99, is_primary: i === 0 }))
      )
    }
    setSaving(false)
    onDone()
  }

  return (
    <div style={S.overlay}>
      <div style={S.card}>
        <h2 style={S.title}>Ton profil</h2>
        <p style={S.intro}>Complète ces quelques informations.</p>

        <label style={S.label}>Date de naissance</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" inputMode="numeric" placeholder="JJ" value={jj} onChange={numField(setJj, 2, mmRef)} style={{ ...S.input, flex: 1, textAlign: 'center' }} />
          <input ref={mmRef} type="text" inputMode="numeric" placeholder="MM" value={mm} onChange={numField(setMm, 2, aaaaRef)} style={{ ...S.input, flex: 1, textAlign: 'center' }} />
          <input ref={aaaaRef} type="text" inputMode="numeric" placeholder="AAAA" value={aaaa} onChange={numField(setAaaa, 4, null)} style={{ ...S.input, flex: 1.6, textAlign: 'center' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={S.label}>Taille (cm)</label>
            <input type="number" inputMode="numeric" placeholder="ex : 180" value={taille} onChange={e => setTaille(e.target.value)} style={S.input} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={S.label}>Poids (kg)</label>
            <input type="number" inputMode="decimal" step="0.1" placeholder="ex : 82" value={poids} onChange={e => setPoids(e.target.value)} style={S.input} />
          </div>
        </div>

        <label style={S.label}>Poste(s) — jusqu'à 3, le 1ᵉʳ choisi est ton poste principal</label>
        <div style={S.posteGrid}>
          {POSTES_RUGBY.map(p => {
            const idx = postes.indexOf(p.num)
            const sel = idx !== -1
            return (
              <button key={p.num} type="button" onClick={() => togglePoste(p.num)}
                style={{ ...S.posteBtn, ...(sel ? S.posteBtnOn : {}) }}>
                <span style={S.posteNum}>{p.num}{sel && <span style={S.posteRang}>{idx === 0 ? '★' : idx + 1}</span>}</span>
                <span style={S.posteNom}>{p.nom}</span>
              </button>
            )
          })}
        </div>

        <button onClick={submit} disabled={!allFilled || saving}
          style={{ ...S.submitBtn, background: allFilled ? '#333333' : '#e5e7eb', color: allFilled ? 'var(--accent-fg-dark)' : '#9ca3af', cursor: allFilled ? 'pointer' : 'default' }}>
          {saving ? 'Envoi...' : 'Valider mon profil'}
        </button>
      </div>
    </div>
  )
}

export default function ProfilJoueurGate({ children }) {
  const [show, setShow] = useState(false)
  const [clientInfo, setClientInfo] = useState(null) // { id, prenom, nom }
  const [groupeIds, setGroupeIds] = useState([])
  const [gjByGroupe, setGjByGroupe] = useState({})

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      let { data: clientData } = await supabase
        .from('clients').select('id, prenom, nom, email, date_naissance').eq('user_id', session.user.id).maybeSingle()
      if (!clientData && session.user.email) {
        const res = await supabase.from('clients').select('id, prenom, nom, email, date_naissance').eq('email', session.user.email).maybeSingle()
        clientData = res.data
      }
      if (!clientData) return // pas un compte client (coach)

      // Ne concerne que les joueurs d'un groupe (rugby) — un client individuel
      // (coaching seul, pas de poste) n'a pas à renseigner un poste.
      const { data: membres } = await supabase.from('groupe_membres').select('groupe_id').eq('client_id', clientData.id)
      if (!membres?.length) return
      const gIds = membres.map(m => m.groupe_id)

      const [{ data: np }, { data: gj }] = await Promise.all([
        supabase.from('nutrition_profile').select('taille_cm, poids_kg').eq('client_id', clientData.id).maybeSingle(),
        supabase.from('groupe_joueurs').select('id, groupe_id').eq('client_id', clientData.id),
      ])

      const gjMap = Object.fromEntries((gj || []).map(g => [g.groupe_id, g.id]))
      const gjIds = Object.values(gjMap)
      let hasPostes = false
      if (gjIds.length > 0) {
        const { data: jp } = await supabase.from('joueur_postes').select('id').in('joueur_id', gjIds).limit(1)
        hasPostes = (jp?.length || 0) > 0
      }

      const complete = !!clientData.date_naissance && !!np?.taille_cm && !!np?.poids_kg && hasPostes
      if (complete) return

      setGroupeIds(gIds)
      setGjByGroupe(gjMap)
      setClientInfo(clientData)
      setShow(true)
    }
    check()
  }, [])

  return (
    <>
      {children}
      {show && clientInfo && createPortal(
        <ProfilOverlay clientId={clientInfo.id} prenom={clientInfo.prenom} nom={clientInfo.nom}
          groupeIds={groupeIds} gjByGroupe={gjByGroupe} onDone={() => setShow(false)} />,
        document.body
      )}
    </>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowX: 'hidden' },
  card: { background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', minWidth: 0, maxWidth: 400, maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' },
  subtitle: { fontSize: '0.68rem', fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.3rem' },
  title: { fontSize: '1.3rem', fontWeight: '800', color: '#333333', margin: '0 0 0.5rem' },
  intro: { fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5, margin: '0 0 1.1rem' },
  label: { display: 'block', fontSize: '0.72rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0.9rem 0 0.4rem' },
  input: { display: 'block', width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '0.65rem 0.8rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', color: '#1a1a1a', background: 'white' },
  posteGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 },
  posteBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 2px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontFamily: 'inherit' },
  posteBtnOn: { border: '1.5px solid #333333', background: '#1a1a1a', color: '#fff' },
  posteNum: { fontSize: '1rem', fontWeight: '900', color: 'inherit', position: 'relative' },
  posteRang: { position: 'absolute', top: -8, right: -12, fontSize: '0.55rem', color: '#e4f816' },
  posteNom: { fontSize: '0.52rem', fontWeight: '700', color: 'inherit', textAlign: 'center', lineHeight: 1.15 },
  submitBtn: { width: '100%', padding: '0.875rem', border: 'none', borderRadius: 12, fontSize: '0.95rem', fontWeight: '700', marginTop: '1.2rem' },
}
