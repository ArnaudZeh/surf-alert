/*
 * Fonctions d'agregation sur les series horaires (js/api.js) + moteur de
 * score (js/score.js) : conditions du moment, bandeau semaine, meilleur
 * creneau a venir, mini serie pour le graphique de la vue detail.
 */

function findCurrentHourIndex(hourly) {
  const nowKey = currentTahitiHourString();
  const exactIndex = hourly.findIndex((entry) => entry.time === nowKey);
  if (exactIndex !== -1) return exactIndex;

  // Filet de securite si l'heure pleine exacte n'est pas dans la serie
  // (ex: script lance juste avant minuit) : l'entree la plus proche dans le passe.
  let closest = 0;
  for (let i = 0; i < hourly.length; i += 1) {
    if (hourly[i].time <= nowKey) closest = i;
  }
  return closest;
}

function getCurrentConditions(hourly) {
  return hourly[findCurrentHourIndex(hourly)];
}

/*
 * Un score par jour (7 jours) : la moyenne des scores de tous les spots a
 * une meme heure de reference (l'heure actuelle, projetee sur chaque jour).
 * Ex : si Orofara, Ahonu, Papenoo et l'embouchure affichent chacun 13/100
 * maintenant, aujourd'hui affiche 13/100 (c'est exactement la moyenne des
 * scores "actuels" visibles sur les cartes). Pour les jours suivants, c'est
 * la moyenne des spots a ce meme creneau horaire, ce jour-la.
 */
function computeWeeklyBand(spots, hourlyBySpotId) {
  const nowHourSuffix = currentTahitiHourString().slice(11); // "14:00"

  // date -> spot.id -> score de ce spot a l'heure de reference ce jour-la.
  const scoresByDateAndSpot = new Map();

  spots.forEach((spot) => {
    const hourly = hourlyBySpotId.get(spot.id);
    if (!hourly) return;
    hourly.forEach((entry) => {
      if (!entry.time.endsWith(`T${nowHourSuffix}`)) return;
      const date = entry.time.slice(0, 10);
      const { score } = computeScore(spot, entry);
      if (!scoresByDateAndSpot.has(date)) scoresByDateAndSpot.set(date, new Map());
      scoresByDateAndSpot.get(date).set(spot.id, score);
    });
  });

  return [...scoresByDateAndSpot.entries()]
    .map(([date, scoresBySpot]) => {
      const scores = [...scoresBySpot.values()];
      const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return { date, score: Math.round(average), sampleTime: `${date}T00:00` };
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7)
    .map((day) => ({ ...day, status: scoreToStatus(day.score) }));
}

/*
 * Meilleur creneau a venir pour un spot donne, sur une fenetre de N jours
 * a partir de maintenant (defaut 5 jours, section 4 du prompt source).
 */
function findBestUpcomingSlot(spot, hourly, { days = 5 } = {}) {
  const startIndex = findCurrentHourIndex(hourly);
  const endIndex = Math.min(hourly.length, startIndex + days * 24);
  const window = hourly.slice(startIndex, endIndex);

  let best = null;
  window.forEach((entry) => {
    const { score } = computeScore(spot, entry);
    if (!best || score > best.score) {
      best = { entry, score };
    }
  });
  return best;
}

/*
 * Tableau heure par heure (facon surf-forecast) pour la vue detail : N jours
 * (defaut 3) groupes par jour civil, un creneau toutes les stepHours (defaut
 * 3h). Demarre au debut de la journee en cours (pas a "maintenant") pour que
 * chaque jour affiche une colonne complete ; le creneau qui contient l'heure
 * actuelle est marque isNow.
 */
function buildHourlyTable(spot, hourly, { days = 3, stepHours = 3 } = {}) {
  const currentIndex = findCurrentHourIndex(hourly);
  const todayDate = hourly[currentIndex].time.slice(0, 10);
  const dayStartIndex = hourly.findIndex((entry) => entry.time === `${todayDate}T00:00`);
  const startIndex = dayStartIndex === -1 ? 0 : dayStartIndex;
  const endIndex = Math.min(hourly.length, startIndex + days * 24);

  const slots = [];
  for (let i = startIndex; i < endIndex; i += stepHours) {
    const entry = hourly[i];
    const { score } = computeScore(spot, entry);
    const isNow = currentIndex >= i && currentIndex < i + stepHours;
    slots.push({ ...entry, score, status: scoreToStatus(score), isNow });
  }

  const daysGrouped = [];
  slots.forEach((slot) => {
    const date = slot.time.slice(0, 10);
    const lastDay = daysGrouped[daysGrouped.length - 1];
    if (!lastDay || lastDay.date !== date) {
      daysGrouped.push({ date, slots: [slot] });
    } else {
      lastDay.slots.push(slot);
    }
  });

  return daysGrouped;
}
