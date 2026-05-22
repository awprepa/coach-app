import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

/**
 * Modal de recadrage de logo.
 *
 * Props :
 *   src        — URL de l'image source (blob URL)
 *   onConfirm  — (croppedFile: File, previewUrl: string) => void
 *   onCancel   — () => void
 */
export default function CropLogoModal({ src, onConfirm, onCancel }) {
  const imgRef = useRef(null)
  const [crop, setCrop] = useState()
  const [completedCrop, setCompletedCrop] = useState()

  // Initialise le recadrage au centre en 1:1 à l'ouverture
  function onImageLoad(e) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    const c = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, 1, w, h),
      w, h
    )
    setCrop(c)
    setCompletedCrop(c)
  }

  const handleConfirm = useCallback(() => {
    if (!completedCrop || !imgRef.current) return
    const img    = imgRef.current
    const scaleX = img.naturalWidth  / img.width
    const scaleY = img.naturalHeight / img.height

    const canvas = document.createElement('canvas')
    const pixelRatio = window.devicePixelRatio || 1
    canvas.width  = completedCrop.width  * scaleX * pixelRatio
    canvas.height = completedCrop.height * scaleY * pixelRatio

    const ctx = canvas.getContext('2d')
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    ctx.imageSmoothingQuality = 'high'

    ctx.drawImage(
      img,
      completedCrop.x  * scaleX,
      completedCrop.y  * scaleY,
      completedCrop.width  * scaleX,
      completedCrop.height * scaleY,
      0, 0,
      completedCrop.width  * scaleX,
      completedCrop.height * scaleY,
    )

    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], 'logo-crop.png', { type: 'image/png' })
      const url  = URL.createObjectURL(blob)
      onConfirm(file, url)
    }, 'image/png', 0.95)
  }, [completedCrop, onConfirm])

  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '22px 22px 0 0',
          padding: '1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom))',
          width: '100%', maxWidth: 520, boxSizing: 'border-box',
        }}
      >
        {/* Poignée */}
        <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 1rem' }} />

        <p style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1a1a1a', margin: '0 0 0.4rem' }}>
          ✂️ Recadrer le logo
        </p>
        <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 1rem' }}>
          Déplace et redimensionne la sélection, puis appuie sur Valider.
        </p>

        {/* Zone de crop — scroll si image très haute */}
        <div style={{ maxHeight: '55vh', overflow: 'auto', display: 'flex', justifyContent: 'center', background: '#f3f4f6', borderRadius: 12, marginBottom: '1rem' }}>
          <ReactCrop
            crop={crop}
            onChange={c => setCrop(c)}
            onComplete={c => setCompletedCrop(c)}
            aspect={1}
            minWidth={40}
            minHeight={40}
            keepSelection
          >
            <img
              ref={imgRef}
              src={src}
              alt="logo"
              onLoad={onImageLoad}
              style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', display: 'block' }}
            />
          </ReactCrop>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem' }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '0.75rem', background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.88rem', fontWeight: '600', color: '#6b7280', cursor: 'pointer' }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            style={{ flex: 2, padding: '0.75rem', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 12, fontSize: '0.88rem', fontWeight: '800', cursor: 'pointer' }}
          >
            Valider le recadrage
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
