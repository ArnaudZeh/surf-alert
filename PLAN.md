# Projet : Surf Alert

**Objectif :** Dashboard web statique, feu tricolore, conditions de surf pour 4 spots de la côte nord de Tahiti — vue semaine, "spot du jour", alerte Telegram automatique le vendredi.

**Stack :** HTML/CSS/JS vanilla statique · Open-Meteo Marine API (houle) + Open-Meteo Forecast API (vent/météo) · Netlify (hosting + Scheduled Function) · Telegram Bot API.

**Contrainte principale :** V1 simple et rapide à livrer, sans framework lourd. Fiabilité de l'alerte Telegram à valider sur plusieurs jours réels avant mise en confiance (cf. section 7 du prompt source).

Référence complète : `prompt-dashboard-surf-nord-tahiti-v1.md`

---

## Révision UX post-P4 (avant P5)

Passe de polish demandée par l'utilisateur sur retour visuel, amendant P0/P3/P4 :
- Bandeau semaine en grille pleine largeur (7 colonnes égales) au lieu d'un flex tassé à gauche ; jour courant mis en évidence (bordure + fond).
- Vue détail : le mini-graphique (sparkline) est remplacé par un **tableau heure par heure façon surf-forecast** (3 jours, créneaux de 3h, colonne figée à gauche, scroll horizontal, flèches de direction houle/vent, colonne "maintenant" surlignée). Fonction `buildHourlyTable` dans `insights.js`.
- Clarté des cartes : les chaînes concaténées ("1.0 m · est-sud-est · 7s") sont remplacées par des lignes label/valeur explicites (Hauteur, Direction, Période / Vitesse, Direction, Intensité) pour éliminer les mots orphelins et le mélange d'infos. Ajout d'une légende expliquant la période de houle.
- Cartes agrandies : `--content-max-width` (1440px, 1680px à très large écran), padding et typographie augmentés, grille 4 colonnes repoussée à 1280px pour laisser de la place, CTA "Voir le détail" transformé en bouton pleine largeur.
- Responsive revérifié à 375px après coup (aucun débordement).

Bugs trouvés et corrigés pendant ce passage :
- `text-transform: capitalize` s'appliquait aussi aux unités ("1.0 M", "7 S") — restreint aux valeurs textuelles (direction, intensité) via une classe `.is-word`.
- Le libellé "aujourd'hui" débordait sur la colonne suivante à 375px — remplacé par le jour abrégé (l'accent visuel bordure/fond suffit).
- **Le service worker (cache-first) servait une version périmée de l'UI après chaque édition** : `CACHE_NAME` doit être incrémenté à chaque changement des fichiers de l'app shell (passé à v3 pendant cette session). À garder en tête pour la suite du développement.

## Révision UX #2 (avant P5)

Deuxième passe de polish sur retour utilisateur, avant P5.

- **Bug d'alignement du tableau heure par heure** : les lignes `<thead>` n'avaient pas de cellule d'angle correspondant à la colonne de labels (Conditions/Houle/Periode/Vent) du `<tbody>`. Résultat : toutes les données étaient décalées d'une colonne par rapport à leur en-tête d'heure (vérifié en DOM, le label "Conditions" et l'en-tête "00h" partageaient exactement la même position x). Corrigé par l'ajout d'une cellule d'angle vide (`.hourly-table-corner`, collée au scroll) sur les deux lignes d'en-tête.
- Séparation claire des jours dans le tableau : bande de fond alternée par jour (pair/impair) et bordure épaisse au premier créneau de chaque jour, visibles même au milieu d'un scroll horizontal.
- En-tête de la vue détail (nom, type, pastille de statut) réorganisé sur une seule ligne au lieu d'un empilement vertical qui gaspillait l'espace.
- Section "Meilleur créneau à venir" restructurée : pastille et date/heure sur la même ligne, puis liste claire (score global, houle, vent) au lieu d'une phrase dense.
- Tous les tirets cadratins ("—") retirés du code et des textes de l'app, remplacés par deux-points, virgules ou reformulation. Consigne à respecter pour la suite du développement (mémoire projet enregistrée : `feedback_no_em_dash`).

**Suivi (retour utilisateur sur les captures) :**
- **Vrai bug de scroll trouvé** : `.hourly-table-wrap` avait un padding gauche pour un effet de bord adouci, mais `overflow-x: auto` ne coupe qu'au bord de la boîte, pas à celui du padding. La colonne collée (`left: 0`) ne couvrait donc pas ce padding, laissant le contenu défilé y rester visible en dessous. Corrigé en retirant le padding gauche (gardé seulement à droite) : la colonne collée démarre maintenant pile au bord de la zone de clip, plus aucun contenu ne transparaît, testé à plusieurs positions de scroll.
- Badge de la vue détail trop éloigné du nom du spot sur un panneau large (900px) à cause d'un `justify-content: space-between`. Passé à `flex-start` avec un espacement fixe : le badge colle maintenant au nom.

**Suivi #2 (retour utilisateur sur les captures) :**
- Bug trouvé : `--space-5` était utilisé (`gap`, `padding-top` de `.card-metrics`) mais jamais défini dans `tokens.css` (l'échelle saute de `--space-4` à `--space-6`). Une variable CSS invalide fait retomber la propriété à sa valeur initiale, donc `padding-top: 0`, d'où "HOULE"/"VENT" collés à la barre de séparation dans les cards. Remplacé par `--space-6`.
- Bug de sur-scroll : en scrollant trop loin à droite dans le tableau heure par heure, le scroll "chaînait" vers le panneau puis la page, révélant du vide derrière la modale. Cause : `.detail-panel` ne fixait que `overflow-y`, ce qui rend `overflow-x` implicitement `auto` (règle CSS peu connue), et rien n'empêchait le chaînage de scroll. Corrigé par defense en profondeur : `overflow-x: hidden` explicite sur `html`, `body` et `.detail-panel`, plus `overscroll-behavior-x: contain` sur `.hourly-table-wrap`. Testé en forçant `scrollLeft` bien au-delà du maximum : le scroll reste clampé, `body.scrollX` ne bouge jamais, aucun débordement de page possible.

**Suivi #3 : rafraîchissement automatique + carrousel mobile.**
- Les données ne se rafraîchissaient jamais après le chargement initial. Ajout d'un `setInterval` toutes les 10 minutes (`refreshSpots`), plus un rafraîchissement au retour au premier plan (`visibilitychange`) si plus de 5 minutes se sont écoulées, pour éviter d'afficher du périmé après un téléphone verrouillé. `js/api.js` expose `clearForecastCache()` pour invalider le cache mémoire avant chaque re-fetch.
- Refactor important pour que ce rafraîchissement soit invisible : les cartes ne sont plus détruites/recréées à chaque cycle, elles sont mises à jour **en place** (même nœud DOM, `data-spot-id` pour les retrouver). Sans ça, la position de scroll et le carrousel mobile auraient sauté toutes les 10 minutes. Vérifié en DOM : les nœuds `.spot-card` restent strictement identiques avant/après un `refreshSpots()`, et le clic pour ouvrir la vue détail continue de fonctionner après refresh.
- Cards mobiles trop grosses : `.spots-grid` passe en carrousel horizontal (`scroll-snap`) en dessous de 640px, avec `align-items: flex-start` pour que chaque carte garde sa hauteur naturelle au lieu d'être étirée sur la plus haute du lot (c'était la vraie cause du vide excessif). Padding et taille de titre réduits sur mobile.
- Carrousel auto-défilant (6s), points de pagination cliquables (zone de clic élargie à ~36px malgré un point visuel de 8px), défilement stoppé au premier geste utilisateur (touch/pointer/wheel) pour ne jamais lutter contre quelqu'un qui navigue manuellement. `prefers-reduced-motion` respecté (scroll instantané plutôt qu'animé).
- Note de test : le scroll physique et la logique (points, calcul d'index, arrêt au toucher) ont été vérifiés directement en DOM et fonctionnent. L'animation `smooth` du scroll n'a pas pu être observée à l'écran dans une iframe de test imbriquée (le document y est `hidden`/sans focus, ce qui limite les animations liées à `requestAnimationFrame` dans Chrome) : c'est un artefact de la méthode de test, pas du code. À confirmer sur un vrai téléphone.

**Suivi #4 : mobile tout-sur-un-écran, sans scroll de page.**
- `body`/`html` passent en colonne flex `height:100dvh` sur mobile (<640px), `overflow:hidden` : en-tête, bandeau semaine et carrousel se partagent la hauteur exacte de l'ecran (dvh suit la barre d'adresse mobile, contrairement a vh). En-tete et bandeau semaine fortement compactes (icone, textes, points de jour reduits ; `line-height` ramene a 1.2 partout, l'heritage de 1.6 gonflait inutilement chaque petite ligne). Carte centree dans l'espace restant (pas etiree, pour eviter un grand vide avant le bouton), avec un `overflow-y:auto` en filet de securite sur les tres petits ecrans (iPhone SE) si le contenu ne tient malgre tout pas.
- **Bug serieux trouve pendant la verification, et sa vraie cause** : les valeurs des cartes (Hauteur, Direction...) disparaissaient et `.spots-grid` faisait 1440px de large au lieu de respecter le viewport mobile (~500px). Cause : un enfant flex refuse par defaut de retrecir sous la largeur intrinseque de son contenu (`min-width:auto` implicite, piege classique de flexbox) ; `.spots-grid` n'avait pas de `min-width:0` explicite. Corrige.
- **Bug structurel plus large, corrige en meme temps** : plusieurs blocs `@media (max-width:639px)` avaient ete inseres AVANT les regles de base qu'ils etaient censes surcharger (ex: `.badge-top` mobile a la ligne 285, regle de base a la ligne 381). A specificite egale, l'ordre du fichier gagne, peu importe la media query : le badge et potentiellement d'autres proprietes (metric-row, card-cta, status-pill...) etaient silencieusement ecrases par les regles de base plus bas dans le fichier. **Tous les blocs mobiles ont ete consolides en un seul, place a la toute fin de `styles.css`**, avec un commentaire explicite pour ne pas reproduire ce piege a l'avenir.
- Verifie sur un onglet reel (non imbrique, `resize_window` a 390-500px) avec des donnees Open-Meteo simulees (l'API reelle etait indisponible pendant les tests, cf. note ci-dessous) : largeur de grille correcte (500px), badge visible, toutes les valeurs affichees, aucun scroll de page necessaire (`document.documentElement.scrollHeight === window.innerHeight`).
- Note d'environnement : l'API Open-Meteo est devenue injoignable pendant cette session de test (probablement un throttling apres plusieurs centaines de requetes cumulees sur les nombreux rechargements de cette conversation) ; confirme independant de l'app via `curl` direct (les sous-domaines API timeout, le site principal open-meteo.com repond normalement). L'app gere ca correctement (bascule sur l'etat d'erreur "indisponible" comme prevu depuis P1). Les tests de rendu ont donc ete faits avec `window.fetch` simule (memes formes de reponse que l'API reelle) pour verifier la mise en page independamment de cette panne temporaire.

**Suivi #5 : cartes mobiles plus grandes, toutes de la même taille.**
`align-items: center` (chaque carte a sa hauteur de contenu) remplacé par `align-items: stretch` sur `.spots-grid` mobile : les 4 cartes remplissent maintenant toute la hauteur disponible et restent strictement identiques entre elles (vérifié : 559px chacune, à toutes les tailles de fenêtre testées). Pour éviter de recréer le problème du gros vide avant le bouton (déjà rencontré avec `stretch` plus tôt), `.card-metrics` passe en `flex: 1; justify-content: center;` : le bloc Houle/Vent se centre dans l'espace laissé libre entre la barre de séparation et le bouton, au lieu de rester collé en haut. Espacements et tailles de police des lignes de métriques légèrement remontés (plus de place disponible). Testé : aucun scroll de page, aucune erreur console.

**Webcam en direct (autoplay) : bloqué techniquement, tranché avec l'utilisateur.**
Vérifié en direct sur `tahiti-webcam.online` : le site source affiche lui-même "This camera cannot be embedded. Switch to Standard or Professional package." pour la caméra d'Orofara. Le flux vidéo est fourni par un service tiers dont l'intégration est verrouillée à l'abonnement du propriétaire du site (`tahiti-webcam.online`), pas par une restriction que Surf Alert peut contourner. Combiné à la CSP `frame-ancestors` déjà identifiée en P3, aucune intégration (iframe, image, flux direct) n'est possible pour Orofara et Ahonu tant que le propriétaire de `tahiti-webcam.online` ne change pas d'offre. `newstv.fr` (L'embouchure) reste bloqué par `X-Frame-Options: SAMEORIGIN`. Décision : on garde le lien externe (déjà en place), pas de player intégré tant qu'une source fiable et intégrable n'est pas trouvée.

---

### P0 — Design system + squelette ✅ VALIDÉE
**Périmètre :**
- [x] Structure de fichiers (index.html, css/, js/, data/spots.json)
- [x] Fichier de config JSON des 4 spots (section 1 du prompt source)
- [x] Skills `/ui-ux-pro-max` et `/frontend-design` pour définir palette (feu tricolore accessible), typographie, layout mobile-first — **avant** de coder les écrans
- [x] Squelette HTML/CSS de la vue 4 cartes avec données factices, conforme au design system

**Gate P0 :**
1. [x] `index.html` s'ouvre sans erreur console, style cohérent (pas de rendu navigateur par défaut)
2. [x] Les 4 cartes (Orofara, Ahonu, Papenoo Beach, L'embouchure) s'affichent avec pastille rouge/orange/vert factice
3. [x] Rendu correct en mobile (375px, devtools)

Palette de marque figée : prussian-blue #000022, deep-navy #001242, ocean-blue #0094c6, baltic-blue #005e7c, ink-black #040f16 (voir `design-system/MASTER.md`).

---

### P1 — Données réelles Open-Meteo ✅ VALIDÉE
**Périmètre :**
- [x] Appel Marine API (houle : hauteur, période, direction) par spot
- [x] Appel Forecast API (vent : direction, force) par spot
- [x] Remplacement des données factices par les données réelles sur les cartes
- [x] Gestion d'erreur réseau (message lisible, pas de blanc silencieux)

**Gate P1 :**
1. [x] Les 4 cartes affichent des valeurs réelles de houle/vent, cohérentes avec un site météo de référence
2. [x] Un rechargement de page renouvelle les données
3. [x] Coupure réseau simulée → message d'erreur propre, pas de crash

Note technique : score encore **provisoire** (houle seule, pas de pondération vent/direction) — le vrai moteur pondéré arrive en P2. Orofara/Ahonu partagent les mêmes coordonnées → requêtes dédupliquées (6 appels réseau au lieu de 8). Bug trouvé et corrigé pendant les tests : en cas d'égalité de score, le badge "Spot du jour" s'affichait sur les 4 cartes au lieu d'une seule (tie-break ajouté).

---

### P2 — Moteur de score & feu tricolore ✅ VALIDÉE
**Périmètre :**
- [x] Calcul du score (houle 30%, direction houle 35%, vent 35% — section 3 du prompt source)
- [x] Mapping score → couleur (0-35 rouge, 36-65 orange, 66-100 vert)
- [x] Mise en avant du "spot du jour" (meilleur score courant)

**Gate P2 :**
1. [x] Score vérifié manuellement sur Orofara (houle 0.98m→48, direction 85° écart→0, vent 33° écart léger→82 ⇒ 0.3×48+0.35×0+0.35×82=43) — calcul à la main = calcul affiché
2. [x] Cas limites testés en direct : plateau houle (0→50→100→100→60), direction (100 à ≤20°, 0 à la tolérance), vent (100 offshore/50 cross/0 onshore, **plafonné à 50 même en direction parfaite au-delà de 30 km/h**)
3. [x] Le "spot du jour" correspond au meilleur score (tie-break sur égalité conservé de P1)

Fichier `js/score.js` créé (moteur isolé, réutilisable pour P5 côté Netlify Function).

**Suivi (pendant P6→P7, sur demande explicite de l'utilisateur) : période et taille de déferlement estimée ajoutées au score, 4 paliers au lieu de 3.**

Avant de changer quoi que ce soit, question posée à l'utilisateur (`AskUserQuestion`) pour lever une ambiguïté : "la taille des vagues" à ajouter, c'est la houle déjà utilisée (à repondérer), ou une donnée distincte à estimer (hauteur de déferlement à la côte) ? Réponse : **une donnée distincte à estimer**. Décision structurante : sans cette clarification, le risque était de rewire `houleSizeScore` sur le mauvais input et de décalibrer silencieusement les seuils `houle_min_m` de `data/spots.json` (pensés pour une houle brute, pas une hauteur de déferlement généralement plus grande).

- **Nouveau : `estimateBreakingHeightM(houleM, periodeS)`.** Open-Meteo ne fournit que la houle au large, jamais la hauteur réelle de la vague qui se casse sur le spot. Estimée par conservation du flux d'énergie (théorie linéaire des vagues) entre le large et la zone de déferlement, combinée au critère de déferlement de McCowan (indice ≈0.78, plage à pente modérée) : `Hb = (H0² × T × √(g×0.78) / 4π)^0.4`. Approximation assumée (ignore réfraction, houle croisée, pente réelle par spot — donnée non disponible), mais fondée sur de la physique réelle plutôt qu'inventée au hasard, et son comportement colle au ressenti connu des surfeurs (une houle longue période "grossit" nettement plus en approchant la côte qu'une houle courte période de même hauteur au large). Scorée avec la même courbe `houleSizeScore` déjà existante, en réutilisant `spot.houle_min_m` — pas de nouveau champ de config.
- **Nouveau : `houlePeriodeScore(periodeS)`.** Qualité/puissance indépendante de la taille : 0 à ≤6s (mer de vent pure), monte linéairement jusqu'à 100 à ≥14s (houle longue et propre). Même logique que la légende déjà affichée sous le tableau heure par heure.
- **Repondération à 5 composantes** (avant : houle 30% / direction 35% / vent 35%) : houle brute 15%, taille vagues estimée 15%, direction houle 25%, période 15%, vent 30%. Le vent reste le facteur le plus lourd ; les deux signaux de taille (brut + estimé) totalisent 30%, soit le même poids que l'ancien facteur houle unique.
- **`scoreToStatus` passe à 4 paliers** (avant : 3, seuils 50/75) : **<50 "pas terrible"** (danger, rouge, inchangé), **50-65 "conditions passables"** (warning, orange), **65-80 "bonnes conditions"** (nouveau niveau `good`, jaune `#ffd93d`), **>80 "excellentes conditions"** (success, vert, seuil remonté de 75 à 80). Nouvelle variable `--color-good` dans `tokens.css`, nouvelles règles `.status-good` ajoutées aux 4 endroits qui dupliquent déjà success/warning/danger en CSS (`.status-pill`/`.status-dot`, `.score-gauge-fill`, `.score-breakdown-fill`, `.week-day-dot` — pas de règle centralisée, chaque endroit doit être mis à jour séparément). Contraste vérifié : jaune sur fond navy ≈13:1 (bien au-dessus du seuil AAA 7:1).
- **Alerte Telegram : seuil de déclenchement remonté.** Avant, tout niveau non-"danger" (≥50) déclenchait une alerte. Le palier "conditions passables" (50-65) étant désormais plus mitigé que l'ancien "bonnes conditions" au même seuil numérique, l'alerte ne se déclenche plus qu'à partir du niveau `good` ou `success` (>65) — décision prise seule (pas de question posée, choix documenté ici) pour rester fidèle à l'intention initiale de l'alerte ("prévenir seulement si ça vaut le déplacement"), à corriger si l'utilisateur la trouve trop stricte à l'usage.
- **UI : 2 nouvelles lignes dans le détail du score** ("Taille vagues" et "Période", en plus des 3 existantes), label "Taille vagues" avec un `title` (infobulle native) précisant que c'est une estimation. Vérifié : aucun débordement des libellés à 96px (desktop) ni ~78px (mobile, marge de 1px pré-existante sur "Direction houle", pas une régression).
- Testé : cas de validation manuelle P2 (houle 0.98m/85°/vent léger) rejoué avec la nouvelle formule ; cas parfait → 100 ; cas de houle courte période mal orientée trouvé sur données réelles (24 août 2026) → score 52 "conditions passables" au lieu d'un score probablement plus haut avec l'ancienne formule sans période, confirmant que le nouveau facteur période affine bien la notation dans le sens attendu.

---

### P3 — Bandeau semaine & vue détail ✅ VALIDÉE
**Périmètre :**
- [x] Bandeau semaine : pastille par jour (meilleur créneau, tous spots confondus)
- [x] Vue détail au clic : webcam si disponible, mini graphique 3 jours, meilleur créneau à venir sur 5 jours
- [x] Fallback propre si pas de webcam (Papenoo Beach) ou webcam potentiellement morte (L'embouchure)

**Gate P3 :**
1. [x] Le bandeau semaine affiche 7 jours avec des couleurs cohérentes avec les cartes
2. [x] Le clic sur une carte ouvre la vue détail du bon spot (souris + clavier Tab/Entrée testés)
3. [x] Les webcams s'affichent quand disponibles (lien externe) ; "Pas de webcam disponible" sinon — pas d'iframe

Décision technique : webcams en **lien externe** (`target="_blank"`), pas en iframe. Vérifié que `tahiti-webcam.online` (CSP `frame-ancestors` restreint à des sous-domaines Hostinger) et `newstv.fr` (`X-Frame-Options: SAMEORIGIN`) bloquent tous les deux l'intégration — le prompt source autorisait explicitement ce choix ("iframe ou simple lien selon ce que chaque source autorise").

Bug trouvé et corrigé : la modale de détail restait visible dès le chargement car la règle CSS `.detail-overlay { display:flex }` écrasait l'attribut `hidden` (ajout de `.detail-overlay[hidden] { display:none }`). Second bug : `scoreToStatus` avait disparu pendant la réécriture d'`app.js` (déplacé dans `score.js`, sa place logique, partagé avec `insights.js`).

Nouveau fichier `js/insights.js` : agrégation des séries horaires 7 jours (bandeau semaine, meilleur créneau 5 jours, mini-série 3 jours). `js/api.js` bascule de `current` vers `hourly` (7 jours) pour alimenter ces vues.

---

### P4 — PWA & Polish UX ✅ VALIDÉE
**Périmètre :**
- [x] `manifest.json` + service worker minimal
- [x] Installable sur écran d'accueil mobile
- [x] États de chargement sur tous les appels async
- [x] Repasse responsive/accessibilité complète

**Gate P4 :**
1. [x] Manifest valide (name, icons, display:standalone), service worker enregistré et actif, toutes les icônes en 200 — critères d'installabilité réunis (testé sur localhost ; HTTPS réel viendra avec Netlify en P7)
2. [x] Skeleton de chargement visible dès le premier rendu (capturé avant résolution des données), jamais d'écran figé
3. [x] Testé à 375px réel (iframe pleine page) : pas d'overflow horizontal, cartes + bandeau semaine + modale de détail tous lisibles

Icônes générées via `assets/icons/icon-source.svg` (motif vagues, palette de marque) rendu en PNG (`qlmanage` + `sips`, pas d'ImageMagick/PIL disponible sur la machine) : 192/512 (any), 192/512 (maskable), apple-touch-icon 180, favicon 48. `sw.js` : cache-first sur l'app shell uniquement, jamais sur les appels Open-Meteo (toujours réseau, pas de données perimées). Contraste texte vérifié (≥5:1 sur les accents, ≥8:1 sur le texte atténué).

---

### P5 — Alerte Telegram (Netlify Scheduled Function) ✅ VALIDÉE
**Périmètre :**
- [x] Bot créé via BotFather, token + chat_id en variables d'environnement Netlify (jamais en dur)
- [x] Scheduled Function cron : vendredi 16h Tahiti = samedi 02h00 UTC
- [x] Logique : prévisions samedi/dimanche, envoi si au moins un spot atteint "bonnes conditions" ou mieux (score ≥ 50, voir revue des seuils ci-dessous)
- [x] Format du message (spot(s), jour, créneau, houle, vent, lien dashboard)

**Gate P5 :**
1. [x] Déclenchement manuel de la fonction → message Telegram reçu, bien formaté. Bot `@surf_alert_tahiti_bot` créé, chat_id récupéré via `getUpdates` (le bouton "Start" de Telegram Web est resté silencieux côté utilisateur, contourné par `/start` tapé manuellement dans l'app). Testé à deux niveaux : `curl` brut (connectivité token/chat_id), puis un run réel du handler avec le seuil temporairement forcé à 0 (revert immédiat après) pour valider le vrai chemin de code, format inclus.
2. [x] Aucun token ou secret en dur dans le code commité
3. [x] Test avec données simulées "aucun bon spot" → aucun message envoyé (pas de faux positif). Revérifié avec les vraies données du week-end du 22-23 août 2026 (scores 38-47, sous le seuil) : aucun envoi tenté.

Implémentation : `netlify/functions/surf-alert.js`, déclenché par `netlify.toml` (`[functions."surf-alert"] schedule = "0 2 * * 6"`). Réutilise tel quel `js/score.js`, `js/api.js` et `js/format.js` (prévu depuis P2 : ce sont des scripts vanilla sans dépendance au DOM), en leur ajoutant chacun un export CommonJS conditionnel (`if (typeof module !== "undefined")`) qui ne s'active que côté Node, sans rien changer à leur usage navigateur existant.

`nextWeekendDates()` calcule toujours le **prochain** samedi/dimanche à partir de l'heure de Tahiti (jamais "aujourd'hui" même si la fonction est déclenchée manuellement un samedi), pour rester robuste à un test manuel n'importe quel jour de la semaine. Pour chaque spot et chaque jour cible, seul le meilleur créneau est retenu (évite un message avec 20 lignes quasi identiques si toute une journée est bonne).

Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) lus uniquement via `process.env`, jamais en dur. `.env` (local, gitignored) + `.env.example` (commité, sans valeurs) pour le test local via `node scripts/test-surf-alert.js` (`--dry-run` pour voir le message sans appeler Telegram) : sert de filet en l'absence du CLI Netlify pour invoquer la fonction manuellement.

**Retour utilisateur post-premier envoi, deux révisions :**
- **Seuils de score et libellés revus (impacte aussi l'UI, pas seulement l'alerte).** `scoreToStatus` dans `js/score.js` passe de 0-35/36-65/66-100 ("pas terrible"/"correct"/"ça va être bon") à **0-49/50-75/76-100** ("pas terrible"/"bonnes conditions"/"excellentes conditions"), sur demande explicite de l'utilisateur. Cette fonction est la seule source de vérité pour les couleurs et libellés partout dans l'app (cartes, bandeau semaine, tableau heure par heure) *et* pour la fonction d'alerte : `surf-alert.js` n'a plus de seuil dupliqué (`SCORE_THRESHOLD` supprimé), un créneau qualifie dès que `scoreToStatus(score).level !== "danger"`. Un seul endroit à modifier si les seuils rebougent.
  - Vérifié que les nouveaux libellés plus longs ne cassent pas le mobile : le badge de la vue détail passe à la ligne proprement (`flex-wrap: wrap` sur `.detail-header`) même avec le libellé le plus long ("excellentes conditions maintenant") à 328px de large. Sur la carte (`.card-head`, pas de `flex-wrap`), le pire cas mesuré (nom de spot le plus long + libellé le plus long) redistribue le titre sur une ligne de plus (3 → 4 lignes) mais rien n'est coupé ni ne déborde (`overflow-x: hidden` déjà en filet de sécurité sur `.spot-card`) ; pas une régression, ce nom de spot wrappait déjà sur 3 lignes avant.
- **Message Telegram redesigné.** Texte dense sur une seule ligne par créneau remplacé par un format `parse_mode: "HTML"` : titre en gras, un bloc par créneau (nom du spot en gras + 3 lignes courtes : jour/heure/score, houle, vent), regroupé par palier ("🟢 Excellentes conditions" / "🟡 Bonnes conditions") avec le titre de section repris directement du label de `scoreToStatus` (encore une fois, pas de texte dupliqué qui pourrait diverger). Bug trouvé et corrigé pendant le test : une ligne vide superflue s'affichait après chaque titre de section (double `\n\n` involontaire). Rendu HTML vérifié en conditions réelles (Telegram a bien interprété les balises `<b>` en gras).

**Suivi : cadence hebdomadaire remplacée par une fenêtre glissante bi-quotidienne.** Sur demande explicite de l'utilisateur ("actualisation journalière, alerte uniquement si bonnes conditions"). Décisions de cadence tranchées avec l'utilisateur (`AskUserQuestion`) plutôt que devinées :
- **Fenêtre de verification :** aujourd'hui + demain (glissante), plutôt qu'une fenêtre plus longue (aujourd'hui + 3 jours envisagé, écarté : plus de risque d'alertes quasi identiques plusieurs jours de suite sans mémoire d'état entre les exécutions). `nextWeekendDates()` (qui calculait toujours le prochain samedi/dimanche) devient `upcomingWindowDates()` (aujourd'hui + demain, triviale par comparaison). Le week-end n'est plus un cas particulier : le vendredi verifie naturellement vendredi+samedi, le samedi verifie samedi+dimanche.
- **Cadence :** deux passages par jour plutôt qu'un, sur suggestion de l'utilisateur (reponse libre à la question posée) : 16h Tahiti (avance sur le lendemain) et 6h Tahiti (confirmation du jour même avec des données de prévision plus fraîches et plus fiables à courte échéance). Un seul cron couvre les deux horaires (`"0 2,16 * * *"`, liste séparée par virgule dans le champ heure) : pas besoin de dupliquer la fonction ou d'ajouter une deuxième entree Netlify.
- **Choix assumé, pas de déduplication entre exécutions.** Si une bonne fenêtre dure plusieurs jours, l'alerte se répète à chaque passage (jusqu'à 2x/jour) plutôt que de ne prévenir qu'une fois : éviter ce doublon demanderait de la mémoire d'état entre invocations (base de données ou stockage externe), complexité non demandée et pas ajoutée. À revisiter si ça s'avère gênant à l'usage réel.
- Testé sur données réelles du 24-25 août 2026 : la fenêtre a trouvé un vrai créneau "bonnes conditions" sur les 4 spots à la fois aujourd'hui (19h, score 56) et demain (00h, score 53) ; envoi réel confirmé via `node scripts/test-surf-alert.js` (pas besoin de forcer le seuil comme au premier test, ces conditions étaient authentiques).

---

### P6 — Sécurité & hardening ✅ VALIDÉE
**Périmètre :**
- [x] Recherche de secrets en dur dans le repo (`grep`)
- [x] `.env` / secrets dans `.gitignore`
- [x] Vérification que la Scheduled Function n'est pas déclenchable publiquement de façon abusive
- [x] Audit rapide des dépendances si un `package.json` est introduit

**Gate P6 :**
1. [x] Aucun token/clé trouvé en clair dans le repo. `git grep` sur les motifs token/secret/api_key/password/bearer dans tous les fichiers suivis : rien en dehors de `process.env.TELEGRAM_*` et des placeholders vides de `.env.example`. Scan large complémentaire (chaînes de 32+ caractères alphanumériques) : uniquement des faux positifs (noms de fichiers longs). Recherche du token Telegram réel dans tout l'historique git (`git log --all -p`) : jamais présent, y compris avant qu'il soit mis dans `.env`.
2. [x] `.env` et équivalents absents du contrôle de version. Confirmé jamais tracké (`git log --all --full-history -- .env`, vide) et actuellement ignoré (`git status --ignored`). `.gitignore` étendu à `.env.local` et `.env.*.local` (conventions courantes non couvertes par la seule entrée `.env`). Permissions du fichier resserrées à `600` (lecture/écriture propriétaire seulement, c'était `644` par défaut).
3. [x] La fonction Telegram n'est pas exposée en endpoint public appelable librement. Vérifié sur la doc officielle Netlify (pas juste supposé) : "You can't invoke scheduled functions directly with a URL [...] similar to event-triggered functions, you can't invoke them directly with a URL" pour les déploiements publiés. Contrairement a une fonction Netlify classique, une Scheduled Function n'a tout simplement pas de route HTTP publique en production ; seuls le scheduler de Netlify, le bouton "Run now" de l'UI, ou le CLI (`netlify functions:invoke`) peuvent la déclencher. Aucun code de garde supplémentaire necessaire dans `surf-alert.js`. Source : [docs.netlify.com/build/functions/scheduled-functions](https://docs.netlify.com/build/functions/scheduled-functions/).

`package.json` : toujours absent, aucune dependance npm utilisee (fetch et AbortController natifs a Node 18+, disponibles dans le runtime Netlify Functions) — l'audit de dependances n'a donc rien a auditer, conformement a l'item conditionnel du perimetre.

Verification complementaire hors perimetre strict de la gate mais dans l'esprit de la phase : pas de surface XSS identifiee dans `js/app.js` (seules donnees templatees dans le HTML : `data/spots.json`, statique et control par le developpeur, jamais d'input utilisateur ni de texte libre venant de l'API Open-Meteo, qui ne renvoie que des valeurs numeriques passees par des formatteurs a vocabulaire fixe dans `js/format.js`).

---

### P7 — Déploiement Netlify / Go-live 🟡 EN COURS (1 et 2 faits, 3 nécessite du temps réel)
**Périmètre :**
- [x] Déploiement Netlify (repo connecté ou déploiement manuel)
- [x] Variables d'environnement configurées en production
- [ ] Observation réelle sur plusieurs jours avant de faire confiance à l'alerte

**Gate P7 :**
1. [x] Le dashboard est accessible en ligne (URL Netlify)
2. [x] La Scheduled Function se déclenche à l'heure prévue (vérifié dans les logs Netlify)
3. [ ] Sur plusieurs jours réels, les scores affichés correspondent à l'observation terrain (cf. points à vérifier section 7 du prompt source : vent idéal Orofara/Ahonu, coordonnées Ahonu, webcam L'embouchure)

Dépôt GitHub créé (`gh repo create`, déjà authentifié sur la session) : **github.com/ArnaudZeh/surf-alert**, public sur demande explicite de l'utilisateur (aucun secret dans le code, vérifié en P6). Connecté à Netlify via déploiement Git (pas de CLI Netlify installé sur la machine) : app GitHub de Netlify autorisée sur ce nouveau repo (elle n'avait accès qu'à un seul autre projet de l'utilisateur), import standard, build settings auto-détectés depuis `netlify.toml` (publish=".", functions="netlify/functions", aucune build command puisque site statique sans étape de build). `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` saisis dans le formulaire de configuration du projet avant le premier déploiement (jamais en dur dans le repo).

Site live : **surf-alert-tahiti.netlify.app**. Vérifié après déploiement : dashboard charge avec données réelles, aucune erreur console, les 5 lignes du nouveau score s'affichent correctement en production. Fonction confirmée "Scheduled" dans l'UI Netlify avec le cron exact (`0 2,16 * * *`, "At 02:00 AM and 04:00 PM"), prochaine exécution affichée "Today at 4:00 PM **GMT-10**" (soit bien l'heure de Tahiti, pas une coïncidence de timezone). Déclenchement manuel via le bouton "Run now" de l'UI Netlify (pas juste un test local) : log réel de production confirmant l'exécution complète en conditions réelles — `"Aucun spot au-dessus du seuil aujourd'hui/demain, aucune alerte envoyee"`, 1006ms, 131 MB — preuve que le bundler de fonctions Netlify embarque correctement `js/api.js`, `js/score.js`, `js/format.js` et `data/spots.json` (chemins relatifs `require("../../...")`), pas seulement testé en local avec Node directement.

**Reste à faire, ne dépend pas de plus de travail mais du temps qui passe :** observer les scores affichés sur plusieurs jours réels et les comparer au ressenti sur le terrain (vent idéal Orofara/Ahonu resté incertain depuis P0, cf. section Risques) avant de faire pleinement confiance à l'alerte automatique.

---

## Risques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Direction de vent idéale Orofara/Ahonu incertaine (sources contradictoires) | Moyen | Moyen | Config facilement modifiable ; ajuster après retour terrain (P7) |
| Webcam de L'embouchure (lien ancien) potentiellement morte | Moyen | Faible | Fallback gracieux si iframe/lien en échec |
| Pas de données de marée en V1 | Faible | Moyen | Champ `maree_ideale` déjà prévu en config pour V2 |
| Quota/disponibilité Open-Meteo (API gratuite) | Faible | Moyen | Gestion d'erreur + retry simple, pas de dépendance à une clé |

## Décisions techniques

| Décision | Rationale | Alternative écartée |
|----------|-----------|----------------------|
| Vanilla JS, pas de framework | V1 simple à 4 cartes, déploiement rapide | React/Vue (overkill pour ce périmètre) |
| Netlify plutôt que GitHub Pages | Besoin de Scheduled Function pour l'alerte Telegram | GitHub Pages (pas de fonctions serverless) |
| Pas d'intégration marée en V1 | Aucune source gratuite fiable confirmée pour Tahiti | Scraper une source non fiable |
