"use strict";

/**
 * GET /api/listar
 * Devuelve las APIs publicadas en este taller. Lee el registro que va
 * empaquetado con la función, así que responde al instante y funciona
 * incluso sin ninguna variable de entorno configurada.
 *
 * La lista se cachea una hora en la instancia y un minuto en el navegador/CDN,
 * con ETag para que un `If-None-Match` se lleve un 304 sin cuerpo.
 */

const http = require("../lib/http");
const catalogo = require("../lib/catalogo");
const detalle = require("../catalogo.json");

module.exports = function handler(req, res) {
  const metodo = String((req && req.method) || "GET").toUpperCase();
  if (metodo === "OPTIONS") {
    http.enviarJson(req, res, 204, {}, { publico: true });
    return;
  }
  if (metodo !== "GET" && metodo !== "HEAD") {
    http.enviarJson(req, res, 405, { error: "Usa GET." }, { publico: true, cabeceras: { Allow: "GET, HEAD, OPTIONS" } });
    return;
  }
  try {
    const fichas = new Map((detalle.apis || []).map((api) => [api.nombre, api]));
    const apis = catalogo.publicadas().map((api) => ({
      ...api,
      ruta: "/api/" + api.nombre,
      publicado: (fichas.get(api.nombre) || {}).publicado || null,
      actualizado: (fichas.get(api.nombre) || {}).actualizado || null,
    }));
    http.enviarJson(
      req,
      res,
      200,
      {
        total: apis.length,
        apis,
        documentacion: "/docs",
        taller: "/api/salud",
        fuentes: "/api/fuentes",
        proveedores: "/api/proveedores",
        privacidad: "/privacidad",
      },
      { publico: true, cache: 60, etag: true }
    );
  } catch {
    http.enviarJson(
      req,
      res,
      500,
      { error: "No pude leer el catálogo.", apis: [] },
      { publico: true }
    );
  }
};
