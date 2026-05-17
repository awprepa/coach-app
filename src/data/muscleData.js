// Définition des 14 groupes musculaires
export const MUSCLES = {
  pectoraux:       { label: 'Pectoraux',        view: 'front' },
  epaules:         { label: 'Épaules',           view: 'both'  },
  biceps:          { label: 'Biceps',            view: 'front' },
  triceps:         { label: 'Triceps',           view: 'back'  },
  avant_bras:      { label: 'Avant-bras',        view: 'front' },
  abdominaux:      { label: 'Abdominaux',        view: 'front' },
  obliques:        { label: 'Obliques',          view: 'front' },
  trapezes:        { label: 'Trapèzes',          view: 'back'  },
  dorsaux:         { label: 'Dorsaux',           view: 'back'  },
  lombaires:       { label: 'Lombaires',         view: 'back'  },
  fessiers:        { label: 'Fessiers',          view: 'back'  },
  quadriceps:      { label: 'Quadriceps',        view: 'front' },
  ischio_jambiers: { label: 'Ischio-jambiers',   view: 'back'  },
  mollets:         { label: 'Mollets',           view: 'back'  },
}

export const EXERCISE_DICTIONARY = [
  // Squats
  {
    keywords: ['squat bulgare', 'bulgare', 'split squat'],
    primary: ['quadriceps', 'fessiers'],
    secondary: ['ischio_jambiers', 'lombaires', 'abdominaux'],
  },
  {
    keywords: ['gobelet', 'goblet squat'],
    primary: ['quadriceps', 'fessiers'],
    secondary: ['ischio_jambiers', 'lombaires', 'abdominaux'],
  },
  {
    keywords: ['squat sumo', 'sumo squat'],
    primary: ['quadriceps', 'fessiers'],
    secondary: ['ischio_jambiers', 'lombaires', 'abdominaux'],
  },
  {
    keywords: ['squat avant', 'front squat'],
    primary: ['quadriceps', 'fessiers'],
    secondary: ['ischio_jambiers', 'lombaires', 'abdominaux'],
  },
  {
    keywords: ['squat barre', 'back squat', 'squat'],
    primary: ['quadriceps', 'fessiers'],
    secondary: ['ischio_jambiers', 'lombaires', 'abdominaux'],
  },

  // Soulevé de terre roumain (avant soulevé de terre générique)
  {
    keywords: ['soulevé de terre roumain', 'sdt roumain', 'rdl', 'roumain', 'romanian deadlift'],
    primary: ['ischio_jambiers', 'fessiers'],
    secondary: ['lombaires', 'dorsaux'],
  },
  // Soulevé de terre
  {
    keywords: ['soulevé de terre', 'sdt', 'deadlift'],
    primary: ['dorsaux', 'fessiers', 'ischio_jambiers'],
    secondary: ['lombaires', 'trapezes', 'quadriceps'],
  },

  // Hip thrust / pont fessier
  {
    keywords: ['hip thrust', 'pont fessier', 'hip extension'],
    primary: ['fessiers'],
    secondary: ['ischio_jambiers', 'lombaires', 'quadriceps'],
  },

  // Good morning
  {
    keywords: ['goodmorning', 'good morning'],
    primary: ['ischio_jambiers', 'lombaires'],
    secondary: ['fessiers'],
  },

  // Fentes
  {
    keywords: ['fente avant', 'fente arriere', 'fente marche', 'fente marchee', 'fente'],
    primary: ['quadriceps', 'fessiers'],
    secondary: ['ischio_jambiers', 'mollets'],
  },

  // Développé couché / bench
  {
    keywords: ['développé couche', 'developpe couche', 'bench press', 'dumbbell press', 'pec deck', 'chest press'],
    primary: ['pectoraux', 'triceps'],
    secondary: ['epaules'],
  },

  // Développé incliné
  {
    keywords: ['développé incline', 'developpe incline', 'incline press', 'incline bench'],
    primary: ['pectoraux', 'triceps'],
    secondary: ['epaules'],
  },

  // Développé militaire / overhead
  {
    keywords: ['développé militaire', 'developpe militaire', 'military press', 'push press', 'overhead press', 'ohp', 'arnold press', 'arnold'],
    primary: ['epaules', 'triceps'],
    secondary: ['trapezes', 'pectoraux'],
  },

  // Tractions / pull-up
  {
    keywords: ['tractions', 'pull-up', 'pullup', 'chin-up', 'chinup', 'pull up', 'chin up'],
    primary: ['dorsaux', 'biceps'],
    secondary: ['epaules', 'trapezes', 'avant_bras'],
  },

  // Rowing / tirage horizontal
  {
    keywords: ['rowing barre', 'rowing haltere', 'rowing machine', 'tirage horizontal', 'pendlay', 'row', 'rowing'],
    primary: ['dorsaux', 'trapezes'],
    secondary: ['biceps', 'epaules', 'lombaires'],
  },

  // Tirage vertical / lat pulldown
  {
    keywords: ['tirage nuque', 'tirage vertical', 'lat pulldown', 'pulldown'],
    primary: ['dorsaux', 'biceps'],
    secondary: ['epaules', 'trapezes'],
  },

  // Dips
  {
    keywords: ['dips'],
    primary: ['triceps', 'pectoraux'],
    secondary: ['epaules'],
  },

  // Curl biceps
  {
    keywords: ['curl barre', 'curl haltere', 'marteau', 'hammer curl', 'curl biceps', 'bicep curl', 'curl'],
    primary: ['biceps'],
    secondary: ['avant_bras'],
  },

  // Extension triceps
  {
    keywords: ['skull crusher', 'barre front', 'pousse triceps', 'poussée triceps', 'extension triceps', 'triceps extension', 'cable triceps', 'pushdown'],
    primary: ['triceps'],
    secondary: ['avant_bras'],
  },

  // Élévation latérale
  {
    keywords: ['élévation latérale', 'elevation laterale', 'lateral raise', 'oiseau', 'rear delt'],
    primary: ['epaules'],
    secondary: ['trapezes'],
  },

  // Face pull / tirage au menton
  {
    keywords: ['face pull', 'tirage au menton', 'upright row', 'tirage menton'],
    primary: ['epaules', 'trapezes'],
    secondary: ['biceps'],
  },

  // Gainage / planche
  {
    keywords: ['gainage', 'planche', 'hollow body', 'plank'],
    primary: ['abdominaux', 'lombaires'],
    secondary: ['epaules', 'fessiers'],
  },

  // Crunch / sit-up
  {
    keywords: ['crunch', 'sit-up', 'situp', 'ab crunch'],
    primary: ['abdominaux'],
    secondary: ['obliques'],
  },

  // Russian twist
  {
    keywords: ['russian twist', 'twist'],
    primary: ['obliques'],
    secondary: ['abdominaux'],
  },

  // Leg press
  {
    keywords: ['leg press'],
    primary: ['quadriceps'],
    secondary: ['fessiers', 'ischio_jambiers'],
  },

  // Leg curl
  {
    keywords: ['leg curl', 'curl jambes', 'curl cuisses'],
    primary: ['ischio_jambiers'],
    secondary: ['fessiers', 'mollets'],
  },

  // Leg extension
  {
    keywords: ['leg extension', 'extension jambes', 'extension cuisses'],
    primary: ['quadriceps'],
    secondary: [],
  },

  // Mollets / calf raise
  {
    keywords: ['mollets', 'calf raise', 'calf'],
    primary: ['mollets'],
    secondary: [],
  },

  // GHD / glute ham raise / nordique
  {
    keywords: ['ghd', 'glute ham raise', 'nordique', 'nordic curl', 'nordic hamstring'],
    primary: ['ischio_jambiers', 'fessiers'],
    secondary: ['lombaires'],
  },

  // Épaulé / clean
  {
    keywords: ['épaulé', 'epaule', 'clean', 'power clean', 'épaulé jeté'],
    primary: ['fessiers', 'ischio_jambiers'],
    secondary: ['quadriceps', 'epaules', 'trapezes', 'dorsaux'],
  },

  // Arraché / snatch
  {
    keywords: ['arraché', 'arrache', 'snatch', 'power snatch'],
    primary: ['fessiers', 'ischio_jambiers', 'epaules'],
    secondary: ['quadriceps', 'trapezes', 'dorsaux'],
  },

  // Kettlebell swing
  {
    keywords: ['kettlebell swing', 'kb swing', 'swing'],
    primary: ['fessiers', 'ischio_jambiers'],
    secondary: ['lombaires', 'epaules', 'abdominaux'],
  },

  // Burpee
  {
    keywords: ['burpee'],
    primary: ['quadriceps', 'pectoraux', 'epaules'],
    secondary: ['abdominaux', 'fessiers'],
  },

  // Saut / box jump
  {
    keywords: ['box jump', 'squat jump', 'saut vertical', 'saut'],
    primary: ['quadriceps', 'mollets', 'fessiers'],
    secondary: ['ischio_jambiers'],
  },

  // Sprint / course
  {
    keywords: ['sprint', 'course', 'running'],
    primary: ['quadriceps', 'ischio_jambiers', 'mollets'],
    secondary: ['fessiers'],
  },

  // Corde à sauter
  {
    keywords: ['corde a sauter', 'corde à sauter', 'jump rope', 'sauter a la corde'],
    primary: ['mollets', 'quadriceps'],
    secondary: ['epaules', 'abdominaux'],
  },

  // Pompe / push-up
  {
    keywords: ['pompes', 'pompe', 'push-up', 'pushup', 'push up'],
    primary: ['pectoraux', 'triceps'],
    secondary: ['epaules', 'abdominaux'],
  },
]

export function findMuscles(nom) {
  // Normalize : lowercase + supprime accents
  const n = nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

  // Cherche la meilleure entrée (celle avec le plus de keywords qui matchent)
  let best = null, bestScore = 0
  for (const entry of EXERCISE_DICTIONARY) {
    for (const kw of entry.keywords) {
      const kwn = kw.normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (n.includes(kwn) || kwn.includes(n)) {
        // Score = longueur du keyword (favorise les matches précis)
        const score = kwn.length
        if (score > bestScore) { best = entry; bestScore = score }
      }
    }
  }
  if (!best) return null
  return { primary: best.primary, secondary: best.secondary || [] }
}
