"use strict";

/**
 * La puerta de entrada de TODAS las APIs del taller.
 *
 * Existe un solo par de archivos dinámicos (api/[nombre]/index.js y
 * api/[nombre]/[...ruta].js) que reparten el trabajo entre las APIs guardadas
 * en api/<nombre>/spec.json. Así el proyecto usa 6 funciones de Vercel en total
 * y nunca choca con el límite de 12 funciones del plan Hobby.
 */

const { crear } = require("./runtime");
const { buscar } = require("./catalogo");

const manejadores = new Map();

function responder(res, status, datos) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(datos));
}

/** El nombre sale de la ruta (/api/<nombre>/...), nunca de los parámetros de consulta. */
function nombreDeRuta(req) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const partes = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    return partes[0] === "api" && partes[1] ? String(partes[1]).trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

module.exports = async function entrada(req, res) {
  if (req.method === "OPTIONS") {
    responder(res, 204, {});
    return;
  }
  const nombre = String((req.query && req.query.nombre) || "").trim().toLowerCase() || nombreDeRuta(req);
  const spec = buscar(nombre);
  if (!spec) {
    responder(res, 404, {
      error: "Todavía no existe /api/" + (nombre || "…") + " en este taller.",
      como: "Describe tu API en la página principal y en un minuto quedará viva aquí.",
      publicadas: "/api/listar",
    });
    return;
  }
  let manejador = manejadores.get(nombre);
  if (!manejador) {
    manejador = crear(spec);
    manejadores.set(nombre, manejador);
  }
  await manejador(req, res);
};
