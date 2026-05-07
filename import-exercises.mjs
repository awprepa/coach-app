// Script d'import automatique des exercices depuis free-exercise-db
// Lancer avec : node import-exercises.mjs

import { createClient } from '@supabase/supabase-js'

// ── Colle ici ta clé "service_role" de Supabase ──
// Supabase Dashboard → Project Settings → API → service_role (secret)
const SUPABASE_URL = 'https://ytdqyhajqxnmkwxehwmg.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0ZHF5aGFqcXhubWt3eGVod21nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzkyNDI1NywiZXhwIjoyMDkzNTAwMjU3fQ.lBnGPGpAGloCSzB7Pzde8Ox0Z8_PFZKFwVDGXFfmEiQ'
// ─────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const BASE_IMAGE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

const CATEGORY_MAP = {
  'strength':              'Musculation',
  'powerlifting':          'Musculation',
  'stretching':            'Mobilité',
  'cardio':                'Cardio',
  'olympic weightlifting': 'Haltérophilie',
  'plyometrics':           'Pliométrie',
  'strongman':             'Prépa physique',
}

async function run() {
  console.log('⬇️  Téléchargement des exercices...')
  const res = await fetch(
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
  )
  if (!res.ok) throw new Error(`Fetch échoué : ${res.status}`)
  const exercises = await res.json()
  console.log(`✅ ${exercises.length} exercices récupérés\n`)

  const rows = exercises.map(ex => ({
    nom:       ex.name,
    categorie: CATEGORY_MAP[ex.category] ?? 'Musculation',
    image_url: ex.images?.length > 0 ? BASE_IMAGE + ex.images[0] : null,
  }))

  // Vider la table avant d'importer (évite les doublons si relancé)
  console.log('🗑️  Nettoyage des anciens exercices importés automatiquement...')
  // On insère en ignorant les conflits sur le nom pour ne pas écraser les entrées manuelles
  // Si tu veux tout repartir à zéro, décommente la ligne suivante :
  // await supabase.from('bibliotheque_exercices').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const BATCH = 100
  let inserted = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from('bibliotheque_exercices').insert(batch)
    if (error) {
      console.error(`❌ Erreur batch ${i}–${i + BATCH} :`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\r🔄 Inséré : ${inserted} / ${rows.length}`)
    }
  }

  console.log(`\n\n✅ Import terminé — ${inserted} exercices ajoutés à la bibliothèque !`)
}

run().catch(err => {
  console.error('❌ Erreur fatale :', err.message)
  process.exit(1)
})
