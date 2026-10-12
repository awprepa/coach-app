import React from 'react'

export const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S']            // index getDay()
export const MOIS_LABEL = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

// Types d'évènement.
//  - les 3 premiers sont proposés à la création (CREATE_TYPES)
//  - les suivants restent gérés pour l'affichage des données existantes (legacy)
export const TYPES = {
  match:        { label: 'Match',        color: null,      solid: 'group' }, // couleur du groupe
  entrainement: { label: 'Entraînement', color: '#6b94a3' },
  muscu:        { label: 'Musculation',  color: '#b08769' },
  // legacy (affichage seulement) :
  collectif:    { label: 'Collectif',    color: '#98a2ad', neutral: true },
  vitesse:      { label: 'Vitesse',      color: '#6b94a3' },
  prevention:   { label: 'Prévention',   color: '#8c7ea6', short: 'Activ.' },
  recup:        { label: 'Récup',        color: null,      blank: true },
  test:         { label: 'Tests',        color: '#454c57', dark: true },
  autre:        { label: 'Autre',        color: '#9aa1ac' },
}
export const CREATE_TYPES = ['entrainement', 'match', 'muscu']
export const MATCH_CATEGORIES = ['Amical', 'Championnat', 'Coupe', 'Phases finales']
// Couleur de fond par catégorie de match (null = couleur du groupe)
export const MATCH_CAT_COLORS = {
  Amical:           '#64748b',  // gris ardoise — match amical, faible enjeu
  Championnat:      null,        // couleur du groupe
  Coupe:            '#d97706',  // ambre — coupe
  'Phases finales': '#dc2626',  // rouge — playoffs / finale
}
export function matchCatColor(categorie, groupColor) {
  const c = MATCH_CAT_COLORS[categorie]
  return (c === undefined || c === null) ? groupColor : c
}
// Planification entraînement
export const STYLE_COLORS = { 'Modéré': '#059669', 'Vitesse': '#d97706', 'Volume': '#2563eb' }
export const THEMES_SEANCE = ['Mêlée', 'Touche', 'Attaque collective', 'Défense collective', 'Jeu au sol', 'Jeu groupé', 'Vitesse / Vivacité', 'Skills individuels', 'Prévention / Récup', 'Analyse vidéo']
export const CONTACT_LEVELS = [
  { label: 'Aucun contact',    desc: '' },
  { label: 'Ceinturé / bloqué', desc: 'Saisie sans plaquage complet' },
  { label: 'Contact contrôlé', desc: 'Plaquages maîtrisés, intensité partielle' },
  { label: 'Plein contact',    desc: 'Plaquages réels, exercice structuré' },
  { label: 'Opposition libre', desc: 'Jeu libre, intensité match' },
]
export const COURSE_VOLUMES    = ['Faible', 'Modéré', 'Élevé', 'Très élevé']
export const COURSE_INTENSITES = ['Légère', 'Haute intensité', 'Très haute intensité', 'Vitesse maximale']
// types qui ont un déroulé en blocs/exercices
export const HAS_BLOCS = ['entrainement', 'muscu', 'vitesse', 'prevention', 'recup', 'autre']

export const ymd = (y, m, d) => `${y}-${m}-${d}`                  // clé interne (m 0-based)
export const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Numéro de semaine ISO 8601 (semaine commençant le lundi, S1 = semaine du 1er jeudi de l'année)
export function isoWeek(y, m, d) {
  const date = new Date(Date.UTC(y, m, d))
  const day = (date.getUTCDay() + 6) % 7        // 0 = lundi … 6 = dimanche
  date.setUTCDate(date.getUTCDate() - day + 3)  // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const fday = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3)
  return 1 + Math.round((date - firstThursday) / (7 * 86400000))
}

// 12 mois Juillet(start) → Juin(start+1)
export function buildMonths(startYear) {
  const out = []
  for (let i = 0; i < 12; i++) {
    const m = (6 + i) % 12
    const y = startYear + (6 + i >= 12 ? 1 : 0)
    out.push({ y, m, label: MOIS_LABEL[m], days: new Date(y, m + 1, 0).getDate() })
  }
  return out
}
export function seasonStartYear(date = new Date()) {
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
}


// Palette pour distinguer les groupes (ex: "Avants"/"3/4") dans les blocs à colonnes
export const GROUP_COLORS = ['#0f766e', '#7c3aed', '#be123c', '#0369a1', '#a16207', '#4d7c0f']
