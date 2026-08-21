/*
 * Netlify Scheduled Function (P5, voir PLAN.md) : verifie les previsions du
 * week-end a venir (samedi + dimanche) pour les 4 spots, et envoie une alerte
 * Telegram si au moins un spot atteint au moins "bonnes conditions" (score
 * >= 50, voir scoreToStatus dans js/score.js) sur l'un des deux jours. Aucun
 * envoi si aucun spot ne passe le seuil (pas de faux positif).
 *
 * Declenchement : cron "0 2 * * 6" dans netlify.toml, soit samedi 02h00 UTC
 * = vendredi 16h00 heure de Tahiti (UTC-10).
 *
 * Reutilise le moteur de score et l'acces Open-Meteo du dashboard (js/score.js,
 * js/api.js, js/format.js sont des scripts vanilla sans dependance au DOM,
 * exportes en CommonJS pour Node en plus de leur usage navigateur). Le seuil
 * n'est pas duplique ici : on reutilise scoreToStatus (source unique aussi
 * pour les couleurs de l'UI), un spot qualifie des qu'il n'est plus "danger".
 */

const spots = require("../../data/spots.json");
const { fetchSpotForecast } = require("../../js/api.js");
const { computeScore, scoreToStatus } = require("../../js/score.js");
const {
  currentTahitiHourString,
  degToCompassLabel,
  windForceLabel,
  formatSlotLabel,
} = require("../../js/format.js");

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Prochain samedi et dimanche a partir d'aujourd'hui (heure de Tahiti) :
// jamais "aujourd'hui" si on tombe deja un samedi (declenchement manuel un
// samedi, par exemple), toujours le week-end a venir.
function nextWeekendDates() {
  const todayKey = currentTahitiHourString().slice(0, 10);
  const todayWeekday = new Date(`${todayKey}T00:00:00Z`).getUTCDay(); // 0 = dimanche ... 6 = samedi
  const daysUntilSaturday = ((6 - todayWeekday) % 7 + 7) % 7 || 7;
  const saturday = addDays(todayKey, daysUntilSaturday);
  const sunday = addDays(saturday, 1);
  return [saturday, sunday];
}

// Meilleur creneau du spot pour une date donnee, ou null si aucune donnee
// pour ce jour (ex : hors des 7 jours renvoyes par Open-Meteo).
function bestSlotForDate(spot, hourly, dateKey) {
  let best = null;
  hourly.forEach((entry) => {
    if (entry.time.slice(0, 10) !== dateKey) return;
    const { score } = computeScore(spot, entry);
    if (!best || score > best.score) best = { entry, score };
  });
  return best;
}

async function findWeekendHits() {
  const [saturday, sunday] = nextWeekendDates();
  const hits = [];

  for (const spot of spots) {
    const { hourly } = await fetchSpotForecast(spot);
    for (const dateKey of [saturday, sunday]) {
      const best = bestSlotForDate(spot, hourly, dateKey);
      if (!best) continue;
      const status = scoreToStatus(best.score);
      if (status.level === "danger") continue;
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

const TIER_EMOJI = { success: "🟢", warning: "🟡" };

// Regroupe par palier (excellentes conditions d'abord, puis bonnes), avec le
// libelle du palier repris directement de scoreToStatus : pas de texte
// duplique qui pourrait diverger de l'UI si les seuils bougent encore.
function buildMessage(hits) {
  const tiers = ["success", "warning"]
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
    const hits = await findWeekendHits();

    if (hits.length === 0) {
      console.log("Aucun spot au-dessus du seuil ce week-end, aucune alerte envoyee.");
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
exports.nextWeekendDates = nextWeekendDates;
exports.findWeekendHits = findWeekendHits;
exports.buildMessage = buildMessage;
