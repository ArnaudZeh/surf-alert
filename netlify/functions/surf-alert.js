/*
 * Netlify Scheduled Function (P5, voir PLAN.md) : verifie les previsions
 * d'aujourd'hui et demain pour les 4 spots, et envoie une alerte Telegram si
 * au moins un spot atteint au moins "bonnes conditions" (score > 65, level
 * "good" ou "success", voir scoreToStatus dans js/score.js) sur l'un des
 * deux jours. Le palier "conditions passables" (50-65) ne declenche pas
 * d'alerte : nuance utile sur le dashboard, pas assez engageant pour
 * deranger l'utilisateur. Aucun envoi si aucun spot ne passe le seuil (pas
 * de faux positif).
 *
 * Declenchement : cron "0 2,16 * * *" dans netlify.toml, deux fois par jour,
 * soit 06h00 et 16h00 heure de Tahiti (UTC-10) :
 * - 16h la veille (avance) : previent du lendemain avant la fin de journee.
 * - 6h le jour meme (confirmation) : re-verifie avec des donnees de
 *   prevision plus fraiches et plus fiables a courte echeance, au cas ou la
 *   fenetre se soit degradee ou amelioree depuis la veille.
 * Pas de memoire entre les executions : si une bonne fenetre dure plusieurs
 * jours, l'alerte se repete a chaque passage plutot que de ne prevenir
 * qu'une fois (choix delibere, garde simple, pas de stockage a gerer).
 *
 * Reutilise le moteur de score et l'acces Open-Meteo du dashboard (js/score.js,
 * js/api.js, js/format.js sont des scripts vanilla sans dependance au DOM,
 * exportes en CommonJS pour Node en plus de leur usage navigateur). Le seuil
 * n'est pas duplique ici : on reutilise scoreToStatus (source unique aussi
 * pour les couleurs de l'UI) et on filtre sur son "level".
 */

const spots = require("../../data/spots.json");
const { fetchSpotForecast } = require("../../js/api.js");
const { computeScore, scoreToStatus } = require("../../js/score.js");
const {
  currentTahitiHourString,
  degToCompassLabel,
  windForceLabel,
  formatSlotLabel,
  isDaylightSlot,
} = require("../../js/format.js");

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Aujourd'hui et demain, heure de Tahiti. Fenetre glissante volontairement
// courte : couvre "jour/jour suivant" et, quand elle approche, le week-end,
// sans avoir a le detecter explicitement (le vendredi verifie deja
// vendredi+samedi, le samedi verifie samedi+dimanche).
function upcomingWindowDates() {
  const todayKey = currentTahitiHourString().slice(0, 10);
  return [todayKey, addDays(todayKey, 1)];
}

// Meilleur creneau du spot pour une date donnee, ou null si aucune donnee
// pour ce jour (ex : hors des 7 jours renvoyes par Open-Meteo). Creneaux de
// nuit ignores (isDaylightSlot, 6h-18h) : jamais alerter pour un creneau a
// une heure ou personne ne surfe.
function bestSlotForDate(spot, hourly, dateKey) {
  let best = null;
  hourly.forEach((entry) => {
    if (entry.time.slice(0, 10) !== dateKey) return;
    if (!isDaylightSlot(entry.time)) return;
    const { score } = computeScore(spot, entry);
    if (!best || score > best.score) best = { entry, score };
  });
  return best;
}

async function findUpcomingHits() {
  const [today, tomorrow] = upcomingWindowDates();
  const hits = [];

  for (const spot of spots) {
    const { hourly } = await fetchSpotForecast(spot);
    for (const dateKey of [today, tomorrow]) {
      const best = bestSlotForDate(spot, hourly, dateKey);
      if (!best) continue;
      const status = scoreToStatus(best.score);
      // Alerte a partir de "bonnes conditions" (level "good", score > 65),
      // pas des "conditions passables" (level "warning", 50-65) : le palier
      // passable existe pour nuancer l'affichage sur le dashboard, mais ne
      // justifie pas de deranger l'utilisateur.
      if (status.level !== "good" && status.level !== "success") continue;
      hits.push({ spot, entry: best.entry, score: best.score, status });
    }
  }

  return hits.sort((a, b) => b.score - a.score);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
}

// Un bloc par creneau qualifie : nom du spot en gras, puis 2 lignes courtes
// (jour/heure/score, houle/vent) au lieu d'une seule ligne dense. Espace
// entre chaque bloc pour rester lisible sur mobile.
function formatHit(hit) {
  const { spot, entry, score } = hit;
  return (
    `<b>${escapeHtml(spot.nom)}</b>\n` +
    `${formatSlotLabel(entry.time)}, score ${score}/100\n` +
    `Houle : ${entry.houleM.toFixed(1)}m ${degToCompassLabel(entry.houleDirectionDeg)}\n` +
    `Vent : ${Math.round(entry.ventVitesseKmh)}km/h ${degToCompassLabel(entry.ventDirectionDeg)} (${windForceLabel(entry.ventVitesseKmh)})`
  );
}

const TIER_EMOJI = { success: "🟢", good: "🟡" };

// Regroupe par palier (excellentes conditions d'abord, puis bonnes), avec le
// libelle du palier repris directement de scoreToStatus : pas de texte
// duplique qui pourrait diverger de l'UI si les seuils bougent encore.
// Le palier "warning" (conditions passables, 50-65) est volontairement
// absent : voir le filtre dans findUpcomingHits, qui n'alerte qu'a partir
// de "bonnes conditions" desormais.
function buildMessage(hits) {
  const tiers = ["success", "good"]
    .map((level) => ({ level, hits: hits.filter((hit) => hit.status.level === level) }))
    .filter((tier) => tier.hits.length > 0);

  const sections = tiers.map((tier) => {
    const title = tier.hits[0].status.label; // "excellentes conditions" / "bonnes conditions"
    const heading = `${TIER_EMOJI[tier.level]} <b>${title.charAt(0).toUpperCase()}${title.slice(1)}</b>`;
    return [heading, ...tier.hits.map(formatHit)].join("\n\n");
  });

  const dashboardUrl = process.env.URL || process.env.DASHBOARD_URL || "";

  return [
    "🌊 <b>Alerte Surf, cote nord de Tahiti</b>",
    "Aujourd'hui ou demain :",
    ...sections,
    ...(dashboardUrl ? [`Dashboard : ${dashboardUrl}`] : []),
  ].join("\n\n");
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant (variables d'environnement Netlify)."
    );
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Echec envoi Telegram (HTTP ${response.status}) : ${body}`);
  }
}

exports.handler = async () => {
  try {
    const hits = await findUpcomingHits();

    if (hits.length === 0) {
      console.log("Aucun spot au-dessus du seuil aujourd'hui/demain, aucune alerte envoyee.");
      return { statusCode: 200, body: "no-alert" };
    }

    const message = buildMessage(hits);
    await sendTelegramMessage(message);
    console.log(`Alerte envoyee (${hits.length} creneau${hits.length > 1 ? "x" : ""} au-dessus du seuil).`);

    return { statusCode: 200, body: "alert-sent" };
  } catch (error) {
    console.error("Erreur alerte surf :", error);
    return { statusCode: 500, body: String(error) };
  }
};

// Expose pour le script de test local (voir scripts/test-surf-alert.js).
exports.upcomingWindowDates = upcomingWindowDates;
exports.findUpcomingHits = findUpcomingHits;
exports.buildMessage = buildMessage;
// Reutilise tel quel par le webhook Telegram (/meteo) : meme envoi, pas de
// deuxieme implementation de l'appel a l'API Telegram.
exports.sendTelegramMessage = sendTelegramMessage;
exports.escapeHtml = escapeHtml;
