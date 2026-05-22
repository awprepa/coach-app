import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const PALETTE_SG = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#e4f816','#f97316']

const OFFRES = {
  essai:                { label: 'Essai',         bg: '#fff7ed', color: '#c2410c' },
  preparation_physique: { label: 'Prépa physique', bg: '#eff6ff', color: '#1d4ed8' },
  coaching:             { label: 'Coaching',       bg: '#f5f3ff', color: '#6d28d9' },
}

export default function FicheGroupe() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [groupe, setGroupe]               = useState(null)
  const [parent, setParent]               = useState(null)
  const [sousGroupes, setSousGroupes]     = useState([])
  const [membres, setMembres]             = useState([])
  const [programmes, setProgrammes]       = useState([])
  const [loading, setLoading]             = useState(true)

  // Modales
  const [editOpen, setEditOpen]           = useState(false)
  const [editForm, setEditForm]           = useState({ nom: '', couleur: '#6366f1' })
  const [editLogoFile, setEditLogoFile]   = useState(null)
  const [editLogoPreview, setEditLogoPreview] = useState(null)
  const [saving, setSaving]               = useState(false)

  const [showAddSG, setShowAddSG]         = useState(false)
  const [newSGNom, setNewSGNom]           = useState('')
  const [newSGCouleur, setNewSGCouleur]   = useState('#6366f1')

  const [showAddMembre, setShowAddMembre] = useState(false)
  const [searchMembre, setSearchMembre]   = useState('')
  const [candidats, setCandidats]         = useState([])   // clients individuels disponibles

  const [pushLoading, setPushLoading]     = useState(null) // programme id en cours

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => { load() }, [id]) // eslint-disable-line

  async function load() {
    setLoading(true)
    const [{ data: g }, { data: sg }, { data: gm }, { data: progs }] = await Promise.all([
      supabase.from('groupes').select('*').eq('id', id).single(),
      supabase.from('groupes').select('*').eq('parent_id', id).order('created_at'),
      supabase.from('groupe_membres').select('client_id, clients(id, prenom, nom, offre, date_fin)').eq('groupe_id', id),
      supabase.from('programmes').select('*, seances(count)').eq('groupe_id', id).is('template_id', null).order('created_at', { ascending: false }),
    ])
    setGroupe(g)
    setEditForm({ nom: g?.nom || '', couleur: g?.couleur || '#6366f1' })
    setEditLogoFile(null)
    setEditLogoPreview(null)
    setSousGroupes(sg || [])
    setMembres((gm || []).map(r => r.clients).filter(Boolean))
    setProgrammes(progs || [])

    if (g?.parent_id) {
      const { data: p } = await supabase.from('groupes').select('id, nom').eq('id', g.parent_id).single()
      setParent(p)
    } else {
      setParent(null)
    }
    setLoading(false)
  }

  // ── Édition du groupe ──────────────────────────────────────────────────────
  function handleEditLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditLogoFile(file)
    setEditLogoPreview(URL.createObjectURL(file))
  }

  async function sauvegarderGroupe() {
    setSaving(true)
    let logoUrl = groupe?.logo_url || null
    if (editLogoFile) {
      const ext  = editLogoFile.name.split('.').pop()
      const path = `groupe-${id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('groupe-logos').upload(path, editLogoFile, { upsert: true })
      if (upErr) { alert('Erreur upload : ' + upErr.message); setSaving(false); return }
      logoUrl = supabase.storage.from('groupe-logos').getPublicUrl(path).data.publicUrl
    }
    const { error } = await supabase.from('groupes').update({
      nom: editForm.nom.trim(),
      couleur: editForm.couleur,
      logo_url: logoUrl,
    }).eq('id', id)
    if (error) { alert(error.message); setSaving(false); return }
    await load()
    setEditOpen(false)
    setSaving(false)
  }

  // ── Sous-groupes ───────────────────────────────────────────────────────────
  async function creerSousGroupe() {
    if (!newSGNom.trim()) return
    const { data, error } = await supabase.from('groupes')
      .insert([{ nom: newSGNom.trim(), couleur: newSGCouleur, parent_id: id }]).select().single()
    if (error) { alert(error.message); return }
    setSousGroupes([...sousGroupes, data])
    setNewSGNom('')
    setShowAddSG(false)
  }

  async function supprimerSousGroupe(sgId) {
    if (!window.confirm('Supprimer ce sous-groupe et tous ses membres ?')) return
    await supabase.from('groupes').delete().eq('id', sgId)
    setSousGroupes(sousGroupes.filter(s => s.id !== sgId))
  }

  async function supprimerGroupe() {
    if (!window.confirm(`Supprimer le groupe "${groupe?.nom}" ? Les membres redeviendront des clients individuels.`)) return
    await supabase.from('groupes').delete().eq('id', id)
    navigate('/clients')
  }

  // ── Membres ────────────────────────────────────────────────────────────────
  async function ouvrirAddMembre() {
    // Charger tous les clients qui ne sont dans AUCUN groupe
    const { data: tousMembres } = await supabase.from('groupe_membres').select('client_id')
    const membresIds = new Set((tousMembres || []).map(m => m.client_id))
    const { data: allClients } = await supabase.from('clients').select('id, prenom, nom, offre').order('nom')
    const dispo = (allClients || []).filter(c => !membresIds.has(c.id))
    setCandidats(dispo)
    setSearchMembre('')
    setShowAddMembre(true)
  }

  async function ajouterMembre(clientId) {
    const { error } = await supabase.from('groupe_membres').insert([{ groupe_id: id, client_id: clientId }])
    if (error) { alert(error.message); return }
    await load()
    setShowAddMembre(false)
  }

  async function retirerMembre(clientId) {
    if (!window.confirm('Retirer ce membre du groupe ? Il redeviendra un client individuel.')) return
    await supabase.from('groupe_membres').delete().eq('groupe_id', id).eq('client_id', clientId)
    setMembres(membres.filter(m => m.id !== clientId))
  }

  // ── Programmes — Pousser à tous ────────────────────────────────────────────
  async function pousserATous(prog) {
    if (membres.length === 0) { alert('Ce groupe n\'a aucun membre.'); return }
    if (!window.confirm(`Envoyer "${prog.nom}" aux ${membres.length} membre(s) du groupe ?\nChaque membre recevra sa propre copie.`)) return

    setPushLoading(prog.id)

    // Charger les séances + exercices du template
    const { data: seancesData } = await supabase
      .from('seances')
      .select('*, exercices(*)')
      .eq('programme_id', prog.id)
      .order('ordre', { ascending: true })

    let count = 0
    for (const m of membres) {
      // Créer la copie individuelle
      const { data: progCopy, error: pe } = await supabase.from('programmes').insert({
        nom: prog.nom,
        semaines: prog.semaines,
        date_debut: prog.date_debut,
        client_id: m.id,
        groupe_id: id,
        template_id: prog.id,
      }).select().single()

      if (pe || !progCopy) continue

      // Copier séances + exercices
      for (const s of seancesData || []) {
        const { data: sc } = await supabase.from('seances').insert({
          programme_id: progCopy.id,
          nom: s.nom,
          ordre: s.ordre,
          echauffement: s.echauffement || null,
        }).select().single()

        if (sc && s.exercices?.length) {
          await supabase.from('exercices').insert(
            s.exercices.map(ex => ({
              seance_id: sc.id,
              code: ex.code, nom: ex.nom, series: ex.series,
              repetitions: ex.repetitions, tempo: ex.tempo,
              recuperation: ex.recuperation, type_intensite: ex.type_intensite,
              valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
              bibliotheque_id: ex.bibliotheque_id || null,
            }))
          )
        }
      }
      count++
    }

    setPushLoading(null)
    alert(`✅ Programme envoyé à ${count} membre(s) !`)
  }

  async function propaguerATous(prog) {
    if (!window.confirm(`Mettre à jour TOUTES les copies existantes de "${prog.nom}" ?\nCela écrasera le contenu de chaque copie individuelle.`)) return
    setPushLoading(prog.id)

    // Charger le contenu actuel du template
    const { data: seancesData } = await supabase
      .from('seances').select('*, exercices(*)').eq('programme_id', prog.id).order('ordre', { ascending: true })

    // Trouver toutes les copies
    const { data: copies } = await supabase.from('programmes').select('id').eq('template_id', prog.id)
    let count = 0

    for (const copy of copies || []) {
      // Supprimer les anciennes séances (les exercices se suppriment en cascade si FK est set)
      const { data: oldSeances } = await supabase.from('seances').select('id').eq('programme_id', copy.id)
      for (const os of oldSeances || []) {
        await supabase.from('exercices').delete().eq('seance_id', os.id)
      }
      await supabase.from('seances').delete().eq('programme_id', copy.id)

      // Re-copier les séances
      for (const s of seancesData || []) {
        const { data: sc } = await supabase.from('seances').insert({
          programme_id: copy.id, nom: s.nom, ordre: s.ordre, echauffement: s.echauffement || null,
        }).select().single()
        if (sc && s.exercices?.length) {
          await supabase.from('exercices').insert(
            s.exercices.map(ex => ({
              seance_id: sc.id,
              code: ex.code, nom: ex.nom, series: ex.series,
              repetitions: ex.repetitions, tempo: ex.tempo,
              recuperation: ex.recuperation, type_intensite: ex.type_intensite,
              valeur_intensite: ex.valeur_intensite, ordre: ex.ordre,
              bibliotheque_id: ex.bibliotheque_id || null,
            }))
          )
        }
      }
      count++
    }

    setPushLoading(null)
    alert(`✅ ${count} copie(s) mise(s) à jour !`)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function subInfo(date_fin) {
    if (!date_fin) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const fin = new Date(date_fin + 'T00:00:00')
    const days = Math.ceil((fin - today) / 86400000)
    if (days < 0)  return { color: '#9ca3af', bg: '#f3f4f6', label: 'Expiré' }
    if (days <= 7) return { color: '#dc2626', bg: '#fef2f2', label: `${days}j` }
    if (days <= 30)return { color: '#d97706', bg: '#fffbeb', label: `${days}j` }
    return { color: '#16a34a', bg: '#f0fdf4', label: `${days}j` }
  }

  const candidatsFiltres = candidats.filter(c =>
    `${c.prenom} ${c.nom}`.toLowerCase().includes(searchMembre.toLowerCase())
  )

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#9ca3af' }}>Chargement...</p>
    </div>
  )
  if (!groupe) return null

  const accent = groupe.couleur || '#6366f1'

  return (
    <div style={S.page}>
      {/* ── Retour ── */}
      <button onClick={() => parent ? navigate(`/groupe/${parent.id}`) : navigate('/clients')} style={S.back}>
        ← {parent ? parent.nom : 'Clients'}
      </button>

      {/* ── Header groupe ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          {groupe.logo_url
            ? <img src={groupe.logo_url} alt={groupe.nom} style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 12 }} />
            : <div style={{ width: 64, height: 64, borderRadius: 12, background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem' }}>🏆</div>
          }
          <div>
            {parent && <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: '700', color: accent, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Sous-groupe de {parent.nom}</p>}
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: '900', color: '#1a1a1a' }}>{groupe.nom}</h1>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ background: accent + '18', color: accent, border: `1px solid ${accent}44`, borderRadius: 999, padding: '0.2rem 0.75rem', fontSize: '0.75rem', fontWeight: '700' }}>
                {membres.length} membre{membres.length > 1 ? 's' : ''}
              </span>
              <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 999, padding: '0.2rem 0.75rem', fontSize: '0.75rem', fontWeight: '700' }}>
                {sousGroupes.length} sous-groupe{sousGroupes.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setEditOpen(true)} style={S.btnSecondary}>✏️ Modifier</button>
          <button onClick={supprimerGroupe} style={{ ...S.btnSecondary, color: '#dc2626', borderColor: '#fee2e2' }}>🗑 Supprimer</button>
        </div>
      </div>

      {/* ── Barre accent ── */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${accent}, ${accent}44)`, borderRadius: 999, marginBottom: '2rem' }} />

      {/* ── Sous-groupes ── */}
      <Section title="Sous-groupes" accent={accent}>
        {sousGroupes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {sousGroupes.map(sg => (
              <div key={sg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', background: 'white', borderRadius: 14, border: `1.5px solid ${sg.couleur}30`, cursor: 'pointer' }}
                onClick={() => navigate(`/groupe/${sg.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: sg.couleur, display: 'inline-block' }} />
                  <span style={{ fontWeight: '700', color: '#333' }}>{sg.nom}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Sous-groupe</span>
                  <button onClick={e => { e.stopPropagation(); supprimerSousGroupe(sg.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem', padding: '0.1rem 0.3rem' }}>✕</button>
                  <span style={{ color: '#d1d5db', fontSize: '1.25rem' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddSG ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', padding: '0.75rem', background: '#f9fafb', borderRadius: 12 }}>
            <input
              autoFocus value={newSGNom} onChange={e => setNewSGNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creerSousGroupe()}
              placeholder="Nom du sous-groupe..." style={S.input}
            />
            <input type="color" value={newSGCouleur} onChange={e => setNewSGCouleur(e.target.value)}
              style={{ width: 36, height: 30, border: '1.5px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', padding: '2px', background: 'white', flexShrink: 0 }} />
            <button onClick={creerSousGroupe} style={S.btnPrimary}>Créer</button>
            <button onClick={() => setShowAddSG(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setShowAddSG(true)} style={S.btnAdd}>+ Créer un sous-groupe</button>
        )}
      </Section>

      {/* ── Membres ── */}
      <Section title="Membres" accent={accent}>
        {membres.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '0.75rem', background: 'white', borderRadius: 14, overflow: 'hidden', border: '1px solid #f3f4f6' }}>
            {membres.map((m, i) => {
              const offre = OFFRES[m.offre]
              const sub = subInfo(m.date_fin)
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.25rem', borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer' }}
                  onClick={() => navigate(`/client/${m.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.8rem', color: accent, flexShrink: 0 }}>
                      {(m.prenom?.[0] || '') + (m.nom?.[0] || '')}
                    </div>
                    <span style={{ fontWeight: '700', color: '#333' }}>{m.prenom} {m.nom}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sub && <span style={{ background: sub.bg, color: sub.color, padding: '0.15rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '700' }}>{sub.label}</span>}
                    {offre && <span style={{ background: offre.bg, color: offre.color, padding: '0.15rem 0.55rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '600' }}>{offre.label}</span>}
                    <button onClick={e => { e.stopPropagation(); retirerMembre(m.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.8rem', padding: '0.1rem 0.3rem' }} title="Retirer du groupe">✕</button>
                    <span style={{ color: '#d1d5db', fontSize: '1.25rem' }}>›</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={ouvrirAddMembre} style={S.btnAdd}>+ Ajouter un membre</button>
      </Section>

      {/* ── Programmes du groupe ── */}
      <Section title="Programmes du groupe" accent={accent}>
        {programmes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {programmes.map(prog => {
              const nbSeances = prog.seances?.[0]?.count ?? 0
              const isPushing = pushLoading === prog.id
              return (
                <div key={prog.id} style={{ background: 'white', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', cursor: 'pointer' }}
                    onClick={() => navigate(`/programme/${prog.id}`)}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1a1a1a' }}>{prog.nom}</span>
                        <span style={{ background: accent + '18', color: accent, border: `1px solid ${accent}33`, borderRadius: 999, padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: '800' }}>TEMPLATE</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>
                        {prog.semaines} sem · {nbSeances} séance{nbSeances > 1 ? 's' : ''}
                        {prog.date_debut ? ` · début ${new Date(prog.date_debut).toLocaleDateString('fr-FR')}` : ''}
                      </p>
                    </div>
                    <span style={{ color: '#d1d5db', fontSize: '1.25rem' }}>›</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 1.25rem 0.85rem', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => pousserATous(prog)}
                      disabled={isPushing || membres.length === 0}
                      style={{ ...S.btnAction, background: accent, color: isLightColor(accent) ? '#1a1a1a' : 'white', opacity: membres.length === 0 ? 0.4 : 1 }}
                    >
                      {isPushing ? '⏳ Envoi...' : `📤 Pousser aux ${membres.length} membre${membres.length > 1 ? 's' : ''}`}
                    </button>
                    <button
                      onClick={() => propaguerATous(prog)}
                      disabled={isPushing}
                      style={{ ...S.btnAction, background: '#f3f4f6', color: '#374151' }}
                      title="Mettre à jour toutes les copies existantes"
                    >
                      🔄 Propager les modifs
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <button onClick={() => navigate(`/groupe/${id}/nouveau-programme`)} style={S.btnAdd}>
          + Nouveau programme de groupe
        </button>
      </Section>

      {/* ── Modal édition groupe ── */}
      {editOpen && (
        <Modal title="Modifier le groupe" onClose={() => setEditOpen(false)}>
          <label style={S.label}>Nom du groupe</label>
          <input value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })}
            style={{ ...S.input, marginBottom: '1.25rem', width: '100%', boxSizing: 'border-box' }} />

          <label style={S.label}>Logo (PNG)</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.25rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: '#f9fafb' }}>
              {editLogoPreview
                ? <img src={editLogoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : groupe?.logo_url
                  ? <img src={groupe.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: '1.4rem' }}>🖼️</span>}
            </div>
            <div>
              <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: '600', display: 'block' }}>
                {editLogoFile ? editLogoFile.name : 'Changer le logo...'}
              </span>
              {groupe?.logo_url && !editLogoFile && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Logo actuel · cliquer pour remplacer</span>}
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleEditLogoChange} style={{ display: 'none' }} />
          </label>

          <label style={S.label}>Couleur</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <input type="color" value={editForm.couleur} onChange={e => setEditForm({ ...editForm, couleur: e.target.value })}
              style={{ width: 42, height: 34, border: '1.5px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', padding: '2px', background: 'white' }} />
            <span style={{ fontSize: '0.82rem', color: '#6b7280', fontFamily: 'monospace' }}>{editForm.couleur}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={sauvegarderGroupe} disabled={saving} style={{ ...S.btnPrimary, flex: 1 }}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button onClick={() => setEditOpen(false)} style={{ ...S.btnSecondary, flex: 1 }}>Annuler</button>
          </div>
        </Modal>
      )}

      {/* ── Modal ajout membre ── */}
      {showAddMembre && (
        <Modal title="Ajouter un membre" onClose={() => setShowAddMembre(false)}>
          <input
            autoFocus value={searchMembre} onChange={e => setSearchMembre(e.target.value)}
            placeholder="Rechercher un client..." style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: '0.75rem' }}
          />
          {candidatsFiltres.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1rem 0' }}>
              {searchMembre ? 'Aucun client trouvé.' : 'Tous les clients sont déjà dans un groupe.'}
            </p>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {candidatsFiltres.map(c => {
                const offre = OFFRES[c.offre]
                return (
                  <div key={c.id}
                    onClick={() => ajouterMembre(c.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: '#f9fafb', borderRadius: 10, cursor: 'pointer', border: '1.5px solid transparent' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = accent}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <span style={{ fontWeight: '700', color: '#333' }}>{c.prenom} {c.nom}</span>
                    {offre && <span style={{ background: offre.bg, color: offre.color, padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: '600' }}>{offre.label}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ── Composants utilitaires ─────────────────────────────────────────────────────
function Section({ title, accent, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: '900', color: accent, textTransform: 'uppercase', letterSpacing: '0.14em' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: accent + '28' }} />
      </div>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontWeight: '800', color: '#1a1a1a', fontSize: '1.1rem' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function isLightColor(hex) {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160
  } catch { return false }
}

const S = {
  page: { padding: '2rem', maxWidth: '860px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  back: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: '0 0 1.5rem', display: 'block' },
  btnPrimary: { background: '#333', color: '#e4f816', border: 'none', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' },
  btnSecondary: { background: 'white', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  btnAdd: { background: 'white', color: '#6b7280', border: '1.5px dashed #d1d5db', borderRadius: 12, padding: '0.65rem 1.25rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', width: '100%', textAlign: 'center' },
  btnAction: { border: 'none', borderRadius: 10, padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' },
  input: { padding: '0.6rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' },
  label: { display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#6b7280', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
}
