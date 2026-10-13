---
name: AWprepa
description: Application de préparation physique et de coaching (coach desktop, athlètes mobile). Thème d'origine, conservé par Arthur le 13/10/2026.
colors:
  accent-signal: "#e4f816"
  accent-signal-ink: "#727a0b"
  anthracite: "#333333"
  ink-black: "#1a1a1a"
  ink-deep: "#1f2937"
  text-strong: "#374151"
  text-muted: "#6b7280"
  text-faint: "#9ca3af"
  line: "#e5e7eb"
  surface-soft: "#f3f4f6"
  surface-page: "#f5f5f5"
  surface-card: "#ffffff"
  success: "#16a34a"
  danger: "#dc2626"
  warning: "#f59e0b"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 800
    lineHeight: 1.2
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
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
    backgroundColor: "{colors.anthracite}"
    textColor: "{colors.accent-signal}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  chip-active:
    backgroundColor: "{colors.anthracite}"
    textColor: "{colors.accent-signal}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: AWprepa

## Overview

**Creative North Star : « Le marquage de terrain »**

AWprepa est un outil de travail : un coach pilote ses groupes et ses clients depuis un ordinateur, des joueurs de rugby saisissent leurs charges et leur ressenti sur leur téléphone. Le système visuel s'y tient : une base neutre et claire (fond gris très pâle, cartes blanches), de l'anthracite pour la structure, et une seule couleur vive, le jaune-vert fluo (#e4f816), utilisée comme un marquage de terrain : elle signale ce qui est actif, sélectionné ou prioritaire.

Côté coach, la densité est forte : beaucoup d'informations par écran, des libellés courts en petites majuscules espacées, des chiffres en gras. Côté athlète, l'écran est pensé pour le pouce : en-tête sombre en dégradé, barre d'onglets en bas, cartes empilées.

**Décision du 13/10/2026.** Une nouvelle identité (« Ligne de touche » : Archivo Narrow + Public Sans, encre #141414) a été maquettée puis écartée par Arthur, qui préfère ce thème d'origine. On garde ce thème et on corrige les défauts écran par écran, sans restructurer les mises en page qui fonctionnent. Les jetons `src/theme/tokens.js` reprennent les valeurs de ce thème pour les écrans nouveaux ou refaits (messagerie, nutrition).

**Key Characteristics:**
- Une seule couleur vive, le jaune-vert fluo, réservée à l'état actif et aux actions principales.
- Anthracite et noir pour la structure : en-têtes, boutons principaux, puces actives.
- Cartes blanches arrondies sur fond gris pâle, ombre à peine perceptible.
- Typographie système (San Francisco sur iPhone), graisses appuyées (700 à 900).
- Pas d'emojis : icônes SVG au trait (`src/components/Icon.js`) ou pastilles de couleur.

## Colors

### Primary
- **Jaune signal** (accent-signal) : texte des boutons principaux anthracite, puce active, onglet actif. Jamais en texte sur fond blanc (illisible) ni en grand fond décoratif.
- **Jaune signal lisible** (accent-signal-ink) : version assombrie pour du texte sur fond clair.

### Neutral
- **Anthracite** (#333333) : boutons forts, puces actives, titres.
- **Noir encre** (#1a1a1a) et **ardoise** (#1f2937) : en-tête athlète en dégradé.
- **Texte secondaire** (#6b7280) : toute information de second rang ; aucun gris plus clair pour du texte.
- **Filet** (#e5e7eb), **fond doux** (#f3f4f6), **fond de page** (#f5f5f5), **carte** (blanc).

### Tertiary
Vert réussite, rouge alerte, orange vigilance : états uniquement, toujours doublés d'un symbole ou d'un mot.

### Named Rules
**La règle du marquage unique.** Le jaune signal marque l'actif, le sélectionné ou l'action principale, jamais une surface décorative.

**La règle des couleurs de club.** Les variables CSS `--header-bg`, `--accent`, `--chip-bg`… sont surchargées par `ClientThemeContext` pour les joueurs d'un club : ne pas les remplacer par des valeurs en dur.

## Typography

Police système uniquement, travaillée par la graisse plutôt que par la taille.
- **Titre** (800, 1.1 à 1.75rem) : titres de page et de carte principale.
- **Corps** (600, 0.82 à 0.95rem) : contenu des cartes, listes, tableaux.
- **Libellé** (700, 0.7 à 0.75rem, majuscules espacées) : titres de section, en-têtes de colonnes.
- **Chiffres clés** (800 à 900, chiffres tabulaires) : indicateurs, scores, charges.

## Layout

Coach (ordinateur) : barre de navigation horizontale en haut, contenu en colonnes de cartes. Athlète (téléphone) : en-tête sombre, une colonne de cartes, barre d'onglets en bas avec la zone de sécurité de l'iPhone. Espacements 4, 8, 12, 16, 24 px.

## Elevation & Depth

Presque plat : ombre de carte `0 1px 3px rgba(0,0,0,0.06)`. Ombre franche réservée à ce qui flotte (menu, modale).

## Shapes

10 px pour boutons et champs, 12 à 16 px pour les cartes, gélule pour badges et puces, cercle pour les avatars.

## Components

- **Bouton principal** : fond anthracite, texte jaune signal, graisse 700 à 800.
- **Bouton secondaire** : fond blanc ou gris doux, bordure filet, texte foncé.
- **Puces** : inactives blanches à bordure filet, actives anthracite à texte jaune.
- **Cartes** : blanches, arrondi 14 à 16 px, ombre de carte.
- **Champs** : fond blanc, bordure filet 1,5 px, arrondi 10 px ; 16 px de texte sur téléphone (pas de zoom iPhone).
- **Navigation athlète** : barre d'onglets en bas, onglet actif marqué en jaune.

## Do's and Don'ts

### Do:
- **Do** réutiliser les styles existants de l'écran (objets `S` / `styles`) et les jetons `src/theme/tokens.js`.
- **Do** garder 44 px minimum pour ce qui se touche au doigt.
- **Do** doubler toute couleur d'état d'un symbole ou d'un mot.

### Don't:
- **Don't** utiliser d'emojis.
- **Don't** introduire une nouvelle police, un nouveau gris ou un nouvel arrondi.
- **Don't** restructurer un écran qui fonctionne : corriger ses défauts.
- **Don't** écrire du texte en jaune signal sur fond clair.
