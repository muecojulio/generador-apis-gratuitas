"use strict";

/**
 * GET /api/salud
 * Comprobación rápida: ¿está viva la página, hay clave guardada y cuántas APIs hay?
 * Nunca enseña el valor de ninguna clave, solo si existe.
 */

const catalogo = require("../lib/catalogo");

module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  const apis = catalogo.publicadas();
  res.end(
    JSON.stringify({
      ok: true,
      taller: "generador-apis-gratuitas",
      plan: "Vercel Hobby + GitHub Free (0 € para siempre)",
      funciones: 6,
      apis: apis.length,
      claves: {
        GITHUB_PAT: Boolean(process.env.GITHUB_PAT),
        GENERADOR_SECRETO: Boolean(process.env.GENERADOR_SECRETO),
      },
      hora: new Date().toISOString(),
    })
  );
};
