import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'

function parseSeries(val) {
  if (!val || val === '-') return null
  const s = String(val).trim()
  // "(2prog)+4" → 4, "(1prog)+4" → 4
  const progMatch = s.match(/\+(\d+)/)
  if (progMatch) return parseInt(progMatch[1])
  const num = parseInt(s)
  return isNaN(num) ? null : num
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const sessions = []

        wb.SheetNames.forEach(sheetName => {
          const sheet = wb.Sheets[sheetName]
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

          let colMap = null
          let currentSession = null

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
                poids:  [],
              }
              row.forEach((c, idx) => {
                if (/poids\s*s?\d+/i.test(c)) colMap.poids.push({ idx, sem: colMap.poids.length + 1 })
              })

              // Session name: look back up to 3 rows for the title
              let sessionName = sheetName
              for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
                const titleCells = rows[j].map(c => String(c ?? '').trim()).filter(Boolean)
                if (titleCells.length >= 1 && titleCells.length <= 4) {
                  sessionName = titleCells[0]
                  break
                }
              }

              currentSession = { nom: sessionName, exercices: [] }
              sessions.push(currentSession)
              continue
            }

            // Exercise row: code matches A1, B1, B2...
            if (currentSession && colMap) {
              const code = row[colMap.code]
              const nom  = row[colMap.nom]
              if (code && /^[A-Za-z]\d+$/.test(code) && nom && nom !== '-') {
                const chargeVal = colMap.charge >= 0 ? row[colMap.charge] : ''
                const ex = {
                  code,
                  nom,
                  series:       String(row[colMap.series] || ''),
                  repetitions:  row[colMap.reps] !== undefined ? String(row[colMap.reps] || '') : '',
                  recuperation: colMap.recup >= 0 ? String(row[colMap.recup] || '') : '',
                  tempo:        colMap.tempo >= 0 ? String(row[colMap.tempo] || '') : '',
                  type_intensite:  chargeVal && chargeVal !== '-' ? 'Libre' : '',
                  valeur_intensite: chargeVal && chargeVal !== '-' ? chargeVal : '',
                  poids: colMap.poids.map(p => ({ sem: p.sem, valeur: row[p.idx] })),
                }
                currentSession.exercices.push(ex)
              }
            }
          }
        })

        resolve(sessions.filter(s => s.exercices.length > 0))
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export default function ImportExcel({ programmeId, semaines, onClose, onImported }) {
  const fileRef  = useRef(null)
  const [step, setStep]         = useState('upload')    // upload | preview | importing
  const [sessions, setSessions] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError]       = useState('')
  const [progress, setProgress] = useState('')

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    try {
      const parsed = await parseExcelFile(file)
      if (parsed.length === 0) { setError("Aucune séance détectée. Vérifie que ton fichier contient une ligne d'en-tête avec 'Exercice', 'Séries', 'Reps'."); return }
      setSessions(parsed)
      setSelected(new Set(parsed.map((_, i) => i)))
      setStep('preview')
    } catch {
      setError('Erreur lors de la lecture du fichier.')
    }
  }

  async function importer() {
    setStep('importing')
    const toImport = sessions.filter((_, i) => selected.has(i))

    for (let si = 0; si < toImport.length; si++) {
      const s = toImport[si]
      setProgress(`Création de "${s.nom}"... (${si + 1}/${toImport.length})`)

      // Créer la séance
      const { data: newSeance, error: seanceErr } = await supabase
        .from('seances').insert([{ programme_id: programmeId, nom: s.nom, ordre: si + 1 }]).select().single()
      if (seanceErr) { setError(seanceErr.message); setStep('preview'); return }

      // Créer les exercices
      const exInserts = s.exercices.map((ex, idx) => ({
        seance_id: newSeance.id,
        code: ex.code,
        nom: ex.nom,
        series: parseSeries(ex.series),
        repetitions: ex.repetitions || null,
        recuperation: ex.recuperation || null,
        tempo: ex.tempo || null,
        type_intensite: ex.type_intensite || null,
        valeur_intensite: ex.valeur_intensite || null,
        ordre: idx + 1,
      }))
      const { data: createdEx, error: exErr } = await supabase.from('exercices').insert(exInserts).select()
      if (exErr) { setError(exErr.message); setStep('preview'); return }

      // Importer les poids (charges) si présents
      const chargesInserts = []
      s.exercices.forEach((ex, idx) => {
        const exId = createdEx[idx]?.id
        if (!exId) return
        ex.poids.forEach(p => {
          const val = String(p.valeur || '').trim()
          if (!val || val === '-' || val === '?') return
          // Extraire le nombre : "42kg (dur)" → 42
          const numMatch = val.replace(',', '.').match(/[\d.]+/)
          if (!numMatch) return
          chargesInserts.push({ exercice_id: exId, semaine: p.sem, charge: val, rpe_reel: null })
        })
      })
      if (chargesInserts.length > 0) {
        await supabase.from('charges').insert(chargesInserts)
      }
    }

    setProgress('')
    onImported()
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={S.title}>Importer depuis Excel</h2>
            {step === 'preview' && <p style={S.sub}>{sessions.length} séance{sessions.length > 1 ? 's' : ''} détectée{sessions.length > 1 ? 's' : ''}</p>}
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {error && <p style={S.error}>{error}</p>}

        {/* Étape 1 : Upload */}
        {step === 'upload' && (
          <div>
            <div onClick={() => fileRef.current.click()} style={S.dropzone}>
              <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>📂</p>
              <p style={{ fontWeight: '700', color: '#374151', margin: '0 0 0.25rem' }}>Clique pour choisir un fichier</p>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>.xlsx ou .xls</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
            <div style={S.hint}>
              <p style={S.hintTitle}>Format attendu :</p>
              <p style={S.hintText}>Une ligne d'en-tête avec <strong>Exercice · Séries · Reps · Récup · Tempo · Charge</strong>, précédée d'un titre de séance. Les colonnes Poids S1, S2... sont importées comme charges.</p>
            </div>
          </div>
        )}

        {/* Étape 2 : Aperçu */}
        {step === 'preview' && (
          <div>
            <p style={S.label}>Sélectionne les séances à importer :</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem', maxHeight: '55vh', overflowY: 'auto' }}>
              {sessions.map((s, i) => (
                <div key={i} style={{ ...S.sessionCard, border: `1.5px solid ${selected.has(i) ? '#333333' : '#e5e7eb'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', cursor: 'pointer' }}
                    onClick={() => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}>
                    <div style={{ ...S.checkbox, background: selected.has(i) ? '#333333' : 'white', borderColor: selected.has(i) ? '#333333' : '#d1d5db' }}>
                      {selected.has(i) && <span style={{ color: '#e4f816', fontSize: '0.7rem', fontWeight: '900' }}>✓</span>}
                    </div>
                    <div>
                      <p style={{ fontWeight: '800', fontSize: '0.95rem', color: '#333333', margin: 0 }}>{s.nom}</p>
                      <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>{s.exercices.length} exercice{s.exercices.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '2rem' }}>
                    {s.exercices.map((ex, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <span style={S.code}>{ex.code}</span>
                        <span style={{ fontWeight: '600', color: '#374151', flex: 1 }}>{ex.nom}</span>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {ex.series && ex.series !== '-' && <span style={S.chip}>{ex.series}×</span>}
                          {ex.repetitions && ex.repetitions !== '-' && <span style={S.chip}>{ex.repetitions}</span>}
                          {ex.recuperation && ex.recuperation !== '-' && <span style={S.chip}>{ex.recuperation}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setStep('upload')} style={S.btnSecondary}>← Retour</button>
              <button onClick={importer} disabled={selected.size === 0} style={{ ...S.btnPrimary, opacity: selected.size === 0 ? 0.5 : 1 }}>
                Importer {selected.size} séance{selected.size > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Étape 3 : Import en cours */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</p>
            <p style={{ fontWeight: '700', color: '#333333', marginBottom: '0.35rem' }}>Import en cours...</p>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{progress}</p>
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' },
  modal:      { background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 560, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' },
  title:      { fontSize: '1.25rem', fontWeight: '800', color: '#333333', margin: 0 },
  sub:        { color: '#9ca3af', fontSize: '0.8rem', margin: '0.2rem 0 0' },
  closeBtn:   { background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: '0.9rem', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  error:      { background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '0.65rem 0.875rem', fontSize: '0.85rem', marginBottom: '1rem' },
  dropzone:   { border: '2px dashed #d1d5db', borderRadius: 14, padding: '2.5rem 1rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1rem' },
  hint:       { background: '#f9fafb', borderRadius: 10, padding: '0.875rem 1rem' },
  hintTitle:  { fontSize: '0.72rem', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.35rem' },
  hintText:   { fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.5 },
  label:      { fontSize: '0.75rem', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.6rem' },
  sessionCard:{ borderRadius: 12, padding: '0.875rem 1rem' },
  checkbox:   { width: 20, height: 20, borderRadius: 6, border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' },
  code:       { background: '#333333', color: '#e4f816', padding: '0.1rem 0.4rem', borderRadius: 5, fontSize: '0.65rem', fontWeight: '800', flexShrink: 0 },
  chip:       { background: '#f3f4f6', color: '#6b7280', padding: '0.1rem 0.45rem', borderRadius: 999, fontSize: '0.68rem', fontWeight: '600' },
  btnPrimary: { flex: 1, background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0.75rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary:{ background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0.75rem 1rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
}
