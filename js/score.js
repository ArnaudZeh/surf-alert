/*
 * Moteur de score (section 3 du prompt source, revu apres P6 sur demande
 * utilisateur pour integrer periode et taille de deferlement estimee).
 * Score 0-100 = taille houle brute (15%) + taille vagues au deferlement
 * estimee (15%) + direction houle (25%) + periode (15%) + vent (30%).
 * Convention meteo : degre = direction d'ou vient houle/vent.
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angularDifference(a, b) {
  return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
}

/*
 * 0 en dessous du minimum surfable du spot, croissance jusqu'a un plateau
 * entre 1.5m et 3m, puis decroissance au-dela (houle engagee, plus dure a
 * surfer, niveau requis plus eleve).
 */
function houleSizeScore(houleM, houleMinM) {
  if (houleM < houleMinM) return 0;

  const plateauStart = 1.5;
  const plateauEnd = 3.0;
  const decayRatePerMeter = 40;

  if (houleM <= plateauStart) {
    const span = plateauStart - houleMinM;
    if (span <= 0) return 100;
    return clamp(((houleM - houleMinM) / span) * 100, 0, 100);
  }
  if (houleM <= plateauEnd) return 100;

  return clamp(100 - (houleM - plateauEnd) * decayRatePerMeter, 0, 100);
}

// Indice de deferlement de McCowan (Hb = indice x profondeur d'eau au point
// de deferlement, ~0.78 pour une plage a pente moderee) : voir
// estimateBreakingHeightM ci-dessous.
const BREAKER_INDEX = 0.78;
const GRAVITY_MS2 = 9.81;
const BREAKING_HEIGHT_CONSTANT = Math.sqrt(GRAVITY_MS2 * BREAKER_INDEX) / (4 * Math.PI);

/*
 * Estime la hauteur de deferlement a la cote ("la taille des vagues" telle
 * que ressentie sur le spot) a partir de la houle et de la periode mesurees
 * au large : Open-Meteo ne fournit que la houle offshore, jamais la hauteur
 * reelle de la vague qui se casse. Derive de la conservation du flux
 * d'energie en theorie lineaire des vagues entre le large et la zone de
 * deferlement, combinee au critere de deferlement de McCowan (voir
 * BREAKER_INDEX). Approximation assumee : ignore la refraction, la houle
 * croisee et la pente reelle de chaque spot (donnee non disponible) — une
 * estimation plausible, pas une mesure. Consequence attendue et voulue :
 * une houle longue periode "grossit" davantage en approchant la cote que
 * la meme hauteur en periode courte, ce qui correspond au ressenti connu
 * des surfeurs (une houle longue periode surprend toujours par sa taille
 * reelle comparee a la lecture au large).
 */
function estimateBreakingHeightM(houleM, periodeS) {
  return Math.pow(houleM ** 2 * periodeS * BREAKING_HEIGHT_CONSTANT, 0.4);
}

/*
 * Qualite/puissance de la houle selon sa periode, independamment de sa
 * taille : une periode courte (mer de vent locale) est desorganisee et
 * molle a hauteur egale, une periode longue (houle lointaine, groundswell)
 * est propre et puissante (meme logique que la legende du tableau heure par
 * heure dans app.js).
 */
function houlePeriodeScore(periodeS) {
  // Floor abaisse de 6 a 4s (P8, retour terrain L'embouchure 29/08/2026,
  // 11h-13h : session jugee bonne avec une periode mesuree a 6.2s, alors que
  // l'ancien plancher la notait quasi nulle des la sortie de la zone "mer de
  // vent pure").
  const floor = 4;
  const ceiling = 14; // au-dela : houle longue et puissante, score plein
  if (periodeS <= floor) return 0;
  if (periodeS >= ceiling) return 100;
  return clamp(((periodeS - floor) / (ceiling - floor)) * 100, 0, 100);
}

/*
 * Ecart <= 20 degres : score plein. Degrade lineairement jusqu'a 0 a la
 * tolerance du spot.
 */
function houleDirectionScore(houleDirectionDeg, idealDeg, toleranceDeg) {
  const diff = angularDifference(houleDirectionDeg, idealDeg);
  const fullScoreThreshold = 20;

  if (diff <= fullScoreThreshold) return 100;
  if (diff >= toleranceDeg) return 0;

  const span = toleranceDeg - fullScoreThreshold;
  if (span <= 0) return 0;
  return clamp(100 - ((diff - fullScoreThreshold) / span) * 100, 0, 100);
}

/*
 * Au-dela de 25-30 km/h, le score est plafonne meme si la direction est
 * parfaitement offshore (vent trop fort = mer hachee).
 */
function windSpeedCap(ventVitesseKmh) {
  if (ventVitesseKmh <= 25) return 100;
  if (ventVitesseKmh <= 30) {
    return clamp(100 - ((ventVitesseKmh - 25) / 5) * 40, 60, 100);
  }
  return clamp(60 - (ventVitesseKmh - 30) * 2, 20, 60);
}

/*
 * Offshore (ecart faible vs vent_offshore_ideal_deg) = score plein.
 * Cross-shore (~90 deg) = score moyen. Onshore (~180 deg) = score faible.
 */
function windScore(ventDirectionDeg, ventVitesseKmh, offshoreIdealDeg) {
  const diff = angularDifference(ventDirectionDeg, offshoreIdealDeg);
  const directionScore = clamp(((180 - diff) / 180) * 100, 0, 100);
  return Math.min(directionScore, windSpeedCap(ventVitesseKmh));
}

/*
 * Mapping du score vers l'affichage feu tricolore. 4 paliers desormais
 * (avant : 3 paliers, seuils 35/65 puis 50/75) : en dessous de 50, pas de
 * bonnes conditions ; 50 a 65, passables ; 65 a 80, bonnes ; au-dela,
 * excellentes. Seule source de verite, reutilisee partout (cartes, bandeau
 * semaine, tableau heure par heure, alerte Telegram) : la modifier ici
 * suffit a tout mettre a jour. Le niveau "good" est nouveau : il a besoin
 * de sa propre couleur (--color-good) et de ses propres regles .status-good
 * en CSS, en plus des 3 niveaux existants.
 */
function scoreToStatus(score) {
  if (score < 50) {
    return { level: "danger", label: "pas terrible" };
  }
  if (score <= 65) {
    return { level: "warning", label: "conditions passables" };
  }
  if (score <= 80) {
    return { level: "good", label: "bonnes conditions" };
  }
  return { level: "success", label: "excellentes conditions" };
}

function computeScore(spot, conditions) {
  const houleSize = houleSizeScore(conditions.houleM, spot.houle_min_m);
  const breakingHeightM = estimateBreakingHeightM(conditions.houleM, conditions.houlePeriodeS);
  const tailleVagues = houleSizeScore(breakingHeightM, spot.houle_min_m);
  const houleDirection = houleDirectionScore(
    conditions.houleDirectionDeg,
    spot.houle_direction_ideale_deg,
    spot.houle_direction_tolerance_deg
  );
  const houlePeriode = houlePeriodeScore(conditions.houlePeriodeS);
  const wind = windScore(
    conditions.ventDirectionDeg,
    conditions.ventVitesseKmh,
    spot.vent_offshore_ideal_deg
  );

  const total =
    houleSize * 0.15 +
    tailleVagues * 0.15 +
    houleDirection * 0.25 +
    houlePeriode * 0.15 +
    wind * 0.3;

  return {
    score: Math.round(clamp(total, 0, 100)),
    breakdown: {
      houleSize: Math.round(houleSize),
      tailleVagues: Math.round(tailleVagues),
      houlePeriode: Math.round(houlePeriode),
      houleDirection: Math.round(houleDirection),
      wind: Math.round(wind),
    },
  };
}

// Reutilise tel quel par la Netlify Function d'alerte (moteur isole, sans
// dependance au DOM, prevu pour ca depuis P2).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeScore, scoreToStatus };
}
