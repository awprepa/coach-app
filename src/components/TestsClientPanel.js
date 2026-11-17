import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { isoLocal } from '../utils/dates'

// Onglet « Tests » de la fiche client : dernier résultat de chaque test,
// écart avec le précédent, courbe si plusieurs mesures, saisie d'un résultat.
const nombre = v => String(Math.round(parseFloat(v) * 10) / 10).replace('.', ',')
const dateCourte = d => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

function Courbe({ valeurs }) {
  const min = Math.min(...valeurs), max = Math.max(...valeurs)
  const y = v => max === min ? 14 : 24 - ((v - min) / (max - min)) * 20
  const x = i => 4 + (i * 192) / (valeurs.length - 1)
  const pts = valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const der = valeurs.length - 1
  return (
    <svg viewBox="0 0 200 28" style={{ width: '100%', height: 28 }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#333333" strokeWidth="2" />
      <circle cx={x(der)} cy={y(valeurs[der])} r="3.5" fill="#e4f816" stroke="#333333" strokeWidth="1.5" />
    </svg>
  )
}

export default function TestsClientPanel({ clientId, prenom }) {
  const [types, setTypes] = useState([])
  const [resultats, setResultats] = useState([])
  const [loading, setLoading] = useState(true)
  const [ajout, setAjout] = useState(false)
  const [form, setForm] = useState({ typeId: '', valeur: '', date: isoLocal() })
  const [saving, setSaving] = useState(false)

  async function charger() {
    const [{ data: t }, { data: r }] = await Promise.all([
      supabase.from('tests_types').select('*').order('created_at'),
      supabase.from('tests_resultats').select('*').eq('client_id', clientId).order('date', { ascending: true }),
    ])
    setTypes(t || [])
    setResultats(r || [])
    setLoading(false)
  }
  useEffect(() => { charger() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enregistrer() {
    const v = parseFloat(String(form.valeur).replace(',', '.'))
    if (!form.typeId || isNaN(v) || !form.date) return
    setSaving(true)
    const { error } = await supabase.from('tests_resultats')
      .insert({ client_id: clientId, test_type_id: form.typeId, valeur: v, date: form.date })
    setSaving(false)
    if (error) { alert(error.message); return }
    setAjout(false)
    setForm({ typeId: '', valeur: '', date: isoLocal() })
    charger()
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce résultat ?')) return
    await supabase.from('tests_resultats').delete().eq('id', id)
    charger()
  }

  const parType = types
    .map(t => ({ ...t, mesures: resultats.filter(r => r.test_type_id === t.id) }))
    .filter(t => t.mesures.length > 0)

  return (
    <div style={S.card}>
      <div style={S.tete}>
        <span style={S.titre}>Tests{prenom ? ` de ${prenom}` : ''}</span>
        <button onClick={() => setAjout(a => !a)} style={S.btn}>{ajout ? 'Fermer' : '+ Saisir un résultat'}</button>
      </div>

      {ajout && (
        <div style={S.form}>
          <select value={form.typeId} onChange={e => setForm(f => ({ ...f, typeId: e.target.value }))} style={S.input}>
            <option value="">Choisir un test</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.nom}{t.unite ? ` (${t.unite})` : ''}</option>)}
          </select>
          <input value={form.valeur} onChange={e => setForm(f => ({ ...f, valeur: e.target.value }))} placeholder="Résultat" inputMode="decimal" style={{ ...S.input, width: 120 }} />
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...S.input, width: 160 }} />
          <button onClick={enregistrer} disabled={saving} style={S.btn}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      )}

      {loading ? <p style={S.vide}>Chargement…</p>
        : parType.length === 0 ? <p style={S.vide}>Aucun test pour l'instant. Saisis un résultat, ou demande un max depuis l'onglet Entraînement.</p>
        : (
          <div style={S.grille}>
            {parType.map(t => {
              const m = t.mesures
              const der = m[m.length - 1]
              const prec = m.length > 1 ? m[m.length - 2] : null
              const ecart = prec ? parseFloat(der.valeur) - parseFloat(prec.valeur) : null
              return (
                <div key={t.id} style={S.test}>
                  <span style={S.nom}>{t.nom}</span>
                  <span style={S.val}>{nombre(der.valeur)}<small style={S.unite}>{t.unite || ''}</small></span>
                  <span style={S.date}>{dateCourte(der.date)}{der.rpe != null ? ` · RPE ${nombre(der.rpe)}` : ''}</span>
                  {ecart === null ? <span style={{ ...S.pill, ...S.pillGris }}>Premier test</span>
                    : <span style={{ ...S.pill, ...(ecart > 0 ? S.pillVert : ecart < 0 ? S.pillRouge : S.pillGris) }}>
                        {ecart > 0 ? '+' : ''}{nombre(ecart)} {t.unite || ''} depuis le {dateCourte(prec.date)}
                      </span>}
                  {m.length > 1 && <Courbe valeurs={m.map(x => parseFloat(x.valeur))} />}
                  <details style={S.histo}>
                    <summary style={S.summary}>Historique ({m.length})</summary>
                    {[...m].reverse().map(x => (
                      <div key={x.id} style={S.ligne}>
                        <span>{dateCourte(x.date)}</span>
                        <span style={{ fontWeight: 700 }}>{nombre(x.valeur)} {t.unite || ''}</span>
                        {x.rpe != null && <span style={{ color: '#6b7280' }}>RPE {nombre(x.rpe)}</span>}
                        <button onClick={() => supprimer(x.id)} style={S.suppr} aria-label="Supprimer ce résultat">Supprimer</button>
                      </div>
                    ))}
                  </details>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

const S = {
  card: { background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: '1rem', marginTop: '1rem' },
  tete: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: '1rem' },
  titre: { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' },
  btn: { background: '#333333', color: 'white', border: 'none', borderRadius: 10, padding: '0 16px', minHeight: 44, fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', padding: 12, background: '#f9fafb', borderRadius: 12 },
  input: { minHeight: 44, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0 12px', fontSize: '0.88rem', background: 'white' },
  vide: { color: '#6b7280', fontSize: '0.85rem', margin: 0 },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  test: { border: '1px solid #f0f0f0', background: '#fafafa', borderRadius: 12, padding: 16, display: 'grid', gap: 6, alignContent: 'start' },
  nom: { fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' },
  val: { fontSize: '1.75rem', fontWeight: 800, color: '#1a1a1a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' },
  unite: { fontSize: '0.88rem', fontWeight: 700, color: '#6b7280', marginLeft: 3 },
  date: { fontSize: '0.75rem', color: '#6b7280' },
  pill: { justifySelf: 'start', fontSize: '0.75rem', fontWeight: 700, borderRadius: 6, padding: '2px 8px' },
  pillVert: { background: '#dcfce7', color: '#15803d' },
  pillRouge: { background: '#fee2e2', color: '#991b1b' },
  pillGris: { background: '#eceef0', color: '#6b7280' },
  histo: { borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 4 },
  summary: { fontSize: '0.75rem', fontWeight: 700, color: '#374151', cursor: 'pointer' },
  ligne: { display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', color: '#374151', padding: '6px 0' },
  suppr: { marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', padding: '4px 0' },
}
