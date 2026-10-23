"use strict";

/**
 * La puerta de entrada de TODAS las APIs del taller.
 *
 * Existe un solo par de archivos dinámicos (api/[nombre]/index.js y
 * api/[nombre]/[...ruta].js) que reparten el trabajo entre las APIs guardadas
 * en api/<nombre>/spec.json. Así el proyecto usa pocas funciones de Vercel y
 * nunca choca con el límite de 12 del plan Hobby.
 *
 * Aquí solo se resuelve el nombre y se reutiliza el manejador ya construido;
 * el resto (validación, índices, caché, seguridad) vive en lib/runtime.js.
 */

const http = require("./http");
const { crear } = require("./runtime");
const { buscar, valido } = require("./catalogo");

const manejadores = new Map();

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
  if (String(req.method || "GET").toUpperCase() === "OPTIONS") {
    http.enviarJson(req, res, 204, {}, { publico: true });
    return;
  }

  const deConsulta = String((req.query && req.query.nombre) || "")
    .trim()
    .toLowerCase();
  const nombre = valido(deConsulta) ? deConsulta : nombreDeRuta(req);
  const spec = buscar(nombre);
  if (!spec) {
    http.enviarJson(
      req,
      res,
      404,
      {
        error: "Todavía no existe /api/" + (nombre || "…") + " en este taller.",
        como: "Describe tu API en la página principal y en un minuto quedará viva aquí.",
        publicadas: "/api/listar",
        fuentes: "/api/fuentes",
      },
      { publico: true, cache: 30 }
    );
    return;
  }

  let manejador = manejadores.get(nombre);
  if (!manejador) {
    manejador = crear(spec);
    manejadores.set(nombre, manejador);
  }
  await manejador(req, res);
};
