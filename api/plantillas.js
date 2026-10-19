"use strict";

/**
 * GET /api/plantillas
 * Plantillas comunes listas para clonar (notas, inventario, reservas).
 * Son datos: la página las muestra y el botón de clonar pide la creación.
 */

const plantillas = require("../lib/plantillas");

function enviar(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=300");
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
    const lista = plantillas.listar();
    enviar(res, 200, {
      total: lista.length,
      plantillas: lista,
      como: "Elige una, ponle nombre y pulsa Clonar. También puedes usar PLANTILLA=<clave> npm run disenar.",
      claves: plantillas.claves,
    });
  } catch (error) {
    enviar(res, 500, { error: error.message || "No pude leer las plantillas.", plantillas: [] });
  }
};
