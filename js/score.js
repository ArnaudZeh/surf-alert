/*
 * Moteur de score (section 3 du prompt source).
 * Score 0-100 = taille de houle (30%) + direction de houle (35%) + vent (35%).
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
 * Mapping du score vers l'affichage feu tricolore. Seuils revus (avant : 35/65) :
 * en dessous de 50, pas de bonnes conditions ; 50 a 75, bonnes conditions ;
 * au-dela, excellentes. Seule source de verite, reutilisee partout (cartes,
 * bandeau semaine, tableau heure par heure, alerte Telegram) : la modifier
 * ici suffit a tout mettre a jour.
 */
function scoreToStatus(score) {
  if (score < 50) {
    return { level: "danger", label: "pas terrible" };
  }
  if (score <= 75) {
    return { level: "warning", label: "bonnes conditions" };
  }
  return { level: "success", label: "excellentes conditions" };
}

function computeScore(spot, conditions) {
  const houleSize = houleSizeScore(conditions.houleM, spot.houle_min_m);
  const houleDirection = houleDirectionScore(
    conditions.houleDirectionDeg,
    spot.houle_direction_ideale_deg,
    spot.houle_direction_tolerance_deg
  );
  const wind = windScore(
    conditions.ventDirectionDeg,
    conditions.ventVitesseKmh,
    spot.vent_offshore_ideal_deg
  );

  const total = houleSize * 0.3 + houleDirection * 0.35 + wind * 0.35;

  return {
    score: Math.round(clamp(total, 0, 100)),
    breakdown: {
      houleSize: Math.round(houleSize),
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
