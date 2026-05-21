# Brief Claude Code — Acceptation du contrat et CGV dans AWPrepa

## Contexte du projet

Tu travailles sur une web app React de coaching sportif appelée AWPrepa.
Stack : React, Supabase, React Router.
Les fichiers de pages sont dans `src/pages/`.
Les fichiers client sont dans `src/pages/client/`.

---

## Objectif

Intégrer un système d'acceptation du contrat et des CGV directement dans
le parcours d'inscription du client, avec trace horodatée stockée dans
Supabase.

---

## Ce qu'il faut construire

### 1. Table Supabase — acceptations_contrat

Créer la table suivante via SQL Editor :

```sql
create table acceptations_contrat (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade,
  user_id uuid references auth.users(id),
  date_acceptation timestamp default now(),
  ip_address text,
  version_contrat text default '1.0',
  formule text,
  created_at timestamp default now()
);

alter table acceptations_contrat enable row level security;
create policy "Accès total" on acceptations_contrat
  for all using (true) with check (true);
```

### 2. Page CGV — src/pages/CGV.js

Créer une page accessible via la route `/cgv` qui affiche les Conditions
Générales de Vente complètes. Contenu à afficher :

**Préambule**
AWPrepa est une activité de coaching sportif en ligne exercée par Arthur
Wehrey, 41 rue Fénelon, 31200 Toulouse — wehrey.arthur@gmail.com —
07 83 82 13 71.

**Article 1 — Services proposés**
AWPrepa propose les services suivants :
- Préparation physique (suivi premium) : 99€/mois sans engagement,
  89€/mois sur 3 mois, 79€/mois sur 6 mois, 49€ le 1er mois découverte
- Coaching remise en forme (suivi premium) : 89€/mois sans engagement,
  79€/mois sur 3 mois, 69€/mois sur 6 mois, 39€ le 1er mois découverte
- Programme one-shot personnalisé : 60€ (sans limite de durée, sans suivi)

Chaque formule inclut : programme personnalisé, suivi via l'application
AWPrepa, feedback par messagerie, visioconférence de bilan mensuelle
(hors programme one-shot).

**Article 2 — Paiement**
Le paiement est dû à la souscription. Pour les formules avec engagement,
le montant total est exigible selon les modalités convenues (mensuel ou
en une fois). Tout retard entraîne la suspension des services.

**Article 3 — Rétractation et remboursement**
Conformément à l'article L221-18 du Code de la consommation, le client
dispose d'un délai de 14 jours pour exercer son droit de rétractation,
à compter de la signature du contrat.

Passé ce délai :
- Formules sans engagement : résiliation possible avec 30 jours de préavis,
  le mois en cours reste dû
- Formules avec engagement (3 ou 6 mois) : aucun remboursement en cas
  d'arrêt anticipé
- Programme one-shot : aucun remboursement une fois le programme livré

**Article 4 — Responsabilité**
Le client déclare être apte à pratiquer une activité physique. AWPrepa
est soumis à une obligation de moyens. Le prestataire ne peut être tenu
responsable des blessures résultant du non-respect des consignes, d'un
état de santé non déclaré ou d'une pratique inadaptée.

**Article 5 — Propriété intellectuelle**
Les programmes fournis sont la propriété exclusive d'Arthur Wehrey.
Toute reproduction ou diffusion sans accord écrit est interdite.

**Article 6 — Données personnelles (RGPD)**
Les données collectées sont utilisées uniquement dans le cadre de la
prestation. Elles ne sont jamais transmises à des tiers. Droit d'accès,
de rectification et de suppression : wehrey.arthur@gmail.com.

**Article 7 — Droit applicable**
Droit français. Tribunaux compétents : Toulouse.

### 3. Modale d'acceptation du contrat

Créer un composant `src/components/ModaleContrat.js`.

Cette modale s'affiche automatiquement à la première connexion d'un client
(quand il n'a pas encore accepté le contrat).

Contenu de la modale :
- Titre : "Contrat de prestation de services AWPrepa"
- Résumé de la formule souscrite (récupérée depuis la table clients)
- Encadré scrollable avec le texte complet des CGV (même contenu que
  la page /cgv)
- Case à cocher obligatoire :
  "J'ai lu et j'accepte les Conditions Générales de Vente et le contrat
  de prestation de services AWPrepa"
- Champ texte obligatoire : mention manuscrite "Lu et approuvé"
  (le client doit taper exactement ces mots, insensible à la casse)
- Bouton "Valider et accéder à mon espace" (désactivé tant que les deux
  conditions ne sont pas remplies)

Au clic sur Valider :
1. Insérer une ligne dans la table `acceptations_contrat` avec :
   - client_id
   - user_id
   - date_acceptation (automatique)
   - formule (récupérée depuis clients.offre)
   - version_contrat : "1.0"
2. Rediriger vers /client/accueil

### 4. Logique de vérification dans AccueilClient.js

Au chargement de la page /client/accueil :
- Vérifier si une ligne existe dans `acceptations_contrat` pour ce client
- Si non → afficher la ModaleContrat (qui bloque l'accès à l'app)
- Si oui → afficher normalement l'accueil client

### 5. Route /cgv dans App.js

Ajouter la route publique `/cgv` accessible sans connexion :
```javascript
import CGV from './pages/CGV'
// ...
<Route path="/cgv" element={<CGV />} />
```

### 6. Lien CGV dans la page Login

Ajouter en bas de la page de connexion un lien discret :
"En vous connectant, vous acceptez nos Conditions Générales de Vente"
avec un lien cliquable vers /cgv.

---

## Style

Respecter le style existant de l'app (inline styles, bleu #2563eb,
gris #666, blanc, pas de lib CSS externe).

La modale doit couvrir tout l'écran avec un fond semi-transparent noir.
Le contenu doit être scrollable sur mobile.

---

## Résultat attendu

- Un client qui se connecte pour la première fois voit la modale de
  contrat avant d'accéder à son espace
- Son acceptation est enregistrée dans Supabase avec horodatage
- Les CGV sont accessibles publiquement via /cgv
- Tu as une trace juridique de chaque acceptation avec la date et
  la formule souscrite