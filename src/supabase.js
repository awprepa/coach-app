import { createClient } from '@supabase/supabase-js'
import { localDB } from './db'

const _client = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_KEY
)

// ── Tables dont la clé primaire n'est pas "id" ────────────────────────────
const TABLE_PK = { app_settings: 'key' }
function pk(table) { return TABLE_PK[table] || 'id' }

// ── Proxy builder (intercepte chaque query supabase) ──────────────────────
class OfflineBuilder {
  constructor(real, table) {
    this._real    = real
    this._table   = table
    this._op      = 'select'
    this._payload = null
    this._filters = []
    this._order   = null
    this._limitN  = null
    this._single  = false
    this._maybe   = false
  }

  // Passthrough — méthodes de filtrage
  select(c = '*')         { this._real = this._real.select(c);       return this }
  eq(c, v)                { this._real = this._real.eq(c, v);        this._filters.push({ t:'eq',  c, v  }); return this }
  neq(c, v)               { this._real = this._real.neq(c, v);       this._filters.push({ t:'neq', c, v  }); return this }
  in(c, vs)               { this._real = this._real.in(c, vs);       this._filters.push({ t:'in',  c, vs }); return this }
  gte(c, v)               { this._real = this._real.gte(c, v);       this._filters.push({ t:'gte', c, v  }); return this }
  lte(c, v)               { this._real = this._real.lte(c, v);       this._filters.push({ t:'lte', c, v  }); return this }
  gt(c, v)                { this._real = this._real.gt(c, v);        return this }
  lt(c, v)                { this._real = this._real.lt(c, v);        return this }
  not(c, op, v)           { this._real = this._real.not(c, op, v);   return this }
  or(f, opts)             { this._real = this._real.or(f, opts);     return this }
  filter(c, op, v)        { this._real = this._real.filter(c, op, v); return this }
  contains(c, v)          { this._real = this._real.contains(c, v);  return this }
  overlaps(c, v)          { this._real = this._real.overlaps(c, v);  return this }
  textSearch(c, q, opts)  { this._real = this._real.textSearch(c, q, opts); return this }
  match(q)                { this._real = this._real.match(q);        return this }
  is(c, v)                { this._real = this._real.is(c, v);        return this }
  order(c, opts)          { this._real = this._real.order(c, opts);  this._order = { c, asc: opts?.ascending !== false }; return this }
  limit(n)                { this._real = this._real.limit(n);        this._limitN = n; return this }
  range(f, t)             { this._real = this._real.range(f, t);     return this }
  single()                { this._real = this._real.single();        this._single = true; return this }
  maybeSingle()           { this._real = this._real.maybeSingle();   this._maybe  = true; return this }
  returns()               { return this }
  throwOnError()          { return this }

  // Mutations
  insert(p, opts)   { this._op = 'insert'; this._payload = p; this._real = this._real.insert(p, opts); return this }
  update(p)         { this._op = 'update'; this._payload = p; this._real = this._real.update(p); return this }
  delete()          { this._op = 'delete';                     this._real = this._real.delete();   return this }
  upsert(p, opts)   { this._op = 'upsert'; this._payload = p; this._onConflict = opts?.onConflict || null; this._real = this._real.upsert(p, opts); return this }

  // ── Application locale des filtres ─────────────────────────────────────
  _filter(rows) {
    let r = rows
    for (const f of this._filters) {
      if (f.t === 'eq')  r = r.filter(x => String(x[f.c]) === String(f.v))
      if (f.t === 'neq') r = r.filter(x => String(x[f.c]) !== String(f.v))
      if (f.t === 'in')  r = r.filter(x => f.vs.includes(x[f.c]))
      if (f.t === 'gte') r = r.filter(x => x[f.c] >= f.v)
      if (f.t === 'lte') r = r.filter(x => x[f.c] <= f.v)
    }
    if (this._order) {
      const { c, asc } = this._order
      r = [...r].sort((a, b) => {
        const [av, bv] = [a[c], b[c]]
        if (av == null) return 1; if (bv == null) return -1
        return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
      })
    }
    if (this._limitN) r = r.slice(0, this._limitN)
    return r
  }

  _shape(rows) {
    if (this._single) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } }
    if (this._maybe)  return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  // ── Promise interface ───────────────────────────────────────────────────
  then(ok, fail) { return this._exec().then(ok, fail) }
  catch(fail)    { return this._exec().catch(fail) }

  async _exec() {
    const isMut = ['insert','update','delete','upsert'].includes(this._op)

    if (navigator.onLine) {
      try {
        const res = await this._real
        if (!res.error) {
          // Cache les résultats SELECT
          if (this._op === 'select' && res.data) {
            _cacheRows(this._table, Array.isArray(res.data) ? res.data : [res.data]).catch(() => {})
          }
          // Met à jour le cache local après mutation réussie
          if (isMut && res.data) {
            _applyLocal(this._table, this._op, res.data, this._filters).catch(() => {})
          }
          // Vide la queue de sync si on était en retard
          if (isMut) {
            _flushQueue().catch(() => {})
            // Purge le cache API (SW) de cette table → prochaine lecture fraîche,
            // pour ne pas voir sa propre modif en retard avec le stale-while-revalidate
            try {
              navigator.serviceWorker?.controller?.postMessage({
                type: 'INVALIDATE_API_CACHE', table: this._table,
              })
            } catch {}
          }
        }
        return res
      } catch {
        // Réseau coupé malgré navigator.onLine → mode offline
        return isMut ? this._offlineMut() : this._offlineRead()
      }
    }

    return isMut ? this._offlineMut() : this._offlineRead()
  }

  // Lecture depuis Dexie
  async _offlineRead() {
    try {
      const tbl = localDB.tables.find(t => t.name === this._table)
      if (!tbl) return this._shape([])
      const rows = this._filter(await tbl.toArray())
      return this._shape(rows)
    } catch {
      return this._shape([])
    }
  }

  // Écriture locale + file d'attente
  async _offlineMut() {
    const { _table: table, _op: op, _payload: payload, _filters: filters } = this
    let localData = null

    try {
      const tbl = localDB.tables.find(t => t.name === table)
      const pkField = pk(table)

      if (op === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map(r => ({
          ...r, [pkField]: r[pkField] || crypto.randomUUID(), _offline: true,
        }))
        if (tbl) await tbl.bulkPut(rows)
        localData = rows.length === 1 ? rows[0] : rows

      } else if (op === 'upsert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map(r => ({ ...r, _offline: true }))
        if (tbl) await tbl.bulkPut(rows)
        localData = rows.length === 1 ? rows[0] : rows

      } else if (op === 'update') {
        if (tbl) {
          const all = await tbl.toArray()
          const targets = this._filter(all)
          const updated = targets.map(r => ({ ...r, ...payload, _offline: true }))
          await tbl.bulkPut(updated)
          localData = updated
        }

      } else if (op === 'delete') {
        if (tbl) {
          const all = await tbl.toArray()
          const targets = this._filter(all)
          const keys = targets.map(r => r[pkField]).filter(Boolean)
          if (keys.length) await tbl.bulkDelete(keys)
          localData = targets
        }
      }
    } catch (e) {
      console.warn('[offline] mutation locale échouée', e)
    }

    // Ajoute à la queue de sync
    await localDB._sync_queue.add({
      table, operation: op,
      payload:    JSON.stringify(payload),
      filters:    JSON.stringify(filters),
      onConflict: this._onConflict || null,   // préserve l'upsert onConflict pour le replay
      timestamp:  Date.now(),
    })

    // Notifie l'UI
    window.dispatchEvent(new CustomEvent('aw:queue-updated'))

    const d = this._single
      ? (Array.isArray(localData) ? localData[0] : localData)
      : (localData == null ? [] : Array.isArray(localData) ? localData : [localData])

    return { data: d ?? null, error: null, _offline: true }
  }
}

// ── Helpers cache ─────────────────────────────────────────────────────────
async function _cacheRows(table, rows) {
  try {
    const tbl = localDB.tables.find(t => t.name === table)
    if (!tbl || !rows.length) return
    await tbl.bulkPut(rows)
  } catch {}
}

async function _applyLocal(table, op, resultData, filters) {
  try {
    const tbl = localDB.tables.find(t => t.name === table)
    if (!tbl) return
    const rows = Array.isArray(resultData) ? resultData : [resultData]
    if (op === 'insert' || op === 'upsert' || op === 'update') {
      await tbl.bulkPut(rows)
    } else if (op === 'delete') {
      const pkField = pk(table)
      const keys = rows.map(r => r[pkField]).filter(Boolean)
      if (keys.length) await tbl.bulkDelete(keys)
    }
  } catch {}
}

// ── Flush de la queue vers Supabase ──────────────────────────────────────
export async function _flushQueue() {
  const queue = await localDB._sync_queue.orderBy('timestamp').toArray()
  if (!queue.length) return

  for (const item of queue) {
    try {
      const payload = JSON.parse(item.payload)
      const filters  = JSON.parse(item.filters)
      let b = _client.from(item.table)

      if (item.operation === 'insert') b = b.insert(payload).select()
      else if (item.operation === 'upsert') b = b.upsert(payload, item.onConflict ? { onConflict: item.onConflict } : undefined).select()
      else if (item.operation === 'update') {
        b = b.update(payload)
        for (const f of filters) if (f.t === 'eq') b = b.eq(f.c, f.v)
        b = b.select()
      } else if (item.operation === 'delete') {
        b = b.delete()
        for (const f of filters) if (f.t === 'eq') b = b.eq(f.c, f.v)
      }

      const { error } = await b
      if (!error) {
        await localDB._sync_queue.delete(item.id)
        window.dispatchEvent(new CustomEvent('aw:queue-updated'))
      }
    } catch (e) {
      console.warn('[sync] item échoué, conservé en queue', e)
    }
  }
}

// ── Sync descendant : Supabase → Dexie ───────────────────────────────────
const SYNC_TABLES = [
  'clients','categories','programmes','seances','exercices',
  'serie_tracking','wellness','charges','bibliotheque_exercices',
  'echauffements_templates','seances_libres_exercices','seances_libres_series',
  'rpe_seances','seance_commentaires','factures','paiements','app_settings',
  'tests_types','tests_resultats','evenements','programme_templates',
  'programme_template_seances','seance_templates','gps_rapports',
  'consents','acceptations_contrat','groupes',
]

export async function syncDown() {
  if (!navigator.onLine) return
  console.log('[sync] ↓ pull Supabase → Dexie')
  for (const table of SYNC_TABLES) {
    try {
      const { data, error } = await _client.from(table).select('*')
      if (!error && data?.length) {
        const tbl = localDB.tables.find(t => t.name === table)
        if (tbl) {
          await tbl.clear()
          await tbl.bulkPut(data)
        }
      }
    } catch {}
  }
  await localDB._sync_meta.put({ table: '__all__', lastSync: Date.now() })
  console.log('[sync] ↓ terminé')
}

// ── Warm sync : remplit la base locale au démarrage (Phase 3) ──────────────
// Ne relance pas si une synchro a eu lieu récemment (évite de tout retélécharger
// à chaque ouverture). Garantit des données locales pour une vraie coupure.
export async function maybeSyncDown(maxAgeMs = 10 * 60 * 1000) {
  if (!navigator.onLine) return
  try {
    const meta = await localDB._sync_meta.get('__all__')
    if (meta?.lastSync && Date.now() - meta.lastSync < maxAgeMs) return
  } catch {}
  await syncDown()
}

// ── Reconnexion → flush + resync ──────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    console.log('[offline] connexion rétablie')
    await _flushQueue()
    // Resync throttlé (10 min) : le réseau mobile bascule souvent online/offline,
    // retélécharger toutes les tables à chaque fois serait très lourd.
    await maybeSyncDown()
    window.dispatchEvent(new CustomEvent('aw:synced'))
  })
}

// ── Compte des actions en attente ─────────────────────────────────────────
export async function pendingCount() {
  return localDB._sync_queue.count()
}

// ── Export principal : le client proxifié ─────────────────────────────────
export const supabase = new Proxy(_client, {
  get(target, prop) {
    if (prop === 'from') return (table) => new OfflineBuilder(target.from(table), table)
    const val = target[prop]
    return typeof val === 'function' ? val.bind(target) : val
  },
})
