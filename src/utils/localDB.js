// ── Base de données locale (IndexedDB) pour le mode hors ligne ───────────────
// Stocke les données des séances, programmes et clients pour un accès offline.

const DB_NAME = 'awprepa-local-v1'
const DB_VER  = 2   // v2 ajoute le store 'programmes'

const STORES = {
  SEANCES:     'seances',
  PROGRAMMES:  'programmes',
  CLIENT:      'client',
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORES.SEANCES))
        db.createObjectStore(STORES.SEANCES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORES.PROGRAMMES))
        db.createObjectStore(STORES.PROGRAMMES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORES.CLIENT))
        db.createObjectStore(STORES.CLIENT, { keyPath: 'key' })
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = () => reject(req.error)
  })
}

// ── Helpers génériques ────────────────────────────────────────────────────────

async function put(storeName, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value)
    tx.oncomplete = resolve
    tx.onerror    = () => reject(tx.error)
  })
}

async function get(storeName, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror   = () => reject(req.error)
  })
}

async function getAll(storeName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror   = () => reject(req.error)
  })
}

// ── API Séances ───────────────────────────────────────────────────────────────

/**
 * Sauvegarde toutes les données d'une séance (appelé après un chargement réseau réussi).
 * @param {string} seanceId
 * @param {{ seance, exercices, charges, rpeSeances, semaines, semaineActuelle, tracking, warmupTracking, commentaires, echauffement }} data
 */
export async function saveSeanceLocally(seanceId, data) {
  await put(STORES.SEANCES, { id: seanceId, ...data, savedAt: Date.now() })
}

/**
 * Charge les données d'une séance depuis IndexedDB.
 * Retourne null si aucune donnée locale.
 */
export async function loadSeanceLocally(seanceId) {
  return get(STORES.SEANCES, seanceId)
}

// ── API Programmes ────────────────────────────────────────────────────────────

/**
 * Sauvegarde un programme + sa liste de séances.
 */
export async function saveProgrammeLocally(programmeId, data) {
  await put(STORES.PROGRAMMES, { id: programmeId, ...data, savedAt: Date.now() })
}

export async function loadProgrammeLocally(programmeId) {
  return get(STORES.PROGRAMMES, programmeId)
}

// ── API Données client (AccueilClient) ────────────────────────────────────────

export async function saveClientDataLocally(data) {
  await put(STORES.CLIENT, { key: 'home', ...data, savedAt: Date.now() })
}

export async function loadClientDataLocally() {
  return get(STORES.CLIENT, 'home')
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

/** Indique si des données locales existent pour une séance */
export async function hasLocalSeance(seanceId) {
  const d = await loadSeanceLocally(seanceId)
  return !!d
}

/** Date de la dernière sauvegarde locale d'une séance (pour afficher "mis à jour il y a X") */
export function formatSavedAt(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 2)   return 'à l\'instant'
  if (hours < 1)  return `il y a ${mins} min`
  if (days < 1)   return `il y a ${hours}h`
  return `il y a ${days}j`
}
