import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { extractColorsFromImage } from '../utils/colorExtract'

// Fenêtre « Nouveau groupe » (page Groupes). Reprend le formulaire de
// l'ancienne page Clients : nom, logo (couleurs détectées automatiquement,
// pipette pour les choisir sur le logo), deux couleurs, lien monclubhouse.

export default function NouveauGroupeModal({ onClose, onCree }) {
  const [nom, setNom] = useState('')
  const [couleur, setCouleur] = useState('')
  const [couleur2, setCouleur2] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [url, setUrl] = useState('')
  const [extraction, setExtraction] = useState(false)
  const [pipettePour, setPipettePour] = useState(null) // 'primary' | 'secondary' | null
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState(null)
  const logoRef = useRef(null)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function choisirLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setExtraction(true)
    const couleurs = await extractColorsFromImage(file, 2)
    if (couleurs[0]) setCouleur(couleurs[0])
    if (couleurs[1]) setCouleur2(couleurs[1])
    setExtraction(false)
    e.target.value = ''
  }

  // Pipette : la couleur cliquée sur le logo devient la couleur choisie
  function pipette(e) {
    if (!pipettePour || !logoRef.current) return
    const img = logoRef.current
    const rect = img.getBoundingClientRect()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || rect.width
    canvas.height = img.naturalHeight || rect.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const px = Math.round((e.clientX - rect.left) * canvas.width / rect.width)
    const py = Math.round((e.clientY - rect.top) * canvas.height / rect.height)
    const d = ctx.getImageData(px, py, 1, 1).data
    const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('')
    if (pipettePour === 'primary') setCouleur(hex)
    else setCouleur2(hex)
    setPipettePour(null)
  }

  async function creer() {
    if (!nom.trim()) { setErreur('Donne un nom au groupe.'); return }
    setSaving(true); setErreur(null)
    let logoUrl = null
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `groupe-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('groupe-logos').upload(path, logoFile, { upsert: true })
      if (upErr) { setErreur('Le logo n’a pas été envoyé. Réessaie.'); setSaving(false); return }
      logoUrl = supabase.storage.from('groupe-logos').getPublicUrl(path).data.publicUrl
    }
    const { data, error } = await supabase.from('groupes')
      .insert([{ nom: nom.trim(), couleur: couleur || null, couleur_secondaire: couleur2 || null, logo_url: logoUrl, monclubhouse_url: url.trim() || null }])
      .select().single()
    setSaving(false)
    if (error) { setErreur('Le groupe n’a pas été créé. Réessaie.'); return }
    onCree(data)
  }

  const choixCouleur = (label, valeur, setValeur, pour) => (
    <div style={S.champ}>
      <span style={S.label}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ ...S.pastille, background: valeur || '#ffffff' }} title="Choisir une couleur">
          <input type="color" value={valeur || '#ffffff'} onChange={e => setValeur(e.target.value)} style={S.colorInput} />
        </label>
        <span style={S.hex}>{valeur || 'Aucune'}</span>
        {logoPreview && (
          <button type="button" onClick={() => setPipettePour(pipettePour === pour ? null : pour)}
            style={{ ...S.btnPetit, ...(pipettePour === pour ? S.btnPetitOn : null) }}>
            {pipettePour === pour ? 'Clique sur le logo' : 'Pipette'}
          </button>
        )}
        {valeur && <button type="button" onClick={() => setValeur('')} style={S.btnLien}>Retirer</button>}
      </div>
    </div>
  )

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Nouveau groupe">
        <div style={S.head}>
          <p style={S.titre}>Nouveau groupe</p>
          <button onClick={onClose} style={S.fermer} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div style={S.corps}>
          <label style={S.champ}>
            <span style={S.label}>Nom</span>
            <input autoFocus value={nom} onChange={e => setNom(e.target.value)} onKeyDown={e => e.key === 'Enter' && creer()} placeholder="Ex. Blagnac Juniors U18" style={S.input} />
          </label>

          <div style={S.champ}>
            <span style={S.label}>Logo</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ ...S.logoBox, cursor: pipettePour ? 'crosshair' : 'default', outline: pipettePour ? '2px solid #333333' : 'none' }}>
                {logoPreview
                  ? <img ref={logoRef} src={logoPreview} alt="Logo" onClick={pipette} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={S.hex}>Aucun</span>}
              </div>
              <label style={S.btnSecondaire}>
                {logoPreview ? 'Changer le logo' : 'Ajouter un logo'}
                <input type="file" accept="image/*" onChange={choisirLogo} style={{ display: 'none' }} />
              </label>
            </div>
            {extraction && <span style={S.aide}>Détection des couleurs du logo…</span>}
          </div>

          <div style={S.grille}>
            {choixCouleur('Couleur principale', couleur, setCouleur, 'primary')}
            {choixCouleur('Couleur secondaire', couleur2, setCouleur2, 'secondary')}
          </div>

          <label style={S.champ}>
            <span style={S.label}>Lien monclubhouse (facultatif)</span>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={S.input} />
          </label>
        </div>

        <div style={S.pied}>
          {erreur && <span style={S.erreur}>{erreur}</span>}
          <button onClick={onClose} style={S.btnSecondaire}>Annuler</button>
          <button onClick={creer} disabled={saving || extraction} style={{ ...S.btnPrincipal, opacity: saving || extraction ? 0.6 : 1 }}>
            {saving ? 'Création…' : 'Créer le groupe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Mêmes styles que ModifierClientModal
const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: '1px solid #f3f4f6' },
  titre: { margin: 0, fontSize: 18, fontWeight: 800, color: '#1a1a1a' },
  fermer: { width: 44, height: 44, marginRight: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 10, color: '#4b5563', cursor: 'pointer' },
  corps: { padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  champ: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { width: '100%', minHeight: 44, padding: '0 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, color: '#1a1a1a', background: '#ffffff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  logoBox: { width: 72, height: 72, borderRadius: 12, border: '1.5px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  pastille: { position: 'relative', width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e5e7eb', cursor: 'pointer', overflow: 'hidden', flexShrink: 0 },
  colorInput: { position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 },
  hex: { fontSize: 13, color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
  aide: { fontSize: 12.5, color: '#6b7280' },
  btnPetit: { background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 7, padding: '6px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnPetitOn: { background: '#333333', color: '#e4f816' },
  btnLien: { background: 'none', border: 'none', color: '#6b7280', fontSize: 12.5, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  pied: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' },
  erreur: { flex: '1 1 200px', fontSize: 13, fontWeight: 600, color: '#dc2626' },
  btnSecondaire: { display: 'inline-flex', alignItems: 'center', minHeight: 44, background: '#ffffff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '0 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' },
  btnPrincipal: { minHeight: 44, background: '#333333', color: '#e4f816', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}
