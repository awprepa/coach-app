# AWprepa — coach-app

App PWA mobile-first pour Arthur (préparateur physique unique). Site coach + app cliente.

## Stack

- **Create React App** + React 19 (pas Next.js, pas TypeScript)
- **react-router v7**, **Recharts** pour les graphes
- **Supabase** : DB + Auth + Storage + Edge Functions (Deno/TS) — projet `ytdqyhajqxnmkwxehwmg`
- **Vercel** pour l'hébergement (https://awprepa.app)
- PWA installable, portrait-only, push notifications, service worker
- **MCP Supabase** déjà configuré dans `.mcp.json` (utilisable depuis Claude Code)

## Architecture

- Pages **coach** dans `src/pages/`
- Pages **client** dans `src/pages/client/`
- Composants partagés dans `src/components/`
- Contextes dans `src/context/` (NotifContext, TimerContext)
- Hooks dans `src/hooks/`
- Edge Functions dans `supabase/functions/`
- Migrations SQL dans `supabase/migrations/`

## Conventions de code

- **Styles inline** dans un objet `S` ou `styles` en bas de chaque page (pas de CSS modules ni Tailwind)
- Header client : gradient `linear-gradient(135deg, #333333 0%, #1f2937 100%)` + accent `#e4f816`
- UI mobile-first, libellés FR, emojis fréquents, border-radius 12-16
- Pattern d'auth : `supabase.auth.getSession()` → lookup `clients` via `user_id` (fallback par email si user_id vide)
- ClientBottomNav rendu en bas de chaque page client
- Realtime via NotifProvider (`src/context/NotifContext.js`) — un seul channel global

## Pattern coach unique (IMPORTANT)

L'app est **mono-coach** (Arthur). La table `clients` n'a **PAS** de colonne `coach_id`.
Le coach est identifié globalement par `app_settings` avec `key='coach_user_id'` et `value=<auth.users.id>`.
Helper JS : `getCoachId()` dans `src/notifs.js`.
Helper SQL (créé par la migration nutrition) : `public.is_coach()` qui vérifie `auth.uid() = coach_user_id`.

## Schéma `clients`

`id`, `user_id`, `email`, `prenom`, `nom`, `objectif`, **`offre`** (∈ `preparation_physique` / `coaching` / `essai`), `date_debut`, `date_fin`, `category_id`.

## Chantier en cours : Nutrition V1

Ajout d'un onglet Nutrition côté client : log repas, photo IA, scan code-barres, vocal, favoris, hydratation, restrictions/allergènes, note qualité IA, panneau coach pour fixer les objectifs.

**Découpage en 4 phases** (validé par Arthur, à respecter — il valide chaque phase avant la suivante) :

### ✅ Phase 1 — Fondations (terminée 2026-05-15)
- Migration SQL `supabase/migrations/20260512000000_nutrition_v1.sql` — 7 tables (`nutrition_profile`, `nutrition_goals`, `nutrition_foods`, `nutrition_meals`, `nutrition_meal_items`, `nutrition_meal_templates`, `nutrition_water`) + RLS + bucket `meal-photos` + helpers `current_client_id()` / `is_coach()`
- ClientBottomNav refondu : Notifs → Nutrition (icône fourchette/cuillère)
- Cloche notifs déplacée en haut à droite de AccueilClient avec badge `unread`
- Squelette `src/pages/client/NutritionClient.js` + route `/client/nutrition` dans App.js
- À ce stade Arthur doit avoir exécuté la migration SQL dans Supabase (vérifier avec une SELECT sur `nutrition_goals` avant de continuer)

### 🚧 Phase 2 — Saisie de base (à faire)
- `npm install @zxing/browser` pour le scanner code-barres
- Page `src/pages/client/AjouterRepas.js` avec 4 modes : 📊 scan code-barres / ✏️ manuel / 📷 photo (placeholder) / 🎤 vocal (placeholder)
- Edge function `supabase/functions/nutrition-barcode-lookup/index.ts` — interroge Open Food Facts (https://world.openfoodfacts.org/api/v2/product/{barcode}.json), normalise, met en cache dans `nutrition_foods`
- Système de favoris : flow "ajouter aux favoris" depuis un repas existant + écran de pick depuis la page Ajouter
- Activer les boutons +/- pour l'hydratation dans NutritionClient (250 ml par tap)
- Brancher le FAB de NutritionClient sur la nouvelle page (actuellement il y a un `alert()` placeholder)

### 🔮 Phase 3 — IA
- Edge function `nutrition-analyze-photo` (Gemini Flash 1.5, gratuit dans le free tier 1500 req/jour)
- Edge function `nutrition-parse-voice` (Web Speech API native pour la transcription, puis Gemini Flash pour parser le texte en items)
- Edge function `nutrition-quality-score` (note /10 vs objectifs + commentaire IA)
- La clé Gemini est à mettre dans Supabase secrets (`supabase secrets set GEMINI_API_KEY=...`) — accessible via `Deno.env.get("GEMINI_API_KEY")`. Arthur a partagé une clé en V1 (à régénérer pour la prod : `AIzaSy...`)

### 🔮 Phase 4 — Coach + finitions
- Panneau Nutrition dans `src/pages/FicheClient.js` : voir les jours du client + définir/ajuster `nutrition_goals` et `nutrition_profile`
- Nouvelle page `src/pages/NutritionCoach.js` (vue d'ensemble multi-clients) accessible depuis CoachNav
- Page `src/pages/client/HistoriqueNutrition.js` (calendrier + tendances Recharts)
- Page `src/pages/client/ProfilNutrition.js` (restrictions/allergènes/régime)
- Widget kcal dans AccueilClient — visible **uniquement** si `nutrition_goals` existe pour le client
- Modifier `supabase/functions/send-wellness-reminder/index.ts` pour rappeler aussi le log nutrition

## Choix techniques actés

- **Vision AI** : Gemini Flash 1.5 (gratuit jusqu'à 1500 req/jour)
- **Saisie vocale** : Web Speech API native du navigateur (gratuit, local, pas de stockage audio) + Gemini Flash pour parsing
- **Scanner code-barres** : `@zxing/browser`
- **Source produits** : Open Food Facts (API publique gratuite)
- **Tag workout (pre/post)** sur les repas : exposé **uniquement** si `client.offre === 'preparation_physique'` (les "coaching" simples ne le voient pas)

## Préférences d'Arthur

- Toujours **planifier avant de coder** sur un chantier non trivial — proposer un plan, lister les arbitrages (gratuit vs payant, science fondée vs marketing), attendre GO explicite
- Découper en phases, livrer un récap à chaque fin de phase, attendre validation avant la suivante
- Français pour l'UI et les échanges
- Arthur n'est pas développeur pro — expliquer les trade-offs plutôt que d'imposer un choix
- Sécurité : ne jamais committer de clés API ; utiliser Supabase secrets pour les Edge Functions
