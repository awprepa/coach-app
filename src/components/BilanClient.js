import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'

// ── Bilan client (coach uniquement) ──────────────────────────────────────────
// Semaine par semaine : journal automatique des modifications du suivi
// (alimenté par des déclencheurs Supabase) + note libre du coach.
// Tables strictement réservées au coach (RLS) : jamais visibles de l'athlète.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const CATEGORIES = { programme: 'Programme', exercice: 'Exercice', volume: 'Volume', charge: 'Charge', nutrition: 'Nutrition' }
const PAR_PAGE = 4

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dateDe(iso) { const [y, m, j] = iso.split('-').map(Number); return new Date(y, m - 1, j) }
function lundiDe(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7))
  return isoLocal(r)
}
function libelleSemaine(lundiIso) {
  const a = dateDe(lundiIso), b = dateDe(lundiIso)
  b.setDate(b.getDate() + 6)
  const m1 = a.getMonth() === b.getMonth() ? '' : ' ' + MOIS[a.getMonth()]
  return `${a.getDate()}${m1} au ${b.getDate()} ${MOIS[b.getMonth()]}`
}

export default function BilanClient({ clientId }) {
  const [modifs, setModifs] = useState([])
  const [notes, setNotes] = useState({})     // lundi -> texte
  const [ouvertes, setOuvertes] = useState({}) // lundi -> bool
  const [visibles, setVisibles] = useState(PAR_PAGE)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const lundiCourant = useMemo(() => lundiDe(new Date()), [])

  useEffect(() => {
    let annule = false
    setChargement(true); setErreur('')
    Promise.all([
      supabase.from('client_modifications').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(2000),
      supabase.from('client_bilan_notes').select('semaine, note').eq('client_id', clientId),
    ]).then(([m, n]) => {
      if (annule) return
      if (m.error || n.error) setErreur((m.error || n.error).message)
      setModifs(m.data || [])
      const map = {}
      ;(n.data || []).forEach(r => { map[r.semaine] = r.note })
      setNotes(map)
      setOuvertes({ [lundiCourant]: true })
      setVisibles(PAR_PAGE)
      setChargement(false)
    })
    return () => { annule = true }
  }, [clientId, lundiCourant])

  // semaine (lundi) -> modifications, plus la semaine en cours et celles qui ont une note
  const semaines = useMemo(() => {
    const parSemaine = {}
    modifs.forEach(m => { (parSemaine[lundiDe(new Date(m.created_at))] ||= []).push(m) })
    const cles = new Set([...Object.keys(parSemaine), ...Object.keys(notes).filter(k => notes[k]), lundiCourant])
    return [...cles].sort().reverse().map(k => ({ lundi: k, modifs: parSemaine[k] || [] }))
  }, [modifs, notes, lundiCourant])

  async function sauverNote(lundi, texte) {
    const { error } = await supabase.from('client_bilan_notes')
      .upsert({ client_id: clientId, semaine: lundi, note: texte, updated_at: new Date().toISOString() }, { onConflict: 'client_id,semaine' })
    return !error
  }

  if (chargement) return <p style={S.vide}>Chargement…</p>
  if (erreur) return <p style={{ ...S.vide, color: '#b42318' }}>Impossible de charger le bilan : {erreur}</p>

  return (
    <div style={{ marginTop: '1rem' }}>
      <p style={S.intro}>
        Les modifications du suivi sont enregistrées automatiquement à partir de maintenant. Les notes sont visibles par toi seul.
      </p>
      {semaines.slice(0, visibles).map(w => (
        <Semaine key={w.lundi} w={w} courante={w.lundi === lundiCourant}
          ouverte={!!ouvertes[w.lundi]} onToggle={() => setOuvertes(o => ({ ...o, [w.lundi]: !o[w.lundi] }))}
          noteInitiale={notes[w.lundi] || ''}
          onSave={async t => { const ok = await sauverNote(w.lundi, t); if (ok) setNotes(n => ({ ...n, [w.lundi]: t })); return ok }} />
      ))}
      {visibles < semaines.length && (
        <button onClick={() => setVisibles(v => v + PAR_PAGE)} style={S.plus}>Semaines plus anciennes ({semaines.length - visibles})</button>
      )}
    </div>
  )
}

function Semaine({ w, courante, ouverte, onToggle, noteInitiale, onSave }) {
  const [texte, setTexte] = useState(noteInitiale)
  const [etat, setEtat] = useState('ok') // ok | modifie | erreur
  const dernier = useRef(noteInitiale)

  // regroupe par jour
  const jours = useMemo(() => {
    const m = {}
    w.modifs.forEach(x => { (m[isoLocal(new Date(x.created_at))] ||= []).push(x) })
    return Object.keys(m).sort().reverse().map(j => ({ jour: j, items: m[j] }))
  }, [w.modifs])

  async function blur() {
    if (texte === dernier.current) return
    const ok = await onSave(texte)
    if (ok) { dernier.current = texte; setEtat('ok') } else setEtat('erreur')
  }

  const resume = [
    w.modifs.length ? `${w.modifs.length} modification${w.modifs.length > 1 ? 's' : ''}` : null,
    noteInitiale ? 'note' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={S.carte}>
      <button onClick={onToggle} aria-expanded={ouverte} style={S.entete}>
        <div style={{ textAlign: 'left' }}>
          <div style={S.titre}>Semaine du {libelleSemaine(w.lundi)}{courante ? ' (en cours)' : ''}</div>
          {!ouverte && <div style={S.resume}>{resume || 'Rien de noté'}</div>}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: 'auto', flexShrink: 0, transition: 'transform .15s', transform: ouverte ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {ouverte && (
        <div style={{ padding: '0 1rem 1rem' }}>
          <div style={S.label}>Note de la semaine</div>
          <textarea
            value={texte}
            onChange={e => { setTexte(e.target.value); setEtat('modifie') }}
            onBlur={blur}
            placeholder="Ce qu'on a fait, ce que j'ai observé, ce que je prévois ensuite…"
            rows={3}
            style={S.zone}
          />
          <div style={{ ...S.resume, color: etat === 'erreur' ? '#b42318' : '#9ca3af', marginTop: 4 }}>
            {etat === 'modifie' ? 'Non enregistrée — quitte le champ pour enregistrer' : etat === 'erreur' ? 'Enregistrement impossible' : texte ? 'Enregistrée' : ''}
          </div>

          <div style={{ ...S.label, marginTop: 14 }}>Modifications du suivi</div>
          {jours.length === 0 && <p style={S.vide}>Aucune modification enregistrée cette semaine.</p>}
          {jours.map(j => {
            const d = dateDe(j.jour)
            return (
              <div key={j.jour} style={{ marginBottom: 10 }}>
                <div style={S.jour}>{JOURS[d.getDay()]} {d.getDate()} {MOIS[d.getMonth()]}</div>
                {j.items.map(m => <Ligne key={m.id} m={m} />)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Ligne({ m }) {
  const simple = m.avant == null && m.apres == null
  const detail = m.champ === 'Ajouté' ? `Ajouté${m.apres ? ' · ' + m.apres : ''}`
    : simple ? m.champ
    : `${m.champ} : ${m.avant ?? '—'} → ${m.apres ?? '—'}`
  return (
    <div style={S.ligne}>
      <span style={S.cat}>{CATEGORIES[m.categorie] || m.categorie}</span>
      <span style={{ minWidth: 0 }}>
        <b style={{ fontWeight: 700 }}>{m.libelle}</b>
        <span style={{ color: '#4b5563' }}> — {detail}</span>
      </span>
    </div>
  )
}

const S = {
  intro: { fontSize: '0.78rem', color: '#6b7280', margin: '0 0 0.75rem' },
  vide: { fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', margin: '4px 0' },
  carte: { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '0.75rem', overflow: 'hidden' },
  entete: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '0.9rem 1rem', cursor: 'pointer' },
  titre: { fontSize: '0.9rem', fontWeight: 800, color: '#1a1a1a' },
  resume: { fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 },
  label: { fontSize: '0.68rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' },
  zone: { width: '100%', boxSizing: 'border-box', padding: '0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', lineHeight: 1.6, outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: '#333' },
  jour: { fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', margin: '0 0 4px' },
  ligne: { display: 'flex', gap: 8, alignItems: 'baseline', fontSize: '0.82rem', padding: '4px 0', borderTop: '1px solid #f3f4f6', color: '#1a1a1a' },
  cat: { flexShrink: 0, minWidth: 74, fontSize: '0.64rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  plus: { width: '100%', padding: '0.7rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
}
