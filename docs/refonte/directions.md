# Refonte AWprepa — 3 directions d'identité (phase 2)

Cadre commun (validé avec Arthur le 13/10/2026) :
- On **garde et on affine** l'ADN actuel : noir/anthracite + jaune signal `#e4f816`. Pas de rupture.
- Priorité **lisibilité et pouce** : texte ≥ 12 px (corps 15–16 px côté athlète), contraste ≥ 4,5:1 (toutes les paires ci-dessous sont vérifiées au calcul), cibles tactiles ≥ 44 px, information **jamais portée par la seule couleur** (symbole, chiffre ou libellé en plus).
- Pas d'emojis ; icônes SVG au trait. Polices gratuites (Google Fonts).
- Jaune signal jamais en texte sur fond clair (1,15:1) : sur clair, il marque par un fond, un trait ou un surlignage, et le texte posé dessus est noir (15,6:1).
- **Progression** (demande d'Arthur) : même thème, graphiques en **verre dépoli** (« liquid glass ») : panneaux translucides floutés sur fond anthracite, halo jaune signal, courbes et aires jaunes.
- Couleurs d'état, communes aux trois directions (sur fond clair) : réussite `#13753a` (5,8:1), alerte `#b42318` (6,6:1), vigilance `#a15c00` (5,2:1). Sur fond sombre : `#4ade80`, `#f87171`, `#fbbf24` (≥ 6:1).

Système de jetons à 3 couches (primitifs → sémantiques → composants), dans un fichier partagé `src/theme/` en phase 3, utilisé depuis les objets de styles inline existants.

---

## Direction A — « Ligne de touche »
*L'affinage direct de l'existant : même monde, enfin discipliné.*

**Ton.** Calme, précis, professionnel. Un outil de staff sûr de lui, sans effet.

**Palette**
| Rôle | Valeur | Usage |
|---|---|---|
| Encre | `#141414` | texte principal, bouton principal, nav active |
| Anthracite | `#2a2b2e` | en-tête athlète, puces actives |
| Signal | `#e4f816` | actif, sélectionné, texte des boutons principaux noirs |
| Signal lisible | `#5c6300` | rare texte d'accent sur clair (6,5:1) |
| Texte 2nd | `#55595f` | toute info secondaire (7,0:1 sur blanc) |
| Page | `#f4f4f1` | fond général (gris légèrement chaud) |
| Carte | `#ffffff` | cartes |
| Filet | `#e3e3de` | bordures, séparateurs |

**Typographie.** Titres et chiffres : **Archivo** (variable, largeur condensée 75, 800). Texte : **Public Sans** (400/600). Échelle athlète 12 / 14 / 16 / 20 / 28 / 40 ; coach 12 / 13 / 14 / 18 / 24. Chiffres tabulaires partout.

**Composants.** Arrondis 10 (boutons, champs) / 16 (cartes) — deux valeurs seulement. Cartes blanches posées à plat (ombre `0 1px 2px rgb(0 0 0 / .06)`), filet pour les sous-blocs. Bouton principal noir à texte jaune, 48 px de haut côté athlète. Onglet actif : trait jaune de 3 px + libellé noir 600. Puces actives anthracite à texte jaune.

---

## Direction B — « Tableau d'affichage »
*Le stade la nuit : gros chiffres, contraste fort, l'énergie du jour de match.*

**Ton.** Direct, énergique, sportif. Côté joueur, l'app ressemble au tableau de score ; côté coach, elle reste claire et dense pour travailler longtemps.

**Palette**
| Rôle | Valeur | Usage |
|---|---|---|
| Nuit | `#0f0f10` | fond athlète (mode sombre par défaut côté joueur) |
| Banc | `#1b1c1e` | cartes athlète |
| Craie | `#f2f2f0` | texte principal sur sombre (15,2:1) |
| Texte 2nd sombre | `#a3a8ae` | secondaire sur sombre (7,1:1) |
| Signal | `#e4f816` | chiffres clés, actif, actions (16,2:1 sur nuit) |
| Coach page / carte | `#f3f3f1` / `#ffffff` | côté coach clair, nav noire |
| Encre | `#111111` | texte coach, nav coach |

**Typographie.** Titres et chiffres : **Barlow Condensed** (700, majuscules pour les libellés, très gros chiffres). Texte : **Barlow** (400/600). Les chiffres de charge, score et wellness deviennent les héros de l'écran.

**Composants.** Arrondis serrés 6 / 10. Cartes athlète sombres sans ombre, séparées par l'espace ; libellés en petites capitales espacées. Bouton principal jaune à texte noir côté joueur (le plus visible dans le noir), noir à texte jaune côté coach. Barre d'onglets athlète noire, onglet actif jaune avec libellé.

---

## Direction C — « Carnet de prépa »
*Le carnet du préparateur : papier, graphite et surligneur.*

**Ton.** Analytique, rigoureux, sobre. Rappelle une feuille de suivi bien tenue ; le jaune devient un surligneur qui pointe ce qui compte.

**Palette**
| Rôle | Valeur | Usage |
|---|---|---|
| Papier | `#f6f6f3` | fond |
| Graphite | `#2b2d31` | texte, boutons principaux (12,7:1) |
| Texte 2nd | `#5a5e66` | secondaire (6,0:1) |
| Surligneur | `#e4f816` | trait/fond derrière le mot ou le chiffre actif ; texte graphite dessus (11,7:1) |
| Filet | `#dcdcd6` | lignes de tableau, cadres 1 px |
| Carte | `#ffffff` | blocs |

**Typographie.** Texte : **IBM Plex Sans** (400/600). Chiffres et données : **IBM Plex Mono** (500) — charges, séries, dates alignées comme dans un tableur. Titres en Plex Sans 700, pas de troisième police.

**Composants.** Arrondis faibles 6 / 8. Pas d'ombres : cadres d'1 px et lignes de tableau. Bouton principal graphite à texte blanc avec un trait surligneur sous l'état actif ; puces actives = fond surligneur, texte graphite. Densité la plus forte des trois, très adaptée au coach.

---

## Progression « liquid glass » (commune, adaptée à chaque direction)
Fond anthracite profond avec un halo radial jaune signal très diffus ; cartes en verre (`background: rgb(255 255 255 / .07)`, `backdrop-filter: blur(18px) saturate(140%)`, bord `1px rgb(255 255 255 / .14)`, reflet interne en haut). Courbe de progression en trait jaune 2,5 px avec aire en dégradé jaune → transparent, point final mis en avant, grille très légère. Rangs remplacés par une jauge sobre dans la palette (pas de turquoise ni d'or).
