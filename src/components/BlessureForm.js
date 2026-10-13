import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { isoLocal } from '../utils/dates'
import Icon from './Icon'

// Saisie rapide d'une blessure côté coach (déclarer, modifier, confirmer un
// signalement joueur). Essentiel en 15 secondes : zone, description, étape,
// retour estimé. Le reste (type, grade, mécanisme, protocole) est en option.

export const ZONES_PRECISES = ['Cheville', 'Genou', 'Ischio-jambiers', 'Mollet', 'Cuisse', 'Épaule', 'Dos', 'Tête / Cou', 'Poignet / Main', 'Autre']
export const TYPES_LESION = [
  { v: 'entorse', label: 'Entorse' },
  { v: 'claquage', label: 'Claquage' },
  { v: 'contracture', label: 'Contracture' },
  { v: 'dechirure', label: 'Déchirure' },
  { v: 'tendinite', label: 'Tendinite' },
  { v: 'fracture', label: 'Fracture' },
  { v: 'commotion', label: 'Commotion' },
  { v: 'autre', label: 'Autre' },
]
export const MECANISMES = [{ v: 'contact', label: 'Contact' }, { v: 'non_contact', label: 'Non-contact' }]
export const GRAVITES = [{ v: 'grade_1', label: 'Grade I' }, { v: 'grade_2', label: 'Grade II' }, { v: 'grade_3', label: 'Grade III' }]
export const ETAPES = [
  { v: 'repos_total', label: 'Repos total' },
  { v: 'course_seule', label: 'Course seule' },
  { v: 'sans_contact', label: 'Sans contact' },
  { v: 'entrainement_complet', label: 'Entraîn. complet' },
]
const RETOURS = [
  { k: '1s', label: '1 sem.', jours: 7 },
  { k: '2s', label: '2 sem.', jours: 14 },
  { k: '3s', label: '3 sem.', jours: 21 },
  { k: '1m', label: '1 mois', jours: 30 },
  { k: '2m', label: '2 mois', jours: 60 },
  { k: '3m', label: '3 mois', jours: 90 },
]

const ZONE_TO_PROTO_GUESS = {
  'Cheville': 'entorse_cheville', 'Genou': 'genou_lcm', 'Ischio-jambiers': 'lesion_musculaire',
  'Mollet': 'lesion_musculaire', 'Cuisse': 'lesion_musculaire', 'Épaule': 'epaule',
  'Dos': 'cotes_lombaires', 'Tête / Cou': 'cervical', 'Poignet / Main': 'poignet_main',
}
function guessProtocoleSlug(typeLesion, zonePrecise) {
  if (typeLesion === 'commotion') return 'commotion'
  if (typeLesion === 'fracture') return 'fracture'
  return ZONE_TO_PROTO_GUESS[zonePrecise] || null
}
function plusJours(dateIso, n) {
  const d = new Date(dateIso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d)
}
function dateLongue(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function BlessureForm({ joueurs = [], joueurId: joueurIdInit = '', episode = null, protocoles = [], onClose, onSaved }) {
  const edition = !!episode
  const [f, setF] = useState(() => ({
    joueurId: joueurIdInit || episode?.joueur_id || '',
    zone_precise: episode?.zone_precise || '',
    description: episode?.description || '',
    niveau: episode?.niveau && ETAPES.some(e => e.v === episode.niveau) ? episode.niveau : 'repos_total',
    etape_index: episode?.etape_index || 0,
    date_debut: episode?.date_debut || isoLocal(),
    date_retour_prevue: episode?.date_retour_prevue || '',
    retourChoix: episode?.date_retour_prevue ? 'date' : '',
    type_lesion: episode?.type_lesion || '',
    gravite: episode?.gravite || '',
    mecanisme: episode?.mecanisme || '',
    protocole_id: episode?.protocole_id || '',
    protocoleTouched: !!episode?.protocole_id,
  }))
  const [details, setDetails] = useState(!!(episode?.type_lesion || episode?.gravite || episode?.mecanisme || episode?.protocole_id))
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState(null)

  // Échap ferme le formulaire
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = patch => setF(prev => {
    const next = { ...prev, ...patch }
    // Protocole suggéré selon la zone/le type, tant que le coach n'en a pas choisi un
    if (!next.protocoleTouched && ('zone_precise' in patch || 'type_lesion' in patch)) {
      const guess = protocoles.find(p => p.slug === guessProtocoleSlug(next.type_lesion, next.zone_precise))
      next.protocole_id = guess?.id || ''
    }
    return next
  })

  const protoEtapes = protocoles.find(p => p.id === f.protocole_id)?.paliers?.etapes
  const protoCustom = Array.isArray(protoEtapes) && protoEtapes.length > 0

  function choisirRetour(r) {
    if (f.retourChoix === r.k) set({ retourChoix: '', date_retour_prevue: '' })
    else set({ retourChoix: r.k, date_retour_prevue: plusJours(f.date_debut, r.jours) })
  }

  async function enregistrer() {
    if (!f.joueurId) { setErreur('Choisis un joueur.'); return }
    if (!f.zone_precise && !f.description.trim()) { setErreur('Indique au moins la zone ou une description.'); return }
    setSaving(true); setErreur(null)
    const payload = {
      statut: 'out',
      zone: 'general',
      zone_precise: f.zone_precise || null,
      description: f.description.trim() || null,
      niveau: f.niveau,
      etape_index: protoCustom ? f.etape_index : (episode?.etape_index || 0),
      date_retour_prevue: f.date_retour_prevue || null,
      duree_estimee: null,
      type_lesion: f.type_lesion || null,
      gravite: f.gravite || null,
      mecanisme: f.mecanisme || null,
      protocole_id: f.protocole_id || null,
      a_confirmer: false,
      updated_at: new Date().toISOString(),
    }
    const { error } = edition
      ? await supabase.from('joueur_blessures').update({ ...payload, date_debut: f.date_debut }).eq('id', episode.id)
      : await supabase.from('joueur_blessures').insert({ joueur_id: f.joueurId, date_debut: f.date_debut, ...payload })
    setSaving(false)
    if (error) { setErreur("L'enregistrement a échoué. Réessaie."); return }
    onSaved?.()
  }

  const titre = episode?.a_confirmer ? 'Confirmer le signalement' : edition ? 'Modifier la blessure' : 'Déclarer une blessure'

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titre}>
        <div style={S.head}>
          <p style={S.title}>{titre}</p>
          <button onClick={onClose} style={S.close} aria-label="Fermer"><Icon name="x" size={18} /></button>
        </div>

        {!edition && !joueurIdInit && (
          <>
            <label style={S.label} htmlFor="bf-joueur">Joueur</label>
            <select id="bf-joueur" value={f.joueurId} onChange={e => set({ joueurId: e.target.value })} style={{ ...S.input, marginBottom: 14 }}>
              <option value="">Choisir un joueur</option>
              {joueurs.map(j => <option key={j.id} value={j.id}>{j.prenom} {j.nom}</option>)}
            </select>
          </>
        )}

        <p style={S.label}>Zone</p>
        <div style={S.chips}>
          {ZONES_PRECISES.map(z => (
            <button key={z} onClick={() => set({ zone_precise: f.zone_precise === z ? '' : z })}
              style={{ ...S.chip, ...(f.zone_precise === z ? S.chipOn : {}) }} aria-pressed={f.zone_precise === z}>{z}</button>
          ))}
        </div>

        <label style={S.label} htmlFor="bf-desc">En quelques mots</label>
        <input id="bf-desc" value={f.description} onChange={e => set({ description: e.target.value })}
          placeholder="Ex : entorse cheville droite au contact" style={{ ...S.input, marginBottom: 14 }} />

        <p style={S.label}>Où il en est</p>
        {protoCustom ? (
          <select value={f.etape_index} onChange={e => set({ etape_index: Number(e.target.value) })} style={{ ...S.input, marginBottom: 14 }}>
            {protoEtapes.map((et, i) => <option key={i} value={i}>{i + 1}. {et.titre || `Étape ${i + 1}`}</option>)}
          </select>
        ) : (
          <div style={S.chips}>
            {ETAPES.map(n => (
              <button key={n.v} onClick={() => set({ niveau: n.v })}
                style={{ ...S.chip, ...(f.niveau === n.v ? S.chipOn : {}) }} aria-pressed={f.niveau === n.v}>{n.label}</button>
            ))}
          </div>
        )}

        <p style={S.label}>Retour estimé</p>
        <div style={S.chips}>
          {RETOURS.map(r => (
            <button key={r.k} onClick={() => choisirRetour(r)}
              style={{ ...S.chip, ...(f.retourChoix === r.k ? S.chipOn : {}) }} aria-pressed={f.retourChoix === r.k}>{r.label}</button>
          ))}
          <button onClick={() => set({ retourChoix: 'date' })}
            style={{ ...S.chip, ...(f.retourChoix === 'date' ? S.chipOn : {}) }} aria-pressed={f.retourChoix === 'date'}>Autre date</button>
        </div>
        {f.retourChoix === 'date' && (
          <input type="date" value={f.date_retour_prevue} onChange={e => set({ date_retour_prevue: e.target.value })}
            aria-label="Date de retour prévue" style={{ ...S.input, marginBottom: 8 }} />
        )}
        <p style={S.hint}>
          {f.date_retour_prevue ? `Retour prévu le ${dateLongue(f.date_retour_prevue)}.` : 'Sans date, la carte affichera « retour non estimé ».'}
          {' '}Blessure survenue le{' '}
          <input type="date" value={f.date_debut} onChange={e => set({ date_debut: e.target.value || isoLocal() })}
            aria-label="Date de la blessure" style={S.inlineDate} />
        </p>

        <button onClick={() => setDetails(v => !v)} style={S.detailsBtn} aria-expanded={details}>
          <Icon name="chevron-right" size={16} style={{ transform: details ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
          Plus de détails (type, gravité, protocole)
        </button>

        {details && (
          <div style={S.detailsBox}>
            <div style={S.row2}>
              <div style={{ flex: 1 }}>
                <label style={S.label} htmlFor="bf-type">Type de lésion</label>
                <select id="bf-type" value={f.type_lesion} onChange={e => set({ type_lesion: e.target.value })} style={S.input}>
                  <option value="">Non précisé</option>
                  {TYPES_LESION.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label} htmlFor="bf-grav">Gravité</label>
                <select id="bf-grav" value={f.gravite} onChange={e => set({ gravite: e.target.value })} style={S.input}>
                  <option value="">Non précisée</option>
                  {GRAVITES.map(g => <option key={g.v} value={g.v}>{g.label}</option>)}
                </select>
              </div>
            </div>
            <label style={S.label} htmlFor="bf-meca">Mécanisme</label>
            <select id="bf-meca" value={f.mecanisme} onChange={e => set({ mecanisme: e.target.value })} style={{ ...S.input, marginBottom: 12 }}>
              <option value="">Non précisé</option>
              {MECANISMES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
            <label style={S.label} htmlFor="bf-proto">Protocole de reprise</label>
            <select id="bf-proto" value={f.protocole_id} onChange={e => set({ protocole_id: e.target.value, protocoleTouched: true, etape_index: 0 })} style={S.input}>
              <option value="">Étapes simples (repos, course, sans contact, complet)</option>
              {protocoles.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
        )}

        {erreur && <p style={S.erreur} role="alert">{erreur}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={S.btnSecondary}>Annuler</button>
          <button onClick={enregistrer} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Enregistrement…' : episode?.a_confirmer ? 'Confirmer la blessure' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  modal: { background: 'white', borderRadius: 16, padding: '1.25rem 1.25rem 1.1rem', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', boxSizing: 'border-box' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: '1.1rem', fontWeight: 800, color: '#1a1a1a', margin: 0 },
  close: { width: 40, height: 40, display: 'grid', placeItems: 'center', border: 'none', background: '#f3f4f6', color: '#6b7280', borderRadius: 10, cursor: 'pointer' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' },
  input: { width: '100%', minHeight: 42, padding: '0 0.75rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.95rem', fontFamily: 'inherit', boxSizing: 'border-box', color: '#1a1a1a', background: 'white' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: { minHeight: 36, padding: '0 12px', borderRadius: 999, border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  chipOn: { background: '#333333', borderColor: '#333333', color: '#e4f816' },
  hint: { fontSize: '0.78rem', color: '#6b7280', margin: '0 0 14px', lineHeight: 1.6 },
  inlineDate: { border: '1px solid #e5e7eb', borderRadius: 6, padding: '1px 4px', fontSize: '0.78rem', fontFamily: 'inherit', color: '#374151' },
  detailsBtn: { display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: 0, background: 'none', border: 'none', color: '#374151', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  detailsBox: { background: '#f9fafb', borderRadius: 12, padding: '12px', marginTop: 6 },
  row2: { display: 'flex', gap: 10, marginBottom: 12 },
  erreur: { fontSize: '0.82rem', color: '#dc2626', fontWeight: 600, margin: '12px 0 0' },
  btnSecondary: { flex: 1, minHeight: 46, background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { flex: 2, minHeight: 46, background: '#333333', color: '#e4f816', border: 'none', borderRadius: 12, fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' },
}
