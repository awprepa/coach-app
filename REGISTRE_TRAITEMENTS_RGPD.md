# Registre des activités de traitement — AWprepa
**Responsable du traitement :** Arthur Wehrey  
**Adresse :** 41 rue Fénelon, 31200 Toulouse  
**Contact :** wehrey.arthur@gmail.com  
**Date de création :** Mai 2026  
**Modèle :** conforme Art. 30 RGPD (version simplifiée PME/TPE — CNIL)

---

## Traitement n°1 — Gestion des comptes clients

| Champ | Détail |
|-------|--------|
| **Finalité** | Créer et gérer les accès des clients à l'application |
| **Base légale** | Exécution du contrat (Art. 6.1.b RGPD) |
| **Données** | Prénom, nom, adresse e-mail, mot de passe hashé, date de début/fin de contrat, offre souscrite |
| **Personnes concernées** | Clients (sportifs suivis) |
| **Durée de conservation** | Durée de la relation contractuelle + 30 jours |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant Auth) |
| **Transferts hors UE** | Supabase : données hébergées AWS eu-west-3 (Paris) — DPA conforme RGPD |
| **Mesures de sécurité** | HTTPS/TLS · Mots de passe hashés bcrypt · Row Level Security (RLS) |

---

## Traitement n°2 — Suivi de l'entraînement

| Champ | Détail |
|-------|--------|
| **Finalité** | Créer et suivre les programmes et séances d'entraînement |
| **Base légale** | Exécution du contrat (Art. 6.1.b RGPD) |
| **Données** | Programmes, séances, exercices, charges, séries, répétitions, RPE, commentaires de séance |
| **Personnes concernées** | Clients (sportifs suivis) |
| **Durée de conservation** | Durée du contrat + 2 ans |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant BDD) |
| **Transferts hors UE** | Supabase AWS eu-west-3 (Paris) — DPA conforme RGPD |
| **Mesures de sécurité** | HTTPS/TLS · RLS Supabase · Accès restreint par authentification |

---

## Traitement n°3 — Données de santé : nutrition ⚠️

| Champ | Détail |
|-------|--------|
| **Finalité** | Suivi nutritionnel personnalisé (macronutriments, hydratation, qualité alimentaire) |
| **Base légale** | **Consentement explicite (Art. 9.2.a RGPD)** — enregistré horodaté en base |
| **Données** | Profil nutritionnel (objectif physique, allergènes, régime), repas journaliers (kcal, protéines, glucides, lipides), hydratation, photos de repas, favoris alimentaires |
| **Catégorie spéciale** | OUI — données de santé (Art. 9 RGPD) |
| **Personnes concernées** | Clients ayant donné leur consentement explicite |
| **Durée de conservation** | Durée du contrat + 1 an · Photos : durée du contrat + 6 mois |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant BDD + Storage S3) |
| **Transferts hors UE** | Supabase AWS eu-west-3 (Paris) — DPA conforme RGPD |
| **Mesures de sécurité** | HTTPS/TLS · RLS · Consentement tracé (table `consents`) · Bucket privé pour les photos |

---

## Traitement n°4 — Données de santé : bien-être (wellness) ⚠️

| Champ | Détail |
|-------|--------|
| **Finalité** | Suivi quotidien du bien-être pour adapter la charge d'entraînement |
| **Base légale** | **Consentement explicite (Art. 9.2.a RGPD)** — enregistré horodaté en base |
| **Données** | Scores quotidiens : sommeil, fatigue, douleurs, stress (échelle 1-4) · Poids corporel |
| **Catégorie spéciale** | OUI — données de santé (Art. 9 RGPD) |
| **Personnes concernées** | Clients ayant donné leur consentement explicite |
| **Durée de conservation** | Durée du contrat + 1 an |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant BDD) |
| **Transferts hors UE** | Supabase AWS eu-west-3 (Paris) — DPA conforme RGPD |
| **Mesures de sécurité** | HTTPS/TLS · RLS · Consentement tracé (table `consents`) |

---

## Traitement n°5 — Données de santé : tests physiques ⚠️

| Champ | Détail |
|-------|--------|
| **Finalité** | Évaluation et suivi des performances physiques |
| **Base légale** | **Consentement explicite (Art. 9.2.a RGPD)** — enregistré horodaté en base |
| **Données** | Résultats de tests physiques (valeurs mesurées, dates, notes), types de tests |
| **Catégorie spéciale** | OUI — données de santé (Art. 9 RGPD) |
| **Personnes concernées** | Clients ayant donné leur consentement explicite |
| **Durée de conservation** | Durée du contrat + 2 ans |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant BDD) |
| **Transferts hors UE** | Supabase AWS eu-west-3 (Paris) — DPA conforme RGPD |
| **Mesures de sécurité** | HTTPS/TLS · RLS · Consentement tracé (table `consents`) |

---

## Traitement n°6 — Messagerie coach-client

| Champ | Détail |
|-------|--------|
| **Finalité** | Communication entre le coach et ses clients dans le cadre du suivi |
| **Base légale** | Exécution du contrat (Art. 6.1.b RGPD) |
| **Données** | Contenu des messages, date/heure d'envoi, identifiant expéditeur/destinataire |
| **Personnes concernées** | Clients et coach |
| **Durée de conservation** | Durée du contrat + 1 an |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant BDD) |
| **Transferts hors UE** | Supabase AWS eu-west-3 (Paris) — DPA conforme RGPD |
| **Mesures de sécurité** | HTTPS/TLS · RLS (chaque client ne voit que ses messages) |

---

## Traitement n°7 — Notifications push

| Champ | Détail |
|-------|--------|
| **Finalité** | Envoyer des rappels et alertes aux clients (séances, wellness, nutrition) |
| **Base légale** | Consentement (Art. 6.1.a RGPD — accord explicite au moment de l'activation) |
| **Données** | Token de notification push, identifiant client |
| **Personnes concernées** | Clients ayant activé les notifications |
| **Durée de conservation** | Durée de la relation contractuelle |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant) · Navigateur/OS du client |
| **Transferts hors UE** | VAPID standard (W3C) — pas de service tiers US |
| **Mesures de sécurité** | Clés VAPID chiffrées · Supabase Secrets |

---

## Traitement n°8 — GPS / localisation

| Champ | Détail |
|-------|--------|
| **Finalité** | Suivi GPS des sorties sportives (distance, vitesse, tracé) |
| **Base légale** | Consentement (Art. 6.1.a RGPD) |
| **Données** | Coordonnées GPS, vitesse, durée, distance |
| **Personnes concernées** | Clients avec offre "préparation physique" |
| **Durée de conservation** | Durée du contrat + 1 an |
| **Destinataires** | Arthur Wehrey (coach) · Supabase (sous-traitant BDD) |
| **Transferts hors UE** | Supabase AWS eu-west-3 (Paris) — DPA conforme RGPD |
| **Mesures de sécurité** | HTTPS/TLS · RLS |

---

## Sous-traitants (Art. 28 RGPD)

| Sous-traitant | Rôle | Localisation données | DPA |
|---------------|------|----------------------|-----|
| **Supabase Inc.** | Base de données, authentification, stockage fichiers | AWS eu-west-3 (Paris, France) | [supabase.com/docs/guides/platform/compliance](https://supabase.com/docs/guides/platform/compliance) — **À signer dans le dashboard** |
| **Vercel Inc.** | Hébergement front-end | CDN mondial (code statique uniquement) | [vercel.com/legal/dpa](https://vercel.com/legal/dpa) — **À signer dans le dashboard** |

---

## Droits des personnes (Art. 15-22 RGPD)

| Droit | Modalité | Délai |
|-------|----------|-------|
| Accès | E-mail à wehrey.arthur@gmail.com | 30 jours |
| Rectification | Directement dans l'app ou par e-mail | 30 jours |
| Effacement | Bouton "Supprimer mon compte" dans l'app | Immédiat |
| Portabilité | E-mail à wehrey.arthur@gmail.com | 30 jours |
| Opposition | E-mail à wehrey.arthur@gmail.com | 30 jours |
| Retrait consentement | E-mail à wehrey.arthur@gmail.com | Immédiat |
| Réclamation CNIL | [cnil.fr](https://www.cnil.fr) | — |

---

*Dernière mise à jour : Mai 2026*  
*À mettre à jour à chaque nouveau traitement ou changement significatif.*
