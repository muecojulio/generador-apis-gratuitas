"use strict";

/**
 * Guarda y lee los datos de cada API en `data/<api>.json` dentro del
 * repositorio (a través de la API de GitHub).
 *
 * Mejoras de caché y resiliencia:
 *
 *  1. **Caché de lectura** (8 s por defecto) con *single flight*: un `GET`
 *     repetido o simultáneo no gasta llamadas adicionales a GitHub.
 *  2. **Write-through al guardar** + copia de respaldo en memoria (`respaldo`,
 *     1 h): al guardar un cambio se actualiza la caché con el nuevo `sha` y,
 *     si GitHub sufre un corte temporal después de expirar el TTL corto, las
 *     lecturas pueden servir la última versión buena conocida.
 *  3. **Nunca se sobrescribe a ciegas.** Si el archivo no se pudo leer (403,
 *     429, red caída, JSON roto), la escritura responde 503/500 en vez de
 *     pisar lo que ya estaba guardado.
 */

const cache = require("./cache");
const gh = require("./github");

const TTL = Math.max(0, Number(process.env.TALLER_CACHE_DATOS_MS) || 8000);
const TTL_RESPALDO = 60 * 60 * 1000;

function ruta(nombre) {
  return (
    "/repos/" + gh.OWNER + "/" + gh.REPO + "/contents/data/" + encodeURIComponent(nombre) + ".json"
  );
}

function clave(nombre) {
  return "datos:" + nombre;
}

function claveRespaldo(nombre) {
  return "datos:respaldo:" + nombre;
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
  const resultado = { datos, sha: res.json.sha, creado: true };
  cache.poner(claveRespaldo(nombre), resultado, TTL_RESPALDO);
  return resultado;
}

/**
 * Lee los datos de una API. Usa la caché salvo que se pida `fresco: true`.
 * Devuelve { datos, sha } y lanza si GitHub no responde.
 */
function leer(nombre, opciones) {
  if (opciones && opciones.fresco) return leerDeGitHub(nombre);
  const guardado = cache.obtener(clave(nombre));
  if (guardado) return Promise.resolve({ ...guardado, desdeCache: true });
  // Un fallo NO se guarda en la caché principal: si GitHub se recupera en el
  // acto, la siguiente petición lo intenta otra vez.
  return cache.recordar(clave(nombre), TTL, () => leerDeGitHub(nombre));
}

/** Última versión buena leída o escrita en esta instancia (para Stale-If-Error). */
function respaldo(nombre) {
  return cache.obtener(claveRespaldo(nombre)) || null;
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
  const nuevoSha = res.json && res.json.content && res.json.content.sha ? res.json.content.sha : null;
  cache.borrarPrefijo("indice:" + nombre + ":");
  if (nuevoSha) {
    const actualizado = { datos, sha: nuevoSha, creado: true };
    cache.poner(clave(nombre), actualizado, TTL);
    cache.poner(claveRespaldo(nombre), actualizado, TTL_RESPALDO);
  } else {
    cache.borrar(clave(nombre));
  }
  return res.json;
}

module.exports = { leer, guardar, respaldo, token: gh.token, TTL };
