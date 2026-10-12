import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import * as pdfjs from 'pdfjs-dist'
import { supabase } from '../supabase'
import useEscape from '../hooks/useEscape'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString()

const BUCKET = 'groupe-documents'

async function rendrePage(pdf, numero, echelle) {
  const page = await pdf.getPage(numero)
  const viewport = page.getViewport({ scale: echelle })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.9)
}

function lireImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

/**
 * Documents joints à un événement de groupe (déroulé d'entraînement fait par
 * un entraîneur). PDF ou capture : on choisit les pages, on recadre chacune,
 * et seules les images recadrées sont stockées.
 */
export default function DocumentsEvenement({ evenementId }) {
  const [docs, setDocs] = useState([])
  const [flux, setFlux] = useState(null) // { pdf, nbPages, miniatures, choisies:Set } | { pages:[dataUrl] }
  const [aRecadrer, setARecadrer] = useState([]) // dataUrl restants à recadrer
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const inputRef = useRef(null)

  async function charger() {
    const { data } = await supabase.from('groupe_evenement_documents')
      .select('*').eq('evenement_id', evenementId).order('ordre')
    setDocs(data || [])
  }
  useEffect(() => { if (evenementId) charger() }, [evenementId]) // eslint-disable-line

  async function choisirFichier(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErreur('')
    try {
      if (file.type === 'application/pdf') {
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise
        if (pdf.numPages === 1) {
          setARecadrer([await rendrePage(pdf, 1, 2)])
          return
        }
        const miniatures = []
        for (let i = 1; i <= pdf.numPages; i++) miniatures.push(await rendrePage(pdf, i, 0.5))
        setFlux({ pdf, miniatures, choisies: new Set() })
      } else if (file.type.startsWith('image/')) {
        setARecadrer([await lireImage(file)])
      } else {
        setErreur('Format non pris en charge : PDF ou image uniquement.')
      }
    } catch (err) {
      console.error('[DocumentsEvenement]', err)
      setErreur('Impossible de lire ce fichier.')
    }
  }

  function basculerPage(i) {
    setFlux(f => {
      const s = new Set(f.choisies)
      s.has(i) ? s.delete(i) : s.add(i)
      return { ...f, choisies: s }
    })
  }

  async function validerPages() {
    const numeros = [...flux.choisies].sort((a, b) => a - b)
    const images = []
    for (const i of numeros) images.push(await rendrePage(flux.pdf, i + 1, 2))
    setFlux(null)
    setARecadrer(images)
  }

  async function enregistrer(blob) {
    setEnvoi(true)
    const chemin = `${evenementId}/${crypto.randomUUID()}.jpg`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(chemin, blob, { contentType: 'image/jpeg' })
    if (upErr) { setErreur('Envoi impossible : ' + upErr.message); setEnvoi(false); return false }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(chemin)
    const ordre = docs.reduce((m, d) => Math.max(m, d.ordre), -1) + 1
    const { error } = await supabase.from('groupe_evenement_documents')
      .insert({ evenement_id: evenementId, image_url: publicUrl, storage_path: chemin, ordre })
    setEnvoi(false)
    if (error) { setErreur('Enregistrement impossible : ' + error.message); return false }
    await charger()
    return true
  }

  async function supprimer(d) {
    await supabase.storage.from(BUCKET).remove([d.storage_path])
    await supabase.from('groupe_evenement_documents').delete().eq('id', d.id)
    charger()
  }

  async function recadrageValide(blob) {
    const ok = await enregistrer(blob)
    if (ok) setARecadrer(r => r.slice(1))
  }

  return (
    <div>
      {docs.length === 0 && (
        <p style={S.vide}>Aucun document joint. Il remplacera le déroulé dans le bilan du club.</p>
      )}
      <div style={S.liste}>
        {docs.map(d => (
          <div key={d.id} style={S.vignette}>
            <img loading="lazy" src={d.image_url} alt="Document joint" style={S.img} />
            <button onClick={() => supprimer(d)} style={S.suppr}>Retirer</button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" onChange={choisirFichier} style={{ display: 'none' }} />
      <button onClick={() => inputRef.current?.click()} style={S.btn}>Joindre un PDF ou une capture</button>
      {erreur && <p style={S.err}>{erreur}</p>}

      {flux && createPortal(
        <Modale titre="Choisir les pages" onClose={() => setFlux(null)}>
          <p style={S.aide}>Coche les pages à garder. Tu pourras ensuite recadrer chacune.</p>
          <div style={S.grille}>
            {flux.miniatures.map((m, i) => {
              const on = flux.choisies.has(i)
              return (
                <button key={i} onClick={() => basculerPage(i)} style={{ ...S.page, borderColor: on ? '#222222' : '#e3e3e3', boxShadow: on ? '0 0 0 2px #222222' : 'none' }}>
                  <img loading="lazy" src={m} alt={`Page ${i + 1} du document`} style={{ width: '100%', display: 'block' }} />
                  <span style={{ ...S.pastille, background: on ? '#222222' : 'rgba(255,255,255,.9)', color: on ? '#fff' : '#6b7280' }}>{on ? 'Page ' + (i + 1) + ' (choisie)' : 'Page ' + (i + 1)}</span>
                </button>
              )
            })}
          </div>
          <Actions onCancel={() => setFlux(null)} onOk={validerPages} okLabel={`Continuer (${flux.choisies.size})`} okDisabled={flux.choisies.size === 0} />
        </Modale>,
        document.body
      )}

      {aRecadrer.length > 0 && (
        <Recadrage key={aRecadrer[0].length + '-' + aRecadrer.length} src={aRecadrer[0]} reste={aRecadrer.length}
          envoi={envoi} onValide={recadrageValide} onCancel={() => setARecadrer([])} />
      )}
    </div>
  )
}

function Recadrage({ src, reste, envoi, onValide, onCancel }) {
  const imgRef = useRef(null)
  const [crop, setCrop] = useState()
  const [fait, setFait] = useState()

  function auChargement(e) {
    const c = { unit: '%', x: 0, y: 0, width: 100, height: 100 }
    setCrop(c)
    setFait(null)
  }

  function valider() {
    const img = imgRef.current
    const c = fait && fait.width > 0 ? fait : { x: 0, y: 0, width: img.width, height: img.height }
    const sx = img.naturalWidth / img.width, sy = img.naturalHeight / img.height
    const canvas = document.createElement('canvas')
    canvas.width = c.width * sx
    canvas.height = c.height * sy
    canvas.getContext('2d').drawImage(img, c.x * sx, c.y * sy, c.width * sx, c.height * sy, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(b => b && onValide(b), 'image/jpeg', 0.88)
  }

  return createPortal(
    <Modale titre={reste > 1 ? `Recadrer · encore ${reste} page${reste > 1 ? 's' : ''}` : 'Recadrer'} onClose={onCancel}>
      <p style={S.aide}>Tire le cadre sur la partie à garder. Sans cadre, la page entière est gardée.</p>
      <div style={{ maxHeight: '58vh', overflow: 'auto', display: 'flex', justifyContent: 'center', background: '#f3f4f6', borderRadius: 12, marginBottom: '1rem' }}>
        <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setFait(c)} minWidth={30} minHeight={30}>
          <img ref={imgRef} src={src} alt="Page à recadrer" onLoad={auChargement} style={{ maxWidth: '100%', display: 'block' }} />
        </ReactCrop>
      </div>
      <Actions onCancel={onCancel} onOk={valider} okLabel={envoi ? 'Envoi…' : 'Valider ce recadrage'} okDisabled={envoi} />
    </Modale>,
    document.body
  )
}

function Modale({ titre, onClose, children }) {
  useEscape(onClose)
  return (
    <div onClick={onClose} style={S.fond}>
      <div onClick={e => e.stopPropagation()} style={S.boite} role="dialog" aria-modal="true" aria-label={titre}>
        <p style={S.titre}>{titre}</p>
        {children}
      </div>
    </div>
  )
}

function Actions({ onCancel, onOk, okLabel, okDisabled }) {
  return (
    <div style={{ display: 'flex', gap: '0.65rem' }}>
      <button onClick={onCancel} style={S.annuler}>Annuler</button>
      <button onClick={onOk} disabled={okDisabled} style={{ ...S.ok, opacity: okDisabled ? 0.5 : 1 }}>{okLabel}</button>
    </div>
  )
}

const S = {
  vide: { fontSize: '.72rem', color: '#9aa1ac', fontStyle: 'italic', margin: '0 0 8px' },
  liste: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  vignette: { width: 96, display: 'flex', flexDirection: 'column', gap: 4 },
  img: { width: '100%', borderRadius: 6, border: '1px solid #e0e3e8', display: 'block' },
  suppr: { background: 'none', border: 'none', color: '#b42318', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', padding: '10px 0', minHeight: 44, textAlign: 'left' },
  btn: { background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: '.7rem', fontWeight: 800, cursor: 'pointer' },
  err: { fontSize: '.7rem', color: '#b42318', margin: '6px 0 0' },
  fond: { position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  boite: { background: '#fff', borderRadius: 16, padding: '1.25rem', width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto', boxSizing: 'border-box' },
  titre: { fontWeight: 800, fontSize: '.95rem', color: '#1a1a1a', margin: '0 0 .4rem' },
  aide: { fontSize: '.78rem', color: '#6b7280', margin: '0 0 1rem' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: '1rem' },
  page: { position: 'relative', padding: 0, border: '2px solid', borderRadius: 8, overflow: 'hidden', background: '#fff', cursor: 'pointer' },
  pastille: { position: 'absolute', left: 6, bottom: 6, fontSize: '.65rem', fontWeight: 800, borderRadius: 5, padding: '2px 7px' },
  annuler: { flex: 1, padding: '0.7rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '.85rem', fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  ok: { flex: 2, padding: '0.7rem', background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 12, fontSize: '.85rem', fontWeight: 800, cursor: 'pointer' },
}
