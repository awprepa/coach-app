import { supabase } from '../supabase'

// « Développé couché (B) » et « MAX Développé couché » → « developpe couche »
export const cleTest = nom => (nom || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b(max|1rm|test)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

// Test « MAX … » correspondant à un exercice ; créé s'il n'existe pas encore
export async function testPourExercice(nomExercice) {
  const cle = cleTest(nomExercice)
  const { data: types } = await supabase.from('tests_types').select('id, nom, unite')
  const existant = (types || []).find(t => cleTest(t.nom) === cle)
  if (existant) return existant
  const propre = (nomExercice || 'Exercice').replace(/\([^)]*\)/g, '').trim()
  const { data, error } = await supabase.from('tests_types')
    .insert({ nom: `MAX ${propre}`, unite: 'kg' }).select('id, nom, unite').single()
  if (error) throw error
  return data
}
