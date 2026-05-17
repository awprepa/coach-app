// ── File d'attente offline pour les charges de séance ────────────────────────
// Stocke les mutations en IndexedDB quand l'utilisateur est hors ligne,
// et les rejoue dès que la connexion revient.

const DB_NAME  = 'awprepa-offline-v1'
const DB_VER   = 1
const STORE    = 'charge-queue'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = () => reject(req.error)
  })
}

/** Ajoute une mutation en attente */
export async function enqueueCharge(mutation) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add({ ...mutation, queuedAt: Date.now() })
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

/** Lit toutes les mutations en attente */
export async function getQueue() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

/** Supprime une mutation par id */
export async function dequeue(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = resolve
    tx.onerror    = () => reject(tx.error)
  })
}

/**
 * Rejoue toutes les mutations en attente via l'instance Supabase.
 * Appelé au retour en ligne (événement "online") et au montage de SeanceClient.
 * Retourne le nombre de mutations rejouées avec succès.
 */
export async function processQueue(supabase) {
  const queue = await getQueue()
  if (!queue.length) return 0

  let synced = 0
  for (const item of queue) {
    try {
      if (item.existingChargeId) {
        // UPDATE
        const { error } = await supabase
          .from('charges')
          .update({ [item.field]: item.value || null })
          .eq('id', item.existingChargeId)
        if (error) throw error
      } else {
        // UPSERT (insert ou update si doublon exercice_id + semaine)
        const { error } = await supabase
          .from('charges')
          .upsert({
            exercice_id: item.exerciceId,
            semaine:     item.semaine,
            [item.field]: item.value || null,
          }, { onConflict: 'exercice_id,semaine' })
        if (error) throw error
      }
      await dequeue(item.id)
      synced++
    } catch (err) {
      console.warn('[offlineQueue] échec sync item', item.id, err)
      // On laisse l'item en queue pour la prochaine tentative
    }
  }
  return synced
}

/** Nombre d'items en attente (pour badge UI) */
export async function pendingCount() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}
