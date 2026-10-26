"use strict";

/**
 * Catálogo de APIs públicas que se descubre en un repositorio público de
 * GitHub: `public-apis/public-apis` (licencia MIT).
 *
 * Ese repositorio mantiene una tabla por categoría con el nombre, la
 * descripción y si la API pide clave (`Auth`) o no. Aquí se lee su README,
 * se queda solo con las filas **sin clave, con HTTPS**, y se guardan en una
 * caché de 24 horas.
 *
 * Si GitHub no responde (sin red, límite de peticiones, cambio de formato),
 * se usa `catalogos/fuentes-publicas.json`: una copia congelada y revisada que viaja
 * dentro de la función. El taller nunca se queda sin catálogo.
 *
 * La copia se regenera con:  npm run fuentes
 */

const cache = require("./cache");

// Ruta literal a propósito: así Vercel empaqueta la copia dentro de la función.
// Si todavía no existe (primer arranque del taller), se sigue con la lista vacía.
let snapshot = { fuentes: [] };
try {
  snapshot = require("../catalogos/fuentes-publicas.json");
} catch {
  snapshot = { fuentes: [] };
}

const REPOSITORIO = "public-apis/public-apis";
const ORIGEN = "https://github.com/" + REPOSITORIO;
const LICENCIA = "MIT";
const RUTA_API = "https://api.github.com/repos/" + REPOSITORIO + "/contents/README.md";
const TTL = 24 * 60 * 60 * 1000;
const TIMEOUT = Math.max(1500, Number(process.env.TALLER_GITHUB_MS) || 6000);

/** Categorías del README, en español, para mostrarlas en la página. */
const CATEGORIAS_ES = Object.freeze({
  Animals: "Animales",
  Anime: "Anime",
  "Anti-Malware": "Antimalware",
  "Art & Design": "Arte y diseño",
  Blockchain: "Blockchain",
  Books: "Libros",
  Business: "Negocios",
  Calendar: "Calendario",
  "Cloud Storage & File Sharing": "Nube y archivos",
  Cryptocurrency: "Criptomonedas",
  "Currency Exchange": "Divisas",
  "Data Validation": "Validación de datos",
  Development: "Desarrollo",
  Dictionaries: "Diccionarios",
  "Documents & Productivity": "Documentos",
  Email: "Correo",
  Entertainment: "Entretenimiento",
  Environment: "Medio ambiente",
  Finance: "Finanzas",
  "Food & Drink": "Comida y bebida",
  "Games & Comics": "Juegos y cómics",
  Geocoding: "Geocodificación",
  Government: "Gobierno",
  Health: "Salud",
  Jobs: "Empleo",
  "Machine Learning": "Aprendizaje automático",
  Music: "Música",
  News: "Noticias",
  "Open Data": "Datos abiertos",
  "Open Source Projects": "Proyectos abiertos",
  Patent: "Patentes",
  Personality: "Personalidad",
  Phone: "Teléfono",
  Photography: "Fotografía",
  Programming: "Programación",
  "Science & Math": "Ciencia y matemáticas",
  Security: "Seguridad",
  Shopping: "Compras",
  Social: "Social",
  "Sports & Fitness": "Deporte",
  "Test Data": "Datos de prueba",
  "Text Analysis": "Análisis de texto",
  Tracking: "Rastreo",
  Transportation: "Transporte",
  "URL Shorteners": "Acortadores",
  Vehicle: "Vehículos",
  Video: "Vídeo",
  Weather: "Clima",
});

function categoriaEs(nombre) {
  return CATEGORIAS_ES[nombre] || nombre;
}

let fetchActual = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

/** Solo para pruebas: sustituye la red por una función falsa. */
function fijarFetch(fn) {
  fetchActual = fn || null;
}

function limpiarCelda(texto) {
  return String(texto == null ? "" : texto)
    .replace(/`/g, "")
    .replace(/\\\|/g, "|")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lee el markdown del repositorio y devuelve solo las APIs sin clave.
 * @param {string} markdown
 * @returns {{fuentes: Array<object>, total: number, categorias: string[]}}
 */
function parsear(markdown) {
  const lineas = String(markdown || "").split(/\r?\n/);
  const fuentes = [];
  const vistos = new Set();
  const categorias = new Set();
  let categoria = "";

  for (const linea of lineas) {
    const titulo = linea.match(/^###\s+(.+?)\s*$/);
    if (titulo) {
      categoria = limpiarCelda(titulo[1]);
      continue;
    }
    if (!linea.startsWith("| [") && !linea.startsWith("|  [")) continue;
    const celdas = linea.split("|").slice(1, -1);
    if (celdas.length < 5) continue;
    const enlace = celdas[0].match(/\[([^\]]+)\]\(([^)\s]+)\)/);
    if (!enlace) continue;
    const nombre = limpiarCelda(enlace[1]);
    const url = enlace[2].trim();
    const descripcion = limpiarCelda(celdas[1]);
    const auth = limpiarCelda(celdas[2]).toLowerCase();
    const https = limpiarCelda(celdas[3]).toLowerCase();
    const cors = limpiarCelda(celdas[4]).toLowerCase();
    if (auth !== "no" || https !== "yes") continue;
    if (!/^https:\/\//i.test(url)) continue;
    const clave = url.replace(/\/+$/, "").toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    if (categoria) categorias.add(categoria);
    fuentes.push({
      nombre,
      descripcion,
      categoria: categoria || "Varias",
      url,
      cors: cors === "yes",
    });
  }

  return { fuentes, total: fuentes.length, categorias: [...categorias].sort() };
}

function instantanea() {
  const datos = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    origen: datos.origen || ORIGEN,
    licencia: datos.licencia || LICENCIA,
    actualizado: datos.actualizado || "",
    enVivo: false,
    total: Number(datos.total) || (Array.isArray(datos.fuentes) ? datos.fuentes.length : 0),
    categorias: Array.isArray(datos.categorias) ? datos.categorias : [],
    fuentes: Array.isArray(datos.fuentes) ? datos.fuentes : [],
  };
}

async function desdeGitHub() {
  if (!fetchActual) throw new Error("sin red");
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT);
  try {
    const cabeceras = {
      Accept: "application/vnd.github+json",
      "User-Agent": "generador-apis-gratuitas",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (process.env.GITHUB_PAT) cabeceras.Authorization = "Bearer " + process.env.GITHUB_PAT;
    const respuesta = await fetchActual(RUTA_API, { headers: cabeceras, signal: control.signal });
    if (!respuesta.ok) throw new Error("GitHub respondió " + respuesta.status);
    const json = await respuesta.json();
    if (!json || !json.content) throw new Error("GitHub no devolvió el README");
    const texto = Buffer.from(json.content, json.encoding === "base64" ? "base64" : "utf8").toString("utf8");
    const leido = parsear(texto);
    if (!leido.total) throw new Error("el README no trajo APIs sin clave");
    return {
      origen: ORIGEN,
      licencia: LICENCIA,
      actualizado: new Date().toISOString(),
      enVivo: true,
      total: leido.total,
      categorias: leido.categorias,
      fuentes: leido.fuentes,
    };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Catálogo descubierto. Nunca lanza: si falla GitHub, devuelve la copia local.
 * @param {{forzar?: boolean}} [opciones]
 */
async function descubrir(opciones) {
  const config = opciones || {};
  if (config.forzar) cache.borrar("github:public-apis");
  try {
    return await cache.recordar("github:public-apis", TTL, async () => {
      try {
        return await desdeGitHub();
      } catch (error) {
        const copia = instantanea();
        copia.aviso = "No pude leer GitHub (" + ((error && error.message) || error) + "). Uso la copia local.";
        return copia;
      }
    });
  } catch {
    return instantanea();
  }
}

const indicesCatalogo = new WeakMap();

function sinAcentosSimple(texto) {
  return String(texto == null ? "" : texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function indiceDeCatalogo(catalogo) {
  if (!catalogo || typeof catalogo !== "object") return null;
  let guardado = indicesCatalogo.get(catalogo);
  if (guardado) return guardado;
  const lista = Array.isArray(catalogo.fuentes) ? catalogo.fuentes : [];
  const porCategoria = new Map();
  const textos = new Map();

  for (const fuente of lista) {
    if (!fuente || typeof fuente !== "object") continue;
    const catIngles = sinAcentosSimple(fuente.categoria || "");
    const catEsp = sinAcentosSimple(categoriaEs(fuente.categoria || ""));
    for (const claveCat of new Set([catIngles, catEsp])) {
      if (!claveCat) continue;
      let cubeta = porCategoria.get(claveCat);
      if (!cubeta) {
        cubeta = [];
        porCategoria.set(claveCat, cubeta);
      }
      cubeta.push(fuente);
    }
    textos.set(
      fuente,
      sinAcentosSimple(
        (fuente.nombre || "") +
          " " +
          (fuente.descripcion || "") +
          " " +
          (fuente.categoria || "") +
          " " +
          categoriaEs(fuente.categoria || "")
      )
    );
  }
  guardado = { porCategoria, textos };
  indicesCatalogo.set(catalogo, guardado);
  return guardado;
}

/** Filtra y recorta el catálogo descubierto para una respuesta HTTP usando su índice en memoria. */
function muestra(catalogo, opciones) {
  const config = opciones || {};
  const limite = Math.min(200, Math.max(0, Number(config.limite === undefined ? 60 : config.limite) || 0));
  const categoria = sinAcentosSimple(String(config.categoria || "").trim());
  const buscar = sinAcentosSimple(String(config.buscar || "").trim());
  const indice = indiceDeCatalogo(catalogo);
  let lista = Array.isArray(catalogo && catalogo.fuentes) ? catalogo.fuentes : [];

  if (categoria) {
    lista = (indice && indice.porCategoria.get(categoria)) || [];
  }
  if (buscar) {
    lista = lista.filter((fuente) => {
      const precalculado = indice && indice.textos.get(fuente);
      return precalculado !== undefined
        ? precalculado.includes(buscar)
        : sinAcentosSimple(fuente.nombre + " " + fuente.descripcion + " " + fuente.categoria).includes(buscar);
    });
  }
  return {
    total: lista.length,
    limite,
    categorias: [...new Set(lista.map((fuente) => fuente.categoria))].sort().map((nombre) => ({
      nombre,
      etiqueta: categoriaEs(nombre),
    })),
    fuentes: limite
      ? lista.slice(0, limite).map((fuente) => ({ ...fuente, categoriaEs: categoriaEs(fuente.categoria) }))
      : [],
  };
}

module.exports = {
  categoriaEs,
  parsear,
  descubrir,
  instantanea,
  muestra,
  __pruebas: { fijarFetch },
};
