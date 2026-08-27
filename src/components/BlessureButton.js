import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getCoachId, sendNotif } from '../notifs'

export const ZONES = [
  { v: 'haut',    label: 'Haut du corps' },
  { v: 'bas',     label: 'Bas du corps' },
  { v: 'general', label: 'Général' },
]
export const NIVEAUX = [
  { v: 'sans_contact',  label: 'Entraînement possible, sans contact' },
  { v: 'course_seule',  label: 'Peut courir, mais pas avec le groupe' },
  { v: 'repos_total',   label: 'Repos total, ne peut rien faire' },
]

// "2 semaines" / "10 jours" / "3 mois" → date ISO de retour estimée
export function parseDureeToDate(text) {
  if (!text) return null
  const m = text.toLowerCase().match(/(\d+)\s*(jour|j\b|semaine|sem\b|mois|an|année)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2]
  let days = 0
  if (unit.startsWith('j')) days = n
  else if (unit.startsWith('sem')) days = n * 7
  else if (unit.startsWith('mois')) days = n * 30
  else if (unit.startsWith('an')) days = n * 365
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatRetour(dateRetour) {
  if (!dateRetour) return null
  const j = Math.ceil((new Date(dateRetour + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
  if (j <= 0) return 'Retour prévu aujourd\'hui'
  if (j === 1) return 'Reprend demain'
  if (j < 14) return `Reprend dans ${j} jours`
  if (j < 60) return `Reprend dans ${Math.round(j / 7)} semaines`
  return `Reprend dans ${Math.round(j / 30)} mois`
}

export async function ensureJoueurId(clientId, prenom, nom) {
  const { data: existing } = await supabase
    .from('groupe_joueurs').select('id, joueur_blessures(*)')
    .eq('client_id', clientId).limit(1).maybeSingle()
  if (existing) return existing
  const { data: membres } = await supabase.from('groupe_membres').select('groupe_id').eq('client_id', clientId).limit(1)
  if (!membres?.length) return null
  const { data: created } = await supabase.from('groupe_joueurs').insert({
    groupe_id: membres[0].groupe_id, client_id: clientId, prenom: prenom || '', nom: nom || '',
  }).select('id, joueur_blessures(*)').maybeSingle()
  return created
}

// Bouton compact "Signaler une blessure" + popup de déclaration détaillée.
// Réutilisable depuis le profil, le wellness et le RPE post-entraînement.
export default function BlessureButton({ clientId, prenom, nom, compact }) {
  const [joueurId, setJoueurId] = useState(null)
  const [statutActif, setStatutActif] = useState(false)
  const [zone, setZone] = useState('general')
  const [niveau, setNiveau] = useState('sans_contact')
  const [desc, setDesc] = useState('')
  const [duree, setDuree] = useState('')
  const [dateRetour, setDateRetour] = useState('')
  const [popup, setPopup] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!clientId) return
    ensureJoueurId(clientId, prenom, nom).then(j => {
      if (!j) return
      setJoueurId(j.id)
      const b = (j.joueur_blessures || [])[0]
      if (b) {
        setStatutActif(b.statut !== 'ok')
        setZone(b.zone || 'general')
        setNiveau(b.niveau || 'sans_contact')
        setDesc(b.description || '')
        setDuree(b.duree_estimee || '')
        setDateRetour(b.date_retour_prevue || '')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function save() {
    if (!joueurId) return
    setSaving(true)
    const parsed = parseDureeToDate(duree)
    await supabase.from('joueur_blessures').upsert({
      joueur_id: joueurId,
      statut: statutActif ? 'out' : 'ok',
      zone: statutActif ? zone : null,
      niveau: statutActif ? niveau : null,
      description: statutActif ? (desc.trim() || null) : null,
      duree_estimee: statutActif ? (duree.trim() || null) : null,
      date_retour_prevue: statutActif ? (parsed || dateRetour || null) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'joueur_id' })
    if (statutActif && parsed) setDateRetour(parsed)
    if (statutActif) notifierCoach(zone, niveau, duree.trim())
    setSaving(false)
    setPopup(false)
  }

  async function notifierCoach(zoneVal, niveauVal, dureeVal) {
    try {
      const [{ data: client }, coachId] = await Promise.all([
        supabase.from('clients').select('prenom, nom').eq('id', clientId).maybeSingle(),
        getCoachId(),
      ])
      const nomClient = client ? `${client.prenom} ${client.nom}` : 'Un joueur'
      const zoneLabel = ZONES.find(z => z.v === zoneVal)?.label || ''
      await sendNotif(coachId, {
        titre: `${nomClient} a signalé une blessure`,
        corps: [zoneLabel, dureeVal ? `retour estimé : ${dureeVal}` : null].filter(Boolean).join(' · ') || 'Voir la fiche joueur',
        type: 'blessure',
        lien: `/client/${clientId}`,
      })
    } catch (e) {
      console.warn('[BlessureButton] notif coach échouée :', e?.message)
    }
  }

  if (!clientId) return null

  const retourLabel = statutActif ? formatRetour(dateRetour) : null

  return (
    <>
      <button onClick={() => setPopup(true)} style={{
        display: 'flex', alignItems: 'center', gap: 5,
        border: 'none', borderRadius: 999, cursor: 'pointer',
        padding: compact ? '5px 11px' : '7px 13px', fontSize: compact ? '0.7rem' : '0.76rem', fontWeight: 800,
        background: statutActif ? '#fee2e2' : '#f3f4f6',
        color: statutActif ? '#dc2626' : '#6b7280',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: statutActif ? '#dc2626' : '#16a34a', flexShrink: 0 }} />
        {statutActif ? (retourLabel || 'Blessé') : 'Signaler une blessure'}
      </button>

      {popup && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3vh 16px',
        }} onClick={e => { if (e.target === e.currentTarget) setPopup(false) }}>
          <div style={{ background: 'white', borderRadius: 18, width: '100%', maxWidth: 420, maxHeight: '88vh', overflowY: 'auto', padding: '1.25rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 900, color: '#1a1a1a', margin: 0 }}>Blessure</h2>
              <button onClick={() => setPopup(false)} style={{ background: '#f3f4f6', border: 'none', color: '#6b7280', width: 28, height: 28, borderRadius: 8, fontSize: '1rem', cursor: 'pointer' }}>×</button>
            </div>
            {!joueurId ? (
              <p style={{ fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.5 }}>
                Rejoins d'abord un groupe pour pouvoir déclarer une blessure.
              </p>
            ) : (
              <>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Préviens ton coach si tu es blessé et indisponible.
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: statutActif ? 12 : 4 }}>
                  {[{ v: false, label: 'Je suis apte' }, { v: true, label: 'Je suis blessé' }].map(o => (
                    <button key={String(o.v)} onClick={() => setStatutActif(o.v)} style={{
                      flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: statutActif === o.v ? (o.v ? '#fee2e2' : 'var(--chip-bg)') : '#f3f4f6',
                      color: statutActif === o.v ? (o.v ? '#dc2626' : 'var(--chip-text)') : '#6b7280',
                      fontWeight: 700, fontSize: '0.85rem',
                    }}>{o.label}</button>
                  ))}
                </div>

                {statutActif && (
                  <>
                    <FieldLabel>Zone touchée</FieldLabel>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                      {ZONES.map(z => (
                        <button key={z.v} onClick={() => setZone(z.v)} style={{
                          padding: '6px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                          background: zone === z.v ? '#1a1a1a' : '#f3f4f6',
                          color: zone === z.v ? 'var(--accent-fg-dark)' : '#6b7280',
                          fontSize: '0.72rem', fontWeight: 700,
                        }}>{z.label}</button>
                      ))}
                    </div>

                    <FieldLabel>Ce que tu peux faire</FieldLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {NIVEAUX.map(n => (
                        <button key={n.v} onClick={() => setNiveau(n.v)} style={{
                          textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                          border: niveau === n.v ? '2px solid #1a1a1a' : '1.5px solid #e5e7eb',
                          background: niveau === n.v ? '#f9f9f9' : 'white',
                          fontSize: '0.78rem', fontWeight: 700, color: '#374151',
                        }}>{n.label}</button>
                      ))}
                    </div>

                    <FieldLabel>Description</FieldLabel>
                    <textarea value={desc} onChange={e => setDesc(e.target.value)}
                      placeholder="Ex : entorse cheville droite" rows={3}
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />

                    <FieldLabel>Durée d'indisponibilité estimée</FieldLabel>
                    <input value={duree} onChange={e => setDuree(e.target.value)}
                      placeholder="Ex : 2 semaines, 10 jours, 3 mois…" style={{ ...inputStyle, marginBottom: 4 }} />
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '0 0 12px' }}>
                      {parseDureeToDate(duree)
                        ? `→ retour estimé le ${new Date(parseDureeToDate(duree) + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}. Modifiable à tout moment si ça évolue.`
                        : 'Écris par exemple "2 semaines" ou "10 jours" — la date de retour se calcule automatiquement.'}
                    </p>
                  </>
                )}

                <button onClick={save} disabled={saving} style={{
                  width: '100%', padding: '12px', borderRadius: 12,
                  background: 'var(--chip-bg)', color: 'var(--chip-text)',
                  border: 'none', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
                }}>
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function FieldLabel({ children }) {
  return <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{children}</label>
}

const inputStyle = {
  width: '100%', padding: '9px 10px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: '0.9rem',
  background: '#f9fafb', boxSizing: 'border-box', color: '#1a1a1a', outline: 'none',
}
