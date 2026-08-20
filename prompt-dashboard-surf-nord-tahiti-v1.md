# Prompt de build : dashboard météo surf, côte nord de Tahiti (V1)

Ce document est prêt à être collé tel quel dans Claude Code pour construire l'application.

## 0. Objectif en une phrase

Un dashboard web statique, ultra lisible (façon feu tricolore), qui affiche les conditions de surf pour 4 spots de la côte nord de Tahiti, avec une vue semaine, une recommandation "spot du jour", et une alerte Telegram automatique le vendredi si le week-end s'annonce bon.

## Avant de commencer

Avant toute chose, exécute la commande `/phased-dev` pour construire le plan de développement du projet en phases, avec des étapes de tests et de validation a chaque étape.

Pour toute la partie interface (UI/UX), exécute les skills `/ui-ux-pro-max` et `/frontend-design` avant de coder les écrans, pour garantir une interface soignée et cohérente plutôt qu'un rendu générique.

## 1. Spots (config des données)

Utilise cette structure comme fichier de config central (JSON), à charger par le moteur de score. Toutes les coordonnées viennent de surf-forecast.com ; celles d'Ahonu sont approximatives (le spot est à environ 200m d'Orofara, pas de source dédiée trouvée).

```json
[
  {
    "id": "orofara",
    "nom": "Orofara",
    "lat": -17.51,
    "lon": -149.43,
    "type": "point break droit",
    "niveau": "intermediaire a avance sur grosse houle nord",
    "houle_min_m": 0.5,
    "houle_direction_ideale_deg": 22,
    "houle_direction_tolerance_deg": 45,
    "vent_offshore_ideal_deg": 180,
    "maree_ideale": "toutes marees",
    "dangers": ["rochers", "requins"],
    "commentaire": "Fonctionne la majorite de l'annee des 0.5m de houle. Vent ideal a confirmer sur le terrain, sources en ligne divergentes (sud / nord / nord-est selon le site).",
    "webcam_url": "https://tahiti-webcam.online/orofara"
  },
  {
    "id": "ahonu",
    "nom": "Ahonu",
    "lat": -17.51,
    "lon": -149.43,
    "type": "point break droit, tres proche d'Orofara (~200m)",
    "niveau": "intermediaire a avance, devient tubulaire et engage sur grosse houle nord",
    "houle_min_m": 0.5,
    "houle_direction_ideale_deg": 22,
    "houle_direction_tolerance_deg": 45,
    "vent_offshore_ideal_deg": 180,
    "maree_ideale": "toutes marees",
    "dangers": ["rochers", "requins", "take-off engage sur grosse houle"],
    "commentaire": "Profil calque sur Orofara en l'absence de donnee dediee. Legerement plus agreable a surfer qu'Orofara selon retour terrain.",
    "webcam_url": "https://tahiti-webcam.online/ahonu"
  },
  {
    "id": "papenoo-beach",
    "nom": "Papenoo Beach (Chinaman's Bay)",
    "lat": -17.51,
    "lon": -149.40,
    "type": "beach break, gauches et droites",
    "niveau": "tous niveaux",
    "houle_min_m": 0.5,
    "houle_direction_ideale_deg": 22,
    "houle_direction_tolerance_deg": 45,
    "vent_offshore_ideal_deg": 180,
    "maree_ideale": "toutes marees",
    "dangers": ["rochers", "requins", "parfois du monde"],
    "commentaire": "Aucune webcam fiable trouvee en ligne.",
    "webcam_url": null
  },
  {
    "id": "embouchure",
    "nom": "L'embouchure (Papenoo Rivermouth)",
    "lat": -17.52,
    "lon": -149.40,
    "type": "river break, gauches et droites",
    "niveau": "intermediaire recommande",
    "houle_min_m": 0.5,
    "houle_direction_ideale_deg": 0,
    "houle_direction_tolerance_deg": 45,
    "vent_offshore_ideal_deg": 180,
    "maree_ideale": "basse mer",
    "dangers": ["courants", "requins", "eau de riviere apres forte pluie (risque sanitaire)"],
    "commentaire": "Webcam potentielle mais source ancienne, verifier qu'elle tourne encore avant integration.",
    "webcam_url": "https://newstv.fr/2015/10/26/webcam-papenoo-embouchure-tahiti/"
  }
]
```

Note sur les degres : 0 = nord, 90 = est, 180 = sud, 270 = ouest, en convention meteo (direction d'où ça vient).

## 2. Stack technique

- Frontend : HTML/CSS/JS vanilla, statique, un seul fichier ou une poignee de fichiers simples. Pas de framework lourd necessaire pour une V1.
- Donnees houle et vent : Open-Meteo Marine API (`https://marine-api.open-meteo.com/v1/marine`) pour houle (hauteur, periode, direction) et Open-Meteo Forecast API (`https://api.open-meteo.com/v1/forecast`) pour le vent et la meteo generale. Gratuit, sans cle, appelable directement depuis le navigateur.
- Maree : pas d'integration en V1 (source fiable gratuite non confirmee pour Tahiti). Prevoir le champ `maree_ideale` dans la config pour une V2.
- Notification : Netlify Scheduled Function (cron) + Telegram Bot API.
- Hebergement : Netlify, pour beneficier a la fois de l'hebergement statique et de la scheduled function. GitHub Pages reste une option si la notification est desactivee.

## 3. Moteur de score

Pour chaque spot et chaque creneau horaire, calculer un score de 0 a 100 a partir de trois composantes (la maree n'est pas utilisee en V1, poids redistribue sur les deux autres facteurs directionnels) :

1. **Taille de houle (30%)** : 0 si hauteur < `houle_min_m` du spot, puis score croissant jusqu'a un plateau autour de 1.5 a 2m, puis score decroissant au dela de 3m (grosse houle = spot plus engage, niveau requis plus eleve).
2. **Direction de houle (35%)** : ecart angulaire entre la direction de houle et `houle_direction_ideale_deg`. Ecart <= 20° = score plein, degrade lineairement jusqu'a 0 a `houle_direction_tolerance_deg`.
3. **Vent (35%)** : ecart angulaire entre la direction du vent et `vent_offshore_ideal_deg`. Offshore (ecart faible) = score plein. Cross-shore (ecart ~90°) = score moyen. Onshore (ecart ~180°) = score faible. Ponderer aussi par la force du vent : au-dela de 25-30 km/h, plafonner le score meme si la direction est bonne.

Mapping du score vers l'affichage (feu tricolore) :
- 0 a 35 : rouge, "pas terrible"
- 36 a 65 : orange, "correct"
- 66 a 100 : vert, "ca va etre bon"

## 4. Interface

- Vue par defaut : 4 cartes, une par spot, avec la pastille de couleur, la taille de houle, le vent (direction + force en mots simples), et une mention "spot du jour" mise en avant sur celui qui a le meilleur score actuel.
- Clic sur une carte : vue detail avec la webcam si disponible, un mini graphique 3 jours, et le meilleur creneau a venir sur les 5 prochains jours.
- Bandeau semaine : une ligne de pastilles de couleur par jour (score du meilleur moment de la journee, tous spots confondus), pour reperer les bonnes fenetres a venir en un coup d'oeil.
- Mobile-first, installable en PWA (manifest.json + service worker minimal pour l'icone sur l'ecran d'accueil).

## 5. Alerte Telegram

- Netlify Scheduled Function declenchee chaque vendredi a 16h heure de Tahiti. Tahiti est en UTC-10 toute l'annee (pas de changement d'heure), donc l'expression cron doit etre exprimee en UTC : vendredi 16h heure de Tahiti correspond a 02h00 UTC le samedi.
- Logique : recuperer les previsions du samedi et du dimanche pour les 4 spots, et envoyer un message si au moins un spot atteint le seuil vert (score >= 66) a un moment de la journee.
- Format du message : nom du ou des spots concernes, jour et creneau horaire approximatif, taille de houle et condition de vent en une phrase simple, lien vers le dashboard.
- Mise en place du bot : passer par BotFather sur Telegram pour creer le bot et recuperer le token, puis stocker ce token et le chat_id en variable d'environnement Netlify (jamais en dur dans le code).

## 6. Ordre de developpement recommande

1. Squelette HTML/CSS de la vue 4 cartes, avec donnees factices.
2. Fichier de config JSON des spots (section 1 ci-dessus).
3. Appel Open-Meteo Marine + Forecast pour chaque spot, affichage des donnees brutes.
4. Implementation du moteur de score (section 3) et affichage du feu tricolore.
5. Bandeau semaine et vue detail par spot.
6. Integration des webcams (iframe ou simple lien selon ce que chaque source autorise).
7. Netlify Scheduled Function + integration Telegram.
8. Deploiement Netlify, tests reels sur plusieurs jours avant de faire confiance a l'alerte.

## 7. Points a verifier sur le terrain avant de figer la V1

- Vent ideal a Orofara et Ahonu : les sources en ligne se contredisent (sud, nord, ou nord-est selon le site). La config ci-dessus part sur "offshore du sud" par defaut, a corriger si l'experience terrain dit autre chose.
- Coordonnees d'Ahonu : reprises d'Orofara faute de source dediee, a affiner de quelques centaines de metres si besoin.
- Webcam de L'embouchure : lien trouve sur une source datant de plusieurs annees, verifier qu'elle est toujours active avant de l'integrer.
- Aucune webcam trouvee pour Papenoo Beach (Chinaman's Bay) : a chercher localement ou laisser ce champ vide.
