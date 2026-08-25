/*
 * Convention meteo : degre = direction d'ou vient houle/vent (0 = nord, 90 = est...).
 */

const COMPASS_LABELS = [
  "nord",
  "nord-nord-est",
  "nord-est",
  "est-nord-est",
  "est",
  "est-sud-est",
  "sud-est",
  "sud-sud-est",
  "sud",
  "sud-sud-ouest",
  "sud-ouest",
  "ouest-sud-ouest",
  "ouest",
  "ouest-nord-ouest",
  "nord-ouest",
  "nord-nord-ouest",
];

const COMPASS_ABBREVIATIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSO",
  "SO",
  "OSO",
  "O",
  "ONO",
  "NO",
  "NNO",
];

function compassIndex(deg) {
  return Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
}

function degToCompassLabel(deg) {
  if (typeof deg !== "number" || Number.isNaN(deg)) return "direction inconnue";
  return COMPASS_LABELS[compassIndex(deg)];
}

function degToCompassAbbrev(deg) {
  if (typeof deg !== "number" || Number.isNaN(deg)) return "?";
  return COMPASS_ABBREVIATIONS[compassIndex(deg)];
}

function windForceLabel(kmh) {
  if (typeof kmh !== "number" || Number.isNaN(kmh)) return "vent inconnu";
  if (kmh < 10) return "leger";
  if (kmh < 20) return "modere";
  if (kmh < 30) return "soutenu";
  return "fort";
}

function formatTahitiTime(isoLocalTime) {
  if (!isoLocalTime) return null;
  const [, time] = isoLocalTime.split("T");
  return time ? time.slice(0, 5) : null;
}

const DAY_LABELS_SHORT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

/*
 * Heure actuelle a Tahiti (UTC-10 fixe, pas de changement d'heure), arrondie
 * a l'heure pleine, au format "YYYY-MM-DDTHH:00" pour matcher les series
 * horaires renvoyees par Open-Meteo (timezone=Pacific/Tahiti).
 */
function currentTahitiHourString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Tahiti",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:00`;
}

// "2026-08-14T07:00" -> jour de semaine, en interpretant la date comme un
// jour civil (pas de conversion de fuseau, la valeur est deja en heure de Tahiti).
function dayLabelFromIsoLocal(isoLocalTime) {
  const [datePart] = isoLocalTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const dayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return DAY_LABELS_SHORT[dayIndex];
}

function dayNumberFromIsoLocal(isoLocalTime) {
  const [datePart] = isoLocalTime.split("T");
  return Number(datePart.split("-")[2]);
}

function formatSlotLabel(isoLocalTime) {
  const [datePart, time] = isoLocalTime.split("T");
  const label = dayLabelFromIsoLocal(isoLocalTime);
  return `${label}. ${dayNumberFromIsoLocal(isoLocalTime)} vers ${time.slice(0, 5)}`;
}

function formatHourOnly(isoLocalTime) {
  const [, time] = isoLocalTime.split("T");
  return `${time.slice(0, 2)}h`;
}

const DAYLIGHT_START_HOUR = 6;
const DAYLIGHT_END_HOUR = 18;

/*
 * Un creneau la nuit n'a aucun interet a etre recommande comme "meilleur
 * creneau" (il fait nuit, personne ne surfe) : simplification volontaire a
 * heures fixes (6h-18h) plutot qu'un calcul astronomique de lever/coucher
 * du soleil, sur demande explicite de l'utilisateur. Seule la SELECTION du
 * meilleur creneau utilise ce filtre ; l'affichage des conditions actuelles
 * (peu importe l'heure) n'y est pas soumis.
 */
function isDaylightSlot(isoLocalTime) {
  const hour = Number(isoLocalTime.slice(11, 13));
  return hour >= DAYLIGHT_START_HOUR && hour <= DAYLIGHT_END_HOUR;
}

// Reutilise tel quel par la Netlify Function d'alerte.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    degToCompassLabel,
    degToCompassAbbrev,
    windForceLabel,
    currentTahitiHourString,
    dayLabelFromIsoLocal,
    dayNumberFromIsoLocal,
    formatSlotLabel,
    formatHourOnly,
    isDaylightSlot,
  };
}
