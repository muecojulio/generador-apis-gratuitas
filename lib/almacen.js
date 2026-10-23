"use strict";

/**
 * Guarda y lee los datos de cada API en `data/<api>.json` dentro del
 * repositorio (a través de la API de GitHub).
 *
 * Dos mejoras sobre la versión anterior:
 *
 *  1. **Caché de lectura** (8 s por defecto). Un `GET` repetido ya no gasta una
 *     llamada a GitHub; el cupo anónimo son 60 peticiones por hora y con la
 *     caché cunde mucho más. Se invalida en cuanto se escribe.
 *  2. **Nunca se sobrescribe a ciegas.** Si el archivo no se pudo leer (403,
 *     429, red caída, JSON roto), la escritura responde 503 en vez de mandar un
 *     `PUT` sin sha y dejar que GitHub rechace con un 409 engañoso. Así no se
 *     pierde lo que ya estaba guardado.
 */

const cache = require("./cache");
const gh = require("./github");

const TTL = Math.max(0, Number(process.env.TALLER_CACHE_DATOS_MS) || 8000);

function ruta(nombre) {
  return (
    "/repos/" + gh.OWNER + "/" + gh.REPO + "/contents/data/" + encodeURIComponent(nombre) + ".json"
  );
}

function clave(nombre) {
  return "datos:" + nombre;
}

async function leerDeGitHub(nombre) {
  const res = await gh.pedir("GET", ruta(nombre) + "?ref=" + encodeURIComponent(gh.BRANCH));
  if (res.status === 404) return { datos: null, sha: null, creado: false };
  if (res.status === 403 || res.status === 429) {
    const error = new Error("GitHub limitó las lecturas por un momento.");
    error.status = res.status;
    error.reintentar = true;
    throw error;
  }
  if (res.status !== 200 || !res.json || !res.json.content) {
    const error = new Error("No pude leer los datos guardados.");
    error.status = 502;
    throw error;
  }
  const contenido = Buffer.from(res.json.content || "", "base64").toString("utf8");
  let datos;
  try {
    datos = JSON.parse(contenido);
  } catch {
    const error = new Error(
      "El archivo data/" + nombre + ".json no es JSON válido. No voy a sobrescribirlo: revísalo en el repositorio."
    );
    error.status = 500;
    error.corrupto = true;
    throw error;
  }
  return { datos, sha: res.json.sha, creado: true };
}

/**
 * Lee los datos de una API. Usa la caché salvo que se pida `fresco: true`.
 * Devuelve { datos, sha } y lanza si GitHub no responde.
 */
function leer(nombre, opciones) {
  if (opciones && opciones.fresco) return leerDeGitHub(nombre);
  const guardado = cache.obtener(clave(nombre));
  if (guardado) return Promise.resolve(guardado);
  // Un fallo NO se guarda en caché: si GitHub se recupera en el acto, la
  // siguiente petición lo intenta otra vez en lugar de servir el error.
  return cache.recordar(clave(nombre), TTL, () => leerDeGitHub(nombre));
}

async function guardar(nombre, datos, sha) {
  if (!gh.token()) {
    const error = new Error(
      "Falta la clave GITHUB_PAT en Vercel. Puedes consultar, pero todavía no se pueden guardar cambios."
    );
    error.status = 503;
    throw error;
  }
  const res = await gh.pedir("PUT", ruta(nombre), {
    message: "datos: " + nombre,
    content: Buffer.from(JSON.stringify(datos, null, 2) + "\n", "utf8").toString("base64"),
    branch: gh.BRANCH,
    ...(sha ? { sha } : {}),
  });
  if (res.status === 409 || res.status === 422) {
    const error = new Error("Alguien guardó al mismo tiempo. Inténtalo otra vez.");
    error.status = 409;
    throw error;
  }
  if (res.status !== 200 && res.status !== 201) {
    const error = new Error((res.json && res.json.message) || "No pude guardar los datos.");
    error.status = 502;
    throw error;
  }
  // Lo que acabamos de escribir es la verdad: refresca la caché en el acto.
  cache.borrar(clave(nombre));
  cache.borrarPrefijo("indice:" + nombre + ":");
  return res.json;
}

module.exports = { leer, guardar, token: gh.token, TTL };
