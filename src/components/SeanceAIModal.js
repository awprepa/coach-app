/**
 * SeanceAIModal — modale IA partagée
 * Props :
 *   onClose        () => void
 *   onInsert       (session) => void   — mode séance unique
 *   programmeId    string | null       — requis pour mode cycle
 *   defaultMode    'seance'|'cycle'|null  — si fourni, skip l'écran intro
 *   onCycleDone    () => void          — callback après insertion cycle (ex: navigate)
 */
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabase'

export default function SeanceAIModal({ onClose, onInsert, programmeId, defaultMode = null, onCycleDone }) {
  const [biblioFull, setBiblioFull]             = useState([])
  const [uiMessages, setUiMessages]             = useState([])
  const [apiMessages, setApiMessages]           = useState([])
  const [phase, setPhase]                       = useState(defaultMode ? 'loading' : 'intro')
  const [aiMode, setAiMode]                     = useState(defaultMode || 'seance')
  const [generatedSession, setGeneratedSession] = useState(null)
  const [generatedCycle, setGeneratedCycle]     = useState(null)
  const [userInput, setUserInput]               = useState('')
  const [aiLoading, setAiLoading]               = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase.from('bibliotheque_exercices').select('id, nom').order('nom')
      .then(({ data }) => setBiblioFull(data || []))
    if (defaultMode) startChat(defaultMode)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMessages, aiLoading])

  async function startChat(mode) {
    setAiMode(mode)
    setPhase('loading')
    setAiLoading(true)
    const initMsg = {
      role: 'user',
      content: mode === 'cycle'
        ? "Salut, je veux programmer un cycle complet pour un de mes athlètes. On discute ?"
        : "Salut, j'ai besoin de concevoir une séance. On discute pour trouver ce qui colle le mieux ?"
    }
    const msgs = [initMsg]
    setApiMessages(msgs)
    setPhase('chat')
    try {
      const { data: res } = await supabase.functions.invoke('seance-generate-ai', {
        body: { mode: 'chat', type: mode, messages: msgs }
      })
      if (!res?.ok) throw new Error(res?.error || 'Erreur')
      processAIResponse(res, msgs)
    } catch { setPhase('error') }
    setAiLoading(false)
  }

  function processAIResponse(res, currentMsgs) {
    const assistantContent = JSON.stringify(
      res.type === 'question'
        ? { type: 'question', text: res.text, options: res.options }
        : { type: 'ready', resume: res.resume }
    )
    const newApiMsgs = [...currentMsgs, { role: 'assistant', content: assistantContent }]
    setApiMessages(newApiMsgs)
    if (res.type === 'question') {
      setUiMessages(prev => [...prev, { from: 'ai', text: res.text, options: res.options || [] }])
    } else if (res.type === 'ready') {
      setUiMessages(prev => [...prev, { from: 'ai', text: res.resume, isReady: true }])
      setPhase('ready')
    }
  }

  async function sendAnswer(text) {
    if (!text.trim() || aiLoading) return
    setUserInput('')
    setUiMessages(prev => [...prev, { from: 'user', text }])
    const newApiMsgs = [...apiMessages, { role: 'user', content: text }]
    setApiMessages(newApiMsgs)
    setAiLoading(true)
    setPhase('chat') // repasse en chat le temps que l'IA réponde
    try {
      const { data: res } = await supabase.functions.invoke('seance-generate-ai', {
        body: { mode: 'chat', type: aiMode, messages: newApiMsgs }
      })
      if (!res?.ok) throw new Error(res?.error || 'Erreur')
      processAIResponse(res, newApiMsgs)
    } catch {
      setUiMessages(prev => [...prev, { from: 'ai', text: 'Une erreur est survenue. Réessaie.', isError: true }])
    }
    setAiLoading(false)
  }

  async function generateSession() {
    setPhase('generating')
    const prompt = aiMode === 'cycle' ? 'Génère le cycle complet maintenant.' : 'Génère la séance maintenant.'
    const genMsgs = [...apiMessages, { role: 'user', content: prompt }]
    try {
      const { data: res } = await supabase.functions.invoke('seance-generate-ai', {
        body: { mode: 'generate', type: aiMode, messages: genMsgs, bibliotheque: biblioFull.map(e => e.nom) }
      })
      if (!res?.ok) throw new Error(res?.error || 'Génération échouée')
      if (aiMode === 'cycle') {
        if (!res.seances?.length) throw new Error('Cycle vide')
        setGeneratedCycle(res)
      } else {
        if (!res.exercices?.length) throw new Error('Séance vide')
        setGeneratedSession(res)
      }
      setPhase('preview')
    } catch { setPhase('error') }
  }

  function confirmInsert() {
    const exercicesWithBiblio = generatedSession.exercices.map(ex => {
      const match = biblioFull.find(b => b.nom.toLowerCase() === ex.nom.toLowerCase())
      return { ...ex, bibliotheque_id: match?.id || null }
    })
    onInsert({ ...generatedSession, exercices: exercicesWithBiblio })
    onClose()
  }

  async function confirmInsertCycle() {
    if (!programmeId) { alert("Programme introuvable."); return }
    setPhase('generating')
    try {
      for (const s of generatedCycle.seances) {
        const { data: newSeance, error: seanceErr } = await supabase
          .from('seances').insert([{ programme_id: programmeId, nom: s.nom }]).select().single()
        if (seanceErr || !newSeance) continue
        let ordre = 1
        for (const ex of s.exercices) {
          const match = biblioFull.find(b => b.nom.toLowerCase() === ex.nom.toLowerCase())
          await supabase.from('exercices').insert([{
            seance_id: newSeance.id,
            code: ex.code, nom: ex.nom,
            series: ex.series ? parseInt(String(ex.series)) : null,
            repetitions: ex.repetitions || null,
            tempo: ex.tempo || null,
            recuperation: ex.recuperation || null,
            type_intensite: ex.type_intensite || null,
            valeur_intensite: ex.valeur_intensite || null,
            progressions: ex.progressions || [],
            ordre: ordre++,
            bibliotheque_id: match?.id || null,
          }])
        }
      }
      setPhase('done')
    } catch { setPhase('error') }
  }

  const genLabel = aiMode === 'cycle' ? '✨ Générer le cycle complet' : '✨ Générer la séance'
  const genLoadLabel = aiMode === 'cycle' ? 'Génération du cycle en cours…' : 'Génération de la séance en cours…'

  return createPortal(
    <div style={AI.overlay}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>

      <div style={AI.header}>
        <div>
          <p style={AI.headerSup}>Préparation physique · IA</p>
          <h2 style={AI.headerTitle}>✨ {aiMode === 'cycle' ? 'Génération de cycle' : 'Génération de séance'}</h2>
        </div>
        <button onClick={onClose} style={AI.closeBtn}>✕</button>
      </div>

      <div style={AI.body}>

        {/* Intro : choix du mode */}
        {phase === 'intro' && (
          <div style={{ ...AI.centered, gap: 24, padding: '2rem 1.5rem' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Que veux-tu générer ?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: 340 }}>
              <button onClick={() => startChat('seance')} style={AI.modeBtn}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>🏋</span>
                <div style={{ textAlign: 'left' }}>
                  <p style={AI.modeBtnTitle}>Séance unique</p>
                  <p style={AI.modeBtnDesc}>Génère une séance adaptée au contexte actuel</p>
                </div>
              </button>
              <button onClick={() => startChat('cycle')} style={{ ...AI.modeBtn, ...AI.modeBtnCycle }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>📅</span>
                <div style={{ textAlign: 'left' }}>
                  <p style={AI.modeBtnTitle}>Cycle complet</p>
                  <p style={AI.modeBtnDesc}>Programme N semaines · progressions automatiques par bloc</p>
                </div>
              </button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.7rem', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
              Fondé sur méta-analyses récentes (2019-2025)
            </p>
          </div>
        )}

        {/* Loading / Error */}
        {(phase === 'loading' || phase === 'error') && (
          <div style={AI.centered}>
            {phase === 'loading'
              ? <><div style={AI.spinner} /><p style={AI.spinnerText}>Initialisation…</p></>
              : <><p style={{ fontSize: '2rem' }}>⚠️</p><p style={AI.spinnerText}>Une erreur est survenue</p><button onClick={onClose} style={{ ...AI.btnSecondary, marginTop: 16 }}>Fermer</button></>
            }
          </div>
        )}

        {/* Generating */}
        {phase === 'generating' && (
          <div style={AI.centered}>
            <div style={AI.spinner} />
            <p style={AI.spinnerText}>{genLoadLabel}</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', margin: '4px 0 0' }}>
              {aiMode === 'cycle' ? 'Peut prendre 10-20 secondes…' : 'Cela peut prendre quelques secondes'}
            </p>
          </div>
        )}

        {/* Done (cycle inséré) */}
        {phase === 'done' && (
          <div style={{ ...AI.centered, gap: 12, padding: '2rem' }}>
            <p style={{ fontSize: '2.5rem', margin: 0 }}>✅</p>
            <p style={{ ...AI.spinnerText, fontSize: '1.05rem' }}>Cycle créé !</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
              {generatedCycle?.seances?.length} séances ont été ajoutées au cycle.<br/>
              Tu peux maintenant les retrouver dans le programme.
            </p>
            <button
              onClick={() => { onCycleDone?.(); onClose() }}
              style={{ ...AI.btnGenerate, marginTop: 12, width: 'auto', padding: '0.75rem 2.5rem' }}
            >
              Voir le programme →
            </button>
          </div>
        )}

        {/* Chat */}
        {(phase === 'chat' || phase === 'ready') && (
          <>
            <div style={AI.messages}>
              {uiMessages.map((msg, i) => (
                <div key={i} style={{ marginBottom: '1.25rem' }}>
                  {msg.from === 'ai' ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={AI.aiAvatar}>✨</span>
                        <span style={AI.aiName}>IA Prépa</span>
                      </div>
                      <div style={{ ...AI.aiBubble, ...(msg.isReady ? AI.readyBubble : {}), ...(msg.isError ? AI.errorBubble : {}) }}>
                        {msg.isReady && '✅ '}{msg.text}
                      </div>
                      {msg.options?.length > 0 && i === uiMessages.length - 1 && !aiLoading && (
                        <div style={AI.optionsRow}>
                          {msg.options.map((opt, oi) => (
                            <button key={oi} onClick={() => sendAnswer(opt)} style={AI.optionBtn}>{opt}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={AI.userBubble}>{msg.text}</div>
                    </div>
                  )}
                </div>
              ))}
              {aiLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '1rem' }}>
                  <span style={AI.aiAvatar}>✨</span>
                  <div style={AI.typingBubble}>
                    {[0, 1, 2].map(d => <span key={d} style={{ ...AI.dot, animationDelay: `${d * 0.18}s` }} />)}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div style={AI.footer}>
              {!aiLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={AI.inputRow}>
                    <input
                      value={userInput}
                      onChange={e => setUserInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendAnswer(userInput)}
                      placeholder={phase === 'ready' ? 'Modifier ou préciser quelque chose…' : 'Réponds ou précise…'}
                      style={AI.input}
                      autoFocus
                    />
                    <button onClick={() => sendAnswer(userInput)} disabled={!userInput.trim()} style={AI.sendBtn}>→</button>
                  </div>
                  {phase === 'ready' && (
                    <button onClick={generateSession} style={AI.btnGenerate}>{genLabel}</button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Preview séance unique */}
        {phase === 'preview' && aiMode === 'seance' && generatedSession && (
          <>
            <div style={AI.preview}>
              <p style={AI.previewTitle}>{generatedSession.nom}</p>
              {generatedSession.note_ia && <div style={AI.noteIA}>🤖 {generatedSession.note_ia}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {generatedSession.exercices.map((ex, i) => {
                  const inBiblio = biblioFull.some(b => b.nom.toLowerCase() === ex.nom.toLowerCase())
                  return (
                    <div key={i} style={AI.exRow}>
                      <span style={AI.exCode}>{ex.code}</span>
                      <div style={{ flex: 1 }}>
                        <p style={AI.exNom}>{ex.nom} {inBiblio && <span style={{ fontSize: '0.7rem', color: '#e4f816', fontWeight: 700 }}>· biblio</span>}</p>
                        <p style={AI.exDetails}>
                          {ex.series && `${ex.series} séries`}{ex.repetitions && ` × ${ex.repetitions} reps`}
                          {ex.tempo && ` · tempo ${ex.tempo}`}{ex.recuperation && ` · récup ${ex.recuperation}`}
                          {ex.type_intensite && ` · ${ex.type_intensite}${ex.valeur_intensite ? ' ' + ex.valeur_intensite : ''}`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={AI.footer}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => { setPhase('chat'); setGeneratedSession(null) }} style={AI.btnSecondary}>← Recommencer</button>
                <button onClick={confirmInsert} style={{ ...AI.btnGenerate, flex: 1 }}>✓ Insérer dans la séance</button>
              </div>
            </div>
          </>
        )}

        {/* Preview cycle complet */}
        {phase === 'preview' && aiMode === 'cycle' && generatedCycle && (
          <>
            <div style={AI.preview}>
              <p style={AI.previewTitle}>{generatedCycle.nom}</p>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <span style={AI.chip}>{generatedCycle.semaines} semaines</span>
                <span style={AI.chip}>{generatedCycle.seances?.length} séances / semaine</span>
              </div>
              {generatedCycle.note_ia && <div style={AI.noteIA}>🤖 {generatedCycle.note_ia}</div>}
              {generatedCycle.seances.map((s, si) => (
                <div key={si} style={{ marginBottom: '1.25rem' }}>
                  <p style={AI.sessionHeader}>{s.nom}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {s.exercices.map((ex, ei) => {
                      const inBiblio = biblioFull.some(b => b.nom.toLowerCase() === ex.nom.toLowerCase())
                      return (
                        <div key={ei} style={AI.exRow}>
                          <span style={AI.exCode}>{ex.code}</span>
                          <div style={{ flex: 1 }}>
                            <p style={AI.exNom}>{ex.nom} {inBiblio && <span style={{ fontSize: '0.7rem', color: '#e4f816', fontWeight: 700 }}>· biblio</span>}</p>
                            {ex.progressions?.length > 0 ? (
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: 3 }}>
                                {ex.progressions.map((p, pi) => (
                                  <span key={pi} style={{ fontSize: '0.62rem', background: 'rgba(228,248,22,0.1)', color: '#e4f816', borderRadius: 5, padding: '2px 6px', fontWeight: 700, border: '1px solid rgba(228,248,22,0.2)' }}>
                                    {p.label}: {p.series}×{p.repetitions}{p.valeur_intensite ? ` ${p.valeur_intensite}` : ''}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p style={AI.exDetails}>
                                {ex.series && `${ex.series} séries`}{ex.repetitions && ` × ${ex.repetitions}`}
                                {ex.type_intensite && ` · ${ex.type_intensite}${ex.valeur_intensite ? ' ' + ex.valeur_intensite : ''}`}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={AI.footer}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => { setPhase('chat'); setGeneratedCycle(null) }} style={AI.btnSecondary}>← Recommencer</button>
                <button onClick={confirmInsertCycle} style={{ ...AI.btnGenerate, flex: 1 }}>
                  ✅ Créer {generatedCycle.seances.length} séances
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>,
    document.body
  )
}

const AI = {
  overlay:      { position: 'fixed', inset: 0, zIndex: 9999, background: '#111827', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 },
  headerSup:    { fontSize: '0.65rem', fontWeight: 700, color: '#e4f816', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 0.2rem' },
  headerTitle:  { fontSize: '1.1rem', fontWeight: 900, color: 'white', margin: 0 },
  closeBtn:     { background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'rgba(255,255,255,0.5)', width: 36, height: 36, cursor: 'pointer', fontSize: '1rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  body:         { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  centered:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 },
  spinner:      { width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#e4f816', animation: 'spin 0.7s linear infinite' },
  spinnerText:  { color: 'rgba(255,255,255,0.65)', fontWeight: 600, fontSize: '0.9rem', margin: 0 },
  messages:     { flex: 1, overflowY: 'auto', padding: '1.25rem 1rem' },
  aiAvatar:     { fontSize: '1rem', lineHeight: 1 },
  aiName:       { fontSize: '0.65rem', fontWeight: 800, color: '#e4f816', textTransform: 'uppercase', letterSpacing: '0.1em' },
  aiBubble:     { background: 'rgba(255,255,255,0.07)', borderRadius: '2px 14px 14px 14px', padding: '0.75rem 1rem', color: 'white', fontSize: '0.9rem', lineHeight: 1.55, display: 'inline-block', maxWidth: '88%' },
  readyBubble:  { background: 'rgba(228,248,22,0.08)', border: '1px solid rgba(228,248,22,0.25)' },
  errorBubble:  { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' },
  userBubble:   { background: '#e4f816', color: '#111827', borderRadius: '14px 14px 2px 14px', padding: '0.65rem 1rem', fontSize: '0.88rem', fontWeight: 700, maxWidth: '80%' },
  optionsRow:   { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem', maxWidth: '92%' },
  optionBtn:    { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '0.45rem 0.9rem', color: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  typingBubble: { display: 'flex', gap: 5, alignItems: 'center', background: 'rgba(255,255,255,0.07)', borderRadius: '2px 14px 14px 14px', padding: '0.65rem 0.9rem' },
  dot:          { width: 7, height: 7, borderRadius: '50%', background: '#e4f816', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite' },
  footer:       { padding: '0.875rem 1rem', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, paddingBottom: 'max(0.875rem, calc(0.875rem + env(safe-area-inset-bottom, 0px)))' },
  inputRow:     { display: 'flex', gap: '0.5rem' },
  input:        { flex: 1, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '0.7rem 1rem', color: 'white', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' },
  sendBtn:      { background: '#e4f816', color: '#111827', border: 'none', borderRadius: 12, width: 44, fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  btnGenerate:  { width: '100%', padding: '0.875rem', border: 'none', borderRadius: 14, background: '#e4f816', color: '#111827', fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '0.875rem 1.1rem', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: 14, background: 'transparent', color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  preview:      { flex: 1, overflowY: 'auto', padding: '1.25rem 1rem' },
  previewTitle: { fontSize: '1.2rem', fontWeight: 900, color: 'white', margin: '0 0 0.75rem' },
  noteIA:       { background: 'rgba(228,248,22,0.07)', border: '1px solid rgba(228,248,22,0.18)', borderRadius: 12, padding: '0.7rem 1rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: '1rem' },
  exRow:        { background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' },
  exCode:       { background: '#e4f816', color: '#111827', padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.8rem', fontWeight: 900, flexShrink: 0, marginTop: 2 },
  exNom:        { color: 'white', fontWeight: 700, fontSize: '0.92rem', margin: '0 0 0.2rem' },
  exDetails:    { color: 'rgba(255,255,255,0.42)', fontSize: '0.78rem', margin: 0 },
  modeBtn:      { display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' },
  modeBtnCycle: { borderColor: 'rgba(228,248,22,0.3)', background: 'rgba(228,248,22,0.05)' },
  modeBtnTitle: { color: 'white', fontWeight: 800, fontSize: '0.95rem', margin: '0 0 0.2rem' },
  modeBtnDesc:  { color: 'rgba(255,255,255,0.42)', fontSize: '0.75rem', margin: 0, lineHeight: 1.4 },
  chip:         { background: 'rgba(228,248,22,0.12)', color: '#e4f816', borderRadius: 20, padding: '0.25rem 0.75rem', fontSize: '0.72rem', fontWeight: 800, border: '1px solid rgba(228,248,22,0.2)' },
  sessionHeader:{ fontSize: '0.78rem', fontWeight: 900, color: '#e4f816', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 0.5rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(228,248,22,0.15)' },
}
