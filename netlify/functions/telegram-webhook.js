/*
 * Netlify Function classique (PAS planifiee, donc PUBLIQUE) : webhook
 * Telegram pour la commande /meteo. Contrairement a surf-alert.js
 * (Scheduled Function, sans URL publique, verifie en P6), celle-ci DOIT
 * etre joignable publiquement pour que Telegram puisse l'appeler a chaque
 * message recu par le bot. Securisee par deux verifications independantes :
 * - le secret de webhook Telegram (header X-Telegram-Bot-Api-Secret-Token,
 *   compare a TELEGRAM_WEBHOOK_SECRET) : rejette toute requete qui ne
 *   vient pas reellement de l'infra Telegram ;
 * - le chat_id du message (compare a TELEGRAM_CHAT_ID) : le bot ignore
 *   silencieusement (200 vide, pas d'erreur qui renseignerait un tiers)
 *   tout message venant d'un autre chat que celui de l'utilisateur.
 *
 * Mise en place (une fois, apres chaque deploiement d'un nouveau site) :
 * voir scripts/setup-telegram-webhook.js.
 *
 * "/meteo" renvoie, par spot : le score actuel + houle/vent du moment, et
 * le meilleur creneau a venir sur 5 jours (creneaux de nuit exclus, voir
 * isDaylightSlot dans js/format.js). Reutilise integralement le moteur du
 * dashboard (js/score.js, js/api.js, js/format.js, js/insights.js) et
 * l'envoi Telegram deja ecrit pour l'alerte (surf-alert.js) : aucune
 * logique metier dupliquee, seulement la reception/verification du
 * message entrant est propre a ce fichier.
 */

const spots = require("../../data/spots.json");
const { fetchSpotForecast } = require("../../js/api.js");
const { computeScore, scoreToStatus } = require("../../js/score.js");
const { getCurrentConditions, findBestUpcomingSlot } = require("../../js/insights.js");
const { degToCompassLabel, windForceLabel, formatSlotLabel } = require("../../js/format.js");
const { sendTelegramMessage, escapeHtml } = require("./surf-alert.js");

function formatSpotReport(spot, current, currentScore, best) {
  const currentStatus = scoreToStatus(currentScore);
  const lines = [
    `<b>${escapeHtml(spot.nom)}</b>`,
    `Maintenant : ${currentScore}/100 (${currentStatus.label})`,
    `Houle : ${current.houleM.toFixed(1)}m ${degToCompassLabel(current.houleDirectionDeg)}`,
    `Vent : ${Math.round(current.ventVitesseKmh)}km/h ${degToCompassLabel(current.ventDirectionDeg)} (${windForceLabel(current.ventVitesseKmh)})`,
  ];

  if (best) {
    const bestStatus = scoreToStatus(best.score);
    lines.push(`Meilleur creneau : ${formatSlotLabel(best.entry.time)}, ${best.score}/100 (${bestStatus.label})`);
  } else {
    lines.push("Meilleur creneau : rien de bon dans les 5 prochains jours (heures de jour).");
  }

  return lines.join("\n");
}

async function buildMeteoReply() {
  const blocks = [];
  for (const spot of spots) {
    const { hourly } = await fetchSpotForecast(spot);
    const current = getCurrentConditions(hourly);
    const currentScore = computeScore(spot, current).score;
    const best = findBestUpcomingSlot(spot, hourly, { days: 5 });
    blocks.push(formatSpotReport(spot, current, currentScore, best));
  }
  return ["🌊 <b>Conditions actuelles, cote nord de Tahiti</b>", ...blocks].join("\n\n");
}

// "/meteo" ou "/meteo@surf_alert_tahiti_bot" (suffixe que Telegram ajoute
// dans un groupe ; sans consequence ici, chat prive uniquement, mais gere
// par prudence).
function extractCommand(text) {
  if (!text) return null;
  const match = text.trim().match(/^\/(\w+)(?:@\w+)?/);
  return match ? match[1].toLowerCase() : null;
}

exports.handler = async (event) => {
  try {
    const headers = event.headers || {};
    const secret = headers["x-telegram-bot-api-secret-token"];
    if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return { statusCode: 401, body: "unauthorized" };
    }

    const update = JSON.parse(event.body || "{}");
    const message = update.message;
    if (!message || !message.text || !message.chat) {
      return { statusCode: 200, body: "ignored" };
    }

    if (String(message.chat.id) !== process.env.TELEGRAM_CHAT_ID) {
      return { statusCode: 200, body: "ignored" };
    }

    if (extractCommand(message.text) !== "meteo") {
      return { statusCode: 200, body: "ignored" };
    }

    const reply = await buildMeteoReply();
    await sendTelegramMessage(reply);

    return { statusCode: 200, body: "replied" };
  } catch (error) {
    console.error("Erreur webhook Telegram :", error);
    return { statusCode: 500, body: String(error) };
  }
};

// Expose pour un test local direct (voir scripts/test-telegram-webhook.js).
exports.buildMeteoReply = buildMeteoReply;
exports.extractCommand = extractCommand;
