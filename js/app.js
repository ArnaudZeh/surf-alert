/*
 * Bandeau semaine et vue detail par spot (webcam, tableau heure par heure,
 * meilleur creneau a 5 jours). S'appuie sur les series horaires 7 jours de
 * js/api.js, le moteur de score de js/score.js et les fonctions
 * d'agregation de js/insights.js.
 */

// spot.id -> serie horaire 7 jours, rempli par renderSpots() et reutilise
// par les clics carte -> vue detail.
const hourlyBySpotId = new Map();

// spot.id -> objet spot (parametres du spot), rempli par renderSpots() et
// reutilise par la navigation jour par jour du tableau heure par heure
// (setupDetailOverlay -> selectDetailDay), qui doit pouvoir recalculer le
// score sans re-parcourir la liste complete des spots.
const spotsById = new Map();

// Le carrousel mobile et la position de scroll de la grille ne doivent pas
// sauter a chaque rafraichissement periodique : quand existingArticle est
// fourni, on met a jour le meme noeud DOM au lieu d'en creer un nouveau.
function cardShell(spot, bodyHtml, { isSpotDuJour = false, extraClass = "", clickable = false, existingArticle = null } = {}) {
  const article = existingArticle || document.createElement("article");
  article.dataset.spotId = spot.id;
  article.className = `spot-card${isSpotDuJour ? " is-top" : ""}${extraClass ? ` ${extraClass}` : ""}`;
  if (clickable) {
    article.classList.add("is-clickable");
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-haspopup", "dialog");
    article.setAttribute("aria-label", `Voir le detail de ${spot.nom}`);
  } else {
    article.classList.remove("is-clickable");
    article.removeAttribute("role");
    article.removeAttribute("aria-haspopup");
  }
  article.innerHTML = `
    ${isSpotDuJour ? '<span class="badge-top">Spot du jour</span>' : ""}
    <div class="card-head">
      <div>
        <h2>${spot.nom}</h2>
        <p class="spot-type">${spot.type}</p>
      </div>
      ${bodyHtml.statusPill}
    </div>
    ${bodyHtml.body}
  `;
  return article;
}

function renderLoadingCard(spot) {
  return cardShell(spot, {
    statusPill: `<div class="status-pill status-loading"><span class="status-dot" aria-hidden="true"></span><span class="status-label">chargement…</span></div>`,
    body: `
      <div class="card-metrics">
        <div class="metric-group">
          <div class="skeleton-line" style="width: 40%"></div>
          <div class="skeleton-line" style="width: 90%"></div>
          <div class="skeleton-line" style="width: 75%"></div>
          <div class="skeleton-line" style="width: 60%"></div>
        </div>
        <div class="metric-group">
          <div class="skeleton-line" style="width: 40%"></div>
          <div class="skeleton-line" style="width: 85%"></div>
          <div class="skeleton-line" style="width: 70%"></div>
          <div class="skeleton-line" style="width: 55%"></div>
        </div>
      </div>
    `,
  });
}

function renderErrorCard(spot, message, existingArticle = null) {
  const card = cardShell(
    spot,
    {
      statusPill: `<div class="status-pill status-danger"><span class="status-dot" aria-hidden="true"></span><span class="status-label">indisponible</span></div>`,
      body: `
        <p class="card-error">Donnees indisponibles pour le moment (${message}).</p>
        <button type="button" class="card-retry">Reessayer</button>
      `,
    },
    { existingArticle }
  );

  // Le bouton est recree a chaque appel (innerHTML reecrit) : le listener
  // doit etre rattache a chaque fois, contrairement au clic sur la carte
  // entiere (attache une seule fois sur le noeud article, qui lui persiste).
  const retryButton = card.querySelector(".card-retry");
  if (retryButton) {
    retryButton.addEventListener("click", (event) => {
      event.stopPropagation();
      retryButton.disabled = true;
      retryButton.textContent = "Nouvelle tentative…";
      refreshSpots();
    });
  }

  return card;
}

function renderReadyCard(spot, current, isSpotDuJour, existingArticle = null) {
  const { score, breakdown } = computeScore(spot, current);
  const status = scoreToStatus(score);
  const houleDirLabel = degToCompassLabel(current.houleDirectionDeg);
  const ventDirLabel = degToCompassLabel(current.ventDirectionDeg);
  const ventForce = windForceLabel(current.ventVitesseKmh);

  const breakdownRow = (label, value) => `
    <div class="score-breakdown-item">
      <span class="score-breakdown-label">${label}</span>
      <div class="score-breakdown-track">
        <div class="score-breakdown-fill status-${scoreToStatus(value).level}" style="width: ${value}%"></div>
      </div>
    </div>
  `;

  const card = cardShell(
    spot,
    {
      statusPill: `<div class="status-pill status-${status.level}"><span class="status-dot" aria-hidden="true"></span><span class="status-label">${status.label}</span></div>`,
      body: `
        <div class="score-band">
          <div class="score-band-top">
            <span class="score-number">${score}<span class="score-number-max">/100</span></span>
            <span class="score-band-label">Score global</span>
          </div>
          <div class="score-gauge" role="img" aria-label="Score global ${score} sur 100">
            <div class="score-gauge-fill status-${status.level}" style="width: ${score}%"></div>
          </div>
          <div class="score-breakdown">
            ${breakdownRow("Taille houle", breakdown.houleSize)}
            ${breakdownRow("Direction houle", breakdown.houleDirection)}
            ${breakdownRow("Vent", breakdown.wind)}
          </div>
        </div>
        <div class="card-metrics">
          <div class="metric-group">
            <p class="metric-group-title">Houle</p>
            <dl class="metric-rows">
              <div class="metric-row"><dt>Hauteur</dt><dd>${current.houleM.toFixed(1)} m</dd></div>
              <div class="metric-row"><dt>Direction</dt><dd class="is-word">${directionArrow(current.houleDirectionDeg)}${houleDirLabel}</dd></div>
              <div class="metric-row"><dt>Periode</dt><dd>${current.houlePeriodeS.toFixed(0)} s</dd></div>
            </dl>
          </div>
          <div class="metric-group">
            <p class="metric-group-title">Vent</p>
            <dl class="metric-rows">
              <div class="metric-row"><dt>Vitesse</dt><dd>${Math.round(current.ventVitesseKmh)} km/h</dd></div>
              <div class="metric-row"><dt>Direction</dt><dd class="is-word">${directionArrow(current.ventDirectionDeg)}${ventDirLabel}</dd></div>
              <div class="metric-row"><dt>Intensite</dt><dd class="is-word">${ventForce}</dd></div>
            </dl>
          </div>
        </div>
        <p class="card-cta">Voir le detail heure par heure &rsaquo;</p>
      `,
    },
    { isSpotDuJour, clickable: true, existingArticle }
  );

  // Le clic/clavier n'est attache qu'a la creation : innerHTML est reecrit a
  // chaque rafraichissement mais les listeners de l'article lui-meme restent.
  if (!existingArticle) {
    const openHandler = () => openDetail(spot);
    card.addEventListener("click", openHandler);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openHandler();
      }
    });
  }

  return card;
}

/* ---------- Bandeau semaine ---------- */

function renderWeekBand(days) {
  const el = document.getElementById("weekBand");
  if (!el) return;

  if (days.length === 0) {
    el.innerHTML = `<p class="dev-note">Bandeau semaine indisponible pour le moment.</p>`;
    return;
  }

  const todayDate = currentTahitiHourString().slice(0, 10);

  el.innerHTML = days
    .map((day) => {
      const label = dayLabelFromIsoLocal(day.sampleTime);
      const num = dayNumberFromIsoLocal(day.sampleTime);
      const isToday = day.date === todayDate;
      return `
        <div class="week-day${isToday ? " is-today" : ""}">
          <span class="week-day-label">${label}</span>
          <span class="week-day-dot status-${day.status.level}" title="${day.status.label}, score ${day.score}/100" aria-hidden="true">
            <span class="week-day-score">${day.score}</span>
            <span class="week-day-score-max">/100</span>
          </span>
          <span class="sr-only">${day.status.label}, score ${day.score} sur 100</span>
          <span class="week-day-num">${num}</span>
        </div>
      `;
    })
    .join("");
}

/* ---------- Vue detail ---------- */

// Fleche pointant dans la direction ou se dirige la houle/le vent (oppose a
// la convention meteo "d'ou ca vient" utilisee pour le degre source).
function directionArrow(deg) {
  return `<span class="table-arrow" style="transform: rotate(${(deg + 180) % 360}deg)" aria-hidden="true">&uarr;</span>`;
}

// Tableau d'UN SEUL jour (8 creneaux de 3h) : reste lisible en police
// normale sans scroll horizontal interminable, contrairement a un tableau
// unique regroupant les 7 jours bout a bout.
function renderHourlyTableForDay(day) {
  if (!day || day.slots.length === 0) {
    return `<p class="dev-note">Pas de donnees pour ce jour.</p>`;
  }

  // Cellule d'angle vide : sans elle, la colonne d'etiquettes
  // (Conditions/Houle/Periode/Vent) du corps du tableau se decale sous la
  // premiere heure au lieu de rester a gauche.
  const cornerCell = `<th class="hourly-table-corner"></th>`;

  const hourHeaderRow = day.slots
    .map(
      (slot) =>
        `<th class="${slot.isNow ? "is-now" : ""}">${formatHourOnly(slot.time)}${slot.isNow ? '<span class="now-tag">maintenant</span>' : ""}</th>`
    )
    .join("");

  const statusRow = day.slots
    .map(
      (slot) =>
        `<td class="${slot.isNow ? "is-now" : ""}">
          <span class="table-dot status-${slot.status.level}" style="background: var(--color-${slot.status.level})"></span>
          <span class="sr-only">${slot.status.label}, score ${slot.score}/100</span>
        </td>`
    )
    .join("");

  const houleRow = day.slots
    .map(
      (slot) =>
        `<td class="${slot.isNow ? "is-now" : ""}">
          <span class="table-value">${slot.houleM.toFixed(1)}m</span>${directionArrow(slot.houleDirectionDeg)}
          <span class="table-abbrev">${degToCompassAbbrev(slot.houleDirectionDeg)}</span>
        </td>`
    )
    .join("");

  const periodeRow = day.slots
    .map((slot) => `<td class="${slot.isNow ? "is-now" : ""}">${slot.houlePeriodeS.toFixed(0)}s</td>`)
    .join("");

  const ventRow = day.slots
    .map(
      (slot) =>
        `<td class="${slot.isNow ? "is-now" : ""}">
          <span class="table-value">${Math.round(slot.ventVitesseKmh)}km/h</span>${directionArrow(slot.ventDirectionDeg)}
          <span class="table-abbrev">${degToCompassAbbrev(slot.ventDirectionDeg)}</span>
        </td>`
    )
    .join("");

  return `
    <div class="hourly-table-wrap">
      <table class="hourly-table">
        <thead>
          <tr class="hourly-table-hour-row">${cornerCell}${hourHeaderRow}</tr>
        </thead>
        <tbody>
          <tr><th scope="row">État</th>${statusRow}</tr>
          <tr><th scope="row">Houle</th>${houleRow}</tr>
          <tr><th scope="row">Periode</th>${periodeRow}</tr>
          <tr><th scope="row">Vent</th>${ventRow}</tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderDayTabs(daysGrouped, selectedIndex) {
  return `
    <div class="day-tabs" role="tablist" aria-label="Choisir le jour">
      ${daysGrouped
        .map((day, index) => {
          const isSelected = index === selectedIndex;
          return `
            <button
              type="button"
              class="day-tab${isSelected ? " is-selected" : ""}"
              role="tab"
              aria-selected="${isSelected}"
              data-day-index="${index}"
            >
              <span class="day-tab-label">${dayLabelFromIsoLocal(`${day.date}T00:00`)}</span>
              <span class="day-tab-num">${dayNumberFromIsoLocal(`${day.date}T00:00`)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

// Index du jour a afficher par defaut a l'ouverture : celui qui contient
// le creneau "maintenant", ou le premier jour disponible a defaut.
function defaultDayIndex(daysGrouped) {
  const index = daysGrouped.findIndex((day) => day.slots.some((slot) => slot.isNow));
  return index === -1 ? 0 : index;
}

function renderHourlySection(daysGrouped) {
  if (daysGrouped.length === 0) {
    return `<p class="dev-note">Pas assez de donnees pour le tableau heure par heure.</p>`;
  }

  const selectedIndex = defaultDayIndex(daysGrouped);

  return `
    ${renderDayTabs(daysGrouped, selectedIndex)}
    <div id="hourlyDayTable">${renderHourlyTableForDay(daysGrouped[selectedIndex])}</div>
    <p class="hourly-table-caption">
      La periode, c'est le temps entre deux vagues : plus elle est longue, plus la houle vient de loin, plus elle est puissante et organisee (une periode de 12 a 14s donne des vagues bien plus fortes qu'une periode de 7 a 8s a hauteur egale). Les fleches indiquent la direction vers laquelle la houle et le vent se dirigent.
    </p>
  `;
}

// Change de jour affiche dans le tableau heure par heure, sans re-rendre
// tout le panneau de detail (evite de perdre la position de scroll et de
// re-executer inutilement le calcul du score courant / meilleur creneau).
function selectDetailDay(index) {
  const overlay = document.getElementById("detailOverlay");
  const spotId = overlay?.dataset.returnFocusId;
  const spot = spotsById.get(spotId);
  const hourly = hourlyBySpotId.get(spotId);
  if (!spot || !hourly) return;

  const daysGrouped = buildHourlyTable(spot, hourly, { days: 7, stepHours: 3 });
  const day = daysGrouped[index];
  if (!day) return;

  const tableContainer = document.getElementById("hourlyDayTable");
  if (tableContainer) tableContainer.innerHTML = renderHourlyTableForDay(day);

  document.querySelectorAll(".day-tab").forEach((tab) => {
    const isSelected = Number(tab.dataset.dayIndex) === index;
    tab.classList.toggle("is-selected", isSelected);
    tab.setAttribute("aria-selected", String(isSelected));
  });
}

function renderWebcamBlock(spot) {
  if (!spot.webcam_url) {
    return `<p class="webcam-empty">Pas de webcam disponible pour ce spot.</p>`;
  }
  return `
    <a class="webcam-link" href="${spot.webcam_url}" target="_blank" rel="noopener noreferrer">
      Voir la webcam &nearr;
    </a>
    <p class="webcam-note">Ouvre dans un nouvel onglet : la source ne permet pas l'integration directe.</p>
  `;
}

function renderDetailContent(spot) {
  const hourly = hourlyBySpotId.get(spot.id);
  if (!hourly) {
    return `<h2 id="detailTitle">${spot.nom}</h2><p class="card-error">Donnees indisponibles pour ce spot.</p>`;
  }

  const current = getCurrentConditions(hourly);
  const { score } = computeScore(spot, current);
  const status = scoreToStatus(score);

  const best = findBestUpcomingSlot(spot, hourly, { days: 5 });
  const bestStatus = best ? scoreToStatus(best.score) : null;

  // 7 jours : c'est la profondeur reelle des donnees recuperees par
  // js/api.js (FORECAST_DAYS = 7), la meme serie que celle utilisee pour le
  // bandeau semaine. Rien ne justifiait de plafonner ce tableau a 3 jours.
  const hourlyTableDays = buildHourlyTable(spot, hourly, { days: 7, stepHours: 3 });

  return `
    <div class="detail-header">
      <div>
        <h2 id="detailTitle">${spot.nom}</h2>
        <p class="spot-type">${spot.type}</p>
      </div>
      <div class="status-pill status-${status.level}">
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-label">${status.label} maintenant</span>
      </div>
      <button type="button" class="detail-close" id="detailClose" aria-label="Fermer la vue detail">&times;</button>
    </div>

    <section class="detail-section">
      <h3>Webcam</h3>
      ${renderWebcamBlock(spot)}
    </section>

    <section class="detail-section">
      <h3>Heure par heure (7 prochains jours)</h3>
      ${renderHourlySection(hourlyTableDays)}
    </section>

    <section class="detail-section">
      <h3>Meilleur creneau a venir (5 jours)</h3>
      ${
        best
          ? `
        <div class="best-slot-head">
          <div class="status-pill status-${bestStatus.level}">
            <span class="status-dot" aria-hidden="true"></span>
            <span class="status-label">${bestStatus.label}</span>
          </div>
          <p class="best-slot-when"><strong>${formatSlotLabel(best.entry.time)}</strong></p>
        </div>
        <ul class="best-slot-reasons">
          <li><span class="best-slot-reason-label">Score global</span><span class="best-slot-reason-value">${best.score}/100</span></li>
          <li><span class="best-slot-reason-label">Houle</span><span class="best-slot-reason-value">${best.entry.houleM.toFixed(1)} m, direction ${degToCompassLabel(best.entry.houleDirectionDeg)}</span></li>
          <li><span class="best-slot-reason-label">Vent</span><span class="best-slot-reason-value">${windForceLabel(best.entry.ventVitesseKmh)}, ${degToCompassLabel(best.entry.ventDirectionDeg)}, ${Math.round(best.entry.ventVitesseKmh)} km/h</span></li>
        </ul>
      `
          : `<p class="dev-note">Pas de creneau exploitable dans les 5 prochains jours.</p>`
      }
    </section>
  `;
}

function openDetail(spot) {
  const overlay = document.getElementById("detailOverlay");
  const content = document.getElementById("detailContent");
  if (!overlay || !content) return;

  content.innerHTML = renderDetailContent(spot);
  overlay.hidden = false;
  document.body.classList.add("no-scroll");
  overlay.dataset.returnFocusId = spot.id;

  const closeButton = document.getElementById("detailClose");
  if (closeButton) closeButton.focus();
}

function closeDetail() {
  const overlay = document.getElementById("detailOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove("no-scroll");
}

function setupDetailOverlay() {
  const overlay = document.getElementById("detailOverlay");
  if (!overlay) return;

  // Delegation plutot que des listeners directs : le bouton fermer et les
  // onglets jour vivent dans du contenu reinjecte (innerHTML) a chaque
  // ouverture / changement de jour, donc des listeners attaches une seule
  // fois au chargement de la page ne survivraient pas au premier rendu.
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest(".detail-close")) {
      closeDetail();
      return;
    }
    const dayTab = event.target.closest(".day-tab");
    if (dayTab) {
      selectDetailDay(Number(dayTab.dataset.dayIndex));
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeDetail();
  });
}

/* ---------- Orchestration ---------- */

function setHeaderStatus(text) {
  const el = document.getElementById("lastUpdated");
  if (el) el.textContent = text;
}

// false le temps du tout premier rendu (squelettes de chargement, creation
// des cartes), true ensuite : les rafraichissements periodiques mettent a
// jour les memes noeuds DOM en place pour ne jamais reinitialiser le scroll
// ou le carrousel mobile pendant que l'utilisateur regarde l'ecran.
let hasRenderedOnce = false;

async function renderSpots() {
  const grid = document.getElementById("spotsGrid");

  let spots;
  try {
    const response = await fetch("data/spots.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    spots = await response.json();
  } catch (error) {
    if (!hasRenderedOnce) {
      grid.innerHTML = `<p class="dev-note">Erreur de chargement de la config des spots : ${error.message}</p>`;
    }
    return;
  }

  const placeholders = new Map();
  if (!hasRenderedOnce) {
    grid.innerHTML = "";
    spots.forEach((spot) => {
      const loadingCard = renderLoadingCard(spot);
      placeholders.set(spot.id, loadingCard);
      grid.appendChild(loadingCard);
    });
    setHeaderStatus("Chargement des conditions en direct (Open-Meteo)…");
  } else {
    setHeaderStatus("Actualisation des conditions en direct (Open-Meteo)…");
  }

  clearForecastCache();
  const results = await Promise.allSettled(
    spots.map((spot) => fetchSpotForecast(spot))
  );

  const readyResults = spots
    .map((spot, i) => ({ spot, result: results[i] }))
    .filter(({ result }) => result.status === "fulfilled");

  readyResults.forEach(({ spot, result }) => {
    hourlyBySpotId.set(spot.id, result.value.hourly);
    spotsById.set(spot.id, spot);
  });

  const currentScoreBySpotId = new Map(
    readyResults.map(({ spot, result }) => [
      spot.id,
      computeScore(spot, getCurrentConditions(result.value.hourly)).score,
    ])
  );
  const bestScore = Math.max(0, ...currentScoreBySpotId.values());

  // En cas d'egalite, un seul spot porte le badge (le premier de la config).
  const spotDuJourId =
    bestScore > 0
      ? readyResults.find(({ spot }) => currentScoreBySpotId.get(spot.id) === bestScore)
          ?.spot.id
      : null;

  let latestObservedAt = null;

  spots.forEach((spot, i) => {
    const result = results[i];
    const existingArticle = hasRenderedOnce
      ? grid.querySelector(`[data-spot-id="${spot.id}"]`)
      : null;

    if (result.status === "fulfilled") {
      const current = getCurrentConditions(result.value.hourly);
      const isSpotDuJour = spot.id === spotDuJourId;
      if (!latestObservedAt || current.time > latestObservedAt) {
        latestObservedAt = current.time;
      }

      if (existingArticle) {
        renderReadyCard(spot, current, isSpotDuJour, existingArticle);
      } else {
        const card = renderReadyCard(spot, current, isSpotDuJour);
        const placeholder = placeholders.get(spot.id);
        if (placeholder) grid.replaceChild(card, placeholder);
        else grid.appendChild(card);
      }
    } else {
      const message = result.reason?.message ?? "erreur inconnue";
      if (existingArticle) {
        renderErrorCard(spot, message, existingArticle);
      } else {
        const card = renderErrorCard(spot, message);
        const placeholder = placeholders.get(spot.id);
        if (placeholder) grid.replaceChild(card, placeholder);
        else grid.appendChild(card);
      }
    }
  });

  renderWeekBand(computeWeeklyBand(spots, hourlyBySpotId));

  const time = formatTahitiTime(latestObservedAt);
  setHeaderStatus(
    time
      ? `Conditions en direct (Open-Meteo), mis a jour a ${time} (heure de Tahiti).`
      : "Impossible de recuperer les conditions en direct pour le moment."
  );

  if (!hasRenderedOnce) {
    hasRenderedOnce = true;
    setupCarousel(spots);
  }
}

/* ---------- Carrousel mobile (scroll horizontal auto-defilant) ---------- */

const CAROUSEL_BREAKPOINT = "(max-width: 639px)";
const CAROUSEL_INTERVAL_MS = 6000;
let carouselTimer = null;

function setupCarousel(spots) {
  const grid = document.getElementById("spotsGrid");
  const dotsEl = document.getElementById("carouselDots");
  if (!grid || !dotsEl || spots.length === 0) return;

  dotsEl.innerHTML = spots
    .map(
      (spot, i) =>
        `<button type="button" class="carousel-dot" data-index="${i}" aria-label="Aller au spot ${spot.nom}"></button>`
    )
    .join("");
  const dots = [...dotsEl.querySelectorAll(".carousel-dot")];

  // Position relative au bord de la grille plutot qu'un calcul largeur+gap :
  // robuste au padding, au dernier item plus etroit, etc.
  function closestCardIndex() {
    const gridLeft = grid.getBoundingClientRect().left;
    const cards = [...grid.children];
    let closest = 0;
    let closestDistance = Infinity;
    cards.forEach((card, i) => {
      const distance = Math.abs(card.getBoundingClientRect().left - gridLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = i;
      }
    });
    return closest;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scrollToIndex(index) {
    const card = grid.children[index];
    if (!card) return;
    const gridLeft = grid.getBoundingClientRect().left;
    const delta = card.getBoundingClientRect().left - gridLeft;
    grid.scrollTo({
      left: grid.scrollLeft + delta,
      behavior: prefersReducedMotion ? "instant" : "smooth",
    });
  }

  function updateActiveDot() {
    const index = closestCardIndex();
    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
  }

  function stopAutoplay() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();
    if (!window.matchMedia(CAROUSEL_BREAKPOINT).matches) return;
    carouselTimer = setInterval(() => {
      const next = (closestCardIndex() + 1) % grid.children.length;
      scrollToIndex(next);
    }, CAROUSEL_INTERVAL_MS);
  }

  grid.addEventListener("scroll", updateActiveDot, { passive: true });
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      stopAutoplay();
      scrollToIndex(Number(dot.dataset.index));
    });
  });
  // N'importe quel geste utilisateur arrete le defilement automatique, pour
  // ne jamais lutter contre quelqu'un qui est en train de lire une carte.
  ["touchstart", "pointerdown", "wheel"].forEach((eventName) => {
    grid.addEventListener(eventName, stopAutoplay, { passive: true });
  });
  window.matchMedia(CAROUSEL_BREAKPOINT).addEventListener("change", (event) => {
    if (event.matches) startAutoplay();
    else stopAutoplay();
  });

  updateActiveDot();
  startAutoplay();
}

/* ---------- Rafraichissement periodique ---------- */

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MIN_REFRESH_GAP_MS = 5 * 60 * 1000;
let lastRefreshAt = 0;

function refreshSpots() {
  lastRefreshAt = Date.now();
  renderSpots();
}

function setupPeriodicRefresh() {
  setInterval(refreshSpots, REFRESH_INTERVAL_MS);

  // Si l'onglet est reste en arriere-plan longtemps (telephone verrouille,
  // autre onglet actif...), on rafraichit des le retour au premier plan
  // plutot que d'attendre le prochain intervalle et d'afficher du perime.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRefreshAt >= MIN_REFRESH_GAP_MS) {
      refreshSpots();
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Installation PWA degradee silencieusement : l'app reste utilisable en ligne.
    });
  });
}

setupDetailOverlay();
registerServiceWorker();
lastRefreshAt = Date.now();
renderSpots();
setupPeriodicRefresh();
