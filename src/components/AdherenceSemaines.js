import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { isoLocal } from '../utils/dates'

// ── Adhérence semaine par semaine, depuis le premier plan du client ──
// Pour chaque jour couvert par un plan (actif ou archivé), on compte les repas
// prévus ce jour-là et ceux que le client a cochés (fait ou remplacé).
function lundiDe(iso) {
  const d = new Date(iso + 'T00:00:00'); const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow); return isoLocal(d)
}
export default function AdherenceSemaines({ client, onClose }) {
  const [semaines, setSemaines] = useState(null)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    (async () => {
      const { data: plans } = await supabase.from('nutrition_plans')
        .select('id, nom, statut, date_debut, date_fin, nutrition_plan_days(jour_numero, nutrition_plan_meals(id))')
        .eq('client_id', client.id).in('statut', ['actif', 'archive']).not('date_debut', 'is', null)
      const { data: logs } = await supabase.from('nutrition_plan_logs')
        .select('date, meal_id, statut').eq('client_id', client.id).not('meal_id', 'is', null)
      const coches = new Set((logs || []).filter(l => l.statut === 'fait' || l.statut === 'hors_plan').map(l => `${l.date}|${l.meal_id}`))
      const sautes = new Set((logs || []).filter(l => l.statut === 'saute').map(l => `${l.date}|${l.meal_id}`))
      const ps = (plans || []).sort((a, b) => a.date_debut.localeCompare(b.date_debut))
      if (!ps.length) { setSemaines([]); return }
      const today = isoLocal()
      const parSemaine = {}
      for (let d = new Date(ps[0].date_debut + 'T00:00:00'); isoLocal(d) <= today; d.setDate(d.getDate() + 1)) {
        const iso = isoLocal(d)
        // Plan en vigueur ce jour : le plus récent commencé, non terminé
        const plan = ps.filter(p => p.date_debut <= iso && (!p.date_fin || p.date_fin >= iso)).pop()
        if (!plan) continue
        const n = Math.floor((new Date(iso + 'T00:00:00') - new Date(plan.date_debut + 'T00:00:00')) / 86400000) % 7 + 1
        const meals = plan.nutrition_plan_days?.find(j => j.jour_numero === n)?.nutrition_plan_meals || []
        const sem = (parSemaine[lundiDe(iso)] ||= { lundi: lundiDe(iso), prevus: 0, faits: 0, sautes: 0, plans: new Set() })
        sem.plans.add(plan.nom)
        meals.forEach(m => {
          sem.prevus++
          if (coches.has(`${iso}|${m.id}`)) sem.faits++
          else if (sautes.has(`${iso}|${m.id}`)) sem.sautes++
        })
      }
      setSemaines(Object.values(parSemaine).filter(s => s.prevus > 0).sort((a, b) => b.lundi.localeCompare(a.lundi)))
    })()
  }, [client.id])

  const fmt = iso => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const fin = iso => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 6); return isoLocal(d) }
  const couleur = pct => pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'
  const total = (semaines || []).reduce((t, s) => ({ p: t.p + s.prevus, f: t.f + s.faits }), { p: 0, f: 0 })

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#1a1a1a' }}>Adhérence de {client.prenom} {client.nom}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#6b7280' }}>
              Repas cochés sur les repas prévus par le plan, semaine par semaine.
              {total.p > 0 && ` Depuis le début : ${Math.round(total.f / total.p * 100)} % (${total.f} sur ${total.p}).`}
            </p>
          </div>
          <button onClick={onClose} style={S.btnFermer}>Fermer</button>
        </div>
        {semaines === null ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Chargement…</p>
        ) : semaines.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Aucune semaine couverte par un plan daté.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {semaines.map(s => {
              const pct = Math.round(s.faits / s.prevus * 100)
              const enCours = s.lundi === lundiDe(isoLocal())
              return (
                <div key={s.lundi} style={S.semaine}>
                  <div style={{ width: 150, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{fmt(s.lundi)} – {fmt(fin(s.lundi))}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[...s.plans].join(', ')}>
                      {enCours ? 'Semaine en cours · ' : ''}{[...s.plans].join(', ')}
                    </div>
                  </div>
                  <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: couleur(pct), borderRadius: 999 }} />
                  </div>
                  <div style={{ width: 120, flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: couleur(pct), fontVariantNumeric: 'tabular-nums' }}>{pct} %</span>
                    <div style={{ fontSize: 12, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      {s.faits} sur {s.prevus} repas{s.sautes ? ` · ${s.sautes} sauté${s.sautes > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,18,23,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modal: { background: 'white', borderRadius: 16, padding: '1.4rem 1.5rem', width: '100%', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  btnFermer: { border: '1.5px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' },
  semaine: { display: 'flex', alignItems: 'center', gap: 16, padding: '11px 0', borderBottom: '1px solid #f3f4f6' },
}
