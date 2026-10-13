---
name: AWprepa
description: Application de préparation physique et de coaching (coach desktop, athlètes mobile). Direction « Ligne de touche », validée le 13/10/2026.
colors:
  signal: "#e4f816"
  signal-ink: "#5c6300"
  ink: "#141414"
  anthracite: "#1c1d1f"
  text-muted: "#55595f"
  page: "#f4f4f1"
  card: "#ffffff"
  soft: "#efefeb"
  line: "#e3e3de"
  success: "#13753a"
  danger: "#b42318"
  warning: "#a15c00"
typography:
  display:
    fontFamily: "Archivo Narrow, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Public Sans, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  control: "10px"
  card: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal}"
    rounded: "{rounded.control}"
    height: "52px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    border: "1.5px solid {colors.line}"
    rounded: "{rounded.control}"
    height: "44px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "16px"
    shadow: "0 1px 2px rgb(20 20 20 / .07)"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    border: "1.5px solid {colors.line}"
    rounded: "{rounded.control}"
---

# Design System: AWprepa

## Overview

**Creative North Star : « Ligne de touche »**

L'affinage direct de l'identité historique : même monde (anthracite et jaune signal), enfin discipliné. Le ton est calme, précis et professionnel, celui d'un staff sûr de lui. Côté joueur, l'écran est pensé pour le pouce et la lecture rapide en salle ; côté coach, il est clair et dense pour analyser longtemps.

Source de vérité dans le code : `src/theme/tokens.js` (jetons à trois couches : primitifs, sémantiques, composants), utilisés depuis les objets de styles inline des pages. Maquette de référence : `docs/refonte/maquettes/direction-A.html`.

**Caractéristiques clés :**
- Une seule couleur de marque, le jaune signal, qui marque l'actif, le sélectionné et l'action principale.
- Encre quasi noire pour la structure ; fond de page gris légèrement chaud, cartes blanches posées à plat.
- Deux polices : Archivo Narrow pour les titres et les chiffres, Public Sans pour le texte.
- Deux arrondis seulement : 10 px (contrôles) et 16 px (cartes).
- Lisibilité d'abord : texte de 12 px minimum, contraste de 4,5:1 minimum, cibles tactiles de 44 px, information jamais portée par la seule couleur.

## Colors

### Marque
- **Jaune signal** (`#e4f816`) : texte des boutons principaux noirs, jour ou onglet sélectionné, barres de progression sur fond sombre. Sur fond clair, il marque par un fond, un trait ou un surlignage, jamais comme couleur de texte (1,15:1). Le texte posé dessus est l'encre (15,6:1).
- **Jaune lisible** (`#5c6300`, 6,5:1 sur blanc) : rare texte d'accent sur fond clair.

### Neutres
- **Encre** (`#141414`) : texte principal, bouton principal, puce et onglet actifs.
- **Anthracite** (`#1c1d1f`) : en-tête athlète, cartes sombres (niveau de compte).
- **Texte secondaire** (`#55595f`, 7:1 sur blanc) : toute information de second rang. Aucun gris plus clair pour du texte.
- **Page** (`#f4f4f1`), **Carte** (`#ffffff`), **Fond doux** (`#efefeb`), **Filet** (`#e3e3de`).

### États
Réussite `#13753a`, alerte `#b42318`, vigilance `#a15c00` sur fond clair (tous au-dessus de 5:1). Sur fond sombre : `#4ade80`, `#f87171`, `#fbbf24`. Toujours doublés d'un symbole, d'un chiffre ou d'un mot (flèche, « bas », pictogramme).

### Named Rules
**La règle du marquage unique.** Le jaune signal est la seule couleur de marque. Il ne sert jamais de fond décoratif large.

**La règle des couleurs de club.** Les variables CSS `--header-bg`, `--accent`, `--chip-bg`… restent surchargées par `ClientThemeContext` pour les joueurs d'un club. Les composants qui les utilisaient continuent de les utiliser ; les jetons neutres ne les remplacent pas.

**La règle des rangs.** Les couleurs de rang de la Progression (Fer, Bronze, Argent, Or, Platine, Diamant, Champion) sont un univers de jeu assumé et restent telles quelles. Elles ne servent nulle part ailleurs.

## Typography

**Titres et chiffres :** Archivo Narrow (700), chiffres tabulaires.
**Texte :** Public Sans (400 et 600).
Chargées depuis Google Fonts dans `public/index.html`, avec la police système en repli.

### Hiérarchie
- Côté athlète : 12 / 14 / 16 / 20 / 28 / 40 px. Corps à 15–16 px.
- Côté coach : 12 / 13 / 14 / 18 / 24 px.
- Libellés de section : Public Sans 600, 13 px, texte secondaire, sans majuscules forcées.

### Named Rules
**La règle du chiffre héros.** Charges, scores et totaux sont en Archivo Narrow, plus gros que leur libellé, avec l'unité en plus petit et en texte secondaire.

## Layout

Côté coach (ordinateur) : barre de navigation blanche en haut, libellés sur une seule ligne, contenu en grille de cartes. Côté athlète : en-tête anthracite avec la date et le prénom, une colonne de cartes espacées de 12 px, marges latérales de 16 px, barre d'onglets en bas avec la zone de sécurité de l'iPhone.

Espacements : 4, 8, 12, 16, 24 px.

## Elevation & Depth

À plat. Ombre de carte `0 1px 2px rgb(20 20 20 / .07)` ; les sous-blocs sont séparés par un filet. Une ombre franche est réservée à ce qui flotte (menu, modale).

La Progression utilise un verre dépoli clair (approximation web de « liquid glass ») : cartes blanches translucides, `backdrop-filter: blur`, reflet interne en haut, sur le fond de page avec un léger halo jaune. Repli opaque si `prefers-reduced-transparency`.

## Shapes

10 px pour les boutons, champs, puces et jours ; 16 px pour les cartes ; gélule (999 px) pour les badges ; cercle pour les avatars. Rien d'autre.

## Components

### Boutons
- **Principal :** fond encre, texte jaune signal, Public Sans 700 16 px, 52 px de haut côté athlète (44 px minimum côté coach).
- **Secondaire :** transparent, bordure filet 1,5 px, texte encre, 44 à 48 px.
- **Danger :** texte alerte, fond blanc ou rouge très pâle, jamais en évidence.

### Puces et jours
Inactifs en fond doux avec texte secondaire ; actifs en encre avec texte jaune.

### Cartes
Blanches, 16 px d'arrondi, 16 px de marge interne, libellé de section en haut.

### Navigation
- **Athlète :** barre blanche en bas, icônes au trait, libellés de 12 px ; l'onglet actif a son icône pleine posée sur une gélule jaune et son libellé en encre.
- **Coach :** barre blanche en haut ; lien actif en encre avec texte jaune.

### En-tête athlète
Anthracite (ou couleurs du club), date en petit au-dessus de « Bonjour Prénom », cloche et avatar en boutons de 44 px.

## Do's and Don'ts

### Do:
- **Do** prendre couleurs, tailles, arrondis et ombres dans `src/theme/tokens.js`.
- **Do** doubler toute couleur d'état d'un symbole ou d'un mot.
- **Do** garder 44 px minimum pour tout ce qui se touche.

### Don't:
- **Don't** utiliser d'emojis.
- **Don't** écrire du texte en jaune signal sur fond clair.
- **Don't** créer un nouveau gris, une nouvelle taille ou un nouvel arrondi hors jetons.
- **Don't** poser une bordure colorée épaisse sur un seul côté d'une carte, ni de dégradé décoratif.
- **Don't** modifier la logique, les requêtes Supabase ou les RLS pendant la refonte : uniquement l'interface.
