import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'

// ─── Parsers ─────────────────────────────────────────────────────────────────

function parseSeries(val) {
  if (!val || val === '-') return null
  const s = String(val).trim()
  const progMatch = s.match(/\+(\d+)/)
  if (progMatch) return parseInt(progMatch[1])
  const num = parseInt(s)
  return isNaN(num) ? null : num
}

function parseExcelForClient(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const programmes = []

        wb.SheetNames.forEach(sheetName => {
          const sheet = wb.Sheets[sheetName]
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

          let colMap = null
          let currentSession = null
          const sessions = []

          // Detect semaines from a "Poids SXX" style header
          let semaines = 6
          const allCells = Object.values(sheet).filter(c => c.v)
          allCells.forEach(c => {
            const m = String(c.v).match(/poids\s*s(\d+)/i)
            if (m) semaines = Math.max(semaines, parseInt(m[1]))
          })

          for (let i = 0; i < rows.length; i++) {
            const raw = rows[i]
            const row = raw.map(c => String(c ?? '').trim())

            // Detect header row : contains "Exercice" AND (Série or Reps)
            const exIdx = row.findIndex(c => /exercice/i.test(c))
            if (exIdx >= 0 && row.some(c => /s[eé]rie/i.test(c) || /^reps?$/i.test(c))) {
              colMap = {
                code:   Math.max(0, exIdx - 1),
                nom:    exIdx,
                series: row.findIndex(c => /s[eé]rie/i.test(c)),
                reps:   row.findIndex(c => /^reps?$/i.test(c)),
                recup:  row.findIndex(c => /r[eé]cup/i.test(c)),
                tempo:  row.findIndex(c => /tempo/i.test(c)),
                charge: row.findIndex(c => /^charge$/i.test(c)),
                intensite: row.findIndex(c => /intensit[eé]/i.test(c)),
                poids: [],
              }
              row.forEach((c, idx) => {
                if (/poids\s*s?\d+/i.test(c)) colMap.poids.push({ idx, sem: colMap.poids.length + 1 })
              })

              // Session name: look back up to 4 rows, keep furthest valid title
              let sessionName = sheetName
              for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
                const titleCells = rows[j].map(c => String(c ?? '').trim()).filter(Boolean)
                if (titleCells.length >= 1 && titleCells.length <= 4) {
                  sessionName = titleCells[0]
                }
              }

              currentSession = { nom: sessionName, exercices: [] }
              sessions.push(currentSession)
              continue
            }

            // Exercise row: code matches A1, B2...
            if (currentSession && colMap) {
              const code = row[colMap.code]
              const nom  = row[colMap.nom]
              if (code && /^[A-Za-z]\d+$/.test(code) && nom && nom !== '-') {
                const chargeVal = colMap.charge >= 0 ? row[colMap.charge] : ''
                const intensiteVal = colMap.intensite >= 0 ? row[colMap.intensite] : ''
                const typeInt  = intensiteVal && intensiteVal !== '-' ? intensiteVal
                               : chargeVal  && chargeVal  !== '-' ? 'Libre' : ''
                const valInt   = typeInt === 'Libre' ? chargeVal : ''
                const ex = {
                  code,
                  nom,
                  series:           String(row[colMap.series] || ''),
                  repetitions:      row[colMap.reps] !== undefined ? String(row[colMap.reps] || '') : '',
                  recuperation:     colMap.recup  >= 0 ? String(row[colMap.recup]  || '') : '',
                  tempo:            colMap.tempo  >= 0 ? String(row[colMap.tempo]  || '') : '',
                  type_intensite:   typeInt,
                  valeur_intensite: valInt,
                  poids: colMap.poids.map(p => ({ sem: p.sem, valeur: row[p.idx] })),
                }
                currentSession.exercices.push(ex)
              }
            }
          }

          if (sessions.length > 0) {
            programmes.push({ sheetName, nom: sheetName, semaines, sessions })
          }
        })

        resolve(programmes)
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImportClientExcel() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()

  const fileRef   = useRef(null)
  const [step, setStep]         = useState('upload')   // upload | preview | importing | done
  const [programmes, setProgs]  = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError]       = useState('')
  const [progress, setProgress] = useState('')

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      const parsed = await parseExcelForClient(file)
      if (parsed.length === 0) {
        setError("Aucun programme détecté. Vérifie que ton fichier contient des feuilles avec une ligne d'en-tête « Exercice / Séries / Reps ».")
        return
      }
      setProgs(parsed)
      setSelected(new Set(parsed.map((_, i) => i)))
      setStep('preview')
    } catch {
      setError('Erreur lors de la lecture du fichier Excel.')
    }
  }

  function updateNom(i, val) {
    setProgs(prev => prev.map((p, j) => j === i ? { ...p, nom: val } : p))
  }
  function updateSemaines(i, val) {
    setProgs(prev => prev.map((p, j) => j === i ? { ...p, semaines: parseInt(val) || 6 } : p))
  }

  async function importer() {
    setStep('importing')
    const toImport = programmes.filter((_, i) => selected.has(i))
    let totalSeances = 0, totalEx = 0

    for (let pi = 0; pi < toImport.length; pi++) {
      const prog = toImport[pi]
      setProgress(`Création du programme « ${prog.nom} »… (${pi + 1}/${toImport.length})`)

      // Créer le programme
      const { data: newProg, error: progErr } = await supabase
        .from('programmes')
        .insert([{ client_id: clientId, nom: prog.nom, semaines: prog.semaines }])
        .select().single()
      if (progErr) { setError(progErr.message); setStep('preview'); return }

      // Créer les séances
      for (let si = 0; si < prog.sessions.length; si++) {
        const session = prog.sessions[si]
        setProgress(`Programme « ${prog.nom} » — séance « ${session.nom} »… (${si + 1}/${prog.sessions.length})`)

        const { data: newSeance, error: seanceErr } = await supabase
          .from('seances')
          .insert([{ programme_id: newProg.id, nom: session.nom, ordre: si + 1 }])
          .select().single()
        if (seanceErr) { setError(seanceErr.message); setStep('preview'); return }
        totalSeances++

        if (session.exercices.length === 0) continue

        // Créer les exercices
        const exInserts = session.exercices.map((ex, idx) => ({
          seance_id:        newSeance.id,
          code:             ex.code,
          nom:              ex.nom,
          series:           parseSeries(ex.series),
          repetitions:      ex.repetitions   || null,
          recuperation:     ex.recuperation  || null,
          tempo:            ex.tempo         || null,
          type_intensite:   ex.type_intensite   || null,
          valeur_intensite: ex.valeur_intensite  || null,
          ordre:            idx + 1,
        }))
        const { data: createdEx, error: exErr } = await supabase
          .from('exercices').insert(exInserts).select()
        if (exErr) { setError(exErr.message); setStep('preview'); return }
        totalEx += exInserts.length

        // Importer les charges (colonnes Poids S1, S2…)
        const chargesInserts = []
        session.exercices.forEach((ex, idx) => {
          const exId = createdEx[idx]?.id
          if (!exId) return
          ex.poids?.forEach(p => {
            const val = String(p.valeur || '').trim()
            if (!val || val === '-' || val === '?') return
            chargesInserts.push({ exercice_id: exId, semaine: p.sem, charge: val, rpe_reel: null })
          })
        })
        if (chargesInserts.length > 0) {
          await supabase.from('charges').insert(chargesInserts)
        }
      }
    }

    setProgress(`✅ Import terminé — ${toImport.length} programme${toImport.length > 1 ? 's' : ''}, ${totalSeances} séances, ${totalEx} exercices importés.`)
    setStep('done')
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const totalEx    = programmes.filter((_, i) => selected.has(i)).reduce((acc, p) => acc + p.sessions.reduce((a, s) => a + s.exercices.length, 0), 0)
  const totalSeanc = programmes.filter((_, i) => selected.has(i)).reduce((acc, p) => acc + p.sessions.length, 0)

  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
          <button onClick={() => navigate(-1)} style={S.backBtn}>←</button>
          <div>
            <h1 style={S.h1}>Importer depuis Excel</h1>
            <p style={S.sub}>Chaque feuille du classeur devient un programme de cycle</p>
          </div>
        </div>

        {error && <div style={S.error}>{error}</div>}

        {/* ── Étape 1 : Upload ── */}
        {step === 'upload' && (
          <div>
            <div
              onClick={() => fileRef.current.click()}
              onDragOver={ev => ev.preventDefault()}
              onDrop={ev => { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) { fileRef.current.files = ev.dataTransfer.files; handleFile({ target: { files: [f] } }) } }}
              style={S.dropzone}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
              <p style={{ fontWeight: '800', color: '#111827', margin: '0 0 0.35rem', fontSize: '1.05rem' }}>
                Dépose ton fichier Excel ici
              </p>
              <p style={{ color: '#9ca3af', fontSize: '0.82rem', margin: 0 }}>.xlsx · .xls</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />

            <div style={S.hint}>
              <p style={S.hintTitle}>Format attendu</p>
              <p style={S.hintText}>
                Une <strong>feuille par programme</strong>. Dans chaque feuille, une <strong>ligne d'en-tête</strong> avec
                {' '}<em>Exercice · Séries · Reps · Récup · Tempo</em> précédée du nom de la séance.
                Les colonnes <em>Poids S1, S2…</em> sont importées comme charges.
              </p>
            </div>
          </div>
        )}

        {/* ── Étape 2 : Prévisualisation ── */}
        {step === 'preview' && (
          <div>
            <p style={S.label}>
              {programmes.length} programme{programmes.length > 1 ? 's' : ''} détecté{programmes.length > 1 ? 's' : ''}
              {' '}— sélectionne ceux à importer
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {programmes.map((prog, i) => {
                const isSelected = selected.has(i)
                const nbEx = prog.sessions.reduce((a, s) => a + s.exercices.length, 0)
                return (
                  <div key={i} style={{ ...S.card, border: `1.5px solid ${isSelected ? '#111827' : '#e5e7eb'}` }}>
                    {/* En-tête de la carte */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', cursor: 'pointer' }}
                      onClick={() => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}>
                      <div style={{ ...S.checkbox, background: isSelected ? '#111827' : 'white', borderColor: isSelected ? '#111827' : '#d1d5db' }}>
                        {isSelected && <span style={{ color: '#e4f816', fontSize: '0.65rem', fontWeight: '900' }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: '800', fontSize: '1rem', color: '#111827', margin: 0 }}>{prog.sheetName}</p>
                        <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>
                          {prog.sessions.length} séance{prog.sessions.length > 1 ? 's' : ''} · {nbEx} exercices
                        </p>
                      </div>
                    </div>

                    {/* Champs éditables */}
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <label style={S.fieldLabel}>Nom du programme</label>
                        <input
                          value={prog.nom}
                          onChange={ev => updateNom(i, ev.target.value)}
                          style={S.input}
                          placeholder="Ex: Programme Force"
                        />
                      </div>
                      <div style={{ width: 100 }}>
                        <label style={S.fieldLabel}>Semaines</label>
                        <input
                          type="number" min="1" max="52"
                          value={prog.semaines}
                          onChange={ev => updateSemaines(i, ev.target.value)}
                          style={S.input}
                        />
                      </div>
                    </div>

                    {/* Séances */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {prog.sessions.map((s, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', background: '#f9fafb', borderRadius: 8 }}>
                          <div style={{ width: 20, height: 20, background: '#e4f816', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: '900', color: '#111827' }}>{j + 1}</span>
                          </div>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#374151', flex: 1 }}>{s.nom}</span>
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: '600' }}>{s.exercices.length} ex.</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={S.summary}>
              <span style={{ fontWeight: '700', color: '#374151' }}>
                {selected.size} programme{selected.size > 1 ? 's' : ''}
              </span>
              <span style={{ color: '#9ca3af' }}>·</span>
              <span style={{ color: '#6b7280' }}>{totalSeanc} séances · {totalEx} exercices</span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={() => setStep('upload')} style={S.btnSecondary}>← Retour</button>
              <button
                onClick={importer}
                disabled={selected.size === 0}
                style={{ ...S.btnPrimary, opacity: selected.size === 0 ? 0.45 : 1 }}
              >
                Importer {selected.size > 0 ? `${selected.size} programme${selected.size > 1 ? 's' : ''}` : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── Étape 3 : Import en cours ── */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ fontWeight: '800', color: '#111827', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Import en cours…</p>
            <p style={{ color: '#6b7280', fontSize: '0.88rem' }}>{progress}</p>
          </div>
        )}

        {/* ── Étape 4 : Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <p style={{ fontWeight: '800', color: '#111827', fontSize: '1.15rem', marginBottom: '0.5rem' }}>Import réussi !</p>
            <p style={{ color: '#6b7280', fontSize: '0.88rem', marginBottom: '1.75rem' }}>{progress}</p>
            <button onClick={() => navigate(`/client/${clientId}`)} style={S.btnPrimary}>
              Voir la fiche client
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

const S = {
  page:      { minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxSizing: 'border-box' },
  container: { maxWidth: 600, margin: '0 auto', padding: '2rem 1.25rem' },
  h1:        { fontSize: '1.5rem', fontWeight: '900', color: '#111827', margin: 0, lineHeight: 1.2 },
  sub:       { color: '#9ca3af', fontSize: '0.8rem', margin: '0.2rem 0 0', fontWeight: '500' },
  backBtn:   { background: '#f3f4f6', border: 'none', borderRadius: 10, width: 38, height: 38, cursor: 'pointer', fontSize: '1rem', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  error:     { background: '#fef2f2', color: '#dc2626', borderRadius: 12, padding: '0.75rem 1rem', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: '600' },
  dropzone:  { border: '2.5px dashed #d1d5db', borderRadius: 16, padding: '3rem 1.5rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1.25rem', transition: 'border-color 0.15s', background: 'white' },
  hint:      { background: '#f3f4f6', borderRadius: 12, padding: '1rem 1.125rem' },
  hintTitle: { fontSize: '0.7rem', fontWeight: '900', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.4rem' },
  hintText:  { fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.55 },
  label:     { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 0.75rem', display: 'block' },
  card:      { borderRadius: 14, padding: '1rem', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  checkbox:  { width: 22, height: 22, borderRadius: 7, border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fieldLabel:{ fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: '0.3rem' },
  input:     { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.9rem', fontWeight: '600', color: '#111827', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fafafa' },
  summary:   { background: '#f3f4f6', borderRadius: 10, padding: '0.65rem 0.875rem', display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.85rem' },
  btnPrimary:   { flex: 1, background: '#111827', color: '#e4f816', border: 'none', borderRadius: 12, padding: '0.85rem', fontSize: '0.95rem', fontWeight: '800', cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.85rem 1.125rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
}
