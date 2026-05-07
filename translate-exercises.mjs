// Traduit les noms des exercices anglais → français en conservant les images
// Lancer avec : node translate-exercises.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ytdqyhajqxnmkwxehwmg.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0ZHF5aGFqcXhubWt3eGVod21nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzkyNDI1NywiZXhwIjoyMDkzNTAwMjU3fQ.lBnGPGpAGloCSzB7Pzde8Ox0Z8_PFZKFwVDGXFfmEiQ'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Dictionnaire anglais → français ──────────────────────────────────────────
const T = {
  // ABDOMINAUX / GAINAGE
  'Ab Wheel': 'Roue abdominale',
  'Ab Wheel Rollout': 'Roue abdominale',
  'Bicycle Crunch': 'Crunch vélo',
  'Cable Crunch': 'Crunch poulie',
  'Crunch': 'Crunch',
  'Cross Body Crunch': 'Crunch croisé',
  'Decline Crunch': 'Crunch décliné',
  'Dragon Flag': 'Dragon flag',
  'Flutter Kick': 'Battements de pieds',
  'Hanging Knee Raise': 'Relevé de genoux suspendu',
  'Hanging Leg Raise': 'Relevé de jambes suspendu',
  'Hollow Rock': 'Hollow rock',
  'Jackknife Sit-Up': 'Jackknife sit-up',
  'Kneeling Cable Crunch': 'Crunch poulie à genoux',
  'L-Sit': 'L-sit',
  'Leg Raise': 'Relevé de jambes',
  'Mountain Climber': 'Mountain climber',
  'Oblique Crunch': 'Crunch oblique',
  'Pallof Press': 'Pallof press',
  'Plank': 'Planche',
  'Russian Twist': 'Rotation russe',
  'Side Plank': 'Planche latérale',
  'Sit-Up': 'Sit-up',
  'Decline Sit-Up': 'Sit-up décliné',
  'Superman': 'Superman',
  'Toe Touch': 'Toucher des orteils',
  'Tuck Crunch': 'Crunch genoux groupés',
  'V-Up': 'V-up',
  'Windmill': 'Windmill',

  // DOS
  'Barbell Row': 'Rowing barre',
  'Barbell Bent Over Row': 'Rowing barre penché',
  'Bent Over Barbell Row': 'Rowing barre penché',
  'Bent Over One-Arm Long Bar Row': 'Rowing unilatéral barre longue',
  'Cable Row': 'Rowing câble',
  'Chin-Up': 'Traction supination',
  'Close-Grip Pull-Down': 'Tirage prise serrée',
  'Deadlift': 'Soulevé de terre',
  'Dumbbell Row': 'Rowing haltère',
  'Face Pull': 'Face pull',
  'Good Morning': 'Good morning',
  'Hyperextension': 'Hyperextension',
  'Inverted Row': 'Rowing inversé',
  'Lat Pulldown': 'Tirage vertical poitrine',
  'Pull-Up': 'Traction',
  'Pull Up': 'Traction',
  'Pullup': 'Traction',
  'Rack Pull': 'Rack pull',
  'Renegade Row': 'Renegade row',
  'Romanian Deadlift': 'Soulevé de terre roumain',
  'Seated Cable Row': 'Rowing câble assis',
  'Shrug': 'Haussement d\'épaules',
  'Barbell Shrug': 'Haussement d\'épaules barre',
  'Dumbbell Shrug': 'Haussement d\'épaules haltères',
  'Single Arm Dumbbell Row': 'Rowing haltère unilatéral',
  'One Arm Dumbbell Row': 'Rowing haltère unilatéral',
  'Straight Arm Pulldown': 'Tirage poulie bras tendus',
  'T-Bar Row': 'Rowing T-barre',
  'Wide-Grip Lat Pulldown': 'Tirage vertical prise large',
  'Wide-Grip Pull-Up': 'Traction prise large',
  'Pendlay Row': 'Pendlay row',
  'Stiff Leg Deadlift': 'Soulevé de terre jambes tendues',
  'Trap Bar Deadlift': 'Soulevé de terre trap bar',
  'Sumo Deadlift': 'Soulevé de terre sumo',

  // PECTORAUX
  'Barbell Bench Press': 'Développé couché barre',
  'Barbell Bench Press - Medium Grip': 'Développé couché barre prise moyenne',
  'Cable Crossover': 'Écartés câble croisé',
  'Cable Fly': 'Écartés câble',
  'Chest Dip': 'Dips pectoraux',
  'Chest Fly': 'Écartés pectoraux',
  'Decline Bench Press': 'Développé couché décliné',
  'Decline Dumbbell Bench Press': 'Développé décliné haltères',
  'Decline Push-Up': 'Pompe déclinée',
  'Dips': 'Dips',
  'Dumbbell Bench Press': 'Développé couché haltères',
  'Dumbbell Fly': 'Écartés haltères',
  'Incline Barbell Bench Press': 'Développé incliné barre',
  'Incline Dumbbell Bench Press': 'Développé incliné haltères',
  'Incline Dumbbell Fly': 'Écartés inclinés haltères',
  'Pec Deck Fly': 'Pec deck',
  'Push-Up': 'Pompe',
  'Push Up': 'Pompe',
  'Wide Grip Bench Press': 'Développé couché prise large',

  // ÉPAULES
  'Arnold Dumbbell Press': 'Arnold press',
  'Arnold Press': 'Arnold press',
  'Barbell Overhead Press': 'Développé militaire barre',
  'Barbell Shoulder Press': 'Développé militaire barre',
  'Behind The Neck Barbell Overhead Press': 'Développé nuque',
  'Cable Lateral Raise': 'Élévation latérale câble',
  'Dumbbell Front Raise': 'Élévation frontale haltères',
  'Dumbbell Lateral Raise': 'Élévation latérale haltères',
  'Dumbbell Shoulder Press': 'Développé militaire haltères',
  'Front Raise': 'Élévation frontale',
  'Lateral Raise': 'Élévation latérale',
  'Military Press': 'Développé militaire',
  'Overhead Press': 'Développé militaire',
  'Push Press': 'Push press',
  'Rear Delt Fly': 'Oiseau haltères',
  'Reverse Fly': 'Oiseau haltères',
  'Seated Barbell Military Press': 'Développé militaire barre assis',
  'Seated Dumbbell Shoulder Press': 'Développé militaire assis haltères',
  'Upright Row': 'Tirage menton',
  'Barbell Upright Row': 'Tirage menton barre',

  // BICEPS
  'Barbell Curl': 'Curl barre',
  'Cable Curl': 'Curl câble',
  'Concentration Curl': 'Curl concentration',
  'Dumbbell Bicep Curl': 'Curl haltères',
  'Dumbbell Curl': 'Curl haltères',
  'EZ-Bar Curl': 'Curl barre EZ',
  'EZ Bar Curl': 'Curl barre EZ',
  'Hammer Curl': 'Curl marteau',
  'Incline Dumbbell Curl': 'Curl haltères incliné',
  'Preacher Curl': 'Curl pupitre',
  'Reverse Curl': 'Curl prise pronation',
  'Reverse Barbell Curl': 'Curl barre pronation',
  'Seated Dumbbell Curl': 'Curl haltères assis',
  'Standing Dumbbell Curl': 'Curl haltères debout',
  'Zottman Curl': 'Curl Zottman',

  // TRICEPS
  'Cable Tricep Pushdown': 'Extension triceps poulie haute',
  'Cable Triceps Pushdown': 'Extension triceps poulie haute',
  'Close-Grip Bench Press': 'Développé couché prise serrée',
  'Diamond Push-Up': 'Pompe diamant',
  'Dumbbell Tricep Extension': 'Extension triceps haltères',
  'Lying Tricep Extension': 'Extension triceps couché',
  'Overhead Tricep Extension': 'Extension triceps au-dessus de la tête',
  'Skull Crusher': 'Skull crusher',
  'Tricep Dip': 'Dips triceps',
  'Tricep Kickback': 'Kickback triceps',
  'Tricep Pushdown': 'Extension triceps poulie',
  'Triceps Pushdown': 'Extension triceps poulie',
  'Rope Triceps Pushdown': 'Extension triceps corde',

  // AVANT-BRAS
  'Barbell Wrist Curl': 'Curl poignets barre',
  'Reverse Barbell Wrist Curl': 'Curl poignets inversé',
  'Wrist Curl': 'Curl poignets',
  'Wrist Roller': 'Rouleau poignets',
  'Farmers Walk': 'Marche du fermier',
  "Farmer's Walk": 'Marche du fermier',

  // QUADRICEPS / JAMBES
  'Barbell Full Squat': 'Squat complet barre',
  'Barbell Lunge': 'Fente barre',
  'Barbell Squat': 'Squat barre',
  'Box Jump': 'Box jump',
  'Box Squat': 'Box squat',
  'Bulgarian Split Squat': 'Split squat bulgare',
  'Dumbbell Lunge': 'Fente haltères',
  'Dumbbell Squat': 'Squat haltères',
  'Front Barbell Squat': 'Squat avant barre',
  'Front Squat': 'Squat avant',
  'Goblet Squat': 'Squat gobelet',
  'Hack Squat': 'Hack squat',
  'Jump Squat': 'Squat sauté',
  'Leg Extension': 'Leg extension',
  'Leg Press': 'Presse à cuisses',
  'Lunge': 'Fente',
  'Pistol Squat': 'Pistol squat',
  'Reverse Lunge': 'Fente arrière',
  'Sissy Squat': 'Sissy squat',
  'Split Squat': 'Split squat',
  'Squat': 'Squat',
  'Step-Up': 'Step up',
  'Sumo Squat': 'Squat sumo',
  'Walking Lunge': 'Fente marchée',

  // ISCHIO-JAMBIERS / FESSIERS
  'Barbell Glute Bridge': 'Pont fessier barre',
  'Cable Hip Extension': 'Extension de hanche câble',
  'Donkey Kick': 'Donkey kick',
  'Glute Bridge': 'Pont fessier',
  'Good Morning': 'Good morning',
  'Hip Thrust': 'Hip thrust',
  'Barbell Hip Thrust': 'Hip thrust barre',
  'Kettlebell Swing': 'Balancé kettlebell',
  'Leg Curl': 'Leg curl',
  'Lying Leg Curl': 'Leg curl couché',
  'Seated Leg Curl': 'Leg curl assis',
  'Romanian Deadlift': 'Soulevé de terre roumain',
  'Single Leg Deadlift': 'Soulevé de terre unilatéral',
  'Stiff Legged Deadlift': 'Soulevé de terre jambes tendues',

  // MOLLETS
  'Calf Raise': 'Mollets debout',
  'Donkey Calf Raise': 'Mollets âne',
  'Seated Calf Raise': 'Mollets assis',
  'Single Leg Calf Raise': 'Mollets unilatéraux',
  'Standing Calf Raise': 'Mollets debout',

  // HALTÉROPHILIE
  'Clean': 'Épaulé',
  'Clean And Jerk': 'Épaulé-jeté',
  'Clean and Jerk': 'Épaulé-jeté',
  'Hang Clean': 'Épaulé mi-cuisse',
  'Hang Power Clean': 'Power clean mi-cuisse',
  'Hang Power Snatch': 'Power arraché mi-cuisse',
  'Hang Snatch': 'Arraché mi-cuisse',
  'High Pull': 'High pull',
  'Jerk': 'Jeté',
  'Power Clean': 'Power clean',
  'Power Snatch': 'Power arraché',
  'Snatch': 'Arraché',
  'Overhead Squat': 'Squat arraché',
  'Split Jerk': 'Jeté fendu',
  'Push Jerk': 'Push jerk',

  // PLIOMÉTRIE
  'Broad Jump': 'Saut en longueur',
  'Depth Jump': 'Drop jump',
  'Jump Rope': 'Corde à sauter',
  'Jumping Jack': 'Jumping jack',
  'Lateral Bound': 'Bond latéral',
  'Medicine Ball Slam': 'Lancer médecine ball au sol',
  'Plyometric Push-Up': 'Pompe pliométrique',
  'Vertical Jump': 'Saut vertical',
  'Box Jump (Multiple Response)': 'Box jump enchaîné',

  // CARDIO
  'Battle Ropes': 'Battle ropes',
  'Burpee': 'Burpee',
  'High Knees': 'Montées de genoux',
  'Rowing Machine': 'Rameur',
  'Running': 'Course à pied',
  'Running, Treadmill': 'Course sur tapis',
  'Stationary Bike': 'Vélo stationnaire',
  'Treadmill': 'Tapis de course',
  'Sled Push': 'Poussée de traîneau',
  'Sled Pull': 'Tirage de traîneau',
  'Ski Erg': 'Ski erg',
  'Assault Bike': 'Assault bike',
  'Air Bike': 'Air bike',

  // MOBILITÉ / ÉTIREMENTS
  'Butterfly Stretch': 'Étirement papillon',
  'Cat Cow': 'Chat / vache',
  'Cat-Cow': 'Chat / vache',
  "Child's Pose": "Posture de l'enfant",
  'Child Pose': "Posture de l'enfant",
  'Cobra Stretch': 'Étirement cobra',
  'Hip Flexor Stretch': 'Étirement fléchisseurs de hanche',
  'Kneeling Hip Flexor Stretch': 'Étirement fléchisseurs de hanche à genoux',
  'Lying Hamstring Stretch': 'Étirement ischio-jambiers allongé',
  'Lying Glute Stretch': 'Étirement fessiers allongé',
  'Pigeon Pose': 'Posture du pigeon',
  'Quad Stretch': 'Étirement quadriceps',
  'Seated Hamstring Stretch': 'Étirement ischio-jambiers assis',
  'Shoulder Stretch': 'Étirement épaules',
  'Spiderman Stretch': 'Étirement spiderman',
  "World's Greatest Stretch": 'World greatest stretch',
  'World Greatest Stretch': 'World greatest stretch',
  'Doorway Stretch': 'Étirement pectoraux cadre de porte',
  'Hip 90/90': 'Hip 90/90',
  'Thread The Needle': 'Thread the needle',
  'Thoracic Rotation': 'Rotation thoracique',
  'Ankle Circles': 'Cercles de chevilles',
  'Hip Circle': 'Cercles de hanches',
  'Neck Roll': 'Roulement de nuque',
  'Wrist Circles': 'Cercles de poignets',
  'Arm Circle': 'Cercles de bras',
  'Leg Swing': 'Balancement de jambes',
  'Inchworm': 'Inchworm',
  'Lunge With Twist': 'Fente avec rotation',
  'High Kick': 'Coup de pied haut',
}
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log('📥 Chargement des exercices...')
  const { data: exercises, error } = await supabase
    .from('bibliotheque_exercices').select('id, nom')
  if (error) { console.error(error.message); return }
  console.log(`${exercises.length} exercices en base\n`)

  let updated = 0
  let skipped = 0

  for (const ex of exercises) {
    const fr = T[ex.nom]
    if (fr && fr !== ex.nom) {
      const { error } = await supabase
        .from('bibliotheque_exercices').update({ nom: fr }).eq('id', ex.id)
      if (!error) {
        updated++
        process.stdout.write(`\r✅ ${updated} traduits  (${skipped} sans traduction)`)
      }
    } else {
      skipped++
    }
  }

  console.log(`\n\n🎉 Terminé ! ${updated} traduits, ${skipped} sans traduction (conservés en anglais).`)
}

run().catch(err => { console.error('Erreur :', err.message); process.exit(1) })
