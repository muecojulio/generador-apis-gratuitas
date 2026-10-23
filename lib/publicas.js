"use strict";

/**
 * APIs públicas sin clave y sin registro, integradas en el taller.
 *
 * La idea: el taller ya sabe crear y servir APIs. Estas fuentes gratuitas
 * (documentadas en repositorios públicos de GitHub y en sus propias páginas)
 * le añaden algo que antes no tenía:
 *
 *   - `pais`   → REST Countries normaliza el nombre y el código ISO.
 *   - `moneda` → Frankfurter (Banco Central Europeo) reconoce el código ISO.
 *   - `ciudad` → Open-Meteo Geocoding devuelve el nombre canónico de la ciudad.
 *
 * Así, cuando alguien crea una API con esos campos, los datos entran limpios
 * («mexico» → «México», «mxn» → «MXN», «cdmx» → «Ciudad de México») sin que la
 * persona que la diseñó escriba una línea de código.
 *
 * Reglas de oro:
 *   - Nunca se bloquea una escritura porque una fuente externa falle: si no
 *     hay internet, si el servicio está caído o tarda, se guarda el valor
 *     original. Las fuentes son una mejora, no un requisito.
 *   - Todo pasa por la caché (24 h para países y monedas, 10 min para
 *     ciudades) y por un tiempo máximo de espera por petición.
 *   - Se apaga con `TALLER_FUENTES=0` y se ajusta el tiempo con
 *     `TALLER_FUENTES_MS`.
 *   - Ninguna fuente recibe datos personales: solo el valor del campo que la
 *     persona escribió.
 */

const cache = require("./cache");

const TIEMPO_MAXIMO = Math.max(800, Number(process.env.TALLER_FUENTES_MS) || 3000);
const TTL_PAISES = 24 * 60 * 60 * 1000;
const TTL_MONEDAS = 24 * 60 * 60 * 1000;
const TTL_CIUDAD = 10 * 60 * 1000;
const TTL_PRUEBA = 60 * 1000;

const FUENTES = Object.freeze([
  {
    id: "open-meteo",
    nombre: "Open-Meteo",
    categoria: "Clima",
    descripcion: "Clima actual y pronóstico por coordenadas, sin clave y con CORS abierto.",
    url: "https://api.open-meteo.com",
    docs: "https://open-meteo.com/en/docs",
    github: "https://github.com/open-meteo/open-meteo",
    ejemplo: "https://api.open-meteo.com/v1/forecast?latitude=19.4326&longitude=-99.1332&current=temperature_2m",
    usos: [],
  },
  {
    id: "open-meteo-geo",
    nombre: "Open-Meteo Geocoding",
    categoria: "Geocodificación",
    descripcion: "Convierte el nombre de una ciudad en su forma canónica, país y coordenadas.",
    url: "https://geocoding-api.open-meteo.com",
    docs: "https://open-meteo.com/en/docs/geocoding-api",
    github: "https://github.com/open-meteo/open-meteo",
    ejemplo: "https://geocoding-api.open-meteo.com/v1/search?name=Ciudad%20de%20Mexico&count=1&language=es&format=json",
    usos: ["ciudad"],
  },
  {
    id: "rest-countries",
    nombre: "REST Countries",
    categoria: "Geografía",
    descripcion: "Países, códigos ISO, monedas, capitales y traducciones al español.",
    url: "https://restcountries.com",
    docs: "https://restcountries.com",
    github: "https://github.com/apilayer/restcountries",
    ejemplo: "https://restcountries.com/v3.1/name/mexico?fields=name,cca2,currencies",
    usos: ["pais"],
  },
  {
    id: "frankfurter",
    nombre: "Frankfurter",
    categoria: "Divisas",
    descripcion: "Tipos de cambio del Banco Central Europeo y catálogo de monedas ISO.",
    url: "https://api.frankfurter.app",
    docs: "https://www.frankfurter.app/docs/",
    github: "https://github.com/lineofflight/frankfurter",
    ejemplo: "https://api.frankfurter.app/currencies",
    usos: ["moneda"],
  },
  {
    id: "dummyjson",
    nombre: "DummyJSON",
    categoria: "Datos de prueba",
    descripcion: "Productos, usuarios y carritos de mentira para probar una API sin inventar datos.",
    url: "https://dummyjson.com",
    docs: "https://dummyjson.com/docs",
    github: "https://github.com/Ovi/DummyJSON",
    ejemplo: "https://dummyjson.com/products?limit=2",
    usos: [],
  },
  {
    id: "jsonplaceholder",
    nombre: "JSONPlaceholder",
    categoria: "Datos de prueba",
    descripcion: "El clásico de los datos de ejemplo: publicaciones, comentarios y usuarios.",
    url: "https://jsonplaceholder.typicode.com",
    docs: "https://jsonplaceholder.typicode.com",
    github: "https://github.com/typicode/json-server",
    ejemplo: "https://jsonplaceholder.typicode.com/posts?_limit=2",
    usos: [],
  },
  {
    id: "open-library",
    nombre: "Open Library",
    categoria: "Libros",
    descripcion: "Búsqueda de libros, autores e ISBN del Internet Archive.",
    url: "https://openlibrary.org",
    docs: "https://openlibrary.org/developers/api",
    github: "https://github.com/internetarchive/openlibrary",
    ejemplo: "https://openlibrary.org/search.json?q=quijote&limit=2",
    usos: [],
  },
  {
    id: "wikipedia",
    nombre: "Wikipedia (REST)",
    categoria: "Enciclopedia",
    descripcion: "Resumen de un artículo en español, en JSON y sin clave.",
    url: "https://es.wikipedia.org/api/rest_v1",
    docs: "https://es.wikipedia.org/api/rest_v1/",
    github: "https://github.com/wikimedia/restbase",
    ejemplo: "https://es.wikipedia.org/api/rest_v1/page/summary/API",
    usos: [],
  },
  {
    id: "hacker-news",
    nombre: "Hacker News",
    categoria: "Noticias",
    descripcion: "Noticias tecnológicas del API público de Firebase, sin clave.",
    url: "https://hacker-news.firebaseio.com/v0",
    docs: "https://github.com/HackerNews/API",
    github: "https://github.com/HackerNews/API",
    ejemplo: "https://hacker-news.firebaseio.com/v0/topstories.json",
    usos: [],
  },
  {
    id: "open-trivia",
    nombre: "Open Trivia DB",
    categoria: "Juegos",
    descripcion: "Preguntas de trivia en español para demos y pruebas.",
    url: "https://opentdb.com",
    docs: "https://opentdb.com/api_config.php",
    github: "https://github.com/amithbcseus/OpenTriviaDB",
    ejemplo: "https://opentdb.com/api.php?amount=2&type=multiple",
    usos: [],
  },
]);

/** Campos del plano que se pueden enriquecer y con qué fuente. */
const CAMPOS_MEJORABLES = Object.freeze({
  pais: "pais",
  country: "pais",
  "pais-de-origen": "pais",
  nacionalidad: "pais",
  moneda: "moneda",
  currency: "moneda",
  divisa: "moneda",
  ciudad: "ciudad",
  city: "ciudad",
  localidad: "ciudad",
});

/** Respaldo mínimo si REST Countries no responde (nombres en español + ISO). */
const PAISES_DE_RESPALDO = Object.freeze({
  mexico: { nombre: "México", iso2: "MX", iso3: "MEX" },
  espana: { nombre: "España", iso2: "ES", iso3: "ESP" },
  argentina: { nombre: "Argentina", iso2: "AR", iso3: "ARG" },
  colombia: { nombre: "Colombia", iso2: "CO", iso3: "COL" },
  chile: { nombre: "Chile", iso2: "CL", iso3: "CHL" },
  peru: { nombre: "Perú", iso2: "PE", iso3: "PER" },
  uruguay: { nombre: "Uruguay", iso2: "UY", iso3: "URY" },
  paraguay: { nombre: "Paraguay", iso2: "PY", iso3: "PRY" },
  bolivia: { nombre: "Bolivia", iso2: "BO", iso3: "BOL" },
  ecuador: { nombre: "Ecuador", iso2: "EC", iso3: "ECU" },
  venezuela: { nombre: "Venezuela", iso2: "VE", iso3: "VEN" },
  guatemala: { nombre: "Guatemala", iso2: "GT", iso3: "GTM" },
  honduras: { nombre: "Honduras", iso2: "HN", iso3: "HND" },
  "el-salvador": { nombre: "El Salvador", iso2: "SV", iso3: "SLV" },
  nicaragua: { nombre: "Nicaragua", iso2: "NI", iso3: "NIC" },
  "costa-rica": { nombre: "Costa Rica", iso2: "CR", iso3: "CRI" },
  panama: { nombre: "Panamá", iso2: "PA", iso3: "PAN" },
  cuba: { nombre: "Cuba", iso2: "CU", iso3: "CUB" },
  "republica-dominicana": { nombre: "República Dominicana", iso2: "DO", iso3: "DOM" },
  "estados-unidos": { nombre: "Estados Unidos", iso2: "US", iso3: "USA" },
  "united-states": { nombre: "Estados Unidos", iso2: "US", iso3: "USA" },
  canada: { nombre: "Canadá", iso2: "CA", iso3: "CAN" },
  brasil: { nombre: "Brasil", iso2: "BR", iso3: "BRA" },
  brazil: { nombre: "Brasil", iso2: "BR", iso3: "BRA" },
  francia: { nombre: "Francia", iso2: "FR", iso3: "FRA" },
  alemania: { nombre: "Alemania", iso2: "DE", iso3: "DEU" },
  italia: { nombre: "Italia", iso2: "IT", iso3: "ITA" },
  portugal: { nombre: "Portugal", iso2: "PT", iso3: "PRT" },
  "reino-unido": { nombre: "Reino Unido", iso2: "GB", iso3: "GBR" },
  japon: { nombre: "Japón", iso2: "JP", iso3: "JPN" },
  china: { nombre: "China", iso2: "CN", iso3: "CHN" },
  india: { nombre: "India", iso2: "IN", iso3: "IND" },
  australia: { nombre: "Australia", iso2: "AU", iso3: "AUS" },
  marruecos: { nombre: "Marruecos", iso2: "MA", iso3: "MAR" },
});

/** Monedas ISO 4217 más usadas, por si Frankfurter no responde. */
const MONEDAS_DE_RESPALDO = Object.freeze([
  "AED", "ARS", "AUD", "BRL", "CAD", "CHF", "CLP", "CNY", "COP", "CZK", "DKK", "EGP", "EUR",
  "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MAD", "MXN", "MYR", "NOK",
  "NZD", "PEN", "PHP", "PLN", "RON", "RUB", "SAR", "SEK", "SGD", "THB", "TRY", "TWD", "UAH",
  "USD", "UYU", "VND", "ZAR",
]);

let fetchActual = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

/** Solo para pruebas: permite sustituir la red por una función falsa. */
function fijarFetch(fn) {
  fetchActual = fn || null;
}

function reiniciar() {
  cache.borrarPrefijo("fuente:");
}

function sinAcentos(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function limpio(texto) {
  return String(texto == null ? "" : texto).replace(/\s+/g, " ").trim();
}

function recortar(texto, max) {
  const valor = String(texto == null ? "" : texto);
  return valor.length > max ? valor.slice(0, max) : valor;
}

/**
 * Petición JSON con reloj propio. Devuelve datos o `null`; nunca lanza.
 * El error se guarda en el log para diagnosticar sin romper la escritura.
 */
async function pedirJson(url, opciones) {
  if (!fetchActual) return null;
  const config = opciones || {};
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), config.timeoutMs || TIEMPO_MAXIMO);
  try {
    const respuesta = await fetchActual(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "generador-apis-gratuitas (+https://github.com/muecojulio/generador-apis-gratuitas)",
        ...(config.cabeceras || {}),
      },
      signal: control.signal,
      redirect: "follow",
    });
    if (!respuesta || !respuesta.ok) return null;
    const texto = await respuesta.text();
    if (!texto) return null;
    return JSON.parse(texto);
  } catch (error) {
    if (process.env.TALLER_FUENTES_DEBUG === "1") {
      console.warn("[taller] fuente " + url + ": " + ((error && error.message) || error));
    }
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/* Países ------------------------------------------------------------------ */

async function mapaDePaises() {
  const guardado = cache.obtener("fuente:paises");
  if (guardado) return guardado;
  try {
    const lista = await pedirJson(
      "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,currencies,capital,region,translations,altSpellings"
    );
    // Un fallo de red no se cachea 24 h: conviene reintentar en la próxima escritura.
    if (!Array.isArray(lista) || !lista.length) return {};
    const mapa = {};
    for (const pais of lista) {
      if (!pais || !pais.name) continue;
      const español = (pais.translations && (pais.translations.spa || pais.translations.es)) || {};
      const nombres = [
        pais.name.common,
        pais.name.official,
        español.common,
        español.official,
        ...(Array.isArray(pais.altSpellings) ? pais.altSpellings : []),
        pais.cca2,
        pais.cca3,
      ];
      const ficha = {
        nombre: limpio(español.common || pais.name.common),
        oficial: limpio(español.official || pais.name.official),
        iso2: pais.cca2 || "",
        iso3: pais.cca3 || "",
        moneda: pais.currencies ? Object.keys(pais.currencies)[0] || "" : "",
        capital: Array.isArray(pais.capital) ? pais.capital[0] || "" : "",
        region: pais.region || "",
      };
      for (const nombre of nombres) {
        const clave = sinAcentos(nombre);
        if (clave && !mapa[clave]) mapa[clave] = ficha;
      }
    }
    return cache.poner("fuente:paises", mapa, TTL_PAISES);
  } catch {
    return {};
  }
}

async function normalizarPais(valor) {
  const texto = limpio(valor);
  if (!texto) return null;
  const clave = sinAcentos(texto);
  const respaldo = PAISES_DE_RESPALDO[clave];
  const mapa = await mapaDePaises();
  const encontrado = mapa && mapa[clave];
  const ficha = encontrado || respaldo;
  if (!ficha) return null;
  return {
    valor: ficha.nombre,
    iso2: ficha.iso2 || "",
    iso3: ficha.iso3 || "",
    moneda: ficha.moneda || "",
    fuente: encontrado ? "rest-countries" : "respaldo",
  };
}

/* Monedas ---------------------------------------------------------------- */

async function mapaDeMonedas() {
  return cache.recordar("fuente:monedas", TTL_MONEDAS, async () => {
    const json = await pedirJson("https://api.frankfurter.app/currencies");
    const mapa = {};
    for (const codigo of MONEDAS_DE_RESPALDO) mapa[codigo] = codigo;
    if (json && typeof json === "object") {
      for (const [codigo, nombre] of Object.entries(json)) {
        if (/^[A-Z]{3}$/.test(codigo)) mapa[codigo] = limpio(nombre) || codigo;
      }
    }
    return mapa;
  });
}

async function normalizarMoneda(valor) {
  const texto = limpio(valor).toUpperCase();
  if (!texto) return null;
  const mapa = await mapaDeMonedas();
  if (mapa && mapa[texto]) {
    return { valor: texto, nombre: mapa[texto] === texto ? "" : mapa[texto], fuente: "frankfurter" };
  }
  // Símbolos frecuentes que la gente escribe en vez del código.
  const simbolos = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "MX$": "MXN" };
  if (simbolos[texto]) return { valor: simbolos[texto], nombre: "", fuente: "simbolo" };
  return null;
}

/* Ciudades --------------------------------------------------------------- */

async function normalizarCiudad(valor, pais) {
  const texto = limpio(valor);
  if (!texto) return null;
  const clave = "fuente:ciudad:" + sinAcentos(texto) + ":" + sinAcentos(pais || "");
  return cache.recordar(clave, TTL_CIUDAD, async () => {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?name=" +
      encodeURIComponent(texto.slice(0, 80)) +
      "&count=1&language=es&format=json";
    const json = await pedirJson(url);
    const primero = json && Array.isArray(json.results) ? json.results[0] : null;
    if (!primero || !primero.name) return null;
    return {
      valor: limpio(primero.name),
      pais: limpio(primero.country || ""),
      admin: limpio(primero.admin1 || ""),
      lat: primero.latitude,
      lon: primero.longitude,
      fuente: "open-meteo-geo",
    };
  });
}

/* Enriquecimiento --------------------------------------------------------- */

function fuentesActivas() {
  const bruto = String(process.env.TALLER_FUENTES || "").trim().toLowerCase();
  return !["0", "off", "no", "false", "apagado"].includes(bruto);
}

/**
 * Mejora los valores de un registro antes de guardarlo.
 *
 * @param {object} recurso recurso del plano (con `campos`)
 * @param {object} valores datos ya validados
 * @param {{activo?:boolean, timeoutMs?:number}} [opciones]
 * @returns {Promise<{valores:object, aplicados:string[]}>}
 */
async function enriquecer(recurso, valores, opciones) {
  const config = opciones || {};
  const activo = config.activo === undefined ? fuentesActivas() : Boolean(config.activo);
  const salida = { ...(valores || {}) };
  if (!activo || !recurso || !Array.isArray(recurso.campos)) return { valores: salida, aplicados: [] };
  if (!fetchActual) return { valores: salida, aplicados: [] };

  const tareas = [];
  const campos = new Map(recurso.campos.map((campo) => [campo.nombre, campo]));
  const paisCrudo = salida.pais !== undefined ? salida.pais : salida.country;
  for (const [nombre, valor] of Object.entries(salida)) {
    const tipo = CAMPOS_MEJORABLES[nombre];
    const campo = campos.get(nombre);
    if (!tipo || !campo || valor === null || valor === undefined || valor === "") continue;
    if (campo.tipo && !["texto", "email"].includes(campo.tipo)) continue;
    if (tipo === "pais") {
      tareas.push({ nombre, tipo, promesa: normalizarPais(valor) });
    } else if (tipo === "moneda") {
      tareas.push({ nombre, tipo, promesa: normalizarMoneda(valor) });
    } else if (tipo === "ciudad") {
      tareas.push({ nombre, tipo, promesa: normalizarCiudad(valor, paisCrudo) });
    }
  }
  if (!tareas.length) return { valores: salida, aplicados: [] };

  const aplicados = [];
  const limite = new Promise((resolver) => setTimeout(() => resolver(null), config.timeoutMs || TIEMPO_MAXIMO));
  await Promise.race([
    Promise.all(
      tareas.map(async (tarea) => {
        const resultado = await tarea.promesa;
        if (!resultado || !resultado.valor) return;
        const final = recortar(resultado.valor, 120);
        if (!final || final === salida[tarea.nombre]) return;
        salida[tarea.nombre] = final;
        aplicados.push(tarea.nombre + "=" + resultado.fuente);
      })
    ),
    limite,
  ]);
  return { valores: salida, aplicados };
}

/* Catálogo y diagnóstico ------------------------------------------------ */

function catalogo(opciones) {
  const config = opciones || {};
  const buscar = sinAcentos(config.buscar || "");
  const categoria = sinAcentos(config.categoria || "");
  const limite = Math.min(100, Math.max(1, Number(config.limite) || 50));
  const lista = FUENTES.filter((fuente) => {
    if (categoria && sinAcentos(fuente.categoria) !== categoria) return false;
    if (!buscar) return true;
    return sinAcentos([fuente.nombre, fuente.descripcion, fuente.categoria, fuente.id].join(" ")).includes(buscar);
  }).slice(0, limite);
  return lista.map((fuente) => ({ ...fuente, sinClave: true, https: true }));
}

/** Prueba real de una fuente (caché de 1 minuto para no abusar). */
async function probarFuente(id) {
  const fuente = FUENTES.find((item) => item.id === id);
  if (!fuente) return { id, ok: false, error: "fuente desconocida" };
  return cache.recordar("fuente:prueba:" + id, TTL_PRUEBA, async () => {
    if (!fetchActual) return { id, ok: false, estado: 0, ms: 0, error: "sin red" };
    const inicio = Date.now();
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), Math.min(TIEMPO_MAXIMO, 2500));
    try {
      const respuesta = await fetchActual(fuente.ejemplo, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "generador-apis-gratuitas" },
        signal: control.signal,
        redirect: "follow",
      });
      return {
        id,
        ok: Boolean(respuesta && respuesta.ok),
        estado: respuesta ? respuesta.status : 0,
        ms: Date.now() - inicio,
      };
    } catch (error) {
      return { id, ok: false, estado: 0, ms: Date.now() - inicio, error: recortar(error && error.message, 120) };
    } finally {
      clearTimeout(reloj);
    }
  });
}

async function probarFuentes(ids) {
  const cuales = Array.isArray(ids) && ids.length ? ids : FUENTES.map((fuente) => fuente.id);
  const resultados = await Promise.all(cuales.slice(0, 12).map((id) => probarFuente(id)));
  return resultados;
}

function estado() {
  return {
    activo: fuentesActivas(),
    variable: "TALLER_FUENTES",
    campos: [...new Set(Object.values(CAMPOS_MEJORABLES))],
    fuentes: FUENTES.length,
    tiempoMaximoMs: TIEMPO_MAXIMO,
  };
}

module.exports = {
  FUENTES,
  CAMPOS_MEJORABLES,
  PAISES_DE_RESPALDO,
  MONEDAS_DE_RESPALDO,
  catalogo,
  enriquecer,
  normalizarPais,
  normalizarMoneda,
  normalizarCiudad,
  probarFuente,
  probarFuentes,
  estado,
  fuentesActivas,
  sinAcentos,
  // Solo para pruebas:
  __pruebas: { fijarFetch, reiniciar },
};
