/*
 * Acces aux donnees Open-Meteo (gratuit, sans cle, appelable depuis le navigateur).
 * - Marine API : houle (hauteur, direction, periode)
 * - Forecast API : vent (vitesse, direction, rafales)
 *
 * On recupere des series horaires sur 7 jours (au lieu d'un simple "current")
 * pour pouvoir calculer : les conditions du moment, le bandeau semaine, le
 * meilleur creneau a 5 jours et le mini graphique 3 jours de la vue detail.
 */

const MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine";
const FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 7;

// Delai max par tentative, et delais avant chaque retry : un simple blip
// reseau (Wi-Fi qui coupe une seconde, requete qui traine) ne doit pas
// afficher une carte en erreur si une deuxieme ou troisieme tentative
// quelques centaines de ms plus tard passerait.
const FETCH_TIMEOUT_MS = 15000;
const RETRY_DELAYS_MS = [500, 1500];

async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`reponse HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

// Cache par URL le temps du chargement de la page : Orofara et Ahonu partagent
// les memes coordonnees, ca evite de dupliquer les appels reseau.
const requestCache = new Map();

function fetchJsonCached(url) {
  if (!requestCache.has(url)) {
    requestCache.set(url, fetchJson(url));
  }
  return requestCache.get(url);
}

// A appeler avant un re-fetch periodique : sans ca, fetchSpotForecast
// renverrait indefiniment les memes donnees figees au premier chargement.
function clearForecastCache() {
  requestCache.clear();
}

async function fetchSpotForecast(spot) {
  const marineUrl = `${MARINE_API_URL}?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wave_height,wave_direction,wave_period&timezone=Pacific%2FTahiti&forecast_days=${FORECAST_DAYS}`;
  const forecastUrl = `${FORECAST_API_URL}?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=Pacific%2FTahiti&forecast_days=${FORECAST_DAYS}&wind_speed_unit=kmh`;

  const [marine, forecast] = await Promise.all([
    fetchJsonCached(marineUrl),
    fetchJsonCached(forecastUrl),
  ]);

  const hourly = marine.hourly.time.map((time, i) => ({
    time,
    houleM: marine.hourly.wave_height[i],
    houleDirectionDeg: marine.hourly.wave_direction[i],
    houlePeriodeS: marine.hourly.wave_period[i],
    ventVitesseKmh: forecast.hourly.wind_speed_10m[i],
    ventDirectionDeg: forecast.hourly.wind_direction_10m[i],
    ventRafaleKmh: forecast.hourly.wind_gusts_10m[i],
  }));

  return { hourly };
}
