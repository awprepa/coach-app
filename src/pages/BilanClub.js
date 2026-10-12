import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { chargerBilan, isoLocal, libelleJour, libelleCourt, formatDuree } from '../utils/bilanClub'

// ── Bilan de période pour le staff d'un club ─────────────────────────────────
// Page de configuration (groupe + période) puis rendu "papier" : une page de
// synthèse, puis une page par semaine. Export PDF = impression du navigateur
// (vectoriel, gratuit) — la mise en page est donc pensée pour l'impression.

const fmt = v => v == null ? '—' : String(v).replace('.', ',')
const min = sec => sec ? `${Math.round(sec / 60)}'` : '—'

function periodeParDefaut() {
  const f = new Date()
  const d = new Date(f.getFullYear(), f.getMonth() - 1, 1)
  const fin = new Date(f.getFullYear(), f.getMonth(), 0)
  return { debut: isoLocal(d), fin: isoLocal(fin) }
}

export default function BilanClub() {
  const navigate = useNavigate()
  const [groupes, setGroupes] = useState([])
  const [groupeId, setGroupeId] = useState('')
  const [periode, setPeriode] = useState(periodeParDefaut)
  const [bilan, setBilan] = useState(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    supabase.from('groupes').select('id, nom, type, parent_id').in('type', ['equipe', 'sous_groupe']).order('nom')
      .then(({ data }) => {
        setGroupes((data || []).filter(g => g.type === 'equipe'))
      })
  }, [])

  async function generer() {
    if (!groupeId || !periode.debut || !periode.fin) return
    if (periode.debut > periode.fin) { setErreur('La date de début doit précéder la date de fin.'); return }
    setErreur(''); setChargement(true); setBilan(null)
    try { setBilan(await chargerBilan({ groupeId, debut: periode.debut, fin: periode.fin })) }
    catch (e) { console.error('[BilanClub]', e); setErreur('Impossible de générer le bilan : ' + (e.message || e)) }
    setChargement(false)
  }

  return (
    <div className="bilan-racine" style={{ padding: '24px 16px' }}>
      <style>{CSS}</style>
      <div className="bilan-hors-page">
        <button onClick={() => navigate('/groupes')} style={S.retour}>Retour aux groupes</button>
        <h1 style={S.titre}>Bilan de période</h1>
        <p style={S.aide}>Génère un document pour le staff du club : une page de synthèse puis une page par semaine.</p>
        <div style={S.form}>
          <label style={S.champ}>
            <span style={S.lib}>Équipe</span>
            <select value={groupeId} onChange={e => setGroupeId(e.target.value)} style={S.input}>
              <option value="">Choisir…</option>
              {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
            </select>
          </label>
          <label style={S.champ}>
            <span style={S.lib}>Du</span>
            <input type="date" value={periode.debut} onChange={e => setPeriode(p => ({ ...p, debut: e.target.value }))} style={S.input} />
          </label>
          <label style={S.champ}>
            <span style={S.lib}>Au</span>
            <input type="date" value={periode.fin} onChange={e => setPeriode(p => ({ ...p, fin: e.target.value }))} style={S.input} />
          </label>
          <button onClick={generer} disabled={!groupeId || chargement} style={{ ...S.btn, opacity: !groupeId || chargement ? .5 : 1 }}>
            {chargement ? 'Génération…' : 'Générer'}
          </button>
          {bilan && <button onClick={() => window.print()} style={S.btnClair}>Exporter en PDF</button>}
        </div>
        {erreur && <p style={{ color: '#b42318', fontSize: 13 }}>{erreur}</p>}
        {bilan && <p style={S.aide}>Dans la fenêtre d'impression, choisis « Enregistrer au format PDF » et décoche les en-têtes et pieds de page.</p>}
      </div>
      {bilan && <Rapport b={bilan} />}
    </div>
  )
}

function Rapport({ b }) {
  const { identite: id, synthese: s, semaines } = b
  const periodeTxt = `du ${libelleCourt(b.debut)} ${b.debut.slice(0, 4)} au ${libelleCourt(b.fin)} ${b.fin.slice(0, 4)}`
  const style = { '--club': id.couleur, '--club2': id.couleur2 }
  const pied = n => <div className="foot"><span>Bilan {id.nom} · {periodeTxt}</span><span>Page {n}</span></div>
  const delta = s.blesses.fin - s.blesses.avant
  const matchs = semaines.flatMap(w => w.matchs)

  return (
    <div className="bilan-rapport" style={style}>
      <section className="page">
        <Entete id={id} periodeTxt={periodeTxt} />
        <div className="kpis">
          <div className="kpi"><b>{s.seancesMuscu}</b><span>séances de musculation</span></div>
          <div className="kpi"><b>{fmt(s.presentsMuscu)}</b><span>joueurs présents en moyenne</span><small>par séance de musculation, sur {b.effectif}</small></div>
          <div className="kpi"><b>{fmt(s.rpeMoyen)}</b><span>RPE moyen</span><small>sur 10 · {s.courbeRpe.length} séance{s.courbeRpe.length > 1 ? 's' : ''} notée{s.courbeRpe.length > 1 ? 's' : ''}</small></div>
          <div className="kpi">
            <b className="withtrend"><span>{s.blesses.fin}</span><Tendance delta={delta} /></b>
            <span>joueur{s.blesses.fin > 1 ? 's' : ''} blessé{s.blesses.fin > 1 ? 's' : ''}</span>
            <small>fin de période, {s.blesses.avant} sur la période précédente</small>
          </div>
        </div>

        <h2>Évolution sur la période</h2>
        <div className="two">
          <div className="chart">
            <h3>Joueurs présents en musculation</h3>
            <div className="sub" style={{ fontSize: 11, margin: '1px 0 6px' }}>Moyenne par séance, sur {b.effectif} joueurs</div>
            <Barres semaines={semaines} effectif={b.effectif} couleur={id.couleur} />
          </div>
          <div className="chart">
            <h3>Intensité ressentie à l'entraînement et en match</h3>
            <div className="sub" style={{ fontSize: 11, margin: '1px 0 6px' }}>RPE moyen donné par les joueurs, sur 10</div>
            <Courbe points={s.courbeRpe} couleur={id.couleur} />
          </div>
        </div>

        <h2>Résumé par semaine</h2>
        <div className="blk"><div className="blkt">Musculation</div>
          <table className="fx">
            <colgroup><col style={{ width: '34%' }} /><col style={{ width: '33%' }} /><col style={{ width: '33%' }} /></colgroup>
            <thead><tr><th>Semaine</th><th className="r">Séances</th><th className="r">Joueurs présents par séance</th></tr></thead>
            <tbody>{semaines.map(w => (
              <tr key={w.cle}><td>{w.libelle}</td><td className="r">{w.muscu.seances}</td><td className="r">{w.muscu.presents == null ? '—' : `${fmt(Math.round(w.muscu.presents))} sur ${b.effectif}`}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="blk t"><div className="blkt">Entraînements terrain</div>
          <table className="fx">
            <colgroup><col style={{ width: '28%' }} /><col style={{ width: '17%' }} /><col style={{ width: '19%' }} /><col style={{ width: '20%' }} /><col style={{ width: '16%' }} /></colgroup>
            <thead><tr><th>Semaine</th><th className="r">Entraînements</th><th className="r">Joueurs présents</th><th className="r">Temps de jeu</th><th className="r">RPE moyen</th></tr></thead>
            <tbody>{semaines.map(w => (
              <tr key={w.cle}><td>{w.libelle}</td><td className="r">{w.entrainements.nombre}</td>
                <td className="r">{w.entrainements.presents == null ? '—' : `${fmt(Math.round(w.entrainements.presents))} sur ${b.effectif}`}</td>
                <td className="r">{min(w.entrainements.jeuSec)}</td><td className="r">{fmt(w.entrainements.rpe)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {matchs.length > 0 && (
          <div className="blk m"><div className="blkt">Matchs</div>
            <table className="fx">
              <colgroup><col style={{ width: '34%' }} /><col style={{ width: '32%' }} /><col style={{ width: '17%' }} /><col style={{ width: '17%' }} /></colgroup>
              <thead><tr><th>Date</th><th>Adversaire</th><th className="r">Joueurs</th><th className="r">RPE moyen</th></tr></thead>
              <tbody>{matchs.map(m => (
                <tr key={m.id}><td>{libelleJour(m.date)}</td><td>{nomMatch(m)}</td>
                  <td className="r">{m.presents ? `${m.presents} sur ${b.effectif}` : '—'}</td><td className="r">{fmt(m.rpe)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {pied(1)}
      </section>

      {semaines.map((w, i) => (
        <section className="page" key={w.cle}>
          <div className="head" style={{ marginBottom: 16 }}>
            <div className="who">
              {id.logo && <img className="logo" src={id.logo} alt="" />}
              <div>
                <div className="eyebrow">{w.libelle.split(' · ')[0]} · {w.libelle.split(' · ')[1]}</div>
                <h1 style={{ fontSize: 24 }}>{id.nom}</h1>
              </div>
            </div>
          </div>
          {w.jours.length === 0 && <p className="muted">Aucune activité enregistrée cette semaine.</p>}
          {w.jours.flatMap(j => j.items.map((it, k) => <Jour key={j.date + k} it={it} b={b} />))}
          {pied(i + 2)}
        </section>
      ))}
    </div>
  )
}

function nomMatch(m) {
  const lieu = m.domicile === true ? 'domicile' : m.domicile === false ? 'extérieur' : ''
  return [m.adversaire || m.titre || 'Match', lieu].filter(Boolean).join(' · ')
}

function Entete({ id, periodeTxt }) {
  return (
    <div className="head">
      <div className="who">
        {id.logo && <img className="logo" src={id.logo} alt="" />}
        <div>
          <div className="eyebrow">Bilan de préparation physique</div>
          <h1>{id.nom}</h1>
          <div className="sub">{[id.clubNom, periodeTxt].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="coach">Arthur Wehrey<br />Préparateur physique</div>
    </div>
  )
}

function Tendance({ delta }) {
  if (delta === 0) return <span className="tr" style={{ color: '#6b6b6b' }}><i>=</i></span>
  const haut = delta > 0
  const c = haut ? '#1f8a4c' : '#b42318'
  return (
    <span className="tr" style={{ color: c }}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={haut ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'} />
      </svg>
      <i>{haut ? '+' : '−'}{Math.abs(delta)}</i>
    </span>
  )
}

function Jour({ it, b }) {
  const eff = b.effectif
  if (it.kind === 'muscu') {
    return (
      <div className="day mu">
        <div className="dayhead"><b>{libelleJour(it.date)}</b><span>Musculation · {it.nom}</span></div>
        <div className="sec"><div className="k">Séance</div><div>
          {it.exercices.length === 0 ? <span className="muted">Aucun exercice enregistré.</span> : (
            <table>
              <thead><tr><th>Exercice</th><th className="r">Séries × reps</th><th className="r">Tempo</th><th className="r">Récup.</th><th className="r">Intensité</th></tr></thead>
              <tbody>{it.exercices.map((x, i) => (
                <tr key={i}><td>{x.nom}</td><td className="r">{x.seriesReps}</td><td className="r">{x.tempo}</td><td className="r">{x.recup}</td><td className="r">{x.intensite}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div></div>
        <div className="sec"><div className="k">Présence</div><div>
          <b>{it.presents} joueur{it.presents > 1 ? 's' : ''} sur {eff}</b>
          {it.absents.length > 0 && <div className="muted">Absents : {it.absents.join(', ')}</div>}
        </div></div>
      </div>
    )
  }
  if (it.kind === 'match') {
    return (
      <div className="day ma">
        <div className="dayhead"><b>{libelleJour(it.date)}</b><span>Match · {nomMatch(it)}</span></div>
        <div className="sec"><div className="k">Ressenti</div><div>
          {it.rpe == null ? <span className="muted">Aucun RPE renseigné.</span> : <>
            RPE moyen <b>{fmt(it.rpe)}</b> · {it.presents} joueur{it.presents > 1 ? 's' : ''} sur {eff}
            <div className="muted">Cardio {fmt(it.cardio)} · Jambes {fmt(it.jambes)} · Contact {fmt(it.contact)}</div>
          </>}
        </div></div>
      </div>
    )
  }
  const t = it.trame
  return (
    <div className="day en">
      <div className="dayhead"><b>{libelleJour(it.date)}</b><span>Entraînement{it.duree ? ` · ${it.duree} min` : ''}</span></div>
      <div className="sec"><div className="k">Déroulé</div><div>
        {it.documents.length > 0
          ? it.documents.map((u, i) => <img key={i} className="docimg" src={u} alt="" />)
          : t ? (
            <table>
              <thead><tr><th>Séquence</th><th className="r">Durée</th><th>Contenu</th></tr></thead>
              <tbody>{t.lignes.map((l, i) => (
                <tr key={i}><td>{l.nom}</td><td className="r">{l.duree ? formatDuree(l.duree).replace(/^(\d+)'00$/, "$1'") : '—'}</td><td>{l.contenu || ''}</td></tr>
              ))}</tbody>
            </table>
          ) : <span className="muted">Rien de renseigné</span>}
      </div></div>
      {!it.documents.length && t && t.oppositions.length > 0 && (
        <div className="sec"><div className="k">Opposition</div><div>
          <table className="opp fx">
            <colgroup><col style={{ width: '30%' }} /><col style={{ width: '18%' }} /><col style={{ width: '14%' }} /><col style={{ width: '19%' }} /><col style={{ width: '19%' }} /></colgroup>
            <thead><tr><th>Bloc</th><th>Séquences de jeu</th><th>Récup. entre séquences</th><th className="r">Temps de jeu</th><th className="r">Durée du bloc</th></tr></thead>
            <tbody>
              {t.oppositions.map(o => (
                <tr key={o.numero}>
                  <td><b>Bloc {o.numero}</b>{o.effectif ? ` · ${o.effectif}` : ''}{o.detail && <><br /><span className="muted">{o.detail}</span></>}</td>
                  <td>{o.sequences}</td><td>{o.recup}</td><td className="r">{formatDuree(o.jeuSec)}</td><td className="r">{formatDuree(o.totSec)}</td>
                </tr>
              ))}
              <tr className="tot"><td colSpan={3}>Total opposition</td><td className="r">{formatDuree(t.oppositions.reduce((a, o) => a + o.jeuSec, 0))}</td><td className="r">{formatDuree(t.totalOpposition)}</td></tr>
            </tbody>
          </table>
          <p className="foot-note">Temps de jeu = durée des séquences jouées, sans les récupérations.</p>
        </div></div>
      )}
      <div className="sec"><div className="k">Ressenti</div><div>
        {it.rpe == null ? <span className="muted">Aucun RPE renseigné.</span> : <>
          RPE moyen <b>{fmt(it.rpe)}</b> · {it.presents} joueur{it.presents > 1 ? 's' : ''} sur {eff}
          <div className="muted">Cardio {fmt(it.cardio)} · Jambes {fmt(it.jambes)} · Contact {fmt(it.contact)}</div>
        </>}
      </div></div>
    </div>
  )
}

function Barres({ semaines, effectif, couleur }) {
  const donnees = semaines.map(w => ({ n: w.libelle.split(' · ')[0], v: w.muscu.presents }))
  const max = Math.max(effectif, 1)
  const Y = v => 104 - (v / max) * 90
  const ticks = [0, Math.round(max / 3), Math.round(2 * max / 3), max]
  const pas = 266 / donnees.length
  const larg = Math.min(34, pas * .55)
  return (
    <svg viewBox="0 0 300 130" role="img" aria-label="Joueurs présents en musculation par semaine">
      <g stroke="#e3e3e1" strokeWidth="1">{ticks.map(t => <line key={t} x1="30" y1={Y(t)} x2="296" y2={Y(t)} stroke={t === 0 ? '#9a9a9a' : '#e3e3e1'} />)}</g>
      <g fontSize="9" fill="#6b6b6b" textAnchor="end">{ticks.map(t => <text key={t} x="24" y={Y(t) + 3}>{t}</text>)}</g>
      {donnees.map((d, i) => {
        const cx = 30 + pas * i + pas / 2
        return (
          <g key={i}>
            {d.v != null && <>
              <rect x={cx - larg / 2} y={Y(d.v)} width={larg} height={104 - Y(d.v)} fill={couleur} />
              <text x={cx} y={Y(d.v) - 4} fontSize="10" fill={couleur} textAnchor="middle" fontWeight="700">{Math.round(d.v)}</text>
            </>}
            <text x={cx} y="120" fontSize="9.5" fill="#555" textAnchor="middle">{d.n}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Courbe({ points, couleur }) {
  if (points.length === 0) return <div className="muted" style={{ padding: '30px 0', textAlign: 'center' }}>Aucun RPE sur la période.</div>
  const Y = v => 104 - (v - 1) * 10
  const pas = points.length > 1 ? 250 / (points.length - 1) : 0
  const X = i => points.length > 1 ? 44 + pas * i : 170
  const poly = points.map((p, i) => `${X(i)},${Y(p.rpe)}`).join(' ')
  const etiquettes = points.length <= 14
  return (
    <svg viewBox="0 0 300 130" role="img" aria-label="RPE moyen par entraînement et par match">
      <g strokeWidth="1">{[10, 7, 4, 1].map(v => <line key={v} x1="30" y1={Y(v)} x2="296" y2={Y(v)} stroke={v === 1 ? '#9a9a9a' : '#e3e3e1'} />)}</g>
      <g fontSize="9" fill="#6b6b6b" textAnchor="end">{[10, 7, 4, 1].map(v => <text key={v} x="24" y={Y(v) + 3}>{v}</text>)}</g>
      {points.length > 1 && <polyline fill="none" stroke={couleur} strokeWidth="2" points={poly} />}
      <g fill={couleur}>{points.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.rpe)} r="3.2" />)}</g>
      {etiquettes && <g fontSize="8" fill={couleur} textAnchor="middle" fontWeight="700">{points.map((p, i) => <text key={i} x={X(i)} y={Y(p.rpe) - 6}>{fmt(p.rpe)}</text>)}</g>}
      <g fontSize="8.5" fill="#555" textAnchor="middle">{points.map((p, i) => (i % Math.ceil(points.length / 12) === 0) && <text key={i} x={X(i)} y="120">{Number(p.date.slice(8, 10))}</text>)}</g>
    </svg>
  )
}

const S = {
  retour: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 10 },
  titre: { fontSize: 22, margin: '0 0 4px', color: '#1a1a1a' },
  aide: { fontSize: 13, color: '#6b7280', margin: '0 0 12px' },
  form: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4 },
  lib: { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' },
  input: { padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, background: '#fff', minWidth: 150 },
  btn: { background: '#1a1a1a', color: '#e4f816', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  btnClair: { background: '#fff', color: '#1a1a1a', border: '1.5px solid #1a1a1a', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
}

// Rendu papier : mêmes styles que la maquette validée. Tout est préfixé par
// .bilan-rapport pour ne pas déborder sur le reste de l'app.
const CSS = `
.bilan-rapport{--paper:#fff;--ink:#1b1b1b;--ink-2:#555;--ink-3:#6b6b6b;--line:#e3e3e1;--soft:#f6f6f4;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.5}
.bilan-rapport *{box-sizing:border-box}
.bilan-rapport .page{width:100%;max-width:794px;min-height:1000px;margin:0 auto 22px;background:var(--paper);padding:44px 48px 56px;box-shadow:0 1px 3px rgba(0,0,0,.12);position:relative}
.bilan-rapport .foot{position:absolute;left:48px;right:48px;bottom:18px;display:flex;justify-content:space-between;color:var(--ink-3);font-size:11px;border-top:1px solid var(--line);padding-top:8px}
.bilan-rapport .eyebrow{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.bilan-rapport h1{font-size:30px;line-height:1.1;margin:8px 0 4px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}
.bilan-rapport h2{font-size:15px;margin:26px 0 10px;font-weight:700;color:var(--ink)}
.bilan-rapport h3{font-size:12px;margin:0;font-weight:700;color:var(--ink)}
.bilan-rapport .sub{color:var(--ink-2);font-size:13px}
.bilan-rapport .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:22px}
.bilan-rapport .who{display:flex;gap:16px;align-items:center}
.bilan-rapport .logo{width:62px;height:62px;flex-shrink:0;object-fit:contain}
.bilan-rapport .coach{text-align:right;font-size:11px;color:var(--ink-2)}
.bilan-rapport .kpis{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:6px}
.bilan-rapport .kpi{padding:14px 14px 12px;border-left:1px solid var(--line)}
.bilan-rapport .kpi:first-child{border-left:none}
.bilan-rapport .kpi b{display:block;font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.1}
.bilan-rapport .withtrend{display:flex;align-items:center;gap:10px}
.bilan-rapport .kpi .withtrend > span:first-child{font-size:24px;font-weight:700;line-height:1.1;color:var(--ink)}
.bilan-rapport .tr{display:inline-flex;align-items:center;gap:2px}
.bilan-rapport .tr svg{display:block}
.bilan-rapport .tr i{font-style:normal;font-size:14px;font-weight:700;line-height:1}
.bilan-rapport .kpi span{font-size:11px;color:var(--ink-2)}
.bilan-rapport .kpi small{display:block;margin-top:4px;font-size:11px;color:var(--ink-3)}
.bilan-rapport .two{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.bilan-rapport .chart{border:1px solid var(--line);border-radius:6px;padding:12px 14px}
.bilan-rapport .chart svg{display:block;width:100%;height:auto}
.bilan-rapport table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.bilan-rapport th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600;text-align:left;padding:0 8px 7px 0}
.bilan-rapport th.r,.bilan-rapport td.r{text-align:right}
.bilan-rapport td{padding:8px 8px 8px 0;border-top:1px solid var(--line);vertical-align:top}
.bilan-rapport .blk{margin-bottom:14px;border-left:3px solid var(--club);padding-left:12px}
.bilan-rapport .blk.t{border-left-color:var(--club2)}
.bilan-rapport .blk.m{border-left-color:var(--ink)}
.bilan-rapport .blk .blkt{font-size:12px;font-weight:700;margin-bottom:4px}
.bilan-rapport table.fx{table-layout:fixed}
.bilan-rapport table.opp td{vertical-align:middle}
.bilan-rapport tr.tot td{font-weight:700;border-top:1px solid var(--ink-3)}
.bilan-rapport .foot-note{font-size:11px;color:var(--ink-3);margin:6px 0 0}
.bilan-rapport .day{border:1px solid var(--line);border-radius:6px;margin-bottom:12px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.bilan-rapport .day.mu{border-left:3px solid var(--club)}
.bilan-rapport .day.en{border-left:3px solid var(--club2)}
.bilan-rapport .day.ma{border-left:3px solid var(--ink)}
.bilan-rapport .dayhead{display:flex;justify-content:space-between;align-items:baseline;padding:9px 14px;background:var(--soft);border-bottom:1px solid var(--line)}
.bilan-rapport .dayhead b{font-size:12.5px}
.bilan-rapport .dayhead span{font-size:11px;color:var(--ink-2)}
.bilan-rapport .sec{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--line)}
.bilan-rapport .dayhead + .sec{border-top:none}
.bilan-rapport .sec .k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600;padding-top:2px}
.bilan-rapport .muted{color:var(--ink-3)}
.bilan-rapport .docimg{display:block;width:100%;max-width:420px;border:1px solid var(--line);border-radius:4px;margin-bottom:6px}
@media print{
  @page{size:A4;margin:0}
  body *{visibility:hidden}
  .bilan-rapport,.bilan-rapport *{visibility:visible}
  .bilan-hors-page{display:none!important}
  .bilan-rapport{position:absolute;left:0;top:0;width:100%}
  .bilan-rapport .page{box-shadow:none;margin:0;max-width:none;min-height:0;height:auto;page-break-after:always;break-after:page}
  .bilan-rapport .foot{position:static;margin-top:24px}
  .bilan-rapport{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`
