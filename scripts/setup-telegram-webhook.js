#!/usr/bin/env node
/*
 * Mise en place du webhook Telegram pour la commande /meteo (a executer une
 * seule fois apres le premier deploiement, et de nouveau si l'URL du site
 * ou le secret changent). Lit les secrets depuis .env local (jamais
 * commite), jamais depuis la ligne de commande.
 *
 * Usage :
 *   node scripts/setup-telegram-webhook.js https://<site>.netlify.app
 */

const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  });
}

loadEnvFile(path.join(__dirname, "..", ".env"));

async function main() {
  const siteUrl = process.argv[2];
  if (!siteUrl) {
    console.error("Usage : node scripts/setup-telegram-webhook.js https://<site>.netlify.app");
    process.exit(1);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) {
    console.error("TELEGRAM_BOT_TOKEN et TELEGRAM_WEBHOOK_SECRET doivent etre dans .env.");
    process.exit(1);
  }

  const webhookUrl = `${siteUrl.replace(/\/$/, "")}/.netlify/functions/telegram-webhook`;

  const setWebhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
  });
  console.log("setWebhook ->", await setWebhookRes.json());

  const setCommandsRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [{ command: "meteo", description: "Conditions actuelles et meilleur creneau a venir" }],
    }),
  });
  console.log("setMyCommands ->", await setCommandsRes.json());

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  console.log("getWebhookInfo ->", await infoRes.json());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
