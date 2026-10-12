import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'

// ── Bilan client (coach uniquement) ──────────────────────────────────────────
// Semaine par semaine : journal automatique des modifications du suivi
// (alimenté par des déclencheurs Supabase) + note libre du coach.
// Tables strictement réservées au coach (RLS) : jamais visibles de l'athlète.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const CATEGORIES = { programme: 'Programme', exercice: 'Exercice', volume: 'Volume', charge: 'Charge', nutrition: 'Nutrition' }
const PAR_PAGE = 40

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
  const [notes, setNotes] = useState({})     // lundi -> { note, updated_at }
  const [edition, setEdition] = useState(null) // lundi de la note en cours d'édition
  const [visibles, setVisibles] = useState(PAR_PAGE)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const lundiCourant = useMemo(() => lundiDe(new Date()), [])

  useEffect(() => {
    let annule = false
    setChargement(true); setErreur('')
    Promise.all([
      supabase.from('client_modifications').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(2000),
      supabase.from('client_bilan_notes').select('semaine, note, updated_at').eq('client_id', clientId),
    ]).then(([m, n]) => {
      if (annule) return
      if (m.error || n.error) setErreur((m.error || n.error).message)
      setModifs(m.data || [])
      const map = {}
      ;(n.data || []).forEach(r => { map[r.semaine] = r })
      setNotes(map)
      setVisibles(PAR_PAGE)
      setChargement(false)
    })
    return () => { annule = true }
  }, [clientId])

  // Une seule liste : modifications + notes de semaine, du plus récent au plus ancien.
  const lignes = useMemo(() => {
    const l = modifs.map(m => ({ type: 'modif', date: m.created_at, m }))
    Object.entries(notes).forEach(([lundi, r]) => {
      if (r.note || edition === lundi) l.push({ type: 'note', date: r.updated_at, lundi })
    })
    if (edition && !notes[edition]) l.push({ type: 'note', date: new Date().toISOString(), lundi: edition })
    return l.sort((a, b) => b.date.localeCompare(a.date))
  }, [modifs, notes, edition])

  async function sauverNote(lundi, texte) {
    const maintenant = new Date().toISOString()
    const { error } = await supabase.from('client_bilan_notes')
      .upsert({ client_id: clientId, semaine: lundi, note: texte, updated_at: maintenant }, { onConflict: 'client_id,semaine' })
    if (error) return false
    setNotes(n => ({ ...n, [lundi]: { semaine: lundi, note: texte, updated_at: maintenant } }))
    return true
  }

  if (chargement) return <p style={S.vide}>Chargement…</p>
  if (erreur) return <p style={{ ...S.vide, color: '#b42318' }}>Impossible de charger le bilan : {erreur}</p>

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.75rem' }}>
        <p style={{ ...S.intro, margin: 0, flex: 1 }}>
          Modifications du suivi enregistrées automatiquement, des plus récentes aux plus anciennes. Visible par toi seul.
        </p>
        <button onClick={() => setEdition(lundiCourant)} style={S.btnNote}>Note de la semaine</button>
      </div>
      <div style={S.carte}>
        {lignes.length === 0 && <p style={{ ...S.vide, padding: '1rem' }}>Aucune modification enregistrée pour l'instant.</p>}
        {lignes.slice(0, visibles).map(l => l.type === 'modif'
          ? <Ligne key={l.m.id} m={l.m} />
          : <LigneNote key={'n' + l.lundi} lundi={l.lundi} date={l.date} texte={notes[l.lundi]?.note || ''}
              edition={edition === l.lundi} onEdit={() => setEdition(l.lundi)} onClose={() => setEdition(null)} onSave={t => sauverNote(l.lundi, t)} />
        )}
      </div>
      {visibles < lignes.length && (
        <button onClick={() => setVisibles(v => v + PAR_PAGE)} style={S.plus}>Voir plus ({lignes.length - visibles})</button>
      )}
    </div>
  )
}

function quand(iso) {
  const d = new Date(iso)
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS_COURT[d.getMonth()]} ${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + ' ' : ''}· ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Ligne({ m }) {
  const simple = m.avant == null && m.apres == null
  const detail = m.champ === 'Ajouté' ? `Ajouté${m.apres ? ' · ' + m.apres : ''}`
    : simple ? m.champ
    : `${m.champ} : ${m.avant ?? '—'} → ${m.apres ?? '—'}`
  return (
    <div style={S.ligne}>
      <span style={S.date}>{quand(m.created_at)}</span>
      <span style={S.cat}>{CATEGORIES[m.categorie] || m.categorie}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ fontWeight: 700 }}>{m.libelle}</b>
        <span style={{ color: '#4b5563' }}> — {detail}</span>
      </span>
    </div>
  )
}

function LigneNote({ lundi, date, texte, edition, onEdit, onClose, onSave }) {
  const [valeur, setValeur] = useState(texte)
  const [erreur, setErreur] = useState(false)
  const ref = useRef(null)
  useEffect(() => { if (edition) ref.current?.focus() }, [edition])

  async function fermer() {
    if (valeur !== texte) {
      const ok = await onSave(valeur)
      if (!ok) { setErreur(true); return }
    }
    setErreur(false)
    onClose()
  }

  return (
    <div style={{ ...S.ligne, background: '#f9fafb', alignItems: 'flex-start' }}>
      <span style={S.date}>{quand(date)}</span>
      <span style={S.cat}>Note</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: 3 }}>Semaine du {libelleSemaine(lundi)}</div>
        {edition ? (
          <>
            <textarea ref={ref} value={valeur} onChange={e => setValeur(e.target.value)} onBlur={fermer} rows={3}
              placeholder="Ce qu'on a fait, ce que j'ai observé, ce que je prévois ensuite…" style={S.zone} />
            {erreur && <div style={{ fontSize: '0.7rem', color: '#b42318', marginTop: 3 }}>Enregistrement impossible</div>}
          </>
        ) : (
          <div onClick={onEdit} style={{ whiteSpace: 'pre-wrap', cursor: 'text', lineHeight: 1.5 }}>{texte}</div>
        )}
      </span>
    </div>
  )
}

const S = {
  intro: { fontSize: '0.78rem', color: '#6b7280', margin: '0 0 0.75rem' },
  vide: { fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', margin: '4px 0' },
  carte: { background: 'white', borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '0.75rem', overflow: 'hidden' },
  btnNote: { flexShrink: 0, background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' },
  date: { flexShrink: 0, width: 128, fontSize: '0.72rem', color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
  zone: { width: '100%', boxSizing: 'border-box', padding: '0.7rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.88rem', lineHeight: 1.6, outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: '#333' },
  ligne: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: '0.82rem', padding: '8px 14px', borderTop: '1px solid #f3f4f6', color: '#1a1a1a' },
  cat: { flexShrink: 0, width: 72, fontSize: '0.64rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  plus: { width: '100%', padding: '0.7rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
}
