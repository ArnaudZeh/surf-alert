#!/usr/bin/env node
/*
 * Invocation manuelle de la fonction d'alerte (gate P5, test 1), sans passer
 * par le CLI Netlify. Lit les secrets depuis un fichier .env local (jamais
 * commite, voir .gitignore), jamais depuis la ligne de commande ou le code.
 *
 * Usage :
 *   node scripts/test-surf-alert.js          -> envoie une vraie alerte Telegram si un spot passe le seuil
 *   node scripts/test-surf-alert.js --dry-run -> affiche ce qui serait envoye, sans appeler Telegram
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

const dryRun = process.argv.includes("--dry-run");
const surfAlert = require("../netlify/functions/surf-alert.js");

async function main() {
  const [saturday, sunday] = surfAlert.nextWeekendDates();
  console.log(`Week-end cible : ${saturday} (samedi) / ${sunday} (dimanche)`);

  if (dryRun) {
    const hits = await surfAlert.findWeekendHits();
    if (hits.length === 0) {
      console.log("Aucun spot au-dessus du seuil : aucun message ne serait envoye.");
      return;
    }
    console.log("Message qui serait envoye :\n");
    console.log(surfAlert.buildMessage(hits));
    return;
  }

  const result = await surfAlert.handler();
  console.log("Resultat :", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
