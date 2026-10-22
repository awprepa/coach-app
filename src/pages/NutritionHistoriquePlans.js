import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ClientPicker from '../components/ClientPicker'
import { chargerPlanComplet, dupliquerPlan, planVersJson, promptPlanSimilaire } from '../utils/plansNutrition'

// Historique de tous les plans nutritionnels (tous clients), pour les revoir
// et les réutiliser : copie exacte vers un client, ou prompt « plan similaire »
// à coller dans une IA puis à importer.

const STATUTS = {
  brouillon: { label: 'Brouillon', bg: '#fef9c3', color: '#854d0e' },
  actif:     { label: 'Actif',     bg: '#dcfce7', color: '#166534' },
  archive:   { label: 'Archivé',   bg: '#f3f4f6', color: '#4b5563' },
}
const fmt = iso => iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null

export default function NutritionHistoriquePlans() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [copie, setCopie] = useState(null)        // { plan, clientId, enCours }
  const [similaire, setSimilaire] = useState(null) // { plan, consignes, clientId, json, copie }

  useEffect(() => {
    supabase.from('nutrition_plans')
      .select('id, nom, description, statut, date_debut, date_fin, objectif_kcal, created_at, client_id, clients(prenom, nom), nutrition_plan_days(id)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPlans(data || []))
  }, [])

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (plans || []).filter(p => !q
      || p.nom.toLowerCase().includes(q)
      || `${p.clients?.prenom || ''} ${p.clients?.nom || ''}`.toLowerCase().includes(q)
      || (p.description || '').toLowerCase().includes(q))
  }, [plans, recherche])

  async function copierVers() {
    if (!copie?.clientId) return
    setCopie(c => ({ ...c, enCours: true }))
    try {
      const { plan, jours } = await chargerPlanComplet(copie.plan.id)
      const id = await dupliquerPlan(plan, jours, copie.clientId)
      navigate(`/nutrition/plan/${id}`)
    } catch {
      alert('Erreur lors de la copie du plan.')
      setCopie(c => ({ ...c, enCours: false }))
    }
  }

  async function ouvrirSimilaire(plan) {
    setSimilaire({ plan, consignes: '', clientId: plan.client_id, json: null, copie: false })
    const { plan: complet, jours } = await chargerPlanComplet(plan.id)
    setSimilaire(s => s && s.plan.id === plan.id ? { ...s, json: planVersJson(complet, jours) } : s)
  }
  const prompt = similaire?.json ? promptPlanSimilaire(similaire.json, similaire.consignes) : ''
  async function copierPrompt() {
    try { await navigator.clipboard.writeText(prompt) } catch {
      const t = document.getElementById('prompt-similaire'); t?.select(); document.execCommand?.('copy')
    }
    setSimilaire(s => ({ ...s, copie: true }))
  }

  return (
    <div style={S.page}>
      <div style={S.head}>
        <button onClick={() => navigate('/nutrition')} style={S.btnBack}>← Nutrition</button>
        <div style={{ flex: 1 }}>
          <h1 style={S.titre}>Historique des plans</h1>
          <p style={S.sous}>Tous les plans nutritionnels, à revoir ou à réutiliser pour un autre client.</p>
        </div>
      </div>

      <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un plan ou un client…" style={S.recherche} />

      {plans === null ? <p style={S.vide}>Chargement…</p> : liste.length === 0 ? <p style={S.vide}>Aucun plan.</p> : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>{['Plan', 'Client', 'Période', 'Statut', 'Objectif', 'Créé le', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {liste.map(p => {
                const st = STATUTS[p.statut] || STATUTS.brouillon
                return (
                  <tr key={p.id}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 800, color: '#1a1a1a', fontSize: 14 }}>{p.nom}</div>
                      {p.description && <div style={{ ...S.desc, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={p.description}>{p.description}</div>}
                    </td>
                    <td style={S.td}>{p.clients ? `${p.clients.prenom} ${p.clients.nom}` : '–'}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{p.date_debut ? `${fmt(p.date_debut)}${p.date_fin ? ` – ${fmt(p.date_fin)}` : ''}` : 'Sans dates'}</td>
                    <td style={S.td}><span style={{ ...S.badge, background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{p.objectif_kcal ? `${p.objectif_kcal} kcal/j` : '–'}<div style={S.desc}>{(p.nutrition_plan_days || []).length} jours</div></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', color: '#6b7280' }}>{fmt(p.created_at)}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button onClick={() => navigate(`/nutrition/vue/${p.id}`)} style={S.btn}>Voir</button>
                        <button onClick={() => setCopie({ plan: p, clientId: '', enCours: false })} style={S.btn}>Copier vers un client</button>
                        <button onClick={() => ouvrirSimilaire(p)} style={S.btnFonce}>Plan similaire</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {copie && (
        <div style={S.overlay} onClick={() => !copie.enCours && setCopie(null)}>
          <div style={{ ...S.modal, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h2 style={S.modalTitre}>Copier « {copie.plan.nom} »</h2>
            <p style={S.modalSous}>Copie exacte (jours, repas, aliments) en brouillon, sans dates, pour le client choisi.</p>
            <label style={S.label}>Client</label>
            <ClientPicker value={copie.clientId} onChange={id => setCopie(c => ({ ...c, clientId: id }))} />
            <div style={S.actions}>
              <button onClick={() => setCopie(null)} disabled={copie.enCours} style={S.btn}>Annuler</button>
              <button onClick={copierVers} disabled={!copie.clientId || copie.enCours} style={{ ...S.btnFonce, opacity: !copie.clientId || copie.enCours ? 0.5 : 1 }}>
                {copie.enCours ? 'Copie…' : 'Copier le plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {similaire && (
        <div style={S.overlay} onClick={() => setSimilaire(null)}>
          <div style={{ ...S.modal, maxWidth: 760 }} onClick={e => e.stopPropagation()}>
            <h2 style={S.modalTitre}>Plan similaire à « {similaire.plan.nom} »</h2>
            <ol style={S.etapes}>
              <li>Écris ce qui change par rapport à ce plan.</li>
              <li>Copie le prompt et colle-le dans Claude (ou une autre IA).</li>
              <li>Choisis le client, puis colle le JSON obtenu dans « Importer le JSON ».</li>
            </ol>

            <label style={S.label}>Ce qui change</label>
            <textarea value={similaire.consignes} rows={4}
              onChange={e => setSimilaire(s => ({ ...s, consignes: e.target.value, copie: false }))}
              placeholder="Ex. joueur de 92 kg en prise de masse, 3 100 kcal par jour, sans poisson, collation en plus après l'entraînement"
              style={S.textarea} />

            <label style={{ ...S.label, marginTop: 12 }}>Prompt</label>
            <textarea id="prompt-similaire" readOnly value={similaire.json ? prompt : 'Chargement du plan…'} rows={7} style={{ ...S.textarea, fontSize: 12.5, color: '#374151', background: '#fafafa' }} />
            <button onClick={copierPrompt} disabled={!similaire.json} style={{ ...S.btnFonce, marginTop: 8, opacity: similaire.json ? 1 : 0.5 }}>
              {similaire.copie ? 'Prompt copié' : 'Copier le prompt'}
            </button>

            <label style={{ ...S.label, marginTop: 16 }}>Client du nouveau plan</label>
            <ClientPicker value={similaire.clientId} onChange={id => setSimilaire(s => ({ ...s, clientId: id }))} />
            <div style={S.actions}>
              <button onClick={() => setSimilaire(null)} style={S.btn}>Fermer</button>
              <button onClick={() => navigate(`/nutrition/plan/new?clientId=${similaire.clientId}`)} disabled={!similaire.clientId}
                style={{ ...S.btnFonce, opacity: similaire.clientId ? 1 : 0.5 }}>
                Importer le JSON pour ce client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { padding: '1.75rem 2.5rem 3rem', maxWidth: 1600, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fafafa', minHeight: '100vh', boxSizing: 'border-box' },
  head: { display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: '1.25rem' },
  btnBack: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13.5, fontWeight: 700, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  titre: { margin: 0, fontSize: 24, fontWeight: 800, color: '#1a1a1a' },
  sous: { margin: '4px 0 0', fontSize: 14, color: '#6b7280' },
  recherche: { width: '100%', maxWidth: 480, boxSizing: 'border-box', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, marginBottom: '1rem', fontFamily: 'inherit', background: 'white' },
  vide: { color: '#6b7280', fontSize: 14 },
  tableWrap: { overflowX: 'auto', background: 'white', border: '1.5px solid #f0f0f0', borderRadius: 14 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 1000 },
  th: { textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', padding: '12px 14px', borderBottom: '1.5px solid #e5e7eb' },
  td: { padding: '12px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13.5, color: '#374151', verticalAlign: 'top' },
  desc: { fontSize: 12.5, color: '#6b7280', marginTop: 3, lineHeight: 1.4, maxWidth: 520 },
  badge: { fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' },
  btn: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13, fontWeight: 700, padding: '7px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  btnFonce: { border: 'none', background: '#333333', color: '#e4f816', fontSize: 13, fontWeight: 800, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: 'white', borderRadius: 16, padding: '1.4rem 1.5rem', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', boxSizing: 'border-box' },
  modalTitre: { margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#1a1a1a' },
  modalSous: { margin: '0 0 14px', fontSize: 13.5, color: '#6b7280', lineHeight: 1.5 },
  etapes: { margin: '4px 0 14px', paddingLeft: 20, fontSize: 13.5, color: '#374151', lineHeight: 1.7 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 },
  textarea: { width: '100%', boxSizing: 'border-box', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 },
}
