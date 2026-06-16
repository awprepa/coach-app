import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'

const STATUT_CONFIG = {
  brouillon: { label: 'Brouillon', bg: '#fef9c3', color: '#854d0e' },
  actif:     { label: 'Actif',     bg: '#dcfce7', color: '#166534' },
  archive:   { label: 'Archivé',   bg: '#f3f4f6', color: '#6b7280' },
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NutritionPlansCoach() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('clients').select('id, prenom, nom').eq('id', clientId).single(),
        supabase.from('nutrition_plans').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      ])
      setClient(c)
      setPlans(p || [])
      setLoading(false)
    }
    load()
  }, [clientId])

  async function deletePlan(planId, e) {
    e.stopPropagation()
    if (!window.confirm('Supprimer ce plan ? Cette action est irréversible.')) return
    await supabase.from('nutrition_plans').delete().eq('id', planId)
    setPlans(prev => prev.filter(p => p.id !== planId))
  }

  async function toggleStatut(plan, e) {
    e.stopPropagation()
    const next = plan.statut === 'actif' ? 'archive' : plan.statut === 'brouillon' ? 'actif' : 'brouillon'
    await supabase.from('nutrition_plans').update({ statut: next }).eq('id', plan.id)
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, statut: next } : p))
  }

  const actif   = plans.filter(p => p.statut === 'actif')
  const autres  = plans.filter(p => p.statut !== 'actif')

  return (
    <div style={S.page}>
      <div style={S.inner}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.75rem' }}>
          <button onClick={() => navigate('/nutrition')} style={S.backBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div>
            <h1 style={S.title}>Plans nutrition</h1>
            {client && <p style={S.subtitle}>{client.prenom} {client.nom}</p>}
          </div>
          <button
            onClick={() => navigate(`/nutrition/plan/new?clientId=${clientId}`)}
            style={S.newBtn}
          >
            + Nouveau plan
          </button>
        </div>

        {loading ? (
          <div style={S.empty}>Chargement…</div>
        ) : plans.length === 0 ? (
          <div style={S.emptyCard}>
            <p style={{ fontWeight: 800, color: '#1a1a1a', margin: '0 0 0.3rem' }}>Aucun plan nutritionnel</p>
            <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
              Crée un plan en important un JSON généré par l'IA.
            </p>
            <button
              onClick={() => navigate(`/nutrition/plan/new?clientId=${clientId}`)}
              style={S.newBtn}
            >
              + Créer le premier plan
            </button>
          </div>
        ) : (
          <>
            {actif.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={S.sectionLabel}>Plan actif</div>
                {actif.map(plan => <PlanCard key={plan.id} plan={plan} navigate={navigate} onDelete={deletePlan} onToggle={toggleStatut} />)}
              </div>
            )}
            {autres.length > 0 && (
              <div>
                <div style={S.sectionLabel}>Autres plans</div>
                {autres.map(plan => <PlanCard key={plan.id} plan={plan} navigate={navigate} onDelete={deletePlan} onToggle={toggleStatut} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PlanCard({ plan, navigate, onDelete, onToggle }) {
  const sc = STATUT_CONFIG[plan.statut] || STATUT_CONFIG.brouillon
  return (
    <div onClick={() => navigate(`/nutrition/plan/${plan.id}`)} style={S.card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.97rem', color: '#1a1a1a', marginBottom: 4 }}>
            {plan.nom}
          </div>
          {plan.description && (
            <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 6, lineHeight: 1.4 }}>
              {plan.description}
            </div>
          )}
          <div style={{ fontSize: '0.73rem', color: '#9ca3af', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {plan.date_debut && <span>Du {formatDate(plan.date_debut)}</span>}
            {plan.date_fin   && <span>au {formatDate(plan.date_fin)}</span>}
            {!plan.date_debut && !plan.date_fin && <span>Pas de dates définies</span>}
            {plan.objectif_kcal && <span>• {plan.objectif_kcal} kcal/j</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button
            onClick={e => onToggle(plan, e)}
            style={{ ...S.badge, background: sc.bg, color: sc.color }}
          >
            {sc.label}
          </button>
          <button onClick={e => onDelete(plan.id, e)} style={S.deleteBtn}>✕</button>
        </div>
      </div>
    </div>
  )
}

const S = {
  page: { background: '#fafafa', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  inner: { maxWidth: 700, margin: '0 auto', padding: '2rem 1.25rem' },
  backBtn: {
    width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e5e7eb',
    background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#374151', flexShrink: 0,
  },
  title: { fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.83rem', color: '#9ca3af', margin: '2px 0 0', fontWeight: 500 },
  newBtn: {
    marginLeft: 'auto', padding: '0.6rem 1rem', background: '#1a1a1a', color: 'white',
    border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0,
  },
  empty: { textAlign: 'center', color: '#9ca3af', padding: '3rem 0' },
  emptyCard: {
    background: 'white', borderRadius: 18, padding: '2rem', textAlign: 'center',
    border: '1.5px dashed #e5e7eb',
  },
  sectionLabel: {
    fontSize: '0.7rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: '0.6rem',
  },
  card: {
    background: 'white', borderRadius: 16, padding: '14px 16px', marginBottom: 10,
    border: '1.5px solid #f0f0f0', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  badge: {
    fontSize: '0.7rem', fontWeight: 700, padding: '4px 10px', borderRadius: 20,
    border: 'none', cursor: 'pointer',
  },
  deleteBtn: {
    width: 26, height: 26, borderRadius: '50%', background: '#fee2e2', border: 'none',
    color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
}
