"use strict";

/**
 * GET /api/listar
 * Devuelve las APIs publicadas en este taller. Lee el registro que va
 * empaquetado con la función, así que responde al instante y funciona
 * incluso sin ninguna variable de entorno configurada.
 */

const catalogo = require("../lib/catalogo");
const detalle = require("../catalogo.json");

function enviar(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

module.exports = function handler(req, res) {
  if (req.method === "OPTIONS") {
    enviar(res, 204, {});
    return;
  }
  if (req.method !== "GET") {
    enviar(res, 405, { error: "Usa GET." });
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
    enviar(res, 200, { total: apis.length, apis, taller: "/api/salud" });
  } catch (error) {
    enviar(res, 500, { error: error.message || "No pude leer el catálogo.", apis: [] });
  }
};
