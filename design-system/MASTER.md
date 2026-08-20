# Surf Alert — Design System (MASTER)

## Direction esthétique
Dark technical precision, teinte océan profonde. Le fond est presque noir-bleu nuit (façon eau profonde de nuit), les cartes flottent en dégradé navy, et un seul accent cyan (ocean-blue) porte toute l'interactivité. Par-dessus cette base sombre, un système sémantique feu tricolore (rouge / orange / vert) porte exclusivement l'information de score — jamais utilisé pour autre chose, pour rester lisible immédiatement.

## Palette (fournie par l'utilisateur)
```
--prussian-blue: #000022
--deep-navy:     #001242
--ocean-blue:    #0094c6
--baltic-blue:   #005e7c
--ink-black:     #040f16
```

## Tokens sémantiques
| Rôle | Token | Valeur | Usage |
|---|---|---|---|
| Fond de page | `--color-background` | ink-black | body |
| Fond alterné | `--color-background-alt` | prussian-blue | header, dégradés |
| Surface carte | `--color-surface` | deep-navy | cartes, panneaux |
| Bordure | `--color-border` | ocean-blue 16% | contours de carte |
| Primaire | `--color-primary` | ocean-blue | accents, focus, badge "spot du jour" |
| Secondaire | `--color-secondary` | baltic-blue | éléments de support |
| Texte principal | `--color-on-background` | #eaf4f8 | titres |
| Texte sur surface | `--color-on-surface` | #d7e6ee | corps de texte |
| Texte atténué | `--color-on-surface-muted` | #9fb3c2 | labels, métadonnées |

## Feu tricolore (score de conditions)
Couleurs desaturées/éclaircies pour rester lisibles sur fond sombre (jamais une simple inversion des rouge/orange/vert purs) et toujours accompagnées d'un texte (`status-label`), jamais de la couleur seule.

| Niveau | Score | Token | Valeur | Label |
|---|---|---|---|---|
| Danger | 0–35 | `--color-danger` | #ff6b6b | "pas terrible" |
| Warning | 36–65 | `--color-warning` | #ffab4c | "correct" |
| Success | 66–100 | `--color-success` | #2ee6a6 | "ça va être bon" |

## Typographie
- Display / titres / chiffres clés : **Space Grotesk** (600–700) — géométrique, technique, bons chiffres tabulaires pour les données (houle, vent, score).
- Corps / labels : **Plus Jakarta Sans** (400–500) — lisible, chaleureux, contrebalance le côté technique.
- Jamais Inter, jamais system-ui en police principale.

Échelle :
```
--text-xs: 12px   --text-sm: 14px   --text-base: 16px
--text-lg: 18px   --text-xl: 20px   --text-2xl: 24px
--text-3xl: 30px  --text-4xl: 36px
```

## Espacement
Base 4px : 4, 8, 12, 16, 24, 32, 48, 64, 96.

## Rayon de bordure
Philosophie "rounded" (consumer, mobile-first, amical) : 14px cartes, 20px conteneurs larges, pill (999px) pour badges et pastilles de statut.

## Ombres
Pas d'ombre noire plate (invisible sur fond sombre). Élévation par dégradé de surface + liseré + halo teinté ocean-blue :
```
--shadow-card: 0 10px 30px rgba(0,0,0,.45)
--shadow-glow-primary: 0 0 0 1px rgba(0,148,198,.25), 0 8px 24px rgba(0,148,198,.12)
```

## Accessibilité
- Contraste texte principal / surface ≥ 4.5:1 (vérifié : #eaf4f8 sur #001242 et #040f16).
- Couleur jamais seule porteuse de sens : chaque pastille de statut est accompagnée d'un label texte.
- Cibles tactiles ≥ 44px, focus visible sur tout élément interactif (cartes cliquables dès P3).

## Fichiers
- `css/tokens.css` — variables ci-dessus
- `css/styles.css` — composants (cartes, grille, header)
- Page overrides futurs : `design-system/pages/detail.md` (vue détail, P3), `design-system/pages/week-band.md` (bandeau semaine, P3)
