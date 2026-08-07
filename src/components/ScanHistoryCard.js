import { useState } from 'react'
import { noteMatieresGrasses, noteProteines, noteGlucides, noteFibres } from '../nutritionQuality'

const GRADE_COLOR = { A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626' }

function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return `Aujourd'hui · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diff === 1) return `Hier · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diff < 7)  return `Il y a ${diff} jours`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function IconPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
  )
}
function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}
function IconBox() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
    </svg>
  )
}

// Détail nutritionnel façon étiquette d'emballage : pour 100g/100ml, et pour
// la quantité réellement consommée si le joueur la renseigne (ex : le sachet
// de 200g de lardons entier).
function DetailTable({ scan }) {
  const [unit, setUnit] = useState('g')
  const [portion, setPortion] = useState('')
  const p = parseFloat(portion)
  const hasPortion = p > 0
  const factor = hasPortion ? p / 100 : null

  const rows = [
    { label: 'Calories', val: scan.kcal_100g, unit: 'kcal', note: null },
    { label: 'Glucides', val: scan.carbs_100g, unit, note: noteGlucides(scan.carbs_100g),
      sub: { label: 'dont sucres', val: scan.sugar_100g } },
    { label: 'Matières grasses', val: scan.fat_100g, unit, note: noteMatieresGrasses(scan.fat_100g),
      sub: { label: 'dont graisses saturées', val: scan.satfat_100g } },
    { label: 'Protéines', val: scan.prot_100g, unit, note: noteProteines(scan.prot_100g) },
    { label: 'Fibres', val: scan.fiber_100g, unit, note: noteFibres(scan.fiber_100g) },
  ]

  function fmtVal(v, u) {
    if (v == null) return '—'
    return `${Math.round(v)} ${u === 'kcal' ? 'kcal' : u}`
  }

  return (
    <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['g', 'ml'].map(u => (
            <button key={u} onClick={(e) => { e.stopPropagation(); setUnit(u) }} style={{
              padding: '2px 9px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: unit === u ? 'var(--accent)' : '#f3f4f6',
              color: unit === u ? '#1a1a1a' : '#6b7280',
              fontSize: '0.65rem', fontWeight: 700,
            }}>{u}</button>
          ))}
        </div>
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600 }}>Portion consommée</span>
          <input
            value={portion}
            onChange={e => setPortion(e.target.value)}
            placeholder="200"
            inputMode="decimal"
            style={{ width: 48, padding: '3px 6px', borderRadius: 7, border: '1.5px solid #e5e7eb', fontSize: '0.72rem', fontWeight: 700, color: '#1a1a1a', outline: 'none', textAlign: 'right' }}
          />
          <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600 }}>{unit}</span>
        </div>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ flex: 1, padding: '5px 10px', fontSize: '0.6rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase' }} />
          <div style={{ width: 92, padding: '5px 8px', fontSize: '0.6rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Pour 100 {unit}</div>
          {hasPortion && (
            <div style={{ width: 92, padding: '5px 8px', fontSize: '0.6rem', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Pour {portion} {unit}</div>
          )}
        </div>
        {rows.map((row, i) => (
          <div key={row.label}>
            <div style={{ display: 'flex', alignItems: 'center', borderTop: i === 0 ? 'none' : '1px solid #f3f4f6', background: i % 2 ? '#fbfbfc' : 'white' }}>
              <div style={{ flex: 1, padding: '6px 10px', minWidth: 0 }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#374151' }}>{row.label}</span>
                {row.note && <span style={{ marginLeft: 6, fontSize: '0.6rem', fontWeight: 700, color: row.note.color }}>{row.note.label}</span>}
              </div>
              <div style={{ width: 92, padding: '6px 8px', textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: '#1a1a1a' }}>
                {fmtVal(row.val, row.unit)}
              </div>
              {hasPortion && (
                <div style={{ width: 92, padding: '6px 8px', textAlign: 'right', fontSize: '0.76rem', fontWeight: 800, color: '#1a1a1a' }}>
                  {row.val != null ? fmtVal(row.val * factor, row.unit) : '—'}
                </div>
              )}
            </div>
            {row.sub && (
              <div style={{ display: 'flex', alignItems: 'center', background: i % 2 ? '#fbfbfc' : 'white' }}>
                <div style={{ flex: 1, padding: '2px 10px 6px 18px', minWidth: 0 }}>
                  <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 600 }}>{row.sub.label}</span>
                </div>
                <div style={{ width: 92, padding: '2px 8px 6px', textAlign: 'right', fontSize: '0.68rem', color: '#6b7280', fontWeight: 600 }}>
                  {fmtVal(row.sub.val, unit)}
                </div>
                {hasPortion && (
                  <div style={{ width: 92, padding: '2px 8px 6px', textAlign: 'right', fontSize: '0.68rem', color: '#6b7280', fontWeight: 700 }}>
                    {row.sub.val != null ? fmtVal(row.sub.val * factor, unit) : '—'}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ScanHistoryCard({ scan, onReuse, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const gc = GRADE_COLOR[scan.quality_grade] || '#9ca3af'

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '0.95rem 1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer' }}
      onClick={() => setExpanded(e => !e)}>
      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: '#f3f4f6', flexShrink: 0, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4ccd4',
        }}>
          {scan.image_url
            ? <img src={scan.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <IconBox />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1a1a1a', margin: '0 0 2px', lineHeight: 1.2 }}>
                {scan.product_name || 'Produit inconnu'}
              </p>
              {scan.brand && <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, margin: 0 }}>{scan.brand}</p>}
            </div>
            {scan.quality_grade && (
              <div style={{ width: 34, height: 34, borderRadius: 10, background: gc, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: '1rem' }}>
                {scan.quality_grade}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {scan.kcal_100g != null && <Chip label={`${Math.round(scan.kcal_100g)} kcal`} bg="#fef9c3" color="#92400e" />}
            {scan.prot_100g  != null && <Chip label={`P ${Math.round(scan.prot_100g)}g`}  bg="#dbeafe" color="#1e40af" />}
            {scan.carbs_100g != null && <Chip label={`G ${Math.round(scan.carbs_100g)}g`} bg="#fef3c7" color="#92400e" />}
            {scan.fat_100g   != null && <Chip label={`L ${Math.round(scan.fat_100g)}g`}   bg="#fee2e2" color="#991b1b" />}
          </div>

          <p style={{ fontSize: '0.62rem', color: '#d1d5db', fontWeight: 600, margin: '0.45rem 0 0' }}>
            {formatDate(scan.scanned_at)}
          </p>
        </div>
      </div>

      {expanded && <DetailTable scan={scan} />}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={(e) => { e.stopPropagation(); onReuse(scan) }} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '0.55rem', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#1a1a1a',
          fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
        }}>
          <IconPlus /> Réutiliser
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(scan.id) }} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.55rem 0.8rem', borderRadius: 10, border: '1.5px solid #fee2e2', background: 'white', color: '#dc2626', cursor: 'pointer',
        }}>
          <IconTrash />
        </button>
      </div>
    </div>
  )
}

function Chip({ label, bg, color }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, background: bg, color, fontSize: '0.63rem', fontWeight: 700 }}>
      {label}
    </span>
  )
}
